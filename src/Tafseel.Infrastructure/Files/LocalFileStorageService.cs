using Microsoft.Extensions.Options;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;

namespace Tafseel.Infrastructure.Files;

public sealed class FileStorageOptions
{
    public const string SectionName = "FileStorage";
    public string RootPath { get; init; } = "App_Data";
    public long MaxDemoBytes { get; init; } = 250 * 1024 * 1024;
    public long MaxAttachmentBytes { get; init; } = 50 * 1024 * 1024;
    public long MaxAvatarBytes { get; init; } = 2 * 1024 * 1024;
}

internal sealed class LocalFileStorageService(IOptions<FileStorageOptions> options) : IFileStorageService
{
    private readonly FileStorageOptions _options = options.Value;

    public async Task<StoredFile> StorePrivateVideoAsync(
        Stream stream,
        string fileName,
        string contentType,
        long size,
        CancellationToken cancellationToken)
    {
        if (size is <= 0 || size > _options.MaxDemoBytes)
            throw new DomainException("invalid_file_size", "Demo file size is invalid.");
        if (!string.Equals(Path.GetExtension(fileName), ".mp4", StringComparison.OrdinalIgnoreCase)
            || !string.Equals(contentType, "video/mp4", StringComparison.OrdinalIgnoreCase))
            throw new DomainException("invalid_file_type", "Only MP4 demo videos are allowed.");

        var header = new byte[12];
        if (await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, cancellationToken) < header.Length
            || !header.AsSpan(4, 4).SequenceEqual("ftyp"u8))
            throw new DomainException("invalid_file_signature", "The uploaded file is not a valid MP4.");

        var key = Path.Combine("teacher-demos", DateTime.UtcNow.ToString("yyyy"), DateTime.UtcNow.ToString("MM"), $"{Guid.NewGuid():N}.mp4");
        var root = Path.GetFullPath(_options.RootPath);
        var target = Path.GetFullPath(Path.Combine(root, key));
        if (!target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal))
            throw new DomainException("invalid_storage_path", "Invalid storage path.");

        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        await using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true);
        await output.WriteAsync(header, cancellationToken);
        await stream.CopyToAsync(output, cancellationToken);
        return new(key.Replace('\\', '/'), size, contentType);
    }

    public Task<Stream> OpenPrivateVideoAsync(string storageKey, CancellationToken cancellationToken)
        => OpenPrivateFileAsync(storageKey, cancellationToken);

    public Task<bool> PrivateFileExistsAsync(string storageKey, CancellationToken cancellationToken)
    {
        var root = Path.GetFullPath(_options.RootPath);
        var target = Path.GetFullPath(Path.Combine(root, storageKey.Replace('/', Path.DirectorySeparatorChar)));
        return Task.FromResult(
            target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal)
            && File.Exists(target));
    }

    public async Task<StoredFile> StorePrivateFileAsync(
        Stream stream, string fileName, string contentType, long size, string category,
        CancellationToken cancellationToken)
    {
        if (size is <= 0 || size > _options.MaxAttachmentBytes)
            throw new DomainException("invalid_file_size", "Attachment file size is invalid.");
        if (category is not ("request-attachments" or "order-deliveries"
            or "live-session-attachments" or "message-attachments" or "dispute-evidence"
            or "qualification-resources"))
            throw new DomainException("invalid_storage_category", "Storage category is invalid.");
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var expected = extension switch
        {
            ".pdf" => "application/pdf",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".zip" => "application/zip",
            _ => ""
        };
        if (expected.Length == 0 || !string.Equals(expected, contentType, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("invalid_file_type", "Attachment file type is not allowed.");
        var header = new byte[8];
        var read = await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, cancellationToken);
        var valid = extension switch
        {
            ".pdf" => read >= 4 && header.AsSpan(0, 4).SequenceEqual("%PDF"u8),
            ".png" => read == 8 && header.SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            ".jpg" or ".jpeg" => read >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff,
            _ => read >= 4 && header[0] == (byte)'P' && header[1] == (byte)'K'
        };
        if (!valid)
            throw new DomainException("invalid_file_signature", "Attachment content does not match its file type.");
        var key = Path.Combine(category, DateTime.UtcNow.ToString("yyyy"), DateTime.UtcNow.ToString("MM"),
            $"{Guid.NewGuid():N}{extension}");
        var target = Resolve(key, mustExist: false);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        await using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true);
        await output.WriteAsync(header.AsMemory(0, read), cancellationToken);
        await stream.CopyToAsync(output, cancellationToken);
        return new(key.Replace('\\', '/'), size, contentType);
    }

    public Task<Stream> OpenPrivateFileAsync(string storageKey, CancellationToken cancellationToken)
    {
        var target = Resolve(storageKey, mustExist: true);
        return Task.FromResult<Stream>(new FileStream(
            target, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, FileOptions.Asynchronous));
    }

    public Task DeletePrivateFileAsync(string storageKey, CancellationToken cancellationToken)
    {
        var target = Resolve(storageKey, mustExist: false);
        if (File.Exists(target))
            File.Delete(target);
        return Task.CompletedTask;
    }

    public async Task<StoredFile> StoreAvatarAsync(
        Stream stream, string fileName, string contentType, long size, CancellationToken cancellationToken)
    {
        if (size is <= 0 || size > _options.MaxAvatarBytes)
            throw new DomainException("invalid_avatar_size", "Avatar must be between 1 byte and 2 MB.");
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var expected = extension switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            _ => ""
        };
        if (expected.Length == 0 || !string.Equals(expected, contentType, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("invalid_avatar_type", "Only JPEG and PNG avatars are allowed.");

        var header = new byte[8];
        var read = await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, cancellationToken);
        var valid = extension switch
        {
            ".png" => read == 8 && header.SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            _ => read >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff
        };
        if (!valid)
            throw new DomainException("invalid_avatar_signature", "Avatar content does not match its file type.");

        var key = Path.Combine(
            "profile-avatars",
            DateTime.UtcNow.ToString("yyyy"),
            DateTime.UtcNow.ToString("MM"),
            $"{Guid.NewGuid():N}{extension}");
        var target = Resolve(key, mustExist: false);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        await using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true);
        await output.WriteAsync(header.AsMemory(0, read), cancellationToken);
        await stream.CopyToAsync(output, cancellationToken);
        return new(key.Replace('\\', '/'), size, contentType);
    }

    private string Resolve(string storageKey, bool mustExist)
    {
        var root = Path.GetFullPath(_options.RootPath);
        var target = Path.GetFullPath(Path.Combine(root, storageKey.Replace('/', Path.DirectorySeparatorChar)));
        if (!target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal)
            || mustExist && !File.Exists(target))
            throw new DomainException("file_not_found", "Private file was not found.");
        return target;
    }
}
