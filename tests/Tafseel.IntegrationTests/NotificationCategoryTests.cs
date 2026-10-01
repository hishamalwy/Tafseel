using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Application.Messaging;
using Tafseel.Domain.Messaging;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>PRODUCT-P1: preferences silence optional notices only; transactional notices always arrive.</summary>
public sealed class NotificationCategoryTests(TafseelApiFactory factory) : IClassFixture<TafseelApiFactory>
{
    [Fact]
    public async Task Switching_everything_off_silences_messages_and_reminders_but_never_money_or_safety_notices()
    {
        var (userId, _) = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var preference = new UserNotificationPreference(userId);
            preference.Update(inApp: false, email: false);
            db.Add(preference);
            await db.SaveChangesAsync();
        }

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();
            await notifications.NotifyAsync(userId, "NewMessage", "New message", "Hello", null, $"optional:{userId}", email: false, default);
            await notifications.NotifyAsync(userId, "Refund", "Payment refunded", "Your payment was refunded.", null, $"refund:{userId}", email: false, default);
            await notifications.NotifyAsync(userId, "QualificationRevoked", "Subject qualification withdrawn", "Reason.", null, $"revoked:{userId}", email: false, default);
        }

        await using var verify = factory.Services.CreateAsyncScope();
        var store = verify.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.False(await store.Notifications.AnyAsync(x => x.UserId == userId && x.Type == "NewMessage"));
        foreach (var type in new[] { "Refund", "QualificationRevoked" })
        {
            var notice = await store.Notifications.SingleAsync(x => x.UserId == userId && x.Type == type);
            Assert.True(notice.InAppVisible, $"{type} reaches the bell");
        }
        Assert.True(NotificationCategories.IsOptional("SessionReminder"));
        Assert.False(NotificationCategories.IsOptional("Withdrawal"));
    }
}

/// <summary>The e-mail half on SQL Server (the outbox row carries a rowversion SQLite cannot fill).</summary>
[Trait("Category", "SqlServer")]
public sealed class NotificationCategoryEmailTests(SqlServerTafseelApiFactory factory) : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task A_transactional_notice_is_emailed_even_with_email_switched_off_and_a_chat_message_is_not()
    {
        var (userId, _) = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var preference = new UserNotificationPreference(userId);
            preference.Update(inApp: true, email: false);
            db.Add(preference);
            await db.SaveChangesAsync();
        }
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();
            await notifications.NotifyAsync(userId, "NewMessage", "New message", "Hello", null, $"chat:{userId}", email: true, default);
            await notifications.NotifyAsync(userId, "Withdrawal", "Withdrawal completed", "Sent.", null, $"paid:{userId}", email: true, default);
        }
        await using var verify = factory.Services.CreateAsyncScope();
        var store = verify.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var chat = await store.Notifications.SingleAsync(x => x.UserId == userId && x.Type == "NewMessage");
        var paid = await store.Notifications.SingleAsync(x => x.UserId == userId && x.Type == "Withdrawal");
        Assert.False(await store.NotificationOutbox.AnyAsync(x => x.NotificationId == chat.Id));
        Assert.True(await store.NotificationOutbox.AnyAsync(x => x.NotificationId == paid.Id));
    }
}
