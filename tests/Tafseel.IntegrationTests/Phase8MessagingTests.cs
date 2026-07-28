using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Tafseel.Application.Authorization;
using Tafseel.Application.Messaging;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Messaging;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Messaging;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class Phase8MessagingTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Conversation_is_private_persisted_paginated_and_tracks_unread()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var outsider = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await PublishTeacherAsync(teacher.Id);
        var studentClient = await ClientAsync(student.Email);
        var teacherClient = await ClientAsync(teacher.Email);
        var outsiderClient = await ClientAsync(outsider.Email);

        var created = await studentClient.PostAsJsonAsync("/api/v1/conversations", new
        {
            otherUserId = teacher.Id,
            scope = (int)ConversationScope.General,
            resourceId = (Guid?)null
        });
        created.EnsureSuccessStatusCode();
        var conversation = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement;
        var id = conversation.GetProperty("id").GetGuid();
        var duplicate = await studentClient.PostAsJsonAsync("/api/v1/conversations", new
        {
            otherUserId = teacher.Id,
            scope = (int)ConversationScope.General,
            resourceId = (Guid?)null
        });
        Assert.Equal(id, JsonDocument.Parse(await duplicate.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid());

        Assert.Equal(HttpStatusCode.NotFound,
            (await outsiderClient.GetAsync($"/api/v1/conversations/{id}/messages")).StatusCode);
        var sent = await studentClient.PostAsJsonAsync(
            $"/api/v1/conversations/{id}/messages", new { body = "Please explain chapter five." });
        sent.EnsureSuccessStatusCode();
        var message = JsonDocument.Parse(await sent.Content.ReadAsStringAsync()).RootElement;
        var messageId = message.GetProperty("id").GetGuid();

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            Assert.True(await db.Messages.AnyAsync(x => x.Id == messageId));
            Assert.True(await db.Notifications.AnyAsync(x =>
                x.UserId == teacher.Id && x.DeduplicationKey == $"message:{messageId}"));
        }
        var teacherList = JsonDocument.Parse(await teacherClient.GetStringAsync("/api/v1/conversations"))
            .RootElement.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id);
        Assert.Equal(1, teacherList.GetProperty("unreadCount").GetInt32());
        var safeParticipant = teacherList.GetProperty("participants").EnumerateArray()
            .Single(x => x.GetProperty("userId").GetString() == student.Id);
        Assert.NotEqual(student.Id, safeParticipant.GetProperty("displayName").GetString());
        Assert.False(string.IsNullOrWhiteSpace(safeParticipant.GetProperty("displayName").GetString()));
        Assert.Equal(Roles.Student, safeParticipant.GetProperty("role").GetString());
        Assert.False(string.IsNullOrWhiteSpace(safeParticipant.GetProperty("initials").GetString()));
        var read = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/conversations/{id}/read");
        read.Headers.TryAddWithoutValidation("If-Match", teacherList.GetProperty("version").GetString());
        (await teacherClient.SendAsync(read)).EnsureSuccessStatusCode();
        var afterRead = JsonDocument.Parse(await teacherClient.GetStringAsync("/api/v1/conversations"))
            .RootElement.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id);
        Assert.Equal(0, afterRead.GetProperty("unreadCount").GetInt32());

        var upload = await UploadAsync(studentClient, messageId);
        upload.EnsureSuccessStatusCode();
        var attachmentId = JsonDocument.Parse(await upload.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound,
            (await outsiderClient.GetAsync($"/api/v1/message-attachments/{attachmentId}/content")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await teacherClient.GetAsync($"/api/v1/message-attachments/{attachmentId}/content")).StatusCode);

        var page = JsonDocument.Parse(await teacherClient.GetStringAsync(
            $"/api/v1/conversations/{id}/messages?page=1&pageSize=500")).RootElement;
        Assert.Equal(100, page.GetProperty("pageSize").GetInt32());
    }

    [Fact]
    public async Task SignalR_and_notifications_require_auth_and_email_failure_is_isolated()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var client = await ClientAsync(student.Email);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await factory.CreateClient().PostAsync("/hubs/messages/negotiate?negotiateVersion=1", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsync("/hubs/messages/negotiate?negotiateVersion=1", null)).StatusCode);

        factory.EmailSender.FailNext();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();
            await notifications.NotifyAsync(student.Id, "Test", "Test notice", "Safe body",
                null, "outbox-test-" + student.Id, email: true, CancellationToken.None);
        }
        var response = JsonDocument.Parse(await client.GetStringAsync("/api/v1/notifications")).RootElement;
        var notice = response.GetProperty("items").EnumerateArray().Single(x =>
            x.GetProperty("type").GetString() == "Test");
        (await client.PostAsync($"/api/v1/notifications/read?id={notice.GetProperty("id").GetGuid()}", null))
            .EnsureSuccessStatusCode();
        (await client.PutAsJsonAsync("/api/v1/notification-preferences",
            new { inAppEnabled = true, emailEnabled = false })).EnsureSuccessStatusCode();
        var preferences = JsonDocument.Parse(await client.GetStringAsync("/api/v1/notification-preferences")).RootElement;
        Assert.False(preferences.GetProperty("emailEnabled").GetBoolean());
        await using var verify = factory.Services.CreateAsyncScope();
        var worker = factory.Services.GetServices<IHostedService>().OfType<NotificationOutboxWorker>().Single();
        await worker.DispatchAsync(CancellationToken.None);
        var outbox = await verify.ServiceProvider.GetRequiredService<TafseelDbContext>()
            .NotificationOutbox.SingleAsync(x => x.DeduplicationKey == "outbox-test-" + student.Id);
        Assert.Equal(OutboxStatus.Pending, outbox.Status);
        Assert.Equal(1, outbox.Attempts);
    }

    [Fact]
    public async Task Sql_messaging_indexes_constraints_and_rowversions_exist()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var indexes = await db.Database.SqlQueryRaw<string>(
            "SELECT name AS [Value] FROM sys.indexes WHERE object_id IN " +
            "(OBJECT_ID('Conversations'),OBJECT_ID('Messages'),OBJECT_ID('Notifications'),OBJECT_ID('NotificationOutbox')) AND name IS NOT NULL")
            .ToArrayAsync();
        Assert.Contains("IX_Messages_ConversationId_CreatedAt_Id", indexes);
        Assert.Contains("IX_Notifications_UserId_DeduplicationKey", indexes);
        Assert.Contains("IX_NotificationOutbox_Status_NextAttemptAt", indexes);
        var constraints = await db.Database.SqlQueryRaw<string>(
            "SELECT name AS [Value] FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('NotificationOutbox')")
            .ToArrayAsync();
        Assert.Contains("CK_NotificationOutbox_Attempts", constraints);
        Assert.Equal(2, await db.Database.SqlQueryRaw<int>(
            "SELECT COUNT(*) AS [Value] FROM sys.columns WHERE object_id IN " +
            "(OBJECT_ID('Conversations'),OBJECT_ID('NotificationOutbox')) AND name='RowVersion' AND system_type_id=189")
            .SingleAsync());
    }

    private async Task PublishTeacherAsync(string teacherId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var profile = new TeacherProfile(teacherId, factory.Clock.GetUtcNow());
        profile.Update("Messaging teacher", "A published teacher available for student inquiries.",
            "Egypt", "Cairo", "Egypt Standard Time", 10, factory.Clock.GetUtcNow());
        profile.Publish(factory.Clock.GetUtcNow());
        db.Add(profile);
        await db.SaveChangesAsync();
    }
    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }
    private static async Task<HttpResponseMessage> UploadAsync(HttpClient client, Guid messageId)
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.ASCII.GetBytes("%PDF-1.4\nMessage attachment"));
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        content.Add(file, "file", "message.pdf");
        return await client.PostAsync($"/api/v1/messages/{messageId}/attachments", content);
    }
}
