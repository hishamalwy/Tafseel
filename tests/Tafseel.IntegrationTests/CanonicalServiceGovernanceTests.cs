using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class CanonicalServiceGovernanceTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Service_codes_are_unique_and_normalized_in_admin_catalog()
    {
        var admin = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Admin);
        var client = await ClientForAsync(admin.Email);
        var suffix = Guid.NewGuid().ToString("N")[..10];

        var created = await client.PostAsJsonAsync("/api/v1/admin/services", new
        {
            nameEn = "Canonical Live " + suffix,
            nameAr = "جلسة مباشرة " + suffix,
            descriptionEn = "Live booking service",
            descriptionAr = "خدمة حجز مباشرة",
            displayOrder = 40,
            isActive = true
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var json = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("canonical_live_" + suffix, json.GetProperty("code").GetString());
        Assert.Equal("Canonical Live " + suffix, json.GetProperty("nameEn").GetString());
        Assert.Equal("جلسة مباشرة " + suffix, json.GetProperty("nameAr").GetString());
        Assert.Equal("خدمة حجز مباشرة", json.GetProperty("descriptionAr").GetString());

        var duplicate = await client.PostAsJsonAsync("/api/v1/admin/services", new
        {
            nameEn = "Canonical Live " + suffix,
            nameAr = "نسخة مكررة",
            descriptionEn = "Should fail",
            descriptionAr = "يجب أن تفشل",
            displayOrder = 41,
            isActive = true
        });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
    }

    [Fact]
    public async Task Disabled_global_or_teacher_service_and_non_live_cannot_book()
    {
        var data = await SeedLiveAsync();
        var student = await ClientForAsync(data.StudentEmail);
        var localDate = data.LocalDate.ToString("yyyy-MM-dd");
        var slot = JsonDocument.Parse(await factory.CreateClient().GetStringAsync(
            $"/api/v1/live-sessions/teachers/{data.TeacherId}/slots?from={localDate}" +
            $"&days=1&durationMinutes=30&studentTimeZoneId=UTC&teacherServiceId={data.LiveServiceId}"))
            .RootElement.EnumerateArray().First();
        var start = DateTime.SpecifyKind(slot.GetProperty("startsAt").GetDateTimeOffset().UtcDateTime, DateTimeKind.Unspecified);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var catalog = await db.ServiceCatalogItems.SingleAsync(x => x.Id == data.LiveCatalogId);
            catalog.SetActive(false);
            await db.SaveChangesAsync();
        }
        var disabledGlobal = await BookAsync(student, data.LiveServiceId, start);
        Assert.Equal(HttpStatusCode.BadRequest, disabledGlobal.StatusCode);
        Assert.Contains("catalog_service_inactive", await disabledGlobal.Content.ReadAsStringAsync());

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var catalog = await db.ServiceCatalogItems.SingleAsync(x => x.Id == data.LiveCatalogId);
            catalog.SetActive(true);
            var teacherService = await db.TeacherServices.SingleAsync(x => x.Id == data.LiveServiceId);
            teacherService.SetActive(false, factory.Clock.GetUtcNow());
            await db.SaveChangesAsync();
        }
        var disabledTeacher = await BookAsync(student, data.LiveServiceId, start);
        Assert.Equal(HttpStatusCode.BadRequest, disabledTeacher.StatusCode);
        Assert.Contains("teacher_service_inactive", await disabledTeacher.Content.ReadAsStringAsync());

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var teacherService = await db.TeacherServices.SingleAsync(x => x.Id == data.LiveServiceId);
            teacherService.SetActive(true, factory.Clock.GetUtcNow());
            await db.SaveChangesAsync();
        }
        var nonLive = await BookAsync(student, data.RecordedServiceId, start);
        Assert.Equal(HttpStatusCode.BadRequest, nonLive.StatusCode);
        Assert.Contains("service_not_live_session", await nonLive.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Public_profile_excludes_unavailable_live_session_and_history_remains_readable()
    {
        var data = await SeedLiveAsync();
        var student = await ClientForAsync(data.StudentEmail);
        var localDate = data.LocalDate.ToString("yyyy-MM-dd");
        var slot = JsonDocument.Parse(await factory.CreateClient().GetStringAsync(
            $"/api/v1/live-sessions/teachers/{data.TeacherId}/slots?from={localDate}" +
            $"&days=1&durationMinutes=30&studentTimeZoneId=UTC&teacherServiceId={data.LiveServiceId}"))
            .RootElement.EnumerateArray().First();
        var start = DateTime.SpecifyKind(slot.GetProperty("startsAt").GetDateTimeOffset().UtcDateTime, DateTimeKind.Unspecified);
        var booked = await BookAsync(student, data.LiveServiceId, start);
        booked.EnsureSuccessStatusCode();
        var bookingId = JsonDocument.Parse(await booked.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var catalog = await db.ServiceCatalogItems.SingleAsync(x => x.Id == data.LiveCatalogId);
            catalog.SetActive(false);
            await db.SaveChangesAsync();
        }

        var profile = JsonDocument.Parse(await factory.CreateClient()
            .GetStringAsync($"/api/v1/teachers/{data.TeacherId}")).RootElement;
        Assert.DoesNotContain(profile.GetProperty("services").EnumerateArray(),
            x => x.GetProperty("id").GetGuid() == data.LiveServiceId);

        var mine = JsonDocument.Parse(await student.GetStringAsync("/api/v1/live-sessions/mine?pageSize=50")).RootElement;
        Assert.Contains(mine.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("id").GetGuid() == bookingId);
    }

    [Fact]
    public async Task Teacher_service_edit_persists_approach_price_delivery_and_revisions_with_catalog_identity()
    {
        var data = await SeedLiveAsync();
        var teacher = await ClientForAsync(data.TeacherEmail);
        var profile = JsonDocument.Parse(await teacher.GetStringAsync("/api/v1/teachers/me")).RootElement;
        var service = profile.GetProperty("services").EnumerateArray()
            .First(x => x.GetProperty("id").GetGuid() == data.RecordedServiceId);
        var version = service.GetProperty("version").GetString()!;
        var catalogTitle = service.GetProperty("title").GetString();

        var request = new HttpRequestMessage(HttpMethod.Put,
            $"/api/v1/teachers/me/services/{data.RecordedServiceId}")
        {
            Content = JsonContent.Create(new
            {
                subjectId = service.GetProperty("subjectId").GetGuid(),
                serviceCatalogItemId = service.GetProperty("serviceCatalogItemId").GetGuid(),
                approachEn = "Updated recorded approach",
                price = 175m,
                currency = "SAR",
                deliveryHours = 36,
                revisions = 3
            })
        };
        request.Headers.TryAddWithoutValidation("If-Match", version);
        var update = await teacher.SendAsync(request);
        Assert.Equal(HttpStatusCode.NoContent, update.StatusCode);

        var refreshed = JsonDocument.Parse(await teacher.GetStringAsync("/api/v1/teachers/me")).RootElement;
        var edited = refreshed.GetProperty("services").EnumerateArray()
            .First(x => x.GetProperty("id").GetGuid() == data.RecordedServiceId);
        Assert.Equal(catalogTitle, edited.GetProperty("title").GetString());
        Assert.Equal("Updated recorded approach", edited.GetProperty("description").GetString());
        Assert.Equal("Updated recorded approach", edited.GetProperty("approachEn").GetString());
        Assert.Equal(175m, edited.GetProperty("price").GetDecimal());
        Assert.Equal(36, edited.GetProperty("deliveryHours").GetInt32());
        Assert.Equal(3, edited.GetProperty("revisions").GetInt32());
    }

    private async Task<SeedData> SeedLiveAsync()
    {
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var teacherZone = TimeZoneInfo.FindSystemTimeZoneById("Egypt Standard Time");
        var localDate = DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTime(factory.Clock.GetUtcNow().AddDays(2), teacherZone).DateTime);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Gov Subject " + suffix, "code");
        var live = await db.ServiceCatalogItems.AsTracking().FirstOrDefaultAsync(x => x.Code == "live_session");
        if (live is null)
        {
            live = new ServiceCatalogItem(
                "Live Session", "Live explanation", "live_session", "جلسة مباشرة", "شرح مباشر");
            db.Add(live);
        }
        else if (!live.IsActive) live.SetActive(true);

        var recorded = new ServiceCatalogItem(
            "Recorded " + suffix, "Async explanation", "svc_" + suffix, "شرح مسجل", "شرح غير متزامن");
        var profile = new TeacherProfile(teacher.Id, factory.Clock.GetUtcNow());
        profile.Update("Teacher", "Profile for governance tests.", "Egypt", "Cairo",
            "Egypt Standard Time", 10, factory.Clock.GetUtcNow());
        profile.Publish(factory.Clock.GetUtcNow());
        var liveService = new TeacherService(teacher.Id, subject.Id, live.Id, "Live explanation",
            "A private live explanation session.", 120, "SAR", 24, 0, factory.Clock.GetUtcNow());
        var recordedService = new TeacherService(teacher.Id, subject.Id, recorded.Id, "Recorded explanation",
            "A recorded explanation.", 100, "SAR", 24, 1, factory.Clock.GetUtcNow());
        db.AddRange(subject, recorded, profile, liveService, recordedService,
            new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()),
            new TeacherAvailabilityRule(teacher.Id, localDate.DayOfWeek,
                new TimeOnly(9, 0), new TimeOnly(15, 0), "Egypt Standard Time", 30));
        await db.SaveChangesAsync();
        return new(student.Email, teacher.Email, teacher.Id, live.Id, liveService.Id, recordedService.Id, localDate);
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static Task<HttpResponseMessage> BookAsync(HttpClient client, Guid serviceId, DateTime localStart) =>
        client.PostAsJsonAsync("/api/v1/live-sessions", new
        {
            teacherServiceId = serviceId,
            title = "Exam revision",
            notes = "Focus on the difficult examples.",
            localStart,
            studentTimeZoneId = "UTC",
            durationMinutes = 30,
            emergency = false
        });

    private sealed record SeedData(
        string StudentEmail,
        string TeacherEmail,
        string TeacherId,
        Guid LiveCatalogId,
        Guid LiveServiceId,
        Guid RecordedServiceId,
        DateOnly LocalDate);
}
