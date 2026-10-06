using System.Data;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Tafseel.Application.Finance;
using Tafseel.Domain.Finance;
using Tafseel.Infrastructure.Operations;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Finance;

internal sealed class PaymobRecoveryWorker(
    IServiceScopeFactory scopes, TimeProvider clock, WorkerHeartbeats heartbeats,
    ILogger<PaymobRecoveryWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(15);
        heartbeats.Register("paymob-payments", interval);
        using var timer = new PeriodicTimer(interval, clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try { await RecoverAsync(stoppingToken); heartbeats.Succeeded("paymob-payments"); }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                heartbeats.Failed("paymob-payments");
                // Exceptions can contain HTTP context. Log only the type and a stable operation name.
                logger.LogWarning("Paymob recovery scan failed ({ErrorType})", error.GetType().Name);
            }
        }
    }

    internal async Task RecoverAsync(CancellationToken ct)
    {
        await using var listing = scopes.CreateAsyncScope();
        var db = listing.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var cutoff = clock.GetUtcNow().AddMinutes(-2);
        var refunds = await db.Set<ProviderRefund>().AsNoTracking()
            .Where(x => !x.Applied && x.Status != ProviderRefundStatus.Rejected
                && (x.Status == ProviderRefundStatus.Requested || x.LastCheckedAt == null || x.LastCheckedAt < cutoff))
            .OrderBy(x => x.CreatedAt).Select(x => x.Id).Take(50).ToArrayAsync(ct);
        foreach (var id in refunds)
        {
            await using var scope = scopes.CreateAsyncScope();
            try { await ((FinancialService)scope.ServiceProvider.GetRequiredService<IFinancialService>()).ProcessProviderRefundAsync(id, ct); }
            catch (Exception error) when (error is not OperationCanceledException)
            { logger.LogWarning("Paymob refund {RefundId} needs another recovery pass ({ErrorType})", id, error.GetType().Name); }
        }
        var payments = await db.Set<ProviderCheckout>().AsNoTracking()
            .Where(x => x.Status != CheckoutDispatchStatus.Reserved && x.Status != CheckoutDispatchStatus.Rejected
                && (x.LastCheckedAt == null || x.LastCheckedAt < cutoff))
            .Join(db.Payments.Where(x => x.Provider == "Paymob" && x.Status != PaymentStatus.Refunded),
                x => x.PaymentId, x => x.Id, (checkout, payment) => checkout)
            .OrderBy(x => x.LastCheckedAt).Select(x => x.PaymentId).Take(50).ToArrayAsync(ct);
        foreach (var id in payments)
        {
            await using var scope = scopes.CreateAsyncScope();
            try { await ((FinancialService)scope.ServiceProvider.GetRequiredService<IFinancialService>()).RecoverProviderPaymentAsync(id, ct); }
            catch (Exception error) when (error is not OperationCanceledException)
            { logger.LogWarning("Paymob payment {PaymentId} needs another inquiry ({ErrorType})", id, error.GetType().Name); }
        }
    }
}

internal sealed partial class FinancialService
{
    internal async Task RecoverProviderPaymentAsync(Guid paymentId, CancellationToken ct)
    {
        ProviderCheckout checkout;
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            await LockAsync($"provider-checkout:{paymentId}", ct);
            checkout = await db.Set<ProviderCheckout>().SingleAsync(x => x.PaymentId == paymentId, ct);
            checkout.LastCheckedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        var evidence = await provider.InquireAsync(checkout.Reference, ct, checkout.TransactionId);
        if (evidence is null || evidence.Kind == ProviderEventKind.Ignore) return;
        if (evidence.ProviderReference != checkout.Reference || checkout.OrderId != null && evidence.OrderId != checkout.OrderId
            || checkout.TransactionId != null && evidence.TransactionId != checkout.TransactionId)
            throw new Tafseel.Domain.Common.DomainException("payment_provider_unknown", "The provider inquiry does not match this payment.");
        // Store a hash of the normalized evidence, never provider billing/card response data.
        var hash = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(evidence)));
        await ProcessVerifiedEventAsync(evidence, hash, trustedInquiry: true, ct);
    }
}
