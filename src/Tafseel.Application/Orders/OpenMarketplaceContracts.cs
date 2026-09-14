using System.ComponentModel.DataAnnotations;
using Tafseel.Application.Common;
using Tafseel.Domain.Orders;

namespace Tafseel.Application.Orders;

public sealed record CreateOpenLearningRequest(
    Guid SubjectId,
    Guid ServiceCatalogItemId,
    [param: Required, NotWhiteSpace, StringLength(200)] string Title,
    [param: Required, NotWhiteSpace, StringLength(5000)] string Requirements,
    DateTimeOffset Deadline,
    [param: Range(typeof(decimal), "0", "1000000")] decimal? BudgetMin,
    [param: Range(typeof(decimal), "0", "1000000")] decimal? BudgetMax);

public sealed record SubmitTeacherOffer(
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal Amount,
    [param: Range(1, 8760)] int DeliveryHours,
    [param: Required, NotWhiteSpace, StringLength(2000)] string Message,
    [param: Range(0, 20)] int IncludedRevisions = 2,
    [param: Range(1, 720)] int ValidityHours = 168);

public sealed record OpenRequestDto(
    Guid Id, Guid SubjectId, Guid ServiceCatalogItemId,
    string Title, string Requirements, DateTimeOffset Deadline,
    decimal? BudgetMin, decimal? BudgetMax, string Currency,
    LearningRequestStatus Status, DateTimeOffset PublishedAt,
    DateTimeOffset? PaymentReservationExpiresAt, Guid? SelectedOfferId,
    string SubjectName, string? SubjectNameArabic,
    string ServiceName, string? ServiceNameArabic,
    IReadOnlyCollection<AttachmentDto> Attachments, string Version,
    int? OfferCount = null, TeacherOfferDto? MyOffer = null);

public sealed record TeacherOfferDto(
    Guid Id, Guid LearningRequestId, string TeacherId, decimal Amount, string Currency,
    int DeliveryHours, string Message, TeacherOfferStatus Status,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, string Version,
    string? TeacherDisplayName = null, string? TeacherDisplayNameEnglish = null,
    decimal? Rating = null, int ReviewCount = 0, string? AvatarUrl = null,
    string? ProfileUrl = null, int IncludedRevisions = 2, DateTimeOffset? ValidUntil = null);

public interface IOpenMarketplaceService
{
    Task<OpenRequestDto> PublishAsync(string studentId, CreateOpenLearningRequest input, CancellationToken ct);
    Task<PagedResult<OpenRequestDto>> GetOpportunitiesAsync(string teacherId, int page, int pageSize, CancellationToken ct);
    Task<OpenRequestDto> GetOpportunityAsync(string teacherId, Guid requestId, CancellationToken ct);
    Task<OpenRequestDto> GetStudentRequestAsync(string studentId, Guid requestId, CancellationToken ct);
    Task<TeacherOfferDto> SubmitOfferAsync(string teacherId, Guid requestId, SubmitTeacherOffer input, CancellationToken ct);
    Task<TeacherOfferDto> UpdateOfferAsync(string teacherId, Guid offerId, SubmitTeacherOffer input, string version, CancellationToken ct);
    Task WithdrawOfferAsync(string teacherId, Guid offerId, string version, CancellationToken ct);
    Task<IReadOnlyCollection<TeacherOfferDto>> GetStudentOffersAsync(string studentId, Guid requestId, CancellationToken ct);
    Task<TeacherOfferDto> GetMyOfferAsync(string teacherId, Guid requestId, CancellationToken ct);
    Task SelectOfferAsync(string studentId, Guid requestId, Guid offerId, string requestVersion, string offerVersion, CancellationToken ct);
    Task CancelSelectionAsync(string studentId, Guid requestId, string requestVersion, CancellationToken ct);
}

public sealed class OpenMarketplaceOptions
{
    public const string SectionName = "OpenMarketplace";
    public int OfferReservationMinutes { get; init; } = 120;
}
