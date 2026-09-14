using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class TeacherAdditionalSubjectQualificationTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Approved_teacher_can_apply_for_another_subject_without_touching_existing_qualification()
    {
        var seeded = await SeedApprovedTeacherWithSecondSubjectAsync();
        using var teacher = await ClientForAsync(seeded.Email);

        var cards = await teacher.GetFromJsonAsync<JsonElement>("/api/v1/teachers/me/qualifications");
        Assert.Contains(cards.EnumerateArray(), x =>
            x.GetProperty("subjectId").GetGuid() == seeded.SubjectA
            && x.GetProperty("state").GetInt32() == 0);
        Assert.Contains(cards.EnumerateArray(), x =>
            x.GetProperty("subjectId").GetGuid() == seeded.SubjectB
            && x.GetProperty("state").GetInt32() == 5
            && x.GetProperty("canApply").GetBoolean());

        var created = await teacher.PostAsJsonAsync("/api/v1/teacher-applications", new
        {
            subjectId = seeded.SubjectB,
            qualificationTopicId = seeded.TopicB,
            city = "Riyadh",
            experienceYears = 4,
            degree = "BSc"
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var original = await db.TeacherSubjectQualifications.SingleAsync(x =>
            x.TeacherId == seeded.TeacherId && x.SubjectId == seeded.SubjectA);
        Assert.True(original.IsActive);
        Assert.Equal(1, await db.TeacherApplications.CountAsync(x =>
            x.TeacherId == seeded.TeacherId && x.SubjectId == seeded.SubjectB
            && x.Status == TeacherApplicationStatus.Draft));
    }

    [Fact]
    public async Task Same_subject_duplicate_non_terminal_application_is_rejected()
    {
        var seeded = await SeedApprovedTeacherWithSecondSubjectAsync();
        using var teacher = await ClientForAsync(seeded.Email);
        var first = await teacher.PostAsJsonAsync("/api/v1/teacher-applications", new
        {
            subjectId = seeded.SubjectB,
            qualificationTopicId = seeded.TopicB,
            city = "Riyadh",
            experienceYears = 4,
            degree = "BSc"
        });
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var duplicate = await teacher.PostAsJsonAsync("/api/v1/teacher-applications", new
        {
            subjectId = seeded.SubjectB,
            qualificationTopicId = seeded.TopicB,
            city = "Riyadh",
            experienceYears = 4,
            degree = "BSc"
        });
        Assert.True(duplicate.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Conflict);
        Assert.Equal("duplicate_teacher_application", await CodeAsync(duplicate));
    }

    [Fact]
    public async Task Already_qualified_subject_is_excluded_from_create()
    {
        var seeded = await SeedApprovedTeacherWithSecondSubjectAsync();
        using var teacher = await ClientForAsync(seeded.Email);
        var response = await teacher.PostAsJsonAsync("/api/v1/teacher-applications", new
        {
            subjectId = seeded.SubjectA,
            qualificationTopicId = seeded.TopicA,
            city = "Riyadh",
            experienceYears = 4,
            degree = "BSc"
        });
        Assert.True(response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Conflict);
        Assert.Equal("duplicate_teacher_application", await CodeAsync(response));
    }

    [Fact]
    public async Task Rejection_of_second_subject_does_not_revoke_first_subject()
    {
        var seeded = await SeedApprovedTeacherWithSecondSubjectAsync();
        using var teacher = await ClientForAsync(seeded.Email);
        var created = await teacher.PostAsJsonAsync("/api/v1/teacher-applications", new
        {
            subjectId = seeded.SubjectB,
            qualificationTopicId = seeded.TopicB,
            city = "Riyadh",
            experienceYears = 4,
            degree = "BSc"
        });
        var application = await created.Content.ReadFromJsonAsync<JsonElement>();
        var applicationId = application.GetProperty("id").GetGuid();
        SetVersion(teacher, application.GetProperty("version").GetString()!);

        using var demo = DemoContent();
        Assert.Equal(HttpStatusCode.OK,
            (await teacher.PostAsync($"/api/v1/teacher-applications/{applicationId}/demo", demo)).StatusCode);
        SetVersion(teacher, await LatestVersion(teacher, "/api/v1/teacher-applications/mine", applicationId));
        Assert.Equal(HttpStatusCode.NoContent,
            (await teacher.PostAsync($"/api/v1/teacher-applications/{applicationId}/submit", null)).StatusCode);

        using var reviewer = await ClientForAsync(seeded.ReviewerEmail);
        SetVersion(reviewer, await LatestVersion(reviewer, "/api/v1/teacher-applications/queue", applicationId));
        Assert.Equal(HttpStatusCode.NoContent,
            (await reviewer.PostAsJsonAsync($"/api/v1/teacher-applications/{applicationId}/start-review",
                new { priority = (int)ApplicationPriority.Medium })).StatusCode);
        SetVersion(reviewer, await LatestVersion(reviewer, "/api/v1/teacher-applications/queue", applicationId));
        var scores = Enum.GetValues<EvaluationCriterion>().Select(x => new { criterion = (int)x, score = 2 });
        Assert.Equal(HttpStatusCode.NoContent,
            (await reviewer.PostAsJsonAsync($"/api/v1/teacher-applications/{applicationId}/decision",
                new { decision = (int)ReviewDecision.Reject, scores, comment = "Needs clearer explanation.", internalNotes = "Reject B" })).StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var first = await db.TeacherSubjectQualifications.SingleAsync(x =>
            x.TeacherId == seeded.TeacherId && x.SubjectId == seeded.SubjectA);
        Assert.True(first.IsActive);
        Assert.False(await db.TeacherSubjectQualifications.AnyAsync(x =>
            x.TeacherId == seeded.TeacherId && x.SubjectId == seeded.SubjectB
            && x.Status == TeacherQualificationStatus.Approved && x.RevokedAt == null));
    }

    [Fact]
    public async Task Pending_second_subject_application_does_not_hijack_onboarding_status_from_dashboard()
    {
        // Phase 4 Sprint 0.1, Part 2: proves the exact live scenario the sprint targets —
        // an approved Teacher with a pending different-subject application must still see
        // onboarding-status route to the Dashboard, not back into the qualification/demo flow.
        var seeded = await SeedApprovedTeacherWithSecondSubjectAsync();
        using var teacher = await ClientForAsync(seeded.Email);

        // Statuses below ApprovedButProfileIncomplete (ordinal < 9) mean "not yet approved for
        // any subject" and legitimately route back into the application/demo flow; once a Teacher
        // has an approved qualification, status must never fall back below that line, and nextUrl
        // must always be the Dashboard (never the qualification Apply/Demo page), regardless of a
        // pending different-subject application.
        var before = await teacher.GetFromJsonAsync<JsonElement>("/api/v1/teachers/onboarding-status");
        Assert.True(before.GetProperty("status").GetInt32() >= (int)TeacherOnboardingStatus.ApprovedButProfileIncomplete);
        // The teacher workspace (/teacher/...), never the application at /teach/apply.
        Assert.StartsWith("/teacher/", before.GetProperty("nextUrl").GetString());

        var created = await teacher.PostAsJsonAsync("/api/v1/teacher-applications", new
        {
            subjectId = seeded.SubjectB,
            qualificationTopicId = seeded.TopicB,
            city = "Riyadh",
            experienceYears = 4,
            degree = "BSc"
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var after = await teacher.GetFromJsonAsync<JsonElement>("/api/v1/teachers/onboarding-status");
        Assert.Equal(before.GetProperty("status").GetInt32(), after.GetProperty("status").GetInt32());
        Assert.StartsWith("/teacher/", after.GetProperty("nextUrl").GetString());
        Assert.False(after.GetProperty("nextUrl").GetString()!.Contains("Apply", StringComparison.OrdinalIgnoreCase));
        Assert.False(after.GetProperty("nextUrl").GetString()!.Contains("Demo", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Student_cannot_read_teacher_qualification_cards()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        using var client = await ClientForAsync(student.Email);
        var response = await client.GetAsync("/api/v1/teachers/me/qualifications");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private async Task<Seeded> SeedApprovedTeacherWithSecondSubjectAsync()
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var reviewer = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        var subjectA = await Pass3TestData.SeedCatalogAsync(factory.Services, "A-" + Guid.NewGuid().ToString("N")[..8]);
        var subjectB = await Pass3TestData.SeedCatalogAsync(factory.Services, "B-" + Guid.NewGuid().ToString("N")[..8]);
        var application = await Pass3TestData.SeedApplicationAsync(
            factory.Services, teacher.Id, subjectA.Subject, subjectA.Topic,
            TeacherApplicationStatus.Approved, reviewer.Id);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            if (!await db.TeacherSubjectQualifications.AnyAsync(x =>
                    x.TeacherId == teacher.Id && x.SubjectId == subjectA.Subject.Id))
            {
                db.TeacherSubjectQualifications.Add(new(
                    teacher.Id, subjectA.Subject.Id, application.Id, subjectA.Topic.Id,
                    reviewer.Id, DateTimeOffset.UtcNow));
                await db.SaveChangesAsync();
            }
        }
        return new(teacher.Id, teacher.Email, reviewer.Email,
            subjectA.Subject.Id, subjectA.Topic.Id, subjectB.Subject.Id, subjectB.Topic.Id);
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static void SetVersion(HttpClient client, string version)
    {
        client.DefaultRequestHeaders.Remove("If-Match");
        client.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", version);
    }

    private static async Task<string> LatestVersion(HttpClient client, string path, Guid id)
    {
        var payload = await client.GetFromJsonAsync<JsonElement>(path);
        var items = payload.ValueKind == JsonValueKind.Array
            ? payload.EnumerateArray()
            : payload.GetProperty("items").EnumerateArray();
        return items.Single(x => x.GetProperty("id").GetGuid() == id).GetProperty("version").GetString()!;
    }

    private static MultipartFormDataContent DemoContent()
    {
        var demo = new MultipartFormDataContent();
        var bytes = new byte[] { 0, 0, 0, 12, (byte)'f', (byte)'t', (byte)'y', (byte)'p', (byte)'i', (byte)'s', (byte)'o', (byte)'m' };
        var video = new ByteArrayContent(bytes);
        video.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
        demo.Add(video, "file", "demo.mp4");
        demo.Add(new StringContent("120"), "durationSeconds");
        return demo;
    }

    private static async Task<string> CodeAsync(HttpResponseMessage response)
    {
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        return json.TryGetProperty("code", out var code) ? code.GetString()! : json.GetRawText();
    }

    private sealed record Seeded(
        string TeacherId, string Email, string ReviewerEmail,
        Guid SubjectA, Guid TopicA, Guid SubjectB, Guid TopicB);
}
