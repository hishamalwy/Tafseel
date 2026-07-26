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
    [Fact]
    public async Task Frontend_pages_and_assets_are_served_only_from_the_allowlist()
    {
        var client = factory.CreateClient();
        var landing = await client.GetAsync("/app/Tafseel-Landing.dc.html");
        landing.EnsureSuccessStatusCode();
        Assert.Contains("js/api.js", await landing.Content.ReadAsStringAsync());

        var api = await client.GetStringAsync("/app/js/api.js");
        Assert.Contains("credentials: 'include'", api);
        Assert.DoesNotContain("localStorage.setItem", api);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/app/js/not-allowed.js")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/app/appsettings.json")).StatusCode);
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

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        var token = await Pass3TestData.LoginAsync(client, email);
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}
