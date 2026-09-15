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

/// <summary>
/// Found by the Wave 3B live-session journey: slot generation stepped a <see cref="TimeOnly"/>, which
/// wraps at midnight. For a weekly rule ending within one session length of midnight (for example
/// 22:00-23:30 with 60-minute sessions) the loop condition never became false, so every slot or
/// availability-summary read for that teacher - including the public profile - spun forever.
/// </summary>
[Trait("Category", "SqlServer")]
public sealed class LiveSessionSlotMidnightTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task A_rule_ending_near_midnight_yields_its_slots_and_returns()
    {
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var (teacherId, serviceId, date) = await SeedAsync(new TimeOnly(22, 0), new TimeOnly(23, 30), slotMinutes: 30);
        var client = factory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(20);

        var slots = JsonDocument.Parse(await client.GetStringAsync(
            $"/api/v1/live-sessions/teachers/{teacherId}/slots?from={date:yyyy-MM-dd}" +
            "&days=1&durationMinutes=60&studentTimeZoneId=UTC")).RootElement.EnumerateArray()
            .Select(x => x.GetProperty("startsAt").GetDateTimeOffset().UtcDateTime.TimeOfDay).ToArray();
        Assert.Equal([new TimeSpan(22, 0, 0), new TimeSpan(22, 30, 0)], slots);

        var summary = await client.GetAsync(
            $"/api/v1/live-sessions/availability-summaries?teacherIds={teacherId}&viewerTimeZoneId=UTC");
        Assert.Equal(HttpStatusCode.OK, summary.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/teachers/{teacherId}")).StatusCode);

        // The last offered slot is really bookable; nothing past the rule's end is offered.
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, student.Email));
        var booked = await client.PostAsJsonAsync("/api/v1/live-sessions", new
        {
            teacherServiceId = serviceId,
            title = "Late revision",
            notes = "",
            localStart = date.ToDateTime(new TimeOnly(22, 30)),
            studentTimeZoneId = "UTC",
            durationMinutes = 60,
            emergency = false
        });
        Assert.Equal(HttpStatusCode.Created, booked.StatusCode);
    }

    [Fact]
    public async Task A_rule_running_to_the_last_minute_of_the_day_does_not_wrap()
    {
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var (teacherId, _, date) = await SeedAsync(new TimeOnly(23, 0), new TimeOnly(23, 59), slotMinutes: 15);
        var client = factory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(20);

        var slots = JsonDocument.Parse(await client.GetStringAsync(
            $"/api/v1/live-sessions/teachers/{teacherId}/slots?from={date:yyyy-MM-dd}" +
            "&days=1&durationMinutes=30&studentTimeZoneId=UTC")).RootElement.EnumerateArray()
            .Select(x => x.GetProperty("startsAt").GetDateTimeOffset().UtcDateTime.TimeOfDay).ToArray();
        Assert.Equal([new TimeSpan(23, 0, 0), new TimeSpan(23, 15, 0)], slots);
    }

    private async Task<(string TeacherId, Guid ServiceId, DateOnly Date)> SeedAsync(TimeOnly start, TimeOnly end, int slotMinutes)
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var date = DateOnly.FromDateTime(factory.Clock.GetUtcNow().UtcDateTime.AddDays(2));
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var subject = new Subject("Midnight Subject " + Guid.NewGuid().ToString("N"), "code");
        var type = await db.ServiceCatalogItems.AsTracking().FirstOrDefaultAsync(x => x.Code == "live_session");
        if (type is null)
        {
            type = new ServiceCatalogItem("Live Session", "Live explanation", "live_session", "جلسة مباشرة", "شرح مباشر");
            db.Add(type);
        }
        else if (!type.IsActive)
            type.SetActive(true);
        var profile = new TeacherProfile(teacher.Id, factory.Clock.GetUtcNow());
        profile.Update("Late teacher", "Teacher who teaches late in the evening.", "Egypt", "Cairo",
            "UTC", 10, factory.Clock.GetUtcNow());
        profile.Publish(TeacherProfileReadiness.Ready, factory.Clock.GetUtcNow());
        var service = new TeacherService(teacher.Id, subject.Id, type.Id, "Evening session",
            "A late live explanation session.", 120, "SAR", 24, 0, factory.Clock.GetUtcNow());
        db.AddRange(subject, profile, service,
            new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()),
            new TeacherAvailabilityRule(teacher.Id, date.DayOfWeek, start, end, "UTC", slotMinutes));
        await db.SaveChangesAsync();
        return (teacher.Id, service.Id, date);
    }
}
