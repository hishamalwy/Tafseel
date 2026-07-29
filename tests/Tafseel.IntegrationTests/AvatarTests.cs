using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Tafseel.IntegrationTests;

public sealed class AvatarTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    // 1x1 PNG
    private static readonly byte[] TinyPng = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    [Fact]
    public async Task Default_avatar_asset_is_served()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var response = await client.GetAsync("/app/assets/brand/default-avatar.svg");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("image/svg+xml", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task User_can_upload_replace_and_clear_avatar()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var (userId, token) = await RegisterAndLoginAsync(client, "Student");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/users/{userId}/avatar")).StatusCode);

        using (var form = AvatarForm(TinyPng, "avatar.png", "image/png"))
        {
            var upload = await client.PostAsync("/api/v1/auth/avatar", form);
            Assert.Equal(HttpStatusCode.OK, upload.StatusCode);
            var profile = await upload.Content.ReadFromJsonAsync<JsonElement>();
            Assert.True(profile.GetProperty("hasAvatar").GetBoolean());
        }

        var get = await client.GetAsync($"/api/v1/users/{userId}/avatar");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        Assert.Equal("image/png", get.Content.Headers.ContentType?.MediaType);
        Assert.Equal(TinyPng, await get.Content.ReadAsByteArrayAsync());

        Assert.Equal(HttpStatusCode.OK,
            (await client.DeleteAsync("/api/v1/auth/avatar")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/v1/users/{userId}/avatar")).StatusCode);
    }

    [Fact]
    public async Task Avatar_upload_rejects_invalid_type_and_anonymous_upload()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        using (var anon = AvatarForm(TinyPng, "avatar.png", "image/png"))
            Assert.Equal(HttpStatusCode.Unauthorized,
                (await client.PostAsync("/api/v1/auth/avatar", anon)).StatusCode);

        var (_, token) = await RegisterAndLoginAsync(client, "Teacher");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var gif = AvatarForm([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], "avatar.gif", "image/gif");
        var bad = await client.PostAsync("/api/v1/auth/avatar", gif);
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        var body = await bad.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("invalid_avatar_type", body.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Login_reports_hasAvatar_flag()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = $"avatar-flag-{Guid.NewGuid():N}@example.com";
        (await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "Strong!Password1",
            fullName = "Avatar Student",
            role = "Student"
        })).EnsureSuccessStatusCode();
        await factory.ConfirmLatestEmailAsync(client, email);

        var loginBefore = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "Strong!Password1"
        });
        var before = await loginBefore.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(before.GetProperty("hasAvatar").GetBoolean());
        var token = before.GetProperty("accessToken").GetString()!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using (var form = AvatarForm(TinyPng, "avatar.png", "image/png"))
            (await client.PostAsync("/api/v1/auth/avatar", form)).EnsureSuccessStatusCode();

        client.DefaultRequestHeaders.Authorization = null;
        var loginAfter = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "Strong!Password1"
        });
        var after = await loginAfter.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(after.GetProperty("hasAvatar").GetBoolean());
    }

    private async Task<(string UserId, string Token)> RegisterAndLoginAsync(HttpClient client, string role)
    {
        var email = $"avatar-{role.ToLowerInvariant()}-{Guid.NewGuid():N}@example.com";
        (await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "Strong!Password1",
            fullName = $"Avatar {role}",
            role
        })).EnsureSuccessStatusCode();
        await factory.ConfirmLatestEmailAsync(client, email);
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "Strong!Password1"
        });
        login.EnsureSuccessStatusCode();
        var payload = await login.Content.ReadFromJsonAsync<JsonElement>();
        return (
            payload.GetProperty("userId").GetString()!,
            payload.GetProperty("accessToken").GetString()!);
    }

    private static MultipartFormDataContent AvatarForm(byte[] bytes, string fileName, string contentType)
    {
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        var form = new MultipartFormDataContent();
        form.Add(content, "file", fileName);
        return form;
    }
}
