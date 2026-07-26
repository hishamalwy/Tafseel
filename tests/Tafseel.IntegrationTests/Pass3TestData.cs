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

internal static class Pass3TestData
{
    public static async Task<(string Id, string Email)> CreateUserAsync(
        IServiceProvider services,
        string role)
    {
        await using var scope = services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var email = $"{role.ToLowerInvariant()}-{Guid.NewGuid():N}@example.com";
        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            FullName = $"Test {role}",
            EmailConfirmed = true
        };
        Assert.True((await users.CreateAsync(user, "Strong!Password1")).Succeeded);
        Assert.True((await users.AddToRoleAsync(user, role)).Succeeded);
        return (user.Id, email);
    }

    public static async Task<string> LoginAsync(HttpClient client, string email)
    {
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "Strong!Password1"
        });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("accessToken").GetString()!;
    }

    public static async Task<(Subject Subject, QualificationTopic Topic)> SeedCatalogAsync(
        IServiceProvider services,
        string suffix = "")
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        suffix = string.IsNullOrEmpty(suffix) ? Guid.NewGuid().ToString("N") : suffix;
        var subject = new Subject($"Subject {suffix}", "code");
        var topic = new QualificationTopic(subject.Id, $"Qualification {suffix}", "Explain it.", 180);
        db.AddRange(subject, topic);
        await db.SaveChangesAsync();
        return (subject, topic);
    }

    public static async Task<TeacherApplication> SeedApplicationAsync(
        IServiceProvider services,
        string teacherId,
        Subject subject,
        QualificationTopic topic,
        TeacherApplicationStatus status,
        string? reviewerId = null)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var now = DateTimeOffset.UtcNow;
        var application = new TeacherApplication(teacherId, subject.Id, topic.Id, now);
        application.UpdateDraft(topic.Id, "Cairo", 5, "BSc");
        application.AttachDemo($"teacher-demos/{Guid.NewGuid():N}.mp4", 120, topic.MaxVideoSeconds);
        if (status != TeacherApplicationStatus.Draft)
            application.Submit(teacherId, now);
        if (status is TeacherApplicationStatus.UnderReview
            or TeacherApplicationStatus.ChangesRequested
            or TeacherApplicationStatus.Approved
            or TeacherApplicationStatus.Rejected)
        {
            if (reviewerId is null)
                throw new ArgumentNullException(nameof(reviewerId));
            application.StartReview(reviewerId, ApplicationPriority.Medium, now);
            if (status is not TeacherApplicationStatus.UnderReview)
            {
                var decision = status switch
                {
                    TeacherApplicationStatus.ChangesRequested => ReviewDecision.RequestChanges,
                    TeacherApplicationStatus.Approved => ReviewDecision.Approve,
                    _ => ReviewDecision.Reject
                };
                application.Decide(
                    reviewerId,
                    decision,
                    Enum.GetValues<EvaluationCriterion>().ToDictionary(x => x, _ => 4),
                    decision == ReviewDecision.Approve ? null : "Required comment",
                    "Internal only",
                    now);
            }
        }
        else if (status == TeacherApplicationStatus.Withdrawn)
        {
            application.Withdraw(teacherId, now);
        }

        db.Add(application);
        await db.SaveChangesAsync();
        return application;
    }
}
