using System.ComponentModel.DataAnnotations;
using Tafseel.Application.Common;
using Tafseel.Domain.TeacherApplications;

namespace Tafseel.Application.TeacherApplications;

public sealed record CreateTeacherApplication(
    Guid SubjectId,
    Guid QualificationTopicId,
    [param: Required, NotWhiteSpace, StringLength(150)] string City,
    [param: Range(0, 80)] int ExperienceYears,
    [param: StringLength(300)] string? Degree = null) : IValidatableObject
{
    public IEnumerable<ValidationResult> Validate(ValidationContext _)
    {
        if (SubjectId == Guid.Empty)
            yield return new("Subject is required.", [nameof(SubjectId)]);
        if (QualificationTopicId == Guid.Empty)
            yield return new("Qualification topic is required.", [nameof(QualificationTopicId)]);
        if (!string.IsNullOrWhiteSpace(City) && !City.Any(char.IsLetter))
            yield return new("City must contain a meaningful name.", [nameof(City)]);
        if (!string.IsNullOrWhiteSpace(Degree) && !Degree.Any(char.IsLetter))
            yield return new("Degree or qualification must contain meaningful text.", [nameof(Degree)]);
    }
}
public sealed record TeacherApplicationDto(
    Guid Id,
    string TeacherId,
    Guid SubjectId,
    Guid QualificationTopicId,
    TeacherApplicationStatus Status,
    ApplicationPriority Priority,
    string? AssignedReviewerId,
    DateTimeOffset? SubmittedAt,
    string Version,
    string? TeacherDisplayName = null,
    string? SubjectName = null,
    string? AssignmentTitle = null,
    string? AssignmentInstructions = null,
    bool DemoUploaded = false,
    int? DemoDurationSeconds = null,
    int SubmissionVersion = 0,
    string? PublicFeedback = null,
    string? City = null,
    int ExperienceYears = 0,
    string? Degree = null,
    string AssignmentResourceManifest = "[]",
    string? SubjectNameAr = null,
    string? AssignmentTitleAr = null);

public enum TeacherOnboardingStatus
{
    EmailUnconfirmed, ApplicationRequired, ApplicationDraft, DemoRequired, ReadyToSubmit,
    PendingReview, UnderReview, ChangesRequested, Rejected, ApprovedButProfileIncomplete,
    ApprovedButNotPublished, Published, Suspended
}

public sealed record TeacherOnboardingStatusDto(
    TeacherOnboardingStatus Status,
    bool EmailConfirmed,
    Guid? ApplicationId,
    TeacherApplicationStatus? ApplicationStatus,
    Guid? SubjectId,
    Guid? AssignmentId,
    bool DemoUploaded,
    bool CanSubmit,
    IReadOnlyCollection<Guid> ApprovedSubjectIds,
    bool ProfileComplete,
    bool HasActiveService,
    bool IsPublished,
    string NextAction,
    string NextUrl,
    IReadOnlyCollection<string> BlockingReasons,
    bool HasAvailability = false,
    bool HasPublicSample = false,
    bool ReadyForPublication = false,
    IReadOnlyCollection<string>? MissingRequirements = null);

public sealed record QualificationResourceDto(
    Guid Id, Guid AssignmentId, string Type, string DisplayName, string DisplayNameAr,
    string? Url, int DisplayOrder, bool IsRequired);

public sealed record PrivateMediaFile(Stream Content, string ContentType, string FileName);
public sealed record RevokeQualificationInput(
    [param: Required, NotWhiteSpace, StringLength(2000)] string Reason);
public sealed record ReviewScoreInput(
    [param: EnumDataType(typeof(EvaluationCriterion))] EvaluationCriterion Criterion,
    [param: Range(1, 5)] int Score);
public sealed record DecideTeacherApplication(
    [param: EnumDataType(typeof(ReviewDecision))] ReviewDecision Decision,
    [param: Required, MinLength(9), MaxLength(9)] IReadOnlyCollection<ReviewScoreInput> Scores,
    [param: StringLength(2000)] string? Comment,
    [param: StringLength(4000)] string? InternalNotes) : IValidatableObject
{
    public IEnumerable<ValidationResult> Validate(ValidationContext _)
    {
        if (Scores is null)
            yield break;
        if (Scores.GroupBy(x => x.Criterion).Any(x => x.Count() != 1)
            || Scores.Any(x => !Enum.IsDefined(x.Criterion))
            || Enum.GetValues<EvaluationCriterion>().Any(x => Scores.All(score => score.Criterion != x)))
            yield return new("Every evaluation criterion must be supplied exactly once.", [nameof(Scores)]);
        if (Decision is ReviewDecision.Reject or ReviewDecision.RequestChanges
            && string.IsNullOrWhiteSpace(Comment))
            yield return new("A comment is required for rejection or requested changes.", [nameof(Comment)]);
    }
}
public sealed record StoredFile(string StorageKey, long Size, string ContentType);

public interface ITeacherApplicationService
{
    Task<TeacherApplicationDto> CreateAsync(string teacherId, CreateTeacherApplication input, CancellationToken cancellationToken);
    Task UpdateAsync(string teacherId, Guid applicationId, CreateTeacherApplication input, string expectedVersion, CancellationToken cancellationToken);
    Task<StoredFile> UploadDemoAsync(string teacherId, Guid applicationId, Stream stream, string fileName, string contentType, long size, int durationSeconds, string expectedVersion, CancellationToken cancellationToken);
    Task SubmitAsync(string teacherId, Guid applicationId, string expectedVersion, CancellationToken cancellationToken);
    Task WithdrawAsync(string teacherId, Guid applicationId, string expectedVersion, CancellationToken cancellationToken);
    Task<IReadOnlyCollection<TeacherApplicationDto>> GetMineAsync(string teacherId, CancellationToken cancellationToken);
    Task<IReadOnlyCollection<TeacherApplicationDto>> GetQueueAsync(TeacherApplicationStatus? status, CancellationToken cancellationToken);
    Task<TeacherOnboardingStatusDto> GetOnboardingStatusAsync(string teacherId, CancellationToken cancellationToken);
    Task<PrivateMediaFile> OpenDemoAsync(string requesterId, Guid applicationId, bool canReview, CancellationToken cancellationToken);
    Task StartReviewAsync(string reviewerId, Guid applicationId, ApplicationPriority priority, string expectedVersion, CancellationToken cancellationToken);
    Task DecideAsync(string reviewerId, Guid applicationId, DecideTeacherApplication input, string expectedVersion, CancellationToken cancellationToken);
    Task RevokeQualificationAsync(string reviewerId, Guid qualificationId, RevokeQualificationInput input, CancellationToken cancellationToken);
}

public interface IFileStorageService
{
    Task<StoredFile> StorePrivateVideoAsync(
        Stream stream,
        string fileName,
        string contentType,
        long size,
        CancellationToken cancellationToken);
    Task<Stream> OpenPrivateVideoAsync(string storageKey, CancellationToken cancellationToken);
    Task<bool> PrivateFileExistsAsync(string storageKey, CancellationToken cancellationToken);
    Task<StoredFile> StorePrivateFileAsync(
        Stream stream, string fileName, string contentType, long size, string category, CancellationToken cancellationToken);
    Task<Stream> OpenPrivateFileAsync(string storageKey, CancellationToken cancellationToken);
    Task DeletePrivateFileAsync(string storageKey, CancellationToken cancellationToken);
    Task<StoredFile> StoreAvatarAsync(
        Stream stream, string fileName, string contentType, long size, CancellationToken cancellationToken);
}
