using Tafseel.Domain.Common;

namespace Tafseel.Domain.Messaging;

public enum ConversationScope { General, LearningRequest, Order, LiveSession }

public sealed class Conversation
{
    private readonly List<ConversationParticipant> _participants = [];
    private readonly List<Message> _messages = [];
    private Conversation() { }
    public Conversation(string firstUserId, string secondUserId, ConversationScope scope,
        Guid? resourceId, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(firstUserId) || string.IsNullOrWhiteSpace(secondUserId)
            || firstUserId == secondUserId || scope != ConversationScope.General && resourceId is null)
            throw new DomainException("invalid_conversation", "Conversation participants or scope are invalid.");
        Id = Guid.NewGuid(); Scope = scope; ResourceId = resourceId; CreatedAt = UpdatedAt = now;
        _participants.Add(new(Id, firstUserId, now));
        _participants.Add(new(Id, secondUserId, now));
    }
    public Guid Id { get; private set; }
    public ConversationScope Scope { get; private set; }
    public Guid? ResourceId { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];
    public IReadOnlyCollection<ConversationParticipant> Participants => _participants;
    public IReadOnlyCollection<Message> Messages => _messages;
    public Message Send(string senderId, string body, DateTimeOffset now)
    {
        RequireParticipant(senderId);
        body = body?.Trim() ?? "";
        if (body.Length is 0 or > 4000)
            throw new DomainException("invalid_message", "Message body is required and limited to 4,000 characters.");
        var message = new Message(Id, senderId, body, now);
        _messages.Add(message); UpdatedAt = now; return message;
    }
    public void MarkRead(string userId, DateTimeOffset now)
    {
        var participant = _participants.SingleOrDefault(x => x.UserId == userId)
            ?? throw new DomainException("conversation_not_owned", "Conversation was not found.");
        participant.MarkRead(now);
    }
    public void RequireParticipant(string userId)
    {
        if (_participants.All(x => x.UserId != userId))
            throw new DomainException("conversation_not_owned", "Conversation was not found.");
    }
}

public sealed class ConversationParticipant
{
    private ConversationParticipant() { }
    internal ConversationParticipant(Guid conversationId, string userId, DateTimeOffset joinedAt)
    { ConversationId = conversationId; UserId = userId; JoinedAt = joinedAt; }
    public Guid ConversationId { get; private set; }
    public string UserId { get; private set; } = "";
    public DateTimeOffset JoinedAt { get; private set; }
    public DateTimeOffset? LastReadAt { get; private set; }
    internal void MarkRead(DateTimeOffset now) => LastReadAt = now;
}

public sealed class Message
{
    private readonly List<MessageAttachment> _attachments = [];
    private Message() { }
    internal Message(Guid conversationId, string senderId, string body, DateTimeOffset createdAt)
    { Id = Guid.NewGuid(); ConversationId = conversationId; SenderId = senderId; Body = body; CreatedAt = createdAt; }
    public Guid Id { get; private set; }
    public Guid ConversationId { get; private set; }
    public string SenderId { get; private set; } = "";
    public string Body { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
    public IReadOnlyCollection<MessageAttachment> Attachments => _attachments;
    public void AddAttachment(string senderId, string storageKey, string originalName,
        string contentType, long size, DateTimeOffset now)
    {
        if (senderId != SenderId) throw new DomainException("message_not_owned", "Message was not found.");
        _attachments.Add(new(Id, storageKey, originalName, contentType, size, now));
    }
}

public sealed class MessageAttachment
{
    private MessageAttachment() { }
    internal MessageAttachment(Guid messageId, string storageKey, string originalName,
        string contentType, long size, DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid(); MessageId = messageId; StorageKey = storageKey; OriginalName = originalName;
        ContentType = contentType; Size = size; CreatedAt = createdAt;
    }
    public Guid Id { get; private set; }
    public Guid MessageId { get; private set; }
    public string StorageKey { get; private set; } = "";
    public string OriginalName { get; private set; } = "";
    public string ContentType { get; private set; } = "";
    public long Size { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class Notification
{
    private Notification() { }
    public Notification(string userId, string type, string title, string body,
        string? link, string deduplicationKey, DateTimeOffset now, bool inAppVisible = true)
    {
        Id = Guid.NewGuid(); UserId = Required(userId, 450); Type = Required(type, 100);
        Title = Required(title, 200); Body = Required(body, 1000); Link = link?.Trim();
        DeduplicationKey = Required(deduplicationKey, 200); CreatedAt = now;
        InAppVisible = inAppVisible;
    }
    public Guid Id { get; private set; }
    public string UserId { get; private set; } = "";
    public string Type { get; private set; } = "";
    public string Title { get; private set; } = "";
    public string Body { get; private set; } = "";
    public string? Link { get; private set; }
    public string DeduplicationKey { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
    public bool InAppVisible { get; private set; }
    public DateTimeOffset? ReadAt { get; private set; }
    public void MarkRead(DateTimeOffset now) => ReadAt ??= now;
    private static string Required(string? value, int max)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 || value.Length > max)
            throw new DomainException("invalid_notification", "Notification value is invalid.");
        return value;
    }
}

public sealed class UserNotificationPreference
{
    private UserNotificationPreference() { }
    public UserNotificationPreference(string userId)
    { UserId = userId; InAppEnabled = true; EmailEnabled = true; }
    public string UserId { get; private set; } = "";
    public bool InAppEnabled { get; private set; }
    public bool EmailEnabled { get; private set; }
    public void Update(bool inApp, bool email) { InAppEnabled = inApp; EmailEnabled = email; }
}

public enum OutboxStatus { Pending, Processing, Sent, Failed }
public sealed class NotificationOutbox
{
    private NotificationOutbox() { }
    public NotificationOutbox(Guid notificationId, string deduplicationKey, DateTimeOffset now)
    {
        Id = Guid.NewGuid(); NotificationId = notificationId; DeduplicationKey = deduplicationKey;
        Status = OutboxStatus.Pending; CreatedAt = now; NextAttemptAt = now;
    }
    public Guid Id { get; private set; }
    public Guid NotificationId { get; private set; }
    public string DeduplicationKey { get; private set; } = "";
    public OutboxStatus Status { get; private set; }
    public int Attempts { get; private set; }
    public DateTimeOffset NextAttemptAt { get; private set; }
    public string? LastError { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];
    public void Start(DateTimeOffset now)
    {
        if (Status is not (OutboxStatus.Pending or OutboxStatus.Processing) || NextAttemptAt > now)
            throw new DomainException("outbox_not_due", "Outbox message is not due.");
        Status = OutboxStatus.Processing; Attempts++; NextAttemptAt = now.AddMinutes(5);
    }
    public void Sent() { Status = OutboxStatus.Sent; LastError = null; }
    public void Retry(string error, DateTimeOffset next)
    { LastError = error[..Math.Min(error.Length, 500)]; NextAttemptAt = next; Status = Attempts >= 5 ? OutboxStatus.Failed : OutboxStatus.Pending; }
}
