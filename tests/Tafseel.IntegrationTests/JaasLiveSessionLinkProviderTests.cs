using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Tafseel.Application.LiveSessions;
using Tafseel.Infrastructure.LiveSessions;

namespace Tafseel.IntegrationTests;

public sealed class JaasLiveSessionLinkProviderTests
{
    [Fact]
    public async Task Issues_signed_room_scoped_tokens_for_student_and_teacher()
    {
        using var key = RSA.Create(2048);
        const string appId = "vpaas-magic-cookie-test";
        var provider = new JaasLiveSessionLinkProvider(Options.Create(new JaasOptions
        {
            AppId = appId,
            KeyId = appId + "/test-key",
            PrivateKeyPem = key.ExportRSAPrivateKeyPem()
        }));
        var bookingId = Guid.NewGuid();
        var from = DateTimeOffset.UtcNow.AddMinutes(-5);
        var until = from.AddHours(1);
        var student = await provider.GetJoinLinkAsync(bookingId, "private-join-key", "student-1",
            "Student", false, from, until, CancellationToken.None);
        var teacher = await provider.GetJoinLinkAsync(bookingId, "private-join-key", "teacher-1",
            "Teacher", true, from, until, CancellationToken.None);

        Assert.Equal(student.RoomName, teacher.RoomName);
        Assert.StartsWith(appId + "/tafseel", student.RoomName);
        Assert.DoesNotContain("private-join-key", student.RoomName);
        Assert.Equal($"https://8x8.vc/{appId}/external_api.js", student.ExternalApiUrl);
        Check(student.Jwt!, "student-1", false);
        Check(teacher.Jwt!, "teacher-1", true);

        void Check(string token, string userId, bool moderator)
        {
            var parts = token.Split('.');
            Assert.Equal(3, parts.Length);
            var bytes = Encoding.UTF8.GetBytes(parts[0] + "." + parts[1]);
            Assert.True(key.VerifyData(bytes, Decode(parts[2]), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
            using var header = JsonDocument.Parse(Decode(parts[0]));
            using var payload = JsonDocument.Parse(Decode(parts[1]));
            Assert.Equal(appId + "/test-key", header.RootElement.GetProperty("kid").GetString());
            Assert.Equal("RS256", header.RootElement.GetProperty("alg").GetString());
            Assert.Equal(appId, payload.RootElement.GetProperty("sub").GetString());
            Assert.Equal(student.RoomName!.Split('/')[1], payload.RootElement.GetProperty("room").GetString());
            Assert.Equal(from.ToUnixTimeSeconds(), payload.RootElement.GetProperty("nbf").GetInt64());
            Assert.Equal(until.ToUnixTimeSeconds(), payload.RootElement.GetProperty("exp").GetInt64());
            var context = payload.RootElement.GetProperty("context");
            Assert.Equal(userId, context.GetProperty("user").GetProperty("id").GetString());
            Assert.Equal(moderator, context.GetProperty("user").GetProperty("moderator").GetBoolean());
            Assert.False(context.GetProperty("features").GetProperty("recording").GetBoolean());
        }
    }

    // The PreProduction/Production key lives in a file outside the published site, not in a settings value.
    [Fact]
    public async Task Signs_with_a_key_read_from_a_protected_file()
    {
        using var key = RSA.Create(2048);
        var path = Path.Combine(Path.GetTempPath(), $"tafseel-jaas-{Guid.NewGuid():N}.pem");
        await File.WriteAllTextAsync(path, key.ExportPkcs8PrivateKeyPem());
        try
        {
            const string appId = "vpaas-magic-cookie-test";
            var options = new JaasOptions { AppId = appId, KeyId = appId + "/file-key", PrivateKeyPath = path };
            Assert.True(JaasSigningKey.IsUsable(options));
            var link = await new JaasLiveSessionLinkProvider(Options.Create(options)).GetJoinLinkAsync(Guid.NewGuid(),
                "join-key", "student-1", "Student", false, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddHours(1), CancellationToken.None);
            var parts = link.Jwt!.Split('.');
            Assert.True(key.VerifyData(Encoding.UTF8.GetBytes(parts[0] + "." + parts[1]), Decode(parts[2]),
                HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
            Assert.DoesNotContain("PRIVATE", link.Jwt);

            Assert.False(JaasSigningKey.IsUsable(new JaasOptions { AppId = appId, KeyId = options.KeyId, PrivateKeyPath = path + ".missing" }));
        }
        finally
        {
            File.Delete(path);
        }
    }

    // The host keeps the key exactly as the JaaS console downloads it: "Key <date>.pk" beside "Key <date>.pub".
    [Fact]
    public void A_key_folder_yields_its_single_private_key_and_refuses_ambiguity()
    {
        var folder = Directory.CreateTempSubdirectory("tafseel-jaas-").FullName;
        try
        {
            using var key = RSA.Create(2048);
            File.WriteAllText(Path.Combine(folder, "Key 10_1_2026, 12_31_43 PM.pk"), key.ExportPkcs8PrivateKeyPem());
            File.WriteAllText(Path.Combine(folder, "Key 10_1_2026, 12_31_43 PM.pub"), key.ExportSubjectPublicKeyInfoPem());
            var options = new JaasOptions { AppId = "vpaas-magic-cookie-test", KeyId = "vpaas-magic-cookie-test/k", PrivateKeyPath = folder };
            Assert.True(JaasSigningKey.IsUsable(options));

            using var second = RSA.Create(2048);
            File.WriteAllText(Path.Combine(folder, "other.pem"), second.ExportPkcs8PrivateKeyPem());
            Assert.False(JaasSigningKey.IsUsable(options));
        }
        finally
        {
            Directory.Delete(folder, recursive: true);
        }
    }

    [Fact]
    public async Task Sandbox_static_jwt_is_returned_for_every_participant()
    {
        const string appId = "vpaas-magic-cookie-test";
        const string token = "header.payload.signature";
        var provider = new JaasLiveSessionLinkProvider(Options.Create(new JaasOptions
        {
            AppId = appId,
            StaticJwt = token
        }));
        var link = await provider.GetJoinLinkAsync(Guid.NewGuid(), "private-join-key", "student-1",
            "Student", false, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddHours(1), CancellationToken.None);

        Assert.Equal(token, link.Jwt);
        Assert.StartsWith(appId + "/tafseel", link.RoomName);
        Assert.Equal($"https://8x8.vc/{appId}/external_api.js", link.ExternalApiUrl);
    }

    private static byte[] Decode(string value) => Convert.FromBase64String(
        value.Replace('-', '+').Replace('_', '/').PadRight((value.Length + 3) / 4 * 4, '='));
}
