using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Tafseel.Application.Email;

namespace Tafseel.Infrastructure.Email;

/// <summary>
/// Keeps mail for the seeded demo accounts from leaving the building. Their addresses (admin@gmail.com, …) are
/// real mailboxes that belong to other people, so in Staging and PreProduction a message to one of them is
/// recorded in the log and dropped instead of sent. Everyone else - a tester who registers with their own address -
/// gets real mail. Configured by <c>Email:SuppressedRecipients</c>; empty in Production, which seeds no demo accounts.
/// </summary>
internal sealed class SuppressingEmailSender(
    IEmailSender inner,
    IOptions<EmailOptions> options,
    ILogger<SuppressingEmailSender> logger) : IEmailSender
{
    public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken)
    {
        if (options.Value.SuppressedRecipients.Contains(to.Trim(), StringComparer.OrdinalIgnoreCase))
        {
            logger.LogInformation("Email to a seeded demo account was not sent (suppressed recipient).");
            return Task.CompletedTask;
        }
        return inner.SendAsync(to, subject, htmlBody, cancellationToken);
    }
}
