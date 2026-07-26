using Tafseel.Domain.Common;
using Tafseel.Domain.Messaging;

namespace Tafseel.Domain.Tests;

public sealed class MessagingTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 26, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Participants_send_and_read_but_outsiders_cannot()
    {
        var conversation = new Conversation(
            "student", "teacher", ConversationScope.Order, Guid.NewGuid(), Now);
        var message = conversation.Send("student", "  Hello  ", Now.AddSeconds(1));
        Assert.Equal("Hello", message.Body);
        Assert.Throws<DomainException>(() => conversation.Send("outsider", "No", Now));
        conversation.MarkRead("teacher", Now.AddSeconds(2));
        Assert.NotNull(conversation.Participants.Single(x => x.UserId == "teacher").LastReadAt);
    }

    [Fact]
    public void Message_limits_and_scope_invariants_are_enforced()
    {
        Assert.Throws<DomainException>(() =>
            new Conversation("same", "same", ConversationScope.General, null, Now));
        Assert.Throws<DomainException>(() =>
            new Conversation("a", "b", ConversationScope.Order, null, Now));
        var conversation = new Conversation("a", "b", ConversationScope.General, null, Now);
        Assert.Throws<DomainException>(() => conversation.Send("a", new string('x', 4001), Now));
    }

    [Fact]
    public void Outbox_retries_are_bounded()
    {
        var notification = new Notification("user", "Type", "Title", "Body", null, "key", Now);
        var outbox = new NotificationOutbox(notification.Id, "key", Now);
        for (var attempt = 1; attempt <= 5; attempt++)
        {
            outbox.Start(Now.AddMinutes(attempt * 10));
            outbox.Retry("failure", Now.AddMinutes(attempt * 10 + 1));
        }
        Assert.Equal(OutboxStatus.Failed, outbox.Status);
        Assert.Equal(5, outbox.Attempts);
    }
}
