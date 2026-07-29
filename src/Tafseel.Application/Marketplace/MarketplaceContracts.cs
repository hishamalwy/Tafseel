using System.ComponentModel.DataAnnotations;
using Tafseel.Application.Common;

namespace Tafseel.Application.Marketplace;

public sealed record TeacherSearch(
    string? Search,
    Guid? SubjectId,
    Guid? TopicId,
    Guid? EducationLevelId,
    Guid? ServiceTypeId,
    decimal? MinimumRating,
    decimal? MaximumPrice,
    Guid[]? LanguageIds,
    bool VerifiedOnly = false,
    bool AvailableThisWeek = false,
    bool OnlineOnly = false,
    string Sort = "recommended",
    int Page = 1,
    int PageSize = 12);

public sealed record TeacherCardDto(
    string TeacherId,
    string FullName,
    string Headline,
    string Country,
    bool Verified,
    decimal Rating,
    int RatingCount,
    int CompletedOrders,
    int ResponseTimeMinutes,
    decimal? StartingPrice,
    string? Currency,
    IReadOnlyCollection<string> Subjects,
    IReadOnlyCollection<string> Languages,
    string? FullNameEnglish = null);

public sealed record TeacherProfileDto(
    string TeacherId,
    string FullName,
    string Headline,
    string Bio,
    string Country,
    string City,
    string TimeZoneId,
    bool Verified,
    decimal Rating,
    int RatingCount,
    int CompletedOrders,
    int ResponseTimeMinutes,
    IReadOnlyCollection<NamedItemDto> Subjects,
    IReadOnlyCollection<NamedItemDto> Topics,
    IReadOnlyCollection<NamedItemDto> Languages,
    IReadOnlyCollection<NamedItemDto> EducationLevels,
    IReadOnlyCollection<TeacherServiceDto> Services,
    IReadOnlyCollection<TeachingSampleDto> Samples,
    IReadOnlyCollection<AvailabilityRuleDto> Availability,
    IReadOnlyCollection<AvailabilityExceptionDto> AvailabilityExceptions,
    IReadOnlyCollection<CredentialDto> Certifications,
    IReadOnlyCollection<CredentialDto> Experience,
    LiveSessionBookingPolicyDto? LiveSessionBookingPolicy,
    bool IsProfileComplete = false,
    bool IsEligibleForPublication = false,
    IReadOnlyCollection<string>? PublicationBlockingReasons = null,
    bool IsPubliclyVisible = false,
    IReadOnlyCollection<Guid>? VerifiedSubjectIds = null,
    string? FullNameEnglish = null);

public sealed record NamedItemDto(Guid Id, string Name);
public sealed record UpdateTeacherProfile(
    [param: Required, NotWhiteSpace, StringLength(200)] string Headline,
    [param: Required, NotWhiteSpace, StringLength(4000)] string Bio,
    [param: Required, NotWhiteSpace, StringLength(100)] string Country,
    [param: Required, NotWhiteSpace, StringLength(150)] string City,
    [param: Required, NotWhiteSpace, StringLength(100)] string TimeZoneId,
    [param: Range(0, 43200)] int ResponseTimeMinutes);

public sealed record TeacherServiceInput(
    Guid SubjectId,
    Guid ServiceCatalogItemId,
    [param: Required, NotWhiteSpace, StringLength(200)] string Title,
    [param: Required, NotWhiteSpace, StringLength(2000)] string Description,
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal Price,
    [param: Required, RegularExpression("^[A-Za-z]{3}$")] string Currency,
    [param: Range(1, 8760)] int DeliveryHours,
    [param: Range(0, 20)] int Revisions);

public sealed record TeacherServiceDto(
    Guid Id,
    Guid SubjectId,
    Guid ServiceCatalogItemId,
    string ServiceCatalogCode,
    string ServiceCatalogType,
    string Title,
    string Description,
    decimal Price,
    string Currency,
    int DeliveryHours,
    int Revisions,
    bool IsActive,
    bool IsCatalogActive,
    bool IsPublic,
    bool TeacherSelectable,
    bool RequiresScheduling,
    IReadOnlyCollection<int> AllowedDurations,
    decimal? MinPrice,
    decimal? MaxPrice,
    int DisplayOrder,
    bool CanRequest,
    bool CanBook,
    string Version);

public sealed record LiveSessionBookingPolicyDto(
    decimal EmergencyPremiumPercent,
    int CancellationWindowHours);

public sealed record TeachingSampleDto(
    Guid Id, Guid SubjectId, Guid? TopicId, string Title, int DurationSeconds, DateTimeOffset? PublishedAt);
public sealed record SampleFile(Stream Content, string ContentType);

public sealed record AvailabilityRuleInput(
    [param: EnumDataType(typeof(DayOfWeek))] DayOfWeek DayOfWeek,
    TimeOnly Start,
    TimeOnly End,
    [param: Required, NotWhiteSpace, StringLength(100)] string TimeZoneId,
    [param: Range(15, 240)] int? SlotMinutes);
public sealed record AvailabilityRuleDto(
    Guid Id, DayOfWeek DayOfWeek, TimeOnly Start, TimeOnly End, string TimeZoneId, int? SlotMinutes);

public sealed record AvailabilityExceptionInput(
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    [param: StringLength(500)] string? Reason);
public sealed record AvailabilityExceptionDto(
    Guid Id, DateTimeOffset StartsAt, DateTimeOffset EndsAt, string Reason);

public sealed record CredentialInput(
    [param: Required, NotWhiteSpace, StringLength(200)] string Title,
    [param: Required, NotWhiteSpace, StringLength(200)] string Organization,
    DateOnly? From,
    DateOnly? To);
public sealed record CredentialDto(
    Guid Id, string Title, string Organization, DateOnly? From, DateOnly? To);

public interface IMarketplaceService
{
    Task<PagedResult<TeacherCardDto>> SearchAsync(TeacherSearch query, CancellationToken ct);
    Task<TeacherProfileDto> GetPublicProfileAsync(string teacherId, CancellationToken ct);
    Task<TeacherProfileDto> GetOwnProfileAsync(string teacherId, CancellationToken ct);
    Task<IReadOnlyCollection<NamedItemDto>> GetLanguagesAsync(string teacherId, CancellationToken ct);
    Task UpdateProfileAsync(string teacherId, UpdateTeacherProfile input, CancellationToken ct);
    Task SetProfilePublishedAsync(string teacherId, bool published, CancellationToken ct);
    Task SetTopicsAsync(string teacherId, IReadOnlyCollection<Guid> topicIds, CancellationToken ct);
    Task SetLanguagesAsync(string teacherId, IReadOnlyCollection<Guid> languageIds, CancellationToken ct);
    Task SetEducationLevelsAsync(string teacherId, IReadOnlyCollection<Guid> educationLevelIds, CancellationToken ct);
    Task<TeacherServiceDto> AddServiceAsync(string teacherId, TeacherServiceInput input, CancellationToken ct);
    Task UpdateServiceAsync(string teacherId, Guid id, TeacherServiceInput input, string version, CancellationToken ct);
    Task SetServiceActiveAsync(string teacherId, Guid id, bool active, string version, CancellationToken ct);
    Task<TeachingSampleDto> AddSampleAsync(string teacherId, Guid subjectId, Guid? topicId, string title, Stream stream, string fileName, string contentType, long size, int durationSeconds, CancellationToken ct);
    Task SetSamplePublishedAsync(string teacherId, Guid id, bool published, CancellationToken ct);
    Task<SampleFile> OpenSampleAsync(string? requesterId, Guid id, CancellationToken ct);
    Task<AvailabilityRuleDto> AddAvailabilityRuleAsync(string teacherId, AvailabilityRuleInput input, CancellationToken ct);
    Task RemoveAvailabilityRuleAsync(string teacherId, Guid id, CancellationToken ct);
    Task<AvailabilityExceptionDto> AddAvailabilityExceptionAsync(string teacherId, AvailabilityExceptionInput input, CancellationToken ct);
    Task RemoveAvailabilityExceptionAsync(string teacherId, Guid id, CancellationToken ct);
    Task<CredentialDto> AddCredentialAsync(string teacherId, bool certification, CredentialInput input, CancellationToken ct);
    Task RemoveCredentialAsync(string teacherId, bool certification, Guid id, CancellationToken ct);
    Task FavoriteAsync(string studentId, string teacherId, CancellationToken ct);
    Task UnfavoriteAsync(string studentId, string teacherId, CancellationToken ct);
    Task<IReadOnlyCollection<TeacherCardDto>> GetFavoritesAsync(string studentId, CancellationToken ct);
}
