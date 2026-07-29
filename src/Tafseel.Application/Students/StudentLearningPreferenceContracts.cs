using System.ComponentModel.DataAnnotations;
using Tafseel.Application.Common;
using Tafseel.Application.Marketplace;

namespace Tafseel.Application.Students;

public sealed record StudentLearningPreferenceDto(
    string? ExplanationStyle,
    NamedItemDto? PreferredTeachingLanguage,
    string? Version);

public sealed record UpdateStudentLearningPreference(
    [param: StringLength(32)] string? ExplanationStyle,
    Guid? PreferredTeachingLanguageId,
    [param: StringLength(200)] string? Version);

public interface IStudentLearningPreferenceService
{
    Task<StudentLearningPreferenceDto> GetAsync(string studentUserId, CancellationToken ct);
    Task<StudentLearningPreferenceDto> UpsertAsync(
        string studentUserId, UpdateStudentLearningPreference input, CancellationToken ct);
}
