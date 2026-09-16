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
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Orders;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class OpenMarketplaceTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Qualified_private_offers_convert_once_into_the_existing_order_lifecycle()
    {
        var data = await SeedAsync();
        var student = await ClientAsync(data.Student.Email);
        var teacherA = await ClientAsync(data.TeacherA.Email);
        var teacherB = await ClientAsync(data.TeacherB.Email);
        var unqualified = await ClientAsync(data.Unqualified.Email);

        var publish = await student.PostAsJsonAsync("/api/v1/open-marketplace/requests", new
        {
            subjectId = data.SubjectId,
            serviceCatalogItemId = data.CatalogId,
            title = "Explain chapter four",
            requirements = "Explain every exercise in the attached chapter.",
            deadline = factory.Clock.GetUtcNow().AddDays(3),
            budgetMin = (decimal?)null,
            budgetMax = (decimal?)null
        });
        publish.EnsureSuccessStatusCode();
        var request = JsonDocument.Parse(await publish.Content.ReadAsStringAsync()).RootElement;
        var requestId = request.GetProperty("id").GetGuid();
        var requestVersion = request.GetProperty("version").GetString()!;

        var upload = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.ASCII.GetBytes("%PDF-1.4\nOpen request"));
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        upload.Add(file, "file", "chapter.pdf");
        var uploadMessage = new HttpRequestMessage(HttpMethod.Post,
            $"/api/v1/learning-requests/{requestId}/attachments")
        { Content = upload };
        uploadMessage.Headers.TryAddWithoutValidation("If-Match", requestVersion);
        var uploaded = await student.SendAsync(uploadMessage);
        uploaded.EnsureSuccessStatusCode();
        var uploadedAttachment = JsonDocument.Parse(await uploaded.Content.ReadAsStringAsync()).RootElement;
        var attachmentId = uploadedAttachment.GetProperty("id").GetGuid();
        var nextRequestVersion = uploadedAttachment.GetProperty("version").GetString()!;

        var secondUpload = new MultipartFormDataContent();
        var appendix = new ByteArrayContent(Encoding.ASCII.GetBytes("%PDF-1.4\nOpen request appendix"));
        appendix.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        secondUpload.Add(appendix, "file", "appendix.pdf");
        var secondUploadMessage = new HttpRequestMessage(HttpMethod.Post,
            $"/api/v1/learning-requests/{requestId}/attachments")
        { Content = secondUpload };
        secondUploadMessage.Headers.TryAddWithoutValidation("If-Match", nextRequestVersion);
        (await student.SendAsync(secondUploadMessage)).EnsureSuccessStatusCode();

        var opportunitiesResponse = await teacherA.GetAsync("/api/v1/open-marketplace/opportunities");
        var opportunitiesBody = await opportunitiesResponse.Content.ReadAsStringAsync();
        Assert.True(opportunitiesResponse.IsSuccessStatusCode, opportunitiesBody);
        var opportunities = JsonDocument.Parse(opportunitiesBody).RootElement.GetProperty("items");
        Assert.Contains(opportunities.EnumerateArray(), x => x.GetProperty("id").GetGuid() == requestId);
        var hidden = JsonDocument.Parse(await unqualified.GetStringAsync(
            "/api/v1/open-marketplace/opportunities")).RootElement.GetProperty("items");
        Assert.DoesNotContain(hidden.EnumerateArray(), x => x.GetProperty("id").GetGuid() == requestId);
        Assert.Equal(HttpStatusCode.OK, (await teacherA.GetAsync(
            $"/api/v1/learning-requests/attachments/{attachmentId}/content")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await unqualified.GetAsync(
            $"/api/v1/learning-requests/attachments/{attachmentId}/content")).StatusCode);

        var offerA = await OfferAsync(teacherA, requestId, 120, 48, "I will explain each exercise.", 5);
        var offerB = await OfferAsync(teacherB, requestId, 150, 24, "I will add worked examples.");
        var mine = await teacherA.GetStringAsync($"/api/v1/open-marketplace/requests/{requestId}/my-offer");
        Assert.DoesNotContain(data.TeacherB.Id, mine, StringComparison.Ordinal);
        // Compare values, not text: a random id can contain the digits "150" (it did: "…cf1509f").
        var mineJson = JsonDocument.Parse(mine).RootElement;
        Assert.Equal(120m, mineJson.GetProperty("amount").GetDecimal());
        Assert.DoesNotContain(mineJson.EnumerateObject(),
            p => p.Value.ValueKind == JsonValueKind.Number && p.Value.GetDecimal() == 150m);

        request = JsonDocument.Parse(await student.GetStringAsync(
            $"/api/v1/open-marketplace/requests/{requestId}")).RootElement;
        var select = new HttpRequestMessage(HttpMethod.Post,
            $"/api/v1/open-marketplace/requests/{requestId}/offers/{offerA.Id}/select");
        select.Headers.TryAddWithoutValidation("If-Match", request.GetProperty("version").GetString());
        select.Headers.TryAddWithoutValidation("X-Offer-Version", offerA.Version);
        (await student.SendAsync(select)).EnsureSuccessStatusCode();

        var selectedOpportunity = JsonDocument.Parse(await teacherA.GetStringAsync(
            $"/api/v1/open-marketplace/opportunities/{requestId}")).RootElement;
        Assert.Equal((int)TeacherOfferStatus.Selected,
            selectedOpportunity.GetProperty("myOffer").GetProperty("status").GetInt32());
        var competitorOpportunities = JsonDocument.Parse(await teacherB.GetStringAsync(
            "/api/v1/open-marketplace/opportunities")).RootElement.GetProperty("items");
        Assert.DoesNotContain(competitorOpportunities.EnumerateArray(),
            x => x.GetProperty("id").GetGuid() == requestId);

        var initiate = new HttpRequestMessage(HttpMethod.Post,
            $"/api/v1/payments/open-requests/{requestId}");
        initiate.Headers.TryAddWithoutValidation("Idempotency-Key", "open-market-payment");
        initiate.Content = JsonContent.Create(new { });
        var initiated = await student.SendAsync(initiate);
        initiated.EnsureSuccessStatusCode();
        var payment = JsonDocument.Parse(await initiated.Content.ReadAsStringAsync())
            .RootElement.GetProperty("payment");
        await ConfirmAsync(student, payment, requestId);
        await ConfirmAsync(student, payment, requestId);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var order = Assert.Single(await db.Orders.AsNoTracking()
            .Where(x => x.LearningRequestId == requestId).ToArrayAsync());
        Assert.Equal(data.TeacherA.Id, order.TeacherId);
        Assert.Equal(120m, order.Price);
        Assert.Equal("SAR", order.Currency);
        Assert.Equal(48, (int)Math.Round((order.AgreedDeliveryAt - factory.Clock.GetUtcNow()).TotalHours));
        Assert.Equal(5, order.RevisionAllowance);
        Assert.Equal(data.CatalogId, order.ServiceCatalogItemId);
        Assert.Equal(OrderPaymentStatus.Paid, order.PaymentStatus);
        Assert.Equal(TeacherOfferStatus.Accepted,
            (await db.TeacherOffers.AsNoTracking().SingleAsync(x => x.Id == offerA.Id)).Status);
        Assert.Equal(TeacherOfferStatus.NotSelected,
            (await db.TeacherOffers.AsNoTracking().SingleAsync(x => x.Id == offerB.Id)).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await teacherB.GetAsync(
            $"/api/v1/learning-requests/attachments/{attachmentId}/content")).StatusCode);
    }

    [Fact]
    public void Selection_timeout_reopens_offer_at_exactly_two_hours()
    {
        var now = factory.Clock.GetUtcNow();
        var request = new LearningRequest("student", Guid.NewGuid(), "Title", "Requirements",
            now.AddDays(1), null, null, now);
        var offer = new TeacherOffer(request.Id, "teacher", Guid.NewGuid(), 100, 24, "Proposal", now);
        request.SelectOffer("student", offer.Id, now);
        offer.Select(now);
        Assert.False(request.ExpireOfferSelection(now.AddHours(2).AddTicks(-1)));
        Assert.True(request.ExpireOfferSelection(now.AddHours(2)));
        offer.Reopen(now.AddHours(2));
        Assert.Equal(LearningRequestStatus.OpenForOffers, request.Status);
        Assert.Equal(TeacherOfferStatus.Submitted, offer.Status);
    }

    [Fact]
    public async Task Expiry_worker_marks_open_request_expired_and_is_idempotent()
    {
        var original = factory.Clock.GetUtcNow();
        try
        {
            var data = await SeedAsync();
            var student = await ClientAsync(data.Student.Email);
            var deadline = original.AddHours(2);
            var response = await student.PostAsJsonAsync("/api/v1/open-marketplace/requests", new
            {
                subjectId = data.SubjectId,
                serviceCatalogItemId = data.CatalogId,
                title = "Expiring request",
                requirements = "This request should expire deterministically.",
                deadline,
                budgetMin = (decimal?)null,
                budgetMax = (decimal?)null
            });
            response.EnsureSuccessStatusCode();
            var id = JsonDocument.Parse(await response.Content.ReadAsStringAsync())
                .RootElement.GetProperty("id").GetGuid();
            factory.Clock.SetUtcNow(deadline.AddMinutes(1));

            await using var scope = factory.Services.CreateAsyncScope();
            var worker = scope.ServiceProvider.GetRequiredService<OpenMarketplaceReservationExpiryService>();
            await worker.RunAsync(CancellationToken.None);
            await worker.RunAsync(CancellationToken.None);
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var request = await db.LearningRequests.AsNoTracking().SingleAsync(x => x.Id == id);
            Assert.Equal(LearningRequestStatus.Expired, request.Status);
            Assert.Equal(1, await db.Set<LearningRequestStatusHistory>().CountAsync(
                x => x.LearningRequestId == id && x.NextStatus == LearningRequestStatus.Expired));
        }
        finally { factory.Clock.SetUtcNow(original); }
    }

    [Fact]
    public async Task Reservation_reminder_links_to_the_request_it_is_about()
    {
        var original = factory.Clock.GetUtcNow();
        try
        {
            var data = await SeedAsync();
            var student = await ClientAsync(data.Student.Email);
            var teacher = await ClientAsync(data.TeacherA.Email);
            var published = await student.PostAsJsonAsync("/api/v1/open-marketplace/requests", new
            {
                subjectId = data.SubjectId,
                serviceCatalogItemId = data.CatalogId,
                title = "Reminder destination",
                requirements = "The payment reminder must open this request.",
                deadline = original.AddDays(2),
                budgetMin = (decimal?)null,
                budgetMax = (decimal?)null
            });
            published.EnsureSuccessStatusCode();
            var request = JsonDocument.Parse(await published.Content.ReadAsStringAsync()).RootElement;
            var requestId = request.GetProperty("id").GetGuid();
            var offer = await OfferAsync(teacher, requestId, 150, 48, "Reminder offer");
            var select = new HttpRequestMessage(HttpMethod.Post,
                $"/api/v1/open-marketplace/requests/{requestId}/offers/{offer.Id}/select");
            select.Headers.TryAddWithoutValidation("If-Match", request.GetProperty("version").GetString());
            select.Headers.TryAddWithoutValidation("X-Offer-Version", offer.Version);
            (await student.SendAsync(select)).EnsureSuccessStatusCode();

            // Inside the last 30 minutes of the 120-minute hold the worker reminds the student.
            factory.Clock.SetUtcNow(original.AddMinutes(100));
            await using (var scope = factory.Services.CreateAsyncScope())
                await scope.ServiceProvider.GetRequiredService<OpenMarketplaceReservationExpiryService>()
                    .RunAsync(CancellationToken.None);

            var page = JsonDocument.Parse(await student.GetStringAsync("/api/v1/notifications?pageSize=50")).RootElement;
            var reminder = Assert.Single(page.GetProperty("items").EnumerateArray(),
                x => x.GetProperty("type").GetString() == "OfferReservationReminder");
            Assert.Equal($"/requests/{requestId}", reminder.GetProperty("link").GetString());
        }
        finally { factory.Clock.SetUtcNow(original); }
    }

    [Fact]
    public async Task Suspended_teacher_cannot_submit_marketplace_offer()
    {
        var data = await SeedAsync();
        var student = await ClientAsync(data.Student.Email);
        var teacher = await ClientAsync(data.TeacherA.Email);
        var published = await student.PostAsJsonAsync("/api/v1/open-marketplace/requests", new
        {
            subjectId = data.SubjectId,
            serviceCatalogItemId = data.CatalogId,
            title = "Suspension eligibility",
            requirements = "Verify suspended intake is closed.",
            deadline = factory.Clock.GetUtcNow().AddDays(2),
            budgetMin = (decimal?)null,
            budgetMax = (decimal?)null
        });
        var id = JsonDocument.Parse(await published.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            (await db.Users.SingleAsync(x => x.Id == data.TeacherA.Id)).IsSuspended = true;
            await db.SaveChangesAsync();
        }
        var response = await teacher.PostAsJsonAsync($"/api/v1/open-marketplace/opportunities/{id}/offers",
            new { amount = 100m, deliveryHours = 24, includedRevisions = 1, message = "Must be blocked." });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /// <summary>
    /// Final certification of the selection races the happy path cannot show.
    /// One reservation must survive a repeated Select, a stale-version Select, and
    /// an attempt to reserve a second Offer while the first is still held — and a
    /// tampered payment amount must never reach the ledger.
    /// </summary>
    [Fact]
    public async Task Selection_and_payment_reject_replays_stale_versions_and_tampered_amounts()
    {
        var data = await SeedAsync();
        var student = await ClientAsync(data.Student.Email);
        var teacherA = await ClientAsync(data.TeacherA.Email);
        var teacherB = await ClientAsync(data.TeacherB.Email);

        var publish = await student.PostAsJsonAsync("/api/v1/open-marketplace/requests", new
        {
            subjectId = data.SubjectId,
            serviceCatalogItemId = data.CatalogId,
            title = "Race certification request",
            requirements = "Certify selection and payment races end to end.",
            deadline = factory.Clock.GetUtcNow().AddDays(3),
            budgetMin = (decimal?)null,
            budgetMax = (decimal?)null
        });
        publish.EnsureSuccessStatusCode();
        var requestId = JsonDocument.Parse(await publish.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();

        var offerA = await OfferAsync(teacherA, requestId, 120, 48, "Offer from the first teacher.");
        var offerB = await OfferAsync(teacherB, requestId, 150, 24, "Offer from the second teacher.");

        async Task<HttpResponseMessage> SelectAsync(Guid offerId, string requestVersion, string offerVersion)
        {
            var message = new HttpRequestMessage(HttpMethod.Post,
                $"/api/v1/open-marketplace/requests/{requestId}/offers/{offerId}/select");
            message.Headers.TryAddWithoutValidation("If-Match", requestVersion);
            message.Headers.TryAddWithoutValidation("X-Offer-Version", offerVersion);
            return await student.SendAsync(message);
        }

        async Task<string> RequestVersionAsync() =>
            JsonDocument.Parse(await student.GetStringAsync(
                $"/api/v1/open-marketplace/requests/{requestId}"))
                .RootElement.GetProperty("version").GetString()!;

        var openVersion = await RequestVersionAsync();

        // First selection wins and starts the single reservation.
        (await SelectAsync(offerA.Id, openVersion, offerA.Version)).EnsureSuccessStatusCode();

        // Replay of the same call (double-click) carries the now-stale request
        // row version and must not re-reserve or re-notify.
        Assert.False((await SelectAsync(offerA.Id, openVersion, offerA.Version)).IsSuccessStatusCode);

        // Racing the competing Offer in while one is already reserved must fail,
        // whether the caller replays the stale version or reads a fresh one.
        Assert.False((await SelectAsync(offerB.Id, openVersion, offerB.Version)).IsSuccessStatusCode);
        Assert.False((await SelectAsync(offerB.Id, await RequestVersionAsync(), offerB.Version)).IsSuccessStatusCode);

        await using (var raceScope = factory.Services.CreateAsyncScope())
        {
            var raceDb = raceScope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var reserved = await raceDb.LearningRequests.AsNoTracking().SingleAsync(x => x.Id == requestId);
            Assert.Equal(LearningRequestStatus.AwaitingPayment, reserved.Status);
            Assert.Equal(offerA.Id, reserved.SelectedOfferId);
            Assert.Equal(TeacherOfferStatus.Selected,
                (await raceDb.TeacherOffers.AsNoTracking().SingleAsync(x => x.Id == offerA.Id)).Status);
            // The losing Offer stays live until payment decides the winner.
            Assert.Equal(TeacherOfferStatus.Submitted,
                (await raceDb.TeacherOffers.AsNoTracking().SingleAsync(x => x.Id == offerB.Id)).Status);
        }

        var initiate = new HttpRequestMessage(HttpMethod.Post,
            $"/api/v1/payments/open-requests/{requestId}");
        initiate.Headers.TryAddWithoutValidation("Idempotency-Key", "race-certification-payment");
        initiate.Content = JsonContent.Create(new { });
        var initiated = await student.SendAsync(initiate);
        initiated.EnsureSuccessStatusCode();
        var payment = JsonDocument.Parse(await initiated.Content.ReadAsStringAsync())
            .RootElement.GetProperty("payment");

        // The amount is derived server-side from the selected Offer; the client
        // never supplies one. A callback claiming a different amount must not
        // settle the Order.
        var tampered = JsonSerializer.SerializeToUtf8Bytes(new
        {
            eventId = "race-tampered-" + requestId,
            providerReference = payment.GetProperty("providerReference").GetString(),
            amount = 1m,
            currency = payment.GetProperty("currency").GetString(),
            succeeded = true
        });
        var tamperedSignature = Convert.ToHexString(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes("integration-tests-only-payment-webhook-secret"), tampered));
        var tamperedCallback = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/mock")
        { Content = new ByteArrayContent(tampered) };
        tamperedCallback.Headers.TryAddWithoutValidation("X-Mock-Signature", tamperedSignature);
        await student.SendAsync(tamperedCallback);

        await using (var tamperScope = factory.Services.CreateAsyncScope())
        {
            var tamperDb = tamperScope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            Assert.Empty(await tamperDb.Orders.AsNoTracking()
                .Where(x => x.LearningRequestId == requestId).ToArrayAsync());
        }

        // The genuine callback, replayed, still yields exactly one Order.
        await ConfirmAsync(student, payment, requestId);
        await ConfirmAsync(student, payment, requestId);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var order = Assert.Single(await db.Orders.AsNoTracking()
            .Where(x => x.LearningRequestId == requestId).ToArrayAsync());
        Assert.Equal(data.TeacherA.Id, order.TeacherId);
        Assert.Equal(data.Student.Id, order.StudentId);
        Assert.Equal(120m, order.Price);
        Assert.Equal(OrderPaymentStatus.Paid, order.PaymentStatus);

        var settled = await db.LearningRequests.AsNoTracking().SingleAsync(x => x.Id == requestId);
        Assert.Equal(LearningRequestStatus.ConvertedToOrder, settled.Status);
        // The reservation is consumed, not left hanging over a converted request.
        Assert.Null(settled.PaymentReservationExpiresAt);
        Assert.Equal(TeacherOfferStatus.Accepted,
            (await db.TeacherOffers.AsNoTracking().SingleAsync(x => x.Id == offerA.Id)).Status);
        Assert.Equal(TeacherOfferStatus.NotSelected,
            (await db.TeacherOffers.AsNoTracking().SingleAsync(x => x.Id == offerB.Id)).Status);
    }

    private async Task<Seed> SeedAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacherA = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var teacherB = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var unqualified = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Open Subject " + suffix, "book", "مادة مفتوحة");
        var catalog = new ServiceCatalogItem("Open Explanation " + suffix, "Async explanation",
            "open_" + suffix, "شرح مفتوح", "شرح غير متزامن");
        db.AddRange(subject, catalog,
            new TeacherSubjectQualification(teacherA.Id, subject.Id, factory.Clock.GetUtcNow()),
            new TeacherSubjectQualification(teacherB.Id, subject.Id, factory.Clock.GetUtcNow()));
        foreach (var teacher in new[] { teacherA, teacherB, unqualified })
        {
            var profile = new TeacherProfile(teacher.Id, factory.Clock.GetUtcNow());
            profile.Update("Open request teacher", "Qualified teacher profile for Open Request tests.",
                "Egypt", "Cairo", "Egypt Standard Time", 15, factory.Clock.GetUtcNow());
            profile.Publish(TeacherProfileReadiness.Ready, factory.Clock.GetUtcNow());
            db.Add(profile);
        }
        db.AddRange(
            new TeacherService(teacherA.Id, subject.Id, catalog.Id, "Explanation A", "Detailed work",
                100, "SAR", 48, 2, factory.Clock.GetUtcNow()),
            new TeacherService(teacherB.Id, subject.Id, catalog.Id, "Explanation B", "Fast work",
                120, "SAR", 24, 1, factory.Clock.GetUtcNow()));
        await db.SaveChangesAsync();
        return new(student, teacherA, teacherB, unqualified, subject.Id, catalog.Id);
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static async Task<Offer> OfferAsync(
        HttpClient client, Guid requestId, decimal amount, int hours, string message, int includedRevisions = 2)
    {
        var response = await client.PostAsJsonAsync(
            $"/api/v1/open-marketplace/opportunities/{requestId}/offers",
            new { amount, deliveryHours = hours, includedRevisions, message });
        response.EnsureSuccessStatusCode();
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        return new(json.GetProperty("id").GetGuid(), json.GetProperty("version").GetString()!);
    }

    private static async Task ConfirmAsync(HttpClient student, JsonElement payment, Guid requestId)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            eventId = "open-event-" + requestId,
            providerReference = payment.GetProperty("providerReference").GetString(),
            amount = payment.GetProperty("amount").GetDecimal(),
            currency = payment.GetProperty("currency").GetString(),
            succeeded = true
        });
        var signature = Convert.ToHexString(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes("integration-tests-only-payment-webhook-secret"), payload));
        var callback = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/mock")
        {
            Content = new ByteArrayContent(payload)
        };
        callback.Headers.TryAddWithoutValidation("X-Mock-Signature", signature);
        (await student.SendAsync(callback)).EnsureSuccessStatusCode();
    }

    private sealed record Seed(
        (string Id, string Email) Student,
        (string Id, string Email) TeacherA,
        (string Id, string Email) TeacherB,
        (string Id, string Email) Unqualified,
        Guid SubjectId,
        Guid CatalogId);
    private sealed record Offer(Guid Id, string Version);
}
