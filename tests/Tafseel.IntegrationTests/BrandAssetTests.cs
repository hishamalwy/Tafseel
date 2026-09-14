using System.Net;

namespace Tafseel.IntegrationTests;

public sealed class BrandAssetTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    [Theory]
    [InlineData("/assets/brand/tafseel-mark.svg", "image/svg+xml")]
    [InlineData("/assets/brand/tafseel-mark-dark.svg", "image/svg+xml")]
    [InlineData("/assets/brand/tafseel-pattern.svg", "image/svg+xml")]
    [InlineData("/assets/brand/tafseel-wing.svg", "image/svg+xml")]
    [InlineData("/assets/brand/tafseel-wing-stroke.svg", "image/svg+xml")]
    [InlineData("/assets/brand/favicon.svg", "image/svg+xml")]
    [InlineData("/assets/brand/favicon.ico", "image/x-icon")]
    [InlineData("/assets/brand/apple-touch-icon.png", "image/png")]
    public async Task Brand_kit_assets_are_served(string path, string mediaType)
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var response = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(mediaType, response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task About_page_is_published()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var response = await client.GetAsync("/ar/about");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_brand_files_are_not_served()
    {
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/assets/brand/not-a-kit-file.svg")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/assets/brand/secret.txt")).StatusCode);
    }
}
