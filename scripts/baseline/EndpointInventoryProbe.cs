// Endpoint inventory probe.
//
// Not compiled by the solution. run-baseline.sh copies it into the integration test
// project of a disposable copy of the tree, where it boots the real host through
// TafseelApiFactory and writes the resolved endpoint table and hosted services as JSON.
// Reading the table from the running host catches what attribute grepping misses:
// minimal-API routes, the SPA fallback, SignalR, health checks, and inherited routes.
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Tafseel.IntegrationTests;

public sealed class BaselineEndpointInventory
{
    [Fact]
    public void Dump_endpoint_table_and_hosted_services()
    {
        using var factory = new TafseelApiFactory();
        _ = factory.CreateClient();

        var rows = factory.Services.GetServices<EndpointDataSource>()
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Select(endpoint =>
            {
                var action = endpoint.Metadata.GetMetadata<ControllerActionDescriptor>();
                var authorize = endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>();
                return new
                {
                    route = "/" + endpoint.RoutePattern.RawText?.TrimStart('/'),
                    methods = endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? [],
                    controller = action?.ControllerName,
                    action = action?.ActionName,
                    kind = action is null ? "minimal" : "controller",
                    anonymous = endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null,
                    roles = authorize.Where(a => a.Roles is not null).Select(a => a.Roles).ToArray(),
                    policies = authorize.Where(a => a.Policy is not null).Select(a => a.Policy).ToArray(),
                    authenticated = authorize.Any(),
                    rateLimit = endpoint.Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName,
                    display = endpoint.DisplayName,
                };
            })
            .OrderBy(row => row.route)
            .ThenBy(row => string.Join(",", row.methods))
            .ToArray();

        var hosted = factory.Services.GetServices<IHostedService>()
            .Select(service => service.GetType().FullName)
            .OrderBy(name => name)
            .ToArray();

        var outDir = Environment.GetEnvironmentVariable("BASELINE_OUT")
            ?? throw new InvalidOperationException("Set BASELINE_OUT to the inventory output directory.");
        var json = new JsonSerializerOptions { WriteIndented = true };
        File.WriteAllText(Path.Combine(outDir, "endpoints.json"), JsonSerializer.Serialize(rows, json));
        File.WriteAllText(Path.Combine(outDir, "hosted-services.json"), JsonSerializer.Serialize(hosted, json));
        Assert.NotEmpty(rows);
    }
}
