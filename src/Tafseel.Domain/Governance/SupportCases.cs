using System.Security.Cryptography;
using Tafseel.Domain.Common;

namespace Tafseel.Domain.Governance;

/// <summary>
/// What a person can report outside a paid purchase. A problem with something paid for is a dispute, not a case:
/// disputes carry the money rules, and this intake never moves money.
/// </summary>
public enum SupportCaseCategory
{
    AccountAccess = 0,
    Harassment = 1,
    UnsafeContent = 2,
    SessionConduct = 3,
    PlatformProblem = 4
}

/// <summary>Open (nobody owns it yet) → InProgress (a named person owns it) → Resolved (with an outcome in words).</summary>
public enum SupportCaseStatus { Open = 0, InProgress = 1, Resolved = 2 }

/// <summary>
/// A help or abuse report with a reference the reporter can quote, a named owner, a written outcome and its whole
/// conversation. Reporters who cannot sign in (account access) leave a contact e-mail instead of an account.
/// </summary>
public sealed class SupportCase
{
    private readonly List<SupportCaseMessage> _messages = [];
    private readonly List<SupportCaseAttachment> _attachments = [];
    private SupportCase() { }

    public static SupportCase Report(string reporterId, SupportCaseCategory category, string description,
        string? relatedReference, DateTimeOffset now)
    {
        var item = New(category, description, relatedReference, now);
        item.ReporterId = Required(reporterId, 450);
        return item;
    }

    /// <summary>An account-access report from someone who cannot sign in: identified only by the e-mail they give.</summary>
    public static SupportCase ReportAccountAccess(string contactEmail, string? contactName, string description, DateTimeOffset now)
    {
        var email = (contactEmail ?? "").Trim();
        if (email.Length is < 5 or > 256 || !email.Contains('@') || email.Any(char.IsWhiteSpace))
            throw new DomainException("support_contact_email_invalid", "Enter the e-mail address of your Tafseel account.");
        var item = New(SupportCaseCategory.AccountAccess, description, null, now);
        item.ContactEmail = email;
        item.ContactName = string.IsNullOrWhiteSpace(contactName) ? null : Clip(contactName, 150);
        return item;
    }

    private static SupportCase New(SupportCaseCategory category, string description, string? relatedReference, DateTimeOffset now)
    {
        if (!Enum.IsDefined(category))
            throw new DomainException("support_category_invalid", "Choose what the report is about.");
        var text = (description ?? "").Trim();
        if (text.Length is < 10 or > 4000)
            throw new DomainException("support_description_invalid", "Describe what happened in 10 to 4000 characters.");
        var related = string.IsNullOrWhiteSpace(relatedReference) ? null : Clip(relatedReference, 200);
        return new SupportCase
        {
            Id = Guid.NewGuid(),
            Reference = NewReference(),
            Category = category,
            Description = text,
            RelatedReference = related,
            Status = SupportCaseStatus.Open,
            CreatedAt = now,
            UpdatedAt = now
        };
    }

    public Guid Id { get; private set; }
    /// <summary>What the reporter quotes: "TFS-H-7K2M9Q".</summary>
    public string Reference { get; private set; } = "";
    public SupportCaseCategory Category { get; private set; }
    public string? ReporterId { get; private set; }
    public string? ContactEmail { get; private set; }
    public string? ContactName { get; private set; }
    public string Description { get; private set; } = "";
    /// <summary>What the report is about, as the reporter's screen named it (a conversation, a session, a profile).</summary>
    public string? RelatedReference { get; private set; }
    public SupportCaseStatus Status { get; private set; }
    public string? OwnerId { get; private set; }
    public DateTimeOffset? OwnedAt { get; private set; }
    public string? Outcome { get; private set; }
    public string? ResolvedBy { get; private set; }
    public DateTimeOffset? ResolvedAt { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];
    public IReadOnlyCollection<SupportCaseMessage> Messages => _messages;
    public IReadOnlyCollection<SupportCaseAttachment> Attachments => _attachments;

    public bool IsReporter(string userId) => ReporterId is not null && ReporterId == userId;

    /// <summary>A staff member takes the case. Nobody handles a report they made.</summary>
    public void Take(string staffId, DateTimeOffset now)
    {
        EnsureNotReporter(staffId);
        if (Status == SupportCaseStatus.Resolved) throw InvalidTransition();
        OwnerId = Required(staffId, 450);
        OwnedAt = now;
        Status = SupportCaseStatus.InProgress;
        UpdatedAt = now;
    }

    public void AddReporterMessage(string reporterId, string body, DateTimeOffset now)
    {
        if (!IsReporter(reporterId)) throw new DomainException("support_case_not_found", "The case was not found.");
        if (Status == SupportCaseStatus.Resolved) throw InvalidTransition();
        _messages.Add(new SupportCaseMessage(Id, reporterId, false, body, now));
        UpdatedAt = now;
    }

    public void AddStaffMessage(string staffId, string body, DateTimeOffset now)
    {
        EnsureNotReporter(staffId);
        if (Status == SupportCaseStatus.Resolved) throw InvalidTransition();
        _messages.Add(new SupportCaseMessage(Id, staffId, true, body, now));
        UpdatedAt = now;
    }

    public SupportCaseAttachment AddAttachment(string reporterId, string storageKey, string originalName,
        string contentType, long size, DateTimeOffset now)
    {
        if (!IsReporter(reporterId)) throw new DomainException("support_case_not_found", "The case was not found.");
        if (Status == SupportCaseStatus.Resolved) throw InvalidTransition();
        if (_attachments.Count >= 5)
            throw new DomainException("support_attachment_limit", "A report can have at most 5 files.");
        var attachment = new SupportCaseAttachment(Id, reporterId, storageKey, originalName, contentType, size, now);
        _attachments.Add(attachment);
        UpdatedAt = now;
        return attachment;
    }

    /// <summary>Closes the case with what was done, in words the reporter reads. Only its owner resolves it.</summary>
    public void Resolve(string staffId, string outcome, DateTimeOffset now)
    {
        EnsureNotReporter(staffId);
        if (Status == SupportCaseStatus.Resolved) throw InvalidTransition();
        if (OwnerId is not null && OwnerId != staffId)
            throw new DomainException("support_case_owned_by_other", "Another team member owns this case. Take it over first.");
        var text = (outcome ?? "").Trim();
        if (text.Length is < 10 or > 2000)
            throw new DomainException("support_outcome_required", "Write the outcome the reporter will read (10 to 2000 characters).");
        OwnerId ??= staffId;
        OwnedAt ??= now;
        Outcome = text;
        ResolvedBy = staffId;
        ResolvedAt = now;
        Status = SupportCaseStatus.Resolved;
        UpdatedAt = now;
    }

    private void EnsureNotReporter(string staffId)
    {
        if (ReporterId is not null && ReporterId == staffId)
            throw new DomainException("support_self_handling_forbidden", "You cannot handle a report you made.");
    }

    // Unambiguous letters and digits only (no 0/O, 1/I): read over the phone without mistakes.
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static string NewReference() =>
        "TFS-H-" + string.Concat(RandomNumberGenerator.GetBytes(6).Select(b => Alphabet[b % Alphabet.Length]));

    private static DomainException InvalidTransition() =>
        new("support_case_transition_invalid", "This case is already resolved.");

    internal static string Required(string? value, int max)
    {
        var text = (value ?? "").Trim();
        if (text.Length == 0 || text.Length > max)
            throw new DomainException("support_value_invalid", "A required value is missing or too long.");
        return text;
    }

    private static string Clip(string value, int max)
    {
        var text = value.Trim();
        return text.Length <= max ? text : text[..max];
    }
}

public sealed class SupportCaseMessage
{
    private SupportCaseMessage() { }
    internal SupportCaseMessage(Guid caseId, string authorId, bool fromStaff, string body, DateTimeOffset now)
    {
        var text = (body ?? "").Trim();
        if (text.Length is 0 or > 4000)
            throw new DomainException("support_message_invalid", "A message must be 1 to 4000 characters.");
        Id = Guid.NewGuid(); SupportCaseId = caseId; AuthorId = SupportCase.Required(authorId, 450);
        FromStaff = fromStaff; Body = text; CreatedAt = now;
    }
    public Guid Id { get; private set; }
    public Guid SupportCaseId { get; private set; }
    public string AuthorId { get; private set; } = "";
    public bool FromStaff { get; private set; }
    public string Body { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class SupportCaseAttachment
{
    private SupportCaseAttachment() { }
    internal SupportCaseAttachment(Guid caseId, string uploaderId, string storageKey, string originalName,
        string contentType, long size, DateTimeOffset now)
    {
        Id = Guid.NewGuid(); SupportCaseId = caseId; UploaderId = SupportCase.Required(uploaderId, 450);
        StorageKey = SupportCase.Required(storageKey, 300); OriginalName = SupportCase.Required(originalName, 255);
        ContentType = SupportCase.Required(contentType, 100); Size = size; CreatedAt = now;
    }
    public Guid Id { get; private set; }
    public Guid SupportCaseId { get; private set; }
    public string UploaderId { get; private set; } = "";
    public string StorageKey { get; private set; } = "";
    public string OriginalName { get; private set; } = "";
    public string ContentType { get; private set; } = "";
    public long Size { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
}
