using Tafseel.Domain.Catalog;
using Tafseel.Domain.Common;

namespace Tafseel.Domain.Orders;

public enum LearningRequestStatus
{
    PendingTeacherReview,
    ClarificationRequested,
    Accepted,
    Declined,
    Cancelled
}

public enum OrderStatus
{
    AwaitingPayment,
    InProgress,
    Delivered,
    RevisionRequested,
    Completed,
    Cancelled
}

public enum OrderPaymentStatus { Pending, Paid, Failed, Refunded }
public enum OrderDeliveryState { None, Delivered, RevisionRequested, Accepted }

public sealed class LearningRequest
{
    private readonly List<LearningRequestAttachment> _attachments = [];
    private readonly List<RequestClarification> _clarifications = [];
    private readonly List<LearningRequestStatusHistory> _history = [];
    private LearningRequest() { }

    public LearningRequest(
        string studentId, string teacherId, Guid teacherServiceId, string title, string description,
        DateTimeOffset preferredDeliveryAt, decimal? budget, DateTimeOffset now)
    {
        if (studentId == teacherId)
            throw new DomainException("self_request_forbidden", "A student cannot request themselves.");
        Id = Guid.NewGuid();
        StudentId = studentId;
        TeacherId = teacherId;
        TeacherServiceId = teacherServiceId;
        Title = Required(title, 200, "request title");
        Description = Required(description, 5000, "request description");
        if (preferredDeliveryAt <= now)
            throw new DomainException("invalid_request_deadline", "The preferred delivery time must be in the future.");
        if (budget is <= 0 or > 1_000_000)
            throw new DomainException("invalid_request_budget", "Request budget is invalid.");
        PreferredDeliveryAt = preferredDeliveryAt;
        Budget = budget;
        Status = LearningRequestStatus.PendingTeacherReview;
        CreatedAt = UpdatedAt = now;
        _history.Add(new(Id, null, Status, studentId, null, now));
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
    public string Description { get; private set; } = "";
    public DateTimeOffset PreferredDeliveryAt { get; private set; }
    public decimal? Budget { get; private set; }
    public LearningRequestStatus Status { get; private set; }
    public string? AcceptanceIdempotencyKey { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];
    public IReadOnlyCollection<LearningRequestAttachment> Attachments => _attachments;
    public IReadOnlyCollection<RequestClarification> Clarifications => _clarifications;
    public IReadOnlyCollection<LearningRequestStatusHistory> History => _history;

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

    public void AddAttachment(string studentId, string storageKey, string originalName, string contentType, long size, DateTimeOffset now)
    {
        RequireStudent(studentId);
        if (Status is not (LearningRequestStatus.PendingTeacherReview or LearningRequestStatus.ClarificationRequested))
            throw InvalidTransition();
        _attachments.Add(new(Id, storageKey, originalName, contentType, size, now));
        UpdatedAt = now;
    }

    public void RequestClarification(string teacherId, string message, DateTimeOffset now)
    {
        RequireTeacher(teacherId);
        if (Status != LearningRequestStatus.PendingTeacherReview) throw InvalidTransition();
        _clarifications.Add(new(Id, teacherId, Required(message, 2000, "clarification"), now));
        Transition(LearningRequestStatus.ClarificationRequested, teacherId, message, now);
    }

    public void ReplyToClarification(string studentId, string message, DateTimeOffset now)
    {
        RequireStudent(studentId);
        if (Status != LearningRequestStatus.ClarificationRequested) throw InvalidTransition();
        _clarifications.Add(new(Id, studentId, Required(message, 2000, "clarification"), now));
        Transition(LearningRequestStatus.PendingTeacherReview, studentId, null, now);
    }

    public void Decline(string teacherId, string reason, DateTimeOffset now)
    {
        RequireTeacher(teacherId);
        if (Status is not (LearningRequestStatus.PendingTeacherReview or LearningRequestStatus.ClarificationRequested))
            throw InvalidTransition();
        Transition(LearningRequestStatus.Declined, teacherId, Required(reason, 1000, "decline reason"), now);
    }

    public bool Accept(string teacherId, string idempotencyKey, DateTimeOffset now)
    {
        RequireTeacher(teacherId);
        idempotencyKey = Required(idempotencyKey, 100, "idempotency key");
        if (Status == LearningRequestStatus.Accepted
            && string.Equals(AcceptanceIdempotencyKey, idempotencyKey, StringComparison.Ordinal))
            return false;
        if (Status != LearningRequestStatus.PendingTeacherReview) throw InvalidTransition();
        AcceptanceIdempotencyKey = idempotencyKey;
        Transition(LearningRequestStatus.Accepted, teacherId, null, now);
        return true;
    }

    public void Cancel(string studentId, DateTimeOffset now)
    {
        RequireStudent(studentId);
        if (Status is not (LearningRequestStatus.PendingTeacherReview or LearningRequestStatus.ClarificationRequested))
            throw InvalidTransition();
        Transition(LearningRequestStatus.Cancelled, studentId, null, now);
    }

    private void RequireStudent(string actor)
    {
        if (actor != StudentId) throw new DomainException("request_not_owned", "Learning request was not found.");
    }
    private void RequireTeacher(string actor)
    {
        if (actor != TeacherId) throw new DomainException("request_not_owned", "Learning request was not found.");
    }
    private void Transition(LearningRequestStatus next, string actor, string? note, DateTimeOffset now)
    {
        var previous = Status;
        Status = next;
        UpdatedAt = now;
        _history.Add(new(Id, previous, next, actor, note, now));
    }
    private static DomainException InvalidTransition() =>
        new("invalid_request_transition", "The learning request transition is not allowed.");
    private static string Required(string value, int max, string name)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 || value.Length > max)
            throw new DomainException("invalid_request", $"{name} is required.");
        return value;
    }
}

public sealed class LearningRequestAttachment
{
    private LearningRequestAttachment() { }
    internal LearningRequestAttachment(Guid requestId, string storageKey, string originalName, string contentType, long size, DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid();
        LearningRequestId = requestId;
        StorageKey = storageKey;
        OriginalName = originalName;
        ContentType = contentType;
        Size = size;
        CreatedAt = createdAt;
    }
    public Guid Id { get; private set; }
    public Guid LearningRequestId { get; private set; }
    public string StorageKey { get; private set; } = "";
    public string OriginalName { get; private set; } = "";
    public string ContentType { get; private set; } = "";
    public long Size { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class RequestClarification
{
    private RequestClarification() { }
    internal RequestClarification(Guid requestId, string senderId, string message, DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid();
        LearningRequestId = requestId;
        SenderId = senderId;
        Message = message;
        CreatedAt = createdAt;
    }
    public Guid Id { get; private set; }
    public Guid LearningRequestId { get; private set; }
    public string SenderId { get; private set; } = "";
    public string Message { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class LearningRequestStatusHistory
{
    private LearningRequestStatusHistory() { }
    internal LearningRequestStatusHistory(Guid requestId, LearningRequestStatus? previous, LearningRequestStatus next, string actorId, string? note, DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid();
        LearningRequestId = requestId;
        PreviousStatus = previous;
        NextStatus = next;
        ActorId = actorId;
        Note = note;
        CreatedAt = createdAt;
    }
    public Guid Id { get; private set; }
    public Guid LearningRequestId { get; private set; }
    public LearningRequestStatus? PreviousStatus { get; private set; }
    public LearningRequestStatus NextStatus { get; private set; }
    public string ActorId { get; private set; } = "";
    public string? Note { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class Order
{
    private readonly List<OrderStatusHistory> _history = [];
    private readonly List<OrderDelivery> _deliveries = [];
    private readonly List<RevisionRequest> _revisions = [];
    private Order() { }

    public Order(
        Guid requestId, string studentId, string teacherId, Guid teacherServiceId,
        decimal price, string currency, decimal studentFeePercent, decimal teacherCommissionPercent,
        DateTimeOffset agreedDeliveryAt, int revisionAllowance, DateTimeOffset now)
    {
        if (price is <= 0 or > 1_000_000 || studentFeePercent is < 0 or > 100
            || teacherCommissionPercent is < 0 or > 100 || revisionAllowance is < 0 or > 20)
            throw new DomainException("invalid_order_financials", "Order financial terms are invalid.");
        if (currency.Trim().Length != 3 || agreedDeliveryAt <= now)
            throw new DomainException("invalid_order_terms", "Order currency or delivery time is invalid.");
        price = Money(price);
        Id = Guid.NewGuid();
        LearningRequestId = requestId;
        StudentId = studentId;
        TeacherId = teacherId;
        TeacherServiceId = teacherServiceId;
        Price = price;
        Currency = currency.Trim().ToUpperInvariant();
        StudentFeePercent = studentFeePercent;
        TeacherCommissionPercent = teacherCommissionPercent;
        StudentFeeAmount = Money(price * studentFeePercent / 100);
        TeacherCommissionAmount = Money(price * teacherCommissionPercent / 100);
        StudentTotal = price + StudentFeeAmount;
        TeacherNet = price - TeacherCommissionAmount;
        AgreedDeliveryAt = agreedDeliveryAt;
        RevisionAllowance = revisionAllowance;
        Status = OrderStatus.AwaitingPayment;
        PaymentStatus = OrderPaymentStatus.Pending;
        DeliveryState = OrderDeliveryState.None;
        CreatedAt = UpdatedAt = now;
        _history.Add(new(Id, null, Status, teacherId, now));
    }

    public Guid Id { get; private set; }
    public Guid LearningRequestId { get; private set; }
    public string StudentId { get; private set; } = "";
    public string TeacherId { get; private set; } = "";
    public Guid TeacherServiceId { get; private set; }
    public Guid? ServiceCatalogItemId { get; private set; }
    public string CatalogCode { get; private set; } = "";
    public string CategoryCode { get; private set; } = "";
    public string OrderType { get; private set; } = "";
    public string ServiceNameEnglish { get; private set; } = "";
    public string ServiceNameArabic { get; private set; } = "";
    public decimal Price { get; private set; }
    public string Currency { get; private set; } = "";
    public decimal StudentFeePercent { get; private set; }
    public decimal TeacherCommissionPercent { get; private set; }
    public decimal StudentFeeAmount { get; private set; }
    public decimal TeacherCommissionAmount { get; private set; }
    public decimal StudentTotal { get; private set; }
    public decimal TeacherNet { get; private set; }
    public DateTimeOffset AgreedDeliveryAt { get; private set; }
    public int RevisionAllowance { get; private set; }
    public int RevisionsUsed { get; private set; }
    public OrderStatus Status { get; private set; }
    public OrderPaymentStatus PaymentStatus { get; private set; }
    public OrderDeliveryState DeliveryState { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];
    public IReadOnlyCollection<OrderStatusHistory> History => _history;
    public IReadOnlyCollection<OrderDelivery> Deliveries => _deliveries;
    public IReadOnlyCollection<RevisionRequest> Revisions => _revisions;

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

    public void ConfirmPayment(DateTimeOffset now)
    {
        if (Status != OrderStatus.AwaitingPayment || PaymentStatus != OrderPaymentStatus.Pending)
            throw InvalidTransition();
        PaymentStatus = OrderPaymentStatus.Paid;
        UpdatedAt = now;
    }

    public void Start(string teacherId, DateTimeOffset now)
    {
        RequireTeacher(teacherId);
        if (Status != OrderStatus.AwaitingPayment || PaymentStatus != OrderPaymentStatus.Paid)
            throw new DomainException("payment_required", "Payment confirmation is required before work starts.");
        Transition(OrderStatus.InProgress, teacherId, now);
    }

    public void Deliver(string teacherId, string storageKey, string originalName, string contentType, long size, string message, DateTimeOffset now)
    {
        RequireTeacher(teacherId);
        if (Status is not (OrderStatus.InProgress or OrderStatus.RevisionRequested)) throw InvalidTransition();
        _deliveries.Add(new(Id, storageKey, originalName, contentType, size, message?.Trim() ?? "", now));
        DeliveryState = OrderDeliveryState.Delivered;
        Transition(OrderStatus.Delivered, teacherId, now);
    }

    public void RequestRevision(string studentId, string reason, DateTimeOffset now)
    {
        RequireStudent(studentId);
        if (Status != OrderStatus.Delivered) throw InvalidTransition();
        if (RevisionsUsed >= RevisionAllowance)
            throw new DomainException("revision_limit_reached", "The included revision allowance is exhausted.");
        RevisionsUsed++;
        _revisions.Add(new(Id, Required(reason, 2000, "revision reason"), RevisionsUsed, now));
        DeliveryState = OrderDeliveryState.RevisionRequested;
        Transition(OrderStatus.RevisionRequested, studentId, now);
    }

    public void Complete(string studentId, DateTimeOffset now)
    {
        RequireStudent(studentId);
        if (Status != OrderStatus.Delivered) throw InvalidTransition();
        DeliveryState = OrderDeliveryState.Accepted;
        Transition(OrderStatus.Completed, studentId, now);
    }

    public void Refund(string actorId, DateTimeOffset now)
    {
        if (PaymentStatus == OrderPaymentStatus.Refunded) return;
        if (PaymentStatus != OrderPaymentStatus.Paid || Status is OrderStatus.Completed or OrderStatus.Cancelled)
            throw InvalidTransition();
        PaymentStatus = OrderPaymentStatus.Refunded;
        DeliveryState = OrderDeliveryState.None;
        Transition(OrderStatus.Cancelled, actorId, now);
    }

    public void CompleteByDispute(string actorId, DateTimeOffset now)
    {
        if (PaymentStatus != OrderPaymentStatus.Paid
            || Status is not (OrderStatus.InProgress or OrderStatus.Delivered or OrderStatus.RevisionRequested))
            throw InvalidTransition();
        DeliveryState = OrderDeliveryState.Accepted;
        Transition(OrderStatus.Completed, actorId, now);
    }

    public void CancelBeforePayment(string actorId, DateTimeOffset now)
    {
        if (actorId != StudentId && actorId != TeacherId)
            throw new DomainException("order_not_owned", "Order was not found.");
        if (Status != OrderStatus.AwaitingPayment || PaymentStatus != OrderPaymentStatus.Pending)
            throw InvalidTransition();
        Transition(OrderStatus.Cancelled, actorId, now);
    }

    private void RequireStudent(string actor)
    {
        if (actor != StudentId) throw new DomainException("order_not_owned", "Order was not found.");
    }
    private void RequireTeacher(string actor)
    {
        if (actor != TeacherId) throw new DomainException("order_not_owned", "Order was not found.");
    }
    private void Transition(OrderStatus next, string actor, DateTimeOffset now)
    {
        var previous = Status;
        Status = next;
        UpdatedAt = now;
        _history.Add(new(Id, previous, next, actor, now));
    }
    private static decimal Money(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    private static DomainException InvalidTransition() =>
        new("invalid_order_transition", "The order transition is not allowed.");
    private static string Required(string value, int max, string name)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 || value.Length > max)
            throw new DomainException("invalid_order", $"{name} is required.");
        return value;
    }
}

public sealed class OrderStatusHistory
{
    private OrderStatusHistory() { }
    internal OrderStatusHistory(Guid orderId, OrderStatus? previous, OrderStatus next, string actorId, DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid();
        OrderId = orderId;
        PreviousStatus = previous;
        NextStatus = next;
        ActorId = actorId;
        CreatedAt = createdAt;
    }
    public Guid Id { get; private set; }
    public Guid OrderId { get; private set; }
    public OrderStatus? PreviousStatus { get; private set; }
    public OrderStatus NextStatus { get; private set; }
    public string ActorId { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class OrderDelivery
{
    private OrderDelivery() { }
    internal OrderDelivery(Guid orderId, string storageKey, string originalName, string contentType, long size, string message, DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid();
        OrderId = orderId;
        StorageKey = storageKey;
        OriginalName = originalName;
        ContentType = contentType;
        Size = size;
        Message = message;
        CreatedAt = createdAt;
    }
    public Guid Id { get; private set; }
    public Guid OrderId { get; private set; }
    public string StorageKey { get; private set; } = "";
    public string OriginalName { get; private set; } = "";
    public string ContentType { get; private set; } = "";
    public long Size { get; private set; }
    public string Message { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class RevisionRequest
{
    private RevisionRequest() { }
    internal RevisionRequest(Guid orderId, string reason, int sequence, DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid();
        OrderId = orderId;
        Reason = reason;
        Sequence = sequence;
        CreatedAt = createdAt;
    }
    public Guid Id { get; private set; }
    public Guid OrderId { get; private set; }
    public string Reason { get; private set; } = "";
    public int Sequence { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
}
