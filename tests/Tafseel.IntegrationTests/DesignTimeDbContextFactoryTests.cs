using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

public sealed class DesignTimeDbContextFactoryTests
{
    [Fact]
    public void Design_time_factory_creates_dbcontext_without_runtime_option_sections()
    {
        var temp = Directory.CreateTempSubdirectory();
        var previousDirectory = Environment.CurrentDirectory;
        var previousAspNetEnvironment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        var previousDotnetEnvironment = Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");

        try
        {
            File.WriteAllText(
                Path.Combine(temp.FullName, "appsettings.json"),
                """
                {
                  "ConnectionStrings": {
                    "Tafseel": "Server=(localdb)\\mssqllocaldb;Database=TafseelDesignTimeFactoryTests;Trusted_Connection=True;MultipleActiveResultSets=false;TrustServerCertificate=True"
                  }
                }
                """);

            Environment.CurrentDirectory = temp.FullName;
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
            Environment.SetEnvironmentVariable("DOTNET_ENVIRONMENT", "Development");

            using var context = new TafseelDesignTimeDbContextFactory().CreateDbContext([]);

            Assert.NotNull(context);
            Assert.Equal("Microsoft.EntityFrameworkCore.SqlServer", context.Database.ProviderName);
        }
        finally
        {
            Environment.CurrentDirectory = previousDirectory;
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", previousAspNetEnvironment);
            Environment.SetEnvironmentVariable("DOTNET_ENVIRONMENT", previousDotnetEnvironment);
            temp.Delete(recursive: true);
        }
    }
}
