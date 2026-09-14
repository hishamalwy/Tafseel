using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http.Extensions;

namespace Tafseel.Api.Routing;

/// <summary>
/// Where an address of the retired <c>/app/*.dc.html</c> site now lives.
///
/// Those addresses are still out there: in emails already delivered, in notifications
/// stored before the move, in bookmarks, and - for <c>Tafseel-Chat.dc.html</c> - in
/// browsers that cached the permanent redirect the old host sent to
/// <c>Tafseel-Student-Dashboard.dc.html?section=messages</c>. Each known page answers
/// with a temporary redirect to its Angular route, so nothing new is cached against a
/// path that may change again; anything else under <c>/app/</c> is a plain 404.
///
/// The old pages carried identity in the query (<c>?id=</c>, <c>?policy=</c>,
/// <c>?section=</c>); those move into the path, and every other parameter - reset
/// tokens, <c>?orderId=</c>, <c>?ref=</c> - is carried over unchanged. The result never
/// names a locale: the caller puts the reader's locale in front of it.
/// </summary>
public static partial class LegacyLinks
{
    private static readonly Dictionary<string, Func<IQueryCollection, Target>> Pages =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["Tafseel-Landing.dc.html"] = _ => new("/"),
            ["Tafseel-About.dc.html"] = _ => new("/about"),
            ["Tafseel-Auth.dc.html"] = _ => new("/auth"),
            ["Tafseel-Confirm-Email.dc.html"] = _ => new("/auth/confirm-email"),
            ["Tafseel-Browse-Teachers.dc.html"] = _ => new("/teachers"),
            ["Tafseel-Teacher-Profile.dc.html"] = q => Segment(q, "id") is { } id
                ? new($"/teachers/{id}", "id")
                : new("/teachers", "id"),
            ["Tafseel-Policies.dc.html"] = q => Segment(q, "policy") is { } policy
                ? new($"/policies/{policy.ToLowerInvariant()}", "policy")
                : new("/policies", "policy"),
            ["Tafseel-Open-Marketplace.dc.html"] = _ => new("/requests"),
            ["Tafseel-Request.dc.html"] = _ => new("/requests/new"),
            ["Tafseel-Book-Session.dc.html"] = _ => new("/sessions/book"),
            ["Tafseel-Payment.dc.html"] = _ => new("/checkout"),
            ["Tafseel-Mock-Checkout.dc.html"] = _ => new("/checkout/simulator"),
            ["Tafseel-Teacher-Apply.dc.html"] = _ => new("/teach/apply"),
            ["Tafseel-Disputes.dc.html"] = _ => new("/disputes"),
            // Role-neutral: the client opens the reader's own inbox, whoever they are.
            ["Tafseel-Chat.dc.html"] = _ => new("/messages"),
            ["Tafseel-Student-Dashboard.dc.html"] = q => Dashboard(q, "student", "overview"),
            ["Tafseel-Teacher-Dashboard.dc.html"] = q => Dashboard(q, "teacher", "home"),
            ["Tafseel-Quality-Dashboard.dc.html"] = q => Dashboard(q, "quality", "review"),
            ["Tafseel-Admin-Dashboard.dc.html"] = q => Dashboard(q, "admin", "home"),
        };

    /// <summary>The locale-free client address for an old page, or null when it is not one.</summary>
    public static string? Resolve(string file, IQueryCollection query)
    {
        if (!Pages.TryGetValue(file, out var map)) return null;
        var target = map(query);
        var carried = new QueryBuilder(query
            .Where(pair => !target.Consumed.Contains(pair.Key, StringComparer.OrdinalIgnoreCase))
            .SelectMany(pair => pair.Value.Select(value => new KeyValuePair<string, string>(pair.Key, value ?? ""))));
        foreach (var (key, value) in target.Added) carried.Add(key, value);
        return target.Path + carried.ToQueryString();
    }

    /// <summary>
    /// Old dashboard sections that became something else. A student's messages go to the
    /// role-neutral inbox, because that is where the cached Chat redirect points - a teacher
    /// who follows it must reach their own messages, not a student screen.
    /// </summary>
    private static Target Dashboard(IQueryCollection query, string role, string home)
    {
        var section = Segment(query, "section")?.ToLowerInvariant();
        return (role, section) switch
        {
            (_, null) => new($"/{role}/{home}", "section"),
            ("student", "messages") => new("/messages", "section"),
            ("teacher", "samples") => new("/teacher/profile", ["section"], [("tab", "videos")]),
            ("quality", "applications" or "showcases") => new("/quality/review", ["section"], [("tab", section)]),
            _ => new($"/{role}/{section}", "section"),
        };
    }

    /// <summary>A query value safe to use as one path segment, or null.</summary>
    private static string? Segment(IQueryCollection query, string name)
    {
        var value = query[name].FirstOrDefault()?.Trim();
        return value is { Length: > 0 and <= 100 } && SafeSegment().IsMatch(value) ? value : null;
    }

    [GeneratedRegex("^[A-Za-z0-9_-]+$")]
    private static partial Regex SafeSegment();

    private sealed record Target(string Path, string[] Consumed, (string Key, string Value)[] Added)
    {
        public Target(string path, params string[] consumed) : this(path, consumed, []) { }
    }
}
