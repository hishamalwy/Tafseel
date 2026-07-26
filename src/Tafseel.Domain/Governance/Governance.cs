using Tafseel.Domain.Common;

namespace Tafseel.Domain.Governance;

public sealed class TeacherReview
{
    private readonly List<ReviewModerationRecord> _moderation = [];
    private TeacherReview() { }
    public TeacherReview(Guid orderId, string studentId, string teacherId,
        int clarity, int knowledge, int communication, int onTime, int value,
        string comment, bool recommends, DateTimeOffset now)
    {
        var scores = new[] { clarity, knowledge, communication, onTime, value };
        if (scores.Any(x => x is < 1 or > 5) || string.IsNullOrWhiteSpace(comment) || comment.Trim().Length > 2000)
            throw new DomainException("invalid_review", "Review scores and comment are invalid.");
        if (studentId == teacherId) throw new DomainException("self_review_forbidden", "Teachers cannot review themselves.");
        Id = Guid.NewGuid(); OrderId = orderId; StudentId = studentId; TeacherId = teacherId;
        ExplanationClarity = clarity; SubjectKnowledge = knowledge; Communication = communication;
        OnTimeDelivery = onTime; ValueForMoney = value;
        OverallScore = decimal.Round(scores.Sum() / 5m, 2, MidpointRounding.AwayFromZero);
        OriginalComment = comment.Trim(); Recommends = recommends; IsVisible = true; CreatedAt = now;
    }
    public Guid Id { get; private set; }
    public Guid OrderId { get; private set; }
    public string StudentId { get; private set; } = "";
    public string TeacherId { get; private set; } = "";
    public int ExplanationClarity { get; private set; }
    public int SubjectKnowledge { get; private set; }
    public int Communication { get; private set; }
    public int OnTimeDelivery { get; private set; }
    public int ValueForMoney { get; private set; }
    public decimal OverallScore { get; private set; }
    public string OriginalComment { get; private set; } = "";
    public bool Recommends { get; private set; }
    public bool IsVisible { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public IReadOnlyCollection<ReviewModerationRecord> Moderation => _moderation;
    public void Moderate(string adminId, bool visible, string reason, DateTimeOffset now)
    {
        reason = reason?.Trim() ?? "";
        if (reason.Length is 0 or > 1000)
            throw new DomainException("moderation_reason_required", "A moderation reason is required.");
        if (IsVisible == visible) return;
        IsVisible = visible;
        _moderation.Add(new(Id, adminId, visible, reason, now));
    }
}

public sealed class ReviewModerationRecord
{
    private ReviewModerationRecord() { }
    internal ReviewModerationRecord(Guid reviewId, string actorId, bool visible, string reason, DateTimeOffset now)
    { Id = Guid.NewGuid(); TeacherReviewId = reviewId; ActorId = actorId; Visible = visible; Reason = reason; CreatedAt = now; }
    public Guid Id { get; private set; }
    public Guid TeacherReviewId { get; private set; }
    public string ActorId { get; private set; } = "";
    public bool Visible { get; private set; }
    public string Reason { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}

public enum DisputeStatus { Open, UnderReview, Resolved }
public enum DisputeResolution { RefundStudent, ReleaseTeacher, NoFinancialAction }

public sealed class Dispute
{
    private readonly List<DisputeMessage> _messages = [];
    private readonly List<DisputeEvidence> _evidence = [];
    private readonly List<DisputeStatusHistory> _history = [];
    private readonly List<DisputeDecision> _decisions = [];
    private Dispute() { }
    public Dispute(Guid orderId, string studentId, string teacherId, string openedById,
        string reason, DateTimeOffset now)
    {
        if (openedById != studentId && openedById != teacherId)
            throw new DomainException("dispute_not_owned", "Order was not found.");
        reason = Required(reason, 2000);
        Id = Guid.NewGuid(); OrderId = orderId; StudentId = studentId; TeacherId = teacherId;
        OpenedById = openedById; Reason = reason; Status = DisputeStatus.Open; CreatedAt = UpdatedAt = now;
        _history.Add(new(Id, null, Status, openedById, now));
    }
    public Guid Id { get; private set; }
    public Guid OrderId { get; private set; }
    public string StudentId { get; private set; } = "";
    public string TeacherId { get; private set; } = "";
    public string OpenedById { get; private set; } = "";
    public string Reason { get; private set; } = "";
    public DisputeStatus Status { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];
    public IReadOnlyCollection<DisputeMessage> Messages => _messages;
    public IReadOnlyCollection<DisputeEvidence> Evidence => _evidence;
    public IReadOnlyCollection<DisputeStatusHistory> History => _history;
    public IReadOnlyCollection<DisputeDecision> Decisions => _decisions;
    public void StartReview(string adminId, DateTimeOffset now)
    {
        if (Status != DisputeStatus.Open) throw InvalidTransition();
        Transition(DisputeStatus.UnderReview, adminId, now);
    }
    public void AddMessage(string actorId, string body, DateTimeOffset now)
    {
        RequireParticipant(actorId); _messages.Add(new(Id, actorId, Required(body, 2000), now)); UpdatedAt = now;
    }
    public void AddEvidence(string actorId, string storageKey, string originalName,
        string contentType, long size, DateTimeOffset now)
    {
        RequireParticipant(actorId);
        if (Status == DisputeStatus.Resolved) throw InvalidTransition();
        _evidence.Add(new(Id, actorId, storageKey, originalName, contentType, size, now)); UpdatedAt = now;
    }
    public bool Resolve(string adminId, DisputeResolution resolution,
        string rationale, string idempotencyKey, DateTimeOffset now)
    {
        if (Status == DisputeStatus.Resolved)
        {
            if (_decisions.Single().IdempotencyKey == idempotencyKey) return false;
            throw new DomainException("dispute_resolution_conflict", "Dispute was already resolved.");
        }
        if (Status is not (DisputeStatus.Open or DisputeStatus.UnderReview)) throw InvalidTransition();
        _decisions.Add(new(Id, adminId, resolution, Required(rationale, 2000),
            Required(idempotencyKey, 100), now));
        Transition(DisputeStatus.Resolved, adminId, now); return true;
    }
    public void RequireParticipant(string actorId)
    {
        if (actorId != StudentId && actorId != TeacherId)
            throw new DomainException("dispute_not_owned", "Dispute was not found.");
    }
    private void Transition(DisputeStatus next, string actorId, DateTimeOffset now)
    {
        var previous = Status; Status = next; UpdatedAt = now;
        _history.Add(new(Id, previous, next, actorId, now));
    }
    private static string Required(string? value, int max)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 || value.Length > max)
            throw new DomainException("invalid_dispute", "A required dispute value is invalid.");
        return value;
    }
    private static DomainException InvalidTransition() =>
        new("invalid_dispute_transition", "The dispute transition is not allowed.");
}

public sealed class DisputeMessage
{
    private DisputeMessage() { }
    internal DisputeMessage(Guid disputeId, string senderId, string body, DateTimeOffset now)
    { Id = Guid.NewGuid(); DisputeId = disputeId; SenderId = senderId; Body = body; CreatedAt = now; }
    public Guid Id { get; private set; }
    public Guid DisputeId { get; private set; }
    public string SenderId { get; private set; } = "";
    public string Body { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}
public sealed class DisputeEvidence
{
    private DisputeEvidence() { }
    internal DisputeEvidence(Guid disputeId, string uploadedById, string storageKey,
        string originalName, string contentType, long size, DateTimeOffset now)
    {
        Id = Guid.NewGuid(); DisputeId = disputeId; UploadedById = uploadedById; StorageKey = storageKey;
        OriginalName = originalName; ContentType = contentType; Size = size; CreatedAt = now;
    }
    public Guid Id { get; private set; }
    public Guid DisputeId { get; private set; }
    public string UploadedById { get; private set; } = "";
    public string StorageKey { get; private set; } = "";
    public string OriginalName { get; private set; } = "";
    public string ContentType { get; private set; } = "";
    public long Size { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
}
public sealed class DisputeDecision
{
    private DisputeDecision() { }
    internal DisputeDecision(Guid disputeId, string actorId, DisputeResolution resolution,
        string rationale, string idempotencyKey, DateTimeOffset now)
    {
        Id = Guid.NewGuid(); DisputeId = disputeId; ActorId = actorId; Resolution = resolution;
        Rationale = rationale; IdempotencyKey = idempotencyKey; CreatedAt = now;
    }
    public Guid Id { get; private set; }
    public Guid DisputeId { get; private set; }
    public string ActorId { get; private set; } = "";
    public DisputeResolution Resolution { get; private set; }
    public string Rationale { get; private set; } = "";
    public string IdempotencyKey { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}
public sealed class DisputeStatusHistory
{
    private DisputeStatusHistory() { }
    internal DisputeStatusHistory(Guid disputeId, DisputeStatus? previous,
        DisputeStatus next, string actorId, DateTimeOffset now)
    { Id = Guid.NewGuid(); DisputeId = disputeId; PreviousStatus = previous; NextStatus = next; ActorId = actorId; CreatedAt = now; }
    public Guid Id { get; private set; }
    public Guid DisputeId { get; private set; }
    public DisputeStatus? PreviousStatus { get; private set; }
    public DisputeStatus NextStatus { get; private set; }
    public string ActorId { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class AuditLogEntry
{
    private AuditLogEntry() { }
    public AuditLogEntry(string actorId, string action, string entityType, string entityId,
        string summary, string correlationId, DateTimeOffset now)
    {
        Id = Guid.NewGuid(); ActorId = Required(actorId, 450); Action = Required(action, 100);
        EntityType = Required(entityType, 100); EntityId = Required(entityId, 200);
        Summary = Required(summary, 2000); CorrelationId = Required(correlationId, 200); CreatedAt = now;
    }
    public Guid Id { get; private set; }
    public string ActorId { get; private set; } = "";
    public string Action { get; private set; } = "";
    public string EntityType { get; private set; } = "";
    public string EntityId { get; private set; } = "";
    public string Summary { get; private set; } = "";
    public string CorrelationId { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
    private static string Required(string? value, int max)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 || value.Length > max) throw new DomainException("invalid_audit", "Audit value is invalid.");
        return value;
    }
}
