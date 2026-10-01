using System.ComponentModel.DataAnnotations;
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
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Governance;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Messaging;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Email;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Identity;

internal sealed class AuthenticationService(
    UserManager<ApplicationUser> users,
    TafseelDbContext db,
    IFileStorageService files,
    IOptions<JwtOptions> options,
    IOptions<EmailOptions> emailOptions,
    IEmailSender email,
    ILogger<AuthenticationService> logger,
    TimeProvider clock) : IAuthenticationService
{
    private readonly JwtOptions _options = options.Value;

    /// <summary>A hash of a random throwaway password, verified against when there is no real one to check.</summary>
    private static readonly Lazy<string> DummyPasswordHash = new(() =>
        new PasswordHasher<ApplicationUser>().HashPassword(new ApplicationUser { FullName = "" }, Guid.NewGuid().ToString("N")));

    public async Task<RegistrationResult> RegisterAsync(
        RegisterCommand command,
        CancellationToken cancellationToken)
    {
        if (!string.Equals(command.PolicyVersion, PolicyVersions.Current, StringComparison.Ordinal))
            return new(false, AuthenticationError.PolicyNotAccepted);
        if (!Roles.PublicRegistration.Contains(command.Role, StringComparer.Ordinal))
        {
            logger.LogInformation("Registration denied with outcome {Outcome}", "invalid_role");
            return new(false, AuthenticationError.InvalidRole);
        }

        // Validate before looking up the email: an invalid password must have the same answer
        // whether or not that address already belongs to an account.
        var candidate = new ApplicationUser
        {
            UserName = command.Email.Trim(),
            Email = command.Email.Trim(),
            FullName = command.FullName.Trim(),
            AcceptedPolicyVersion = PolicyVersions.Current,
            PoliciesAcceptedAt = clock.GetUtcNow()
        };
        var passwordErrors = new List<string>();
        foreach (var validator in users.PasswordValidators)
        {
            var validation = await validator.ValidateAsync(users, candidate, command.Password);
            if (!validation.Succeeded)
                passwordErrors.AddRange(validation.Errors.Select(error => error.Description));
        }
        if (passwordErrors.Count > 0)
            return new(false, AuthenticationError.RegistrationFailed, passwordErrors);

        if (await users.FindByEmailAsync(command.Email) is { } existing)
        {
            // Answer exactly as for a new account, so the endpoint cannot be used to learn which
            // emails are registered; the owner hears about it by email instead.
            logger.LogInformation("Registration denied with outcome {Outcome}", "existing_account");
            await NotifyExistingAccountAsync(existing, command.Lang, cancellationToken);
            return new(true);
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var user = candidate;
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

        // The language they signed up in, so later e-mails (notifications) speak it too. A user claim needs no schema.
        var language = await users.AddClaimAsync(user, new Claim(UserLanguage.ClaimType, UserLanguage.Normalize(command.Lang)));
        if (!language.Succeeded)
            logger.LogWarning("Registration could not record the language for user {UserId}", user.Id);

        await transaction.CommitAsync(cancellationToken);
        logger.LogInformation("Registration completed for user {UserId} with role {Role}", user.Id, command.Role);
        if (!await SendConfirmationAsync(user, command.Lang, cancellationToken))
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
            // Spend the same PBKDF2 work a real check costs, so response time does not tell an
            // unknown or locked email apart from a wrong password.
            users.PasswordHasher.VerifyHashedPassword(user ?? new ApplicationUser { FullName = "" }, DummyPasswordHash.Value, command.Password);
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
        // The failed-attempt counter is cleared only once every factor has passed (below). Clearing
        // it here, on the password alone, let a wrong authenticator code cost nothing: the next
        // right password wiped the count, so lockout never fired against a guessed second factor.
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
        if (user.TwoFactorEnabled)
        {
            if (string.IsNullOrWhiteSpace(command.Code))
                return new(null, AuthenticationError.MfaRequired);
            var cleanCode = command.Code.Replace(" ", "").Replace("-", "");
            var validCode = await users.VerifyTwoFactorTokenAsync(
                user, TokenOptions.DefaultAuthenticatorProvider, cleanCode);
            if (!validCode)
                validCode = (await users.RedeemTwoFactorRecoveryCodeAsync(user, cleanCode)).Succeeded;
            if (!validCode)
            {
                await users.AccessFailedAsync(user);
                logger.LogInformation("Login denied for user {UserId} with outcome {Outcome}", user.Id, "invalid_mfa_code");
                return new(null, AuthenticationError.InvalidMfaCode);
            }
        }

        await users.ResetAccessFailedCountAsync(user);
        return await IssueAsync(user, null, command.RememberMe, cancellationToken);
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
            var result = await IssueAsync(stored.User, stored, stored.Persistent, cancellationToken);
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

    public async Task<IReadOnlyList<AccountSession>> GetSessionsAsync(
        string userId, string? currentRefreshToken, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var currentHash = string.IsNullOrWhiteSpace(currentRefreshToken) ? null : Hash(currentRefreshToken);
        var tokens = await db.RefreshTokens.AsNoTracking()
            .Where(x => x.UserId == userId && x.RevokedAt == null)
            .ToListAsync(cancellationToken);
        tokens = tokens.Where(x => x.ExpiresAt > now)
            .OrderByDescending(x => x.CreatedAt)
            .ToList();
        var currentFamily = tokens.FirstOrDefault(x => x.TokenHash == currentHash)?.FamilyId;
        return tokens.GroupBy(x => x.FamilyId)
            .Select(family => new AccountSession(
                family.Key,
                family.Min(x => x.CreatedAt),
                family.Max(x => x.ExpiresAt),
                family.Key == currentFamily))
            .OrderByDescending(x => x.IsCurrent)
            .ThenByDescending(x => x.CreatedAt)
            .ToArray();
    }

    public async Task<bool> RevokeSessionAsync(
        string userId, string sessionId, CancellationToken cancellationToken)
    {
        var tokens = await db.RefreshTokens
            .Where(x => x.UserId == userId && x.FamilyId == sessionId && x.RevokedAt == null)
            .ToListAsync(cancellationToken);
        if (tokens.Count == 0)
            return false;
        var now = clock.GetUtcNow();
        foreach (var token in tokens)
            token.RevokedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Session revoked for user {UserId}, family {TokenFamilyId}", userId, sessionId);
        return true;
    }

    public async Task<object?> ExportAccountAsync(string userId, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null)
            return null;
        var roles = await users.GetRolesAsync(user);
        var conversationIds = await db.Set<ConversationParticipant>().AsNoTracking()
            .Where(x => x.UserId == userId).Select(x => x.ConversationId)
            .ToArrayAsync(cancellationToken);
        var messageIds = await db.Messages.AsNoTracking()
            .Where(x => conversationIds.Contains(x.ConversationId)).Select(x => x.Id)
            .ToArrayAsync(cancellationToken);
        var requestIds = await db.LearningRequests.AsNoTracking()
            .Where(x => x.StudentId == userId || x.TeacherId == userId).Select(x => x.Id)
            .ToArrayAsync(cancellationToken);
        var orderIds = await db.Orders.AsNoTracking()
            .Where(x => x.StudentId == userId || x.TeacherId == userId).Select(x => x.Id)
            .ToArrayAsync(cancellationToken);
        var sessionIds = await db.LiveSessionBookings.AsNoTracking()
            .Where(x => x.StudentId == userId || x.TeacherId == userId).Select(x => x.Id)
            .ToArrayAsync(cancellationToken);
        var disputeIds = await db.Disputes.AsNoTracking()
            .Where(x => x.StudentId == userId || x.TeacherId == userId).Select(x => x.Id)
            .ToArrayAsync(cancellationToken);
        var paymentIds = await db.Payments.AsNoTracking()
            .Where(x => x.StudentId == userId).Select(x => x.Id)
            .ToArrayAsync(cancellationToken);
        return new
        {
            schemaVersion = "2026-08-13",
            generatedAt = clock.GetUtcNow(),
            account = new
            {
                user.Id,
                user.Email,
                user.FullName,
                user.FullNameEnglish,
                roles,
                user.PhoneNumber,
                user.EmailConfirmed,
                user.TwoFactorEnabled,
                user.CreatedAt,
                user.AcceptedPolicyVersion,
                user.PoliciesAcceptedAt
            },
            studentLearningPreference = await db.StudentLearningPreferences.AsNoTracking()
                .SingleOrDefaultAsync(x => x.UserId == userId, cancellationToken),
            teacherProfile = await db.TeacherProfiles.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TeacherId == userId, cancellationToken),
            teacherApplications = await db.TeacherApplications.AsNoTracking()
                .Where(x => x.TeacherId == userId)
                .Select(x => new
                {
                    x.Id,
                    x.SubjectId,
                    x.QualificationTopicId,
                    x.City,
                    x.ExperienceYears,
                    x.Degree,
                    x.Status,
                    x.Priority,
                    x.CreatedAt,
                    x.SubmittedAt,
                    x.DemoDurationSeconds
                }).ToArrayAsync(cancellationToken),
            teacherQualifications = await db.TeacherSubjectQualifications.AsNoTracking()
                .Where(x => x.TeacherId == userId).ToArrayAsync(cancellationToken),
            teacherServices = await db.TeacherServices.AsNoTracking()
                .Where(x => x.TeacherId == userId).ToArrayAsync(cancellationToken),
            teacherAvailabilityRules = await db.TeacherAvailabilityRules.AsNoTracking()
                .Where(x => x.TeacherId == userId).ToArrayAsync(cancellationToken),
            teacherAvailabilityExceptions = await db.TeacherAvailabilityExceptions.AsNoTracking()
                .Where(x => x.TeacherId == userId).ToArrayAsync(cancellationToken),
            teacherCertifications = await db.TeacherCertifications.AsNoTracking()
                .Where(x => x.TeacherId == userId).ToArrayAsync(cancellationToken),
            teacherExperiences = await db.TeacherExperiences.AsNoTracking()
                .Where(x => x.TeacherId == userId).ToArrayAsync(cancellationToken),
            payoutProfile = await db.TeacherPayoutProfiles.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TeacherId == userId, cancellationToken),
            favoriteTeachers = await db.FavoriteTeachers.AsNoTracking()
                .Where(x => x.StudentId == userId).ToArrayAsync(cancellationToken),
            learningRequests = await db.LearningRequests.AsNoTracking()
                .Where(x => x.StudentId == userId || x.TeacherId == userId).ToArrayAsync(cancellationToken),
            learningRequestAttachments = await db.LearningRequestAttachments.AsNoTracking()
                .Where(x => requestIds.Contains(x.LearningRequestId)).ToArrayAsync(cancellationToken),
            orders = await db.Orders.AsNoTracking()
                .Where(x => x.StudentId == userId || x.TeacherId == userId).ToArrayAsync(cancellationToken),
            orderDeliveries = await db.OrderDeliveries.AsNoTracking()
                .Where(x => orderIds.Contains(x.OrderId)).ToArrayAsync(cancellationToken),
            liveSessions = await db.LiveSessionBookings.AsNoTracking()
                .Where(x => x.StudentId == userId || x.TeacherId == userId).ToArrayAsync(cancellationToken),
            liveSessionAttachments = await db.LiveSessionAttachments.AsNoTracking()
                .Where(x => sessionIds.Contains(x.LiveSessionBookingId)).ToArrayAsync(cancellationToken),
            disputes = await db.Disputes.AsNoTracking()
                .Where(x => x.StudentId == userId || x.TeacherId == userId).ToArrayAsync(cancellationToken),
            disputeEvidence = await db.DisputeEvidence.AsNoTracking()
                .Where(x => disputeIds.Contains(x.DisputeId)).ToArrayAsync(cancellationToken),
            conversations = await db.Conversations.AsNoTracking()
                .Where(x => conversationIds.Contains(x.Id)).ToArrayAsync(cancellationToken),
            messages = await db.Messages.AsNoTracking()
                .Where(x => conversationIds.Contains(x.ConversationId)).ToArrayAsync(cancellationToken),
            messageAttachments = await db.MessageAttachments.AsNoTracking()
                .Where(x => messageIds.Contains(x.MessageId)).ToArrayAsync(cancellationToken),
            reviews = await db.TeacherReviews.AsNoTracking()
                .Where(x => x.StudentId == userId || x.TeacherId == userId).ToArrayAsync(cancellationToken),
            notifications = await db.Notifications.AsNoTracking()
                .Where(x => x.UserId == userId).ToArrayAsync(cancellationToken),
            notificationPreference = await db.UserNotificationPreferences.AsNoTracking()
                .SingleOrDefaultAsync(x => x.UserId == userId, cancellationToken),
            payments = await db.Payments.AsNoTracking()
                .Where(x => x.StudentId == userId).ToArrayAsync(cancellationToken),
            refunds = await db.Refunds.AsNoTracking()
                .Where(x => paymentIds.Contains(x.PaymentId)).ToArrayAsync(cancellationToken),
            withdrawals = await db.WithdrawalRequests.AsNoTracking()
                .Where(x => x.TeacherId == userId).ToArrayAsync(cancellationToken),
            marketplaceInteractions = await db.MarketplaceInteractionEvents.AsNoTracking()
                .Where(x => x.AuthenticatedUserId == userId).ToArrayAsync(cancellationToken)
        };
    }

    public async Task<AccountDeletionResult> DeleteAccountAsync(
        string userId, string password, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null || !await users.CheckPasswordAsync(user, password))
            return new(false, AccountDeletionError.IncorrectPassword);

        var hasActiveOrder = await db.Orders.AnyAsync(x =>
            (x.StudentId == userId || x.TeacherId == userId)
            && x.Status != OrderStatus.Completed && x.Status != OrderStatus.Cancelled, cancellationToken);
        var hasActiveSession = await db.LiveSessionBookings.AnyAsync(x =>
            (x.StudentId == userId || x.TeacherId == userId)
            && x.Status != LiveSessionStatus.Completed && x.Status != LiveSessionStatus.Cancelled
            && x.Status != LiveSessionStatus.StudentNoShow && x.Status != LiveSessionStatus.TeacherNoShow,
            cancellationToken);
        var hasOpenDispute = await db.Disputes.AnyAsync(x =>
            (x.StudentId == userId || x.TeacherId == userId) && x.Status != DisputeStatus.Resolved,
            cancellationToken);
        var hasPendingWithdrawal = await db.WithdrawalRequests.AnyAsync(x =>
            x.TeacherId == userId && (x.Status == WithdrawalStatus.Pending || x.Status == WithdrawalStatus.TransferInitiated), cancellationToken);
        var accountIds = await db.LedgerAccounts.AsNoTracking()
            .Where(x => x.OwnerId == userId).Select(x => x.Id).ToArrayAsync(cancellationToken);
        var credits = accountIds.Length == 0 ? 0 : await db.LedgerEntries
            .Where(x => accountIds.Contains(x.CreditAccountId))
            .SumAsync(x => (decimal?)x.Amount, cancellationToken) ?? 0;
        var debits = accountIds.Length == 0 ? 0 : await db.LedgerEntries
            .Where(x => accountIds.Contains(x.DebitAccountId))
            .SumAsync(x => (decimal?)x.Amount, cancellationToken) ?? 0;
        var hasBalance = credits != debits;
        if (hasActiveOrder || hasActiveSession || hasOpenDispute || hasPendingWithdrawal || hasBalance)
            return new(false, AccountDeletionError.ActiveCommitments);

        var now = clock.GetUtcNow();
        var avatarKey = user.AvatarStorageKey;
        var replacement = $"deleted-{Guid.NewGuid():N}@invalid.local";

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var notificationIds = db.Notifications.Where(x => x.UserId == userId).Select(x => x.Id);
        await db.NotificationOutbox.Where(x => notificationIds.Contains(x.NotificationId))
            .ExecuteDeleteAsync(cancellationToken);
        await db.Notifications.Where(x => x.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await db.UserNotificationPreferences.Where(x => x.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await db.StudentLearningPreferences.Where(x => x.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await db.FavoriteTeachers.Where(x => x.StudentId == userId).ExecuteDeleteAsync(cancellationToken);
        await db.MarketplaceInteractionEvents.Where(x => x.AuthenticatedUserId == userId)
            .ExecuteDeleteAsync(cancellationToken);
        await db.TeacherPayoutProfiles.Where(x => x.TeacherId == userId).ExecuteDeleteAsync(cancellationToken);
        await db.RefreshTokens.Where(x => x.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await db.UserClaims.Where(x => x.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await db.UserLogins.Where(x => x.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await db.UserTokens.Where(x => x.UserId == userId).ExecuteDeleteAsync(cancellationToken);

        var teacherProfile = await db.TeacherProfiles.SingleOrDefaultAsync(
            x => x.TeacherId == userId, cancellationToken);
        teacherProfile?.Anonymize(now);
        foreach (var service in await db.TeacherServices.Where(x => x.TeacherId == userId)
                     .ToArrayAsync(cancellationToken))
            service.SetActive(false, now);
        foreach (var sample in await db.TeacherTeachingSamples.Where(x => x.TeacherId == userId)
                     .ToArrayAsync(cancellationToken))
            sample.HideForQualificationRevocation(now);

        user.FullName = "Deleted account";
        user.FullNameEnglish = "Deleted account";
        user.Email = replacement;
        user.UserName = replacement;
        user.PhoneNumber = null;
        user.PasswordHash = null;
        user.AvatarStorageKey = null;
        user.AvatarContentType = null;
        user.IsSuspended = true;
        user.EmailConfirmed = false;
        user.TwoFactorEnabled = false;
        user.LockoutEnabled = true;
        user.LockoutEnd = DateTimeOffset.MaxValue;
        user.SecurityStamp = Guid.NewGuid().ToString();
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            await transaction.RollbackAsync(cancellationToken);
            return new(false, AccountDeletionError.UpdateFailed,
                result.Errors.Select(x => x.Description).ToArray());
        }
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(avatarKey))
        {
            try { await files.DeletePrivateFileAsync(avatarKey, cancellationToken); }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogWarning(exception,
                    "Account was anonymized but avatar cleanup failed for user {UserId}", userId);
            }
        }
        logger.LogInformation("Account identity anonymized for user {UserId}", userId);
        return new(true);
    }

    public async Task<MfaSetup?> BeginMfaSetupAsync(string userId, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null || user.IsSuspended)
            return null;
        var key = await users.GetAuthenticatorKeyAsync(user);
        if (string.IsNullOrWhiteSpace(key))
        {
            await users.ResetAuthenticatorKeyAsync(user);
            key = await users.GetAuthenticatorKeyAsync(user);
        }
        var issuer = Uri.EscapeDataString("Tafseel");
        var account = Uri.EscapeDataString(user.Email ?? user.Id);
        return new(key!, $"otpauth://totp/{issuer}:{account}?secret={key}&issuer={issuer}&digits=6");
    }

    public async Task<MfaEnableResult> EnableMfaAsync(
        string userId, string code, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null)
            return new(false);
        var valid = await users.VerifyTwoFactorTokenAsync(
            user, TokenOptions.DefaultAuthenticatorProvider, code.Replace(" ", "").Replace("-", ""));
        if (!valid)
            return new(false);
        await users.SetTwoFactorEnabledAsync(user, true);
        var recoveryCodes = await users.GenerateNewTwoFactorRecoveryCodesAsync(user, 8);
        await RevokeAllSessionsAsync(userId, cancellationToken);
        return new(true, recoveryCodes?.ToArray());
    }

    public async Task<bool> DisableMfaAsync(
        string userId, string password, string code, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null || !user.TwoFactorEnabled || !await users.CheckPasswordAsync(user, password))
            return false;
        var cleanCode = code.Replace(" ", "").Replace("-", "");
        var valid = await users.VerifyTwoFactorTokenAsync(
            user, TokenOptions.DefaultAuthenticatorProvider, cleanCode);
        if (!valid)
            valid = (await users.RedeemTwoFactorRecoveryCodeAsync(user, cleanCode)).Succeeded;
        if (!valid)
            return false;
        await users.SetTwoFactorEnabledAsync(user, false);
        await users.ResetAuthenticatorKeyAsync(user);
        await RevokeAllSessionsAsync(userId, cancellationToken);
        return true;
    }

    private async Task RevokeAllSessionsAsync(string userId, CancellationToken cancellationToken)
    {
        var active = await db.RefreshTokens.Where(x => x.UserId == userId && x.RevokedAt == null)
            .ToListAsync(cancellationToken);
        var now = clock.GetUtcNow();
        foreach (var token in active)
            token.RevokedAt = now;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<CurrentUser?> GetUserAsync(string userId, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null)
            return null;

        return MapCurrent(user, await users.GetRolesAsync(user));
    }

    public async Task<CurrentUser?> UpdateProfileAsync(
        string userId, string fullName, string fullNameEnglish, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null)
            return null;

        user.FullName = fullName.Trim();
        user.FullNameEnglish = fullNameEnglish.Trim();
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded)
            throw new ValidationException(string.Join("; ", result.Errors.Select(x => x.Description)));

        return MapCurrent(user, await users.GetRolesAsync(user));
    }

    public async Task<bool> SetLanguageAsync(string userId, string lang, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null)
            return false;
        var value = UserLanguage.Normalize(lang);
        var existing = (await users.GetClaimsAsync(user)).Where(x => x.Type == UserLanguage.ClaimType).ToArray();
        if (existing.Length == 1 && existing[0].Value == value)
            return true;
        if (existing.Length > 0)
            await users.RemoveClaimsAsync(user, existing);
        var added = await users.AddClaimAsync(user, new Claim(UserLanguage.ClaimType, value));
        return added.Succeeded;
    }

    public async Task<CurrentUser?> SetAvatarAsync(
        string userId, Stream stream, string fileName, string contentType, long size, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null || user.IsSuspended)
            return null;

        var stored = await files.StoreAvatarAsync(stream, fileName, contentType, size, cancellationToken);
        var previousKey = user.AvatarStorageKey;
        user.AvatarStorageKey = stored.StorageKey;
        user.AvatarContentType = stored.ContentType;
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            await files.DeletePrivateFileAsync(stored.StorageKey, cancellationToken);
            throw new ValidationException(string.Join("; ", result.Errors.Select(x => x.Description)));
        }

        if (!string.IsNullOrWhiteSpace(previousKey))
            await files.DeletePrivateFileAsync(previousKey, cancellationToken);

        return MapCurrent(user, await users.GetRolesAsync(user));
    }

    public async Task<CurrentUser?> ClearAvatarAsync(string userId, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null)
            return null;

        var previousKey = user.AvatarStorageKey;
        user.AvatarStorageKey = null;
        user.AvatarContentType = null;
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded)
            throw new ValidationException(string.Join("; ", result.Errors.Select(x => x.Description)));

        if (!string.IsNullOrWhiteSpace(previousKey))
            await files.DeletePrivateFileAsync(previousKey, cancellationToken);

        return MapCurrent(user, await users.GetRolesAsync(user));
    }

    public async Task<AvatarFile?> OpenAvatarAsync(string userId, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null || string.IsNullOrWhiteSpace(user.AvatarStorageKey))
            return null;

        var content = await files.OpenPrivateFileAsync(user.AvatarStorageKey, cancellationToken);
        return new(content, user.AvatarContentType ?? "image/jpeg");
    }

    private static CurrentUser MapCurrent(ApplicationUser user, IList<string> roles) =>
        new(user.Id, user.Email!, user.FullName, user.FullNameEnglish, roles.ToArray(), user.HasAvatar,
            user.TwoFactorEnabled);

    public async Task<PasswordResetResult> ChangePasswordAsync(
        string userId,
        string currentPassword,
        string newPassword,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(userId);
        if (user is null || user.IsSuspended)
            return new(false);

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var result = await users.ChangePasswordAsync(user, currentPassword, newPassword);
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
        logger.LogInformation("Password changed and sessions revoked for user {UserId}", user.Id);
        return new(true);
    }

    public async Task RequestEmailConfirmationAsync(string emailAddress, string lang, CancellationToken cancellationToken)
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

        await SendConfirmationAsync(user, lang, cancellationToken);
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

    public async Task RequestPasswordResetAsync(string emailAddress, string lang, CancellationToken cancellationToken)
    {
        var user = await users.FindByEmailAsync(emailAddress);
        if (user is null || user.IsSuspended)
            return;

        var isEnglish = lang == "en";
        var token = await users.GeneratePasswordResetTokenAsync(user);
        var url = $"{emailOptions.Value.PasswordResetUrl}?mode=reset&email={Uri.EscapeDataString(user.Email!)}&token={Uri.EscapeDataString(token)}";
        try
        {
            var html = EmailTemplate.Render(
                preheader: isEnglish ? "Reset your password within 24 hours" : "اطلب كلمة سر جديدة خلال 24 ساعة",
                kicker: isEnglish ? "Password reset" : "استرجاع كلمة السر",
                heading: isEnglish ? "Forgot your password? No worries" : "نسيت كلمة السر؟ ولا يهمك",
                paragraphs: isEnglish
                    ?
                    [
                        $"We got a request to reset the password for ⁦{user.Email}⁩.",
                        "Tap the button below and pick a new password."
                    ]
                    :
                    [
                        $"وصلنا طلب لتغيير كلمة السر لحساب ⁦{user.Email}⁩.",
                        "اضغط الزر اللي تحت واختر كلمة سر جديدة."
                    ],
                appBaseUrl: emailOptions.Value.AppBaseUrl,
                accent: EmailAccent.Authority,
                ctaText: isEnglish ? "Reset password →" : "تغيير كلمة السر ←",
                ctaUrl: url,
                notice: isEnglish
                    ? "This link is valid for 24 hours and works only once. If you didn't request this, just ignore the email — your password stays the same."
                    : "الرابط صالح لمدة 24 ساعة ويشتغل مرة وحدة بس. إذا ما كنت أنت اللي طلب التغيير، تجاهل الرسالة وكلمة السر بتبقى زي ما هي.",
                lang: lang);
            await email.SendAsync(
                user.Email!,
                isEnglish ? "Reset your password — Tafseel" : "إعادة تعيين كلمة السر — تفصيل",
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

    /// <summary>
    /// Someone tried to register an email that already has an account. An unconfirmed owner gets
    /// the confirmation again (with the usual two-minute spacing); a confirmed owner gets a notice
    /// pointing to sign-in and password reset. A suspended account hears nothing.
    /// </summary>
    private async Task NotifyExistingAccountAsync(ApplicationUser user, string lang, CancellationToken cancellationToken)
    {
        if (user.IsSuspended)
            return;
        if (!await users.IsEmailConfirmedAsync(user))
        {
            if (user.EmailConfirmationSentAt <= clock.GetUtcNow().AddMinutes(-2))
                await SendConfirmationAsync(user, lang, cancellationToken);
            return;
        }

        var isEnglish = lang == "en";
        var signIn = $"{emailOptions.Value.AppBaseUrl.TrimEnd('/')}/{(isEnglish ? "en" : "ar")}/auth";
        try
        {
            var html = EmailTemplate.Render(
                preheader: isEnglish ? "This email already has a Tafseel account" : "هذا الإيميل عنده حساب في تفصيل من قبل",
                kicker: isEnglish ? "Account already exists" : "الحساب موجود",
                heading: isEnglish ? "You already have an account" : "عندك حساب من قبل",
                paragraphs: isEnglish
                    ?
                    [
                        $"Someone just tried to create a new Tafseel account with ⁦{user.Email}⁩, an address that is already registered.",
                        "If that was you, sign in instead. Forgot the password? Use \"Forgot password?\" on the sign-in page."
                    ]
                    :
                    [
                        $"أحد حاول الحين يسوي حساب جديد في تفصيل بالإيميل ⁦{user.Email}⁩، وهذا الإيميل مسجّل عندنا من قبل.",
                        "إذا كنت أنت، سجّل دخول بدل ما تسوي حساب جديد. نسيت كلمة السر؟ اضغط \"نسيت كلمة السر؟\" في صفحة الدخول."
                    ],
                appBaseUrl: emailOptions.Value.AppBaseUrl,
                accent: EmailAccent.Authority,
                ctaText: isEnglish ? "Sign in →" : "تسجيل الدخول ←",
                ctaUrl: signIn,
                notice: isEnglish
                    ? "If this wasn't you, you can ignore this email — nothing about your account changed."
                    : "إذا ما كنت أنت، تجاهل الرسالة — ما تغيّر شي في حسابك.",
                lang: lang);
            await email.SendAsync(
                user.Email!,
                isEnglish ? "You already have a Tafseel account" : "عندك حساب في تفصيل من قبل",
                html,
                cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogError("Existing-account notice delivery failed for user {UserId}: {FailureType}",
                user.Id, exception.GetType().Name);
        }
    }

    private async Task<bool> SendConfirmationAsync(
        ApplicationUser user,
        string lang,
        CancellationToken cancellationToken)
    {
        var isEnglish = lang == "en";
        var token = await users.GenerateEmailConfirmationTokenAsync(user);
        var url = $"{emailOptions.Value.ConfirmationUrl}?mode=confirm&email={Uri.EscapeDataString(user.Email!)}&token={Uri.EscapeDataString(token)}";
        try
        {
            var html = EmailTemplate.Render(
                preheader: isEnglish ? "One quick step to get started" : "خطوة وحدة وبس عشان تبدأ",
                kicker: isEnglish ? "Confirm your account" : "تأكيد الحساب",
                heading: isEnglish ? $"Welcome, {user.FullName}" : $"أهلاً فيك يا {user.FullName}",
                paragraphs: isEnglish
                    ?
                    [
                        "Before you dive in, we just need to make sure this email is really yours.",
                        "Tap the button below and your account is good to go."
                    ]
                    :
                    [
                        "قبل لا تبدأ، لازم نتأكد إن هذا الإيميل لك فعلاً.",
                        "اضغط الزر اللي تحت وحسابك بيتفعّل على طول."
                    ],
                appBaseUrl: emailOptions.Value.AppBaseUrl,
                accent: EmailAccent.Warmth,
                ctaText: isEnglish ? "Confirm email →" : "تأكيد الإيميل ←",
                ctaUrl: url,
                notice: isEnglish
                    ? "This link is valid for 24 hours. If you didn't sign up for Tafseel, just ignore this email — nothing will happen."
                    : "الرابط صالح لمدة 24 ساعة. إذا ما كنت أنت اللي سجّل في تفصيل، تجاهل هذي الرسالة ولا شي بيصير.",
                lang: lang);
            await email.SendAsync(
                user.Email!,
                isEnglish ? "Confirm your email on Tafseel" : "أكّد إيميلك على تفصيل",
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
        bool persistent,
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
            ExpiresAt = persistent
                ? now.AddDays(_options.RefreshTokenDays)
                : now.AddHours(_options.SessionRefreshHours),
            Persistent = persistent
        };
        if (rotatedToken is not null)
            rotatedToken.ReplacedByTokenHash = storedRefreshToken.TokenHash;
        db.RefreshTokens.Add(storedRefreshToken);
        await db.SaveChangesAsync(cancellationToken);

        return new(new(
            user.Id, user.Email!, user.FullName, user.FullNameEnglish, roles.ToArray(),
            accessToken, expires, rawRefreshToken, storedRefreshToken.ExpiresAt, user.HasAvatar,
            user.TwoFactorEnabled, persistent));
    }

    private static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
