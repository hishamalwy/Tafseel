using System.Text.RegularExpressions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Tafseel.Application.Email;

namespace Tafseel.Infrastructure.Email;

/// <summary>
/// Local-dev email delivery: logs the message and writes HTML under App_Data/dev-outbox
/// so registration/confirmation works without a real Resend token.
/// </summary>
internal sealed class DevelopmentEmailSender(
    IOptions<EmailOptions> options,
    IHostEnvironment environment,
    ILogger<DevelopmentEmailSender> logger) : IEmailSender
{
    private static readonly Regex Href = new(
        @"href\s*=\s*[""'](?<url>[^""']+)[""']",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken)
    {
        var outbox = Path.Combine(environment.ContentRootPath, "App_Data", "dev-outbox");
        Directory.CreateDirectory(outbox);
        var safeTo = string.Concat(to.Select(c => char.IsLetterOrDigit(c) || c is '@' or '.' or '-' or '_' ? c : '_'));
        var path = Path.Combine(outbox, $"{DateTimeOffset.UtcNow:yyyyMMdd-HHmmssfff}-{safeTo}.html");
        await File.WriteAllTextAsync(path, htmlBody, cancellationToken);

        var link = Href.Matches(htmlBody)
            .Select(m => m.Groups["url"].Value)
            .FirstOrDefault(url =>
                url.Contains("mode=confirm", StringComparison.OrdinalIgnoreCase)
                || url.Contains("mode=reset", StringComparison.OrdinalIgnoreCase)
                || url.StartsWith(options.Value.ConfirmationUrl, StringComparison.OrdinalIgnoreCase)
                || url.StartsWith(options.Value.PasswordResetUrl, StringComparison.OrdinalIgnoreCase));

        logger.LogWarning(
            "DEV EMAIL to {To} | {Subject} | saved {Path}{Link}",
            to,
            subject,
            path,
            string.IsNullOrEmpty(link) ? "" : $" | link: {link}");
    }
}
