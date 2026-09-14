using Tafseel.Domain.Common;

namespace Tafseel.Domain.Marketing;

/// <summary>
/// The shape an admin picks when publishing a promo slot on the landing page.
/// Each kind renders differently on the front end, so the kind is part of the
/// contract rather than a cosmetic hint.
/// </summary>
public enum PromotionKind
{
    Discount = 0,
    Feature = 1,
    Announcement = 2,
    Spotlight = 3,
    Event = 4
}

public static class PromotionAccents
{
    public const string Violet = "violet";
    public const string Emerald = "emerald";
    public const string Amber = "amber";
    public const string Sky = "sky";
    public const string Rose = "rose";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
        { Violet, Emerald, Amber, Sky, Rose };

    public static string ForKind(PromotionKind kind) => kind switch
    {
        PromotionKind.Discount => Violet,
        PromotionKind.Feature => Sky,
        PromotionKind.Spotlight => Amber,
        PromotionKind.Event => Rose,
        _ => Emerald
    };
}

/// <summary>
/// An admin-published landing-page promo. Copy is stored bilingually because the
/// landing page switches language client-side without refetching.
/// </summary>
public sealed class Promotion
{
    private Promotion() { }

    public Promotion(
        PromotionKind kind,
        string titleEn,
        string titleAr,
        DateTimeOffset now)
    {
        Id = Guid.NewGuid();
        Kind = ValidateKind(kind);
        SetTitles(titleEn, titleAr);
        Accent = PromotionAccents.ForKind(kind);
        IsActive = true;
        CreatedAt = UpdatedAt = now;
    }

    public Guid Id { get; private set; }
    public PromotionKind Kind { get; private set; }

    /// <summary>Small badge above the title — "Limited offer", "New".</summary>
    public string EyebrowEn { get; private set; } = "";
    public string EyebrowAr { get; private set; } = "";

    public string TitleEn { get; private set; } = "";
    public string TitleAr { get; private set; } = "";
    public string BodyEn { get; private set; } = "";
    public string BodyAr { get; private set; } = "";

    /// <summary>The oversized figure the layout leads with — "20%", "3x", "NEW".</summary>
    public string HighlightEn { get; private set; } = "";
    public string HighlightAr { get; private set; } = "";

    /// <summary>Optional coupon shown as a copyable code on discount promos.</summary>
    public string CouponCode { get; private set; } = "";

    public string CtaLabelEn { get; private set; } = "";
    public string CtaLabelAr { get; private set; } = "";
    public string CtaHref { get; private set; } = "";

    public string Accent { get; private set; } = PromotionAccents.Violet;

    /// <summary>Publication window. <see cref="EndsAt"/> also drives the countdown.</summary>
    public DateTimeOffset? StartsAt { get; private set; }
    public DateTimeOffset? EndsAt { get; private set; }

    public int DisplayOrder { get; private set; }
    public bool IsActive { get; private set; } = true;
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];

    public void Configure(
        PromotionKind kind,
        string titleEn,
        string titleAr,
        string? eyebrowEn,
        string? eyebrowAr,
        string? bodyEn,
        string? bodyAr,
        string? highlightEn,
        string? highlightAr,
        string? couponCode,
        string? ctaLabelEn,
        string? ctaLabelAr,
        string? ctaHref,
        string? accent,
        DateTimeOffset? startsAt,
        DateTimeOffset? endsAt,
        int displayOrder,
        DateTimeOffset now)
    {
        Kind = ValidateKind(kind);
        SetTitles(titleEn, titleAr);
        EyebrowEn = Optional(eyebrowEn, 60, "promotion_eyebrow_too_long");
        EyebrowAr = Optional(eyebrowAr, 60, "promotion_eyebrow_too_long");
        BodyEn = Optional(bodyEn, 400, "promotion_body_too_long");
        BodyAr = Optional(bodyAr, 400, "promotion_body_too_long");
        HighlightEn = Optional(highlightEn, 24, "promotion_highlight_too_long");
        HighlightAr = Optional(highlightAr, 24, "promotion_highlight_too_long");
        SetCoupon(couponCode);
        SetCta(ctaLabelEn, ctaLabelAr, ctaHref);
        SetAccent(accent);
        SetWindow(startsAt, endsAt);
        SetDisplayOrder(displayOrder);
        UpdatedAt = now;
    }

    public void SetActive(bool active, DateTimeOffset now)
    {
        IsActive = active;
        UpdatedAt = now;
    }

    /// <summary>True when the promo should be served to the public landing page.</summary>
    public bool IsLiveAt(DateTimeOffset now) =>
        IsActive
        && (StartsAt is null || StartsAt <= now)
        && (EndsAt is null || EndsAt > now);

    private void SetTitles(string titleEn, string titleAr)
    {
        TitleEn = Required(titleEn, 160, "promotion_title_en_required", "promotion_title_too_long");
        TitleAr = Required(titleAr, 160, "promotion_title_ar_required", "promotion_title_too_long");
    }

    private void SetCoupon(string? couponCode)
    {
        var normalized = string.IsNullOrWhiteSpace(couponCode)
            ? ""
            : new string(couponCode.Trim().ToUpperInvariant()
                .Where(c => char.IsLetterOrDigit(c) || c is '-' or '_').ToArray());
        if (normalized.Length > 40)
            throw new DomainException("promotion_coupon_invalid", "Promotion coupon code is too long.");
        CouponCode = normalized;
    }

    private void SetCta(string? labelEn, string? labelAr, string? href)
    {
        var link = (href ?? "").Trim();
        if (link.Length > 400)
            throw new DomainException("promotion_cta_href_invalid", "Promotion link is too long.");
        // Landing pages are static documents served from the same origin, so a
        // promo may only point at a relative path or an https destination.
        if (link.Length > 0
            && !link.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            && !link.StartsWith('/')
            && !link.StartsWith('#')
            && link.Contains(':'))
            throw new DomainException("promotion_cta_href_invalid", "Promotion link must be relative or https.");
        CtaHref = link;
        CtaLabelEn = Optional(labelEn, 60, "promotion_cta_label_too_long");
        CtaLabelAr = Optional(labelAr, 60, "promotion_cta_label_too_long");
    }

    private void SetAccent(string? accent)
    {
        var normalized = (accent ?? "").Trim().ToLowerInvariant();
        if (normalized.Length == 0) normalized = PromotionAccents.ForKind(Kind);
        if (!PromotionAccents.All.Contains(normalized))
            throw new DomainException("promotion_accent_invalid", "Promotion accent is not supported.");
        Accent = normalized;
    }

    private void SetWindow(DateTimeOffset? startsAt, DateTimeOffset? endsAt)
    {
        if (startsAt.HasValue && endsAt.HasValue && endsAt <= startsAt)
            throw new DomainException("promotion_window_invalid", "Promotion must end after it starts.");
        StartsAt = startsAt;
        EndsAt = endsAt;
    }

    private void SetDisplayOrder(int displayOrder)
    {
        if (displayOrder is < 0 or > 10000)
            throw new DomainException("promotion_display_order_invalid", "Promotion display order is invalid.");
        DisplayOrder = displayOrder;
    }

    private static PromotionKind ValidateKind(PromotionKind kind) =>
        Enum.IsDefined(kind) ? kind : throw new DomainException("promotion_kind_invalid", "Promotion kind is not supported.");

    private static string Required(string value, int maxLength, string requiredCode, string lengthCode)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new DomainException(requiredCode, "Promotion text is required in both languages.");
        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
            throw new DomainException(lengthCode, "Promotion text is too long.");
        return trimmed;
    }

    private static string Optional(string? value, int maxLength, string lengthCode)
    {
        var trimmed = (value ?? "").Trim();
        if (trimmed.Length > maxLength)
            throw new DomainException(lengthCode, "Promotion text is too long.");
        return trimmed;
    }
}
