using Tafseel.Domain.Catalog;
using Tafseel.Domain.Common;
using Tafseel.Domain.Marketplace;

namespace Tafseel.Domain.Orders;

public enum LearningRequestStatus
{
    PendingTeacherReview,
    ClarificationRequested,
    Accepted,
    Declined,
    Cancelled,
    OpenForOffers,
    AwaitingPayment,
    ConvertedToOrder,
    Expired
}

public enum RequestSourcingMode { Direct, OpenMarketplace }

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

    public LearningRequest(
        string studentId, Guid subjectId, string title, string description,
        DateTimeOffset preferredDeliveryAt, decimal? budgetMin, decimal? budgetMax,
        DateTimeOffset now)
    {
        if (subjectId == Guid.Empty)
            throw new DomainException("subject_required", "A canonical Subject is required.");
        if (preferredDeliveryAt <= now)
            throw new DomainException("invalid_request_deadline", "The preferred delivery time must be in the future.");
        if (budgetMin is < 0 or > 1_000_000 || budgetMax is < 0 or > 1_000_000
            || budgetMin.HasValue != budgetMax.HasValue || budgetMax < budgetMin)
            throw new DomainException("invalid_request_budget", "Request budget range is invalid.");
        Id = Guid.NewGuid();
        StudentId = Required(studentId, 450, "student");
        SubjectId = subjectId;
        Title = Required(title, 200, "request title");
        Description = Required(description, 5000, "request description");
        PreferredDeliveryAt = preferredDeliveryAt;
        BudgetMin = budgetMin;
        BudgetMax = budgetMax;
        SourcingMode = RequestSourcingMode.OpenMarketplace;
        Status = LearningRequestStatus.OpenForOffers;
        PublishedAt = now;
        CreatedAt = UpdatedAt = now;
        _history.Add(new(Id, null, Status, studentId, null, now));
    }

    public Guid Id { get; private set; }
    public string StudentId { get; private set; } = "";
    public string? TeacherId { get; private set; }
    public Guid? TeacherServiceId { get; private set; }
    public Guid? SubjectId { get; private set; }
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
    public decimal? BudgetMin { get; private set; }
    public decimal? BudgetMax { get; private set; }

    /// <summary>
    /// The Teacher Offering price the student saw when they sent this Direct Request, and its currency
    /// (DEC-13, UX-09). One historical fact in two columns: both are set together or neither is. Null on
    /// Open Requests, whose price comes from the chosen Teacher Offer, and on Direct Requests created
    /// before this was captured — those are never backfilled, because nobody knows what was on the screen.
    /// The agreed price of the resulting Order is separate and is what the student actually pays.
    /// </summary>
    public decimal? ListedPriceAtRequest { get; private set; }
    public string? ListedCurrencyAtRequest { get; private set; }

    public RequestSourcingMode SourcingMode { get; private set; }
    public LearningRequestStatus Status { get; private set; }
    public Guid? SelectedOfferId { get; private set; }
    public DateTimeOffset? PublishedAt { get; private set; }
    public DateTimeOffset? PaymentReservationExpiresAt { get; private set; }
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

    /// <summary>
    /// Records, once, the offering price the student was looking at (DEC-13). Written by the server from the
    /// offering it has already validated — never from anything a client sent. There is no other way in and no
    /// way to change it afterwards, so an edit to the offering cannot rewrite what the student was shown.
    /// </summary>
    public void CaptureListedPrice(decimal price, string currency)
    {
        if (SourcingMode != RequestSourcingMode.Direct)
            throw new DomainException("listed_price_direct_only", "Only a direct request has a listed price.");
        if (ListedPriceAtRequest.HasValue)
            throw new DomainException("listed_price_immutable", "The listed price snapshot is immutable.");
        if (price is <= 0 or > 1_000_000)
            throw new DomainException("invalid_listed_price", "The listed price is out of range.");
        var code = (currency ?? "").Trim().ToUpperInvariant();
        if (code.Length != 3)
            throw new DomainException("invalid_listed_currency", "The listed currency is invalid.");
        ListedPriceAtRequest = price;
        ListedCurrencyAtRequest = code;
    }

    public void SelectOffer(string studentId, Guid offerId, DateTimeOffset now, int reservationMinutes = 120)
    {
        RequireStudent(studentId);
        if (SourcingMode != RequestSourcingMode.OpenMarketplace || Status != LearningRequestStatus.OpenForOffers)
            throw InvalidTransition();
        SelectedOfferId = offerId;
        if (reservationMinutes is < 15 or > 1440)
            throw new DomainException("invalid_reservation_window", "Offer reservation window is invalid.");
        PaymentReservationExpiresAt = now.AddMinutes(reservationMinutes);
        Transition(LearningRequestStatus.AwaitingPayment, studentId, null, now);
    }

    public void CancelOfferSelection(string studentId, DateTimeOffset now)
    {
        RequireStudent(studentId);
        if (Status != LearningRequestStatus.AwaitingPayment) throw InvalidTransition();
        SelectedOfferId = null;
        PaymentReservationExpiresAt = null;
        Transition(LearningRequestStatus.OpenForOffers, studentId, null, now);
    }

    public bool ExpireOfferSelection(DateTimeOffset now)
    {
        if (Status != LearningRequestStatus.AwaitingPayment
            || PaymentReservationExpiresAt is null || now < PaymentReservationExpiresAt) return false;
        SelectedOfferId = null;
        PaymentReservationExpiresAt = null;
        Transition(LearningRequestStatus.OpenForOffers, StudentId, "payment_reservation_expired", now);
        return true;
    }

    public bool Expire(DateTimeOffset now)
    {
        if (SourcingMode != RequestSourcingMode.OpenMarketplace
            || Status != LearningRequestStatus.OpenForOffers || PreferredDeliveryAt > now)
            return false;
        // History actors are FK-constrained to application users. Attribute the
        // automatic transition to the owning student and retain the system cause.
        Transition(LearningRequestStatus.Expired, StudentId, "system_request_expiry", now);
        return true;
    }

    public void ConvertOfferToOrder(string teacherId, Guid teacherServiceId, Guid offerId, DateTimeOffset now)
    {
        if (Status != LearningRequestStatus.AwaitingPayment || SelectedOfferId != offerId
            || PaymentReservationExpiresAt is null || now >= PaymentReservationExpiresAt)
            throw new DomainException("offer_reservation_expired", "The selected Offer reservation has expired.");
        TeacherId = Required(teacherId, 450, "teacher");
        TeacherServiceId = teacherServiceId;
        PaymentReservationExpiresAt = null;
        Transition(LearningRequestStatus.ConvertedToOrder, StudentId, null, now);
    }

    public void AddAttachment(string studentId, string storageKey, string originalName, string contentType, long size, DateTimeOffset now)
    {
        RequireStudent(studentId);
        if (Status is not (LearningRequestStatus.PendingTeacherReview
            or LearningRequestStatus.ClarificationRequested
            or LearningRequestStatus.OpenForOffers))
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
        if (Status is not (LearningRequestStatus.PendingTeacherReview
            or LearningRequestStatus.ClarificationRequested
            or LearningRequestStatus.OpenForOffers
            or LearningRequestStatus.AwaitingPayment))
            throw InvalidTransition();
        SelectedOfferId = null;
        PaymentReservationExpiresAt = null;
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
    private readonly List<OrderExtensionRequest> _extensions = [];
    private Order() { }

    public Order(
        Guid requestId, string studentId, string teacherId, Guid teacherServiceId,
        decimal price, string currency, decimal studentFeePercent, decimal teacherCommissionPercent,
        DateTimeOffset agreedDeliveryAt, int revisionAllowance, DateTimeOffset now,
        int? committedDeliveryHours = null)
    {
        if (price is <= 0 or > 1_000_000 || studentFeePercent is < 0 or > 100
            || teacherCommissionPercent is < 0 or > 100 || revisionAllowance is < 0 or > 20)
            throw new DomainException("invalid_order_financials", "Order financial terms are invalid.");
        if (currency.Trim().Length != 3 || agreedDeliveryAt <= now
            || committedDeliveryHours is <= 0 or > 8760)
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
        CommittedDeliveryHours = committedDeliveryHours;
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
    public int? CommittedDeliveryHours { get; private set; }
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
    public IReadOnlyCollection<OrderExtensionRequest> Extensions => _extensions;

    public bool IsOverdue(DateTimeOffset now) =>
        now > AgreedDeliveryAt && Status is OrderStatus.InProgress or OrderStatus.RevisionRequested;

    public void RequestExtension(string actorId, DateTimeOffset proposedDeliveryAt, string reason, DateTimeOffset now)
    {
        RequireParticipant(actorId);
        if (Status is not (OrderStatus.InProgress or OrderStatus.RevisionRequested)
            || proposedDeliveryAt <= AgreedDeliveryAt || proposedDeliveryAt <= now
            || _extensions.Any(x => x.Status == OrderExtensionStatus.Pending))
            throw new DomainException("extension_not_allowed", "An extension cannot be requested for this Order.");
        _extensions.Add(new(Id, actorId, proposedDeliveryAt, Required(reason, 2000, "extension reason"), now));
        UpdatedAt = now;
    }

    public void RespondToExtension(string actorId, Guid extensionId, bool accept, string? response, DateTimeOffset now)
    {
        RequireParticipant(actorId);
        var item = _extensions.SingleOrDefault(x => x.Id == extensionId)
            ?? throw new DomainException("extension_not_found", "Extension request was not found.");
        if (actorId == item.RequestedById)
            throw new DomainException("extension_self_response_forbidden", "The other party must respond.");
        item.Respond(actorId, accept, response, now);
        if (accept) AgreedDeliveryAt = item.ProposedDeliveryAt;
        UpdatedAt = now;
    }

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
        if (CommittedDeliveryHours is int hours)
            AgreedDeliveryAt = now.AddHours(hours);
        UpdatedAt = now;
    }

    public void Start(string teacherId, DateTimeOffset now)
    {
        RequireTeacher(teacherId);
        if (Status != OrderStatus.AwaitingPayment || PaymentStatus != OrderPaymentStatus.Paid)
            throw new DomainException("payment_required", "Payment confirmation is required before work starts.");
        Transition(OrderStatus.InProgress, teacherId, now);
    }

    public void Deliver(string teacherId, string storageKey, string originalName, string contentType, long size, string message, DateTimeOffset now) =>
        Deliver(teacherId, [new OrderDeliveryFile(storageKey, originalName, contentType, size)], message, now);

    public void Deliver(
        string teacherId, IReadOnlyList<OrderDeliveryFile> files, string message, DateTimeOffset now)
    {
        RequireTeacher(teacherId);
        if (Status is not (OrderStatus.InProgress or OrderStatus.RevisionRequested)) throw InvalidTransition();
        if (files is null || files.Count == 0)
            throw new DomainException("delivery_file_required", "At least one delivery file is required.");
        if (files.Count > TeacherMediaTypes.MaxFilesPerDelivery)
            throw new DomainException("delivery_file_limit", "Too many files in one delivery.");
        var note = message?.Trim() ?? "";
        foreach (var file in files)
            _deliveries.Add(new(Id, file.StorageKey, file.OriginalName, file.ContentType, file.Size, note, now));
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

    public void CompleteAutomatically(DateTimeOffset now)
    {
        if (Status != OrderStatus.Delivered) throw InvalidTransition();
        DeliveryState = OrderDeliveryState.Accepted;
        Transition(OrderStatus.Completed, "system:auto-release", now);
    }

    public void Refund(string actorId, DateTimeOffset now)
    {
        if (PaymentStatus == OrderPaymentStatus.Refunded) return;
        if (PaymentStatus != OrderPaymentStatus.Paid || Status == OrderStatus.Cancelled)
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
    private void RequireParticipant(string actor)
    {
        if (actor != StudentId && actor != TeacherId)
            throw new DomainException("order_not_owned", "Order was not found.");
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

public enum OrderExtensionStatus { Pending, Accepted, Rejected }

public sealed class OrderExtensionRequest
{
    private OrderExtensionRequest() { }
    internal OrderExtensionRequest(Guid orderId, string requestedById, DateTimeOffset proposedDeliveryAt,
        string reason, DateTimeOffset now)
    {
        Id = Guid.NewGuid(); OrderId = orderId; RequestedById = requestedById;
        ProposedDeliveryAt = proposedDeliveryAt; Reason = reason; Status = OrderExtensionStatus.Pending;
        CreatedAt = now; UpdatedAt = now;
    }
    public Guid Id { get; private set; }
    public Guid OrderId { get; private set; }
    public string RequestedById { get; private set; } = "";
    public string? RespondedById { get; private set; }
    public DateTimeOffset ProposedDeliveryAt { get; private set; }
    public string Reason { get; private set; } = "";
    public string Response { get; private set; } = "";
    public OrderExtensionStatus Status { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    internal void Respond(string actorId, bool accept, string? response, DateTimeOffset now)
    {
        if (Status != OrderExtensionStatus.Pending)
            throw new DomainException("extension_already_decided", "Extension request was already decided.");
        response = response?.Trim() ?? "";
        if (response.Length > 2000)
            throw new DomainException("invalid_extension_response", "Extension response is too long.");
        RespondedById = actorId; Response = response;
        Status = accept ? OrderExtensionStatus.Accepted : OrderExtensionStatus.Rejected; UpdatedAt = now;
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

public readonly record struct OrderDeliveryFile(
    string StorageKey, string OriginalName, string ContentType, long Size);

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
