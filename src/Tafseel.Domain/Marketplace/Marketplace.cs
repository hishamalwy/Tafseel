using Tafseel.Domain.Common;

namespace Tafseel.Domain.Marketplace;

public sealed class TeacherProfile
{
    private TeacherProfile() { }

    public TeacherProfile(string teacherId, DateTimeOffset now)
    {
        TeacherId = Required(teacherId, 450, nameof(teacherId));
        CreatedAt = UpdatedAt = now;
    }

    public string TeacherId { get; private set; } = "";
    public string Headline { get; private set; } = "";
    public string Bio { get; private set; } = "";
    public string Country { get; private set; } = "";
    public string City { get; private set; } = "";
    public string TimeZoneId { get; private set; } = "UTC";
    public int ResponseTimeMinutes { get; private set; }
    public bool IsPublished { get; private set; }
    public decimal AverageRating { get; private set; }
    public int RatingCount { get; private set; }
    public int CompletedOrders { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    public void Update(string headline, string bio, string country, string city, string timeZoneId, int responseTimeMinutes, DateTimeOffset now)
    {
        Headline = Required(headline, 200, nameof(headline));
        Bio = Required(bio, 4000, nameof(bio));
        Country = Required(country, 100, nameof(country));
        City = Required(city, 150, nameof(city));
        ValidateTimeZone(Required(timeZoneId, 100, nameof(timeZoneId)));
        if (responseTimeMinutes is < 0 or > 43200)
            throw new DomainException("invalid_response_time", "Response time must be between 0 and 30 days.");
        TimeZoneId = timeZoneId;
        ResponseTimeMinutes = responseTimeMinutes;
        UpdatedAt = now;
    }

    public void Publish(DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(Headline) || string.IsNullOrWhiteSpace(Bio))
            throw new DomainException("profile_incomplete", "Complete the teacher profile before publishing.");
        IsPublished = true;
        UpdatedAt = now;
    }

    public void Unpublish(DateTimeOffset now)
    {
        IsPublished = false;
        UpdatedAt = now;
    }

    public void SetRating(decimal average, int count, DateTimeOffset now)
    {
        if (average is < 0 or > 5 || count < 0)
            throw new DomainException("invalid_rating", "Teacher rating aggregate is invalid.");
        AverageRating = decimal.Round(average, 2, MidpointRounding.AwayFromZero);
        RatingCount = count;
        UpdatedAt = now;
    }

    private static string Required(string value, int maximum, string field)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 || value.Length > maximum)
            throw new DomainException($"invalid_{field}", $"{field} is required and must not exceed {maximum} characters.");
        return value;
    }

    private static void ValidateTimeZone(string timeZoneId)
    {
        try { TimeZoneInfo.FindSystemTimeZoneById(timeZoneId); }
        catch (TimeZoneNotFoundException)
        {
            throw new DomainException("invalid_time_zone", "The requested time zone is not supported.");
        }
        catch (InvalidTimeZoneException)
        {
            throw new DomainException("invalid_time_zone", "The requested time zone is not supported.");
        }
    }
}

public sealed class TeacherTopic
{
    private TeacherTopic() { }
    public TeacherTopic(string teacherId, Guid topicId)
    {
        TeacherId = teacherId;
        TopicId = topicId;
    }
    public string TeacherId { get; private set; } = "";
    public Guid TopicId { get; private set; }
}

public sealed class TeacherLanguage
{
    private TeacherLanguage() { }
    public TeacherLanguage(string teacherId, Guid languageId)
    {
        TeacherId = teacherId;
        LanguageId = languageId;
    }
    public string TeacherId { get; private set; } = "";
    public Guid LanguageId { get; private set; }
}

public sealed class TeacherEducationLevel
{
    private TeacherEducationLevel() { }
    public TeacherEducationLevel(string teacherId, Guid educationLevelId)
    {
        TeacherId = teacherId;
        EducationLevelId = educationLevelId;
    }
    public string TeacherId { get; private set; } = "";
    public Guid EducationLevelId { get; private set; }
}

public sealed class TeacherService
{
    private TeacherService() { }

    public TeacherService(
        string teacherId, Guid subjectId, Guid serviceCatalogItemId, string title,
        string description, decimal price, string currency, int deliveryHours, int revisions,
        DateTimeOffset now)
    {
        Id = Guid.NewGuid();
        TeacherId = teacherId;
        SubjectId = subjectId;
        ServiceCatalogItemId = serviceCatalogItemId;
        Update(title, description, price, currency, deliveryHours, revisions, now);
        CreatedAt = now;
    }

    public Guid Id { get; private set; }
    public string TeacherId { get; private set; } = "";
    public Guid SubjectId { get; private set; }
    public Guid ServiceCatalogItemId { get; private set; }
    public string Title { get; private set; } = "";
    public string Description { get; private set; } = "";
    public string ApproachEn { get; private set; } = "";
    public string ApproachAr { get; private set; } = "";
    public decimal Price { get; private set; }
    public string Currency { get; private set; } = "";
    public int DeliveryHours { get; private set; }
    public int Revisions { get; private set; }
    public bool IsActive { get; private set; } = true;
    public Guid? SupersededByTeacherServiceId { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];
    public bool IsSuperseded => SupersededByTeacherServiceId.HasValue;

    public void Update(string title, string description, decimal price, string currency, int deliveryHours, int revisions, DateTimeOffset now)
    {
        title = title?.Trim() ?? "";
        description = description?.Trim() ?? "";
        currency = currency?.Trim().ToUpperInvariant() ?? "";
        if (title.Length is 0 or > 200 || description.Length is 0 or > 2000)
            throw new DomainException("invalid_service", "Service title and description are required.");
        if (price is <= 0 or > 1_000_000 || currency.Length != 3)
            throw new DomainException("invalid_service_price", "A positive price and three-letter currency are required.");
        if (deliveryHours is < 1 or > 8760 || revisions is < 0 or > 20)
            throw new DomainException("invalid_service_terms", "Service delivery or revision terms are invalid.");
        Title = title;
        Description = description;
        Price = price;
        Currency = currency;
        DeliveryHours = deliveryHours;
        Revisions = revisions;
        UpdatedAt = now;
    }

    public void Configure(
        decimal price, string currency, int deliveryHours, int revisions,
        string? approachEn, string? approachAr, DateTimeOffset now)
    {
        approachEn = approachEn?.Trim() ?? "";
        approachAr = approachAr?.Trim() ?? "";
        currency = currency?.Trim().ToUpperInvariant() ?? "";
        if (price is <= 0 or > 1_000_000 || currency.Length != 3)
            throw new DomainException("invalid_service_price", "A positive price and three-letter currency are required.");
        if (deliveryHours is < 1 or > 8760 || revisions is < 0 or > 20)
            throw new DomainException("invalid_service_terms", "Service delivery or revision terms are invalid.");
        if (approachEn.Length > 1000 || approachAr.Length > 1000)
            throw new DomainException("invalid_teacher_service_approach", "Teacher approach notes must not exceed 1,000 characters per language.");
        Price = price;
        Currency = currency;
        DeliveryHours = deliveryHours;
        Revisions = revisions;
        ApproachEn = approachEn;
        ApproachAr = approachAr;
        UpdatedAt = now;
    }

    public void SetActive(bool active, DateTimeOffset now)
    {
        if (active && IsSuperseded)
            throw new DomainException("teacher_service_superseded", "A superseded Teacher service cannot be enabled.");
        IsActive = active;
        UpdatedAt = now;
    }

    public void SupersedeBy(Guid canonicalTeacherServiceId, DateTimeOffset now)
    {
        if (canonicalTeacherServiceId == Id)
            throw new DomainException("teacher_service_self_supersession", "A Teacher service cannot supersede itself.");
        SupersededByTeacherServiceId = canonicalTeacherServiceId;
        IsActive = false;
        UpdatedAt = now;
    }
}

public enum TeachingSampleSourceType { QualificationGenerated, TeacherShowcase }
public enum ShowcaseModerationStatus
{
    Draft,
    Submitted,
    UnderReview,
    ChangesRequested,
    Approved,
    Rejected,
    Archived
}
public enum ShowcaseDecision { Approve, RequestChanges, Reject }

public sealed class TeacherTeachingSample
{
    private readonly List<TeacherTeachingSampleVersion> _versions = [];
    private TeacherTeachingSample() { }

    // Kept for existing callers; new API code uses CreateShowcaseDraft.
    public TeacherTeachingSample(
        string teacherId, Guid subjectId, Guid? topicId, string title,
        string storageKey, int durationSeconds, DateTimeOffset now)
    {
        if (durationSeconds is < 1 or > 3600)
            throw new DomainException("invalid_sample_duration", "Sample duration is invalid.");
        Id = Guid.NewGuid();
        TeacherId = Required(teacherId, 450, "teacher");
        SubjectId = subjectId;
        TopicId = topicId;
        Title = Required(title, 200, "sample_title");
        StorageKey = Required(storageKey, 500, "storage_key");
        DurationSeconds = durationSeconds;
        SourceType = TeachingSampleSourceType.TeacherShowcase;
        ModerationStatus = ShowcaseModerationStatus.Draft;
        CreatedAt = now;
        UpdatedAt = now;
        var version = TeacherTeachingSampleVersion.CreateLegacyDraft(
            Id, TopicId, Title, StorageKey, durationSeconds, now);
        _versions.Add(version);
        CurrentVersionId = version.Id;
    }

    public Guid Id { get; private set; }
    public string TeacherId { get; private set; } = "";
    public Guid SubjectId { get; private set; }
    public Guid? TopicId { get; private set; }
    public string Title { get; private set; } = "";
    public string? StorageKey { get; private set; }
    public int? DurationSeconds { get; private set; }
    public TeachingSampleSourceType SourceType { get; private set; }
    public ShowcaseModerationStatus? ModerationStatus { get; private set; }
    public Guid? CurrentVersionId { get; private set; }
    public Guid? ApprovedVersionId { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? PublishedAt { get; private set; }
    public DateTimeOffset? ArchivedAt { get; private set; }
    public int DisplayOrder { get; private set; }
    public bool IsProfileVisible { get; private set; }
    public int ProfileDisplayOrder { get; private set; }
    public bool IsProfileFeatured { get; private set; }
    public byte[] RowVersion { get; private set; } = [];
    public bool IsPublished => PublishedAt.HasValue && ArchivedAt is null;
    public Guid? SourceTeacherApplicationId { get; private init; }
    public Guid? SourceDemoSubmissionId { get; private init; }
    public Guid? QualificationAssignmentId { get; private init; }
    public string? ApprovedByUserId { get; private init; }
    public IReadOnlyCollection<TeacherTeachingSampleVersion> Versions => _versions;

    public static TeacherTeachingSample CreateShowcaseDraft(
        string teacherId, Guid subjectId, Guid? topicId, string title, string? description,
        DateTimeOffset now)
    {
        var sample = new TeacherTeachingSample
        {
            Id = Guid.NewGuid(),
            TeacherId = Required(teacherId, 450, "teacher"),
            SubjectId = subjectId,
            TopicId = topicId,
            Title = Required(title, 200, "sample_title"),
            SourceType = TeachingSampleSourceType.TeacherShowcase,
            ModerationStatus = ShowcaseModerationStatus.Draft,
            CreatedAt = now,
            UpdatedAt = now
        };
        var version = new TeacherTeachingSampleVersion(
            sample.Id, 1, topicId, sample.Title, description, now);
        sample._versions.Add(version);
        sample.CurrentVersionId = version.Id;
        return sample;
    }

    public TeacherTeachingSampleVersion CurrentVersion() =>
        _versions.SingleOrDefault(x => x.Id == CurrentVersionId)
        ?? throw new DomainException("sample_version_not_found", "The current showcase version was not found.");

    public void UpdateDraft(Guid? topicId, string title, string? description, DateTimeOffset now)
    {
        RequireShowcase();
        var version = CurrentVersion();
        version.UpdateDraft(topicId, title, description);
        TopicId = topicId;
        Title = version.Title;
        UpdatedAt = now;
    }

    public void ChangeDraftSubject(Guid subjectId, DateTimeOffset now)
    {
        RequireShowcase();
        if (ModerationStatus != ShowcaseModerationStatus.Draft || CurrentVersion().Status != ShowcaseModerationStatus.Draft)
            throw InvalidTransition();
        SubjectId = subjectId;
        UpdatedAt = now;
    }

    public void Submit(string teacherId, DateTimeOffset now)
    {
        RequireShowcase();
        var version = CurrentVersion();
        version.Submit(teacherId, now);
        ModerationStatus = ShowcaseModerationStatus.Submitted;
        UpdatedAt = now;
    }

    public void StartReview(string reviewerId, DateTimeOffset now)
    {
        RequireShowcase();
        CurrentVersion().StartReview(reviewerId, now);
        ModerationStatus = ShowcaseModerationStatus.UnderReview;
        UpdatedAt = now;
    }

    public void Decide(
        string reviewerId, ShowcaseDecision decision, string? reasonCode,
        string? teacherVisibleNote, string? internalNote, DateTimeOffset now)
    {
        RequireShowcase();
        var version = CurrentVersion();
        version.Decide(reviewerId, decision, reasonCode, teacherVisibleNote, internalNote, now);
        ModerationStatus = version.Status;
        if (version.Status == ShowcaseModerationStatus.Approved)
        {
            ApprovedVersionId = version.Id;
            PublishedAt = now;
            ArchivedAt = null;
            IsProfileVisible = true;
        }
        UpdatedAt = now;
    }

    public TeacherTeachingSampleVersion CreateNextVersion(DateTimeOffset now)
    {
        RequireShowcase();
        if (ModerationStatus is not (ShowcaseModerationStatus.ChangesRequested
            or ShowcaseModerationStatus.Rejected or ShowcaseModerationStatus.Approved))
            throw InvalidTransition();
        var current = CurrentVersion();
        var version = current.CreateNext(_versions.Max(x => x.VersionNumber) + 1, now);
        _versions.Add(version);
        CurrentVersionId = version.Id;
        TopicId = version.TopicId;
        Title = version.Title;
        ModerationStatus = ShowcaseModerationStatus.Draft;
        UpdatedAt = now;
        return version;
    }

    public void Archive(DateTimeOffset now)
    {
        RequireShowcase();
        if (ModerationStatus != ShowcaseModerationStatus.Approved)
            throw InvalidTransition();
        ArchivedAt = now;
        PublishedAt = null;
        ApprovedVersionId = null;
        ModerationStatus = ShowcaseModerationStatus.Archived;
        UpdatedAt = now;
    }

    public void HideForQualificationRevocation(DateTimeOffset now)
    {
        if (SourceType != TeachingSampleSourceType.TeacherShowcase)
        {
            Unpublish();
            return;
        }
        ArchivedAt = now;
        PublishedAt = null;
        ApprovedVersionId = null;
        ModerationStatus = ShowcaseModerationStatus.Archived;
        UpdatedAt = now;
    }

    public void SetDisplayOrder(int displayOrder, DateTimeOffset now)
    {
        RequireShowcase();
        if (ModerationStatus != ShowcaseModerationStatus.Approved || displayOrder is < 0 or > 5)
            throw new DomainException("invalid_sample_order", "Only approved showcases can be reordered.");
        DisplayOrder = displayOrder;
        UpdatedAt = now;
    }

    public bool IsCurationEligible()
    {
        if (SourceType == TeachingSampleSourceType.QualificationGenerated)
            return PublishedAt.HasValue;
        return ModerationStatus == ShowcaseModerationStatus.Approved
            && ArchivedAt is null
            && ApprovedVersionId.HasValue
            && PublishedAt.HasValue;
    }

    public void SetProfileVisibility(bool visible, DateTimeOffset now)
    {
        EnsureCurationEligible();
        IsProfileVisible = visible;
        if (!visible)
            IsProfileFeatured = false;
        UpdatedAt = now;
    }

    public void SetProfileFeatured(bool featured, DateTimeOffset now)
    {
        EnsureCurationEligible();
        if (featured && !IsProfileVisible)
            throw new DomainException(
                "profile_video_not_visible",
                "A featured profile video must also be visible on the profile.");
        IsProfileFeatured = featured;
        UpdatedAt = now;
    }

    public void ClearProfileFeatured(DateTimeOffset now)
    {
        if (!IsProfileFeatured) return;
        IsProfileFeatured = false;
        UpdatedAt = now;
    }

    public void SetProfileDisplayOrder(int order, DateTimeOffset now)
    {
        if (order < 0)
            throw new DomainException("invalid_profile_video_order", "Profile display order must be zero or greater.");
        ProfileDisplayOrder = order;
        UpdatedAt = now;
    }

    public void Publish(DateTimeOffset now)
    {
        if (SourceType != TeachingSampleSourceType.QualificationGenerated)
            throw new DomainException("direct_sample_publication_forbidden", "Teacher Showcases require Quality approval.");
        PublishedAt ??= now;
        IsProfileVisible = true;
    }

    public void Unpublish() => PublishedAt = null;

    public static TeacherTeachingSample FromQualificationDemo(
        string teacherId, Guid subjectId, string title, string storageKey, int durationSeconds,
        Guid applicationId, Guid demoSubmissionId, Guid assignmentId, string approvedByUserId,
        DateTimeOffset now)
    {
        if (durationSeconds is < 1 or > 3600)
            throw new DomainException("invalid_sample_duration", "Sample duration is invalid.");
        var sample = new TeacherTeachingSample
        {
            Id = Guid.NewGuid(),
            TeacherId = Required(teacherId, 450, "teacher"),
            SubjectId = subjectId,
            Title = Required(title, 200, "sample_title"),
            StorageKey = Required(storageKey, 500, "storage_key"),
            DurationSeconds = durationSeconds,
            SourceType = TeachingSampleSourceType.QualificationGenerated,
            SourceTeacherApplicationId = applicationId,
            SourceDemoSubmissionId = demoSubmissionId,
            QualificationAssignmentId = assignmentId,
            ApprovedByUserId = Required(approvedByUserId, 450, "approver"),
            CreatedAt = now,
            UpdatedAt = now
        };
        sample.Publish(now);
        return sample;
    }

    private void EnsureCurationEligible()
    {
        if (!IsCurationEligible())
            throw new DomainException(
                "profile_video_not_eligible",
                "Only approved, eligible teaching videos can be curated on the profile.");
    }

    private void RequireShowcase()
    {
        if (SourceType != TeachingSampleSourceType.TeacherShowcase)
            throw new DomainException("qualification_sample_locked", "Qualification Samples cannot enter Showcase moderation.");
        if (ArchivedAt.HasValue)
            throw new DomainException("sample_archived", "The Showcase is archived.");
    }

    private static DomainException InvalidTransition() =>
        new("invalid_sample_transition", "The Showcase is not in the required state.");

    private static string Required(string? value, int maximum, string field)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 || value.Length > maximum)
            throw new DomainException($"invalid_{field}", $"{field} is required and must not exceed {maximum} characters.");
        return value;
    }
}

public sealed class TeacherTeachingSampleVersion
{
    private static readonly HashSet<string> ReasonCodes =
    [
        "copyright_or_ownership",
        "unsafe_or_inappropriate",
        "unrelated_to_subject",
        "misleading_claim",
        "privacy_or_personal_data",
        "unplayable_or_low_media_quality",
        "policy_other"
    ];

    private TeacherTeachingSampleVersion() { }
    internal TeacherTeachingSampleVersion(
        Guid sampleId, int versionNumber, Guid? topicId, string title,
        string? description, DateTimeOffset now)
    {
        Id = Guid.NewGuid();
        TeacherTeachingSampleId = sampleId;
        VersionNumber = versionNumber;
        UpdateDraft(topicId, title, description);
        Status = ShowcaseModerationStatus.Draft;
        CreatedAt = now;
    }

    public Guid Id { get; private set; }
    public Guid TeacherTeachingSampleId { get; private set; }
    public int VersionNumber { get; private set; }
    public Guid? TopicId { get; private set; }
    public string Title { get; private set; } = "";
    public string Description { get; private set; } = "";
    public string? StorageKey { get; private set; }
    public string? OriginalFileName { get; private set; }
    public string? ContentType { get; private set; }
    public long? FileSize { get; private set; }
    public int? DurationSeconds { get; private set; }
    public ShowcaseModerationStatus Status { get; private set; }
    public string? SubmittedByUserId { get; private set; }
    public DateTimeOffset? SubmittedAt { get; private set; }
    public string? AssignedReviewerId { get; private set; }
    public DateTimeOffset? ReviewStartedAt { get; private set; }
    public string? DecidedByUserId { get; private set; }
    public DateTimeOffset? DecidedAt { get; private set; }
    public string? DecisionReasonCode { get; private set; }
    public string? TeacherVisibleNote { get; private set; }
    public string? InternalNote { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];

    public void UpdateDraft(Guid? topicId, string title, string? description)
    {
        RequireDraft();
        title = title?.Trim() ?? "";
        description = description?.Trim() ?? "";
        if (title.Length is 0 or > 200)
            throw new DomainException("invalid_sample_title", "A Showcase title is required and must not exceed 200 characters.");
        if (description.Length > 2000)
            throw new DomainException("invalid_sample_description", "A Showcase description must not exceed 2000 characters.");
        TopicId = topicId;
        Title = title;
        Description = description;
    }

    public void ReplaceVideo(string storageKey, string originalFileName, string contentType, long fileSize)
    {
        RequireDraft();
        StorageKey = Required(storageKey, 500, "storage_key");
        OriginalFileName = Required(Path.GetFileName(originalFileName), 255, "file_name");
        if (!string.Equals(contentType, "video/mp4", StringComparison.OrdinalIgnoreCase))
            throw new DomainException("unsupported_media_type", "Only MP4 Showcase videos are supported.");
        if (fileSize <= 0)
            throw new DomainException("invalid_file_size", "The Showcase video cannot be empty.");
        ContentType = "video/mp4";
        FileSize = fileSize;
        DurationSeconds = null;
    }

    public void Submit(string submittedByUserId, DateTimeOffset now)
    {
        RequireDraft();
        if (StorageKey is null || OriginalFileName is null || ContentType is null || FileSize is null)
            throw new DomainException("sample_media_required", "Upload an MP4 video before submitting the Showcase.");
        Status = ShowcaseModerationStatus.Submitted;
        SubmittedByUserId = Required(submittedByUserId, 450, "submitter");
        SubmittedAt = now;
    }

    public void StartReview(string reviewerId, DateTimeOffset now)
    {
        if (Status != ShowcaseModerationStatus.Submitted)
            throw new DomainException("invalid_sample_transition", "Only a submitted Showcase can enter review.");
        Status = ShowcaseModerationStatus.UnderReview;
        AssignedReviewerId = Required(reviewerId, 450, "reviewer");
        ReviewStartedAt = now;
    }

    public void Decide(
        string reviewerId, ShowcaseDecision decision, string? reasonCode,
        string? teacherVisibleNote, string? internalNote, DateTimeOffset now)
    {
        if (Status != ShowcaseModerationStatus.UnderReview
            || !string.Equals(AssignedReviewerId, reviewerId, StringComparison.Ordinal))
            throw new DomainException("review_ownership_conflict", "Only the assigned reviewer can decide this Showcase.");
        teacherVisibleNote = teacherVisibleNote?.Trim();
        internalNote = internalNote?.Trim();
        if (teacherVisibleNote?.Length > 2000 || internalNote?.Length > 2000)
            throw new DomainException("invalid_review_note", "Review notes must not exceed 2000 characters.");
        if (decision is ShowcaseDecision.Reject or ShowcaseDecision.RequestChanges)
        {
            reasonCode = reasonCode?.Trim().ToLowerInvariant();
            if (reasonCode is null || !ReasonCodes.Contains(reasonCode))
                throw new DomainException("invalid_moderation_reason", "A supported moderation reason is required.");
            if (string.IsNullOrWhiteSpace(teacherVisibleNote))
                throw new DomainException("review_note_required", "Teacher-visible feedback is required.");
        }
        else reasonCode = null;
        Status = decision switch
        {
            ShowcaseDecision.Approve => ShowcaseModerationStatus.Approved,
            ShowcaseDecision.RequestChanges => ShowcaseModerationStatus.ChangesRequested,
            ShowcaseDecision.Reject => ShowcaseModerationStatus.Rejected,
            _ => throw new DomainException("invalid_moderation_decision", "The moderation decision is invalid.")
        };
        DecisionReasonCode = reasonCode;
        TeacherVisibleNote = teacherVisibleNote;
        InternalNote = internalNote;
        DecidedByUserId = reviewerId;
        DecidedAt = now;
    }

    internal TeacherTeachingSampleVersion CreateNext(int versionNumber, DateTimeOffset now)
    {
        var version = new TeacherTeachingSampleVersion(
            TeacherTeachingSampleId, versionNumber, TopicId, Title, Description, now);
        version.StorageKey = StorageKey;
        version.OriginalFileName = OriginalFileName;
        version.ContentType = ContentType;
        version.FileSize = FileSize;
        version.DurationSeconds = DurationSeconds;
        return version;
    }

    internal static TeacherTeachingSampleVersion CreateLegacyDraft(
        Guid sampleId, Guid? topicId, string title, string storageKey,
        int durationSeconds, DateTimeOffset now)
    {
        var version = new TeacherTeachingSampleVersion(sampleId, 1, topicId, title, null, now)
        {
            StorageKey = storageKey,
            OriginalFileName = "legacy-sample.mp4",
            ContentType = "video/mp4",
            DurationSeconds = durationSeconds
        };
        return version;
    }

    private void RequireDraft()
    {
        if (Status != ShowcaseModerationStatus.Draft)
            throw new DomainException("draft_required", "Only a Draft Showcase version can be changed.");
    }

    private static string Required(string? value, int maximum, string field)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 || value.Length > maximum)
            throw new DomainException($"invalid_{field}", $"{field} is required and must not exceed {maximum} characters.");
        return value;
    }
}

public sealed class TeacherAvailabilityRule
{
    private TeacherAvailabilityRule() { }
    public TeacherAvailabilityRule(string teacherId, DayOfWeek dayOfWeek, TimeOnly start, TimeOnly end, string timeZoneId, int? slotMinutes)
    {
        try { TimeZoneInfo.FindSystemTimeZoneById(timeZoneId); }
        catch (TimeZoneNotFoundException)
        {
            throw new DomainException("invalid_time_zone", "The requested time zone is not supported.");
        }
        catch (InvalidTimeZoneException)
        {
            throw new DomainException("invalid_time_zone", "The requested time zone is not supported.");
        }
        if (end <= start || slotMinutes is < 15 or > 240)
            throw new DomainException("invalid_availability", "Availability range or slot duration is invalid.");
        Id = Guid.NewGuid();
        TeacherId = teacherId;
        DayOfWeek = dayOfWeek;
        Start = start;
        End = end;
        TimeZoneId = timeZoneId;
        SlotMinutes = slotMinutes;
    }
    public Guid Id { get; private set; }
    public string TeacherId { get; private set; } = "";
    public DayOfWeek DayOfWeek { get; private set; }
    public TimeOnly Start { get; private set; }
    public TimeOnly End { get; private set; }
    public string TimeZoneId { get; private set; } = "";
    public int? SlotMinutes { get; private set; }
}

public sealed class TeacherAvailabilityException
{
    private TeacherAvailabilityException() { }
    public TeacherAvailabilityException(string teacherId, DateTimeOffset startsAt, DateTimeOffset endsAt, string reason)
    {
        if (endsAt <= startsAt)
            throw new DomainException("invalid_availability_exception", "Exception end must follow its start.");
        Id = Guid.NewGuid();
        TeacherId = teacherId;
        StartsAt = startsAt;
        EndsAt = endsAt;
        Reason = reason?.Trim() ?? "";
    }
    public Guid Id { get; private set; }
    public string TeacherId { get; private set; } = "";
    public DateTimeOffset StartsAt { get; private set; }
    public DateTimeOffset EndsAt { get; private set; }
    public string Reason { get; private set; } = "";
}

public abstract class TeacherCredential
{
    protected TeacherCredential() { }
    protected TeacherCredential(string teacherId, string title, string organization, DateOnly? from, DateOnly? to)
    {
        Id = Guid.NewGuid();
        TeacherId = teacherId;
        Title = title.Trim();
        Organization = organization.Trim();
        From = from;
        To = to;
        if (Title.Length is 0 or > 200 || Organization.Length is 0 or > 200 || to < from)
            throw new DomainException("invalid_teacher_credential", "Teacher credential is invalid.");
    }
    public Guid Id { get; private set; }
    public string TeacherId { get; private set; } = "";
    public string Title { get; private set; } = "";
    public string Organization { get; private set; } = "";
    public DateOnly? From { get; private set; }
    public DateOnly? To { get; private set; }
}

public sealed class TeacherCertification : TeacherCredential
{
    private TeacherCertification() { }
    public TeacherCertification(string teacherId, string title, string organization, DateOnly? issued, DateOnly? expires)
        : base(teacherId, title, organization, issued, expires) { }
}

public sealed class TeacherExperience : TeacherCredential
{
    private TeacherExperience() { }
    public TeacherExperience(string teacherId, string title, string organization, DateOnly? from, DateOnly? to)
        : base(teacherId, title, organization, from, to) { }
}

public sealed class FavoriteTeacher
{
    private FavoriteTeacher() { }
    public FavoriteTeacher(string studentId, string teacherId, DateTimeOffset createdAt)
    {
        StudentId = studentId;
        TeacherId = teacherId;
        CreatedAt = createdAt;
    }
    public string StudentId { get; private set; } = "";
    public string TeacherId { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}
