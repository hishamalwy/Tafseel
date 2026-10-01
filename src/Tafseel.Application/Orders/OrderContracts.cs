using System.ComponentModel.DataAnnotations;
using Tafseel.Application.Common;
using Tafseel.Domain.Orders;

namespace Tafseel.Application.Orders;

public sealed record CreateLearningRequest(
    Guid TeacherServiceId,
    [param: Required, NotWhiteSpace, StringLength(200)] string Title,
    [param: Required, NotWhiteSpace, StringLength(5000)] string Description,
    DateTimeOffset PreferredDeliveryAt,
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal? Budget);

public sealed record AcceptLearningRequest(
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal FinalPrice,
    [param: Required, RegularExpression("^[A-Za-z]{3}$")] string Currency,
    DateTimeOffset AgreedDeliveryAt,
    [param: Range(0, 20)] int RevisionAllowance,
    [param: Range(1, 8760)] int? DeliveryHours = null,
    /// <summary>Required when <see cref="FinalPrice"/> differs from the price the student saw (DEC-UX-03).</summary>
    [param: StringLength(500)] string? PriceChangeReason = null);

public sealed record MessageInput(
    [param: Required, NotWhiteSpace, StringLength(2000)] string Message);
public sealed record ReasonInput(
    [param: Required, NotWhiteSpace, StringLength(2000)] string Reason);
public sealed record RequestOrderExtension(
    DateTimeOffset ProposedDeliveryAt,
    [param: Required, NotWhiteSpace, StringLength(2000)] string Reason);
public sealed record RespondOrderExtension(
    bool Accept,
    [param: StringLength(2000)] string? Response);
public sealed record OrderExtensionDto(
    Guid Id, string RequestedById, string? RespondedById, DateTimeOffset ProposedDeliveryAt,
    string Reason, string Response, OrderExtensionStatus Status, DateTimeOffset CreatedAt);

public sealed record AttachmentDto(
    Guid Id, string OriginalName, string ContentType, long Size, DateTimeOffset CreatedAt,
    string? Version = null);
public sealed record ClarificationDto(Guid Id, string SenderId, string Message, DateTimeOffset CreatedAt);
public sealed record LearningRequestDto(
    Guid Id, string StudentId, string? TeacherId, Guid? TeacherServiceId, string Title, string Description,
    DateTimeOffset PreferredDeliveryAt, decimal? Budget, LearningRequestStatus Status,
    DateTimeOffset CreatedAt, IReadOnlyCollection<AttachmentDto> Attachments,
    IReadOnlyCollection<ClarificationDto> Clarifications, string Version,
    string? StudentDisplayName = null, string? TeacherDisplayName = null,
    string? StudentDisplayNameEnglish = null, string? TeacherDisplayNameEnglish = null,
    Guid? ServiceCatalogItemId = null, string? CatalogCode = null, string? CategoryCode = null,
    string? OrderType = null, string? ServiceNameEnglish = null, string? ServiceNameArabic = null,
    RequestSourcingMode SourcingMode = RequestSourcingMode.Direct,
    Guid? SelectedOfferId = null, DateTimeOffset? PaymentReservationExpiresAt = null,
    /// <summary>Live Offers on an open-sourced request, counted with the same rule as
    /// <c>OpenRequestDto.OfferCount</c> (withdrawn and expired Offers excluded). Null for
    /// direct requests, which are never offered against.</summary>
    int? OfferCount = null,
    OrderStatus? ResultOrderStatus = null,
    OrderPaymentStatus? ResultPaymentStatus = null,
    /// <summary>The Teacher Offering price the student saw when they sent this Direct Request, and its
    /// currency (DEC-13). Null for Open Requests and for Direct Requests created before it was captured —
    /// those are never backfilled. It is history, not the amount owed: the Order's price is what is paid.</summary>
    decimal? ListedPriceAtRequest = null,
    string? ListedCurrencyAtRequest = null);

public sealed record OrderDto(
    Guid Id, Guid LearningRequestId, string StudentId, string TeacherId, Guid TeacherServiceId,
    decimal Price, string Currency, decimal StudentFeePercent, decimal? TeacherCommissionPercent,
    decimal StudentFeeAmount, decimal? TeacherCommissionAmount, decimal StudentTotal, decimal? TeacherNet,
    DateTimeOffset AgreedDeliveryAt, int RevisionAllowance, int RevisionsUsed,
    OrderStatus Status, OrderPaymentStatus PaymentStatus, OrderDeliveryState DeliveryState,
    DateTimeOffset CreatedAt, IReadOnlyCollection<DeliveryDto> Deliveries, string Version,
    string? StudentDisplayName = null, string? TeacherDisplayName = null,
    string? StudentDisplayNameEnglish = null, string? TeacherDisplayNameEnglish = null,
    string? RequestTitle = null,
    Guid? ServiceCatalogItemId = null, string? CatalogCode = null, string? CategoryCode = null,
    string? OrderType = null, string? ServiceNameEnglish = null, string? ServiceNameArabic = null,
    /// <summary>Owner-safe: whether this Order already has a TeacherReview (one per Order).</summary>
    bool HasReview = false,
    decimal? ReviewOverallScore = null,
    string? ReviewComment = null,
    bool? ReviewIsVisible = null,
    DateTimeOffset? ReviewCreatedAt = null,
    bool ReviewCanSubmit = false,
    bool IsOverdue = false,
    bool CanReportNonDelivery = false,
    IReadOnlyCollection<OrderExtensionDto>? Extensions = null,
    /// <summary>The listed price captured on this order's Learning Request (DEC-13), so the student can see
    /// what they were shown beside what was agreed. Null when the request carries no snapshot. Fees and the
    /// total are computed from <see cref="Price"/>, never from this.</summary>
    decimal? ListedPriceAtRequest = null,
    string? ListedCurrencyAtRequest = null,
    /// <summary>The teacher's reason for a price that differs from the listed one, shown before payment.</summary>
    string? PriceChangeReason = null);

public sealed class OrderLifecycleOptions
{
    public const string SectionName = "Orders";
    public int NonDeliveryGraceHours { get; init; } = 24;
}
public sealed record DeliveryDto(
    Guid Id, string OriginalName, string ContentType, long Size, string Message, DateTimeOffset CreatedAt);
public sealed record DeliveryUpload(Stream Stream, string FileName, string ContentType, long Size);

public sealed record OrderTimelineMetadataDto(int? RevisionSequence = null, string? OriginalName = null, string? Note = null);
public sealed record OrderTimelineEventDto(
    string Id, string EventType, DateTimeOffset OccurredAt, string ActorRole,
    OrderTimelineMetadataDto? Metadata = null);

public sealed record PrivateFile(Stream Content, string ContentType, string FileName);

public interface IOrderService
{
    Task<LearningRequestDto> CreateRequestAsync(string studentId, CreateLearningRequest input, CancellationToken ct);
    Task<AttachmentDto> AddRequestAttachmentAsync(string studentId, Guid requestId, Stream stream, string fileName, string contentType, long size, string version, CancellationToken ct);
    Task<PrivateFile> OpenRequestAttachmentAsync(string userId, Guid attachmentId, CancellationToken ct);
    Task<PagedResult<LearningRequestDto>> GetStudentRequestsAsync(string studentId, int page, int pageSize, CancellationToken ct);
    Task<PagedResult<LearningRequestDto>> GetTeacherRequestsAsync(string teacherId, LearningRequestStatus? status, int page, int pageSize, CancellationToken ct);
    Task RequestClarificationAsync(string teacherId, Guid requestId, string message, string version, CancellationToken ct);
    Task ReplyClarificationAsync(string studentId, Guid requestId, string message, string version, CancellationToken ct);
    Task DeclineAsync(string teacherId, Guid requestId, string reason, string version, CancellationToken ct);
    Task<OrderDto> AcceptAsync(string teacherId, Guid requestId, AcceptLearningRequest input, string idempotencyKey, string version, CancellationToken ct);
    Task CancelRequestAsync(string studentId, Guid requestId, string version, CancellationToken ct);
    Task<PagedResult<OrderDto>> GetStudentOrdersAsync(string studentId, int page, int pageSize, CancellationToken ct);
    Task<PagedResult<OrderDto>> GetTeacherOrdersAsync(string teacherId, int page, int pageSize, CancellationToken ct);
    Task<OrderDto> GetOwnedOrderAsync(string userId, Guid orderId, CancellationToken ct);
    Task<LearningRequestDto> GetOwnedRequestAsync(string userId, Guid requestId, CancellationToken ct);
    Task<IReadOnlyCollection<OrderTimelineEventDto>> GetTimelineAsync(
        string userId, Guid orderId, CancellationToken ct);
    Task StartOrderAsync(string teacherId, Guid orderId, string version, CancellationToken ct);
    Task<DeliveryDto> DeliverAsync(
        string teacherId, Guid orderId, IReadOnlyList<DeliveryUpload> uploads, string message, string version,
        CancellationToken ct);
    Task<PrivateFile> OpenDeliveryAsync(string userId, Guid deliveryId, CancellationToken ct);
    Task RequestRevisionAsync(string studentId, Guid orderId, string reason, string version, CancellationToken ct);
    Task CompleteAsync(string studentId, Guid orderId, string version, CancellationToken ct);
    Task CancelOrderAsync(string userId, Guid orderId, string version, CancellationToken ct);
    Task RequestExtensionAsync(string userId, Guid orderId, RequestOrderExtension input, string version, CancellationToken ct);
    Task RespondToExtensionAsync(string userId, Guid orderId, Guid extensionId, RespondOrderExtension input, string version, CancellationToken ct);
}

public sealed class FeeOptions
{
    public const string SectionName = "Fees";
    public decimal StudentFeePercent { get; init; } = 8;
    public decimal TeacherCommissionPercent { get; init; } = 15;
}
