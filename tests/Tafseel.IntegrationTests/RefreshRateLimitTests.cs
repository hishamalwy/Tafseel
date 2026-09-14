using System.Diagnostics.Metrics;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Api.Middleware;

namespace Tafseel.IntegrationTests;

/// <summary>
/// G-19: refresh has its own rate limit, separate from the sign-in budget. Each class below has
/// its own host, so each starts with fresh limiter windows.
/// </summary>
public sealed class RefreshRateLimitPolicyTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    [Theory]
    [InlineData("Login", "auth")]
    [InlineData("Register", "auth")]
    [InlineData("ForgotPassword", "auth")]
    [InlineData("ResetPassword", "auth")]
    [InlineData("Refresh", RefreshRateLimit.PolicyName)]
    public void Each_auth_action_keeps_its_rate_limit_policy(string action, string policy)
    {
        var endpoint = factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .Single(e => e.Metadata.GetMetadata<ControllerActionDescriptor>() is { ControllerName: "Auth" } descriptor
                && descriptor.ActionName == action);

        Assert.Equal(policy, endpoint.Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName);
    }

    [Fact]
    public void Refresh_allows_sixty_a_minute()
    {
        Assert.Equal(60, RefreshRateLimit.PermitLimitPerMinute);
    }
}

public sealed class RefreshBeyondSignInBudgetTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    /// <summary>
    /// Fifteen page loads in a minute, each refreshing with the rotated cookie: more than the
    /// ten the sign-in policy allows outside Testing, and every one is served.
    /// </summary>
    [Fact]
    public async Task A_signed_in_reader_can_refresh_more_than_ten_times_a_minute()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        await SignInAsync(factory, client);

        string? accessToken = null;
        for (var load = 1; load <= 15; load++)
        {
            var refresh = await client.PostAsync("/api/v1/auth/refresh", null);
            Assert.True(refresh.StatusCode == HttpStatusCode.OK, $"refresh {load} answered {(int)refresh.StatusCode}");
            accessToken = (await refresh.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString();
        }

        client.DefaultRequestHeaders.Authorization = new("Bearer", accessToken);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    internal static async Task SignInAsync(TafseelApiFactory factory, HttpClient client)
    {
        var email = $"refresh-{Guid.NewGuid():N}@example.com";
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/v1/auth/register",
            new { email, password = "Strong!Password1", fullName = "Refresh Reader", role = "Student" })).StatusCode);
        await factory.ConfirmLatestEmailAsync(client, email);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/login",
            new { email, password = "Strong!Password1" })).StatusCode);
    }
}

public sealed class RefreshThrottleTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    [Fact]
    public async Task Refresh_throttles_at_its_own_limit_without_touching_the_cookie_or_sign_in()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        await RefreshBeyondSignInBudgetTests.SignInAsync(factory, client);

        // Sign-in above used two auth-policy requests; none of them spent refresh budget.
        for (var request = 1; request <= RefreshRateLimit.PermitLimitPerMinute; request++)
        {
            var served = await client.PostAsync("/api/v1/auth/refresh", null);
            Assert.True(served.StatusCode == HttpStatusCode.OK, $"refresh {request} answered {(int)served.StatusCode}");
        }

        long throttleCount = 0;
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, l) =>
        {
            if (instrument.Name == "tafseel.auth.refresh.throttled") l.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((_, value, _, _) => Interlocked.Add(ref throttleCount, value));
        listener.Start();

        var throttled = await client.PostAsync("/api/v1/auth/refresh", null);
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
        Assert.True(throttled.Headers.RetryAfter is not null, "429 carries Retry-After");
        // A throttle is not a verdict on the session: the refresh cookie is neither rotated nor cleared.
        Assert.False(throttled.Headers.Contains("Set-Cookie"));
        // Every refresh throttle is counted so the limit can be tuned from production evidence.
        Assert.Equal(1, Interlocked.Read(ref throttleCount));

        // The sign-in policy is a different bucket and still serves.
        var email = $"after-throttle-{Guid.NewGuid():N}@example.com";
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/v1/auth/register",
            new { email, password = "Strong!Password1", fullName = "Other Reader", role = "Student" })).StatusCode);
    }
}

public sealed class SignInThrottleUnchangedTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    /// <summary>
    /// The sign-in policy still throttles at its own budget (100 a minute in the Testing
    /// environment, 10 elsewhere - Program.cs), and refreshing does not reopen it.
    /// </summary>
    [Fact]
    public async Task Sign_in_still_throttles_at_its_existing_limit()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        const int testingSignInLimit = 100;
        for (var attempt = 1; attempt <= testingSignInLimit; attempt++)
        {
            var login = await client.PostAsJsonAsync("/api/v1/auth/login",
                new { email = $"nobody-{attempt}@example.com", password = "Wrong!Password1" });
            Assert.NotEqual(HttpStatusCode.TooManyRequests, login.StatusCode);
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsJsonAsync("/api/v1/auth/login",
            new { email = "nobody-final@example.com", password = "Wrong!Password1" })).StatusCode);
        // Refresh is a separate bucket: exhausted sign-in does not throttle it.
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/v1/auth/refresh", null)).StatusCode);
    }
}
