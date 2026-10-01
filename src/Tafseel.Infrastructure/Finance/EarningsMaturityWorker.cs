using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Tafseel.Application.Finance;
using Tafseel.Infrastructure.Operations;

namespace Tafseel.Infrastructure.Finance;

/// <summary>
/// Promotes teacher earnings out of clearance once their dispute-refund exposure has ended (FR-2).
/// <para>
/// The timer only decides <i>when to look</i>; it is never the source of truth. Due-ness is recomputed
/// from persisted <c>MaturesAt</c> values on every pass, each promotion runs in its own Serializable
/// transaction under an application lock, and the promotion ledger entry carries a stable unique
/// BusinessKey — so restarting, replaying or running several instances cannot move money twice.
/// </para>
/// </summary>
internal sealed class EarningsMaturityWorker(
    IServiceScopeFactory scopes,
    TimeProvider clock,
    IOptions<WithdrawalOptions> options,
    WorkerHeartbeats heartbeats,
    ILogger<EarningsMaturityWorker> logger) : BackgroundService
{
    private readonly int _batchSize = Math.Clamp(options.Value.MaturityBatchSize, 1, 500);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(5);
        heartbeats.Register("earnings-maturity", interval);
        using var timer = new PeriodicTimer(interval, clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await MatureDueEarningsAsync(stoppingToken);
                heartbeats.Succeeded("earnings-maturity");
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                heartbeats.Failed("earnings-maturity");
                logger.LogWarning(exception, "Teacher earnings maturity scan failed");
            }
        }
    }

    internal async Task<int> MatureDueEarningsAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var finance = scope.ServiceProvider.GetRequiredService<IFinancialService>();
        var due = await finance.GetDueEarningMaturityIdsAsync(_batchSize, ct);
        var matured = 0;
        foreach (var id in due)
        {
            try
            {
                if (await finance.MatureTeacherEarningAsync(id, ct)) matured++;
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // One contended or blocked earning must not stop the batch; the next pass retries it.
                logger.LogInformation(exception, "Earning {MaturityId} could not mature on this pass", id);
            }
        }
        return matured;
    }
}
