using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Tafseel.IntegrationTests;

/// <summary>
/// The host serves the Angular client and nothing else as its site (J1-01, R-01 to R-03, R-05):
/// the root negotiates a locale, server paths are never swallowed by the client fallback,
/// every address of the retired /app site either redirects to its Angular route or is a 404,
/// and no path answers 500.
/// </summary>
public sealed partial class WebClientRoutingTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    private HttpClient Client(string? acceptLanguage = null)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            BaseAddress = new Uri("https://localhost")
        });
        if (acceptLanguage is not null)
            client.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language", acceptLanguage);
        return client;
    }

    [Theory]
    [InlineData(null, "/", "/ar/")]
    [InlineData("en-GB,en;q=0.9", "/", "/en/")]
    [InlineData("ar-SA", "/", "/ar/")]
    [InlineData("fr-FR", "/", "/ar/")]
    [InlineData("en", "/?utm_source=mail&ref=a%2Bb", "/en/?utm_source=mail&ref=a%2Bb")]
    [InlineData(null, "/teachers?subject=math", "/ar/teachers?subject=math")]
    public async Task A_path_without_a_locale_redirects_once_to_the_negotiated_locale(
        string? acceptLanguage, string path, string location)
    {
        var response = await Client(acceptLanguage).GetAsync(path);

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal(location, response.Headers.Location?.OriginalString);
    }

    [Theory]
    [InlineData("/ar/", "ar")]
    [InlineData("/en/", "en")]
    [InlineData("/ar/orders/3f1c6a52-4b8e-4d7a-9c3e-2a1b0c9d8e7f", "ar")]
    [InlineData("/en/live-sessions/3f1c6a52-4b8e-4d7a-9c3e-2a1b0c9d8e7f", "en")]
    [InlineData("/ar/conversations/3f1c6a52-4b8e-4d7a-9c3e-2a1b0c9d8e7f", "ar")]
    [InlineData("/ar/requests/3f1c6a52-4b8e-4d7a-9c3e-2a1b0c9d8e7f/offers", "ar")]
    [InlineData("/en/disputes/3f1c6a52-4b8e-4d7a-9c3e-2a1b0c9d8e7f", "en")]
    [InlineData("/ar/teacher/reviews/3f1c6a52-4b8e-4d7a-9c3e-2a1b0c9d8e7f", "ar")]
    [InlineData("/en/admin/operations/sessions", "en")]
    [InlineData("/ar/no/such/page", "ar")]
    public async Task A_locale_path_gets_that_locales_client(string path, string locale)
    {
        var response = await Client().GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        var html = await response.Content.ReadAsStringAsync();
        Assert.Contains($"<base href=\"/{locale}/\"", html);
        Assert.Contains("<tf-root", html);
    }

    [Theory]
    [InlineData("/api/v1/does-not-exist")]
    [InlineData("/api")]
    [InlineData("/hubs/does-not-exist")]
    [InlineData("/health/does-not-exist")]
    public async Task Server_paths_are_never_answered_by_the_client(string path)
    {
        var response = await Client("en").GetAsync(path);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Null(response.Headers.Location);
        Assert.NotEqual("text/html", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Health_is_still_served_by_the_host()
    {
        var response = await Client("en").GetAsync("/health/live");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData(null, "/app/Tafseel-Landing.dc.html", "/ar/")]
    [InlineData("en", "/app/Tafseel-About.dc.html", "/en/about")]
    // Values are re-encoded, not dropped: '@' is legal in a query, '+', '/' and '=' in a token stay escaped.
    [InlineData(null, "/app/Tafseel-Auth.dc.html?mode=reset&email=reader%40example.test&token=a%2Bb%2F%3D",
        "/ar/auth?mode=reset&email=reader@example.test&token=a%2Bb%2F%3D")]
    [InlineData(null, "/app/Tafseel-Auth.dc.html?mode=confirm&email=reader%40example.test&token=t",
        "/ar/auth?mode=confirm&email=reader@example.test&token=t")]
    [InlineData(null, "/app/Tafseel-Confirm-Email.dc.html?email=reader%40example.test", "/ar/auth/confirm-email?email=reader@example.test")]
    [InlineData(null, "/app/Tafseel-Browse-Teachers.dc.html", "/ar/teachers")]
    [InlineData(null, "/app/Tafseel-Teacher-Profile.dc.html?id=3f1c6a52-4b8e-4d7a-9c3e-2a1b0c9d8e7f",
        "/ar/teachers/3f1c6a52-4b8e-4d7a-9c3e-2a1b0c9d8e7f")]
    [InlineData(null, "/app/Tafseel-Teacher-Profile.dc.html?id=..%2F..%2Fapi", "/ar/teachers")]
    [InlineData(null, "/app/Tafseel-Policies.dc.html?policy=Privacy", "/ar/policies/privacy")]
    [InlineData(null, "/app/Tafseel-Open-Marketplace.dc.html", "/ar/requests")]
    [InlineData(null, "/app/Tafseel-Request.dc.html?teacherId=t1", "/ar/requests/new?teacherId=t1")]
    [InlineData(null, "/app/Tafseel-Book-Session.dc.html?teacherId=t1", "/ar/sessions/book?teacherId=t1")]
    [InlineData(null, "/app/Tafseel-Payment.dc.html?orderId=o1", "/ar/checkout?orderId=o1")]
    [InlineData(null, "/app/Tafseel-Mock-Checkout.dc.html?ref=mock_1", "/ar/checkout/simulator?ref=mock_1")]
    [InlineData(null, "/app/Tafseel-Teacher-Apply.dc.html?mode=additional&subjectId=s1",
        "/ar/teach/apply?mode=additional&subjectId=s1")]
    [InlineData(null, "/app/Tafseel-Disputes.dc.html", "/ar/disputes")]
    [InlineData(null, "/app/Tafseel-Student-Dashboard.dc.html", "/ar/student/overview")]
    [InlineData(null, "/app/Tafseel-Student-Dashboard.dc.html?section=payments", "/ar/student/payments")]
    [InlineData(null, "/app/Tafseel-Teacher-Dashboard.dc.html", "/ar/teacher/home")]
    [InlineData(null, "/app/Tafseel-Teacher-Dashboard.dc.html?section=samples", "/ar/teacher/qualifications?tab=videos")]
    [InlineData(null, "/app/Tafseel-Quality-Dashboard.dc.html?section=applications&selectedId=a1",
        "/ar/quality/applications?selectedId=a1")]
    [InlineData(null, "/app/Tafseel-Admin-Dashboard.dc.html", "/ar/admin/home")]
    // A link resolved against the client's <base href> keeps the reader's locale.
    [InlineData("ar", "/en/app/Tafseel-Disputes.dc.html", "/en/disputes")]
    [InlineData(null, "/ar/app/Tafseel-Student-Dashboard.dc.html?section=messages", "/ar/messages")]
    public async Task Old_site_addresses_redirect_temporarily_to_their_angular_route(
        string? acceptLanguage, string path, string location)
    {
        var response = await Client(acceptLanguage).GetAsync(path);

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal(location, response.Headers.Location?.OriginalString);
    }

    /// <summary>
    /// The old host answered Chat with a 301 to the student dashboard's messages section, and
    /// browsers keep that. Both the original address and the cached target must reach an inbox
    /// that works for a teacher too, so neither is sent to a student-only screen.
    /// </summary>
    [Theory]
    [InlineData("/app/Tafseel-Chat.dc.html")]
    [InlineData("/app/Tafseel-Student-Dashboard.dc.html?section=messages")]
    public async Task The_cached_chat_redirect_lands_in_the_role_neutral_inbox(string path)
    {
        var client = Client("en");
        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/en/messages", response.Headers.Location?.OriginalString);
        var inbox = await client.GetAsync("/en/messages");
        Assert.Equal(HttpStatusCode.OK, inbox.StatusCode);
    }

    [Theory]
    [InlineData("/app/")]
    [InlineData("/app/Tafseel-Chat.dc.html/extra")]
    [InlineData("/app/Tafseel-Nope.dc.html")]
    [InlineData("/app/Tafseel-Student-Dashboard.html")]
    [InlineData("/app/support.js")]
    [InlineData("/app/js/api.js")]
    [InlineData("/app/js/locales.js")]
    [InlineData("/app/js/vendor/babel.min.js")]
    [InlineData("/app/css/tafseel.css")]
    [InlineData("/app/assets/fonts/thmanyah-sans/thmanyah-sans-regular.woff2")]
    [InlineData("/app/appsettings.json")]
    [InlineData("/app/..%2Fappsettings.json")]
    [InlineData("/app/assets/brand/not-a-kit-file.svg")]
    [InlineData("/app/assets/brand/secret.txt")]
    [InlineData("/en/app/Tafseel-Nope.dc.html")]
    public async Task Anything_else_under_app_is_a_plain_404(string path)
    {
        var response = await Client().GetAsync(path);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    [Theory]
    [InlineData("/app/assets/brand/tafseel-mark-dark.png", "image/png")]
    [InlineData("/app/assets/brand/default-avatar.svg", "image/svg+xml")]
    [InlineData("/favicon.ico", "image/x-icon")]
    public async Task Brand_files_linked_from_delivered_emails_are_still_served(string path, string mediaType)
    {
        var response = await Client().GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(mediaType, response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task The_client_shell_allows_its_inline_script_by_hash_and_never_eval()
    {
        var response = await Client().GetAsync("/en/");
        var html = await response.Content.ReadAsStringAsync();
        var csp = response.Headers.GetValues("Content-Security-Policy").Single();
        var scriptSrc = csp.Split(';').Select(x => x.Trim()).Single(x => x.StartsWith("script-src ", StringComparison.Ordinal));

        Assert.DoesNotContain("unsafe-eval", csp);
        Assert.DoesNotContain("unsafe-inline", scriptSrc);
        var inline = InlineScript().Matches(html).Select(m => m.Groups[1].Value)
            .Where(body => !string.IsNullOrWhiteSpace(body)).ToArray();
        Assert.NotEmpty(inline);
        foreach (var body in inline)
            Assert.Contains($"'sha256-{Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(body)))}'", scriptSrc);
    }

    [GeneratedRegex(@"<script(?![^>]*src=)[^>]*>(.*?)</script>", RegexOptions.Singleline)]
    private static partial Regex InlineScript();
}
