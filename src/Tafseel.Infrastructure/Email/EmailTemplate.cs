using System.Text;
using System.Text.Encodings.Web;

namespace Tafseel.Infrastructure.Email;

/// <summary>
/// Accent used for the kicker label, picked per email's place in Brand System 02.0's
/// "color with intent" system. The CTA button always stays Electric Violet — that's the
/// system's fixed "primary action" color, never reassigned.
/// </summary>
internal enum EmailAccent
{
    /// <summary>Human Coral — people &amp; warmth. Welcomes, activations.</summary>
    Warmth,
    /// <summary>Warm Bone — brand authority on the dark card. Security-sensitive actions.</summary>
    Authority,
    /// <summary>Live Cyan — sessions &amp; data. Reminders, message/activity notifications.</summary>
    Activity,
}

/// <summary>
/// Renders transactional emails against Tafseel Brand System 02.0. The hero mirrors the
/// app's dark "aside" panel (see the auth page's tf-auth-aside): near-black canvas, a dot
/// grid, two soft violet/acid glows, and the scan-bracket mark — so a confirmation email
/// reads as unmistakably Tafseel instead of a generic transactional template. Table-based
/// markup with inline styles only, so it survives Outlook/Gmail's stripped stylesheets;
/// the dot grid and glows are a background-image progressive enhancement — clients that
/// ignore it (Outlook desktop) just see the flat near-black card, which is still on-brand.
/// </summary>
internal static class EmailTemplate
{
    private const string Violet = "#5538F2";
    private const string NearBlack = "#121318";
    private const string CardDark = "#1B1C24";
    private const string WarmBone = "#F3F0E8";
    private const string BorderOnDark = "#33333F";
    private const string MutedOnDark = "#A9A7B4";
    private const string Coral = "#FF6B5F";
    private const string Cyan = "#49C7F3";
    private const string SansStack = "'Thmanyah Sans', 'Segoe UI', Tahoma, Arial, sans-serif";
    private const string SerifStack = "'Thmanyah Serif Display', Georgia, 'Times New Roman', serif";

    public static string Render(
        string preheader,
        string kicker,
        string heading,
        IReadOnlyList<string> paragraphs,
        string appBaseUrl,
        EmailAccent accent = EmailAccent.Authority,
        string? ctaText = null,
        string? ctaUrl = null,
        string? notice = null,
        string lang = "ar")
    {
        var accentColor = accent switch
        {
            EmailAccent.Warmth => Coral,
            EmailAccent.Activity => Cyan,
            _ => WarmBone,
        };
        var isArabic = lang != "en";
        var dir = isArabic ? "rtl" : "ltr";
        var htmlLang = isArabic ? "ar" : "en";
        var footerTagline = isArabic ? "تفصيل — درسك على مقاسك" : "Tafseel — learn on your terms";
        var footerCopyright = isArabic
            ? $"© {DateTime.UtcNow.Year} Tafseel. جميع الحقوق محفوظة."
            : $"© {DateTime.UtcNow.Year} Tafseel. All rights reserved.";
        var enc = HtmlEncoder.Default;
        var sb = new StringBuilder();
        // Email clients are sensitive to asset URL paths; some environments provide AppBaseUrl
        // without the `/app` prefix even though the frontend assets are served under `/app/...`.
        var baseUrl = appBaseUrl.TrimEnd('/');
        if (!baseUrl.EndsWith("/app", StringComparison.OrdinalIgnoreCase))
            baseUrl += "/app";
        var assets = baseUrl;
        var dotGrid = $"radial-gradient(#8B7BFF66 1.5px, transparent 1.5px)";
        var glowTop = "radial-gradient(closest-side, rgba(85,56,242,.55), transparent)";
        var glowBottom = "radial-gradient(closest-side, rgba(217,255,67,.20), transparent)";

        sb.Append($$"""
            <!DOCTYPE html>
            <html dir="{{dir}}" lang="{{htmlLang}}">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="color-scheme" content="dark light">
            <title>{{enc.Encode(heading)}}</title>
            <style>
            @font-face{font-family:'Thmanyah Sans';src:url('{{enc.Encode(assets)}}/assets/fonts/thmanyah-sans/thmanyah-sans-regular.woff2') format('woff2');font-weight:400}
            @font-face{font-family:'Thmanyah Sans';src:url('{{enc.Encode(assets)}}/assets/fonts/thmanyah-sans/thmanyah-sans-bold.woff2') format('woff2');font-weight:700 900}
            @font-face{font-family:'Thmanyah Serif Display';src:url('{{enc.Encode(assets)}}/assets/fonts/thmanyah-serif-display/thmanyah-serif-display-bold.woff2') format('woff2');font-weight:700 900}
            </style>
            </head>
            <body style="margin:0;padding:0;background:{{NearBlack}};font-family:{{SansStack}}">
            <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">{{enc.Encode(preheader)}}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{{NearBlack}};padding:32px 16px">
            <tr><td align="center">
            <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:{{CardDark}};border:1px solid {{BorderOnDark}};border-radius:16px;overflow:hidden">
            <tr><td style="height:5px;line-height:5px;font-size:0;background:{{Violet}}">&nbsp;</td></tr>
            <tr><td align="center" style="padding:44px 40px 32px;background-color:{{CardDark}};background-image:{{glowTop}},{{glowBottom}},{{dotGrid}};background-position:-60px -120px,110% 120%,0 0;background-size:360px 360px,320px 320px,26px 26px;background-repeat:no-repeat,no-repeat,repeat">
            <img src="{{enc.Encode(assets)}}/assets/brand/tafseel-mark-dark.png" width="60" height="60" alt="تفصيل" style="display:block;margin:0 auto 22px;width:60px;height:60px;border:0">
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 14px"><tr>
            <td style="width:8px;height:8px;border-radius:2px;background:{{accentColor}}">&nbsp;</td>
            <td style="width:8px"></td>
            <td><span style="font-family:{{SansStack}};font-weight:800;font-size:12px;letter-spacing:.02em;color:{{accentColor}}">{{enc.Encode(kicker)}}</span></td>
            </tr></table>
            <h1 style="margin:0;font-family:{{SerifStack}};font-weight:800;font-size:26px;line-height:1.4;color:{{WarmBone}}">{{enc.Encode(heading)}}</h1>
            </td></tr>
            <tr><td style="padding:32px 40px 0">
            """);

        foreach (var paragraph in paragraphs)
            sb.Append($"""<p style="margin:0 0 16px;font-family:{SansStack};font-size:15px;line-height:1.75;color:{MutedOnDark}">{enc.Encode(paragraph)}</p>""");

        if (ctaText is not null && ctaUrl is not null)
        {
            sb.Append($$"""
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr>
                <td style="border-radius:10px;background:{{Violet}}">
                <a href="{{enc.Encode(ctaUrl)}}" style="display:inline-block;padding:14px 30px;font-family:{{SansStack}};font-weight:700;font-size:15px;color:#FFFFFF;text-decoration:none;border-radius:10px">{{enc.Encode(ctaText)}}</a>
                </td>
                </tr></table>
                """);
        }

        if (notice is not null)
        {
            sb.Append($$"""
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{{NearBlack}};border:1px solid {{BorderOnDark}};border-radius:12px;margin:0 0 28px"><tr>
                <td style="padding:14px 18px">
                <p style="margin:0;font-family:{{SansStack}};font-size:13px;line-height:1.7;color:{{MutedOnDark}}">{{enc.Encode(notice)}}</p>
                </td>
                </tr></table>
                """);
        }

        sb.Append($$"""
            </td></tr>
            <tr><td style="padding:0 40px"><div style="border-top:1px solid {{BorderOnDark}}"></div></td></tr>
            <tr><td align="center" style="padding:20px 40px 28px">
            <p style="margin:0 0 4px;font-family:{{SansStack}};font-size:12px;font-weight:700;color:{{WarmBone}}">{{enc.Encode(footerTagline)}}</p>
            <p style="margin:0;font-family:{{SansStack}};font-size:12px;color:{{MutedOnDark}}">{{enc.Encode(footerCopyright)}}</p>
            </td></tr>
            </table>
            </td></tr>
            </table>
            </body>
            </html>
            """);

        return sb.ToString();
    }
}
