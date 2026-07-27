using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Finance;
using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Finance;

internal sealed class CouponService(TafseelDbContext db, TimeProvider clock) : ICouponService
{
    public async Task<IReadOnlyCollection<CouponDto>> ListAsync(CancellationToken ct)
    {
        var items = await db.Coupons.AsNoTracking().OrderByDescending(x => x.CreatedAt).ToListAsync(ct);
        return items.Select(Map).ToArray();
    }

    public async Task<CouponDto> CreateAsync(CreateCoupon input, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var coupon = new Coupon(input.Name, input.Code, input.DiscountType, input.DiscountValue, input.ExpiresAt, now);
        if (await db.Coupons.AnyAsync(x => x.Code == coupon.Code, ct))
            throw new DomainException("coupon_code_taken", "A coupon with this code already exists.");
        db.Add(coupon);
        await db.SaveChangesAsync(ct);
        return Map(coupon);
    }

    public async Task<CouponDto> UpdateAsync(Guid id, UpdateCoupon input, string expectedVersion, CancellationToken ct)
    {
        var coupon = await db.Coupons.SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("coupon_not_found", "Coupon was not found.");
        RequireVersion(coupon, expectedVersion);
        coupon.Rename(input.Name);
        coupon.SetDiscount(input.DiscountType, input.DiscountValue);
        coupon.SetExpiresAt(input.ExpiresAt);
        coupon.SetActive(input.IsActive, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
        return Map(coupon);
    }

    public async Task SetActiveAsync(Guid id, bool isActive, CancellationToken ct)
    {
        var coupon = await db.Coupons.SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("coupon_not_found", "Coupon was not found.");
        coupon.SetActive(isActive, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }

    public async Task<CouponQuoteDto> QuoteAsync(
        string code, decimal baseAmount, string currency, DateTimeOffset now, CancellationToken ct)
    {
        var coupon = await RequireRedeemableAsync(code, now, ct);
        var discount = coupon.ComputeDiscount(baseAmount);
        var charge = decimal.Round(baseAmount - discount, 2, MidpointRounding.AwayFromZero);
        return new(coupon.Code, baseAmount, discount, charge, currency.Trim().ToUpperInvariant());
    }

    public Task<(Coupon? Coupon, decimal Discount, decimal Charge)> ResolveForPaymentAsync(
        string? code, decimal baseAmount, string currency, DateTimeOffset now, CancellationToken ct) =>
        ApplyAsync(code, baseAmount, currency, now, ct);

    private async Task<(Coupon? Coupon, decimal Discount, decimal Charge)> ApplyAsync(
        string? code, decimal baseAmount, string currency, DateTimeOffset now, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(code))
            return (null, 0m, baseAmount);
        var coupon = await RequireRedeemableAsync(code, now, ct);
        var discount = coupon.ComputeDiscount(baseAmount);
        var charge = decimal.Round(baseAmount - discount, 2, MidpointRounding.AwayFromZero);
        if (charge < 0.01m)
            throw new DomainException("coupon_charge_invalid", "Coupon would reduce the charge below the minimum.");
        return (coupon, discount, charge);
    }

    private async Task<Coupon> RequireRedeemableAsync(string code, DateTimeOffset now, CancellationToken ct)
    {
        var normalized = Coupon.NormalizeCode(code);
        var coupon = await db.Coupons.SingleOrDefaultAsync(x => x.Code == normalized, ct)
            ?? throw new DomainException("coupon_not_found", "Coupon code was not found.");
        if (!coupon.IsRedeemableAt(now))
            throw new DomainException("coupon_not_redeemable", "Coupon is inactive or expired.");
        return coupon;
    }

    private static void RequireVersion(Coupon coupon, string expectedVersion)
    {
        var actual = Convert.ToBase64String(coupon.RowVersion);
        if (!string.Equals(actual, expectedVersion, StringComparison.Ordinal))
            throw new DomainException("coupon_version_conflict", "Coupon was modified by another request.");
    }

    private static CouponDto Map(Coupon x) => new(
        x.Id, x.Name, x.Code, x.DiscountType, x.DiscountValue, x.ExpiresAt, x.IsActive,
        x.CreatedAt, x.UpdatedAt, Convert.ToBase64String(x.RowVersion));
}
