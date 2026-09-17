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
    Cancelled,
    ConnectionFailure,
    BadRequest,
    ProviderError
}

public static class AiProviderStatusCategories
{
    public static string For(AiProviderStatus status) => status switch
    {
        AiProviderStatus.Disabled => "disabled",
        AiProviderStatus.MissingCredentials => "credential_missing",
        AiProviderStatus.Unauthorized => "provider_401",
        AiProviderStatus.Forbidden => "provider_403",
        AiProviderStatus.RateLimited => "provider_429",
        AiProviderStatus.BadRequest => "provider_400",
        AiProviderStatus.Timeout => "timeout",
        AiProviderStatus.ConnectionFailure => "connection_failure",
        AiProviderStatus.InvalidResponse => "invalid_output",
        AiProviderStatus.Cancelled => "cancellation",
        AiProviderStatus.ProviderError or AiProviderStatus.Unavailable => "provider_5xx",
        AiProviderStatus.Success => "success",
        _ => "unavailable"
    };
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
    string[] ClarificationQuestions,
    string? AvailabilityDayText = null,
    string? AvailabilityDateText = null,
    string? TopicContext = null);

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
    /// <summary>
    /// Whether the provider can actually be called: the feature is switched on and its credentials are
    /// present. Read-only, and the same condition the provider already uses before every call — it names
    /// no provider, model, endpoint or key (UX-08).
    /// </summary>
    bool IsAvailable { get; }

    Task<AiProviderResult<AiDiscoveryCandidate>> InterpretIntentAsync(string input, CancellationToken ct);
    Task<AiProviderResult<AiRequestDraftCandidate>> AssistRequestAsync(string input, CancellationToken ct);
    Task<AiProviderResult<AiProductHelpCandidate>> AnswerProductHelpAsync(
        string question, string approvedContext, CancellationToken ct);
}

public sealed record AiDiscoveryInput(
    [param: Required, StringLength(2000, MinimumLength = 3)] string Input,
    [param: Range(0, 2)] int ClarificationRound = 0,
    [param: StringLength(100)] string? ViewerTimeZoneId = null);

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
    string Sort = "name",
    DateOnly? AvailableOn = null,
    string? AvailabilityDayLabel = null,
    string? TopicContext = null,
    string? ViewerTimeZoneId = null);

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

/// <summary>
/// Which AI actions the client may offer (UX-08). One boolean per product capability, and nothing about
/// how it is provided: no provider, model, endpoint, key or diagnostic.
/// </summary>
public sealed record AiCapabilitiesDto(bool RequestAssistant);

public interface IAiMarketplaceAssistant
{
    /// <summary>What the client may offer: the capability, not how it is configured (UX-08).</summary>
    AiCapabilitiesDto GetCapabilities();

    Task<AiDiscoveryResult> InterpretDiscoveryAsync(AiDiscoveryInput input, CancellationToken ct);
    Task<AiRequestAssistantResult> AssistRequestAsync(AiRequestAssistantInput input, CancellationToken ct);
    Task<AiProductHelpResult> AnswerProductHelpAsync(AiProductHelpInput input, CancellationToken ct);
}
