using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Tafseel.Application.Ai;

public static class AiAssistantStatuses
{
    public const string Success = "success";
    public const string NeedsClarification = "needs_clarification";
    public const string NoCanonicalMatch = "no_canonical_match";
    public const string Unavailable = "unavailable";
    public const string Unsupported = "unsupported";
}

public enum AiProviderStatus
{
    Success,
    Disabled,
    MissingCredentials,
    Unauthorized,
    Forbidden,
    RateLimited,
    Timeout,
    Unavailable,
    InvalidResponse,
    Cancelled
}

public sealed record AiProviderResult<T>(
    AiProviderStatus Status,
    T? Value = default,
    int? InputTokens = null,
    int? OutputTokens = null)
{
    public bool IsSuccess => Status == AiProviderStatus.Success && Value is not null;
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record AiDiscoveryCandidate(
    string IntentType,
    string? SubjectText,
    string ServiceIntent,
    string? ServiceText,
    string? PreferredLanguageText,
    string? EducationLevelText,
    decimal? MaximumPrice,
    bool NeedsClarification,
    string[] ClarificationQuestions);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record AiRequestDraftCandidate(
    string Title,
    string Goal,
    string[] DifficultTopics,
    string DesiredOutcome,
    string? DeadlineMentioned,
    string[] MissingInformation,
    string SuggestedDescription);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record AiProductHelpCandidate(string Answer, bool Supported);

public interface IAiProvider
{
    Task<AiProviderResult<AiDiscoveryCandidate>> InterpretIntentAsync(string input, CancellationToken ct);
    Task<AiProviderResult<AiRequestDraftCandidate>> AssistRequestAsync(string input, CancellationToken ct);
    Task<AiProviderResult<AiProductHelpCandidate>> AnswerProductHelpAsync(
        string question, string approvedContext, CancellationToken ct);
}

public sealed record AiDiscoveryInput(
    [param: Required, StringLength(2000, MinimumLength = 3)] string Input,
    [param: Range(0, 2)] int ClarificationRound = 0);

public sealed record AiRequestAssistantInput(
    [param: Required, StringLength(4000, MinimumLength = 3)] string Notes);

public sealed record AiProductHelpInput(
    [param: Required, StringLength(1000, MinimumLength = 3)] string Question);

public sealed record AiResolvedDiscoveryFilters(
    Guid? SubjectId,
    string? SubjectName,
    string? SubjectNameAr,
    Guid? ServiceCatalogItemId,
    string? ServiceName,
    string? ServiceNameAr,
    decimal? MaximumPrice,
    Guid? LanguageId,
    string? LanguageName,
    string? LanguageNameAr,
    Guid? EducationLevelId,
    string? EducationLevelName,
    string? EducationLevelNameAr,
    string Sort = "name");

public sealed record AiDiscoveryResult(
    string Status,
    string Message,
    bool NeedsClarification,
    IReadOnlyCollection<string> ClarificationQuestions,
    AiResolvedDiscoveryFilters? Filters = null);

public sealed record AiRequestAssistantResult(
    string Status,
    string Message,
    AiRequestDraftCandidate? Draft = null);

public sealed record AiProductHelpResult(string Status, string Answer);

public interface IAiMarketplaceAssistant
{
    Task<AiDiscoveryResult> InterpretDiscoveryAsync(AiDiscoveryInput input, CancellationToken ct);
    Task<AiRequestAssistantResult> AssistRequestAsync(AiRequestAssistantInput input, CancellationToken ct);
    Task<AiProductHelpResult> AnswerProductHelpAsync(AiProductHelpInput input, CancellationToken ct);
}
