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

    public void SetActive(bool active) => IsActive = active;
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
        int displayOrder = 0) : base(nameEn, nameAr)
    {
        if (string.IsNullOrWhiteSpace(nameAr))
            throw new DomainException("service_name_ar_required", "Arabic service name is required.");
        Description = RequiredLocalized(descriptionEn, "service_description_en_required");
        DescriptionAr = RequiredLocalized(descriptionAr, "service_description_ar_required");
        SetCode(code);
        UpdateBehavior(type, isPublic, teacherSelectable, requiresScheduling, allowedDurations, minPrice, maxPrice, displayOrder);
        if (IsActive) EnsureCompleteLocalization();
    }

    public static string CodeFromEnglishName(string nameEn) => NormalizeCode(nameEn);
    public string Description { get; private set; } = "";
    public string DescriptionAr { get; private set; } = "";
    public string Code { get; private set; } = "";
    public string Type { get; private set; } = "";
    public bool IsPublic { get; private set; } = true;
    public bool TeacherSelectable { get; private set; } = true;
    public bool RequiresScheduling { get; private set; }
    public string AllowedDurationsCsv { get; private set; } = "";
    public decimal? MinPrice { get; private set; }
    public decimal? MaxPrice { get; private set; }
    public int DisplayOrder { get; private set; }
    public IReadOnlyCollection<int> AllowedDurations =>
        string.IsNullOrWhiteSpace(AllowedDurationsCsv)
            ? []
            : AllowedDurationsCsv.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(int.Parse).ToArray();

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
        UpdateBehavior(type, isPublic, teacherSelectable, requiresScheduling, allowedDurations, minPrice, maxPrice, displayOrder);
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

    private void UpdateBehavior(
        string? type,
        bool isPublic,
        bool teacherSelectable,
        bool requiresScheduling,
        IReadOnlyCollection<int>? allowedDurations,
        decimal? minPrice,
        decimal? maxPrice,
        int displayOrder)
    {
        if (Code == "live_session")
        {
            requiresScheduling = true;
            allowedDurations ??= SupportedLiveDurations;
            minPrice ??= 30;
        }
        Type = string.IsNullOrWhiteSpace(type) ? Code : type.Trim().ToLowerInvariant();
        if (Type.Length is 0 or > 50)
            throw new DomainException("invalid_service_type", "Service type is invalid.");
        if (displayOrder is < 0 or > 10000)
            throw new DomainException("invalid_service_display_order", "Service display order is invalid.");

        var normalizedDurations = NormalizeDurations(allowedDurations, requiresScheduling);
        if (minPrice.HasValue && minPrice <= 0 || maxPrice.HasValue && maxPrice <= 0)
            throw new DomainException("invalid_service_price_bounds", "Service price bounds must be positive.");
        if (minPrice.HasValue && maxPrice.HasValue && minPrice > maxPrice)
            throw new DomainException("invalid_service_price_bounds", "Service minimum price cannot exceed maximum price.");

        IsPublic = isPublic;
        TeacherSelectable = teacherSelectable;
        RequiresScheduling = requiresScheduling;
        AllowedDurationsCsv = normalizedDurations.Length == 0 ? "" : string.Join(',', normalizedDurations);
        MinPrice = minPrice;
        MaxPrice = maxPrice;
        DisplayOrder = displayOrder;
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
