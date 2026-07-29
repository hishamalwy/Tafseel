using Microsoft.AspNetCore.Identity;

namespace Tafseel.Infrastructure.Identity;

public sealed class ApplicationUser : IdentityUser
{
    public required string FullName { get; set; }
    public string FullNameEnglish { get; set; } = "";
    public string? AvatarStorageKey { get; set; }
    public string? AvatarContentType { get; set; }
    public bool IsSuspended { get; set; }
    public DateTimeOffset? EmailConfirmationSentAt { get; set; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public ICollection<RefreshToken> RefreshTokens { get; } = [];

    public bool HasAvatar => !string.IsNullOrWhiteSpace(AvatarStorageKey);
}

public sealed class RefreshToken
{
    public long Id { get; init; }
    public required string TokenHash { get; init; }
    public required string FamilyId { get; init; }
    public required string UserId { get; init; }
    public ApplicationUser User { get; init; } = null!;
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset ExpiresAt { get; init; }
    public DateTimeOffset? RevokedAt { get; set; }
    public string? ReplacedByTokenHash { get; set; }
    public bool IsActive(DateTimeOffset now) => RevokedAt is null && ExpiresAt > now;
}
