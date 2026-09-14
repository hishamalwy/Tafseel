namespace Tafseel.Application.Authentication;

public static class PolicyVersions
{
    public const string Current = "2026-08-12";
}

public sealed record RegisterCommand(
    string Email, string Password, string FullName, string Role,
    string Lang = "ar", string PolicyVersion = PolicyVersions.Current);
public sealed record LoginCommand(string Email, string Password, string? Code = null);
public sealed record RegistrationResult(
    bool Succeeded,
    AuthenticationError Error = AuthenticationError.None,
    IReadOnlyCollection<string>? Details = null);
public sealed record AuthenticatedUser(
    string UserId,
    string Email,
    string FullName,
    string FullNameEnglish,
    IReadOnlyCollection<string> Roles,
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt,
    string RefreshToken,
    DateTimeOffset RefreshTokenExpiresAt,
    bool HasAvatar = false,
    bool MfaEnabled = false);
public sealed record CurrentUser(
    string UserId,
    string Email,
    string FullName,
    string FullNameEnglish,
    IReadOnlyCollection<string> Roles,
    bool HasAvatar = false,
    bool MfaEnabled = false);
public sealed record AvatarFile(Stream Content, string ContentType);
public sealed record PasswordResetResult(bool Succeeded, IReadOnlyCollection<string>? Details = null);
public enum AccountDeletionError { None, IncorrectPassword, ActiveCommitments, UpdateFailed }
public sealed record AccountDeletionResult(
    bool Succeeded, AccountDeletionError Error = AccountDeletionError.None,
    IReadOnlyCollection<string>? Details = null);
public sealed record AccountSession(
    string Id, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt, bool IsCurrent);
public sealed record MfaSetup(string SharedKey, string AuthenticatorUri);
public sealed record MfaEnableResult(bool Succeeded, IReadOnlyCollection<string>? RecoveryCodes = null);

public enum AuthenticationError
{
    None,
    InvalidCredentials,
    InvalidRefreshToken,
    RefreshTokenExpired,
    RefreshTokenReused,
    DuplicateEmail,
    InvalidRole,
    PolicyNotAccepted,
    EmailConfirmationRequired,
    InvalidConfirmationToken,
    ConfirmationSendFailed,
    RegistrationFailed,
    RoleAssignmentFailed,
    Suspended,
    MfaRequired,
    InvalidMfaCode,
    Validation
}

public sealed record AuthenticationResult(
    AuthenticatedUser? User,
    AuthenticationError Error = AuthenticationError.None,
    IReadOnlyCollection<string>? Details = null)
{
    public bool Succeeded => User is not null;
}

public interface IAuthenticationService
{
    Task<RegistrationResult> RegisterAsync(RegisterCommand command, CancellationToken cancellationToken);
    Task<AuthenticationResult> LoginAsync(LoginCommand command, CancellationToken cancellationToken);
    Task<AuthenticationResult> RefreshAsync(string refreshToken, CancellationToken cancellationToken);
    Task RevokeAsync(string refreshToken, CancellationToken cancellationToken);
    Task<IReadOnlyList<AccountSession>> GetSessionsAsync(
        string userId, string? currentRefreshToken, CancellationToken cancellationToken);
    Task<bool> RevokeSessionAsync(string userId, string sessionId, CancellationToken cancellationToken);
    Task<object?> ExportAccountAsync(string userId, CancellationToken cancellationToken);
    Task<AccountDeletionResult> DeleteAccountAsync(
        string userId, string password, CancellationToken cancellationToken);
    Task<MfaSetup?> BeginMfaSetupAsync(string userId, CancellationToken cancellationToken);
    Task<MfaEnableResult> EnableMfaAsync(string userId, string code, CancellationToken cancellationToken);
    Task<bool> DisableMfaAsync(
        string userId, string password, string code, CancellationToken cancellationToken);
    Task<CurrentUser?> GetUserAsync(string userId, CancellationToken cancellationToken);
    Task<CurrentUser?> UpdateProfileAsync(
        string userId, string fullName, string fullNameEnglish, CancellationToken cancellationToken);
    Task<CurrentUser?> SetAvatarAsync(
        string userId, Stream stream, string fileName, string contentType, long size, CancellationToken cancellationToken);
    Task<CurrentUser?> ClearAvatarAsync(string userId, CancellationToken cancellationToken);
    Task<AvatarFile?> OpenAvatarAsync(string userId, CancellationToken cancellationToken);
    Task<PasswordResetResult> ChangePasswordAsync(
        string userId, string currentPassword, string newPassword, CancellationToken cancellationToken);
    Task RequestEmailConfirmationAsync(string email, string lang, CancellationToken cancellationToken);
    Task<AuthenticationError> ConfirmEmailAsync(string email, string token, CancellationToken cancellationToken);
    Task RequestPasswordResetAsync(string email, string lang, CancellationToken cancellationToken);
    Task<PasswordResetResult> ResetPasswordAsync(string email, string token, string password, CancellationToken cancellationToken);
}
