using System.Data;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Finance;
using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Orders;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Messaging;

namespace Tafseel.Infrastructure.Finance;

internal sealed class FinancialService(
    TafseelDbContext db, IPaymentProvider provider, ICouponService coupons,
    NotificationWriter notifications, TimeProvider clock) : IFinancialService
{
    public async Task<PaymentInitiationDto> InitiateOrderPaymentAsync(
        string studentId, Guid orderId, string idempotencyKey, string? couponCode, CancellationToken ct)
    {
        idempotencyKey = RequiredKey(idempotencyKey);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"payment-init:{orderId}", ct);
        var existing = await db.Payments.SingleOrDefaultAsync(x => x.OrderId == orderId, ct);
        if (existing is not null)
        {
            if (existing.StudentId != studentId || existing.InitiationIdempotencyKey != idempotencyKey)
                throw new DomainException("payment_already_initiated", "Payment has already been initiated.");
            var retry = await provider.InitiateAsync(orderId, existing.Amount, existing.Currency, ct);
            return new(Map(existing), retry.CheckoutReference);
        }
        var order = await db.Orders.SingleOrDefaultAsync(
                x => x.Id == orderId && x.StudentId == studentId, ct)
            ?? throw new DomainException("order_not_owned", "Order was not found.");
        if (order.Status != OrderStatus.AwaitingPayment || order.PaymentStatus != OrderPaymentStatus.Pending)
            throw new DomainException("payment_not_allowed", "This order cannot be paid.");
        var now = clock.GetUtcNow();
        var (coupon, discount, charge) = await coupons
            .ResolveForPaymentAsync(couponCode, order.StudentTotal, order.Currency, now, ct);
        var initiation = await provider.InitiateAsync(order.Id, charge, order.Currency, ct);
        var payment = new Payment(order.Id, studentId, charge, order.Currency,
            provider.Name, initiation.ProviderReference, idempotencyKey, now);
        db.AddRange(payment,
            new PaymentAttempt(payment.Id, initiation.ProviderReference, PaymentAttemptStatus.Created, null, now),
            Audit("PaymentInitiated", studentId, "Payment", payment.Id.ToString(), idempotencyKey));
        if (coupon is not null)
            db.Add(new CouponRedemption(coupon.Id, studentId, payment.Id, order.Id, null, discount, order.Currency, now));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return new(Map(payment), initiation.CheckoutReference);
    }

    public async Task<PaymentInitiationDto> InitiateLiveSessionPaymentAsync(
        string studentId, Guid liveSessionBookingId, string idempotencyKey, string? couponCode, CancellationToken ct)
    {
        idempotencyKey = RequiredKey(idempotencyKey);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"payment-init-session:{liveSessionBookingId}", ct);
        var existing = await db.Payments.SingleOrDefaultAsync(
            x => x.LiveSessionBookingId == liveSessionBookingId, ct);
        if (existing is not null)
        {
            if (existing.StudentId != studentId || existing.InitiationIdempotencyKey != idempotencyKey)
                throw new DomainException("payment_already_initiated", "Payment has already been initiated.");
            var retry = await provider.InitiateAsync(
                liveSessionBookingId, existing.Amount, existing.Currency, ct);
            return new(Map(existing), retry.CheckoutReference);
        }
        var booking = await db.LiveSessionBookings.SingleOrDefaultAsync(
                x => x.Id == liveSessionBookingId && x.StudentId == studentId, ct)
            ?? throw new DomainException("live_session_not_owned", "Live session was not found.");
        if (booking.Status != LiveSessionStatus.AwaitingPayment)
            throw new DomainException("payment_not_allowed", "This live session cannot be paid.");
        var now = clock.GetUtcNow();
        var (coupon, discount, charge) = await coupons
            .ResolveForPaymentAsync(couponCode, booking.TotalPrice, booking.Currency, now, ct);
        var initiation = await provider.InitiateAsync(booking.Id, charge, booking.Currency, ct);
        var payment = Payment.ForLiveSession(booking.Id, studentId, charge, booking.Currency,
            provider.Name, initiation.ProviderReference, idempotencyKey, now);
        db.AddRange(payment,
            new PaymentAttempt(payment.Id, initiation.ProviderReference, PaymentAttemptStatus.Created, null, now),
            Audit("LiveSessionPaymentInitiated", studentId, "Payment", payment.Id.ToString(), idempotencyKey));
        if (coupon is not null)
            db.Add(new CouponRedemption(
                coupon.Id, studentId, payment.Id, null, booking.Id, discount, booking.Currency, now));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return new(Map(payment), initiation.CheckoutReference);
    }

    public async Task ProcessWebhookAsync(
        ReadOnlyMemory<byte> payload, string signature, CancellationToken ct)
    {
        var message = provider.VerifyWebhook(payload, signature);
        if (string.IsNullOrWhiteSpace(message.EventId) || string.IsNullOrWhiteSpace(message.ProviderReference))
            throw new DomainException("invalid_webhook", "Payment webhook payload is invalid.");
        var payloadHash = Convert.ToHexString(SHA256.HashData(payload.Span));
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"webhook:{provider.Name}:{message.EventId}", ct);
        if (await db.PaymentWebhookRecords.AnyAsync(
                x => x.Provider == provider.Name && x.EventId == message.EventId, ct))
            return;
        var payment = await db.Payments.SingleOrDefaultAsync(
                x => x.Provider == provider.Name && x.ProviderReference == message.ProviderReference, ct)
            ?? throw new DomainException("payment_not_found", "Payment was not found.");
        var now = clock.GetUtcNow();
        db.Add(new PaymentWebhookRecord(provider.Name, message.EventId, payloadHash,
            message.ProviderReference, now));
        if (!message.Succeeded)
        {
            db.Add(new PaymentAttempt(payment.Id, payment.ProviderReference,
                PaymentAttemptStatus.Failed, "provider_failed", now));
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return;
        }
        var changed = payment.Confirm(message.Amount, message.Currency, now);
        if (changed)
        {
            var clearing = await AccountAsync(LedgerAccountKind.ProviderClearing, "", payment.Currency, ct);
            var escrow = await AccountAsync(LedgerAccountKind.EscrowHeld, "", payment.Currency, ct);
            db.Add(new LedgerEntry($"payment:{payment.Id}:capture", clearing.Id, escrow.Id,
                payment.Amount, payment.Currency, "Payment", payment.Id.ToString(), now));
            db.Add(new PaymentAttempt(payment.Id, payment.ProviderReference,
                PaymentAttemptStatus.Succeeded, null, now));
            if (payment.OrderId is Guid orderId)
            {
                var order = await db.Orders.SingleAsync(x => x.Id == orderId, ct);
                order.ConfirmPayment(now);
                db.AddRange(
                    new EscrowEntry(payment.Id, order.Id, EscrowEntryType.Held,
                        payment.Amount, payment.Currency, $"payment:{payment.Id}:hold", now),
                    Audit("PaymentConfirmed", provider.Name, "Payment", payment.Id.ToString(), message.EventId));
                await notifications.QueueAsync(order.StudentId, "PaymentConfirmed", "Payment confirmed",
                    "Your payment is protected in escrow.", $"/orders/{order.Id}",
                    $"payment:{payment.Id}:confirmed:student", true, ct);
                await notifications.QueueAsync(order.TeacherId, "PaymentConfirmed", "Order funded",
                    "The Student payment is confirmed.", $"/orders/{order.Id}",
                    $"payment:{payment.Id}:confirmed:teacher", true, ct);
            }
            else if (payment.LiveSessionBookingId is Guid bookingId)
            {
                var booking = await db.LiveSessionBookings.SingleAsync(x => x.Id == bookingId, ct);
                booking.ConfirmPayment(provider.Name, now);
                db.AddRange(
                    EscrowEntry.ForLiveSession(payment.Id, booking.Id, EscrowEntryType.Held,
                        payment.Amount, payment.Currency, $"payment:{payment.Id}:hold", now),
                    Audit("LiveSessionPaymentConfirmed", provider.Name, "Payment", payment.Id.ToString(), message.EventId));
                await notifications.QueueAsync(booking.StudentId, "PaymentConfirmed", "Payment confirmed",
                    "Your live-session payment is protected in escrow.", $"/live-sessions/{booking.Id}",
                    $"payment:{payment.Id}:confirmed:student", true, ct);
                await notifications.QueueAsync(booking.TeacherId, "PaymentConfirmed", "Session funded",
                    "The Student live-session payment is confirmed.", $"/live-sessions/{booking.Id}",
                    $"payment:{payment.Id}:confirmed:teacher", true, ct);
            }
            else
                throw new DomainException("invalid_payment", "Payment target is missing.");
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task<PaymentDto> GetPaymentAsync(string userId, Guid paymentId, CancellationToken ct)
    {
        var payment = await db.Payments.AsNoTracking().SingleOrDefaultAsync(x => x.Id == paymentId, ct)
            ?? throw new DomainException("payment_not_owned", "Payment was not found.");
        if (payment.OrderId is Guid orderId)
        {
            var owned = await db.Orders.AsNoTracking().AnyAsync(
                o => o.Id == orderId && (o.StudentId == userId || o.TeacherId == userId), ct);
            if (!owned) throw new DomainException("payment_not_owned", "Payment was not found.");
        }
        else if (payment.LiveSessionBookingId is Guid bookingId)
        {
            var owned = await db.LiveSessionBookings.AsNoTracking().AnyAsync(
                b => b.Id == bookingId && (b.StudentId == userId || b.TeacherId == userId), ct);
            if (!owned) throw new DomainException("payment_not_owned", "Payment was not found.");
        }
        else
            throw new DomainException("payment_not_owned", "Payment was not found.");
        return Map(payment);
    }

    public async Task ReleaseOrderEscrowAsync(Order order, string actorId, CancellationToken ct)
    {
        var payment = await db.Payments.SingleOrDefaultAsync(
                x => x.OrderId == order.Id && x.Status == PaymentStatus.Confirmed, ct)
            ?? throw new DomainException("payment_not_confirmed", "Confirmed payment was not found.");
        if (await db.EscrowEntries.AnyAsync(
                x => x.OrderId == order.Id && x.Type == EscrowEntryType.Released, ct))
            return;
        var now = clock.GetUtcNow();
        var escrow = await AccountAsync(LedgerAccountKind.EscrowHeld, "", order.Currency, ct);
        var teacher = await AccountAsync(LedgerAccountKind.TeacherAvailable, order.TeacherId, order.Currency, ct);
        var platform = await AccountAsync(LedgerAccountKind.PlatformRevenue, "", order.Currency, ct);
        var platformAmount = order.StudentFeeAmount + order.TeacherCommissionAmount;
        db.Add(new LedgerEntry($"order:{order.Id}:teacher-release", escrow.Id, teacher.Id,
            order.TeacherNet, order.Currency, "Order", order.Id.ToString(), now));
        if (platformAmount > 0)
            db.Add(new LedgerEntry($"order:{order.Id}:platform-release", escrow.Id, platform.Id,
                platformAmount, order.Currency, "Order", order.Id.ToString(), now));
        db.AddRange(
            new EscrowEntry(payment.Id, order.Id, EscrowEntryType.Released,
                payment.Amount, payment.Currency, $"order:{order.Id}:release", now),
            Audit("EscrowReleased", actorId, "Order", order.Id.ToString(), $"order:{order.Id}:release"));
    }

    public async Task<RefundDto> RefundAsync(
        string adminId, Guid paymentId, string idempotencyKey, CancellationToken ct)
    {
        idempotencyKey = RequiredKey(idempotencyKey);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"refund:{paymentId}", ct);
        var existing = await db.Refunds.SingleOrDefaultAsync(
            x => x.PaymentId == paymentId && x.IdempotencyKey == idempotencyKey, ct);
        if (existing is not null) return Map(existing);
        if (await db.Refunds.AnyAsync(x => x.PaymentId == paymentId, ct))
            throw new DomainException("refund_conflict", "Payment has already been refunded.");
        var payment = await db.Payments.SingleOrDefaultAsync(x => x.Id == paymentId, ct)
            ?? throw new DomainException("payment_not_found", "Payment was not found.");
        if (payment.LiveSessionBookingId is not null)
            throw new DomainException("live_session_refund_unsupported",
                "Live-session refunds require dispute settlement rules that are not configured.");
        if (payment.OrderId is not Guid orderId)
            throw new DomainException("payment_not_found", "Payment was not found.");
        if (await db.EscrowEntries.AnyAsync(
                x => x.PaymentId == paymentId && x.Type == EscrowEntryType.Released, ct))
            throw new DomainException("refund_after_release_forbidden",
                "Released escrow requires a dispute settlement, not a direct refund.");
        var order = await db.Orders.SingleAsync(x => x.Id == orderId, ct);
        var refund = await RefundCoreAsync(payment, order, adminId, idempotencyKey, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(refund);
    }

    public async Task SettleDisputeAsync(
        Order order, bool refundStudent, string actorId, string idempotencyKey, CancellationToken ct)
    {
        var payment = await db.Payments.SingleOrDefaultAsync(
                x => x.OrderId == order.Id && x.Status == PaymentStatus.Confirmed, ct)
            ?? throw new DomainException("payment_not_confirmed", "Confirmed payment was not found.");
        if (refundStudent)
            await RefundCoreAsync(payment, order, actorId, idempotencyKey, ct);
        else
        {
            order.CompleteByDispute(actorId, clock.GetUtcNow());
            await ReleaseOrderEscrowAsync(order, actorId, ct);
        }
    }

    public async Task<WithdrawalDto> RequestWithdrawalAsync(
        string teacherId, RequestWithdrawal input, string idempotencyKey, CancellationToken ct)
    {
        idempotencyKey = RequiredKey(idempotencyKey);
        var currency = input.Currency.Trim().ToUpperInvariant();
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"withdrawal:{teacherId}:{currency}", ct);
        var existing = await db.WithdrawalRequests.SingleOrDefaultAsync(
            x => x.TeacherId == teacherId && x.IdempotencyKey == idempotencyKey, ct);
        if (existing is not null) return Map(existing);
        var available = await AccountAsync(LedgerAccountKind.TeacherAvailable, teacherId, currency, ct);
        var balance = await BalanceAsync(available.Id, ct);
        if (balance < input.Amount)
            throw new DomainException("insufficient_balance", "Available balance is insufficient.");
        var pending = await AccountAsync(LedgerAccountKind.WithdrawalClearing, teacherId, currency, ct);
        var withdrawal = new WithdrawalRequest(teacherId, input.Amount, currency, idempotencyKey, clock.GetUtcNow());
        db.AddRange(withdrawal,
            new LedgerEntry($"withdrawal:{withdrawal.Id}:reserve", available.Id, pending.Id,
                withdrawal.Amount, currency, "Withdrawal", withdrawal.Id.ToString(), clock.GetUtcNow()),
            Audit("WithdrawalRequested", teacherId, "Withdrawal", withdrawal.Id.ToString(), idempotencyKey));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(withdrawal);
    }

    public async Task<WithdrawalDto> ProcessWithdrawalAsync(
        string adminId, Guid id, ProcessWithdrawal input, string version,
        string idempotencyKey, CancellationToken ct)
    {
        idempotencyKey = RequiredKey(idempotencyKey);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"withdrawal-process:{id}", ct);
        var item = await db.WithdrawalRequests.SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("withdrawal_not_found", "Withdrawal was not found.");
        ApplyVersion(item, version);
        if (item.Status != WithdrawalStatus.Pending) return Map(item);
        var pending = await AccountAsync(LedgerAccountKind.WithdrawalClearing, item.TeacherId, item.Currency, ct);
        if (input.Approve)
        {
            if (string.IsNullOrWhiteSpace(input.ProviderReference))
                throw new DomainException("provider_reference_required", "Provider reference is required.");
            item.Complete(input.ProviderReference, clock.GetUtcNow());
            var providerClearing = await AccountAsync(LedgerAccountKind.ProviderClearing, "", item.Currency, ct);
            db.Add(new LedgerEntry($"withdrawal:{item.Id}:paid", pending.Id, providerClearing.Id,
                item.Amount, item.Currency, "Withdrawal", item.Id.ToString(), clock.GetUtcNow()));
        }
        else
        {
            item.Reject(clock.GetUtcNow());
            var available = await AccountAsync(LedgerAccountKind.TeacherAvailable, item.TeacherId, item.Currency, ct);
            db.Add(new LedgerEntry($"withdrawal:{item.Id}:return", pending.Id, available.Id,
                item.Amount, item.Currency, "Withdrawal", item.Id.ToString(), clock.GetUtcNow()));
        }
        db.Add(Audit(input.Approve ? "WithdrawalCompleted" : "WithdrawalRejected",
            adminId, "Withdrawal", item.Id.ToString(), idempotencyKey));
        await notifications.QueueAsync(item.TeacherId, "Withdrawal",
            input.Approve ? "Withdrawal completed" : "Withdrawal rejected",
            input.Approve ? "Your withdrawal was processed." : "Your funds are available again.",
            "/teacher/earnings", $"withdrawal:{item.Id}:{item.Status}", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(item);
    }

    public async Task<IReadOnlyCollection<BalanceDto>> GetBalancesAsync(
        string teacherId, CancellationToken ct)
    {
        var accounts = await db.LedgerAccounts.AsNoTracking()
            .Where(x => x.OwnerId == teacherId
                && (x.Kind == LedgerAccountKind.TeacherAvailable
                    || x.Kind == LedgerAccountKind.WithdrawalClearing))
            .ToArrayAsync(ct);
        var result = new List<BalanceDto>();
        foreach (var currency in accounts.Select(x => x.Currency).Distinct())
        {
            var available = accounts.SingleOrDefault(x =>
                x.Currency == currency && x.Kind == LedgerAccountKind.TeacherAvailable);
            var pending = accounts.SingleOrDefault(x =>
                x.Currency == currency && x.Kind == LedgerAccountKind.WithdrawalClearing);
            result.Add(new(currency,
                available is null ? 0 : await BalanceAsync(available.Id, ct),
                pending is null ? 0 : await BalanceAsync(pending.Id, ct)));
        }
        return result;
    }

    public async Task<Application.Common.PagedResult<AdminWithdrawalDto>> GetWithdrawalsAsync(
        WithdrawalStatus? status, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.WithdrawalRequests.AsNoTracking();
        if (status.HasValue) query = query.Where(x => x.Status == status);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new
            {
                x.Id,
                x.TeacherId,
                x.Amount,
                x.Currency,
                x.Status,
                x.ProviderReference,
                x.CreatedAt,
                x.RowVersion
            })
            .ToArrayAsync(ct);
        var teacherIds = rows.Select(x => x.TeacherId).Distinct().ToArray();
        var names = await db.Users.AsNoTracking().Where(u => teacherIds.Contains(u.Id))
            .Select(u => new { u.Id, u.FullName, u.FullNameEnglish })
            .ToDictionaryAsync(u => u.Id, u => (u.FullName, u.FullNameEnglish), ct);
        var items = rows.Select(x =>
        {
            names.TryGetValue(x.TeacherId, out var name);
            return new AdminWithdrawalDto(
                x.Id, x.TeacherId, x.Amount, x.Currency, x.Status,
                x.ProviderReference, x.CreatedAt, Convert.ToBase64String(x.RowVersion),
                name.FullName, name.FullNameEnglish);
        }).ToArray();
        return new(items, page, pageSize, total);
    }

    public async Task<ReconciliationDto> ReconcileAsync(CancellationToken ct)
    {
        var payments = await db.Payments.Where(x => x.Status != PaymentStatus.Failed)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var held = await db.EscrowEntries.Where(x => x.Type == EscrowEntryType.Held)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var released = await db.EscrowEntries.Where(x => x.Type == EscrowEntryType.Released)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var refunded = await db.EscrowEntries.Where(x => x.Type == EscrowEntryType.Refunded)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var accounts = await db.LedgerAccounts.AsNoTracking().ToArrayAsync(ct);
        async Task<decimal> KindBalance(LedgerAccountKind kind)
        {
            var ids = accounts.Where(x => x.Kind == kind).Select(x => x.Id).ToArray();
            if (ids.Length == 0) return 0;
            var credits = await db.LedgerEntries.Where(x => ids.Contains(x.CreditAccountId))
                .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
            var debits = await db.LedgerEntries.Where(x => ids.Contains(x.DebitAccountId))
                .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
            return credits - debits;
        }
        var orphans = await db.Payments.CountAsync(p =>
            p.Status == PaymentStatus.Confirmed
            && !db.EscrowEntries.Any(e => e.PaymentId == p.Id && e.Type == EscrowEntryType.Held), ct);
        return new(payments, held, released, refunded,
            await KindBalance(LedgerAccountKind.TeacherAvailable),
            await KindBalance(LedgerAccountKind.WithdrawalClearing),
            await KindBalance(LedgerAccountKind.PlatformRevenue), 0, orphans);
    }

    private async Task<LedgerAccount> AccountAsync(
        LedgerAccountKind kind, string owner, string currency, CancellationToken ct)
    {
        var account = await db.LedgerAccounts.SingleOrDefaultAsync(
            x => x.Kind == kind && x.OwnerId == owner && x.Currency == currency, ct);
        if (account is not null) return account;
        account = new(kind, owner, currency, clock.GetUtcNow());
        db.Add(account);
        return account;
    }
    private async Task<Refund> RefundCoreAsync(
        Payment payment, Order order, string actorId, string idempotencyKey, CancellationToken ct)
    {
        if (await db.EscrowEntries.AnyAsync(
                x => x.PaymentId == payment.Id && x.Type == EscrowEntryType.Released, ct))
            throw new DomainException("refund_after_release_forbidden",
                "Released escrow cannot be refunded by the held-escrow flow.");
        if (await db.Refunds.AnyAsync(x => x.PaymentId == payment.Id, ct))
            throw new DomainException("refund_conflict", "Payment has already been refunded.");
        payment.Refund(clock.GetUtcNow());
        order.Refund(actorId, clock.GetUtcNow());
        var escrow = await AccountAsync(LedgerAccountKind.EscrowHeld, "", payment.Currency, ct);
        var refunds = await AccountAsync(LedgerAccountKind.RefundClearing, "", payment.Currency, ct);
        var refund = new Refund(payment.Id, order.Id, payment.Amount, payment.Currency,
            idempotencyKey, actorId, clock.GetUtcNow());
        db.AddRange(refund,
            new LedgerEntry($"refund:{refund.Id}", escrow.Id, refunds.Id, payment.Amount,
                payment.Currency, "Refund", refund.Id.ToString(), clock.GetUtcNow()),
            new EscrowEntry(payment.Id, order.Id, EscrowEntryType.Refunded, payment.Amount,
                payment.Currency, $"refund:{refund.Id}", clock.GetUtcNow()),
            Audit("PaymentRefunded", actorId, "Payment", payment.Id.ToString(), idempotencyKey));
        await notifications.QueueAsync(order.StudentId, "Refund", "Payment refunded",
            "The held payment was refunded.", $"/orders/{order.Id}",
            $"payment:{payment.Id}:refunded:student", true, ct);
        await notifications.QueueAsync(order.TeacherId, "Refund", "Order refunded",
            "The held payment was refunded.", $"/orders/{order.Id}",
            $"payment:{payment.Id}:refunded:teacher", true, ct);
        return refund;
    }
    private async Task<decimal> BalanceAsync(Guid accountId, CancellationToken ct)
    {
        var credits = await db.LedgerEntries.Where(x => x.CreditAccountId == accountId)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var debits = await db.LedgerEntries.Where(x => x.DebitAccountId == accountId)
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        return credits - debits;
    }
    private Task LockAsync(string resource, CancellationToken ct) =>
        db.Database.IsSqlServer()
            ? db.Database.ExecuteSqlInterpolatedAsync(
                $"EXEC sp_getapplock @Resource={resource}, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000", ct)
            : Task.CompletedTask;
    private void ApplyVersion(WithdrawalRequest item, string version)
    {
        try
        {
            db.Entry(item).Property(x => x.RowVersion).OriginalValue =
                Convert.FromBase64String(version.Trim('"'));
        }
        catch (FormatException)
        {
            throw new DomainException("invalid_concurrency_token", "The withdrawal version is invalid.");
        }
    }
    private FinancialAuditRecord Audit(
        string action, string actor, string type, string id, string key) =>
        new(action, actor, type, id, key, clock.GetUtcNow());
    private static string RequiredKey(string value)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 or > 100)
            throw new DomainException("idempotency_key_required", "A valid Idempotency-Key is required.");
        return value;
    }
    private static PaymentDto Map(Payment x) =>
        new(x.Id, x.OrderId, x.LiveSessionBookingId, x.Amount, x.Currency, x.Provider, x.ProviderReference, x.Status, x.CreatedAt);
    private static RefundDto Map(Refund x) =>
        new(x.Id, x.PaymentId, x.OrderId, x.Amount, x.Currency, x.CreatedAt);
    private static WithdrawalDto Map(WithdrawalRequest x) =>
        new(x.Id, x.Amount, x.Currency, x.Status, x.ProviderReference,
            x.CreatedAt, Convert.ToBase64String(x.RowVersion));
}
