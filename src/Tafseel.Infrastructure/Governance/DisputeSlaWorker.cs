using Tafseel.Application.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Tafseel.Application.Authorization;
using Tafseel.Application.Governance;
using Tafseel.Domain.Governance;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Governance;

internal sealed class DisputeSlaWorker(
    IServiceScopeFactory scopes,
    TimeProvider clock,
    IOptions<DisputeOptions> options,
    ILogger<DisputeSlaWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(15), clock);
        do
        {
            try { await EscalateOverdueAsync(stoppingToken); }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogWarning(exception, "Dispute SLA escalation scan failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    internal async Task EscalateOverdueAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var notifications = scope.ServiceProvider.GetRequiredService<NotificationWriter>();
        var now = clock.GetUtcNow();
        var openCutoff = now.AddHours(-options.Value.InitialResponseHours);
        var reviewCutoff = now.AddHours(-options.Value.ResolutionHours);

        var overdue = await db.Disputes.AsNoTracking()
            .Where(x => x.Status == DisputeStatus.Open && x.CreatedAt <= openCutoff
                || x.Status == DisputeStatus.UnderReview && db.Set<DisputeStatusHistory>()
                    .Where(h => h.DisputeId == x.Id && h.NextStatus == DisputeStatus.UnderReview)
                    .Max(h => (DateTimeOffset?)h.CreatedAt) <= reviewCutoff)
            .OrderBy(x => x.CreatedAt).Take(100)
            .Select(x => new { x.Id, x.Status, x.StudentId, x.TeacherId }).ToArrayAsync(ct);
        if (overdue.Length == 0) return;

        var adminIds = await (
            from membership in db.UserRoles.AsNoTracking()
            join role in db.Roles.AsNoTracking() on membership.RoleId equals role.Id
            join user in db.Users.AsNoTracking() on membership.UserId equals user.Id
            where role.Name == Roles.Admin && !user.IsSuspended
            select user.Id).ToArrayAsync(ct);

        foreach (var dispute in overdue)
        {
            foreach (var adminId in adminIds)
                await notifications.QueueAsync(adminId, "DisputeSla", "Overdue dispute requires action",
                    $"Case {dispute.Id:N} exceeded its response target.", AppRoutes.Dispute(dispute.Id),
                    $"dispute:{dispute.Id}:sla:{dispute.Status}:admin:{adminId}", true, ct);
            if (dispute.Status == DisputeStatus.UnderReview)
                foreach (var participantId in new[] { dispute.StudentId, dispute.TeacherId })
                    await notifications.QueueAsync(participantId, "DisputeSla", "Dispute review is taking longer than expected",
                        "The case remains protected and has been escalated to the operations team.",
                        AppRoutes.Dispute(dispute.Id),
                        $"dispute:{dispute.Id}:sla:{dispute.Status}:participant:{participantId}", true, ct);
        }
        await db.SaveChangesAsync(ct);
    }
}
