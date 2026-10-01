using System.Reflection;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Tafseel.Api.Controllers;
using Tafseel.Domain.Finance;
using Tafseel.Infrastructure.Operations;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

// Launch readiness 2026-09-30 (L-48, L-46): Production started with values that were real-looking but wrong.
public sealed class ProductionConfigurationGuardTests
{
    private static Dictionary<string, string?> Ready() => new()
    {
        ["AllowedHosts"] = "tafseel.sa;www.tafseel.sa",
        ["Cors:AllowedOrigins:0"] = "https://tafseel.sa",
        ["Email:From"] = "Tafseel <noreply@mail.tafseel.sa>",
        ["Email:AppBaseUrl"] = "https://tafseel.sa",
        ["Email:ConfirmationUrl"] = "https://tafseel.sa/auth",
        ["Email:PasswordResetUrl"] = "https://tafseel.sa/auth",
        ["ConnectionStrings:Tafseel"] = "Server=tcp:db.internal,1433;Database=tafseel;User Id=tafseel_app;Password=from-secret-store",
        ["DataProtection:KeysPath"] = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "tafseel-keys")),
        ["Resend:ApiToken"] = "re_from_secret_store",
        ["Payments:WebhookSecret"] = new string('s', 40)
    };

    private static IReadOnlyList<string> Problems(Dictionary<string, string?> values) =>
        ProductionConfigurationGuard.Problems(new ConfigurationBuilder().AddInMemoryCollection(values).Build());

    [Fact]
    public void A_complete_production_configuration_passes()
    {
        Assert.Empty(Problems(Ready()));
    }

    [Theory]
    [InlineData("AllowedHosts", "localhost;127.0.0.1", "AllowedHosts")]
    [InlineData("AllowedHosts", "*", "AllowedHosts")]
    [InlineData("AllowedHosts", "", "AllowedHosts")]
    [InlineData("Cors:AllowedOrigins:0", "*", "Cors:AllowedOrigins")]
    [InlineData("Cors:AllowedOrigins:0", "http://tafseel.sa", "Cors:AllowedOrigins")]
    [InlineData("Cors:AllowedOrigins:0", "https://app.example.invalid", "Cors:AllowedOrigins")]
    [InlineData("Email:From", "Tafseel <noreply@verified.example>", "Email:From")]
    [InlineData("Email:AppBaseUrl", "https://localhost:7272", "Email:AppBaseUrl")]
    [InlineData("Email:ConfirmationUrl", "https://app.example.invalid/auth", "Email:ConfirmationUrl")]
    [InlineData("Email:PasswordResetUrl", "https://other.tafseel.sa/auth", "Email:PasswordResetUrl")]
    [InlineData("ConnectionStrings:Tafseel", "Server=(localdb)\\mssqllocaldb;Database=Tafseel", "ConnectionStrings:Tafseel")]
    [InlineData("DataProtection:KeysPath", "App_Data/keys", "DataProtection:KeysPath")]
    [InlineData("Resend:ApiToken", "local-dev-dummy-token", "Resend:ApiToken")]
    [InlineData("Payments:WebhookSecret", "short", "Payments:WebhookSecret")]
    [InlineData("SeedUsers:Enabled", "true", "SeedUsers:Enabled")]
    [InlineData("SeedDemoData:Enabled", "true", "SeedDemoData:Enabled")]
    public void Each_placeholder_local_or_demo_value_is_named(string key, string value, string named)
    {
        var values = Ready();
        values[key] = value;
        Assert.Contains(Problems(values), problem => problem.Contains(named, StringComparison.Ordinal));
    }

    [Fact]
    public void Email_links_must_be_on_a_host_the_site_answers()
    {
        var values = Ready();
        values["AllowedHosts"] = "api.tafseel.sa";
        Assert.Contains(Problems(values), problem => problem.Contains("AllowedHosts", StringComparison.Ordinal));
        values["AllowedHosts"] = "*.tafseel.sa;tafseel.sa";
        Assert.Empty(Problems(values));
    }

    [Fact]
    public void The_shipped_production_settings_cannot_start_and_every_gap_is_listed_without_values()
    {
        var api = Path.Combine(RepositoryRoot(), "src", "Tafseel.Api");
        var configuration = new ConfigurationBuilder()
            .AddJsonFile(Path.Combine(api, "appsettings.json"))
            .AddJsonFile(Path.Combine(api, "appsettings.Production.json"))
            .Build();

        var error = Assert.Throws<InvalidOperationException>(
            () => ProductionConfigurationGuard.EnsureReady(configuration, new Host(Environments.Production)));

        foreach (var key in new[] { "AllowedHosts", "Cors:AllowedOrigins", "Email:From", "Email:ConfirmationUrl",
                     "ConnectionStrings:Tafseel", "DataProtection:KeysPath", "Resend:ApiToken", "Payments:WebhookSecret" })
            Assert.Contains(key, error.Message);
        Assert.DoesNotContain("vpaas-magic-cookie", error.Message);
    }

    [Fact]
    public void Other_environments_are_not_held_to_production_values()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>()).Build();
        ProductionConfigurationGuard.EnsureReady(configuration, new Host(Environments.Staging));
        ProductionConfigurationGuard.EnsureReady(configuration, new Host(Environments.Development));
    }

    // L-17: a provider retrying a burst of webhooks must not share the student's 10-per-minute checkout budget.
    [Fact]
    public void Provider_webhooks_have_their_own_rate_limit_policy()
    {
        var webhooks = typeof(PaymentsController).GetMethods()
            .Where(method => method.GetCustomAttributes<Microsoft.AspNetCore.Mvc.HttpPostAttribute>()
                .Any(post => post.Template?.StartsWith("payments/webhooks/", StringComparison.Ordinal) == true))
            .ToArray();
        Assert.Equal(2, webhooks.Length);
        Assert.All(webhooks, method =>
            Assert.Equal("webhook", method.GetCustomAttribute<EnableRateLimitingAttribute>()?.PolicyName));
    }

    // The test-mode strip reads the payment capabilities on every page; under the 10-per-minute payment policy that
    // used up a student's budget before checkout (429 on a real payment).
    [Fact]
    public void The_payment_capabilities_read_spends_no_payment_budget()
    {
        var capabilities = typeof(MockPaymentSimulatorController).GetMethod(nameof(MockPaymentSimulatorController.Capabilities))!;
        Assert.NotNull(capabilities.GetCustomAttribute<Microsoft.AspNetCore.RateLimiting.DisableRateLimitingAttribute>());
    }

    // A multipart form is cut at FormOptions' 128 MiB default whatever RequestSizeLimit allows, so a 3-minute phone
    // video under the promised 250 MB failed before reaching the scanner.
    [Fact]
    public void Every_upload_that_allows_more_than_the_default_form_limit_raises_the_form_limit_too()
    {
        const long defaultFormLimit = 128L * 1024 * 1024;
        var actions = typeof(PaymentsController).Assembly.GetTypes()
            .Where(type => type.IsSubclassOf(typeof(Microsoft.AspNetCore.Mvc.ControllerBase)))
            .SelectMany(type => type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
            .Select(method => (Method: method,
                Body: method.GetCustomAttribute<Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute>(),
                Form: method.GetCustomAttribute<Microsoft.AspNetCore.Mvc.RequestFormLimitsAttribute>()))
            .Where(x => x.Body is not null && BodyLimit(x.Body) > defaultFormLimit)
            .ToArray();
        Assert.NotEmpty(actions);
        Assert.All(actions, x => Assert.True(
            x.Form is not null && x.Form.MultipartBodyLengthLimit >= BodyLimit(x.Body!),
            $"{x.Method.DeclaringType!.Name}.{x.Method.Name} accepts {BodyLimit(x.Body!)} bytes but its form is cut at 128 MiB."));
    }

    private static long BodyLimit(Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute attribute) =>
        (long)typeof(Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute)
            .GetField("_bytes", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(attribute)!;

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "Tafseel.sln")))
                return directory.FullName;
        throw new InvalidOperationException("Could not find Tafseel.sln above the test output directory.");
    }

    private sealed class Host(string environment) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environment;
        public string ApplicationName { get; set; } = "Tafseel.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}

// L-25/L-51: an email that gave up, or money the ledger cannot explain, now shows on /health/ready.
// SQL Server, because that is the query Production runs (SQLite takes an in-memory path).
[Trait("Category", "SqlServer")]
public sealed class OperationalBacklogHealthTests(SqlServerTafseelApiFactory factory) : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task An_open_reconciliation_case_degrades_readiness_without_failing_it()
    {
        using var client = factory.CreateClient();
        Assert.Equal(System.Net.HttpStatusCode.OK, (await client.GetAsync("/health/ready")).StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            Assert.Equal(HealthStatus.Healthy, (await Check(scope.ServiceProvider).CheckHealthAsync(new())).Status);
            db.Add(ReconciliationException.Detect($"test:{Guid.NewGuid():N}", "test", null, null, null, 10m,
                "Test difference", factory.Clock.GetUtcNow()));
            await db.SaveChangesAsync();
        }

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var result = await Check(scope.ServiceProvider).CheckHealthAsync(new());
            Assert.Equal(HealthStatus.Degraded, result.Status);
            Assert.Equal(1, result.Data["openReconciliationCases"]);
        }

        var ready = await client.GetAsync("/health/ready");
        Assert.Equal(System.Net.HttpStatusCode.OK, ready.StatusCode);
        Assert.Equal("Degraded", await ready.Content.ReadAsStringAsync());

        var registrations = factory.Services
            .GetRequiredService<Microsoft.Extensions.Options.IOptions<HealthCheckServiceOptions>>().Value.Registrations;
        Assert.Contains("ready", Assert.Single(registrations, x => x.Name == "operational-backlog").Tags);
    }

    private static OperationalBacklogHealthCheck Check(IServiceProvider services) =>
        ActivatorUtilities.CreateInstance<OperationalBacklogHealthCheck>(services);
}
