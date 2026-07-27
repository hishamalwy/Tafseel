using System.ComponentModel.DataAnnotations;
using Tafseel.Domain.Finance;

namespace Tafseel.Application.Finance;

public sealed record CouponDto(
    Guid Id,
    string Name,
    string Code,
    CouponDiscountType DiscountType,
    decimal DiscountValue,
    DateTimeOffset? ExpiresAt,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string Version);

public sealed record CreateCoupon(
    [param: Required, StringLength(200)] string Name,
    [param: Required, StringLength(40)] string Code,
    CouponDiscountType DiscountType,
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal DiscountValue,
    DateTimeOffset? ExpiresAt);

public sealed record UpdateCoupon(
    [param: Required, StringLength(200)] string Name,
    CouponDiscountType DiscountType,
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal DiscountValue,
    DateTimeOffset? ExpiresAt,
    bool IsActive);

public sealed record ApplyCouponRequest([param: StringLength(40)] string? CouponCode);

public sealed record CouponQuoteDto(
    string Code,
    decimal BaseAmount,
    decimal DiscountAmount,
    decimal ChargeAmount,
    string Currency);

public interface ICouponService
{
    Task<IReadOnlyCollection<CouponDto>> ListAsync(CancellationToken ct);
    Task<CouponDto> CreateAsync(CreateCoupon input, CancellationToken ct);
    Task<CouponDto> UpdateAsync(Guid id, UpdateCoupon input, string expectedVersion, CancellationToken ct);
    Task SetActiveAsync(Guid id, bool isActive, CancellationToken ct);
    Task<CouponQuoteDto> QuoteAsync(string code, decimal baseAmount, string currency, DateTimeOffset now, CancellationToken ct);
    Task<(Domain.Finance.Coupon? Coupon, decimal Discount, decimal Charge)> ResolveForPaymentAsync(
        string? code, decimal baseAmount, string currency, DateTimeOffset now, CancellationToken ct);
}
