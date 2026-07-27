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
        var item = new ServiceCatalogItem("Service " + Guid.NewGuid().ToString("N"), "Desc", input);
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
        var item = new ServiceCatalogItem("Live Session", "Desc", "live_session");
        var ex = Assert.Throws<DomainException>(() => item.Update(
            "Live Session", "Desc", "recorded_explanation", null, true, true, true, null, 30, null, 40));
        Assert.Equal("service_code_immutable", ex.Code);
        Assert.Equal("live_session", item.Code);
    }

    [Fact]
    public void Same_code_update_is_allowed()
    {
        var item = new ServiceCatalogItem("Live Session", "Desc", "live_session");
        item.Update("Live Session Updated", "New desc", "LIVE_SESSION", null, true, true, true, [30, 60], 40, null, 10);
        Assert.Equal("live_session", item.Code);
        Assert.Equal("Live Session Updated", item.Name);
        Assert.Equal(40, item.MinPrice);
    }
}
