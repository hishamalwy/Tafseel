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
    [param: Range(0, 20)] int RevisionAllowance);

public sealed record MessageInput(
    [param: Required, NotWhiteSpace, StringLength(2000)] string Message);
public sealed record ReasonInput(
    [param: Required, NotWhiteSpace, StringLength(2000)] string Reason);

public sealed record AttachmentDto(
    Guid Id, string OriginalName, string ContentType, long Size, DateTimeOffset CreatedAt,
    string? Version = null);
public sealed record ClarificationDto(Guid Id, string SenderId, string Message, DateTimeOffset CreatedAt);
public sealed record LearningRequestDto(
    Guid Id, string StudentId, string TeacherId, Guid TeacherServiceId, string Title, string Description,
    DateTimeOffset PreferredDeliveryAt, decimal? Budget, LearningRequestStatus Status,
    DateTimeOffset CreatedAt, IReadOnlyCollection<AttachmentDto> Attachments,
    IReadOnlyCollection<ClarificationDto> Clarifications, string Version);

public sealed record OrderDto(
    Guid Id, Guid LearningRequestId, string StudentId, string TeacherId, Guid TeacherServiceId,
    decimal Price, string Currency, decimal StudentFeePercent, decimal? TeacherCommissionPercent,
    decimal StudentFeeAmount, decimal? TeacherCommissionAmount, decimal StudentTotal, decimal? TeacherNet,
    DateTimeOffset AgreedDeliveryAt, int RevisionAllowance, int RevisionsUsed,
    OrderStatus Status, OrderPaymentStatus PaymentStatus, OrderDeliveryState DeliveryState,
    DateTimeOffset CreatedAt, IReadOnlyCollection<DeliveryDto> Deliveries, string Version);
public sealed record DeliveryDto(
    Guid Id, string OriginalName, string ContentType, long Size, string Message, DateTimeOffset CreatedAt);

public sealed record OrderTimelineMetadataDto(int? RevisionSequence = null, string? OriginalName = null);
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
    Task<IReadOnlyCollection<OrderTimelineEventDto>> GetTimelineAsync(
        string userId, Guid orderId, CancellationToken ct);
    Task StartOrderAsync(string teacherId, Guid orderId, string version, CancellationToken ct);
    Task<DeliveryDto> DeliverAsync(string teacherId, Guid orderId, Stream stream, string fileName, string contentType, long size, string message, string version, CancellationToken ct);
    Task<PrivateFile> OpenDeliveryAsync(string userId, Guid deliveryId, CancellationToken ct);
    Task RequestRevisionAsync(string studentId, Guid orderId, string reason, string version, CancellationToken ct);
    Task CompleteAsync(string studentId, Guid orderId, string version, CancellationToken ct);
    Task CancelOrderAsync(string userId, Guid orderId, string version, CancellationToken ct);
}

public sealed class FeeOptions
{
    public const string SectionName = "Fees";
    public decimal StudentFeePercent { get; init; } = 8;
    public decimal TeacherCommissionPercent { get; init; } = 15;
}
