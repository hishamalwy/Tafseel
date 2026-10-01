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
        Assert.All(bookings, x => Assert.Equal(HttpStatusCode.Created, x.StatusCode));
        var teacher = await ClientForAsync(data.Teacher.Email);
        var winner = first;
        var winnerJson = JsonDocument.Parse(await bookings[0].Content.ReadAsStringAsync()).RootElement;
        var winnerId = winnerJson.GetProperty("id").GetGuid();
        var otherJson = JsonDocument.Parse(await bookings[1].Content.ReadAsStringAsync()).RootElement;
        var otherId = otherJson.GetProperty("id").GetGuid();
        Assert.Equal(50m, winnerJson.GetProperty("emergencyPremiumPercent").GetDecimal());
        (await RespondAsync(teacher, winnerId, true, await VersionAsync(winnerId))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict,
            (await RespondAsync(teacher, otherId, true, await VersionAsync(otherId))).StatusCode);

        var adjacentLocal = slots[1].GetProperty("studentLocalStart").GetDateTime();
        var adjacent = await BookAsync(third, data.ServiceId, adjacentLocal, "Pacific Standard Time", emergency: false);
        adjacent.EnsureSuccessStatusCode();
        var adjacentJson = JsonDocument.Parse(await adjacent.Content.ReadAsStringAsync()).RootElement;
        var adjacentId = adjacentJson.GetProperty("id").GetGuid();
        (await RespondAsync(teacher, adjacentId, true, await VersionAsync(adjacentId))).EnsureSuccessStatusCode();
        var adjacentVersion = await VersionAsync(adjacentId);

        var conflict = await SendAsync(winner, HttpMethod.Post,
            $"/api/v1/live-sessions/{winnerId}/reschedule",
            new { localStart = adjacentLocal, timeZoneId = "Pacific Standard Time" },
            await VersionAsync(winnerId));
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
        (await RespondAsync(teacher, id, true, version)).EnsureSuccessStatusCode();
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

        // The 30-minute session ends at start+30; a no-show can be claimed only after the
        // 15-minute grace period, only by a participant, and then awaits settlement.
        factory.Clock.SetUtcNow(start.AddMinutes(31));
        version = await VersionAsync(id);
        Assert.Equal(HttpStatusCode.Conflict, (await SendAsync(teacher, HttpMethod.Post,
            $"/api/v1/live-sessions/{id}/no-show", new { studentNoShow = true }, version)).StatusCode);

        factory.Clock.SetUtcNow(start.AddMinutes(45));
        version = await VersionAsync(id);
        Assert.Equal(HttpStatusCode.NotFound, (await SendAsync(outsider, HttpMethod.Post,
            $"/api/v1/live-sessions/{id}/no-show", new { studentNoShow = false }, version)).StatusCode);
        (await SendAsync(teacher, HttpMethod.Post, $"/api/v1/live-sessions/{id}/no-show",
            new { studentNoShow = true }, version)).EnsureSuccessStatusCode();
        await using var scope = factory.Services.CreateAsyncScope();
        Assert.Equal(LiveSessionStatus.StudentNoShowPending,
            await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().LiveSessionBookings
                .Where(x => x.Id == id).Select(x => x.Status).SingleAsync());
    }

    // PreProduction closure: JaaS signs each participant's token on the server with the account's RSA key, read
    // from a file outside the site. Only the two participants get one, only for this room, only in the window.
    [Fact]
    public async Task Jaas_join_signs_each_participant_for_one_room_and_never_returns_the_key()
    {
        using var key = System.Security.Cryptography.RSA.Create(2048);
        var pem = key.ExportRSAPrivateKeyPem();
        var keyFile = Path.Combine(Path.GetTempPath(), $"tafseel-jaas-{Guid.NewGuid():N}.pem");
        await File.WriteAllTextAsync(keyFile, pem);
        const string appId = "vpaas-magic-cookie-tafseeltest";
        try
        {
            await using var jaas = factory.WithWebHostBuilder(builder =>
            {
                builder.UseSetting("LiveSessions:Provider", "JaaS");
                builder.UseSetting("JaaS:AppId", appId);
                builder.UseSetting("JaaS:KeyId", appId + "/tafseel-test-key");
                builder.UseSetting("JaaS:PrivateKeyPem", "");
                builder.UseSetting("JaaS:PrivateKeyPath", keyFile);
                builder.UseSetting("JaaS:StaticJwt", "");
            });
            var data = await SeedAsync();
            var student = await ClientForAsync(data.FirstStudent.Email, jaas);
            var outsider = await ClientForAsync(data.SecondStudent.Email, jaas);
            var teacher = await ClientForAsync(data.Teacher.Email, jaas);
            var localDate = data.LocalDate.ToString("yyyy-MM-dd");
            var slots = JsonDocument.Parse(await jaas.CreateClient().GetStringAsync(
                $"/api/v1/live-sessions/teachers/{data.Teacher.Id}/slots?from={localDate}" +
                "&days=1&durationMinutes=30&studentTimeZoneId=UTC")).RootElement.EnumerateArray().ToArray();
            var start = slots[0].GetProperty("startsAt").GetDateTimeOffset();
            var otherStart = slots[^1].GetProperty("startsAt").GetDateTimeOffset();

            async Task<Guid> ConfirmedAsync(DateTimeOffset at)
            {
                var booked = await BookAsync(student, data.ServiceId,
                    DateTime.SpecifyKind(at.UtcDateTime, DateTimeKind.Unspecified), "UTC", emergency: false);
                booked.EnsureSuccessStatusCode();
                var json = JsonDocument.Parse(await booked.Content.ReadAsStringAsync()).RootElement;
                var bookingId = json.GetProperty("id").GetGuid();
                (await RespondAsync(teacher, bookingId, true, json.GetProperty("version").GetString()!)).EnsureSuccessStatusCode();
                await ConfirmAsync(bookingId);
                return bookingId;
            }

            var id = await ConfirmedAsync(start);
            var cancelledId = await ConfirmedAsync(otherStart);
            // Cancelled after it was confirmed (the refund path is covered elsewhere; this booking was never charged).
            await using (var scope = factory.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
                var booking = await db.LiveSessionBookings.SingleAsync(x => x.Id == cancelledId);
                booking.Cancel(data.Teacher.Id, factory.Clock.GetUtcNow());
                await db.SaveChangesAsync();
                Assert.Equal(LiveSessionStatus.Cancelled, booking.Status);
            }

            factory.Clock.SetUtcNow(start.AddMinutes(-10));
            var studentJoin = await student.GetAsync($"/api/v1/live-sessions/{id}/join");
            var teacherJoin = await teacher.GetAsync($"/api/v1/live-sessions/{id}/join");
            studentJoin.EnsureSuccessStatusCode();
            teacherJoin.EnsureSuccessStatusCode();
            var studentBody = await studentJoin.Content.ReadAsStringAsync();
            var teacherBody = await teacherJoin.Content.ReadAsStringAsync();
            foreach (var body in new[] { studentBody, teacherBody })
            {
                Assert.DoesNotContain("PRIVATE KEY", body);
                Assert.DoesNotContain(pem.Split('\n')[1].Trim(), body);
                Assert.DoesNotContain(keyFile, body);
            }

            var studentLink = JsonDocument.Parse(studentBody).RootElement;
            var teacherLink = JsonDocument.Parse(teacherBody).RootElement;
            var room = studentLink.GetProperty("roomName").GetString()!;
            Assert.Equal(room, teacherLink.GetProperty("roomName").GetString());
            Assert.StartsWith(appId + "/tafseel", room);
            Assert.Equal($"https://8x8.vc/{room}", studentLink.GetProperty("url").GetString());
            Claims(studentLink.GetProperty("jwt").GetString()!, data.FirstStudent.Id, moderator: false);
            Claims(teacherLink.GetProperty("jwt").GetString()!, data.Teacher.Id, moderator: true);

            Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/v1/live-sessions/{id}/join")).StatusCode);
            var cancelled = await student.GetAsync($"/api/v1/live-sessions/{cancelledId}/join");
            Assert.Equal(HttpStatusCode.BadRequest, cancelled.StatusCode);
            Assert.Equal("session_not_confirmed", await CodeAsync(cancelled));

            factory.Clock.SetUtcNow(start.AddMinutes(-16));
            var early = await student.GetAsync($"/api/v1/live-sessions/{id}/join");
            Assert.Equal("join_window_closed", await CodeAsync(early));
            factory.Clock.SetUtcNow(start.AddMinutes(30 + 16));
            var late = await teacher.GetAsync($"/api/v1/live-sessions/{id}/join");
            Assert.Equal("join_window_closed", await CodeAsync(late));

            void Claims(string token, string userId, bool moderator)
            {
                var parts = token.Split('.');
                Assert.Equal(3, parts.Length);
                Assert.True(key.VerifyData(Encoding.UTF8.GetBytes(parts[0] + "." + parts[1]), Base64Url(parts[2]),
                    System.Security.Cryptography.HashAlgorithmName.SHA256, System.Security.Cryptography.RSASignaturePadding.Pkcs1));
                using var header = JsonDocument.Parse(Base64Url(parts[0]));
                using var payload = JsonDocument.Parse(Base64Url(parts[1]));
                Assert.Equal("RS256", header.RootElement.GetProperty("alg").GetString());
                Assert.Equal(appId + "/tafseel-test-key", header.RootElement.GetProperty("kid").GetString());
                Assert.Equal("jitsi", payload.RootElement.GetProperty("aud").GetString());
                Assert.Equal(appId, payload.RootElement.GetProperty("sub").GetString());
                Assert.Equal(room.Split('/')[1], payload.RootElement.GetProperty("room").GetString());
                Assert.Equal(start.AddMinutes(30 + 15).ToUnixTimeSeconds(), payload.RootElement.GetProperty("exp").GetInt64());
                var user = payload.RootElement.GetProperty("context").GetProperty("user");
                Assert.Equal(userId, user.GetProperty("id").GetString());
                Assert.Equal(moderator, user.GetProperty("moderator").GetBoolean());
            }
        }
        finally
        {
            File.Delete(keyFile);
        }

        static byte[] Base64Url(string value) => Convert.FromBase64String(
            value.Replace('-', '+').Replace('_', '/').PadRight((value.Length + 3) / 4 * 4, '='));
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
        var type = await db.ServiceCatalogItems.AsTracking().FirstOrDefaultAsync(x => x.Code == "live_session");
        if (type is null)
        {
            type = new ServiceCatalogItem(
                "Live Session", "Live explanation", "live_session", "جلسة مباشرة", "شرح مباشر");
            db.Add(type);
        }
        else if (!type.IsActive)
            type.SetActive(true);
        var profile = new TeacherProfile(teacher.Id, factory.Clock.GetUtcNow());
        profile.Update("Live teacher", "Teacher profile for session tests.", "Egypt", "Cairo",
            "Egypt Standard Time", 10, factory.Clock.GetUtcNow());
        profile.Publish(TeacherProfileReadiness.Ready, factory.Clock.GetUtcNow());
        var service = new TeacherService(teacher.Id, subject.Id, type.Id, "Live explanation",
            "A private live explanation session.", 120, "SAR", 24, 0, factory.Clock.GetUtcNow());
        db.AddRange(subject, profile, service,
            new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()),
            new TeacherAvailabilityRule(teacher.Id, localDate.DayOfWeek,
                new TimeOnly(9, 0), new TimeOnly(15, 0), "Egypt Standard Time", 30));
        if (addEasternRule)
            db.Add(new TeacherAvailabilityRule(teacher.Id, DayOfWeek.Sunday,
                new TimeOnly(1, 0), new TimeOnly(4, 0), "Eastern Standard Time", 30));
        await db.SaveChangesAsync();
        return new(first, second, third, teacher, service.Id, localDate);
    }

    private async Task<HttpClient> ClientForAsync(string email,
        Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program>? host = null)
    {
        var client = (host ?? factory).CreateClient();
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

    private static Task<HttpResponseMessage> RespondAsync(
        HttpClient client, Guid id, bool accept, string version) =>
        SendAsync(client, HttpMethod.Post, $"/api/v1/live-sessions/{id}/request/respond",
            new { accept }, version);

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

    private const string WebhookSecret = "integration-tests-only-payment-webhook-secret";

    private async Task ConfirmAsync(Guid id)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var booking = await db.LiveSessionBookings.SingleAsync(x => x.Id == id);
        booking.ConfirmPayment("mock-payment", factory.Clock.GetUtcNow());
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Live_session_payment_initiation_and_webhook_confirm_booking()
    {
        var data = await SeedAsync();
        var student = await ClientForAsync(data.FirstStudent.Email);
        var localDate = data.LocalDate.ToString("yyyy-MM-dd");
        var slot = JsonDocument.Parse(await factory.CreateClient().GetStringAsync(
            $"/api/v1/live-sessions/teachers/{data.Teacher.Id}/slots?from={localDate}" +
            "&days=1&durationMinutes=30&studentTimeZoneId=UTC")).RootElement.EnumerateArray().First();
        var start = slot.GetProperty("startsAt").GetDateTimeOffset();
        var booked = await BookAsync(
            student, data.ServiceId,
            DateTime.SpecifyKind(start.UtcDateTime, DateTimeKind.Unspecified), "UTC", emergency: false);
        booked.EnsureSuccessStatusCode();
        var bookingId = JsonDocument.Parse(await booked.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();

        var blocked = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/live-sessions/{bookingId}");
        blocked.Headers.TryAddWithoutValidation("Idempotency-Key", "live-blocked-" + bookingId);
        var blockedResponse = await student.SendAsync(blocked);
        Assert.Equal(HttpStatusCode.BadRequest, blockedResponse.StatusCode);
        Assert.Equal("payment_not_allowed", await CodeAsync(blockedResponse));
        var teacher = await ClientForAsync(data.Teacher.Email);
        var outsider = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var outsiderTeacher = await ClientForAsync(outsider.Email);
        var version = await VersionAsync(bookingId);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await RespondAsync(student, bookingId, true, version)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await RespondAsync(outsiderTeacher, bookingId, true, version)).StatusCode);
        (await RespondAsync(teacher, bookingId, true, await VersionAsync(bookingId))).EnsureSuccessStatusCode();

        var initiate = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/live-sessions/{bookingId}");
        initiate.Headers.TryAddWithoutValidation("Idempotency-Key", "live-pay-" + bookingId);
        var initiation = await student.SendAsync(initiate);
        initiation.EnsureSuccessStatusCode();
        var paymentJson = JsonDocument.Parse(await initiation.Content.ReadAsStringAsync()).RootElement
            .GetProperty("payment");
        Assert.Equal(bookingId, paymentJson.GetProperty("liveSessionBookingId").GetGuid());
        Assert.True(paymentJson.GetProperty("orderId").ValueKind is JsonValueKind.Null or JsonValueKind.Undefined);
        var reference = paymentJson.GetProperty("providerReference").GetString()!;
        var amount = paymentJson.GetProperty("amount").GetDecimal();
        var currency = paymentJson.GetProperty("currency").GetString()!;

        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            eventId = "live-event-" + bookingId,
            providerReference = reference,
            amount,
            currency,
            succeeded = true
        });
        var signature = Convert.ToHexString(
            System.Security.Cryptography.HMACSHA256.HashData(Encoding.UTF8.GetBytes(WebhookSecret), payload));
        var webhook = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/mock")
        {
            Content = new ByteArrayContent(payload)
        };
        webhook.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        webhook.Headers.TryAddWithoutValidation("X-Mock-Signature", signature);
        (await factory.CreateClient().SendAsync(webhook)).EnsureSuccessStatusCode();

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(LiveSessionStatus.Confirmed,
            await db.LiveSessionBookings.Where(x => x.Id == bookingId).Select(x => x.Status).SingleAsync());
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
