using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class Release7MarketplaceIntelligenceTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Interaction_contract_is_allowlisted_append_only_and_idempotent()
    {
        var client = factory.CreateClient();
        var id = Guid.NewGuid().ToString("N");
        var allowed = new { eventName = "browse_viewed", sourceSurface = "Browse", clientEventId = id,
            anonymousSessionId = Guid.NewGuid().ToString("N"), resultCount = 0,
            queryPresent = true, languageFilterPresent = true, priceFilterPresent = false };
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/v1/marketplace-intelligence/events", allowed)).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/v1/marketplace-intelligence/events", allowed)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/marketplace-intelligence/events", new {
            eventName = "payment_confirmed", sourceSurface = "Browse", clientEventId = Guid.NewGuid().ToString("N"), anonymousSessionId = Guid.NewGuid().ToString("N") })).StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(1, await db.MarketplaceInteractionEvents.CountAsync(x => x.ClientEventId == id));
        var stored = await db.MarketplaceInteractionEvents.SingleAsync(x => x.ClientEventId == id);
        Assert.Null(stored.AuthenticatedUserId);
        Assert.DoesNotContain(stored.GetType().GetProperties(), x => x.Name.Contains("QueryText", StringComparison.OrdinalIgnoreCase)
            || x.Name.Contains("Email", StringComparison.OrdinalIgnoreCase) || x.Name.Contains("Metadata", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Admin_aggregate_is_private_bounded_and_reconciles_canonical_truth()
    {
        var fixture = await SeedCanonicalJourneyAsync();
        using var admin = await ClientAsync(fixture.AdminEmail);
        using var student = await ClientAsync(fixture.StudentEmail);
        using var teacher = await ClientAsync(fixture.TeacherEmail);
        using var quality = await ClientAsync(fixture.QualityEmail);
        var route = "/api/v1/admin/marketplace-intelligence?from="
            + Uri.EscapeDataString(fixture.Now.AddDays(-1).ToString("O")) + "&to="
            + Uri.EscapeDataString(fixture.Now.AddMinutes(1).ToString("O"));
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync(route)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await teacher.GetAsync(route)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await quality.GetAsync(route)).StatusCode);
        var response = await admin.GetAsync(route);
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("email", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("phone", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("description", json, StringComparison.OrdinalIgnoreCase);
        var report = JsonDocument.Parse(json).RootElement;
        Assert.Equal(1, report.GetProperty("overview").GetProperty("requestSubmissions").GetInt32());
        Assert.Equal(1, report.GetProperty("overview").GetProperty("paidOrders").GetInt32());
        Assert.Equal(JsonValueKind.Null, report.GetProperty("funnel")[0].GetProperty("conversionPercent").ValueKind);
        var row = Assert.Single(report.GetProperty("dimensions").EnumerateArray(), x => x.GetProperty("subjectId").GetGuid() == fixture.SubjectId);
        Assert.Equal(1, row.GetProperty("eligibleTeachers").GetInt32());
        Assert.Equal(1, row.GetProperty("activeOffers").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/v1/admin/marketplace-intelligence?from=2025-01-01T00:00:00Z&to=2026-08-10T00:00:00Z")).StatusCode);
    }

    private async Task<(string AdminEmail, string StudentEmail, string TeacherEmail, string QualityEmail, Guid SubjectId, DateTimeOffset Now)> SeedCanonicalJourneyAsync()
    {
        var now = factory.Clock.GetUtcNow();
        var admin = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Admin);
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var quality = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("R7 Subject " + suffix, "subject");
        var catalog = new ServiceCatalogItem("R7 Service " + suffix, "Canonical service.", "r7_" + suffix, "خدمة", "خدمة أساسية.");
        var disabledCatalog = new ServiceCatalogItem("R7 Disabled " + suffix, "Disabled service.", "r7_disabled_" + suffix, "خدمة معطلة", "خدمة معطلة.");
        var service = new TeacherService(teacher.Id, subject.Id, catalog.Id, "R7 offer", "Canonical active offer.", 100, "SAR", 24, 1, factory.Clock.GetUtcNow());
        var disabled = new TeacherService(teacher.Id, subject.Id, disabledCatalog.Id, "Disabled offer", "Must not count.", 120, "SAR", 24, 1, factory.Clock.GetUtcNow());
        disabled.SetActive(false, factory.Clock.GetUtcNow());
        var request = new LearningRequest(student.Id, teacher.Id, service.Id, "R7 request", "Canonical request body must not leak.", factory.Clock.GetUtcNow().AddDays(2), 100, factory.Clock.GetUtcNow());
        request.CaptureServiceIdentity(catalog); request.Accept(teacher.Id, "r7-accept", factory.Clock.GetUtcNow());
        var order = new Order(request.Id, student.Id, teacher.Id, service.Id, 100, "SAR", 8, 15, factory.Clock.GetUtcNow().AddDays(2), 1, factory.Clock.GetUtcNow());
        order.CaptureServiceIdentity(catalog);
        var payment = new Payment(order.Id, student.Id, 108, "SAR", "Mock", "r7-provider-" + suffix, "r7-payment-" + suffix, factory.Clock.GetUtcNow());
        payment.Confirm(108, "SAR", factory.Clock.GetUtcNow());
        db.AddRange(subject, catalog, disabledCatalog, service, disabled, request, order, payment, new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()));
        await db.SaveChangesAsync();
        return (admin.Email, student.Email, teacher.Email, quality.Email, subject.Id, now);
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }
}
