using System.ComponentModel.DataAnnotations;
using Tafseel.Application.Common;

namespace Tafseel.Application.Catalog;

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
    int? DisplayOrder = null);
public sealed record SubjectInput(
    [param: Required, NotWhiteSpace, StringLength(200)] string Name,
    [param: Required, NotWhiteSpace, StringLength(100)] string Icon);
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
    [param: Range(30, 600)] int MaxVideoSeconds = 180) : IValidatableObject
{
    public IEnumerable<ValidationResult> Validate(ValidationContext _) =>
        SubjectId == Guid.Empty
            ? [new("Subject is required.", [nameof(SubjectId)])]
            : [];
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
    [param: Range(0, 10000)] int? DisplayOrder = null);

public interface ICatalogService
{
    Task<IReadOnlyCollection<CatalogItemDto>> GetSubjectsAsync(bool includeInactive, CancellationToken cancellationToken);
    Task<IReadOnlyCollection<CatalogItemDto>> GetTopicsAsync(Guid? subjectId, bool qualificationOnly, bool includeInactive, CancellationToken cancellationToken);
    Task<IReadOnlyCollection<CatalogItemDto>> GetEducationLevelsAsync(bool includeInactive, CancellationToken cancellationToken);
    Task<IReadOnlyCollection<CatalogItemDto>> GetLanguagesAsync(bool includeInactive, CancellationToken cancellationToken);
    Task<IReadOnlyCollection<CatalogItemDto>> GetServicesAsync(bool includeInactive, CancellationToken cancellationToken);
    Task<CatalogItemDto> CreateSubjectAsync(SubjectInput input, CancellationToken cancellationToken);
    Task<CatalogItemDto> CreateTopicAsync(TopicInput input, CancellationToken cancellationToken);
    Task<CatalogItemDto> CreateQualificationTopicAsync(QualificationTopicInput input, CancellationToken cancellationToken);
    Task<CatalogItemDto> CreateEducationLevelAsync(NamedCatalogInput input, CancellationToken cancellationToken);
    Task<CatalogItemDto> CreateLanguageAsync(NamedCatalogInput input, CancellationToken cancellationToken);
    Task<CatalogItemDto> CreateServiceAsync(NamedCatalogInput input, CancellationToken cancellationToken);
    Task UpdateAsync(string type, Guid id, NamedCatalogInput input, CancellationToken cancellationToken);
    Task SetActiveAsync(string type, Guid id, bool active, CancellationToken cancellationToken);
}
