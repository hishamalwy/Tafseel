using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Tafseel.Application.Authentication;
using Tafseel.Application.Authorization;
using Tafseel.Application.Email;
using Tafseel.Infrastructure.Email;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Identity;

internal sealed class AuthenticationService(
    UserManager<ApplicationUser> users,
    TafseelDbContext db,
    IOptions<JwtOptions> options,
    IOptions<EmailOptions> emailOptions,
    IEmailSender email,
    ILogger<AuthenticationService> logger,
    TimeProvider clock) : IAuthenticationService
{
    private readonly JwtOptions _options = options.Value;

    public async Task<RegistrationResult> RegisterAsync(
        RegisterCommand command,
        CancellationToken cancellationToken)
    {
        if (!Roles.PublicRegistration.Contains(command.Role, StringComparer.Ordinal))
        {
            logger.LogInformation("Registration denied with outcome {Outcome}", "invalid_role");
            return new(false, AuthenticationError.InvalidRole);
        }

        if (await users.FindByEmailAsync(command.Email) is not null)
        {
            logger.LogInformation("Registration denied with outcome {Outcome}", "existing_account");
            return new(false, AuthenticationError.DuplicateEmail);
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var user = new ApplicationUser
        {
            UserName = command.Email.Trim(),
            Email = command.Email.Trim(),
            FullName = command.FullName.Trim()
        };
        var created = await users.CreateAsync(user, command.Password);
        if (!created.Succeeded)
        {
            await transaction.RollbackAsync(cancellationToken);
            logger.LogInformation("Registration failed with outcome {Outcome}", "identity_validation");
            return new(false, AuthenticationError.RegistrationFailed, created.Errors.Select(x => x.Description).ToArray());
        }

        IdentityResult assigned;
        try
        {
            assigned = await users.AddToRoleAsync(user, command.Role);
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            logger.LogError("Registration role assignment failed for user {UserId} and role {Role}", user.Id, command.Role);
            return new(false, AuthenticationError.RoleAssignmentFailed);
        }
        if (!assigned.Succeeded)
        {
            await transaction.RollbackAsync(cancellationToken);
            logger.LogError("Registration role assignment failed for user {UserId} and role {Role}", user.Id, command.Role);
            return new(false, AuthenticationError.RoleAssignmentFailed);
        }

        await transaction.CommitAsync(cancellationToken);
        logger.LogInformation("Registration completed for user {UserId} with role {Role}", user.Id, command.Role);
        if (!await SendConfirmationAsync(user, cancellationToken))
            return new(false, AuthenticationError.ConfirmationSendFailed);

        return new(true);
    }

    public async Task<AuthenticationResult> LoginAsync(
        LoginCommand command,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByEmailAsync(command.Email);
        if (user is null || await users.IsLockedOutAsync(user))
        {
            if (user is not null)
                logger.LogWarning("Login denied for locked user {UserId}", user.Id);
            else
                logger.LogInformation("Login denied with outcome {Outcome}", "invalid_credentials");
            return new(null, AuthenticationError.InvalidCredentials);
        }
        if (!await users.CheckPasswordAsync(user, command.Password))
        {
            await users.AccessFailedAsync(user);
            logger.LogInformation("Login denied for user {UserId} with outcome {Outcome}", user.Id, "invalid_credentials");
            return new(null, AuthenticationError.InvalidCredentials);
        }
        await users.ResetAccessFailedCountAsync(user);
        if (user.IsSuspended)
        {
            logger.LogWarning("Suspended user login denied for user {UserId}", user.Id);
            return new(null, AuthenticationError.Suspended);
        }
        if (!await users.IsEmailConfirmedAsync(user))
        {
            logger.LogInformation("Login denied for user {UserId} with outcome {Outcome}", user.Id, "email_unconfirmed");
            return new(null, AuthenticationError.EmailConfirmationRequired);
        }

        return await IssueAsync(user, null, cancellationToken);
    }

    public async Task<AuthenticationResult> RefreshAsync(
        string refreshToken,
        CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var hash = Hash(refreshToken);
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var stored = await db.RefreshTokens.Include(x => x.User)
            .SingleOrDefaultAsync(x => x.TokenHash == hash, cancellationToken);

        if (stored is null)
            return new(null, AuthenticationError.InvalidRefreshToken);

        if (stored.ExpiresAt <= now)
            return new(null, AuthenticationError.RefreshTokenExpired);

        if (stored.RevokedAt is not null)
        {
            if (stored.ReplacedByTokenHash is null)
                return new(null, AuthenticationError.InvalidRefreshToken);

            var outcome = await ContainReplayAsync(stored, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            LogReplay(stored, now, outcome);
            return new(null, AuthenticationError.RefreshTokenReused);
        }

        if (stored.User.IsSuspended)
            return new(null, AuthenticationError.Suspended);
        if (!await users.IsEmailConfirmedAsync(stored.User))
            return new(null, AuthenticationError.EmailConfirmationRequired);

        stored.RevokedAt = now;
        try
        {
            var result = await IssueAsync(stored.User, stored, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            logger.LogInformation(
                "Refresh token rotated for user {UserId}, family {TokenFamilyId}, at {Timestamp}",
                stored.UserId, stored.FamilyId, now);
            return result;
        }
        catch (DbUpdateConcurrencyException)
        {
            await transaction.RollbackAsync(cancellationToken);
            db.ChangeTracker.Clear();
            return await ContainConcurrentReplayAsync(hash, now, cancellationToken);
        }
    }

    public async Task RevokeAsync(string refreshToken, CancellationToken cancellationToken)
    {
        var stored = await db.RefreshTokens.SingleOrDefaultAsync(
            x => x.TokenHash == Hash(refreshToken), cancellationToken);
        if (stored is null || stored.RevokedAt is not null)
            return;

        stored.RevokedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation(
            "Refresh token revoked by logout for user {UserId}, family {TokenFamilyId}",
            stored.UserId, stored.FamilyId);
    }

    public async Task<CurrentUser?> GetUserAsync(string userId, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null)
            return null;

        return new(user.Id, user.Email!, user.FullName, (await users.GetRolesAsync(user)).ToArray());
    }

    public async Task RequestEmailConfirmationAsync(string emailAddress, CancellationToken cancellationToken)
    {
        var user = await users.FindByEmailAsync(emailAddress);
        if (user is null || user.IsSuspended || await users.IsEmailConfirmedAsync(user))
        {
            logger.LogInformation("Email confirmation request completed with outcome {Outcome}", "no_action");
            return;
        }

        var now = clock.GetUtcNow();
        if (user.EmailConfirmationSentAt > now.AddMinutes(-2))
            return;

        await SendConfirmationAsync(user, cancellationToken);
    }

    public async Task<AuthenticationError> ConfirmEmailAsync(
        string emailAddress,
        string token,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByEmailAsync(emailAddress);
        if (user is null)
            return AuthenticationError.InvalidConfirmationToken;
        if (await users.IsEmailConfirmedAsync(user))
            return AuthenticationError.None;

        var result = await users.ConfirmEmailAsync(user, token);
        if (!result.Succeeded)
        {
            logger.LogWarning("Email confirmation failed for user {UserId}", user.Id);
            return AuthenticationError.InvalidConfirmationToken;
        }

        logger.LogInformation("Email confirmation completed for user {UserId}", user.Id);
        return AuthenticationError.None;
    }

    public async Task RequestPasswordResetAsync(string emailAddress, CancellationToken cancellationToken)
    {
        var user = await users.FindByEmailAsync(emailAddress);
        if (user is null || user.IsSuspended)
            return;

        var token = await users.GeneratePasswordResetTokenAsync(user);
        var url = $"{emailOptions.Value.PasswordResetUrl}?mode=reset&email={Uri.EscapeDataString(user.Email!)}&token={Uri.EscapeDataString(token)}";
        try
        {
            var html = EmailTemplate.Render(
                preheader: "اطلب كلمة سر جديدة خلال 24 ساعة",
                kicker: "استرجاع كلمة السر",
                heading: "نسيت كلمة السر؟ ولا يهمك",
                paragraphs:
                [
                    $"وصلنا طلب لتغيير كلمة السر لحساب ⁦{user.Email}⁩.",
                    "اضغط الزر اللي تحت واختر كلمة سر جديدة."
                ],
                accent: EmailAccent.Authority,
                ctaText: "تغيير كلمة السر ←",
                ctaUrl: url,
                notice: "الرابط صالح لمدة 24 ساعة ويشتغل مرة وحدة بس. إذا ما كنت أنت اللي طلب التغيير، تجاهل الرسالة وكلمة السر بتبقى زي ما هي.");
            await email.SendAsync(
                user.Email!,
                "إعادة تعيين كلمة السر — تفصيل",
                html,
                cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogError("Password reset email delivery failed for user {UserId}: {FailureType}",
                user.Id, exception.GetType().Name);
        }
    }

    public async Task<PasswordResetResult> ResetPasswordAsync(
        string emailAddress,
        string token,
        string password,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByEmailAsync(emailAddress);
        if (user is null || user.IsSuspended)
            return new(false);

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var result = await users.ResetPasswordAsync(user, token, password);
        if (!result.Succeeded)
        {
            await transaction.RollbackAsync(cancellationToken);
            return new(false, result.Errors.Select(x => x.Description).ToArray());
        }

        var activeTokens = await db.RefreshTokens
            .Where(x => x.UserId == user.Id && x.RevokedAt == null)
            .ToListAsync(cancellationToken);
        foreach (var refreshToken in activeTokens)
            refreshToken.RevokedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        logger.LogInformation("Password reset completed and sessions revoked for user {UserId}", user.Id);
        return new(true);
    }

    private async Task<bool> SendConfirmationAsync(
        ApplicationUser user,
        CancellationToken cancellationToken)
    {
        var token = await users.GenerateEmailConfirmationTokenAsync(user);
        var url = $"{emailOptions.Value.ConfirmationUrl}?mode=confirm&email={Uri.EscapeDataString(user.Email!)}&token={Uri.EscapeDataString(token)}";
        try
        {
            var html = EmailTemplate.Render(
                preheader: "خطوة وحدة وبس عشان تبدأ",
                kicker: "تأكيد الحساب",
                heading: $"أهلاً فيك يا {user.FullName}",
                paragraphs:
                [
                    "قبل لا تبدأ، لازم نتأكد إن هذا الإيميل مالك فعلاً.",
                    "اضغط الزر اللي تحت وحسابك بيتفعّل على طول."
                ],
                accent: EmailAccent.Warmth,
                ctaText: "تأكيد الإيميل ←",
                ctaUrl: url,
                notice: "الرابط صالح لمدة 24 ساعة. إذا ما كنت أنت اللي سجّل في تفصيل، تجاهل هذي الرسالة ولا شي بيصير.");
            await email.SendAsync(
                user.Email!,
                "أكّد إيميلك على تفصيل",
                html,
                cancellationToken);
            user.EmailConfirmationSentAt = clock.GetUtcNow();
            var updated = await users.UpdateAsync(user);
            if (!updated.Succeeded)
                throw new InvalidOperationException("Could not record email confirmation delivery.");
            logger.LogInformation("Email confirmation requested for user {UserId}", user.Id);
            return true;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogError("Email confirmation delivery failed for user {UserId}: {FailureType}",
                user.Id, exception.GetType().Name);
            return false;
        }
    }

    private async Task<string> ContainReplayAsync(
        RefreshToken replayed,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var activeFamily = await db.RefreshTokens
            .Where(x => x.UserId == replayed.UserId
                && x.FamilyId == replayed.FamilyId
                && x.RevokedAt == null)
            .ToListAsync(cancellationToken);
        if (activeFamily.Count == 0)
            return "already_contained";

        foreach (var token in activeFamily)
            token.RevokedAt = now;
        var invalidated = await users.UpdateSecurityStampAsync(replayed.User);
        if (!invalidated.Succeeded)
            throw new InvalidOperationException("Could not invalidate replayed token sessions.");
        return "contained";
    }

    private async Task<AuthenticationResult> ContainConcurrentReplayAsync(
        string tokenHash,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var replayed = await db.RefreshTokens.Include(x => x.User)
            .SingleOrDefaultAsync(x => x.TokenHash == tokenHash, cancellationToken);
        if (replayed is null)
            return new(null, AuthenticationError.InvalidRefreshToken);

        var outcome = await ContainReplayAsync(replayed, now, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        LogReplay(replayed, now, outcome);
        return new(null, AuthenticationError.RefreshTokenReused);
    }

    private void LogReplay(RefreshToken token, DateTimeOffset now, string outcome) =>
        logger.LogWarning(
            "Refresh token replay detected for user {UserId}, family {TokenFamilyId}, at {Timestamp}, outcome {Outcome}",
            token.UserId, token.FamilyId, now, outcome);

    private async Task<AuthenticationResult> IssueAsync(
        ApplicationUser user,
        RefreshToken? rotatedToken,
        CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var roles = await users.GetRolesAsync(user);
        var permissions = roles.SelectMany(Permissions.ForRole).Distinct(StringComparer.Ordinal);
        var expires = now.AddMinutes(_options.AccessTokenMinutes);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.Email, user.Email!),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new("name", user.FullName),
            new("security_stamp", user.SecurityStamp ?? "")
        };
        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));
        claims.AddRange(permissions.Select(permission => new Claim(Permissions.ClaimType, permission)));

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.SigningKey)),
            SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(
            _options.Issuer, _options.Audience, claims, now.UtcDateTime, expires.UtcDateTime, credentials);
        var accessToken = new JwtSecurityTokenHandler().WriteToken(jwt);

        var rawRefreshToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        var storedRefreshToken = new RefreshToken
        {
            TokenHash = Hash(rawRefreshToken),
            FamilyId = rotatedToken?.FamilyId ?? Guid.NewGuid().ToString(),
            UserId = user.Id,
            CreatedAt = now,
            ExpiresAt = now.AddDays(_options.RefreshTokenDays)
        };
        if (rotatedToken is not null)
            rotatedToken.ReplacedByTokenHash = storedRefreshToken.TokenHash;
        db.RefreshTokens.Add(storedRefreshToken);
        await db.SaveChangesAsync(cancellationToken);

        return new(new(
            user.Id, user.Email!, user.FullName, roles.ToArray(),
            accessToken, expires, rawRefreshToken, storedRefreshToken.ExpiresAt));
    }

    private static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
