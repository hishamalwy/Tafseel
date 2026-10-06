using System.Security.Cryptography;
using Tafseel.Application.LiveSessions;

namespace Tafseel.Infrastructure.LiveSessions;

/// <summary>
/// The JaaS private key, from the inline setting or from the file it names. Only the server reads it: it signs
/// each participant's token and is never logged, returned or sent to the browser.
/// </summary>
internal static class JaasSigningKey
{
    public static string Pem(JaasOptions options)
    {
        if (!string.IsNullOrWhiteSpace(options.PrivateKeyPem)) return options.PrivateKeyPem;
        if (string.IsNullOrWhiteSpace(options.PrivateKeyPath)) return "";
        var path = Path.IsPathRooted(options.PrivateKeyPath)
            ? options.PrivateKeyPath
            : Path.Combine(AppContext.BaseDirectory, options.PrivateKeyPath);
        if (File.Exists(path)) return File.ReadAllText(path);
        // A folder holds the key as the JaaS console downloaded it ("Key <date>.pk" beside its ".pub"), so nobody
        // has to rename it on the host. Exactly one private key may be there; two would be a guess.
        if (!Directory.Exists(path)) return "";
        var keys = Directory.EnumerateFiles(path)
            .Where(file => file.EndsWith(".pk", StringComparison.OrdinalIgnoreCase)
                || file.EndsWith(".pem", StringComparison.OrdinalIgnoreCase)
                || file.EndsWith(".key", StringComparison.OrdinalIgnoreCase))
            .Select(File.ReadAllText)
            .Where(text => text.Contains("PRIVATE KEY-----", StringComparison.Ordinal))
            .Take(2)
            .ToArray();
        return keys.Length == 1 ? keys[0] : "";
    }

    /// <summary>True when the configured key is an RSA private key that can sign. Says nothing about which one.</summary>
    public static bool IsUsable(JaasOptions options)
    {
        try
        {
            using var rsa = RSA.Create();
            rsa.ImportFromPem(Pem(options));
            _ = rsa.ExportParameters(true);
            return true;
        }
        catch (Exception error) when (error is ArgumentException or CryptographicException or IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }
}
