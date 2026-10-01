using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Files;

/// <summary>Pending while being scanned; Clean once the engine passed it; Rejected when it was refused.</summary>
public enum FileScanStatus { PendingScan = 0, Clean = 1, Rejected = 2 }

/// <summary>
/// The scan verdict of one stored file (SEC-04). It is saved with the upload it belongs to (same unit of work), so a
/// verdict never exists for a file whose upload was rolled back. A refused upload is never stored; it is logged.
/// </summary>
public sealed class FileScanRecord
{
    private FileScanRecord() { }

    internal FileScanRecord(string storageKey, string category, FileScanStatus status, string engine,
        string? signature, DateTimeOffset now)
    {
        Id = Guid.NewGuid(); StorageKey = storageKey; Category = category; Status = status; Engine = engine;
        Signature = signature; ScannedAt = now;
    }

    public Guid Id { get; private set; }
    /// <summary>The stored key for a clean file; a synthetic "rejected:" key for a refused upload.</summary>
    public string StorageKey { get; private set; } = "";
    public string Category { get; private set; } = "";
    public FileScanStatus Status { get; private set; }
    public string Engine { get; private set; } = "";
    public string? Signature { get; private set; }
    public DateTimeOffset ScannedAt { get; private set; }
}

/// <summary>
/// Puts the scan in front of every stored upload, whatever the storage provider:
/// <list type="number">
/// <item>the upload is copied to a temporary file (PendingScan) that deletes itself when closed;</item>
/// <item>the scanner reads it; an infected file is refused with <c>file_rejected_malware</c> and never stored;</item>
/// <item>when the scanner cannot answer, the upload is refused with <c>file_scan_unavailable</c> (fail safe);</item>
/// <item>only a clean file reaches storage, and its Clean verdict is recorded against the storage key.</item>
/// </list>
/// Reads: with an enforced engine, a file is served only when a Clean verdict is on record, so a file stored before
/// scanning (or by any path that skipped it) is never handed to anyone. The verdict is tracked on the request's own
/// context and saved by the caller together with the record that points at the file.
/// </summary>
internal sealed class ScanningFileStorageService(
    IFileStorageService inner,
    IMalwareScanner scanner,
    IOptions<MalwareScanningOptions> options,
    TafseelDbContext db,
    TimeProvider clock,
    ILogger<ScanningFileStorageService> logger) : IFileStorageService
{
    public Task<StoredFile> StorePrivateVideoAsync(Stream stream, string fileName, string contentType, long size,
        CancellationToken cancellationToken, bool videoOnly = true) =>
        ScanThenStoreAsync(stream, "teacher-video",
            clean => inner.StorePrivateVideoAsync(clean, fileName, contentType, size, cancellationToken, videoOnly),
            cancellationToken);

    public Task<StoredFile> StorePrivateFileAsync(Stream stream, string fileName, string contentType, long size,
        string category, CancellationToken cancellationToken) =>
        ScanThenStoreAsync(stream, category,
            clean => inner.StorePrivateFileAsync(clean, fileName, contentType, size, category, cancellationToken),
            cancellationToken);

    public Task<StoredFile> StoreAvatarAsync(Stream stream, string fileName, string contentType, long size,
        CancellationToken cancellationToken) =>
        ScanThenStoreAsync(stream, "profile-avatars",
            clean => inner.StoreAvatarAsync(clean, fileName, contentType, size, cancellationToken),
            cancellationToken);

    public async Task<Stream> OpenPrivateVideoAsync(string storageKey, CancellationToken cancellationToken)
    {
        await EnsureServableAsync(storageKey, cancellationToken);
        return await inner.OpenPrivateVideoAsync(storageKey, cancellationToken);
    }

    public async Task<Stream> OpenPrivateFileAsync(string storageKey, CancellationToken cancellationToken)
    {
        await EnsureServableAsync(storageKey, cancellationToken);
        return await inner.OpenPrivateFileAsync(storageKey, cancellationToken);
    }

    public Task<bool> PrivateFileExistsAsync(string storageKey, CancellationToken cancellationToken) =>
        inner.PrivateFileExistsAsync(storageKey, cancellationToken);

    public Task DeletePrivateFileAsync(string storageKey, CancellationToken cancellationToken) =>
        inner.DeletePrivateFileAsync(storageKey, cancellationToken);

    private async Task<StoredFile> ScanThenStoreAsync(Stream upload, string category,
        Func<Stream, Task<StoredFile>> store, CancellationToken ct)
    {
        var path = Path.Combine(Path.GetTempPath(), $"tafseel-scan-{Guid.NewGuid():N}.upload");
        await using var pending = new FileStream(path, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None,
            81920, FileOptions.Asynchronous | FileOptions.DeleteOnClose);
        await upload.CopyToAsync(pending, ct);
        pending.Position = 0;
        var verdict = await scanner.ScanAsync(pending, ct);
        switch (verdict.Outcome)
        {
            case ScanOutcome.Infected:
                logger.LogWarning("Upload refused by {Engine} in {Category}: {Signature}", verdict.Engine, category, verdict.Signature);
                throw new DomainException("file_rejected_malware",
                    "This file was blocked by the safety check and was not uploaded.");
            case ScanOutcome.Unavailable:
                logger.LogError("Upload refused: the malware scanner is unavailable ({Problem}).", verdict.Problem);
                throw new DomainException("file_scan_unavailable",
                    "Files cannot be checked for safety right now, so nothing was uploaded. Try again in a few minutes.");
        }
        pending.Position = 0;
        var stored = await store(pending);
        db.FileScanRecords.Add(new FileScanRecord(stored.StorageKey, category, FileScanStatus.Clean, verdict.Engine, null,
            clock.GetUtcNow()));
        return stored;
    }

    private async Task EnsureServableAsync(string storageKey, CancellationToken ct)
    {
        if (!options.Value.Enforced) return;
        var status = await db.FileScanRecords.AsNoTracking().Where(x => x.StorageKey == storageKey)
            .Select(x => (FileScanStatus?)x.Status).SingleOrDefaultAsync(ct);
        if (status != FileScanStatus.Clean)
            throw new DomainException("file_scan_pending",
                "This file has not passed the safety check, so it cannot be opened.");
    }
}
