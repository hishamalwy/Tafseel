namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
[Trait("Category", "Security")]
public sealed class Phase11HardeningTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Security_headers_protect_frontend_and_api_responses()
    {
        var client = factory.CreateClient();
        var frontend = await client.GetAsync("/app/Tafseel-Auth.dc.html");
        frontend.EnsureSuccessStatusCode();
        Assert.Equal("nosniff", frontend.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", frontend.Headers.GetValues("X-Frame-Options").Single());
        var csp = frontend.Headers.GetValues("Content-Security-Policy").Single();
        Assert.Contains("frame-ancestors 'none'", csp);
        Assert.Contains("font-src 'self'", csp);
        Assert.DoesNotContain("fonts.googleapis.com", csp);
        Assert.DoesNotContain("fonts.gstatic.com", csp);
        Assert.Contains("camera=()",
            frontend.Headers.GetValues("Permissions-Policy").Single());

        var api = await client.GetAsync("/api/v1/subjects");
        api.EnsureSuccessStatusCode();
        Assert.Contains("no-store", api.Headers.CacheControl!.ToString());
        Assert.Equal("no-cache", api.Headers.GetValues("Pragma").Single());
    }
}
