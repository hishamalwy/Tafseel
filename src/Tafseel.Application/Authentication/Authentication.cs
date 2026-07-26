namespace Tafseel.Application.Authentication;

public sealed record RegisterCommand(string Email, string Password, string FullName, string Role);
public sealed record LoginCommand(string Email, string Password);
public sealed record RegistrationResult(
    bool Succeeded,
    AuthenticationError Error = AuthenticationError.None,
    IReadOnlyCollection<string>? Details = null);
public sealed record AuthenticatedUser(
    string UserId,
    string Email,
    string FullName,
    IReadOnlyCollection<string> Roles,
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt,
    string RefreshToken,
    DateTimeOffset RefreshTokenExpiresAt);
public sealed record CurrentUser(string UserId, string Email, string FullName, IReadOnlyCollection<string> Roles);
public sealed record PasswordResetResult(bool Succeeded, IReadOnlyCollection<string>? Details = null);

public enum AuthenticationError
{
    None,
    InvalidCredentials,
    InvalidRefreshToken,
    RefreshTokenExpired,
    RefreshTokenReused,
    DuplicateEmail,
    InvalidRole,
    EmailConfirmationRequired,
    InvalidConfirmationToken,
    ConfirmationSendFailed,
    RegistrationFailed,
    RoleAssignmentFailed,
    Suspended,
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
    Task<CurrentUser?> GetUserAsync(string userId, CancellationToken cancellationToken);
    Task RequestEmailConfirmationAsync(string email, CancellationToken cancellationToken);
    Task<AuthenticationError> ConfirmEmailAsync(string email, string token, CancellationToken cancellationToken);
    Task RequestPasswordResetAsync(string email, CancellationToken cancellationToken);
    Task<PasswordResetResult> ResetPasswordAsync(string email, string token, string password, CancellationToken cancellationToken);
}
