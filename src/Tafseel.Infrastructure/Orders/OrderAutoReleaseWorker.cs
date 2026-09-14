using Tafseel.Application.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Tafseel.Application.Finance;
using Tafseel.Application.Governance;
using Tafseel.Domain.Governance;
using Tafseel.Domain.Orders;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Orders;

internal sealed class OrderAutoReleaseWorker(
    IServiceScopeFactory scopes,
    TimeProvider clock,
    IOptions<PaymentOptions> options,
    IOptions<DisputeOptions> disputeOptions,
    ILogger<OrderAutoReleaseWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.AutoReleaseEnabled) return;
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5), clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await ReleaseDueOrdersAsync(stoppingToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogWarning(exception, "Order automatic escrow release scan failed");
            }
        }
    }

    internal async Task ReleaseDueOrdersAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var finance = scope.ServiceProvider.GetRequiredService<IFinancialService>();
        var notifications = scope.ServiceProvider.GetRequiredService<NotificationWriter>();
        var reviewHours = Math.Max(options.Value.AutoReleaseAfterHours, disputeOptions.Value.WindowDays * 24);
        var cutoff = clock.GetUtcNow().AddHours(-reviewHours);
        var ids = await db.Orders.AsNoTracking()
            .Where(x => x.Status == OrderStatus.Delivered)
            .Where(x => db.Set<OrderStatusHistory>()
                .Where(h => h.OrderId == x.Id && h.NextStatus == OrderStatus.Delivered)
                .Max(h => (DateTimeOffset?)h.CreatedAt) <= cutoff)
            .Where(x => !db.Disputes.Any(d => d.OrderId == x.Id && d.Status != DisputeStatus.Resolved))
            .OrderBy(x => x.UpdatedAt).ThenBy(x => x.Id)
            .Select(x => x.Id).Take(100).ToArrayAsync(ct);

        foreach (var id in ids)
        {
            try
            {
                var order = await db.Orders.SingleAsync(x => x.Id == id, ct);
                if (order.Status != OrderStatus.Delivered) continue;
                order.CompleteAutomatically(clock.GetUtcNow());
                await finance.ReleaseOrderEscrowAsync(order, "system:auto-release", ct);
                await notifications.QueueAsync(order.StudentId, "OrderAutoCompleted", "Order completed",
                    "The review window ended without a revision or dispute.", AppRoutes.Order(order.Id),
                    $"order:{order.Id}:auto-completed:student", true, ct);
                await notifications.QueueAsync(order.TeacherId, "OrderAutoCompleted", "Payment released",
                    "The review window ended and your payment was released.", AppRoutes.Order(order.Id),
                    $"order:{order.Id}:auto-completed:teacher", true, ct);
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException exception)
            {
                logger.LogInformation(exception, "Order {OrderId} changed during automatic release", id);
                db.ChangeTracker.Clear();
            }
        }
    }
}
