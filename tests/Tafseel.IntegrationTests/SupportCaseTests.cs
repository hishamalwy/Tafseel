using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Governance;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>PRODUCT-P1: help and abuse intake outside paid purchases, owned by Admins at launch.</summary>
[Trait("Category", "SqlServer")]
public sealed class SupportCaseTests(SqlServerTafseelApiFactory factory) : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task A_report_is_announced_taken_answered_and_resolved_and_nobody_else_can_read_it()
    {
        var reporter = await SignedInAsync(Roles.Student);
        var admin = await SignedInAsync(Roles.Admin);
        var outsider = await SignedInAsync(Roles.Teacher);

        var created = await reporter.Client.PostAsJsonAsync("/api/v1/support/cases", new
        {
            category = (int)SupportCaseCategory.Harassment,
            description = "A teacher keeps messaging me after I declined their offer.",
            relatedReference = "conversation:1234"
        });
        created.EnsureSuccessStatusCode();
        var item = await JsonAsync(created);
        var id = item.GetProperty("id").GetGuid();
        Assert.StartsWith("TFS-H-", item.GetProperty("reference").GetString());
        Assert.Equal((int)SupportCaseStatus.Open, item.GetProperty("status").GetInt32());

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            Assert.True(await db.Notifications.AnyAsync(n => n.UserId == admin.Id && n.Link!.Contains(id.ToString())));
        }

        // Only the reporter and staff read the case; everyone else is told it does not exist.
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.Client.GetAsync($"/api/v1/support/cases/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await reporter.Client.GetAsync("/api/v1/admin/support/cases")).StatusCode);

        var queue = await JsonAsync(await admin.Client.GetAsync("/api/v1/admin/support/cases"));
        Assert.Contains(queue.GetProperty("items").EnumerateArray(), x => x.GetProperty("id").GetGuid() == id);

        var taken = await SendAsync(admin.Client, $"/api/v1/admin/support/cases/{id}/take", new { }, item.GetProperty("version").GetString()!);
        taken.EnsureSuccessStatusCode();
        var afterTake = await JsonAsync(taken);
        Assert.Equal((int)SupportCaseStatus.InProgress, afterTake.GetProperty("status").GetInt32());

        var replied = await SendAsync(admin.Client, $"/api/v1/support/cases/{id}/messages",
            new { body = "Thank you. We have warned the teacher. Please tell us if it happens again." },
            afterTake.GetProperty("version").GetString()!);
        replied.EnsureSuccessStatusCode();
        var reporterView = await JsonAsync(await reporter.Client.GetAsync($"/api/v1/support/cases/{id}"));
        var staffMessage = reporterView.GetProperty("messages").EnumerateArray().Single();
        Assert.True(staffMessage.GetProperty("fromStaff").GetBoolean());
        // A reporter reads "Tafseel team", never the staff member's name.
        Assert.Equal(JsonValueKind.Null, staffMessage.GetProperty("authorName").ValueKind);

        var answered = await SendAsync(reporter.Client, $"/api/v1/support/cases/{id}/messages",
            new { body = "Thank you, it stopped." }, reporterView.GetProperty("version").GetString()!);
        answered.EnsureSuccessStatusCode();

        var tooShort = await SendAsync(admin.Client, $"/api/v1/admin/support/cases/{id}/resolve", new { outcome = "done" },
            (await JsonAsync(answered)).GetProperty("version").GetString()!);
        Assert.Equal(HttpStatusCode.BadRequest, tooShort.StatusCode);
        var resolved = await SendAsync(admin.Client, $"/api/v1/admin/support/cases/{id}/resolve",
            new { outcome = "The teacher was warned and the conversation is closed." },
            (await JsonAsync(answered)).GetProperty("version").GetString()!);
        resolved.EnsureSuccessStatusCode();
        Assert.Equal((int)SupportCaseStatus.Resolved, (await JsonAsync(resolved)).GetProperty("status").GetInt32());

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            Assert.True(await db.Notifications.AnyAsync(n => n.UserId == reporter.Id && n.Title == "Your report was resolved"));
            Assert.True(await db.AuditLogEntries.AnyAsync(a => a.Action == "SupportCaseResolved" && a.EntityId == id.ToString()));
        }
    }

    [Fact]
    public async Task Someone_who_cannot_sign_in_reports_an_account_problem_and_staff_never_handle_their_own_report()
    {
        using var anonymous = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var receipt = await anonymous.PostAsJsonAsync("/api/v1/support/account-access", new
        {
            email = "locked-out@example.com",
            fullName = "Locked Out",
            description = "The reset e-mail never arrives."
        });
        receipt.EnsureSuccessStatusCode();
        var reference = (await JsonAsync(receipt)).GetProperty("reference").GetString()!;
        Assert.StartsWith("TFS-H-", reference);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/v1/support/cases/mine")).StatusCode);

        var admin = await SignedInAsync(Roles.Admin);
        var queue = await JsonAsync(await admin.Client.GetAsync($"/api/v1/admin/support/cases?query={reference}"));
        var row = queue.GetProperty("items").EnumerateArray().Single();
        Assert.True(row.GetProperty("fromSignedOutReporter").GetBoolean());
        var detail = await JsonAsync(await admin.Client.GetAsync($"/api/v1/support/cases/{row.GetProperty("id").GetGuid()}"));
        Assert.Equal("locked-out@example.com", detail.GetProperty("contactEmail").GetString());

        // An Admin who reports something cannot take or resolve their own report.
        var created = await admin.Client.PostAsJsonAsync("/api/v1/support/cases", new
        {
            category = (int)SupportCaseCategory.PlatformProblem,
            description = "The bell does not clear for me.",
            relatedReference = (string?)null
        });
        created.EnsureSuccessStatusCode();
        var own = await JsonAsync(created);
        var take = await SendAsync(admin.Client, $"/api/v1/admin/support/cases/{own.GetProperty("id").GetGuid()}/take", new { },
            own.GetProperty("version").GetString()!);
        Assert.Equal(HttpStatusCode.BadRequest, take.StatusCode);
        Assert.Contains("support_self_handling_forbidden", await take.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_screenshot_is_scanned_before_it_joins_the_report()
    {
        var reporter = await SignedInAsync(Roles.Teacher);
        var created = await reporter.Client.PostAsJsonAsync("/api/v1/support/cases", new
        {
            category = (int)SupportCaseCategory.UnsafeContent,
            description = "A student sent an offensive image.",
            relatedReference = (string?)null
        });
        var item = await JsonAsync(created);
        var id = item.GetProperty("id").GetGuid();
        var png = Convert.FromBase64String(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

        var infected = await UploadAsync(reporter.Client, id, png.Concat(Encoding.ASCII.GetBytes(
            @"X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")).ToArray(), item.GetProperty("version").GetString()!);
        Assert.Equal(HttpStatusCode.BadRequest, infected.StatusCode);
        Assert.Contains("file_rejected_malware", await infected.Content.ReadAsStringAsync());

        var clean = await UploadAsync(reporter.Client, id, png, item.GetProperty("version").GetString()!);
        clean.EnsureSuccessStatusCode();
        var attachment = (await JsonAsync(clean)).GetProperty("attachments").EnumerateArray().Single();
        var content = await reporter.Client.GetAsync($"/api/v1/support/attachments/{attachment.GetProperty("id").GetGuid()}/content");
        Assert.Equal(HttpStatusCode.OK, content.StatusCode);
        var stranger = await SignedInAsync(Roles.Student);
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.Client.GetAsync($"/api/v1/support/attachments/{attachment.GetProperty("id").GetGuid()}/content")).StatusCode);
    }

    private static async Task<HttpResponseMessage> UploadAsync(HttpClient client, Guid id, byte[] bytes, string version)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        var form = new MultipartFormDataContent { { file, "file", "screenshot.png" } };
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/support/cases/{id}/attachments") { Content = form };
        request.Headers.TryAddWithoutValidation("If-Match", version);
        return await client.SendAsync(request);
    }

    private sealed record Actor(string Id, HttpClient Client);

    private async Task<Actor> SignedInAsync(string role)
    {
        var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var email = $"support-{role.ToLowerInvariant()}-{Guid.NewGuid():N}@example.com";
        string id;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = new ApplicationUser { UserName = email, Email = email, EmailConfirmed = true, FullName = $"Support {role}" };
            Assert.True((await users.CreateAsync(user, "Strong!Password1")).Succeeded);
            Assert.True((await users.AddToRoleAsync(user, role)).Succeeded);
            id = user.Id;
        }
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = "Strong!Password1" });
        login.EnsureSuccessStatusCode();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString());
        return new(id, client);
    }

    private static async Task<HttpResponseMessage> SendAsync(HttpClient client, string url, object body, string version)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonContent.Create(body) };
        request.Headers.TryAddWithoutValidation("If-Match", version);
        return await client.SendAsync(request);
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
}
