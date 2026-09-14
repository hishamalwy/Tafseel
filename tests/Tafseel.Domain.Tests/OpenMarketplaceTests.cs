using Tafseel.Domain.Common;
using Tafseel.Domain.Orders;

namespace Tafseel.Domain.Tests;

public sealed class OpenMarketplaceTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 11, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Open_request_allows_omitted_budget_and_requires_a_canonical_subject()
    {
        var request = Request();
        Assert.Equal(RequestSourcingMode.OpenMarketplace, request.SourcingMode);
        Assert.Equal(LearningRequestStatus.OpenForOffers, request.Status);
        Assert.Null(request.TeacherId);
        Assert.Null(request.BudgetMin);
        Assert.Null(request.BudgetMax);

        var error = Assert.Throws<DomainException>(() => new LearningRequest(
            "student", Guid.Empty, "Title", "Requirements", Now.AddDays(2), null, null, Now));
        Assert.Equal("subject_required", error.Code);
    }

    [Fact]
    public void Invalid_budget_range_is_rejected()
    {
        var error = Assert.Throws<DomainException>(() => new LearningRequest(
            "student", Guid.NewGuid(), "Title", "Requirements", Now.AddDays(2), 200, 100, Now));
        Assert.Equal("invalid_request_budget", error.Code);
    }

    [Fact]
    public void Selection_is_exactly_two_hours_and_timeout_reopens_request()
    {
        var request = Request();
        var offerId = Guid.NewGuid();
        request.SelectOffer("student", offerId, Now);
        Assert.Equal(Now.AddHours(2), request.PaymentReservationExpiresAt);
        Assert.False(request.ExpireOfferSelection(Now.AddHours(2).AddTicks(-1)));
        Assert.True(request.ExpireOfferSelection(Now.AddHours(2)));
        Assert.Equal(LearningRequestStatus.OpenForOffers, request.Status);
        Assert.Null(request.SelectedOfferId);
    }

    [Fact]
    public void Open_request_expires_only_at_its_deadline()
    {
        var request = Request();
        Assert.False(request.Expire(request.PreferredDeliveryAt.AddTicks(-1)));
        Assert.True(request.Expire(request.PreferredDeliveryAt));
        Assert.False(request.Expire(request.PreferredDeliveryAt.AddHours(1)));
        Assert.Equal(LearningRequestStatus.Expired, request.Status);
    }

    [Fact]
    public void Selected_offer_terms_are_immutable_and_reopen_after_cancel()
    {
        var offer = new TeacherOffer(Guid.NewGuid(), "teacher", Guid.NewGuid(), 120, 48, "Proposal", Now);
        offer.Select(Now);
        Assert.Throws<DomainException>(() => offer.Update("teacher", 100, 24, "Changed", Now.AddMinutes(1)));
        Assert.Throws<DomainException>(() => offer.Withdraw("teacher", Now.AddMinutes(1)));
        offer.Reopen(Now.AddMinutes(2));
        offer.Update("teacher", 100, 24, "Changed", Now.AddMinutes(3));
        Assert.Equal(100, offer.Amount);
        Assert.Equal(TeacherOfferStatus.Submitted, offer.Status);
    }

    [Fact]
    public void Offer_exposes_scope_and_cannot_be_selected_after_validity_expires()
    {
        var offer = new TeacherOffer(Guid.NewGuid(), "teacher", Guid.NewGuid(), 120, 48,
            3, "Proposal", Now.AddHours(24), Now);
        Assert.Equal(3, offer.IncludedRevisions);
        Assert.Equal(Now.AddHours(24), offer.ValidUntil);
        var error = Assert.Throws<DomainException>(() => offer.Select(Now.AddHours(24)));
        Assert.Equal("offer_expired", error.Code);
        Assert.Equal(TeacherOfferStatus.Submitted, offer.Status);
    }

    private static LearningRequest Request() => new(
        "student", Guid.NewGuid(), "Chapter 4", "Explain every exercise",
        Now.AddDays(2), null, null, Now);
}
