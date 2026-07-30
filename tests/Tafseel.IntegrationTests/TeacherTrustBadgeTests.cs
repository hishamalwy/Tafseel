using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Application.Marketplace;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class TeacherTrustBadgeTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Public_card_profile_and_own_profile_project_qualified_on_tafseel()
    {
        var teacher = await SeedPublishedTeacherAsync();
        var anonymous = factory.CreateClient();

        var search = JsonDocument.Parse(await anonymous.GetStringAsync(
            $"/api/v1/teachers?subjectId={teacher.SubjectId}&pageSize=100")).RootElement;
        var card = Assert.Single(search.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("teacherId").GetString() == teacher.Id);
        AssertQualifiedBadge(card.GetProperty("trustBadges"));
        Assert.True(card.GetProperty("verified").GetBoolean());
        Assert.Equal(JsonValueKind.Null, card.GetProperty("completedOrders").ValueKind);

        var publicProfile = JsonDocument.Parse(await anonymous.GetStringAsync(
            $"/api/v1/teachers/{teacher.Id}")).RootElement;
        AssertQualifiedBadge(publicProfile.GetProperty("trustBadges"));
        Assert.DoesNotContain("top_rated", publicProfile.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("highly_rated", publicProfile.GetRawText(), StringComparison.OrdinalIgnoreCase);

        var owner = await ClientForAsync(teacher.Email);
        var own = JsonDocument.Parse(await owner.GetStringAsync("/api/v1/teachers/me")).RootElement;
        AssertQualifiedBadge(own.GetProperty("trustBadges"));

        var overpost = await owner.PutAsJsonAsync("/api/v1/teachers/me", new
        {
            headline = "Clear explanations",
            bio = "Detailed professional teacher biography for trust badge tests.",
            country = "Egypt",
            city = "Cairo",
            timeZoneId = "Egypt Standard Time",
            responseTimeMinutes = 30,
            trustBadges = new[]
            {
                new { code = "top_rated", category = "performance", ruleVersion = "v1" }
            },
            verified = false
        });
        Assert.Equal(HttpStatusCode.NoContent, overpost.StatusCode);
        var afterOverpost = JsonDocument.Parse(await owner.GetStringAsync("/api/v1/teachers/me")).RootElement;
        AssertQualifiedBadge(afterOverpost.GetProperty("trustBadges"));
        Assert.True(afterOverpost.GetProperty("verified").GetBoolean());
    }

    [Fact]
    public async Task Revoking_last_qualification_clears_trust_badge_and_public_visibility()
    {
        var teacher = await SeedPublishedTeacherAsync();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var qualification = await db.TeacherSubjectQualifications
                .SingleAsync(x => x.TeacherId == teacher.Id && x.SubjectId == teacher.SubjectId);
            var reviewer = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
            qualification.Revoke(reviewer.Id, "Trust badge revoke test.", DateTimeOffset.UtcNow);
            var service = await db.TeacherServices.SingleAsync(x => x.Id == teacher.ServiceId);
            service.SetActive(false, DateTimeOffset.UtcNow);
            await db.SaveChangesAsync();
        }

        var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound,
            (await anonymous.GetAsync($"/api/v1/teachers/{teacher.Id}")).StatusCode);

        var search = JsonDocument.Parse(await anonymous.GetStringAsync(
            $"/api/v1/teachers?subjectId={teacher.SubjectId}&pageSize=100")).RootElement;
        Assert.DoesNotContain(search.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("teacherId").GetString() == teacher.Id);

        var owner = await ClientForAsync(teacher.Email);
        var own = JsonDocument.Parse(await owner.GetStringAsync("/api/v1/teachers/me")).RootElement;
        Assert.Empty(own.GetProperty("trustBadges").EnumerateArray());
        Assert.False(own.GetProperty("verified").GetBoolean());
    }

    [Fact]
    public async Task Inactive_subject_does_not_keep_trust_badge()
    {
        var teacher = await SeedPublishedTeacherAsync();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var subject = await db.Subjects.SingleAsync(x => x.Id == teacher.SubjectId);
            subject.SetActive(false);
            await db.SaveChangesAsync();
        }

        var owner = await ClientForAsync(teacher.Email);
        var own = JsonDocument.Parse(await owner.GetStringAsync("/api/v1/teachers/me")).RootElement;
        Assert.Empty(own.GetProperty("trustBadges").EnumerateArray());
        Assert.False(own.GetProperty("verified").GetBoolean());
    }

    private static void AssertQualifiedBadge(JsonElement trustBadges)
    {
        var badge = Assert.Single(trustBadges.EnumerateArray());
        Assert.Equal(TeacherTrustBadgeCodes.QualifiedOnTafseel, badge.GetProperty("code").GetString());
        Assert.Equal(TeacherTrustBadgeCodes.CategoryVerification, badge.GetProperty("category").GetString());
        Assert.Equal(TeacherTrustBadgeCodes.RuleVersionV1, badge.GetProperty("ruleVersion").GetString());
        Assert.Equal(JsonValueKind.Null, badge.GetProperty("subjectId").ValueKind);
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private async Task<SeededTeacher> SeedPublishedTeacherAsync()
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var subject = new Subject($"Trust Subject {suffix}", $"ts_{suffix}", "مادة");
        var language = new TeachingLanguage($"Lang {suffix}", suffix);
        var serviceType = new ServiceCatalogItem(
            $"Recorded {suffix}", "Public service.", $"trust_{suffix}",
            "شرح", "وصف", type: "recorded");
        db.AddRange(subject, language, serviceType);
        db.Add(new TeacherSubjectQualification(teacher.Id, subject.Id, DateTimeOffset.UtcNow));
        db.Add(new TeacherLanguage(teacher.Id, language.Id));
        var service = new TeacherService(
            teacher.Id, subject.Id, serviceType.Id, "Trust service",
            "Public service description.", 120, "SAR", 24, 1, DateTimeOffset.UtcNow);
        db.Add(service);
        var profile = new TeacherProfile(teacher.Id, DateTimeOffset.UtcNow);
        profile.Update(
            "Trust headline", "Trust biography for published teacher.",
            "Egypt", "Cairo", "Egypt Standard Time", 30, DateTimeOffset.UtcNow);
        profile.Publish(DateTimeOffset.UtcNow);
        db.Add(profile);
        await db.SaveChangesAsync();
        return new(teacher.Id, teacher.Email, subject.Id, service.Id);
    }

    private sealed record SeededTeacher(string Id, string Email, Guid SubjectId, Guid ServiceId);
}
