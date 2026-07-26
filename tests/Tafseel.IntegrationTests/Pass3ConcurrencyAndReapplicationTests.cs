using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Authorization;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
[Trait("Category", "Concurrency")]
public sealed class Pass3ConcurrencyAndReapplicationTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Theory]
    [InlineData(TeacherApplicationStatus.Rejected)]
    [InlineData(TeacherApplicationStatus.Withdrawn)]
    public async Task Rejected_and_withdrawn_history_permit_a_new_application(
        TeacherApplicationStatus historicalStatus)
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var reviewer = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        var (subject, topic) = await Pass3TestData.SeedCatalogAsync(factory.Services);
        await Pass3TestData.SeedApplicationAsync(
            factory.Services, teacher.Id, subject, topic, historicalStatus, reviewer.Id);

        using var client = await TeacherClient(teacher.Email);
        var response = await client.PostAsJsonAsync(
            "/api/v1/teacher-applications",
            ApplicationBody(subject.Id, topic.Id));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Active_qualification_blocks_reapplication_even_with_approved_history()
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var reviewer = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        var (subject, topic) = await Pass3TestData.SeedCatalogAsync(factory.Services);
        await Pass3TestData.SeedApplicationAsync(
            factory.Services, teacher.Id, subject, topic, TeacherApplicationStatus.Approved, reviewer.Id);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            db.TeacherSubjectQualifications.Add(new(teacher.Id, subject.Id, DateTimeOffset.UtcNow));
            await db.SaveChangesAsync();
        }

        using var client = await TeacherClient(teacher.Email);
        await AssertProblem(
            await client.PostAsJsonAsync("/api/v1/teacher-applications", ApplicationBody(subject.Id, topic.Id)),
            HttpStatusCode.Conflict,
            "duplicate_teacher_application");
    }

    [Fact]
    public async Task Changes_requested_is_the_same_active_application_not_a_new_application()
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var reviewer = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        var (subject, topic) = await Pass3TestData.SeedCatalogAsync(factory.Services);
        var application = await Pass3TestData.SeedApplicationAsync(
            factory.Services, teacher.Id, subject, topic, TeacherApplicationStatus.ChangesRequested, reviewer.Id);
        using var client = await TeacherClient(teacher.Email);

        await AssertProblem(
            await client.PostAsJsonAsync("/api/v1/teacher-applications", ApplicationBody(subject.Id, topic.Id)),
            HttpStatusCode.Conflict,
            "duplicate_teacher_application");

        client.DefaultRequestHeaders.TryAddWithoutValidation(
            "If-Match", Convert.ToBase64String(application.RowVersion));
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.PutAsJsonAsync(
                $"/api/v1/teacher-applications/{application.Id}",
                ApplicationBody(subject.Id, topic.Id))).StatusCode);
    }

    [Fact]
    public async Task Concurrent_creation_has_one_winner_and_one_stable_conflict()
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var (subject, topic) = await Pass3TestData.SeedCatalogAsync(factory.Services);
        using var firstClient = await TeacherClient(teacher.Email);
        using var secondClient = await TeacherClient(teacher.Email);
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        async Task<HttpResponseMessage> Create(HttpClient client)
        {
            await gate.Task;
            return await client.PostAsJsonAsync(
                "/api/v1/teacher-applications", ApplicationBody(subject.Id, topic.Id));
        }

        var first = Create(firstClient);
        var second = Create(secondClient);
        gate.SetResult();
        var responses = await Task.WhenAll(first, second);

        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Created);
        var conflict = Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(
            "duplicate_teacher_application",
            (await conflict.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Concurrent_review_decisions_use_rowversion_and_leave_one_auditable_result()
    {
        var reviewer = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var (subject, topic) = await Pass3TestData.SeedCatalogAsync(factory.Services);
        var application = await Pass3TestData.SeedApplicationAsync(
            factory.Services, teacher.Id, subject, topic, TeacherApplicationStatus.UnderReview, reviewer.Id);
        using var firstClient = await ReviewerClient(reviewer.Email);
        using var secondClient = await ReviewerClient(reviewer.Email);
        var version = Convert.ToBase64String(application.RowVersion);
        var body = new
        {
            decision = (int)ReviewDecision.Approve,
            scores = Enum.GetValues<EvaluationCriterion>().Select(x => new { criterion = (int)x, score = 4 }),
            comment = (string?)null,
            internalNotes = "Private reviewer note"
        };
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        async Task<HttpResponseMessage> Decide(HttpClient client)
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                $"/api/v1/teacher-applications/{application.Id}/decision")
            {
                Content = JsonContent.Create(body)
            };
            request.Headers.TryAddWithoutValidation("If-Match", version);
            await gate.Task;
            return await client.SendAsync(request);
        }

        var first = Decide(firstClient);
        var second = Decide(secondClient);
        gate.SetResult();
        var responses = await Task.WhenAll(first, second);
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.NoContent);
        var stale = Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(
            "concurrency_conflict",
            (await stale.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());

        var queueJson = await firstClient.GetStringAsync("/api/v1/teacher-applications/queue");
        Assert.DoesNotContain("internalNotes", queueJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Private reviewer note", queueJson, StringComparison.Ordinal);
        var queue = JsonSerializer.Deserialize<JsonElement[]>(queueJson)!;
        var latestVersion = queue.Single(x => x.GetProperty("id").GetGuid() == application.Id)
            .GetProperty("version").GetString()!;
        firstClient.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", latestVersion);
        await AssertProblem(
            await firstClient.PostAsJsonAsync(
                $"/api/v1/teacher-applications/{application.Id}/decision", body),
            HttpStatusCode.Conflict,
            "invalid_application_transition");

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var persisted = await db.TeacherApplications
            .Include(x => x.History)
            .Include(x => x.Reviews)
            .SingleAsync(x => x.Id == application.Id);
        Assert.Single(persisted.Reviews);
        Assert.Equal(4, persisted.History.Count);
        Assert.Equal(TeacherApplicationStatus.Approved, persisted.Status);
        Assert.Equal(1, await db.TeacherSubjectQualifications.CountAsync(
            x => x.TeacherId == teacher.Id && x.SubjectId == subject.Id));
    }

    private async Task<HttpClient> TeacherClient(string email)
    {
        var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private async Task<HttpClient> ReviewerClient(string email)
    {
        var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static object ApplicationBody(Guid subjectId, Guid qualificationTopicId) => new
    {
        subjectId,
        qualificationTopicId,
        city = "Cairo",
        experienceYears = 5,
        degree = "BSc"
    };

    private static async Task AssertProblem(
        HttpResponseMessage response,
        HttpStatusCode status,
        string code)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal(
            code,
            (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }
}
