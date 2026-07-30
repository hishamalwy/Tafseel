using Tafseel.Domain.Common;

namespace Tafseel.Infrastructure.Files;

/// <summary>
/// Shared private-media validation used by Local and Azure Blob storage providers.
/// Keeps upload rules identical across providers (no workflow change).
/// </summary>
internal static class PrivateMediaRules
{
    public static readonly string[] AttachmentCategories =
    [
        "request-attachments", "order-deliveries", "live-session-attachments",
        "message-attachments", "dispute-evidence", "qualification-resources"
    ];

    public static void EnsureDemo(string fileName, string contentType, long size, long maxBytes)
    {
        if (size is <= 0 || size > maxBytes)
            throw new DomainException("invalid_file_size", "Demo file size is invalid.");
        if (!string.Equals(Path.GetExtension(fileName), ".mp4", StringComparison.OrdinalIgnoreCase)
            || !string.Equals(contentType, "video/mp4", StringComparison.OrdinalIgnoreCase))
            throw new DomainException("invalid_file_type", "Only MP4 demo videos are allowed.");
    }

    public static void EnsureDemoHeader(ReadOnlySpan<byte> header)
    {
        if (header.Length < 12 || !header[4..8].SequenceEqual("ftyp"u8))
            throw new DomainException("invalid_file_signature", "The uploaded file is not a valid MP4.");
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
        if (expected.Length == 0 || !string.Equals(expected, contentType, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("invalid_file_type", "Attachment file type is not allowed.");
        return expected;
    }

    public static void EnsureAttachmentHeader(string extension, ReadOnlySpan<byte> header, int read)
    {
        var valid = extension switch
        {
            ".pdf" => read >= 4 && header[..4].SequenceEqual("%PDF"u8),
            ".png" => read == 8 && header.SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
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
        if (expected.Length == 0 || !string.Equals(expected, contentType, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("invalid_avatar_type", "Only JPEG and PNG avatars are allowed.");
        return expected;
    }

    public static void EnsureAvatarHeader(string extension, ReadOnlySpan<byte> header, int read)
    {
        var valid = extension switch
        {
            ".png" => read == 8 && header.SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
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
