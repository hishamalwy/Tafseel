using System.Text;
using System.Text.RegularExpressions;
using Tafseel.Domain.Common;

namespace Tafseel.Domain.Catalog;

public static class CatalogNameNormalizer
{
    public static string Display(string value) =>
        string.Join(' ', value.Normalize(NormalizationForm.FormC)
            .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    public static string Key(string value) => Display(value).ToUpperInvariant();
}

public abstract class CatalogItem
{
    protected CatalogItem() { }

    protected CatalogItem(string name, string nameAr = "")
    {
        Id = Guid.NewGuid();
        Rename(name, nameAr);
    }

    public Guid Id { get; private init; }
    public string Name { get; private set; } = "";
    public string NameAr { get; private set; } = "";
    public string NormalizedName { get; private set; } = "";
    public bool IsActive { get; private set; } = true;

    public void Rename(string name, string? nameAr = null)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new DomainException("catalog_name_required", "Name is required.");
        Name = CatalogNameNormalizer.Display(name);
        NormalizedName = CatalogNameNormalizer.Key(name);
        if (nameAr is not null) NameAr = CatalogNameNormalizer.Display(nameAr);
    }

    public virtual void SetActive(bool active) => IsActive = active;
}

public sealed class Subject : CatalogItem
{
    private Subject() { }
    public Subject(string name, string icon, string nameAr = "", int displayOrder = 0) : base(name, nameAr)
    {
        Icon = icon.Trim();
        SetDisplayOrder(displayOrder);
    }
    public string Icon { get; private set; } = "";
    public int DisplayOrder { get; private set; }
    public void Update(string name, string icon, string? nameAr = null, int? displayOrder = null)
    {
        Rename(name, nameAr);
        Icon = icon.Trim();
        if (displayOrder.HasValue) SetDisplayOrder(displayOrder.Value);
    }

    private void SetDisplayOrder(int displayOrder)
    {
        if (displayOrder is < 0 or > 10000)
            throw new DomainException("invalid_subject_display_order", "Subject display order is invalid.");
        DisplayOrder = displayOrder;
    }
}

public sealed class Topic : CatalogItem
{
    private Topic() { }
    public Topic(Guid subjectId, string name, string difficulty) : base(name)
    {
        SubjectId = subjectId;
        Difficulty = difficulty.Trim();
    }
    public Guid SubjectId { get; private init; }
    public string Difficulty { get; private set; } = "";
    public void Update(string name, string difficulty) { Rename(name); Difficulty = difficulty.Trim(); }
}

public sealed class QualificationTopic : CatalogItem
{
    private QualificationTopic() { }
    public QualificationTopic(Guid subjectId, string name, string instructions, int maxVideoSeconds) : base(name)
    {
        if (maxVideoSeconds is < 30 or > 600)
            throw new DomainException("invalid_video_duration", "Video duration must be between 30 and 600 seconds.");
        SubjectId = subjectId;
        Instructions = instructions.Trim();
        ExpectedVideoSeconds = maxVideoSeconds;
        MinVideoSeconds = 30;
        MaxVideoSeconds = maxVideoSeconds;
    }
    public Guid SubjectId { get; private init; }
    public string Instructions { get; private set; } = "";
    public string TitleAr { get; private set; } = "";
    public string InstructionsAr { get; private set; } = "";
    public int ExpectedVideoSeconds { get; private set; }
    public int MinVideoSeconds { get; private set; }
    public int MaxVideoSeconds { get; private set; }
    public string EvaluationGuidance { get; private set; } = "";
    public string EvaluationGuidanceAr { get; private set; } = "";
    public int DisplayOrder { get; private set; }
    public byte[] RowVersion { get; private set; } = [];
    public void Update(string name, string instructions, int maxVideoSeconds)
    {
        if (maxVideoSeconds is < 30 or > 600)
            throw new DomainException("invalid_video_duration", "Video duration must be between 30 and 600 seconds.");
        Rename(name);
        Instructions = instructions.Trim();
        MaxVideoSeconds = maxVideoSeconds;
        ExpectedVideoSeconds = Math.Min(ExpectedVideoSeconds == 0 ? maxVideoSeconds : ExpectedVideoSeconds, maxVideoSeconds);
    }

    public void Configure(
        string name, string titleAr, string instructions, string instructionsAr,
        int expectedSeconds, int minimumSeconds, int maximumSeconds,
        string evaluationGuidance, string evaluationGuidanceAr, int displayOrder)
    {
        if (minimumSeconds < 30 || maximumSeconds > 600
            || minimumSeconds > expectedSeconds || expectedSeconds > maximumSeconds)
            throw new DomainException("invalid_video_duration", "Assignment duration limits are invalid.");
        Rename(name, titleAr);
        TitleAr = titleAr?.Trim() ?? "";
        Instructions = instructions?.Trim() ?? "";
        InstructionsAr = instructionsAr?.Trim() ?? "";
        ExpectedVideoSeconds = expectedSeconds;
        MinVideoSeconds = minimumSeconds;
        MaxVideoSeconds = maximumSeconds;
        EvaluationGuidance = evaluationGuidance?.Trim() ?? "";
        EvaluationGuidanceAr = evaluationGuidanceAr?.Trim() ?? "";
        DisplayOrder = displayOrder;
    }
}

public enum QualificationResourceType { File, Link }

public sealed class QualificationAssignmentResource
{
    private QualificationAssignmentResource() { }
    public QualificationAssignmentResource(
        Guid assignmentId, QualificationResourceType type, string displayName, string displayNameAr,
        string originalFileName, string storageKey, string contentType, long sizeBytes,
        string? url, int displayOrder, bool isRequired, DateTimeOffset now)
    {
        Id = Guid.NewGuid();
        QualificationAssignmentId = assignmentId;
        ResourceType = type;
        DisplayName = displayName.Trim();
        DisplayNameAr = displayNameAr?.Trim() ?? "";
        OriginalFileName = originalFileName;
        StorageKey = storageKey;
        ContentType = contentType;
        SizeBytes = sizeBytes;
        Url = url;
        DisplayOrder = displayOrder;
        IsRequired = isRequired;
        CreatedAt = now;
    }
    public Guid Id { get; private init; }
    public Guid QualificationAssignmentId { get; private init; }
    public QualificationResourceType ResourceType { get; private init; }
    public string DisplayName { get; private init; } = "";
    public string DisplayNameAr { get; private init; } = "";
    public string OriginalFileName { get; private init; } = "";
    public string StorageKey { get; private init; } = "";
    public string ContentType { get; private init; } = "";
    public long SizeBytes { get; private init; }
    public string? Url { get; private init; }
    public int DisplayOrder { get; private init; }
    public bool IsRequired { get; private init; }
    public DateTimeOffset CreatedAt { get; private init; }
}

public sealed class EducationLevel : CatalogItem
{
    private EducationLevel() { }
    public EducationLevel(string name) : base(name) { }
}

public sealed class TeachingLanguage : CatalogItem
{
    private TeachingLanguage() { }
    public TeachingLanguage(string name, string code) : base(name) => SetCode(code);
    public string Code { get; private set; } = "";
    public void Update(string name, string code) { Rename(name); SetCode(code); }
    private void SetCode(string code)
    {
        if (string.IsNullOrWhiteSpace(code))
            throw new DomainException("language_code_required", "Language code is required.");
        Code = code.Trim().ToLowerInvariant();
    }
}

public static class ServiceCategoryCodes
{
    public const string RecordedExplanation = "recorded_explanation";
    public const string AcademicSupport = "academic_support";
    public const string LiveLearning = "live_learning";
    public const string RevisionExamPreparation = "revision_exam_preparation";
    public const string StudyMaterials = "study_materials";
    public const string ProjectGuidance = "project_guidance";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        RecordedExplanation, AcademicSupport, LiveLearning,
        RevisionExamPreparation, StudyMaterials, ProjectGuidance
    };

    public static string FromServiceCode(string code) => code switch
    {
        "recorded_explanation" => RecordedExplanation,
        "assignment_guidance" => AcademicSupport,
        "exam_revision" => RevisionExamPreparation,
        "live_session" => LiveLearning,
        _ => AcademicSupport
    };
}

public static class ServiceIconCodes
{
    public const string Video = "video";
    public const string AcademicSupport = "academic_support";
    public const string Live = "live";
    public const string Exam = "exam";
    public const string Notes = "notes";
    public const string Project = "project";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
        { Video, AcademicSupport, Live, Exam, Notes, Project };

    public static string FromCategory(string category) => category switch
    {
        ServiceCategoryCodes.RecordedExplanation => Video,
        ServiceCategoryCodes.LiveLearning => Live,
        ServiceCategoryCodes.RevisionExamPreparation => Exam,
        ServiceCategoryCodes.StudyMaterials => Notes,
        ServiceCategoryCodes.ProjectGuidance => Project,
        _ => AcademicSupport
    };
}

public static class ServiceOrderTypes
{
    public const string AsyncRequest = "async_request";
    public const string LiveSession = "live_session";
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
        { AsyncRequest, LiveSession };
}

public static class ServiceQualificationPolicies
{
    public const string SubjectQualificationRequired = "subject_qualification_required";
    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
        { SubjectQualificationRequired };
}

public sealed class ServiceCatalogItem : CatalogItem
{
    private static readonly int[] SupportedLiveDurations = [30, 60, 90, 120];
    private ServiceCatalogItem() { }
    public ServiceCatalogItem(
        string nameEn,
        string descriptionEn,
        string code,
        string nameAr,
        string descriptionAr,
        string? type = null,
        bool isPublic = true,
        bool teacherSelectable = true,
        bool requiresScheduling = false,
        IReadOnlyCollection<int>? allowedDurations = null,
        decimal? minPrice = null,
        decimal? maxPrice = null,
        int displayOrder = 0,
        string? categoryCode = null,
        string? iconCode = null,
        string? orderType = null,
        string qualificationPolicy = ServiceQualificationPolicies.SubjectQualificationRequired,
        string currencyCode = "SAR",
        decimal? defaultPrice = null,
        decimal? recommendedPrice = null,
        int? minimumDeliveryHours = null,
        int? defaultDeliveryHours = null,
        int? recommendedDeliveryHours = null,
        int? maximumDeliveryHours = null,
        int? defaultRevisions = null,
        int? maximumRevisions = null) : base(nameEn, nameAr)
    {
        if (string.IsNullOrWhiteSpace(nameAr))
            throw new DomainException("service_name_ar_required", "Arabic service name is required.");
        Description = RequiredLocalized(descriptionEn, "service_description_en_required");
        DescriptionAr = RequiredLocalized(descriptionAr, "service_description_ar_required");
        SetCode(code);
        var resolvedOrderType = NormalizeOptional(orderType)
            ?? (requiresScheduling || Code == ServiceOrderTypes.LiveSession
                ? ServiceOrderTypes.LiveSession
                : ServiceOrderTypes.AsyncRequest);
        var resolvedCategory = NormalizeOptional(categoryCode) ?? ServiceCategoryCodes.FromServiceCode(Code);
        var resolvedMinimum = minPrice ?? (resolvedOrderType == ServiceOrderTypes.LiveSession ? 30m : 0.01m);
        var resolvedMaximum = maxPrice ?? 1_000_000m;
        var resolvedDefault = defaultPrice ?? Math.Clamp(120m, resolvedMinimum, resolvedMaximum);
        ConfigurePolicy(
            resolvedCategory,
            NormalizeOptional(iconCode) ?? ServiceIconCodes.FromCategory(resolvedCategory),
            resolvedOrderType,
            qualificationPolicy,
            currencyCode,
            resolvedMinimum,
            resolvedDefault,
            recommendedPrice ?? resolvedDefault,
            resolvedMaximum,
            resolvedOrderType == ServiceOrderTypes.AsyncRequest ? minimumDeliveryHours ?? 1 : null,
            resolvedOrderType == ServiceOrderTypes.AsyncRequest ? defaultDeliveryHours ?? 48 : null,
            resolvedOrderType == ServiceOrderTypes.AsyncRequest ? recommendedDeliveryHours ?? 48 : null,
            resolvedOrderType == ServiceOrderTypes.AsyncRequest ? maximumDeliveryHours ?? 8760 : null,
            defaultRevisions ?? (resolvedOrderType == ServiceOrderTypes.LiveSession ? 0 : 2),
            maximumRevisions ?? (resolvedOrderType == ServiceOrderTypes.LiveSession ? 0 : 20),
            isPublic,
            teacherSelectable,
            allowedDurations,
            displayOrder,
            hasReferences: false,
            compatibilityType: type);
        if (IsActive) EnsureCompleteLocalization();
    }

    public static string CodeFromEnglishName(string nameEn) => NormalizeCode(nameEn);
    public string Description { get; private set; } = "";
    public string DescriptionAr { get; private set; } = "";
    public string Code { get; private set; } = "";
    public string Type { get; private set; } = "";
    public string CategoryCode { get; private set; } = "";
    public string IconCode { get; private set; } = "";
    public string OrderType { get; private set; } = "";
    public string QualificationPolicy { get; private set; } = "";
    public string CurrencyCode { get; private set; } = "SAR";
    public bool IsPublic { get; private set; } = true;
    public bool TeacherSelectable { get; private set; } = true;
    public bool RequiresScheduling { get; private set; }
    public string AllowedDurationsCsv { get; private set; } = "";
    public decimal? MinPrice { get; private set; }
    public decimal? MaxPrice { get; private set; }
    public decimal DefaultPrice { get; private set; }
    public decimal RecommendedPrice { get; private set; }
    public int? MinimumDeliveryHours { get; private set; }
    public int? DefaultDeliveryHours { get; private set; }
    public int? RecommendedDeliveryHours { get; private set; }
    public int? MaximumDeliveryHours { get; private set; }
    public int DefaultRevisions { get; private set; }
    public int MaximumRevisions { get; private set; }
    public int DisplayOrder { get; private set; }
    public IReadOnlyCollection<int> AllowedDurations =>
        string.IsNullOrWhiteSpace(AllowedDurationsCsv)
            ? []
            : AllowedDurationsCsv.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(int.Parse).ToArray();

    public override void SetActive(bool active)
    {
        if (active) EnsurePolicyComplete();
        base.SetActive(active);
    }

    public void ConfigureLocalizedContent(
        string nameEn,
        string nameAr,
        string descriptionEn,
        string descriptionAr,
        int displayOrder,
        bool? isActive = null)
    {
        if (string.IsNullOrWhiteSpace(nameAr))
            throw new DomainException("service_name_ar_required", "Arabic service name is required.");
        Rename(nameEn, nameAr);
        Description = RequiredLocalized(descriptionEn, "service_description_en_required");
        DescriptionAr = RequiredLocalized(descriptionAr, "service_description_ar_required");
        if (displayOrder is < 0 or > 10000)
            throw new DomainException("invalid_service_display_order", "Service display order is invalid.");
        DisplayOrder = displayOrder;
        if (isActive.HasValue)
        {
            if (isActive.Value) EnsureCompleteLocalization();
            SetActive(isActive.Value);
        }
        else if (IsActive)
            EnsureCompleteLocalization();
    }

    public void BackfillLocalization(string? nameAr, string? descriptionAr)
    {
        if (!string.IsNullOrWhiteSpace(nameAr) && string.IsNullOrWhiteSpace(NameAr))
            Rename(Name, nameAr);
        if (!string.IsNullOrWhiteSpace(descriptionAr) && string.IsNullOrWhiteSpace(DescriptionAr))
            DescriptionAr = descriptionAr.Trim();
    }

    public void EnsureCompleteLocalization()
    {
        if (string.IsNullOrWhiteSpace(Name)
            || string.IsNullOrWhiteSpace(NameAr)
            || string.IsNullOrWhiteSpace(Description)
            || string.IsNullOrWhiteSpace(DescriptionAr))
            throw new DomainException(
                "service_localization_incomplete",
                "Active services require English and Arabic names and descriptions.");
    }

    public void EnsurePolicyComplete()
    {
        EnsureCompleteLocalization();
        ValidatePolicy(
            CategoryCode, IconCode, OrderType, QualificationPolicy, CurrencyCode,
            MinPrice, DefaultPrice, RecommendedPrice, MaxPrice,
            MinimumDeliveryHours, DefaultDeliveryHours, RecommendedDeliveryHours, MaximumDeliveryHours,
            DefaultRevisions, MaximumRevisions, AllowedDurations);
    }

    public void ConfigurePolicy(
        string categoryCode,
        string iconCode,
        string orderType,
        string qualificationPolicy,
        string currencyCode,
        decimal minimumPrice,
        decimal defaultPrice,
        decimal recommendedPrice,
        decimal maximumPrice,
        int? minimumDeliveryHours,
        int? defaultDeliveryHours,
        int? recommendedDeliveryHours,
        int? maximumDeliveryHours,
        int defaultRevisions,
        int maximumRevisions,
        bool isPublic,
        bool teacherSelectable,
        IReadOnlyCollection<int>? allowedDurations,
        int displayOrder,
        bool hasReferences,
        string? compatibilityType = null)
    {
        categoryCode = NormalizeRequired(categoryCode, "invalid_service_category");
        iconCode = NormalizeRequired(iconCode, "invalid_service_icon");
        orderType = NormalizeRequired(orderType, "invalid_service_order_type");
        qualificationPolicy = NormalizeRequired(qualificationPolicy, "invalid_service_qualification_policy");
        currencyCode = (currencyCode ?? "").Trim().ToUpperInvariant();
        var durations = NormalizeDurations(allowedDurations, orderType == ServiceOrderTypes.LiveSession);

        if (hasReferences && OrderType.Length > 0 && !string.Equals(OrderType, orderType, StringComparison.Ordinal))
            throw new DomainException("service_order_type_immutable", "Service order type cannot change after the service is referenced.");
        if (hasReferences && QualificationPolicy.Length > 0
            && !string.Equals(QualificationPolicy, qualificationPolicy, StringComparison.Ordinal))
            throw new DomainException("service_qualification_policy_immutable", "Service qualification policy cannot change after the service is referenced.");

        ValidatePolicy(
            categoryCode, iconCode, orderType, qualificationPolicy, currencyCode,
            minimumPrice, defaultPrice, recommendedPrice, maximumPrice,
            minimumDeliveryHours, defaultDeliveryHours, recommendedDeliveryHours, maximumDeliveryHours,
            defaultRevisions, maximumRevisions, durations);
        if (displayOrder is < 0 or > 10000)
            throw new DomainException("invalid_service_display_order", "Service display order is invalid.");

        CategoryCode = categoryCode;
        IconCode = iconCode;
        OrderType = orderType;
        QualificationPolicy = qualificationPolicy;
        CurrencyCode = currencyCode;
        MinPrice = minimumPrice;
        DefaultPrice = defaultPrice;
        RecommendedPrice = recommendedPrice;
        MaxPrice = maximumPrice;
        MinimumDeliveryHours = minimumDeliveryHours;
        DefaultDeliveryHours = defaultDeliveryHours;
        RecommendedDeliveryHours = recommendedDeliveryHours;
        MaximumDeliveryHours = maximumDeliveryHours;
        DefaultRevisions = defaultRevisions;
        MaximumRevisions = maximumRevisions;
        IsPublic = isPublic;
        TeacherSelectable = teacherSelectable;
        RequiresScheduling = orderType == ServiceOrderTypes.LiveSession;
        AllowedDurationsCsv = durations.Length == 0 ? "" : string.Join(',', durations);
        DisplayOrder = displayOrder;
        Type = string.IsNullOrWhiteSpace(compatibilityType) ? Code : compatibilityType.Trim().ToLowerInvariant();
        if (Type.Length is 0 or > 50)
            throw new DomainException("invalid_service_type", "Service type is invalid.");
    }

    public void Update(
        string name,
        string description,
        string code,
        string? type,
        bool isPublic,
        bool teacherSelectable,
        bool requiresScheduling,
        IReadOnlyCollection<int>? allowedDurations,
        decimal? minPrice,
        decimal? maxPrice,
        int displayOrder,
        string? nameAr = null,
        string? descriptionAr = null)
    {
        Rename(name, nameAr);
        Description = RequiredLocalized(description, "service_description_en_required");
        if (descriptionAr is not null)
            DescriptionAr = RequiredLocalized(descriptionAr, "service_description_ar_required");
        var normalized = NormalizeCode(code);
        if (!string.Equals(Code, normalized, StringComparison.Ordinal))
            throw new DomainException("service_code_immutable", "Service code cannot be changed after creation.");
        var nextOrderType = requiresScheduling ? ServiceOrderTypes.LiveSession : OrderType;
        var minimum = minPrice ?? MinPrice ?? 0.01m;
        var maximum = maxPrice ?? MaxPrice ?? 1_000_000m;
        ConfigurePolicy(
            CategoryCode, IconCode, nextOrderType, QualificationPolicy, CurrencyCode,
            minimum, Math.Clamp(DefaultPrice, minimum, maximum), Math.Clamp(RecommendedPrice, minimum, maximum), maximum,
            nextOrderType == ServiceOrderTypes.AsyncRequest ? MinimumDeliveryHours ?? 1 : null,
            nextOrderType == ServiceOrderTypes.AsyncRequest ? DefaultDeliveryHours ?? 48 : null,
            nextOrderType == ServiceOrderTypes.AsyncRequest ? RecommendedDeliveryHours ?? 48 : null,
            nextOrderType == ServiceOrderTypes.AsyncRequest ? MaximumDeliveryHours ?? 8760 : null,
            nextOrderType == ServiceOrderTypes.LiveSession ? 0 : DefaultRevisions,
            nextOrderType == ServiceOrderTypes.LiveSession ? 0 : MaximumRevisions,
            isPublic, teacherSelectable, allowedDurations, displayOrder, hasReferences: false, compatibilityType: type);
        if (IsActive) EnsureCompleteLocalization();
    }

    private static string RequiredLocalized(string value, string code) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new DomainException(code, "Localized service text is required.")
            : value.Trim();

    private void SetCode(string code) => Code = NormalizeCode(code);

    public static string NormalizeCode(string code)
    {
        if (string.IsNullOrWhiteSpace(code))
            throw new DomainException("service_code_required", "Service code is required.");

        var builder = new StringBuilder(code.Length);
        var previousUnderscore = false;
        foreach (var ch in code.Trim().ToLowerInvariant())
        {
            if (ch is >= 'a' and <= 'z' or >= '0' and <= '9')
            {
                builder.Append(ch);
                previousUnderscore = false;
            }
            else if (ch is '_' or '-' or ' ' or '\t')
            {
                if (builder.Length == 0 || previousUnderscore) continue;
                builder.Append('_');
                previousUnderscore = true;
            }
            else
                throw new DomainException("invalid_service_code", "Service code must be lowercase snake_case.");
        }

        var normalized = builder.ToString().Trim('_');
        if (normalized.Length is 0 or > 50 || !ServiceCodePattern.IsMatch(normalized))
            throw new DomainException("invalid_service_code", "Service code must be lowercase snake_case.");
        return normalized;
    }

    private static readonly Regex ServiceCodePattern = new(
        "^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$", RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public bool SupportsDuration(int minutes) =>
        !RequiresScheduling || AllowedDurations.Count == 0 || AllowedDurations.Contains(minutes);

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();

    private static string NormalizeRequired(string? value, string code) =>
        NormalizeOptional(value) ?? throw new DomainException(code, "A required service policy code is missing.");

    private static void ValidatePolicy(
        string categoryCode,
        string iconCode,
        string orderType,
        string qualificationPolicy,
        string currencyCode,
        decimal? minimumPrice,
        decimal defaultPrice,
        decimal recommendedPrice,
        decimal? maximumPrice,
        int? minimumDeliveryHours,
        int? defaultDeliveryHours,
        int? recommendedDeliveryHours,
        int? maximumDeliveryHours,
        int defaultRevisions,
        int maximumRevisions,
        IReadOnlyCollection<int> allowedDurations)
    {
        if (!ServiceCategoryCodes.All.Contains(categoryCode))
            throw new DomainException("invalid_service_category", "Service category is not supported.");
        if (!ServiceIconCodes.All.Contains(iconCode))
            throw new DomainException("invalid_service_icon", "Service icon is not supported.");
        if (!ServiceOrderTypes.All.Contains(orderType))
            throw new DomainException("invalid_service_order_type", "Service order type is not supported.");
        if (!ServiceQualificationPolicies.All.Contains(qualificationPolicy))
            throw new DomainException("invalid_service_qualification_policy", "Service qualification policy is not supported.");
        if (!string.Equals(currencyCode, "SAR", StringComparison.Ordinal))
            throw new DomainException("unsupported_service_currency", "Only SAR service policy is supported.");
        if (minimumPrice is null || maximumPrice is null || minimumPrice <= 0
            || minimumPrice > defaultPrice || defaultPrice > maximumPrice
            || minimumPrice > recommendedPrice || recommendedPrice > maximumPrice)
            throw new DomainException("invalid_service_price_policy", "Service prices must satisfy minimum <= default/recommended <= maximum.");
        if (defaultRevisions is < 0 or > 20 || maximumRevisions is < 0 or > 20
            || defaultRevisions > maximumRevisions)
            throw new DomainException("invalid_service_revision_policy", "Service revisions must satisfy 0 <= default <= maximum <= 20.");

        if (orderType == ServiceOrderTypes.LiveSession)
        {
            if (minimumDeliveryHours.HasValue || defaultDeliveryHours.HasValue
                || recommendedDeliveryHours.HasValue || maximumDeliveryHours.HasValue)
                throw new DomainException("live_service_delivery_forbidden", "Live services cannot define async delivery policy.");
            if (defaultRevisions != 0 || maximumRevisions != 0)
                throw new DomainException("live_service_revisions_forbidden", "Live services must have zero revisions.");
            if (allowedDurations.Count == 0)
                throw new DomainException("live_service_duration_required", "Live services require at least one allowed duration.");
            return;
        }

        if (allowedDurations.Count != 0)
            throw new DomainException("async_service_durations_forbidden", "Async services cannot define live durations.");
        if (minimumDeliveryHours is null || defaultDeliveryHours is null
            || recommendedDeliveryHours is null || maximumDeliveryHours is null
            || minimumDeliveryHours < 1 || maximumDeliveryHours > 8760
            || minimumDeliveryHours > defaultDeliveryHours || defaultDeliveryHours > maximumDeliveryHours
            || minimumDeliveryHours > recommendedDeliveryHours || recommendedDeliveryHours > maximumDeliveryHours)
            throw new DomainException("invalid_service_delivery_policy", "Async delivery must satisfy minimum <= default/recommended <= maximum.");
    }

    private static int[] NormalizeDurations(IReadOnlyCollection<int>? allowedDurations, bool requiresScheduling)
    {
        if (!requiresScheduling)
            return [];

        var normalized = (allowedDurations ?? SupportedLiveDurations)
            .Distinct()
            .OrderBy(x => x)
            .ToArray();
        if (normalized.Length == 0 || normalized.Any(x => !SupportedLiveDurations.Contains(x)))
            throw new DomainException("invalid_service_durations", "Allowed service durations are invalid.");
        return normalized;
    }
}
