namespace Tafseel.Infrastructure.Email;

/// <summary>
/// Absolute addresses for email. <c>Email:AppBaseUrl</c> names the site root, and the paths
/// appended to it are client routes (<c>AppRoutes</c>) without a locale; the host picks the
/// reader's language when the link is opened.
/// </summary>
internal static class EmailLinks
{
    /// <summary>
    /// The configured base without a trailing slash. A base that still ends in <c>/app</c> -
    /// the address of the retired .dc.html site, which a host override may carry - is read
    /// as the root it was mounted on, so links and assets keep resolving.
    /// </summary>
    public static string SiteRoot(string appBaseUrl)
    {
        var root = appBaseUrl.Trim().TrimEnd('/');
        return root.EndsWith("/app", StringComparison.OrdinalIgnoreCase) ? root[..^"/app".Length] : root;
    }

    public static string Absolute(string appBaseUrl, string path) =>
        SiteRoot(appBaseUrl) + (path.StartsWith('/') ? path : "/" + path);
}
