using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Tafseel.IntegrationTests;

public sealed class AuthenticationTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    [Fact]
    public async Task Student_can_update_bilingual_name_and_change_password()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = $"profile-{Guid.NewGuid():N}@example.com";
        (await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "Strong!Password1",
            fullName = "اسم الطالب",
            role = "Student"
        })).EnsureSuccessStatusCode();
        await factory.ConfirmLatestEmailAsync(client, email);

        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "Strong!Password1"
        });
        var token = (await login.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("accessToken").GetString();
        client.DefaultRequestHeaders.Authorization = new("Bearer", token);

        var profile = await client.PutAsJsonAsync("/api/v1/auth/profile", new
        {
            fullName = "الاسم الجديد",
            fullNameEnglish = "New Student Name"
        });
        Assert.Equal(HttpStatusCode.OK, profile.StatusCode);
        var current = await profile.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("الاسم الجديد", current.GetProperty("fullName").GetString());
        Assert.Equal("New Student Name", current.GetProperty("fullNameEnglish").GetString());

        var reloaded = await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/me");
        Assert.Equal("الاسم الجديد", reloaded.GetProperty("fullName").GetString());
        Assert.Equal("New Student Name", reloaded.GetProperty("fullNameEnglish").GetString());

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PutAsJsonAsync("/api/v1/auth/profile", new
            {
                fullName = "١٢٣٤",
                fullNameEnglish = "1234"
            })).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PutAsJsonAsync("/api/v1/auth/password", new
            {
                currentPassword = "Wrong!Password1",
                newPassword = "New!StrongPassword2"
            })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PutAsJsonAsync("/api/v1/auth/password", new
            {
                currentPassword = "Strong!Password1",
                newPassword = "New!StrongPassword2"
            })).StatusCode);

        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/v1/auth/login", new
            {
                email,
                password = "Strong!Password1"
            })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/v1/auth/login", new
            {
                email,
                password = "New!StrongPassword2"
            })).StatusCode);
    }

    [Fact]
    public async Task Refresh_rotates_token_and_rejects_replay()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = $"student-{Guid.NewGuid():N}@example.com";
        var registration = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "Strong!Password1",
            fullName = "Test Student",
            role = "Student"
        });
        Assert.Equal(HttpStatusCode.Accepted, registration.StatusCode);
        await factory.ConfirmLatestEmailAsync(client, email);
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "Strong!Password1"
        });
        var oldCookie = login.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        var payload = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new("Bearer", payload.GetProperty("accessToken").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/me")).StatusCode);

        var refresh = await client.PostAsync("/api/v1/auth/refresh", null);
        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);

        using var replayClient = factory.CreateClient(new()
        {
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = false
        });
        replayClient.DefaultRequestHeaders.Add("Cookie", oldCookie);
        var replay = await replayClient.PostAsync("/api/v1/auth/refresh", null);

        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        Assert.Equal("refresh_token_reused",
            (await replay.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Missing_refresh_cookie_returns_stable_correlated_problem()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var response = await client.PostAsync("/api/v1/auth/refresh", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("refresh_token_missing", problem.GetProperty("code").GetString());
        Assert.Equal(response.Headers.GetValues("X-Correlation-ID").Single(),
            problem.GetProperty("correlationId").GetString());
    }

    [Theory]
    [InlineData("Admin")]
    [InlineData("QualityReviewer")]
    public async Task Privileged_roles_cannot_self_register(string role)
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email = $"admin-{Guid.NewGuid():N}@example.com",
            password = "Strong!Password1",
            fullName = "Privileged User",
            role
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Password_reset_email_token_changes_password()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = $"reset-{Guid.NewGuid():N}@example.com";
        (await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "Strong!Password1",
            fullName = "Reset User",
            role = "Student"
        })).EnsureSuccessStatusCode();
        await factory.ConfirmLatestEmailAsync(client, email);

        Assert.Equal(HttpStatusCode.Accepted,
            (await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email })).StatusCode);
        var token = factory.EmailSender.GetLastToken(email);

        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PostAsJsonAsync("/api/v1/auth/reset-password", new
            {
                email,
                token,
                password = "New!StrongPassword2"
            })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/v1/auth/login", new
            {
                email,
                password = "New!StrongPassword2"
            })).StatusCode);
    }
}
