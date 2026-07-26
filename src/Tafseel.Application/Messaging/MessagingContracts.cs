using System.ComponentModel.DataAnnotations;
using Tafseel.Application.Common;
using Tafseel.Application.Orders;
using Tafseel.Domain.Messaging;

namespace Tafseel.Application.Messaging;

public sealed record CreateConversation(
    [param: Required] string OtherUserId, ConversationScope Scope, Guid? ResourceId);
public sealed record SendMessage(
    [param: Required, NotWhiteSpace, StringLength(4000)] string Body);
public sealed record MessageDto(
    Guid Id, Guid ConversationId, string SenderId, string Body, DateTimeOffset CreatedAt,
    IReadOnlyCollection<AttachmentDto> Attachments);
public sealed record ConversationDto(
    Guid Id, ConversationScope Scope, Guid? ResourceId, IReadOnlyCollection<string> ParticipantIds,
    MessageDto? LatestMessage, int UnreadCount, DateTimeOffset UpdatedAt, string Version);
public sealed record NotificationDto(
    Guid Id, string Type, string Title, string Body, string? Link,
    DateTimeOffset CreatedAt, DateTimeOffset? ReadAt);
public sealed record NotificationPreferences(bool InAppEnabled, bool EmailEnabled);

public interface IMessagingService
{
    Task<ConversationDto> CreateAsync(string userId, CreateConversation input, CancellationToken ct);
    Task<PagedResult<ConversationDto>> GetConversationsAsync(string userId, int page, int pageSize, CancellationToken ct);
    Task<PagedResult<MessageDto>> GetMessagesAsync(string userId, Guid conversationId, int page, int pageSize, CancellationToken ct);
    Task<MessageDto> SendAsync(string userId, Guid conversationId, SendMessage input, CancellationToken ct);
    Task MarkReadAsync(string userId, Guid conversationId, string version, CancellationToken ct);
    Task<AttachmentDto> AddAttachmentAsync(string userId, Guid messageId, Stream stream,
        string fileName, string contentType, long size, CancellationToken ct);
    Task<PrivateFile> OpenAttachmentAsync(string userId, Guid attachmentId, CancellationToken ct);
}

public interface INotificationService
{
    Task NotifyAsync(string userId, string type, string title, string body,
        string? link, string deduplicationKey, bool email, CancellationToken ct);
    Task<PagedResult<NotificationDto>> GetAsync(string userId, int page, int pageSize, CancellationToken ct);
    Task MarkReadAsync(string userId, Guid? id, CancellationToken ct);
    Task<NotificationPreferences> GetPreferencesAsync(string userId, CancellationToken ct);
    Task UpdatePreferencesAsync(string userId, NotificationPreferences input, CancellationToken ct);
}
