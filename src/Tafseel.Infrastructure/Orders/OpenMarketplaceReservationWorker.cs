using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Tafseel.Infrastructure.Orders;

internal sealed class OpenMarketplaceReservationWorker(
    IServiceScopeFactory scopes, TimeProvider clock,
    Microsoft.Extensions.Logging.ILogger<OpenMarketplaceReservationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1), clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<OpenMarketplaceReservationExpiryService>()
                    .RunAsync(stoppingToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogWarning(exception, "Open Marketplace reservation expiry scan failed");
            }
        }
    }
}
