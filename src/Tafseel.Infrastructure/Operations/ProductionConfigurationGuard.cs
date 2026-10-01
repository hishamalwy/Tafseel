using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Tafseel.Infrastructure.Operations;

/// <summary>
/// The settings a Production host must not start with, checked together before it serves anything.
/// <para>
/// The options validators refuse mock providers, local storage and development scanning one at a time. What they
/// let through were values that are real-looking but wrong: <c>AllowedHosts</c> inherited as
/// <c>localhost;127.0.0.1</c> (every request to the real domain answered 400), the <c>*.example</c> and
/// <c>*.invalid</c> placeholders shipped in <c>appsettings.Production.json</c>, LocalDB, a relative key-ring path
/// inside a disposable container, and demo seeding. Each problem is named by its setting, never by its value, so the
/// message is safe to log.
/// </para>
/// </summary>
public static class ProductionConfigurationGuard
{
    private static readonly string[] PlaceholderDomains = ["example.com", "example.org", "example.net"];
    private static readonly string[] PlaceholderSuffixes = [".example", ".invalid", ".test", ".localhost", ".local"];

    public static void EnsureReady(IConfiguration configuration, IHostEnvironment environment)
    {
        if (!environment.IsProduction()) return;
        var problems = Problems(configuration);
        if (problems.Count > 0)
            throw new InvalidOperationException(
                "Production configuration is not ready. Fix these settings before starting:"
                + string.Concat(problems.Select(problem => Environment.NewLine + "- " + problem)));
    }

    public static IReadOnlyList<string> Problems(IConfiguration configuration)
    {
        var problems = new List<string>();

        var allowedHosts = (configuration["AllowedHosts"] ?? "")
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (allowedHosts.Length == 0 || allowedHosts.Any(host => host == "*"))
            problems.Add("AllowedHosts must list the production host names; '*' and an empty value are not allowed.");
        else if (allowedHosts.Any(host => IsLocalOrPlaceholder(host.TrimStart('*', '.'))))
            problems.Add("AllowedHosts must not contain localhost, loopback or placeholder host names.");

        foreach (var origin in configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
            if (origin.Contains('*')
                || !Uri.TryCreate(origin, UriKind.Absolute, out var uri)
                || uri.Scheme != Uri.UriSchemeHttps
                || uri.AbsolutePath != "/"
                || IsLocalOrPlaceholder(uri.Host))
            {
                problems.Add("Cors:AllowedOrigins must hold exact HTTPS origins on real hosts (no '*', no path, no localhost or placeholder).");
                break;
            }

        var from = configuration["Email:From"];
        if (!MailAddress.TryCreate(from, out var sender) || IsLocalOrPlaceholder(sender.Host))
            problems.Add("Email:From must be an address on the verified sending domain, not a placeholder.");

        var appBase = EmailLink(configuration, "Email:AppBaseUrl", problems);
        foreach (var key in new[] { "Email:ConfirmationUrl", "Email:PasswordResetUrl" })
        {
            var link = EmailLink(configuration, key, problems);
            if (link is not null && appBase is not null
                && !string.Equals(link.Host, appBase.Host, StringComparison.OrdinalIgnoreCase))
                problems.Add($"{key} must be on the same host as Email:AppBaseUrl.");
        }
        if (appBase is not null && allowedHosts.Length > 0 && !allowedHosts.Any(host => HostMatches(host, appBase.Host)))
            problems.Add("Email:AppBaseUrl must be on a host listed in AllowedHosts, or every emailed link is refused.");

        var connection = configuration.GetConnectionString("Tafseel") ?? "";
        if (string.IsNullOrWhiteSpace(connection)
            || connection.Contains("(localdb)", StringComparison.OrdinalIgnoreCase)
            || connection.Contains("REPLACE_", StringComparison.Ordinal))
            problems.Add("ConnectionStrings:Tafseel must point at the production SQL Server (not LocalDB, not a placeholder).");

        var keysPath = configuration["DataProtection:KeysPath"] ?? "";
        if (!Path.IsPathRooted(keysPath))
            problems.Add("DataProtection:KeysPath must be an absolute path on durable storage; a relative path is lost when the container is replaced.");

        // Resend issues keys as re_…; anything else is a development, CI or dummy value.
        if (!(configuration["Resend:ApiToken"] ?? "").StartsWith("re_", StringComparison.Ordinal))
            problems.Add("Resend:ApiToken must be a Resend API key.");

        var webhookSecret = configuration["Payments:WebhookSecret"] ?? "";
        if (webhookSecret.Length < 32 || webhookSecret.StartsWith("REPLACE_", StringComparison.Ordinal))
            problems.Add("Payments:WebhookSecret must be the provider's signing secret (at least 32 characters).");

        if (configuration.GetValue<bool>("SeedUsers:Enabled") || configuration.GetValue<bool>("SeedDemoData:Enabled"))
            problems.Add("SeedUsers:Enabled and SeedDemoData:Enabled must be false in Production.");

        return problems;
    }

    private static Uri? EmailLink(IConfiguration configuration, string key, List<string> problems)
    {
        if (Uri.TryCreate(configuration[key], UriKind.Absolute, out var uri)
            && uri.Scheme == Uri.UriSchemeHttps && !IsLocalOrPlaceholder(uri.Host))
            return uri;
        problems.Add($"{key} must be an HTTPS address on the production domain, not a placeholder.");
        return null;
    }

    private static bool HostMatches(string allowed, string host) =>
        allowed.StartsWith("*.", StringComparison.Ordinal)
            ? host.EndsWith(allowed[1..], StringComparison.OrdinalIgnoreCase)
            : string.Equals(allowed, host, StringComparison.OrdinalIgnoreCase);

    private static bool IsLocalOrPlaceholder(string host)
    {
        host = host.Trim().TrimEnd('.').ToLowerInvariant();
        return host.Length == 0
            || host is "localhost" or "127.0.0.1" or "::1" or "[::1]" or "0.0.0.0"
            || host.Contains("replace_", StringComparison.Ordinal)
            || PlaceholderDomains.Any(domain => host == domain || host.EndsWith("." + domain, StringComparison.Ordinal))
            || PlaceholderSuffixes.Any(suffix => host.EndsWith(suffix, StringComparison.Ordinal))
            || host is "example" or "invalid" or "test" or "local";
    }
}
