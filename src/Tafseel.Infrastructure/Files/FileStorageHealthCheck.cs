using Azure.Storage.Blobs;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;

namespace Tafseel.Infrastructure.Files;

/// <summary>
/// Readiness probe for the configured private file storage provider.
/// Does not expose connection strings or storage keys. Avoids scoped IFileStorageService
/// so it can be registered with the health-check container safely.
/// </summary>
public sealed class FileStorageHealthCheck(IOptions<FileStorageOptions> options) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var settings = options.Value;
        try
        {
            if (string.Equals(settings.Provider, "AzureBlob", StringComparison.OrdinalIgnoreCase))
            {
                var azure = settings.AzureBlob;
                if (string.IsNullOrWhiteSpace(azure.ConnectionString)
                    || azure.ConnectionString.StartsWith("REPLACE_", StringComparison.Ordinal)
                    || string.IsNullOrWhiteSpace(azure.ContainerName))
                    return HealthCheckResult.Unhealthy("Azure Blob storage is not configured.");

                var container = new BlobServiceClient(azure.ConnectionString)
                    .GetBlobContainerClient(azure.ContainerName);
                if (!await container.ExistsAsync(cancellationToken))
                    return HealthCheckResult.Unhealthy("Azure Blob private container was not found.");
                return HealthCheckResult.Healthy($"AzureBlob container reachable ({azure.ContainerName}).");
            }

            if (string.Equals(settings.Provider, "Local", StringComparison.OrdinalIgnoreCase))
            {
                var root = Path.GetFullPath(settings.RootPath);
                Directory.CreateDirectory(root);
                var probe = Path.Combine(root, $".health-{Guid.NewGuid():N}");
                await File.WriteAllTextAsync(probe, "ok", cancellationToken);
                File.Delete(probe);
                return HealthCheckResult.Healthy("Local private file root is writable.");
            }

            return HealthCheckResult.Unhealthy($"Unknown file storage provider '{settings.Provider}'.");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("Private file storage is unavailable.", ex);
        }
    }
}
