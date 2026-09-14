using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.WebUtilities;

namespace Tafseel.IntegrationTests;

/// <summary>
/// The account emails link to the Angular <c>/auth</c> page, and that page's requests are
/// accepted exactly as the client sends them (J2-02, J2-04). The bodies below are the JSON
/// <c>HttpAccountGateway</c> writes, key for key; they are sent as raw text so a rename on
/// either side cannot be hidden by a serializer.
/// </summary>
public sealed partial class EmailLinkJourneyTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    private const string OldPassword = "Strong!Password1";
    private const string NewPassword = "New!StrongPassword2";

    [Fact]
    public async Task Confirmation_and_reset_emails_link_to_the_auth_page_and_its_reset_body_is_accepted()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = $"reset-link-{Guid.NewGuid():N}@example.com";

        Assert.True((await Post(client, "/api/v1/auth/register",
            $$"""{"email":"{{email}}","password":"{{OldPassword}}","fullName":"Reset Reader","role":"Student","lang":"en","policyVersion":"2026-08-12"}""")).IsSuccessStatusCode);
        var confirm = LinkIn(factory.EmailSender.GetLastHtml(email));
        Assert.Equal("/auth", confirm.AbsolutePath);
        Assert.Equal("confirm", QueryHelpers.ParseQuery(confirm.Query)["mode"]);
        Assert.Equal(email, QueryHelpers.ParseQuery(confirm.Query)["email"]);

        Assert.Equal(HttpStatusCode.NoContent, (await Post(client, "/api/v1/auth/confirm-email",
            $$"""{"email":"{{email}}","token":{{Json(QueryHelpers.ParseQuery(confirm.Query)["token"]!)}}}""")).StatusCode);

        Assert.Equal(HttpStatusCode.Accepted, (await Post(client, "/api/v1/auth/forgot-password",
            $$"""{"email":"{{email}}","lang":"en"}""")).StatusCode);
        var reset = LinkIn(factory.EmailSender.GetLastHtml(email));
        Assert.Equal("/auth", reset.AbsolutePath);
        var query = QueryHelpers.ParseQuery(reset.Query);
        Assert.Equal("reset", query["mode"]);
        var token = query["token"].ToString();

        // The body the client sent before this fix: the token was never spent and the password never changed.
        Assert.Equal(HttpStatusCode.BadRequest, (await Post(client, "/api/v1/auth/reset-password",
            $$"""{"email":"{{email}}","token":{{Json(token)}},"newPassword":"{{NewPassword}}"}""")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await Post(client, "/api/v1/auth/reset-password",
            $$"""{"email":"{{email}}","token":{{Json(token)}},"password":"{{NewPassword}}"}""")).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await Post(client, "/api/v1/auth/login",
            $$"""{"email":"{{email}}","password":"{{NewPassword}}"}""")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(client, "/api/v1/auth/login",
            $$"""{"email":"{{email}}","password":"{{OldPassword}}"}""")).StatusCode);
    }

    private static Task<HttpResponseMessage> Post(HttpClient client, string path, string json) =>
        client.PostAsync(path, new StringContent(json, Encoding.UTF8, "application/json"));

    private static string Json(string value) => System.Text.Json.JsonSerializer.Serialize(value);

    /// <summary>The call-to-action link of an email: the one that carries a token.</summary>
    private static Uri LinkIn(string html)
    {
        var href = Href().Matches(html).Select(m => WebUtility.HtmlDecode(m.Groups[1].Value))
            .Single(url => url.Contains("token=", StringComparison.Ordinal));
        return new Uri(href);
    }

    [GeneratedRegex("href=\"([^\"]+)\"")]
    private static partial Regex Href();
}
