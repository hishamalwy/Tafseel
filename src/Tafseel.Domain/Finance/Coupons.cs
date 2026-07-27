using Tafseel.Domain.Common;

namespace Tafseel.Domain.Finance;

public enum CouponDiscountType { Percent = 0, Fixed = 1 }

public sealed class Coupon
{
    private Coupon() { }

    public Coupon(
        string name,
        string code,
        CouponDiscountType discountType,
        decimal discountValue,
        DateTimeOffset? expiresAt,
        DateTimeOffset now)
    {
        Id = Guid.NewGuid();
        Rename(name);
        SetCode(code);
        SetDiscount(discountType, discountValue);
        ExpiresAt = expiresAt;
        IsActive = true;
        CreatedAt = UpdatedAt = now;
    }

    public Guid Id { get; private set; }
    public string Name { get; private set; } = "";
    public string Code { get; private set; } = "";
    public CouponDiscountType DiscountType { get; private set; }
    public decimal DiscountValue { get; private set; }
    public DateTimeOffset? ExpiresAt { get; private set; }
    public bool IsActive { get; private set; } = true;
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];

    public void Rename(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new DomainException("coupon_name_required", "Coupon name is required.");
        Name = name.Trim();
        if (Name.Length > 200)
            throw new DomainException("coupon_name_too_long", "Coupon name is too long.");
    }

    public void SetCode(string code)
    {
        var normalized = NormalizeCode(code);
        if (normalized.Length is < 3 or > 40)
            throw new DomainException("coupon_code_invalid", "Coupon code must be 3–40 characters.");
        Code = normalized;
    }

    public void SetDiscount(CouponDiscountType discountType, decimal discountValue)
    {
        if (discountValue <= 0)
            throw new DomainException("coupon_discount_invalid", "Discount value must be positive.");
        if (discountType == CouponDiscountType.Percent && discountValue > 100)
            throw new DomainException("coupon_percent_invalid", "Percent discount cannot exceed 100.");
        if (discountType == CouponDiscountType.Fixed && discountValue > 1_000_000m)
            throw new DomainException("coupon_fixed_invalid", "Fixed discount is too large.");
        DiscountType = discountType;
        DiscountValue = decimal.Round(discountValue, 2, MidpointRounding.AwayFromZero);
    }

    public void SetExpiresAt(DateTimeOffset? expiresAt) => ExpiresAt = expiresAt;

    public void SetActive(bool active, DateTimeOffset now)
    {
        IsActive = active;
        UpdatedAt = now;
    }

    public void Touch(DateTimeOffset now) => UpdatedAt = now;

    public bool IsRedeemableAt(DateTimeOffset now) =>
        IsActive && (ExpiresAt is null || ExpiresAt > now);

    public decimal ComputeDiscount(decimal baseAmount)
    {
        if (baseAmount <= 0)
            throw new DomainException("coupon_base_invalid", "Base amount must be positive.");
        var raw = DiscountType == CouponDiscountType.Percent
            ? baseAmount * DiscountValue / 100m
            : DiscountValue;
        var discount = decimal.Round(Math.Min(raw, baseAmount - 0.01m), 2, MidpointRounding.AwayFromZero);
        if (discount <= 0)
            throw new DomainException("coupon_no_effect", "Coupon does not reduce this amount.");
        return discount;
    }

    public static string NormalizeCode(string code) =>
        string.IsNullOrWhiteSpace(code)
            ? ""
            : new string(code.Trim().ToUpperInvariant().Where(c => char.IsLetterOrDigit(c) || c is '-' or '_').ToArray());
}

public sealed class CouponRedemption
{
    private CouponRedemption() { }

    public CouponRedemption(
        Guid couponId,
        string studentId,
        Guid paymentId,
        Guid? orderId,
        Guid? liveSessionBookingId,
        decimal discountAmount,
        string currency,
        DateTimeOffset now)
    {
        if (discountAmount <= 0)
            throw new DomainException("coupon_redemption_invalid", "Discount amount must be positive.");
        if (orderId.HasValue == liveSessionBookingId.HasValue)
            throw new DomainException("coupon_redemption_target", "Redemption must target exactly one payable.");
        Id = Guid.NewGuid();
        CouponId = couponId;
        StudentId = Payment.Required(studentId, 450);
        PaymentId = paymentId;
        OrderId = orderId;
        LiveSessionBookingId = liveSessionBookingId;
        DiscountAmount = Payment.Money(discountAmount);
        Currency = Payment.Required(currency, 3).ToUpperInvariant();
        RedeemedAt = now;
    }

    public Guid Id { get; private set; }
    public Guid CouponId { get; private set; }
    public string StudentId { get; private set; } = "";
    public Guid PaymentId { get; private set; }
    public Guid? OrderId { get; private set; }
    public Guid? LiveSessionBookingId { get; private set; }
    public decimal DiscountAmount { get; private set; }
    public string Currency { get; private set; } = "";
    public DateTimeOffset RedeemedAt { get; private set; }
}
