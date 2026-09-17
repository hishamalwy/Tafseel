using Tafseel.Domain.Common;
using Tafseel.Domain.Orders;

namespace Tafseel.Domain.Tests;

/// <summary>
/// UX-09 / DEC-13: a Direct Request keeps the Teacher Offering price the student actually saw when they
/// sent it. It is written once, by the server, and nothing afterwards can change it — not an edit to the
/// offering, not acceptance at another price, not a second capture.
/// </summary>
public sealed class LearningRequestListedPriceTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 17, 10, 0, 0, TimeSpan.Zero);

    private static LearningRequest Direct() =>
        new("student", "teacher", Guid.NewGuid(), "Chain rule", "Explain the worked examples",
            Now.AddDays(3), 200, Now);

    private static LearningRequest Open() =>
        new("student", Guid.NewGuid(), "Chain rule", "Explain the worked examples", Now.AddDays(3), null, null, Now);

    [Fact]
    public void A_direct_request_starts_without_a_price_it_has_not_been_told()
    {
        var request = Direct();

        Assert.Null(request.ListedPriceAtRequest);
        Assert.Null(request.ListedCurrencyAtRequest);
    }

    [Fact]
    public void The_price_the_student_saw_is_captured_once()
    {
        var request = Direct();

        request.CaptureListedPrice(100m, "SAR");

        Assert.Equal(100m, request.ListedPriceAtRequest);
        Assert.Equal("SAR", request.ListedCurrencyAtRequest);
    }

    [Fact]
    public void A_second_capture_is_refused_so_history_cannot_be_rewritten()
    {
        var request = Direct();
        request.CaptureListedPrice(100m, "SAR");

        var error = Assert.Throws<DomainException>(() => request.CaptureListedPrice(120m, "SAR"));

        Assert.Equal("listed_price_immutable", error.Code);
        Assert.Equal(100m, request.ListedPriceAtRequest);
        Assert.Equal("SAR", request.ListedCurrencyAtRequest);
    }

    [Fact]
    public void An_open_request_never_carries_a_listed_price()
    {
        // The price of an open request comes from the Teacher Offer the student chose, not from an offering.
        var error = Assert.Throws<DomainException>(() => Open().CaptureListedPrice(100m, "SAR"));

        Assert.Equal("listed_price_direct_only", error.Code);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(1_000_001)]
    public void A_price_outside_the_offering_bounds_is_refused(decimal price)
    {
        var error = Assert.Throws<DomainException>(() => Direct().CaptureListedPrice(price, "SAR"));

        Assert.Equal("invalid_listed_price", error.Code);
    }

    [Theory]
    [InlineData("")]
    [InlineData("S")]
    [InlineData("SARS")]
    public void A_price_without_a_real_currency_is_refused(string currency)
    {
        var error = Assert.Throws<DomainException>(() => Direct().CaptureListedPrice(100m, currency));

        Assert.Equal("invalid_listed_currency", error.Code);
    }

    [Fact]
    public void Accepting_at_another_price_leaves_the_captured_price_alone()
    {
        var request = Direct();
        request.CaptureListedPrice(100m, "SAR");

        request.Accept("teacher", "idem-1", Now.AddHours(1));

        Assert.Equal(100m, request.ListedPriceAtRequest);
        Assert.Equal("SAR", request.ListedCurrencyAtRequest);
    }

    [Fact]
    public void The_snapshot_is_whole_or_absent_but_never_half()
    {
        var captured = Direct();
        captured.CaptureListedPrice(100m, "SAR");
        Assert.True(captured.ListedPriceAtRequest.HasValue && captured.ListedCurrencyAtRequest is not null);

        var untouched = Direct();
        Assert.True(!untouched.ListedPriceAtRequest.HasValue && untouched.ListedCurrencyAtRequest is null);

        // A refused capture leaves nothing behind either.
        var refused = Direct();
        Assert.Throws<DomainException>(() => refused.CaptureListedPrice(0m, "SAR"));
        Assert.Null(refused.ListedPriceAtRequest);
        Assert.Null(refused.ListedCurrencyAtRequest);
    }
}
