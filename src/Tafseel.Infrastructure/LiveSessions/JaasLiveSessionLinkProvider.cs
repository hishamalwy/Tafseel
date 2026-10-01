using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Tafseel.Application.LiveSessions;

namespace Tafseel.Infrastructure.LiveSessions;

internal sealed class JaasLiveSessionLinkProvider(IOptions<JaasOptions> options) : ILiveSessionLinkProvider
{
    private readonly JaasOptions _options = options.Value;
    private readonly Lazy<string> _privateKeyPem = new(() => JaasSigningKey.Pem(options.Value));

    public Task<LiveSessionJoinLink> GetJoinLinkAsync(Guid bookingId, string joinKey, string userId,
        string displayName, bool isTeacher, DateTimeOffset validFrom, DateTimeOffset validUntil, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var room = $"tafseel{bookingId:N}{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(joinKey)))[..16].ToLowerInvariant()}";
        var roomName = $"{_options.AppId}/{room}";
        if (!string.IsNullOrWhiteSpace(_options.StaticJwt))
            return Task.FromResult(new LiveSessionJoinLink(
                $"https://8x8.vc/{roomName}", roomName, _options.StaticJwt,
                $"https://8x8.vc/{_options.AppId}/external_api.js"));
        var header = Encode(new { alg = "RS256", kid = _options.KeyId, typ = "JWT" });
        var payload = Encode(new
        {
            aud = "jitsi",
            iss = "chat",
            sub = _options.AppId,
            room,
            nbf = validFrom.ToUnixTimeSeconds(),
            exp = validUntil.ToUnixTimeSeconds(),
            context = new
            {
                user = new { id = userId, name = displayName, moderator = isTeacher },
                features = new Dictionary<string, bool>
                {
                    ["recording"] = false,
                    ["livestreaming"] = false,
                    ["transcription"] = false,
                    ["outbound-call"] = false,
                    ["sip-outbound-call"] = false,
                    ["file-upload"] = false
                },
                room = new { regex = false }
            }
        });
        var content = $"{header}.{payload}";
        using var rsa = RSA.Create();
        rsa.ImportFromPem(_privateKeyPem.Value);
        var signature = Base64Url(rsa.SignData(Encoding.UTF8.GetBytes(content),
            HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1));
        var token = $"{content}.{signature}";
        return Task.FromResult(new LiveSessionJoinLink(
            $"https://8x8.vc/{roomName}", roomName, token,
            $"https://8x8.vc/{_options.AppId}/external_api.js"));
    }

    private static string Encode(object value) => Base64Url(JsonSerializer.SerializeToUtf8Bytes(value));
    private static string Base64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
