using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;

namespace Tafseel.IntegrationTests;

// F-SEC-2: a correct password used to reset the failed-attempt counter before the second factor
// was checked, so an attacker holding the password could guess authenticator codes forever.
// F-SEC-6: registration answered 409 for an existing email, telling anyone which emails have
// accounts. Both are covered here.
public sealed class MfaLockoutAndEnumerationTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    private const string Password = "Strong!Password1";

    [Fact]
    public async Task Wrong_authenticator_codes_after_a_right_password_lock_the_account()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = await RefreshCookieFlow.RegisterAndConfirmAsync(factory, client, "mfa-lockout");
        var sharedKey = await EnableMfaAsync(client, email);

        for (var attempt = 1; attempt <= 5; attempt++)
        {
            var wrong = await LoginAsync(client, email, WrongCode(sharedKey));
            Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        }

        // Locked: even the right password with a valid code is refused, and the answer does not
        // reveal that the password was right.
        var locked = await LoginAsync(client, email, Totp.Now(sharedKey));
        Assert.Equal(HttpStatusCode.Unauthorized, locked.StatusCode);
        Assert.Equal("invalid_credentials", await CodeAsync(locked));
    }

    [Fact]
    public async Task A_valid_code_after_a_few_wrong_ones_still_signs_in_and_clears_the_counter()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = await RefreshCookieFlow.RegisterAndConfirmAsync(factory, client, "mfa-recover");
        var sharedKey = await EnableMfaAsync(client, email);

        for (var attempt = 1; attempt <= 3; attempt++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync(client, email, WrongCode(sharedKey))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, email, Totp.Now(sharedKey))).StatusCode);

        // The success reset the counter, so four more mistakes do not lock the account.
        for (var attempt = 1; attempt <= 4; attempt++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await LoginAsync(client, email, WrongCode(sharedKey))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await LoginAsync(client, email, Totp.Now(sharedKey))).StatusCode);
    }

    [Fact]
    public async Task Registering_an_existing_email_answers_exactly_like_a_new_one_and_tells_the_owner()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = await RefreshCookieFlow.RegisterAndConfirmAsync(factory, client, "enumeration");
        var sentBefore = factory.EmailSender.Count(email);

        var fresh = await RegisterAsync(client, $"enumeration-new-{Guid.NewGuid():N}@example.com");
        var existing = await RegisterAsync(client, email);

        Assert.Equal(HttpStatusCode.Accepted, fresh.StatusCode);
        Assert.Equal(fresh.StatusCode, existing.StatusCode);
        Assert.Equal(await fresh.Content.ReadAsStringAsync(), await existing.Content.ReadAsStringAsync());
        Assert.Equal(sentBefore + 1, factory.EmailSender.Count(email));
        Assert.Contains("already", factory.EmailSender.GetLastHtml(email), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Registering_an_unconfirmed_email_again_resends_the_confirmation()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = $"enumeration-unconfirmed-{Guid.NewGuid():N}@example.com";
        Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, email)).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await RegisterAsync(client, email)).StatusCode);

        // The owner can still finish signing up from the latest message.
        await factory.ConfirmLatestEmailAsync(client, email);
        Assert.Equal(HttpStatusCode.OK, (await RefreshCookieFlow.LoginAsync(client, email)).StatusCode);
    }

    [Fact]
    public async Task Weak_password_registration_does_not_reveal_whether_the_email_exists()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var existingEmail = await RefreshCookieFlow.RegisterAndConfirmAsync(factory, client, "weak-enumeration");
        const string weakPassword = "aaaaaaaaaa";

        var fresh = await RegisterAsync(client, $"weak-new-{Guid.NewGuid():N}@example.com", weakPassword);
        var existing = await RegisterAsync(client, existingEmail, weakPassword);

        Assert.Equal(fresh.StatusCode, existing.StatusCode);
        using var freshProblem = JsonDocument.Parse(await fresh.Content.ReadAsStringAsync());
        using var existingProblem = JsonDocument.Parse(await existing.Content.ReadAsStringAsync());
        Assert.Equal(
            freshProblem.RootElement.GetProperty("code").GetString(),
            existingProblem.RootElement.GetProperty("code").GetString());
        Assert.Equal(
            freshProblem.RootElement.GetProperty("errors").GetRawText(),
            existingProblem.RootElement.GetProperty("errors").GetRawText());
    }

    private static Task<HttpResponseMessage> RegisterAsync(HttpClient client, string email, string password = Password) =>
        client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password,
            fullName = "Enumeration Test",
            role = "Student",
            lang = "en"
        });

    private static Task<HttpResponseMessage> LoginAsync(HttpClient client, string email, string code) =>
        client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password, code });

    private static async Task<string?> CodeAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private static async Task<string> EnableMfaAsync(HttpClient client, string email)
    {
        var login = await RefreshCookieFlow.LoginAsync(client, email);
        var token = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString();
        using var setupRequest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/mfa/setup");
        setupRequest.Headers.Authorization = new("Bearer", token);
        var setup = await client.SendAsync(setupRequest);
        Assert.Equal(HttpStatusCode.OK, setup.StatusCode);
        var sharedKey = (await setup.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("sharedKey").GetString()!;

        // Creating the authenticator key rotates the security stamp, so the access token from
        // before it is dead; the client refreshes on the 401, and so does this helper.
        var refresh = await client.PostAsync("/api/v1/auth/refresh", null);
        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
        token = (await refresh.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString();

        using var enableRequest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/mfa/enable")
        {
            Content = JsonContent.Create(new { code = Totp.Now(sharedKey) })
        };
        enableRequest.Headers.Authorization = new("Bearer", token);
        var enable = await client.SendAsync(enableRequest);
        Assert.Equal(HttpStatusCode.OK, enable.StatusCode);
        return sharedKey;
    }

    /// <summary>A six-digit code that matches none of the codes Identity accepts right now.</summary>
    private static string WrongCode(string sharedKey)
    {
        var valid = Totp.Window(sharedKey);
        for (var candidate = 0; ; candidate++)
        {
            var code = candidate.ToString("D6");
            if (!valid.Contains(code)) return code;
        }
    }

    /// <summary>RFC 6238 as ASP.NET Core Identity's authenticator provider computes it (SHA-1, 30 s, 6 digits).</summary>
    private static class Totp
    {
        public static string Now(string sharedKey) => At(sharedKey, Step(DateTimeOffset.UtcNow));

        /// <summary>Identity accepts the current step and the ones either side of it.</summary>
        public static HashSet<string> Window(string sharedKey)
        {
            var step = Step(DateTimeOffset.UtcNow);
            return [At(sharedKey, step - 1), At(sharedKey, step), At(sharedKey, step + 1)];
        }

        private static long Step(DateTimeOffset now) => now.ToUnixTimeSeconds() / 30;

        private static string At(string sharedKey, long step)
        {
            var counter = BitConverter.GetBytes(step);
            if (BitConverter.IsLittleEndian) Array.Reverse(counter);
            var hash = HMACSHA1.HashData(Base32(sharedKey), counter);
            var offset = hash[^1] & 0x0F;
            var binary = ((hash[offset] & 0x7F) << 24) | (hash[offset + 1] << 16)
                | (hash[offset + 2] << 8) | hash[offset + 3];
            return (binary % 1_000_000).ToString("D6");
        }

        private static byte[] Base32(string text)
        {
            const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
            var clean = text.Replace(" ", "").TrimEnd('=').ToUpperInvariant();
            var bytes = new List<byte>();
            int buffer = 0, bits = 0;
            foreach (var c in clean)
            {
                buffer = (buffer << 5) | alphabet.IndexOf(c);
                bits += 5;
                if (bits >= 8)
                {
                    bits -= 8;
                    bytes.Add((byte)(buffer >> bits));
                }
            }
            return bytes.ToArray();
        }
    }
}
