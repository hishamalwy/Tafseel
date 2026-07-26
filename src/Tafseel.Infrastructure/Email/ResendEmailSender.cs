using Microsoft.Extensions.Options;
using Resend;
using Tafseel.Application.Email;

namespace Tafseel.Infrastructure.Email;

public sealed class EmailOptions
{
    public const string SectionName = "Email";
    public string From { get; init; } = "Tafseel <onboarding@resend.dev>";
    public string PasswordResetUrl { get; init; } = "http://localhost:5500/Tafseel-Auth.dc.html";
    public string ConfirmationUrl { get; init; } = "http://localhost:5500/Tafseel-Auth.dc.html";
    public string AppBaseUrl { get; init; } = "http://localhost:5500";
}

internal sealed class ResendEmailSender(IResend resend, IOptions<EmailOptions> options) : IEmailSender
{
    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken)
    {
        var message = new EmailMessage
        {
            From = options.Value.From,
            Subject = subject,
            HtmlBody = htmlBody
        };
        message.To.Add(to);
        await resend.EmailSendAsync(message, cancellationToken);
    }
}
