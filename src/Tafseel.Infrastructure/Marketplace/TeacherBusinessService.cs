using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Tafseel.Application.TeacherBusiness;
using Tafseel.Domain.Finance;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Messaging;
using Tafseel.Domain.Orders;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Marketplace;

internal sealed class TeacherBusinessService(TafseelDbContext db, TimeProvider clock) : ITeacherBusinessService
{
    public async Task<TeacherHomeSummaryDto> GetHomeSummaryAsync(string teacherId, CancellationToken ct)
    {
        var linkedRequestIds = db.Orders.AsNoTracking().Where(x => x.TeacherId == teacherId)
            .Select(x => x.LearningRequestId);
        var directRequests = await db.LearningRequests.AsNoTracking().CountAsync(x =>
            x.TeacherId == teacherId && x.Status == LearningRequestStatus.PendingTeacherReview
            && !linkedRequestIds.Contains(x.Id), ct);
        var activeOrders = await db.Orders.AsNoTracking().CountAsync(x => x.TeacherId == teacherId
            && x.Status != OrderStatus.Completed && x.Status != OrderStatus.Cancelled, ct);
        var activeSessions = await db.LiveSessionBookings.AsNoTracking().CountAsync(x => x.TeacherId == teacherId
            && (x.Status == LiveSessionStatus.AwaitingPayment || x.Status == LiveSessionStatus.Confirmed
                || x.Status == LiveSessionStatus.CompletionPending || x.Status == LiveSessionStatus.StudentNoShowPending
                || x.Status == LiveSessionStatus.TeacherNoShowPending), ct);
        var unreadMessages = await db.Set<ConversationParticipant>().AsNoTracking()
            .Where(x => x.UserId == teacherId)
            .SelectMany(participant => db.Messages.Where(message => message.ConversationId == participant.ConversationId
                && message.SenderId != teacherId
                && (!participant.LastReadAt.HasValue || message.CreatedAt > participant.LastReadAt.Value)))
            .CountAsync(ct);
        return new(directRequests, activeOrders, activeSessions, unreadMessages);
    }

    public async Task<TeacherBusinessAnalyticsDto> GetAnalyticsAsync(string teacherId, CancellationToken ct)
    {
        var offers = await db.TeacherOffers.AsNoTracking().Where(x => x.TeacherId == teacherId)
            .Select(x => new { x.SelectedAt, x.AcceptedAt }).ToArrayAsync(ct);
        var selected = offers.Count(x => x.SelectedAt.HasValue || x.AcceptedAt.HasValue);
        var accountIds = await db.LedgerAccounts.AsNoTracking().Where(x =>
                x.Kind == LedgerAccountKind.TeacherAvailable && x.OwnerId == teacherId)
            .Select(x => x.Id).ToArrayAsync(ct);
        var entries = await db.LedgerEntries.AsNoTracking().Where(x =>
                accountIds.Contains(x.CreditAccountId) || accountIds.Contains(x.DebitAccountId))
            .ToArrayAsync(ct);
        var releasedOrderIds = ReferenceIds(entries, accountIds, "Order");
        var releasedSessionIds = ReferenceIds(entries, accountIds, "LiveSession");
        var refundedOrders = await db.Refunds.AsNoTracking().Where(x => x.OrderId.HasValue)
            .Select(x => x.OrderId!.Value).ToArrayAsync(ct);
        var refundedSessions = await db.Refunds.AsNoTracking().Where(x => x.LiveSessionBookingId.HasValue)
            .Select(x => x.LiveSessionBookingId!.Value).ToArrayAsync(ct);
        releasedOrderIds.ExceptWith(refundedOrders);
        releasedSessionIds.ExceptWith(refundedSessions);
        var orders = await db.Orders.AsNoTracking().Where(x => x.TeacherId == teacherId)
            .Where(x => x.PaymentStatus == OrderPaymentStatus.Paid || x.PaymentStatus == OrderPaymentStatus.Refunded)
            .Select(x => new { x.Id, x.StudentId, x.Price }).ToArrayAsync(ct);
        var fundedSessionIds = await db.Payments.AsNoTracking().Where(x =>
                x.LiveSessionBookingId.HasValue
                && (x.Status == PaymentStatus.Confirmed || x.Status == PaymentStatus.Refunded))
            .Select(x => x.LiveSessionBookingId!.Value).ToArrayAsync(ct);
        var sessions = await db.LiveSessionBookings.AsNoTracking().Where(x => x.TeacherId == teacherId)
            .Where(x => fundedSessionIds.Contains(x.Id))
            .Select(x => new { x.Id, x.StudentId, x.TotalPrice }).ToArrayAsync(ct);
        var recognizedOrders = orders.Where(x => releasedOrderIds.Contains(x.Id)).ToArray();
        var recognizedSessions = sessions.Where(x => releasedSessionIds.Contains(x.Id)).ToArray();
        var studentIds = recognizedOrders.Select(x => x.StudentId)
            .Concat(recognizedSessions.Select(x => x.StudentId));
        var net = entries.Sum(x => accountIds.Contains(x.CreditAccountId) ? x.Amount : -x.Amount);
        var completed = recognizedOrders.Length;
        var completedSessions = recognizedSessions.Length;
        var total = orders.Length + sessions.Length;
        return new(offers.Length, selected, orders.Length, completed, sessions.Length, completedSessions,
            recognizedOrders.Sum(x => x.Price) + recognizedSessions.Sum(x => x.TotalPrice), net,
            offers.Length == 0 ? 0 : decimal.Round(100m * selected / offers.Length, 2),
            total == 0 ? 0 : decimal.Round(100m * (completed + completedSessions) / total, 2),
            studentIds.GroupBy(x => x).Count(x => x.Count() > 1));
    }

    public async Task<IReadOnlyCollection<EarningsStatementLineDto>> GetStatementAsync(string teacherId, DateTimeOffset? from, DateTimeOffset? to, CancellationToken ct)
    {
        var accountIds = await db.LedgerAccounts.AsNoTracking().Where(x =>
                x.Kind == LedgerAccountKind.TeacherAvailable && x.OwnerId == teacherId)
            .Select(x => x.Id).ToArrayAsync(ct);
        var entryQuery = db.LedgerEntries.AsNoTracking().Where(x =>
            accountIds.Contains(x.CreditAccountId) || accountIds.Contains(x.DebitAccountId));
        if (from.HasValue) entryQuery = entryQuery.Where(x => x.CreatedAt >= from);
        if (to.HasValue) entryQuery = entryQuery.Where(x => x.CreatedAt < to);
        var entries = await entryQuery.OrderByDescending(x => x.CreatedAt).ToArrayAsync(ct);
        var orderIds = ParseIds(entries.Where(x => x.ReferenceType == "Order").Select(x => x.ReferenceId));
        var sessionIds = ParseIds(entries.Where(x => x.ReferenceType == "LiveSession").Select(x => x.ReferenceId));
        var orders = await db.Orders.AsNoTracking().Where(x => orderIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var sessions = await db.LiveSessionBookings.AsNoTracking().Where(x => sessionIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var refundIds = ParseIds(entries.Where(x => x.ReferenceType == "Refund").Select(x => x.ReferenceId));
        var refunds = await db.Refunds.AsNoTracking().Where(x => refundIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var lines = new List<EarningsStatementLineDto>();
        foreach (var entry in entries)
        {
            if (entry.ReferenceType == "Order" && Guid.TryParse(entry.ReferenceId, out var orderId)
                && orders.TryGetValue(orderId, out var order))
                lines.Add(new("Order", order.Id, entry.CreatedAt, order.ServiceNameEnglish,
                    order.Price, order.TeacherCommissionAmount, entry.Amount, entry.Currency, "Released"));
            else if (entry.ReferenceType == "LiveSession" && Guid.TryParse(entry.ReferenceId, out var sessionId)
                && sessions.TryGetValue(sessionId, out var session))
                lines.Add(new("LiveSession", session.Id, entry.CreatedAt, "Live session",
                    session.TotalPrice, session.TeacherCommissionAmount, entry.Amount, entry.Currency, "Released"));
            else if (entry.ReferenceType == "Refund" && accountIds.Contains(entry.DebitAccountId)
                && Guid.TryParse(entry.ReferenceId, out var refundId) && refunds.TryGetValue(refundId, out var refund))
                lines.Add(new("Refund", refundId, entry.CreatedAt, "Reversed after refund",
                    -refund.Amount, 0, -entry.Amount, entry.Currency, "Refunded"));
        }
        return lines.OrderByDescending(x => x.Date).ToArray();
    }

    public async Task<string> GetCalendarAsync(string teacherId, CancellationToken ct)
    {
        var sessions = await db.LiveSessionBookings.AsNoTracking().Where(x => x.TeacherId == teacherId && x.Status == LiveSessionStatus.Confirmed)
            .OrderBy(x => x.StartsAt).Select(x => new { x.Id, x.StartsAt, x.EndsAt, x.TeacherTimeZoneId }).ToArrayAsync(ct);
        static string Stamp(DateTimeOffset value) => value.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
        var text = new StringBuilder("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Tafseel//Teacher Calendar//EN\r\nCALSCALE:GREGORIAN\r\n");
        foreach (var item in sessions) text.Append("BEGIN:VEVENT\r\nUID:").Append(item.Id).Append("@tafseel\r\nDTSTAMP:").Append(Stamp(clock.GetUtcNow()))
            .Append("\r\nDTSTART:").Append(Stamp(item.StartsAt)).Append("\r\nDTEND:").Append(Stamp(item.EndsAt))
            .Append("\r\nSUMMARY:Tafseel live session\r\nDESCRIPTION:Timezone: ").Append(item.TeacherTimeZoneId.Replace("\n", " ")).Append("\r\nEND:VEVENT\r\n");
        return text.Append("END:VCALENDAR\r\n").ToString();
    }

    private static HashSet<Guid> ReferenceIds(
        IEnumerable<LedgerEntry> entries, IReadOnlyCollection<Guid> accountIds, string referenceType) =>
        ParseIds(entries.Where(x => x.ReferenceType == referenceType && accountIds.Contains(x.CreditAccountId))
            .Select(x => x.ReferenceId));

    private static HashSet<Guid> ParseIds(IEnumerable<string> values) =>
        values.Select(x => Guid.TryParse(x, out var id) ? id : Guid.Empty)
            .Where(x => x != Guid.Empty).ToHashSet();
}
