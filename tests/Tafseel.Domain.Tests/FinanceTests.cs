using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;

namespace Tafseel.Domain.Tests;

public sealed class FinanceTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 26, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Payment_confirmation_is_exact_and_idempotent()
    {
        var payment = CreatePayment();
        Assert.Throws<DomainException>(() => payment.Confirm(107.99m, "SAR", Now));
        Assert.True(payment.Confirm(108m, "sar", Now));
        Assert.False(payment.Confirm(108m, "SAR", Now));
    }

    [Fact]
    public void Ledger_entry_requires_positive_cross_account_transfer()
    {
        var account = Guid.NewGuid();
        Assert.Throws<DomainException>(() =>
            new LedgerEntry("key", account, account, 10, "SAR", "Payment", "1", Now));
        Assert.Throws<DomainException>(() =>
            new LedgerEntry("key", account, Guid.NewGuid(), 0, "SAR", "Payment", "1", Now));
    }

    [Fact]
    public void Withdrawal_is_terminal_and_idempotent()
    {
        var item = new WithdrawalRequest("teacher", 50, "SAR", "key", Now);
        Assert.True(item.Complete("provider-ref", Now.AddMinutes(1)));
        Assert.False(item.Complete("provider-ref", Now.AddMinutes(2)));
        Assert.Throws<DomainException>(() => item.Reject(Now.AddMinutes(3)));
    }

    [Fact]
    public void Live_session_payment_requires_booking_target()
    {
        var bookingId = Guid.NewGuid();
        var payment = Payment.ForLiveSession(bookingId, "student", 90, "SAR", "Mock", "ref", "key", Now);
        Assert.Null(payment.OrderId);
        Assert.Equal(bookingId, payment.LiveSessionBookingId);
        Assert.True(payment.Confirm(90, "SAR", Now));
    }

    private static Payment CreatePayment() =>
        new(Guid.NewGuid(), "student", 108, "SAR", "Mock", "ref", "key", Now);
}
