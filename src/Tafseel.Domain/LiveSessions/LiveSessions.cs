using Tafseel.Domain.Catalog;
using Tafseel.Domain.Common;

namespace Tafseel.Domain.LiveSessions;

public enum LiveSessionStatus
{
    AwaitingPayment,
    Confirmed,
    Completed,
    Cancelled,
    StudentNoShow,
    TeacherNoShow,
    CompletionPending,
    StudentNoShowPending,
    TeacherNoShowPending
}

public sealed class LiveSessionBooking
{
    private readonly List<LiveSessionStatusHistory> _history = [];
    private readonly List<LiveSessionAttachment> _attachments = [];
    private LiveSessionBooking() { }

    public LiveSessionBooking(
        string studentId, string teacherId, Guid teacherServiceId, string title, string notes,
        DateTimeOffset startsAt, DateTimeOffset endsAt, string studentTimeZoneId, string teacherTimeZoneId,
        decimal basePrice, string currency, decimal emergencyPremiumPercent, int cancellationWindowHours,
        string joinKey, DateTimeOffset now, decimal teacherCommissionPercent = 0)
    {
        if (string.IsNullOrWhiteSpace(studentId) || string.IsNullOrWhiteSpace(teacherId)
            || studentId == teacherId || endsAt <= startsAt || startsAt <= now)
            throw new DomainException("invalid_session_time", "Live session timing is invalid.");
        if (!IsSupportedDuration(endsAt - startsAt))
            throw new DomainException("invalid_session_duration", "Session duration must be 30, 60, 90, or 120 minutes.");
        if (basePrice <= 0 || emergencyPremiumPercent is < 0 or > 1000
            || teacherCommissionPercent is < 0 or > 100 || cancellationWindowHours is < 0 or > 720)
            throw new DomainException("invalid_session_financials", "Live session financial terms are invalid.");
        Id = Guid.NewGuid();
        StudentId = studentId;
        TeacherId = teacherId;
        TeacherServiceId = teacherServiceId;
        Title = Required(title, 200);
        Notes = Optional(notes, 2000);
        StartsAt = startsAt;
        EndsAt = endsAt;
        StudentTimeZoneId = Required(studentTimeZoneId, 100);
        TeacherTimeZoneId = Required(teacherTimeZoneId, 100);
        BasePrice = Money(basePrice);
        Currency = Required(currency, 3).ToUpperInvariant();
        if (Currency.Length != 3)
            throw new DomainException("invalid_session_financials", "Live session financial terms are invalid.");
        EmergencyPremiumPercent = emergencyPremiumPercent;
        EmergencyPremiumAmount = Money(BasePrice * emergencyPremiumPercent / 100);
        TotalPrice = BasePrice + EmergencyPremiumAmount;
        TeacherCommissionPercent = teacherCommissionPercent;
        TeacherCommissionAmount = Money(TotalPrice * teacherCommissionPercent / 100);
        TeacherNet = TotalPrice - TeacherCommissionAmount;
        CancellationWindowHours = cancellationWindowHours;
        JoinKey = Required(joinKey, 100);
        Status = LiveSessionStatus.AwaitingPayment;
        CreatedAt = UpdatedAt = now;
        _history.Add(new(Id, null, Status, "Booked", studentId, now));
    }

    public Guid Id { get; private set; }
    public string StudentId { get; private set; } = "";
    public string TeacherId { get; private set; } = "";
    public Guid TeacherServiceId { get; private set; }
    public Guid? ServiceCatalogItemId { get; private set; }
    public string CatalogCode { get; private set; } = "";
    public string CategoryCode { get; private set; } = "";
    public string OrderType { get; private set; } = "";
    public string ServiceNameEnglish { get; private set; } = "";
    public string ServiceNameArabic { get; private set; } = "";
    public string Title { get; private set; } = "";
    public string Notes { get; private set; } = "";
    public DateTimeOffset StartsAt { get; private set; }
    public DateTimeOffset EndsAt { get; private set; }
    public string StudentTimeZoneId { get; private set; } = "";
    public string TeacherTimeZoneId { get; private set; } = "";
    public decimal BasePrice { get; private set; }
    public string Currency { get; private set; } = "";
    public decimal EmergencyPremiumPercent { get; private set; }
    public decimal EmergencyPremiumAmount { get; private set; }
    public decimal TotalPrice { get; private set; }
    public decimal TeacherCommissionPercent { get; private set; }
    public decimal TeacherCommissionAmount { get; private set; }
    public decimal TeacherNet { get; private set; }
    public int CancellationWindowHours { get; private set; }
    public string JoinKey { get; private set; } = "";
    public LiveSessionStatus Status { get; private set; }
    public int RescheduleCount { get; private set; }
    public DateTimeOffset? ProposedStartsAt { get; private set; }
    public DateTimeOffset? ProposedEndsAt { get; private set; }
    public string? RescheduleRequestedById { get; private set; }
    public DateTimeOffset? RescheduleRequestedAt { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];
    public IReadOnlyCollection<LiveSessionStatusHistory> History => _history;
    public IReadOnlyCollection<LiveSessionAttachment> Attachments => _attachments;

    public void CaptureServiceIdentity(ServiceCatalogItem catalog)
    {
        if (ServiceCatalogItemId.HasValue)
            throw new DomainException("service_identity_immutable", "Service identity snapshot is immutable.");
        catalog.EnsurePolicyComplete();
        ServiceCatalogItemId = catalog.Id;
        CatalogCode = catalog.Code;
        CategoryCode = catalog.CategoryCode;
        OrderType = catalog.OrderType;
        ServiceNameEnglish = catalog.Name;
        ServiceNameArabic = catalog.NameAr;
    }

    public void ConfirmPayment(string actorId, DateTimeOffset now)
    {
        if (Status != LiveSessionStatus.AwaitingPayment) throw InvalidTransition();
        Transition(LiveSessionStatus.Confirmed, "PaymentConfirmed", actorId, now);
    }

    public void RequestReschedule(string actorId, DateTimeOffset startsAt, DateTimeOffset endsAt, DateTimeOffset now)
    {
        RequireParticipant(actorId);
        if (Status is not (LiveSessionStatus.AwaitingPayment or LiveSessionStatus.Confirmed)
            || RescheduleRequestedAt.HasValue || startsAt <= now || endsAt <= startsAt
            || !IsSupportedDuration(endsAt - startsAt))
            throw InvalidTransition();
        ProposedStartsAt = startsAt;
        ProposedEndsAt = endsAt;
        RescheduleRequestedById = actorId;
        RescheduleRequestedAt = now;
        UpdatedAt = now;
        _history.Add(new(Id, Status, Status, "RescheduleRequested", actorId, now));
    }

    public void RespondToReschedule(string actorId, bool accept, DateTimeOffset now)
    {
        RequireParticipant(actorId);
        if (!RescheduleRequestedAt.HasValue || actorId == RescheduleRequestedById
            || ProposedStartsAt is null || ProposedEndsAt is null)
            throw InvalidTransition();
        if (accept)
        {
            StartsAt = ProposedStartsAt.Value;
            EndsAt = ProposedEndsAt.Value;
            RescheduleCount++;
        }
        _history.Add(new(Id, Status, Status, accept ? "Rescheduled" : "RescheduleRejected", actorId, now));
        ProposedStartsAt = ProposedEndsAt = RescheduleRequestedAt = null;
        RescheduleRequestedById = null;
        UpdatedAt = now;
    }

    public void Cancel(string actorId, DateTimeOffset now)
    {
        RequireParticipant(actorId);
        if (Status is not (LiveSessionStatus.AwaitingPayment or LiveSessionStatus.Confirmed))
            throw InvalidTransition();
        Transition(LiveSessionStatus.Cancelled, "Cancelled", actorId, now);
    }

    public bool RequiresRefundOnCancellation(string actorId, DateTimeOffset now)
    {
        RequireParticipant(actorId);
        return actorId == TeacherId || now <= StartsAt.AddHours(-CancellationWindowHours);
    }

    public void RequestCompletion(string teacherId, DateTimeOffset now)
    {
        RequireTeacher(teacherId);
        if (Status != LiveSessionStatus.Confirmed || now < EndsAt) throw InvalidTransition();
        Transition(LiveSessionStatus.CompletionPending, "CompletionRequested", teacherId, now);
    }

    public void MarkStudentNoShow(string teacherId, DateTimeOffset now, int graceMinutes = 15)
    {
        RequireTeacher(teacherId);
        if (Status != LiveSessionStatus.Confirmed || now < EndsAt.AddMinutes(graceMinutes)) throw InvalidTransition();
        Transition(LiveSessionStatus.StudentNoShowPending, "StudentNoShowRequested", teacherId, now);
    }

    public void MarkTeacherNoShow(string studentId, DateTimeOffset now, int graceMinutes = 15)
    {
        RequireStudent(studentId);
        if (Status != LiveSessionStatus.Confirmed || now < EndsAt.AddMinutes(graceMinutes)) throw InvalidTransition();
        Transition(LiveSessionStatus.TeacherNoShowPending, "TeacherNoShowRequested", studentId, now);
    }

    public void ConfirmSettlement(string actorId, DateTimeOffset now)
    {
        RequireParticipant(actorId);
        var next = Status switch
        {
            LiveSessionStatus.CompletionPending when actorId == StudentId => LiveSessionStatus.Completed,
            LiveSessionStatus.StudentNoShowPending when actorId == StudentId => LiveSessionStatus.StudentNoShow,
            LiveSessionStatus.TeacherNoShowPending when actorId == TeacherId => LiveSessionStatus.TeacherNoShow,
            _ => throw InvalidTransition()
        };
        Transition(next, "SettlementConfirmed", actorId, now);
    }

    public void FinalizeSettlement(DateTimeOffset now)
    {
        var next = Status switch
        {
            LiveSessionStatus.CompletionPending => LiveSessionStatus.Completed,
            LiveSessionStatus.StudentNoShowPending => LiveSessionStatus.StudentNoShow,
            LiveSessionStatus.TeacherNoShowPending => LiveSessionStatus.TeacherNoShow,
            _ => throw InvalidTransition()
        };
        Transition(next, "SettlementAutoFinalized", "system:settlement", now);
    }

    public void ResolveCompletedByAdmin(string adminId, DateTimeOffset now) =>
        ResolvePassiveOutcome(LiveSessionStatus.Completed, "AdminConfirmedCompletion", adminId, now);

    public void ResolveStudentNoShowByAdmin(string adminId, DateTimeOffset now) =>
        ResolvePassiveOutcome(LiveSessionStatus.StudentNoShow, "AdminConfirmedStudentNoShow", adminId, now);

    public void ResolveTeacherNoShowByAdmin(string adminId, DateTimeOffset now) =>
        ResolvePassiveOutcome(LiveSessionStatus.TeacherNoShow, "AdminConfirmedTeacherNoShow", adminId, now);

    public void ResolveByDispute(bool refundStudent, string actorId, DateTimeOffset now)
    {
        if (refundStudent)
        {
            if (Status == LiveSessionStatus.Cancelled) return;
            Transition(LiveSessionStatus.Cancelled, "DisputeRefunded", actorId, now);
            return;
        }
        if (Status is LiveSessionStatus.Completed or LiveSessionStatus.StudentNoShow) return;
        if (Status is LiveSessionStatus.AwaitingPayment or LiveSessionStatus.Cancelled)
            throw InvalidTransition();
        Transition(LiveSessionStatus.Completed, "DisputeReleased", actorId, now);
    }

    private void ResolvePassiveOutcome(
        LiveSessionStatus outcome, string action, string adminId, DateTimeOffset now)
    {
        if (Status != LiveSessionStatus.Confirmed || now < EndsAt) throw InvalidTransition();
        Transition(outcome, action, adminId, now);
    }

    public void AddAttachment(string actorId, string storageKey, string originalName, string contentType, long size, DateTimeOffset now)
    {
        RequireParticipant(actorId);
        if (Status is not (LiveSessionStatus.AwaitingPayment or LiveSessionStatus.Confirmed))
            throw InvalidTransition();
        _attachments.Add(new(Id, actorId, storageKey, originalName, contentType, size, now));
        UpdatedAt = now;
    }

    public void RequireParticipant(string actorId)
    {
        if (actorId != StudentId && actorId != TeacherId)
            throw new DomainException("session_not_owned", "Live session was not found.");
    }
    private void RequireStudent(string actorId)
    {
        if (actorId != StudentId) throw new DomainException("session_not_owned", "Live session was not found.");
    }
    private void RequireTeacher(string actorId)
    {
        if (actorId != TeacherId) throw new DomainException("session_not_owned", "Live session was not found.");
    }
    private void Transition(LiveSessionStatus next, string action, string actor, DateTimeOffset now)
    {
        var previous = Status;
        Status = next;
        UpdatedAt = now;
        _history.Add(new(Id, previous, next, action, actor, now));
    }
    private static string Required(string value, int max)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 || value.Length > max)
            throw new DomainException("invalid_session", "A required live session value is invalid.");
        return value;
    }
    private static string Optional(string? value, int max)
    {
        value = value?.Trim() ?? "";
        if (value.Length > max)
            throw new DomainException("invalid_session", "A live session value is too long.");
        return value;
    }
    private static bool IsSupportedDuration(TimeSpan duration) =>
        duration == TimeSpan.FromMinutes(30)
        || duration == TimeSpan.FromMinutes(60)
        || duration == TimeSpan.FromMinutes(90)
        || duration == TimeSpan.FromMinutes(120);
    private static decimal Money(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    private static DomainException InvalidTransition() =>
        new("invalid_session_transition", "The live session transition is not allowed.");
}

public sealed class LiveSessionAttachment
{
    private LiveSessionAttachment() { }
    internal LiveSessionAttachment(Guid bookingId, string uploadedById, string storageKey, string originalName, string contentType, long size, DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid();
        LiveSessionBookingId = bookingId;
        UploadedById = uploadedById;
        StorageKey = storageKey;
        OriginalName = originalName;
        ContentType = contentType;
        Size = size;
        CreatedAt = createdAt;
    }
    public Guid Id { get; private set; }
    public Guid LiveSessionBookingId { get; private set; }
    public string UploadedById { get; private set; } = "";
    public string StorageKey { get; private set; } = "";
    public string OriginalName { get; private set; } = "";
    public string ContentType { get; private set; } = "";
    public long Size { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class LiveSessionStatusHistory
{
    private LiveSessionStatusHistory() { }
    internal LiveSessionStatusHistory(Guid bookingId, LiveSessionStatus? previous, LiveSessionStatus next, string action, string actorId, DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid();
        LiveSessionBookingId = bookingId;
        PreviousStatus = previous;
        NextStatus = next;
        Action = action;
        ActorId = actorId;
        CreatedAt = createdAt;
    }
    public Guid Id { get; private set; }
    public Guid LiveSessionBookingId { get; private set; }
    public LiveSessionStatus? PreviousStatus { get; private set; }
    public LiveSessionStatus NextStatus { get; private set; }
    public string Action { get; private set; } = "";
    public string ActorId { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}
