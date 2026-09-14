using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;

namespace Tafseel.Domain.Tests;

public sealed class EarningsMaturityTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 19, 12, 0, 0, TimeSpan.Zero);

    private static TeacherEarningMaturity Pending(DateTimeOffset? maturesAt = null) =>
        TeacherEarningMaturity.ForOrder(Guid.NewGuid(), Guid.NewGuid(), "teacher-1", 85m, "SAR",
            maturesAt ?? Now.AddDays(7), Now);

    [Fact]
    public void Exposure_ends_one_window_after_the_dispute_reference_timestamp()
    {
        var delivered = Now;
        Assert.Equal(delivered.AddDays(7), EarningsExposurePolicy.ExposureEndsAt(delivered, 7));
        Assert.True(EarningsExposurePolicy.IsExposed(delivered, 7, delivered.AddDays(7)));
        Assert.False(EarningsExposurePolicy.IsExposed(delivered, 7, delivered.AddDays(7).AddSeconds(1)));
    }

    [Fact]
    public void A_purchase_that_can_never_be_disputed_carries_no_exposure()
    {
        Assert.Null(EarningsExposurePolicy.ExposureEndsAt(null, 7));
        Assert.False(EarningsExposurePolicy.IsExposed(null, 7, Now));
    }

    [Fact]
    public void Earnings_are_due_only_strictly_after_the_last_disputable_instant()
    {
        var maturity = Pending();
        Assert.False(maturity.IsDue(Now));
        Assert.False(maturity.IsDue(maturity.MaturesAt));
        Assert.True(maturity.IsDue(maturity.MaturesAt.AddTicks(1)));
    }

    [Fact]
    public void Maturing_before_the_deadline_is_rejected()
    {
        var maturity = Pending();
        var error = Assert.Throws<DomainException>(() => maturity.Mature(maturity.MaturesAt));
        Assert.Equal("earning_not_matured", error.Code);
        Assert.Equal(TeacherEarningMaturityStatus.Pending, maturity.Status);
    }

    [Fact]
    public void Maturing_twice_moves_money_once()
    {
        var maturity = Pending();
        var after = maturity.MaturesAt.AddMinutes(1);
        Assert.True(maturity.Mature(after));
        Assert.False(maturity.Mature(after));
        Assert.Equal(TeacherEarningMaturityStatus.Matured, maturity.Status);
        Assert.Equal(after, maturity.SettledAt);
    }

    [Fact]
    public void Reversing_twice_is_idempotent_and_blocks_later_maturity()
    {
        var maturity = Pending();
        Assert.True(maturity.Reverse(Now));
        Assert.False(maturity.Reverse(Now));
        var error = Assert.Throws<DomainException>(() => maturity.Mature(maturity.MaturesAt.AddDays(30)));
        Assert.Equal("earning_maturity_reversed", error.Code);
    }

    [Fact]
    public void A_matured_earning_cannot_be_reversed_out_of_clearance()
    {
        var maturity = Pending();
        maturity.Mature(maturity.MaturesAt.AddMinutes(1));
        var error = Assert.Throws<DomainException>(() => maturity.Reverse(Now));
        Assert.Equal("earning_already_matured", error.Code);
    }

    [Fact]
    public void An_earning_must_target_exactly_one_payable_and_carry_a_positive_amount()
    {
        Assert.Throws<DomainException>(() => TeacherEarningMaturity.ForOrder(
            Guid.NewGuid(), Guid.NewGuid(), "teacher-1", 0m, "SAR", Now.AddDays(7), Now));
        var order = TeacherEarningMaturity.ForOrder(
            Guid.NewGuid(), Guid.NewGuid(), "teacher-1", 85m, "SAR", Now.AddDays(7), Now);
        var session = TeacherEarningMaturity.ForLiveSession(
            Guid.NewGuid(), Guid.NewGuid(), "teacher-1", 85m, "SAR", Now.AddDays(7), Now);
        Assert.NotNull(order.OrderId);
        Assert.Null(order.LiveSessionBookingId);
        Assert.Null(session.OrderId);
        Assert.NotNull(session.LiveSessionBookingId);
        // Business keys are stable and distinct so the promotion ledger entry cannot collide.
        Assert.EndsWith(":teacher-maturity", order.BusinessKey);
        Assert.EndsWith(":teacher-maturity", session.BusinessKey);
        Assert.NotEqual(order.BusinessKey, session.BusinessKey);
    }
}
