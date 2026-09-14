using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.WebUtilities;
using Tafseel.Application.Common;

namespace Tafseel.IntegrationTests;

/// <summary>
/// Every link the server hands out - <see cref="AppRoutes"/>, the link literals written into
/// notifications, and the client URLs in configuration - must name a route the Angular client
/// actually has (J9-05, J11-01, J2-02). Dashboard links must also name a section and tab that
/// dashboard defines. The route table is read from the client source, so a renamed route fails
/// here instead of turning into a blank page for whoever opens the link.
/// </summary>
public sealed partial class AppRoutesTests
{
    private static readonly string Root = RepositoryRoot();
    private const string SampleId = "3f1c6a52-4b8e-4d7a-9c3e-2a1b0c9d8e7f";

    public static TheoryData<string, string> ServerLinks()
    {
        var data = new TheoryData<string, string>();
        foreach (var (source, link) in AppRouteValues().Concat(SourceLiterals()).Concat(ConfigurationLinks())
                     .DistinctBy(x => x.Link))
            data.Add(source, link);
        return data;
    }

    [Theory]
    [MemberData(nameof(ServerLinks))]
    public void Server_link_names_an_angular_route(string source, string link)
    {
        Assert.StartsWith("/", link);
        Assert.DoesNotMatch(LocalePrefix(), link);
        Assert.DoesNotContain(".dc.html", link, StringComparison.OrdinalIgnoreCase);

        var path = link.Split('?', 2)[0];
        var route = AngularRoutes().FirstOrDefault(pattern => Matches(pattern, path));
        Assert.True(route is not null, $"{source}: '{link}' matches no route in app.routes.ts");

        var dashboard = DashboardSection().Match(path);
        if (!dashboard.Success) return;
        var areas = Dashboards()[dashboard.Groups["role"].Value];
        var section = dashboard.Groups["section"].Value;
        Assert.True(areas.ContainsKey(section), $"{source}: '{link}' names no {dashboard.Groups["role"].Value} dashboard section");
        var query = QueryHelpers.ParseQuery(link.Contains('?') ? link[link.IndexOf('?')..] : "");
        if (query.TryGetValue("tab", out var tab))
            Assert.True(areas[section].Contains(tab.ToString()), $"{source}: '{link}' names no tab '{tab}' in {section}");
    }

    [Fact]
    public void The_scan_sees_the_links_it_is_meant_to_check()
    {
        var links = ServerLinks().Select(row => (string)row[1]).ToArray();

        // One of each kind the notification writers emit, so a broken scan cannot pass vacuously.
        foreach (var expected in new[]
                 {
                     $"/orders/{SampleId}", $"/live-sessions/{SampleId}", $"/conversations/{SampleId}",
                     $"/requests/{SampleId}", $"/requests/{SampleId}/offers", $"/disputes/{SampleId}",
                     $"/teacher/reviews/{SampleId}", "/teacher/earnings", "/admin/operations?tab=sessions",
                     "/teach/apply", "/auth", "/student/overview"
                 })
            Assert.Contains(expected, links);
        Assert.Contains(AngularRoutes(), pattern => pattern == "orders/:orderId");
    }

    public static TheoryData<string, string> ClientNavigations()
    {
        var data = new TheoryData<string, string>();
        var app = Path.Combine(Root, "frontend-angular", "src", "app");
        foreach (var file in Directory.EnumerateFiles(app, "*.*", SearchOption.AllDirectories)
                     .Where(f => (f.EndsWith(".ts", StringComparison.Ordinal) && !f.EndsWith(".spec.ts", StringComparison.Ordinal))
                                 || f.EndsWith(".html", StringComparison.Ordinal)))
        {
            var source = Path.GetRelativePath(Root, file).Replace('\\', '/');
            foreach (Match match in ClientNavigation().Matches(File.ReadAllText(file)))
            {
                var path = match.Groups["path"].Success
                    ? match.Groups["path"].Value
                    : NavigationArray(match.Groups["array"].Value);
                if (path is not null) data.Add(source, path);
            }
        }
        return data;
    }

    /// <summary>
    /// The client's own absolute navigations - <c>router.navigate(['/…'])</c>, <c>navigateByUrl('/…')</c>
    /// and <c>routerLink</c> - must name a route too. Registration once sent new accounts to
    /// <c>/confirm-email</c>, which is not one.
    /// </summary>
    [Theory]
    [MemberData(nameof(ClientNavigations))]
    public void Client_navigation_names_an_angular_route(string source, string path)
    {
        var route = AngularRoutes().FirstOrDefault(pattern => Matches(pattern, path.Split('?', 2)[0]));
        Assert.True(route is not null, $"{source}: navigates to '{path}', which matches no route in app.routes.ts");
    }

    [Fact]
    public void The_navigation_scan_sees_the_client_navigations()
    {
        var paths = ClientNavigations().Select(row => (string)row[1]).ToArray();
        foreach (var expected in new[] { "/auth/confirm-email", "/quality/applications/:p", "/teacher/publication" })
            Assert.Contains(expected, paths);
    }

    /// <summary>`'/quality/applications', item.id` → `/quality/applications/:p`; null unless it starts with a literal.</summary>
    private static string? NavigationArray(string elements)
    {
        var parts = elements.Split(',').Select(x => x.Trim()).Where(x => x.Length > 0).ToArray();
        if (parts.Length == 0 || !parts[0].StartsWith("'/", StringComparison.Ordinal)) return null;
        return string.Join('/', parts.Select(part => part.StartsWith('\'') && part.EndsWith('\'')
            ? part.Trim('\'').Trim('/')
            : ":p")).Insert(0, "/");
    }

    private static IEnumerable<(string Source, string Link)> AppRouteValues()
    {
        foreach (var field in typeof(AppRoutes).GetFields(BindingFlags.Public | BindingFlags.Static)
                     .Where(x => x.IsLiteral && x.FieldType == typeof(string)))
            yield return ($"AppRoutes.{field.Name}", (string)field.GetRawConstantValue()!);

        foreach (var method in typeof(AppRoutes).GetMethods(BindingFlags.Public | BindingFlags.Static)
                     .Where(x => x.ReturnType == typeof(string)))
        {
            var arguments = method.GetParameters()
                .Select(p => p.ParameterType == typeof(Guid) ? (object)Guid.Parse(SampleId) : SampleId)
                .ToArray();
            yield return ($"AppRoutes.{method.Name}", (string)method.Invoke(null, arguments)!);
        }
    }

    /// <summary>Client paths still written by hand (FinancialService is protected and keeps its own).</summary>
    private static IEnumerable<(string Source, string Link)> SourceLiterals()
    {
        foreach (var file in new[] { "src/Tafseel.Application", "src/Tafseel.Infrastructure" }
                     .SelectMany(dir => Directory.EnumerateFiles(Path.Combine(Root, dir), "*.cs", SearchOption.AllDirectories))
                     .Where(f => !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}")
                                 && !f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}")
                                 && !f.Contains($"{Path.DirectorySeparatorChar}Migrations{Path.DirectorySeparatorChar}")))
        {
            foreach (Match match in ClientPathLiteral().Matches(File.ReadAllText(file)))
            {
                var link = Interpolation().Replace(match.Groups["path"].Value, SampleId);
                yield return (Path.GetRelativePath(Root, file).Replace('\\', '/'), link);
            }
        }
    }

    private static IEnumerable<(string Source, string Link)> ConfigurationLinks()
    {
        foreach (var file in Directory.EnumerateFiles(Path.Combine(Root, "src", "Tafseel.Api"), "appsettings*.json"))
        {
            using var json = JsonDocument.Parse(File.ReadAllText(file), new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip });
            var name = Path.GetFileName(file);
            if (json.RootElement.TryGetProperty("Email", out var email))
            {
                foreach (var key in new[] { "PasswordResetUrl", "ConfirmationUrl" })
                    if (email.TryGetProperty(key, out var url))
                        yield return ($"{name} Email:{key}", new Uri(url.GetString()!).AbsolutePath);
                if (email.TryGetProperty("AppBaseUrl", out var baseUrl))
                    Assert.Equal("/", new Uri(baseUrl.GetString()!).AbsolutePath);
            }
            if (json.RootElement.TryGetProperty("Payments", out var payments)
                && payments.TryGetProperty("Mock", out var mock)
                && mock.TryGetProperty("DefaultReturnPath", out var returnPath))
                yield return ($"{name} Payments:Mock:DefaultReturnPath", returnPath.GetString()!);
        }
    }

    private static string[]? _routes;
    private static string[] AngularRoutes() => _routes ??= RouteDeclaration()
        .Matches(File.ReadAllText(Path.Combine(Root, "frontend-angular", "src", "app", "app.routes.ts")))
        .Select(m => m.Groups["path"].Value)
        .Where(p => p != "**")
        .ToArray();

    private static bool Matches(string pattern, string path)
    {
        var expected = pattern.Split('/', StringSplitOptions.RemoveEmptyEntries);
        var actual = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (expected.Length == 0) return actual.Length == 0;
        return expected.Length == actual.Length
               && expected.Zip(actual).All(x => x.First.StartsWith(':') || x.First == x.Second);
    }

    private static Dictionary<string, Dictionary<string, HashSet<string>>>? _dashboards;
    /// <summary>role path -> area key -> tab keys, from dashboard.ts.</summary>
    private static Dictionary<string, Dictionary<string, HashSet<string>>> Dashboards()
    {
        if (_dashboards is not null) return _dashboards;
        var source = File.ReadAllText(Path.Combine(Root, "frontend-angular", "src", "app", "features", "dashboards", "models", "dashboard.ts"))
            // A checkout with core.autocrlf has CRLF; the parse below is line based.
            .Replace("\r\n", "\n");
        var result = new Dictionary<string, Dictionary<string, HashSet<string>>>();
        foreach (Match config in DashboardConfig().Matches(source))
        {
            var areas = new Dictionary<string, HashSet<string>>();
            foreach (var line in config.Groups["body"].Value.Split('\n').Where(l => l.TrimStart().StartsWith("area(", StringComparison.Ordinal)))
                areas[AreaKey().Match(line).Groups[1].Value] = TabKey().Matches(line).Select(m => m.Groups[1].Value).ToHashSet();
            result[config.Groups["base"].Value] = areas;
        }
        Assert.Equal(["admin", "quality", "student", "teacher"], result.Keys.Order());
        return _dashboards = result;
    }

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "Tafseel.sln")))
                return directory.FullName;
        throw new InvalidOperationException("Could not find Tafseel.sln above the test output directory.");
    }

    [GeneratedRegex(@"(?:\bpath:\s*|\blink\()'(?<path>[^']*)'")]
    private static partial Regex RouteDeclaration();

    [GeneratedRegex(@"\$?""(?<path>/(?:orders|live-sessions|conversations|requests|disputes|teachers?|teach|student|quality|admin|messages|checkout|auth|policies|about|sessions)(?:[/?][^""]*)?)""")]
    private static partial Regex ClientPathLiteral();

    [GeneratedRegex(@"(?:navigate\(\s*\[(?<array>[^\]]*)\]|\[routerLink\]=""\[(?<array>[^\]]*)\]""|navigateByUrl\(\s*'(?<path>/[^'$]*)'|\brouterLink=""(?<path>/[^""]*)"")")]
    private static partial Regex ClientNavigation();

    [GeneratedRegex(@"\{[^}]+\}")]
    private static partial Regex Interpolation();

    [GeneratedRegex(@"^/(ar|en)(/|$)")]
    private static partial Regex LocalePrefix();

    [GeneratedRegex(@"^/(?<role>student|teacher|quality|admin)/(?<section>[^/]+)$")]
    private static partial Regex DashboardSection();

    [GeneratedRegex(@"basePath: '/(?<base>[a-z]+)'[^\n]*\n\s*areas: \[(?<body>.*?)\n\s*\]\n", RegexOptions.Singleline)]
    private static partial Regex DashboardConfig();

    [GeneratedRegex(@"area\('([^']+)'")]
    private static partial Regex AreaKey();

    [GeneratedRegex(@"tab\('([^']+)'")]
    private static partial Regex TabKey();
}
