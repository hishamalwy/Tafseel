using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Resend;
using Tafseel.Infrastructure;
using Tafseel.Infrastructure.Email;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Ai;
using Tafseel.Application.Orders;
using Tafseel.Application.LiveSessions;
using Tafseel.Application.Finance;
using Tafseel.Application.Governance;
using Tafseel.Application.Marketplace;

namespace Tafseel.IntegrationTests;

public sealed class ConfigurationValidationTests
{
    // Every negative case below changes one key of this baseline and expects validation to
    // fail. That only proves something if the unchanged baseline is valid for each options
    // type, so the baseline is asserted first.
    [Fact]
    public void Baseline_configuration_is_valid_for_every_validated_options_type()
    {
        using var services = Provider("Disputes:WindowDays", "7");
        _ = services.GetRequiredService<IOptions<JwtOptions>>().Value;
        _ = services.GetRequiredService<IOptions<EmailOptions>>().Value;
        _ = services.GetRequiredService<IOptions<ResendClientOptions>>().Value;
        _ = services.GetRequiredService<IOptions<FeeOptions>>().Value;
        _ = services.GetRequiredService<IOptions<LiveSessionOptions>>().Value;
        _ = services.GetRequiredService<IOptions<PaymentOptions>>().Value;
        _ = services.GetRequiredService<IOptions<TeacherShowcaseOptions>>().Value;
        _ = services.GetRequiredService<IOptions<DisputeOptions>>().Value;
        _ = services.GetRequiredService<IOptions<OrderLifecycleOptions>>().Value;
        _ = services.GetRequiredService<IOptions<AiOptions>>().Value;
    }

    [Theory]
    [InlineData("Orders:NonDeliveryGraceHours", "0")]
    [InlineData("Orders:NonDeliveryGraceHours", "721")]
    public void Invalid_order_lifecycle_boundaries_fail_validation(string key, string value)
    {
        using var services = Provider(key, value);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<OrderLifecycleOptions>>().Value);
    }

    [Theory]
    [InlineData("Jwt:Issuer", "")]
    [InlineData("Jwt:Audience", "")]
    [InlineData("Jwt:SigningKey", "short")]
    [InlineData("Jwt:AccessTokenMinutes", "0")]
    [InlineData("Jwt:AccessTokenMinutes", "61")]
    [InlineData("Jwt:RefreshTokenDays", "0")]
    [InlineData("Jwt:RefreshTokenDays", "91")]
    public void Invalid_jwt_boundaries_fail_validation(string key, string value)
    {
        using var services = Provider(key, value);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<JwtOptions>>().Value);
    }

    [Fact]
    public void Production_rejects_development_signing_key()
    {
        using var services = Provider(
            "Jwt:SigningKey", "development-signing-key-that-is-long-enough",
            Environments.Production);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<JwtOptions>>().Value);
    }

    [Theory]
    [InlineData("Email:From", "sender@example.com")]
    [InlineData("Email:ConfirmationUrl", "not-a-url")]
    [InlineData("Email:PasswordResetUrl", "not-a-url")]
    public void Invalid_email_boundaries_fail_validation(string key, string value)
    {
        using var services = Provider(key, value);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<EmailOptions>>().Value);
    }

    [Fact]
    public void Production_requires_https_frontend_urls()
    {
        using var services = Provider(
            "Email:ConfirmationUrl", "http://app.example.com/confirm",
            Environments.Production);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<EmailOptions>>().Value);
    }

    [Theory]
    [InlineData("Staging")]
    [InlineData("Production")]
    public void Non_development_rejects_resend_sandbox_sender(string environment)
    {
        using var services = Provider(
            "Email:From", "Tafseel <onboarding@resend.dev>",
            environment);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<EmailOptions>>().Value);
    }

    [Fact]
    public void Missing_resend_token_fails_validation()
    {
        using var services = Provider("Resend:ApiToken", "");
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<ResendClientOptions>>().Value);
    }

    [Theory]
    [InlineData("Fees:StudentFeePercent", "-1")]
    [InlineData("Fees:StudentFeePercent", "101")]
    [InlineData("Fees:TeacherCommissionPercent", "-1")]
    [InlineData("Fees:TeacherCommissionPercent", "101")]
    [InlineData("Fees:TeacherCommissionPercent", "15.12345")]
    public void Invalid_fee_boundaries_fail_validation(string key, string value)
    {
        using var services = Provider(key, value);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<FeeOptions>>().Value);
    }

    [Theory]
    [InlineData("LiveSessions:EmergencyPremiumPercent", "-1")]
    [InlineData("LiveSessions:CancellationWindowHours", "721")]
    [InlineData("LiveSessions:JoinWindowMinutes", "121")]
    public void Invalid_live_session_boundaries_fail_validation(string key, string value)
    {
        using var services = Provider(key, value);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<LiveSessionOptions>>().Value);
    }

    [Fact]
    public void Production_rejects_mock_live_session_provider()
    {
        using var services = Provider("LiveSessions:Provider", "Mock", Environments.Production);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<LiveSessionOptions>>().Value);
    }

    [Fact]
    public void Jaas_requires_server_signing_credentials()
    {
        using var services = Provider("LiveSessions:Provider", "JaaS", Environments.Production);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<JaasOptions>>().Value);
    }

    // L-50: one pre-signed token is the same identity for every participant and is bound to no room or window.
    [Fact]
    public void Production_jaas_refuses_a_shared_static_token()
    {
        const string token = "eyJhbGciOiJSUzI1NiJ9.eyJyb29tIjoiKiJ9.c2lnbmF0dXJl";
        using var sandbox = Provider("JaaS:StaticJwt", token, Environments.Staging, Jaas);
        Assert.NotNull(sandbox.GetRequiredService<IOptions<JaasOptions>>().Value);

        using var production = Provider("JaaS:StaticJwt", token, Environments.Production, Jaas);
        var error = Assert.Throws<OptionsValidationException>(
            () => production.GetRequiredService<IOptions<JaasOptions>>().Value);
        Assert.Contains("per-participant", error.Message);
    }

    // PreProduction closure: the hosted rehearsal signs per participant like Production; a pasted token expired there.
    [Fact]
    public void PreProduction_jaas_refuses_a_static_token_and_the_sample_key()
    {
        const string token = "eyJhbGciOiJSUzI1NiJ9.eyJyb29tIjoiKiJ9.c2lnbmF0dXJl";
        using var staticToken = Provider("JaaS:StaticJwt", token, "PreProduction", Jaas);
        Assert.Contains("per-participant", Assert.Throws<OptionsValidationException>(
            () => staticToken.GetRequiredService<IOptions<JaasOptions>>().Value).Message);

        using var key = System.Security.Cryptography.RSA.Create(2048);
        var path = Path.Combine(Path.GetTempPath(), $"tafseel-jaas-{Guid.NewGuid():N}.pem");
        File.WriteAllText(path, key.ExportRSAPrivateKeyPem());
        try
        {
            var signed = new Dictionary<string, string?>(Jaas)
            {
                ["JaaS:KeyId"] = "vpaas-magic-cookie-test/own-key",
                ["JaaS:PrivateKeyPath"] = path
            };
            using var own = Provider("JaaS:StaticJwt", "", "PreProduction", signed);
            Assert.NotNull(own.GetRequiredService<IOptions<JaasOptions>>().Value);

            signed["JaaS:KeyId"] = "vpaas-magic-cookie-test/1afb6e-SAMPLE_APP";
            using var sample = Provider("JaaS:StaticJwt", "", "PreProduction", signed);
            Assert.Throws<OptionsValidationException>(() => sample.GetRequiredService<IOptions<JaasOptions>>().Value);

            signed["JaaS:KeyId"] = "vpaas-magic-cookie-test/own-key";
            signed["JaaS:PrivateKeyPath"] = path + ".missing";
            using var missing = Provider("JaaS:StaticJwt", "", "PreProduction", signed);
            Assert.Throws<OptionsValidationException>(() => missing.GetRequiredService<IOptions<JaasOptions>>().Value);
        }
        finally
        {
            File.Delete(path);
        }
    }

    private static readonly Dictionary<string, string?> Jaas = new()
    {
        ["LiveSessions:Provider"] = "JaaS",
        ["JaaS:AppId"] = "vpaas-magic-cookie-test"
    };

    [Theory]
    [InlineData("Payments:WebhookSecret", "short")]
    [InlineData("Payments:Provider", "Unknown")]
    [InlineData("Payments:AutoReleaseAfterHours", "23")]
    [InlineData("Payments:AutoReleaseAfterHours", "721")]
    public void Invalid_payment_configuration_fails_validation(string key, string value)
    {
        using var services = Provider(key, value);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<PaymentOptions>>().Value);
    }

    [Fact]
    public void Production_rejects_mock_payment_provider()
    {
        using var services = Provider("Payments:Provider", "Mock", Environments.Production);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<PaymentOptions>>().Value);
    }

    [Fact]
    public void Production_rejects_mock_payment_simulator()
    {
        using var services = Provider("Payments:Mock:SimulatorEnabled", "true", Environments.Production);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<PaymentOptions>>().Value);
    }

    [Fact]
    public void Production_rejects_enabled_showcases_without_every_media_readiness_gate()
    {
        using var services = Provider("TeacherShowcases:Enabled", "true", Environments.Production);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<TeacherShowcaseOptions>>().Value);
    }

    [Theory]
    [InlineData("Disputes:WindowDays", "0")]
    [InlineData("Disputes:WindowDays", "91")]
    public void Invalid_dispute_window_fails_validation(string key, string value)
    {
        using var services = Provider(key, value);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<DisputeOptions>>().Value);
    }

    [Theory]
    [InlineData("Ai:Provider", "Unknown")]
    [InlineData("Ai:Endpoint", "not-a-url")]
    [InlineData("Ai:TimeoutSeconds", "0")]
    [InlineData("Ai:MaxInputCharacters", "99")]
    [InlineData("Ai:MaxOutputTokens", "49")]
    public void Invalid_ai_configuration_fails_validation(string key, string value)
    {
        using var services = Provider(key, value);
        Assert.Throws<OptionsValidationException>(
            () => services.GetRequiredService<IOptions<AiOptions>>().Value);
    }

    private static ServiceProvider Provider(
        string changedKey,
        string changedValue,
        string environment = "Development",
        IReadOnlyDictionary<string, string?>? alsoChanged = null)
    {
        var values = new Dictionary<string, string?>
        {
            ["ConnectionStrings:Tafseel"] = "Server=(localdb)\\mssqllocaldb;Database=unused",
            ["Jwt:Issuer"] = "Tafseel.Api",
            ["Jwt:Audience"] = "Tafseel.Web",
            ["Jwt:SigningKey"] = "configuration-tests-signing-key-32-bytes",
            ["Jwt:AccessTokenMinutes"] = "15",
            ["Jwt:RefreshTokenDays"] = "30",
            ["Email:From"] = "Tafseel <sender@example.com>",
            ["Email:PasswordResetUrl"] = "https://app.example.com/reset",
            ["Email:ConfirmationUrl"] = "https://app.example.com/confirm",
            ["Resend:ApiToken"] = "configuration-tests-resend-token",
            ["Fees:StudentFeePercent"] = "8",
            ["Fees:TeacherCommissionPercent"] = "15",
            ["LiveSessions:EmergencyPremiumPercent"] = "50",
            ["LiveSessions:Provider"] = "Mock",
            ["LiveSessions:CancellationWindowHours"] = "24",
            ["LiveSessions:JoinWindowMinutes"] = "15",
            ["Payments:Provider"] = "Mock",
            ["Payments:WebhookSecret"] = "configuration-tests-payment-webhook-secret",
            ["Payments:AutoReleaseEnabled"] = "true",
            ["Payments:AutoReleaseAfterHours"] = "72",
            ["Disputes:WindowDays"] = "7",
            ["Orders:NonDeliveryGraceHours"] = "24"
        };
        foreach (var (key, value) in alsoChanged ?? new Dictionary<string, string?>())
            values[key] = value;
        values[changedKey] = changedValue;
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        var collection = new ServiceCollection();
        collection.AddLogging();
        collection.AddInfrastructure(configuration, new TestEnvironment(environment));
        return collection.BuildServiceProvider();
    }

    private sealed class TestEnvironment(string environment) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environment;
        public string ApplicationName { get; set; } = "Tafseel.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
