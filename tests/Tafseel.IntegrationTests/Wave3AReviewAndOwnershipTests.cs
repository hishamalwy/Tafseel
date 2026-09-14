using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>
/// Wave 3A authorization on SQL Server. Roles are additive - an administrator can give a teacher the
/// Quality Reviewer role - and that user still must not start the review of, or decide, their own
/// application. A teacher cannot change another teacher's services, time off or credentials.
/// </summary>
[Trait("Category", "SqlServer")]
public sealed class Wave3AReviewAndOwnershipTests(SqlServerTafseelApiFactory factory) : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task A_teacher_who_is_also_a_reviewer_cannot_review_their_own_application()
    {
        var (subject, topic) = await Pass3TestData.SeedCatalogAsync(factory.Services);
        var teacher = await UserAsync(Roles.Teacher, alsoReviewer: true);
        var submitted = await Pass3TestData.SeedApplicationAsync(factory.Services, teacher.Id, subject, topic, TeacherApplicationStatus.Submitted);

        using var self = await ClientAsync(teacher.Email);
        self.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", await VersionAsync(self, submitted.Id));
        var start = await self.PostAsJsonAsync($"/api/v1/teacher-applications/{submitted.Id}/start-review", new { priority = 1 });
        Assert.Equal(HttpStatusCode.BadRequest, start.StatusCode);
        Assert.Equal("self_review_forbidden", await CodeAsync(start));

        // Another reviewer takes it; the teacher-reviewer still cannot decide it.
        var reviewer = await UserAsync(Roles.QualityReviewer);
        using var other = await ClientAsync(reviewer.Email);
        other.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", await VersionAsync(other, submitted.Id));
        Assert.Equal(HttpStatusCode.NoContent,
            (await other.PostAsJsonAsync($"/api/v1/teacher-applications/{submitted.Id}/start-review", new { priority = 1 })).StatusCode);

        var ownUnderReview = await Pass3TestData.SeedApplicationAsync(
            factory.Services, teacher.Id, (await Pass3TestData.SeedCatalogAsync(factory.Services)).Subject,
            (await Pass3TestData.SeedCatalogAsync(factory.Services)).Topic, TeacherApplicationStatus.UnderReview, reviewerId: teacher.Id);
        using var selfDecision = await ClientAsync(teacher.Email);
        selfDecision.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", await VersionAsync(selfDecision, ownUnderReview.Id));
        var decision = await selfDecision.PostAsJsonAsync($"/api/v1/teacher-applications/{ownUnderReview.Id}/decision", Approval());
        Assert.Equal(HttpStatusCode.BadRequest, decision.StatusCode);
        Assert.Equal("self_review_forbidden", await CodeAsync(decision));

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.DoesNotContain(db.TeacherSubjectQualifications, q => q.TeacherId == teacher.Id);
    }

    [Fact]
    public async Task A_teacher_cannot_change_another_teachers_services_time_off_or_credentials()
    {
        var (subject, _) = await Pass3TestData.SeedCatalogAsync(factory.Services);
        var owner = await UserAsync(Roles.Teacher);
        Guid catalogId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var catalog = new ServiceCatalogItem($"Ownership {Guid.NewGuid():N}", "Explanation", $"own_{Guid.NewGuid():N}", "شرح", "شرح مخصص");
            db.AddRange(catalog, new TeacherSubjectQualification(owner.Id, subject.Id, DateTimeOffset.UtcNow));
            await db.SaveChangesAsync();
            catalogId = catalog.Id;
        }
        using var ownerClient = await ClientAsync(owner.Email);
        Assert.Equal(HttpStatusCode.NoContent, (await ownerClient.PutAsJsonAsync("/api/v1/teachers/me",
            new { headline = "Physics", bio = "Mechanics teacher", country = "SA", city = "Riyadh", timeZoneId = "UTC", responseTimeMinutes = 30 })).StatusCode);
        var service = await (await ownerClient.PostAsJsonAsync("/api/v1/teachers/me/services", new
        {
            subjectId = subject.Id,
            serviceCatalogItemId = catalogId,
            price = 100,
            currency = "SAR",
            deliveryHours = 48,
            revisions = 1
        })).Content.ReadFromJsonAsync<JsonElement>();
        var exception = await (await ownerClient.PostAsJsonAsync("/api/v1/teachers/me/availability/exceptions",
            new { startsAt = DateTimeOffset.UtcNow.AddDays(2), endsAt = DateTimeOffset.UtcNow.AddDays(3), reason = "Away" })).Content.ReadFromJsonAsync<JsonElement>();
        var credential = await (await ownerClient.PostAsJsonAsync("/api/v1/teachers/me/certifications",
            new { title = "BSc", organization = "KSU" })).Content.ReadFromJsonAsync<JsonElement>();

        using var intruder = await ClientAsync((await UserAsync(Roles.Teacher)).Email);
        intruder.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", service.GetProperty("version").GetString());
        var serviceId = service.GetProperty("id").GetGuid();
        var toggled = await intruder.PutAsJsonAsync($"/api/v1/teachers/me/services/{serviceId}/active", new { active = false });
        Assert.Equal("service_not_owned", await CodeAsync(toggled));
        var edited = await intruder.PutAsJsonAsync($"/api/v1/teachers/me/services/{serviceId}", new
        {
            subjectId = subject.Id,
            serviceCatalogItemId = catalogId,
            price = 1,
            currency = "SAR",
            deliveryHours = 48,
            revisions = 1
        });
        Assert.Equal("service_not_owned", await CodeAsync(edited));
        var timeOff = await intruder.DeleteAsync($"/api/v1/teachers/me/availability/exceptions/{exception.GetProperty("id").GetGuid()}");
        Assert.Equal("availability_exception_not_owned", await CodeAsync(timeOff));
        var removed = await intruder.DeleteAsync($"/api/v1/teachers/me/certifications/{credential.GetProperty("id").GetGuid()}");
        Assert.Equal("credential_not_owned", await CodeAsync(removed));
        foreach (var refused in new[] { toggled, edited, timeOff, removed })
            Assert.False(refused.IsSuccessStatusCode);

        var profile = await ownerClient.GetFromJsonAsync<JsonElement>("/api/v1/teachers/me");
        var offering = Assert.Single(profile.GetProperty("services").EnumerateArray());
        Assert.True(offering.GetProperty("isActive").GetBoolean());
        Assert.Equal(100m, offering.GetProperty("price").GetDecimal());
        Assert.Single(profile.GetProperty("availabilityExceptions").EnumerateArray());
        Assert.Single(profile.GetProperty("certifications").EnumerateArray());
    }

    private static object Approval() => new
    {
        decision = (int)ReviewDecision.Approve,
        scores = Enum.GetValues<EvaluationCriterion>().Select(x => new { criterion = (int)x, score = 5 }),
        comment = (string?)null,
        internalNotes = (string?)null
    };

    private async Task<(string Id, string Email)> UserAsync(string role, bool alsoReviewer = false)
    {
        var user = await Pass3TestData.CreateUserAsync(factory.Services, role);
        if (!alsoReviewer) return user;
        await using var scope = factory.Services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.True((await users.AddToRoleAsync((await users.FindByIdAsync(user.Id))!, Roles.QualityReviewer)).Succeeded);
        return user;
    }

    private async Task<HttpClient> ClientAsync(string roleOrEmail)
    {
        var email = roleOrEmail.Contains('@') ? roleOrEmail : (await UserAsync(roleOrEmail)).Email;
        var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static async Task<string> VersionAsync(HttpClient reviewer, Guid applicationId) =>
        (await reviewer.GetFromJsonAsync<JsonElement>($"/api/v1/teacher-applications/{applicationId}"))
            .GetProperty("application").GetProperty("version").GetString()!;

    private static async Task<string?> CodeAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).TryGetProperty("code", out var code) ? code.GetString() : null;
}
