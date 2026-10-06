namespace Tafseel.IntegrationTests;

public sealed class MockPaymentSimulatorTests(TafseelApiFactory factory) : IClassFixture<TafseelApiFactory>
{
    [Theory]
    [InlineData("/api/v1/payments/capabilities")]
    [InlineData("/api/v1/payments/mock/simulator?ref=mock_anything")]
    [InlineData("/api/v1/payments/mock/simulator/complete")]
    public async Task Retired_mock_endpoints_are_unavailable(string path)
    {
        using var client = factory.CreateClient();
        var response = path.EndsWith("complete") ? await client.PostAsync(path, new StringContent("{}")) : await client.GetAsync(path);
        Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);
    }
}
