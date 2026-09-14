using Tafseel.Domain.Common;
using Tafseel.Domain.Marketing;

namespace Tafseel.Domain.Tests;

public sealed class PromotionTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 14, 12, 0, 0, TimeSpan.Zero);

    private static Promotion Discount() =>
        new(PromotionKind.Discount, "20% off your first request", "خصم 20% على أول طلب لك", Now);

    [Fact]
    public void New_promotion_takes_the_accent_of_its_kind_and_starts_active()
    {
        var promotion = Discount();
        Assert.Equal(PromotionAccents.Violet, promotion.Accent);
        Assert.True(promotion.IsActive);
        Assert.True(promotion.IsLiveAt(Now));
    }

    [Fact]
    public void Both_language_titles_are_required()
    {
        Assert.Throws<DomainException>(() => new Promotion(PromotionKind.Feature, "", "عنوان", Now));
        Assert.Throws<DomainException>(() => new Promotion(PromotionKind.Feature, "Title", "   ", Now));
    }

    [Fact]
    public void Publication_window_bounds_visibility()
    {
        var promotion = Discount();
        Configure(promotion, startsAt: Now.AddDays(1), endsAt: Now.AddDays(3));
        Assert.False(promotion.IsLiveAt(Now));
        Assert.True(promotion.IsLiveAt(Now.AddDays(2)));
        Assert.False(promotion.IsLiveAt(Now.AddDays(4)));
    }

    [Fact]
    public void Inactive_promotions_are_never_live()
    {
        var promotion = Discount();
        promotion.SetActive(false, Now);
        Assert.False(promotion.IsLiveAt(Now));
    }

    [Fact]
    public void Window_must_end_after_it_starts()
    {
        var promotion = Discount();
        Assert.Throws<DomainException>(() =>
            Configure(promotion, startsAt: Now.AddDays(3), endsAt: Now.AddDays(1)));
    }

    [Fact]
    public void Coupon_code_is_normalized_and_unsupported_accents_are_rejected()
    {
        var promotion = Discount();
        Configure(promotion, couponCode: " tafseel-20 ");
        Assert.Equal("TAFSEEL-20", promotion.CouponCode);
        Assert.Throws<DomainException>(() => Configure(promotion, accent: "chartreuse"));
    }

    [Theory]
    [InlineData("teachers")]
    [InlineData("/teachers")]
    [InlineData("#how")]
    [InlineData("https://tafseel.example/offer")]
    public void Relative_and_https_links_are_accepted(string href)
    {
        var promotion = Discount();
        Configure(promotion, ctaHref: href);
        Assert.Equal(href, promotion.CtaHref);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("http://tafseel.example/offer")]
    [InlineData("data:text/html,<script>")]
    public void Other_link_schemes_are_rejected(string href)
    {
        var promotion = Discount();
        Assert.Throws<DomainException>(() => Configure(promotion, ctaHref: href));
    }

    [Fact]
    public void Display_order_stays_inside_its_range()
    {
        var promotion = Discount();
        Assert.Throws<DomainException>(() => Configure(promotion, displayOrder: -1));
        Assert.Throws<DomainException>(() => Configure(promotion, displayOrder: 10001));
    }

    private static void Configure(
        Promotion promotion,
        string? couponCode = null,
        string? ctaHref = null,
        string? accent = null,
        DateTimeOffset? startsAt = null,
        DateTimeOffset? endsAt = null,
        int displayOrder = 0) =>
        promotion.Configure(
            PromotionKind.Discount,
            "20% off your first request", "خصم 20% على أول طلب لك",
            eyebrowEn: "Limited offer", eyebrowAr: "عرض لفترة محدودة",
            bodyEn: null, bodyAr: null,
            highlightEn: "20%", highlightAr: "20%",
            couponCode: couponCode,
            ctaLabelEn: null, ctaLabelAr: null, ctaHref: ctaHref,
            accent: accent,
            startsAt: startsAt, endsAt: endsAt,
            displayOrder: displayOrder,
            now: Now);
}
