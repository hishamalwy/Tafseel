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
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class TeacherPublicProfileHardeningTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Favorites_match_browse_eligibility_and_omit_unpublished_or_suspended()
    {
        var browsable = await SeedBrowsableTeacherAsync();
        var unpublished = await SeedBrowsableTeacherAsync(publish: false);
        var suspended = await SeedBrowsableTeacherAsync();
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var client = await ClientForAsync(student.Email);

        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PutAsync($"/api/v1/favorite-teachers/{browsable.Id}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PutAsync($"/api/v1/favorite-teachers/{unpublished.Id}", null)).StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            db.Add(new FavoriteTeacher(student.Id, suspended.Id, DateTimeOffset.UtcNow));
            var user = await db.Users.SingleAsync(x => x.Id == suspended.Id);
            user.IsSuspended = true;
            await db.SaveChangesAsync();
        }

        var browseIds = JsonDocument.Parse(await factory.CreateClient().GetStringAsync(
                "/api/v1/teachers?pageSize=100")).RootElement
            .GetProperty("items").EnumerateArray()
            .Select(x => x.GetProperty("teacherId").GetString()!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        Assert.Contains(browsable.Id, browseIds);
        Assert.DoesNotContain(unpublished.Id, browseIds);
        Assert.DoesNotContain(suspended.Id, browseIds);

        var favorites = JsonDocument.Parse(await client.GetStringAsync("/api/v1/favorite-teachers"))
            .RootElement.EnumerateArray().ToArray();
        var favorite = Assert.Single(favorites);
        Assert.Equal(browsable.Id, favorite.GetProperty("teacherId").GetString());
        Assert.DoesNotContain(suspended.Id, favorites.Select(x => x.GetProperty("teacherId").GetString()));
    }

    [Fact]
    public async Task Reviews_are_hidden_when_public_profile_is_hidden()
    {
        var teacher = await SeedBrowsableTeacherAsync();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var profile = await db.TeacherProfiles.SingleAsync(x => x.TeacherId == teacher.Id);
            profile.Unpublish(DateTimeOffset.UtcNow);
            await db.SaveChangesAsync();
        }

        var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound,
            (await anonymous.GetAsync($"/api/v1/teachers/{teacher.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await anonymous.GetAsync($"/api/v1/teachers/{teacher.Id}/reviews")).StatusCode);
    }

    [Fact]
    public async Task Sample_count_languages_topics_and_public_dto_privacy_match_profile_rules()
    {
        var teacher = await SeedBrowsableTeacherAsync(withApprovedShowcase: true, withInactiveCatalog: true);
        var anonymous = factory.CreateClient();

        var profile = JsonDocument.Parse(await anonymous.GetStringAsync(
            $"/api/v1/teachers/{teacher.Id}")).RootElement;
        Assert.Equal("", profile.GetProperty("city").GetString());
        Assert.Equal("", profile.GetProperty("timeZoneId").GetString());
        Assert.False(profile.GetProperty("isProfileComplete").GetBoolean());
        Assert.False(profile.GetProperty("isEligibleForPublication").GetBoolean());
        Assert.Empty(profile.GetProperty("publicationBlockingReasons").EnumerateArray());
        Assert.DoesNotContain("storageKey", profile.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("assignedReviewerId", profile.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("internalNote", profile.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.Equal(1, profile.GetProperty("samples").GetArrayLength());
        Assert.DoesNotContain(teacher.InactiveLanguageName!,
            profile.GetProperty("languages").EnumerateArray().Select(x => x.GetProperty("name").GetString()));
        Assert.DoesNotContain(teacher.InactiveTopicName!,
            profile.GetProperty("topics").EnumerateArray().Select(x => x.GetProperty("name").GetString()));

        var other = await SeedBrowsableTeacherAsync();
        var compare = JsonDocument.Parse(await anonymous.GetStringAsync(
            $"/api/v1/teachers/compare?ids={teacher.Id}&ids={other.Id}")).RootElement;
        var compared = compare.GetProperty("teachers").EnumerateArray()
            .Single(x => x.GetProperty("teacherId").GetString() == teacher.Id);
        Assert.Equal(profile.GetProperty("samples").GetArrayLength(),
            compared.GetProperty("sampleCount").GetInt32());
        Assert.DoesNotContain(teacher.InactiveLanguageName!,
            compared.GetProperty("languages").EnumerateArray().Select(x => x.GetProperty("name").GetString()));
        Assert.DoesNotContain(teacher.InactiveTopicName!,
            compared.GetProperty("topics").EnumerateArray().Select(x => x.GetProperty("name").GetString()));

        var browse = JsonDocument.Parse(await anonymous.GetStringAsync(
            "/api/v1/teachers?pageSize=100")).RootElement;
        var card = browse.GetProperty("items").EnumerateArray()
            .Single(x => x.GetProperty("teacherId").GetString() == teacher.Id);
        Assert.DoesNotContain(teacher.InactiveLanguageName!,
            card.GetProperty("languages").EnumerateArray().Select(x => x.GetString()));

        var owner = await ClientForAsync(teacher.Email);
        var own = JsonDocument.Parse(await owner.GetStringAsync("/api/v1/teachers/me")).RootElement;
        Assert.Equal("Cairo", own.GetProperty("city").GetString());
        Assert.False(string.IsNullOrWhiteSpace(own.GetProperty("timeZoneId").GetString()));
        Assert.Contains(teacher.InactiveLanguageName!,
            own.GetProperty("languages").EnumerateArray().Select(x => x.GetProperty("name").GetString()));
    }

    private async Task<SeededTeacher> SeedBrowsableTeacherAsync(
        bool publish = true,
        bool withApprovedShowcase = false,
        bool withInactiveCatalog = false)
    {
        var user = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Hardening Subject " + suffix, "code", "مادة");
        var topic = new Topic(subject.Id, "Active Topic " + suffix, "Intermediate");
        var inactiveTopic = new Topic(subject.Id, "Inactive Topic " + suffix, "Intermediate");
        inactiveTopic.SetActive(false);
        var language = new TeachingLanguage("Active Lang " + suffix, suffix[..8]);
        var inactiveLanguage = new TeachingLanguage("Inactive Lang " + suffix, suffix[8..16]);
        inactiveLanguage.SetActive(false);
        var level = new EducationLevel("Level " + suffix);
        var serviceType = new ServiceCatalogItem(
            "Service " + suffix, "Public service.", "svc_" + suffix,
            "خدمة", "وصف", type: "recorded");
        db.AddRange(subject, topic, inactiveTopic, language, inactiveLanguage, level, serviceType);
        db.Add(new TeacherSubjectQualification(user.Id, subject.Id, DateTimeOffset.UtcNow));
        db.Add(new TeacherTopic(user.Id, topic.Id));
        if (withInactiveCatalog)
        {
            db.Add(new TeacherTopic(user.Id, inactiveTopic.Id));
            db.Add(new TeacherLanguage(user.Id, inactiveLanguage.Id));
        }
        db.Add(new TeacherLanguage(user.Id, language.Id));
        db.Add(new TeacherEducationLevel(user.Id, level.Id));
        var service = new TeacherService(
            user.Id, subject.Id, serviceType.Id, "Service title",
            "Public service description.", 120, "SAR", 24, 1, DateTimeOffset.UtcNow);
        db.Add(service);
        var profile = new TeacherProfile(user.Id, DateTimeOffset.UtcNow);
        profile.Update(
            "Clear explanations",
            "Detailed professional teacher biography for hardening tests.",
            "Egypt", "Cairo", "Egypt Standard Time", 30, DateTimeOffset.UtcNow);
        if (publish) profile.Publish(DateTimeOffset.UtcNow);
        db.Add(profile);

        if (withApprovedShowcase)
        {
            var storage = scope.ServiceProvider
                .GetRequiredService<Tafseel.Application.TeacherApplications.IFileStorageService>();
            var mediaBytes = new byte[] { 0, 0, 0, 0, (byte)'f', (byte)'t', (byte)'y', (byte)'p', 0, 0, 0, 0 };
            var stored = await storage.StorePrivateVideoAsync(
                new MemoryStream(mediaBytes), "sample.mp4", "video/mp4", mediaBytes.Length, default);
            var sample = new TeacherTeachingSample(
                user.Id, subject.Id, topic.Id, "Approved sample",
                stored.StorageKey, 120, DateTimeOffset.UtcNow);
            sample.CurrentVersion().ReplaceVideo(
                stored.StorageKey, "sample.mp4", stored.ContentType, stored.Size);
            sample.Submit(user.Id, DateTimeOffset.UtcNow);
            var reviewer = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
            sample.StartReview(reviewer.Id, DateTimeOffset.UtcNow);
            sample.Decide(reviewer.Id, ShowcaseDecision.Approve, null, null, null, DateTimeOffset.UtcNow);
            db.Add(sample);
        }

        await db.SaveChangesAsync();
        return new(
            user.Id, user.Email, service.Id,
            withInactiveCatalog ? inactiveLanguage.Name : null,
            withInactiveCatalog ? inactiveTopic.Name : null);
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private sealed record SeededTeacher(
        string Id, string Email, Guid ServiceId,
        string? InactiveLanguageName, string? InactiveTopicName);
}
