using System.ComponentModel.DataAnnotations;
using Tafseel.Domain.Marketing;

namespace Tafseel.Application.Marketing;

/// <summary>
/// A promo as the public landing page consumes it. Copy ships in both languages
/// because the landing page toggles language client-side without a refetch.
/// </summary>
public sealed record PromotionDto(
    Guid Id,
    PromotionKind Kind,
    string KindCode,
    string Accent,
    string EyebrowEn,
    string EyebrowAr,
    string TitleEn,
    string TitleAr,
    string BodyEn,
    string BodyAr,
    string HighlightEn,
    string HighlightAr,
    string CouponCode,
    string CtaLabelEn,
    string CtaLabelAr,
    string CtaHref,
    DateTimeOffset? StartsAt,
    DateTimeOffset? EndsAt,
    int DisplayOrder);

/// <summary>Admin view: adds lifecycle fields the public payload omits.</summary>
public sealed record AdminPromotionDto(
    Guid Id,
    PromotionKind Kind,
    string KindCode,
    string Accent,
    string EyebrowEn,
    string EyebrowAr,
    string TitleEn,
    string TitleAr,
    string BodyEn,
    string BodyAr,
    string HighlightEn,
    string HighlightAr,
    string CouponCode,
    string CtaLabelEn,
    string CtaLabelAr,
    string CtaHref,
    DateTimeOffset? StartsAt,
    DateTimeOffset? EndsAt,
    int DisplayOrder,
    bool IsActive,
    bool IsLive,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string Version);

public sealed record PromotionInput(
    PromotionKind Kind,
    [param: Required, StringLength(160)] string TitleEn,
    [param: Required, StringLength(160)] string TitleAr,
    [param: StringLength(60)] string? EyebrowEn,
    [param: StringLength(60)] string? EyebrowAr,
    [param: StringLength(400)] string? BodyEn,
    [param: StringLength(400)] string? BodyAr,
    [param: StringLength(24)] string? HighlightEn,
    [param: StringLength(24)] string? HighlightAr,
    [param: StringLength(40)] string? CouponCode,
    [param: StringLength(60)] string? CtaLabelEn,
    [param: StringLength(60)] string? CtaLabelAr,
    [param: StringLength(400)] string? CtaHref,
    [param: StringLength(20)] string? Accent,
    DateTimeOffset? StartsAt,
    DateTimeOffset? EndsAt,
    [param: Range(0, 10000)] int DisplayOrder);

/// <summary>Public counters shown on the landing page's mini dashboard.</summary>
public sealed record PlatformStatsDto(int Students, int Teachers, int Subjects, int CompletedSessions);

public interface IPromotionService
{
    /// <summary>Active promos inside their publication window, in display order.</summary>
    Task<IReadOnlyCollection<PromotionDto>> GetLiveAsync(CancellationToken ct);
    Task<IReadOnlyCollection<AdminPromotionDto>> ListAsync(CancellationToken ct);
    Task<AdminPromotionDto> CreateAsync(PromotionInput input, CancellationToken ct);
    Task<AdminPromotionDto> UpdateAsync(Guid id, PromotionInput input, string expectedVersion, CancellationToken ct);
    Task SetActiveAsync(Guid id, bool isActive, CancellationToken ct);
    Task DeleteAsync(Guid id, CancellationToken ct);
}

public interface IPlatformStatsService
{
    Task<PlatformStatsDto> GetAsync(CancellationToken ct);
}
