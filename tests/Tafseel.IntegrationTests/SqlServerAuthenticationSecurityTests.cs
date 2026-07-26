using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
[Trait("Category", "Security")]
public sealed class SqlServerAuthenticationSecurityTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Password_reset_revokes_every_old_session_atomically()
    {
        var (email, oldCookie, _) = await RegisterConfirmAndLogin();
        using var client = Client();
        await RequestPasswordReset(client, email);

        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PostAsJsonAsync("/api/v1/auth/reset-password", new
            {
                email,
                token = factory.EmailSender.GetLastToken(email),
                password = "New!StrongPassword2"
            })).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await RefreshWithCookie(oldCookie)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Login(client, email, "Strong!Password1")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await Login(client, email, "New!StrongPassword2")).StatusCode);
    }

    [Fact]
    public async Task Failed_refresh_revocation_rolls_back_password_and_security_stamp()
    {
        var (email, oldCookie, oldStamp) = await RegisterConfirmAndLogin();
        using var client = Client();
        await RequestPasswordReset(client, email);
        factory.Failure.FailNext();

        Assert.Equal(HttpStatusCode.InternalServerError,
            (await client.PostAsJsonAsync("/api/v1/auth/reset-password", new
            {
                email,
                token = factory.EmailSender.GetLastToken(email),
                password = "New!StrongPassword2"
            })).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Login(client, email, "New!StrongPassword2")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await Login(client, email, "Strong!Password1")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await RefreshWithCookie(oldCookie)).StatusCode);
        Assert.Equal(oldStamp, await SecurityStamp(email));
    }

    [Fact]
    public async Task Concurrent_refresh_allows_one_winner_and_contains_the_family()
    {
        var (email, oldCookie, oldStamp) = await RegisterConfirmAndLogin();
        using var barrier = new Barrier(3);
        var first = ConcurrentRefresh(oldCookie, barrier);
        var second = ConcurrentRefresh(oldCookie, barrier);
        barrier.SignalAndWait();
        var responses = await Task.WhenAll(first, second);

        Assert.Equal(1, responses.Count(x => x.StatusCode == HttpStatusCode.OK));
        Assert.Equal(1, responses.Count(x => x.StatusCode == HttpStatusCode.Unauthorized));

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await users.FindByEmailAsync(email);
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            Assert.All(await db.RefreshTokens.Where(x => x.UserId == user!.Id).ToArrayAsync(),
                token => Assert.NotNull(token.RevokedAt));
        }

        var containedStamp = await SecurityStamp(email);
        Assert.NotEqual(oldStamp, containedStamp);
        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshWithCookie(oldCookie)).StatusCode);
        Assert.Equal(containedStamp, await SecurityStamp(email));
    }

    [Fact]
    public async Task Replay_containment_failure_rolls_back_family_and_security_stamp()
    {
        var (email, oldCookie, oldStamp) = await RegisterConfirmAndLogin();
        var rotation = await RefreshWithCookie(oldCookie);
        Assert.Equal(HttpStatusCode.OK, rotation.StatusCode);
        var replacementCookie = Cookie(rotation);
        factory.Failure.FailNext();

        Assert.Equal(HttpStatusCode.InternalServerError,
            (await RefreshWithCookie(oldCookie)).StatusCode);
        Assert.Equal(oldStamp, await SecurityStamp(email));
        Assert.Equal(HttpStatusCode.OK,
            (await RefreshWithCookie(replacementCookie)).StatusCode);
    }

    [Fact]
    public async Task Missing_teacher_role_rolls_back_registration()
    {
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
            var teacher = await roles.FindByNameAsync(Roles.Teacher);
            Assert.True((await roles.DeleteAsync(teacher!)).Succeeded);
        }

        using var client = Client();
        var email = $"role-failure-{Guid.NewGuid():N}@example.com";
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "Strong!Password1",
            fullName = "Role Failure",
            role = Roles.Teacher
        });
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("role_assignment_failed",
            (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());

        await using var verification = factory.Services.CreateAsyncScope();
        var users = verification.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.Null(await users.FindByEmailAsync(email));
    }

    private async Task<(string Email, string Cookie, string SecurityStamp)> RegisterConfirmAndLogin()
    {
        using var client = Client();
        var email = $"sql-auth-{Guid.NewGuid():N}@example.com";
        var registration = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "Strong!Password1",
            fullName = "SQL Authentication",
            role = Roles.Student
        });
        Assert.Equal(HttpStatusCode.Accepted, registration.StatusCode);
        await factory.ConfirmLatestEmailAsync(client, email);
        var login = await Login(client, email, "Strong!Password1");
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        return (email, Cookie(login), await SecurityStamp(email));
    }

    private static async Task RequestPasswordReset(HttpClient client, string email) =>
        Assert.Equal(HttpStatusCode.Accepted,
            (await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email })).StatusCode);

    private async Task<string> SecurityStamp(string email)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        return (await users.FindByEmailAsync(email))!.SecurityStamp!;
    }

    private async Task<HttpResponseMessage> RefreshWithCookie(string cookie)
    {
        using var client = Client(handleCookies: false);
        client.DefaultRequestHeaders.Add("Cookie", cookie);
        return await client.PostAsync("/api/v1/auth/refresh", null);
    }

    private Task<HttpResponseMessage> ConcurrentRefresh(string cookie, Barrier barrier) =>
        Task.Run(async () =>
        {
            using var client = Client(handleCookies: false);
            client.DefaultRequestHeaders.Add("Cookie", cookie);
            barrier.SignalAndWait();
            return await client.PostAsync("/api/v1/auth/refresh", null);
        });

    private static Task<HttpResponseMessage> Login(HttpClient client, string email, string password) =>
        client.PostAsJsonAsync("/api/v1/auth/login", new { email, password });

    private HttpClient Client(bool handleCookies = true) =>
        factory.CreateClient(new()
        {
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = handleCookies
        });

    private static string Cookie(HttpResponseMessage response) =>
        response.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
}
