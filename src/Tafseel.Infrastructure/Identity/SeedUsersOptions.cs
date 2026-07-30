namespace Tafseel.Infrastructure.Identity;

/// <summary>
/// Opt-in Development-only demo user seeding. Never applies in Staging or Production;
/// see ADR-012 and <see cref="DependencyInjection.InitializeIdentityAsync"/>.
/// </summary>
public sealed class SeedUsersOptions
{
    public const string SectionName = "SeedUsers";

    public bool Enabled { get; init; }
    public string? Password { get; init; }

    /// <summary>True only when the password is actually needed: Development and Enabled.</summary>
    internal bool RequiresPassword(bool isDevelopment) => isDevelopment && Enabled;

    /// <summary>Password presence is validated only when it would actually be used, never in Staging/Production.</summary>
    internal bool IsValid(bool isDevelopment) =>
        !RequiresPassword(isDevelopment) || !string.IsNullOrWhiteSpace(Password);
}
