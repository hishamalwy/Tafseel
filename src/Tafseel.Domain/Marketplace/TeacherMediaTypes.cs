namespace Tafseel.Domain.Marketplace;

/// <summary>
/// Canonical teaching-media types. Avatars stay JPEG/PNG-only elsewhere.
/// Qualification demos remain video; Teacher Showcases accept mixed safe media.
/// </summary>
public static class TeacherMediaTypes
{
    public const int MaxFilesPerUpload = 6;
    public const int MaxFilesPerDelivery = MaxFilesPerUpload;
    public const long MaxBytes = 250L * 1024 * 1024;

    public static readonly HashSet<string> ShowcaseContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "video/mp4", "video/webm",
        "audio/wav", "audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg",
        "image/jpeg", "image/png", "image/webp", "image/gif"
    };

    public static readonly HashSet<string> QualificationDemoContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "video/mp4", "video/webm"
    };

    public static readonly HashSet<string> DeliveryDocumentContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/zip"
    };

    public static string? Normalize(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType)) return null;
        var trimmed = contentType.Trim();
        var separator = trimmed.IndexOf(';');
        if (separator >= 0) trimmed = trimmed[..separator].Trim();
        if (trimmed.Length == 0) return null;
        return trimmed.ToLowerInvariant() switch
        {
            "image/jpg" => "image/jpeg",
            "audio/x-wav" or "audio/wave" => "audio/wav",
            "audio/mp3" => "audio/mpeg",
            "audio/x-m4a" or "audio/m4a" => "audio/mp4",
            "audio/x-aac" => "audio/aac",
            "application/ogg" => "audio/ogg",
            "video/mpeg" or "application/mp4" or "video/quicktime" => "video/mp4",
            "application/x-zip-compressed" or "application/x-zip" => "application/zip",
            var other => other
        };
    }

    public static bool IsUnknownDeclared(string? contentType)
    {
        var type = Normalize(contentType);
        return type is null
            or "application/octet-stream"
            or "binary/octet-stream"
            or "application/download";
    }

    public static string? Canonical(string? contentType, bool videoOnly)
    {
        var type = Normalize(contentType);
        if (type is null) return null;
        var allowed = videoOnly ? QualificationDemoContentTypes : ShowcaseContentTypes;
        return allowed.Contains(type) ? type : null;
    }

    public static string? CanonicalDelivery(string? contentType)
    {
        var type = Normalize(contentType);
        if (type is null) return null;
        return ShowcaseContentTypes.Contains(type) || DeliveryDocumentContentTypes.Contains(type)
            ? type
            : null;
    }

    public static bool IsVideo(string? contentType) =>
        Normalize(contentType) is "video/mp4" or "video/webm";

    public static bool IsAudio(string? contentType) =>
        Normalize(contentType) is "audio/wav" or "audio/mpeg" or "audio/mp4" or "audio/aac" or "audio/ogg";

    public static bool IsImage(string? contentType) =>
        Normalize(contentType) is "image/jpeg" or "image/png" or "image/webp" or "image/gif";

    public static bool IsDocument(string? contentType)
    {
        var type = Normalize(contentType);
        return type is not null && DeliveryDocumentContentTypes.Contains(type);
    }
}
