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
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class LiveSessionAvailabilitySummaryTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Public_batch_summary_is_bounded_truthful_private_and_timezone_aware()
    {
        var data = await SeedMatrixAsync();
        var client = factory.CreateClient();
        var ids = data.PublicIds
            .Concat([data.UnpublishedId, data.RevokedId])
            .Select(id => "teacherIds=" + Uri.EscapeDataString(id));
        var path = "/api/v1/live-sessions/availability-summaries?"
            + string.Join("&", ids) + "&viewerTimeZoneId=UTC";

        factory.Commands.Reset();
        var json = JsonDocument.Parse(await client.GetStringAsync(path)).RootElement;
        Assert.Equal(4, factory.Commands.ReadCount);
        Assert.Equal(data.PublicIds.Length + 2, json.GetProperty("requestedCount").GetInt32());
        Assert.Equal(2, json.GetProperty("unavailableCount").GetInt32());

        var summaries = json.GetProperty("summaries").EnumerateArray()
            .ToDictionary(x => x.GetProperty("teacherId").GetString()!);
        Assert.Equal("available_today", State(data.AvailableId));
        Assert.Equal("next_available", State(data.NextId));
        Assert.Equal("no_schedule_configured", State(data.NoScheduleId));
        Assert.Equal("not_applicable", State(data.AsyncOnlyId));
        Assert.Equal("temporarily_unavailable", State(data.ExceptionId));
        Assert.Equal("fully_booked", State(data.AwaitingPaymentId));
        Assert.Equal("fully_booked", State(data.ConfirmedId));
        Assert.Equal("available_today", State(data.CancelledId));
        Assert.Equal("available_today", State(data.PartialExceptionId));
        Assert.Equal("no_upcoming_availability", State(data.NoUpcomingId));

        var next = summaries[data.NextId];
        Assert.Equal(data.NextServiceId, next.GetProperty("teacherServiceId").GetGuid());
        Assert.Equal(30, next.GetProperty("durationMinutes").GetInt32());
        Assert.Equal(TimeSpan.Zero, next.GetProperty("nextSlotStartUtc").GetDateTimeOffset().Offset);
        Assert.False(next.TryGetProperty("bookings", out _));
        Assert.False(next.TryGetProperty("exceptions", out _));
        Assert.False(next.TryGetProperty("studentId", out _));

        var publicProfile = JsonDocument.Parse(await client.GetStringAsync(
            $"/api/v1/teachers/{data.AvailableId}")).RootElement;
        Assert.Empty(publicProfile.GetProperty("availability").EnumerateArray());
        Assert.Empty(publicProfile.GetProperty("availabilityExceptions").EnumerateArray());

        var pacific = JsonDocument.Parse(await client.GetStringAsync(
            "/api/v1/live-sessions/availability-summaries"
            + $"?teacherIds={data.NextId}&viewerTimeZoneId=Pacific%20Standard%20Time")).RootElement
            .GetProperty("summaries")[0];
        Assert.Equal("available_today", pacific.GetProperty("state").GetString());

        var fallback = JsonDocument.Parse(await client.GetStringAsync(
            $"/api/v1/live-sessions/availability-summaries?teacherIds={data.AvailableId}")).RootElement
            .GetProperty("summaries")[0];
        Assert.True(fallback.GetProperty("timeZoneFallbackUsed").GetBoolean());
        Assert.Equal("UTC", fallback.GetProperty("viewerTimeZoneId").GetString());

        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(
            $"/api/v1/live-sessions/availability-summaries?teacherIds={data.AvailableId}"
            + "&viewerTimeZoneId=Not%2FAZone")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(
            "/api/v1/live-sessions/availability-summaries?teacherIds=not-a-guid")).StatusCode);
        var inactive = JsonDocument.Parse(await client.GetStringAsync(
            "/api/v1/live-sessions/availability-summaries"
            + $"?teacherIds={data.InactiveServiceId}&viewerTimeZoneId=UTC")).RootElement;
        Assert.Equal(1, inactive.GetProperty("unavailableCount").GetInt32());
        Assert.Empty(inactive.GetProperty("summaries").EnumerateArray());

        var duplicate = JsonDocument.Parse(await client.GetStringAsync(
            "/api/v1/live-sessions/availability-summaries"
            + $"?teacherIds={data.AvailableId}&teacherIds={data.AvailableId}&viewerTimeZoneId=UTC")).RootElement;
        Assert.Equal(1, duplicate.GetProperty("requestedCount").GetInt32());

        var tooMany = string.Join("&", Enumerable.Range(0, 13)
            .Select(_ => "teacherIds=" + Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(
            "/api/v1/live-sessions/availability-summaries?" + tooMany)).StatusCode);

        var detailed = JsonDocument.Parse(await client.GetStringAsync(
            $"/api/v1/live-sessions/teachers/{data.NextId}/slots"
            + $"?teacherServiceId={data.NextServiceId}&from=2027-01-04"
            + "&days=30&durationMinutes=30&studentTimeZoneId=UTC")).RootElement;
        Assert.Contains(detailed.EnumerateArray(),
            x => x.GetProperty("startsAt").GetDateTimeOffset()
                == next.GetProperty("nextSlotStartUtc").GetDateTimeOffset());

        string State(string teacherId) => summaries[teacherId].GetProperty("state").GetString()!;
    }

    [Fact]
    public async Task Summary_does_not_reserve_and_reserved_booking_blocks_schedule_mutation()
    {
        var data = await SeedGuardAsync();
        var publicClient = factory.CreateClient();
        var summaryPath = "/api/v1/live-sessions/availability-summaries"
            + $"?teacherIds={data.TeacherId}&viewerTimeZoneId=UTC";

        var before = JsonDocument.Parse(await publicClient.GetStringAsync(summaryPath)).RootElement
            .GetProperty("summaries")[0];
        Assert.Equal("next_available", before.GetProperty("state").GetString());
        await using (var scope = factory.Services.CreateAsyncScope())
            Assert.Equal(0, await scope.ServiceProvider.GetRequiredService<TafseelDbContext>()
                .LiveSessionBookings.CountAsync(x => x.TeacherId == data.TeacherId));

        var first = await ClientForAsync(data.FirstStudentEmail);
        var second = await ClientForAsync(data.SecondStudentEmail);
        var localStart = DateTime.SpecifyKind(
            before.GetProperty("nextSlotStartUtc").GetDateTimeOffset().UtcDateTime,
            DateTimeKind.Unspecified);
        (await BookAsync(first, data.ServiceId, localStart)).EnsureSuccessStatusCode();

        var after = JsonDocument.Parse(await publicClient.GetStringAsync(summaryPath)).RootElement
            .GetProperty("summaries")[0];
        Assert.Equal("next_available", after.GetProperty("state").GetString());
        Assert.NotEqual(
            before.GetProperty("nextSlotStartUtc").GetDateTimeOffset(),
            after.GetProperty("nextSlotStartUtc").GetDateTimeOffset());
        Assert.Equal(HttpStatusCode.Conflict,
            (await BookAsync(second, data.ServiceId, localStart)).StatusCode);

        var teacher = await ClientForAsync(data.TeacherEmail);
        var remove = await teacher.DeleteAsync(
            $"/api/v1/teachers/me/availability/rules/{data.RuleId}");
        Assert.Equal(HttpStatusCode.Conflict, remove.StatusCode);
        Assert.Equal("availability_booking_conflict", await CodeAsync(remove));

        var exception = await teacher.PostAsJsonAsync(
            "/api/v1/teachers/me/availability/exceptions",
            new
            {
                startsAt = before.GetProperty("nextSlotStartUtc").GetDateTimeOffset(),
                endsAt = before.GetProperty("nextSlotEndUtc").GetDateTimeOffset(),
                reason = "Blocked"
            });
        Assert.Equal(HttpStatusCode.Conflict, exception.StatusCode);
        Assert.Equal("availability_booking_conflict", await CodeAsync(exception));
    }

    [Fact]
    public async Task Summary_skips_a_DST_gap_and_returns_the_next_valid_recurrence()
    {
        factory.Clock.SetUtcNow(new DateTimeOffset(2027, 3, 13, 12, 0, 0, TimeSpan.Zero));
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var type = await db.ServiceCatalogItems.AsTracking()
            .SingleAsync(x => x.Code == "live_session");
        var subject = new Subject("DST " + Guid.NewGuid().ToString("N"), "code");
        var profile = new TeacherProfile(teacher.Id, factory.Clock.GetUtcNow());
        profile.Update("DST teacher", "DST availability summary profile.",
            "United States", "New York", "Eastern Standard Time", 10, factory.Clock.GetUtcNow());
        profile.Publish(factory.Clock.GetUtcNow());
        var service = new TeacherService(
            teacher.Id, subject.Id, type.Id, "DST service", "DST service details.",
            100, "SAR", 24, 0, factory.Clock.GetUtcNow());
        db.AddRange(
            subject,
            profile,
            service,
            new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()),
            new TeacherAvailabilityRule(
                teacher.Id, DayOfWeek.Sunday, new TimeOnly(2, 0), new TimeOnly(3, 0),
                "Eastern Standard Time", 30));
        await db.SaveChangesAsync();

        var summary = JsonDocument.Parse(await factory.CreateClient().GetStringAsync(
            "/api/v1/live-sessions/availability-summaries"
            + $"?teacherIds={teacher.Id}&teacherServiceId={service.Id}"
            + "&viewerTimeZoneId=Eastern%20Standard%20Time")).RootElement
            .GetProperty("summaries")[0];

        Assert.Equal("next_available", summary.GetProperty("state").GetString());
        Assert.Equal(
            new DateTimeOffset(2027, 3, 21, 6, 0, 0, TimeSpan.Zero),
            summary.GetProperty("nextSlotStartUtc").GetDateTimeOffset());
    }

    private async Task<MatrixData> SeedMatrixAsync()
    {
        factory.Clock.SetUtcNow(new DateTimeOffset(2027, 1, 4, 8, 0, 0, TimeSpan.Zero));
        var users = new List<(string Id, string Email)>();
        for (var index = 0; index < 13; index++)
            users.Add(await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher));
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var liveType = await db.ServiceCatalogItems.AsTracking().SingleAsync(x => x.Code == "live_session");
        var asyncType = await db.ServiceCatalogItems.AsTracking()
            .FirstAsync(x => x.IsActive && !x.RequiresScheduling);
        var subject = new Subject("Availability " + Guid.NewGuid().ToString("N"), "code");
        var subject2 = new Subject("Availability " + Guid.NewGuid().ToString("N"), "code2");
        db.AddRange(subject, subject2);

        var services = new List<TeacherService>();
        TeacherService AddTeacher(int index, ServiceCatalogItem type, bool publish = true, bool qualify = true)
        {
            var user = users[index];
            var profile = new TeacherProfile(user.Id, factory.Clock.GetUtcNow());
            profile.Update("Availability teacher", "Availability summary test profile.",
                "Egypt", "Cairo", "UTC", 10, factory.Clock.GetUtcNow());
            if (publish) profile.Publish(factory.Clock.GetUtcNow());
            var service = new TeacherService(
                user.Id, subject.Id, type.Id, "Test service", "Availability test service.",
                100, "SAR", 24, 0, factory.Clock.GetUtcNow());
            db.AddRange(profile, service);
            if (qualify)
                db.Add(new TeacherSubjectQualification(user.Id, subject.Id, factory.Clock.GetUtcNow()));
            services.Add(service);
            return service;
        }

        var available = AddTeacher(0, liveType);
        var next = AddTeacher(1, liveType);
        var nextAlternative = new TeacherService(
            users[1].Id, subject2.Id, liveType.Id, "Alternative live service",
            "Second eligible scheduled service.", 125, "SAR", 24, 0, factory.Clock.GetUtcNow());
        db.AddRange(nextAlternative,
            new TeacherSubjectQualification(users[1].Id, subject2.Id, factory.Clock.GetUtcNow()));
        AddTeacher(2, liveType);
        AddTeacher(3, asyncType);
        var exception = AddTeacher(4, liveType);
        var awaiting = AddTeacher(5, liveType);
        var confirmed = AddTeacher(6, liveType);
        var cancelled = AddTeacher(7, liveType);
        var partial = AddTeacher(8, liveType);
        AddTeacher(9, liveType);
        AddTeacher(10, liveType, publish: false);
        var revoked = AddTeacher(11, liveType);
        var inactive = AddTeacher(12, liveType);
        inactive.SetActive(false, factory.Clock.GetUtcNow());

        var revokedQualification = db.ChangeTracker.Entries<TeacherSubjectQualification>()
            .Single(x => x.Entity.TeacherId == users[11].Id).Entity;
        revokedQualification.Revoke(users[11].Id, "Test revocation", factory.Clock.GetUtcNow());

        db.AddRange(
            Rule(users[0].Id, DayOfWeek.Monday, 10, 11),
            Rule(users[1].Id, DayOfWeek.Tuesday, 1, 2),
            Rule(users[4].Id, DayOfWeek.Monday, 12, 12, 30),
            Rule(users[5].Id, DayOfWeek.Monday, 13, 13, 30),
            Rule(users[6].Id, DayOfWeek.Monday, 14, 14, 30),
            Rule(users[7].Id, DayOfWeek.Monday, 15, 15, 30),
            Rule(users[8].Id, DayOfWeek.Monday, 16, 17),
            Rule(users[9].Id, DayOfWeek.Monday, 20, 20, 15));

        var exceptionStart = new DateTimeOffset(2027, 1, 4, 12, 0, 0, TimeSpan.Zero);
        db.Add(new TeacherAvailabilityException(
            users[4].Id, exceptionStart, new DateTimeOffset(2027, 2, 3, 0, 0, 0, TimeSpan.Zero),
            "Private reason"));
        db.Add(new TeacherAvailabilityException(
            users[8].Id,
            new DateTimeOffset(2027, 1, 4, 16, 0, 0, TimeSpan.Zero),
            new DateTimeOffset(2027, 1, 4, 16, 30, 0, TimeSpan.Zero),
            "Private partial reason"));

        var awaitingBookings = Enumerable.Range(0, 5).Select(week => Booking(
            student.Id, users[5].Id, awaiting.Id,
            new DateTimeOffset(2027, 1, 4, 13, 0, 0, TimeSpan.Zero).AddDays(week * 7))).ToArray();
        var confirmedBookings = Enumerable.Range(0, 5).Select(week => Booking(
            student.Id, users[6].Id, confirmed.Id,
            new DateTimeOffset(2027, 1, 4, 14, 0, 0, TimeSpan.Zero).AddDays(week * 7))).ToArray();
        foreach (var booking in confirmedBookings)
            booking.ConfirmPayment("provider", factory.Clock.GetUtcNow());
        var cancelledBooking = Booking(
            student.Id, users[7].Id, cancelled.Id,
            new DateTimeOffset(2027, 1, 4, 15, 0, 0, TimeSpan.Zero));
        cancelledBooking.Cancel(student.Id, factory.Clock.GetUtcNow());
        db.AddRange(awaitingBookings);
        db.AddRange(confirmedBookings);
        db.Add(cancelledBooking);
        await db.SaveChangesAsync();

        return new(
            users.Take(10).Select(x => x.Id).ToArray(),
            users[0].Id,
            users[1].Id,
            new[] { next.Id, nextAlternative.Id }.Min(),
            users[2].Id,
            users[3].Id,
            users[4].Id,
            users[5].Id,
            users[6].Id,
            users[7].Id,
            users[8].Id,
            users[9].Id,
            users[10].Id,
            users[11].Id,
            users[12].Id);
    }

    private async Task<GuardData> SeedGuardAsync()
    {
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var first = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var second = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var type = await db.ServiceCatalogItems.AsTracking().SingleAsync(x => x.Code == "live_session");
        var subject = new Subject("Guard " + Guid.NewGuid().ToString("N"), "code");
        var profile = new TeacherProfile(teacher.Id, factory.Clock.GetUtcNow());
        profile.Update("Guard teacher", "Schedule mutation guard profile.",
            "Egypt", "Cairo", "UTC", 10, factory.Clock.GetUtcNow());
        profile.Publish(factory.Clock.GetUtcNow());
        var service = new TeacherService(
            teacher.Id, subject.Id, type.Id, "Guard service", "Guard service details.",
            100, "SAR", 24, 0, factory.Clock.GetUtcNow());
        var slotDate = DateOnly.FromDateTime(factory.Clock.GetUtcNow().UtcDateTime).AddDays(2);
        var rule = Rule(teacher.Id, slotDate.DayOfWeek, 10, 10, 30);
        db.AddRange(
            subject,
            profile,
            service,
            new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()),
            rule);
        await db.SaveChangesAsync();
        return new(
            teacher.Id, teacher.Email, first.Email, second.Email, service.Id, rule.Id);
    }

    private static TeacherAvailabilityRule Rule(
        string teacherId,
        DayOfWeek day,
        int startHour,
        int endHour,
        int endMinute = 0) =>
        new(
            teacherId,
            day,
            new TimeOnly(startHour, 0),
            new TimeOnly(endHour, endMinute),
            "UTC",
            30);

    private LiveSessionBooking Booking(
        string studentId,
        string teacherId,
        Guid serviceId,
        DateTimeOffset startsAt) =>
        new(
            studentId,
            teacherId,
            serviceId,
            "Availability booking",
            "",
            startsAt,
            startsAt.AddMinutes(30),
            "UTC",
            "UTC",
            50,
            "SAR",
            0,
            24,
            Guid.NewGuid().ToString("N"),
            factory.Clock.GetUtcNow());

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static Task<HttpResponseMessage> BookAsync(
        HttpClient client,
        Guid serviceId,
        DateTime localStart) =>
        client.PostAsJsonAsync("/api/v1/live-sessions", new
        {
            teacherServiceId = serviceId,
            title = "Availability booking",
            notes = "",
            localStart,
            studentTimeZoneId = "UTC",
            durationMinutes = 30,
            emergency = false
        });

    private static async Task<string> CodeAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement
            .GetProperty("code").GetString()!;

    private sealed record MatrixData(
        string[] PublicIds,
        string AvailableId,
        string NextId,
        Guid NextServiceId,
        string NoScheduleId,
        string AsyncOnlyId,
        string ExceptionId,
        string AwaitingPaymentId,
        string ConfirmedId,
        string CancelledId,
        string PartialExceptionId,
        string NoUpcomingId,
        string UnpublishedId,
        string RevokedId,
        string InactiveServiceId);

    private sealed record GuardData(
        string TeacherId,
        string TeacherEmail,
        string FirstStudentEmail,
        string SecondStudentEmail,
        Guid ServiceId,
        Guid RuleId);
}
