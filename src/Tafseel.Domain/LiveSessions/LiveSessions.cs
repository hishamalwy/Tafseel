using Tafseel.Domain.Common;

namespace Tafseel.Domain.LiveSessions;

public enum LiveSessionStatus
{
    AwaitingPayment,
    Confirmed,
    Completed,
    Cancelled,
    StudentNoShow,
    TeacherNoShow
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
        string joinKey, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(studentId) || string.IsNullOrWhiteSpace(teacherId)
            || studentId == teacherId || endsAt <= startsAt || startsAt <= now)
            throw new DomainException("invalid_session_time", "Live session timing is invalid.");
        if (!IsSupportedDuration(endsAt - startsAt))
            throw new DomainException("invalid_session_duration", "Session duration must be 30, 60, 90, or 120 minutes.");
        if (basePrice <= 0 || emergencyPremiumPercent is < 0 or > 1000 || cancellationWindowHours is < 0 or > 720)
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
    public int CancellationWindowHours { get; private set; }
    public string JoinKey { get; private set; } = "";
    public LiveSessionStatus Status { get; private set; }
    public int RescheduleCount { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];
    public IReadOnlyCollection<LiveSessionStatusHistory> History => _history;
    public IReadOnlyCollection<LiveSessionAttachment> Attachments => _attachments;

    public void ConfirmPayment(string actorId, DateTimeOffset now)
    {
        if (Status != LiveSessionStatus.AwaitingPayment) throw InvalidTransition();
        Transition(LiveSessionStatus.Confirmed, "PaymentConfirmed", actorId, now);
    }

    public void Reschedule(string actorId, DateTimeOffset startsAt, DateTimeOffset endsAt, DateTimeOffset now)
    {
        RequireParticipant(actorId);
        if (Status is not (LiveSessionStatus.AwaitingPayment or LiveSessionStatus.Confirmed)
            || startsAt <= now || endsAt <= startsAt || !IsSupportedDuration(endsAt - startsAt))
            throw InvalidTransition();
        StartsAt = startsAt;
        EndsAt = endsAt;
        RescheduleCount++;
        UpdatedAt = now;
        _history.Add(new(Id, Status, Status, "Rescheduled", actorId, now));
    }

    public void Cancel(string actorId, DateTimeOffset now)
    {
        RequireParticipant(actorId);
        if (Status is not (LiveSessionStatus.AwaitingPayment or LiveSessionStatus.Confirmed))
            throw InvalidTransition();
        Transition(LiveSessionStatus.Cancelled, "Cancelled", actorId, now);
    }

    public void Complete(string teacherId, DateTimeOffset now)
    {
        RequireTeacher(teacherId);
        if (Status != LiveSessionStatus.Confirmed || now < EndsAt) throw InvalidTransition();
        Transition(LiveSessionStatus.Completed, "Completed", teacherId, now);
    }

    public void MarkStudentNoShow(string teacherId, DateTimeOffset now)
    {
        RequireTeacher(teacherId);
        if (Status != LiveSessionStatus.Confirmed || now < EndsAt) throw InvalidTransition();
        Transition(LiveSessionStatus.StudentNoShow, "StudentNoShow", teacherId, now);
    }

    public void MarkTeacherNoShow(string studentId, DateTimeOffset now)
    {
        RequireStudent(studentId);
        if (Status != LiveSessionStatus.Confirmed || now < EndsAt) throw InvalidTransition();
        Transition(LiveSessionStatus.TeacherNoShow, "TeacherNoShow", studentId, now);
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
