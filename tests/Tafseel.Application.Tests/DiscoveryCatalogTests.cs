using Tafseel.Application.Ai;
using Tafseel.Application.Catalog;

namespace Tafseel.Application.Tests;

public sealed class DiscoveryCatalogTests
{
    [Theory]
    [InlineData("رياضيات")]
    [InlineData("calculus")]
    [InlineData("التكامل")]
    [InlineData("Mathematics")]
    public void Subject_aliases_resolve_only_to_canonical_mathematics(string text)
    {
        var math = new CatalogItemDto(Guid.NewGuid(), "Mathematics", true, NameAr: "الرياضيات", NameEn: "Mathematics");
        var physics = new CatalogItemDto(Guid.NewGuid(), "Physics", true, NameAr: "الفيزياء", NameEn: "Physics");
        var resolved = DiscoveryCatalogResolver.ResolveSubject(text, null, [math, physics]);
        Assert.Equal(math.Id, resolved.Single?.Id);
    }

    [Fact]
    public void Topic_context_helps_mathematics_without_creating_subjects()
    {
        var math = new CatalogItemDto(Guid.NewGuid(), "Mathematics", true, NameAr: "الرياضيات");
        var resolved = DiscoveryCatalogResolver.ResolveSubject(null, "في التكامل", [math]);
        Assert.Equal(math.Id, resolved.Single?.Id);
    }

    [Fact]
    public void Existing_calculus_named_subject_still_resolves_from_its_own_name()
    {
        var calculus = new CatalogItemDto(Guid.NewGuid(), "Calculus ab12", true, NameAr: "التفاضل ab12");
        var physics = new CatalogItemDto(Guid.NewGuid(), "Physics", true, NameAr: "الفيزياء");
        var resolved = DiscoveryCatalogResolver.ResolveSubject("Calculus ab12", null, [calculus, physics]);
        Assert.Equal(calculus.Id, resolved.Single?.Id);
    }

    [Fact]
    public void Live_service_intent_prefers_catalog_code()
    {
        var live = new CatalogItemDto(Guid.NewGuid(), "Live session", true, Code: "live_session", NameAr: "جلسة مباشرة")
        { OrderType = "live_session" };
        var asyncItem = new CatalogItemDto(Guid.NewGuid(), "Recorded explanation", true, Code: "recorded_explanation")
        { OrderType = "async_request" };
        var resolved = DiscoveryCatalogResolver.ResolveService("live_session", "جلسة مباشرة", [live, asyncItem]);
        Assert.Equal(live.Id, resolved.Single?.Id);
    }

    [Fact]
    public void Thursday_resolves_to_today_when_today_is_thursday_in_viewer_zone()
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById("UTC");
        var thursday = new DateTimeOffset(2026, 8, 6, 15, 0, 0, TimeSpan.Zero);
        var resolved = DiscoveryCalendar.ResolveUpcoming("الخميس", null, thursday, zone);
        Assert.Equal(new DateOnly(2026, 8, 6), resolved);
    }

    [Fact]
    public void Thursday_after_weekday_rolls_forward_to_next_thursday()
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById("UTC");
        var friday = new DateTimeOffset(2026, 8, 7, 9, 0, 0, TimeSpan.Zero);
        var resolved = DiscoveryCalendar.ResolveUpcoming("Thursday", null, friday, zone);
        Assert.Equal(new DateOnly(2026, 8, 13), resolved);
    }
}
