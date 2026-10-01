using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Orders;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Domain.Orders;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Orders;

/// <summary>
/// Upload-first open requests. A file is scanned and stored through the ordinary private-file pipeline (the same
/// category, type rules, size rules and scanner as request attachments) and only then attached to the student's own
/// draft; a refused file never becomes part of it. Every call is scoped to the calling student.
/// </summary>
internal sealed class OpenRequestDraftService(
    TafseelDbContext db,
    IFileStorageService files,
    TimeProvider clock) : IOpenRequestDraftService
{
    internal const string FileCategory = "request-attachments";

    public async Task<OpenRequestDraftDto?> GetCurrentAsync(string studentId, CancellationToken ct)
    {
        var draft = await db.OpenRequestDrafts.AsNoTracking().Include(x => x.Attachments)
            .SingleOrDefaultAsync(x => x.StudentId == studentId, ct);
        return draft is null ? null : Map(draft);
    }

    public async Task<OpenRequestDraftDto> SaveAsync(string studentId, SaveOpenRequestDraft input, CancellationToken ct)
    {
        var draft = await OwnOrNewAsync(studentId, ct);
        draft.Save(studentId, input.SubjectId, input.ServiceCatalogItemId, input.Title, input.Requirements,
            input.Deadline, input.BudgetMin, input.BudgetMax, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
        return Map(draft);
    }

    public async Task<OpenRequestDraftDto> AddAttachmentAsync(
        string studentId, Stream stream, string fileName, string contentType, long size, CancellationToken ct)
    {
        var draft = await OwnOrNewAsync(studentId, ct);
        var name = Path.GetFileName(fileName) is { Length: > 0 and <= 255 } safe ? safe : "attachment";
        // Refuse a duplicate or a sixth file before spending a scan and a store on it.
        if (draft.Attachments.Any(x => string.Equals(x.OriginalName, name, StringComparison.OrdinalIgnoreCase) && x.Size == size))
            throw new DomainException("draft_attachment_duplicate", "This file is already attached.");
        if (draft.Attachments.Count >= OpenRequestDraft.MaxAttachments)
            throw new DomainException("draft_attachment_limit", $"A request can carry up to {OpenRequestDraft.MaxAttachments} files.");

        var stored = await files.StorePrivateFileAsync(stream, name, contentType, size, FileCategory, ct);
        try
        {
            draft.AddAttachment(studentId, stored.StorageKey, name, stored.ContentType, stored.Size, clock.GetUtcNow());
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            await files.DeletePrivateFileAsync(stored.StorageKey, CancellationToken.None);
            throw;
        }
        return Map(draft);
    }

    public async Task<OpenRequestDraftDto> RemoveAttachmentAsync(string studentId, Guid attachmentId, CancellationToken ct)
    {
        var draft = await OwnAsync(studentId, ct);
        var storageKey = draft.RemoveAttachment(studentId, attachmentId, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
        await files.DeletePrivateFileAsync(storageKey, ct);
        return Map(draft);
    }

    public async Task DiscardAsync(string studentId, CancellationToken ct)
    {
        var draft = await db.OpenRequestDrafts.Include(x => x.Attachments).SingleOrDefaultAsync(x => x.StudentId == studentId, ct);
        if (draft is null) return;
        var keys = draft.Attachments.Select(x => x.StorageKey).ToArray();
        db.Remove(draft);
        await db.SaveChangesAsync(ct);
        foreach (var key in keys)
            await files.DeletePrivateFileAsync(key, ct);
    }

    private async Task<OpenRequestDraft> OwnAsync(string studentId, CancellationToken ct) =>
        await db.OpenRequestDrafts.Include(x => x.Attachments).SingleOrDefaultAsync(x => x.StudentId == studentId, ct)
        ?? throw new DomainException("draft_not_found", "The draft was not found.");

    private async Task<OpenRequestDraft> OwnOrNewAsync(string studentId, CancellationToken ct)
    {
        var draft = await db.OpenRequestDrafts.Include(x => x.Attachments).SingleOrDefaultAsync(x => x.StudentId == studentId, ct);
        if (draft is not null) return draft;
        draft = new OpenRequestDraft(studentId, clock.GetUtcNow());
        db.Add(draft);
        return draft;
    }

    internal static OpenRequestDraftDto Map(OpenRequestDraft draft) => new(
        draft.Id, draft.SubjectId, draft.ServiceCatalogItemId, draft.Title, draft.Requirements,
        draft.Deadline, draft.BudgetMin, draft.BudgetMax,
        draft.Attachments.OrderBy(x => x.CreatedAt)
            .Select(x => new AttachmentDto(x.Id, x.OriginalName, x.ContentType, x.Size, x.CreatedAt)).ToArray(),
        OpenRequestDraft.MaxAttachments, draft.UpdatedAt);
}
