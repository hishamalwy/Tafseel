using System.ComponentModel.DataAnnotations;

namespace Tafseel.Application.MarketplaceIntelligence;

public sealed record TrackMarketplaceInteraction(
    [param: Required, MaxLength(40)] string EventName,
    [param: Required, MaxLength(40)] string SourceSurface,
    [param: Required, MaxLength(100)] string ClientEventId,
    [param: MaxLength(100)] string? AnonymousSessionId,
    Guid? SubjectId,
    [param: MaxLength(450)] string? TeacherId,
    Guid? TeacherServiceId,
    Guid? ServiceCatalogItemId,
    [param: Range(0, 10000)] int? ResultCount,
    bool QueryPresent = false,
    bool LanguageFilterPresent = false,
    bool PriceFilterPresent = false);

public sealed record MarketplaceIntelligenceFilter(
    DateTimeOffset? From = null, DateTimeOffset? To = null,
    Guid? SubjectId = null, Guid? ServiceCatalogItemId = null);

public sealed record FunnelStageMetric(
    string Code, int Count, int? DropOff, decimal? ConversionPercent, string Source);

public sealed record MarketplaceIntelligenceKpis(
    int? BrowseViews, int RequestSubmissions, int PaidOrders, int CompletedOrders,
    decimal? ZeroResultRatePercent);

public sealed record MarketplaceDimensionMetric(
    Guid SubjectId, string SubjectName, string SubjectNameAr,
    Guid ServiceCatalogItemId, string ServiceName, string ServiceNameAr,
    int EligibleTeachers, int ActiveOffers, int BrowseViews, int TeacherOpens,
    int RequestSubmissions, int PaidOrders, int CompletedOrders,
    int ZeroResults, decimal? ZeroResultRatePercent);

public sealed record MarketplaceIntelligenceReport(
    DateTimeOffset From, DateTimeOffset To, DateTimeOffset CoverageStartsAtUtc,
    bool InteractionCoverageComplete, MarketplaceIntelligenceKpis Overview,
    IReadOnlyCollection<FunnelStageMetric> Funnel,
    IReadOnlyCollection<MarketplaceDimensionMetric> Dimensions);

public interface IMarketplaceIntelligenceService
{
    Task<bool> TrackAsync(string? authenticatedUserId, TrackMarketplaceInteraction input, CancellationToken ct);
    Task<MarketplaceIntelligenceReport> GetReportAsync(MarketplaceIntelligenceFilter filter, CancellationToken ct);
}
