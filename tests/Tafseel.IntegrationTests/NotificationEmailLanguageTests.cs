using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Tafseel.Application.Messaging;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>
/// UX audit 2026-09-27, UX-26: notification e-mails put an English system title ("Clarification requested")
/// inside Arabic chrome for everybody. The language chosen at sign-up is now kept and the e-mail speaks it.
/// </summary>
[Trait("Category", "SqlServer")]
public sealed class NotificationEmailLanguageTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Notification_email_is_written_in_the_language_the_person_signed_up_in()
    {
        var english = await RegisterAsync("en");
        var arabic = await RegisterAsync("ar");

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();
            foreach (var (id, _) in new[] { english, arabic })
                await notifications.NotifyAsync(id, "ClarificationRequested", "Clarification requested",
                    "Your payment is protected in escrow.", null, "lang-test-" + id, email: true, CancellationToken.None);
        }
        var worker = factory.Services.GetServices<IHostedService>().OfType<NotificationOutboxWorker>().Single();
        await worker.DispatchAsync(CancellationToken.None);

        // The template encodes non-ASCII text as entities; read it as a mail client would.
        var en = WebUtility.HtmlDecode(factory.EmailSender.GetLastHtml(english.Email));
        Assert.Contains("Your teacher has a question", en);
        Assert.Contains("New on Tafseel", en);
        Assert.DoesNotContain("إشعار جديد", en);

        var ar = WebUtility.HtmlDecode(factory.EmailSender.GetLastHtml(arabic.Email));
        Assert.Contains("لدى معلمك سؤال", ar);
        Assert.Contains("تحتفظ تفصيل بمبلغك بأمان", ar);
        Assert.DoesNotContain("Clarification requested", ar);
    }

    [Fact]
    public async Task Switching_the_site_language_switches_the_email_language()
    {
        var (id, email) = await RegisterAsync("en");
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        await factory.ConfirmLatestEmailAsync(client, email);
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = "Strong!Password1" });
        login.EnsureSuccessStatusCode();
        var token = System.Text.Json.JsonDocument.Parse(await login.Content.ReadAsStringAsync()).RootElement.GetProperty("accessToken").GetString();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync("/api/v1/auth/language", new { lang = "ar" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/v1/auth/language", new { lang = "fr" })).StatusCode);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal("ar", await db.UserClaims.Where(x => x.UserId == id && x.ClaimType == UserLanguage.ClaimType)
            .Select(x => x.ClaimValue).SingleAsync());
    }

    private async Task<(string Id, string Email)> RegisterAsync(string lang)
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = $"lang-{lang}-{Guid.NewGuid():N}@example.com";
        (await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            email,
            password = "Strong!Password1",
            fullName = "Language Test",
            role = "Student",
            lang
        })).EnsureSuccessStatusCode();
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var id = await db.Users.Where(x => x.Email == email).Select(x => x.Id).SingleAsync();
        Assert.Equal(lang, await db.UserClaims.Where(x => x.UserId == id && x.ClaimType == UserLanguage.ClaimType)
            .Select(x => x.ClaimValue).SingleAsync());
        return (id, email);
    }
}
