using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>
/// Wave 3B: the order, open-request and live-session screens show actions from server state.
/// These prove that the server refuses the same actions from the wrong participant or an
/// outsider, so hiding a button is never the only protection.
/// </summary>
[Trait("Category", "SqlServer")]
public sealed class Wave3BFulfilmentAuthorizationTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    private const string WebhookSecret = "integration-tests-only-payment-webhook-secret";

    [Fact]
    public async Task Order_payment_fulfilment_and_review_refuse_outsiders_and_the_wrong_participant()
    {
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var data = await SeedOrderAsync();
        var student = await ClientAsync(data.Student.Email);
        var outsiderStudent = await ClientAsync(data.OtherStudent.Email);
        var teacher = await ClientAsync(data.Teacher.Email);
        var outsiderTeacher = await ClientAsync(data.OtherTeacher.Email);

        var created = await student.PostAsJsonAsync("/api/v1/learning-requests", new
        {
            teacherServiceId = data.ServiceId,
            title = "Explain chapter six",
            description = "Please explain every example in the supplied chapter.",
            preferredDeliveryAt = DateTimeOffset.UtcNow.AddDays(3),
            budget = 120m
        });
        created.EnsureSuccessStatusCode();
        var request = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement;
        var accepted = await SendAsync(teacher, HttpMethod.Post,
            $"/api/v1/learning-requests/{request.GetProperty("id").GetGuid()}/accept",
            new { finalPrice = 100m, currency = "SAR", agreedDeliveryAt = DateTimeOffset.UtcNow.AddDays(2), revisionAllowance = 1 },
            request.GetProperty("version").GetString()!, "wave3b-accept");
        accepted.EnsureSuccessStatusCode();
        var orderId = JsonDocument.Parse(await accepted.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();

        // Reading and paying the order belong to its student only.
        Assert.Equal(HttpStatusCode.NotFound, (await outsiderStudent.GetAsync($"/api/v1/orders/{orderId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsiderTeacher.GetAsync($"/api/v1/orders/{orderId}")).StatusCode);
        var outsiderPayment = await InitiateAsync(outsiderStudent, $"/api/v1/payments/orders/{orderId}", "wave3b-outsider-pay");
        Assert.True(outsiderPayment.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden,
            $"outsider payment returned {(int)outsiderPayment.StatusCode}");
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            Assert.False(await db.Payments.AnyAsync(x => x.OrderId == orderId));
        }

        await PayAsync(student, $"/api/v1/payments/orders/{orderId}", "wave3b-order-pay");
        var paid = JsonDocument.Parse(await student.GetStringAsync($"/api/v1/orders/{orderId}")).RootElement;
        // Payment alone does not start the work: the order waits for the teacher.
        Assert.Equal((int)OrderStatus.AwaitingPayment, paid.GetProperty("status").GetInt32());
        Assert.Equal((int)OrderPaymentStatus.Paid, paid.GetProperty("paymentStatus").GetInt32());

        Assert.Equal(HttpStatusCode.Forbidden,
            (await SendAsync(student, HttpMethod.Post, $"/api/v1/orders/{orderId}/start", null, await OrderVersionAsync(orderId))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await SendAsync(outsiderTeacher, HttpMethod.Post, $"/api/v1/orders/{orderId}/start", null, await OrderVersionAsync(orderId))).StatusCode);
        (await SendAsync(teacher, HttpMethod.Post, $"/api/v1/orders/{orderId}/start", null, await OrderVersionAsync(orderId)))
            .EnsureSuccessStatusCode();
        (await UploadAsync(teacher, $"/api/v1/orders/{orderId}/deliveries", await OrderVersionAsync(orderId), "files", "delivery.pdf", "message", "Done"))
            .EnsureSuccessStatusCode();

        // Revision and completion are the order's student's decisions.
        var version = await OrderVersionAsync(orderId);
        Assert.Equal(HttpStatusCode.NotFound, (await SendAsync(outsiderStudent, HttpMethod.Post,
            $"/api/v1/orders/{orderId}/revision", new { reason = "Not my order." }, version)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await SendAsync(teacher, HttpMethod.Post,
            $"/api/v1/orders/{orderId}/revision", new { reason = "Teacher cannot ask." }, version)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await SendAsync(outsiderStudent, HttpMethod.Post,
            $"/api/v1/orders/{orderId}/complete", null, version)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await SendAsync(teacher, HttpMethod.Post,
            $"/api/v1/orders/{orderId}/complete", null, version)).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var order = await db.Orders.AsNoTracking().SingleAsync(x => x.Id == orderId);
            Assert.Equal(OrderStatus.Delivered, order.Status);
            Assert.Equal(0, order.RevisionsUsed);
        }

        (await SendAsync(student, HttpMethod.Post, $"/api/v1/orders/{orderId}/complete", null, version))
            .EnsureSuccessStatusCode();

        var review = new
        {
            explanationClarity = 5,
            subjectKnowledge = 5,
            communication = 4,
            onTimeDelivery = 5,
            valueForMoney = 4,
            comment = "Clear and on time.",
            recommends = true
        };
        Assert.Equal(HttpStatusCode.NotFound,
            (await outsiderStudent.PostAsJsonAsync($"/api/v1/orders/{orderId}/review", review)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await teacher.PostAsJsonAsync($"/api/v1/orders/{orderId}/review", review)).StatusCode);
        (await student.PostAsJsonAsync($"/api/v1/orders/{orderId}/review", review)).EnsureSuccessStatusCode();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            Assert.Equal(1, await db.TeacherReviews.CountAsync(x => x.OrderId == orderId));
        }
    }

    [Fact]
    public async Task Open_request_offers_selection_and_reserved_payment_belong_to_their_owners()
    {
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var data = await SeedOpenAsync();
        var student = await ClientAsync(data.Student.Email);
        var outsiderStudent = await ClientAsync(data.OtherStudent.Email);
        var teacherA = await ClientAsync(data.TeacherA.Email);
        var teacherB = await ClientAsync(data.TeacherB.Email);

        var publish = await student.PostAsJsonAsync("/api/v1/open-marketplace/requests", new
        {
            subjectId = data.SubjectId,
            serviceCatalogItemId = data.CatalogId,
            title = "Explain the integration chapter",
            requirements = "Explain each worked example step by step.",
            deadline = factory.Clock.GetUtcNow().AddDays(3),
            budgetMin = 80m,
            budgetMax = 160m
        });
        publish.EnsureSuccessStatusCode();
        var requestId = JsonDocument.Parse(await publish.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();

        var offerResponse = await teacherA.PostAsJsonAsync($"/api/v1/open-marketplace/opportunities/{requestId}/offers",
            new { amount = 120m, deliveryHours = 48, includedRevisions = 2, validityHours = 72, message = "Worked examples included." });
        offerResponse.EnsureSuccessStatusCode();
        var offer = JsonDocument.Parse(await offerResponse.Content.ReadAsStringAsync()).RootElement;
        var offerId = offer.GetProperty("id").GetGuid();
        var offerVersion = offer.GetProperty("version").GetString()!;
        var edit = new { amount = 90m, deliveryHours = 24, includedRevisions = 1, validityHours = 72, message = "Rewritten by someone else." };

        // Another teacher can neither rewrite nor withdraw the offer.
        Assert.Equal(HttpStatusCode.NotFound,
            (await SendAsync(teacherB, HttpMethod.Put, $"/api/v1/open-marketplace/offers/{offerId}", edit, offerVersion)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await SendAsync(teacherB, HttpMethod.Post, $"/api/v1/open-marketplace/offers/{offerId}/withdraw", null, offerVersion)).StatusCode);

        // Another student cannot read the request, its offers, select or pay for it; a teacher cannot read the student view.
        Assert.Equal(HttpStatusCode.NotFound, (await outsiderStudent.GetAsync($"/api/v1/open-marketplace/requests/{requestId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsiderStudent.GetAsync($"/api/v1/open-marketplace/requests/{requestId}/offers")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await teacherA.GetAsync($"/api/v1/open-marketplace/requests/{requestId}/offers")).StatusCode);
        var requestVersion = JsonDocument.Parse(await student.GetStringAsync($"/api/v1/open-marketplace/requests/{requestId}"))
            .RootElement.GetProperty("version").GetString()!;
        Assert.Equal(HttpStatusCode.NotFound, (await SelectAsync(outsiderStudent, requestId, offerId, requestVersion, offerVersion)).StatusCode);

        // Nothing is payable before a selection, and no order exists.
        var early = await InitiateAsync(student, $"/api/v1/payments/open-requests/{requestId}", "wave3b-open-early");
        Assert.False(early.IsSuccessStatusCode);
        Assert.False((await student.GetAsync($"/api/v1/payments/open-requests/{requestId}/quote")).IsSuccessStatusCode);

        (await SelectAsync(student, requestId, offerId, requestVersion, offerVersion)).EnsureSuccessStatusCode();

        // A selected offer is reserved: its teacher can no longer edit or withdraw it.
        var selectedVersion = JsonDocument.Parse(await teacherA.GetStringAsync($"/api/v1/open-marketplace/requests/{requestId}/my-offer"))
            .RootElement.GetProperty("version").GetString()!;
        Assert.False((await SendAsync(teacherA, HttpMethod.Put, $"/api/v1/open-marketplace/offers/{offerId}", edit, selectedVersion)).IsSuccessStatusCode);
        Assert.False((await SendAsync(teacherA, HttpMethod.Post, $"/api/v1/open-marketplace/offers/{offerId}/withdraw", null, selectedVersion)).IsSuccessStatusCode);

        Assert.Equal(HttpStatusCode.OK, (await student.GetAsync($"/api/v1/payments/open-requests/{requestId}/quote")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsiderStudent.GetAsync(
            $"/api/v1/payments/open-requests/{requestId}/quote")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await teacherA.GetAsync(
            $"/api/v1/payments/open-requests/{requestId}/quote")).StatusCode);

        var outsiderPayment = await InitiateAsync(outsiderStudent, $"/api/v1/payments/open-requests/{requestId}", "wave3b-open-outsider");
        Assert.True(outsiderPayment.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden,
            $"outsider payment returned {(int)outsiderPayment.StatusCode}");
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            Assert.False(await db.Orders.AnyAsync(x => x.LearningRequestId == requestId));
            var stored = await db.TeacherOffers.AsNoTracking().SingleAsync(x => x.Id == offerId);
            Assert.Equal(TeacherOfferStatus.Selected, stored.Status);
            Assert.Equal(120m, stored.Amount);
        }

        await PayAsync(student, $"/api/v1/payments/open-requests/{requestId}", "wave3b-open-pay");
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var order = Assert.Single(await db.Orders.AsNoTracking().Where(x => x.LearningRequestId == requestId).ToArrayAsync());
            Assert.Equal(data.TeacherA.Id, order.TeacherId);
            Assert.Equal(OrderPaymentStatus.Paid, order.PaymentStatus);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await outsiderStudent.GetAsync($"/api/v1/learning-requests/{requestId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await teacherB.GetAsync($"/api/v1/learning-requests/{requestId}")).StatusCode);
    }

    [Fact]
    public async Task Live_session_completion_and_no_show_settlement_follow_the_participant_rules()
    {
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var data = await SeedSessionAsync();
        var studentA = await ClientAsync(data.StudentA.Email);
        var studentB = await ClientAsync(data.StudentB.Email);
        var teacher = await ClientAsync(data.Teacher.Email);
        var slots = JsonDocument.Parse(await factory.CreateClient().GetStringAsync(
            $"/api/v1/live-sessions/teachers/{data.Teacher.Id}/slots?from={data.LocalDate:yyyy-MM-dd}" +
            "&days=1&durationMinutes=30&studentTimeZoneId=UTC")).RootElement.EnumerateArray().ToArray();
        Assert.True(slots.Length >= 2);
        var completedId = await BookAndPayAsync(studentA, teacher, data.ServiceId, slots[0].GetProperty("startsAt").GetDateTimeOffset());
        var noShowId = await BookAndPayAsync(studentB, teacher, data.ServiceId, slots[1].GetProperty("startsAt").GetDateTimeOffset());

        // Before the end, the teacher cannot claim completion.
        factory.Clock.SetUtcNow(slots[0].GetProperty("startsAt").GetDateTimeOffset().AddMinutes(20));
        Assert.Equal(HttpStatusCode.Conflict, (await SendAsync(teacher, HttpMethod.Post,
            $"/api/v1/live-sessions/{completedId}/complete", null, await SessionVersionAsync(completedId))).StatusCode);

        factory.Clock.SetUtcNow(slots[1].GetProperty("startsAt").GetDateTimeOffset().AddMinutes(46));

        // Completion: only the teacher requests it, only the student confirms it.
        Assert.Equal(HttpStatusCode.NotFound, (await SendAsync(studentA, HttpMethod.Post,
            $"/api/v1/live-sessions/{completedId}/complete", null, await SessionVersionAsync(completedId))).StatusCode);
        (await SendAsync(teacher, HttpMethod.Post, $"/api/v1/live-sessions/{completedId}/complete", null,
            await SessionVersionAsync(completedId))).EnsureSuccessStatusCode();
        Assert.Equal(LiveSessionStatus.CompletionPending, await SessionStatusAsync(completedId));
        Assert.Equal(HttpStatusCode.Conflict, (await SendAsync(teacher, HttpMethod.Post,
            $"/api/v1/live-sessions/{completedId}/settlement/confirm", null, await SessionVersionAsync(completedId))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await SendAsync(studentB, HttpMethod.Post,
            $"/api/v1/live-sessions/{completedId}/settlement/confirm", null, await SessionVersionAsync(completedId))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await studentB.GetAsync($"/api/v1/live-sessions/{completedId}/join")).StatusCode);
        (await SendAsync(studentA, HttpMethod.Post, $"/api/v1/live-sessions/{completedId}/settlement/confirm", null,
            await SessionVersionAsync(completedId))).EnsureSuccessStatusCode();
        Assert.Equal(LiveSessionStatus.Completed, await SessionStatusAsync(completedId));

        // Teacher no-show: only the student claims it, and only the accused teacher confirms it.
        Assert.Equal(HttpStatusCode.NotFound, (await SendAsync(teacher, HttpMethod.Post,
            $"/api/v1/live-sessions/{noShowId}/no-show", new { studentNoShow = false }, await SessionVersionAsync(noShowId))).StatusCode);
        (await SendAsync(studentB, HttpMethod.Post, $"/api/v1/live-sessions/{noShowId}/no-show",
            new { studentNoShow = false }, await SessionVersionAsync(noShowId))).EnsureSuccessStatusCode();
        Assert.Equal(LiveSessionStatus.TeacherNoShowPending, await SessionStatusAsync(noShowId));
        Assert.Equal(HttpStatusCode.Conflict, (await SendAsync(studentB, HttpMethod.Post,
            $"/api/v1/live-sessions/{noShowId}/settlement/confirm", null, await SessionVersionAsync(noShowId))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await SendAsync(studentA, HttpMethod.Post,
            $"/api/v1/live-sessions/{noShowId}/settlement/confirm", null, await SessionVersionAsync(noShowId))).StatusCode);
        (await SendAsync(teacher, HttpMethod.Post, $"/api/v1/live-sessions/{noShowId}/settlement/confirm", null,
            await SessionVersionAsync(noShowId))).EnsureSuccessStatusCode();
        Assert.Equal(LiveSessionStatus.TeacherNoShow, await SessionStatusAsync(noShowId));
    }

    private async Task<Guid> BookAndPayAsync(HttpClient student, HttpClient teacher, Guid serviceId, DateTimeOffset start)
    {
        var booked = await student.PostAsJsonAsync("/api/v1/live-sessions", new
        {
            teacherServiceId = serviceId,
            title = "Exam revision",
            notes = "Focus on the difficult examples.",
            localStart = DateTime.SpecifyKind(start.UtcDateTime, DateTimeKind.Unspecified),
            studentTimeZoneId = "UTC",
            durationMinutes = 30,
            emergency = false
        });
        booked.EnsureSuccessStatusCode();
        var id = JsonDocument.Parse(await booked.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        (await SendAsync(teacher, HttpMethod.Post, $"/api/v1/live-sessions/{id}/request/respond",
            new { accept = true }, await SessionVersionAsync(id))).EnsureSuccessStatusCode();
        await PayAsync(student, $"/api/v1/payments/live-sessions/{id}", "wave3b-session-" + id);
        Assert.Equal(LiveSessionStatus.Confirmed, await SessionStatusAsync(id));
        return id;
    }

    private static async Task<HttpResponseMessage> InitiateAsync(HttpClient client, string url, string key)
    {
        var initiate = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonContent.Create(new { }) };
        initiate.Headers.TryAddWithoutValidation("Idempotency-Key", key);
        return await client.SendAsync(initiate);
    }

    private async Task PayAsync(HttpClient student, string url, string key)
    {
        var initiated = await InitiateAsync(student, url, key);
        Assert.True(initiated.IsSuccessStatusCode, await initiated.Content.ReadAsStringAsync());
        var payment = JsonDocument.Parse(await initiated.Content.ReadAsStringAsync()).RootElement.GetProperty("payment");
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            eventId = "wave3b-event-" + key,
            providerReference = payment.GetProperty("providerReference").GetString(),
            amount = payment.GetProperty("amount").GetDecimal(),
            currency = payment.GetProperty("currency").GetString(),
            succeeded = true
        });
        var signature = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(WebhookSecret), payload));
        var callback = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/mock")
        {
            Content = new ByteArrayContent(payload)
        };
        callback.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        callback.Headers.TryAddWithoutValidation("X-Mock-Signature", signature);
        (await factory.CreateClient().SendAsync(callback)).EnsureSuccessStatusCode();
    }

    private static async Task<HttpResponseMessage> SelectAsync(
        HttpClient client, Guid requestId, Guid offerId, string requestVersion, string offerVersion)
    {
        var select = new HttpRequestMessage(HttpMethod.Post,
            $"/api/v1/open-marketplace/requests/{requestId}/offers/{offerId}/select");
        select.Headers.TryAddWithoutValidation("If-Match", requestVersion);
        select.Headers.TryAddWithoutValidation("X-Offer-Version", offerVersion);
        return await client.SendAsync(select);
    }

    private static async Task<HttpResponseMessage> SendAsync(
        HttpClient client, HttpMethod method, string url, object? body, string version, string? key = null)
    {
        var request = new HttpRequestMessage(method, url);
        if (body is not null) request.Content = JsonContent.Create(body);
        request.Headers.TryAddWithoutValidation("If-Match", version);
        if (key is not null) request.Headers.TryAddWithoutValidation("Idempotency-Key", key);
        return await client.SendAsync(request);
    }

    private static async Task<HttpResponseMessage> UploadAsync(
        HttpClient client, string url, string version, string field, string fileName, string textField, string text)
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.ASCII.GetBytes("%PDF-1.4\nWave 3B delivery"));
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        content.Add(file, field, fileName);
        content.Add(new StringContent(text), textField);
        var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
        request.Headers.TryAddWithoutValidation("If-Match", version);
        return await client.SendAsync(request);
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private async Task<string> OrderVersionAsync(Guid orderId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return Convert.ToBase64String(await db.Orders.AsNoTracking()
            .Where(x => x.Id == orderId).Select(x => x.RowVersion).SingleAsync());
    }

    private async Task<string> SessionVersionAsync(Guid id)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return Convert.ToBase64String(await db.LiveSessionBookings.AsNoTracking()
            .Where(x => x.Id == id).Select(x => x.RowVersion).SingleAsync());
    }

    private async Task<LiveSessionStatus> SessionStatusAsync(Guid id)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().LiveSessionBookings
            .AsNoTracking().Where(x => x.Id == id).Select(x => x.Status).SingleAsync();
    }

    private TeacherProfile PublishedProfile(string teacherId, string name)
    {
        var profile = new TeacherProfile(teacherId, factory.Clock.GetUtcNow());
        profile.Update(name, "Teacher profile for Wave 3B authorization tests.", "Egypt", "Cairo",
            "Egypt Standard Time", 10, factory.Clock.GetUtcNow());
        profile.Publish(TeacherProfileReadiness.Ready, factory.Clock.GetUtcNow());
        return profile;
    }

    private async Task<OrderSeed> SeedOrderAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var otherStudent = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var otherTeacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Wave3B Order Subject " + suffix, "code");
        var type = new ServiceCatalogItem("Wave3B Service " + suffix, "Explanation", "w3b_" + suffix, "خدمة", "شرح");
        var service = new TeacherService(teacher.Id, subject.Id, type.Id, "Custom explanation",
            "A custom explanation for the supplied files.", 100, "SAR", 24, 1, factory.Clock.GetUtcNow());
        db.AddRange(subject, type, PublishedProfile(teacher.Id, "Order teacher"), service,
            new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()));
        await db.SaveChangesAsync();
        return new(student, otherStudent, teacher, otherTeacher, service.Id);
    }

    private async Task<OpenSeed> SeedOpenAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var otherStudent = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacherA = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var teacherB = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Wave3B Open Subject " + suffix, "book", "مادة");
        var catalog = new ServiceCatalogItem("Wave3B Open " + suffix, "Async explanation", "w3bo_" + suffix, "شرح", "شرح غير متزامن");
        db.AddRange(subject, catalog,
            PublishedProfile(teacherA.Id, "Open teacher A"), PublishedProfile(teacherB.Id, "Open teacher B"),
            new TeacherSubjectQualification(teacherA.Id, subject.Id, factory.Clock.GetUtcNow()),
            new TeacherSubjectQualification(teacherB.Id, subject.Id, factory.Clock.GetUtcNow()),
            new TeacherService(teacherA.Id, subject.Id, catalog.Id, "Explanation A", "Detailed work", 100, "SAR", 48, 2, factory.Clock.GetUtcNow()),
            new TeacherService(teacherB.Id, subject.Id, catalog.Id, "Explanation B", "Fast work", 120, "SAR", 24, 1, factory.Clock.GetUtcNow()));
        await db.SaveChangesAsync();
        return new(student, otherStudent, teacherA, teacherB, subject.Id, catalog.Id);
    }

    private async Task<SessionSeed> SeedSessionAsync()
    {
        var studentA = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var studentB = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var zone = TimeZoneInfo.FindSystemTimeZoneById("Egypt Standard Time");
        var localDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(factory.Clock.GetUtcNow().AddDays(2), zone).DateTime);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var subject = new Subject("Wave3B Session Subject " + Guid.NewGuid().ToString("N"), "code");
        var type = await db.ServiceCatalogItems.AsTracking().FirstOrDefaultAsync(x => x.Code == "live_session");
        if (type is null)
        {
            type = new ServiceCatalogItem("Live Session", "Live explanation", "live_session", "جلسة مباشرة", "شرح مباشر");
            db.Add(type);
        }
        else if (!type.IsActive)
            type.SetActive(true);
        var service = new TeacherService(teacher.Id, subject.Id, type.Id, "Live explanation",
            "A private live explanation session.", 120, "SAR", 24, 0, factory.Clock.GetUtcNow());
        db.AddRange(subject, PublishedProfile(teacher.Id, "Live teacher"), service,
            new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()),
            new TeacherAvailabilityRule(teacher.Id, localDate.DayOfWeek,
                new TimeOnly(9, 0), new TimeOnly(15, 0), "Egypt Standard Time", 30));
        await db.SaveChangesAsync();
        return new(studentA, studentB, teacher, service.Id, localDate);
    }

    private sealed record OrderSeed(
        (string Id, string Email) Student, (string Id, string Email) OtherStudent,
        (string Id, string Email) Teacher, (string Id, string Email) OtherTeacher, Guid ServiceId);

    private sealed record OpenSeed(
        (string Id, string Email) Student, (string Id, string Email) OtherStudent,
        (string Id, string Email) TeacherA, (string Id, string Email) TeacherB, Guid SubjectId, Guid CatalogId);

    private sealed record SessionSeed(
        (string Id, string Email) StudentA, (string Id, string Email) StudentB,
        (string Id, string Email) Teacher, Guid ServiceId, DateOnly LocalDate);
}
