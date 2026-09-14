using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Tafseel.Api.Controllers;
using Tafseel.Application.Authorization;
using Tafseel.Domain.TeacherApplications;

namespace Tafseel.IntegrationTests;

/// <summary>
/// Wave 3A: the Angular supply screens hide what a role may not do, but the API decides. Each
/// role is refused the other roles' supply operations. Self-review and one teacher touching
/// another's data are covered in <see cref="Wave3AReviewAndOwnershipTests"/>, which needs SQL Server.
/// </summary>
public sealed class Wave3ASupplyAuthorizationTests(TafseelApiFactory factory) : IClassFixture<TafseelApiFactory>
{
    public static TheoryData<string, string> SupplyPolicies() => new()
    {
        { nameof(MarketplaceController.UpdateProfile), Permissions.TeachersManageOwnProfile },
        { nameof(MarketplaceController.PublishProfile), Permissions.TeachersManageOwnProfile },
        { nameof(MarketplaceController.EligibleSubjects), Permissions.TeachersManageOwnProfile },
        { nameof(MarketplaceController.SetTopics), Permissions.TeachersManageOwnProfile },
        { nameof(MarketplaceController.SetLanguages), Permissions.TeachersManageOwnProfile },
        { nameof(MarketplaceController.SetEducationLevels), Permissions.TeachersManageOwnProfile },
        { nameof(MarketplaceController.AddRule), Permissions.TeachersManageOwnProfile },
        { nameof(MarketplaceController.ReplaceRules), Permissions.TeachersManageOwnProfile },
        { nameof(MarketplaceController.RemoveRule), Permissions.TeachersManageOwnProfile },
        { nameof(MarketplaceController.AddException), Permissions.TeachersManageOwnProfile },
        { nameof(MarketplaceController.RemoveException), Permissions.TeachersManageOwnProfile },
        { nameof(MarketplaceController.AddCredential), Permissions.TeachersManageOwnProfile },
        { nameof(MarketplaceController.RemoveCredential), Permissions.TeachersManageOwnProfile },
        { nameof(MarketplaceController.MarketplaceServices), Permissions.TeachersManageOwnServices },
        { nameof(MarketplaceController.AddService), Permissions.TeachersManageOwnServices },
        { nameof(MarketplaceController.UpdateService), Permissions.TeachersManageOwnServices },
        { nameof(MarketplaceController.SetServiceActive), Permissions.TeachersManageOwnServices },
        { nameof(TeacherApplicationsController.Queue), Permissions.TeachersReviewApplications },
        { nameof(TeacherApplicationsController.QueueSummary), Permissions.TeachersReviewApplications },
        { nameof(TeacherApplicationsController.QueueDetail), Permissions.TeachersReviewApplications },
        { nameof(TeacherApplicationsController.StartReview), Permissions.TeachersReviewApplications },
        { nameof(TeacherApplicationsController.Decide), Permissions.TeachersReviewApplications },
        { nameof(TeacherApplicationsController.RevokeQualification), Permissions.TeachersReviewApplications },
    };

    [Theory]
    [MemberData(nameof(SupplyPolicies))]
    public void Every_supply_endpoint_uses_its_central_permission(string action, string policy)
    {
        var method = typeof(MarketplaceController).GetMethod(action) ?? typeof(TeacherApplicationsController).GetMethod(action);
        Assert.NotNull(method);
        var authorize = Assert.Single(method!.GetCustomAttributes(typeof(AuthorizeAttribute), true).Cast<AuthorizeAttribute>());
        Assert.Equal(policy, authorize.Policy);
        Assert.Null(authorize.Roles);
    }

    [Fact]
    public async Task Students_and_reviewers_cannot_use_the_teacher_supply_editors()
    {
        foreach (var role in new[] { Roles.Student, Roles.QualityReviewer })
        {
            using var client = await ClientAsync(role);
            client.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", "AQ==");
            var id = Guid.NewGuid();
            var calls = new Func<Task<HttpResponseMessage>>[]
            {
                () => client.GetAsync("/api/v1/teachers/me"),
                () => client.PutAsJsonAsync("/api/v1/teachers/me", new { headline = "H", bio = "B", country = "SA", city = "Riyadh", timeZoneId = "UTC", responseTimeMinutes = 5 }),
                () => client.PutAsJsonAsync("/api/v1/teachers/me/publication", new { published = true }),
                () => client.PutAsJsonAsync("/api/v1/teachers/me/topics", new { ids = Array.Empty<Guid>() }),
                () => client.PostAsJsonAsync("/api/v1/teachers/me/certifications", new { title = "T", organization = "O" }),
                () => client.GetAsync("/api/v1/teachers/me/marketplace-services"),
                () => client.PostAsJsonAsync("/api/v1/teachers/me/services", new { subjectId = id, serviceCatalogItemId = id, price = 10, currency = "SAR", deliveryHours = 24, revisions = 1 }),
                () => client.PutAsJsonAsync($"/api/v1/teachers/me/services/{id}/active", new { active = true }),
                () => client.PutAsJsonAsync("/api/v1/teachers/me/availability/rules", new { rules = Array.Empty<object>() }),
                () => client.DeleteAsync($"/api/v1/teachers/me/availability/rules/{id}"),
                () => client.PostAsJsonAsync("/api/v1/teachers/me/availability/exceptions", new { startsAt = DateTimeOffset.UtcNow.AddDays(1), endsAt = DateTimeOffset.UtcNow.AddDays(2) }),
                () => client.GetAsync("/api/v1/teachers/onboarding-status"),
            };
            foreach (var call in calls)
                Assert.Equal(HttpStatusCode.Forbidden, (await call()).StatusCode);
        }
    }

    [Fact]
    public async Task Students_and_teachers_cannot_review_applications_including_their_own()
    {
        var (subject, topic) = await Pass3TestData.SeedCatalogAsync(factory.Services);
        var teacher = await UserAsync(Roles.Teacher);
        var application = await Pass3TestData.SeedApplicationAsync(factory.Services, teacher.Id, subject, topic, TeacherApplicationStatus.Submitted);
        var student = await UserAsync(Roles.Student);

        foreach (var user in new[] { teacher, student })
        {
            using var client = await ClientAsync(user.Email);
            client.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", "AQ==");
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/teacher-applications/queue")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v1/teacher-applications/{application.Id}")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden,
                (await client.PostAsJsonAsync($"/api/v1/teacher-applications/{application.Id}/start-review", new { priority = 1 })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden,
                (await client.PostAsJsonAsync($"/api/v1/teacher-applications/{application.Id}/decision", Approval())).StatusCode);
        }
    }

    private static object Approval() => new
    {
        decision = (int)ReviewDecision.Approve,
        scores = Enum.GetValues<EvaluationCriterion>().Select(x => new { criterion = (int)x, score = 5 }),
        comment = (string?)null,
        internalNotes = (string?)null
    };

    private Task<(string Id, string Email)> UserAsync(string role) => Pass3TestData.CreateUserAsync(factory.Services, role);

    private async Task<HttpClient> ClientAsync(string roleOrEmail)
    {
        var email = roleOrEmail.Contains('@') ? roleOrEmail : (await UserAsync(roleOrEmail)).Email;
        var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static async Task<string?> CodeAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).TryGetProperty("code", out var code) ? code.GetString() : null;
}
