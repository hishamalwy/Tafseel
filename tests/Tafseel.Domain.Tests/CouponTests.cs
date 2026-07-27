using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;

namespace Tafseel.Domain.Tests;

public sealed class CouponTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 27, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Percent_coupon_reduces_base_and_leaves_minimum_charge()
    {
        var coupon = new Coupon("Welcome", "WELCOME20", CouponDiscountType.Percent, 20, null, Now);
        Assert.Equal(20m, coupon.ComputeDiscount(100m));
        Assert.True(coupon.IsRedeemableAt(Now));
    }

    [Fact]
    public void Expired_or_inactive_coupons_are_not_redeemable()
    {
        var coupon = new Coupon("Ramadan", "RAMADAN25", CouponDiscountType.Percent, 25, Now.AddDays(-1), Now);
        Assert.False(coupon.IsRedeemableAt(Now));
        coupon.SetActive(false, Now);
        var active = new Coupon("Exam", "EXAMWEEK", CouponDiscountType.Fixed, 15, Now.AddDays(7), Now);
        active.SetActive(false, Now);
        Assert.False(active.IsRedeemableAt(Now));
    }

    [Fact]
    public void Invalid_discount_rules_are_rejected()
    {
        Assert.Throws<DomainException>(() =>
            new Coupon("Bad", "BAD", CouponDiscountType.Percent, 120, null, Now));
        Assert.Throws<DomainException>(() =>
            new Coupon("Bad", "AB", CouponDiscountType.Fixed, 5, null, Now));
    }
}
