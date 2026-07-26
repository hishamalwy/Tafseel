using Tafseel.Domain.Common;
using System.Text;

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

    protected CatalogItem(string name)
    {
        Id = Guid.NewGuid();
        Rename(name);
    }

    public Guid Id { get; private init; }
    public string Name { get; private set; } = "";
    public string NormalizedName { get; private set; } = "";
    public bool IsActive { get; private set; } = true;

    public void Rename(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new DomainException("catalog_name_required", "Name is required.");
        Name = CatalogNameNormalizer.Display(name);
        NormalizedName = CatalogNameNormalizer.Key(name);
    }

    public void SetActive(bool active) => IsActive = active;
}

public sealed class Subject : CatalogItem
{
    private Subject() { }
    public Subject(string name, string icon) : base(name) => Icon = icon.Trim();
    public string Icon { get; private set; } = "";
    public void Update(string name, string icon) { Rename(name); Icon = icon.Trim(); }
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
        MaxVideoSeconds = maxVideoSeconds;
    }
    public Guid SubjectId { get; private init; }
    public string Instructions { get; private set; } = "";
    public int MaxVideoSeconds { get; private set; }
    public void Update(string name, string instructions, int maxVideoSeconds)
    {
        if (maxVideoSeconds is < 30 or > 600)
            throw new DomainException("invalid_video_duration", "Video duration must be between 30 and 600 seconds.");
        Rename(name);
        Instructions = instructions.Trim();
        MaxVideoSeconds = maxVideoSeconds;
    }
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
    private ServiceCatalogItem() { }
    public ServiceCatalogItem(string name, string description) : base(name) => Description = description.Trim();
    public string Description { get; private set; } = "";
    public void Update(string name, string description) { Rename(name); Description = description.Trim(); }
}
