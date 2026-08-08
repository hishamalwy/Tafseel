using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Tafseel.Application.Common;
using Tafseel.Application.MarketplaceIntelligence;
using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Marketplace;

internal sealed class MarketplaceIntelligenceService(
    TafseelDbContext db, TimeProvider clock, ILogger<MarketplaceIntelligenceService> logger)
    : IMarketplaceIntelligenceService
{
    private static readonly DateTimeOffset CoverageStartsAtUtc =
        new(2026, 8, 8, 0, 0, 0, TimeSpan.Zero);
    private static readonly string[] AllowedEvents =
        ["browse_viewed", "teacher_opened", "service_selected", "compare_opened", "request_started", "zero_result_viewed"];
    private static readonly string[] AllowedSurfaces =
        ["Landing", "Browse", "TeacherProfile", "Compare", "GuidedRequest", "StudentDashboard", "TeacherDashboard", "LiveScheduler"];

    public async Task<bool> TrackAsync(
        string? authenticatedUserId, TrackMarketplaceInteraction input, CancellationToken ct)
    {
        if (!AllowedEvents.Contains(input.EventName, StringComparer.Ordinal)
            || !AllowedSurfaces.Contains(input.SourceSurface, StringComparer.Ordinal))
            throw new DomainException("unsupported_analytics_event", "The interaction event is not supported.");
        if (string.IsNullOrWhiteSpace(input.ClientEventId)
            || string.IsNullOrWhiteSpace(authenticatedUserId) && string.IsNullOrWhiteSpace(input.AnonymousSessionId))
            throw new DomainException("invalid_analytics_identity", "A client event and first-party session are required.");
        if (input.EventName == "zero_result_viewed" && input.ResultCount != 0)
            throw new DomainException("invalid_zero_result_event", "A zero-result event must have a result count of zero.");
        if (input.SubjectId.HasValue
            && !await db.Subjects.AsNoTracking().AnyAsync(x => x.Id == input.SubjectId && x.IsActive, ct))
            throw new DomainException("invalid_analytics_context", "The marketplace context is not valid.");
        if (input.ServiceCatalogItemId.HasValue
            && !await db.ServiceCatalogItems.AsNoTracking().AnyAsync(x =>
                x.Id == input.ServiceCatalogItemId && x.IsActive && x.IsPublic, ct))
            throw new DomainException("invalid_analytics_context", "The marketplace context is not valid.");
        if (input.TeacherId is not null && !input.TeacherServiceId.HasValue
            && !await db.TeacherProfiles.AsNoTracking().AnyAsync(x =>
                x.TeacherId == input.TeacherId && x.IsPublished, ct))
            throw new DomainException("invalid_analytics_context", "The marketplace context is not valid.");

        var clientEventId = input.ClientEventId.Trim();
        if (await db.MarketplaceInteractionEvents.AnyAsync(x => x.ClientEventId == clientEventId, ct))
            return false;

        if (input.TeacherServiceId.HasValue)
        {
            var contextIsValid = await db.TeacherServices.AsNoTracking().AnyAsync(x =>
                x.Id == input.TeacherServiceId
                && (!input.SubjectId.HasValue || x.SubjectId == input.SubjectId)
                && (!input.ServiceCatalogItemId.HasValue || x.ServiceCatalogItemId == input.ServiceCatalogItemId)
                && (input.TeacherId == null || x.TeacherId == input.TeacherId), ct);
            if (!contextIsValid)
                throw new DomainException("invalid_analytics_context", "The marketplace context is not valid.");
        }

        db.MarketplaceInteractionEvents.Add(new(
            input.EventName, input.SourceSurface, clientEventId, clock.GetUtcNow(),
            authenticatedUserId, input.AnonymousSessionId?.Trim(), input.SubjectId,
            input.TeacherId, input.TeacherServiceId, input.ServiceCatalogItemId,
            input.ResultCount, input.QueryPresent, input.LanguageFilterPresent, input.PriceFilterPresent));
        try
        {
            await db.SaveChangesAsync(ct);
            return true;
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            if (await db.MarketplaceInteractionEvents.AnyAsync(x => x.ClientEventId == clientEventId, ct))
                return false;
            logger.LogWarning("Marketplace interaction ingestion failed for an allowed event.");
            throw;
        }
    }

    public async Task<MarketplaceIntelligenceReport> GetReportAsync(
        MarketplaceIntelligenceFilter filter, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var rangeEnd = filter.To ?? now;
        var rangeStart = filter.From ?? rangeEnd.AddDays(-30);
        if (rangeEnd <= rangeStart || rangeEnd - rangeStart > TimeSpan.FromDays(366) || rangeEnd > now.AddMinutes(5))
            throw new DomainException("invalid_analytics_range", "Choose a valid reporting range of at most 366 days.");

        var events = db.MarketplaceInteractionEvents.AsNoTracking().Where(x =>
            x.OccurredAtUtc >= rangeStart && x.OccurredAtUtc < rangeEnd
            && (!filter.SubjectId.HasValue || x.SubjectId == filter.SubjectId)
            && (!filter.ServiceCatalogItemId.HasValue || x.ServiceCatalogItemId == filter.ServiceCatalogItemId));

        var requests = from request in db.LearningRequests.AsNoTracking()
                       join service in db.TeacherServices.AsNoTracking() on request.TeacherServiceId equals service.Id
                       where request.CreatedAt >= rangeStart && request.CreatedAt < rangeEnd
                             && (!filter.SubjectId.HasValue || service.SubjectId == filter.SubjectId)
                             && (!filter.ServiceCatalogItemId.HasValue || request.ServiceCatalogItemId == filter.ServiceCatalogItemId)
                       select request;
        var orders = from order in db.Orders.AsNoTracking()
                     join service in db.TeacherServices.AsNoTracking() on order.TeacherServiceId equals service.Id
                     where order.CreatedAt >= rangeStart && order.CreatedAt < rangeEnd
                           && (!filter.SubjectId.HasValue || service.SubjectId == filter.SubjectId)
                           && (!filter.ServiceCatalogItemId.HasValue || order.ServiceCatalogItemId == filter.ServiceCatalogItemId)
                     select order;

        var browse = await events.CountAsync(x => x.EventName == "browse_viewed", ct);
        var opens = await events.CountAsync(x => x.EventName == "teacher_opened", ct);
        var selections = await events.CountAsync(x => x.EventName == "service_selected", ct);
        var starts = await events.CountAsync(x => x.EventName == "request_started", ct);
        var submitted = await requests.CountAsync(ct);
        var accepted = await orders.CountAsync(ct);

        var orderIdsInContext = from order in db.Orders.AsNoTracking()
                                join service in db.TeacherServices.AsNoTracking() on order.TeacherServiceId equals service.Id
                                where (!filter.SubjectId.HasValue || service.SubjectId == filter.SubjectId)
                                      && (!filter.ServiceCatalogItemId.HasValue || order.ServiceCatalogItemId == filter.ServiceCatalogItemId)
                                select order.Id;
        var payments = db.Payments.AsNoTracking().Where(x => x.OrderId.HasValue && orderIdsInContext.Contains(x.OrderId.Value));
        var paymentStarted = await payments.CountAsync(x => x.CreatedAt >= rangeStart && x.CreatedAt < rangeEnd, ct);
        var paid = await payments.CountAsync(x => x.Status == PaymentStatus.Confirmed
            && x.ConfirmedAt >= rangeStart && x.ConfirmedAt < rangeEnd, ct);
        var delivered = await db.OrderDeliveries.AsNoTracking().CountAsync(x =>
            orderIdsInContext.Contains(x.OrderId) && x.CreatedAt >= rangeStart && x.CreatedAt < rangeEnd, ct);
        var completed = await db.Set<OrderStatusHistory>().AsNoTracking().CountAsync(x =>
            orderIdsInContext.Contains(x.OrderId) && x.NextStatus == OrderStatus.Completed
            && x.CreatedAt >= rangeStart && x.CreatedAt < rangeEnd, ct);
        var reviewed = await db.TeacherReviews.AsNoTracking().CountAsync(x =>
            orderIdsInContext.Contains(x.OrderId) && x.CreatedAt >= rangeStart && x.CreatedAt < rangeEnd, ct);
        var zeroResults = await events.CountAsync(x => x.EventName == "zero_result_viewed", ct);

        var counts = new[] { browse, opens, selections, starts, submitted, accepted, paymentStarted, paid, delivered, completed, reviewed };
        var codes = new[] { "browse_viewed", "teacher_opened", "service_selected", "request_started", "request_submitted", "request_accepted", "payment_started", "payment_confirmed", "delivery_submitted", "order_completed", "review_submitted" };
        var sources = new[] { "interaction", "interaction", "interaction", "interaction", "LearningRequest.CreatedAt", "Order.CreatedAt", "Payment.CreatedAt", "Payment.ConfirmedAt", "OrderDelivery.CreatedAt", "OrderStatusHistory.Completed", "TeacherReview.CreatedAt" };
        var funnel = codes.Select((code, index) => new FunnelStageMetric(
            code, counts[index], index == counts.Length - 1 ? null : counts[index] - counts[index + 1],
            index == 0 ? null : Percent(counts[index], counts[index - 1]), sources[index])).ToArray();

        var dimensions = await GetDimensionsAsync(rangeStart, rangeEnd, filter, ct);
        var coverageComplete = rangeStart >= CoverageStartsAtUtc;
        return new(rangeStart, rangeEnd, CoverageStartsAtUtc, coverageComplete,
            new(coverageComplete ? browse : null, submitted, paid, completed,
                coverageComplete ? Percent(zeroResults, browse) : null), funnel, dimensions);
    }

    private async Task<IReadOnlyCollection<MarketplaceDimensionMetric>> GetDimensionsAsync(
        DateTimeOffset rangeStart, DateTimeOffset rangeEnd, MarketplaceIntelligenceFilter filter, CancellationToken ct)
    {
        var catalog = await (from service in db.TeacherServices.AsNoTracking()
            join subject in db.Subjects.AsNoTracking() on service.SubjectId equals subject.Id
            join item in db.ServiceCatalogItems.AsNoTracking() on service.ServiceCatalogItemId equals item.Id
            where service.IsActive && service.SupersededByTeacherServiceId == null && subject.IsActive && item.IsActive
                && (!filter.SubjectId.HasValue || subject.Id == filter.SubjectId)
                && (!filter.ServiceCatalogItemId.HasValue || item.Id == filter.ServiceCatalogItemId)
                && db.TeacherSubjectQualifications.Any(q => q.TeacherId == service.TeacherId
                    && q.SubjectId == service.SubjectId && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
            group service by new { subject.Id, subject.Name, subject.NameAr, ServiceId = item.Id, ServiceName = item.Name, ServiceNameAr = item.NameAr } into grouped
            orderby grouped.Key.Name, grouped.Key.ServiceName
            select new { grouped.Key, Offers = grouped.Count(), Teachers = grouped.Select(x => x.TeacherId).Distinct().Count() })
            .Take(200).ToArrayAsync(ct);

        var eventGroups = await db.MarketplaceInteractionEvents.AsNoTracking()
            .Where(x => x.OccurredAtUtc >= rangeStart && x.OccurredAtUtc < rangeEnd && x.SubjectId.HasValue && x.ServiceCatalogItemId.HasValue)
            .GroupBy(x => new { SubjectId = x.SubjectId!.Value, ServiceId = x.ServiceCatalogItemId!.Value })
            .Select(g => new { g.Key.SubjectId, g.Key.ServiceId,
                Browse = g.Count(x => x.EventName == "browse_viewed"),
                Opens = g.Count(x => x.EventName == "teacher_opened"),
                Zero = g.Count(x => x.EventName == "zero_result_viewed") })
            .OrderBy(x => x.SubjectId).ThenBy(x => x.ServiceId).Take(200).ToArrayAsync(ct);

        var requestGroups = await (from request in db.LearningRequests.AsNoTracking()
            join service in db.TeacherServices.AsNoTracking() on request.TeacherServiceId equals service.Id
            where request.CreatedAt >= rangeStart && request.CreatedAt < rangeEnd && request.ServiceCatalogItemId.HasValue
            group request by new { service.SubjectId, ServiceId = request.ServiceCatalogItemId!.Value } into grouped
            orderby grouped.Key.SubjectId, grouped.Key.ServiceId
            select new { grouped.Key.SubjectId, grouped.Key.ServiceId, Requests = grouped.Count() }).Take(200).ToArrayAsync(ct);

        var paidGroups = await (from payment in db.Payments.AsNoTracking()
            join order in db.Orders.AsNoTracking() on payment.OrderId equals order.Id
            join service in db.TeacherServices.AsNoTracking() on order.TeacherServiceId equals service.Id
            where order.ServiceCatalogItemId.HasValue && payment.Status == PaymentStatus.Confirmed
                && payment.ConfirmedAt >= rangeStart && payment.ConfirmedAt < rangeEnd
            group order by new { service.SubjectId, ServiceId = order.ServiceCatalogItemId!.Value } into grouped
            orderby grouped.Key.SubjectId, grouped.Key.ServiceId
            select new { grouped.Key.SubjectId, grouped.Key.ServiceId, Count = grouped.Count() }).Take(200).ToArrayAsync(ct);

        var completedGroups = await (from history in db.Set<OrderStatusHistory>().AsNoTracking()
            join order in db.Orders.AsNoTracking() on history.OrderId equals order.Id
            join service in db.TeacherServices.AsNoTracking() on order.TeacherServiceId equals service.Id
            where order.ServiceCatalogItemId.HasValue && history.NextStatus == OrderStatus.Completed
                && history.CreatedAt >= rangeStart && history.CreatedAt < rangeEnd
            group history by new { service.SubjectId, ServiceId = order.ServiceCatalogItemId!.Value } into grouped
            orderby grouped.Key.SubjectId, grouped.Key.ServiceId
            select new { grouped.Key.SubjectId, grouped.Key.ServiceId, Count = grouped.Count() }).Take(200).ToArrayAsync(ct);

        return catalog.Select(row =>
        {
            var interaction = eventGroups.SingleOrDefault(x => x.SubjectId == row.Key.Id && x.ServiceId == row.Key.ServiceId);
            var demand = requestGroups.SingleOrDefault(x => x.SubjectId == row.Key.Id && x.ServiceId == row.Key.ServiceId);
            var paidOutcome = paidGroups.SingleOrDefault(x => x.SubjectId == row.Key.Id && x.ServiceId == row.Key.ServiceId);
            var completedOutcome = completedGroups.SingleOrDefault(x => x.SubjectId == row.Key.Id && x.ServiceId == row.Key.ServiceId);
            return new MarketplaceDimensionMetric(row.Key.Id, row.Key.Name, row.Key.NameAr,
                row.Key.ServiceId, row.Key.ServiceName, row.Key.ServiceNameAr,
                row.Teachers, row.Offers, interaction?.Browse ?? 0, interaction?.Opens ?? 0,
                demand?.Requests ?? 0, paidOutcome?.Count ?? 0, completedOutcome?.Count ?? 0,
                interaction?.Zero ?? 0, Percent(interaction?.Zero ?? 0, interaction?.Browse ?? 0));
        }).ToArray();
    }

    private static decimal? Percent(int numerator, int denominator) =>
        denominator == 0 ? null : decimal.Round(numerator * 100m / denominator, 1, MidpointRounding.AwayFromZero);
}
