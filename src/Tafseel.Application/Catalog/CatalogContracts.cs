using System.ComponentModel.DataAnnotations;
using Tafseel.Application.Common;

namespace Tafseel.Application.Catalog;

public static class ServiceCatalogPolicyValidator
{
    public static void EnsureOfferingTerms(
        Domain.Catalog.ServiceCatalogItem catalog,
        decimal price,
        string currency,
        int deliveryHours,
        int revisions)
    {
        catalog.EnsurePolicyComplete();
        if (!string.Equals(currency?.Trim(), catalog.CurrencyCode, StringComparison.OrdinalIgnoreCase))
            throw new Domain.Common.DomainException(
                "service_currency_out_of_policy", $"Service currency must be {catalog.CurrencyCode}.");
        if (price < catalog.MinPrice || price > catalog.MaxPrice)
            throw new Domain.Common.DomainException(
                "service_price_out_of_policy", $"Service price must be between {catalog.MinPrice:0.00} and {catalog.MaxPrice:0.00} {catalog.CurrencyCode}.");
        if (revisions < 0 || revisions > catalog.MaximumRevisions)
            throw new Domain.Common.DomainException(
                "service_revisions_out_of_policy", $"Service revisions must be between 0 and {catalog.MaximumRevisions}.");
        if (catalog.OrderType == Domain.Catalog.ServiceOrderTypes.AsyncRequest
            && (deliveryHours < catalog.MinimumDeliveryHours || deliveryHours > catalog.MaximumDeliveryHours))
            throw new Domain.Common.DomainException(
                "service_delivery_out_of_policy",
                $"Service delivery must be between {catalog.MinimumDeliveryHours} and {catalog.MaximumDeliveryHours} hours.");
    }

    public static void EnsureAsyncRequest(Domain.Catalog.ServiceCatalogItem catalog)
    {
        catalog.EnsurePolicyComplete();
        if (catalog.OrderType != Domain.Catalog.ServiceOrderTypes.AsyncRequest)
            throw new Domain.Common.DomainException("teacher_service_not_found", "Teacher service was not found.");
    }

    public static void EnsureLiveSession(Domain.Catalog.ServiceCatalogItem catalog)
    {
        catalog.EnsurePolicyComplete();
        if (catalog.OrderType != Domain.Catalog.ServiceOrderTypes.LiveSession)
            throw new Domain.Common.DomainException("service_not_live_session", "Only live-session services can be booked.");
    }

    public static void EnsureAcceptedTerms(
        Domain.Catalog.ServiceCatalogItem catalog,
        decimal price,
        string currency,
        DateTimeOffset acceptedAt,
        DateTimeOffset agreedDeliveryAt,
        int revisions)
    {
        EnsureAsyncRequest(catalog);
        EnsureOfferingTerms(catalog, price, currency, catalog.MinimumDeliveryHours ?? 1, revisions);
        var hours = (agreedDeliveryAt - acceptedAt).TotalHours;
        if (hours < catalog.MinimumDeliveryHours || hours > catalog.MaximumDeliveryHours)
            throw new Domain.Common.DomainException(
                "service_delivery_out_of_policy",
                $"Accepted delivery must be between {catalog.MinimumDeliveryHours} and {catalog.MaximumDeliveryHours} hours from acceptance.");
    }
}

public sealed record CatalogItemDto(
    Guid Id,
    string Name,
    bool IsActive,
    string? Detail = null,
    Guid? ParentId = null,
    string? Code = null,
    string? Type = null,
    bool? IsPublic = null,
    bool? TeacherSelectable = null,
    bool? RequiresScheduling = null,
    IReadOnlyCollection<int>? AllowedDurations = null,
    decimal? MinPrice = null,
    decimal? MaxPrice = null,
    int? DisplayOrder = null,
    string? TitleAr = null,
    string? InstructionsAr = null,
    int? MinVideoSeconds = null,
    int? ExpectedVideoSeconds = null,
    int? MaxVideoSeconds = null,
    string? EvaluationGuidance = null,
    string? EvaluationGuidanceAr = null,
    IReadOnlyCollection<CatalogResourceDto>? Resources = null,
    string? NameAr = null,
    string? DescriptionAr = null,
    string? NameEn = null,
    string? DescriptionEn = null)
{
    public string? CategoryCode { get; init; }
    public string? IconCode { get; init; }
    public string? OrderType { get; init; }
    public string? QualificationPolicy { get; init; }
    public string? CurrencyCode { get; init; }
    public decimal? DefaultPrice { get; init; }
    public decimal? RecommendedPrice { get; init; }
    public int? MinimumDeliveryHours { get; init; }
    public int? DefaultDeliveryHours { get; init; }
    public int? RecommendedDeliveryHours { get; init; }
    public int? MaximumDeliveryHours { get; init; }
    public int? DefaultRevisions { get; init; }
    public int? MaximumRevisions { get; init; }
    public bool? HasReferences { get; init; }
    public int? EnabledTeacherCount { get; init; }
}
public sealed record CatalogResourceDto(
    Guid Id, string DisplayName, string DisplayNameAr, string? Url,
    int DisplayOrder, bool IsRequired, bool IsFile,
    string? FileName = null, string? ContentType = null);
public sealed record QualificationLinkResourceInput(
    [param: Required, NotWhiteSpace, StringLength(200)] string DisplayName,
    [param: StringLength(200)] string DisplayNameAr,
    [param: Required, Url, StringLength(2000)] string Url,
    [param: Range(0, 10000)] int DisplayOrder = 0,
    bool IsRequired = false);
public sealed record CatalogFile(Stream Content, string ContentType, string FileName);
public sealed record SubjectInput(
    [param: Required, NotWhiteSpace, StringLength(200)] string Name,
    [param: Required, NotWhiteSpace, StringLength(100)] string Icon,
    [param: StringLength(200)] string NameAr = "",
    [param: Range(0, 10000)] int DisplayOrder = 0);
public sealed record TopicInput(
    Guid SubjectId,
    [param: Required, NotWhiteSpace, StringLength(200)] string Name,
    [param: Required, NotWhiteSpace, StringLength(50)] string Difficulty) : IValidatableObject
{
    public IEnumerable<ValidationResult> Validate(ValidationContext _) =>
        SubjectId == Guid.Empty
            ? [new("Subject is required.", [nameof(SubjectId)])]
            : [];
}
public sealed record QualificationTopicInput(
    Guid SubjectId,
    [param: Required, NotWhiteSpace, StringLength(200)] string Name,
    [param: Required, NotWhiteSpace, StringLength(2000)] string Instructions,
    [param: Range(30, 600)] int MaxVideoSeconds = 180,
    [param: StringLength(200)] string TitleAr = "",
    [param: StringLength(2000)] string InstructionsAr = "",
    [param: Range(30, 600)] int MinVideoSeconds = 30,
    [param: Range(30, 600)] int ExpectedVideoSeconds = 180,
    [param: StringLength(4000)] string EvaluationGuidance = "",
    [param: StringLength(4000)] string EvaluationGuidanceAr = "",
    [param: Range(0, 10000)] int DisplayOrder = 0) : IValidatableObject
{
    public IEnumerable<ValidationResult> Validate(ValidationContext _)
    {
        if (SubjectId == Guid.Empty)
            yield return new("Subject is required.", [nameof(SubjectId)]);
        if (MinVideoSeconds > ExpectedVideoSeconds || ExpectedVideoSeconds > MaxVideoSeconds)
            yield return new("Video duration must satisfy minimum ≤ expected ≤ maximum.",
                [nameof(MinVideoSeconds), nameof(ExpectedVideoSeconds), nameof(MaxVideoSeconds)]);
    }
}
public sealed record NamedCatalogInput(
    [param: Required, NotWhiteSpace, StringLength(200)] string Name,
    [param: StringLength(2000)] string? Detail = null,
    [param: Range(30, 600)] int? MaxVideoSeconds = null,
    [param: StringLength(50)] string? Code = null,
    [param: StringLength(50)] string? Type = null,
    bool? IsPublic = null,
    bool? TeacherSelectable = null,
    bool? RequiresScheduling = null,
    int[]? AllowedDurations = null,
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal? MinPrice = null,
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal? MaxPrice = null,
    [param: Range(0, 10000)] int? DisplayOrder = null,
    [param: StringLength(200)] string? NameAr = null,
    [param: StringLength(2000)] string? InstructionsAr = null);

public sealed record ServiceCatalogInput(
    [param: Required, NotWhiteSpace, StringLength(200)] string NameEn,
    [param: Required, NotWhiteSpace, StringLength(200)] string NameAr,
    [param: Required, NotWhiteSpace, StringLength(1000)] string DescriptionEn,
    [param: Required, NotWhiteSpace, StringLength(1000)] string DescriptionAr,
    [param: Range(0, 10000)] int DisplayOrder = 0,
    bool IsActive = true,
    [param: StringLength(50)] string? Code = null,
    [param: Required, RegularExpression("^[a-z][a-z0-9_]{0,49}$")] string CategoryCode = Domain.Catalog.ServiceCategoryCodes.AcademicSupport,
    [param: Required, StringLength(50)] string IconCode = Domain.Catalog.ServiceIconCodes.AcademicSupport,
    [param: Required, RegularExpression("^(async_request|live_session)$")] string OrderType = Domain.Catalog.ServiceOrderTypes.AsyncRequest,
    [param: Required, RegularExpression("^subject_qualification_required$")] string QualificationPolicy = Domain.Catalog.ServiceQualificationPolicies.SubjectQualificationRequired,
    [param: Required, RegularExpression("^SAR$")] string CurrencyCode = "SAR",
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal MinimumPrice = 0.01m,
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal DefaultPrice = 120m,
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal RecommendedPrice = 120m,
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal MaximumPrice = 1000000m,
    [param: Range(1, 8760)] int? MinimumDeliveryHours = 1,
    [param: Range(1, 8760)] int? DefaultDeliveryHours = 48,
    [param: Range(1, 8760)] int? RecommendedDeliveryHours = 48,
    [param: Range(1, 8760)] int? MaximumDeliveryHours = 8760,
    [param: Range(0, 20)] int DefaultRevisions = 2,
    [param: Range(0, 20)] int MaximumRevisions = 20,
    int[]? AllowedDurations = null,
    bool IsPublic = true,
    bool TeacherSelectable = true);

public interface ICatalogService
{
    Task<IReadOnlyCollection<CatalogItemDto>> GetSubjectsAsync(bool includeInactive, CancellationToken cancellationToken);
    Task<IReadOnlyCollection<CatalogItemDto>> GetFeaturedSubjectsAsync(int take, CancellationToken cancellationToken);
    Task<IReadOnlyCollection<CatalogItemDto>> GetTopicsAsync(Guid? subjectId, bool qualificationOnly, bool includeInactive, CancellationToken cancellationToken);
    Task<IReadOnlyCollection<CatalogItemDto>> GetEducationLevelsAsync(bool includeInactive, CancellationToken cancellationToken);
    Task<IReadOnlyCollection<CatalogItemDto>> GetLanguagesAsync(bool includeInactive, CancellationToken cancellationToken);
    Task<IReadOnlyCollection<CatalogItemDto>> GetServicesAsync(bool includeInactive, CancellationToken cancellationToken);
    Task<CatalogItemDto> CreateSubjectAsync(SubjectInput input, CancellationToken cancellationToken);
    Task<CatalogItemDto> CreateTopicAsync(TopicInput input, CancellationToken cancellationToken);
    Task<CatalogItemDto> CreateQualificationTopicAsync(QualificationTopicInput input, CancellationToken cancellationToken);
    Task<CatalogItemDto> CreateEducationLevelAsync(NamedCatalogInput input, CancellationToken cancellationToken);
    Task<CatalogItemDto> CreateLanguageAsync(NamedCatalogInput input, CancellationToken cancellationToken);
    Task<CatalogItemDto> CreateServiceAsync(ServiceCatalogInput input, CancellationToken cancellationToken);
    Task UpdateAsync(string type, Guid id, NamedCatalogInput input, CancellationToken cancellationToken);
    Task UpdateServiceAsync(Guid id, ServiceCatalogInput input, CancellationToken cancellationToken);
    Task SetActiveAsync(string type, Guid id, bool active, CancellationToken cancellationToken);
    Task<CatalogResourceDto> AddLinkResourceAsync(Guid assignmentId, QualificationLinkResourceInput input, CancellationToken cancellationToken);
    Task<CatalogResourceDto> AddFileResourceAsync(Guid assignmentId, Stream stream, string fileName, string contentType, long size, string displayName, string displayNameAr, int displayOrder, bool isRequired, CancellationToken cancellationToken);
    Task<CatalogFile> OpenResourceAsync(Guid resourceId, CancellationToken cancellationToken);
}
