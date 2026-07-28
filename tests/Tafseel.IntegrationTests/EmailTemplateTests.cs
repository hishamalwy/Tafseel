using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Resend;
using Tafseel.Application.Email;
using Tafseel.Infrastructure.Email;

namespace Tafseel.IntegrationTests;

public sealed class EmailTemplateTests
{
    [Fact]
    public void Template_uses_public_brand_assets_and_escapes_content()
    {
        var html = EmailTemplate.Render(
            "preheader", "kicker", "<heading>", ["body"],
            "https://tafseel.example/app/");

        Assert.Contains("font-family:'Thmanyah Sans'", html);
        Assert.Contains("https://tafseel.example/app/assets/brand/tafseel-mark.png", html);
        Assert.Contains("&lt;heading&gt;", html);
        Assert.DoesNotContain("<heading>", html);
    }

    [Fact]
    public async Task Sender_surfaces_a_rejected_resend_response()
    {
        var services = new ServiceCollection();
        services.AddHttpClient<ResendClient>()
            .ConfigurePrimaryHttpMessageHandler(() => new RejectedEmailHandler());
        services.Configure<ResendClientOptions>(options => options.ApiToken = "test-token");
        services.AddTransient<IResend, ResendClient>();
        await using var provider = services.BuildServiceProvider();
        var sender = new ResendEmailSender(
            provider.GetRequiredService<IResend>(),
            Options.Create(new EmailOptions { From = "Tafseel <sender@example.com>" }));

        await Assert.ThrowsAsync<ResendException>(
            () => sender.SendAsync("student@example.com", "subject", "<p>body</p>", default));
    }

    private sealed class RejectedEmailHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.Forbidden)
            {
                Content = JsonContent.Create(new
                {
                    statusCode = 403,
                    name = "validation_error",
                    message = "Sender domain is not verified."
                })
            });
    }
}
