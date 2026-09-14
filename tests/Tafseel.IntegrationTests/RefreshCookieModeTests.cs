using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Tafseel.Application.Authorization;

namespace Tafseel.IntegrationTests;

// The refresh token lives in one of two cookies. Everywhere by default, and always over
// HTTPS, it is `__Host-tafseel-refresh` (Secure, HttpOnly, SameSite=Strict, Path=/, no Domain).
// A staging host that is still reachable over plain HTTP may enable
// Security:AllowInsecureRefreshCookie, which switches HTTP requests to the non-Secure
// `tafseel-staging-refresh`. Production refuses to start with that setting.
public sealed class SecureRefreshCookieModeTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    [Fact]
    public async Task Https_login_refresh_and_logout_carry_only_the_host_cookie()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = await RefreshCookieFlow.RegisterAndConfirmAsync(factory, client, "https-cookie");

        var login = await RefreshCookieFlow.LoginAsync(client, email);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        RefreshCookieFlow.AssertIssuesHostCookie(login);

        var refresh = await client.PostAsync("/api/v1/auth/refresh", null);
        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
        RefreshCookieFlow.AssertIssuesHostCookie(refresh);

        var logout = await client.PostAsync("/api/v1/auth/logout", null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        var cookie = Assert.Single(RefreshCookieFlow.SetCookies(logout));
        RefreshCookieFlow.AssertHostCookieContract(cookie);
        RefreshCookieFlow.AssertExpired(cookie);
    }
}

public sealed class StagingCompatibilityRefreshCookieTests(StagingCompatibilityApiFactory factory)
    : IClassFixture<StagingCompatibilityApiFactory>
{
    [Fact]
    public async Task Http_staging_mode_uses_only_the_non_secure_staging_cookie()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("http://localhost") });
        var email = await RefreshCookieFlow.RegisterAndConfirmAsync(factory, client, "http-cookie");

        var login = await RefreshCookieFlow.LoginAsync(client, email);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        RefreshCookieFlow.AssertIssuesStagingCookie(login);

        var refresh = await client.PostAsync("/api/v1/auth/refresh", null);
        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
        RefreshCookieFlow.AssertIssuesStagingCookie(refresh);

        var logout = await client.PostAsync("/api/v1/auth/logout", null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        var cookie = Assert.Single(RefreshCookieFlow.SetCookies(logout));
        Assert.StartsWith("tafseel-staging-refresh=", cookie, StringComparison.Ordinal);
        RefreshCookieFlow.AssertExpired(cookie);
    }

    [Fact]
    public async Task Https_on_a_staging_host_issues_the_host_cookie_and_clears_both_names_on_logout()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = await RefreshCookieFlow.RegisterAndConfirmAsync(factory, client, "staging-https-cookie");

        var login = await RefreshCookieFlow.LoginAsync(client, email);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        RefreshCookieFlow.AssertIssuesHostCookie(login);

        var logout = await client.PostAsync("/api/v1/auth/logout", null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        var cookies = RefreshCookieFlow.SetCookies(logout);
        Assert.Equal(2, cookies.Length);
        var host = Assert.Single(cookies, x => x.StartsWith("__Host-tafseel-refresh=", StringComparison.Ordinal));
        RefreshCookieFlow.AssertHostCookieContract(host);
        RefreshCookieFlow.AssertExpired(host);
        RefreshCookieFlow.AssertExpired(
            Assert.Single(cookies, x => x.StartsWith("tafseel-staging-refresh=", StringComparison.Ordinal)));
    }
}

public sealed class StagingCompatibilityApiFactory : TafseelApiFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Security:AllowInsecureRefreshCookie", "true");
        builder.UseSetting("Security:EnforceHttps", "false");
    }
}

internal static class RefreshCookieFlow
{
    private const string Password = "Strong!Password1";

    public static async Task<string> RegisterAndConfirmAsync(TafseelApiFactory factory, HttpClient client, string prefix)
    {
        var email = $"{prefix}-{Guid.NewGuid():N}@example.com";
        var registration = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = Password,
            fullName = "Cookie Mode Test",
            role = Roles.Student
        });
        Assert.Equal(HttpStatusCode.Accepted, registration.StatusCode);
        await factory.ConfirmLatestEmailAsync(client, email);
        return email;
    }

    public static Task<HttpResponseMessage> LoginAsync(HttpClient client, string email) =>
        client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });

    public static string[] SetCookies(HttpResponseMessage response) =>
        response.Headers.TryGetValues("Set-Cookie", out var values) ? values.ToArray() : [];

    public static void AssertIssuesHostCookie(HttpResponseMessage response)
    {
        var cookie = Assert.Single(SetCookies(response));
        AssertHostCookieContract(cookie);
        Assert.DoesNotContain("expires=Thu, 01 Jan 1970", cookie, StringComparison.OrdinalIgnoreCase);
    }

    public static void AssertIssuesStagingCookie(HttpResponseMessage response)
    {
        var cookie = Assert.Single(SetCookies(response));
        Assert.StartsWith("tafseel-staging-refresh=", cookie, StringComparison.Ordinal);
        Assert.Contains("path=/", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("domain=", cookie, StringComparison.OrdinalIgnoreCase);
    }

    public static void AssertHostCookieContract(string cookie)
    {
        Assert.StartsWith("__Host-tafseel-refresh=", cookie, StringComparison.Ordinal);
        Assert.Contains("path=/", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("domain=", cookie, StringComparison.OrdinalIgnoreCase);
    }

    public static void AssertExpired(string cookie) =>
        Assert.Contains("expires=Thu, 01 Jan 1970", cookie, StringComparison.OrdinalIgnoreCase);
}
