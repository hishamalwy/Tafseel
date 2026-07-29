using System.ComponentModel.DataAnnotations;
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
    ILogger<AuthController> logger) : ControllerBase
{
    private const string RefreshCookie = "__Host-tafseel-refresh";

    [HttpPost("register")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Register(RegisterRequest request, CancellationToken cancellationToken)
    {
        var result = await authentication.RegisterAsync(
            new(request.Email, request.Password, request.FullName, request.Role, NormalizeLang(request.Lang)), cancellationToken);
        if (result.Succeeded)
            return Accepted(new { confirmationRequired = true });

        return result.Error switch
        {
            AuthenticationError.InvalidRole =>
                Error(400, "invalid_role", "Invalid registration role"),
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
            new(request.Email, request.Password), cancellationToken);
        return ToResponse(result);
    }

    [HttpPost("refresh")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh(CancellationToken cancellationToken)
    {
        if (!Request.Cookies.TryGetValue(RefreshCookie, out var refreshToken))
            return Error(401, "refresh_token_missing", "Authentication failed");

        return ToResponse(await authentication.RefreshAsync(refreshToken, cancellationToken));
    }

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        if (Request.Cookies.TryGetValue(RefreshCookie, out var refreshToken))
            await authentication.RevokeAsync(refreshToken, cancellationToken);
        Response.Cookies.Delete(RefreshCookie, CookieOptions());
        logger.LogInformation("Logout completed");
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

        Response.Cookies.Delete(RefreshCookie, CookieOptions());
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
                AuthenticationError.DuplicateEmail =>
                    Error(409, "registration_failed", "Registration failed"),
                AuthenticationError.InvalidRole =>
                    Error(400, "invalid_role", "Invalid registration role"),
                _ => Error(400, "registration_failed", "Authentication failed", result.Details)
            };

        var user = result.User!;
        Response.Cookies.Append(RefreshCookie, user.RefreshToken, CookieOptions(user.RefreshTokenExpiresAt));
        return Ok(new
        {
            user.UserId,
            user.Email,
            user.FullName,
            user.FullNameEnglish,
            user.Roles,
            user.HasAvatar,
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

    private static CookieOptions CookieOptions(DateTimeOffset? expires = null) => new()
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = "/",
        Expires = expires,
        IsEssential = true
    };
}

public sealed record RegisterRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    [Required, MinLength(10), MaxLength(128)] string Password,
    [Required, MaxLength(200)] string FullName,
    [Required] string Role,
    string Lang = "ar");

public sealed record LoginRequest(
    [Required, EmailAddress, MaxLength(256)] string Email,
    [Required, MaxLength(128)] string Password);

public sealed record UpdateProfileRequest(
    [Required, MaxLength(200)] string FullName,
    [MaxLength(200)] string? FullNameEnglish = null);

public sealed record ChangePasswordRequest(
    [Required, MaxLength(128)] string CurrentPassword,
    [Required, MinLength(10), MaxLength(128)] string NewPassword);

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
