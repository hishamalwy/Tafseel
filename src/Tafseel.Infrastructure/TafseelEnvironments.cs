using Microsoft.Extensions.Hosting;

namespace Tafseel.Infrastructure;

/// <summary>
/// The four logical environments (docs/ENVIRONMENTS.md). ASP.NET Core names Development, Staging and Production;
/// PreProduction is Tafseel's production-like rehearsal environment. "Testing" is the integration-test host only.
/// </summary>
public static class TafseelEnvironments
{
    public const string PreProduction = "PreProduction";

    public static bool IsPreProduction(this IHostEnvironment environment) =>
        environment.IsEnvironment(PreProduction);

    /// <summary>
    /// Environments that may hold demo accounts and demo business data (the canonical seed). Never Production.
    /// </summary>
    public static bool AllowsDemoData(this IHostEnvironment? environment) =>
        environment is not null
        && (environment.IsDevelopment() || environment.IsStaging() || environment.IsPreProduction());
}
