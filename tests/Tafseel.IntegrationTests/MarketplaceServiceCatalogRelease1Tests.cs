using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class MarketplaceServiceCatalogRelease1Tests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Admin_creates_complete_async_and_live_policies()
    {
        var admin = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Admin);
        var client = await ClientForAsync(admin.Email);

        var asyncResponse = await client.PostAsJsonAsync("/api/v1/admin/services", Policy("async_request"));
        Assert.Equal(HttpStatusCode.Created, asyncResponse.StatusCode);
        var asyncItem = JsonDocument.Parse(await asyncResponse.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("async_request", asyncItem.GetProperty("orderType").GetString());
        Assert.Equal(48, asyncItem.GetProperty("defaultDeliveryHours").GetInt32());

        var liveResponse = await client.PostAsJsonAsync("/api/v1/admin/services", Policy("live_session"));
        Assert.Equal(HttpStatusCode.Created, liveResponse.StatusCode);
        var liveItem = JsonDocument.Parse(await liveResponse.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("live_session", liveItem.GetProperty("orderType").GetString());
        Assert.Equal([30, 60], liveItem.GetProperty("allowedDurations").EnumerateArray().Select(x => x.GetInt32()));
    }

    [Fact]
    public async Task Non_admin_cannot_mutate_catalog()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var response = await (await ClientForAsync(student.Email)).PostAsJsonAsync("/api/v1/admin/services", Policy("async_request"));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Referenced_order_type_change_returns_safe_conflict()
    {
        var admin = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Admin);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        Guid serviceId;
        string serviceCode;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var suffix = Guid.NewGuid().ToString("N");
            var subject = new Subject("Policy " + suffix, "code");
            var catalog = new ServiceCatalogItem("Policy " + suffix, "Description", "policy_" + suffix, "خدمة", "وصف");
            db.AddRange(subject, catalog);
            db.Add(new TeacherService(teacher.Id, subject.Id, catalog.Id, "Current title", "Current description", 120, "SAR", 48, 2, factory.Clock.GetUtcNow()));
            await db.SaveChangesAsync();
            serviceId = catalog.Id;
            serviceCode = catalog.Code;
        }

        var response = await (await ClientForAsync(admin.Email)).PutAsJsonAsync(
            $"/api/v1/admin/catalog/services/{serviceId}", Policy("live_session", serviceCode));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("service_order_type_immutable", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Request_order_and_booking_keep_independent_rename_safe_snapshots()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var now = factory.Clock.GetUtcNow();
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Snapshot " + suffix, "code");
        var asyncCatalog = new ServiceCatalogItem("Original async", "Description", "snapshot_async_" + suffix, "الخدمة الأصلية", "وصف");
        var liveCatalog = new ServiceCatalogItem("Original live", "Description", "snapshot_live_" + suffix, "الجلسة الأصلية", "وصف", orderType: ServiceOrderTypes.LiveSession, allowedDurations: [30]);
        var asyncService = new TeacherService(teacher.Id, subject.Id, asyncCatalog.Id, "Offer", "Description", 120, "SAR", 48, 2, now);
        var liveService = new TeacherService(teacher.Id, subject.Id, liveCatalog.Id, "Live offer", "Description", 120, "SAR", 1, 0, now);
        var request = new LearningRequest(student.Id, teacher.Id, asyncService.Id, "Work", "Notes", now.AddHours(72), 120, now);
        request.CaptureServiceIdentity(asyncCatalog);
        var order = new Order(request.Id, student.Id, teacher.Id, asyncService.Id, 120, "SAR", 5, 15, now.AddHours(48), 2, now);
        order.CaptureServiceIdentity(asyncCatalog);
        var booking = new LiveSessionBooking(student.Id, teacher.Id, liveService.Id, "Session", "Notes",
            now.AddDays(2), now.AddDays(2).AddMinutes(30), "UTC", "UTC", 120, "SAR", 0, 24, suffix, now);
        booking.CaptureServiceIdentity(liveCatalog);

        asyncCatalog.ConfigureLocalizedContent("Renamed async", "خدمة معدلة", "New", "وصف معدل", 1);
        liveCatalog.ConfigureLocalizedContent("Renamed live", "جلسة معدلة", "New", "وصف معدل", 2);
        db.AddRange(subject, asyncCatalog, liveCatalog, asyncService, liveService, request, order, booking);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        Assert.Equal("Original async", (await db.LearningRequests.SingleAsync(x => x.Id == request.Id)).ServiceNameEnglish);
        Assert.Equal("Original async", (await db.Orders.SingleAsync(x => x.Id == order.Id)).ServiceNameEnglish);
        Assert.Equal("Original live", (await db.LiveSessionBookings.SingleAsync(x => x.Id == booking.Id)).ServiceNameEnglish);
    }

    [Fact]
    public void Migration_contains_deterministic_backfill_and_failure_audits()
    {
        var migration = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "src",
            "Tafseel.Infrastructure", "Persistence", "Migrations", "20260801135831_MarketplaceServiceCatalogRelease1.cs"));
        Assert.Contains("catalog_policy_backfill_contradictory_scheduling", migration);
        Assert.Contains("catalog_snapshot_backfill_broken_order", migration);
        Assert.Contains("WHEN 'recorded_explanation' THEN 'recorded_explanation'", migration);
        Assert.DoesNotContain("TeacherServices] SET", migration);
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static object Policy(string orderType, string? existingCode = null)
    {
        var live = orderType == ServiceOrderTypes.LiveSession;
        var suffix = Guid.NewGuid().ToString("N");
        return new
        {
            nameEn = "Policy " + suffix,
            nameAr = "خدمة " + suffix,
            descriptionEn = "Complete catalog policy",
            descriptionAr = "سياسة كتالوج مكتملة",
            code = existingCode ?? "policy_" + suffix,
            categoryCode = live ? "live_learning" : "academic_support",
            iconCode = live ? "live" : "academic_support",
            orderType,
            qualificationPolicy = "subject_qualification_required",
            currencyCode = "SAR",
            minimumPrice = 30m,
            defaultPrice = 120m,
            recommendedPrice = 120m,
            maximumPrice = 1000m,
            minimumDeliveryHours = live ? (int?)null : 1,
            defaultDeliveryHours = live ? (int?)null : 48,
            recommendedDeliveryHours = live ? (int?)null : 48,
            maximumDeliveryHours = live ? (int?)null : 8760,
            defaultRevisions = live ? 0 : 2,
            maximumRevisions = live ? 0 : 20,
            allowedDurations = live ? new[] { 30, 60 } : [],
            isPublic = true,
            teacherSelectable = true,
            isActive = true
        };
    }
}
