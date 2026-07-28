using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Tafseel.Infrastructure.Persistence;

public sealed class TafseelDesignTimeDbContextFactory : IDesignTimeDbContextFactory<TafseelDbContext>
{
    public TafseelDbContext CreateDbContext(string[] args)
    {
        var environmentName =
            Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
            ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
            ?? "Development";

        var configuration = new ConfigurationBuilder()
            .SetBasePath(ResolveConfigurationBasePath())
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile($"appsettings.{environmentName}.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        var connectionString = configuration.GetConnectionString("Tafseel");
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException(
                "Connection string 'ConnectionStrings:Tafseel' is required for EF Core design-time operations.");

        var options = new DbContextOptionsBuilder<TafseelDbContext>()
            .UseSqlServer(connectionString)
            .Options;

        return new TafseelDbContext(options);
    }

    private static string ResolveConfigurationBasePath()
    {
        foreach (var candidate in CandidateDirectories())
            if (File.Exists(Path.Combine(candidate, "appsettings.json")))
                return candidate;

        throw new DirectoryNotFoundException(
            "Could not locate appsettings.json for EF Core design-time operations. " +
            "Run the command from the repository root or the startup project directory.");
    }

    private static IEnumerable<string> CandidateDirectories()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var root in new[]
                 {
                     Environment.CurrentDirectory,
                     AppContext.BaseDirectory
                 })
        {
            if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
                continue;

            var current = new DirectoryInfo(root);
            while (current is not null)
            {
                if (seen.Add(current.FullName))
                    yield return current.FullName;

                var startupProjectDir = Path.Combine(current.FullName, "src", "Tafseel.Api");
                if (Directory.Exists(startupProjectDir) && seen.Add(startupProjectDir))
                    yield return startupProjectDir;

                current = current.Parent;
            }
        }
    }
}
