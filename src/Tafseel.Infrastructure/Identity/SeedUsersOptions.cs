namespace Tafseel.Infrastructure.Identity;

/// <summary>
/// The demo-account seed password (docs/ENVIRONMENTS.md). Development startup seeds only when <see cref="Enabled"/>;
/// Staging and PreProduction seed through the explicit `seed` command; Production never seeds demo accounts.
/// The password comes from User Secrets or the SeedUsers__Password setting and is never logged.
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
