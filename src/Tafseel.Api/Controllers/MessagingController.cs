using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tafseel.Application.Authorization;
using Tafseel.Application.Common;
using Tafseel.Application.Messaging;
using Tafseel.Application.Orders;

namespace Tafseel.Api.Controllers;

[ApiController, Route("api/v1")]
[Authorize(Policy = Permissions.MessagesUse)]
public sealed class MessagingController(
    IMessagingService messaging, INotificationService notifications) : ControllerBase
{
    [HttpPost("conversations")]
    public Task<ConversationDto> Create(CreateConversation input, CancellationToken ct) =>
        messaging.CreateAsync(UserId(), input, ct);

    [HttpGet("conversations")]
    public Task<PagedResult<ConversationDto>> Conversations(
        int page = 1, int pageSize = 20, CancellationToken ct = default) =>
        messaging.GetConversationsAsync(UserId(), page, pageSize, ct);

    [HttpGet("conversations/{id:guid}/messages")]
    public Task<PagedResult<MessageDto>> Messages(
        Guid id, int page = 1, int pageSize = 50, CancellationToken ct = default) =>
        messaging.GetMessagesAsync(UserId(), id, page, pageSize, ct);

    [EnableRateLimiting("messaging"), HttpPost("conversations/{id:guid}/messages")]
    public Task<MessageDto> Send(Guid id, SendMessage input, CancellationToken ct) =>
        messaging.SendAsync(UserId(), id, input, ct);

    [HttpPost("conversations/{id:guid}/read")]
    public async Task<IActionResult> Read(
        Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await messaging.MarkReadAsync(UserId(), id, version, ct);
        return NoContent();
    }

    [EnableRateLimiting("upload"), RequestSizeLimit(50 * 1024 * 1024)]
    [HttpPost("messages/{id:guid}/attachments")]
    public async Task<AttachmentDto> Attachment(Guid id, IFormFile file, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return await messaging.AddAttachmentAsync(
            UserId(), id, stream, file.FileName, file.ContentType, file.Length, ct);
    }

    [HttpGet("message-attachments/{id:guid}/content")]
    public async Task<IActionResult> AttachmentContent(Guid id, CancellationToken ct)
    {
        var file = await messaging.OpenAttachmentAsync(UserId(), id, ct);
        return File(file.Content, file.ContentType, file.FileName, enableRangeProcessing: true);
    }

    [HttpGet("notifications")]
    public Task<PagedResult<NotificationDto>> Notifications(
        int page = 1, int pageSize = 20, CancellationToken ct = default) =>
        notifications.GetAsync(UserId(), page, pageSize, ct);

    [HttpPost("notifications/read")]
    public async Task<IActionResult> ReadNotifications(Guid? id, CancellationToken ct)
    {
        await notifications.MarkReadAsync(UserId(), id, ct);
        return NoContent();
    }

    [HttpGet("notification-preferences")]
    public Task<NotificationPreferences> Preferences(CancellationToken ct) =>
        notifications.GetPreferencesAsync(UserId(), ct);

    [HttpPut("notification-preferences")]
    public async Task<IActionResult> Preferences(NotificationPreferences input, CancellationToken ct)
    {
        await notifications.UpdatePreferencesAsync(UserId(), input, ct);
        return NoContent();
    }

    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}
