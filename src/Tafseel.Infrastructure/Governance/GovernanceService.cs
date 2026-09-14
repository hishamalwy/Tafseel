using System.Data;
using System.Data.Common;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Tafseel.Application.Authorization;
using Tafseel.Application.Common;
using Tafseel.Application.Finance;
using Tafseel.Application.Governance;
using Tafseel.Application.LiveSessions;
using Tafseel.Application.Orders;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Governance;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Orders;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Marketplace;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Governance;

/// <summary>
/// Shared normalisation for the enumerated Admin operations filters. Filters are a presentation
/// concern only — they narrow which rows an operator sees and never change lifecycle rules.
/// </summary>
internal static class OperationFilters
{
    public static string Normalise(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "" : value.Trim().ToLowerInvariant();
}

internal sealed class GovernanceService(
    TafseelDbContext db,
    IFileStorageService files,
    IFinancialService finance,
    NotificationWriter notifications,
    AuditWriter audit,
    IOptions<DisputeOptions> options,
    IOptions<OrderLifecycleOptions> orderOptions,
    TimeProvider clock) : IGovernanceService
{
    private readonly DisputeOptions _options = options.Value;
    private readonly OrderLifecycleOptions _orders = orderOptions.Value;
    private static string Normalise(string? value) => OperationFilters.Normalise(value);

    public async Task<ReviewDto> CreateReviewAsync(
        string studentId, Guid orderId, CreateReview input, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"review:{orderId}", ct);
        var order = await db.Orders.AsNoTracking().SingleOrDefaultAsync(
                x => x.Id == orderId && x.StudentId == studentId, ct)
            ?? throw new DomainException("order_not_owned", "Order was not found.");
        await LockAsync($"teacher-rating:{order.TeacherId}", ct);
        if (order.Status != OrderStatus.Completed || order.PaymentStatus != OrderPaymentStatus.Paid)
            throw new DomainException("review_not_allowed", "Only a completed paid Order can be reviewed.");
        if (await db.TeacherReviews.AnyAsync(x => x.OrderId == orderId, ct))
            throw new DomainException("duplicate_review", "This Order was already reviewed.");
        var review = new TeacherReview(order.Id, studentId, order.TeacherId,
            input.ExplanationClarity, input.SubjectKnowledge, input.Communication,
            input.OnTimeDelivery, input.ValueForMoney, input.Comment, input.Recommends, clock.GetUtcNow());
        db.Add(review);
        await db.SaveChangesAsync(ct);
        await RefreshRatingAsync(order.TeacherId, ct);
        audit.Add(studentId, "ReviewCreated", "TeacherReview", review.Id.ToString(),
            "Completed-order review created.", $"review:{review.Id}");
        await notifications.QueueAsync(order.TeacherId, "Review", "New review received",
            "A Student reviewed a completed Order.", AppRoutes.TeacherReview(review.Id),
            $"review:{review.Id}:teacher", true, ct);
        await notifications.QueueAsync(studentId, "ReviewSubmitted", "Review submitted",
            "Your rating was saved for this completed Order.", AppRoutes.Order(order.Id),
            $"review:{review.Id}:student", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(review);
    }

    public async Task<ReviewDto> CreateLiveSessionReviewAsync(
        string studentId, Guid liveSessionBookingId, CreateReview input, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"review-session:{liveSessionBookingId}", ct);
        var booking = await db.LiveSessionBookings.AsNoTracking().SingleOrDefaultAsync(
                x => x.Id == liveSessionBookingId && x.StudentId == studentId, ct)
            ?? throw new DomainException("session_not_owned", "Live session was not found.");
        await LockAsync($"teacher-rating:{booking.TeacherId}", ct);
        if (booking.Status != LiveSessionStatus.Completed)
            throw new DomainException("review_not_allowed", "Only a completed live session can be reviewed.");
        if (await db.TeacherReviews.AnyAsync(x => x.LiveSessionBookingId == liveSessionBookingId, ct))
            throw new DomainException("duplicate_review", "This live session was already reviewed.");
        var review = TeacherReview.ForLiveSession(booking.Id, studentId, booking.TeacherId,
            input.ExplanationClarity, input.SubjectKnowledge, input.Communication,
            input.OnTimeDelivery, input.ValueForMoney, input.Comment, input.Recommends, clock.GetUtcNow());
        db.Add(review);
        await db.SaveChangesAsync(ct);
        await RefreshRatingAsync(booking.TeacherId, ct);
        audit.Add(studentId, "LiveSessionReviewCreated", "TeacherReview", review.Id.ToString(),
            "Completed-session review created.", $"review:{review.Id}");
        await notifications.QueueAsync(booking.TeacherId, "Review", "New review received",
            "A Student reviewed a completed live session.", AppRoutes.LiveSession(booking.Id),
            $"review:{review.Id}:teacher", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(review);
    }

    public async Task<PagedResult<PublicTeacherReviewDto>> GetTeacherReviewsAsync(
        string teacherId, int page, int pageSize, CancellationToken ct)
    {
        if (!await TeacherPublicQueries.IsBrowsableAsync(db, teacherId, ct))
            throw new DomainException("teacher_not_found", "Teacher was not found.");
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.TeacherReviews.Where(x => x.TeacherId == teacherId && x.IsVisible);
        var total = await query.CountAsync(ct);
        var items = await query.AsNoTracking().OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(items.Select(MapPublic).ToArray(), page, pageSize, total);
    }

    public async Task<PagedResult<AdminReviewListItemDto>> GetAdminReviewsAsync(
        int page, int pageSize, AdminReviewVisibilityFilter visibility, int? rating,
        string? search, AdminReviewSort sort, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query =
            from r in db.TeacherReviews.AsNoTracking()
            join u in db.Users.AsNoTracking() on r.TeacherId equals u.Id
            let orderServiceId = db.Orders.Where(o => o.Id == r.OrderId)
                .Select(o => (Guid?)o.TeacherServiceId).FirstOrDefault()
            let sessionServiceId = db.LiveSessionBookings.Where(b => b.Id == r.LiveSessionBookingId)
                .Select(b => (Guid?)b.TeacherServiceId).FirstOrDefault()
            let serviceTitle = db.TeacherServices.Where(s => s.Id == (orderServiceId ?? sessionServiceId))
                .Select(s => s.Title).FirstOrDefault()
            select new { Review = r, Teacher = u, ServiceTitle = serviceTitle ?? "" };

        query = visibility switch
        {
            AdminReviewVisibilityFilter.Visible => query.Where(x => x.Review.IsVisible),
            AdminReviewVisibilityFilter.Hidden => query.Where(x => !x.Review.IsVisible),
            _ => query
        };
        if (rating is >= 1 and <= 5)
            query = query.Where(x => (int)Math.Round(x.Review.OverallScore) == rating);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x =>
                EF.Functions.Like(x.Teacher.FullName, $"%{term}%") ||
                EF.Functions.Like(x.Teacher.FullNameEnglish, $"%{term}%") ||
                EF.Functions.Like(x.ServiceTitle, $"%{term}%") ||
                x.Review.OrderId.HasValue && x.Review.OrderId.Value.ToString().Contains(term) ||
                x.Review.LiveSessionBookingId.HasValue && x.Review.LiveSessionBookingId.Value.ToString().Contains(term));
        }
        query = sort switch
        {
            AdminReviewSort.Oldest => query.OrderBy(x => x.Review.CreatedAt).ThenBy(x => x.Review.Id),
            AdminReviewSort.HighestRating => query.OrderByDescending(x => x.Review.OverallScore).ThenByDescending(x => x.Review.CreatedAt),
            AdminReviewSort.LowestRating => query.OrderBy(x => x.Review.OverallScore).ThenByDescending(x => x.Review.CreatedAt),
            _ => query.OrderByDescending(x => x.Review.CreatedAt).ThenBy(x => x.Review.Id)
        };

        var total = await query.CountAsync(ct);
        var rows = await query.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new
            {
                x.Review.Id,
                x.Review.OrderId,
                x.Review.LiveSessionBookingId,
                x.Review.TeacherId,
                x.Teacher.FullName,
                x.Teacher.FullNameEnglish,
                x.Teacher.AvatarStorageKey,
                x.ServiceTitle,
                x.Review.OverallScore,
                x.Review.Recommends,
                x.Review.OriginalComment,
                x.Review.CreatedAt,
                x.Review.IsVisible
            })
            .ToArrayAsync(ct);
        var ids = rows.Select(x => x.Id).ToArray();
        var lastModeration = await db.Set<ReviewModerationRecord>().AsNoTracking()
            .Where(x => ids.Contains(x.TeacherReviewId))
            .GroupBy(x => x.TeacherReviewId)
            .Select(g => g.OrderByDescending(x => x.CreatedAt).First())
            .ToDictionaryAsync(x => x.TeacherReviewId, ct);

        var items = rows.Select(x =>
        {
            lastModeration.TryGetValue(x.Id, out var last);
            var excerpt = x.OriginalComment.Length > 160 ? x.OriginalComment[..160] + "…" : x.OriginalComment;
            return new AdminReviewListItemDto(
                x.Id, x.OrderId, x.LiveSessionBookingId, x.TeacherId, x.FullName, x.FullNameEnglish,
                !string.IsNullOrWhiteSpace(x.AvatarStorageKey), x.ServiceTitle, x.OverallScore, x.Recommends,
                excerpt, x.CreatedAt, x.IsVisible, last?.CreatedAt, last?.Reason);
        }).ToArray();
        return new(items, page, pageSize, total);
    }

    public async Task<AdminReviewDetailDto> GetAdminReviewAsync(Guid id, CancellationToken ct)
    {
        var row = await (
            from r in db.TeacherReviews.AsNoTracking()
            join u in db.Users.AsNoTracking() on r.TeacherId equals u.Id
            let orderServiceId = db.Orders.Where(o => o.Id == r.OrderId)
                .Select(o => (Guid?)o.TeacherServiceId).FirstOrDefault()
            let sessionServiceId = db.LiveSessionBookings.Where(b => b.Id == r.LiveSessionBookingId)
                .Select(b => (Guid?)b.TeacherServiceId).FirstOrDefault()
            let serviceTitle = db.TeacherServices.Where(s => s.Id == (orderServiceId ?? sessionServiceId))
                .Select(s => s.Title).FirstOrDefault()
            where r.Id == id
            select new { Review = r, Teacher = u, ServiceTitle = serviceTitle ?? "" })
            .SingleOrDefaultAsync(ct)
            ?? throw new DomainException("review_not_found", "Review was not found.");
        var history = await db.Set<ReviewModerationRecord>().AsNoTracking()
            .Where(x => x.TeacherReviewId == id).OrderBy(x => x.CreatedAt).ToArrayAsync(ct);
        var actorIds = history.Select(h => h.ActorId).Distinct().ToArray();
        var actorNames = await db.Users.AsNoTracking().Where(x => actorIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.FullName, ct);
        return new(
            row.Review.Id, row.Review.OrderId, row.Review.LiveSessionBookingId, row.Review.TeacherId, row.Teacher.FullName, row.Teacher.FullNameEnglish,
            !string.IsNullOrWhiteSpace(row.Teacher.AvatarStorageKey), row.ServiceTitle,
            row.Review.ExplanationClarity, row.Review.SubjectKnowledge, row.Review.Communication,
            row.Review.OnTimeDelivery, row.Review.ValueForMoney, row.Review.OverallScore,
            row.Review.OriginalComment, row.Review.Recommends, row.Review.CreatedAt, row.Review.IsVisible,
            history.Select(h => new ReviewModerationRecordDto(
                h.Id, h.ActorId, actorNames.GetValueOrDefault(h.ActorId), h.Visible, h.Reason, h.CreatedAt)).ToArray());
    }

    public async Task<AdminReviewQueueSummaryDto> GetAdminReviewSummaryAsync(CancellationToken ct)
    {
        var visible = await db.TeacherReviews.CountAsync(x => x.IsVisible, ct);
        var hidden = await db.TeacherReviews.CountAsync(x => !x.IsVisible, ct);
        return new(visible, hidden, visible + hidden);
    }

    public async Task ModerateReviewAsync(
        string adminId, Guid id, ModerateReview input, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var review = await db.TeacherReviews.Include(x => x.Moderation)
            .SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("review_not_found", "Review was not found.");
        await LockAsync($"teacher-rating:{review.TeacherId}", ct);
        review.Moderate(adminId, input.Visible, input.Reason, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
        await RefreshRatingAsync(review.TeacherId, ct);
        audit.Add(adminId, "ReviewModerated", "TeacherReview", review.Id.ToString(),
            input.Visible ? "Review restored." : "Review hidden.", $"review:{review.Id}:moderation:{review.Moderation.Count}");
        await notifications.QueueAsync(review.StudentId, "ReviewModeration",
            input.Visible ? "Review restored to public profile" : "Review hidden from public profile",
            input.Visible
                ? "Your review is visible on the teacher profile again."
                : "Your review remains on your completed Order but is not shown publicly.",
            review.OrderId is { } reviewedOrder
                ? AppRoutes.Order(reviewedOrder)
                : AppRoutes.LiveSession(review.LiveSessionBookingId!.Value),
            $"review:{review.Id}:moderation:{review.Moderation.Count}:student", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task<DisputeDto> OpenDisputeAsync(
        string userId, OpenDispute input, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        if (input.OrderId.HasValue == input.LiveSessionBookingId.HasValue)
            throw new DomainException("invalid_dispute", "Choose one Order or live session.");
        Dispute dispute;
        string other;
        if (input.OrderId is Guid orderId)
        {
            await LockAsync($"dispute-order:{orderId}", ct);
            var existing = await ExistingDisputeAsync(orderId, null, ct);
            if (existing is not null)
            {
                if (existing.OpenedById == userId
                    && string.Equals(existing.Reason, input.Reason.Trim(), StringComparison.Ordinal))
                {
                    await tx.CommitAsync(ct);
                    return Map(existing);
                }
                throw new DomainException("duplicate_dispute", "A dispute already exists for this Order.");
            }
            var order = await db.Orders.AsNoTracking().SingleOrDefaultAsync(x =>
                    x.Id == orderId && (x.StudentId == userId || x.TeacherId == userId), ct)
                ?? throw new DomainException("order_not_owned", "Order was not found.");
            var now = clock.GetUtcNow();
            var deliveredAt = await db.Set<OrderStatusHistory>().AsNoTracking()
                .Where(x => x.OrderId == order.Id && x.NextStatus == OrderStatus.Delivered)
                .MaxAsync(x => (DateTimeOffset?)x.CreatedAt, ct);
            var nonDelivery = userId == order.StudentId
                && order.PaymentStatus == OrderPaymentStatus.Paid
                && order.Status is OrderStatus.AwaitingPayment or OrderStatus.InProgress
                && deliveredAt is null
                && now > order.AgreedDeliveryAt.AddHours(_orders.NonDeliveryGraceHours)
                && !await db.OrderDeliveries.AnyAsync(x => x.OrderId == order.Id, ct);
            var deliveredDispute = order.PaymentStatus == OrderPaymentStatus.Paid
                && order.Status is OrderStatus.Delivered or OrderStatus.RevisionRequested or OrderStatus.Completed
                && deliveredAt is not null && deliveredAt >= now.AddDays(-_options.WindowDays);
            if (!nonDelivery && !deliveredDispute)
                throw new DomainException("dispute_not_allowed", "This Order is not eligible for a dispute.");
            dispute = new Dispute(order.Id, order.StudentId, order.TeacherId, userId, input.Reason, now);
            other = userId == order.StudentId ? order.TeacherId : order.StudentId;
        }
        else
        {
            var bookingId = input.LiveSessionBookingId!.Value;
            await LockAsync($"dispute-session:{bookingId}", ct);
            await LockAsync($"session-settlement:{bookingId}", ct);
            var existing = await ExistingDisputeAsync(null, bookingId, ct);
            if (existing is not null)
            {
                if (existing.OpenedById == userId
                    && string.Equals(existing.Reason, input.Reason.Trim(), StringComparison.Ordinal))
                {
                    await tx.CommitAsync(ct);
                    return Map(existing);
                }
                throw new DomainException("duplicate_dispute", "A dispute already exists for this live session.");
            }
            var booking = await db.LiveSessionBookings.AsNoTracking().SingleOrDefaultAsync(x =>
                    x.Id == bookingId && (x.StudentId == userId || x.TeacherId == userId), ct)
                ?? throw new DomainException("session_not_owned", "Live session was not found.");
            if (booking.Status is not (LiveSessionStatus.Confirmed or LiveSessionStatus.Completed
                    or LiveSessionStatus.StudentNoShow or LiveSessionStatus.TeacherNoShow
                    or LiveSessionStatus.CompletionPending or LiveSessionStatus.StudentNoShowPending
                    or LiveSessionStatus.TeacherNoShowPending)
                || booking.EndsAt > clock.GetUtcNow()
                || booking.EndsAt < clock.GetUtcNow().AddDays(-_options.WindowDays))
                throw new DomainException("dispute_not_allowed", "This live session is not eligible for a dispute.");
            dispute = Dispute.ForLiveSession(booking.Id, booking.StudentId, booking.TeacherId, userId, input.Reason, clock.GetUtcNow());
            other = userId == booking.StudentId ? booking.TeacherId : booking.StudentId;
        }
        db.Add(dispute);
        audit.Add(userId, "DisputeOpened", "Dispute", dispute.Id.ToString(),
            "Held-escrow dispute opened.", $"dispute:{dispute.Id}:opened");
        await notifications.QueueAsync(other, "Dispute", "Dispute opened",
            "A dispute was opened for your purchase.", AppRoutes.Dispute(dispute.Id),
            $"dispute:{dispute.Id}:opened:{other}", true, ct);
        var adminIds = await (
            from membership in db.UserRoles.AsNoTracking()
            join role in db.Roles.AsNoTracking() on membership.RoleId equals role.Id
            join user in db.Users.AsNoTracking() on membership.UserId equals user.Id
            where role.Name == Roles.Admin && !user.IsSuspended
            select user.Id).ToArrayAsync(ct);
        foreach (var adminId in adminIds)
            await notifications.QueueAsync(adminId, "DisputeAdmin", "New dispute requires triage",
                "A protected-purchase dispute was opened.", AppRoutes.Dispute(dispute.Id),
                $"dispute:{dispute.Id}:opened:admin:{adminId}", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(dispute);
    }

    public async Task<IReadOnlyCollection<EligibleDisputeTargetDto>> GetEligibleDisputeTargetsAsync(
        string userId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var cutoff = now.AddDays(-_options.WindowDays);
        var disputedOrders = db.Disputes.Where(x => x.OrderId != null).Select(x => x.OrderId!.Value);
        var disputedSessions = db.Disputes.Where(x => x.LiveSessionBookingId != null)
            .Select(x => x.LiveSessionBookingId!.Value);

        var orders = await (
            from order in db.Orders.AsNoTracking()
            let deliveredAt = db.Set<OrderStatusHistory>()
                .Where(x => x.OrderId == order.Id && x.NextStatus == OrderStatus.Delivered)
                .Max(x => (DateTimeOffset?)x.CreatedAt)
            where (order.StudentId == userId || order.TeacherId == userId)
                && order.PaymentStatus == OrderPaymentStatus.Paid
                && (order.Status == OrderStatus.Delivered
                    || order.Status == OrderStatus.RevisionRequested
                    || order.Status == OrderStatus.Completed)
                && deliveredAt != null && deliveredAt >= cutoff
                && !disputedOrders.Contains(order.Id)
            select new
            {
                order.Id,
                order.StudentId,
                order.TeacherId,
                order.ServiceNameEnglish,
                order.ServiceNameArabic,
                Amount = order.StudentTotal,
                order.Currency,
                ActivityAt = deliveredAt!.Value
            }).ToArrayAsync(ct);

        var nonDeliveries = await db.Orders.AsNoTracking()
            .Where(order => order.StudentId == userId
                && order.PaymentStatus == OrderPaymentStatus.Paid
                && (order.Status == OrderStatus.AwaitingPayment || order.Status == OrderStatus.InProgress)
                && now > order.AgreedDeliveryAt.AddHours(_orders.NonDeliveryGraceHours)
                && !db.OrderDeliveries.Any(delivery => delivery.OrderId == order.Id)
                && !disputedOrders.Contains(order.Id))
            .Select(order => new
            {
                order.Id,
                order.StudentId,
                order.TeacherId,
                order.ServiceNameEnglish,
                order.ServiceNameArabic,
                Amount = order.StudentTotal,
                order.Currency,
                ActivityAt = order.AgreedDeliveryAt
            }).ToArrayAsync(ct);

        var sessions = await db.LiveSessionBookings.AsNoTracking()
            .Where(x => (x.StudentId == userId || x.TeacherId == userId)
                && x.EndsAt <= now && x.EndsAt >= cutoff
                && (x.Status == LiveSessionStatus.Confirmed
                    || x.Status == LiveSessionStatus.Completed
                    || x.Status == LiveSessionStatus.StudentNoShow
                    || x.Status == LiveSessionStatus.TeacherNoShow
                    || x.Status == LiveSessionStatus.CompletionPending
                    || x.Status == LiveSessionStatus.StudentNoShowPending
                    || x.Status == LiveSessionStatus.TeacherNoShowPending)
                && !disputedSessions.Contains(x.Id))
            .Select(x => new
            {
                x.Id,
                x.StudentId,
                x.TeacherId,
                x.Title,
                x.ServiceNameEnglish,
                x.ServiceNameArabic,
                Amount = x.TotalPrice,
                x.Currency,
                ActivityAt = x.EndsAt
            }).ToArrayAsync(ct);

        var otherIds = orders.Select(x => x.StudentId == userId ? x.TeacherId : x.StudentId)
            .Concat(nonDeliveries.Select(x => x.TeacherId))
            .Concat(sessions.Select(x => x.StudentId == userId ? x.TeacherId : x.StudentId))
            .Distinct().ToArray();
        var names = await db.Users.AsNoTracking().Where(x => otherIds.Contains(x.Id))
            .Select(x => new { x.Id, x.FullName, x.FullNameEnglish })
            .ToDictionaryAsync(x => x.Id, ct);

        var results = new List<EligibleDisputeTargetDto>(orders.Length + nonDeliveries.Length + sessions.Length);
        foreach (var order in orders)
        {
            var otherId = order.StudentId == userId ? order.TeacherId : order.StudentId;
            names.TryGetValue(otherId, out var other);
            results.Add(new("order", order.Id,
                string.IsNullOrWhiteSpace(order.ServiceNameEnglish) ? "Order" : order.ServiceNameEnglish,
                string.IsNullOrWhiteSpace(order.ServiceNameArabic) ? "طلب" : order.ServiceNameArabic,
                other?.FullName ?? "", other?.FullNameEnglish ?? "", order.Amount, order.Currency,
                order.ActivityAt, order.ActivityAt.AddDays(_options.WindowDays)));
        }
        foreach (var order in nonDeliveries)
        {
            names.TryGetValue(order.TeacherId, out var other);
            results.Add(new("non_delivery", order.Id,
                string.IsNullOrWhiteSpace(order.ServiceNameEnglish) ? "Overdue Order" : order.ServiceNameEnglish,
                string.IsNullOrWhiteSpace(order.ServiceNameArabic) ? "طلب متأخر" : order.ServiceNameArabic,
                other?.FullName ?? "", other?.FullNameEnglish ?? "", order.Amount, order.Currency,
                order.ActivityAt, DateTimeOffset.MaxValue));
        }
        foreach (var session in sessions)
        {
            var otherId = session.StudentId == userId ? session.TeacherId : session.StudentId;
            names.TryGetValue(otherId, out var other);
            results.Add(new("session", session.Id,
                string.IsNullOrWhiteSpace(session.Title) ? session.ServiceNameEnglish : session.Title,
                string.IsNullOrWhiteSpace(session.ServiceNameArabic) ? "جلسة مباشرة" : session.ServiceNameArabic,
                other?.FullName ?? "", other?.FullNameEnglish ?? "", session.Amount, session.Currency,
                session.ActivityAt, session.ActivityAt.AddDays(_options.WindowDays)));
        }
        return results.OrderByDescending(x => x.ActivityAt).ToArray();
    }

    public async Task<PagedResult<DisputeDto>> GetDisputesAsync(
        string userId, bool admin, int page, int pageSize, string? filter, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Disputes.AsQueryable();
        if (!admin) query = query.Where(x => x.StudentId == userId || x.TeacherId == userId);
        query = Normalise(filter) switch
        {
            "open" => query.Where(x => x.Status == DisputeStatus.Open),
            "under-review" => query.Where(x => x.Status == DisputeStatus.UnderReview),
            "unresolved" => query.Where(x => x.Status != DisputeStatus.Resolved),
            "resolved" => query.Where(x => x.Status == DisputeStatus.Resolved),
            _ => query
        };
        var total = await query.CountAsync(ct);
        var items = await query.AsNoTracking().OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Include(x => x.Messages).Include(x => x.Evidence).Include(x => x.Decisions).Include(x => x.History)
            .AsSplitQuery().ToArrayAsync(ct);
        return new(items.Select(Map).ToArray(), page, pageSize, total);
    }

    public async Task<DisputeDto> GetDisputeAsync(
        string userId, Guid id, bool admin, CancellationToken ct)
    {
        var dispute = await RequiredDisputeAsync(id, ct);
        if (!admin && dispute.StudentId != userId && dispute.TeacherId != userId)
            throw new DomainException("dispute_not_found", "Dispute was not found.");
        return Map(dispute);
    }

    public async Task AddDisputeMessageAsync(
        string userId, Guid id, AddDisputeMessage input, string version, CancellationToken ct)
    {
        var dispute = await OwnedDisputeAsync(userId, id, version, ct);
        dispute.AddMessage(userId, input.Body, clock.GetUtcNow());
        var message = dispute.Messages.Last();
        var recipient = userId == dispute.StudentId ? dispute.TeacherId : dispute.StudentId;
        await notifications.QueueAsync(recipient, "Dispute", "New dispute message",
            "The other party added a message to the dispute.", AppRoutes.Dispute(id),
            $"dispute:{id}:message:{message.Id}:{recipient}", true, ct);
        audit.Add(userId, "DisputeMessageAdded", "Dispute", id.ToString(),
            "A participant added a dispute message.", $"dispute:{id}:message:{message.Id}");
        await db.SaveChangesAsync(ct);
    }

    public async Task AddAdminDisputeMessageAsync(
        string adminId, Guid id, AddDisputeMessage input, string version, CancellationToken ct)
    {
        var dispute = await RequiredDisputeAsync(id, ct);
        ApplyVersion(dispute, version);
        dispute.AddReviewerMessage(adminId, input.Body, clock.GetUtcNow());
        var message = dispute.Messages.Last();
        foreach (var recipient in new[] { dispute.StudentId, dispute.TeacherId })
            await notifications.QueueAsync(recipient, "Dispute", "Reviewer requested information",
                "The dispute reviewer added a message to the case.", AppRoutes.Dispute(id),
                $"dispute:{id}:message:{message.Id}:{recipient}", true, ct);
        audit.Add(adminId, "DisputeReviewerMessageAdded", "Dispute", id.ToString(),
            "The reviewer added a dispute message.", $"dispute:{id}:message:{message.Id}");
        await db.SaveChangesAsync(ct);
    }

    public async Task<AttachmentDto> AddEvidenceAsync(
        string userId, Guid id, Stream stream, string fileName, string contentType,
        long size, string version, CancellationToken ct)
    {
        var dispute = await OwnedDisputeAsync(userId, id, version, ct);
        var stored = await files.StorePrivateFileAsync(
            stream, fileName, contentType, size, "dispute-evidence", ct);
        try
        {
            dispute.AddEvidence(userId, stored.StorageKey, SafeName(fileName),
                stored.ContentType, stored.Size, clock.GetUtcNow());
            var recipient = userId == dispute.StudentId ? dispute.TeacherId : dispute.StudentId;
            var newEvidence = dispute.Evidence.Last();
            await notifications.QueueAsync(recipient, "Dispute", "New dispute evidence",
                "The other party uploaded evidence to the dispute.", AppRoutes.Dispute(id),
                $"dispute:{id}:evidence:{newEvidence.Id}:{recipient}", true, ct);
            audit.Add(userId, "DisputeEvidenceAdded", "Dispute", id.ToString(),
                "A participant uploaded dispute evidence.", $"dispute:{id}:evidence:{newEvidence.Id}");
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            await files.DeletePrivateFileAsync(stored.StorageKey, CancellationToken.None);
            throw;
        }
        var evidence = dispute.Evidence.Last();
        return new(evidence.Id, evidence.OriginalName, evidence.ContentType, evidence.Size, evidence.CreatedAt);
    }

    public async Task<PrivateFile> OpenEvidenceAsync(
        string userId, Guid id, bool admin, CancellationToken ct)
    {
        var item = await (
            from evidence in db.DisputeEvidence.AsNoTracking()
            join dispute in db.Disputes.AsNoTracking() on evidence.DisputeId equals dispute.Id
            where evidence.Id == id && (admin || dispute.StudentId == userId || dispute.TeacherId == userId)
            select new { evidence.StorageKey, evidence.ContentType, evidence.OriginalName })
            .SingleOrDefaultAsync(ct)
            ?? throw new DomainException("evidence_not_owned", "Evidence was not found.");
        return new(await files.OpenPrivateFileAsync(item.StorageKey, ct), item.ContentType, item.OriginalName);
    }

    public async Task StartDisputeReviewAsync(
        string adminId, Guid id, string version, CancellationToken ct)
    {
        var dispute = await RequiredDisputeAsync(id, ct);
        if (dispute.Status == DisputeStatus.UnderReview) return;
        ApplyVersion(dispute, version);
        if (!dispute.StartReview(adminId, clock.GetUtcNow())) return;
        audit.Add(adminId, "DisputeReviewStarted", "Dispute", id.ToString(),
            "Dispute review started.", $"dispute:{id}:review");
        foreach (var recipient in new[] { dispute.StudentId, dispute.TeacherId })
            await notifications.QueueAsync(recipient, "Dispute", "Dispute review started",
                "Your dispute is now under review.", AppRoutes.Dispute(id),
                $"dispute:{id}:review:{recipient}", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task<DisputeDto> ResolveDisputeAsync(
        string adminId, Guid id, ResolveDispute input, string version,
        string idempotencyKey, CancellationToken ct)
    {
        idempotencyKey = RequiredKey(idempotencyKey);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"dispute:{id}", ct);
        var dispute = await RequiredDisputeAsync(id, ct);
        if (dispute.Status == DisputeStatus.Resolved
            && dispute.Decisions.Single().IdempotencyKey == idempotencyKey)
        {
            dispute.Resolve(adminId, input.Resolution, input.Rationale, idempotencyKey, clock.GetUtcNow());
            await tx.CommitAsync(ct); return Map(dispute);
        }
        ApplyVersion(dispute, version);
        var changed = dispute.Resolve(adminId, input.Resolution, input.Rationale, idempotencyKey, clock.GetUtcNow());
        if (changed && input.Resolution != DisputeResolution.NoFinancialAction)
        {
            if (dispute.OrderId is Guid orderId)
            {
                var order = await db.Orders.SingleAsync(x => x.Id == orderId, ct);
                await finance.SettleDisputeAsync(
                    order, input.Resolution == DisputeResolution.RefundStudent, adminId, idempotencyKey, ct);
            }
            else
            {
                var booking = await db.LiveSessionBookings.SingleAsync(x => x.Id == dispute.LiveSessionBookingId, ct);
                await finance.SettleLiveSessionDisputeAsync(
                    booking, input.Resolution == DisputeResolution.RefundStudent, adminId, idempotencyKey, ct);
            }
            if (input.Resolution == DisputeResolution.RefundStudent)
            {
                var review = await db.TeacherReviews.Include(x => x.Moderation).SingleOrDefaultAsync(x =>
                    x.OrderId == dispute.OrderId && dispute.OrderId != null
                    || x.LiveSessionBookingId == dispute.LiveSessionBookingId && dispute.LiveSessionBookingId != null, ct);
                if (review is { IsVisible: true })
                {
                    review.Moderate(adminId, false, "Hidden after the purchase was fully refunded.", clock.GetUtcNow());
                    await db.SaveChangesAsync(ct);
                    await RefreshRatingAsync(review.TeacherId, ct);
                }
            }
        }
        audit.Add(adminId, "DisputeResolved", "Dispute", id.ToString(),
            $"Resolution: {input.Resolution}.", idempotencyKey);
        foreach (var recipient in new[] { dispute.StudentId, dispute.TeacherId })
            await notifications.QueueAsync(recipient, "Dispute", "Dispute resolved",
                $"Resolution: {input.Resolution}.", AppRoutes.Dispute(id),
                $"dispute:{id}:resolved:{recipient}", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(dispute);
    }

    private async Task RefreshRatingAsync(string teacherId, CancellationToken ct)
    {
        var aggregate = await db.TeacherReviews.Where(x => x.TeacherId == teacherId && x.IsVisible)
            .GroupBy(_ => 1).Select(x => new { Count = x.Count(), Average = x.Average(r => r.OverallScore) })
            .SingleOrDefaultAsync(ct);
        var profile = await db.TeacherProfiles.SingleAsync(x => x.TeacherId == teacherId, ct);
        profile.SetRating(aggregate?.Average ?? 0, aggregate?.Count ?? 0, clock.GetUtcNow());
    }
    private async Task<Dispute> OwnedDisputeAsync(
        string userId, Guid id, string version, CancellationToken ct)
    {
        var item = await RequiredDisputeAsync(id, ct); item.RequireParticipant(userId); ApplyVersion(item, version); return item;
    }
    private async Task<Dispute?> ExistingDisputeAsync(Guid? orderId, Guid? bookingId, CancellationToken ct) =>
        await db.Disputes.Include(x => x.Messages).Include(x => x.Evidence)
            .Include(x => x.History).Include(x => x.Decisions)
            .SingleOrDefaultAsync(x => orderId != null ? x.OrderId == orderId : x.LiveSessionBookingId == bookingId, ct);
    private async Task<Dispute> RequiredDisputeAsync(Guid id, CancellationToken ct) =>
        await db.Disputes.Include(x => x.Messages).Include(x => x.Evidence)
            .Include(x => x.History).Include(x => x.Decisions)
            .SingleOrDefaultAsync(x => x.Id == id, ct)
        ?? throw new DomainException("dispute_not_found", "Dispute was not found.");
    private void ApplyVersion(Dispute item, string version)
    {
        try { db.Entry(item).Property(x => x.RowVersion).OriginalValue = Convert.FromBase64String(version.Trim('"')); }
        catch (FormatException) { throw new DomainException("invalid_concurrency_token", "Dispute version is invalid."); }
    }
    /// <summary>Verified transaction-scoped lock; throws rather than continuing unlocked.</summary>
    private Task LockAsync(string resource, CancellationToken ct) =>
        db.Database.AcquireAsync(resource, ct);
    private static string RequiredKey(string value)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 or > 100)
            throw new DomainException("idempotency_key_required", "A valid Idempotency-Key is required.");
        return value;
    }
    private static string SafeName(string value) =>
        Path.GetFileName(value) is { Length: > 0 and <= 255 } name ? name : "evidence";
    private static ReviewDto Map(TeacherReview x) =>
        new(x.Id, x.OrderId, x.LiveSessionBookingId, x.TeacherId, x.ExplanationClarity,
            x.SubjectKnowledge, x.Communication, x.OnTimeDelivery, x.ValueForMoney,
            x.OverallScore, x.OriginalComment, x.Recommends, x.IsVisible, x.CreatedAt);
    private static PublicTeacherReviewDto MapPublic(TeacherReview x) =>
        new(x.Id, x.TeacherId, x.ExplanationClarity,
            x.SubjectKnowledge, x.Communication, x.OnTimeDelivery, x.ValueForMoney,
            x.OverallScore, x.OriginalComment, x.Recommends, x.CreatedAt);
    private DisputeDto Map(Dispute x)
    {
        var reviewStartedAt = x.History.Where(h => h.NextStatus == DisputeStatus.UnderReview)
            .OrderByDescending(h => h.CreatedAt).Select(h => (DateTimeOffset?)h.CreatedAt).FirstOrDefault();
        var actionDueAt = x.Status switch
        {
            DisputeStatus.Open => x.CreatedAt.AddHours(_options.InitialResponseHours),
            DisputeStatus.UnderReview when reviewStartedAt.HasValue => reviewStartedAt.Value.AddHours(_options.ResolutionHours),
            _ => (DateTimeOffset?)null
        };
        return new(x.Id, x.OrderId, x.LiveSessionBookingId, x.StudentId, x.TeacherId, x.OpenedById, x.Reason,
            x.Status, x.CreatedAt, x.UpdatedAt, actionDueAt,
            x.Messages.Select(m => new DisputeMessageDto(m.Id, m.SenderId, m.Body, m.CreatedAt)).ToArray(),
            x.Evidence.Select(e => new AttachmentDto(e.Id, e.OriginalName, e.ContentType, e.Size, e.CreatedAt)).ToArray(),
            x.Decisions.Select(d => new DisputeDecisionDto(
                d.Id, d.ActorId, d.Resolution, d.Rationale, d.CreatedAt)).ToArray(),
            x.History.OrderBy(h => h.CreatedAt).Select(h => new DisputeStatusHistoryDto(
                h.Id, h.PreviousStatus, h.NextStatus, h.ActorId, h.CreatedAt)).ToArray(),
            Convert.ToBase64String(x.RowVersion));
    }
}

internal sealed class AuditWriter(
    TafseelDbContext db,
    TimeProvider clock,
    IHttpContextAccessor context)
{
    public void Add(string actorId, string action, string entityType,
        string entityId, string summary, string correlationId) =>
        db.Add(new AuditLogEntry(actorId, action, entityType, entityId, summary, correlationId, clock.GetUtcNow()));

    public void AddCurrent(string action, string entityType, string entityId, string summary)
    {
        var actorId = context.HttpContext?.User.FindFirstValue("sub") ?? "system";
        var correlationId = context.HttpContext?.TraceIdentifier ?? Guid.NewGuid().ToString("N");
        Add(actorId, action, entityType, entityId, summary, correlationId);
    }
}

internal sealed class AdminService(
    TafseelDbContext db,
    UserManager<ApplicationUser> users,
    RoleManager<IdentityRole> roles,
    IFinancialService finance,
    NotificationWriter notifications,
    AuditWriter audit,
    IOptions<LiveSessionOptions> liveSessionOptions,
    TimeProvider clock) : IAdminService
{
    private readonly LiveSessionOptions _liveSessions = liveSessionOptions.Value;
    private static string Normalise(string? value) => OperationFilters.Normalise(value);
    /// <summary>A capture still Pending after this long is an investigation, not an in-flight checkout.</summary>
    private const int StuckPaymentHours = 6;
    public async Task<PagedResult<AdminUserDto>> GetUsersAsync(
        int page, int pageSize, string? search, string? roleFilter, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.FullName.Contains(term) || (x.Email != null && x.Email.Contains(term)));
        }
        if (!string.IsNullOrWhiteSpace(roleFilter) && !string.Equals(roleFilter, "all", StringComparison.OrdinalIgnoreCase))
        {
            var requestedRole = string.Equals(roleFilter, "Reviewer", StringComparison.OrdinalIgnoreCase)
                ? Roles.QualityReviewer
                : Roles.All.SingleOrDefault(x => string.Equals(x, roleFilter, StringComparison.OrdinalIgnoreCase))
                    ?? throw new DomainException("invalid_role_filter", "The requested user role is invalid.");
            query = query.Where(user => db.UserRoles.Any(membership => membership.UserId == user.Id
                && db.Roles.Any(userRole => userRole.Id == membership.RoleId && userRole.Name == requestedRole)));
        }
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.FullName).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.Id, x.FullName, x.Email, x.IsSuspended, x.CreatedAt }).ToArrayAsync(ct);
        var ids = items.Select(x => x.Id).ToArray();
        var memberships = await (
            from ur in db.UserRoles.AsNoTracking()
            join role in db.Roles.AsNoTracking() on ur.RoleId equals role.Id
            where ids.Contains(ur.UserId)
            select new { ur.UserId, Role = role.Name! }).ToArrayAsync(ct);
        return new(items.Select(x => new AdminUserDto(x.Id, x.FullName, x.Email ?? "",
            x.IsSuspended, x.CreatedAt,
            memberships.Where(r => r.UserId == x.Id).Select(r => r.Role).ToArray())).ToArray(),
            page, pageSize, total);
    }

    public async Task SetSuspensionAsync(
        string adminId, string userId, bool suspended, CancellationToken ct)
    {
        if (adminId == userId) throw new DomainException("self_admin_change_forbidden", "Administrators cannot suspend themselves.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var user = await users.FindByIdAsync(userId)
            ?? throw new DomainException("user_not_found", "User was not found.");
        if (user.IsSuspended == suspended)
        {
            await tx.CommitAsync(ct);
            return;
        }
        user.IsSuspended = suspended;
        user.SecurityStamp = Guid.NewGuid().ToString("N");
        if (suspended && await db.TeacherProfiles.SingleOrDefaultAsync(x => x.TeacherId == userId, ct) is { } profile)
            profile.Unpublish(clock.GetUtcNow());
        audit.Add(adminId, suspended ? "UserSuspended" : "UserReactivated", "User", userId,
            suspended ? "Account suspended." : "Account reactivated.", $"user:{userId}:suspension:{clock.GetUtcNow().UtcTicks}");
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task SetRoleAsync(
        string adminId, string userId, string role, bool assigned, CancellationToken ct)
    {
        if (!Roles.All.Contains(role, StringComparer.Ordinal)
            || adminId == userId && role == Roles.Admin)
            throw new DomainException("role_change_forbidden", "The role change is not allowed.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        if (db.Database.IsSqlServer())
            await db.Database.AcquireAsync("admin-role-changes", ct);
        var user = await users.FindByIdAsync(userId)
            ?? throw new DomainException("user_not_found", "User was not found.");
        var current = await users.IsInRoleAsync(user, role);
        if (current == assigned)
        {
            await tx.CommitAsync(ct);
            return;
        }
        if (!assigned && role == Roles.Admin)
        {
            var adminRole = await roles.FindByNameAsync(Roles.Admin);
            if (adminRole is not null && await db.UserRoles.CountAsync(x => x.RoleId == adminRole.Id, ct) <= 1)
                throw new DomainException("last_admin_required", "The final Admin role cannot be removed.");
        }
        var result = assigned ? await users.AddToRoleAsync(user, role) : await users.RemoveFromRoleAsync(user, role);
        if (!result.Succeeded) throw new DomainException("role_update_failed", "Role could not be updated.");
        await users.UpdateSecurityStampAsync(user);
        audit.Add(adminId, assigned ? "RoleAssigned" : "RoleRemoved", "User", userId,
            $"{role} {(assigned ? "assigned" : "removed")}.", $"user:{userId}:role:{role}:{assigned}");
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task<DashboardMetrics> GetMetricsAsync(CancellationToken ct) =>
        new(await db.Users.CountAsync(ct),
            await UsersInRoleCountAsync(Roles.Student, activeOnly: true, ct),
            await UsersInRoleCountAsync(Roles.Teacher, activeOnly: true, ct),
            await db.TeacherApplications.CountAsync(x =>
                x.Status == Tafseel.Domain.TeacherApplications.TeacherApplicationStatus.Submitted
                || x.Status == Tafseel.Domain.TeacherApplications.TeacherApplicationStatus.UnderReview, ct),
            await db.Orders.CountAsync(ct),
            await db.Payments.Where(x => x.Status == PaymentStatus.Confirmed)
                .SumAsync(x => (decimal?)x.Amount, ct) ?? 0,
            await AccountBalanceAsync(LedgerAccountKind.PlatformRevenue, ct),
            await db.Disputes.CountAsync(x => x.Status != DisputeStatus.Resolved, ct),
            await db.WithdrawalRequests.CountAsync(x => x.Status == WithdrawalStatus.Pending, ct));

    public async Task<AdminAttentionDto> GetAttentionAsync(CancellationToken ct)
    {
        try
        {
            return await LoadAttentionAsync(ct);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested && IsTransientSql(ex))
        {
            return await LoadAttentionAsync(ct);
        }
    }

    /// <summary>
    /// Admin Home command-centre projection. Replaces the previous mount fan-out (13 collection
    /// loads) with one read-only summary. Each count uses the same predicate as the destination it
    /// deep-links to, so a card can never disagree with the list it opens. Reconciliation health is
    /// taken from the canonical financial reconciliation — never recomputed here.
    /// </summary>
    private async Task<AdminAttentionDto> LoadAttentionAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();

        var applications = await db.TeacherApplications.CountAsync(x =>
            x.Status == Tafseel.Domain.TeacherApplications.TeacherApplicationStatus.Submitted
            || x.Status == Tafseel.Domain.TeacherApplications.TeacherApplicationStatus.UnderReview, ct);

        var openDisputes = await db.Disputes.CountAsync(x => x.Status != DisputeStatus.Resolved, ct);

        // Same predicate as GetSessionsAsync' reviewRequired: the settlement window elapsed, escrow
        // is still Held, and no dispute is carrying the outcome. Only these need an Admin decision.
        // Cutoff is computed in-process so EF does not have to translate DateTimeOffset.AddMinutes.
        var passiveMinutes = _liveSessions.NoShowGraceMinutes + _liveSessions.SettlementReviewHours * 60;
        var silentCutoff = now.AddMinutes(-passiveMinutes);
        var silentSessions = await db.LiveSessionBookings.CountAsync(session =>
            session.Status == LiveSessionStatus.Confirmed
            && session.EndsAt <= silentCutoff
            && !db.Disputes.Any(d => d.LiveSessionBookingId == session.Id
                && (d.Status == DisputeStatus.Open || d.Status == DisputeStatus.UnderReview))
            && db.EscrowEntries.Any(e => e.LiveSessionBookingId == session.Id && e.Type == EscrowEntryType.Held)
            && !db.EscrowEntries.Any(e => e.LiveSessionBookingId == session.Id
                && (e.Type == EscrowEntryType.Released || e.Type == EscrowEntryType.Refunded)), ct);

        // Order.IsOverdue(now), expressed as a server-side predicate. Funded work past its agreed
        // delivery time is the non-delivery case Admin investigates.
        var overdueOrders = await db.Orders.CountAsync(x =>
            x.PaymentStatus == OrderPaymentStatus.Paid
            && (x.Status == OrderStatus.InProgress || x.Status == OrderStatus.RevisionRequested)
            && x.AgreedDeliveryAt < now, ct);

        var pendingWithdrawals = await db.WithdrawalRequests
            .CountAsync(x => x.Status == WithdrawalStatus.Pending, ct);
        var pendingPayoutProfiles = await db.TeacherPayoutProfiles
            .CountAsync(x => x.Status == PayoutVerificationStatus.Pending, ct);

        // A suspended account that still carries live commerce: suspension blocks new commerce but
        // preserves existing transactions, so these need an operator to finish the open work.
        var suspendedIds = await db.Users.Where(x => x.IsSuspended).Select(x => x.Id).ToArrayAsync(ct);
        var suspendedWithActiveCommerce = suspendedIds.Length == 0 ? 0
            : await db.Orders.Where(x =>
                    (suspendedIds.Contains(x.StudentId) || suspendedIds.Contains(x.TeacherId))
                    && x.PaymentStatus == OrderPaymentStatus.Paid
                    && (x.Status == OrderStatus.InProgress || x.Status == OrderStatus.Delivered
                        || x.Status == OrderStatus.RevisionRequested))
                .Select(x => suspendedIds.Contains(x.StudentId) ? x.StudentId : x.TeacherId)
                .Distinct().CountAsync(ct);

        // Capture started but never resolved by the provider. Stale beyond the settlement window is
        // an investigation, not a normal in-flight checkout.
        var stuckCutoff = now.AddHours(-StuckPaymentHours);
        var stuckPayments = await db.Payments.CountAsync(x =>
            x.Status == PaymentStatus.Pending && x.CreatedAt < stuckCutoff, ct);

        var reconciliation = await finance.ReconcileAsync(ct);
        var anomalies = reconciliation.UnbalancedEntries + reconciliation.OrphanPayments
            + reconciliation.OverReleasedPayments + reconciliation.AllocationMismatches
            + reconciliation.NegativeTeacherAvailableAccounts + reconciliation.NegativeTeacherPendingAccounts
            + reconciliation.OrphanPendingMaturities + reconciliation.MaturedAfterRefund
            + reconciliation.DuplicateBusinessKeys;

        var platform = new AdminPlatformSummaryDto(
            await db.Users.CountAsync(ct),
            await UsersInRoleCountAsync(Roles.Student, activeOnly: true, ct),
            await UsersInRoleCountAsync(Roles.Teacher, activeOnly: true, ct),
            await db.Orders.CountAsync(ct),
            await db.Payments.Where(x => x.Status == PaymentStatus.Confirmed)
                .SumAsync(x => (decimal?)x.Amount, ct) ?? 0,
            await AccountBalanceAsync(LedgerAccountKind.PlatformRevenue, ct),
            "SAR");

        return new(applications, openDisputes, silentSessions, overdueOrders,
            pendingWithdrawals, pendingPayoutProfiles, suspendedWithActiveCommerce, stuckPayments,
            reconciliation.IsBalanced, anomalies, platform);
    }

    public async Task<IReadOnlyCollection<PopularSubjectMetric>> GetPopularSubjectsAsync(CancellationToken ct)
    {
        var serviceCounts = await db.TeacherServices.AsNoTracking()
            .GroupBy(x => x.SubjectId)
            .Select(g => new { SubjectId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.SubjectId, x => x.Count, ct);
        var orderCounts = await (
            from order in db.Orders.AsNoTracking()
            join service in db.TeacherServices.AsNoTracking() on order.TeacherServiceId equals service.Id
            group order by service.SubjectId into g
            select new { SubjectId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.SubjectId, x => x.Count, ct);
        var subjects = await db.Subjects.AsNoTracking()
            .Select(x => new { x.Id, x.Name })
            .ToArrayAsync(ct);
        return subjects
            .Select(x => new PopularSubjectMetric(
                x.Id, x.Name,
                serviceCounts.GetValueOrDefault(x.Id),
                orderCounts.GetValueOrDefault(x.Id)))
            .OrderByDescending(x => x.Orders).ThenBy(x => x.Name).Take(10)
            .ToArray();
    }

    public async Task<PagedResult<AuditDto>> GetAuditAsync(
        int page, int pageSize, string? search, string? action, string? entityType, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.AuditLogEntries.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.ActorId.Contains(term) || x.Action.Contains(term)
                || x.EntityType.Contains(term) || x.EntityId.Contains(term)
                || x.Summary.Contains(term) || x.CorrelationId.Contains(term));
        }
        if (!string.IsNullOrWhiteSpace(action))
            query = query.Where(x => x.Action == action.Trim());
        if (!string.IsNullOrWhiteSpace(entityType))
            query = query.Where(x => x.EntityType == entityType.Trim());
        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(items.Select(x => new AuditDto(x.Id, x.ActorId, x.Action, x.EntityType,
            x.EntityId, x.Summary, x.CorrelationId, x.CreatedAt)).ToArray(), page, pageSize, total);
    }

    public async Task<PagedResult<AdminOperationItemDto>> GetRequestsAsync(
        int page, int pageSize, string? search, string? filter, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = from request in db.LearningRequests.AsNoTracking()
                    join student in db.Users.AsNoTracking() on request.StudentId equals student.Id
                    join teacher in db.Users.AsNoTracking() on request.TeacherId equals teacher.Id into teachers
                    from teacher in teachers.DefaultIfEmpty()
                    select new { request, student, teacher };
        // Enumerated, server-side filters. An unknown value filters nothing rather than erroring,
        // so a stale bookmark degrades to the unfiltered list instead of a blank surface.
        query = Normalise(filter) switch
        {
            "direct" => query.Where(x => x.request.SourcingMode == RequestSourcingMode.Direct),
            "marketplace" => query.Where(x => x.request.SourcingMode == RequestSourcingMode.OpenMarketplace),
            "awaiting-teacher" => query.Where(x => x.request.Status == LearningRequestStatus.PendingTeacherReview),
            "open" => query.Where(x => x.request.Status == LearningRequestStatus.OpenForOffers),
            "payment-reservation" => query.Where(x => x.request.Status == LearningRequestStatus.AwaitingPayment),
            "expired" => query.Where(x => x.request.Status == LearningRequestStatus.Expired),
            "converted" => query.Where(x => x.request.Status == LearningRequestStatus.ConvertedToOrder),
            _ => query
        };
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.request.Title.Contains(term) || x.student.FullName.Contains(term)
                || (x.teacher != null && x.teacher.FullName.Contains(term)));
        }
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.request.UpdatedAt).ThenBy(x => x.request.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new AdminOperationItemDto(
                x.request.Id, x.request.Title, x.student.FullName,
                x.teacher == null ? "" : x.teacher.FullName, (int)x.request.Status,
                x.request.CreatedAt, x.request.PreferredDeliveryAt,
                x.request.Budget ?? x.request.BudgetMin, "SAR", null, false, null,
                null, null, false, null, null, null, 0, null, false))
            .ToArrayAsync(ct);
        return new(rows, page, pageSize, total);
    }

    public async Task<PagedResult<AdminOperationItemDto>> GetOrdersAsync(
        int page, int pageSize, string? search, string? filter, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var now = clock.GetUtcNow();
        var query = from order in db.Orders.AsNoTracking()
                    join request in db.LearningRequests.AsNoTracking() on order.LearningRequestId equals request.Id
                    join student in db.Users.AsNoTracking() on order.StudentId equals student.Id
                    join teacher in db.Users.AsNoTracking() on order.TeacherId equals teacher.Id
                    select new { order, request, student, teacher };
        // "overdue" is Order.IsOverdue(now) as a translatable predicate — the same rule the Admin
        // Home attention card counts, so the card and the list it opens can never disagree.
        query = Normalise(filter) switch
        {
            "awaiting-payment" => query.Where(x => x.order.Status == OrderStatus.AwaitingPayment),
            "in-progress" => query.Where(x => x.order.Status == OrderStatus.InProgress),
            "overdue" => query.Where(x => x.order.PaymentStatus == OrderPaymentStatus.Paid
                && (x.order.Status == OrderStatus.InProgress || x.order.Status == OrderStatus.RevisionRequested)
                && x.order.AgreedDeliveryAt < now),
            "delivered" => query.Where(x => x.order.Status == OrderStatus.Delivered),
            "revision" => query.Where(x => x.order.Status == OrderStatus.RevisionRequested),
            "completed" => query.Where(x => x.order.Status == OrderStatus.Completed),
            "cancelled" => query.Where(x => x.order.Status == OrderStatus.Cancelled),
            "refunded" => query.Where(x => x.order.PaymentStatus == OrderPaymentStatus.Refunded),
            "disputed" => query.Where(x => db.Disputes.Any(d => d.OrderId == x.order.Id
                && d.Status != DisputeStatus.Resolved)),
            _ => query
        };
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.request.Title.Contains(term)
                || x.student.FullName.Contains(term) || x.teacher.FullName.Contains(term));
        }
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.order.UpdatedAt).ThenBy(x => x.order.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new AdminOperationItemDto(
                x.order.Id, x.request.Title, x.student.FullName, x.teacher.FullName,
                (int)x.order.Status, x.order.CreatedAt, x.order.AgreedDeliveryAt,
                x.order.StudentTotal, x.order.Currency,
                db.Payments.Where(payment => payment.OrderId == x.order.Id)
                    .Select(payment => (Guid?)payment.Id).SingleOrDefault(),
                x.order.PaymentStatus == OrderPaymentStatus.Paid
                    && !db.EscrowEntries.Any(entry => entry.OrderId == x.order.Id
                        && entry.Type == EscrowEntryType.Released)
                    && !db.Disputes.Any(dispute => dispute.OrderId == x.order.Id),
                x.order.PaymentStatus != OrderPaymentStatus.Paid ? "Payment is not captured."
                    : db.Disputes.Any(dispute => dispute.OrderId == x.order.Id) ? "Use dispute resolution."
                    : db.EscrowEntries.Any(entry => entry.OrderId == x.order.Id
                        && entry.Type == EscrowEntryType.Released) ? "Released funds require dispute resolution."
                    : null,
                null, null, false, null, null, null, 0, null, false)).ToArrayAsync(ct);
        return new(rows, page, pageSize, total);
    }

    public async Task<PagedResult<AdminOperationItemDto>> GetSessionsAsync(
        int page, int pageSize, string? search, string? filter, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var passiveMinutes = _liveSessions.NoShowGraceMinutes + _liveSessions.SettlementReviewHours * 60;
        var now = clock.GetUtcNow();
        var query = from session in db.LiveSessionBookings.AsNoTracking()
                    join student in db.Users.AsNoTracking() on session.StudentId equals student.Id
                    join teacher in db.Users.AsNoTracking() on session.TeacherId equals teacher.Id
                    select new { session, student, teacher };
        // "admin-review" is exactly the reviewRequired rule computed per row below, and exactly the
        // rule the Home attention card counts. One predicate, three surfaces.
        query = Normalise(filter) switch
        {
            "upcoming" => query.Where(x => x.session.Status == LiveSessionStatus.Confirmed
                && x.session.StartsAt > now),
            "awaiting-outcome" => query.Where(x => x.session.Status == LiveSessionStatus.Confirmed
                && x.session.EndsAt <= now && x.session.EndsAt.AddMinutes(passiveMinutes) > now),
            "admin-review" => query.Where(x => x.session.Status == LiveSessionStatus.Confirmed
                && x.session.EndsAt.AddMinutes(passiveMinutes) <= now
                && !db.Disputes.Any(d => d.LiveSessionBookingId == x.session.Id
                    && (d.Status == DisputeStatus.Open || d.Status == DisputeStatus.UnderReview))
                && db.EscrowEntries.Any(e => e.LiveSessionBookingId == x.session.Id
                    && e.Type == EscrowEntryType.Held)
                && !db.EscrowEntries.Any(e => e.LiveSessionBookingId == x.session.Id
                    && (e.Type == EscrowEntryType.Released || e.Type == EscrowEntryType.Refunded))),
            "no-show-pending" => query.Where(x =>
                x.session.Status == LiveSessionStatus.StudentNoShowPending
                || x.session.Status == LiveSessionStatus.TeacherNoShowPending
                || x.session.Status == LiveSessionStatus.CompletionPending),
            "completed" => query.Where(x => x.session.Status == LiveSessionStatus.Completed),
            "cancelled" => query.Where(x => x.session.Status == LiveSessionStatus.Cancelled),
            "disputed" => query.Where(x => db.Disputes.Any(d => d.LiveSessionBookingId == x.session.Id
                && d.Status != DisputeStatus.Resolved)),
            _ => query
        };
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.session.Title.Contains(term) || x.student.FullName.Contains(term)
                || x.teacher.FullName.Contains(term));
        }
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x =>
                x.session.Status == LiveSessionStatus.Confirmed
                && x.session.EndsAt.AddMinutes(passiveMinutes) <= now)
            .ThenByDescending(x => x.session.UpdatedAt).ThenBy(x => x.session.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.session, x.student.FullName, TeacherName = x.teacher.FullName })
            .ToArrayAsync(ct);
        var ids = items.Select(x => x.session.Id).ToArray();
        var payments = await db.Payments.AsNoTracking()
            .Where(x => x.LiveSessionBookingId != null && ids.Contains(x.LiveSessionBookingId.Value))
            .ToDictionaryAsync(x => x.LiveSessionBookingId!.Value, x => x.Id, ct);
        var disputes = await db.Disputes.AsNoTracking()
            .Where(x => x.LiveSessionBookingId != null && ids.Contains(x.LiveSessionBookingId.Value))
            .ToDictionaryAsync(x => x.LiveSessionBookingId!.Value, ct);
        var escrow = await db.EscrowEntries.AsNoTracking()
            .Where(x => x.LiveSessionBookingId != null && ids.Contains(x.LiveSessionBookingId.Value))
            .GroupBy(x => x.LiveSessionBookingId!.Value)
            .ToDictionaryAsync(x => x.Key, x => x.Select(e => e.Type).ToArray(), ct);
        var evidence = await db.Set<LiveSessionAttachment>().AsNoTracking()
            .Where(x => ids.Contains(x.LiveSessionBookingId))
            .GroupBy(x => x.LiveSessionBookingId)
            .ToDictionaryAsync(x => x.Key, x => x.Count(), ct);
        var rows = items.Select(x =>
        {
            disputes.TryGetValue(x.session.Id, out var dispute);
            var deadline = _liveSessions.PassiveOutcomeDeadline(x.session.EndsAt);
            var entries = escrow.GetValueOrDefault(x.session.Id, []);
            var escrowState = entries.Contains(EscrowEntryType.Released) ? "Released"
                : entries.Contains(EscrowEntryType.Refunded) ? "Refunded"
                : entries.Contains(EscrowEntryType.Held) ? "Held" : "None";
            var reviewRequired = x.session.Status == LiveSessionStatus.Confirmed && deadline <= now
                && dispute?.Status is not (DisputeStatus.Open or DisputeStatus.UnderReview)
                && escrowState == "Held";
            return new AdminOperationItemDto(
                x.session.Id, x.session.Title, x.FullName, x.TeacherName,
                (int)x.session.Status, x.session.CreatedAt, x.session.StartsAt,
                x.session.TotalPrice, x.session.Currency, payments.GetValueOrDefault(x.session.Id),
                false, null, x.session.EndsAt, deadline, reviewRequired,
                dispute?.Id, dispute is null ? null : (int)dispute.Status, escrowState,
                evidence.GetValueOrDefault(x.session.Id), Convert.ToBase64String(x.session.RowVersion),
                reviewRequired);
        }).ToArray();
        return new(rows, page, pageSize, total);
    }

    public Task ResolveSessionCompletedAsync(string adminId, Guid id, ResolvePassiveSessionOutcome input,
        string version, string idempotencyKey, CancellationToken ct) =>
        ResolvePassiveSessionAsync(adminId, id, input, version, idempotencyKey,
            PassiveSessionOutcome.Completed, ct);

    public Task ResolveSessionStudentNoShowAsync(string adminId, Guid id, ResolvePassiveSessionOutcome input,
        string version, string idempotencyKey, CancellationToken ct) =>
        ResolvePassiveSessionAsync(adminId, id, input, version, idempotencyKey,
            PassiveSessionOutcome.StudentNoShow, ct);

    public Task ResolveSessionTeacherNoShowAsync(string adminId, Guid id, ResolvePassiveSessionOutcome input,
        string version, string idempotencyKey, CancellationToken ct) =>
        ResolvePassiveSessionAsync(adminId, id, input, version, idempotencyKey,
            PassiveSessionOutcome.TeacherNoShow, ct);

    public async Task<Guid> EscalateSessionDisputeAsync(
        string adminId, Guid id, ResolvePassiveSessionOutcome input, string version,
        string idempotencyKey, CancellationToken ct)
    {
        var reason = input.Reason?.Trim() ?? "";
        if (reason.Length is 0 or > 2000)
            throw new DomainException("session_resolution_reason_required", "A resolution reason is required.");
        idempotencyKey = RequiredAdminKey(idempotencyKey);
        var correlationId = $"session:{id}:admin-dispute:{idempotencyKey}";
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await db.Database.AcquireAsync("dispute-session:" + id, ct);
        await db.Database.AcquireAsync("session-settlement:" + id, ct);
        var existing = await db.Disputes.SingleOrDefaultAsync(x => x.LiveSessionBookingId == id, ct);
        if (existing is not null)
        {
            if (await db.AuditLogEntries.AnyAsync(x => x.CorrelationId == correlationId, ct))
            {
                await tx.CommitAsync(ct);
                return existing.Id;
            }
            throw new DomainException("duplicate_dispute", "A dispute already exists for this live session.");
        }
        var booking = await db.LiveSessionBookings.SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("session_not_found", "Live session was not found.");
        if (booking.Status != LiveSessionStatus.Confirmed
            || clock.GetUtcNow() < _liveSessions.PassiveOutcomeDeadline(booking.EndsAt))
            throw new DomainException("session_not_pending_admin_review",
                "This live session does not require passive-outcome review.");
        ApplySessionVersion(booking, version);
        var dispute = Dispute.ForAdminLiveSession(
            booking.Id, booking.StudentId, booking.TeacherId, adminId, reason, clock.GetUtcNow());
        db.Add(dispute);
        audit.Add(adminId, "LiveSessionAdminEscalatedToDispute", "LiveSession", id.ToString(),
            reason, correlationId);
        foreach (var recipient in new[] { booking.StudentId, booking.TeacherId })
            await notifications.QueueAsync(recipient, "Dispute", "Live session outcome under review",
                $"Admin escalated the unresolved outcome for governance review. Reason: {reason}",
                AppRoutes.Dispute(dispute.Id), $"{correlationId}:{recipient}", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return dispute.Id;
    }

    private async Task ResolvePassiveSessionAsync(
        string adminId, Guid id, ResolvePassiveSessionOutcome input, string version,
        string idempotencyKey, PassiveSessionOutcome outcome, CancellationToken ct)
    {
        var reason = input.Reason?.Trim() ?? "";
        if (reason.Length is 0 or > 2000)
            throw new DomainException("session_resolution_reason_required", "A resolution reason is required.");
        idempotencyKey = RequiredAdminKey(idempotencyKey);
        var correlationId = $"session:{id}:admin-outcome:{idempotencyKey}";
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await db.Database.AcquireAsync("dispute-session:" + id, ct);
        await db.Database.AcquireAsync("session-settlement:" + id, ct);
        if (await db.AuditLogEntries.AnyAsync(x => x.CorrelationId == correlationId, ct))
        {
            await tx.CommitAsync(ct);
            return;
        }
        var booking = await db.LiveSessionBookings.SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("session_not_found", "Live session was not found.");
        if (booking.Status != LiveSessionStatus.Confirmed
            || clock.GetUtcNow() < _liveSessions.PassiveOutcomeDeadline(booking.EndsAt))
            throw new DomainException("session_not_pending_admin_review",
                "This live session does not require passive-outcome review.");
        if (await db.Disputes.AnyAsync(x => x.LiveSessionBookingId == id
                && x.Status != DisputeStatus.Resolved, ct))
            throw new DomainException("session_under_dispute",
                "This live session must be resolved through the dispute workflow.");
        if (await db.EscrowEntries.AnyAsync(x => x.LiveSessionBookingId == id
                && (x.Type == EscrowEntryType.Released || x.Type == EscrowEntryType.Refunded), ct))
            throw new DomainException("session_already_settled", "This live session has already moved escrow.");
        ApplySessionVersion(booking, version);
        var now = clock.GetUtcNow();
        switch (outcome)
        {
            case PassiveSessionOutcome.Completed:
                booking.ResolveCompletedByAdmin(adminId, now);
                await finance.ReleaseLiveSessionEscrowAsync(booking, adminId, ct);
                break;
            case PassiveSessionOutcome.StudentNoShow:
                booking.ResolveStudentNoShowByAdmin(adminId, now);
                await finance.ReleaseLiveSessionEscrowAsync(booking, adminId, ct);
                break;
            case PassiveSessionOutcome.TeacherNoShow:
                booking.ResolveTeacherNoShowByAdmin(adminId, now);
                await finance.RefundLiveSessionEscrowAsync(booking, adminId, idempotencyKey, ct);
                break;
        }
        audit.Add(adminId, $"LiveSessionAdmin{outcome}", "LiveSession", id.ToString(),
            $"{outcome}: {reason}", correlationId);
        foreach (var recipient in new[] { booking.StudentId, booking.TeacherId })
            await notifications.QueueAsync(recipient, "SessionOutcomeResolved",
                "Live session outcome resolved", $"Admin outcome: {outcome}. Reason: {reason}",
                AppRoutes.LiveSession(id), $"{correlationId}:{recipient}", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private void ApplySessionVersion(LiveSessionBooking booking, string version)
    {
        try { db.Entry(booking).Property(x => x.RowVersion).OriginalValue = Convert.FromBase64String(version.Trim('"')); }
        catch (FormatException) { throw new DomainException("invalid_concurrency_token", "Live session version is invalid."); }
    }

    private static string RequiredAdminKey(string value)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 or > 100)
            throw new DomainException("idempotency_key_required", "A valid Idempotency-Key is required.");
        return value;
    }

    private enum PassiveSessionOutcome { Completed, StudentNoShow, TeacherNoShow }

    private async Task<int> UsersInRoleCountAsync(string roleName, bool activeOnly, CancellationToken ct)
    {
        var roleId = await db.Roles.Where(x => x.Name == roleName).Select(x => x.Id).FirstOrDefaultAsync(ct);
        if (string.IsNullOrEmpty(roleId)) return 0;
        return await db.UserRoles.Join(db.Users, x => x.UserId, x => x.Id, (membership, user) => new { membership, user })
            .CountAsync(x => x.membership.RoleId == roleId && (!activeOnly || !x.user.IsSuspended), ct);
    }
    private async Task<decimal> AccountBalanceAsync(LedgerAccountKind kind, CancellationToken ct)
    {
        var ids = await db.LedgerAccounts.Where(x => x.Kind == kind).Select(x => x.Id).ToArrayAsync(ct);
        var credits = await db.LedgerEntries.Where(x => ids.Contains(x.CreditAccountId))
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var debits = await db.LedgerEntries.Where(x => ids.Contains(x.DebitAccountId))
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        return credits - debits;
    }

    private static bool IsTransientSql(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is TimeoutException or OperationCanceledException) return true;
            if (current is not DbException db) continue;
            var number = (current as Microsoft.Data.SqlClient.SqlException)?.Number;
            if (number is -2 or -1 or 2 or 1205 or 1222 or 3980) return true;
            var message = db.Message;
            if (message.Contains("timeout", StringComparison.OrdinalIgnoreCase)
                || message.Contains("severe error", StringComparison.OrdinalIgnoreCase)
                || message.Contains("batch is aborted", StringComparison.OrdinalIgnoreCase)
                || message.Contains("session busy", StringComparison.OrdinalIgnoreCase)
                || message.Contains("Operation cancelled", StringComparison.OrdinalIgnoreCase)
                || message.Contains("Operation canceled", StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return false;
    }
}
