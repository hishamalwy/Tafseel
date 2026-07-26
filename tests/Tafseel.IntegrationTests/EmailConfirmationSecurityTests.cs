using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Tafseel.Application.Authorization;
using Tafseel.Application.Email;

namespace Tafseel.IntegrationTests;

public sealed class EmailConfirmationSecurityTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    [Theory]
    [InlineData(Roles.Student)]
    [InlineData(Roles.Teacher)]
    public async Task Registration_requires_confirmation_before_tokens_are_issued(string role)
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = $"{role}-{Guid.NewGuid():N}@example.com";

        var registration = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "Strong!Password1",
            fullName = "Confirmation Test",
            role
        });

        Assert.Equal(HttpStatusCode.Accepted, registration.StatusCode);
        Assert.False(registration.Headers.Contains("Set-Cookie"));
        var registrationBody = await registration.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(registrationBody.GetProperty("confirmationRequired").GetBoolean());
        Assert.False(registrationBody.TryGetProperty("accessToken", out _));

        var denied = await Login(client, email);
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        Assert.Equal("email_confirmation_required",
            (await denied.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());

        var token = factory.EmailSender.GetLastToken(email);
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PostAsJsonAsync("/api/v1/auth/confirm-email", new { email, token })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PostAsJsonAsync("/api/v1/auth/confirm-email", new { email, token })).StatusCode);

        var login = await Login(client, email);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        AssertRefreshCookieContract(login);
        var logout = await client.PostAsync("/api/v1/auth/logout", null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        AssertRefreshCookieContract(logout);
    }

    [Fact]
    public async Task Altered_confirmation_token_fails_safely()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = $"altered-{Guid.NewGuid():N}@example.com";
        await Register(client, email);

        var response = await client.PostAsJsonAsync("/api/v1/auth/confirm-email", new
        {
            email,
            token = factory.EmailSender.GetLastToken(email) + "altered"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_confirmation_token",
            (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Confirmation_resend_is_non_enumerating_and_obeys_cooldown()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = $"cooldown-{Guid.NewGuid():N}@example.com";
        await Register(client, email);

        Assert.Equal(HttpStatusCode.Accepted,
            (await client.PostAsJsonAsync("/api/v1/auth/request-email-confirmation", new { email })).StatusCode);
        Assert.Equal(1, factory.EmailSender.Count(email));
        Assert.Equal(HttpStatusCode.Accepted,
            (await client.PostAsJsonAsync("/api/v1/auth/request-email-confirmation",
                new { email = $"missing-{Guid.NewGuid():N}@example.com" })).StatusCode);
    }

    private static Task<HttpResponseMessage> Login(HttpClient client, string email) =>
        client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "Strong!Password1"
        });

    private static async Task Register(HttpClient client, string email)
    {
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "Strong!Password1",
            fullName = "Confirmation Test",
            role = Roles.Student
        });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
    }

    private static void AssertRefreshCookieContract(HttpResponseMessage response)
    {
        var cookie = response.Headers.GetValues("Set-Cookie").Single();
        Assert.StartsWith("__Host-tafseel-refresh=", cookie, StringComparison.Ordinal);
        Assert.Contains("path=/", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("domain=", cookie, StringComparison.OrdinalIgnoreCase);
    }
}

public sealed class ConfirmationRateLimitTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    [Fact]
    public async Task Confirmation_resend_is_rate_limited()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        for (var request = 0; request < 3; request++)
            Assert.Equal(HttpStatusCode.Accepted,
                (await client.PostAsJsonAsync("/api/v1/auth/request-email-confirmation",
                    new { email = $"missing-{request}@example.com" })).StatusCode);

        Assert.Equal(HttpStatusCode.TooManyRequests,
            (await client.PostAsJsonAsync("/api/v1/auth/request-email-confirmation",
                new { email = "missing-final@example.com" })).StatusCode);
    }
}

public sealed class ExpiredConfirmationTokenTests(ExpiredConfirmationTafseelApiFactory factory)
    : IClassFixture<ExpiredConfirmationTafseelApiFactory>
{
    [Fact]
    public async Task Expired_confirmation_token_is_rejected()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = $"expired-{Guid.NewGuid():N}@example.com";
        Assert.Equal(HttpStatusCode.Accepted,
            (await client.PostAsJsonAsync("/api/v1/auth/register", new
            {
                email,
                password = "Strong!Password1",
                fullName = "Expired Token",
                role = Roles.Student
            })).StatusCode);

        var response = await client.PostAsJsonAsync("/api/v1/auth/confirm-email", new
        {
            email,
            token = factory.EmailSender.GetLastToken(email)
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}

public sealed class ExpiredConfirmationTafseelApiFactory : TafseelApiFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureServices(services =>
            services.Configure<DataProtectionTokenProviderOptions>(
                options => options.TokenLifespan = TimeSpan.FromTicks(-1)));
    }
}

public sealed class ConfirmationDeliveryFailureTests(ConfirmationDeliveryFailureFactory factory)
    : IClassFixture<ConfirmationDeliveryFailureFactory>
{
    [Fact]
    public async Task Registration_returns_stable_error_when_confirmation_delivery_fails()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = $"delivery-failure-{Guid.NewGuid():N}@example.com";
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "Strong!Password1",
            fullName = "Delivery Failure",
            role = Roles.Student
        });

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("confirmation_send_failed",
            (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.Accepted,
            (await client.PostAsJsonAsync("/api/v1/auth/request-email-confirmation", new { email })).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted,
            (await client.PostAsJsonAsync("/api/v1/auth/request-email-confirmation",
                new { email = $"missing-{Guid.NewGuid():N}@example.com" })).StatusCode);
    }
}

public sealed class ConfirmationDeliveryFailureFactory : TafseelApiFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IEmailSender>();
            services.AddSingleton<IEmailSender, FailingEmailSender>();
        });
    }

    private sealed class FailingEmailSender : IEmailSender
    {
        public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("Controlled email delivery failure.");
    }
}
