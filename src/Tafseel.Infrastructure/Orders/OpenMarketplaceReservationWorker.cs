using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Tafseel.Infrastructure.Operations;

namespace Tafseel.Infrastructure.Orders;

internal sealed class OpenMarketplaceReservationWorker(
    IServiceScopeFactory scopes, TimeProvider clock, WorkerHeartbeats heartbeats,
    Microsoft.Extensions.Logging.ILogger<OpenMarketplaceReservationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(1);
        heartbeats.Register("reservation-expiry", interval);
        using var timer = new PeriodicTimer(interval, clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<OpenMarketplaceReservationExpiryService>()
                    .RunAsync(stoppingToken);
                heartbeats.Succeeded("reservation-expiry");
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                heartbeats.Failed("reservation-expiry");
                logger.LogWarning(exception, "Open Marketplace reservation expiry scan failed");
            }
        }
    }
}
