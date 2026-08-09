using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Tafseel.Application.Ai;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class Release9AiAssistedMarketplaceTests(AiTafseelApiFactory factory)
    : IClassFixture<AiTafseelApiFactory>
{
    [Fact]
    public async Task Ai_endpoints_require_a_student()
    {
        var response = await factory.CreateClient().PostAsJsonAsync(
            "/api/v1/ai/discovery", new { input = "Find calculus help" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Ai_filters_resolve_canonically_and_normal_search_keeps_hidden_teacher_out()
    {
        factory.Provider.DiscoveryStatus = AiProviderStatus.Success;
        var fixture = await SeedMarketplaceAsync();
        factory.Provider.Discovery = new(
            "find_teacher", fixture.SubjectName, "async_request", fixture.ServiceName,
            fixture.LanguageName, fixture.LevelName, 150, false, []);
        var client = await StudentClientAsync();

        var result = await (await client.PostAsJsonAsync(
            "/api/v1/ai/discovery", new { input = "I need calculus help under 150 SAR" }))
            .Content.ReadFromJsonAsync<AiDiscoveryResult>();

        Assert.NotNull(result);
        Assert.Equal(AiAssistantStatuses.Success, result.Status);
        Assert.Equal(fixture.SubjectId, result.Filters!.SubjectId);
        Assert.Equal(fixture.ServiceId, result.Filters.ServiceCatalogItemId);
        Assert.Equal(fixture.LanguageId, result.Filters.LanguageId);
        Assert.Equal(fixture.LevelId, result.Filters.EducationLevelId);
        Assert.Equal(150, result.Filters.MaximumPrice);

        var page = await client.GetFromJsonAsync<TeacherPage>(
            $"/api/v1/teachers?subjectId={result.Filters.SubjectId}&serviceTypeId={result.Filters.ServiceCatalogItemId}&maximumPrice={result.Filters.MaximumPrice}&languageIds={result.Filters.LanguageId}&educationLevelId={result.Filters.EducationLevelId}&sort=name");
        Assert.NotNull(page);
        Assert.Equal([fixture.VisibleTeacherId], page.Items.Select(x => x.TeacherId));
        Assert.DoesNotContain(page.Items, x => x.TeacherId == fixture.HiddenTeacherId);
    }

    [Fact]
    public async Task Primary_arabic_intent_maps_math_live_and_thursday_without_clarification()
    {
        factory.Provider.DiscoveryStatus = AiProviderStatus.Success;
        var catalog = await SeedMathematicsLiveAsync();
        factory.Provider.Discovery = new(
            "book_live_session", "رياضيات", "live_session", "live session",
            null, null, null, false, [], "الخميس", null, "التكامل");
        var expectedThursday = DiscoveryCalendar.ResolveUpcoming(
            "الخميس", null, factory.Clock.GetUtcNow(), TimeZoneInfo.Utc);
        var client = await StudentClientAsync();

        var result = await (await client.PostAsJsonAsync("/api/v1/ai/discovery", new
        {
            input = "عندي امتحان رياضيات الخميس ومحتاج live session في التكامل",
            viewerTimeZoneId = "UTC"
        })).Content.ReadFromJsonAsync<AiDiscoveryResult>();

        Assert.Equal(AiAssistantStatuses.Success, result!.Status);
        Assert.False(result.NeedsClarification);
        Assert.Empty(result.ClarificationQuestions);
        Assert.Equal(catalog.SubjectId, result.Filters!.SubjectId);
        Assert.Equal(catalog.LiveServiceId, result.Filters.ServiceCatalogItemId);
        Assert.Equal(expectedThursday, result.Filters.AvailableOn);
    }

    [Fact]
    public async Task English_and_mixed_calculus_live_thursday_intents_resolve_without_clarification()
    {
        factory.Provider.DiscoveryStatus = AiProviderStatus.Success;
        var catalog = await SeedMathematicsLiveAsync();
        var client = await StudentClientAsync();
        var expectedThursday = DiscoveryCalendar.ResolveUpcoming(
            "Thursday", null, factory.Clock.GetUtcNow(), TimeZoneInfo.Utc);

        factory.Provider.Discovery = new(
            "book_live_session", "calculus", "live_session", "live session",
            null, null, null, false, [], "Thursday", null, null);
        var english = await (await client.PostAsJsonAsync("/api/v1/ai/discovery", new
        {
            input = "Need a calculus live session Thursday",
            viewerTimeZoneId = "UTC"
        })).Content.ReadFromJsonAsync<AiDiscoveryResult>();
        Assert.Equal(AiAssistantStatuses.Success, english!.Status);
        Assert.False(english.NeedsClarification);
        Assert.Equal(catalog.SubjectId, english.Filters!.SubjectId);
        Assert.Equal(catalog.LiveServiceId, english.Filters.ServiceCatalogItemId);
        Assert.Equal(expectedThursday, english.Filters.AvailableOn);

        factory.Provider.Discovery = new(
            "book_live_session", "calculus", "live_session", "live session",
            null, null, null, false, [], "الخميس", null, null);
        var mixed = await (await client.PostAsJsonAsync("/api/v1/ai/discovery", new
        {
            input = "محتاج live session يوم الخميس في calculus",
            viewerTimeZoneId = "UTC"
        })).Content.ReadFromJsonAsync<AiDiscoveryResult>();
        Assert.Equal(AiAssistantStatuses.Success, mixed!.Status);
        Assert.False(mixed.NeedsClarification);
        Assert.Equal(catalog.SubjectId, mixed.Filters!.SubjectId);
        Assert.Equal(catalog.LiveServiceId, mixed.Filters.ServiceCatalogItemId);
        Assert.Equal(expectedThursday, mixed.Filters.AvailableOn);
    }

    [Fact]
    public async Task Thursday_without_subject_asks_one_or_two_clarifications()
    {
        factory.Provider.DiscoveryStatus = AiProviderStatus.Success;
        factory.Provider.Discovery = new(
            "find_teacher", null, "unknown", null, null, null, null, false, [], "الخميس", null, null);
        var client = await StudentClientAsync();
        var result = await (await client.PostAsJsonAsync("/api/v1/ai/discovery", new
        {
            input = "محتاج مدرس الخميس",
            viewerTimeZoneId = "UTC"
        })).Content.ReadFromJsonAsync<AiDiscoveryResult>();
        Assert.Equal(AiAssistantStatuses.NeedsClarification, result!.Status);
        Assert.InRange(result.ClarificationQuestions.Count, 1, 2);
    }

    [Fact]
    public async Task Calculus_resolves_to_mathematics_without_clarification()
    {
        factory.Provider.DiscoveryStatus = AiProviderStatus.Success;
        var catalog = await SeedMathematicsLiveAsync();
        factory.Provider.Discovery = new(
            "find_teacher", "calculus", "unknown", null, null, null, null, false, []);
        var client = await StudentClientAsync();
        var result = await (await client.PostAsJsonAsync("/api/v1/ai/discovery",
            new { input = "calculus" })).Content.ReadFromJsonAsync<AiDiscoveryResult>();
        Assert.Equal(AiAssistantStatuses.Success, result!.Status);
        Assert.False(result.NeedsClarification);
        Assert.Equal(catalog.SubjectId, result.Filters!.SubjectId);
        Assert.Null(result.Filters.ServiceCatalogItemId);
    }

    [Fact]
    public async Task Unknown_subject_is_not_created_and_requires_clarification()
    {
        factory.Provider.DiscoveryStatus = AiProviderStatus.Success;
        var before = await SubjectCountAsync();
        factory.Provider.Discovery = new(
            "find_teacher", "Invented Quantum Basketweaving", "unknown", null,
            null, null, null, false, []);
        var client = await StudentClientAsync();

        var result = await (await client.PostAsJsonAsync(
            "/api/v1/ai/discovery", new { input = "Find Invented Quantum Basketweaving" }))
            .Content.ReadFromJsonAsync<AiDiscoveryResult>();

        Assert.NotNull(result);
        Assert.Equal(AiAssistantStatuses.NeedsClarification, result.Status);
        Assert.True(result.NeedsClarification);
        Assert.Null(result.Filters!.SubjectId);
        Assert.Equal(before, await SubjectCountAsync());
    }

    [Fact]
    public async Task Provider_failure_returns_safe_fallback_without_breaking_browse()
    {
        await SeedMarketplaceAsync();
        factory.Provider.DiscoveryStatus = AiProviderStatus.RateLimited;
        var client = await StudentClientAsync();
        var result = await (await client.PostAsJsonAsync(
            "/api/v1/ai/discovery", new { input = "Find math help" }))
            .Content.ReadFromJsonAsync<AiDiscoveryResult>();
        Assert.Equal(AiAssistantStatuses.Unavailable, result!.Status);
        Assert.DoesNotContain("Groq", result.Message, StringComparison.OrdinalIgnoreCase);

        var browse = await client.GetAsync("/api/v1/teachers?page=1&pageSize=9&sort=name");
        Assert.Equal(HttpStatusCode.OK, browse.StatusCode);
        factory.Provider.DiscoveryStatus = AiProviderStatus.Success;
    }

    [Fact]
    public async Task Request_assistant_returns_editable_draft_and_never_submits()
    {
        factory.Provider.RequestDraft = new(
            "Integration by parts review", "Understand integration by parts", ["Integration by parts"],
            "Prepare for the exam", "Thursday", ["Which chapter?"],
            "My exam is Thursday and I need help understanding integration by parts.");
        var before = await LearningRequestCountAsync();
        var client = await StudentClientAsync();
        var result = await (await client.PostAsJsonAsync(
            "/api/v1/ai/request-assistant", new { notes = "I need integration by parts help. My exam is Thursday." }))
            .Content.ReadFromJsonAsync<AiRequestAssistantResult>();

        Assert.Equal(AiAssistantStatuses.Success, result!.Status);
        Assert.Equal("Thursday", result.Draft!.DeadlineMentioned);
        Assert.Equal(before, await LearningRequestCountAsync());
    }

    [Fact]
    public async Task Unsupported_policy_help_is_refused_without_calling_the_model()
    {
        factory.Provider.HelpCalls = 0;
        var client = await StudentClientAsync();
        var result = await (await client.PostAsJsonAsync(
            "/api/v1/ai/product-help", new { question = "What is the exact refund policy?" }))
            .Content.ReadFromJsonAsync<AiProductHelpResult>();

        Assert.Equal(AiAssistantStatuses.Unsupported, result!.Status);
        Assert.Equal(0, factory.Provider.HelpCalls);
    }

    [Fact]
    public async Task Product_help_uses_only_the_bounded_approved_context()
    {
        factory.Provider.Help = new("A live session is scheduled; a recorded explanation is asynchronous.", true);
        var client = await StudentClientAsync();
        var result = await (await client.PostAsJsonAsync(
            "/api/v1/ai/product-help", new { question = "What is the difference between live and recorded help?" }))
            .Content.ReadFromJsonAsync<AiProductHelpResult>();

        Assert.Equal(AiAssistantStatuses.Success, result!.Status);
        Assert.Equal(1, factory.Provider.HelpCalls);
        Assert.DoesNotContain("refund", factory.Provider.LastApprovedContext!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Ai_input_is_bounded_before_provider_use_and_no_generic_proxy_exists()
    {
        factory.Provider.DiscoveryCalls = 0;
        var client = await StudentClientAsync();
        var oversized = await client.PostAsJsonAsync(
            "/api/v1/ai/discovery", new { input = new string('x', 2001) });
        Assert.Equal(HttpStatusCode.BadRequest, oversized.StatusCode);
        Assert.Equal(0, factory.Provider.DiscoveryCalls);

        var proxy = await client.PostAsJsonAsync("/api/v1/ai/completions", new { input = "hello" });
        Assert.Equal(HttpStatusCode.NotFound, proxy.StatusCode);
    }

    [Fact]
    public async Task Ai_rate_limit_is_separate_and_bounded_per_student()
    {
        factory.Provider.DiscoveryStatus = AiProviderStatus.Success;
        var client = await StudentClientAsync();
        HttpResponseMessage? response = null;
        for (var index = 0; index < 101; index++)
            response = await client.PostAsJsonAsync(
                "/api/v1/ai/discovery", new { input = "Find math help", clarificationRound = 0 });
        Assert.Equal(HttpStatusCode.TooManyRequests, response!.StatusCode);
    }

    private async Task<HttpClient> StudentClientAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await Pass3TestData.LoginAsync(client, student.Email));
        return client;
    }

    private async Task<int> SubjectCountAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Subjects.CountAsync();
    }

    private async Task<int> LearningRequestCountAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().LearningRequests.CountAsync();
    }

    private async Task<MathLiveCatalog> SeedMathematicsLiveAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var existing = await db.Subjects.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Name == "Mathematics" && x.IsActive);
        var live = await db.ServiceCatalogItems.AsNoTracking()
            .SingleAsync(x => x.Code == "live_session");
        if (existing is not null)
            return new(existing.Id, live.Id);
        var subject = new Subject("Mathematics", "math-unified", "الرياضيات");
        db.Add(subject);
        await db.SaveChangesAsync();
        return new(subject.Id, live.Id);
    }

    private async Task<MarketplaceFixture> SeedMarketplaceAsync()
    {
        var visible = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var hidden = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Calculus " + suffix, "math", "التفاضل " + suffix);
        var service = new ServiceCatalogItem(
            "Recorded explanation " + suffix, "A custom recorded walkthrough.", "ai_recorded_" + suffix,
            "شرح مسجل " + suffix, "شرح مخصص");
        var language = new TeachingLanguage("English " + suffix, suffix[..8]);
        var level = new EducationLevel("University " + suffix);
        db.AddRange(subject, service, language, level);
        foreach (var teacher in new[] { visible, hidden })
        {
            var profile = new TeacherProfile(teacher.Id, DateTimeOffset.UtcNow);
            profile.Update("Calculus teacher", "Detailed professional teacher biography.", "Egypt", "Cairo",
                "Egypt Standard Time", 30, DateTimeOffset.UtcNow);
            profile.Publish(DateTimeOffset.UtcNow);
            db.AddRange(profile,
                new TeacherService(teacher.Id, subject.Id, service.Id, "Recorded calculus help",
                    "A focused explanation.", 120, "SAR", 24, 1, DateTimeOffset.UtcNow),
                new TeacherLanguage(teacher.Id, language.Id),
                new TeacherEducationLevel(teacher.Id, level.Id));
        }
        db.Add(new TeacherSubjectQualification(visible.Id, subject.Id, DateTimeOffset.UtcNow));
        await db.SaveChangesAsync();
        return new(visible.Id, hidden.Id, subject.Id, subject.Name, service.Id, service.Name,
            language.Id, language.Name, level.Id, level.Name);
    }

    private sealed record MathLiveCatalog(Guid SubjectId, Guid LiveServiceId);

    private sealed record MarketplaceFixture(
        string VisibleTeacherId, string HiddenTeacherId,
        Guid SubjectId, string SubjectName, Guid ServiceId, string ServiceName,
        Guid LanguageId, string LanguageName, Guid LevelId, string LevelName);
    private sealed record TeacherItem(string TeacherId);
    private sealed record TeacherPage(IReadOnlyCollection<TeacherItem> Items);
}

public sealed class AiTafseelApiFactory : TafseelApiFactory
{
    private readonly string _connectionString = SqlServerTestDatabase.ConnectionString("Release9Ai");
    private int _disposed;
    public FakeAiProvider Provider { get; } = new();

    protected override void ConfigureDatabase(IServiceCollection services)
    {
        RemoveDatabaseRegistration(services);
        services.AddDbContext<TafseelDbContext>(options => options.UseSqlServer(_connectionString));
    }

    protected override void InitializeDatabase(IServiceProvider services) =>
        services.GetRequiredService<TafseelDbContext>().Database.Migrate();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Ai:Enabled", "true");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAiProvider>();
            services.AddSingleton<IAiProvider>(Provider);
        });
    }

    protected override void Dispose(bool disposing)
    {
        if (Interlocked.Exchange(ref _disposed, 1) == 1) return;
        if (disposing)
        {
            using var scope = Services.CreateScope();
            scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Database.EnsureDeleted();
        }
        base.Dispose(disposing);
    }
}

public sealed class FakeAiProvider : IAiProvider
{
    public AiProviderStatus DiscoveryStatus { get; set; } = AiProviderStatus.Success;
    public AiDiscoveryCandidate Discovery { get; set; } = new(
        "needs_clarification", null, "unknown", null, null, null, null, true,
        ["Which subject do you need?"]);
    public AiRequestDraftCandidate RequestDraft { get; set; } = new(
        "Draft", "Goal", [], "Outcome", null, [], "Draft description");
    public AiProductHelpCandidate Help { get; set; } = new("Approved help answer", true);
    public int HelpCalls { get; set; }
    public int DiscoveryCalls { get; set; }
    public string? LastApprovedContext { get; private set; }

    public Task<AiProviderResult<AiDiscoveryCandidate>> InterpretIntentAsync(string input, CancellationToken ct)
    {
        DiscoveryCalls++;
        return Task.FromResult(new AiProviderResult<AiDiscoveryCandidate>(
            DiscoveryStatus, DiscoveryStatus == AiProviderStatus.Success ? Discovery : null));
    }

    public Task<AiProviderResult<AiRequestDraftCandidate>> AssistRequestAsync(string input, CancellationToken ct) =>
        Task.FromResult(new AiProviderResult<AiRequestDraftCandidate>(AiProviderStatus.Success, RequestDraft));

    public Task<AiProviderResult<AiProductHelpCandidate>> AnswerProductHelpAsync(
        string question, string approvedContext, CancellationToken ct)
    {
        HelpCalls++;
        LastApprovedContext = approvedContext;
        return Task.FromResult(new AiProviderResult<AiProductHelpCandidate>(AiProviderStatus.Success, Help));
    }
}
