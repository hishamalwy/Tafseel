using Tafseel.Domain.Common;
using Tafseel.Domain.Marketplace;

namespace Tafseel.Infrastructure.Files;

/// <summary>
/// Shared private-media validation used by Local and Azure Blob storage providers.
/// Keeps upload rules identical across providers (no workflow change).
/// </summary>
internal static class PrivateMediaRules
{
    public const int TeacherMediaHeaderLength = 16;

    public static readonly string[] AttachmentCategories =
    [
        "request-attachments", "order-deliveries", "live-session-attachments",
        "message-attachments", "dispute-evidence", "qualification-resources"
    ];

    private static readonly byte[] PngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

    public readonly record struct DetectedTeacherMedia(string Extension, string ContentType);

    public static DetectedTeacherMedia EnsureTeacherMedia(
        string fileName,
        string? declaredContentType,
        long size,
        long maxBytes,
        ReadOnlySpan<byte> header,
        int headerLength,
        bool videoOnly)
    {
        if (size is <= 0 || size > maxBytes)
            throw new DomainException("invalid_file_size", "Demo file size is invalid.");

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (!IsAllowedExtension(extension, videoOnly))
            throw new DomainException("invalid_file_type", "Upload a supported media file with a matching type.");

        var sniffed = SniffTeacherMedia(header, headerLength, extension)
            ?? throw new DomainException("invalid_file_signature", "The uploaded file is not a valid media file.");

        if (!string.Equals(extension, sniffed.Extension, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("invalid_file_type", "Upload a supported media file with a matching type.");

        var canonical = TeacherMediaTypes.Canonical(sniffed.ContentType, videoOnly);
        if (canonical is null)
            throw new DomainException("invalid_file_type", "Upload a supported media file with a matching type.");

        if (!DeclaredMatchesSniff(declaredContentType, canonical))
            throw new DomainException("invalid_file_type", "Upload a supported media file with a matching type.");

        return new DetectedTeacherMedia(sniffed.Extension, canonical);
    }

    public static DetectedTeacherMedia EnsureDeliveryAttachment(
        string fileName,
        string? declaredContentType,
        long size,
        long maxBytes,
        ReadOnlySpan<byte> header,
        int headerLength)
    {
        if (size is <= 0 || size > maxBytes)
            throw new DomainException("invalid_file_size", "Attachment file size is invalid.");

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (!IsAllowedDeliveryExtension(extension))
            throw new DomainException("invalid_file_type", "Attachment file type is not allowed.");

        var sniffed = SniffDelivery(header, headerLength, extension)
            ?? throw new DomainException("invalid_file_signature", "Attachment content does not match its file type.");

        if (!string.Equals(extension, sniffed.Extension, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("invalid_file_type", "Attachment file type is not allowed.");

        var canonical = TeacherMediaTypes.CanonicalDelivery(sniffed.ContentType)
            ?? throw new DomainException("invalid_file_type", "Attachment file type is not allowed.");

        if (!DeclaredMatchesSniff(declaredContentType, canonical))
            throw new DomainException("invalid_file_type", "Attachment file type is not allowed.");

        return new DetectedTeacherMedia(sniffed.Extension, canonical);
    }

    public static string EnsureAttachment(
        string fileName, string contentType, long size, string category, long maxBytes, out string extension)
    {
        if (size is <= 0 || size > maxBytes)
            throw new DomainException("invalid_file_size", "Attachment file size is invalid.");
        if (!AttachmentCategories.Contains(category, StringComparer.Ordinal))
            throw new DomainException("invalid_storage_category", "Storage category is invalid.");
        extension = Path.GetExtension(fileName).ToLowerInvariant();
        var expected = ContentTypeFor(extension);
        if (expected.Length == 0 || !string.Equals(expected, StripMediaParameters(contentType), StringComparison.OrdinalIgnoreCase))
            throw new DomainException("invalid_file_type", "Attachment file type is not allowed.");
        return expected;
    }

    public static void EnsureAttachmentHeader(string extension, ReadOnlySpan<byte> header, int read)
    {
        var valid = extension switch
        {
            ".pdf" => read >= 4 && header[..4].SequenceEqual("%PDF"u8),
            ".png" => read >= 8 && header[..8].SequenceEqual(PngSignature),
            ".jpg" or ".jpeg" => read >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff,
            _ => read >= 4 && header[0] == (byte)'P' && header[1] == (byte)'K'
        };
        if (!valid)
            throw new DomainException("invalid_file_signature", "Attachment content does not match its file type.");
    }

    public static string EnsureAvatar(string fileName, string contentType, long size, long maxBytes, out string extension)
    {
        if (size is <= 0 || size > maxBytes)
            throw new DomainException("invalid_avatar_size", "Avatar must be between 1 byte and 2 MB.");
        extension = Path.GetExtension(fileName).ToLowerInvariant();
        var expected = extension switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            _ => ""
        };
        if (expected.Length == 0
            || !string.Equals(expected, StripMediaParameters(contentType), StringComparison.OrdinalIgnoreCase))
            throw new DomainException("invalid_avatar_type", "Only JPEG and PNG avatars are allowed.");
        return expected;
    }

    public static void EnsureAvatarHeader(string extension, ReadOnlySpan<byte> header, int read)
    {
        var valid = extension switch
        {
            ".png" => read >= 8 && header[..8].SequenceEqual(PngSignature),
            _ => read >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff
        };
        if (!valid)
            throw new DomainException("invalid_avatar_signature", "Avatar content does not match its file type.");
    }

    public static string NewKey(string folder, string extension) =>
        $"{folder}/{DateTime.UtcNow:yyyy}/{DateTime.UtcNow:MM}/{Guid.NewGuid():N}{extension}";

    public static void EnsureSafeKey(string storageKey)
    {
        if (string.IsNullOrWhiteSpace(storageKey)
            || storageKey.Contains("..", StringComparison.Ordinal)
            || storageKey.StartsWith('/')
            || Path.IsPathRooted(storageKey))
            throw new DomainException("file_not_found", "Private file was not found.");
    }

    private static bool IsAllowedExtension(string extension, bool videoOnly) => videoOnly
        ? extension is ".mp4" or ".webm"
        : extension is ".mp4" or ".webm" or ".wav" or ".mp3" or ".m4a" or ".aac" or ".ogg"
            or ".jpg" or ".jpeg" or ".png" or ".webp" or ".gif";

    private static bool IsAllowedDeliveryExtension(string extension) =>
        IsAllowedExtension(extension, videoOnly: false)
        || extension is ".pdf" or ".docx" or ".pptx" or ".zip";

    private static DetectedTeacherMedia? SniffTeacherMedia(
        ReadOnlySpan<byte> header, int read, string extension)
    {
        if (read >= 12 && header[4..8].SequenceEqual("ftyp"u8))
        {
            return extension switch
            {
                ".mp4" => new DetectedTeacherMedia(".mp4", "video/mp4"),
                ".m4a" => new DetectedTeacherMedia(".m4a", "audio/mp4"),
                _ => null
            };
        }

        if (read >= 4 && header[0] == 0x1a && header[1] == 0x45 && header[2] == 0xdf && header[3] == 0xa3)
            return extension == ".webm" ? new DetectedTeacherMedia(".webm", "video/webm") : null;

        if (read >= 12 && header[..4].SequenceEqual("RIFF"u8) && header[8..12].SequenceEqual("WAVE"u8))
            return extension == ".wav" ? new DetectedTeacherMedia(".wav", "audio/wav") : null;

        if (read >= 12 && header[..4].SequenceEqual("RIFF"u8) && header[8..12].SequenceEqual("WEBP"u8))
            return extension == ".webp" ? new DetectedTeacherMedia(".webp", "image/webp") : null;

        if (read >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff)
            return extension is ".jpg" or ".jpeg" ? new DetectedTeacherMedia(extension, "image/jpeg") : null;

        if (read >= 8 && header[..8].SequenceEqual(PngSignature))
            return extension == ".png" ? new DetectedTeacherMedia(".png", "image/png") : null;

        if (read >= 6 && (header[..6].SequenceEqual("GIF87a"u8) || header[..6].SequenceEqual("GIF89a"u8)))
            return extension == ".gif" ? new DetectedTeacherMedia(".gif", "image/gif") : null;

        if (read >= 3 && (header[..3].SequenceEqual("ID3"u8)
            || (header[0] == 0xff && (header[1] & 0xe0) == 0xe0)))
            return extension == ".mp3" ? new DetectedTeacherMedia(".mp3", "audio/mpeg") : null;

        if (read >= 2 && header[0] == 0xff && (header[1] & 0xf6) == 0xf0)
            return extension == ".aac" ? new DetectedTeacherMedia(".aac", "audio/aac") : null;

        if (read >= 4 && header[..4].SequenceEqual("OggS"u8))
            return extension == ".ogg" ? new DetectedTeacherMedia(".ogg", "audio/ogg") : null;

        return null;
    }

    private static DetectedTeacherMedia? SniffDelivery(
        ReadOnlySpan<byte> header, int read, string extension)
    {
        var media = SniffTeacherMedia(header, read, extension);
        if (media is not null) return media;

        if (read >= 4 && header[..4].SequenceEqual("%PDF"u8))
            return extension == ".pdf" ? new DetectedTeacherMedia(".pdf", "application/pdf") : null;

        if (read >= 4 && header[0] == (byte)'P' && header[1] == (byte)'K')
        {
            return extension switch
            {
                ".docx" => new DetectedTeacherMedia(".docx",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                ".pptx" => new DetectedTeacherMedia(".pptx",
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
                ".zip" => new DetectedTeacherMedia(".zip", "application/zip"),
                _ => null
            };
        }

        return null;
    }

    private static bool DeclaredMatchesSniff(string? declaredContentType, string sniffedContentType)
    {
        if (TeacherMediaTypes.IsUnknownDeclared(declaredContentType))
            return true;
        var declared = TeacherMediaTypes.Normalize(declaredContentType);
        return string.Equals(declared, sniffedContentType, StringComparison.OrdinalIgnoreCase);
    }

    private static string? StripMediaParameters(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType)) return contentType;
        var separator = contentType.IndexOf(';');
        return separator < 0 ? contentType.Trim() : contentType[..separator].Trim();
    }

    private static string ContentTypeFor(string extension) => extension switch
    {
        ".pdf" => "application/pdf",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".zip" => "application/zip",
        _ => ""
    };
}
