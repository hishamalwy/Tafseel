using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Application.Catalog;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Common;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class Pass3CatalogAndValidationTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Catalog_names_are_normalized_with_global_and_subject_scoped_uniqueness()
    {
        using var client = await AdminClient();
        var firstSubject = await CreateSubject(client, "  Data   Science  ");
        var duplicate = await client.PostAsJsonAsync(
            "/api/v1/admin/subjects", new { name = "data science", icon = "code" });
        await AssertProblem(duplicate, HttpStatusCode.Conflict, "catalog_name_conflict");

        var secondSubject = await CreateSubject(client, $"Engineering {Guid.NewGuid():N}");
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/admin/topics",
                new { subjectId = firstSubject, name = " Algorithms ", difficulty = "Medium" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/admin/topics",
                new { subjectId = secondSubject, name = "algorithms", difficulty = "Medium" })).StatusCode);
        await AssertProblem(
            await client.PostAsJsonAsync("/api/v1/admin/topics",
                new { subjectId = firstSubject, name = "  ALGORITHMS ", difficulty = "Medium" }),
            HttpStatusCode.Conflict,
            "catalog_name_conflict");
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/admin/qualification-topics",
                new { subjectId = firstSubject, name = "Foundations", instructions = "Explain.", maxVideoSeconds = 180 })).StatusCode);
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/admin/qualification-topics",
                new { subjectId = secondSubject, name = " foundations ", instructions = "Explain.", maxVideoSeconds = 180 })).StatusCode);

        var renameTarget = await CreateSubject(client, $"Rename target {Guid.NewGuid():N}");
        await AssertProblem(
            await client.PutAsJsonAsync(
                $"/api/v1/admin/catalog/subjects/{renameTarget}",
                new { name = " DATA  SCIENCE ", detail = "code" }),
            HttpStatusCode.Conflict,
            "catalog_name_conflict");

        var concurrentName = $"Concurrent {Guid.NewGuid():N}";
        var concurrent = await Task.WhenAll(
            client.PostAsJsonAsync("/api/v1/admin/subjects", new { name = concurrentName, icon = "code" }),
            client.PostAsJsonAsync("/api/v1/admin/subjects", new { name = $" {concurrentName.ToUpperInvariant()} ", icon = "code" }));
        Assert.Single(concurrent, response => response.StatusCode == HttpStatusCode.Created);
        Assert.Single(concurrent, response => response.StatusCode == HttpStatusCode.Conflict);

        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/admin/subjects",
                new { name = "اللُّغة العربية", icon = "language" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/admin/subjects",
                new { name = "اللغة العربية", icon = "language" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/admin/subjects",
                new { name = "Résumé", icon = "text" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync("/api/v1/admin/subjects",
                new { name = "Resume", icon = "text" })).StatusCode);
    }

    [Theory]
    [InlineData("education-levels", null, null)]
    [InlineData("languages", "en-pass3", "en-pass3-other")]
    [InlineData("services", "First description", "Second description")]
    public async Task Global_catalogs_reject_normalized_duplicates(
        string route,
        string? firstDetail,
        string? secondDetail)
    {
        using var client = await AdminClient();
        var name = $"Global {Guid.NewGuid():N}";
        object FirstPayload() => route == "services"
            ? new { name = $" {name} ", detail = firstDetail, code = $"svc-{Guid.NewGuid():N}" }
            : new { name = $" {name} ", detail = firstDetail };
        object SecondPayload() => route == "services"
            ? new { name = name.ToUpperInvariant(), detail = secondDetail, code = $"svc-{Guid.NewGuid():N}" }
            : new { name = name.ToUpperInvariant(), detail = secondDetail };
        Assert.Equal(HttpStatusCode.Created,
            (await client.PostAsJsonAsync($"/api/v1/admin/{route}",
                FirstPayload())).StatusCode);
        await AssertProblem(
            await client.PostAsJsonAsync($"/api/v1/admin/{route}",
                SecondPayload()),
            HttpStatusCode.Conflict,
            "catalog_name_conflict");
    }

    [Fact]
    public async Task Inactive_parent_hides_children_without_mutating_them_and_blocks_child_activation()
    {
        var (subject, qualification) = await Pass3TestData.SeedCatalogAsync(factory.Services);
        Topic topic;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            topic = new Topic(subject.Id, $"Topic {Guid.NewGuid():N}", "Medium");
            db.Add(topic);
            await db.SaveChangesAsync();
            var catalog = scope.ServiceProvider.GetRequiredService<ICatalogService>();
            await catalog.SetActiveAsync("subjects", subject.Id, false, default);
        }

        using var publicClient = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var topics = await publicClient.GetFromJsonAsync<JsonElement[]>(
            $"/api/v1/topics?subjectId={subject.Id}");
        var qualificationTopics = await publicClient.GetFromJsonAsync<JsonElement[]>(
            $"/api/v1/topics?subjectId={subject.Id}&qualificationOnly=true");
        Assert.Empty(topics!);
        Assert.Empty(qualificationTopics!);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            Assert.True((await db.Topics.FindAsync(topic.Id))!.IsActive);
            Assert.True((await db.QualificationTopics.FindAsync(qualification.Id))!.IsActive);
            var catalog = scope.ServiceProvider.GetRequiredService<ICatalogService>();
            await catalog.SetActiveAsync("subjects", subject.Id, true, default);
        }

        Assert.Contains(
            (await publicClient.GetFromJsonAsync<JsonElement[]>($"/api/v1/topics?subjectId={subject.Id}"))!,
            x => x.GetProperty("id").GetGuid() == topic.Id);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var catalog = scope.ServiceProvider.GetRequiredService<ICatalogService>();
            await catalog.SetActiveAsync("topics", topic.Id, false, default);
            await catalog.SetActiveAsync("subjects", subject.Id, false, default);
            var activation = await Assert.ThrowsAsync<DomainException>(
                () => catalog.SetActiveAsync("topics", topic.Id, true, default));
            Assert.Equal("subject_not_found", activation.Code);
            var creation = await Assert.ThrowsAsync<DomainException>(
                () => catalog.CreateTopicAsync(new(subject.Id, "Blocked child", "Easy"), default));
            Assert.Equal("subject_not_found", creation.Code);
        }
    }

    [Fact]
    public async Task Submission_rechecks_active_subject_and_topic()
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var (subject, topic) = await Pass3TestData.SeedCatalogAsync(factory.Services);
        var application = await Pass3TestData.SeedApplicationAsync(
            factory.Services, teacher.Id, subject, topic, TeacherApplicationStatus.Draft);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var catalog = scope.ServiceProvider.GetRequiredService<ICatalogService>();
            await catalog.SetActiveAsync("subjects", subject.Id, false, default);
        }

        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Authorization = new(
            "Bearer", await Pass3TestData.LoginAsync(client, teacher.Email));
        client.DefaultRequestHeaders.TryAddWithoutValidation(
            "If-Match", Convert.ToBase64String(application.RowVersion));
        await AssertProblem(
            await client.PostAsync($"/api/v1/teacher-applications/{application.Id}/submit", null),
            HttpStatusCode.NotFound,
            "qualification_topic_not_found");
    }

    [Fact]
    public async Task Invalid_enum_and_rubric_inputs_return_field_level_problem_details()
    {
        var reviewer = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var (subject, topic) = await Pass3TestData.SeedCatalogAsync(factory.Services);
        var application = await Pass3TestData.SeedApplicationAsync(
            factory.Services, teacher.Id, subject, topic, TeacherApplicationStatus.UnderReview, reviewer.Id);

        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Authorization = new(
            "Bearer", await Pass3TestData.LoginAsync(client, reviewer.Email));
        client.DefaultRequestHeaders.TryAddWithoutValidation(
            "If-Match", Convert.ToBase64String(application.RowVersion));
        var invalid = await client.PostAsJsonAsync(
            $"/api/v1/teacher-applications/{application.Id}/decision",
            new
            {
                decision = 99,
                scores = Enum.GetValues<EvaluationCriterion>().Take(8)
                    .Select(x => new { criterion = (int)x, score = 4 }),
                comment = (string?)null,
                internalNotes = new string('x', 4001)
            });

        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        var problem = await invalid.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("validation_failed", problem.GetProperty("code").GetString());
        Assert.True(problem.TryGetProperty("errors", out var errors));
        Assert.Contains(errors.EnumerateObject(), x => x.Name.Contains("Decision", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(errors.EnumerateObject(), x => x.Name.Contains("Scores", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(errors.EnumerateObject(), x => x.Name.Contains("InternalNotes", StringComparison.OrdinalIgnoreCase));
        Assert.True(problem.TryGetProperty("traceId", out _));
        Assert.True(problem.TryGetProperty("correlationId", out _));

        var duplicateCriteria = Enum.GetValues<EvaluationCriterion>().Skip(1)
            .Select(x => new { criterion = (int)x, score = 4 })
            .Append(new { criterion = (int)EvaluationCriterion.InformationAccuracy, score = 4 });
        var duplicate = await client.PostAsJsonAsync(
            $"/api/v1/teacher-applications/{application.Id}/decision",
            new
            {
                decision = (int)ReviewDecision.Approve,
                scores = duplicateCriteria,
                comment = (string?)null,
                internalNotes = (string?)null
            });
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        Assert.Contains(
            (await duplicate.Content.ReadFromJsonAsync<JsonElement>())
                .GetProperty("errors").EnumerateObject(),
            x => x.Name.Contains("Scores", StringComparison.OrdinalIgnoreCase));

        var invalidPriority = await client.PostAsJsonAsync(
            $"/api/v1/teacher-applications/{application.Id}/start-review",
            new { priority = 99 });
        Assert.Equal(
            "validation_failed",
            (await invalidPriority.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());

        var invalidStatus = await client.GetAsync("/api/v1/teacher-applications/queue?status=99");
        Assert.Equal(HttpStatusCode.BadRequest, invalidStatus.StatusCode);
        Assert.Equal(
            "validation_failed",
            (await invalidStatus.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    private async Task<HttpClient> AdminClient()
    {
        var admin = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Admin);
        var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await Pass3TestData.LoginAsync(client, admin.Email));
        return client;
    }

    private static async Task<Guid> CreateSubject(HttpClient client, string name)
    {
        var response = await client.PostAsJsonAsync(
            "/api/v1/admin/subjects", new { name, icon = "code" });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }

    private static async Task AssertProblem(
        HttpResponseMessage response,
        HttpStatusCode status,
        string code)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal(code,
            (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }
}
