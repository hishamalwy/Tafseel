using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Resend;
using Tafseel.Infrastructure;
using Tafseel.Infrastructure.Email;
using Tafseel.Infrastructure.Identity;
using Tafseel.Application.Orders;
using Tafseel.Application.LiveSessions;
using Tafseel.Application.Finance;
using Tafseel.Application.Governance;
using Tafseel.Application.Marketplace;

namespace Tafseel.IntegrationTests;

public sealed class ConfigurationValidationTests
{
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

    [Theory]
    [InlineData("Payments:WebhookSecret", "short")]
    [InlineData("Payments:Provider", "Unknown")]
    [InlineData("Payments:AutoReleaseEnabled", "true")]
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

    private static ServiceProvider Provider(
        string changedKey,
        string changedValue,
        string environment = "Development")
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
            ["Payments:AutoReleaseEnabled"] = "false",
            ["Disputes:WindowDays"] = "7"
        };
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
