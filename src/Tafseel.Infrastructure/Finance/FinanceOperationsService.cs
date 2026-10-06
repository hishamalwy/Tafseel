using System.Data;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Common;
using Tafseel.Application.Finance;
using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Finance;

/// <summary>
/// What a money operator needs to investigate and account for money: payment lookup, the financial audit trail,
/// and reconciliation anomalies as owned cases. Reads, plus notes on exception cases. It never moves money and
/// never edits a balance; refunds and transfers stay in <see cref="FinancialService"/>.
/// </summary>
internal sealed class FinanceOperationsService(
    TafseelDbContext db, IFinancialService finance, TimeProvider clock) : IFinanceOperationsService
{
    /// <summary>Same window as the Admin attention count: a checkout still pending after this is an investigation.</summary>
    internal const int StuckPaymentHours = 6;

    public async Task<PagedResult<FinancePaymentListItemDto>> SearchPaymentsAsync(
        FinancePaymentSearch search, CancellationToken ct)
    {
        var page = Math.Max(search.Page, 1);
        var pageSize = Math.Clamp(search.PageSize, 1, 100);
        var now = clock.GetUtcNow();
        var stuckCutoff = now.AddHours(-StuckPaymentHours);
        var query = db.Payments.AsNoTracking();

        var text = search.Query?.Trim() ?? "";
        if (text.Length > 200) text = text[..200];
        if (Guid.TryParse(text, out var id))
            query = query.Where(p => p.Id == id || p.OrderId == id || p.LiveSessionBookingId == id || p.LearningRequestId == id);
        else if (text.Length > 0)
        {
            var people = db.Users.Where(u => (u.Email != null && u.Email.Contains(text))
                || u.FullName.Contains(text) || u.FullNameEnglish.Contains(text)).Select(u => u.Id);
            var taughtOrders = db.Orders.Where(o => people.Contains(o.TeacherId)).Select(o => o.Id);
            var taughtSessions = db.LiveSessionBookings.Where(s => people.Contains(s.TeacherId)).Select(s => s.Id);
            query = query.Where(p => p.ProviderReference.Contains(text)
                || people.Contains(p.StudentId)
                || (p.OrderId != null && taughtOrders.Contains(p.OrderId.Value))
                || (p.LiveSessionBookingId != null && taughtSessions.Contains(p.LiveSessionBookingId.Value)));
        }

        var status = search.Status?.Trim();
        if (string.Equals(status, "stuck", StringComparison.OrdinalIgnoreCase))
            query = query.Where(p => p.Status == PaymentStatus.Pending && p.CreatedAt < stuckCutoff);
        else if (string.Equals(status, "failed-recently", StringComparison.OrdinalIgnoreCase))
        {
            // A failed provider attempt leaves the payment Pending (the student may retry); these are the ones to watch.
            var dayAgo = now.AddHours(-24);
            query = query.Where(p => db.PaymentAttempts.Any(a => a.PaymentId == p.Id
                && a.Status == PaymentAttemptStatus.Failed && a.CreatedAt >= dayAgo));
        }
        else if (!string.IsNullOrEmpty(status) && Enum.TryParse<PaymentStatus>(status, true, out var parsed)
                 && Enum.IsDefined(parsed))
            query = query.Where(p => p.Status == parsed);
        if (search.From is { } from) query = query.Where(p => p.CreatedAt >= from);
        if (search.To is { } to) query = query.Where(p => p.CreatedAt <= to);

        var total = await query.CountAsync(ct);
        var payments = await query.OrderByDescending(p => p.CreatedAt).ThenBy(p => p.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(await ListItemsAsync(payments, now, ct), page, pageSize, total);
    }

    public async Task<FinancePaymentDetailDto> GetPaymentAsync(string viewerId, Guid paymentId, CancellationToken ct)
    {
        var payment = await db.Payments.AsNoTracking().SingleOrDefaultAsync(p => p.Id == paymentId, ct)
            ?? throw new DomainException("payment_not_found", "Payment was not found.");
        var now = clock.GetUtcNow();
        var item = (await ListItemsAsync([payment], now, ct)).Single();

        var attempts = await db.PaymentAttempts.AsNoTracking().Where(a => a.PaymentId == paymentId)
            .OrderBy(a => a.CreatedAt)
            .Select(a => new FinancePaymentAttemptDto(a.Id, a.ProviderReference, a.Status, a.FailureCode, a.CreatedAt))
            .ToArrayAsync(ct);
        var webhooks = await db.PaymentWebhookRecords.AsNoTracking()
            .Where(w => w.ProviderReference == payment.ProviderReference)
            .OrderBy(w => w.ProcessedAt)
            .Select(w => new FinanceWebhookRecordDto(w.Id, w.Provider, w.EventId, w.ProcessedAt))
            .ToArrayAsync(ct);
        var escrow = await db.EscrowEntries.AsNoTracking().Where(e => e.PaymentId == paymentId)
            .OrderBy(e => e.CreatedAt)
            .Select(e => new FinanceEscrowEntryDto(e.Type, e.Amount, e.Currency, e.CreatedAt))
            .ToArrayAsync(ct);
        var refundRows = await db.Refunds.AsNoTracking().Where(r => r.PaymentId == paymentId)
            .OrderBy(r => r.CreatedAt).ToArrayAsync(ct);
        var refunderNames = await NamesAsync(refundRows.Select(r => r.ActorId), ct);
        var refunds = refundRows.Select(r => new FinanceRefundDto(r.Id, r.Amount, r.Currency, r.ActorId,
            refunderNames.GetValueOrDefault(r.ActorId), r.CreatedAt)).ToArray();

        var references = new List<string> { payment.Id.ToString() };
        if (payment.OrderId is Guid orderRef) references.Add(orderRef.ToString());
        if (payment.LiveSessionBookingId is Guid sessionRef) references.Add(sessionRef.ToString());
        if (payment.LearningRequestId is Guid requestRef) references.Add(requestRef.ToString());
        var ledger = await (
                from entry in db.LedgerEntries.AsNoTracking()
                join debit in db.LedgerAccounts.AsNoTracking() on entry.DebitAccountId equals debit.Id
                join credit in db.LedgerAccounts.AsNoTracking() on entry.CreditAccountId equals credit.Id
                where references.Contains(entry.ReferenceId)
                orderby entry.CreatedAt
                select new { entry.BusinessKey, Debit = debit.Kind, Credit = credit.Kind, entry.Amount, entry.Currency, entry.CreatedAt })
            .ToArrayAsync(ct);

        FinancePurchaseDto? purchase = null;
        string? teacherId = null;
        if (payment.OrderId is Guid orderId)
        {
            var order = await db.Orders.AsNoTracking().Where(o => o.Id == orderId)
                .Select(o => new { o.Id, o.TeacherId, o.Status, o.PaymentStatus, o.Price, o.Currency, o.LearningRequestId })
                .SingleOrDefaultAsync(ct);
            if (order is not null)
            {
                teacherId = order.TeacherId;
                var title = await db.LearningRequests.AsNoTracking().Where(r => r.Id == order.LearningRequestId)
                    .Select(r => r.Title).SingleOrDefaultAsync(ct);
                var dispute = await db.Disputes.AsNoTracking().Where(d => d.OrderId == orderId)
                    .Select(d => (Guid?)d.Id).SingleOrDefaultAsync(ct);
                purchase = new("Order", order.Id, title, order.Status.ToString(), order.PaymentStatus.ToString(),
                    order.Price, order.Currency, dispute is not null, dispute);
            }
        }
        else if (payment.LiveSessionBookingId is Guid sessionId)
        {
            var session = await db.LiveSessionBookings.AsNoTracking().Where(s => s.Id == sessionId)
                .Select(s => new { s.Id, s.TeacherId, s.Title, s.Status, s.TotalPrice, s.Currency })
                .SingleOrDefaultAsync(ct);
            if (session is not null)
            {
                teacherId = session.TeacherId;
                var dispute = await db.Disputes.AsNoTracking().Where(d => d.LiveSessionBookingId == sessionId)
                    .Select(d => (Guid?)d.Id).SingleOrDefaultAsync(ct);
                purchase = new("LiveSession", session.Id, session.Title, session.Status.ToString(), null,
                    session.TotalPrice, session.Currency, dispute is not null, dispute);
            }
        }
        else if (payment.LearningRequestId is Guid requestId)
        {
            var request = await db.LearningRequests.AsNoTracking().Where(r => r.Id == requestId)
                .Select(r => new { r.Id, r.Title, r.Status, r.TeacherId }).SingleOrDefaultAsync(ct);
            if (request is not null)
            {
                teacherId = request.TeacherId;
                purchase = new("OpenRequest", request.Id, request.Title, request.Status.ToString(), null,
                    payment.Amount, payment.Currency, false, null);
            }
        }

        // The same rules FinancialService.RefundAsync enforces, evaluated for this viewer so the screen offers the
        // action only when it would be accepted. The server still decides when the refund is sent.
        string? blocked = payment.Status != PaymentStatus.Confirmed ? "payment_not_confirmed"
            : refunds.Length > 0 ? "refund_conflict"
            : purchase is null || purchase.Kind == "OpenRequest" ? "refund_purchase_unavailable"
            : purchase.HasDispute ? "refund_requires_dispute_resolution"
            : viewerId == payment.StudentId || viewerId == teacherId ? "refund_self_processing_forbidden"
            : null;

        if (blocked is null && await db.Set<ProviderRefund>().AnyAsync(x => x.PaymentId == paymentId && !x.Applied, ct))
            blocked = "refund_pending";
        return new(item, attempts, webhooks, purchase, escrow, refunds,
            ledger.Select(l => new FinanceLedgerLineDto(l.BusinessKey, l.Debit.ToString(), l.Credit.ToString(),
                l.Amount, l.Currency, l.CreatedAt)).ToArray(),
            blocked is null, blocked);
    }

    private async Task<FinancePaymentListItemDto[]> ListItemsAsync(
        IReadOnlyCollection<Payment> payments, DateTimeOffset now, CancellationToken ct)
    {
        var orderIds = payments.Where(p => p.OrderId != null).Select(p => p.OrderId!.Value).ToArray();
        var sessionIds = payments.Where(p => p.LiveSessionBookingId != null).Select(p => p.LiveSessionBookingId!.Value).ToArray();
        var requestIds = payments.Where(p => p.LearningRequestId != null).Select(p => p.LearningRequestId!.Value).ToArray();
        var paymentIds = payments.Select(p => p.Id).ToArray();

        var orders = await (
                from o in db.Orders.AsNoTracking()
                join r in db.LearningRequests.AsNoTracking() on o.LearningRequestId equals r.Id
                where orderIds.Contains(o.Id)
                select new { o.Id, o.TeacherId, r.Title })
            .ToDictionaryAsync(x => x.Id, ct);
        var sessions = await db.LiveSessionBookings.AsNoTracking().Where(s => sessionIds.Contains(s.Id))
            .Select(s => new { s.Id, s.TeacherId, s.Title }).ToDictionaryAsync(x => x.Id, ct);
        var requests = await db.LearningRequests.AsNoTracking().Where(r => requestIds.Contains(r.Id))
            .Select(r => new { r.Id, r.TeacherId, r.Title }).ToDictionaryAsync(x => x.Id, ct);
        var refunded = (await db.Refunds.AsNoTracking().Where(r => paymentIds.Contains(r.PaymentId))
            .Select(r => r.PaymentId).ToArrayAsync(ct)).ToHashSet();
        var failures = await db.PaymentAttempts.AsNoTracking()
            .Where(a => paymentIds.Contains(a.PaymentId) && a.Status == PaymentAttemptStatus.Failed)
            .GroupBy(a => a.PaymentId).Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);

        var rows = payments.Select(p =>
        {
            string kind; Guid? purchaseId; string? title = null; string? teacherId = null;
            if (p.OrderId is Guid oid)
            {
                kind = "Order"; purchaseId = oid;
                if (orders.TryGetValue(oid, out var o)) { title = o.Title; teacherId = o.TeacherId; }
            }
            else if (p.LiveSessionBookingId is Guid sid)
            {
                kind = "LiveSession"; purchaseId = sid;
                if (sessions.TryGetValue(sid, out var s)) { title = s.Title; teacherId = s.TeacherId; }
            }
            else
            {
                kind = "OpenRequest"; purchaseId = p.LearningRequestId;
                if (p.LearningRequestId is Guid rid && requests.TryGetValue(rid, out var r)) { title = r.Title; teacherId = r.TeacherId; }
            }
            return (Payment: p, Kind: kind, PurchaseId: purchaseId, Title: title, TeacherId: teacherId);
        }).ToArray();

        var people = await PeopleAsync(rows.SelectMany(r => new[] { r.Payment.StudentId, r.TeacherId }), ct);
        var stuckCutoff = now.AddHours(-StuckPaymentHours);
        return rows.Select(r =>
        {
            people.TryGetValue(r.Payment.StudentId, out var student);
            var teacher = r.TeacherId is null ? default : people.GetValueOrDefault(r.TeacherId);
            return new FinancePaymentListItemDto(r.Payment.Id, r.Payment.Amount, r.Payment.Currency, r.Payment.Status,
                r.Payment.Provider, r.Payment.ProviderReference, r.Payment.CreatedAt, r.Kind, r.PurchaseId, r.Title,
                r.Payment.StudentId, student.Name, student.Email, r.TeacherId, teacher.Name,
                refunded.Contains(r.Payment.Id),
                r.Payment.Status == PaymentStatus.Pending && r.Payment.CreatedAt < stuckCutoff,
                failures.GetValueOrDefault(r.Payment.Id));
        }).ToArray();
    }

    public async Task<PagedResult<FinancialAuditItemDto>> GetFinancialAuditAsync(string? query, string? entityType,
        DateTimeOffset? from, DateTimeOffset? to, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var records = db.FinancialAuditRecords.AsNoTracking();
        var text = query?.Trim() ?? "";
        if (text.Length > 200) text = text[..200];
        if (text.Length > 0)
        {
            var actors = db.Users.Where(u => (u.Email != null && u.Email.Contains(text))
                || u.FullName.Contains(text) || u.FullNameEnglish.Contains(text)).Select(u => u.Id);
            records = records.Where(r => r.Action.Contains(text) || r.EntityId.Contains(text)
                || r.CorrelationKey.Contains(text) || r.ActorId == text || actors.Contains(r.ActorId));
        }
        if (!string.IsNullOrWhiteSpace(entityType)) records = records.Where(r => r.EntityType == entityType.Trim());
        if (from is { } start) records = records.Where(r => r.CreatedAt >= start);
        if (to is { } end) records = records.Where(r => r.CreatedAt <= end);
        var total = await records.CountAsync(ct);
        var rows = await records.OrderByDescending(r => r.CreatedAt).ThenBy(r => r.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        var names = await NamesAsync(rows.Select(r => r.ActorId), ct);
        return new(rows.Select(r => new FinancialAuditItemDto(r.Id, r.Action, r.ActorId, names.GetValueOrDefault(r.ActorId),
            r.EntityType, r.EntityId, r.CorrelationKey, r.CreatedAt)).ToArray(), page, pageSize, total);
    }

    public async Task<ReconciliationScanDto> ScanReconciliationAsync(string actorId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await db.Database.AcquireAsync("finance:reconciliation-scan", ct);
        var report = await finance.ReconcileAsync(ct);
        var now = clock.GetUtcNow();
        var detected = (report.Anomalies ?? [])
            .GroupBy(Fingerprint).Select(g => (Fingerprint: g.Key, Anomaly: g.First())).ToArray();
        var fingerprints = detected.Select(d => d.Fingerprint).ToArray();
        var cases = await db.ReconciliationExceptions
            .Where(x => fingerprints.Contains(x.Fingerprint) || x.DetectedInLatestScan)
            .ToListAsync(ct);
        int created = 0, reopened = 0;
        foreach (var (fingerprint, anomaly) in detected)
        {
            var existing = cases.SingleOrDefault(x => x.Fingerprint == fingerprint);
            if (existing is null)
            {
                var item = ReconciliationException.Detect(fingerprint, anomaly.Kind, anomaly.PaymentId, anomaly.OrderId,
                    anomaly.LiveSessionBookingId, anomaly.Difference, anomaly.Detail, now);
                db.Add(item);
                cases.Add(item);
                db.Add(new FinancialAuditRecord("ReconciliationExceptionDetected", actorId, "ReconciliationException",
                    item.Id.ToString(), $"detected:{item.Id}", now));
                created++;
            }
            else if (existing.Seen(anomaly.Difference, anomaly.Detail, now))
            {
                db.Add(new FinancialAuditRecord("ReconciliationExceptionReopened", actorId, "ReconciliationException",
                    existing.Id.ToString(), $"reopened:{existing.Id}:{now:O}", now));
                reopened++;
            }
        }
        // The report lists at most a fixed number of anomalies. When it is full, an unlisted case may still exist,
        // so nothing is marked as gone.
        if (detected.Length < 50)
            foreach (var gone in cases.Where(x => x.DetectedInLatestScan && !fingerprints.Contains(x.Fingerprint)))
                gone.NotSeen();
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        var open = await db.ReconciliationExceptions.CountAsync(x => x.Status == ReconciliationExceptionStatus.Open, ct);
        var acknowledged = await db.ReconciliationExceptions.CountAsync(x => x.Status == ReconciliationExceptionStatus.Acknowledged, ct);
        return new(report, open, acknowledged, created, reopened);
    }

    public async Task<PagedResult<ReconciliationExceptionDto>> GetReconciliationExceptionsAsync(
        ReconciliationExceptionStatus? status, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.ReconciliationExceptions.AsNoTracking();
        if (status is { } s) query = query.Where(x => x.Status == s);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.Status).ThenByDescending(x => x.LastDetectedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        var names = await NamesAsync(rows.SelectMany(x => new[] { x.AcknowledgedBy, x.ResolvedBy }), ct);
        return new(rows.Select(x => Map(x, names)).ToArray(), page, pageSize, total);
    }

    public Task<ReconciliationExceptionDto> AcknowledgeExceptionAsync(
        string actorId, Guid id, string? note, string version, CancellationToken ct) =>
        ChangeAsync(actorId, id, version, "ReconciliationExceptionAcknowledged",
            (item, now) => item.Acknowledge(actorId, note, now), ct);

    public Task<ReconciliationExceptionDto> ResolveExceptionAsync(
        string actorId, Guid id, string? note, string version, CancellationToken ct) =>
        ChangeAsync(actorId, id, version, "ReconciliationExceptionResolved",
            (item, now) => item.Resolve(actorId, note, now), ct);

    private async Task<ReconciliationExceptionDto> ChangeAsync(string actorId, Guid id, string version, string action,
        Action<ReconciliationException, DateTimeOffset> change, CancellationToken ct)
    {
        var item = await db.ReconciliationExceptions.SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("reconciliation_exception_not_found", "The exception was not found.");
        try
        {
            db.Entry(item).Property(x => x.RowVersion).OriginalValue = Convert.FromBase64String(version.Trim('"'));
        }
        catch (FormatException)
        {
            throw new DomainException("invalid_concurrency_token", "The version is invalid.");
        }
        var now = clock.GetUtcNow();
        change(item, now);
        db.Add(new FinancialAuditRecord(action, actorId, "ReconciliationException", item.Id.ToString(),
            $"{action}:{item.Id}:{now:O}", now));
        await db.SaveChangesAsync(ct);
        var names = await NamesAsync([item.AcknowledgedBy, item.ResolvedBy], ct);
        return Map(item, names);
    }

    public async Task<FinanceAttentionDto> GetAttentionAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var stuckCutoff = now.AddHours(-StuckPaymentHours);
        var dayAgo = now.AddHours(-24);
        var report = await finance.ReconcileAsync(ct);
        return new(
            await db.Payments.CountAsync(p => p.Status == PaymentStatus.Pending && p.CreatedAt < stuckCutoff, ct),
            await db.PaymentAttempts.Where(a => a.Status == PaymentAttemptStatus.Failed && a.CreatedAt >= dayAgo)
                .Select(a => a.PaymentId).Distinct().CountAsync(ct),
            await db.TeacherPayoutProfiles.CountAsync(p => p.Status == PayoutVerificationStatus.Pending, ct),
            await db.WithdrawalRequests.CountAsync(w => w.Status == WithdrawalStatus.Pending, ct),
            await db.WithdrawalRequests.CountAsync(w => w.Status == WithdrawalStatus.TransferInitiated, ct),
            await db.ReconciliationExceptions.CountAsync(x => x.Status != ReconciliationExceptionStatus.Resolved, ct),
            report.IsBalanced);
    }

    private static ReconciliationExceptionDto Map(ReconciliationException x, IReadOnlyDictionary<string, string> names) =>
        new(x.Id, x.Kind, x.PaymentId, x.OrderId, x.LiveSessionBookingId, x.Difference, x.Detail, x.Status,
            x.FirstDetectedAt, x.LastDetectedAt, x.DetectedInLatestScan,
            x.AcknowledgedBy, x.AcknowledgedBy is null ? null : names.GetValueOrDefault(x.AcknowledgedBy),
            x.AcknowledgedAt, x.AcknowledgementNote,
            x.ResolvedBy, x.ResolvedBy is null ? null : names.GetValueOrDefault(x.ResolvedBy),
            x.ResolvedAt, x.ResolutionNote, Convert.ToBase64String(x.RowVersion));

    /// <summary>Kind plus the record it is about; account-level anomalies have no payment, so their text identifies them.</summary>
    private static string Fingerprint(ReconciliationAnomalyDto anomaly)
    {
        var subject = anomaly.PaymentId != Guid.Empty
            ? anomaly.PaymentId.ToString("N")
            : Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(anomaly.Detail)))[..32];
        return $"{anomaly.Kind}:{subject}";
    }

    private async Task<Dictionary<string, string>> NamesAsync(IEnumerable<string?> ids, CancellationToken ct)
    {
        var wanted = ids.Where(x => !string.IsNullOrEmpty(x)).Select(x => x!).Distinct().ToArray();
        if (wanted.Length == 0) return [];
        return await db.Users.AsNoTracking().Where(u => wanted.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => string.IsNullOrWhiteSpace(u.FullNameEnglish) ? u.FullName : u.FullNameEnglish, ct);
    }

    private async Task<Dictionary<string, (string? Name, string? Email)>> PeopleAsync(
        IEnumerable<string?> ids, CancellationToken ct)
    {
        var wanted = ids.Where(x => !string.IsNullOrEmpty(x)).Select(x => x!).Distinct().ToArray();
        if (wanted.Length == 0) return [];
        return await db.Users.AsNoTracking().Where(u => wanted.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id,
                u => ((string?)(string.IsNullOrWhiteSpace(u.FullNameEnglish) ? u.FullName : u.FullNameEnglish), u.Email), ct);
    }
}
