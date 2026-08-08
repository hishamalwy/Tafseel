namespace Tafseel.Domain.Marketplace;

/// <summary>Append-only, first-party discovery telemetry. Transactional truth never belongs here.</summary>
public sealed class MarketplaceInteractionEvent
{
    private MarketplaceInteractionEvent() { }

    public MarketplaceInteractionEvent(
        string eventName, string sourceSurface, string clientEventId, DateTimeOffset occurredAtUtc,
        string? authenticatedUserId, string? anonymousSessionId, Guid? subjectId,
        string? teacherId, Guid? teacherServiceId, Guid? serviceCatalogItemId,
        int? resultCount, bool queryPresent, bool languageFilterPresent, bool priceFilterPresent)
    {
        Id = Guid.NewGuid();
        EventName = eventName;
        SourceSurface = sourceSurface;
        ClientEventId = clientEventId;
        OccurredAtUtc = occurredAtUtc;
        AuthenticatedUserId = authenticatedUserId;
        AnonymousSessionId = anonymousSessionId;
        SubjectId = subjectId;
        TeacherId = teacherId;
        TeacherServiceId = teacherServiceId;
        ServiceCatalogItemId = serviceCatalogItemId;
        ResultCount = resultCount;
        QueryPresent = queryPresent;
        LanguageFilterPresent = languageFilterPresent;
        PriceFilterPresent = priceFilterPresent;
    }

    public Guid Id { get; private set; }
    public string EventName { get; private set; } = "";
    public string SourceSurface { get; private set; } = "";
    public string ClientEventId { get; private set; } = "";
    public DateTimeOffset OccurredAtUtc { get; private set; }
    public string? AuthenticatedUserId { get; private set; }
    public string? AnonymousSessionId { get; private set; }
    public Guid? SubjectId { get; private set; }
    public string? TeacherId { get; private set; }
    public Guid? TeacherServiceId { get; private set; }
    public Guid? ServiceCatalogItemId { get; private set; }
    public int? ResultCount { get; private set; }
    public bool QueryPresent { get; private set; }
    public bool LanguageFilterPresent { get; private set; }
    public bool PriceFilterPresent { get; private set; }
}
