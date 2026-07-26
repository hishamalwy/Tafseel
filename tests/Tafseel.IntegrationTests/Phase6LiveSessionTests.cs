using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
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
[Trait("Category", "Concurrency")]
public sealed class Phase6LiveSessionTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Timezone_slots_concurrent_booking_adjacent_reschedule_and_cancel_are_safe()
    {
        var data = await SeedAsync();
        var first = await ClientForAsync(data.FirstStudent.Email);
        var second = await ClientForAsync(data.SecondStudent.Email);
        var third = await ClientForAsync(data.ThirdStudent.Email);
        var localDate = data.LocalDate.ToString("yyyy-MM-dd");
        var slotsJson = JsonDocument.Parse(await factory.CreateClient().GetStringAsync(
            $"/api/v1/live-sessions/teachers/{data.Teacher.Id}/slots?from={localDate}" +
            "&days=1&durationMinutes=30&studentTimeZoneId=Pacific%20Standard%20Time")).RootElement;
        var slots = slotsJson.EnumerateArray().ToArray();
        Assert.True(slots.Length >= 3);
        var startUtc = slots[0].GetProperty("startsAt").GetDateTimeOffset();
        var pacificLocal = slots[0].GetProperty("studentLocalStart").GetDateTime();
        Assert.Equal(startUtc.UtcDateTime,
            TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(pacificLocal, DateTimeKind.Unspecified),
                TimeZoneInfo.FindSystemTimeZoneById("Pacific Standard Time")));

        var bookings = await Task.WhenAll(
            BookAsync(first, data.ServiceId, pacificLocal, "Pacific Standard Time", emergency: true),
            BookAsync(second, data.ServiceId, pacificLocal, "Pacific Standard Time", emergency: true));
        Assert.Single(bookings, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Single(bookings, x => x.StatusCode == HttpStatusCode.Conflict);
        var winnerIndex = bookings[0].StatusCode == HttpStatusCode.Created ? 0 : 1;
        var winner = winnerIndex == 0 ? first : second;
        var winnerJson = JsonDocument.Parse(await bookings[winnerIndex].Content.ReadAsStringAsync()).RootElement;
        var winnerId = winnerJson.GetProperty("id").GetGuid();
        Assert.Equal(50m, winnerJson.GetProperty("emergencyPremiumPercent").GetDecimal());

        var adjacentLocal = slots[1].GetProperty("studentLocalStart").GetDateTime();
        var adjacent = await BookAsync(third, data.ServiceId, adjacentLocal, "Pacific Standard Time", emergency: false);
        adjacent.EnsureSuccessStatusCode();
        var adjacentJson = JsonDocument.Parse(await adjacent.Content.ReadAsStringAsync()).RootElement;
        var adjacentId = adjacentJson.GetProperty("id").GetGuid();
        var adjacentVersion = adjacentJson.GetProperty("version").GetString()!;

        var conflict = await SendAsync(winner, HttpMethod.Post,
            $"/api/v1/live-sessions/{winnerId}/reschedule",
            new { localStart = adjacentLocal, timeZoneId = "Pacific Standard Time" },
            winnerJson.GetProperty("version").GetString()!);
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);

        var cancellations = await Task.WhenAll(
            SendAsync(third, HttpMethod.Post, $"/api/v1/live-sessions/{adjacentId}/cancel", null, adjacentVersion),
            SendAsync(third, HttpMethod.Post, $"/api/v1/live-sessions/{adjacentId}/cancel", null, adjacentVersion));
        Assert.Single(cancellations, x => x.StatusCode == HttpStatusCode.NoContent);
        Assert.Single(cancellations, x => x.StatusCode == HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Join_window_attachments_and_no_show_are_participant_only()
    {
        var data = await SeedAsync();
        var student = await ClientForAsync(data.FirstStudent.Email);
        var outsider = await ClientForAsync(data.SecondStudent.Email);
        var teacher = await ClientForAsync(data.Teacher.Email);
        var localDate = data.LocalDate.ToString("yyyy-MM-dd");
        var slot = JsonDocument.Parse(await factory.CreateClient().GetStringAsync(
            $"/api/v1/live-sessions/teachers/{data.Teacher.Id}/slots?from={localDate}" +
            "&days=1&durationMinutes=30&studentTimeZoneId=UTC")).RootElement.EnumerateArray().First();
        var start = slot.GetProperty("startsAt").GetDateTimeOffset();
        var response = await BookAsync(
            student, data.ServiceId,
            DateTime.SpecifyKind(start.UtcDateTime, DateTimeKind.Unspecified), "UTC", emergency: false);
        response.EnsureSuccessStatusCode();
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        var id = json.GetProperty("id").GetGuid();
        var version = json.GetProperty("version").GetString()!;

        Assert.Equal(HttpStatusCode.BadRequest, (await student.GetAsync($"/api/v1/live-sessions/{id}/join")).StatusCode);
        await ConfirmAsync(id);
        Assert.Equal(HttpStatusCode.BadRequest, (await student.GetAsync($"/api/v1/live-sessions/{id}/join")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/v1/live-sessions/{id}/join")).StatusCode);

        version = await VersionAsync(id);
        var upload = await UploadAsync(student, id, version);
        upload.EnsureSuccessStatusCode();
        var attachmentId = JsonDocument.Parse(await upload.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound,
            (await outsider.GetAsync($"/api/v1/live-sessions/attachments/{attachmentId}/content")).StatusCode);
        using var teacherDownload =
            await teacher.GetAsync($"/api/v1/live-sessions/attachments/{attachmentId}/content");
        Assert.Equal(HttpStatusCode.OK, teacherDownload.StatusCode);

        factory.Clock.SetUtcNow(start.AddMinutes(-10));
        var join = await student.GetAsync($"/api/v1/live-sessions/{id}/join");
        join.EnsureSuccessStatusCode();
        Assert.StartsWith("https://meet.local/session/", JsonDocument.Parse(
            await join.Content.ReadAsStringAsync()).RootElement.GetProperty("url").GetString());

        factory.Clock.SetUtcNow(start.AddMinutes(31));
        version = await VersionAsync(id);
        (await SendAsync(teacher, HttpMethod.Post, $"/api/v1/live-sessions/{id}/no-show",
            new { studentNoShow = true }, version)).EnsureSuccessStatusCode();
        await using var scope = factory.Services.CreateAsyncScope();
        Assert.Equal(LiveSessionStatus.StudentNoShow,
            await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().LiveSessionBookings
                .Where(x => x.Id == id).Select(x => x.Status).SingleAsync());
    }

    [Fact]
    public async Task Invalid_and_ambiguous_daylight_saving_times_are_rejected()
    {
        var data = await SeedAsync(addEasternRule: true);
        var student = await ClientForAsync(data.FirstStudent.Email);
        var response = await BookAsync(student, data.ServiceId,
            new DateTime(2027, 3, 14, 2, 30, 0, DateTimeKind.Unspecified),
            "Eastern Standard Time", emergency: false);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_local_time", await CodeAsync(response));
    }

    [Fact]
    public async Task Sql_server_session_constraint_index_and_rowversion_exist()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var constraints = await db.Database.SqlQueryRaw<string>(
            "SELECT name AS [Value] FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('LiveSessionBookings')")
            .ToArrayAsync();
        Assert.Contains("CK_LiveSessionBookings_Duration", constraints);
        Assert.Contains("CK_LiveSessionBookings_Price", constraints);
        var indexes = await db.Database.SqlQueryRaw<string>(
            "SELECT name AS [Value] FROM sys.indexes WHERE object_id=OBJECT_ID('LiveSessionBookings') AND name IS NOT NULL")
            .ToArrayAsync();
        Assert.Contains("IX_LiveSessionBookings_TeacherId_Status_StartsAt_EndsAt", indexes);
        Assert.True(await db.Database.SqlQueryRaw<int>(
            "SELECT COUNT(*) AS [Value] FROM sys.columns WHERE object_id=OBJECT_ID('LiveSessionBookings') AND name='RowVersion' AND system_type_id=189")
            .SingleAsync() == 1);
    }

    private async Task<SeedData> SeedAsync(bool addEasternRule = false)
    {
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var first = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var second = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var third = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var teacherZone = TimeZoneInfo.FindSystemTimeZoneById("Egypt Standard Time");
        var localDate = DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTime(factory.Clock.GetUtcNow().AddDays(2), teacherZone).DateTime);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Session Subject " + suffix, "code");
        var type = new ServiceCatalogItem("Live Session " + suffix, "Live explanation");
        var profile = new TeacherProfile(teacher.Id, factory.Clock.GetUtcNow());
        profile.Update("Live teacher", "Teacher profile for session tests.", "Egypt", "Cairo",
            "Egypt Standard Time", 10, factory.Clock.GetUtcNow());
        profile.Publish(factory.Clock.GetUtcNow());
        var service = new TeacherService(teacher.Id, subject.Id, type.Id, "Live explanation",
            "A private live explanation session.", 120, "SAR", 24, 0, factory.Clock.GetUtcNow());
        db.AddRange(subject, type, profile, service,
            new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()),
            new TeacherAvailabilityRule(teacher.Id, localDate.DayOfWeek,
                new TimeOnly(9, 0), new TimeOnly(15, 0), "Egypt Standard Time", 30));
        if (addEasternRule)
            db.Add(new TeacherAvailabilityRule(teacher.Id, DayOfWeek.Sunday,
                new TimeOnly(1, 0), new TimeOnly(4, 0), "Eastern Standard Time", 30));
        await db.SaveChangesAsync();
        return new(first, second, third, teacher, service.Id, localDate);
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static Task<HttpResponseMessage> BookAsync(
        HttpClient client, Guid serviceId, DateTime localStart, string timeZone, bool emergency) =>
        client.PostAsJsonAsync("/api/v1/live-sessions", new
        {
            teacherServiceId = serviceId,
            title = "Exam revision",
            notes = "Focus on the difficult examples.",
            localStart,
            studentTimeZoneId = timeZone,
            durationMinutes = 30,
            emergency
        });

    private static async Task<HttpResponseMessage> SendAsync(
        HttpClient client, HttpMethod method, string url, object? body, string version)
    {
        var request = new HttpRequestMessage(method, url);
        if (body is not null) request.Content = JsonContent.Create(body);
        request.Headers.TryAddWithoutValidation("If-Match", version);
        return await client.SendAsync(request);
    }

    private static async Task<HttpResponseMessage> UploadAsync(HttpClient client, Guid id, string version)
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.ASCII.GetBytes("%PDF-1.4\nSession notes"));
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        content.Add(file, "file", "session.pdf");
        var request = new HttpRequestMessage(HttpMethod.Post,
            $"/api/v1/live-sessions/{id}/attachments")
        { Content = content };
        request.Headers.TryAddWithoutValidation("If-Match", version);
        return await client.SendAsync(request);
    }

    private async Task ConfirmAsync(Guid id)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var booking = await db.LiveSessionBookings.SingleAsync(x => x.Id == id);
        booking.ConfirmPayment("mock-payment", factory.Clock.GetUtcNow());
        await db.SaveChangesAsync();
    }

    private async Task<string> VersionAsync(Guid id)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return Convert.ToBase64String(await db.LiveSessionBookings.AsNoTracking()
            .Where(x => x.Id == id).Select(x => x.RowVersion).SingleAsync());
    }

    private static async Task<string> CodeAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString()!;

    private sealed record SeedData(
        (string Id, string Email) FirstStudent,
        (string Id, string Email) SecondStudent,
        (string Id, string Email) ThirdStudent,
        (string Id, string Email) Teacher,
        Guid ServiceId,
        DateOnly LocalDate);
}
