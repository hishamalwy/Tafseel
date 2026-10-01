using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Authorization;
using Tafseel.Application.Common;
using Tafseel.Application.Governance;
using Tafseel.Application.Orders;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Domain.Governance;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Governance;

/// <summary>
/// Help and abuse intake outside paid purchases. At launch the queue belongs to named Admins (no Support role):
/// every new case is announced to them, one takes it, and it closes with an outcome the reporter reads.
/// Purchase problems stay disputes; this never moves money.
/// </summary>
internal sealed class SupportService(
    TafseelDbContext db,
    IFileStorageService files,
    NotificationWriter notifications,
    AuditWriter audit,
    TimeProvider clock) : ISupportService
{
    public async Task<SupportCaseDto> CreateAsync(string reporterId, CreateSupportCase input, CancellationToken ct)
    {
        var item = SupportCase.Report(reporterId, input.Category, input.Description, input.RelatedReference, clock.GetUtcNow());
        db.Add(item);
        await AnnounceAsync(item, ct);
        audit.Add(reporterId, "SupportCaseReported", "SupportCase", item.Id.ToString(),
            $"Category: {item.Category}.", $"support:{item.Id}:reported");
        await db.SaveChangesAsync(ct);
        return await MapAsync(item, reporterId, staff: false, ct);
    }

    public async Task<SupportCaseReceiptDto> CreateAccountAccessAsync(CreateAccountAccessCase input, CancellationToken ct)
    {
        var item = SupportCase.ReportAccountAccess(input.Email, input.FullName, input.Description, clock.GetUtcNow());
        db.Add(item);
        await AnnounceAsync(item, ct);
        audit.Add("anonymous", "SupportCaseReported", "SupportCase", item.Id.ToString(),
            "Account access report from a signed-out person.", $"support:{item.Id}:reported");
        await db.SaveChangesAsync(ct);
        return new(item.Reference);
    }

    public async Task<PagedResult<SupportCaseListItemDto>> MineAsync(string reporterId, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.SupportCases.AsNoTracking().Where(x => x.ReporterId == reporterId);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(rows.Select(x => ListItem(x, null, null)).ToArray(), page, pageSize, total);
    }

    public async Task<SupportCaseDto> GetAsync(string viewerId, bool staff, Guid id, CancellationToken ct) =>
        await MapAsync(await VisibleAsync(viewerId, staff, id, ct), viewerId, staff, ct);

    public async Task<SupportCaseDto> AddMessageAsync(string viewerId, bool staff, Guid id, SupportMessageInput input,
        string version, CancellationToken ct)
    {
        var item = await VisibleAsync(viewerId, staff, id, ct);
        ApplyVersion(item, version);
        var now = clock.GetUtcNow();
        if (item.IsReporter(viewerId))
        {
            item.AddReporterMessage(viewerId, input.Body, now);
            var message = item.Messages.Last();
            // The owner hears first; before anyone owns it, every Admin does.
            var recipients = item.OwnerId is { } owner ? [owner] : await AdminIdsAsync(ct);
            foreach (var recipient in recipients)
                await notifications.QueueAsync(recipient, "Support", "New message on a help case",
                    $"The reporter of {item.Reference} added a message.", AppRoutes.AdminHelpCase(item.Id),
                    $"support:{item.Id}:message:{message.Id}:{recipient}", false, ct);
        }
        else
        {
            item.AddStaffMessage(viewerId, input.Body, now);
            var message = item.Messages.Last();
            if (item.ReporterId is { } reporter)
                await notifications.QueueAsync(reporter, "Support", "Tafseel replied to your report",
                    $"There is a reply on your report {item.Reference}.", AppRoutes.HelpCase(item.Id),
                    $"support:{item.Id}:message:{message.Id}:{reporter}", true, ct);
            audit.Add(viewerId, "SupportCaseReplied", "SupportCase", item.Id.ToString(),
                "Staff replied to the reporter.", $"support:{item.Id}:message:{message.Id}");
        }
        await db.SaveChangesAsync(ct);
        return await MapAsync(item, viewerId, staff, ct);
    }

    public async Task<SupportCaseDto> AddAttachmentAsync(string reporterId, Guid id, Stream stream, string fileName,
        string contentType, long size, string version, CancellationToken ct)
    {
        var item = await VisibleAsync(reporterId, staff: false, id, ct);
        ApplyVersion(item, version);
        // Scanned before it is stored (SEC-04); an infected file never reaches the case.
        var stored = await files.StorePrivateFileAsync(stream, fileName, contentType, size, "support-evidence", ct);
        try
        {
            item.AddAttachment(reporterId, stored.StorageKey, SafeName(fileName), stored.ContentType, stored.Size, clock.GetUtcNow());
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            await files.DeletePrivateFileAsync(stored.StorageKey, CancellationToken.None);
            throw;
        }
        return await MapAsync(item, reporterId, staff: false, ct);
    }

    public async Task<PrivateFile> OpenAttachmentAsync(string viewerId, bool staff, Guid attachmentId, CancellationToken ct)
    {
        var row = await (
                from attachment in db.SupportCaseAttachments.AsNoTracking()
                join item in db.SupportCases.AsNoTracking() on attachment.SupportCaseId equals item.Id
                where attachment.Id == attachmentId && (staff || item.ReporterId == viewerId)
                select new { attachment.StorageKey, attachment.ContentType, attachment.OriginalName })
            .SingleOrDefaultAsync(ct)
            ?? throw new DomainException("support_attachment_not_found", "The file was not found.");
        return new(await files.OpenPrivateFileAsync(row.StorageKey, ct), row.ContentType, row.OriginalName);
    }

    public async Task<PagedResult<SupportCaseListItemDto>> QueueAsync(SupportCaseStatus? status, SupportCaseCategory? category,
        string? query, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var cases = db.SupportCases.AsNoTracking();
        if (status is { } s) cases = cases.Where(x => x.Status == s);
        else cases = cases.Where(x => x.Status != SupportCaseStatus.Resolved);
        if (category is { } c) cases = cases.Where(x => x.Category == c);
        var text = query?.Trim() ?? "";
        if (text.Length > 0)
        {
            if (text.Length > 200) text = text[..200];
            var people = db.Users.Where(u => (u.Email != null && u.Email.Contains(text))
                || u.FullName.Contains(text) || u.FullNameEnglish.Contains(text)).Select(u => u.Id);
            cases = cases.Where(x => x.Reference.Contains(text) || (x.ContactEmail != null && x.ContactEmail.Contains(text))
                || (x.ReporterId != null && people.Contains(x.ReporterId)));
        }
        var total = await cases.CountAsync(ct);
        // Oldest first: a report nobody has taken is the one that has waited longest.
        var rows = await cases.OrderBy(x => x.Status).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        var names = await NamesAsync(rows.SelectMany(x => new[] { x.OwnerId, x.ReporterId }), ct);
        return new(rows.Select(x => ListItem(x,
            x.OwnerId is null ? null : names.GetValueOrDefault(x.OwnerId),
            x.ReporterId is null ? x.ContactName ?? x.ContactEmail : names.GetValueOrDefault(x.ReporterId))).ToArray(),
            page, pageSize, total);
    }

    public async Task<SupportCaseDto> TakeAsync(string staffId, Guid id, string version, CancellationToken ct)
    {
        var item = await VisibleAsync(staffId, staff: true, id, ct);
        ApplyVersion(item, version);
        item.Take(staffId, clock.GetUtcNow());
        audit.Add(staffId, "SupportCaseTaken", "SupportCase", item.Id.ToString(),
            "A team member took the case.", $"support:{item.Id}:taken:{clock.GetUtcNow():O}");
        await db.SaveChangesAsync(ct);
        return await MapAsync(item, staffId, staff: true, ct);
    }

    public async Task<SupportCaseDto> ResolveAsync(string staffId, Guid id, ResolveSupportCase input, string version, CancellationToken ct)
    {
        var item = await VisibleAsync(staffId, staff: true, id, ct);
        ApplyVersion(item, version);
        item.Resolve(staffId, input.Outcome, clock.GetUtcNow());
        if (item.ReporterId is { } reporter)
            await notifications.QueueAsync(reporter, "Support", "Your report was resolved",
                $"Tafseel resolved your report {item.Reference}. Read the outcome on the case.", AppRoutes.HelpCase(item.Id),
                $"support:{item.Id}:resolved:{reporter}", true, ct);
        audit.Add(staffId, "SupportCaseResolved", "SupportCase", item.Id.ToString(),
            "The case was resolved with an outcome.", $"support:{item.Id}:resolved");
        await db.SaveChangesAsync(ct);
        return await MapAsync(item, staffId, staff: true, ct);
    }

    private async Task AnnounceAsync(SupportCase item, CancellationToken ct)
    {
        foreach (var adminId in await AdminIdsAsync(ct))
        {
            // Nobody is told about their own report as if it were someone else's.
            if (adminId == item.ReporterId) continue;
            await notifications.QueueAsync(adminId, "Support", "New help or abuse report",
                $"A new report ({item.Reference}) is waiting for an owner.", AppRoutes.AdminHelpCase(item.Id),
                $"support:{item.Id}:reported:{adminId}", true, ct);
        }
    }

    private Task<string[]> AdminIdsAsync(CancellationToken ct) => (
            from membership in db.UserRoles.AsNoTracking()
            join role in db.Roles.AsNoTracking() on membership.RoleId equals role.Id
            join user in db.Users.AsNoTracking() on membership.UserId equals user.Id
            where role.Name == Roles.Admin && !user.IsSuspended
            select user.Id)
        .Distinct().ToArrayAsync(ct);

    /// <summary>The reporter sees their own cases; staff see every case. Anyone else is told it does not exist.</summary>
    private async Task<SupportCase> VisibleAsync(string viewerId, bool staff, Guid id, CancellationToken ct) =>
        await db.SupportCases.Include(x => x.Messages).Include(x => x.Attachments)
            .SingleOrDefaultAsync(x => x.Id == id && (staff || x.ReporterId == viewerId), ct)
        ?? throw new DomainException("support_case_not_found", "The case was not found.");

    private void ApplyVersion(SupportCase item, string version)
    {
        try { db.Entry(item).Property(x => x.RowVersion).OriginalValue = Convert.FromBase64String(version.Trim('"')); }
        catch (FormatException) { throw new DomainException("invalid_concurrency_token", "The case version is invalid."); }
    }

    private async Task<SupportCaseDto> MapAsync(SupportCase x, string viewerId, bool staff, CancellationToken ct)
    {
        var names = await NamesAsync(x.Messages.Select(m => (string?)m.AuthorId).Append(x.OwnerId).Append(x.ReporterId), ct);
        var reporterEmail = staff && x.ReporterId is not null
            ? await db.Users.AsNoTracking().Where(u => u.Id == x.ReporterId).Select(u => u.Email).SingleOrDefaultAsync(ct)
            : null;
        return new(x.Id, x.Reference, x.Category, x.Status, x.Description, x.RelatedReference, x.CreatedAt, x.UpdatedAt,
            x.Outcome, x.ResolvedAt, x.OwnerId is not null,
            staff && x.OwnerId is not null ? names.GetValueOrDefault(x.OwnerId) : null,
            staff && x.ReporterId is not null ? names.GetValueOrDefault(x.ReporterId) : null,
            reporterEmail,
            staff ? x.ContactEmail : null, staff ? x.ContactName : null,
            x.Messages.OrderBy(m => m.CreatedAt).Select(m => new SupportCaseMessageDto(m.Id, m.FromStaff, m.AuthorId == viewerId,
                // A reporter reads "Tafseel team", never a staff member's name.
                m.FromStaff && !staff ? null : names.GetValueOrDefault(m.AuthorId), m.Body, m.CreatedAt)).ToArray(),
            x.Attachments.OrderBy(a => a.CreatedAt).Select(a => new SupportCaseAttachmentDto(a.Id, a.OriginalName,
                a.ContentType, a.Size, a.CreatedAt)).ToArray(),
            Convert.ToBase64String(x.RowVersion));
    }

    private static SupportCaseListItemDto ListItem(SupportCase x, string? ownerName, string? reporterName) =>
        new(x.Id, x.Reference, x.Category, x.Status, x.CreatedAt, x.UpdatedAt, ownerName, reporterName,
            x.ReporterId is null, x.Description.Length <= 140 ? x.Description : x.Description[..140] + "…");

    private async Task<Dictionary<string, string>> NamesAsync(IEnumerable<string?> ids, CancellationToken ct)
    {
        var wanted = ids.Where(x => !string.IsNullOrEmpty(x)).Select(x => x!).Distinct().ToArray();
        if (wanted.Length == 0) return [];
        return await db.Users.AsNoTracking().Where(u => wanted.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => string.IsNullOrWhiteSpace(u.FullNameEnglish) ? u.FullName : u.FullNameEnglish, ct);
    }

    private static string SafeName(string fileName)
    {
        var name = Path.GetFileName(fileName ?? "").Trim();
        if (name.Length == 0) return "file";
        return name.Length <= 255 ? name : name[^255..];
    }
}
