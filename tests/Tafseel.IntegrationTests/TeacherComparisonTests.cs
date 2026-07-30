using System.Net;
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
public sealed class TeacherComparisonTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Compare_returns_two_or_three_published_teachers_in_requested_order_with_fixed_queries()
    {
        var teachers = await SeedTeachersAsync();
        var client = factory.CreateClient();

        foreach (var ids in new[]
        {
            new[] { teachers.ThirdId, teachers.FirstId },
            new[] { teachers.SecondId, teachers.ThirdId, teachers.FirstId }
        })
        {
            factory.Commands.Reset();
            var response = await client.GetAsync(CompareUrl(ids));
            response.EnsureSuccessStatusCode();
            Assert.Equal(8, factory.Commands.ReadCount);

            var root = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
            Assert.Equal(ids.Length, root.GetProperty("requestedCount").GetInt32());
            Assert.Equal(0, root.GetProperty("unavailableCount").GetInt32());
            var compared = root.GetProperty("teachers").EnumerateArray().ToArray();
            Assert.Equal(ids, compared.Select(x => x.GetProperty("teacherId").GetString()));

            var allowed = new[]
            {
                "bio", "educationLevels", "experience", "fullName", "fullNameEnglish",
                "hasAvatar", "headline", "languages", "rating", "ratingCount", "sampleCount",
                "services", "startingCurrency", "startingPrice", "subjects", "teacherId",
                "topics", "trustBadges", "verified"
            };
            Assert.All(compared, teacher =>
                Assert.Equal(allowed, teacher.EnumerateObject().Select(x => x.Name).Order()));
            Assert.All(compared, teacher => Assert.True(teacher.GetProperty("verified").GetBoolean()));
            Assert.All(compared, teacher =>
            {
                var badge = Assert.Single(teacher.GetProperty("trustBadges").EnumerateArray());
                Assert.Equal("qualified_on_tafseel", badge.GetProperty("code").GetString());
                Assert.Equal("verification", badge.GetProperty("category").GetString());
                Assert.Equal("v1", badge.GetProperty("ruleVersion").GetString());
                Assert.Equal(JsonValueKind.Null, badge.GetProperty("subjectId").ValueKind);
            });
            Assert.All(compared, teacher => Assert.NotEmpty(teacher.GetProperty("services").EnumerateArray()));
            Assert.DoesNotContain("completedOrders", root.GetRawText(), StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("responseTimeMinutes", root.GetRawText(), StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("email", root.GetRawText(), StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("storageKey", root.GetRawText(), StringComparison.OrdinalIgnoreCase);
        }

        var all = JsonDocument.Parse(await client.GetStringAsync(CompareUrl(
            teachers.FirstId, teachers.SecondId, teachers.ThirdId))).RootElement;
        var first = all.GetProperty("teachers").EnumerateArray()
            .Single(x => x.GetProperty("teacherId").GetString() == teachers.FirstId);
        Assert.Equal(4.6m, first.GetProperty("rating").GetDecimal());
        Assert.Equal(2, first.GetProperty("ratingCount").GetInt32());
        Assert.Equal(1, first.GetProperty("sampleCount").GetInt32());
        Assert.Single(first.GetProperty("experience").EnumerateArray());
        var second = all.GetProperty("teachers").EnumerateArray()
            .Single(x => x.GetProperty("teacherId").GetString() == teachers.SecondId);
        Assert.Equal(JsonValueKind.Null, second.GetProperty("rating").ValueKind);
        Assert.Equal(0, second.GetProperty("ratingCount").GetInt32());
    }

    [Fact]
    public async Task Compare_validates_cardinality_duplicates_and_malformed_ids()
    {
        var teachers = await SeedTeachersAsync();
        var client = factory.CreateClient();

        await AssertCodeAsync(
            await client.GetAsync(CompareUrl(teachers.FirstId)),
            "comparison_requires_two_teachers");
        await AssertCodeAsync(
            await client.GetAsync(CompareUrl(
                teachers.FirstId, teachers.SecondId, teachers.ThirdId, Guid.NewGuid().ToString())),
            "comparison_limit_exceeded");
        await AssertCodeAsync(
            await client.GetAsync(CompareUrl(teachers.FirstId, teachers.FirstId)),
            "comparison_duplicate_teacher",
            HttpStatusCode.Conflict);
        await AssertCodeAsync(
            await client.GetAsync(CompareUrl(teachers.FirstId, "not-a-guid")),
            "comparison_invalid_teacher_id");
    }

    [Fact]
    public async Task Compare_omits_missing_and_unpublished_teachers_without_private_data()
    {
        var teachers = await SeedTeachersAsync();
        var root = JsonDocument.Parse(await factory.CreateClient().GetStringAsync(CompareUrl(
            teachers.FirstId, teachers.UnpublishedId, Guid.NewGuid().ToString()))).RootElement;

        Assert.Equal(3, root.GetProperty("requestedCount").GetInt32());
        Assert.Equal(2, root.GetProperty("unavailableCount").GetInt32());
        var item = Assert.Single(root.GetProperty("teachers").EnumerateArray());
        Assert.Equal(teachers.FirstId, item.GetProperty("teacherId").GetString());
        Assert.DoesNotContain("UNPUBLISHED_PRIVATE_MARKER", root.GetRawText(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Compare_derives_verified_status_from_an_active_qualification()
    {
        var teachers = await SeedTeachersAsync();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var qualification = await db.TeacherSubjectQualifications
                .SingleAsync(x => x.TeacherId == teachers.SecondId);
            qualification.Revoke(teachers.FirstId, "Comparison verification test.", DateTimeOffset.UtcNow);
            await db.SaveChangesAsync();
        }

        var root = JsonDocument.Parse(await factory.CreateClient().GetStringAsync(
            CompareUrl(teachers.FirstId, teachers.SecondId))).RootElement;

        Assert.Equal(1, root.GetProperty("unavailableCount").GetInt32());
        var teacher = Assert.Single(root.GetProperty("teachers").EnumerateArray());
        Assert.Equal(teachers.FirstId, teacher.GetProperty("teacherId").GetString());
        Assert.True(teacher.GetProperty("verified").GetBoolean());
    }

    private async Task<SeededTeachers> SeedTeachersAsync()
    {
        var first = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var second = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var third = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var unpublished = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Comparison Subject " + suffix, "code", "مادة المقارنة");
        var topic = new Topic(subject.Id, "Comparison Topic " + suffix, "Intermediate");
        var language = new TeachingLanguage("Arabic " + suffix, suffix[..8]);
        var level = new EducationLevel("University " + suffix);
        var serviceType = new ServiceCatalogItem(
            "Recorded explanation " + suffix, "Public comparison service.", "compare_" + suffix,
            "شرح مسجل", "خدمة مقارنة عامة", type: "recorded");
        db.AddRange(subject, topic, language, level, serviceType);

        var ids = new[] { first.Id, second.Id, third.Id, unpublished.Id };
        for (var index = 0; index < ids.Length; index++)
        {
            var teacherId = ids[index];
            var user = await db.Users.SingleAsync(x => x.Id == teacherId);
            user.FullName = $"Comparison Teacher {index + 1}";
            user.FullNameEnglish = $"Comparison Teacher {index + 1}";
            db.AddRange(
                new TeacherSubjectQualification(teacherId, subject.Id, DateTimeOffset.UtcNow),
                new TeacherTopic(teacherId, topic.Id),
                new TeacherLanguage(teacherId, language.Id),
                new TeacherEducationLevel(teacherId, level.Id),
                new TeacherService(
                    teacherId, subject.Id, serviceType.Id, $"Service {index + 1}",
                    "Public service description.", 100 + index * 25, "SAR", 24, 1,
                    DateTimeOffset.UtcNow));
            var profile = new TeacherProfile(teacherId, DateTimeOffset.UtcNow);
            profile.Update(
                $"Headline {index + 1}",
                index == 3 ? "UNPUBLISHED_PRIVATE_MARKER" : $"Public biography {index + 1}.",
                "Egypt", "Cairo", "Egypt Standard Time", 30, DateTimeOffset.UtcNow);
            if (index == 0) profile.SetRating(4.6m, 2, DateTimeOffset.UtcNow);
            if (index < 3) profile.Publish(DateTimeOffset.UtcNow);
            db.Add(profile);
        }

        db.Add(new TeacherExperience(first.Id, "University lecturer", "Public University",
            new DateOnly(2020, 1, 1), null));
        var storage = scope.ServiceProvider.GetRequiredService<Tafseel.Application.TeacherApplications.IFileStorageService>();
        var mediaBytes = new byte[] { 0, 0, 0, 0, (byte)'f', (byte)'t', (byte)'y', (byte)'p', 0, 0, 0, 0 };
        var stored = await storage.StorePrivateVideoAsync(
            new MemoryStream(mediaBytes), "published-sample.mp4", "video/mp4", mediaBytes.Length, default);
        var sample = new TeacherTeachingSample(
            first.Id, subject.Id, topic.Id, "Published sample",
            stored.StorageKey, 120, DateTimeOffset.UtcNow);
        sample.CurrentVersion().ReplaceVideo(
            stored.StorageKey, "published-sample.mp4", stored.ContentType, stored.Size);
        sample.Submit(first.Id, DateTimeOffset.UtcNow);
        sample.StartReview(second.Id, DateTimeOffset.UtcNow);
        sample.Decide(second.Id, ShowcaseDecision.Approve, null, null, null, DateTimeOffset.UtcNow);
        db.Add(sample);
        await db.SaveChangesAsync();
        return new(first.Id, second.Id, third.Id, unpublished.Id);
    }

    private static string CompareUrl(params string[] ids) =>
        "/api/v1/teachers/compare?" + string.Join(
            "&", ids.Select(x => "ids=" + Uri.EscapeDataString(x)));

    private static async Task AssertCodeAsync(
        HttpResponseMessage response,
        string code,
        HttpStatusCode status = HttpStatusCode.BadRequest)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal(code, JsonDocument.Parse(await response.Content.ReadAsStringAsync())
            .RootElement.GetProperty("code").GetString());
    }

    private sealed record SeededTeachers(
        string FirstId, string SecondId, string ThirdId, string UnpublishedId);
}
