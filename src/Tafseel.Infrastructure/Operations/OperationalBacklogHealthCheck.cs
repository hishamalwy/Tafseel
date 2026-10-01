using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Messaging;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Operations;

/// <summary>
/// Work that has stopped reaching people: an email that gave up after its retries, emails the outbox has not
/// picked up, and money the ledger cannot explain. None of these fail a request, so nothing else would show them.
/// <para>
/// Degraded, never Unhealthy, for the same reason as <see cref="WorkerHealthCheck"/>: each needs an operator, and
/// taking the only instance out of rotation would not help. The result carries counts only, no addresses or ids.
/// </para>
/// </summary>
public sealed class OperationalBacklogHealthCheck(TafseelDbContext db, TimeProvider clock) : IHealthCheck
{
    /// <summary>The outbox polls every 10 s and retries at most 30 min out; past this, nothing is sending.</summary>
    internal static readonly TimeSpan OutboxOverdue = TimeSpan.FromMinutes(15);

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var now = clock.GetUtcNow();
        var overdueBefore = now - OutboxOverdue;
        var failedSince = now.AddHours(-24);
        int overdueEmails, failedEmails;
        if (db.Database.IsSqlServer())
        {
            overdueEmails = await db.NotificationOutbox.AsNoTracking().CountAsync(x =>
                (x.Status == OutboxStatus.Pending || x.Status == OutboxStatus.Processing)
                && x.NextAttemptAt < overdueBefore, cancellationToken);
            failedEmails = await db.NotificationOutbox.AsNoTracking().CountAsync(x =>
                x.Status == OutboxStatus.Failed && x.CreatedAt >= failedSince, cancellationToken);
        }
        else
        {
            // SQLite (test hosts) cannot compare DateTimeOffset columns in SQL.
            var outbox = await db.NotificationOutbox.AsNoTracking()
                .Where(x => x.Status != OutboxStatus.Sent)
                .Select(x => new { x.Status, x.NextAttemptAt, x.CreatedAt })
                .ToListAsync(cancellationToken);
            overdueEmails = outbox.Count(x => x.Status != OutboxStatus.Failed && x.NextAttemptAt < overdueBefore);
            failedEmails = outbox.Count(x => x.Status == OutboxStatus.Failed && x.CreatedAt >= failedSince);
        }
        var openReconciliation = await db.ReconciliationExceptions.AsNoTracking().CountAsync(x =>
            x.Status == ReconciliationExceptionStatus.Open, cancellationToken);

        var data = new Dictionary<string, object>
        {
            ["overdueEmails"] = overdueEmails,
            ["failedEmailsLast24h"] = failedEmails,
            ["openReconciliationCases"] = openReconciliation
        };
        var issues = new List<string>();
        if (overdueEmails > 0) issues.Add($"{overdueEmails} emails overdue");
        if (failedEmails > 0) issues.Add($"{failedEmails} emails failed in the last 24 h");
        if (openReconciliation > 0) issues.Add($"{openReconciliation} open reconciliation cases");
        return issues.Count == 0
            ? HealthCheckResult.Healthy("No operational backlog.", data)
            : HealthCheckResult.Degraded(string.Join("; ", issues) + ".", data: data);
    }
}
