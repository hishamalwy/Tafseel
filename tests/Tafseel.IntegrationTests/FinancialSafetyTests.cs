using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Application.Finance;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Governance;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Finance;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>
/// FR-1 (escrow release must never exceed the confirmed capture) and FR-2 (teacher earnings must not be
/// withdrawable while still exposed to a dispute refund), proved end to end against SQL Server.
/// <para>
/// Order economics used throughout: price 100 SAR, student fee 8%, teacher commission 15%.
/// StudentTotal 108 · TeacherNet 85 · platform margin 23.
/// </para>
/// </summary>
[Trait("Category", "SqlServer")]
[Trait("Category", "Financial")]
public sealed class FinancialSafetyTests : IClassFixture<SqlServerTafseelApiFactory>
{
    private readonly SqlServerTafseelApiFactory factory;

    [Theory]
    [InlineData(-1, "lock_timeout")]
    [InlineData(-2, "lock_cancelled")]
    [InlineData(-3, "lock_deadlock")]
    [InlineData(-999, "lock_error")]
    public void Failed_application_lock_result_never_continues_unlocked(int result, string code)
    {
        var error = Assert.Throws<Tafseel.Domain.Common.DomainException>(
            () => ApplicationLock.ThrowIfNotAcquired(result));
        Assert.Equal(code, error.Code);
    }

    [Fact]
    public async Task Held_sql_application_lock_blocks_payment_mutation_instead_of_continuing_unlocked()
    {
        var data = await SeedAsync();
        var student = await ClientAsync(data.StudentEmail);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        await db.Database.AcquireAsync("payment-init:" + data.OrderId, CancellationToken.None);

        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{data.OrderId}")
        {
            Content = JsonContent.Create(new { })
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", "blocked-lock-attempt");
        var response = await student.SendAsync(request);
        Assert.False(response.IsSuccessStatusCode);
        Assert.Equal("lock_timeout", await CodeAsync(response));
        Assert.False(await db.Payments.AsNoTracking().AnyAsync(x => x.OrderId == data.OrderId));
        await tx.RollbackAsync();
    }

    public FinancialSafetyTests(SqlServerTafseelApiFactory factory)
    {
        this.factory = factory;
        // These tests advance the shared clock to cross dispute deadlines. xUnit builds a fresh test-class
        // instance per test, so resetting here keeps each test's issued JWTs valid against real wall time.
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
    }

    private const string WebhookSecret = "integration-tests-only-payment-webhook-secret";
    private const decimal TeacherNet = 85m;
    private const decimal StudentTotal = 108m;

    [Fact]
    public async Task Coupon_quote_uses_owned_order_total_and_refuses_teacher_and_outsider()
    {
        var data = await SeedAsync(couponFixedDiscount: 10);
        var path = $"/api/v1/payments/orders/{data.OrderId}/coupon-quote";
        var student = await ClientAsync(data.StudentEmail);
        var quote = await student.PostAsJsonAsync(path, new { couponCode = data.CouponCode });
        Assert.Equal(HttpStatusCode.OK, quote.StatusCode);
        using (var json = JsonDocument.Parse(await quote.Content.ReadAsStringAsync()))
        {
            Assert.Equal(108m, json.RootElement.GetProperty("baseAmount").GetDecimal());
            Assert.Equal(10m, json.RootElement.GetProperty("discountAmount").GetDecimal());
            Assert.Equal(98m, json.RootElement.GetProperty("chargeAmount").GetDecimal());
        }
        var teacher = await ClientAsync(data.TeacherEmail);
        Assert.Equal(HttpStatusCode.NotFound,
            (await teacher.PostAsJsonAsync(path, new { couponCode = data.CouponCode })).StatusCode);
        var outsider = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var stranger = await ClientAsync(outsider.Email);
        Assert.Equal(HttpStatusCode.NotFound,
            (await stranger.PostAsJsonAsync(path, new { couponCode = data.CouponCode })).StatusCode);
    }

    [Fact]
    public async Task Retry_cannot_silently_ignore_a_new_coupon_code()
    {
        var data = await SeedAsync(couponFixedDiscount: 10);
        var student = await ClientAsync(data.StudentEmail);
        await InitiateAsync(student, data.OrderId, "one-payment-attempt", null);
        var retry = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{data.OrderId}")
        {
            Content = JsonContent.Create(new { couponCode = data.CouponCode })
        };
        retry.Headers.TryAddWithoutValidation("Idempotency-Key", "one-payment-attempt");
        var response = await student.SendAsync(retry);
        Assert.False(response.IsSuccessStatusCode);
        Assert.Equal("payment_coupon_mismatch", await CodeAsync(response));
    }

    [Fact]
    public async Task Selected_open_request_coupon_records_a_discount_without_an_order_yet()
    {
        var data = await SeedMarketplaceAsync();
        var code = "OPEN" + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            db.Add(new Coupon("Open request coupon", code, CouponDiscountType.Fixed, 10, null,
                factory.Clock.GetUtcNow()));
            await db.SaveChangesAsync();
        }
        var student = await ClientAsync(data.StudentEmail);
        var request = new HttpRequestMessage(HttpMethod.Post,
            $"/api/v1/payments/open-requests/{data.RequestId}")
        {
            Content = JsonContent.Create(new { couponCode = code })
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", "open-coupon-" + data.RequestId);
        var response = await student.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var paymentJson = JsonDocument.Parse(await response.Content.ReadAsStringAsync())
            .RootElement.GetProperty("payment");
        var reference = paymentJson.GetProperty("providerReference").GetString()!;
        await using var check = factory.Services.CreateAsyncScope();
        var payments = check.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var pending = await payments.Payments.SingleAsync(x => x.LearningRequestId == data.RequestId);
        Assert.Equal(98m, pending.Amount);
        Assert.NotNull(pending.PendingCouponId);
        Assert.Equal(10m, pending.PendingCouponDiscount);
        Assert.False(await payments.CouponRedemptions.AnyAsync(x => x.PaymentId == pending.Id));
        (await WebhookAsync(Payload("open-coupon-confirm-" + pending.Id, reference, 98m, "SAR", true)))
            .EnsureSuccessStatusCode();
        payments.ChangeTracker.Clear();
        var confirmed = await payments.Payments.SingleAsync(x => x.Id == pending.Id);
        var redemption = await payments.CouponRedemptions.SingleAsync(x => x.PaymentId == pending.Id);
        Assert.Equal(confirmed.OrderId, redemption.OrderId);
        Assert.Equal(10m, redemption.DiscountAmount);
    }

    // ---------------------------------------------------------------- FR-1: coupon-aware allocation

    [Theory]
    // (A) no coupon: platform keeps its whole margin.
    [InlineData(null, 108, 85, 23)]
    // (B) coupon smaller than platform margin (23): absorbed entirely by the platform.
    [InlineData(10, 98, 85, 13)]
    // (C) coupon exactly equal to platform margin: platform goes to zero, teacher untouched.
    [InlineData(23, 85, 85, 0)]
    // (D) coupon larger than platform margin: the teacher shares only the excess.
    [InlineData(30, 78, 78, 0)]
    // (E) extreme but valid discount: capture is tiny, allocation still balances.
    [InlineData(107, 1, 1, 0)]
    public async Task Order_escrow_release_allocates_exactly_the_confirmed_capture(
        int? discount, int expectedCapture, int expectedTeacher, int expectedPlatform)
    {
        var data = await SeedAsync(couponFixedDiscount: discount);
        await PayAsync(data, $"cap-{discount}");

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var payment = await db.Payments.SingleAsync(x => x.OrderId == data.OrderId);
            Assert.Equal(expectedCapture, payment.Amount);
        }

        await DeliverAsync(data);
        await CompleteAsync(data);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var teacherRelease = await LedgerAmountAsync(db, $"order:{data.OrderId}:teacher-release");
            var platformRelease = await LedgerAmountAsync(db, $"order:{data.OrderId}:platform-release");

            Assert.Equal(expectedTeacher, teacherRelease);
            Assert.Equal(expectedPlatform, platformRelease);

            // The invariant this whole fix exists to guarantee.
            Assert.Equal(expectedCapture, teacherRelease + platformRelease);
            Assert.True(teacherRelease >= 0 && platformRelease >= 0);

            var held = await EscrowAmountAsync(db, data.OrderId, EscrowEntryType.Held);
            var released = await EscrowAmountAsync(db, data.OrderId, EscrowEntryType.Released);
            Assert.Equal(expectedCapture, held);
            Assert.Equal(expectedCapture, released);
            Assert.True(teacherRelease + platformRelease <= held,
                "escrow must never be drained by more than it received");
        }
    }

    [Fact]
    public async Task Coupon_release_never_exceeds_capture_even_though_order_totals_are_undiscounted()
    {
        var data = await SeedAsync(couponFixedDiscount: 30);
        await PayAsync(data, "regression-fr1");
        await DeliverAsync(data);
        await CompleteAsync(data);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var order = await db.Orders.AsNoTracking().SingleAsync(x => x.Id == data.OrderId);
        var payment = await db.Payments.AsNoTracking().SingleAsync(x => x.OrderId == data.OrderId);

        // The Order still carries its undiscounted commercial terms — those must not be treated as cash.
        Assert.Equal(StudentTotal, order.StudentTotal);
        Assert.Equal(TeacherNet, order.TeacherNet);
        Assert.Equal(78m, payment.Amount);

        var released = await LedgerAmountAsync(db, $"order:{data.OrderId}:teacher-release")
            + await LedgerAmountAsync(db, $"order:{data.OrderId}:platform-release");
        Assert.Equal(payment.Amount, released);
        Assert.NotEqual(order.StudentTotal, released);
    }

    [Fact]
    public async Task Duplicate_and_concurrent_completion_release_money_once()
    {
        var data = await SeedAsync(couponFixedDiscount: 10);
        await PayAsync(data, "idem-release");
        await DeliverAsync(data);

        var student = await ClientAsync(data.StudentEmail);
        var version = await OrderVersionAsync(data.OrderId);
        var attempts = await Task.WhenAll(
            SendAsync(student, HttpMethod.Post, $"/api/v1/orders/{data.OrderId}/complete", null, version),
            SendAsync(student, HttpMethod.Post, $"/api/v1/orders/{data.OrderId}/complete", null, version));
        Assert.Single(attempts, x => x.StatusCode == HttpStatusCode.NoContent);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Single(await db.LedgerEntries
            .Where(x => x.BusinessKey == $"order:{data.OrderId}:teacher-release").ToArrayAsync());
        Assert.Single(await db.LedgerEntries
            .Where(x => x.BusinessKey == $"order:{data.OrderId}:platform-release").ToArrayAsync());
        Assert.Single(await db.EscrowEntries
            .Where(x => x.OrderId == data.OrderId && x.Type == EscrowEntryType.Released).ToArrayAsync());
        Assert.Single(await db.TeacherEarningMaturities.Where(x => x.OrderId == data.OrderId).ToArrayAsync());
    }

    [Fact]
    public async Task Refund_after_coupon_funded_completion_reverses_only_real_money()
    {
        var data = await SeedAsync(couponFixedDiscount: 30);
        await PayAsync(data, "refund-after-release");
        await DeliverAsync(data);
        await CompleteAsync(data);

        var paymentId = await PaymentIdAsync(data.OrderId);
        await ResolveDisputeRefundAsync(data, "reverse-1");

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var refund = await db.Refunds.SingleAsync(x => x.PaymentId == paymentId);
            var reversal = await db.LedgerEntries
                .Where(x => x.ReferenceType == "Refund" && x.ReferenceId == refund.Id.ToString())
                .SumAsync(x => (decimal?)x.Amount) ?? 0;
            // Captured 78, so exactly 78 may be reversed — not the undiscounted 108.
            Assert.Equal(78m, refund.Amount);
            Assert.Equal(78m, reversal);
            Assert.Equal(TeacherEarningMaturityStatus.Reversed,
                await db.TeacherEarningMaturities.Where(x => x.PaymentId == paymentId)
                    .Select(x => x.Status).SingleAsync());
        }
    }

    [Fact]
    public async Task Payment_amount_mismatch_is_still_rejected()
    {
        var data = await SeedAsync(couponFixedDiscount: 10);
        var student = await ClientAsync(data.StudentEmail);
        var payment = await InitiateAsync(student, data.OrderId, "mismatch-key", data.CouponCode);
        var reference = payment.GetProperty("providerReference").GetString()!;

        // The undiscounted total must not be accepted for a discounted capture.
        var mismatch = await WebhookAsync(Payload("mismatch-total", reference, StudentTotal, "SAR", true));
        Assert.Equal(HttpStatusCode.BadRequest, mismatch.StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(PaymentStatus.Pending,
            await db.Payments.Where(x => x.OrderId == data.OrderId).Select(x => x.Status).SingleAsync());
    }

    [Fact]
    public async Task Marketplace_converted_order_allocates_identically_to_a_direct_order()
    {
        var data = await SeedMarketplaceAsync();
        var student = await ClientAsync(data.StudentEmail);
        var request = new HttpRequestMessage(
            HttpMethod.Post, $"/api/v1/payments/open-requests/{data.RequestId}");
        request.Headers.TryAddWithoutValidation("Idempotency-Key", "market-pay");
        request.Content = JsonContent.Create(new { });
        var response = await student.SendAsync(request);
        response.EnsureSuccessStatusCode();
        var payment = JsonDocument.Parse(await response.Content.ReadAsStringAsync())
            .RootElement.GetProperty("payment");
        var reference = payment.GetProperty("providerReference").GetString()!;
        var amount = payment.GetProperty("amount").GetDecimal();
        (await WebhookAsync(Payload("market-confirm", reference, amount, "SAR", true))).EnsureSuccessStatusCode();

        Guid orderId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var order = await db.Orders.SingleAsync(x => x.LearningRequestId == data.RequestId);
            orderId = order.Id;
            order.Start(data.TeacherId, factory.Clock.GetUtcNow());
            order.Deliver(data.TeacherId, "key", "d.pdf", "application/pdf", 4, "done", factory.Clock.GetUtcNow());
            await db.SaveChangesAsync();
        }
        var version = await OrderVersionAsync(orderId);
        (await SendAsync(student, HttpMethod.Post, $"/api/v1/orders/{orderId}/complete", null, version))
            .EnsureSuccessStatusCode();

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var confirmed = await db.Payments.AsNoTracking().SingleAsync(x => x.OrderId == orderId);
            var teacherRelease = await LedgerAmountAsync(db, $"order:{orderId}:teacher-release");
            var platformRelease = await LedgerAmountAsync(db, $"order:{orderId}:platform-release");
            Assert.Equal(confirmed.Amount, teacherRelease + platformRelease);
            // Converted Orders take the same clearance route as direct ones.
            Assert.Single(await db.TeacherEarningMaturities.Where(x => x.OrderId == orderId).ToArrayAsync());
        }
    }

    // ---------------------------------------------------------------- FR-2: earnings clearance

    [Fact]
    public async Task Manual_completion_inside_the_dispute_window_credits_clearance_not_available()
    {
        var data = await SeedAsync();
        await PayAsync(data, "pending-1");
        await DeliverAsync(data);
        var deliveredAt = factory.Clock.GetUtcNow();
        await CompleteAsync(data);

        var teacher = await ClientAsync(data.TeacherEmail);
        var balance = JsonDocument.Parse(await teacher.GetStringAsync("/api/v1/withdrawals/balances"))
            .RootElement.EnumerateArray().Single();
        Assert.Equal(0m, balance.GetProperty("available").GetDecimal());
        Assert.Equal(TeacherNet, balance.GetProperty("pendingClearance").GetDecimal());

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var maturity = await db.TeacherEarningMaturities.SingleAsync(x => x.OrderId == data.OrderId);
        Assert.Equal(TeacherEarningMaturityStatus.Pending, maturity.Status);
        // Maturity is derived from the dispute deadline, not from an arbitrary "wait N days after completion".
        Assert.Equal(deliveredAt.AddDays(7), maturity.MaturesAt);
        Assert.Equal(TeacherNet, await AccountBalanceAsync(db, data.TeacherId, LedgerAccountKind.TeacherPending));
        Assert.Equal(0m, await AccountBalanceAsync(db, data.TeacherId, LedgerAccountKind.TeacherAvailable));
    }

    [Fact]
    public async Task Clearing_earnings_cannot_be_withdrawn()
    {
        var data = await SeedAsync();
        await PayAsync(data, "no-withdraw");
        await DeliverAsync(data);
        await CompleteAsync(data);
        var teacher = await ClientAsync(data.TeacherEmail);
        await VerifyPayoutProfileAsync(data, teacher);

        var attempt = await WithdrawalAsync(teacher, 50, "too-early");
        Assert.Equal(HttpStatusCode.BadRequest, attempt.StatusCode);
        Assert.Contains("insufficient_balance", await attempt.Content.ReadAsStringAsync());
    }

    /// <summary>
    /// FIN-01 reads these three numbers and one date to tell a teacher what they can withdraw, what is
    /// still clearing and when it becomes available; only the teacher may read them.
    /// </summary>
    [Fact]
    public async Task Balances_tell_the_teacher_when_the_clearing_amount_becomes_available()
    {
        var data = await SeedAsync();
        await PayAsync(data, "fin01-balances");
        await DeliverAsync(data);
        await CompleteAsync(data);

        var teacher = await ClientAsync(data.TeacherEmail);
        // Signed in before the clock jump below: a token minted "a week from now" is not yet valid.
        var student = await ClientAsync(data.StudentEmail);
        var clearing = JsonDocument.Parse(await teacher.GetStringAsync("/api/v1/withdrawals/balances"))
            .RootElement.EnumerateArray().Single();
        Assert.Equal("SAR", clearing.GetProperty("currency").GetString());
        Assert.Equal(0m, clearing.GetProperty("available").GetDecimal());
        Assert.Equal(TeacherNet, clearing.GetProperty("pendingClearance").GetDecimal());
        Assert.Equal(0m, clearing.GetProperty("pendingWithdrawal").GetDecimal());
        Assert.Equal(await MaturesAtAsync(data.OrderId),
            clearing.GetProperty("nextClearanceAt").GetDateTimeOffset());

        // After the objection period the same amount is withdrawable and there is no date left to announce.
        factory.Clock.SetUtcNow((await MaturesAtAsync(data.OrderId)).AddMinutes(1));
        await factory.Services.GetRequiredService<EarningsMaturityWorker>().MatureDueEarningsAsync(default);
        var available = JsonDocument.Parse(await teacher.GetStringAsync("/api/v1/withdrawals/balances"))
            .RootElement.EnumerateArray().Single();
        Assert.Equal(TeacherNet, available.GetProperty("available").GetDecimal());
        Assert.Equal(0m, available.GetProperty("pendingClearance").GetDecimal());
        Assert.Equal(JsonValueKind.Null, available.GetProperty("nextClearanceAt").ValueKind);

        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/v1/withdrawals/balances")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/v1/withdrawals/policy")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await factory.CreateClient().GetAsync("/api/v1/withdrawals/balances")).StatusCode);
    }

    [Fact]
    public async Task Maturity_worker_promotes_only_after_the_dispute_deadline_and_is_idempotent()
    {
        var data = await SeedAsync();
        await PayAsync(data, "mature-1");
        await DeliverAsync(data);
        await CompleteAsync(data);
        var worker = factory.Services.GetRequiredService<EarningsMaturityWorker>();
        var maturityId = await MaturityIdAsync(data.OrderId);

        // At the deadline itself a dispute is still admissible, so nothing may be promoted yet.
        var maturesAt = await MaturesAtAsync(data.OrderId);
        factory.Clock.SetUtcNow(maturesAt);
        await worker.MatureDueEarningsAsync(default);
        Assert.Equal(TeacherEarningMaturityStatus.Pending, await MaturityStatusAsync(maturityId));

        factory.Clock.SetUtcNow(maturesAt.AddSeconds(1));
        await worker.MatureDueEarningsAsync(default);
        Assert.Equal(TeacherEarningMaturityStatus.Matured, await MaturityStatusAsync(maturityId));
        // Repeated runs must not move money twice.
        await worker.MatureDueEarningsAsync(default);
        await worker.MatureDueEarningsAsync(default);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(TeacherNet, await AccountBalanceAsync(db, data.TeacherId, LedgerAccountKind.TeacherAvailable));
        Assert.Equal(0m, await AccountBalanceAsync(db, data.TeacherId, LedgerAccountKind.TeacherPending));
        var key = $"order:{data.OrderId}:teacher-maturity";
        Assert.Single(await db.LedgerEntries.Where(x => x.BusinessKey == key).ToArrayAsync());
        Assert.Single(await db.FinancialAuditRecords.Where(x => x.CorrelationKey == key).ToArrayAsync());
    }

    [Fact]
    public async Task Concurrent_maturity_attempts_promote_money_once()
    {
        var data = await SeedAsync();
        await PayAsync(data, "mature-race");
        await DeliverAsync(data);
        await CompleteAsync(data);
        factory.Clock.SetUtcNow((await MaturesAtAsync(data.OrderId)).AddMinutes(1));

        Guid maturityId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            maturityId = await db.TeacherEarningMaturities.Where(x => x.OrderId == data.OrderId)
                .Select(x => x.Id).SingleAsync();
        }

        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(async _ =>
        {
            await using var scope = factory.Services.CreateAsyncScope();
            var finance = scope.ServiceProvider.GetRequiredService<IFinancialService>();
            try { return await finance.MatureTeacherEarningAsync(maturityId, default); }
            catch { return false; }
        }));
        Assert.Single(results, x => x);

        await using var verify = factory.Services.CreateAsyncScope();
        var db2 = verify.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Single(await db2.LedgerEntries
            .Where(x => x.BusinessKey == $"order:{data.OrderId}:teacher-maturity").ToArrayAsync());
        Assert.Equal(TeacherNet, await AccountBalanceAsync(db2, data.TeacherId, LedgerAccountKind.TeacherAvailable));
    }

    [Fact]
    public async Task Refund_before_maturity_reverses_clearance_and_never_matures_later()
    {
        var data = await SeedAsync();
        await PayAsync(data, "reverse-pending");
        await DeliverAsync(data);
        await CompleteAsync(data);

        await ResolveDisputeRefundAsync(data, "reverse-pending-1");

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            // The reversal came out of clearance, so the teacher is not left negative.
            Assert.Equal(0m, await AccountBalanceAsync(db, data.TeacherId, LedgerAccountKind.TeacherPending));
            Assert.Equal(0m, await AccountBalanceAsync(db, data.TeacherId, LedgerAccountKind.TeacherAvailable));
        }

        // Even long past the deadline, refunded money must never be promoted.
        var maturityId = await MaturityIdAsync(data.OrderId);
        Assert.Equal(TeacherEarningMaturityStatus.Reversed, await MaturityStatusAsync(maturityId));
        factory.Clock.SetUtcNow(factory.Clock.GetUtcNow().AddDays(30));
        var worker = factory.Services.GetRequiredService<EarningsMaturityWorker>();
        await worker.MatureDueEarningsAsync(default);
        Assert.Equal(TeacherEarningMaturityStatus.Reversed, await MaturityStatusAsync(maturityId));

        await using var verify = factory.Services.CreateAsyncScope();
        var db2 = verify.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(0m, await AccountBalanceAsync(db2, data.TeacherId, LedgerAccountKind.TeacherAvailable));
        Assert.Empty(await db2.LedgerEntries
            .Where(x => x.BusinessKey == $"order:{data.OrderId}:teacher-maturity").ToArrayAsync());
    }

    [Fact]
    public async Task Completion_after_the_dispute_window_credits_available_immediately()
    {
        var data = await SeedAsync();
        await PayAsync(data, "no-exposure");
        await DeliverAsync(data);
        // Token minted before the jump: JWT lifetimes are validated against real wall time.
        var student = await ClientAsync(data.StudentEmail);
        // Auto-release deliberately waits out the dispute window; by then no exposure remains.
        factory.Clock.SetUtcNow(factory.Clock.GetUtcNow().AddDays(8));
        await CompleteAsync(data, student);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(TeacherNet, await AccountBalanceAsync(db, data.TeacherId, LedgerAccountKind.TeacherAvailable));
        Assert.Equal(0m, await AccountBalanceAsync(db, data.TeacherId, LedgerAccountKind.TeacherPending));
        Assert.Empty(await db.TeacherEarningMaturities.Where(x => x.OrderId == data.OrderId).ToArrayAsync());
    }

    [Fact]
    public async Task Existing_available_balance_is_never_moved_back_into_clearance()
    {
        var data = await SeedAsync();
        await PayAsync(data, "legacy-available");
        await DeliverAsync(data);
        var student = await ClientAsync(data.StudentEmail);
        factory.Clock.SetUtcNow(factory.Clock.GetUtcNow().AddDays(8));
        await CompleteAsync(data, student);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var before = await AccountBalanceAsync(db, data.TeacherId, LedgerAccountKind.TeacherAvailable);

        var worker = factory.Services.GetRequiredService<EarningsMaturityWorker>();
        factory.Clock.SetUtcNow(factory.Clock.GetUtcNow().AddDays(30));
        await worker.MatureDueEarningsAsync(default);

        // This teacher's already-available balance must be exactly what it was: never re-held, never re-credited.
        Assert.Equal(before, await AccountBalanceAsync(db, data.TeacherId, LedgerAccountKind.TeacherAvailable));
        Assert.Equal(0m, await AccountBalanceAsync(db, data.TeacherId, LedgerAccountKind.TeacherPending));
    }

    [Fact]
    public async Task Matured_earnings_become_withdrawable()
    {
        var data = await SeedAsync();
        await PayAsync(data, "withdraw-after-maturity");
        await DeliverAsync(data);
        await CompleteAsync(data);
        var teacher = await ClientAsync(data.TeacherEmail);
        await VerifyPayoutProfileAsync(data, teacher);

        factory.Clock.SetUtcNow((await MaturesAtAsync(data.OrderId)).AddMinutes(1));
        await factory.Services.GetRequiredService<EarningsMaturityWorker>().MatureDueEarningsAsync(default);

        var balance = JsonDocument.Parse(await teacher.GetStringAsync("/api/v1/withdrawals/balances"))
            .RootElement.EnumerateArray().Single();
        Assert.Equal(TeacherNet, balance.GetProperty("available").GetDecimal());
        Assert.Equal(0m, balance.GetProperty("pendingClearance").GetDecimal());
        (await WithdrawalAsync(teacher, 60, "now-allowed")).EnsureSuccessStatusCode();
    }

    // ---------------------------------------------------------------- reconciliation

    [Fact]
    public async Task Reconciliation_reports_a_healthy_balanced_transaction()
    {
        var data = await SeedAsync(couponFixedDiscount: 30);
        await PayAsync(data, "recon-healthy");
        await DeliverAsync(data);
        await CompleteAsync(data);

        var admin = await ClientAsync(data.AdminEmail);
        var report = JsonDocument.Parse(
            await admin.GetStringAsync("/api/v1/admin/finance/reconciliation")).RootElement;
        // The database is shared with the anomaly test, so assert that *this* purchase is clean rather
        // than that the whole ledger is: no anomaly may reference this Order.
        Assert.DoesNotContain(report.GetProperty("anomalies").EnumerateArray(), x =>
            x.TryGetProperty("orderId", out var id)
            && id.ValueKind == JsonValueKind.String
            && id.GetGuid() == data.OrderId);
        Assert.Equal(0, report.GetProperty("duplicateBusinessKeys").GetInt32());

        var coupons = JsonDocument.Parse(
            await admin.GetStringAsync("/api/v1/admin/finance/reconciliation/coupons?limit=500")).RootElement;
        Assert.Equal(0, coupons.GetProperty("overReleased").GetInt32());
        Assert.Equal(0, coupons.GetProperty("missingEscrow").GetInt32());
        // The shared test database also holds other tests' purchases, so assert on this Order's row.
        var row = coupons.GetProperty("rows").EnumerateArray()
            .Single(x => x.GetProperty("orderId").GetGuid() == data.OrderId);
        Assert.Equal(78m, row.GetProperty("confirmedAmount").GetDecimal());
        Assert.Equal(30m, row.GetProperty("couponDiscount").GetDecimal());
        Assert.Equal(0m, row.GetProperty("difference").GetDecimal());
        Assert.Equal("Balanced", row.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Reconciliation_detects_over_release_missing_escrow_and_negative_balances()
    {
        var data = await SeedAsync(couponFixedDiscount: 30);
        await PayAsync(data, "recon-anomaly");
        await DeliverAsync(data);
        await CompleteAsync(data);

        // Simulate the pre-fix FR-1 behaviour by injecting the difference the old code would have released.
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var payment = await db.Payments.AsNoTracking().SingleAsync(x => x.OrderId == data.OrderId);
            var escrow = await db.LedgerAccounts.SingleAsync(x => x.Kind == LedgerAccountKind.EscrowHeld);
            var platform = await db.LedgerAccounts.SingleAsync(x => x.Kind == LedgerAccountKind.PlatformRevenue);
            db.Add(new LedgerEntry($"order:{data.OrderId}:platform-release-legacy-drift",
                escrow.Id, platform.Id, 30m, "SAR", "Order", data.OrderId.ToString(), factory.Clock.GetUtcNow()));
            db.Add(new EscrowEntry(payment.Id, data.OrderId, EscrowEntryType.Released, 30m, "SAR",
                $"order:{data.OrderId}:release-legacy-drift", factory.Clock.GetUtcNow()));
            // And a teacher whose available balance went negative through a post-withdrawal reversal.
            var teacherAvailable = await db.LedgerAccounts
                .SingleOrDefaultAsync(x => x.Kind == LedgerAccountKind.TeacherAvailable
                    && x.OwnerId == data.TeacherId);
            if (teacherAvailable is null)
            {
                teacherAvailable = new LedgerAccount(
                    LedgerAccountKind.TeacherAvailable, data.TeacherId, "SAR", factory.Clock.GetUtcNow());
                db.Add(teacherAvailable);
            }
            var refundClearing = new LedgerAccount(
                LedgerAccountKind.RefundClearing, "", "SAR", factory.Clock.GetUtcNow());
            db.Add(refundClearing);
            db.Add(new LedgerEntry($"order:{data.OrderId}:synthetic-hole", teacherAvailable.Id,
                refundClearing.Id, 5m, "SAR", "Refund", data.OrderId.ToString(), factory.Clock.GetUtcNow()));
            await db.SaveChangesAsync();
        }

        var admin = await ClientAsync(data.AdminEmail);
        var report = JsonDocument.Parse(
            await admin.GetStringAsync("/api/v1/admin/finance/reconciliation")).RootElement;

        Assert.False(report.GetProperty("isBalanced").GetBoolean());
        Assert.True(report.GetProperty("overReleasedPayments").GetInt32() >= 1);
        Assert.True(report.GetProperty("negativeTeacherAvailableAccounts").GetInt32() >= 1);
        var kinds = report.GetProperty("anomalies").EnumerateArray()
            .Select(x => x.GetProperty("kind").GetString()).ToArray();
        Assert.Contains("EscrowOverReleased", kinds);
        Assert.Contains("NegativeTeacherAvailable", kinds);
        // Drill-down identifiers must be present for an Admin to investigate.
        var overRelease = report.GetProperty("anomalies").EnumerateArray()
            .First(x => x.GetProperty("kind").GetString() == "EscrowOverReleased");
        Assert.Equal(data.OrderId, overRelease.GetProperty("orderId").GetGuid());
        Assert.Equal(30m, overRelease.GetProperty("difference").GetDecimal());

        var coupons = JsonDocument.Parse(
            await admin.GetStringAsync("/api/v1/admin/finance/reconciliation/coupons?limit=500")).RootElement;
        var couponRow = coupons.GetProperty("rows").EnumerateArray()
            .Single(x => x.GetProperty("orderId").GetGuid() == data.OrderId);
        Assert.Contains(couponRow.GetProperty("status").GetString(), new[] { "OverReleased", "DuplicateMovement" });
    }

    // ---------------------------------------------------------------- helpers

    private async Task<Guid> MaturityIdAsync(Guid orderId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return await db.TeacherEarningMaturities.Where(x => x.OrderId == orderId)
            .Select(x => x.Id).SingleAsync();
    }

    private async Task<TeacherEarningMaturityStatus> MaturityStatusAsync(Guid maturityId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return await db.TeacherEarningMaturities.AsNoTracking()
            .Where(x => x.Id == maturityId).Select(x => x.Status).SingleAsync();
    }

    private async Task<Guid> PaymentIdAsync(Guid orderId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return await db.Payments.Where(x => x.OrderId == orderId).Select(x => x.Id).SingleAsync();
    }

    /// <summary>
    /// Reverses a released Order through the real post-release path: a student dispute resolved as
    /// RefundStudent. The admin refund endpoint deliberately only covers still-held escrow
    /// (<c>refund_after_release_forbidden</c>), so it cannot be used here.
    /// </summary>
    private async Task ResolveDisputeRefundAsync(SeedData data, string idempotencyKey)
    {
        var student = await ClientAsync(data.StudentEmail);
        var admin = await ClientAsync(data.AdminEmail);
        var opened = await SendAsync(student, HttpMethod.Post, "/api/v1/disputes",
            new { orderId = data.OrderId, reason = "Delivery did not match the agreed scope." });
        opened.EnsureSuccessStatusCode();
        var dispute = JsonDocument.Parse(await opened.Content.ReadAsStringAsync()).RootElement;
        var disputeId = dispute.GetProperty("id").GetGuid();

        var review = await SendAsync(admin, HttpMethod.Post,
            $"/api/v1/admin/disputes/{disputeId}/start-review", null, await DisputeVersionAsync(disputeId));
        review.EnsureSuccessStatusCode();
        var resolve = await SendAsync(admin, HttpMethod.Post,
            $"/api/v1/admin/disputes/{disputeId}/resolve",
            new { resolution = (int)DisputeResolution.RefundStudent, rationale = "Evidence supported the student." },
            await DisputeVersionAsync(disputeId), idempotencyKey);
        resolve.EnsureSuccessStatusCode();
    }

    private async Task<string> DisputeVersionAsync(Guid disputeId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var version = await db.Disputes.AsNoTracking().Where(x => x.Id == disputeId)
            .Select(x => x.RowVersion).SingleAsync();
        return Convert.ToBase64String(version);
    }

    private async Task<DateTimeOffset> MaturesAtAsync(Guid orderId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return await db.TeacherEarningMaturities.Where(x => x.OrderId == orderId)
            .Select(x => x.MaturesAt).SingleAsync();
    }

    private static async Task<decimal> LedgerAmountAsync(TafseelDbContext db, string businessKey) =>
        await db.LedgerEntries.AsNoTracking().Where(x => x.BusinessKey == businessKey)
            .SumAsync(x => (decimal?)x.Amount) ?? 0;

    private static async Task<decimal> EscrowAmountAsync(TafseelDbContext db, Guid orderId, EscrowEntryType type) =>
        await db.EscrowEntries.AsNoTracking().Where(x => x.OrderId == orderId && x.Type == type)
            .SumAsync(x => (decimal?)x.Amount) ?? 0;

    private static async Task<decimal> AccountBalanceAsync(
        TafseelDbContext db, string teacherId, LedgerAccountKind kind)
    {
        var account = await db.LedgerAccounts.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Kind == kind && x.OwnerId == teacherId);
        if (account is null) return 0;
        var credits = await db.LedgerEntries.AsNoTracking()
            .Where(x => x.CreditAccountId == account.Id).SumAsync(x => (decimal?)x.Amount) ?? 0;
        var debits = await db.LedgerEntries.AsNoTracking()
            .Where(x => x.DebitAccountId == account.Id).SumAsync(x => (decimal?)x.Amount) ?? 0;
        return credits - debits;
    }

    private async Task PayAsync(SeedData data, string key)
    {
        var student = await ClientAsync(data.StudentEmail);
        var payment = await InitiateAsync(student, data.OrderId, key, data.CouponCode);
        var reference = payment.GetProperty("providerReference").GetString()!;
        var amount = payment.GetProperty("amount").GetDecimal();
        (await WebhookAsync(Payload($"{key}-confirm", reference, amount, "SAR", true))).EnsureSuccessStatusCode();
    }

    private async Task DeliverAsync(SeedData data)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var order = await db.Orders.SingleAsync(x => x.Id == data.OrderId);
        order.Start(data.TeacherId, factory.Clock.GetUtcNow());
        order.Deliver(data.TeacherId, "storage", "delivery.pdf", "application/pdf", 8,
            "Delivered", factory.Clock.GetUtcNow());
        await db.SaveChangesAsync();
    }

    private async Task CompleteAsync(SeedData data, HttpClient? authenticated = null)
    {
        var student = authenticated ?? await ClientAsync(data.StudentEmail);
        var response = await SendAsync(student, HttpMethod.Post,
            $"/api/v1/orders/{data.OrderId}/complete", null, await OrderVersionAsync(data.OrderId));
        response.EnsureSuccessStatusCode();
    }

    private async Task VerifyPayoutProfileAsync(SeedData data, HttpClient teacher)
    {
        var submitted = await teacher.PutAsJsonAsync("/api/v1/withdrawals/profile", new
        {
            legalName = "Verified Teacher",
            countryCode = "SA",
            payoutMethod = "bank_transfer",
            bankName = "Test Bank",
            iban = "SA0380000000608010167519",
            identityLast4 = "1234"
        });
        submitted.EnsureSuccessStatusCode();
        var profile = JsonDocument.Parse(await submitted.Content.ReadAsStringAsync()).RootElement;
        var admin = await ClientAsync(data.AdminEmail);
        var review = await SendAsync(admin, HttpMethod.Post,
            $"/api/v1/admin/payout-profiles/{data.TeacherId}/review", new { approve = true },
            profile.GetProperty("version").GetString()!);
        review.EnsureSuccessStatusCode();
    }

    private async Task<string> OrderVersionAsync(Guid orderId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var version = await db.Orders.AsNoTracking().Where(x => x.Id == orderId)
            .Select(x => x.RowVersion).SingleAsync();
        return Convert.ToBase64String(version);
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static async Task<JsonElement> InitiateAsync(
        HttpClient client, Guid orderId, string key, string? couponCode)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{orderId}");
        request.Headers.TryAddWithoutValidation("Idempotency-Key", key);
        request.Content = JsonContent.Create(couponCode is null ? new { } : (object)new { couponCode });
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

    private static byte[] Payload(
        string eventId, string reference, decimal amount, string currency, bool succeeded) =>
        JsonSerializer.SerializeToUtf8Bytes(new
        {
            eventId,
            providerReference = reference,
            amount,
            currency,
            succeeded
        });

    private static async Task<HttpResponseMessage> SendAsync(
        HttpClient client, HttpMethod method, string url, object? body, string? version = null,
        string? idempotencyKey = null)
    {
        var request = new HttpRequestMessage(method, url);
        if (body is not null) request.Content = JsonContent.Create(body);
        if (version is not null) request.Headers.TryAddWithoutValidation("If-Match", version);
        if (idempotencyKey is not null) request.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);
        return await client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> WithdrawalAsync(HttpClient client, decimal amount, string key) =>
        SendAsync(client, HttpMethod.Post, "/api/v1/withdrawals",
            new { amount, currency = "SAR" }, null, key);

    private static Task<HttpResponseMessage> RefundAsync(HttpClient client, Guid paymentId, string key) =>
        SendAsync(client, HttpMethod.Post, $"/api/v1/payments/{paymentId}/refund",
            new { reason = "Integration test refund" }, null, key);

    private static async Task<string> CodeAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString()!;

    private async Task<SeedData> SeedAsync(int? couponFixedDiscount = null)
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var admin = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Admin);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Safety Subject " + suffix, "code");
        var type = new ServiceCatalogItem(
            "Safety Service " + suffix, "Explanation", "svc_" + suffix, "خدمة", "شرح");
        var service = new TeacherService(teacher.Id, subject.Id, type.Id, "Financial safety order",
            "Order used to prove escrow behavior.", 100, "SAR", 24, 1, factory.Clock.GetUtcNow());
        var request = new LearningRequest(student.Id, teacher.Id, service.Id, "Safety request",
            "Explain the supplied material.", factory.Clock.GetUtcNow().AddDays(3), 100, factory.Clock.GetUtcNow());
        request.Accept(teacher.Id, "seed-accept", factory.Clock.GetUtcNow());
        var order = new Order(request.Id, student.Id, teacher.Id, service.Id, 100, "SAR",
            8, 15, factory.Clock.GetUtcNow().AddDays(2), 1, factory.Clock.GetUtcNow());
        db.AddRange(subject, type, service, request, order,
            new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()));

        string? couponCode = null;
        if (couponFixedDiscount is int discount)
        {
            couponCode = ("SAFE" + suffix[..8]).ToUpperInvariant();
            db.Add(new Coupon("Safety coupon", couponCode, CouponDiscountType.Fixed,
                discount, null, factory.Clock.GetUtcNow()));
        }
        await db.SaveChangesAsync();
        return new(student.Email, teacher.Email, admin.Email, teacher.Id, order.Id, couponCode);
    }

    private async Task<MarketplaceSeedData> SeedMarketplaceAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var now = factory.Clock.GetUtcNow();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Market Subject " + suffix, "code");
        var type = new ServiceCatalogItem(
            "Market Service " + suffix, "Explanation", "svc_" + suffix, "خدمة", "شرح");
        var service = new TeacherService(teacher.Id, subject.Id, type.Id, "Marketplace order",
            "Order created by offer conversion.", 100, "SAR", 24, 1, now);
        var request = new LearningRequest(student.Id, subject.Id, "Market request",
            "Explain the supplied material.", now.AddDays(3), 50, 200, now);
        request.CaptureServiceIdentity(type);
        var offer = new TeacherOffer(request.Id, teacher.Id, service.Id, 100, 24, 1, "I can help", now.AddDays(3), now);
        db.AddRange(subject, type, service, request, offer,
            new TeacherSubjectQualification(teacher.Id, subject.Id, now));
        // Saved first: LearningRequest.SelectedOfferId and TeacherOffer.LearningRequestId reference each
        // other, so selecting before the initial insert produces a circular FK dependency.
        await db.SaveChangesAsync();
        request.SelectOffer(student.Id, offer.Id, now, 120);
        offer.Select(now);
        await db.SaveChangesAsync();
        return new(student.Email, teacher.Id, request.Id);
    }

    private sealed record SeedData(
        string StudentEmail, string TeacherEmail, string AdminEmail,
        string TeacherId, Guid OrderId, string? CouponCode);

    private sealed record MarketplaceSeedData(string StudentEmail, string TeacherId, Guid RequestId);
}
