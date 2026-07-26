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
using Tafseel.Domain.Finance;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
[Trait("Category", "Financial")]
public sealed class Phase7FinancialTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    private const string WebhookSecret = "integration-tests-only-payment-webhook-secret";

    [Fact]
    public async Task Concurrent_callbacks_release_and_withdrawal_are_idempotent_and_reconciled()
    {
        var data = await SeedAsync();
        var student = await ClientAsync(data.Student.Email);
        var teacher = await ClientAsync(data.Teacher.Email);
        var admin = await ClientAsync(data.Admin.Email);
        var initiation = await InitiateAsync(student, data.OrderId, "init-main");
        var paymentId = initiation.GetProperty("id").GetGuid();
        var providerReference = initiation.GetProperty("providerReference").GetString()!;
        var payload = Payload("event-main", providerReference,
            initiation.GetProperty("amount").GetDecimal(), "SAR", true);

        var callbacks = await Task.WhenAll(WebhookAsync(payload), WebhookAsync(payload));
        Assert.All(callbacks, x => Assert.Equal(HttpStatusCode.NoContent, x.StatusCode));

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            Assert.Equal(PaymentStatus.Confirmed,
                await db.Payments.Where(x => x.Id == paymentId).Select(x => x.Status).SingleAsync());
            Assert.Equal(OrderPaymentStatus.Paid,
                await db.Orders.Where(x => x.Id == data.OrderId).Select(x => x.PaymentStatus).SingleAsync());
            Assert.Single(await db.EscrowEntries.Where(x =>
                x.PaymentId == paymentId && x.Type == EscrowEntryType.Held).ToArrayAsync());
            Assert.Single(await db.LedgerEntries.Where(x =>
                x.BusinessKey == $"payment:{paymentId}:capture").ToArrayAsync());

            var order = await db.Orders.SingleAsync(x => x.Id == data.OrderId);
            order.Start(data.Teacher.Id, factory.Clock.GetUtcNow());
            order.Deliver(data.Teacher.Id, "test-storage", "delivery.pdf", "application/pdf",
                10, "Delivered", factory.Clock.GetUtcNow());
            await db.SaveChangesAsync();
        }

        var version = await OrderVersionAsync(data.OrderId);
        var completes = await Task.WhenAll(
            SendAsync(student, HttpMethod.Post, $"/api/v1/orders/{data.OrderId}/complete", null, version),
            SendAsync(student, HttpMethod.Post, $"/api/v1/orders/{data.OrderId}/complete", null, version));
        Assert.Single(completes, x => x.StatusCode == HttpStatusCode.NoContent);
        Assert.Single(completes, x => x.StatusCode == HttpStatusCode.Conflict);

        var balances = JsonDocument.Parse(await teacher.GetStringAsync("/api/v1/withdrawals/balances"))
            .RootElement.EnumerateArray().Single();
        Assert.Equal(85m, balances.GetProperty("available").GetDecimal());
        var withdrawals = await Task.WhenAll(
            WithdrawalAsync(teacher, 60, "withdraw-a"),
            WithdrawalAsync(teacher, 60, "withdraw-b"));
        Assert.Single(withdrawals, x => x.StatusCode == HttpStatusCode.OK);
        Assert.Single(withdrawals, x => x.StatusCode == HttpStatusCode.BadRequest);
        var approved = withdrawals.Single(x => x.StatusCode == HttpStatusCode.OK);
        var withdrawal = JsonDocument.Parse(await approved.Content.ReadAsStringAsync()).RootElement;
        var process = await SendAsync(admin, HttpMethod.Post,
            $"/api/v1/withdrawals/{withdrawal.GetProperty("id").GetGuid()}/process",
            new { approve = true, providerReference = "bank-transfer-1" },
            withdrawal.GetProperty("version").GetString()!, "process-1");
        process.EnsureSuccessStatusCode();
        var replay = await SendAsync(admin, HttpMethod.Post,
            $"/api/v1/withdrawals/{withdrawal.GetProperty("id").GetGuid()}/process",
            new { approve = true, providerReference = "bank-transfer-1" },
            withdrawal.GetProperty("version").GetString()!, "process-1");
        replay.EnsureSuccessStatusCode();

        var reconciliation = JsonDocument.Parse(
            await admin.GetStringAsync("/api/v1/admin/finance/reconciliation")).RootElement;
        Assert.Equal(0, reconciliation.GetProperty("unbalancedEntries").GetInt32());
        Assert.Equal(0, reconciliation.GetProperty("orphanPayments").GetInt32());
        Assert.Equal(108m, reconciliation.GetProperty("escrowHeld").GetDecimal());
        Assert.Equal(108m, reconciliation.GetProperty("escrowReleased").GetDecimal());
        Assert.Equal(25m, reconciliation.GetProperty("teacherAvailable").GetDecimal());
        Assert.Equal(23m, reconciliation.GetProperty("platformRevenue").GetDecimal());
    }

    [Fact]
    public async Task Invalid_signature_mismatch_and_refund_replay_do_not_duplicate_money()
    {
        var data = await SeedAsync();
        var student = await ClientAsync(data.Student.Email);
        var admin = await ClientAsync(data.Admin.Email);
        var payment = await InitiateAsync(student, data.OrderId, "init-refund");
        var paymentId = payment.GetProperty("id").GetGuid();
        var reference = payment.GetProperty("providerReference").GetString()!;

        var invalid = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/mock")
        {
            Content = new ByteArrayContent(Payload("bad-signature", reference, 108, "SAR", true))
        };
        invalid.Headers.TryAddWithoutValidation("X-Mock-Signature", "00");
        Assert.Equal(HttpStatusCode.BadRequest, (await factory.CreateClient().SendAsync(invalid)).StatusCode);

        var mismatch = await WebhookAsync(Payload("mismatch", reference, 109, "SAR", true));
        Assert.Equal(HttpStatusCode.BadRequest, mismatch.StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            Assert.Equal(PaymentStatus.Pending,
                await db.Payments.Where(x => x.Id == paymentId).Select(x => x.Status).SingleAsync());
            Assert.False(await db.PaymentWebhookRecords.AnyAsync(x => x.EventId == "mismatch"));
        }

        (await WebhookAsync(Payload("provider-failed", reference, 108, "SAR", false))).EnsureSuccessStatusCode();
        (await WebhookAsync(Payload("confirmed", reference, 108, "SAR", true))).EnsureSuccessStatusCode();
        var refunds = await Task.WhenAll(
            RefundAsync(admin, paymentId, "refund-once"),
            RefundAsync(admin, paymentId, "refund-once"));
        Assert.All(refunds, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode));
        Assert.Equal(HttpStatusCode.Conflict,
            (await RefundAsync(admin, paymentId, "different-refund")).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var refund = Assert.Single(await db.Refunds.Where(x => x.PaymentId == paymentId).ToArrayAsync());
            Assert.Single(await db.EscrowEntries.Where(x =>
                x.PaymentId == paymentId && x.Type == EscrowEntryType.Refunded).ToArrayAsync());
            Assert.Single(await db.LedgerEntries.Where(x =>
                x.ReferenceType == "Refund" && x.ReferenceId == refund.Id.ToString()).ToArrayAsync());
        }
    }

    [Fact]
    public async Task Financial_sql_constraints_indexes_and_rowversions_exist()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var constraints = await db.Database.SqlQueryRaw<string>(
            "SELECT name AS [Value] FROM sys.check_constraints WHERE parent_object_id IN " +
            "(OBJECT_ID('Payments'),OBJECT_ID('LedgerEntries'),OBJECT_ID('EscrowEntries'),OBJECT_ID('WithdrawalRequests'))")
            .ToArrayAsync();
        Assert.Contains("CK_Payments_Amount", constraints);
        Assert.Contains("CK_LedgerEntries_Accounts", constraints);
        Assert.Contains("CK_EscrowEntries_Amount", constraints);
        Assert.Contains("CK_Withdrawals_Amount", constraints);
        var indexes = await db.Database.SqlQueryRaw<string>(
            "SELECT name AS [Value] FROM sys.indexes WHERE object_id IN " +
            "(OBJECT_ID('Payments'),OBJECT_ID('LedgerEntries'),OBJECT_ID('PaymentWebhookRecords')) AND name IS NOT NULL")
            .ToArrayAsync();
        Assert.Contains("IX_PaymentWebhookRecords_Provider_EventId", indexes);
        Assert.Contains("IX_LedgerEntries_BusinessKey", indexes);
        Assert.True(await db.Database.SqlQueryRaw<int>(
            "SELECT COUNT(*) AS [Value] FROM sys.columns WHERE object_id IN " +
            "(OBJECT_ID('Payments'),OBJECT_ID('WithdrawalRequests')) AND name='RowVersion' AND system_type_id=189")
            .SingleAsync() == 2);
    }

    private async Task<SeedData> SeedAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var admin = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Admin);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Finance Subject " + suffix, "code");
        var type = new ServiceCatalogItem("Finance Service " + suffix, "Explanation");
        var service = new TeacherService(teacher.Id, subject.Id, type.Id, "Financial order",
            "Order used to prove ledger behavior.", 100, "SAR", 24, 1, factory.Clock.GetUtcNow());
        var request = new LearningRequest(student.Id, teacher.Id, service.Id, "Financial request",
            "Explain the supplied material.", factory.Clock.GetUtcNow().AddDays(3), 100, factory.Clock.GetUtcNow());
        request.Accept(teacher.Id, "seed-accept", factory.Clock.GetUtcNow());
        var order = new Order(request.Id, student.Id, teacher.Id, service.Id, 100, "SAR",
            8, 15, factory.Clock.GetUtcNow().AddDays(2), 1, factory.Clock.GetUtcNow());
        db.AddRange(subject, type, service, request, order,
            new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()));
        await db.SaveChangesAsync();
        return new(student, teacher, admin, order.Id);
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static async Task<JsonElement> InitiateAsync(HttpClient client, Guid orderId, string key)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{orderId}");
        request.Headers.TryAddWithoutValidation("Idempotency-Key", key);
        var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync())
            .RootElement.GetProperty("payment").Clone();
    }

    private async Task<HttpResponseMessage> WebhookAsync(byte[] payload)
    {
        var signature = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(WebhookSecret), payload));
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/mock")
        {
            Content = new ByteArrayContent(payload)
        };
        request.Headers.TryAddWithoutValidation("X-Mock-Signature", signature);
        return await factory.CreateClient().SendAsync(request);
    }

    private static byte[] Payload(string eventId, string reference, decimal amount, string currency, bool succeeded) =>
        JsonSerializer.SerializeToUtf8Bytes(new
        {
            eventId,
            providerReference = reference,
            amount,
            currency,
            succeeded
        });

    private static Task<HttpResponseMessage> WithdrawalAsync(HttpClient teacher, decimal amount, string key)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/withdrawals")
        {
            Content = JsonContent.Create(new { amount, currency = "SAR" })
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", key);
        return teacher.SendAsync(request);
    }

    private static Task<HttpResponseMessage> RefundAsync(HttpClient admin, Guid paymentId, string key)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/{paymentId}/refund");
        request.Headers.TryAddWithoutValidation("Idempotency-Key", key);
        return admin.SendAsync(request);
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

    private async Task<string> OrderVersionAsync(Guid id)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return Convert.ToBase64String(await db.Orders.AsNoTracking()
            .Where(x => x.Id == id).Select(x => x.RowVersion).SingleAsync());
    }

    private sealed record SeedData(
        (string Id, string Email) Student,
        (string Id, string Email) Teacher,
        (string Id, string Email) Admin,
        Guid OrderId);
}
