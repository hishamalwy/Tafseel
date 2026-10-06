using System.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Finance;
using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Finance;

internal sealed class PaymentCheckoutService(
    TafseelDbContext db, IPaymentProvider provider, IDataProtectionProvider protection, TimeProvider clock)
{
    internal ProviderCheckout Reserve(Payment payment, DateTimeOffset now)
    {
        var attempt = new PaymentAttempt(payment.Id, payment.ProviderReference, PaymentAttemptStatus.Created, null, now);
        var checkout = new ProviderCheckout { Id = attempt.Id, PaymentId = payment.Id, Reference = payment.ProviderReference, CreatedAt = now };
        db.AddRange(attempt, checkout);
        return checkout;
    }

    internal async Task<PaymentInitiationDto> ResumeAsync(Payment payment, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is not null)
            throw new InvalidOperationException("Provider HTTP must run outside a SQL transaction.");
        if (payment.Provider != provider.Name) throw new DomainException("payment_provider_mismatch", "This payment uses another provider.");
        ProviderCheckout checkout;
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            await db.Database.AcquireAsync($"provider-checkout:{payment.Id}", ct);
            checkout = await db.Set<ProviderCheckout>().SingleAsync(x => x.PaymentId == payment.Id, ct);
            await db.Entry(checkout).ReloadAsync(ct);
            await db.Entry(payment).ReloadAsync(ct);
            if (payment.Status is PaymentStatus.Confirmed or PaymentStatus.Refunded)
                return new(Map(payment), $"/checkout/result?paymentId={payment.Id}");
            if (checkout.Status == CheckoutDispatchStatus.Ready && checkout.ProtectedCheckout is not null)
                return new(Map(payment), Protector(payment.Id).Unprotect(checkout.ProtectedCheckout));
            if (checkout.Status is CheckoutDispatchStatus.Sending or CheckoutDispatchStatus.Unknown)
                throw new DomainException("payment_provider_unknown", "The payment provider outcome is unknown. Check payment status before retrying.");
            if (checkout.Status == CheckoutDispatchStatus.Rejected)
                throw new DomainException("payment_provider_rejected", "The payment provider rejected this checkout.");
            checkout.Status = CheckoutDispatchStatus.Sending;
            checkout.LastCheckedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        // No automatic POST retry: Paymob documents special_reference as correlation, not an idempotency guarantee.
        try
        {
            var user = await db.Users.AsNoTracking().SingleAsync(x => x.Id == payment.StudentId, ct);
            var payableId = payment.OrderId ?? payment.LiveSessionBookingId ?? payment.LearningRequestId!.Value;
            var result = await provider.InitiateAsync(new(payment.Id, payableId, checkout.Reference, payment.Amount, payment.Currency,
                "Tafseel " + payableId.ToString("N"), user.FullName, user.Email ?? "", user.PhoneNumber ?? ""), ct);
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, CancellationToken.None);
            await db.Database.AcquireAsync($"provider-checkout:{payment.Id}", CancellationToken.None);
            await db.Entry(checkout).ReloadAsync(CancellationToken.None);
            if (checkout.OrderId is not null && result.OrderId != checkout.OrderId)
                throw new DomainException("payment_provider_unknown", "The payment provider reference does not match this attempt.");
            checkout.IntentionId = result.IntentionId;
            checkout.OrderId = result.OrderId;
            checkout.ProtectedCheckout = Protector(payment.Id).Protect(result.CheckoutReference);
            checkout.Status = CheckoutDispatchStatus.Ready;
            await db.SaveChangesAsync(CancellationToken.None);
            await tx.CommitAsync(CancellationToken.None);
            return new(Map(payment), result.CheckoutReference);
        }
        catch (Exception error) when (error is HttpRequestException or OperationCanceledException or DomainException or System.Text.Json.JsonException or InvalidOperationException)
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, CancellationToken.None);
            await db.Database.AcquireAsync($"provider-checkout:{payment.Id}", CancellationToken.None);
            await db.Entry(checkout).ReloadAsync(CancellationToken.None);
            checkout.FailureCode = error is DomainException domain ? domain.Code : "payment_provider_unknown";
            checkout.Status = checkout.FailureCode == "payment_provider_rejected" ? CheckoutDispatchStatus.Rejected : CheckoutDispatchStatus.Unknown;
            if (checkout.Status == CheckoutDispatchStatus.Rejected)
                db.Add(new PaymentAttempt(payment.Id, checkout.Reference, PaymentAttemptStatus.Failed, checkout.FailureCode, clock.GetUtcNow()));
            await db.SaveChangesAsync(CancellationToken.None);
            await tx.CommitAsync(CancellationToken.None);
            throw new DomainException(checkout.FailureCode, "The payment provider could not complete this request. Check payment status before retrying.");
        }
    }

    private IDataProtector Protector(Guid id) => protection.CreateProtector("Paymob.Checkout", id.ToString());
    private static PaymentDto Map(Payment payment) => new(payment.Id, payment.OrderId, payment.LiveSessionBookingId,
        payment.LearningRequestId, payment.Amount, payment.Currency, payment.Provider, payment.ProviderReference, payment.Status, payment.CreatedAt);
}
