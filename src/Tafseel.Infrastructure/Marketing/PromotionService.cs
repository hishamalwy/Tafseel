using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Marketing;
using Tafseel.Domain.Common;
using Tafseel.Domain.Marketing;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Marketing;

internal sealed class PromotionService(TafseelDbContext db, TimeProvider clock) : IPromotionService
{
    public async Task<IReadOnlyCollection<PromotionDto>> GetLiveAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var items = await db.Promotions.AsNoTracking()
            .Where(x => x.IsActive
                && (x.StartsAt == null || x.StartsAt <= now)
                && (x.EndsAt == null || x.EndsAt > now))
            .OrderBy(x => x.DisplayOrder).ThenByDescending(x => x.CreatedAt)
            .ToListAsync(ct);
        return items.Select(MapPublic).ToArray();
    }

    public async Task<IReadOnlyCollection<AdminPromotionDto>> ListAsync(CancellationToken ct)
    {
        var items = await db.Promotions.AsNoTracking()
            .OrderBy(x => x.DisplayOrder).ThenByDescending(x => x.CreatedAt)
            .ToListAsync(ct);
        var now = clock.GetUtcNow();
        return items.Select(x => MapAdmin(x, now)).ToArray();
    }

    public async Task<AdminPromotionDto> CreateAsync(PromotionInput input, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var promotion = new Promotion(input.Kind, input.TitleEn, input.TitleAr, now);
        Apply(promotion, input, now);
        db.Add(promotion);
        await db.SaveChangesAsync(ct);
        return MapAdmin(promotion, now);
    }

    public async Task<AdminPromotionDto> UpdateAsync(
        Guid id, PromotionInput input, string expectedVersion, CancellationToken ct)
    {
        var promotion = await RequireAsync(id, ct);
        RequireVersion(promotion, expectedVersion);
        var now = clock.GetUtcNow();
        Apply(promotion, input, now);
        await db.SaveChangesAsync(ct);
        return MapAdmin(promotion, now);
    }

    public async Task SetActiveAsync(Guid id, bool isActive, CancellationToken ct)
    {
        var promotion = await RequireAsync(id, ct);
        promotion.SetActive(isActive, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        var promotion = await RequireAsync(id, ct);
        db.Remove(promotion);
        await db.SaveChangesAsync(ct);
    }

    private static void Apply(Promotion promotion, PromotionInput input, DateTimeOffset now) =>
        promotion.Configure(
            input.Kind, input.TitleEn, input.TitleAr,
            input.EyebrowEn, input.EyebrowAr,
            input.BodyEn, input.BodyAr,
            input.HighlightEn, input.HighlightAr,
            input.CouponCode,
            input.CtaLabelEn, input.CtaLabelAr, input.CtaHref,
            input.Accent, input.StartsAt, input.EndsAt, input.DisplayOrder, now);

    private async Task<Promotion> RequireAsync(Guid id, CancellationToken ct) =>
        await db.Promotions.SingleOrDefaultAsync(x => x.Id == id, ct)
        ?? throw new DomainException("promotion_not_found", "Promotion was not found.");

    private static void RequireVersion(Promotion promotion, string expectedVersion)
    {
        var actual = Convert.ToBase64String(promotion.RowVersion);
        if (!string.Equals(actual, expectedVersion, StringComparison.Ordinal))
            throw new DomainException("promotion_version_conflict", "Promotion was modified by another request.");
    }

    private static string KindCode(PromotionKind kind) => kind switch
    {
        PromotionKind.Discount => "discount",
        PromotionKind.Feature => "feature",
        PromotionKind.Announcement => "announcement",
        PromotionKind.Spotlight => "spotlight",
        _ => "event"
    };

    private static PromotionDto MapPublic(Promotion x) => new(
        x.Id, x.Kind, KindCode(x.Kind), x.Accent,
        x.EyebrowEn, x.EyebrowAr, x.TitleEn, x.TitleAr, x.BodyEn, x.BodyAr,
        x.HighlightEn, x.HighlightAr, x.CouponCode,
        x.CtaLabelEn, x.CtaLabelAr, x.CtaHref,
        x.StartsAt, x.EndsAt, x.DisplayOrder);

    private static AdminPromotionDto MapAdmin(Promotion x, DateTimeOffset now) => new(
        x.Id, x.Kind, KindCode(x.Kind), x.Accent,
        x.EyebrowEn, x.EyebrowAr, x.TitleEn, x.TitleAr, x.BodyEn, x.BodyAr,
        x.HighlightEn, x.HighlightAr, x.CouponCode,
        x.CtaLabelEn, x.CtaLabelAr, x.CtaHref,
        x.StartsAt, x.EndsAt, x.DisplayOrder,
        x.IsActive, x.IsLiveAt(now), x.CreatedAt, x.UpdatedAt,
        Convert.ToBase64String(x.RowVersion));
}
