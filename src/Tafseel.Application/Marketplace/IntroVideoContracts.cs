using System.ComponentModel.DataAnnotations;

namespace Tafseel.Application.Marketplace;

/// <summary>The teacher's own view of their one public introduction video, and the application videos they may reuse.</summary>
public sealed record IntroVideoDto(
    bool HasVideo,
    string? SourceCode,
    bool IsPublic,
    string? FileName,
    string? ContentType,
    int? DurationSeconds,
    DateTimeOffset? UpdatedAt,
    DateTimeOffset? ConsentedAt,
    string? ConsentStatement,
    string? Version,
    IReadOnlyCollection<ApplicationVideoOptionDto> ApplicationVideos,
    string ConsentStatementToAccept);

/// <summary>A video recorded for an approved teaching application. It is private until the teacher consents.</summary>
public sealed record ApplicationVideoOptionDto(
    Guid SampleId,
    Guid SubjectId,
    string? SubjectName,
    string? SubjectNameAr,
    string Title,
    int? DurationSeconds,
    bool InUse,
    string? TitleAr = null);

/// <summary>What a visitor sees: the one video the teacher chose, never anything else.</summary>
public sealed record PublicIntroVideoDto(string ContentUrl, string ContentType, int? DurationSeconds);

public sealed record UseApplicationVideoInput(Guid SampleId, bool Consent);
public sealed record IntroVideoVisibilityInput(bool Visible);
public sealed record IntroVideoFile(Stream Content, string ContentType);

public interface IIntroVideoService
{
    Task<IntroVideoDto> GetOwnAsync(string teacherId, CancellationToken cancellationToken);
    Task<IntroVideoDto> UploadAsync(
        string teacherId, Stream content, string fileName, string contentType, long size, string? expectedVersion,
        CancellationToken cancellationToken);
    Task<IntroVideoDto> UseApplicationVideoAsync(
        string teacherId, UseApplicationVideoInput input, string? expectedVersion, CancellationToken cancellationToken);
    Task<IntroVideoDto> SetVisibilityAsync(
        string teacherId, bool visible, string expectedVersion, CancellationToken cancellationToken);
    Task<IntroVideoDto> RemoveAsync(string teacherId, string expectedVersion, CancellationToken cancellationToken);
    Task<IntroVideoFile> OpenAsync(string? requesterId, string teacherId, CancellationToken cancellationToken);
}
