using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Finance;
using Tafseel.Domain.Finance;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Finance;

/// <summary>
/// The teacher's earnings statement. Read-only: every amount is one the money paths already recorded — the
/// ledger's <c>:teacher-release</c> credit, the commission terms snapshotted on the purchase, the maturity
/// schedule, refunds, and withdrawals Finance marked transferred. Balances come from
/// <see cref="IFinancialService.GetBalancesAsync"/>, so this statement and the balance cards cannot disagree.
/// </summary>
internal sealed class TeacherEarningsService(TafseelDbContext db, IFinancialService finance) : ITeacherEarningsService
{
    private const string ReleaseSuffix = ":teacher-release";

    public async Task<TeacherEarningsDto> GetAsync(string teacherId, int take, CancellationToken ct)
    {
        take = Math.Clamp(take, 1, 100);
        var accounts = db.LedgerAccounts.Where(a => a.OwnerId == teacherId
            && (a.Kind == LedgerAccountKind.TeacherAvailable || a.Kind == LedgerAccountKind.TeacherPending))
            .Select(a => a.Id);
        var releases = await db.LedgerEntries.AsNoTracking()
            .Where(e => accounts.Contains(e.CreditAccountId) && e.BusinessKey.EndsWith(ReleaseSuffix)
                && (e.ReferenceType == "Order" || e.ReferenceType == "LiveSession"))
            .OrderByDescending(e => e.CreatedAt).ThenBy(e => e.Id)
            .Select(e => new { e.ReferenceType, e.ReferenceId, e.Amount, e.Currency, e.CreatedAt })
            .ToArrayAsync(ct);

        var parsed = releases.Select(r => (Release: r, Id: Guid.TryParse(r.ReferenceId, out var id) ? id : Guid.Empty))
            .Where(x => x.Id != Guid.Empty).ToArray();
        var orderIds = parsed.Where(x => x.Release.ReferenceType == "Order").Select(x => x.Id).ToArray();
        var sessionIds = parsed.Where(x => x.Release.ReferenceType == "LiveSession").Select(x => x.Id).ToArray();

        var orders = await db.Orders.AsNoTracking()
            .Where(o => orderIds.Contains(o.Id) && o.TeacherId == teacherId)
            .Select(o => new
            {
                o.Id,
                o.Price,
                o.TeacherCommissionPercent,
                o.TeacherCommissionAmount,
                Title = db.LearningRequests.Where(r => r.Id == o.LearningRequestId).Select(r => r.Title).FirstOrDefault()
            })
            .ToDictionaryAsync(o => o.Id, ct);
        var sessions = await db.LiveSessionBookings.AsNoTracking()
            .Where(s => sessionIds.Contains(s.Id) && s.TeacherId == teacherId)
            .Select(s => new { s.Id, Price = s.TotalPrice, s.TeacherCommissionPercent, s.TeacherCommissionAmount, s.Title })
            .ToDictionaryAsync(s => s.Id, ct);
        var refundedOrders = (await db.Refunds.AsNoTracking()
            .Where(r => r.OrderId != null && orderIds.Contains(r.OrderId.Value))
            .Select(r => r.OrderId!.Value).ToArrayAsync(ct)).ToHashSet();
        var refundedSessions = (await db.Refunds.AsNoTracking()
            .Where(r => r.LiveSessionBookingId != null && sessionIds.Contains(r.LiveSessionBookingId.Value))
            .Select(r => r.LiveSessionBookingId!.Value).ToArrayAsync(ct)).ToHashSet();
        var clearing = await db.TeacherEarningMaturities.AsNoTracking()
            .Where(m => m.TeacherId == teacherId && m.Status == TeacherEarningMaturityStatus.Pending)
            .Select(m => new { m.OrderId, m.LiveSessionBookingId, m.MaturesAt })
            .ToArrayAsync(ct);

        var items = new List<TeacherEarningDto>(parsed.Length);
        foreach (var (release, id) in parsed)
        {
            var isOrder = release.ReferenceType == "Order";
            decimal price, percent, commission;
            string? title;
            if (isOrder && orders.TryGetValue(id, out var order))
                (price, percent, commission, title) = (order.Price, order.TeacherCommissionPercent, order.TeacherCommissionAmount, order.Title);
            else if (!isOrder && sessions.TryGetValue(id, out var session))
                (price, percent, commission, title) = (session.Price, session.TeacherCommissionPercent, session.TeacherCommissionAmount, session.Title);
            else
                continue;

            var refunded = isOrder ? refundedOrders.Contains(id) : refundedSessions.Contains(id);
            var maturesAt = clearing.FirstOrDefault(m => isOrder ? m.OrderId == id : m.LiveSessionBookingId == id)?.MaturesAt;
            var state = refunded ? "refunded" : maturesAt is not null ? "clearing" : "available";
            items.Add(new(isOrder ? "order" : "live_session", id, title, release.CreatedAt,
                price, percent, commission, release.Amount - (price - commission), release.Amount,
                release.Currency, state, state == "clearing" ? maturesAt : null));
        }

        var transferred = await db.WithdrawalRequests.AsNoTracking()
            .Where(w => w.TeacherId == teacherId && w.Status == WithdrawalStatus.Completed)
            .GroupBy(w => w.Currency)
            .Select(g => new { Currency = g.Key, Amount = g.Sum(w => w.Amount), Count = g.Count() })
            .ToArrayAsync(ct);
        var balances = await finance.GetBalancesAsync(teacherId, ct);

        var currencies = balances.Select(b => b.Currency)
            .Concat(items.Select(i => i.Currency)).Concat(transferred.Select(t => t.Currency))
            .Distinct().OrderBy(c => c, StringComparer.Ordinal);
        var totals = currencies.Select(currency =>
        {
            var balance = balances.FirstOrDefault(b => b.Currency == currency);
            var sent = transferred.FirstOrDefault(t => t.Currency == currency);
            var earned = items.Where(i => i.Currency == currency && i.State != "refunded").Sum(i => i.Net);
            var available = balance?.Available ?? 0;
            var clearingTotal = balance?.PendingClearance ?? 0;
            var inTransfer = balance?.PendingWithdrawal ?? 0;
            var transferredTotal = sent?.Amount ?? 0;
            return new TeacherEarningsTotalsDto(currency, earned, available, clearingTotal, inTransfer,
                transferredTotal, sent?.Count ?? 0,
                earned == available + clearingTotal + inTransfer + transferredTotal);
        }).ToArray();

        return new(totals, items.Take(take).ToArray(), items.Count);
    }
}
