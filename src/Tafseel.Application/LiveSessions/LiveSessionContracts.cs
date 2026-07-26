using System.ComponentModel.DataAnnotations;
using Tafseel.Application.Common;
using Tafseel.Application.Orders;
using Tafseel.Domain.LiveSessions;

namespace Tafseel.Application.LiveSessions;

public sealed record BookLiveSession(
    Guid TeacherServiceId,
    [param: Required, NotWhiteSpace, StringLength(200)] string Title,
    [param: StringLength(2000)] string? Notes,
    DateTime LocalStart,
    [param: Required, NotWhiteSpace, StringLength(100)] string StudentTimeZoneId,
    [param: Range(30, 120)] int DurationMinutes,
    bool Emergency);

public sealed record RescheduleLiveSession(
    DateTime LocalStart,
    [param: Required, NotWhiteSpace, StringLength(100)] string TimeZoneId);

public sealed record LiveSessionDto(
    Guid Id, string StudentId, string TeacherId, Guid TeacherServiceId, string Title, string Notes,
    DateTimeOffset StartsAt, DateTimeOffset EndsAt, string StudentTimeZoneId, string TeacherTimeZoneId,
    decimal BasePrice, string Currency, decimal EmergencyPremiumPercent, decimal EmergencyPremiumAmount,
    decimal TotalPrice, int CancellationWindowHours, LiveSessionStatus Status, int RescheduleCount,
    IReadOnlyCollection<AttachmentDto> Attachments, string Version);

public sealed record BookableSlotDto(
    DateTimeOffset StartsAt, DateTimeOffset EndsAt, DateTime StudentLocalStart, string StudentTimeZoneId);
public sealed record JoinSessionDto(string Url, DateTimeOffset ValidFrom, DateTimeOffset ValidUntil);

public interface ILiveSessionService
{
    Task<IReadOnlyCollection<BookableSlotDto>> GetSlotsAsync(
        string teacherId, DateOnly from, int days, int durationMinutes, string studentTimeZoneId, CancellationToken ct);
    Task<LiveSessionDto> BookAsync(string studentId, BookLiveSession input, CancellationToken ct);
    Task<PagedResult<LiveSessionDto>> GetMineAsync(string userId, int page, int pageSize, CancellationToken ct);
    Task RescheduleAsync(string userId, Guid id, RescheduleLiveSession input, string version, CancellationToken ct);
    Task CancelAsync(string userId, Guid id, string version, CancellationToken ct);
    Task CompleteAsync(string teacherId, Guid id, string version, CancellationToken ct);
    Task MarkNoShowAsync(string userId, Guid id, bool studentNoShow, string version, CancellationToken ct);
    Task<AttachmentDto> AddAttachmentAsync(string userId, Guid id, Stream stream, string fileName, string contentType, long size, string version, CancellationToken ct);
    Task<PrivateFile> OpenAttachmentAsync(string userId, Guid attachmentId, CancellationToken ct);
    Task<JoinSessionDto> JoinAsync(string userId, Guid id, CancellationToken ct);
}

public interface ILiveSessionLinkProvider
{
    Task<string> GetJoinUrlAsync(Guid bookingId, string joinKey, CancellationToken ct);
}

public sealed class LiveSessionOptions
{
    public const string SectionName = "LiveSessions";
    public string Provider { get; init; } = "Mock";
    public decimal EmergencyPremiumPercent { get; init; } = 50;
    public int CancellationWindowHours { get; init; } = 24;
    public int JoinWindowMinutes { get; init; } = 15;
}
