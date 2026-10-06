using System.Data;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Tafseel.Application.Finance;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Infrastructure.Finance;
using Tafseel.Infrastructure.Persistence;
using static Tafseel.IntegrationTests.PaymobProviderTests;

namespace Tafseel.IntegrationTests;

[Trait("Category", "Financial")]
[Trait("Category", "SqlServer")]
public sealed class PaymobFinancialTests(SqlServerTafseelApiFactory factory) : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Duplicate_checkout_commands_resume_one_durable_intention_and_second_card_attempt_can_succeed()
    {
        await using var flow = await Flow.CreateAsync(factory);
        var calls = flow.Handler.Calls;
        var retry = await flow.Finance.InitiateOrderPaymentAsync(flow.StudentId, flow.Order.Id, flow.Key, null, default);
        Assert.Equal(flow.Payment.CheckoutReference, retry.CheckoutReference); Assert.Equal(calls, flow.Handler.Calls);
        var secondCommand = await Assert.ThrowsAsync<DomainException>(() => flow.Finance.InitiateOrderPaymentAsync(flow.StudentId, flow.Order.Id, "another-command", null, default));
        Assert.Equal("payment_already_initiated", secondCommand.Code);
        await flow.CallbackAsync(success: false, id: flow.TransactionId - 1);
        Assert.Equal("Failed", (await flow.Finance.GetPaymentStateAsync(flow.StudentId, flow.Payment.Payment.Id, default)).State);
        retry = await flow.Finance.InitiateOrderPaymentAsync(flow.StudentId, flow.Order.Id, flow.Key, null, default);
        Assert.Equal(flow.Payment.CheckoutReference, retry.CheckoutReference); Assert.Equal(calls, flow.Handler.Calls);
        await flow.CallbackAsync(); await flow.CallbackAsync();
        Assert.Equal("Confirmed", (await flow.Finance.GetPaymentStateAsync(flow.StudentId, flow.Payment.Payment.Id, default)).State);
        Assert.Equal(1, await flow.Db.LedgerEntries.CountAsync(x => x.BusinessKey == $"payment:{flow.Payment.Payment.Id}:capture"));
        Assert.Equal(1, await flow.Db.EscrowEntries.CountAsync(x => x.PaymentId == flow.Payment.Payment.Id && x.Type == EscrowEntryType.Held));
        Assert.Equal(2, await flow.Db.PaymentWebhookRecords.CountAsync(x => x.ProviderReference == flow.Reference));
        var checkout = await flow.Db.Set<ProviderCheckout>().SingleAsync(x => x.PaymentId == flow.Payment.Payment.Id);
        Assert.Equal(flow.TransactionId.ToString(), checkout.TransactionId);
        Assert.DoesNotContain("clientSecret", checkout.ProtectedCheckout!);
    }
    [Theory]
    [InlineData("amount_cents")]
    [InlineData("currency")]
    [InlineData("merchant_order_id")]
    [InlineData("order_id")]
    [InlineData("hmac")]
    [InlineData("is_live")]
    public async Task Invalid_or_replayed_cross_payment_callback_cannot_fund_escrow(string changed)
    {
        await using var flow = await Flow.CreateAsync(factory); var tx = flow.Transaction();
        switch (changed)
        {
            case "amount_cents": tx[changed] = 10801; break;
            case "currency": tx[changed] = "EGP"; break;
            case "merchant_order_id": tx["order"]![changed] = "tf_unknown"; break;
            case "order_id": tx["order"]!["id"] = flow.OrderId + 10; break;
            case "is_live": tx[changed] = true; break;
        }
        var signature = changed == "hmac" ? "bad" : Sign(tx, flow.Options.HmacSecret);
        await Assert.ThrowsAsync<DomainException>(() => flow.Finance.ProcessWebhookAsync(Callback(tx), signature, default));
        flow.Db.ChangeTracker.Clear();
        Assert.Equal(PaymentStatus.Pending, (await flow.Db.Payments.SingleAsync(x => x.Id == flow.Payment.Payment.Id)).Status);
        Assert.Empty(await flow.Db.EscrowEntries.Where(x => x.PaymentId == flow.Payment.Payment.Id).ToArrayAsync());
        Assert.Empty(await flow.Db.PaymentWebhookRecords.Where(x => x.ProviderReference == flow.Reference).ToArrayAsync());
    }
    [Fact]
    public async Task A_second_capture_is_a_reconciliation_case_and_never_funds_the_purchase_twice()
    {
        await using var flow = await Flow.CreateAsync(factory); await flow.CallbackAsync(); await flow.CallbackAsync(id: flow.TransactionId + 1);
        Assert.Single(await flow.Db.LedgerEntries.Where(x => x.BusinessKey == $"payment:{flow.Payment.Payment.Id}:capture").ToArrayAsync());
        Assert.Contains(await flow.Db.ReconciliationExceptions.Where(x => x.PaymentId == flow.Payment.Payment.Id).ToArrayAsync(), x => x.Kind == "provider_duplicate_capture");
    }
    [Theory]
    [InlineData("success", "Succeeded", true)]
    [InlineData("failure", "Rejected", false)]
    [InlineData("timeout", "Unknown", false)]
    public async Task Refund_is_queued_then_external_evidence_controls_accounting(string outcome, string status, bool refunded)
    {
        await using var flow = await Flow.CreateAsync(factory); await flow.CallbackAsync(); flow.RefundOutcome = outcome;
        var command = await flow.Finance.RefundAsync(flow.AdminId, flow.Payment.Payment.Id, "Full refund", "refund-key-" + flow.Order.Id, default);
        Assert.Equal("Requested", command.ProviderStatus); Assert.Equal(PaymentStatus.Confirmed, (await flow.Db.Payments.SingleAsync(x => x.Id == flow.Payment.Payment.Id)).Status);
        Assert.Empty(await flow.Db.Refunds.Where(x => x.PaymentId == flow.Payment.Payment.Id).ToArrayAsync());
        var duplicate = await flow.Finance.RefundAsync(flow.AdminId, flow.Payment.Payment.Id, "Full refund", "refund-key-" + flow.Order.Id, default);
        Assert.Equal(command.Id, duplicate.Id);
        await flow.Finance.ProcessProviderRefundAsync(command.Id, default); await flow.Finance.ProcessProviderRefundAsync(command.Id, default);
        Assert.Equal(1, flow.RefundCalls);
        var operation = await flow.Db.Set<ProviderRefund>().SingleAsync(x => x.Id == command.Id); Assert.Equal(status, operation.Status.ToString());
        var payment = await flow.Db.Payments.SingleAsync(x => x.Id == flow.Payment.Payment.Id);
        Assert.Equal(refunded ? PaymentStatus.Refunded : PaymentStatus.Confirmed, payment.Status);
        Assert.Equal(refunded ? 1 : 0, await flow.Db.Refunds.CountAsync(x => x.PaymentId == payment.Id));
        Assert.Equal(refunded ? 1 : 0, await flow.Db.EscrowEntries.CountAsync(x => x.PaymentId == payment.Id && x.Type == EscrowEntryType.Refunded));
    }
    [Fact]
    public async Task Lost_refund_response_is_recovered_by_parent_inquiry_and_callback_replay_is_safe()
    {
        await using var flow = await Flow.CreateAsync(factory); await flow.CallbackAsync(); flow.RefundOutcome = "timeout";
        var command = await flow.Finance.RefundAsync(flow.AdminId, flow.Payment.Payment.Id, "Full refund", "recover-refund-" + flow.Order.Id, default);
        await flow.Finance.ProcessProviderRefundAsync(command.Id, default); flow.ProviderRefunded = true;
        await flow.Finance.ProcessProviderRefundAsync(command.Id, default); await flow.CallbackAsync(refunded: true); await flow.CallbackAsync(refunded: true); await flow.CallbackAsync();
        Assert.Equal(1, flow.RefundCalls); Assert.Single(await flow.Db.Refunds.Where(x => x.PaymentId == flow.Payment.Payment.Id).ToArrayAsync());
        Assert.Equal(PaymentStatus.Refunded, (await flow.Db.Payments.SingleAsync(x => x.Id == flow.Payment.Payment.Id)).Status);
    }
    [Fact]
    public async Task Lost_payment_callback_is_recovered_with_authoritative_inquiry()
    {
        await using var flow = await Flow.CreateAsync(factory);
        await flow.Finance.RecoverProviderPaymentAsync(flow.Payment.Payment.Id, default);
        Assert.Equal(PaymentStatus.Confirmed, (await flow.Db.Payments.SingleAsync(x => x.Id == flow.Payment.Payment.Id)).Status);
        await flow.CallbackAsync(); Assert.Single(await flow.Db.LedgerEntries.Where(x => x.BusinessKey == $"payment:{flow.Payment.Payment.Id}:capture").ToArrayAsync());
    }
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Dispute_refund_preserves_held_and_released_escrow_until_provider_confirms(bool released)
    {
        await using var flow = await Flow.CreateAsync(factory); await flow.CallbackAsync();
        if (released)
        {
            var now = factory.Clock.GetUtcNow(); flow.Order.Start(flow.TeacherId, now);
            flow.Order.Deliver(flow.TeacherId, "test-only", "lesson.pdf", "application/pdf", 10, "Lesson", now);
            flow.Order.Complete(flow.StudentId, now);
            await using var tx = await flow.Db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            await flow.Finance.ReleaseOrderEscrowAsync(flow.Order, flow.StudentId, default);
            await flow.Db.SaveChangesAsync(); await tx.CommitAsync();
        }
        await using (var tx = await flow.Db.Database.BeginTransactionAsync(IsolationLevel.Serializable))
        {
            await flow.Finance.SettleDisputeAsync(flow.Order, true, flow.AdminId, "dispute-" + flow.Order.Id, default);
            await flow.Db.SaveChangesAsync(); await tx.CommitAsync();
        }
        Assert.Equal(PaymentStatus.Confirmed, (await flow.Db.Payments.SingleAsync(x => x.Id == flow.Payment.Payment.Id)).Status);
        var operation = await flow.Db.Set<ProviderRefund>().SingleAsync(x => x.PaymentId == flow.Payment.Payment.Id);
        await flow.Finance.ProcessProviderRefundAsync(operation.Id, default);
        Assert.Equal(PaymentStatus.Refunded, (await flow.Db.Payments.SingleAsync(x => x.Id == flow.Payment.Payment.Id)).Status);
        var report = await flow.Finance.ReconcileAsync(default);
        Assert.True(report.IsBalanced, JsonSerializer.Serialize(report));
    }
    [Fact]
    public async Task Paymob_route_reads_HMAC_query_and_redirect_parameters_never_confirm()
    {
        await using var flow = await Flow.CreateAsync(factory); var tx = flow.Transaction();
        Assert.Equal(ProviderEventKind.Payment, Provider(flow.Options, flow.Handler).VerifyWebhook(Callback(tx), Sign(tx, flow.Options.HmacSecret)).Kind);
        var browser = await flow.Client.GetAsync($"/checkout/result?paymentId={flow.Payment.Payment.Id}&success=true&amount_cents=10800");
        Assert.Equal(PaymentStatus.Pending, (await flow.Db.Payments.SingleAsync(x => x.Id == flow.Payment.Payment.Id)).Status);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/paymob?hmac=" + Sign(tx, flow.Options.HmacSecret))
        { Content = new ByteArrayContent(Callback(tx)) };
        request.Content.Headers.ContentType = new("application/json");
        Assert.Equal(HttpStatusCode.NoContent, (await flow.Client.SendAsync(request)).StatusCode);
        flow.Db.ChangeTracker.Clear();
        var status = (await flow.Db.Payments.SingleAsync(x => x.Id == flow.Payment.Payment.Id)).Status;
        Assert.True(status == PaymentStatus.Confirmed, "Status " + status + "; records=" + JsonSerializer.Serialize(await flow.Db.PaymentWebhookRecords.Where(x => x.ProviderReference == flow.Reference).Select(x => new { x.EventId, x.ProviderReference }).ToArrayAsync()) + "; transaction=" + flow.TransactionId + "; all=" + JsonSerializer.Serialize(await flow.Db.PaymentWebhookRecords.Select(x => new { x.EventId, x.ProviderReference }).ToArrayAsync()));
        using var headerOnly = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/paymob") { Content = new ByteArrayContent(Callback(tx)) };
        headerOnly.Headers.Add("X-Payment-Signature", Sign(tx, flow.Options.HmacSecret));
        Assert.Equal(HttpStatusCode.BadRequest, (await flow.Client.SendAsync(headerOnly)).StatusCode);
    }
    [Fact]
    public async Task Status_is_owned_and_refunds_require_Finance_permission_and_a_non_participant()
    {
        await using var flow = await Flow.CreateAsync(factory); await flow.CallbackAsync();
        Assert.Equal("payment_not_owned", (await Assert.ThrowsAsync<DomainException>(() => flow.Finance.GetPaymentStateAsync(flow.AdminId, flow.Payment.Payment.Id, default))).Code);
        Assert.Equal("refund_self_processing_forbidden", (await Assert.ThrowsAsync<DomainException>(() => flow.Finance.RefundAsync(flow.StudentId, flow.Payment.Payment.Id, "Reason", "self", default))).Code);
        Assert.Equal("refund_self_processing_forbidden", (await Assert.ThrowsAsync<DomainException>(() => flow.Finance.RefundAsync(flow.TeacherId, flow.Payment.Payment.Id, "Reason", "self", default))).Code);
        flow.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(flow.Client, flow.StudentEmail));
        var response = await flow.Client.PostAsJsonAsync($"/api/v1/payments/{flow.Payment.Payment.Id}/refund", new { reason = "Reason" });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        flow.Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(flow.Client, flow.AdminEmail));
        Assert.Equal(HttpStatusCode.NotFound, (await flow.Client.GetAsync($"/api/v1/payments/{flow.Payment.Payment.Id}/status")).StatusCode);
    }

    private sealed class Flow : IAsyncDisposable
    {
        private static long _nextOrder = 100000;
        private WebApplicationFactory<Program> Host = null!;
        private AsyncServiceScope Scope;
        internal HttpClient Client = null!;
        internal TafseelDbContext Db = null!;
        internal FinancialService Finance = null!;
        internal PaymobOptions Options = Settings();
        internal StubHandler Handler = new();
        internal Order Order = null!;
        internal string StudentId = "", TeacherId = "", AdminId = "", StudentEmail = "", AdminEmail = "";
        internal string Key = Guid.NewGuid().ToString("N");
        internal PaymentInitiationDto Payment = null!;
        internal long OrderId = Interlocked.Increment(ref _nextOrder);
        internal long TransactionId => OrderId + 1000000;
        internal string Reference => Payment.Payment.ProviderReference;
        internal string RefundOutcome = "success";
        internal int RefundCalls;
        internal bool ProviderRefunded;
        internal static async Task<Flow> CreateAsync(SqlServerTafseelApiFactory factory)
        {
            var flow = new Flow(); flow.Host = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            {
                services.RemoveAll<IPaymentProvider>(); services.AddSingleton<IPaymentProvider>(Provider(flow.Options, flow.Handler));
            }));
            flow.Client = flow.Host.CreateClient(); flow.Scope = flow.Host.Services.CreateAsyncScope();
            flow.Db = flow.Scope.ServiceProvider.GetRequiredService<TafseelDbContext>(); flow.Finance = (FinancialService)flow.Scope.ServiceProvider.GetRequiredService<IFinancialService>();
            var student = await Pass3TestData.CreateUserAsync(flow.Host.Services, "Student"); flow.StudentId = student.Id; flow.StudentEmail = student.Email;
            flow.TeacherId = (await Pass3TestData.CreateUserAsync(flow.Host.Services, "Teacher")).Id;
            var admin = await Pass3TestData.CreateUserAsync(flow.Host.Services, "Admin"); flow.AdminId = admin.Id; flow.AdminEmail = admin.Email;
            var now = factory.Clock.GetUtcNow(); var suffix = Guid.NewGuid().ToString("N");
            var subject = new Subject("Paymob " + suffix, "code"); var catalog = new ServiceCatalogItem("Paymob " + suffix, "Explanation", "pay_" + suffix, "خدمة", "شرح");
            var service = new TeacherService(flow.TeacherId, subject.Id, catalog.Id, "Lesson", "Payment boundary", 100, "SAR", 24, 1, now);
            var learning = new LearningRequest(flow.StudentId, flow.TeacherId, service.Id, "Lesson", "Explain", now.AddDays(3), 100, now);
            learning.Accept(flow.TeacherId, "accept", now); flow.Order = new Order(learning.Id, flow.StudentId, flow.TeacherId, service.Id, 100, "SAR", 8, 15, now.AddDays(2), 1, now);
            flow.Db.AddRange(subject, catalog, service, learning, flow.Order); await flow.Db.SaveChangesAsync();
            flow.Handler.Respond = flow.RespondAsync;
            flow.Payment = await flow.Finance.InitiateOrderPaymentAsync(flow.StudentId, flow.Order.Id, flow.Key, null, default);
            return flow;
        }
        private async Task<HttpResponseMessage> RespondAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Assert.Null(Db.Database.CurrentTransaction);
            var path = request.RequestUri!.AbsolutePath;
            if (path == "/v1/intention/")
            {
                Assert.True(await Db.Payments.AnyAsync(x => x.OrderId == Order.Id, ct));
                Assert.True(await Db.Set<ProviderCheckout>().AnyAsync(x => x.PaymentId == Db.Payments.Where(p => p.OrderId == Order.Id).Select(p => p.Id).Single(), ct));
                return Json(new { id = "pi_test_" + OrderId, intention_order_id = OrderId, client_secret = "checkout_" + OrderId });
            }
            if (path == "/api/auth/tokens") return Json(new { token = "generated_token" });
            if (path == "/api/acceptance/void_refund/refund")
            {
                RefundCalls++;
                if (RefundOutcome == "timeout") throw new TaskCanceledException();
                ProviderRefunded = RefundOutcome == "success";
                return Json(new { id = TransactionId + 1, pending = false, success = ProviderRefunded, amount_cents = 10800, currency = "SAR", is_live = false,
                    parent_transaction = TransactionId, is_refund = true, integration_id = 34667, error_occured = false });
            }
            if (path is "/api/ecommerce/orders/transaction_inquiry" || path == "/api/acceptance/transactions/" + TransactionId)
                return Json(Transaction(refunded: ProviderRefunded));
            throw new InvalidOperationException("Unexpected provider endpoint " + path);
        }
        internal JsonObject Transaction(bool success = true, long? id = null, bool refunded = false)
        {
            var tx = PaymobProviderTests.Transaction(Reference, id ?? TransactionId, success); tx["order"]!["id"] = OrderId;
            tx["is_refunded"] = refunded; tx["refunded_amount_cents"] = refunded ? 10800 : 0; return tx;
        }
        internal Task CallbackAsync(bool success = true, long? id = null, bool refunded = false)
        {
            var tx = Transaction(success, id, refunded); return Finance.ProcessWebhookAsync(Callback(tx), Sign(tx, Options.HmacSecret), default);
        }
        public async ValueTask DisposeAsync() { await Scope.DisposeAsync(); Client.Dispose(); Host.Dispose(); }
    }
}
