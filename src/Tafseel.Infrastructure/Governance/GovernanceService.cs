using System.Data;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Tafseel.Application.Authorization;
using Tafseel.Application.Common;
using Tafseel.Application.Finance;
using Tafseel.Application.Governance;
using Tafseel.Application.Orders;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Governance;
using Tafseel.Domain.Orders;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Governance;

internal sealed class GovernanceService(
    TafseelDbContext db,
    IFileStorageService files,
    IFinancialService finance,
    NotificationWriter notifications,
    AuditWriter audit,
    IOptions<DisputeOptions> options,
    TimeProvider clock) : IGovernanceService
{
    private readonly DisputeOptions _options = options.Value;

    public async Task<ReviewDto> CreateReviewAsync(
        string studentId, Guid orderId, CreateReview input, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"review:{orderId}", ct);
        var order = await db.Orders.AsNoTracking().SingleOrDefaultAsync(
                x => x.Id == orderId && x.StudentId == studentId, ct)
            ?? throw new DomainException("order_not_owned", "Order was not found.");
        await LockAsync($"teacher-rating:{order.TeacherId}", ct);
        if (order.Status != OrderStatus.Completed || order.PaymentStatus != OrderPaymentStatus.Paid)
            throw new DomainException("review_not_allowed", "Only a completed paid Order can be reviewed.");
        if (await db.TeacherReviews.AnyAsync(x => x.OrderId == orderId, ct))
            throw new DomainException("duplicate_review", "This Order was already reviewed.");
        var review = new TeacherReview(order.Id, studentId, order.TeacherId,
            input.ExplanationClarity, input.SubjectKnowledge, input.Communication,
            input.OnTimeDelivery, input.ValueForMoney, input.Comment, input.Recommends, clock.GetUtcNow());
        db.Add(review);
        await db.SaveChangesAsync(ct);
        await RefreshRatingAsync(order.TeacherId, ct);
        audit.Add(studentId, "ReviewCreated", "TeacherReview", review.Id.ToString(),
            "Completed-order review created.", $"review:{review.Id}");
        await notifications.QueueAsync(order.TeacherId, "Review", "New review received",
            "A Student reviewed a completed Order.", $"/teacher/reviews/{review.Id}",
            $"review:{review.Id}:teacher", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(review);
    }

    public async Task<PagedResult<ReviewDto>> GetTeacherReviewsAsync(
        string teacherId, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.TeacherReviews.Where(x => x.TeacherId == teacherId && x.IsVisible);
        var total = await query.CountAsync(ct);
        var items = await query.AsNoTracking().OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(items.Select(Map).ToArray(), page, pageSize, total);
    }

    public async Task ModerateReviewAsync(
        string adminId, Guid id, ModerateReview input, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var review = await db.TeacherReviews.Include(x => x.Moderation)
            .SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("review_not_found", "Review was not found.");
        await LockAsync($"teacher-rating:{review.TeacherId}", ct);
        review.Moderate(adminId, input.Visible, input.Reason, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
        await RefreshRatingAsync(review.TeacherId, ct);
        audit.Add(adminId, "ReviewModerated", "TeacherReview", review.Id.ToString(),
            input.Visible ? "Review restored." : "Review hidden.", $"review:{review.Id}:moderation:{review.Moderation.Count}");
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task<DisputeDto> OpenDisputeAsync(
        string userId, OpenDispute input, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"dispute-order:{input.OrderId}", ct);
        var order = await db.Orders.AsNoTracking().SingleOrDefaultAsync(x =>
                x.Id == input.OrderId && (x.StudentId == userId || x.TeacherId == userId), ct)
            ?? throw new DomainException("order_not_owned", "Order was not found.");
        if (order.PaymentStatus != OrderPaymentStatus.Paid
            || order.Status is not (OrderStatus.InProgress or OrderStatus.Delivered or OrderStatus.RevisionRequested)
            || order.UpdatedAt < clock.GetUtcNow().AddDays(-_options.WindowDays))
            throw new DomainException("dispute_not_allowed", "This Order is not eligible for a held-escrow dispute.");
        if (await db.Disputes.AnyAsync(x => x.OrderId == order.Id, ct))
            throw new DomainException("duplicate_dispute", "A dispute already exists for this Order.");
        var dispute = new Dispute(order.Id, order.StudentId, order.TeacherId, userId, input.Reason, clock.GetUtcNow());
        db.Add(dispute);
        audit.Add(userId, "DisputeOpened", "Dispute", dispute.Id.ToString(),
            "Held-escrow dispute opened.", $"dispute:{dispute.Id}:opened");
        var other = userId == order.StudentId ? order.TeacherId : order.StudentId;
        await notifications.QueueAsync(other, "Dispute", "Dispute opened",
            "A dispute was opened for your Order.", $"/disputes/{dispute.Id}",
            $"dispute:{dispute.Id}:opened:{other}", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(dispute);
    }

    public async Task<PagedResult<DisputeDto>> GetDisputesAsync(
        string userId, bool admin, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Disputes.AsQueryable();
        if (!admin) query = query.Where(x => x.StudentId == userId || x.TeacherId == userId);
        var total = await query.CountAsync(ct);
        var items = await query.AsNoTracking().OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Include(x => x.Messages).Include(x => x.Evidence).Include(x => x.Decisions)
            .AsSplitQuery().ToArrayAsync(ct);
        return new(items.Select(Map).ToArray(), page, pageSize, total);
    }

    public async Task AddDisputeMessageAsync(
        string userId, Guid id, AddDisputeMessage input, string version, CancellationToken ct)
    {
        var dispute = await OwnedDisputeAsync(userId, id, version, ct);
        dispute.AddMessage(userId, input.Body, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }

    public async Task<AttachmentDto> AddEvidenceAsync(
        string userId, Guid id, Stream stream, string fileName, string contentType,
        long size, string version, CancellationToken ct)
    {
        var dispute = await OwnedDisputeAsync(userId, id, version, ct);
        var stored = await files.StorePrivateFileAsync(
            stream, fileName, contentType, size, "dispute-evidence", ct);
        try
        {
            dispute.AddEvidence(userId, stored.StorageKey, SafeName(fileName),
                stored.ContentType, stored.Size, clock.GetUtcNow());
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            await files.DeletePrivateFileAsync(stored.StorageKey, CancellationToken.None);
            throw;
        }
        var evidence = dispute.Evidence.Last();
        return new(evidence.Id, evidence.OriginalName, evidence.ContentType, evidence.Size, evidence.CreatedAt);
    }

    public async Task<PrivateFile> OpenEvidenceAsync(
        string userId, Guid id, bool admin, CancellationToken ct)
    {
        var item = await (
            from evidence in db.DisputeEvidence.AsNoTracking()
            join dispute in db.Disputes.AsNoTracking() on evidence.DisputeId equals dispute.Id
            where evidence.Id == id && (admin || dispute.StudentId == userId || dispute.TeacherId == userId)
            select new { evidence.StorageKey, evidence.ContentType, evidence.OriginalName })
            .SingleOrDefaultAsync(ct)
            ?? throw new DomainException("evidence_not_owned", "Evidence was not found.");
        return new(await files.OpenPrivateFileAsync(item.StorageKey, ct), item.ContentType, item.OriginalName);
    }

    public async Task StartDisputeReviewAsync(
        string adminId, Guid id, string version, CancellationToken ct)
    {
        var dispute = await RequiredDisputeAsync(id, ct);
        ApplyVersion(dispute, version);
        dispute.StartReview(adminId, clock.GetUtcNow());
        audit.Add(adminId, "DisputeReviewStarted", "Dispute", id.ToString(),
            "Dispute review started.", $"dispute:{id}:review");
        await db.SaveChangesAsync(ct);
    }

    public async Task<DisputeDto> ResolveDisputeAsync(
        string adminId, Guid id, ResolveDispute input, string version,
        string idempotencyKey, CancellationToken ct)
    {
        idempotencyKey = RequiredKey(idempotencyKey);
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"dispute:{id}", ct);
        var dispute = await RequiredDisputeAsync(id, ct);
        if (dispute.Status == DisputeStatus.Resolved
            && dispute.Decisions.Single().IdempotencyKey == idempotencyKey)
        {
            await tx.CommitAsync(ct); return Map(dispute);
        }
        ApplyVersion(dispute, version);
        var changed = dispute.Resolve(adminId, input.Resolution, input.Rationale, idempotencyKey, clock.GetUtcNow());
        if (changed && input.Resolution != DisputeResolution.NoFinancialAction)
        {
            var order = await db.Orders.SingleAsync(x => x.Id == dispute.OrderId, ct);
            await finance.SettleDisputeAsync(
                order, input.Resolution == DisputeResolution.RefundStudent, adminId, idempotencyKey, ct);
        }
        audit.Add(adminId, "DisputeResolved", "Dispute", id.ToString(),
            $"Resolution: {input.Resolution}.", idempotencyKey);
        foreach (var recipient in new[] { dispute.StudentId, dispute.TeacherId })
            await notifications.QueueAsync(recipient, "Dispute", "Dispute resolved",
                $"Resolution: {input.Resolution}.", $"/disputes/{id}",
                $"dispute:{id}:resolved:{recipient}", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Map(dispute);
    }

    private async Task RefreshRatingAsync(string teacherId, CancellationToken ct)
    {
        var aggregate = await db.TeacherReviews.Where(x => x.TeacherId == teacherId && x.IsVisible)
            .GroupBy(_ => 1).Select(x => new { Count = x.Count(), Average = x.Average(r => r.OverallScore) })
            .SingleOrDefaultAsync(ct);
        var profile = await db.TeacherProfiles.SingleAsync(x => x.TeacherId == teacherId, ct);
        profile.SetRating(aggregate?.Average ?? 0, aggregate?.Count ?? 0, clock.GetUtcNow());
    }
    private async Task<Dispute> OwnedDisputeAsync(
        string userId, Guid id, string version, CancellationToken ct)
    {
        var item = await RequiredDisputeAsync(id, ct); item.RequireParticipant(userId); ApplyVersion(item, version); return item;
    }
    private async Task<Dispute> RequiredDisputeAsync(Guid id, CancellationToken ct) =>
        await db.Disputes.Include(x => x.Messages).Include(x => x.Evidence)
            .Include(x => x.History).Include(x => x.Decisions)
            .SingleOrDefaultAsync(x => x.Id == id, ct)
        ?? throw new DomainException("dispute_not_found", "Dispute was not found.");
    private void ApplyVersion(Dispute item, string version)
    {
        try { db.Entry(item).Property(x => x.RowVersion).OriginalValue = Convert.FromBase64String(version.Trim('"')); }
        catch (FormatException) { throw new DomainException("invalid_concurrency_token", "Dispute version is invalid."); }
    }
    private Task LockAsync(string resource, CancellationToken ct) =>
        db.Database.IsSqlServer()
            ? db.Database.ExecuteSqlInterpolatedAsync(
                $"EXEC sp_getapplock @Resource={resource}, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000", ct)
            : Task.CompletedTask;
    private static string RequiredKey(string value)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 or > 100)
            throw new DomainException("idempotency_key_required", "A valid Idempotency-Key is required.");
        return value;
    }
    private static string SafeName(string value) =>
        Path.GetFileName(value) is { Length: > 0 and <= 255 } name ? name : "evidence";
    private static ReviewDto Map(TeacherReview x) =>
        new(x.Id, x.OrderId, x.TeacherId, x.ExplanationClarity,
            x.SubjectKnowledge, x.Communication, x.OnTimeDelivery, x.ValueForMoney,
            x.OverallScore, x.OriginalComment, x.Recommends, x.IsVisible, x.CreatedAt);
    private static DisputeDto Map(Dispute x) =>
        new(x.Id, x.OrderId, x.StudentId, x.TeacherId, x.OpenedById, x.Reason, x.Status, x.CreatedAt,
            x.Messages.Select(m => new DisputeMessageDto(m.Id, m.SenderId, m.Body, m.CreatedAt)).ToArray(),
            x.Evidence.Select(e => new AttachmentDto(e.Id, e.OriginalName, e.ContentType, e.Size, e.CreatedAt)).ToArray(),
            x.Decisions.Select(d => new DisputeDecisionDto(
                d.Id, d.ActorId, d.Resolution, d.Rationale, d.CreatedAt)).ToArray(),
            Convert.ToBase64String(x.RowVersion));
}

internal sealed class AuditWriter(
    TafseelDbContext db,
    TimeProvider clock,
    IHttpContextAccessor context)
{
    public void Add(string actorId, string action, string entityType,
        string entityId, string summary, string correlationId) =>
        db.Add(new AuditLogEntry(actorId, action, entityType, entityId, summary, correlationId, clock.GetUtcNow()));

    public void AddCurrent(string action, string entityType, string entityId, string summary)
    {
        var actorId = context.HttpContext?.User.FindFirstValue("sub") ?? "system";
        var correlationId = context.HttpContext?.TraceIdentifier ?? Guid.NewGuid().ToString("N");
        Add(actorId, action, entityType, entityId, summary, correlationId);
    }
}

internal sealed class AdminService(
    TafseelDbContext db,
    UserManager<ApplicationUser> users,
    RoleManager<IdentityRole> roles,
    AuditWriter audit,
    TimeProvider clock) : IAdminService
{
    public async Task<PagedResult<AdminUserDto>> GetUsersAsync(
        int page, int pageSize, string? search, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.FullName.Contains(term) || (x.Email != null && x.Email.Contains(term)));
        }
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.FullName).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.Id, x.FullName, x.Email, x.IsSuspended }).ToArrayAsync(ct);
        var ids = items.Select(x => x.Id).ToArray();
        var memberships = await (
            from ur in db.UserRoles.AsNoTracking()
            join role in db.Roles.AsNoTracking() on ur.RoleId equals role.Id
            where ids.Contains(ur.UserId)
            select new { ur.UserId, Role = role.Name! }).ToArrayAsync(ct);
        return new(items.Select(x => new AdminUserDto(x.Id, x.FullName, x.Email ?? "",
            x.IsSuspended, memberships.Where(r => r.UserId == x.Id).Select(r => r.Role).ToArray())).ToArray(),
            page, pageSize, total);
    }

    public async Task SetSuspensionAsync(
        string adminId, string userId, bool suspended, CancellationToken ct)
    {
        if (adminId == userId) throw new DomainException("self_admin_change_forbidden", "Administrators cannot suspend themselves.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var user = await users.FindByIdAsync(userId)
            ?? throw new DomainException("user_not_found", "User was not found.");
        user.IsSuspended = suspended;
        user.SecurityStamp = Guid.NewGuid().ToString("N");
        audit.Add(adminId, suspended ? "UserSuspended" : "UserReactivated", "User", userId,
            suspended ? "Account suspended." : "Account reactivated.", $"user:{userId}:suspension:{clock.GetUtcNow().UtcTicks}");
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task SetRoleAsync(
        string adminId, string userId, string role, bool assigned, CancellationToken ct)
    {
        if (!Roles.All.Contains(role, StringComparer.Ordinal)
            || adminId == userId && role == Roles.Admin)
            throw new DomainException("role_change_forbidden", "The role change is not allowed.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        if (db.Database.IsSqlServer())
            await db.Database.ExecuteSqlRawAsync(
                "EXEC sp_getapplock @Resource='admin-role-changes', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000", ct);
        var user = await users.FindByIdAsync(userId)
            ?? throw new DomainException("user_not_found", "User was not found.");
        if (!assigned && role == Roles.Admin)
        {
            var adminRole = await roles.FindByNameAsync(Roles.Admin);
            if (adminRole is not null && await db.UserRoles.CountAsync(x => x.RoleId == adminRole.Id, ct) <= 1)
                throw new DomainException("last_admin_required", "The final Admin role cannot be removed.");
        }
        var current = await users.IsInRoleAsync(user, role);
        if (current != assigned)
        {
            var result = assigned ? await users.AddToRoleAsync(user, role) : await users.RemoveFromRoleAsync(user, role);
            if (!result.Succeeded) throw new DomainException("role_update_failed", "Role could not be updated.");
            await users.UpdateSecurityStampAsync(user);
        }
        audit.Add(adminId, assigned ? "RoleAssigned" : "RoleRemoved", "User", userId,
            $"{role} {(assigned ? "assigned" : "removed")}.", $"user:{userId}:role:{role}:{assigned}");
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task<DashboardMetrics> GetMetricsAsync(CancellationToken ct) =>
        new(await db.Users.CountAsync(ct),
            await UsersInRoleCountAsync(Roles.Student, activeOnly: true, ct),
            await UsersInRoleCountAsync(Roles.Teacher, activeOnly: true, ct),
            await db.TeacherApplications.CountAsync(x =>
                x.Status == Tafseel.Domain.TeacherApplications.TeacherApplicationStatus.Submitted
                || x.Status == Tafseel.Domain.TeacherApplications.TeacherApplicationStatus.UnderReview, ct),
            await db.Orders.CountAsync(ct),
            await db.Payments.Where(x => x.Status == PaymentStatus.Confirmed)
                .SumAsync(x => (decimal?)x.Amount, ct) ?? 0,
            await AccountBalanceAsync(LedgerAccountKind.PlatformRevenue, ct),
            await db.Disputes.CountAsync(x => x.Status != DisputeStatus.Resolved, ct),
            await db.WithdrawalRequests.CountAsync(x => x.Status == WithdrawalStatus.Pending, ct));

    public async Task<IReadOnlyCollection<PopularSubjectMetric>> GetPopularSubjectsAsync(CancellationToken ct)
    {
        var rows = await db.Subjects.AsNoTracking()
            .Select(subject => new
            {
                subject.Id,
                subject.Name,
                Services = db.TeacherServices.Count(service => service.SubjectId == subject.Id),
                Orders = (from order in db.Orders
                          join service in db.TeacherServices on order.TeacherServiceId equals service.Id
                          where service.SubjectId == subject.Id
                          select order.Id).Count()
            })
            .OrderByDescending(x => x.Orders).ThenBy(x => x.Name).Take(10).ToArrayAsync(ct);
        return rows.Select(x => new PopularSubjectMetric(x.Id, x.Name, x.Services, x.Orders)).ToArray();
    }

    public async Task<PagedResult<AuditDto>> GetAuditAsync(
        int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var total = await db.AuditLogEntries.CountAsync(ct);
        var items = await db.AuditLogEntries.AsNoTracking()
            .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(items.Select(x => new AuditDto(x.Id, x.ActorId, x.Action, x.EntityType,
            x.EntityId, x.Summary, x.CorrelationId, x.CreatedAt)).ToArray(), page, pageSize, total);
    }

    private async Task<int> UsersInRoleCountAsync(string roleName, bool activeOnly, CancellationToken ct)
    {
        var roleId = await db.Roles.Where(x => x.Name == roleName).Select(x => x.Id).SingleAsync(ct);
        return await db.UserRoles.Join(db.Users, x => x.UserId, x => x.Id, (membership, user) => new { membership, user })
            .CountAsync(x => x.membership.RoleId == roleId && (!activeOnly || !x.user.IsSuspended), ct);
    }
    private async Task<decimal> AccountBalanceAsync(LedgerAccountKind kind, CancellationToken ct)
    {
        var ids = await db.LedgerAccounts.Where(x => x.Kind == kind).Select(x => x.Id).ToArrayAsync(ct);
        var credits = await db.LedgerEntries.Where(x => ids.Contains(x.CreditAccountId))
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var debits = await db.LedgerEntries.Where(x => ids.Contains(x.DebitAccountId))
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        return credits - debits;
    }
}
