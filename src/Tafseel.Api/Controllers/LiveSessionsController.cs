using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tafseel.Application.Authorization;
using Tafseel.Application.Common;
using Tafseel.Application.LiveSessions;

namespace Tafseel.Api.Controllers;

[ApiController]
[Route("api/v1/live-sessions")]
public sealed class LiveSessionsController(ILiveSessionService sessions) : ControllerBase
{
    [AllowAnonymous, HttpGet("teachers/{teacherId}/slots")]
    public Task<IReadOnlyCollection<BookableSlotDto>> Slots(
        string teacherId, [FromQuery] DateOnly from, [FromQuery] int days,
        [FromQuery] int durationMinutes, [FromQuery, Required] string studentTimeZoneId,
        CancellationToken ct) =>
        sessions.GetSlotsAsync(teacherId, from, days, durationMinutes, studentTimeZoneId, ct);

    [Authorize(Policy = Permissions.SessionsBook), HttpPost]
    public async Task<IActionResult> Book(BookLiveSession input, CancellationToken ct)
    {
        var booking = await sessions.BookAsync(UserId(), input, ct);
        return Created($"/api/v1/live-sessions/{booking.Id}", booking);
    }

    [Authorize(Policy = Permissions.SessionsManageOwn), HttpGet("mine")]
    public Task<PagedResult<LiveSessionDto>> Mine(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        sessions.GetMineAsync(UserId(), page, pageSize, ct);

    [Authorize(Policy = Permissions.SessionsManageOwn), HttpPost("{id:guid}/reschedule")]
    public async Task<IActionResult> Reschedule(
        Guid id, RescheduleLiveSession input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await sessions.RescheduleAsync(UserId(), id, input, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.SessionsManageOwn), HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(
        Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await sessions.CancelAsync(UserId(), id, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.SessionsManageOwn), HttpPost("{id:guid}/complete")]
    public async Task<IActionResult> Complete(
        Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await sessions.CompleteAsync(UserId(), id, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.SessionsManageOwn), HttpPost("{id:guid}/no-show")]
    public async Task<IActionResult> NoShow(
        Guid id, NoShowInput input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await sessions.MarkNoShowAsync(UserId(), id, input.StudentNoShow, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.SessionsManageOwn), EnableRateLimiting("upload")]
    [RequestSizeLimit(50 * 1024 * 1024), HttpPost("{id:guid}/attachments")]
    public async Task<IActionResult> AddAttachment(
        Guid id, IFormFile file,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        var attachment = await sessions.AddAttachmentAsync(
            UserId(), id, stream, file.FileName, file.ContentType, file.Length, version, ct);
        return Created($"/api/v1/live-sessions/attachments/{attachment.Id}/content", attachment);
    }

    [Authorize, HttpGet("attachments/{id:guid}/content")]
    public async Task<IActionResult> Attachment(Guid id, CancellationToken ct)
    {
        var file = await sessions.OpenAttachmentAsync(UserId(), id, ct);
        return File(file.Content, file.ContentType, file.FileName, enableRangeProcessing: true);
    }

    [Authorize(Policy = Permissions.SessionsManageOwn), HttpGet("{id:guid}/join")]
    public Task<JoinSessionDto> Join(Guid id, CancellationToken ct) =>
        sessions.JoinAsync(UserId(), id, ct);

    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}

public sealed record NoShowInput(bool StudentNoShow);
