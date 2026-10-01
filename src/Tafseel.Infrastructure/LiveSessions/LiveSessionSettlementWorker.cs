using Tafseel.Application.Common;
using Microsoft.EntityFrameworkCore;
using System.Data;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Tafseel.Application.Finance;
using Tafseel.Application.LiveSessions;
using Tafseel.Domain.Governance;
using Tafseel.Domain.LiveSessions;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Operations;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.LiveSessions;

internal sealed class LiveSessionSettlementWorker(
    IServiceScopeFactory scopes,
    TimeProvider clock,
    IOptions<LiveSessionOptions> options,
    WorkerHeartbeats heartbeats,
    ILogger<LiveSessionSettlementWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(5);
        heartbeats.Register("live-session-settlement", interval);
        using var timer = new PeriodicTimer(interval, clock);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await SettleDueSessionsAsync(stoppingToken);
                heartbeats.Succeeded("live-session-settlement");
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                heartbeats.Failed("live-session-settlement");
                logger.LogWarning(exception, "Live-session settlement scan failed");
            }
        }
    }

    internal async Task SettleDueSessionsAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var finance = scope.ServiceProvider.GetRequiredService<IFinancialService>();
        var notifications = scope.ServiceProvider.GetRequiredService<NotificationWriter>();
        var now = clock.GetUtcNow();
        var cutoff = now.AddHours(-options.Value.SettlementReviewHours);
        var reminderCutoff = now.AddMinutes(-options.Value.NoShowGraceMinutes);
        var ids = await db.LiveSessionBookings.AsNoTracking()
            .Where(x => (x.Status == LiveSessionStatus.Confirmed && x.EndsAt <= reminderCutoff)
                || ((x.Status == LiveSessionStatus.CompletionPending
                    || x.Status == LiveSessionStatus.StudentNoShowPending
                    || x.Status == LiveSessionStatus.TeacherNoShowPending)
                    && x.UpdatedAt <= cutoff))
            .Where(x => !db.Disputes.Any(d => d.LiveSessionBookingId == x.Id
                && d.Status != DisputeStatus.Resolved))
            .OrderBy(x => x.UpdatedAt).ThenBy(x => x.Id)
            .Select(x => x.Id).Take(100).ToArrayAsync(ct);

        foreach (var id in ids)
        {
            try
            {
                await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
                await db.Database.AcquireAsync("dispute-session:" + id, ct);
                await db.Database.AcquireAsync("session-settlement:" + id, ct);
                var booking = await db.LiveSessionBookings.SingleAsync(x => x.Id == id, ct);
                if (await db.Disputes.AnyAsync(d => d.LiveSessionBookingId == id
                        && d.Status != DisputeStatus.Resolved, ct))
                {
                    await tx.CommitAsync(ct);
                    continue;
                }
                if (booking.Status == LiveSessionStatus.Confirmed)
                {
                    var deadline = options.Value.PassiveOutcomeDeadline(booking.EndsAt);
                    var body = $"The lesson has ended and Tafseel has not received an outcome. "
                        + $"The Teacher can confirm completion or report Student no-show; the Student can report Teacher no-show or open a dispute. "
                        + $"Funds will not be released merely because both parties are silent. Please act before {deadline:O}.";
                    await notifications.QueueAsync(booking.StudentId, "SessionOutcomeRequired",
                        "Live session outcome required", body, AppRoutes.LiveSession(booking.Id),
                        $"session:{booking.Id}:passive-outcome-reminder:student", true, ct);
                    await notifications.QueueAsync(booking.TeacherId, "SessionOutcomeRequired",
                        "Live session outcome required", body, AppRoutes.LiveSession(booking.Id),
                        $"session:{booking.Id}:passive-outcome-reminder:teacher", true, ct);
                    if (now >= deadline)
                    {
                        var adminIds = await (
                            from membership in db.UserRoles.AsNoTracking()
                            join role in db.Roles.AsNoTracking() on membership.RoleId equals role.Id
                            join user in db.Users.AsNoTracking() on membership.UserId equals user.Id
                            where role.Name == Application.Authorization.Roles.Admin && !user.IsSuspended
                            select user.Id).ToArrayAsync(ct);
                        foreach (var adminId in adminIds)
                            await notifications.QueueAsync(adminId, "SessionOutcomeAdminReview",
                                "Live session outcome requires review",
                                $"Neither participant reported an outcome for {booking.Title}. Escrow remains held.",
                                AppRoutes.AdminSessions,
                                $"session:{booking.Id}:passive-outcome-admin:{adminId}", true, ct);
                    }
                    await db.SaveChangesAsync(ct);
                    await tx.CommitAsync(ct);
                    continue;
                }
                if (booking.UpdatedAt > cutoff)
                {
                    await tx.CommitAsync(ct);
                    continue;
                }
                booking.FinalizeSettlement(clock.GetUtcNow());
                if (booking.Status is LiveSessionStatus.Completed or LiveSessionStatus.StudentNoShow)
                    await finance.ReleaseLiveSessionEscrowAsync(booking, "system:settlement", ct);
                else
                    await finance.RefundLiveSessionEscrowAsync(booking, booking.StudentId,
                        $"session:{booking.Id}:auto-teacher-no-show-refund", ct);
                foreach (var recipient in new[] { booking.StudentId, booking.TeacherId })
                    await notifications.QueueAsync(recipient, "SessionSettlementFinalized",
                        "Live session settlement finalized", booking.Title,
                        AppRoutes.LiveSession(booking.Id),
                        $"session:{booking.Id}:settlement-finalized:{recipient}", true, ct);
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
            }
            catch (DbUpdateException exception)
            {
                logger.LogInformation(exception, "Live session {BookingId} changed during settlement", id);
                db.ChangeTracker.Clear();
            }
        }
    }
}
