using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Api.Controllers;
using Tafseel.Application.Authorization;
using Tafseel.Application.Marketplace;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

public sealed class TeacherApplicationAuthorizationTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    [Fact]
    public async Task Applicant_policy_and_resource_ownership_are_both_enforced()
    {
        var (subjectId, topicId) = await SeedCatalog();
        var input = new
        {
            subjectId,
            qualificationTopicId = topicId,
            city = "Cairo",
            experienceYears = 5,
            degree = "BSc"
        };

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Client().PostAsJsonAsync("/api/v1/teacher-applications", input)).StatusCode);

        foreach (var denied in new[]
        {
            await User(Roles.Student, false),
            await User(Roles.Teacher, false),
            await User(Roles.QualityReviewer, false),
            await User(Roles.QualityReviewer, false),
            await User(Roles.Admin, true),
            await User(Roles.Teacher, true, suspended: true)
        })
        {
            using var client = Client(denied.Token);
            var response = await client.PostAsJsonAsync("/api/v1/teacher-applications", input);
            Assert.Equal(denied.Suspended ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden,
                response.StatusCode);
        }

        var owner = await User(Roles.Teacher, true);
        using var ownerClient = Client(owner.Token);
        var created = await ownerClient.PostAsJsonAsync("/api/v1/teacher-applications", input);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var applicationId = (await created.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id").GetGuid();
        var otherTeacher = await User(Roles.Teacher, true);
        using var otherClient = Client(otherTeacher.Token);
        otherClient.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", "AQ==");
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherClient.PutAsJsonAsync($"/api/v1/teacher-applications/{applicationId}", input)).StatusCode);
    }

    [Fact]
    public void Every_applicant_endpoint_uses_the_central_permission()
    {
        var methods = new[] { "Create", "Update", "Mine", "UploadDemo", "Submit", "Withdraw" };
        foreach (var method in methods)
        {
            var authorization = typeof(TeacherApplicationsController).GetMethod(method)!
                .GetCustomAttributes(typeof(AuthorizeAttribute), true)
                .Cast<AuthorizeAttribute>()
                .Single();
            Assert.Equal(Permissions.TeachersApply, authorization.Policy);
            Assert.Null(authorization.Roles);
        }
    }

    [Fact]
    public async Task Own_languages_returns_stable_collections_for_new_saved_and_partial_profiles()
    {
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Client().GetAsync("/api/v1/teachers/me/languages")).StatusCode);

        var denied = await User(Roles.Student, false);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Client(denied.Token).GetAsync("/api/v1/teachers/me/languages")).StatusCode);

        var teacher = await User(
            Roles.Teacher, true, permission: Permissions.TeachersManageOwnProfile);
        using var teacherClient = Client(teacher.Token);
        var empty = await teacherClient.GetFromJsonAsync<NamedItemDto[]>("/api/v1/teachers/me/languages");
        Assert.Empty(empty!);

        Guid languageId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var language = new TeachingLanguage($"Language-{Guid.NewGuid():N}", $"x-{Guid.NewGuid():N}");
            db.Add(language);
            await db.SaveChangesAsync();
            languageId = language.Id;
        }

        Assert.Equal(HttpStatusCode.NoContent,
            (await teacherClient.PutAsJsonAsync("/api/v1/teachers/me/languages", new { ids = new[] { languageId } }))
                .StatusCode);
        var saved = Assert.Single(
            (await teacherClient.GetFromJsonAsync<NamedItemDto[]>("/api/v1/teachers/me/languages"))!);
        Assert.Equal(languageId, saved.Id);

        var partial = await User(
            Roles.Teacher, true, permission: Permissions.TeachersManageOwnProfile);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            db.Add(new TeacherProfile(partial.UserId, DateTimeOffset.UtcNow));
            await db.SaveChangesAsync();
        }
        Assert.Empty((await Client(partial.Token)
            .GetFromJsonAsync<NamedItemDto[]>("/api/v1/teachers/me/languages"))!);
    }

    private async Task<(Guid SubjectId, Guid TopicId)> SeedCatalog()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var subject = new Subject($"Authorization-{Guid.NewGuid():N}", "shield");
        var topic = new QualificationTopic(subject.Id, $"Topic-{Guid.NewGuid():N}", "Explain.", 180);
        db.AddRange(subject, topic);
        await db.SaveChangesAsync();
        return (subject.Id, topic.Id);
    }

    private async Task<TestUser> User(
        string role,
        bool applyPermission,
        bool suspended = false,
        string? permission = null)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = new ApplicationUser
        {
            UserName = $"{Guid.NewGuid():N}@example.com",
            Email = $"{Guid.NewGuid():N}@example.com",
            FullName = "Authorization User",
            EmailConfirmed = true,
            IsSuspended = suspended
        };
        user.Email = user.UserName;
        Assert.True((await users.CreateAsync(user, "Strong!Password1")).Succeeded);
        Assert.True((await users.AddToRoleAsync(user, role)).Succeeded);
        return new(TestToken(user, role, applyPermission, permission), suspended, user.Id);
    }

    private static string TestToken(
        ApplicationUser user,
        string role,
        bool applyPermission,
        string? permission)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.Email, user.Email!),
            new("name", user.FullName),
            new("security_stamp", user.SecurityStamp!),
            new(ClaimTypes.Role, role)
        };
        if (applyPermission)
            claims.Add(new(Permissions.ClaimType, permission ?? Permissions.TeachersApply));
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes("integration-tests-only-signing-key-32-bytes")),
            SecurityAlgorithms.HmacSha256);
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            "Tafseel.Api", "Tafseel.Web", claims,
            expires: DateTime.UtcNow.AddMinutes(5), signingCredentials: credentials));
    }

    private HttpClient Client(string? token = null)
    {
        var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        if (token is not null)
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private sealed record TestUser(string Token, bool Suspended, string UserId);
}
