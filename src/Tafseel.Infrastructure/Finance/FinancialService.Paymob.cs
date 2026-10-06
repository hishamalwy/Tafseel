using System.Data;
using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Finance;
using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Finance;

internal sealed partial class FinancialService
{
    private async Task<ProviderRefund> QueueProviderRefundAsync(
        Payment payment, string actorId, string key, string reason, CancellationToken ct, bool unallocated = false)
    {
        await using var transaction = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct) : null;
        await LockAsync($"refund:{payment.Id}", ct);
        var existing = await db.Set<ProviderRefund>().SingleOrDefaultAsync(x => x.PaymentId == payment.Id, ct);
        if (existing is not null)
        {
            if (existing.IdempotencyKey != key || existing.ActorId != actorId)
                throw new DomainException("refund_conflict", "A refund has already been requested for this payment.");
            return existing;
        }
        if (payment.Status != PaymentStatus.Confirmed && !unallocated)
            throw new DomainException("payment_not_confirmed", "Confirmed payment was not found.");
        var checkout = await db.Set<ProviderCheckout>().SingleOrDefaultAsync(x => x.PaymentId == payment.Id, ct);
        if (checkout?.TransactionId is null)
            throw new DomainException("payment_transaction_missing", "The captured provider transaction was not found.");
        var operation = new ProviderRefund
        {
            PaymentId = payment.Id, TransactionId = checkout.TransactionId, ActorId = actorId,
            IdempotencyKey = RequiredKey(key), Reason = reason, Amount = payment.Amount, Currency = payment.Currency,
            CreatedAt = clock.GetUtcNow(), UnallocatedCapture = unallocated
        };
        db.Add(operation);
        db.Add(Audit("ProviderRefundRequested", actorId, "Payment", payment.Id.ToString(), key));
        if (transaction is not null)
        {
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        return operation;
    }

    private async Task RequireNoProviderRefundAsync(Payment payment, CancellationToken ct)
    {
        if (await db.Set<ProviderRefund>().AnyAsync(x => x.PaymentId == payment.Id && !x.Applied
            && x.Status != ProviderRefundStatus.Rejected, ct))
            throw new DomainException("refund_pending", "This payment has a refund in progress.");
    }

    internal async Task ProcessProviderRefundAsync(Guid id, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is not null)
            throw new InvalidOperationException("Provider refund HTTP must run outside a SQL transaction.");
        ProviderRefund operation;
        bool send;
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            operation = await db.Set<ProviderRefund>().SingleAsync(x => x.Id == id, ct);
            await LockAsync($"refund:{operation.PaymentId}", ct);
            await db.Entry(operation).ReloadAsync(ct);
            if (operation.Applied || operation.Status == ProviderRefundStatus.Rejected) return;
            send = operation.Status == ProviderRefundStatus.Requested;
            operation.LastCheckedAt = clock.GetUtcNow();
            if (send) operation.Status = ProviderRefundStatus.Sending;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        ProviderRefundResult result;
        try
        {
            if (send)
                result = await provider.RefundAsync(operation.TransactionId, operation.Amount, operation.Currency, ct);
            else if (operation.Status == ProviderRefundStatus.Succeeded)
                result = new(ProviderRefundStatus.Succeeded, operation.ProviderReference);
            else
            {
                // A crash/timeout may have sent money. Inquiry is safe; another refund POST is not.
                var checkout = await db.Set<ProviderCheckout>().AsNoTracking().SingleAsync(x => x.PaymentId == operation.PaymentId, ct);
                var evidence = await provider.InquireAsync(checkout.Reference, ct, operation.TransactionId);
                result = evidence is { Kind: ProviderEventKind.Refund, Succeeded: true }
                    && evidence.TransactionId == operation.TransactionId && evidence.Amount == operation.Amount
                    && evidence.Currency == operation.Currency && evidence.OrderId == checkout.OrderId
                    && evidence.ProviderReference == checkout.Reference && evidence.RefundedAmount == operation.Amount
                    ? new(ProviderRefundStatus.Succeeded, evidence.TransactionId)
                    : new(ProviderRefundStatus.Unknown, FailureCode: "provider_refund_unknown");
            }
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or DomainException or System.Text.Json.JsonException)
        {
            result = new(ProviderRefundStatus.Unknown, FailureCode: "provider_refund_unknown");
        }
        await using var completion = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, CancellationToken.None);
        await LockAsync($"refund:{operation.PaymentId}", CancellationToken.None);
        await db.Entry(operation).ReloadAsync(CancellationToken.None);
        if (operation.Applied) return;
        // A concurrent verified callback may already have proved success; never downgrade it.
        if (operation.Status != ProviderRefundStatus.Succeeded)
        {
            operation.Status = result.Status;
            operation.ProviderReference = result.Reference;
            operation.FailureCode = result.FailureCode;
        }
        if (operation.Status == ProviderRefundStatus.Succeeded)
            await ApplyProviderRefundAsync(operation, CancellationToken.None);
        else if (operation.Status is ProviderRefundStatus.Unknown or ProviderRefundStatus.Rejected)
            await ProviderExceptionAsync(operation.PaymentId, "provider_refund_" + operation.Status.ToString().ToLowerInvariant(),
                "The provider refund needs Finance review; no local refund was recorded.", CancellationToken.None);
        await db.SaveChangesAsync(CancellationToken.None);
        await completion.CommitAsync(CancellationToken.None);
    }

    private async Task ApplyProviderRefundAsync(ProviderRefund operation, CancellationToken ct)
    {
        if (operation.Applied || operation.Status != ProviderRefundStatus.Succeeded) return;
        var payment = await db.Payments.SingleAsync(x => x.Id == operation.PaymentId, ct);
        if (operation.UnallocatedCapture)
        {
            // The expired/cancelled payable was never funded. Its external capture/refund remains an explicit case.
            operation.Applied = true;
            db.Add(Audit("UnallocatedProviderCaptureRefunded", provider.Name, "Payment", payment.Id.ToString(), operation.IdempotencyKey));
            return;
        }
        if (await db.Refunds.AnyAsync(x => x.PaymentId == payment.Id, ct)) { operation.Applied = true; return; }
        var released = await db.EscrowEntries.AnyAsync(x => x.PaymentId == payment.Id && x.Type == EscrowEntryType.Released, ct);
        if (payment.OrderId is Guid orderId)
        {
            var order = await db.Orders.SingleAsync(x => x.Id == orderId, ct);
            if (released) await RefundReleasedOrderCoreAsync(payment, order, operation.ActorId, operation.IdempotencyKey, ct);
            else await RefundCoreAsync(payment, order, operation.ActorId, operation.IdempotencyKey, ct);
        }
        else if (payment.LiveSessionBookingId is Guid bookingId)
        {
            var booking = await db.LiveSessionBookings.SingleAsync(x => x.Id == bookingId, ct);
            if (released) await RefundReleasedLiveSessionCoreAsync(payment, booking, operation.ActorId, operation.IdempotencyKey, ct);
            else await RefundLiveSessionCoreAsync(payment, booking, operation.ActorId, operation.IdempotencyKey, ct);
        }
        else throw new DomainException("payment_not_found", "Payment was not found.");
        operation.Applied = true;
        db.Add(Audit("ProviderRefundConfirmed", provider.Name, "Payment", payment.Id.ToString(), operation.ProviderReference ?? operation.TransactionId));
    }

    private async Task ProviderExceptionAsync(Guid paymentId, string kind, string detail, CancellationToken ct)
    {
        var fingerprint = $"paymob:{paymentId}:{kind}";
        if (await db.ReconciliationExceptions.AnyAsync(x => x.Fingerprint == fingerprint, ct)) return;
        var payment = await db.Payments.SingleAsync(x => x.Id == paymentId, ct);
        db.Add(ReconciliationException.Detect(fingerprint, kind, paymentId, payment.OrderId,
            payment.LiveSessionBookingId, payment.Amount, detail, clock.GetUtcNow()));
    }

    public async Task<PaymentStateDto> GetPaymentStateAsync(string userId, Guid paymentId, CancellationToken ct)
    {
        var payment = await GetPaymentAsync(userId, paymentId, ct);
        var latest = await db.PaymentAttempts.AsNoTracking().Where(x => x.PaymentId == paymentId)
            .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Status).FirstOrDefaultAsync(ct);
        var state = payment.Status.ToString();
        if (payment.Status == PaymentStatus.Pending && latest?.Status == PaymentAttemptStatus.Failed) state = "Failed";
        if (await db.Set<ProviderRefund>().AnyAsync(x => x.PaymentId == paymentId && x.UnallocatedCapture && x.Applied, ct)) state = "Refunded";
        return new(payment, state);
    }

    private async Task<Dictionary<Guid, decimal>> VerifiedReleaseReversalsAsync(CancellationToken ct)
    {
        var rows = await (
            from refund in db.Refunds.AsNoTracking()
            join payment in db.Payments.AsNoTracking() on refund.PaymentId equals payment.Id
            from reversal in db.LedgerEntries.AsNoTracking()
            from release in db.LedgerEntries.AsNoTracking()
            where payment.Status == PaymentStatus.Refunded && refund.Amount == payment.Amount
                && reversal.ReferenceType == "Refund" && reversal.ReferenceId == refund.Id.ToString()
                && (reversal.BusinessKey == "refund:" + refund.Id + ":teacher-reversal"
                    || reversal.BusinessKey == "refund:" + refund.Id + ":platform-reversal")
                && release.ReferenceId == (payment.OrderId ?? payment.LiveSessionBookingId).ToString()
                && (release.BusinessKey == (payment.OrderId != null ? "order:" : "live-session:") + release.ReferenceId + ":teacher-release"
                    || release.BusinessKey == (payment.OrderId != null ? "order:" : "live-session:") + release.ReferenceId + ":platform-release")
                && release.CreditAccountId == reversal.DebitAccountId && release.Amount == reversal.Amount
                && release.Currency == payment.Currency && reversal.Currency == payment.Currency
                && db.LedgerAccounts.Any(a => a.Id == reversal.CreditAccountId && a.Kind == LedgerAccountKind.RefundClearing)
            select new { refund.PaymentId, refund.Amount, Reversed = reversal.Amount }).ToArrayAsync(ct);
        return rows.GroupBy(x => x.PaymentId).Where(g => g.Sum(x => x.Reversed) == g.First().Amount)
            .ToDictionary(g => g.Key, g => g.First().Amount);
    }

    private static RefundDto Map(ProviderRefund operation, Payment payment) => new(operation.Id, payment.Id,
        payment.OrderId, payment.LiveSessionBookingId, operation.Amount, operation.Currency, operation.CreatedAt,
        operation.Status.ToString(), operation.FailureCode);
}
