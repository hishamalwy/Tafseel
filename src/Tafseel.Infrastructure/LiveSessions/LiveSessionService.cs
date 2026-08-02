using System.Data;
using System.Security.Cryptography;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Tafseel.Application.Common;
using Tafseel.Application.Catalog;
using Tafseel.Application.LiveSessions;
using Tafseel.Application.Orders;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
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
    private const string LiveSessionCatalogCode = "live_session";
    private static readonly LiveSessionStatus[] ReservingStatuses =
        [LiveSessionStatus.AwaitingPayment, LiveSessionStatus.Confirmed];

    public async Task<IReadOnlyCollection<BookableSlotDto>> GetSlotsAsync(
        string teacherId, Guid? teacherServiceId, DateOnly from, int days, int durationMinutes,
        string studentTimeZoneId, CancellationToken ct)
    {
        days = Math.Clamp(days, 1, 31);
        var service = await RequireBookableServiceAsync(teacherId, teacherServiceId, ct);
        RequireDuration(service.Type, durationMinutes);
        var studentZone = Zone(studentTimeZoneId);
        var rules = await db.TeacherAvailabilityRules.AsNoTracking()
            .Where(x => x.TeacherId == service.Service.TeacherId).ToArrayAsync(ct);
        if (rules.Length == 0) return [];
        var rangeStart = StartOfDayUtc(from, studentZone);
        var rangeEnd = StartOfDayUtc(from.AddDays(days), studentZone);
        var exceptions = await db.TeacherAvailabilityExceptions.AsNoTracking()
            .Where(x => x.TeacherId == service.Service.TeacherId
                && x.StartsAt < rangeEnd.AddHours(4) && x.EndsAt > rangeStart)
            .ToArrayAsync(ct);
        var bookings = await db.LiveSessionBookings.AsNoTracking()
            .Where(x => x.TeacherId == service.Service.TeacherId && ReservingStatuses.Contains(x.Status)
                && x.StartsAt < rangeEnd.AddHours(4) && x.EndsAt > rangeStart)
            .ToArrayAsync(ct);
        return CalculateSlots(
                rules, exceptions, bookings, durationMinutes, rangeStart, rangeEnd, clock.GetUtcNow())
            .Bookable
            .Select(x => new BookableSlotDto(
                x.StartsAt, x.EndsAt,
                TimeZoneInfo.ConvertTime(x.StartsAt, studentZone).DateTime,
                studentTimeZoneId))
            .ToArray();
    }

    public async Task<AvailabilitySummaryResultDto> GetAvailabilitySummariesAsync(
        IReadOnlyCollection<string> teacherIds,
        Guid? teacherServiceId,
        string? viewerTimeZoneId,
        CancellationToken ct)
    {
        if (teacherIds.Count == 0
            || teacherIds.Any(string.IsNullOrWhiteSpace)
            || teacherIds.Any(x => !Guid.TryParse(x, out _)))
            throw new DomainException(
                "invalid_teacher_ids",
                "Provide between 1 and 12 valid Teacher identifiers.");

        var requestedIds = teacherIds.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (requestedIds.Length > 12)
            throw new DomainException(
                "invalid_teacher_ids",
                "Provide between 1 and 12 valid Teacher identifiers.");
        if (teacherServiceId.HasValue && requestedIds.Length != 1)
            throw new DomainException(
                "invalid_availability_scope",
                "A specific Teacher service can be requested for one Teacher only.");

        var fallback = string.IsNullOrWhiteSpace(viewerTimeZoneId);
        var viewerZone = Zone(fallback ? "UTC" : viewerTimeZoneId!);
        var resolvedViewerZoneId = fallback ? "UTC" : viewerTimeZoneId!;
        var now = clock.GetUtcNow();
        var viewerToday = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, viewerZone).DateTime);
        var horizonStart = StartOfDayUtc(viewerToday, viewerZone);
        var horizonEnd = StartOfDayUtc(viewerToday.AddDays(30), viewerZone);

        var serviceRows = await (
            from service in db.TeacherServices.AsNoTracking()
            join type in db.ServiceCatalogItems.AsNoTracking()
                on service.ServiceCatalogItemId equals type.Id
            where requestedIds.Contains(service.TeacherId)
                && service.IsActive
                && service.SupersededByTeacherServiceId == null
                && type.IsActive && type.IsPublic && type.TeacherSelectable
                && db.TeacherProfiles.Any(profile =>
                    profile.TeacherId == service.TeacherId && profile.IsPublished)
                && db.Users.Any(user =>
                    user.Id == service.TeacherId && user.EmailConfirmed && !user.IsSuspended)
                && db.Subjects.Any(subject => subject.Id == service.SubjectId && subject.IsActive)
                && db.TeacherSubjectQualifications.Any(qualification =>
                    qualification.TeacherId == service.TeacherId
                    && qualification.SubjectId == service.SubjectId
                    && qualification.Status == TeacherQualificationStatus.Approved
                    && qualification.RevokedAt == null)
            select new
            {
                service.TeacherId,
                ServiceId = service.Id,
                type.Code,
                type.RequiresScheduling,
                type.AllowedDurationsCsv
            }).ToArrayAsync(ct);

        var publicTeacherIds = serviceRows.Select(x => x.TeacherId)
            .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (publicTeacherIds.Length == 0)
            return new(requestedIds.Length, requestedIds.Length, []);

        var rules = await db.TeacherAvailabilityRules.AsNoTracking()
            .Where(x => publicTeacherIds.Contains(x.TeacherId)).ToArrayAsync(ct);
        var exceptions = await db.TeacherAvailabilityExceptions.AsNoTracking()
            .Where(x => publicTeacherIds.Contains(x.TeacherId)
                && x.StartsAt < horizonEnd.AddHours(4) && x.EndsAt > horizonStart)
            .ToArrayAsync(ct);
        var bookings = await db.LiveSessionBookings.AsNoTracking()
            .Where(x => publicTeacherIds.Contains(x.TeacherId)
                && ReservingStatuses.Contains(x.Status)
                && x.StartsAt < horizonEnd.AddHours(4) && x.EndsAt > horizonStart)
            .ToArrayAsync(ct);

        var summaries = new List<AvailabilitySummaryDto>(publicTeacherIds.Length);
        foreach (var teacherId in requestedIds.Where(id =>
                     publicTeacherIds.Contains(id, StringComparer.OrdinalIgnoreCase)))
        {
            var liveServices = serviceRows
                .Where(x => string.Equals(x.TeacherId, teacherId, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(x.Code, LiveSessionCatalogCode, StringComparison.Ordinal)
                    && x.RequiresScheduling
                    && (!teacherServiceId.HasValue || x.ServiceId == teacherServiceId.Value))
                .Select(x => new SummaryService(
                    x.ServiceId,
                    ParseDurations(x.AllowedDurationsCsv).DefaultIfEmpty(0).Min()))
                .Where(x => x.DurationMinutes > 0)
                .OrderBy(x => x.ServiceId)
                .ToArray();

            if (liveServices.Length == 0)
            {
                summaries.Add(Summary(
                    teacherId, AvailabilitySummaryStates.NotApplicable, horizonEnd,
                    resolvedViewerZoneId, fallback));
                continue;
            }

            var teacherRules = rules.Where(x =>
                string.Equals(x.TeacherId, teacherId, StringComparison.OrdinalIgnoreCase)).ToArray();
            if (teacherRules.Length == 0)
            {
                summaries.Add(Summary(
                    teacherId, AvailabilitySummaryStates.NoScheduleConfigured, horizonEnd,
                    resolvedViewerZoneId, fallback));
                continue;
            }

            var teacherExceptions = exceptions.Where(x =>
                string.Equals(x.TeacherId, teacherId, StringComparison.OrdinalIgnoreCase)).ToArray();
            var teacherBookings = bookings.Where(x =>
                string.Equals(x.TeacherId, teacherId, StringComparison.OrdinalIgnoreCase)).ToArray();
            var byDuration = liveServices.Select(x => x.DurationMinutes).Distinct()
                .ToDictionary(
                    duration => duration,
                    duration => CalculateSlots(
                        teacherRules, teacherExceptions, teacherBookings,
                        duration, horizonStart, horizonEnd, now));

            var earliest = liveServices
                .Select(service => new
                {
                    Service = service,
                    Slot = byDuration[service.DurationMinutes].Bookable.FirstOrDefault()
                })
                .Where(x => x.Slot is not null)
                .OrderBy(x => x.Slot!.StartsAt)
                .ThenBy(x => x.Service.ServiceId)
                .FirstOrDefault();
            if (earliest is not null)
            {
                var state = DateOnly.FromDateTime(
                        TimeZoneInfo.ConvertTime(earliest.Slot!.StartsAt, viewerZone).DateTime)
                    == viewerToday
                    ? AvailabilitySummaryStates.AvailableToday
                    : AvailabilitySummaryStates.NextAvailable;
                summaries.Add(new(
                    teacherId,
                    earliest.Service.ServiceId,
                    state,
                    earliest.Slot.StartsAt,
                    earliest.Slot.EndsAt,
                    earliest.Service.DurationMinutes,
                    horizonEnd,
                    resolvedViewerZoneId,
                    fallback));
                continue;
            }

            var calculations = byDuration.Values.ToArray();
            var rawCount = calculations.Sum(x => x.RawCount);
            var afterExceptionsCount = calculations.Sum(x => x.AfterExceptionsCount);
            var unavailableState = rawCount > 0 && afterExceptionsCount == 0
                ? AvailabilitySummaryStates.TemporarilyUnavailable
                : afterExceptionsCount > 0
                    ? AvailabilitySummaryStates.FullyBooked
                    : AvailabilitySummaryStates.NoUpcomingAvailability;
            summaries.Add(Summary(
                teacherId, unavailableState, horizonEnd, resolvedViewerZoneId, fallback));
        }

        return new(
            requestedIds.Length,
            requestedIds.Length - summaries.Count,
            summaries);
    }

    public async Task<LiveSessionDto> BookAsync(string studentId, BookLiveSession input, CancellationToken ct)
    {
        var startsAt = ToUtc(input.LocalStart, input.StudentTimeZoneId);
        var endsAt = startsAt.AddMinutes(input.DurationMinutes);
        var service = await RequireBookableServiceAsync(null, input.TeacherServiceId, ct);
        ServiceCatalogPolicyValidator.EnsureLiveSession(service.Type);
        ServiceCatalogPolicyValidator.EnsureOfferingTerms(
            service.Type, service.Service.Price, service.Service.Currency,
            service.Service.DeliveryHours, service.Service.Revisions);
        RequireDuration(service.Type, input.DurationMinutes);
        if (service.Service.TeacherId == studentId)
            throw new DomainException("self_booking_forbidden", "A student cannot book themselves.");
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            await LockScheduleAsync(service.Service.TeacherId, ct);
            var teacherZone = await RequireAvailableAsync(service.Service.TeacherId, startsAt, endsAt, null, ct);
            await RequireNoConflictAsync(service.Service.TeacherId, startsAt, endsAt, null, ct);
            var basePrice = service.Service.Price * input.DurationMinutes / 60m;
            var booking = new LiveSessionBooking(
                studentId, service.Service.TeacherId, service.Service.Id, input.Title, input.Notes ?? "",
                startsAt, endsAt, input.StudentTimeZoneId, teacherZone, basePrice, service.Service.Currency,
                input.Emergency ? _options.EmergencyPremiumPercent : 0,
                _options.CancellationWindowHours,
                Convert.ToHexString(RandomNumberGenerator.GetBytes(32)), clock.GetUtcNow());
            booking.CaptureServiceIdentity(service.Type);
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
        var ids = items.SelectMany(x => new[] { x.StudentId, x.TeacherId }).Distinct().ToArray();
        var people = await db.Users.AsNoTracking().Where(u => ids.Contains(u.Id))
            .Select(u => new { u.Id, u.FullName, u.FullNameEnglish })
            .ToDictionaryAsync(u => u.Id, u => (u.FullName, (string?)u.FullNameEnglish), ct);
        return new(items.Select(x => Map(x, people)).ToArray(), page, pageSize, count);
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

    private static void RequireDuration(Domain.Catalog.ServiceCatalogItem type, int minutes)
    {
        if (!type.SupportsDuration(minutes))
            throw new DomainException("invalid_session_duration", "Session duration must be 30, 60, 90, or 120 minutes.");
    }

    private async Task<(TeacherService Service, Domain.Catalog.ServiceCatalogItem Type)> RequireBookableServiceAsync(
        string? teacherId,
        Guid? teacherServiceId,
        CancellationToken ct)
    {
        if (teacherServiceId is null && string.IsNullOrWhiteSpace(teacherId))
            throw new DomainException("teacher_service_not_found", "Teacher service was not found.");

        var row = await (
            from service in db.TeacherServices.AsNoTracking()
            join type in db.ServiceCatalogItems.AsNoTracking() on service.ServiceCatalogItemId equals type.Id
            where (teacherServiceId == null || service.Id == teacherServiceId)
                && (teacherId == null || service.TeacherId == teacherId)
                && (teacherServiceId != null || type.Code == LiveSessionCatalogCode)
            select new { service, type })
            .SingleOrDefaultAsync(ct)
            ?? throw new DomainException("teacher_service_not_found", "Teacher service was not found.");

        if (row.type.OrderType != Domain.Catalog.ServiceOrderTypes.LiveSession
            || !row.type.RequiresScheduling)
            throw new DomainException("service_not_live_session", "Only the live_session catalog service can create a live session.");
        if (!row.type.IsActive)
            throw new DomainException("catalog_service_inactive", "The live session catalog service is disabled.");
        if (!row.type.IsPublic || !row.type.TeacherSelectable)
            throw new DomainException("catalog_service_unavailable", "The live session catalog service is not available for booking.");
        if (!row.service.IsActive)
            throw new DomainException("teacher_service_inactive", "The teacher has disabled this live session service.");
        if (row.service.IsSuperseded)
            throw new DomainException("teacher_service_superseded", "This Teacher service has been superseded.");
        ServiceCatalogPolicyValidator.EnsureOfferingTerms(
            row.type, row.service.Price, row.service.Currency, row.service.DeliveryHours, row.service.Revisions);

        var eligible = await db.TeacherProfiles.AsNoTracking().AnyAsync(profile =>
                profile.TeacherId == row.service.TeacherId
                && profile.IsPublished
                && db.Subjects.Any(subject => subject.Id == row.service.SubjectId && subject.IsActive)
                && db.TeacherSubjectQualifications.Any(q =>
                    q.TeacherId == row.service.TeacherId
                    && q.SubjectId == row.service.SubjectId
                    && q.Status == TeacherQualificationStatus.Approved
                    && q.RevokedAt == null), ct);
        if (!eligible)
            throw new DomainException("teacher_not_approved", "An active approved subject qualification is required.");

        return (row.service, row.type);
    }

    private static SlotCalculation CalculateSlots(
        IReadOnlyCollection<TeacherAvailabilityRule> rules,
        IReadOnlyCollection<TeacherAvailabilityException> exceptions,
        IReadOnlyCollection<LiveSessionBooking> bookings,
        int durationMinutes,
        DateTimeOffset horizonStart,
        DateTimeOffset horizonEnd,
        DateTimeOffset now)
    {
        var rawCount = 0;
        var afterExceptionsCount = 0;
        var bookable = new List<SlotInterval>();
        foreach (var rule in rules)
        {
            var zone = Zone(rule.TimeZoneId);
            var firstDate = DateOnly.FromDateTime(
                TimeZoneInfo.ConvertTime(horizonStart, zone).DateTime);
            var lastDate = DateOnly.FromDateTime(
                TimeZoneInfo.ConvertTime(horizonEnd.AddHours(4), zone).DateTime);
            var step = rule.SlotMinutes ?? durationMinutes;
            for (var date = firstDate; date <= lastDate; date = date.AddDays(1))
            {
                if (date.DayOfWeek != rule.DayOfWeek) continue;
                for (var start = rule.Start;
                     start.AddMinutes(durationMinutes) <= rule.End;
                     start = start.AddMinutes(step))
                {
                    var local = DateTime.SpecifyKind(
                        date.ToDateTime(start), DateTimeKind.Unspecified);
                    if (zone.IsInvalidTime(local) || zone.IsAmbiguousTime(local)) continue;
                    var startsAt = new DateTimeOffset(
                        TimeZoneInfo.ConvertTimeToUtc(local, zone), TimeSpan.Zero);
                    if (startsAt <= now || startsAt < horizonStart || startsAt >= horizonEnd)
                        continue;
                    var endsAt = startsAt.AddMinutes(durationMinutes);
                    rawCount++;
                    if (exceptions.Any(x => Overlaps(x.StartsAt, x.EndsAt, startsAt, endsAt)))
                        continue;
                    afterExceptionsCount++;
                    if (bookings.Any(x => Overlaps(x.StartsAt, x.EndsAt, startsAt, endsAt)))
                        continue;
                    bookable.Add(new(startsAt, endsAt));
                }
            }
        }

        return new(
            rawCount,
            afterExceptionsCount,
            bookable.OrderBy(x => x.StartsAt).ThenBy(x => x.EndsAt).ToArray());
    }

    private static DateTimeOffset StartOfDayUtc(DateOnly date, TimeZoneInfo zone)
    {
        var local = DateTime.SpecifyKind(
            date.ToDateTime(TimeOnly.MinValue), DateTimeKind.Unspecified);
        while (zone.IsInvalidTime(local))
            local = local.AddMinutes(1);
        if (zone.IsAmbiguousTime(local))
            return new DateTimeOffset(
                local, zone.GetAmbiguousTimeOffsets(local).Max()).ToUniversalTime();
        return new(
            TimeZoneInfo.ConvertTimeToUtc(local, zone), TimeSpan.Zero);
    }

    private static IReadOnlyCollection<int> ParseDurations(string csv) =>
        csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(value => int.TryParse(value, out var duration) ? duration : 0)
            .Where(value => value is >= 15 and <= 240)
            .Distinct()
            .Order()
            .ToArray();

    private static bool Overlaps(
        DateTimeOffset firstStart,
        DateTimeOffset firstEnd,
        DateTimeOffset secondStart,
        DateTimeOffset secondEnd) =>
        firstStart < secondEnd && secondStart < firstEnd;

    private static AvailabilitySummaryDto Summary(
        string teacherId,
        string state,
        DateTimeOffset horizonEnd,
        string viewerTimeZoneId,
        bool fallback) =>
        new(
            teacherId,
            null,
            state,
            null,
            null,
            null,
            horizonEnd,
            viewerTimeZoneId,
            fallback);

    private sealed record SummaryService(Guid ServiceId, int DurationMinutes);
    private sealed record SlotInterval(DateTimeOffset StartsAt, DateTimeOffset EndsAt);
    private sealed record SlotCalculation(
        int RawCount,
        int AfterExceptionsCount,
        IReadOnlyCollection<SlotInterval> Bookable);

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
    private static LiveSessionDto Map(
        LiveSessionBooking x,
        IReadOnlyDictionary<string, (string FullName, string? FullNameEnglish)>? names = null) =>
        new(x.Id, x.StudentId, x.TeacherId, x.TeacherServiceId, x.Title, x.Notes,
            x.StartsAt, x.EndsAt, x.StudentTimeZoneId, x.TeacherTimeZoneId,
            x.BasePrice, x.Currency, x.EmergencyPremiumPercent, x.EmergencyPremiumAmount,
            x.TotalPrice, x.CancellationWindowHours, x.Status, x.RescheduleCount,
            x.Attachments.Select(a => new AttachmentDto(
                a.Id, a.OriginalName, a.ContentType, a.Size, a.CreatedAt)).ToArray(),
            Convert.ToBase64String(x.RowVersion),
            names is not null && names.TryGetValue(x.StudentId, out var student) ? student.FullName : null,
            names is not null && names.TryGetValue(x.TeacherId, out var teacher) ? teacher.FullName : null,
            names is not null && names.TryGetValue(x.StudentId, out student) ? student.FullNameEnglish : null,
            names is not null && names.TryGetValue(x.TeacherId, out teacher) ? teacher.FullNameEnglish : null,
            x.ServiceCatalogItemId, x.CatalogCode, x.CategoryCode, x.OrderType,
            x.ServiceNameEnglish, x.ServiceNameArabic);
}
