using Tafseel.Domain.Catalog;
using Tafseel.Domain.Common;

namespace Tafseel.Domain.Tests;

public sealed class ServiceCatalogCodeTests
{
    [Theory]
    [InlineData("Live Session", "live_session")]
    [InlineData("live_session", "live_session")]
    [InlineData("LIVE-SESSION", "live_session")]
    [InlineData("  exam_revision  ", "exam_revision")]
    public void Codes_normalize_to_lowercase_snake_case(string input, string expected)
    {
        var item = new ServiceCatalogItem(
            "Service " + Guid.NewGuid().ToString("N"), "Desc", input, "خدمة", "وصف");
        Assert.Equal(expected, item.Code);
        Assert.Equal(expected, ServiceCatalogItem.NormalizeCode(input));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("1live")]
    [InlineData("live.session")]
    [InlineData("جلسة")]
    public void Invalid_codes_are_rejected(string input)
    {
        Assert.Throws<DomainException>(() => ServiceCatalogItem.NormalizeCode(input));
    }

    [Fact]
    public void Code_is_immutable_after_creation()
    {
        var item = new ServiceCatalogItem("Live Session", "Desc", "live_session", "جلسة مباشرة", "وصف");
        var ex = Assert.Throws<DomainException>(() => item.Update(
            "Live Session", "Desc", "recorded_explanation", null, true, true, true, null, 30, null, 40,
            "جلسة مباشرة", "وصف"));
        Assert.Equal("service_code_immutable", ex.Code);
        Assert.Equal("live_session", item.Code);
    }

    [Fact]
    public void Same_code_update_is_allowed()
    {
        var item = new ServiceCatalogItem("Live Session", "Desc", "live_session", "جلسة مباشرة", "وصف");
        item.Update(
            "Live Session Updated", "New desc", "LIVE_SESSION", null, true, true, true, [30, 60], 40, null, 10,
            "جلسة مباشرة محدّثة", "وصف جديد");
        Assert.Equal("live_session", item.Code);
        Assert.Equal("Live Session Updated", item.Name);
        Assert.Equal(40, item.MinPrice);
        Assert.Equal("جلسة مباشرة محدّثة", item.NameAr);
        Assert.Equal("وصف جديد", item.DescriptionAr);
    }

    [Fact]
    public void Code_from_english_name_matches_normalize()
    {
        Assert.Equal("custom_recorded_explanation", ServiceCatalogItem.CodeFromEnglishName("Custom recorded explanation"));
    }

    [Fact]
    public void Constructor_requires_arabic_name_and_description()
    {
        var missingName = Assert.Throws<DomainException>(() =>
            new ServiceCatalogItem("Live Session", "Desc", "live_session", " ", "وصف"));
        Assert.Equal("service_name_ar_required", missingName.Code);

        var missingDescription = Assert.Throws<DomainException>(() =>
            new ServiceCatalogItem("Live Session", "Desc", "live_session", "جلسة مباشرة", " "));
        Assert.Equal("service_description_ar_required", missingDescription.Code);
    }

    [Fact]
    public void Configure_localized_content_rejects_missing_arabic_name()
    {
        var item = new ServiceCatalogItem(
            "Live Session", "Desc", "live_session", "جلسة مباشرة", "وصف");
        var ex = Assert.Throws<DomainException>(() =>
            item.ConfigureLocalizedContent("Live Session", " ", "Desc", "وصف", 10));
        Assert.Equal("service_name_ar_required", ex.Code);
    }

    [Fact]
    public void Backfill_only_fills_empty_arabic_fields()
    {
        var item = new ServiceCatalogItem(
            "Live Session", "Desc", "live_session_backfill_" + Guid.NewGuid().ToString("N")[..6],
            "جلسة", "وصف أولي");
        item.BackfillLocalization("جلسة مباشرة", "وصف بديل");
        Assert.Equal("جلسة", item.NameAr);
        Assert.Equal("وصف أولي", item.DescriptionAr);
    }

    [Fact]
    public void Ensure_complete_localization_passes_for_bilingual_active_service()
    {
        var item = new ServiceCatalogItem(
            "Live Session", "Desc", "live_session", "جلسة مباشرة", "وصف");
        item.EnsureCompleteLocalization();
        Assert.True(item.IsActive);
        Assert.Equal("Desc", item.Description);
        Assert.Equal("وصف", item.DescriptionAr);
    }
}
