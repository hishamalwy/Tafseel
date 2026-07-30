using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Tafseel.Application.Common;
using Tafseel.Application.Authorization;
using Tafseel.Application.Email;
using Tafseel.Application.Messaging;
using Tafseel.Application.Orders;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Domain.Messaging;
using Tafseel.Infrastructure.Email;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Messaging;

internal sealed class MessagingService(
    TafseelDbContext db,
    IFileStorageService files,
    NotificationWriter notificationWriter,
    IHubContext<MessagingHub> hub,
    ILogger<MessagingService> logger,
    TimeProvider clock) : IMessagingService
{
    public async Task<ConversationDto> CreateAsync(
        string userId, CreateConversation input, CancellationToken ct)
    {
        await ValidateScopeAsync(userId, input, ct);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var lockKey = input.Scope == ConversationScope.General
            ? string.Join(":", new[] { userId, input.OtherUserId }.Order())
            : $"{input.Scope}:{input.ResourceId}";
        if (db.Database.IsSqlServer())
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"EXEC sp_getapplock @Resource={"conversation:" + lockKey}, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000", ct);
        var existing = input.Scope == ConversationScope.General
            ? await db.Conversations.Include(x => x.Participants).SingleOrDefaultAsync(x =>
                x.Scope == ConversationScope.General
                && x.Participants.Any(p => p.UserId == userId)
                && x.Participants.Any(p => p.UserId == input.OtherUserId), ct)
            : await db.Conversations.Include(x => x.Participants)
                .SingleOrDefaultAsync(x => x.Scope == input.Scope && x.ResourceId == input.ResourceId, ct);
        if (existing is not null)
        {
            existing.RequireParticipant(userId);
            await transaction.CommitAsync(ct);
            return await MapAsync(existing, userId, ct);
        }
        var conversation = new Conversation(
            userId, input.OtherUserId, input.Scope, input.ResourceId, clock.GetUtcNow());
        db.Add(conversation);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return await MapAsync(conversation, userId, ct);
    }

    public async Task<PagedResult<ConversationDto>> GetConversationsAsync(
        string userId, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 50);
        var query = db.Conversations.Where(x => x.Participants.Any(p => p.UserId == userId));
        var total = await query.CountAsync(ct);
        var items = await query.AsNoTracking()
            .OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Include(x => x.Participants).Include(x => x.Messages).ThenInclude(x => x.Attachments)
            .AsSplitQuery().ToArrayAsync(ct);
        var participantIds = items.SelectMany(x => x.Participants).Select(x => x.UserId).Distinct().ToArray();
        var people = await LoadPeopleAsync(participantIds, ct);
        var roleRows = await (
            from userRole in db.UserRoles.AsNoTracking()
            join role in db.Roles.AsNoTracking() on userRole.RoleId equals role.Id
            where participantIds.Contains(userRole.UserId)
            select new { userRole.UserId, role.Name })
            .ToArrayAsync(ct);
        var roles = roleRows.GroupBy(x => x.UserId)
            .ToDictionary(x => x.Key, x => x.First().Name ?? string.Empty);
        return new(items.Select(x => Map(x, userId, people, roles)).ToArray(), page, pageSize, total);
    }

    public async Task<PagedResult<MessageDto>> GetMessagesAsync(
        string userId, Guid conversationId, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
        if (!await db.Set<ConversationParticipant>().AnyAsync(
                x => x.ConversationId == conversationId && x.UserId == userId, ct))
            throw NotOwned();
        var query = db.Messages.Where(x => x.ConversationId == conversationId);
        var total = await query.CountAsync(ct);
        var items = await query.AsNoTracking().OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).Include(x => x.Attachments).ToArrayAsync(ct);
        return new(items.Select(Map).ToArray(), page, pageSize, total);
    }

    public async Task<MessageDto> SendAsync(
        string userId, Guid conversationId, SendMessage input, CancellationToken ct)
    {
        var conversation = await db.Conversations.Include(x => x.Participants)
            .Include(x => x.Messages).SingleOrDefaultAsync(x => x.Id == conversationId, ct)
            ?? throw NotOwned();
        var message = conversation.Send(userId, input.Body, clock.GetUtcNow());
        var recipientIds = conversation.Participants.Where(x => x.UserId != userId).Select(x => x.UserId).ToArray();
        foreach (var recipientId in recipientIds)
            await notificationWriter.QueueAsync(recipientId, "NewMessage", "New message",
                "You received a new private message.", "/app/Tafseel-Auth.dc.html",
                $"message:{message.Id}", email: false, ct);
        await db.SaveChangesAsync(ct); // system of record before broadcast
        var dto = Map(message);
        try
        {
            await hub.Clients.Group(MessagingHub.ConversationGroup(conversationId))
                .SendAsync("MessageReceived", dto, ct);
            foreach (var recipientId in recipientIds)
                await hub.Clients.Group(MessagingHub.UserGroup(recipientId))
                    .SendAsync("NotificationChanged", ct);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Message {MessageId} persisted but real-time broadcast failed", message.Id);
        }
        return dto;
    }

    public async Task MarkReadAsync(string userId, Guid conversationId, string version, CancellationToken ct)
    {
        var conversation = await db.Conversations.Include(x => x.Participants)
            .SingleOrDefaultAsync(x => x.Id == conversationId, ct) ?? throw NotOwned();
        try
        {
            db.Entry(conversation).Property(x => x.RowVersion).OriginalValue =
                Convert.FromBase64String(version.Trim('"'));
        }
        catch (FormatException) { throw new DomainException("invalid_concurrency_token", "Conversation version is invalid."); }
        conversation.MarkRead(userId, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }

    public async Task<AttachmentDto> AddAttachmentAsync(
        string userId, Guid messageId, Stream stream, string fileName,
        string contentType, long size, CancellationToken ct)
    {
        var message = await db.Messages.Include(x => x.Attachments)
            .SingleOrDefaultAsync(x => x.Id == messageId && x.SenderId == userId
                && db.Set<ConversationParticipant>().Any(p =>
                    p.ConversationId == x.ConversationId && p.UserId == userId), ct)
            ?? throw new DomainException("message_not_owned", "Message was not found.");
        var stored = await files.StorePrivateFileAsync(
            stream, fileName, contentType, size, "message-attachments", ct);
        try
        {
            message.AddAttachment(userId, stored.StorageKey, SafeName(fileName),
                stored.ContentType, stored.Size, clock.GetUtcNow());
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            await files.DeletePrivateFileAsync(stored.StorageKey, CancellationToken.None);
            throw;
        }
        return Map(message.Attachments.Last());
    }

    public async Task<PrivateFile> OpenAttachmentAsync(
        string userId, Guid attachmentId, CancellationToken ct)
    {
        var item = await (
            from attachment in db.MessageAttachments.AsNoTracking()
            join message in db.Messages.AsNoTracking() on attachment.MessageId equals message.Id
            join participant in db.Set<ConversationParticipant>().AsNoTracking()
                on message.ConversationId equals participant.ConversationId
            where attachment.Id == attachmentId && participant.UserId == userId
            select new { attachment.StorageKey, attachment.ContentType, attachment.OriginalName })
            .SingleOrDefaultAsync(ct)
            ?? throw new DomainException("attachment_not_owned", "Attachment was not found.");
        return new(await files.OpenPrivateFileAsync(item.StorageKey, ct),
            item.ContentType, item.OriginalName);
    }

    private async Task ValidateScopeAsync(string userId, CreateConversation input, CancellationToken ct)
    {
        if (input.OtherUserId == userId) throw new DomainException("invalid_conversation", "Cannot message yourself.");
        var valid = input.Scope switch
        {
            ConversationScope.General => await db.TeacherProfiles.AnyAsync(
                    x => x.TeacherId == input.OtherUserId && x.IsPublished, ct)
                && await db.UserRoles.AnyAsync(ur => ur.UserId == userId
                    && db.Roles.Any(r => r.Id == ur.RoleId && r.Name == Roles.Student), ct),
            ConversationScope.LearningRequest => await db.LearningRequests.AnyAsync(x =>
                x.Id == input.ResourceId
                && ((x.StudentId == userId && x.TeacherId == input.OtherUserId)
                    || (x.TeacherId == userId && x.StudentId == input.OtherUserId)), ct),
            ConversationScope.Order => await db.Orders.AnyAsync(x =>
                x.Id == input.ResourceId
                && ((x.StudentId == userId && x.TeacherId == input.OtherUserId)
                    || (x.TeacherId == userId && x.StudentId == input.OtherUserId)), ct),
            ConversationScope.LiveSession => await db.LiveSessionBookings.AnyAsync(x =>
                x.Id == input.ResourceId
                && ((x.StudentId == userId && x.TeacherId == input.OtherUserId)
                    || (x.TeacherId == userId && x.StudentId == input.OtherUserId)), ct),
            _ => false
        };
        if (!valid) throw NotOwned();
    }

    private async Task<ConversationDto> MapAsync(Conversation x, string userId, CancellationToken ct)
    {
        var ids = x.Participants.Select(p => p.UserId).ToArray();
        var people = await LoadPeopleAsync(ids, ct);
        var roleRows = await (
            from userRole in db.UserRoles.AsNoTracking()
            join role in db.Roles.AsNoTracking() on userRole.RoleId equals role.Id
            where ids.Contains(userRole.UserId)
            select new { userRole.UserId, role.Name })
            .ToArrayAsync(ct);
        var roles = roleRows.GroupBy(x => x.UserId)
            .ToDictionary(x => x.Key, x => x.First().Name ?? string.Empty);
        return Map(x, userId, people, roles);
    }

    private async Task<IReadOnlyDictionary<string, PersonNames>> LoadPeopleAsync(
        IReadOnlyCollection<string> ids, CancellationToken ct)
    {
        if (ids.Count == 0)
            return new Dictionary<string, PersonNames>();
        return await db.Users.AsNoTracking()
            .Where(u => ids.Contains(u.Id))
            .ToDictionaryAsync(
                u => u.Id,
                u => new PersonNames(
                    string.IsNullOrWhiteSpace(u.FullName) ? "" : u.FullName.Trim(),
                    string.IsNullOrWhiteSpace(u.FullNameEnglish) ? "" : u.FullNameEnglish.Trim()),
                ct);
    }

    private static ConversationDto Map(
        Conversation x, string userId,
        IReadOnlyDictionary<string, PersonNames> people,
        IReadOnlyDictionary<string, string> roles)
    {
        var readAt = x.Participants.Single(p => p.UserId == userId).LastReadAt;
        var latest = x.Messages.OrderByDescending(m => m.CreatedAt).FirstOrDefault();
        return new(x.Id, x.Scope, x.ResourceId, x.Participants.Select(p => p.UserId).ToArray(),
            latest is null ? null : Map(latest),
            x.Messages.Count(m => m.SenderId != userId && (readAt is null || m.CreatedAt > readAt)),
            x.UpdatedAt, Convert.ToBase64String(x.RowVersion),
            x.Participants.Select(p =>
            {
                people.TryGetValue(p.UserId, out var names);
                // Never project empty or missing names as IDs. Client localizes unavailable.
                var primary = names.FullName;
                var english = names.FullNameEnglish;
                var label = !string.IsNullOrWhiteSpace(primary) ? primary
                    : !string.IsNullOrWhiteSpace(english) ? english
                    : "";
                var initials = string.IsNullOrWhiteSpace(label)
                    ? "··"
                    : string.Concat(label.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                        .Take(2).Select(part => char.ToUpperInvariant(part[0])));
                return new ConversationParticipantDto(
                    p.UserId, label, initials, roles.GetValueOrDefault(p.UserId),
                    string.IsNullOrWhiteSpace(english) ? null : english);
            }).ToArray());
    }

    private readonly record struct PersonNames(string FullName, string FullNameEnglish);
    private static MessageDto Map(Message x) =>
        new(x.Id, x.ConversationId, x.SenderId, x.Body, x.CreatedAt, x.Attachments.Select(Map).ToArray());
    private static AttachmentDto Map(MessageAttachment x) =>
        new(x.Id, x.OriginalName, x.ContentType, x.Size, x.CreatedAt);
    private static string SafeName(string value) =>
        Path.GetFileName(value) is { Length: > 0 and <= 255 } name ? name : "attachment";
    private static DomainException NotOwned() =>
        new("conversation_not_owned", "Conversation was not found.");
}

internal sealed class NotificationService(
    TafseelDbContext db, NotificationWriter writer,
    IHubContext<MessagingHub> hub, ILogger<NotificationService> logger,
    TimeProvider clock) : INotificationService
{
    public async Task NotifyAsync(string userId, string type, string title, string body,
        string? link, string deduplicationKey, bool email, CancellationToken ct)
    {
        if (!await writer.QueueAsync(
                userId, type, title, body, link, deduplicationKey, email, ct)) return;
        await db.SaveChangesAsync(ct);
        try { await hub.Clients.Group(MessagingHub.UserGroup(userId)).SendAsync("NotificationChanged", ct); }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Notification persisted but real-time broadcast failed for {UserId}", userId);
        }
    }

    public async Task<PagedResult<NotificationDto>> GetAsync(
        string userId, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = db.Notifications.Where(x => x.UserId == userId && x.InAppVisible);
        var total = await query.CountAsync(ct);
        var items = await query.AsNoTracking().OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(items.Select(Map).ToArray(), page, pageSize, total);
    }
    public async Task MarkReadAsync(string userId, Guid? id, CancellationToken ct)
    {
        var items = await db.Notifications.Where(x => x.UserId == userId
            && (id == null || x.Id == id)).ToArrayAsync(ct);
        if (id is not null && items.Length == 0)
            throw new DomainException("notification_not_owned", "Notification was not found.");
        foreach (var item in items) item.MarkRead(clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }
    public async Task<NotificationPreferences> GetPreferencesAsync(string userId, CancellationToken ct)
    {
        var item = await db.UserNotificationPreferences.AsNoTracking()
            .SingleOrDefaultAsync(x => x.UserId == userId, ct);
        return item is null ? new(true, true) : new(item.InAppEnabled, item.EmailEnabled);
    }
    public async Task UpdatePreferencesAsync(
        string userId, NotificationPreferences input, CancellationToken ct)
    {
        var item = await db.UserNotificationPreferences.SingleOrDefaultAsync(x => x.UserId == userId, ct);
        if (item is null) db.Add(item = new UserNotificationPreference(userId));
        item.Update(input.InAppEnabled, input.EmailEnabled);
        await db.SaveChangesAsync(ct);
    }
    private static NotificationDto Map(Notification x) =>
        new(x.Id, x.Type, x.Title, x.Body, x.Link, x.CreatedAt, x.ReadAt);
}

internal sealed class NotificationWriter(TafseelDbContext db, TimeProvider clock)
{
    public async Task<bool> QueueAsync(string userId, string type, string title, string body,
        string? link, string deduplicationKey, bool email, CancellationToken ct)
    {
        if (db.ChangeTracker.Entries<Notification>().Any(x =>
                x.Entity.UserId == userId && x.Entity.DeduplicationKey == deduplicationKey)
            || await db.Notifications.AnyAsync(
                x => x.UserId == userId && x.DeduplicationKey == deduplicationKey, ct))
            return false;
        var preference = await db.UserNotificationPreferences.AsNoTracking()
            .SingleOrDefaultAsync(x => x.UserId == userId, ct);
        if (preference is { InAppEnabled: false } && (!email || !preference.EmailEnabled)) return false;
        var inAppVisible = preference?.InAppEnabled != false;
        var notification = new Notification(
            userId, type, title, body, link, deduplicationKey, clock.GetUtcNow(), inAppVisible);
        db.Add(notification);
        if (email && preference?.EmailEnabled != false)
            db.Add(new NotificationOutbox(notification.Id, deduplicationKey, clock.GetUtcNow()));
        return true;
    }
}

[Authorize(Policy = Tafseel.Application.Authorization.Permissions.MessagesUse)]
public sealed class MessagingHub(TafseelDbContext db) : Hub
{
    public static string UserGroup(string id) => $"user:{id}";
    public static string ConversationGroup(Guid id) => $"conversation:{id:N}";
    public override async Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier;
        if (!string.IsNullOrWhiteSpace(userId))
            await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(userId));
        await base.OnConnectedAsync();
    }
    public async Task JoinConversation(Guid conversationId)
    {
        var userId = Context.UserIdentifier;
        if (userId is null || !await db.Set<ConversationParticipant>().AnyAsync(
                x => x.ConversationId == conversationId && x.UserId == userId))
            throw new HubException("Conversation was not found.");
        await Groups.AddToGroupAsync(Context.ConnectionId, ConversationGroup(conversationId));
    }
}

internal sealed class SubjectUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection) =>
        connection.User?.FindFirst("sub")?.Value;
}

internal sealed class NotificationOutboxWorker(
    IServiceScopeFactory scopes, TimeProvider clock, ILogger<NotificationOutboxWorker> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await DispatchAsync(stoppingToken); }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogWarning(exception, "Notification outbox scan failed");
            }
            await Task.Delay(TimeSpan.FromSeconds(10), clock, stoppingToken);
        }
    }

    internal async Task DispatchAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var sender = scope.ServiceProvider.GetRequiredService<IEmailSender>();
        var writer = scope.ServiceProvider.GetRequiredService<NotificationWriter>();
        var emailOptions = scope.ServiceProvider.GetRequiredService<IOptions<EmailOptions>>();
        var now = clock.GetUtcNow();
        var reminderCutoff = now.AddMinutes(15);
        var upcoming = await db.LiveSessionBookings.AsNoTracking()
            .Where(x => x.Status == Tafseel.Domain.LiveSessions.LiveSessionStatus.Confirmed
                && x.StartsAt > now && x.StartsAt <= reminderCutoff)
            .Select(x => new { x.Id, x.StudentId, x.TeacherId, x.Title }).Take(100).ToArrayAsync(ct);
        foreach (var session in upcoming)
        {
            await writer.QueueAsync(session.StudentId, "SessionReminder", "Live session starts soon",
                session.Title, $"/live-sessions/{session.Id}", $"session:{session.Id}:reminder:student", true, ct);
            await writer.QueueAsync(session.TeacherId, "SessionReminder", "Live session starts soon",
                session.Title, $"/live-sessions/{session.Id}", $"session:{session.Id}:reminder:teacher", true, ct);
        }
        if (upcoming.Length > 0) await db.SaveChangesAsync(ct);
        var items = await db.NotificationOutbox
            .Where(x => (x.Status == OutboxStatus.Pending || x.Status == OutboxStatus.Processing)
                && x.NextAttemptAt <= now)
            .OrderBy(x => x.CreatedAt).Take(20).ToArrayAsync(ct);
        foreach (var item in items)
        {
            try
            {
                item.Start(now);
                await db.SaveChangesAsync(ct);
                var notification = await db.Notifications.AsNoTracking().SingleAsync(
                    x => x.Id == item.NotificationId, ct);
                var email = await db.Users.AsNoTracking().Where(x => x.Id == notification.UserId)
                    .Select(x => x.Email).SingleAsync(ct);
                if (!string.IsNullOrWhiteSpace(email))
                {
                    var ctaUrl = string.IsNullOrWhiteSpace(notification.Link)
                        ? null
                        : $"{emailOptions.Value.AppBaseUrl}{notification.Link}";
                    var html = EmailTemplate.Render(
                        preheader: notification.Body,
                        kicker: "إشعار جديد",
                        heading: notification.Title,
                        paragraphs: [notification.Body],
                        appBaseUrl: emailOptions.Value.AppBaseUrl,
                        accent: EmailAccent.Activity,
                        ctaText: ctaUrl is null ? null : "عرض التفاصيل ←",
                        ctaUrl: ctaUrl);
                    await sender.SendAsync(email, notification.Title, html, ct);
                }
                item.Sent();
                await db.SaveChangesAsync(ct);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogWarning("Notification outbox delivery failed for {OutboxId}", item.Id);
                item.Retry(exception.GetType().Name, clock.GetUtcNow().AddMinutes(Math.Min(30, item.Attempts * 2)));
                try { await db.SaveChangesAsync(CancellationToken.None); }
                catch (DbUpdateConcurrencyException) { db.ChangeTracker.Clear(); }
            }
        }
    }
}
