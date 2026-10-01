using System.Net;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc.Testing;
using Tafseel.Api.Routing;
using Tafseel.Application.Marketplace;

namespace Tafseel.IntegrationTests;

// F-SEO-2: no robots.txt, sitemap, canonical or hreflang, and unknown client paths answered 200.
public sealed partial class SiteIndexTests(TafseelApiFactory factory) : IClassFixture<TafseelApiFactory>
{
    private HttpClient Client() => factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        AllowAutoRedirect = false,
        BaseAddress = new Uri("https://localhost")
    });

    [Fact]
    public async Task A_non_production_host_tells_every_crawler_to_stay_out()
    {
        var response = await Client().GetAsync("/robots.txt");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/plain", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("User-agent: *\nDisallow: /\n", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public void Production_robots_allows_the_site_blocks_the_api_and_names_the_sitemap()
    {
        var robots = SiteIndex.Robots(indexable: true, "https://tafseel.example");

        Assert.Contains("Allow: /\n", robots);
        Assert.Contains("Disallow: /api/\n", robots);
        Assert.DoesNotContain("Disallow: /\n", robots);
        Assert.Contains("Sitemap: https://tafseel.example/sitemap.xml", robots);
    }

    [Fact]
    public async Task The_sitemap_lists_prerendered_pages_in_both_languages_with_alternates()
    {
        var response = await Client().GetAsync("/sitemap.xml");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/xml", response.Content.Headers.ContentType?.MediaType);
        var xml = await response.Content.ReadAsStringAsync();
        Assert.Contains("/ar/about/</loc>", xml);
        Assert.Contains("/en/about/</loc>", xml);
        Assert.Contains("/ar/policies/terms/</loc>", xml);
        Assert.Contains("hreflang=\"x-default\"", xml);
        Assert.DoesNotContain("/auth", xml);
        Assert.DoesNotContain("/student", xml);
    }

    [Fact]
    public void The_sitemap_includes_every_public_teacher_with_its_update_date()
    {
        var xml = SiteIndex.Sitemap(
            "https://tafseel.example", Path.Combine(AppContext.BaseDirectory, "webclient"),
            [new("teacher-1", new DateTimeOffset(2026, 9, 20, 8, 0, 0, TimeSpan.Zero))]);

        Assert.Contains("<loc>https://tafseel.example/ar/teachers/teacher-1/</loc>", xml);
        Assert.Contains("<loc>https://tafseel.example/en/teachers/teacher-1/</loc>", xml);
        Assert.Contains("<lastmod>2026-09-20</lastmod>", xml);
        Assert.Contains("hreflang=\"x-default\" href=\"https://tafseel.example/teachers/teacher-1/\"", xml);
    }

    [Theory]
    [InlineData("/ar/no/such/page")]
    [InlineData("/en/definitely-not-a-route")]
    public async Task An_address_no_client_route_owns_is_a_real_404_that_still_shows_the_not_found_page(string path)
    {
        var response = await Client().GetAsync(path);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var html = await response.Content.ReadAsStringAsync();
        Assert.Contains("<tf-root", html);
        Assert.Contains("<meta name=\"robots\" content=\"noindex\" />", html);
    }

    [Theory]
    [InlineData("/ar/teachers")]
    [InlineData("/en/orders/3f1c6a52-4b8e-4d7a-9c3e-2a1b0c9d8e7f")]
    [InlineData("/ar/about/")]
    public async Task Known_client_routes_stay_200_and_are_noindex_outside_production(string path)
    {
        var response = await Client().GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("<meta name=\"robots\" content=\"noindex\" />", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("ar", "teachers/abc", "https://tafseel.example/ar/teachers/abc/")]
    [InlineData("en", "", "https://tafseel.example/en/")]
    [InlineData("ar", "policies/terms/", "https://tafseel.example/ar/policies/terms/")]
    public void Production_public_pages_carry_a_self_canonical_and_both_language_alternates(
        string locale, string path, string canonical)
    {
        var tags = SiteIndex.HeadTags(indexable: true, "https://tafseel.example", locale, path);
        var suffix = canonical[$"https://tafseel.example/{locale}".Length..];

        Assert.Contains($"<link rel=\"canonical\" href=\"{canonical}\" />", tags);
        Assert.Contains($"hreflang=\"ar\" href=\"https://tafseel.example/ar{suffix}\"", tags);
        Assert.Contains($"hreflang=\"en\" href=\"https://tafseel.example/en{suffix}\"", tags);
        Assert.Contains($"hreflang=\"x-default\" href=\"https://tafseel.example{suffix}\"", tags);
        Assert.DoesNotContain("noindex", tags);
    }

    [Theory]
    [InlineData("student/overview")]
    [InlineData("orders/abc")]
    [InlineData("auth")]
    public void Production_private_pages_are_noindex(string path) =>
        Assert.Equal("<meta name=\"robots\" content=\"noindex\" />",
            SiteIndex.HeadTags(indexable: true, "https://tafseel.example", "ar", path));

    [Fact]
    public void The_server_route_list_matches_every_top_level_route_in_app_routes()
    {
        var routes = File.ReadAllText(Path.Combine(RepositoryRoot(), "frontend-angular", "src", "app", "app.routes.ts"));
        var firstSegments = RoutePath().Matches(routes)
            .Select(m => m.Groups["path"].Value.Split('/')[0])
            .Where(x => x != "**")
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        Assert.Equal(firstSegments.OrderBy(x => x), SiteIndex.ClientRoutes.OrderBy(x => x));
    }

    [GeneratedRegex(@"(?:path:\s*|link\()'(?<path>[^']*)'")]
    private static partial Regex RoutePath();

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "Tafseel.sln")))
                return directory.FullName;
        throw new InvalidOperationException("Could not find Tafseel.sln above the test output directory.");
    }

}
