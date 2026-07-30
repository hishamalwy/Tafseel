namespace Tafseel.Infrastructure.Files;

public sealed class FileStorageOptions
{
    public const string SectionName = "FileStorage";

    /// <summary>Local (Development/Testing) or AzureBlob (Production-prepared).</summary>
    public string Provider { get; init; } = "Local";

    public string RootPath { get; init; } = "App_Data";
    public long MaxDemoBytes { get; init; } = 250 * 1024 * 1024;
    public long MaxAttachmentBytes { get; init; } = 50 * 1024 * 1024;
    public long MaxAvatarBytes { get; init; } = 2 * 1024 * 1024;

    public AzureBlobStorageOptions AzureBlob { get; init; } = new();
}

public sealed class AzureBlobStorageOptions
{
    /// <summary>Connection string from secret store. Never log this value.</summary>
    public string ConnectionString { get; init; } = "";

    /// <summary>Private container name. Public anonymous access must remain disabled.</summary>
    public string ContainerName { get; init; } = "tafseel-private";
}
