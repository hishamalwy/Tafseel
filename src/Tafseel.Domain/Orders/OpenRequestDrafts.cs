using Tafseel.Domain.Common;

namespace Tafseel.Domain.Orders;

/// <summary>
/// A student's unfinished open request, started from a file (upload first). It belongs to one student, holds the
/// fields typed so far and the files already scanned and stored, and is never visible to teachers. Publishing
/// creates the <see cref="LearningRequest"/> and moves the files onto it; the draft is then removed. One draft per
/// student: coming back, refreshing or uploading again continues the same draft.
/// </summary>
public sealed class OpenRequestDraft
{
    public const int MaxAttachments = 5;
    private readonly List<OpenRequestDraftAttachment> _attachments = [];

    private OpenRequestDraft() { }

    public OpenRequestDraft(string studentId, DateTimeOffset now)
    {
        Id = Guid.NewGuid();
        StudentId = string.IsNullOrWhiteSpace(studentId) || studentId.Length > 450
            ? throw new DomainException("student_required", "A student is required.")
            : studentId;
        CreatedAt = UpdatedAt = now;
    }

    public Guid Id { get; private set; }
    public string StudentId { get; private set; } = "";
    public Guid? SubjectId { get; private set; }
    public Guid? ServiceCatalogItemId { get; private set; }
    public string Title { get; private set; } = "";
    public string Requirements { get; private set; } = "";
    public DateTimeOffset? Deadline { get; private set; }
    public decimal? BudgetMin { get; private set; }
    public decimal? BudgetMax { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public IReadOnlyCollection<OpenRequestDraftAttachment> Attachments => _attachments;

    /// <summary>
    /// Keeps whatever the student typed, valid or not yet: a draft is a place to come back to, and the rules are
    /// checked when it is published. Only the lengths the columns can hold are enforced here.
    /// </summary>
    public void Save(string studentId, Guid? subjectId, Guid? serviceCatalogItemId, string? title, string? requirements,
        DateTimeOffset? deadline, decimal? budgetMin, decimal? budgetMax, DateTimeOffset now)
    {
        RequireOwner(studentId);
        SubjectId = subjectId;
        ServiceCatalogItemId = serviceCatalogItemId;
        Title = Truncate(title, 200);
        Requirements = Truncate(requirements, 5000);
        Deadline = deadline;
        BudgetMin = budgetMin is < 0 ? null : budgetMin;
        BudgetMax = budgetMax is < 0 ? null : budgetMax;
        UpdatedAt = now;
    }

    /// <summary>A file that was already scanned and stored. The same file (name and size) twice is refused.</summary>
    public OpenRequestDraftAttachment AddAttachment(
        string studentId, string storageKey, string originalName, string contentType, long size, DateTimeOffset now)
    {
        RequireOwner(studentId);
        if (_attachments.Any(x => string.Equals(x.OriginalName, originalName, StringComparison.OrdinalIgnoreCase) && x.Size == size))
            throw new DomainException("draft_attachment_duplicate", "This file is already attached.");
        if (_attachments.Count >= MaxAttachments)
            throw new DomainException("draft_attachment_limit", $"A request can carry up to {MaxAttachments} files.");
        var attachment = new OpenRequestDraftAttachment(Id, storageKey, originalName, contentType, size, now);
        _attachments.Add(attachment);
        UpdatedAt = now;
        return attachment;
    }

    /// <summary>Removes one file and returns its storage key, so the caller can delete the stored bytes.</summary>
    public string RemoveAttachment(string studentId, Guid attachmentId, DateTimeOffset now)
    {
        RequireOwner(studentId);
        var attachment = _attachments.SingleOrDefault(x => x.Id == attachmentId)
            ?? throw new DomainException("draft_attachment_not_found", "The file was not found.");
        _attachments.Remove(attachment);
        UpdatedAt = now;
        return attachment.StorageKey;
    }

    public void RequireOwner(string studentId)
    {
        if (!string.Equals(studentId, StudentId, StringComparison.Ordinal))
            throw new DomainException("draft_not_found", "The draft was not found.");
    }

    private static string Truncate(string? value, int max)
    {
        value = value?.Trim() ?? "";
        return value.Length <= max ? value : value[..max];
    }
}

public sealed class OpenRequestDraftAttachment
{
    private OpenRequestDraftAttachment() { }

    internal OpenRequestDraftAttachment(Guid draftId, string storageKey, string originalName, string contentType, long size, DateTimeOffset createdAt)
    {
        if (size <= 0) throw new DomainException("attachment_empty", "The file is empty.");
        Id = Guid.NewGuid();
        DraftId = draftId;
        StorageKey = storageKey;
        OriginalName = originalName;
        ContentType = contentType;
        Size = size;
        CreatedAt = createdAt;
    }

    public Guid Id { get; private set; }
    public Guid DraftId { get; private set; }
    public string StorageKey { get; private set; } = "";
    public string OriginalName { get; private set; } = "";
    public string ContentType { get; private set; } = "";
    public long Size { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
}
