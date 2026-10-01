using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Finance;
using Tafseel.Domain.Common;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Orders;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Finance;

internal sealed class CouponCheckoutQuoteService(
    TafseelDbContext db, IFinancialService finance, ICouponService coupons, TimeProvider clock)
    : ICouponCheckoutQuoteService
{
    public async Task<CouponQuoteDto> QuoteAsync(
        string studentId, string kind, Guid id, string code, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(code))
            throw new DomainException("coupon_code_invalid", "Enter a coupon code.");

        decimal amount;
        string currency;
        switch (kind)
        {
            case "orders":
                {
                    var order = await db.Orders.AsNoTracking().SingleOrDefaultAsync(
                        x => x.Id == id && x.StudentId == studentId, ct)
                        ?? throw new DomainException("order_not_owned", "Order was not found.");
                    if (order.Status != OrderStatus.AwaitingPayment || order.PaymentStatus != OrderPaymentStatus.Pending)
                        throw new DomainException("payment_not_allowed", "This order cannot be paid.");
                    amount = order.StudentTotal;
                    currency = order.Currency;
                    break;
                }
            case "live-sessions":
                {
                    var session = await db.LiveSessionBookings.AsNoTracking().SingleOrDefaultAsync(
                        x => x.Id == id && x.StudentId == studentId, ct)
                        ?? throw new DomainException("live_session_not_owned", "Live session was not found.");
                    if (session.Status != LiveSessionStatus.AwaitingPayment)
                        throw new DomainException("payment_not_allowed", "This live session cannot be paid.");
                    amount = session.TotalPrice;
                    currency = session.Currency;
                    break;
                }
            case "open-requests":
                {
                    var quote = await finance.QuoteOpenRequestPaymentAsync(studentId, id, ct);
                    amount = quote.Total;
                    currency = quote.Currency;
                    break;
                }
            default:
                throw new DomainException("payment_not_allowed", "This payment target is not supported.");
        }

        var couponQuote = await coupons.QuoteAsync(code, amount, currency, clock.GetUtcNow(), ct);
        if (couponQuote.ChargeAmount < 0.01m)
            throw new DomainException("coupon_charge_invalid", "Coupon would reduce the charge below the minimum.");
        return couponQuote;
    }
}
