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
        Assert.Contains("js/locales.js", await landing.Content.ReadAsStringAsync());
        Assert.Contains("js/api.js", await landing.Content.ReadAsStringAsync());

        var locales = await client.GetStringAsync("/app/js/locales.js");
        Assert.Contains("TafseelLocales", locales);
        var api = await client.GetStringAsync("/app/js/api.js");
        Assert.Contains("credentials: 'include'", api);
        Assert.DoesNotContain("localStorage.setItem", api);
        (await client.GetAsync("/app/assets/fonts/thmanyah-sans/thmanyah-sans-regular.woff2"))
            .EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/app/js/not-allowed.js")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/app/assets/fonts/thmanyah-sans/not-allowed.woff2")).StatusCode);
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

    [Fact]
    public async Task Teacher_dashboard_configures_catalog_offerings_without_editing_catalog_identity()
    {
        var client = factory.CreateClient();
        var html = await client.GetStringAsync("/app/Tafseel-Teacher-Dashboard.dc.html");

        // Subject is selected only on first enable; catalog identity is read-only.
        Assert.Contains("svcSubjectId", html);
        Assert.Contains("onSvcSubjectId", html);
        Assert.Contains("serviceCatalogItemId:catalog.id", html);
        Assert.DoesNotContain("svcCatalogId", html);
        Assert.DoesNotContain("svcTitle", html);
        Assert.DoesNotContain("onSvcTitle", html);

        // Teachers configure commercial terms, approaches, and availability only.
        Assert.Contains("svcPrice", html);
        Assert.Contains("onSvcPrice", html);
        Assert.Contains("svcCurrency", html);
        Assert.Contains("svcApproachEn", html);
        Assert.Contains("svcApproachAr", html);
        Assert.Contains("svcAvailable", html);

        // Delivery/duration and revision fields remain wired and localized.
        Assert.Contains("svcDeliveryHours", html);
        Assert.Contains("onSvcDeliveryHours", html);
        Assert.Contains("svcRevisions", html);
        Assert.Contains("onSvcRevisions", html);
        Assert.Contains("Tafseel.t('td_delivery_hours')", html);
        Assert.Contains("Tafseel.t('td_revisions')", html);

        // Save/update action and API payload mapping for both create and edit flows.
        Assert.Contains("confirmServiceModal", html);
        Assert.Contains("Tafseel.api.put('/teachers/me/services/'", html);
        Assert.Contains("Tafseel.api.post('/teachers/me/services'", html);
        Assert.Contains("serviceCatalogItemId:catalog.id", html);
        Assert.Contains("serviceModalEnable", html);
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
