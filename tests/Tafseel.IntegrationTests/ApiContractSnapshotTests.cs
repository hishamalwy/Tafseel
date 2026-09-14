using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace Tafseel.IntegrationTests;

// The server half of the client/server contract gate. It reads the endpoint table the running
// host actually resolves, including the JSON body each action binds, and compares it with
// tests/contracts/api-endpoints.json. scripts/ci/check-api-contract.mjs checks the Angular client
// against that file, so the file must never drift from the server.
//
// After a deliberate API change, regenerate the snapshot and commit it:
//   UPDATE_API_CONTRACT_SNAPSHOT=1 dotnet test tests/Tafseel.IntegrationTests --filter ApiContractSnapshotTests
public sealed class ApiContractSnapshotTests
{
    private static readonly JsonSerializerOptions Json = new() { WriteIndented = true };

    [Fact]
    public void Committed_endpoint_snapshot_matches_the_running_host()
    {
        using var factory = new TafseelApiFactory();
        _ = factory.CreateClient();
        var actual = JsonSerializer.Serialize(new { endpoints = Describe(factory) }, Json).ReplaceLineEndings("\n") + "\n";
        var path = Path.Combine(RepositoryRoot(), "tests", "contracts", "api-endpoints.json");

        if (Environment.GetEnvironmentVariable("UPDATE_API_CONTRACT_SNAPSHOT") == "1")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, actual);
        }

        Assert.True(File.Exists(path), $"Missing {path}. Generate it with UPDATE_API_CONTRACT_SNAPSHOT=1.");
        var committed = File.ReadAllText(path).ReplaceLineEndings("\n");
        Assert.True(committed == actual,
            "tests/contracts/api-endpoints.json does not match the API. If the API change is intended, run " +
            "UPDATE_API_CONTRACT_SNAPSHOT=1 dotnet test tests/Tafseel.IntegrationTests --filter ApiContractSnapshotTests, " +
            "commit the file, and run node scripts/ci/check-api-contract.mjs.");
    }

    private static object[] Describe(TafseelApiFactory factory) =>
        factory.Services.GetServices<EndpointDataSource>()
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .Select(endpoint => (endpoint, action: endpoint.Metadata.GetMetadata<ControllerActionDescriptor>()))
            .Where(x => x.action is not null)
            .Select(x => new
            {
                route = "/" + x.endpoint.RoutePattern.RawText?.TrimStart('/'),
                methods = (x.endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? []).Order().ToArray(),
                action = $"{x.action!.ControllerName}.{x.action.ActionName}",
                access = Access(x.endpoint),
                body = Body(x.action),
            })
            .OrderBy(x => x.route, StringComparer.Ordinal)
            .ThenBy(x => string.Join(",", x.methods), StringComparer.Ordinal)
            .ThenBy(x => x.action, StringComparer.Ordinal)
            .ToArray<object>();

    private static string Access(RouteEndpoint endpoint)
    {
        if (endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null) return "anonymous";
        var authorize = endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>();
        var named = authorize.SelectMany(a => new[] { a.Roles, a.Policy }).Where(x => !string.IsNullOrEmpty(x)).ToArray();
        return named.Length > 0 ? string.Join(" ", named) : authorize.Count > 0 ? "authenticated" : "none";
    }

    private static object? Body(ControllerActionDescriptor action)
    {
        var parameters = action.Parameters.OfType<ControllerParameterDescriptor>().ToArray();
        if (parameters.Any(p => p.BindingInfo?.BindingSource == BindingSource.Form
                || p.BindingInfo?.BindingSource == BindingSource.FormFile))
            return new { kind = "form" };
        var body = parameters.FirstOrDefault(p => p.BindingInfo?.BindingSource == BindingSource.Body);
        if (body is null) return null;
        var type = body.ParameterType;
        if (type == typeof(string) || type.IsPrimitive || type.IsArray || type == typeof(JsonElement)
            || (type.IsGenericType && typeof(System.Collections.IEnumerable).IsAssignableFrom(type)))
            return new { kind = "json", type = type.Name, fields = (object?)null };
        return new { kind = "json", type = type.Name, fields = Fields(type) };
    }

    // JSON binding is case-insensitive and camelCase on the wire. A field is required when a
    // client that leaves it out cannot produce a valid request: a constructor parameter with no
    // default that is a non-nullable value or reference type, or a property marked [Required].
    private static object[] Fields(Type type)
    {
        var nullability = new NullabilityInfoContext();
        var constructor = type.GetConstructors().OrderByDescending(c => c.GetParameters().Length).FirstOrDefault();
        var fields = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        foreach (var parameter in constructor?.GetParameters() ?? [])
        {
            var nullable = Nullable.GetUnderlyingType(parameter.ParameterType) is not null
                || (!parameter.ParameterType.IsValueType && nullability.Create(parameter).WriteState == NullabilityState.Nullable);
            fields[parameter.Name!] = !parameter.HasDefaultValue && !nullable;
        }
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance).Where(p => p.CanWrite))
        {
            var required = property.GetCustomAttributes().Any(a => a.GetType().Name is "RequiredAttribute" or "RequiredMemberAttribute");
            fields[property.Name] = fields.TryGetValue(property.Name, out var existing) ? existing || required : required;
        }
        return fields
            .OrderBy(x => x.Key, StringComparer.Ordinal)
            .Select(x => (object)new { name = char.ToLowerInvariant(x.Key[0]) + x.Key[1..], required = x.Value })
            .ToArray();
    }

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "Tafseel.sln")))
                return directory.FullName;
        throw new InvalidOperationException("Could not find Tafseel.sln above the test output directory.");
    }
}
