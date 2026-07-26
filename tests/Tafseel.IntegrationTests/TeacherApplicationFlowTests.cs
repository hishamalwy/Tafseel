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

[Trait("Category", "SqlServer")]
public sealed class TeacherApplicationFlowTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Teacher_can_submit_and_assigned_reviewer_can_approve()
    {
        var (subjectId, qualificationTopicId) = await SeedCatalogAndReviewer();
        using var teacher = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var teacherToken = await RegisterAndGetToken(teacher);
        teacher.DefaultRequestHeaders.Authorization = new("Bearer", teacherToken);

        var created = await teacher.PostAsJsonAsync("/api/v1/teacher-applications", new
        {
            subjectId,
            qualificationTopicId,
            city = "Cairo",
            experienceYears = 5,
            degree = "BSc Computer Science"
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var application = await created.Content.ReadFromJsonAsync<JsonElement>();
        var applicationId = application.GetProperty("id").GetGuid();
        SetVersion(teacher, application.GetProperty("version").GetString()!);

        using var demo = new MultipartFormDataContent();
        var bytes = new byte[] { 0, 0, 0, 12, (byte)'f', (byte)'t', (byte)'y', (byte)'p', (byte)'i', (byte)'s', (byte)'o', (byte)'m' };
        var video = new ByteArrayContent(bytes);
        video.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
        demo.Add(video, "file", "demo.mp4");
        demo.Add(new StringContent("120"), "durationSeconds");
        Assert.Equal(HttpStatusCode.OK,
            (await teacher.PostAsync($"/api/v1/teacher-applications/{applicationId}/demo", demo)).StatusCode);
        SetVersion(teacher, await LatestVersion(teacher, "/api/v1/teacher-applications/mine", applicationId));
        Assert.Equal(HttpStatusCode.NoContent,
            (await teacher.PostAsync($"/api/v1/teacher-applications/{applicationId}/submit", null)).StatusCode);

        using var reviewer = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        reviewer.DefaultRequestHeaders.Authorization = new("Bearer", await LoginAndGetToken(reviewer));
        SetVersion(reviewer, await LatestVersion(reviewer, "/api/v1/teacher-applications/queue", applicationId));
        Assert.Equal(HttpStatusCode.NoContent,
            (await reviewer.PostAsJsonAsync($"/api/v1/teacher-applications/{applicationId}/start-review",
                new { priority = (int)ApplicationPriority.High })).StatusCode);
        var reviewVersion = await LatestVersion(reviewer, "/api/v1/teacher-applications/queue", applicationId);
        SetVersion(reviewer, reviewVersion);
        var scores = Enum.GetValues<EvaluationCriterion>().Select(x => new { criterion = (int)x, score = 4 });

        using var otherReviewer = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        otherReviewer.DefaultRequestHeaders.Authorization = new(
            "Bearer", await LoginAndGetToken(otherReviewer, await CreateReviewer()));
        SetVersion(otherReviewer, reviewVersion);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await otherReviewer.PostAsJsonAsync($"/api/v1/teacher-applications/{applicationId}/decision",
                new { decision = (int)ReviewDecision.Approve, scores, comment = (string?)null, internalNotes = "Not assigned" })).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent,
            (await reviewer.PostAsJsonAsync($"/api/v1/teacher-applications/{applicationId}/decision",
                new { decision = (int)ReviewDecision.Approve, scores, comment = (string?)null, internalNotes = "Strong demo" })).StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Contains(db.TeacherSubjectQualifications, x => x.SubjectId == subjectId);
    }

    private async Task<(Guid SubjectId, Guid QualificationTopicId)> SeedCatalogAndReviewer()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var subject = new Subject($"Programming-{Guid.NewGuid():N}", "code");
        var topic = new QualificationTopic(subject.Id, $"OOP-{Guid.NewGuid():N}", "Explain encapsulation.", 180);
        db.AddRange(subject, topic);
        await db.SaveChangesAsync();

        _reviewerEmail = await CreateReviewer();
        return (subject.Id, topic.Id);
    }

    private async Task<string> CreateReviewer()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var reviewer = new ApplicationUser
        {
            UserName = $"reviewer-{Guid.NewGuid():N}@example.com",
            Email = $"reviewer-{Guid.NewGuid():N}@example.com",
            FullName = "Quality Reviewer",
            EmailConfirmed = true
        };
        reviewer.UserName = reviewer.Email;
        Assert.True((await users.CreateAsync(reviewer, "Strong!Password1")).Succeeded);
        Assert.True((await users.AddToRoleAsync(reviewer, Roles.QualityReviewer)).Succeeded);
        return reviewer.Email;
    }

    private string _reviewerEmail = "";

    private async Task<string> RegisterAndGetToken(HttpClient client)
    {
        var email = $"teacher-{Guid.NewGuid():N}@example.com";
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "Strong!Password1",
            fullName = "Test Teacher",
            role = Roles.Teacher
        });
        response.EnsureSuccessStatusCode();
        await factory.ConfirmLatestEmailAsync(client, email);
        response = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "Strong!Password1"
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString()!;
    }

    private Task<string> LoginAndGetToken(HttpClient client) =>
        LoginAndGetToken(client, _reviewerEmail);

    private static async Task<string> LoginAndGetToken(HttpClient client, string email)
    {
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "Strong!Password1"
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString()!;
    }

    private static void SetVersion(HttpClient client, string version)
    {
        client.DefaultRequestHeaders.Remove("If-Match");
        client.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", version);
    }

    private static async Task<string> LatestVersion(HttpClient client, string path, Guid id)
    {
        var applications = await client.GetFromJsonAsync<JsonElement[]>(path);
        return applications!.Single(x => x.GetProperty("id").GetGuid() == id)
            .GetProperty("version").GetString()!;
    }
}
