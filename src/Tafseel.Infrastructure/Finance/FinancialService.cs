using System.Data;
using System.Data.Common;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
using Tafseel.Application.Common;
using Tafseel.Application.Finance;
using Tafseel.Application.Orders;
using Tafseel.Application.Governance;
using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Governance;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Orders;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Messaging;

namespace Tafseel.Infrastructure.Finance;

internal sealed class FinancialService(
    TafseelDbContext db, IPaymentProvider provider, ICouponService coupons,
    NotificationWriter notifications, IOptions<FeeOptions> feeOptions,
    IOptions<WithdrawalOptions> withdrawalOptions, IOptions<DisputeOptions> disputeOptions,
    TimeProvider clock, IPayoutProvider payouts, IPayoutDestinationVault payoutVault) : IFinancialService
{
    private readonly WithdrawalOptions _withdrawals = withdrawalOptions.Value;
    private readonly DisputeOptions _disputes = disputeOptions.Value;
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
            await EnsureRetryCouponMatchesAsync(existing, couponCode, ct);
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
            await EnsureRetryCouponMatchesAsync(existing, couponCode, ct);
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

    public async Task<PaymentInitiationDto> InitiateOpenRequestPaymentAsync(
        string studentId, Guid learningRequestId, string idempotencyKey, string? couponCode, CancellationToken ct)
    {
        idempotencyKey = RequiredKey(idempotencyKey);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"open-request:{learningRequestId}", ct);
        var existing = await db.Payments.SingleOrDefaultAsync(x =>
            x.LearningRequestId == learningRequestId && x.Status == PaymentStatus.Pending, ct);
        if (existing is not null)
        {
            if (existing.StudentId != studentId || existing.InitiationIdempotencyKey != idempotencyKey)
                throw new DomainException("payment_already_initiated", "Payment has already been initiated.");
            await EnsureRetryCouponMatchesAsync(existing, couponCode, ct);
            var retry = await provider.InitiateAsync(learningRequestId, existing.Amount, existing.Currency, ct);
            return new(Map(existing), retry.CheckoutReference);
        }
        var request = await db.LearningRequests.SingleOrDefaultAsync(
                x => x.Id == learningRequestId && x.StudentId == studentId, ct)
            ?? throw new DomainException("request_not_owned", "Learning request was not found.");
        var now = clock.GetUtcNow();
        if (request.Status != LearningRequestStatus.AwaitingPayment
            || request.PaymentReservationExpiresAt is null || now >= request.PaymentReservationExpiresAt
            || request.SelectedOfferId is not Guid offerId)
            throw new DomainException("payment_not_allowed", "This Offer reservation cannot be paid.");
        var offer = await db.TeacherOffers.AsNoTracking().SingleAsync(
            x => x.Id == offerId && x.Status == TeacherOfferStatus.Selected, ct);
        var studentTotal = OpenRequestStudentTotal(offer.Amount);
        var (coupon, discount, charge) = await coupons.ResolveForPaymentAsync(couponCode, studentTotal, "SAR", now, ct);
        var initiation = await provider.InitiateAsync(request.Id, charge, "SAR", ct);
        var payment = Payment.ForOpenRequest(request.Id, studentId, charge, "SAR",
            provider.Name, initiation.ProviderReference, idempotencyKey, now);
        db.AddRange(payment,
            new PaymentAttempt(payment.Id, initiation.ProviderReference, PaymentAttemptStatus.Created, null, now),
            Audit("OpenRequestPaymentInitiated", studentId, "LearningRequest", request.Id.ToString(), idempotencyKey));
        if (coupon is not null)
            payment.RecordOpenRequestCoupon(coupon.Id, discount);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return new(Map(payment), initiation.CheckoutReference);
    }

    public async Task<OpenRequestPaymentQuoteDto> QuoteOpenRequestPaymentAsync(
        string studentId, Guid learningRequestId, CancellationToken ct)
    {
        var request = await db.LearningRequests.AsNoTracking().SingleOrDefaultAsync(
                x => x.Id == learningRequestId && x.StudentId == studentId, ct)
            ?? throw new DomainException("request_not_owned", "Learning request was not found.");
        if (request.Status != LearningRequestStatus.AwaitingPayment
            || request.PaymentReservationExpiresAt is not DateTimeOffset expiresAt
            || clock.GetUtcNow() >= expiresAt
            || request.SelectedOfferId is not Guid offerId)
            throw new DomainException("payment_not_allowed", "This Offer reservation cannot be paid.");

        var offer = await db.TeacherOffers.AsNoTracking().SingleOrDefaultAsync(
                x => x.Id == offerId && x.LearningRequestId == learningRequestId
                    && x.Status == TeacherOfferStatus.Selected, ct)
            ?? throw new DomainException("payment_not_allowed", "This Offer reservation cannot be paid.");
        var total = OpenRequestStudentTotal(offer.Amount);
        return new(offer.Amount, feeOptions.Value.StudentFeePercent, total - offer.Amount,
            total, "SAR", expiresAt);
    }

    private decimal OpenRequestStudentTotal(decimal offerAmount) => decimal.Round(
        offerAmount * (1 + feeOptions.Value.StudentFeePercent / 100), 2, MidpointRounding.AwayFromZero);

    private async Task EnsureRetryCouponMatchesAsync(Payment payment, string? requestedCode, CancellationToken ct)
    {
        // A blank code means "resume the existing checkout". An explicitly supplied code must
        // be the code that produced its amount; a retry cannot silently charge the old amount.
        if (string.IsNullOrWhiteSpace(requestedCode)) return;
        var code = Coupon.NormalizeCode(requestedCode);
        var originalCode = payment.PendingCouponId is Guid pendingCouponId
            ? await db.Coupons.AsNoTracking().Where(x => x.Id == pendingCouponId)
                .Select(x => x.Code).SingleAsync(ct)
            : await (
            from redemption in db.CouponRedemptions.AsNoTracking()
            join coupon in db.Coupons.AsNoTracking() on redemption.CouponId equals coupon.Id
            where redemption.PaymentId == payment.Id
            select coupon.Code).SingleOrDefaultAsync(ct);
        if (!string.Equals(originalCode, code, StringComparison.Ordinal))
            throw new DomainException("payment_coupon_mismatch", "This payment started with different coupon terms.");
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
        if (payment.LearningRequestId is Guid payableRequestId && payment.OrderId is null)
        {
            var payable = await db.LearningRequests.AsNoTracking().SingleAsync(x => x.Id == payableRequestId, ct);
            if (payable.Status != LearningRequestStatus.AwaitingPayment
                || payable.PaymentReservationExpiresAt is null || now >= payable.PaymentReservationExpiresAt)
                throw new DomainException("offer_reservation_expired", "The selected Offer reservation has expired.");
        }
        db.Add(new PaymentWebhookRecord(provider.Name, message.EventId, payloadHash,
            message.ProviderReference, now));
        if (!message.Succeeded)
        {
            db.Add(new PaymentAttempt(payment.Id, payment.ProviderReference,
                PaymentAttemptStatus.Failed, "provider_failed", now));
            // PRODUCT-P1: the payer learns the payment did not go through, instead of waiting on a spinner.
            var retry = payment.OrderId is { } failedOrder ? AppRoutes.Order(failedOrder)
                : payment.LiveSessionBookingId is { } failedSession ? AppRoutes.LiveSession(failedSession)
                : payment.LearningRequestId is { } failedRequest ? AppRoutes.Request(failedRequest)
                : AppRoutes.StudentPayments;
            await notifications.QueueAsync(payment.StudentId, "PaymentFailed", "Payment did not go through",
                "Your payment did not go through and nothing was charged. You can try again.", retry,
                $"payment:{payment.Id}:failed:{message.EventId}", true, ct);
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
            else if (payment.LearningRequestId is Guid requestId)
            {
                var request = await db.LearningRequests.SingleAsync(x => x.Id == requestId, ct);
                var offer = await db.TeacherOffers.SingleAsync(x => x.Id == request.SelectedOfferId, ct);
                var service = await db.TeacherServices.SingleAsync(x => x.Id == offer.TeacherServiceId, ct);
                var catalog = await db.ServiceCatalogItems.SingleAsync(x => x.Id == request.ServiceCatalogItemId, ct);
                var order = new Order(request.Id, request.StudentId, offer.TeacherId, service.Id,
                    offer.Amount, offer.Currency, feeOptions.Value.StudentFeePercent,
                    feeOptions.Value.TeacherCommissionPercent, now.AddHours(offer.DeliveryHours),
                    offer.IncludedRevisions, now);
                order.CaptureServiceIdentity(catalog);
                order.ConfirmPayment(now);
                request.ConvertOfferToOrder(offer.TeacherId, service.Id, offer.Id, now);
                offer.Accept(now);
                foreach (var losingOffer in await db.TeacherOffers.Where(x =>
                             x.LearningRequestId == request.Id && x.Id != offer.Id).ToArrayAsync(ct))
                    losingOffer.MarkNotSelected(now);
                payment.LinkConvertedOrder(order.Id);
                db.Add(order);
                if (payment.PendingCouponId is Guid couponId && payment.PendingCouponDiscount is decimal discount)
                    db.Add(new CouponRedemption(couponId, payment.StudentId, payment.Id,
                        order.Id, null, discount, payment.Currency, now));
                db.AddRange(
                    new EscrowEntry(payment.Id, order.Id, EscrowEntryType.Held,
                        payment.Amount, payment.Currency, $"payment:{payment.Id}:hold", now),
                    Audit("OpenRequestPaymentConfirmed", provider.Name, "Payment", payment.Id.ToString(), message.EventId));
                await notifications.QueueAsync(order.StudentId, "PaymentConfirmed", "Payment confirmed",
                    "Your request is now an active Order.", $"/orders/{order.Id}",
                    $"payment:{payment.Id}:confirmed:student", true, ct);
                await notifications.QueueAsync(order.TeacherId, "PaymentConfirmed", "Order funded",
                    "The Student payment is confirmed. You can begin work.", $"/orders/{order.Id}",
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
        else if (payment.LearningRequestId is Guid requestId)
        {
            var owned = await db.LearningRequests.AsNoTracking().AnyAsync(
                x => x.Id == requestId && x.StudentId == userId, ct);
            if (!owned) throw new DomainException("payment_not_owned", "Payment was not found.");
        }
        else
            throw new DomainException("payment_not_owned", "Payment was not found.");
        return Map(payment);
    }

    /// <summary>
    /// Splits the <b>actually captured</b> amount between the teacher and the platform.
    /// Coupons consume platform margin first; the teacher only shares a discount larger than that margin.
    /// This is the single allocation rule for Orders and live sessions, on both release and reversal —
    /// do not re-derive it from Order/booking totals, which are pre-coupon commercial terms.
    /// </summary>
    /// <remarks>
    /// Guarantees <c>teacher &gt;= 0</c>, <c>platform &gt;= 0</c> and
    /// <c>teacher + platform == capturedAmount</c> exactly, so escrow can never be debited by more
    /// than the confirmed <see cref="Payment.Amount"/> that funded it.
    /// </remarks>
    private static (decimal Teacher, decimal Platform) AllocateCapture(
        decimal contractualTeacherNet, decimal capturedAmount)
    {
        var teacher = Math.Min(Math.Max(contractualTeacherNet, 0m), capturedAmount);
        return (teacher, capturedAmount - teacher);
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
        var escrow = await AccountAsync(LedgerAccountKind.EscrowHeld, "", payment.Currency, ct);
        var platform = await AccountAsync(LedgerAccountKind.PlatformRevenue, "", payment.Currency, ct);
        // FR-1: allocate the confirmed capture, never the pre-coupon Order totals.
        var (teacherAmount, platformAmount) = AllocateCapture(order.TeacherNet, payment.Amount);

        // FR-2: money the student can still claw back through a dispute must not be withdrawable yet.
        var exposureEndsAt = await OrderExposureEndsAtAsync(order.Id, ct);
        var exposed = exposureEndsAt is DateTimeOffset endsAt && now <= endsAt;
        var teacherKind = exposed ? LedgerAccountKind.TeacherPending : LedgerAccountKind.TeacherAvailable;
        var teacher = await AccountAsync(teacherKind, order.TeacherId, payment.Currency, ct);

        if (teacherAmount > 0)
            db.Add(new LedgerEntry($"order:{order.Id}:teacher-release", escrow.Id, teacher.Id,
                teacherAmount, payment.Currency, "Order", order.Id.ToString(), now));
        if (platformAmount > 0)
            db.Add(new LedgerEntry($"order:{order.Id}:platform-release", escrow.Id, platform.Id,
                platformAmount, payment.Currency, "Order", order.Id.ToString(), now));
        if (exposed && teacherAmount > 0)
            db.Add(TeacherEarningMaturity.ForOrder(payment.Id, order.Id, order.TeacherId,
                teacherAmount, payment.Currency, exposureEndsAt!.Value, now));
        db.AddRange(
            new EscrowEntry(payment.Id, order.Id, EscrowEntryType.Released,
                payment.Amount, payment.Currency, $"order:{order.Id}:release", now),
            Audit(exposed ? "EscrowReleasedToPending" : "EscrowReleased",
                actorId, "Order", order.Id.ToString(), $"order:{order.Id}:release"));
    }

    /// <summary>
    /// Last instant a dispute may still be opened for this Order, or <c>null</c> when it can never be
    /// disputed. Reference timestamp and window come from <see cref="EarningsExposurePolicy"/> so the
    /// maturity rule cannot drift from the dispute-eligibility rule.
    /// </summary>
    private async Task<DateTimeOffset?> OrderExposureEndsAtAsync(Guid orderId, CancellationToken ct)
    {
        // A resolved dispute blocks any further dispute on the same payable, so exposure has already ended.
        if (await db.Disputes.AnyAsync(x => x.OrderId == orderId && x.Status == DisputeStatus.Resolved, ct))
            return null;
        var deliveredAt = await db.Set<OrderStatusHistory>().AsNoTracking()
            .Where(x => x.OrderId == orderId && x.NextStatus == OrderStatus.Delivered)
            .MaxAsync(x => (DateTimeOffset?)x.CreatedAt, ct);
        return EarningsExposurePolicy.ExposureEndsAt(deliveredAt, _disputes.WindowDays);
    }

    /// <summary>Live-session equivalent of <see cref="OrderExposureEndsAtAsync"/>; the window is measured from <c>EndsAt</c>.</summary>
    private async Task<DateTimeOffset?> LiveSessionExposureEndsAtAsync(
        LiveSessionBooking booking, CancellationToken ct)
    {
        if (await db.Disputes.AnyAsync(
                x => x.LiveSessionBookingId == booking.Id && x.Status == DisputeStatus.Resolved, ct))
            return null;
        return EarningsExposurePolicy.ExposureEndsAt(booking.EndsAt, _disputes.WindowDays);
    }

    public async Task ReleaseLiveSessionEscrowAsync(
        LiveSessionBooking booking, string actorId, CancellationToken ct)
    {
        var payment = await db.Payments.SingleOrDefaultAsync(
                x => x.LiveSessionBookingId == booking.Id && x.Status == PaymentStatus.Confirmed, ct)
            ?? throw new DomainException("payment_not_confirmed", "Confirmed payment was not found.");
        if (await db.EscrowEntries.AnyAsync(
                x => x.LiveSessionBookingId == booking.Id && x.Type == EscrowEntryType.Released, ct))
            return;

        var now = clock.GetUtcNow();
        var escrow = await AccountAsync(LedgerAccountKind.EscrowHeld, "", payment.Currency, ct);
        var platform = await AccountAsync(LedgerAccountKind.PlatformRevenue, "", payment.Currency, ct);
        // Same allocation rule as Orders: coupons consume platform margin first.
        var (teacherAmount, platformAmount) = AllocateCapture(booking.TeacherNet, payment.Amount);

        // FR-2 applies identically here: a live session stays disputable for WindowDays after it ends.
        var exposureEndsAt = await LiveSessionExposureEndsAtAsync(booking, ct);
        var exposed = exposureEndsAt is DateTimeOffset endsAt && now <= endsAt;
        var teacherKind = exposed ? LedgerAccountKind.TeacherPending : LedgerAccountKind.TeacherAvailable;
        var teacher = await AccountAsync(teacherKind, booking.TeacherId, payment.Currency, ct);

        if (teacherAmount > 0)
            db.Add(new LedgerEntry($"live-session:{booking.Id}:teacher-release", escrow.Id, teacher.Id,
                teacherAmount, payment.Currency, "LiveSession", booking.Id.ToString(), now));
        if (platformAmount > 0)
            db.Add(new LedgerEntry($"live-session:{booking.Id}:platform-release", escrow.Id, platform.Id,
                platformAmount, payment.Currency, "LiveSession", booking.Id.ToString(), now));
        if (exposed && teacherAmount > 0)
            db.Add(TeacherEarningMaturity.ForLiveSession(payment.Id, booking.Id, booking.TeacherId,
                teacherAmount, payment.Currency, exposureEndsAt!.Value, now));
        db.AddRange(
            EscrowEntry.ForLiveSession(payment.Id, booking.Id, EscrowEntryType.Released,
                payment.Amount, payment.Currency, $"live-session:{booking.Id}:release", now),
            Audit(exposed ? "LiveSessionEscrowReleasedToPending" : "LiveSessionEscrowReleased",
                actorId, "LiveSession", booking.Id.ToString(),
                $"live-session:{booking.Id}:release"));
    }

    public async Task RefundLiveSessionEscrowAsync(
        LiveSessionBooking booking, string actorId, string idempotencyKey, CancellationToken ct)
    {
        var payment = await db.Payments.SingleOrDefaultAsync(
                x => x.LiveSessionBookingId == booking.Id && x.Status == PaymentStatus.Confirmed, ct)
            ?? throw new DomainException("payment_not_confirmed", "Confirmed payment was not found.");
        idempotencyKey = RequiredKey(idempotencyKey);
        if (await db.EscrowEntries.AnyAsync(
                x => x.PaymentId == payment.Id && x.Type == EscrowEntryType.Released, ct))
            await RefundReleasedLiveSessionCoreAsync(payment, booking, actorId, idempotencyKey, ct);
        else
            await RefundLiveSessionCoreAsync(payment, booking, actorId, idempotencyKey, ct);
    }

    public async Task<RefundDto> RefundAsync(
        string adminId, Guid paymentId, string reason, string idempotencyKey, CancellationToken ct)
    {
        idempotencyKey = RequiredKey(idempotencyKey);
        reason = reason?.Trim() ?? "";
        if (reason.Length is 0 or > 1000)
            throw new DomainException("refund_reason_required", "A refund reason is required.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"refund:{paymentId}", ct);
        var existing = await db.Refunds.SingleOrDefaultAsync(
            x => x.PaymentId == paymentId && x.IdempotencyKey == idempotencyKey, ct);
        if (existing is not null) return Map(existing);
        if (await db.Refunds.AnyAsync(x => x.PaymentId == paymentId, ct))
            throw new DomainException("refund_conflict", "Payment has already been refunded.");
        var payment = await db.Payments.SingleOrDefaultAsync(x => x.Id == paymentId, ct)
            ?? throw new DomainException("payment_not_found", "Payment was not found.");
        if (await db.Disputes.AnyAsync(x =>
                payment.OrderId != null && x.OrderId == payment.OrderId
                || payment.LiveSessionBookingId != null && x.LiveSessionBookingId == payment.LiveSessionBookingId, ct))
            throw new DomainException("refund_requires_dispute_resolution",
                "This purchase has a dispute and must be resolved through the dispute workflow.");
        Refund refund;
        if (payment.LiveSessionBookingId is Guid bookingId)
        {
            var booking = await db.LiveSessionBookings.SingleAsync(x => x.Id == bookingId, ct);
            EnsureNotOwnPurchase(adminId, payment.StudentId, booking.TeacherId);
            refund = await RefundLiveSessionCoreAsync(payment, booking, adminId, idempotencyKey, ct);
        }
        else if (payment.OrderId is Guid orderId)
        {
            var order = await db.Orders.SingleAsync(x => x.Id == orderId, ct);
            EnsureNotOwnPurchase(adminId, payment.StudentId, order.TeacherId);
            refund = await RefundCoreAsync(payment, order, adminId, idempotencyKey, ct);
        }
        else
            throw new DomainException("payment_not_found", "Payment was not found.");
        db.Add(Audit("AdminRefunded", adminId, "Payment", payment.Id.ToString(),
            (idempotencyKey + ": " + reason)[..Math.Min(200, idempotencyKey.Length + 2 + reason.Length)]));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(refund);
    }

    /// <summary>Roles are additive: nobody refunds a purchase they bought or were paid for.</summary>
    private static void EnsureNotOwnPurchase(string actorId, string studentId, string teacherId)
    {
        if (string.Equals(actorId, studentId, StringComparison.Ordinal)
            || string.Equals(actorId, teacherId, StringComparison.Ordinal))
            throw new DomainException("refund_self_processing_forbidden",
                "You cannot refund a purchase you are part of.");
    }

    public async Task SettleDisputeAsync(
        Order order, bool refundStudent, string actorId, string idempotencyKey, CancellationToken ct)
    {
        var payment = await db.Payments.SingleOrDefaultAsync(
                x => x.OrderId == order.Id && x.Status == PaymentStatus.Confirmed, ct)
            ?? throw new DomainException("payment_not_confirmed", "Confirmed payment was not found.");
        if (refundStudent)
        {
            if (await db.EscrowEntries.AnyAsync(
                    x => x.PaymentId == payment.Id && x.Type == EscrowEntryType.Released, ct))
                await RefundReleasedOrderCoreAsync(payment, order, actorId, idempotencyKey, ct);
            else
                await RefundCoreAsync(payment, order, actorId, idempotencyKey, ct);
        }
        else
        {
            if (order.Status != OrderStatus.Completed)
                order.CompleteByDispute(actorId, clock.GetUtcNow());
            await ReleaseOrderEscrowAsync(order, actorId, ct);
        }
    }

    public async Task SettleLiveSessionDisputeAsync(
        LiveSessionBooking booking, bool refundStudent, string actorId, string idempotencyKey, CancellationToken ct)
    {
        booking.ResolveByDispute(refundStudent, actorId, clock.GetUtcNow());
        if (refundStudent)
            await RefundLiveSessionEscrowAsync(booking, actorId, idempotencyKey, ct);
        else
            await ReleaseLiveSessionEscrowAsync(booking, actorId, ct);
    }

    public async Task<WithdrawalDto> RequestWithdrawalAsync(
        string teacherId, RequestWithdrawal input, string idempotencyKey, CancellationToken ct)
    {
        idempotencyKey = RequiredKey(idempotencyKey);
        var currency = input.Currency.Trim().ToUpperInvariant();
        if (!string.Equals(currency, _withdrawals.Currency, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("unsupported_withdrawal_currency", "Withdrawal currency is not supported.");
        if (input.Amount < _withdrawals.MinimumAmount)
            throw new DomainException("withdrawal_below_minimum",
                $"Minimum withdrawal is {_withdrawals.MinimumAmount:0.##} {_withdrawals.Currency}.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"withdrawal:{teacherId}:{currency}", ct);
        var existing = await db.WithdrawalRequests.SingleOrDefaultAsync(
            x => x.TeacherId == teacherId && x.IdempotencyKey == idempotencyKey, ct);
        if (existing is not null) return Map(existing);
        var payoutProfile = await db.TeacherPayoutProfiles.SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct);
        if (payoutProfile?.Status != PayoutVerificationStatus.Verified)
            throw new DomainException("verified_payout_profile_required",
                "A verified payout profile is required before requesting a withdrawal.");
        // A verified masked-only profile (saved before full destinations) cannot be paid: re-enrol first.
        if (!payoutProfile.CanReceiveTransfers)
            throw new DomainException("payout_destination_reenrollment_required",
                "Payout details must be entered again with a full bank destination.");
        var available = await AccountAsync(LedgerAccountKind.TeacherAvailable, teacherId, currency, ct);
        var balance = await BalanceAsync(available.Id, ct);
        if (balance < input.Amount)
            throw new DomainException("insufficient_balance", "Available balance is insufficient.");
        var pending = await AccountAsync(LedgerAccountKind.WithdrawalClearing, teacherId, currency, ct);
        var withdrawal = WithdrawalRequest.ToVerifiedDestination(teacherId, input.Amount, currency, idempotencyKey,
            payoutProfile, clock.GetUtcNow());
        db.AddRange(withdrawal,
            new LedgerEntry($"withdrawal:{withdrawal.Id}:reserve", available.Id, pending.Id,
                withdrawal.Amount, currency, "Withdrawal", withdrawal.Id.ToString(), clock.GetUtcNow()),
            Audit("WithdrawalRequested", teacherId, "Withdrawal", withdrawal.Id.ToString(), idempotencyKey));
        await notifications.QueueAsync(teacherId, "Withdrawal", "Withdrawal requested",
            "Your withdrawal was requested and the amount is set aside.", AppRoutes.TeacherEarnings,
            $"withdrawal:{withdrawal.Id}:{withdrawal.Status}", false, ct);
        // PRODUCT-P1: the people who pay it out hear about it, instead of finding it by looking at the queue.
        foreach (var operatorId in await FinanceTeamIdsAsync(teacherId, ct))
            await notifications.QueueAsync(operatorId, "FinanceQueue", "New withdrawal to pay out",
                "A teacher requested a withdrawal. Check the transfer details and start the transfer.",
                AppRoutes.FinanceWithdrawals, $"withdrawal:{withdrawal.Id}:requested:{operatorId}", false, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(withdrawal);
    }

    public async Task<WithdrawalDto> ProcessWithdrawalAsync(
        string adminId, Guid id, ProcessWithdrawal input, string version,
        string idempotencyKey, CancellationToken ct)
    {
        idempotencyKey = RequiredKey(idempotencyKey);
        // PRODUCT-P0: a typed reference can no longer mark a withdrawal transferred. The transfer is recorded
        // only through initiation and bank evidence (InitiateWithdrawalTransferAsync / ConfirmWithdrawalTransferAsync).
        if (input.Approve)
            throw new DomainException("withdrawal_transfer_evidence_required",
                "Start the transfer and record the bank's evidence; a reference alone cannot mark a withdrawal transferred.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"withdrawal-process:{id}", ct);
        var item = await db.WithdrawalRequests.SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("withdrawal_not_found", "Withdrawal was not found.");
        item.EnsureMayBeHandledBy(adminId);
        if (item.Status == WithdrawalStatus.Rejected) return Map(item);
        ApplyVersion(item, version);
        var wasInitiated = item.Status == WithdrawalStatus.TransferInitiated;
        var now = clock.GetUtcNow();
        item.Reject(adminId, input.RejectionReason ?? "Rejected after finance review.", input.ConfirmNoTransferSent, now);
        var pending = await AccountAsync(LedgerAccountKind.WithdrawalClearing, item.TeacherId, item.Currency, ct);
        var available = await AccountAsync(LedgerAccountKind.TeacherAvailable, item.TeacherId, item.Currency, ct);
        db.Add(new LedgerEntry($"withdrawal:{item.Id}:return", pending.Id, available.Id,
            item.Amount, item.Currency, "Withdrawal", item.Id.ToString(), now));
        db.Add(Audit(wasInitiated ? "WithdrawalTransferCancelledNoTransferSent" : "WithdrawalRejected",
            adminId, "Withdrawal", item.Id.ToString(), idempotencyKey));
        await notifications.QueueAsync(item.TeacherId, "Withdrawal", "Withdrawal rejected",
            "Your funds are available again.", AppRoutes.TeacherEarnings,
            $"withdrawal:{item.Id}:{item.Status}", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(item);
    }

    public async Task<WithdrawalTransferInstructionDto> GetWithdrawalTransferInstructionAsync(
        string adminId, Guid id, CancellationToken ct)
    {
        var item = await db.WithdrawalRequests.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("withdrawal_not_found", "Withdrawal was not found.");
        item.EnsureMayBeHandledBy(adminId);
        if (item.Status is not (WithdrawalStatus.Pending or WithdrawalStatus.TransferInitiated))
            throw new DomainException("withdrawal_instruction_unavailable",
                "Transfer details are shown only for withdrawals that are still to be sent.");
        var destination = payoutVault.Open(item.TeacherId, item.SealedDestination());
        var teacherName = await db.Users.AsNoTracking().Where(x => x.Id == item.TeacherId)
            .Select(x => x.FullNameEnglish ?? x.FullName).SingleOrDefaultAsync(ct);
        // Every disclosure of a full destination is attributable. The correlation key carries no destination data.
        db.Add(Audit("WithdrawalTransferInstructionViewed", adminId, "Withdrawal", item.Id.ToString(),
            $"instruction:{item.Id}:{clock.GetUtcNow():O}"));
        await db.SaveChangesAsync(ct);
        return new(item.Id, item.Status, item.Amount, item.Currency, item.TeacherId, teacherName,
            destination.BeneficiaryName, destination.BankName, destination.Iban, destination.CountryCode,
            item.DestinationLabel ?? destination.MaskedLabel,
            item.InitiationReference ?? ManualBankTransferPayoutProvider.TransferNote(item.Id),
            item.CreatedAt, item.DestinationVerifiedAt, item.TransferInitiatedAt,
            item.Status == WithdrawalStatus.TransferInitiated, item.PayoutProvider ?? payouts.Name,
            payouts.MovesFundsElectronically, Convert.ToBase64String(item.RowVersion));
    }

    public async Task<AdminWithdrawalDto> InitiateWithdrawalTransferAsync(
        string adminId, Guid id, string version, string idempotencyKey, CancellationToken ct)
    {
        idempotencyKey = RequiredKey(idempotencyKey);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"withdrawal-process:{id}", ct);
        var item = await db.WithdrawalRequests.SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("withdrawal_not_found", "Withdrawal was not found.");
        item.EnsureMayBeHandledBy(adminId);
        if (item.Status == WithdrawalStatus.TransferInitiated && item.InitiationIdempotencyKey == idempotencyKey)
            return await AdminMapAsync(item, ct);
        ApplyVersion(item, version);
        if (item.Status != WithdrawalStatus.Pending)
            throw new DomainException("invalid_withdrawal_transition", "The withdrawal transition is not allowed.");
        var initiation = await payouts.InitiateAsync(
            new(item.Id, item.TeacherId, item.Amount, item.Currency, item.SealedDestination()), ct);
        var now = clock.GetUtcNow();
        item.InitiateTransfer(adminId, initiation.Provider, initiation.Reference, idempotencyKey, now);
        // No ledger movement: the amount stays reserved in WithdrawalClearing until evidence confirms the transfer.
        db.Add(Audit("WithdrawalTransferInitiated", adminId, "Withdrawal", item.Id.ToString(), idempotencyKey));
        await notifications.QueueAsync(item.TeacherId, "Withdrawal", "Transfer started",
            "Tafseel's finance team started your bank transfer.", AppRoutes.TeacherEarnings,
            $"withdrawal:{item.Id}:{item.Status}", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await AdminMapAsync(item, ct);
    }

    public async Task<AdminWithdrawalDto> ConfirmWithdrawalTransferAsync(
        string adminId, Guid id, ConfirmWithdrawalTransfer input, string version, string idempotencyKey, CancellationToken ct)
    {
        idempotencyKey = RequiredKey(idempotencyKey);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"withdrawal-process:{id}", ct);
        var item = await db.WithdrawalRequests.SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("withdrawal_not_found", "Withdrawal was not found.");
        item.EnsureMayBeHandledBy(adminId);
        var recorded = await db.PayoutTransferEvidences.AsNoTracking()
            .SingleOrDefaultAsync(x => x.WithdrawalId == item.Id, ct);
        if (recorded is not null)
        {
            if (recorded.IdempotencyKey == idempotencyKey) return await AdminMapAsync(item, ct);
            throw new DomainException("invalid_withdrawal_transition", "The withdrawal transition is not allowed.");
        }
        ApplyVersion(item, version);
        var now = clock.GetUtcNow();
        var evidence = PayoutTransferEvidence.ManualAttestation(item.Id, adminId, input.SourceInstitution,
            input.BankReference, input.TransferredAt, input.Amount, input.Currency,
            input.ConfirmedAgainstBankRecord, idempotencyKey, now);
        if (evidence.Kind != payouts.CompletionEvidenceKind)
            throw new DomainException("transfer_evidence_kind_unsupported", "This payout adapter needs a different kind of evidence.");
        // One bank reference proves one transfer.
        if (await db.PayoutTransferEvidences.AnyAsync(x => x.BankReference == evidence.BankReference, ct))
            throw new DomainException("transfer_reference_duplicate", "This bank reference is already recorded for another transfer.");
        item.ConfirmTransferred(evidence, now);
        var pending = await AccountAsync(LedgerAccountKind.WithdrawalClearing, item.TeacherId, item.Currency, ct);
        var providerClearing = await AccountAsync(LedgerAccountKind.ProviderClearing, "", item.Currency, ct);
        db.AddRange(evidence,
            new LedgerEntry($"withdrawal:{item.Id}:paid", pending.Id, providerClearing.Id,
                item.Amount, item.Currency, "Withdrawal", item.Id.ToString(), now),
            Audit("WithdrawalTransferConfirmed", adminId, "Withdrawal", item.Id.ToString(), idempotencyKey));
        await notifications.QueueAsync(item.TeacherId, "Withdrawal", "Withdrawal completed",
            "Your bank transfer was sent.", AppRoutes.TeacherEarnings,
            $"withdrawal:{item.Id}:{item.Status}", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await AdminMapAsync(item, ct);
    }

    private async Task<AdminWithdrawalDto> AdminMapAsync(WithdrawalRequest x, CancellationToken ct)
    {
        var name = await db.Users.AsNoTracking().Where(u => u.Id == x.TeacherId)
            .Select(u => new { u.FullName, u.FullNameEnglish }).SingleOrDefaultAsync(ct);
        return new(x.Id, x.TeacherId, x.Amount, x.Currency, x.Status, x.ProviderReference, x.CreatedAt,
            Convert.ToBase64String(x.RowVersion), name?.FullName, name?.FullNameEnglish, x.PayoutMethod,
            x.DestinationLabel, x.RejectionReason, x.UpdatedAt, x.HasDestinationSnapshot, x.InitiationReference,
            x.TransferInitiatedAt, x.TransferredAt);
    }

    public async Task<IReadOnlyCollection<BalanceDto>> GetBalancesAsync(
        string teacherId, CancellationToken ct)
    {
        var accounts = await db.LedgerAccounts.AsNoTracking()
            .Where(x => x.OwnerId == teacherId
                && (x.Kind == LedgerAccountKind.TeacherAvailable
                    || x.Kind == LedgerAccountKind.TeacherPending
                    || x.Kind == LedgerAccountKind.WithdrawalClearing))
            .ToArrayAsync(ct);
        var result = new List<BalanceDto>();
        foreach (var currency in accounts.Select(x => x.Currency).Distinct())
        {
            var available = accounts.SingleOrDefault(x =>
                x.Currency == currency && x.Kind == LedgerAccountKind.TeacherAvailable);
            var pending = accounts.SingleOrDefault(x =>
                x.Currency == currency && x.Kind == LedgerAccountKind.WithdrawalClearing);
            var clearance = accounts.SingleOrDefault(x =>
                x.Currency == currency && x.Kind == LedgerAccountKind.TeacherPending);
            var nextRelease = clearance is null
                ? null
                : await db.TeacherEarningMaturities.AsNoTracking()
                    .Where(x => x.TeacherId == teacherId && x.Currency == currency
                        && x.Status == TeacherEarningMaturityStatus.Pending)
                    .MinAsync(x => (DateTimeOffset?)x.MaturesAt, ct);
            result.Add(new(currency,
                available is null ? 0 : await BalanceAsync(available.Id, ct),
                pending is null ? 0 : await BalanceAsync(pending.Id, ct),
                clearance is null ? 0 : await BalanceAsync(clearance.Id, ct),
                nextRelease));
        }
        return result;
    }

    /// <summary>
    /// Promotes one due earning from <c>TeacherPending</c> to <c>TeacherAvailable</c>.
    /// Safe to call repeatedly and concurrently: the row is re-read and re-checked under a
    /// Serializable transaction plus an application lock, and the promotion ledger entry carries a
    /// stable unique BusinessKey, so a duplicate attempt cannot move money twice.
    /// </summary>
    public async Task<bool> MatureTeacherEarningAsync(Guid maturityId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"earning-maturity:{maturityId}", ct);
        var maturity = await db.TeacherEarningMaturities.SingleOrDefaultAsync(x => x.Id == maturityId, ct);
        if (maturity is null)
        {
            await tx.CommitAsync(ct);
            return false;
        }

        /* Serialize against dispute creation on the SAME resource GovernanceService.OpenDisputeAsync
           locks. Reading Disputes under Serializable is not enough: both sides only *read* that table,
           shared range locks do not conflict, and the writes land in different tables — so without this
           lock a dispute could pass its eligibility check just before the deadline and commit just after
           a concurrent promotion, leaving withdrawable money exposed to a valid dispute.

           Because OpenDisputeAsync takes this lock *before* it evaluates eligibility, the two orderings
           are both safe: if the dispute wins, the Disputes read below sees it and blocks maturity; if
           maturity wins, the dispute re-evaluates eligibility against a clock that is now past the
           window and is rejected. */
        var acquired = await db.Database.TryAcquireAsync(maturity.OrderId is Guid lockedOrderId
            ? $"dispute-order:{lockedOrderId}"
            : $"dispute-session:{maturity.LiveSessionBookingId}", ct);
        if (!acquired)
        {
            // Could not serialize against dispute creation. Refusing to mature is always the safe
            // direction; the next scan retries. Never promote on an unverified lock.
            await tx.CommitAsync(ct);
            return false;
        }

        var now = clock.GetUtcNow();
        if (!maturity.IsDue(now))
        {
            await tx.CommitAsync(ct);
            return false;
        }
        // Refunded money must never mature, even if the schedule was not reversed for some reason.
        var payment = await db.Payments.AsNoTracking().SingleAsync(x => x.Id == maturity.PaymentId, ct);
        if (payment.Status != PaymentStatus.Confirmed)
        {
            maturity.Reverse(now);
            db.Add(Audit("EarningMaturityCancelled", "system:maturity", "TeacherEarningMaturity",
                maturity.Id.ToString(), $"{maturity.BusinessKey}:cancelled"));
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return false;
        }
        // An unresolved dispute keeps the money exposed regardless of the elapsed window.
        var blocked = maturity.OrderId is Guid orderId
            ? await db.Disputes.AnyAsync(x => x.OrderId == orderId && x.Status != DisputeStatus.Resolved, ct)
            : await db.Disputes.AnyAsync(x =>
                x.LiveSessionBookingId == maturity.LiveSessionBookingId && x.Status != DisputeStatus.Resolved, ct);
        if (blocked)
        {
            await tx.CommitAsync(ct);
            return false;
        }
        if (!maturity.Mature(now))
        {
            await tx.CommitAsync(ct);
            return false;
        }
        var pending = await AccountAsync(LedgerAccountKind.TeacherPending, maturity.TeacherId, maturity.Currency, ct);
        var available = await AccountAsync(LedgerAccountKind.TeacherAvailable, maturity.TeacherId, maturity.Currency, ct);
        db.AddRange(
            new LedgerEntry(maturity.BusinessKey, pending.Id, available.Id, maturity.Amount,
                maturity.Currency, maturity.OrderId is null ? "LiveSession" : "Order",
                (maturity.OrderId ?? maturity.LiveSessionBookingId)!.Value.ToString(), now),
            Audit("EarningMatured", "system:maturity", "TeacherEarningMaturity",
                maturity.Id.ToString(), maturity.BusinessKey));
        await notifications.QueueAsync(maturity.TeacherId, "Withdrawal", "Earnings available",
            "Cleared earnings are now available to withdraw.", "/teacher/earnings",
            $"{maturity.BusinessKey}:matured", false, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }

    /// <summary>Bounded scan of earnings whose refund exposure has ended.</summary>
    public Task<IReadOnlyCollection<Guid>> GetDueEarningMaturityIdsAsync(int batchSize, CancellationToken ct) =>
        DueMaturityIdsAsync(Math.Clamp(batchSize, 1, 500), ct);

    private async Task<IReadOnlyCollection<Guid>> DueMaturityIdsAsync(int batchSize, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        return await db.TeacherEarningMaturities.AsNoTracking()
            .Where(x => x.Status == TeacherEarningMaturityStatus.Pending && x.MaturesAt < now)
            .OrderBy(x => x.MaturesAt).ThenBy(x => x.Id)
            .Take(batchSize)
            .Select(x => x.Id)
            .ToArrayAsync(ct);
    }

    public WithdrawalPolicyDto GetWithdrawalPolicy() =>
        new(_withdrawals.MinimumAmount, _withdrawals.Currency, _withdrawals.ExpectedSettlementBusinessDays);

    public async Task<Application.Common.PagedResult<WithdrawalDto>> GetMyWithdrawalsAsync(
        string teacherId, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.WithdrawalRequests.AsNoTracking().Where(x => x.TeacherId == teacherId);
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(items.Select(Map).ToArray(), page, pageSize, total);
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
                x.PayoutMethod,
                x.DestinationLabel,
                x.RejectionReason,
                x.CreatedAt,
                x.UpdatedAt,
                x.RowVersion,
                // The sealed destination itself is never read for a list.
                HasDestinationSnapshot = x.PayoutMethod == PayoutMethods.BankTransfer && x.DestinationKeyId != null,
                x.InitiationReference,
                x.TransferInitiatedAt,
                x.TransferredAt
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
                name.FullName, name.FullNameEnglish, x.PayoutMethod, x.DestinationLabel, x.RejectionReason,
                x.UpdatedAt, x.HasDestinationSnapshot, x.InitiationReference, x.TransferInitiatedAt, x.TransferredAt);
        }).ToArray();
        return new(items, page, pageSize, total);
    }

    public async Task<PayoutProfileDto?> GetPayoutProfileAsync(string teacherId, CancellationToken ct)
    {
        var profile = await db.TeacherPayoutProfiles.AsNoTracking()
            .SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct);
        return profile is null ? null : Map(profile);
    }

    public async Task<PayoutProfileDto> SubmitPayoutProfileAsync(
        string teacherId, SubmitPayoutProfile input, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        // V1 pays by bank transfer only; a mobile wallet has no adapter that could pay it (DEC-04).
        if (!string.Equals(input.PayoutMethod?.Trim(), PayoutMethods.BankTransfer, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("payout_method_not_supported", "Only bank transfer payouts are available.");
        var destination = BankTransferDestination.Create(input.LegalName, input.BankName, input.Iban, input.CountryCode);
        // Sealed before anything is tracked: the IBAN never reaches the database, a log or the audit trail in clear.
        var sealedDestination = payoutVault.Seal(teacherId, destination);
        var profile = await db.TeacherPayoutProfiles.SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct);
        if (profile is null)
        {
            profile = new TeacherPayoutProfile(teacherId, destination, input.IdentityLast4, sealedDestination, now);
            db.Add(profile);
        }
        else
        {
            profile.SubmitBankTransfer(destination, input.IdentityLast4, sealedDestination, now);
        }
        db.Add(Audit("PayoutProfileSubmitted", teacherId, "PayoutProfile", teacherId, $"profile:{teacherId}:{now:O}"));
        foreach (var operatorId in await FinanceTeamIdsAsync(teacherId, ct))
            await notifications.QueueAsync(operatorId, "FinanceQueue", "Bank details to verify",
                "A teacher entered or changed their bank details. Verify them before any withdrawal is paid.",
                AppRoutes.FinancePayoutProfiles, $"payout-profile:{teacherId}:{now:O}:{operatorId}", false, ct);
        await db.SaveChangesAsync(ct);
        return Map(profile);
    }

    /// <summary>
    /// Who handles money work: the Finance users, or the Admins while no Finance user exists. The person the work
    /// is about is never told to handle it (a staff member who also teaches).
    /// </summary>
    private async Task<string[]> FinanceTeamIdsAsync(string subjectUserId, CancellationToken ct)
    {
        async Task<string[]> InRoleAsync(string roleName) => await (
                from membership in db.UserRoles.AsNoTracking()
                join role in db.Roles.AsNoTracking() on membership.RoleId equals role.Id
                join user in db.Users.AsNoTracking() on membership.UserId equals user.Id
                where role.Name == roleName && !user.IsSuspended && user.Id != subjectUserId
                select user.Id)
            .Distinct().ToArrayAsync(ct);
        var finance = await InRoleAsync(Tafseel.Application.Authorization.Roles.Finance);
        return finance.Length > 0 ? finance : await InRoleAsync(Tafseel.Application.Authorization.Roles.Admin);
    }

    public async Task<Application.Common.PagedResult<PayoutProfileDto>> GetPayoutProfilesAsync(
        PayoutVerificationStatus? status, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.TeacherPayoutProfiles.AsNoTracking();
        if (status.HasValue) query = query.Where(x => x.Status == status);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.SubmittedAt).ThenBy(x => x.TeacherId)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(rows.Select(Map).ToArray(), page, pageSize, total);
    }

    public async Task<PayoutProfileDto> ReviewPayoutProfileAsync(
        string adminId, string teacherId, ReviewPayoutProfile input, string version, CancellationToken ct)
    {
        var profile = await db.TeacherPayoutProfiles.SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct)
            ?? throw new DomainException("payout_profile_not_found", "Payout profile was not found.");
        ApplyVersion(profile, version);
        profile.Review(input.Approve, input.RejectionReason, adminId, clock.GetUtcNow());
        db.Add(Audit(input.Approve ? "PayoutProfileVerified" : "PayoutProfileRejected",
            adminId, "PayoutProfile", teacherId, $"profile-review:{teacherId}:{profile.SubmittedAt:O}"));
        await notifications.QueueAsync(teacherId, "Withdrawal",
            input.Approve ? "Payout profile verified" : "Payout profile needs changes",
            input.Approve ? "You can now request withdrawals." : profile.RejectionReason!,
            AppRoutes.TeacherEarnings, $"payout-profile:{teacherId}:{profile.Status}", true, ct);
        await db.SaveChangesAsync(ct);
        return Map(profile);
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

        var anomalies = new List<ReconciliationAnomalyDto>();

        // (1) Confirmed capture with no escrow hold — money entered with no custody record.
        foreach (var row in await db.Payments.AsNoTracking()
                     .Where(p => p.Status == PaymentStatus.Confirmed
                         && !db.EscrowEntries.Any(e => e.PaymentId == p.Id && e.Type == EscrowEntryType.Held))
                     .OrderByDescending(p => p.CreatedAt).Take(AnomalyLimit)
                     .Select(p => new { p.Id, p.OrderId, p.LiveSessionBookingId, p.Amount }).ToArrayAsync(ct))
            anomalies.Add(new("MissingEscrowHold", row.Id, row.OrderId, row.LiveSessionBookingId,
                row.Amount, row.Amount, 0m, row.Amount, "Confirmed payment has no Held escrow entry."));

        // (2)(3)(4) Escrow drained by more than the confirmed capture that funded it.
        var movements = await db.EscrowEntries.AsNoTracking()
            .Where(x => x.Type != EscrowEntryType.Held)
            .GroupBy(x => x.PaymentId)
            .Select(g => new { PaymentId = g.Key, Amount = g.Sum(x => x.Amount) })
            .ToArrayAsync(ct);
        var moved = movements.ToDictionary(x => x.PaymentId, x => x.Amount);
        var confirmed = await db.Payments.AsNoTracking()
            .Where(x => x.Status != PaymentStatus.Pending && x.Status != PaymentStatus.Failed)
            .Select(x => new { x.Id, x.OrderId, x.LiveSessionBookingId, x.Amount }).ToArrayAsync(ct);
        var overReleased = 0;
        foreach (var payment in confirmed)
        {
            if (!moved.TryGetValue(payment.Id, out var out_) || out_ <= payment.Amount) continue;
            overReleased++;
            if (anomalies.Count < AnomalyLimit)
                anomalies.Add(new("EscrowOverReleased", payment.Id, payment.OrderId, payment.LiveSessionBookingId,
                    payment.Amount, payment.Amount, out_, out_ - payment.Amount,
                    "Released plus refunded escrow exceeds the confirmed capture."));
        }

        // (5) FR-1 signature: teacher + platform release ledger must equal the confirmed capture exactly.
        // One batched read — a per-payment SumAsync used to N+1 the ledger and 500 Admin Home
        // (/admin/attention calls this on every mount) when LocalDB cancelled the command.
        var allocationMismatches = 0;
        var releaseKeys = new List<string>(confirmed.Length * 2);
        foreach (var payment in confirmed)
        {
            var reference = (payment.OrderId ?? payment.LiveSessionBookingId)?.ToString();
            if (reference is null) continue;
            var prefix = payment.OrderId is null ? "live-session:" : "order:";
            releaseKeys.Add($"{prefix}{reference}:teacher-release");
            releaseKeys.Add($"{prefix}{reference}:platform-release");
        }
        var creditedByReference = releaseKeys.Count == 0
            ? new Dictionary<string, decimal>()
            : await db.LedgerEntries.AsNoTracking()
                .Where(x => releaseKeys.Contains(x.BusinessKey))
                .GroupBy(x => x.ReferenceId)
                .Select(g => new { g.Key, Amount = g.Sum(x => x.Amount) })
                .ToDictionaryAsync(x => x.Key, x => x.Amount, ct);
        foreach (var payment in confirmed)
        {
            var reference = (payment.OrderId ?? payment.LiveSessionBookingId)?.ToString();
            if (reference is null) continue;
            var credited = creditedByReference.GetValueOrDefault(reference);
            if (credited == 0 || credited == payment.Amount) continue;
            allocationMismatches++;
            if (anomalies.Count < AnomalyLimit)
                anomalies.Add(new("AllocationMismatch", payment.Id, payment.OrderId, payment.LiveSessionBookingId,
                    payment.Amount, payment.Amount, credited, credited - payment.Amount,
                    "Teacher plus platform release does not equal the confirmed capture (FR-1 signature)."));
        }

        // (6)(7) Negative teacher balances — a ledger hole, usually a reversal after withdrawal.
        var negativeAvailable = 0;
        var negativePending = 0;
        var teacherAccounts = accounts
            .Where(x => x.Kind is LedgerAccountKind.TeacherAvailable or LedgerAccountKind.TeacherPending)
            .ToArray();
        var teacherAccountIds = teacherAccounts.Select(x => x.Id).ToArray();
        var creditsByAccount = teacherAccountIds.Length == 0
            ? new Dictionary<Guid, decimal>()
            : await db.LedgerEntries.AsNoTracking()
                .Where(x => teacherAccountIds.Contains(x.CreditAccountId))
                .GroupBy(x => x.CreditAccountId)
                .Select(g => new { g.Key, Amount = g.Sum(x => x.Amount) })
                .ToDictionaryAsync(x => x.Key, x => x.Amount, ct);
        var debitsByAccount = teacherAccountIds.Length == 0
            ? new Dictionary<Guid, decimal>()
            : await db.LedgerEntries.AsNoTracking()
                .Where(x => teacherAccountIds.Contains(x.DebitAccountId))
                .GroupBy(x => x.DebitAccountId)
                .Select(g => new { g.Key, Amount = g.Sum(x => x.Amount) })
                .ToDictionaryAsync(x => x.Key, x => x.Amount, ct);
        foreach (var account in teacherAccounts)
        {
            var balance = creditsByAccount.GetValueOrDefault(account.Id)
                - debitsByAccount.GetValueOrDefault(account.Id);
            if (balance >= 0) continue;
            if (account.Kind == LedgerAccountKind.TeacherAvailable) negativeAvailable++; else negativePending++;
            if (anomalies.Count < AnomalyLimit)
                anomalies.Add(new($"Negative{account.Kind}", Guid.Empty, null, null,
                    0m, 0m, balance, balance,
                    $"Teacher {account.OwnerId} has a negative {account.Kind} balance in {account.Currency}."));
        }

        // (8) Clearance schedules whose parent capture is no longer confirmed.
        var orphanMaturities = await db.TeacherEarningMaturities.AsNoTracking()
            .CountAsync(x => x.Status == TeacherEarningMaturityStatus.Pending
                && db.Payments.Any(p => p.Id == x.PaymentId && p.Status != PaymentStatus.Confirmed), ct);

        // (9) Money that matured even though its purchase was refunded.
        var maturedAfterRefund = await db.TeacherEarningMaturities.AsNoTracking()
            .CountAsync(x => x.Status == TeacherEarningMaturityStatus.Matured
                && db.Payments.Any(p => p.Id == x.PaymentId && p.Status == PaymentStatus.Refunded), ct);

        // (10) Duplicate financial business keys. Unique indexes should make this impossible; a non-zero
        // count means an index is missing or was bypassed, so it is reported rather than assumed away.
        var duplicateKeys = await db.LedgerEntries.AsNoTracking()
            .GroupBy(x => x.BusinessKey).Where(g => g.Count() > 1).CountAsync(ct);

        return new(payments, held, released, refunded,
            await KindBalance(LedgerAccountKind.TeacherAvailable),
            await KindBalance(LedgerAccountKind.WithdrawalClearing),
            await KindBalance(LedgerAccountKind.PlatformRevenue), 0, orphans,
            await KindBalance(LedgerAccountKind.TeacherPending),
            overReleased, allocationMismatches, negativeAvailable, negativePending,
            orphanMaturities, maturedAfterRefund, duplicateKeys, anomalies);
    }

    private const int AnomalyLimit = 50;

    /// <summary>
    /// FR-1 historical audit. Read-only: it classifies coupon-discounted purchases against the immutable
    /// ledger and escrow trail and never mutates a balance. Remediation is a separate, explicit decision.
    /// </summary>
    public async Task<CouponReconciliationReportDto> ReconcileCouponPurchasesAsync(int limit, CancellationToken ct)
    {
        limit = Math.Clamp(limit, 1, 500);
        var redemptions = await (
            from redemption in db.CouponRedemptions.AsNoTracking()
            join payment in db.Payments.AsNoTracking() on redemption.PaymentId equals payment.Id
            where payment.Status != PaymentStatus.Pending && payment.Status != PaymentStatus.Failed
            orderby payment.CreatedAt descending
            select new
            {
                payment.Id,
                payment.OrderId,
                payment.LiveSessionBookingId,
                payment.Amount,
                Discount = redemption.DiscountAmount
            }).Take(limit).ToArrayAsync(ct);

        var rows = new List<CouponReconciliationRowDto>(redemptions.Length);
        foreach (var item in redemptions)
        {
            var isOrder = item.OrderId is not null;
            var reference = (item.OrderId ?? item.LiveSessionBookingId)!.Value;
            var prefix = isOrder ? "order:" : "live-session:";
            var teacherNet = isOrder
                ? await db.Orders.AsNoTracking().Where(x => x.Id == reference)
                    .Select(x => (decimal?)x.TeacherNet).SingleOrDefaultAsync(ct) ?? 0
                : await db.LiveSessionBookings.AsNoTracking().Where(x => x.Id == reference)
                    .Select(x => (decimal?)x.TeacherNet).SingleOrDefaultAsync(ct) ?? 0;
            var (expectedTeacher, expectedPlatform) = AllocateCapture(teacherNet, item.Amount);

            var escrow = await db.EscrowEntries.AsNoTracking().Where(x => x.PaymentId == item.Id)
                .GroupBy(x => x.Type).Select(g => new { Type = g.Key, Amount = g.Sum(x => x.Amount), Count = g.Count() })
                .ToArrayAsync(ct);
            var heldAmount = escrow.Where(x => x.Type == EscrowEntryType.Held).Sum(x => x.Amount);
            var releasedAmount = escrow.Where(x => x.Type == EscrowEntryType.Released).Sum(x => x.Amount);
            var refundedAmount = escrow.Where(x => x.Type == EscrowEntryType.Refunded).Sum(x => x.Amount);
            var duplicated = escrow.Any(x => x.Count > 1);

            var actualTeacher = await db.LedgerEntries.AsNoTracking()
                .Where(x => x.BusinessKey == $"{prefix}{reference}:teacher-release")
                .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
            var actualPlatform = await db.LedgerEntries.AsNoTracking()
                .Where(x => x.BusinessKey == $"{prefix}{reference}:platform-release")
                .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;

            var releasedTotal = actualTeacher + actualPlatform;
            var status =
                heldAmount == 0 ? "MissingEscrow"
                : duplicated ? "DuplicateMovement"
                : releasedTotal == 0 ? (refundedAmount > 0 ? "Balanced" : "NeedsManualReview")
                : releasedTotal > item.Amount ? "OverReleased"
                : releasedTotal < item.Amount ? "UnderReleased"
                : actualTeacher == expectedTeacher && actualPlatform == expectedPlatform
                    ? "Balanced" : "NeedsManualReview";

            rows.Add(new(item.Id, item.OrderId, item.LiveSessionBookingId, item.Amount, item.Discount,
                expectedTeacher, expectedPlatform, heldAmount, releasedAmount, refundedAmount,
                actualTeacher, actualPlatform, releasedTotal - item.Amount, status));
        }

        return new(rows.Count,
            rows.Count(x => x.Status == "Balanced"),
            rows.Count(x => x.Status == "OverReleased"),
            rows.Count(x => x.Status == "UnderReleased"),
            rows.Count(x => x.Status == "MissingEscrow"),
            rows.Count(x => x.Status == "DuplicateMovement"),
            rows.Count(x => x.Status == "NeedsManualReview"),
            rows);
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
    private async Task<Refund> RefundLiveSessionCoreAsync(
        Payment payment, LiveSessionBooking booking, string actorId, string idempotencyKey, CancellationToken ct)
    {
        if (await db.EscrowEntries.AnyAsync(
                x => x.PaymentId == payment.Id && x.Type == EscrowEntryType.Released, ct))
            throw new DomainException("refund_after_release_forbidden",
                "Released escrow cannot be refunded by the held-escrow flow.");
        if (await db.Refunds.AnyAsync(x => x.PaymentId == payment.Id, ct))
            throw new DomainException("refund_conflict", "Payment has already been refunded.");
        payment.Refund(clock.GetUtcNow());
        var escrow = await AccountAsync(LedgerAccountKind.EscrowHeld, "", payment.Currency, ct);
        var refunds = await AccountAsync(LedgerAccountKind.RefundClearing, "", payment.Currency, ct);
        var refund = Refund.ForLiveSession(payment.Id, booking.Id, payment.Amount, payment.Currency,
            idempotencyKey, actorId, clock.GetUtcNow());
        db.AddRange(refund,
            new LedgerEntry($"refund:{refund.Id}", escrow.Id, refunds.Id, payment.Amount,
                payment.Currency, "Refund", refund.Id.ToString(), clock.GetUtcNow()),
            EscrowEntry.ForLiveSession(payment.Id, booking.Id, EscrowEntryType.Refunded,
                payment.Amount, payment.Currency, $"refund:{refund.Id}", clock.GetUtcNow()),
            Audit("LiveSessionPaymentRefunded", actorId, "Payment", payment.Id.ToString(), idempotencyKey));
        await notifications.QueueAsync(booking.StudentId, "Refund", "Session payment refunded",
            "The held live-session payment was refunded.", $"/live-sessions/{booking.Id}",
            $"payment:{payment.Id}:refunded:student", true, ct);
        await notifications.QueueAsync(booking.TeacherId, "Refund", "Session payment refunded",
            "The held live-session payment was refunded.", $"/live-sessions/{booking.Id}",
            $"payment:{payment.Id}:refunded:teacher", true, ct);
        return refund;
    }
    /// <summary>
    /// Resolves which teacher-side account currently holds a released earning, and marks any pending
    /// schedule reversed so the maturity worker can never promote refunded money.
    /// Exactly one account is debited — never both.
    /// </summary>
    private async Task<LedgerAccountKind> ReverseTeacherEarningAsync(
        Guid paymentId, DateTimeOffset now, CancellationToken ct)
    {
        var maturity = await db.TeacherEarningMaturities.SingleOrDefaultAsync(x => x.PaymentId == paymentId, ct);
        // No schedule means the earning was credited straight to Available: either it was released after
        // its exposure had already ended, or it predates FR-2. Either way the historical policy applies.
        if (maturity is null || maturity.Status != TeacherEarningMaturityStatus.Pending)
            return LedgerAccountKind.TeacherAvailable;
        maturity.Reverse(now);
        return LedgerAccountKind.TeacherPending;
    }

    private async Task<Refund> RefundReleasedOrderCoreAsync(
        Payment payment, Order order, string actorId, string idempotencyKey, CancellationToken ct)
    {
        if (await db.Refunds.AnyAsync(x => x.PaymentId == payment.Id, ct))
            throw new DomainException("refund_conflict", "Payment has already been refunded.");
        var now = clock.GetUtcNow();
        payment.Refund(now);
        order.Refund(actorId, now);
        var teacherKind = await ReverseTeacherEarningAsync(payment.Id, now, ct);
        var teacher = await AccountAsync(teacherKind, order.TeacherId, payment.Currency, ct);
        var platform = await AccountAsync(LedgerAccountKind.PlatformRevenue, "", payment.Currency, ct);
        var refunds = await AccountAsync(LedgerAccountKind.RefundClearing, "", payment.Currency, ct);
        var (teacherAmount, platformAmount) = AllocateCapture(order.TeacherNet, payment.Amount);
        var refund = new Refund(payment.Id, order.Id, payment.Amount, payment.Currency,
            idempotencyKey, actorId, now);
        if (teacherAmount > 0)
            db.Add(new LedgerEntry($"refund:{refund.Id}:teacher-reversal", teacher.Id, refunds.Id,
                teacherAmount, payment.Currency, "Refund", refund.Id.ToString(), now));
        if (platformAmount > 0)
            db.Add(new LedgerEntry($"refund:{refund.Id}:platform-reversal", platform.Id, refunds.Id,
                platformAmount, payment.Currency, "Refund", refund.Id.ToString(), now));
        db.AddRange(refund,
            new EscrowEntry(payment.Id, order.Id, EscrowEntryType.Refunded,
                payment.Amount, payment.Currency, $"refund:{refund.Id}", now),
            Audit("ReleasedPaymentRefunded", actorId, "Payment", payment.Id.ToString(), idempotencyKey));
        await notifications.QueueAsync(order.StudentId, "Refund", "Payment refunded",
            "The completed Order payment was refunded after review.", $"/orders/{order.Id}",
            $"payment:{payment.Id}:released-refund:student", true, ct);
        await notifications.QueueAsync(order.TeacherId, "Refund", "Order earning reversed",
            "A resolved dispute reversed this Order earning.", $"/orders/{order.Id}",
            $"payment:{payment.Id}:released-refund:teacher", true, ct);
        return refund;
    }
    private async Task<Refund> RefundReleasedLiveSessionCoreAsync(
        Payment payment, LiveSessionBooking booking, string actorId, string idempotencyKey, CancellationToken ct)
    {
        if (await db.Refunds.AnyAsync(x => x.PaymentId == payment.Id, ct))
            throw new DomainException("refund_conflict", "Payment has already been refunded.");
        payment.Refund(clock.GetUtcNow());
        var teacherKind = await ReverseTeacherEarningAsync(payment.Id, clock.GetUtcNow(), ct);
        var teacher = await AccountAsync(teacherKind, booking.TeacherId, payment.Currency, ct);
        var platform = await AccountAsync(LedgerAccountKind.PlatformRevenue, "", payment.Currency, ct);
        var refunds = await AccountAsync(LedgerAccountKind.RefundClearing, "", payment.Currency, ct);
        var (teacherAmount, platformAmount) = AllocateCapture(booking.TeacherNet, payment.Amount);
        var refund = Refund.ForLiveSession(payment.Id, booking.Id, payment.Amount, payment.Currency,
            idempotencyKey, actorId, clock.GetUtcNow());
        if (teacherAmount > 0)
            db.Add(new LedgerEntry($"refund:{refund.Id}:teacher-reversal", teacher.Id, refunds.Id,
                teacherAmount, payment.Currency, "Refund", refund.Id.ToString(), clock.GetUtcNow()));
        if (platformAmount > 0)
            db.Add(new LedgerEntry($"refund:{refund.Id}:platform-reversal", platform.Id, refunds.Id,
                platformAmount, payment.Currency, "Refund", refund.Id.ToString(), clock.GetUtcNow()));
        db.AddRange(refund,
            EscrowEntry.ForLiveSession(payment.Id, booking.Id, EscrowEntryType.Refunded,
                payment.Amount, payment.Currency, $"refund:{refund.Id}", clock.GetUtcNow()),
            Audit("LiveSessionReleasedPaymentRefunded", actorId, "Payment", payment.Id.ToString(), idempotencyKey));
        await notifications.QueueAsync(booking.StudentId, "Refund", "Session payment refunded",
            "The completed live-session payment was refunded after review.", $"/live-sessions/{booking.Id}",
            $"payment:{payment.Id}:refunded:student", true, ct);
        await notifications.QueueAsync(booking.TeacherId, "Refund", "Session payment reversed",
            "A resolved dispute reversed this live-session earning.", $"/live-sessions/{booking.Id}",
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
    /// <summary>Verified transaction-scoped lock; throws rather than continuing unlocked.</summary>
    private Task LockAsync(string resource, CancellationToken ct) =>
        db.Database.AcquireAsync(resource, ct);

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
    private void ApplyVersion(TeacherPayoutProfile item, string version)
    {
        try
        {
            db.Entry(item).Property(x => x.RowVersion).OriginalValue =
                Convert.FromBase64String(version.Trim('"'));
        }
        catch (FormatException)
        {
            throw new DomainException("invalid_concurrency_token", "The payout profile version is invalid.");
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
        new(x.Id, x.OrderId, x.LiveSessionBookingId, x.LearningRequestId,
            x.Amount, x.Currency, x.Provider, x.ProviderReference, x.Status, x.CreatedAt);
    private static RefundDto Map(Refund x) =>
        new(x.Id, x.PaymentId, x.OrderId, x.LiveSessionBookingId, x.Amount, x.Currency, x.CreatedAt);
    private static WithdrawalDto Map(WithdrawalRequest x) =>
        new(x.Id, x.Amount, x.Currency, x.Status, x.ProviderReference,
            x.CreatedAt, Convert.ToBase64String(x.RowVersion),
            x.PayoutMethod, x.DestinationLabel, x.RejectionReason, x.UpdatedAt,
            x.TransferInitiatedAt, x.TransferredAt);
    private static PayoutProfileDto Map(TeacherPayoutProfile x) =>
        new(x.TeacherId, x.LegalName, x.CountryCode, x.PayoutMethod, x.DestinationLabel,
            x.IdentityLast4, x.Status, x.RejectionReason, x.SubmittedAt, x.ReviewedAt,
            Convert.ToBase64String(x.RowVersion), x.CanReceiveTransfers, !x.HasTransferCapableDestination);
}
