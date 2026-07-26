using System.Data;
using System.Security.Cryptography;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Tafseel.Application.Common;
using Tafseel.Application.LiveSessions;
using Tafseel.Application.Orders;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Marketplace;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Messaging;

namespace Tafseel.Infrastructure.LiveSessions;

internal sealed class LiveSessionService(
    TafseelDbContext db,
    IFileStorageService files,
    NotificationWriter notifications,
    ILiveSessionLinkProvider links,
    IOptions<LiveSessionOptions> options,
    TimeProvider clock) : ILiveSessionService
{
    private readonly LiveSessionOptions _options = options.Value;
    private static readonly LiveSessionStatus[] ReservingStatuses =
        [LiveSessionStatus.AwaitingPayment, LiveSessionStatus.Confirmed];

    public async Task<IReadOnlyCollection<BookableSlotDto>> GetSlotsAsync(
        string teacherId, DateOnly from, int days, int durationMinutes,
        string studentTimeZoneId, CancellationToken ct)
    {
        RequireDuration(durationMinutes);
        days = Math.Clamp(days, 1, 31);
        var studentZone = Zone(studentTimeZoneId);
        var rules = await db.TeacherAvailabilityRules.AsNoTracking()
            .Where(x => x.TeacherId == teacherId).ToArrayAsync(ct);
        if (rules.Length == 0) return [];
        var rangeStart = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero).AddDays(-1);
        var rangeEnd = rangeStart.AddDays(days + 2);
        var exceptions = await db.TeacherAvailabilityExceptions.AsNoTracking()
            .Where(x => x.TeacherId == teacherId && x.StartsAt < rangeEnd && x.EndsAt > rangeStart)
            .ToArrayAsync(ct);
        var bookings = await db.LiveSessionBookings.AsNoTracking()
            .Where(x => x.TeacherId == teacherId && ReservingStatuses.Contains(x.Status)
                && x.StartsAt < rangeEnd && x.EndsAt > rangeStart)
            .ToArrayAsync(ct);
        var now = clock.GetUtcNow();
        var result = new List<BookableSlotDto>();
        for (var offset = 0; offset < days; offset++)
        {
            var date = from.AddDays(offset);
            foreach (var rule in rules.Where(x => x.DayOfWeek == date.DayOfWeek))
            {
                var teacherZone = Zone(rule.TimeZoneId);
                var step = rule.SlotMinutes ?? durationMinutes;
                for (var start = rule.Start; start.AddMinutes(durationMinutes) <= rule.End; start = start.AddMinutes(step))
                {
                    var local = DateTime.SpecifyKind(date.ToDateTime(start), DateTimeKind.Unspecified);
                    if (teacherZone.IsInvalidTime(local) || teacherZone.IsAmbiguousTime(local)) continue;
                    var startsAt = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(local, teacherZone), TimeSpan.Zero);
                    var endsAt = startsAt.AddMinutes(durationMinutes);
                    if (startsAt <= now
                        || exceptions.Any(x => x.StartsAt < endsAt && startsAt < x.EndsAt)
                        || bookings.Any(x => x.StartsAt < endsAt && startsAt < x.EndsAt))
                        continue;
                    result.Add(new(startsAt, endsAt,
                        TimeZoneInfo.ConvertTime(startsAt, studentZone).DateTime, studentTimeZoneId));
                }
            }
        }
        return result.OrderBy(x => x.StartsAt).ToArray();
    }

    public async Task<LiveSessionDto> BookAsync(string studentId, BookLiveSession input, CancellationToken ct)
    {
        RequireDuration(input.DurationMinutes);
        var startsAt = ToUtc(input.LocalStart, input.StudentTimeZoneId);
        var endsAt = startsAt.AddMinutes(input.DurationMinutes);
        var service = await db.TeacherServices.AsNoTracking().SingleOrDefaultAsync(x =>
                x.Id == input.TeacherServiceId && x.IsActive
                && db.Subjects.Any(subject => subject.Id == x.SubjectId && subject.IsActive)
                && db.ServiceCatalogItems.Any(type => type.Id == x.ServiceCatalogItemId && type.IsActive)
                && db.TeacherSubjectQualifications.Any(q =>
                    q.TeacherId == x.TeacherId && q.SubjectId == x.SubjectId)
                && db.TeacherProfiles.Any(profile =>
                    profile.TeacherId == x.TeacherId && profile.IsPublished), ct)
            ?? throw new DomainException("teacher_service_not_found", "Teacher service was not found.");
        if (service.TeacherId == studentId)
            throw new DomainException("self_booking_forbidden", "A student cannot book themselves.");
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            await LockScheduleAsync(service.TeacherId, ct);
            var teacherZone = await RequireAvailableAsync(service.TeacherId, startsAt, endsAt, null, ct);
            await RequireNoConflictAsync(service.TeacherId, startsAt, endsAt, null, ct);
            var basePrice = service.Price * input.DurationMinutes / 60m;
            var booking = new LiveSessionBooking(
                studentId, service.TeacherId, service.Id, input.Title, input.Notes ?? "",
                startsAt, endsAt, input.StudentTimeZoneId, teacherZone, basePrice, service.Currency,
                input.Emergency ? _options.EmergencyPremiumPercent : 0,
                _options.CancellationWindowHours,
                Convert.ToHexString(RandomNumberGenerator.GetBytes(32)), clock.GetUtcNow());
            db.Add(booking);
            await notifications.QueueAsync(booking.TeacherId, "SessionBooking", "New live-session booking",
                booking.Title, $"/live-sessions/{booking.Id}", $"session:{booking.Id}:booked", true, ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Map(booking);
        }
        catch (DbUpdateException)
        {
            throw Conflict();
        }
        catch (SqlException)
        {
            throw Conflict();
        }
        catch (InvalidOperationException exception) when (ContainsSqlException(exception))
        {
            throw Conflict();
        }
    }

    public async Task<PagedResult<LiveSessionDto>> GetMineAsync(
        string userId, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var query = db.LiveSessionBookings.Where(x => x.StudentId == userId || x.TeacherId == userId);
        var count = await query.CountAsync(ct);
        var items = await query.AsNoTracking().OrderByDescending(x => x.StartsAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Include(x => x.Attachments).AsSplitQuery().ToArrayAsync(ct);
        return new(items.Select(Map).ToArray(), page, pageSize, count);
    }

    public async Task RescheduleAsync(
        string userId, Guid id, RescheduleLiveSession input, string version, CancellationToken ct)
    {
        var startsAt = ToUtc(input.LocalStart, input.TimeZoneId);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            var booking = await OwnedAsync(userId, id, version, ct);
            await LockScheduleAsync(booking.TeacherId, ct);
            var endsAt = startsAt.Add(booking.EndsAt - booking.StartsAt);
            await RequireAvailableAsync(booking.TeacherId, startsAt, endsAt, booking.Id, ct);
            await RequireNoConflictAsync(booking.TeacherId, startsAt, endsAt, booking.Id, ct);
            booking.Reschedule(userId, startsAt, endsAt, clock.GetUtcNow());
            var other = userId == booking.StudentId ? booking.TeacherId : booking.StudentId;
            await notifications.QueueAsync(other, "SessionRescheduled", "Live session rescheduled",
                booking.Title, $"/live-sessions/{booking.Id}",
                $"session:{booking.Id}:rescheduled:{booking.RescheduleCount}", true, ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException) { throw Conflict(); }
        catch (SqlException) { throw Conflict(); }
        catch (InvalidOperationException exception) when (ContainsSqlException(exception)) { throw Conflict(); }
    }

    public async Task CancelAsync(string userId, Guid id, string version, CancellationToken ct)
    {
        var booking = await OwnedAsync(userId, id, version, ct);
        booking.Cancel(userId, clock.GetUtcNow());
        await notifications.QueueAsync(userId == booking.StudentId ? booking.TeacherId : booking.StudentId,
            "SessionCancelled", "Live session cancelled", booking.Title,
            $"/live-sessions/{booking.Id}", $"session:{booking.Id}:cancelled", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task CompleteAsync(string teacherId, Guid id, string version, CancellationToken ct)
    {
        var booking = await db.LiveSessionBookings.Include(x => x.Attachments)
            .SingleOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId, ct)
            ?? throw new DomainException("session_not_owned", "Live session was not found.");
        ApplyVersion(booking, version);
        booking.Complete(teacherId, clock.GetUtcNow());
        await notifications.QueueAsync(booking.StudentId, "SessionCompleted", "Live session completed",
            booking.Title, $"/live-sessions/{booking.Id}", $"session:{booking.Id}:completed", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task MarkNoShowAsync(
        string userId, Guid id, bool studentNoShow, string version, CancellationToken ct)
    {
        var booking = await OwnedAsync(userId, id, version, ct);
        if (studentNoShow) booking.MarkStudentNoShow(userId, clock.GetUtcNow());
        else booking.MarkTeacherNoShow(userId, clock.GetUtcNow());
        var recipient = studentNoShow ? booking.StudentId : booking.TeacherId;
        await notifications.QueueAsync(recipient, "SessionNoShow", "Live session no-show recorded",
            booking.Title, $"/live-sessions/{booking.Id}", $"session:{booking.Id}:no-show", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task<AttachmentDto> AddAttachmentAsync(
        string userId, Guid id, Stream stream, string fileName, string contentType,
        long size, string version, CancellationToken ct)
    {
        var booking = await OwnedAsync(userId, id, version, ct);
        var stored = await files.StorePrivateFileAsync(
            stream, fileName, contentType, size, "live-session-attachments", ct);
        try
        {
            booking.AddAttachment(
                userId, stored.StorageKey, SafeName(fileName), stored.ContentType, stored.Size, clock.GetUtcNow());
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            await files.DeletePrivateFileAsync(stored.StorageKey, CancellationToken.None);
            throw;
        }
        var item = booking.Attachments.Last();
        return new(item.Id, item.OriginalName, item.ContentType, item.Size, item.CreatedAt);
    }

    public async Task<PrivateFile> OpenAttachmentAsync(string userId, Guid attachmentId, CancellationToken ct)
    {
        var item = await (
            from attachment in db.LiveSessionAttachments.AsNoTracking()
            join booking in db.LiveSessionBookings.AsNoTracking()
                on attachment.LiveSessionBookingId equals booking.Id
            where attachment.Id == attachmentId
                && (booking.StudentId == userId || booking.TeacherId == userId)
            select new { attachment.StorageKey, attachment.ContentType, attachment.OriginalName })
            .SingleOrDefaultAsync(ct)
            ?? throw new DomainException("attachment_not_owned", "Attachment was not found.");
        return new(await files.OpenPrivateFileAsync(item.StorageKey, ct), item.ContentType, item.OriginalName);
    }

    public async Task<JoinSessionDto> JoinAsync(string userId, Guid id, CancellationToken ct)
    {
        var booking = await db.LiveSessionBookings.AsNoTracking().SingleOrDefaultAsync(x =>
                x.Id == id && (x.StudentId == userId || x.TeacherId == userId), ct)
            ?? throw new DomainException("session_not_owned", "Live session was not found.");
        if (booking.Status != LiveSessionStatus.Confirmed)
            throw new DomainException("session_not_confirmed", "The live session is not confirmed.");
        var validFrom = booking.StartsAt.AddMinutes(-_options.JoinWindowMinutes);
        var validUntil = booking.EndsAt.AddMinutes(_options.JoinWindowMinutes);
        var now = clock.GetUtcNow();
        if (now < validFrom || now > validUntil)
            throw new DomainException("join_window_closed", "The live session join window is closed.");
        return new(await links.GetJoinUrlAsync(booking.Id, booking.JoinKey, ct), validFrom, validUntil);
    }

    private async Task<string> RequireAvailableAsync(
        string teacherId, DateTimeOffset startsAt, DateTimeOffset endsAt, Guid? bookingId, CancellationToken ct)
    {
        if (await db.TeacherAvailabilityExceptions.AnyAsync(x =>
                x.TeacherId == teacherId && x.StartsAt < endsAt && startsAt < x.EndsAt, ct))
            throw new DomainException("slot_unavailable", "The selected slot is unavailable.");
        var rules = await db.TeacherAvailabilityRules.AsNoTracking()
            .Where(x => x.TeacherId == teacherId).ToArrayAsync(ct);
        foreach (var rule in rules)
        {
            var zone = Zone(rule.TimeZoneId);
            var localStart = TimeZoneInfo.ConvertTime(startsAt, zone);
            var localEnd = TimeZoneInfo.ConvertTime(endsAt, zone);
            if (localStart.Date == localEnd.Date
                && localStart.DayOfWeek == rule.DayOfWeek
                && TimeOnly.FromDateTime(localStart.DateTime) >= rule.Start
                && TimeOnly.FromDateTime(localEnd.DateTime) <= rule.End)
                return rule.TimeZoneId;
        }
        throw new DomainException("slot_unavailable", "The selected slot is outside teacher availability.");
    }

    private async Task RequireNoConflictAsync(
        string teacherId, DateTimeOffset startsAt, DateTimeOffset endsAt, Guid? excludeId, CancellationToken ct)
    {
        if (await db.LiveSessionBookings.AnyAsync(x => x.TeacherId == teacherId
                && ReservingStatuses.Contains(x.Status) && x.Id != excludeId
                && x.StartsAt < endsAt && startsAt < x.EndsAt, ct))
            throw Conflict();
    }

    private async Task<LiveSessionBooking> OwnedAsync(
        string userId, Guid id, string version, CancellationToken ct)
    {
        var booking = await db.LiveSessionBookings.Include(x => x.Attachments)
            .SingleOrDefaultAsync(x => x.Id == id && (x.StudentId == userId || x.TeacherId == userId), ct)
            ?? throw new DomainException("session_not_owned", "Live session was not found.");
        ApplyVersion(booking, version);
        return booking;
    }

    private void ApplyVersion(LiveSessionBooking booking, string version) =>
        db.Entry(booking).Property(x => x.RowVersion).OriginalValue = Decode(version);

    private static byte[] Decode(string version)
    {
        try { return Convert.FromBase64String(version.Trim('"')); }
        catch { throw new DomainException("invalid_concurrency_token", "The session version is invalid."); }
    }

    private static DateTimeOffset ToUtc(DateTime local, string timeZoneId)
    {
        if (local.Kind != DateTimeKind.Unspecified)
            throw new DomainException("invalid_local_time", "Local session time must not include a UTC offset.");
        var zone = Zone(timeZoneId);
        if (zone.IsInvalidTime(local))
            throw new DomainException("invalid_local_time", "The local time does not exist because of daylight saving time.");
        if (zone.IsAmbiguousTime(local))
            throw new DomainException("ambiguous_local_time", "The local time is ambiguous because of daylight saving time.");
        return new(TimeZoneInfo.ConvertTimeToUtc(local, zone), TimeSpan.Zero);
    }

    private static TimeZoneInfo Zone(string id)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch (TimeZoneNotFoundException) { throw new DomainException("invalid_time_zone", "The time zone is not supported."); }
        catch (InvalidTimeZoneException) { throw new DomainException("invalid_time_zone", "The time zone is not supported."); }
    }

    private static void RequireDuration(int minutes)
    {
        if (minutes is not (30 or 60 or 90 or 120))
            throw new DomainException("invalid_session_duration", "Session duration must be 30, 60, 90, or 120 minutes.");
    }

    private static string SafeName(string fileName) =>
        Path.GetFileName(fileName) is { Length: > 0 and <= 255 } name ? name : "attachment";
    private static DomainException Conflict() =>
        new("session_conflict", "The selected session time conflicts with another booking.");
    // ponytail: one lock per teacher; partition by time range only if scheduling throughput proves this too coarse.
    private Task LockScheduleAsync(string teacherId, CancellationToken ct) =>
        db.Database.IsSqlServer()
            ? db.Database.ExecuteSqlInterpolatedAsync(
                $"EXEC sp_getapplock @Resource={"session-schedule:" + teacherId}, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000", ct)
            : Task.CompletedTask;
    private static bool ContainsSqlException(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
            if (current is SqlException) return true;
        return false;
    }
    private static LiveSessionDto Map(LiveSessionBooking x) =>
        new(x.Id, x.StudentId, x.TeacherId, x.TeacherServiceId, x.Title, x.Notes,
            x.StartsAt, x.EndsAt, x.StudentTimeZoneId, x.TeacherTimeZoneId,
            x.BasePrice, x.Currency, x.EmergencyPremiumPercent, x.EmergencyPremiumAmount,
            x.TotalPrice, x.CancellationWindowHours, x.Status, x.RescheduleCount,
            x.Attachments.Select(a => new AttachmentDto(
                a.Id, a.OriginalName, a.ContentType, a.Size, a.CreatedAt)).ToArray(),
            Convert.ToBase64String(x.RowVersion));
}

internal sealed class MockLiveSessionLinkProvider : ILiveSessionLinkProvider
{
    public Task<string> GetJoinUrlAsync(Guid bookingId, string joinKey, CancellationToken ct) =>
        Task.FromResult($"https://meet.local/session/{bookingId:N}?key={Uri.EscapeDataString(joinKey)}");
}
