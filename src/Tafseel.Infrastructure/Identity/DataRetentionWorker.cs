using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Tafseel.Domain.Messaging;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Identity;

internal sealed class DataRetentionService(
    TafseelDbContext db, TimeProvider clock, IOptions<PrivacyOptions> options)
{
    internal async Task<int> PurgeExpiredAsync(CancellationToken ct)
    {
        var settings = options.Value;
        var now = clock.GetUtcNow();
        var notificationCutoff = now.AddDays(-settings.ReadNotificationDays);
        var authenticationCutoff = now.AddDays(-settings.AuthenticationRecordDays);
        var analyticsCutoff = now.AddDays(-settings.MarketplaceAnalyticsDays);

        Guid[] notificationIds;
        long[] tokenIds;
        Guid[] analyticsIds;
        if (db.Database.ProviderName?.Contains("Sqlite", StringComparison.OrdinalIgnoreCase) == true)
        {
            notificationIds = (await db.Notifications.AsNoTracking()
                    .Where(x => x.ReadAt != null).Select(x => new { x.Id, x.ReadAt }).ToArrayAsync(ct))
                .Where(x => x.ReadAt < notificationCutoff).OrderBy(x => x.ReadAt)
                .Take(settings.BatchSize).Select(x => x.Id).ToArray();
            tokenIds = (await db.RefreshTokens.AsNoTracking()
                    .Select(x => new { x.Id, x.ExpiresAt }).ToArrayAsync(ct))
                .Where(x => x.ExpiresAt < authenticationCutoff).OrderBy(x => x.ExpiresAt)
                .Take(settings.BatchSize).Select(x => x.Id).ToArray();
            analyticsIds = (await db.MarketplaceInteractionEvents.AsNoTracking()
                    .Select(x => new { x.Id, x.OccurredAtUtc }).ToArrayAsync(ct))
                .Where(x => x.OccurredAtUtc < analyticsCutoff).OrderBy(x => x.OccurredAtUtc)
                .Take(settings.BatchSize).Select(x => x.Id).ToArray();
        }
        else
        {
            notificationIds = await db.Notifications.AsNoTracking()
                .Where(x => x.ReadAt != null && x.ReadAt < notificationCutoff)
                .OrderBy(x => x.ReadAt).Take(settings.BatchSize)
                .Select(x => x.Id).ToArrayAsync(ct);
            tokenIds = await db.RefreshTokens.AsNoTracking()
                .Where(x => x.ExpiresAt < authenticationCutoff)
                .OrderBy(x => x.ExpiresAt).Take(settings.BatchSize)
                .Select(x => x.Id).ToArrayAsync(ct);
            analyticsIds = await db.MarketplaceInteractionEvents.AsNoTracking()
                .Where(x => x.OccurredAtUtc < analyticsCutoff)
                .OrderBy(x => x.OccurredAtUtc).Take(settings.BatchSize)
                .Select(x => x.Id).ToArrayAsync(ct);
        }

        var deleted = 0;
        if (notificationIds.Length > 0)
        {
            deleted += await db.NotificationOutbox
                .Where(x => notificationIds.Contains(x.NotificationId)).ExecuteDeleteAsync(ct);
            deleted += await db.Notifications
                .Where(x => notificationIds.Contains(x.Id)).ExecuteDeleteAsync(ct);
        }

        if (tokenIds.Length > 0)
            deleted += await db.RefreshTokens.Where(x => tokenIds.Contains(x.Id)).ExecuteDeleteAsync(ct);

        if (analyticsIds.Length > 0)
            deleted += await db.MarketplaceInteractionEvents
                .Where(x => analyticsIds.Contains(x.Id)).ExecuteDeleteAsync(ct);
        return deleted;
    }
}

internal sealed class DataRetentionWorker(
    IServiceScopeFactory scopes, TimeProvider clock, ILogger<DataRetentionWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(24), clock);
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var deleted = await scope.ServiceProvider.GetRequiredService<DataRetentionService>()
                    .PurgeExpiredAsync(stoppingToken);
                if (deleted > 0)
                    logger.LogInformation("Privacy retention removed {RecordCount} expired operational records", deleted);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogWarning(exception, "Privacy retention scan failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
