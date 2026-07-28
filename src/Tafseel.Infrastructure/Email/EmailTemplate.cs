using System.Text;
using System.Text.Encodings.Web;

namespace Tafseel.Infrastructure.Email;

/// <summary>
/// Accent used for the kicker/top bar, picked per email's place in Brand System 02.0's
/// "color with intent" system. The CTA button always stays Electric Violet — that's the
/// system's fixed "primary action" color, never reassigned.
/// </summary>
internal enum EmailAccent
{
    /// <summary>Human Coral — people &amp; warmth. Welcomes, activations.</summary>
    Warmth,
    /// <summary>Near Black — brand authority. Security-sensitive actions.</summary>
    Authority,
    /// <summary>Live Cyan — sessions &amp; data. Reminders, message/activity notifications.</summary>
    Activity,
}

/// <summary>
/// Renders transactional emails against Tafseel Brand System 02.0 (Electric Violet
/// primary action on a Warm Bone canvas, Thmanyah type pairing, Arabic-first/RTL,
/// flat surfaces — no gradients, no shadow, no rotation). Table-based markup with
/// inline styles only, so it survives Outlook/Gmail's stripped stylesheets.
/// </summary>
internal static class EmailTemplate
{
    private const string Violet = "#5538F2";
    private const string NearBlack = "#121318";
    private const string WarmBone = "#F3F0E8";
    private const string Surface = "#FFFFFF";
    private const string SurfaceAlt = "#F7F4EC";
    private const string Border = "#DEDACB";
    private const string Muted = "#6B6D75";
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
        string? notice = null)
    {
        var accentColor = accent switch
        {
            EmailAccent.Warmth => Coral,
            EmailAccent.Activity => Cyan,
            _ => NearBlack,
        };
        var enc = HtmlEncoder.Default;
        var sb = new StringBuilder();
        var assets = appBaseUrl.TrimEnd('/');

        sb.Append($$"""
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="color-scheme" content="light">
            <title>{{enc.Encode(heading)}}</title>
            <style>
            @font-face{font-family:'Thmanyah Sans';src:url('{{enc.Encode(assets)}}/assets/fonts/thmanyah-sans/thmanyah-sans-regular.woff2') format('woff2');font-weight:400}
            @font-face{font-family:'Thmanyah Sans';src:url('{{enc.Encode(assets)}}/assets/fonts/thmanyah-sans/thmanyah-sans-bold.woff2') format('woff2');font-weight:700 900}
            @font-face{font-family:'Thmanyah Serif Display';src:url('{{enc.Encode(assets)}}/assets/fonts/thmanyah-serif-display/thmanyah-serif-display-bold.woff2') format('woff2');font-weight:700 900}
            </style>
            </head>
            <body style="margin:0;padding:0;background:{{WarmBone}};font-family:{{SansStack}}">
            <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">{{enc.Encode(preheader)}}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{{WarmBone}};padding:32px 16px">
            <tr><td align="center">
            <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:{{Surface}};border:1px solid {{Border}};border-radius:16px;overflow:hidden">
            <tr><td style="height:5px;line-height:5px;font-size:0;background:{{Violet}}">&nbsp;</td></tr>
            <tr><td style="padding:28px 40px 4px">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:30px;height:30px;vertical-align:middle" align="center"><img src="{{enc.Encode(assets)}}/assets/brand/tafseel-mark.png" width="30" height="30" alt="" style="display:block;width:30px;height:30px;border:0"></td>
            <td style="width:10px"></td>
            <td>
            <div style="font-family:{{SerifStack}};font-weight:900;font-size:19px;color:{{NearBlack}}">تفصيــل</div>
            </td>
            </tr></table>
            </td></tr>
            <tr><td style="padding:28px 40px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px"><tr>
            <td style="width:8px;height:8px;border-radius:2px;background:{{accentColor}}">&nbsp;</td>
            <td style="width:8px"></td>
            <td><span style="font-family:{{SansStack}};font-weight:800;font-size:12px;letter-spacing:.02em;color:{{accentColor}}">{{enc.Encode(kicker)}}</span></td>
            </tr></table>
            <h1 style="margin:0 0 18px;font-family:{{SerifStack}};font-weight:800;font-size:27px;line-height:1.35;color:{{NearBlack}}">{{enc.Encode(heading)}}</h1>
            """);

        foreach (var paragraph in paragraphs)
            sb.Append($"""<p style="margin:0 0 16px;font-family:{SansStack};font-size:15px;line-height:1.75;color:{NearBlack}">{enc.Encode(paragraph)}</p>""");

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
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{{SurfaceAlt}};border:1px solid {{Border}};border-radius:12px;margin:0 0 28px"><tr>
                <td style="padding:14px 18px">
                <p style="margin:0;font-family:{{SansStack}};font-size:13px;line-height:1.7;color:{{Muted}}">{{enc.Encode(notice)}}</p>
                </td>
                </tr></table>
                """);
        }

        sb.Append($$"""
            </td></tr>
            <tr><td style="padding:0 40px"><div style="border-top:1px solid {{Border}}"></div></td></tr>
            <tr><td style="padding:20px 40px 28px">
            <p style="margin:0 0 4px;font-family:{{SansStack}};font-size:12px;font-weight:700;color:{{NearBlack}}">تفصيل — درسك على مقاسك</p>
            <p style="margin:0;font-family:{{SansStack}};font-size:12px;color:{{Muted}}">© {{DateTime.UtcNow.Year}} Tafseel. جميع الحقوق محفوظة.</p>
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
