using Microsoft.Extensions.Options;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;

namespace Tafseel.Infrastructure.Files;

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
        PrivateMediaRules.EnsureDemo(fileName, contentType, size, _options.MaxDemoBytes);
        var header = new byte[12];
        if (await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, cancellationToken) < header.Length)
            throw new DomainException("invalid_file_signature", "The uploaded file is not a valid MP4.");
        PrivateMediaRules.EnsureDemoHeader(header);

        var key = PrivateMediaRules.NewKey("teacher-demos", ".mp4");
        var target = Resolve(key, mustExist: false);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        await using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true);
        await output.WriteAsync(header, cancellationToken);
        await stream.CopyToAsync(output, cancellationToken);
        return new(key, size, contentType);
    }

    public Task<Stream> OpenPrivateVideoAsync(string storageKey, CancellationToken cancellationToken)
        => OpenPrivateFileAsync(storageKey, cancellationToken);

    public Task<bool> PrivateFileExistsAsync(string storageKey, CancellationToken cancellationToken)
    {
        PrivateMediaRules.EnsureSafeKey(storageKey);
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
        PrivateMediaRules.EnsureAttachment(fileName, contentType, size, category, _options.MaxAttachmentBytes, out var extension);
        var header = new byte[8];
        var read = await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, cancellationToken);
        PrivateMediaRules.EnsureAttachmentHeader(extension, header, read);
        var key = PrivateMediaRules.NewKey(category, extension);
        var target = Resolve(key, mustExist: false);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        await using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true);
        await output.WriteAsync(header.AsMemory(0, read), cancellationToken);
        await stream.CopyToAsync(output, cancellationToken);
        return new(key, size, contentType);
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
        PrivateMediaRules.EnsureAvatar(fileName, contentType, size, _options.MaxAvatarBytes, out var extension);
        var header = new byte[8];
        var read = await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, cancellationToken);
        PrivateMediaRules.EnsureAvatarHeader(extension, header, read);
        var key = PrivateMediaRules.NewKey("profile-avatars", extension);
        var target = Resolve(key, mustExist: false);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        await using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true);
        await output.WriteAsync(header.AsMemory(0, read), cancellationToken);
        await stream.CopyToAsync(output, cancellationToken);
        return new(key, size, contentType);
    }

    private string Resolve(string storageKey, bool mustExist)
    {
        PrivateMediaRules.EnsureSafeKey(storageKey);
        var root = Path.GetFullPath(_options.RootPath);
        var target = Path.GetFullPath(Path.Combine(root, storageKey.Replace('/', Path.DirectorySeparatorChar)));
        if (!target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal)
            || mustExist && !File.Exists(target))
            throw new DomainException("file_not_found", "Private file was not found.");
        return target;
    }
}
