using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;

namespace Tafseel.Infrastructure.Files;

/// <summary>
/// Private Azure Blob object storage. Blobs are never assumed public; callers stream through authenticated APIs.
/// Connection strings and SAS material are never returned as storage keys.
/// </summary>
internal sealed class AzureBlobFileStorageService : IFileStorageService
{
    private readonly FileStorageOptions _options;
    private readonly BlobContainerClient _container;
    private readonly ILogger<AzureBlobFileStorageService> _logger;

    public AzureBlobFileStorageService(
        IOptions<FileStorageOptions> options,
        ILogger<AzureBlobFileStorageService> logger)
    {
        _options = options.Value;
        _logger = logger;
        var azure = _options.AzureBlob
            ?? throw new InvalidOperationException("FileStorage:AzureBlob is required for the AzureBlob provider.");
        if (string.IsNullOrWhiteSpace(azure.ConnectionString)
            || azure.ConnectionString.StartsWith("REPLACE_", StringComparison.Ordinal))
            throw new InvalidOperationException("FileStorage:AzureBlob:ConnectionString is missing or still a placeholder.");
        if (string.IsNullOrWhiteSpace(azure.ContainerName))
            throw new InvalidOperationException("FileStorage:AzureBlob:ContainerName is required.");

        var service = new BlobServiceClient(azure.ConnectionString);
        _container = service.GetBlobContainerClient(azure.ContainerName);
    }

    public async Task EnsureContainerAsync(CancellationToken cancellationToken)
    {
        // Private container only — never enable anonymous public access here.
        await _container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: cancellationToken);
        _logger.LogInformation("Azure Blob private container ready. Container={Container}", _container.Name);
    }

    public async Task<StoredFile> StorePrivateVideoAsync(
        Stream stream, string fileName, string contentType, long size, CancellationToken cancellationToken)
    {
        PrivateMediaRules.EnsureDemo(fileName, contentType, size, _options.MaxDemoBytes);
        await using var buffered = await BufferWithHeaderAsync(stream, 12, cancellationToken);
        PrivateMediaRules.EnsureDemoHeader(buffered.Header);
        var key = PrivateMediaRules.NewKey("teacher-demos", ".mp4");
        await UploadAsync(key, buffered.Body, contentType, cancellationToken);
        return new(key, size, contentType);
    }

    public Task<Stream> OpenPrivateVideoAsync(string storageKey, CancellationToken cancellationToken)
        => OpenPrivateFileAsync(storageKey, cancellationToken);

    public async Task<bool> PrivateFileExistsAsync(string storageKey, CancellationToken cancellationToken)
    {
        PrivateMediaRules.EnsureSafeKey(storageKey);
        try
        {
            return await Blob(storageKey).ExistsAsync(cancellationToken);
        }
        catch (RequestFailedException ex)
        {
            _logger.LogWarning(ex, "Azure Blob exists check failed for a private object.");
            throw new DomainException("storage_unavailable", "Private object storage is unavailable.");
        }
    }

    public async Task<StoredFile> StorePrivateFileAsync(
        Stream stream, string fileName, string contentType, long size, string category,
        CancellationToken cancellationToken)
    {
        PrivateMediaRules.EnsureAttachment(fileName, contentType, size, category, _options.MaxAttachmentBytes, out var extension);
        await using var buffered = await BufferWithHeaderAsync(stream, 8, cancellationToken);
        PrivateMediaRules.EnsureAttachmentHeader(extension, buffered.Header, buffered.HeaderLength);
        var key = PrivateMediaRules.NewKey(category, extension);
        await UploadAsync(key, buffered.Body, contentType, cancellationToken);
        return new(key, size, contentType);
    }

    public async Task<Stream> OpenPrivateFileAsync(string storageKey, CancellationToken cancellationToken)
    {
        PrivateMediaRules.EnsureSafeKey(storageKey);
        try
        {
            var response = await Blob(storageKey).DownloadStreamingAsync(cancellationToken: cancellationToken);
            return response.Value.Content;
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            throw new DomainException("file_not_found", "Private file was not found.");
        }
        catch (RequestFailedException ex)
        {
            _logger.LogWarning(ex, "Azure Blob download failed for a private object.");
            throw new DomainException("storage_unavailable", "Private object storage is unavailable.");
        }
    }

    public async Task DeletePrivateFileAsync(string storageKey, CancellationToken cancellationToken)
    {
        PrivateMediaRules.EnsureSafeKey(storageKey);
        try
        {
            await Blob(storageKey).DeleteIfExistsAsync(cancellationToken: cancellationToken);
        }
        catch (RequestFailedException ex)
        {
            _logger.LogWarning(ex, "Azure Blob delete failed for a private object.");
            throw new DomainException("storage_unavailable", "Private object storage is unavailable.");
        }
    }

    public async Task<StoredFile> StoreAvatarAsync(
        Stream stream, string fileName, string contentType, long size, CancellationToken cancellationToken)
    {
        PrivateMediaRules.EnsureAvatar(fileName, contentType, size, _options.MaxAvatarBytes, out var extension);
        await using var buffered = await BufferWithHeaderAsync(stream, 8, cancellationToken);
        PrivateMediaRules.EnsureAvatarHeader(extension, buffered.Header, buffered.HeaderLength);
        var key = PrivateMediaRules.NewKey("profile-avatars", extension);
        await UploadAsync(key, buffered.Body, contentType, cancellationToken);
        return new(key, size, contentType);
    }

    private BlobClient Blob(string storageKey) => _container.GetBlobClient(storageKey);

    private async Task UploadAsync(string key, Stream body, string contentType, CancellationToken cancellationToken)
    {
        try
        {
            body.Position = 0;
            await Blob(key).UploadAsync(
                body,
                new BlobUploadOptions
                {
                    HttpHeaders = new BlobHttpHeaders { ContentType = contentType }
                },
                cancellationToken);
        }
        catch (RequestFailedException ex)
        {
            _logger.LogError(ex, "Azure Blob upload failed for a private object.");
            throw new DomainException("storage_unavailable", "Private object storage is unavailable.");
        }
    }

    private static async Task<BufferedUpload> BufferWithHeaderAsync(
        Stream stream, int headerLength, CancellationToken cancellationToken)
    {
        var header = new byte[headerLength];
        var read = await stream.ReadAtLeastAsync(header, headerLength, throwOnEndOfStream: false, cancellationToken);
        var memory = new MemoryStream();
        await memory.WriteAsync(header.AsMemory(0, read), cancellationToken);
        await stream.CopyToAsync(memory, cancellationToken);
        memory.Position = 0;
        return new BufferedUpload(header, read, memory);
    }

    private sealed class BufferedUpload(byte[] header, int headerLength, MemoryStream body) : IAsyncDisposable
    {
        public byte[] Header { get; } = header;
        public int HeaderLength { get; } = headerLength;
        public MemoryStream Body { get; } = body;
        public ValueTask DisposeAsync() => Body.DisposeAsync();
    }
}
