using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Finance;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class Phase10FrontendIntegrationTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    /// <summary>
    /// Retargeted from the retired /app pages (G-13): the site is the Angular client, served per
    /// locale from its build output, and the old runtime's scripts are no longer reachable.
    /// </summary>
    [Fact]
    public async Task Frontend_client_and_assets_are_served_and_nothing_else_is()
    {
        var client = factory.CreateClient(new() { AllowAutoRedirect = false });
        var shell = await client.GetAsync("/ar/");
        shell.EnsureSuccessStatusCode();
        var html = await shell.Content.ReadAsStringAsync();
        Assert.Contains("<base href=\"/ar/\"", html);
        var bundle = System.Text.RegularExpressions.Regex.Match(html, "src=\"(main-[A-Za-z0-9_-]+\\.js)\"").Groups[1].Value;
        Assert.NotEmpty(bundle);
        var script = await client.GetAsync($"/ar/{bundle}");
        script.EnsureSuccessStatusCode();
        Assert.Contains("immutable", script.Headers.CacheControl?.ToString());

        (await client.GetAsync("/assets/fonts/thmanyah-sans/thmanyah-sans-regular.woff2"))
            .EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/app/js/api.js")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/app/assets/fonts/thmanyah-sans/thmanyah-sans-regular.woff2")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/app/appsettings.json")).StatusCode);
        var config = await client.GetAsync("/ar/appsettings.json");
        Assert.DoesNotContain("ConnectionStrings", await config.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Admin_can_list_pending_withdrawals_but_students_cannot()
    {
        var admin = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Admin);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var withdrawal = new WithdrawalRequest(
            teacher.Id, 75, "SAR", "phase10-" + Guid.NewGuid(), factory.Clock.GetUtcNow());
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            db.Add(withdrawal);
            await db.SaveChangesAsync();
        }

        var adminClient = await ClientAsync(admin.Email);
        var response = await adminClient.GetAsync("/api/v1/admin/withdrawals?status=0&pageSize=100");
        response.EnsureSuccessStatusCode();
        var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Contains(payload.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("id").GetGuid() == withdrawal.Id
                 && x.GetProperty("teacherId").GetString() == teacher.Id);

        var studentClient = await ClientAsync(student.Email);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await studentClient.GetAsync("/api/v1/admin/withdrawals")).StatusCode);
    }

    [Fact]
    public async Task Authenticated_user_can_update_only_their_display_name()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var client = await ClientAsync(student.Email);

        var response = await client.PutAsJsonAsync("/api/v1/auth/profile",
            new { fullName = "  Updated Student  " });
        response.EnsureSuccessStatusCode();
        var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

        Assert.Equal("Updated Student", payload.GetProperty("fullName").GetString());
        Assert.Equal(student.Email, payload.GetProperty("email").GetString());
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await factory.CreateClient().PutAsJsonAsync("/api/v1/auth/profile",
                new { fullName = "Intruder" })).StatusCode);
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        var token = await Pass3TestData.LoginAsync(client, email);
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}
