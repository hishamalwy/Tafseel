using Tafseel.Domain.Common;

namespace Tafseel.Domain.Marketplace;

/// <summary>Where a teacher's public introduction video came from.</summary>
public enum IntroVideoSource
{
    /// <summary>A video the teacher uploaded for their profile (scanned like every upload).</summary>
    OwnUpload = 0,
    /// <summary>The demo recorded for a teaching application, shown only with a recorded consent.</summary>
    ApplicationVideo = 1
}

/// <summary>
/// PRODUCT-P1 (one public introduction): a teacher shows at most one video on the public profile, and only the video
/// they chose. The profile shows no video, or exactly this one while it is shown. There is no gallery.
/// A video recorded for an application is review material; it reaches this record only through
/// <see cref="TeacherVideoConsent"/>, which names the teacher, the file and the moment they agreed.
/// </summary>
public sealed class TeacherIntroVideo
{
    public const long MaxUploadBytes = 250L * 1024 * 1024;

    private TeacherIntroVideo() { }

    public Guid Id { get; private set; }
    public string TeacherId { get; private set; } = "";
    public IntroVideoSource Source { get; private set; }
    public string StorageKey { get; private set; } = "";
    public string FileName { get; private set; } = "";
    public string ContentType { get; private set; } = "";
    public long SizeBytes { get; private set; }
    public int? DurationSeconds { get; private set; }
    /// <summary>The application video this intro reuses (only when <see cref="Source"/> is ApplicationVideo).</summary>
    public Guid? SourceSampleId { get; private set; }
    /// <summary>The subject the reused application video qualified; it stops showing if that qualification ends.</summary>
    public Guid? SourceSubjectId { get; private set; }
    public Guid? ConsentId { get; private set; }
    public bool IsPublic { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];

    public static TeacherIntroVideo Start(string teacherId, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        TeacherId = Required(teacherId, 450, "teacher"),
        CreatedAt = now,
        UpdatedAt = now
    };

    /// <summary>
    /// Puts an uploaded video in place (first upload or a replacement). A new video starts hidden: the teacher
    /// watches the preview, then chooses to show it. Returns the storage key the previous own upload used, so the
    /// caller can delete that file once the change is saved.
    /// </summary>
    public string? UseUpload(string storageKey, string fileName, string contentType, long sizeBytes, DateTimeOffset now)
    {
        if (sizeBytes is <= 0 or > MaxUploadBytes)
            throw new DomainException("intro_video_size_invalid", "The introduction video is empty or too large.");
        var replaced = Source == IntroVideoSource.OwnUpload && StorageKey.Length > 0 ? StorageKey : null;
        Source = IntroVideoSource.OwnUpload;
        StorageKey = Required(storageKey, 500, "storage_key");
        FileName = Required(fileName, 255, "file_name");
        ContentType = Required(contentType, 100, "content_type");
        SizeBytes = sizeBytes;
        DurationSeconds = null;
        SourceSampleId = null;
        SourceSubjectId = null;
        ConsentId = null;
        IsPublic = false;
        UpdatedAt = now;
        return replaced;
    }

    /// <summary>
    /// Uses the application video the teacher consented to show. Consent is the act of showing it, so this
    /// intro is public immediately. Returns the storage key of a replaced own upload, if any.
    /// </summary>
    public string? UseApplicationVideo(TeacherVideoConsent consent, Guid subjectId, int? durationSeconds, DateTimeOffset now)
    {
        if (!string.Equals(consent.TeacherId, TeacherId, StringComparison.Ordinal) || consent.WithdrawnAt is not null)
            throw new DomainException("intro_video_consent_required", "Showing an application video needs the teacher's consent.");
        var replaced = Source == IntroVideoSource.OwnUpload && StorageKey.Length > 0 ? StorageKey : null;
        Source = IntroVideoSource.ApplicationVideo;
        StorageKey = consent.StorageKey;
        FileName = "application-video.mp4";
        ContentType = "video/mp4";
        SizeBytes = 0;
        DurationSeconds = durationSeconds;
        SourceSampleId = consent.SampleId;
        SourceSubjectId = subjectId;
        ConsentId = consent.Id;
        IsPublic = true;
        UpdatedAt = now;
        return replaced;
    }

    public void Show(DateTimeOffset now)
    {
        if (StorageKey.Length == 0)
            throw new DomainException("intro_video_missing", "Upload or choose a video first.");
        IsPublic = true;
        UpdatedAt = now;
    }

    public void Hide(DateTimeOffset now)
    {
        IsPublic = false;
        UpdatedAt = now;
    }

    private static string Required(string? value, int maximum, string field)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 || value.Length > maximum)
            throw new DomainException($"invalid_{field}", $"{field} is required and must not exceed {maximum} characters.");
        return value;
    }
}

/// <summary>
/// The recorded agreement to show an application video publicly: who agreed, which file, what they were told and
/// when. Kept after it is withdrawn (removing or replacing the intro), so the history of what was public stays true.
/// </summary>
public sealed class TeacherVideoConsent
{
    public const string ShowApplicationVideoStatement =
        "I agree that the video I recorded for my teaching application is shown to everyone on my public Tafseel profile.";

    private TeacherVideoConsent() { }

    public Guid Id { get; private set; }
    public string TeacherId { get; private set; } = "";
    public Guid SampleId { get; private set; }
    public string StorageKey { get; private set; } = "";
    public string Statement { get; private set; } = "";
    public DateTimeOffset GrantedAt { get; private set; }
    public DateTimeOffset? WithdrawnAt { get; private set; }

    public static TeacherVideoConsent Grant(string teacherId, Guid sampleId, string storageKey, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(teacherId) || sampleId == Guid.Empty || string.IsNullOrWhiteSpace(storageKey))
            throw new DomainException("intro_video_consent_required", "Showing an application video needs the teacher's consent.");
        return new()
        {
            Id = Guid.NewGuid(),
            TeacherId = teacherId,
            SampleId = sampleId,
            StorageKey = storageKey,
            Statement = ShowApplicationVideoStatement,
            GrantedAt = now
        };
    }

    public void Withdraw(DateTimeOffset now) => WithdrawnAt ??= now;
}
