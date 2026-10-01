using System.Security;
using System.Text;
using Tafseel.Application.Marketplace;

namespace Tafseel.Api.Routing;

/// <summary>
/// What search engines see of the site: robots.txt, sitemap.xml, and the canonical/hreflang
/// (or noindex) tags stamped into the client shell's head.
///
/// Every page exists twice, under /ar/ and /en/. Without these a crawler could not tell the
/// pair is one page in two languages, broken links answered 200 with the app shell, and a
/// non-production host (the staging site runs the payment simulator) was as indexable as
/// production will be.
/// </summary>
public static class SiteIndex
{
    public static readonly string[] Locales = ["ar", "en"];

    /// <summary>
    /// The first path segment of every route in frontend-angular/src/app/app.routes.ts (`**`
    /// aside). A locale path whose first segment is not here is answered 404; the client shell is
    /// still sent so the reader sees the real not-found page. A test keeps this list and
    /// app.routes.ts in step.
    /// </summary>
    public static readonly HashSet<string> ClientRoutes = new(StringComparer.OrdinalIgnoreCase)
    {
        "", "about", "requests", "teachers", "policies", "auth", "teach", "disputes", "sessions",
        "checkout", "student", "teacher", "quality", "admin", "orders", "live-sessions",
        "conversations", "messages", "finance", "help", "account"
    };

    /// <summary>Public, indexable pages: the ones a canonical and hreflang pair belongs on.</summary>
    private static readonly string[] PublicPrefixes = ["", "about", "teachers", "policies"];

    public static bool IsClientRoute(string firstSegment) => ClientRoutes.Contains(firstSegment);

    public static bool IsPublic(string pathAfterLocale)
    {
        var segments = pathAfterLocale.Split('/', StringSplitOptions.RemoveEmptyEntries);
        var first = segments.Length == 0 ? "" : segments[0];
        return PublicPrefixes.Contains(first, StringComparer.OrdinalIgnoreCase);
    }

    public static string Robots(bool indexable, string origin) => indexable
        ? $"User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /hubs/\n\nSitemap: {origin}/sitemap.xml\n"
        // Staging, development and anything else that is not production: stay out of indexes.
        : "User-agent: *\nDisallow: /\n";

    /// <summary>Prerendered pages found on disk plus every teacher public Browse shows, in both languages.</summary>
    public static string Sitemap(
        string origin, string webClientRoot, IReadOnlyCollection<PublicTeacherLink> teachers)
    {
        var pages = new List<(string Path, DateTimeOffset? Modified)> { ("/", null), ("/teachers/", null) };
        var prerenderRoot = Path.Combine(webClientRoot, Locales[0]);
        if (Directory.Exists(prerenderRoot))
            foreach (var file in Directory.EnumerateFiles(prerenderRoot, "index.html", SearchOption.AllDirectories))
            {
                var relative = Path.GetRelativePath(prerenderRoot, Path.GetDirectoryName(file)!).Replace('\\', '/');
                if (relative == ".") continue;
                pages.Add(($"/{relative}/", File.GetLastWriteTimeUtc(file)));
            }
        foreach (var teacher in teachers)
            pages.Add(($"/teachers/{Uri.EscapeDataString(teacher.TeacherId)}/", teacher.UpdatedAt));

        var xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
            .Append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:xhtml=\"http://www.w3.org/1999/xhtml\">\n");
        foreach (var (path, modified) in pages.DistinctBy(x => x.Path))
            foreach (var locale in Locales)
            {
                xml.Append("  <url>\n    <loc>").Append(Escape($"{origin}/{locale}{path}")).Append("</loc>\n");
                if (modified is { } when)
                    xml.Append("    <lastmod>").Append(when.UtcDateTime.ToString("yyyy-MM-dd")).Append("</lastmod>\n");
                foreach (var alternate in Locales)
                    xml.Append("    <xhtml:link rel=\"alternate\" hreflang=\"").Append(alternate)
                        .Append("\" href=\"").Append(Escape($"{origin}/{alternate}{path}")).Append("\"/>\n");
                xml.Append("    <xhtml:link rel=\"alternate\" hreflang=\"x-default\" href=\"")
                    .Append(Escape($"{origin}{path}")).Append("\"/>\n  </url>\n");
            }
        return xml.Append("</urlset>\n").ToString();
    }

    /// <summary>
    /// The tags a shell gets in its head. Public pages: a self canonical and the ar/en/x-default
    /// alternates (x-default is the locale-free path, which the host negotiates). Everything else,
    /// including every page on a non-production host: noindex.
    /// </summary>
    public static string HeadTags(bool indexable, string origin, string locale, string pathAfterLocale)
    {
        if (!indexable || !IsPublic(pathAfterLocale))
            return "<meta name=\"robots\" content=\"noindex\" />";
        var path = "/" + pathAfterLocale.Trim('/');
        if (path != "/") path += "/";
        var tags = new StringBuilder()
            .Append("<link rel=\"canonical\" href=\"").Append(Escape($"{origin}/{locale}{path}")).Append("\" />");
        foreach (var alternate in Locales)
            tags.Append("<link rel=\"alternate\" hreflang=\"").Append(alternate).Append("\" href=\"")
                .Append(Escape($"{origin}/{alternate}{path}")).Append("\" />");
        return tags.Append("<link rel=\"alternate\" hreflang=\"x-default\" href=\"")
            .Append(Escape($"{origin}{path}")).Append("\" />").ToString();
    }

    public static string WithHeadTags(string html, string tags)
    {
        var head = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        return head < 0 ? html : html.Insert(head, tags);
    }

    private static string Escape(string value) => SecurityElement.Escape(value)!;
}
