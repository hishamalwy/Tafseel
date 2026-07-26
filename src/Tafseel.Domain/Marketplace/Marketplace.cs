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
    public decimal Price { get; private set; }
    public string Currency { get; private set; } = "";
    public int DeliveryHours { get; private set; }
    public int Revisions { get; private set; }
    public bool IsActive { get; private set; } = true;
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];

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

    public void SetActive(bool active, DateTimeOffset now)
    {
        IsActive = active;
        UpdatedAt = now;
    }
}

public sealed class TeacherTeachingSample
{
    private TeacherTeachingSample() { }
    public TeacherTeachingSample(string teacherId, Guid subjectId, Guid? topicId, string title, string storageKey, int durationSeconds, DateTimeOffset now)
    {
        if (durationSeconds is < 1 or > 3600)
            throw new DomainException("invalid_sample_duration", "Sample duration is invalid.");
        Id = Guid.NewGuid();
        TeacherId = teacherId;
        SubjectId = subjectId;
        TopicId = topicId;
        Title = title.Trim();
        StorageKey = storageKey;
        DurationSeconds = durationSeconds;
        CreatedAt = now;
    }
    public Guid Id { get; private set; }
    public string TeacherId { get; private set; } = "";
    public Guid SubjectId { get; private set; }
    public Guid? TopicId { get; private set; }
    public string Title { get; private set; } = "";
    public string StorageKey { get; private set; } = "";
    public int DurationSeconds { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset? PublishedAt { get; private set; }
    public bool IsPublished => PublishedAt.HasValue;
    public void Publish(DateTimeOffset now) => PublishedAt ??= now;
    public void Unpublish() => PublishedAt = null;
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
