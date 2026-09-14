using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tafseel.Api.Middleware;
using Tafseel.Application.Authentication;

namespace Tafseel.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(
    IAuthenticationService authentication,
    IConfiguration configuration,
    ILogger<AuthController> logger) : ControllerBase
{
    private const string HostRefreshCookie = "__Host-tafseel-refresh";
    private const string StagingRefreshCookie = "tafseel-staging-refresh";
    private bool SecureRefreshCookie => Request.IsHttps
        || !configuration.GetValue<bool>("Security:AllowInsecureRefreshCookie");
    private string RefreshCookie => SecureRefreshCookie ? HostRefreshCookie : StagingRefreshCookie;

    [HttpPost("register")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Register(RegisterRequest request, CancellationToken cancellationToken)
    {
        var result = await authentication.RegisterAsync(
            new(request.Email, request.Password, request.FullName, request.Role,
                NormalizeLang(request.Lang), request.PolicyVersion), cancellationToken);
        if (result.Succeeded)
            return Accepted(new { confirmationRequired = true });

        return result.Error switch
        {
            AuthenticationError.InvalidRole =>
                Error(400, "invalid_role", "Invalid registration role"),
            AuthenticationError.PolicyNotAccepted =>
                Error(400, "policy_acceptance_required", "Current policies must be accepted"),
            AuthenticationError.DuplicateEmail =>
                Error(409, "registration_failed", "Registration failed"),
            AuthenticationError.RoleAssignmentFailed =>
                Error(500, "role_assignment_failed", "Registration failed"),
            AuthenticationError.ConfirmationSendFailed =>
                Error(503, "confirmation_send_failed", "Confirmation email could not be sent"),
            _ => Error(400, "registration_failed", "Registration failed", result.Details)
        };
    }

    [HttpPost("login")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var result = await authentication.LoginAsync(
            new(request.Email, request.Password, request.Code), cancellationToken);
        return ToResponse(result);
    }

    [HttpPost("refresh")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh(CancellationToken cancellationToken)
    {
        if (!TryReadRefreshToken(out var refreshToken))
            return Error(401, "refresh_token_missing", "Authentication failed");

        return ToResponse(await authentication.RefreshAsync(refreshToken, cancellationToken));
    }

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        if (TryReadRefreshToken(out var refreshToken))
            await authentication.RevokeAsync(refreshToken, cancellationToken);
        ClearRefreshCookies();
        logger.LogInformation("Logout completed");
        return NoContent();
    }

    [Authorize]
    [HttpGet("sessions")]
    public async Task<IActionResult> Sessions(CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue("sub");
        if (userId is null)
            return Unauthorized();
        TryReadRefreshToken(out var currentRefreshToken);
        return Ok(await authentication.GetSessionsAsync(userId, currentRefreshToken, cancellationToken));
    }

    [Authorize]
    [HttpDelete("sessions/{sessionId}")]
    public async Task<IActionResult> RevokeSession(string sessionId, CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue("sub");
        if (userId is null)
            return Unauthorized();
        var current = TryReadRefreshToken(out var currentRefreshToken)
            ? (await authentication.GetSessionsAsync(userId, currentRefreshToken, cancellationToken))
                .FirstOrDefault(x => x.Id == sessionId)?.IsCurrent == true
            : false;
        if (!await authentication.RevokeSessionAsync(userId, sessionId, cancellationToken))
            return NotFound();
        if (current)
            ClearRefreshCookies();
        return NoContent();
    }

    [Authorize]
    [HttpGet("privacy/export")]
    public async Task<IActionResult> ExportAccount(CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue("sub");
        if (userId is null)
            return Unauthorized();
        var export = await authentication.ExportAccountAsync(userId, cancellationToken);
        return export is null ? NotFound() : Ok(export);
    }

    [Authorize]
    [EnableRateLimiting("auth")]
    [HttpDelete("account")]
    public async Task<IActionResult> DeleteAccount(
        DeleteAccountRequest request, CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue("sub");
        if (userId is null)
            return Unauthorized();
        var result = await authentication.DeleteAccountAsync(userId, request.Password, cancellationToken);
        if (!result.Succeeded)
            return result.Error switch
            {
                AccountDeletionError.IncorrectPassword => Error(400, "invalid_password",
                    "The password is incorrect"),
                AccountDeletionError.ActiveCommitments => Error(409, "account_deletion_blocked",
                    "Settle active work, disputes, withdrawals, and balances before deactivating the account"),
                _ => Error(500, "account_deletion_failed",
                    "Account deactivation could not be completed", result.Details)
            };
        ClearRefreshCookies();
        return NoContent();
    }

    [Authorize]
    [HttpPost("mfa/setup")]
    public async Task<IActionResult> SetupMfa(CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue("sub");
        if (userId is null)
            return Unauthorized();
        var setup = await authentication.BeginMfaSetupAsync(userId, cancellationToken);
        return setup is null ? NotFound() : Ok(setup);
    }

    [Authorize]
    [EnableRateLimiting("auth")]
    [HttpPost("mfa/enable")]
    public async Task<IActionResult> EnableMfa(MfaCodeRequest request, CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue("sub");
        if (userId is null)
            return Unauthorized();
        var result = await authentication.EnableMfaAsync(userId, request.Code, cancellationToken);
        if (!result.Succeeded)
            return Error(400, "invalid_mfa_code", "The authenticator code is invalid");
        ClearRefreshCookies();
        return Ok(new { result.RecoveryCodes });
    }

    [Authorize]
    [EnableRateLimiting("auth")]
    [HttpPost("mfa/disable")]
    public async Task<IActionResult> DisableMfa(DisableMfaRequest request, CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue("sub");
        if (userId is null)
            return Unauthorized();
        if (!await authentication.DisableMfaAsync(userId, request.Password, request.Code, cancellationToken))
            return Error(400, "invalid_mfa_code", "Password or authenticator code is invalid");
        ClearRefreshCookies();
        return NoContent();
    }

    [AllowAnonymous]
    [EnableRateLimiting("confirmation")]
    [HttpPost("request-email-confirmation")]
    public async Task<IActionResult> RequestEmailConfirmation(
        EmailRequest request,
        CancellationToken cancellationToken)
    {
        await authentication.RequestEmailConfirmationAsync(request.Email, NormalizeLang(request.Lang), cancellationToken);
        return Accepted();
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("confirm-email")]
    public async Task<IActionResult> ConfirmEmail(
        ConfirmEmailRequest request,
        CancellationToken cancellationToken)
    {
        var result = await authentication.ConfirmEmailAsync(
            request.Email, request.Token, cancellationToken);
        return result == AuthenticationError.None
            ? NoContent()
            : Error(400, "invalid_confirmation_token", "Email confirmation failed");
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue("sub");
        var user = userId is null ? null : await authentication.GetUserAsync(userId, cancellationToken);
        return user is null ? NotFound() : Ok(user);
    }

    [Authorize]
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile(
        UpdateProfileRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.FullName))
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
            {
                [nameof(request.FullName)] = ["Full name is required."]
            }));

        var userId = User.FindFirstValue("sub");
        var user = userId is null
            ? null
            : await authentication.UpdateProfileAsync(
                userId, request.FullName, request.FullNameEnglish ?? "", cancellationToken);
        return user is null ? NotFound() : Ok(user);
    }

    [Authorize]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(2 * 1024 * 1024)]
    [HttpPost("avatar")]
    public async Task<IActionResult> UploadAvatar(IFormFile file, CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue("sub");
        if (userId is null)
            return Unauthorized();
        if (file is null || file.Length <= 0)
            return Error(400, "invalid_avatar", "An avatar image is required.");

        await using var stream = file.OpenReadStream();
        var user = await authentication.SetAvatarAsync(
            userId, stream, file.FileName, file.ContentType, file.Length, cancellationToken);
        return user is null ? NotFound() : Ok(user);
    }

    [Authorize]
    [HttpDelete("avatar")]
    public async Task<IActionResult> ClearAvatar(CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue("sub");
        if (userId is null)
            return Unauthorized();
        var user = await authentication.ClearAvatarAsync(userId, cancellationToken);
        return user is null ? NotFound() : Ok(user);
    }

    [AllowAnonymous]
    [HttpGet("~/api/v1/users/{userId}/avatar")]
    public async Task<IActionResult> Avatar(string userId, CancellationToken cancellationToken)
    {
        var file = await authentication.OpenAvatarAsync(userId, cancellationToken);
        if (file is null)
            return NotFound();
        Response.Headers.CacheControl = "public, max-age=300";
        return File(file.Content, file.ContentType, enableRangeProcessing: true);
    }

    [Authorize]
    [EnableRateLimiting("auth")]
    [HttpPut("password")]
    public async Task<IActionResult> ChangePassword(
        ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue("sub");
        if (userId is null)
            return Unauthorized();

        var result = await authentication.ChangePasswordAsync(
            userId, request.CurrentPassword, request.NewPassword, cancellationToken);
        if (!result.Succeeded)
            return Error(400, "password_change_failed", "Password change failed", result.Details);

        ClearRefreshCookies();
        return NoContent();
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(
        ForgotPasswordRequest request,
        CancellationToken cancellationToken)
    {
        await authentication.RequestPasswordResetAsync(request.Email, NormalizeLang(request.Lang), cancellationToken);
        return Accepted();
    }

    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(
        ResetPasswordRequest request,
        CancellationToken cancellationToken)
    {
        var result = await authentication.ResetPasswordAsync(
            request.Email, request.Token, request.Password, cancellationToken);
        return result.Succeeded
            ? NoContent()
            : Error(400, "invalid_reset_token", "Password reset failed", result.Details);
    }

    private IActionResult ToResponse(AuthenticationResult result)
    {
        if (!result.Succeeded)
            return result.Error switch
            {
                AuthenticationError.InvalidCredentials =>
                    Error(401, "invalid_credentials", "Incorrect email or password."),
                AuthenticationError.InvalidRefreshToken =>
                    Error(401, "refresh_token_invalid", "Authentication failed"),
                AuthenticationError.RefreshTokenExpired =>
                    Error(401, "refresh_token_expired", "Authentication failed"),
                AuthenticationError.RefreshTokenReused =>
                    Error(401, "refresh_token_reused", "Authentication failed"),
                AuthenticationError.EmailConfirmationRequired =>
                    Error(401, "email_confirmation_required", "Email confirmation is required"),
                AuthenticationError.Suspended =>
                    Error(403, "account_suspended", "Account suspended"),
                AuthenticationError.MfaRequired =>
                    Error(401, "mfa_required", "Enter the code from your authenticator app"),
                AuthenticationError.InvalidMfaCode =>
                    Error(401, "invalid_mfa_code", "The authenticator code is invalid"),
                AuthenticationError.DuplicateEmail =>
                    Error(409, "registration_failed", "Registration failed"),
                AuthenticationError.InvalidRole =>
                    Error(400, "invalid_role", "Invalid registration role"),
                _ => Error(400, "registration_failed", "Authentication failed", result.Details)
            };

        var user = result.User!;
        Response.Cookies.Append(
            RefreshCookie, user.RefreshToken, IssueCookieOptions(user.RefreshTokenExpiresAt));
        return Ok(new
        {
            user.UserId,
            user.Email,
            user.FullName,
            user.FullNameEnglish,
            user.Roles,
            user.HasAvatar,
            user.MfaEnabled,
            user.AccessToken,
            user.AccessTokenExpiresAt
        });
    }

    private ObjectResult Error(
        int status,
        string code,
        string title,
        IReadOnlyCollection<string>? details = null)
    {
        var problem = ApiProblem.Create(HttpContext, status, code, title);
        if (details?.Count > 0)
            problem.Extensions["errors"] = new Dictionary<string, string[]> { ["account"] = details.ToArray() };
        return StatusCode(status, problem);
    }

    private static string NormalizeLang(string? lang) =>
        string.Equals(lang, "en", StringComparison.OrdinalIgnoreCase) ? "en" : "ar";

    private bool TryReadRefreshToken([NotNullWhen(true)] out string? refreshToken)
    {
        return Request.Cookies.TryGetValue(RefreshCookie, out refreshToken)
            && !string.IsNullOrEmpty(refreshToken);
    }

    private void ClearRefreshCookies()
    {
        Response.Cookies.Delete(HostRefreshCookie, CookieOptions(secure: true));
        Response.Cookies.Delete(StagingRefreshCookie, CookieOptions(secure: false));
    }

    private CookieOptions IssueCookieOptions(DateTimeOffset? expires = null) =>
        CookieOptions(secure: SecureRefreshCookie, expires);

    private static CookieOptions CookieOptions(bool secure, DateTimeOffset? expires = null) => new()
    {
        HttpOnly = true,
        Secure = secure,
        SameSite = SameSiteMode.Strict,
        Path = "/",
        Expires = expires,
        IsEssential = true
    };
}

public sealed record RegisterRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    [Required, MinLength(10), MaxLength(128)] string Password,
    [Required, MaxLength(200), RegularExpression(@"^(?!\s*\d+\s*$).*$", ErrorMessage = "Full name cannot contain only numbers.")] string FullName,
    [Required] string Role,
    string Lang = "ar",
    [Required] string PolicyVersion = PolicyVersions.Current);

public sealed record LoginRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    [Required, MaxLength(128)] string Password,
    [RegularExpression(@"^[0-9A-Za-z -]{6,20}$")] string? Code = null);

public sealed record UpdateProfileRequest(
    [Required, MaxLength(200), RegularExpression(@"^(?!\s*\d+\s*$).*$", ErrorMessage = "Full name cannot contain only numbers.")] string FullName,
    [MaxLength(200), RegularExpression(@"^(?!\s*\d+\s*$).*$", ErrorMessage = "English name cannot contain only numbers.")] string? FullNameEnglish = null);

public sealed record ChangePasswordRequest(
    [Required, MaxLength(128)] string CurrentPassword,
    [Required, MinLength(10), MaxLength(128)] string NewPassword);

public sealed record DeleteAccountRequest(
    [Required, MaxLength(128)] string Password);

public sealed record MfaCodeRequest(
    [Required, RegularExpression(@"^[0-9]{6}$")] string Code);

public sealed record DisableMfaRequest(
    [Required, MaxLength(128)] string Password,
    [Required, RegularExpression(@"^[0-9A-Za-z -]{6,20}$")] string Code);

public sealed record ForgotPasswordRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    string Lang = "ar");

public sealed record EmailRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    string Lang = "ar");

public sealed record ConfirmEmailRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    [Required] string Token);

public sealed record ResetPasswordRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    [Required] string Token,
    [Required, MinLength(10), MaxLength(128)] string Password);
