using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class Phase4MarketplaceTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Approval_scope_and_profile_publication_are_enforced()
    {
        var approved = await SeedTeacherAsync(approved: true);
        var unapproved = await SeedTeacherAsync(approved: false);
        var client = await ClientForAsync(approved.Email);

        var wrongSubject = await client.PostAsJsonAsync("/api/v1/teachers/me/services", Service(approved, approved.OtherSubjectId));
        Assert.Equal(HttpStatusCode.BadRequest, wrongSubject.StatusCode);
        Assert.Equal("teacher_not_approved", await CodeAsync(wrongSubject));

        client = await ClientForAsync(unapproved.Email);
        var publish = await client.PutAsJsonAsync("/api/v1/teachers/me/publication", new { published = true });
        Assert.Equal(HttpStatusCode.BadRequest, publish.StatusCode);
        Assert.Equal("teacher_not_approved", await CodeAsync(publish));
    }

    [Fact]
    public async Task Cross_teacher_updates_are_hidden_and_stale_updates_conflict()
    {
        var owner = await SeedTeacherAsync(approved: true, withService: true);
        var other = await SeedTeacherAsync(approved: true);
        var client = await ClientForAsync(other.Email);
        var cross = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/teachers/me/services/{owner.ServiceId}")
        {
            Content = JsonContent.Create(Service(owner, owner.SubjectId))
        };
        cross.Headers.TryAddWithoutValidation("If-Match", owner.ServiceVersion);
        Assert.Equal(HttpStatusCode.NotFound, (await client.SendAsync(cross)).StatusCode);

        client = await ClientForAsync(owner.Email);
        var first = Update(owner, client);
        var second = Update(owner, client);
        var results = await Task.WhenAll(first, second);
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.NoContent);
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.Conflict);

        var creations = await Task.WhenAll(
            client.PostAsJsonAsync("/api/v1/teachers/me/services", Service(owner, owner.SubjectId)),
            client.PostAsJsonAsync("/api/v1/teachers/me/services", Service(owner, owner.SubjectId)));
        Assert.All(creations, x => Assert.Equal(HttpStatusCode.Created, x.StatusCode));
    }

    [Fact]
    public async Task Private_samples_and_internal_fields_never_leak_publicly()
    {
        var teacher = await SeedTeacherAsync(approved: true, withService: true, withPrivateSample: true);
        var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound,
            (await anonymous.GetAsync($"/api/v1/teachers/samples/{teacher.SampleId}/content")).StatusCode);

        var publicJson = await anonymous.GetStringAsync($"/api/v1/teachers/{teacher.Id}");
        Assert.DoesNotContain("storageKey", publicJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Internal only", publicJson, StringComparison.OrdinalIgnoreCase);
        Assert.Empty(JsonDocument.Parse(publicJson).RootElement.GetProperty("samples").EnumerateArray());

        var owner = await ClientForAsync(teacher.Email);
        var ownJson = await owner.GetStringAsync("/api/v1/teachers/me");
        Assert.Single(JsonDocument.Parse(ownJson).RootElement.GetProperty("samples").EnumerateArray());
        Assert.DoesNotContain("storageKey", ownJson, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Favorites_are_unique_and_idempotent()
    {
        var teacher = await SeedTeacherAsync(approved: true, withService: true);
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var client = await ClientForAsync(student.Email);
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PutAsync($"/api/v1/favorite-teachers/{teacher.Id}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PutAsync($"/api/v1/favorite-teachers/{teacher.Id}", null)).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
            Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<TafseelDbContext>()
                .FavoriteTeachers.CountAsync(x => x.StudentId == student.Id && x.TeacherId == teacher.Id));
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/v1/favorite-teachers/{teacher.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/v1/favorite-teachers/{teacher.Id}")).StatusCode);
    }

    [Fact]
    public async Task Public_search_has_fixed_sort_pagination_filters_and_two_queries()
    {
        var teacher = await SeedTeacherAsync(approved: true, withService: true);
        var client = factory.CreateClient();
        factory.Commands.Reset();
        var response = await client.GetAsync(
            $"/api/v1/teachers?subjectId={teacher.SubjectId}&topicId={teacher.TopicId}" +
            $"&educationLevelId={teacher.EducationLevelId}&serviceTypeId={teacher.ServiceTypeId}" +
            $"&languageIds={teacher.LanguageId}&minimumRating=0&maximumPrice=100&verifiedOnly=true" +
            "&availableThisWeek=false&sort=lowest-price&page=1&pageSize=500");
        response.EnsureSuccessStatusCode();
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(50, json.GetProperty("pageSize").GetInt32());
        var item = Assert.Single(json.GetProperty("items").EnumerateArray(), x =>
            x.GetProperty("teacherId").GetString() == teacher.Id);
        Assert.Single(item.GetProperty("languages").EnumerateArray());
        Assert.InRange(factory.Commands.ReadCount, 1, 2);

        var invalid = await client.GetAsync("/api/v1/teachers?sort=raw-sql");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        Assert.Equal("invalid_sort", await CodeAsync(invalid));
        foreach (var sort in new[] { "recommended", "highest-rated", "lowest-price", "highest-price", "fastest-response", "most-experienced" })
            (await client.GetAsync($"/api/v1/teachers?sort={sort}")).EnsureSuccessStatusCode();
        var online = await client.GetAsync("/api/v1/teachers?onlineOnly=true");
        Assert.Equal(HttpStatusCode.BadRequest, online.StatusCode);
        Assert.Equal("online_status_unavailable", await CodeAsync(online));
    }

    [Fact]
    public async Task Availability_validates_timezone_and_rejects_overlap()
    {
        var teacher = await SeedTeacherAsync(approved: true, withService: true);
        var client = await ClientForAsync(teacher.Email);
        var valid = new
        {
            dayOfWeek = DayOfWeek.Monday,
            start = "09:00:00",
            end = "12:00:00",
            timeZoneId = "Egypt Standard Time",
            slotMinutes = 30
        };
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/teachers/me/availability/rules", valid)).StatusCode);
        var available = JsonDocument.Parse(await factory.CreateClient()
            .GetStringAsync("/api/v1/teachers?availableThisWeek=true")).RootElement;
        Assert.Contains(available.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("teacherId").GetString() == teacher.Id);
        var overlap = await client.PostAsJsonAsync("/api/v1/teachers/me/availability/rules", new
        {
            dayOfWeek = DayOfWeek.Monday,
            start = "11:00:00",
            end = "13:00:00",
            timeZoneId = "Egypt Standard Time",
            slotMinutes = 30
        });
        Assert.Equal(HttpStatusCode.Conflict, overlap.StatusCode);
        var invalid = await client.PostAsJsonAsync("/api/v1/teachers/me/availability/rules", new
        {
            dayOfWeek = DayOfWeek.Tuesday,
            start = "09:00:00",
            end = "10:00:00",
            timeZoneId = "Not/A-Time-Zone",
            slotMinutes = 30
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var now = DateTimeOffset.UtcNow;
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/teachers/me/availability/exceptions", new
            {
                startsAt = now.AddDays(-1),
                endsAt = now.AddDays(8),
                reason = "Vacation"
            })).StatusCode);
        var unavailable = JsonDocument.Parse(await factory.CreateClient()
            .GetStringAsync("/api/v1/teachers?availableThisWeek=true")).RootElement;
        Assert.DoesNotContain(unavailable.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("teacherId").GetString() == teacher.Id);

        var concurrent = await Task.WhenAll(
            client.PostAsJsonAsync("/api/v1/teachers/me/availability/rules", new
            {
                dayOfWeek = DayOfWeek.Wednesday,
                start = "09:00:00",
                end = "11:00:00",
                timeZoneId = "Egypt Standard Time",
                slotMinutes = 30
            }),
            client.PostAsJsonAsync("/api/v1/teachers/me/availability/rules", new
            {
                dayOfWeek = DayOfWeek.Wednesday,
                start = "10:00:00",
                end = "12:00:00",
                timeZoneId = "Egypt Standard Time",
                slotMinutes = 30
            }));
        Assert.Single(concurrent, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Single(concurrent, x => x.StatusCode == HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Sql_server_marketplace_indexes_and_constraints_are_present()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var indexes = await db.Database.SqlQueryRaw<string>(
            "SELECT name AS [Value] FROM sys.indexes WHERE object_id IN (OBJECT_ID('TeacherServices'), OBJECT_ID('TeacherProfiles'), OBJECT_ID('FavoriteTeachers')) AND name IS NOT NULL")
            .ToArrayAsync();
        Assert.Contains("IX_TeacherServices_SubjectId_ServiceCatalogItemId_IsActive_Price", indexes);
        Assert.Contains("IX_TeacherProfiles_IsPublished_AverageRating", indexes);
        Assert.Contains("PK_FavoriteTeachers", indexes);

        var constraints = await db.Database.SqlQueryRaw<string>(
            "SELECT name AS [Value] FROM sys.check_constraints WHERE parent_object_id IN (OBJECT_ID('TeacherServices'), OBJECT_ID('TeacherAvailabilityRules'))")
            .ToArrayAsync();
        Assert.Contains("CK_TeacherServices_Price", constraints);
        Assert.Contains("CK_TeacherAvailabilityRules_Time", constraints);
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private async Task<SeededTeacher> SeedTeacherAsync(
        bool approved, bool withService = false, bool withPrivateSample = false)
    {
        var user = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Subject " + suffix, "code");
        var otherSubject = new Subject("Other " + suffix, "code");
        var serviceType = new ServiceCatalogItem("Explanation " + suffix, "Custom explanation", "svc_" + suffix);
        var topic = new Topic(subject.Id, "Topic " + suffix, "Intermediate");
        var language = new TeachingLanguage("Language " + suffix, suffix[..8]);
        var educationLevel = new EducationLevel("Level " + suffix);
        db.AddRange(subject, otherSubject, serviceType, topic, language, educationLevel);
        if (approved)
        {
            db.Add(new TeacherSubjectQualification(user.Id, subject.Id, DateTimeOffset.UtcNow));
            db.AddRange(
                new TeacherTopic(user.Id, topic.Id),
                new TeacherLanguage(user.Id, language.Id),
                new TeacherEducationLevel(user.Id, educationLevel.Id));
        }
        var profile = new TeacherProfile(user.Id, DateTimeOffset.UtcNow);
        profile.Update("Clear explanations", "Detailed professional teacher biography.", "Egypt", "Cairo",
            "Egypt Standard Time", 30, DateTimeOffset.UtcNow);
        if (approved) profile.Publish(DateTimeOffset.UtcNow);
        db.Add(profile);
        TeacherService? service = null;
        if (withService)
        {
            service = new TeacherService(user.Id, subject.Id, serviceType.Id, "Recorded explanation",
                "A focused explanation for your exact topic.", 100, "SAR", 24, 1, DateTimeOffset.UtcNow);
            db.Add(service);
        }
        TeacherTeachingSample? sample = null;
        if (withPrivateSample)
        {
            sample = new TeacherTeachingSample(user.Id, subject.Id, null, "Private draft",
                $"teacher-demos/{Guid.NewGuid():N}.mp4", 120, DateTimeOffset.UtcNow);
            db.Add(sample);
        }
        await db.SaveChangesAsync();
        return new(user.Id, user.Email, subject.Id, otherSubject.Id, serviceType.Id, topic.Id,
            language.Id, educationLevel.Id, service?.Id,
            service is null ? null : Convert.ToBase64String(service.RowVersion), sample?.Id);
    }

    private static object Service(SeededTeacher teacher, Guid subjectId) => new
    {
        subjectId,
        serviceCatalogItemId = teacher.ServiceTypeId,
        title = "Updated title",
        description = "Updated service description.",
        price = 125m,
        currency = "SAR",
        deliveryHours = 24,
        revisions = 1
    };

    private static Task<HttpResponseMessage> Update(SeededTeacher teacher, HttpClient client)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/teachers/me/services/{teacher.ServiceId}")
        {
            Content = JsonContent.Create(Service(teacher, teacher.SubjectId))
        };
        request.Headers.TryAddWithoutValidation("If-Match", teacher.ServiceVersion);
        return client.SendAsync(request);
    }

    private static async Task<string> CodeAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString()!;

    private sealed record SeededTeacher(
        string Id, string Email, Guid SubjectId, Guid OtherSubjectId, Guid ServiceTypeId,
        Guid TopicId, Guid LanguageId, Guid EducationLevelId,
        Guid? ServiceId, string? ServiceVersion, Guid? SampleId);
}
