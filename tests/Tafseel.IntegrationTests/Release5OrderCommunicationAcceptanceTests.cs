using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Messaging;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class Release5OrderCommunicationAcceptanceTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Owned_order_and_request_lookup_is_targeted_and_closed_orders_stay_writable()
    {
        var data = await SeedAsync();
        var student = await ClientForAsync(data.Student.Email);
        var teacher = await ClientForAsync(data.Teacher.Email);
        var otherStudent = await ClientForAsync(data.OtherStudent.Email);
        var otherTeacher = await ClientForAsync(data.OtherTeacher.Email);
        var request = await CreateRequestAsync(student, data.ServiceId);
        var accepted = await SendAsync(
            teacher, HttpMethod.Post, $"/api/v1/learning-requests/{request.Id}/accept",
            new
            {
                finalPrice = 100m,
                currency = "SAR",
                agreedDeliveryAt = DateTimeOffset.UtcNow.AddDays(2),
                revisionAllowance = 1
            }, request.Version, "r5-accept");
        accepted.EnsureSuccessStatusCode();
        var acceptedJson = JsonDocument.Parse(await accepted.Content.ReadAsStringAsync()).RootElement;
        var orderId = acceptedJson.GetProperty("id").GetGuid();

        factory.Commands.Reset();
        var owned = await student.GetAsync($"/api/v1/orders/{orderId}");
        owned.EnsureSuccessStatusCode();
        var ownedOrder = JsonDocument.Parse(await owned.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(orderId, ownedOrder.GetProperty("id").GetGuid());
        Assert.Equal(request.Id, ownedOrder.GetProperty("learningRequestId").GetGuid());
        Assert.True(factory.Commands.ReadCount < 20, $"targeted order GET used {factory.Commands.ReadCount} reads");

        var teacherOwned = await teacher.GetAsync($"/api/v1/orders/{orderId}");
        teacherOwned.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await otherStudent.GetAsync($"/api/v1/orders/{orderId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await otherTeacher.GetAsync($"/api/v1/orders/{orderId}")).StatusCode);

        var ownedRequest = await student.GetAsync($"/api/v1/learning-requests/{request.Id}");
        ownedRequest.EnsureSuccessStatusCode();
        Assert.Equal(request.Id,
            JsonDocument.Parse(await ownedRequest.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherStudent.GetAsync($"/api/v1/learning-requests/{request.Id}")).StatusCode);

        var studentOpen = await student.PostAsJsonAsync("/api/v1/conversations", new
        {
            otherUserId = data.Teacher.Id,
            scope = (int)ConversationScope.Order,
            resourceId = orderId
        });
        studentOpen.EnsureSuccessStatusCode();
        var conversationId = JsonDocument.Parse(await studentOpen.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();
        var teacherOpen = await teacher.PostAsJsonAsync("/api/v1/conversations", new
        {
            otherUserId = data.Student.Id,
            scope = (int)ConversationScope.Order,
            resourceId = orderId
        });
        Assert.Equal(conversationId, JsonDocument.Parse(await teacherOpen.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid());
        var studentAgain = await student.PostAsJsonAsync("/api/v1/conversations", new
        {
            otherUserId = data.Teacher.Id,
            scope = (int)ConversationScope.Order,
            resourceId = orderId
        });
        Assert.Equal(conversationId, JsonDocument.Parse(await studentAgain.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid());

        Assert.Equal(HttpStatusCode.NotFound, (await otherStudent.PostAsJsonAsync("/api/v1/conversations", new
        {
            otherUserId = data.Teacher.Id,
            scope = (int)ConversationScope.Order,
            resourceId = orderId
        })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherTeacher.GetAsync($"/api/v1/conversations/{conversationId}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherStudent.GetAsync($"/api/v1/conversations/{conversationId}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherStudent.PostAsJsonAsync($"/api/v1/conversations/{conversationId}/messages",
                new { body = "outsider" })).StatusCode);

        var first = await student.PostAsJsonAsync(
            $"/api/v1/conversations/{conversationId}/messages", new { body = "R5 unread one" });
        first.EnsureSuccessStatusCode();
        var second = await student.PostAsJsonAsync(
            $"/api/v1/conversations/{conversationId}/messages", new { body = "R5 unread two" });
        second.EnsureSuccessStatusCode();
        var secondId = JsonDocument.Parse(await second.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        var teacherList = JsonDocument.Parse(await teacher.GetStringAsync("/api/v1/conversations"))
            .RootElement.GetProperty("items").EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == conversationId);
        Assert.Equal(2, teacherList.GetProperty("unreadCount").GetInt32());
        var studentList = JsonDocument.Parse(await student.GetStringAsync("/api/v1/conversations"))
            .RootElement.GetProperty("items").EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == conversationId);
        Assert.Equal(0, studentList.GetProperty("unreadCount").GetInt32());

        var read = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/conversations/{conversationId}/read");
        read.Headers.TryAddWithoutValidation("If-Match", teacherList.GetProperty("version").GetString());
        (await teacher.SendAsync(read)).EnsureSuccessStatusCode();
        var afterRead = JsonDocument.Parse(await teacher.GetStringAsync("/api/v1/conversations"))
            .RootElement.GetProperty("items").EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == conversationId);
        Assert.Equal(0, afterRead.GetProperty("unreadCount").GetInt32());

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var notice = await db.Notifications.SingleAsync(x =>
                x.UserId == data.Teacher.Id && x.DeduplicationKey == $"message:{secondId}");
            Assert.Equal($"/conversations/{conversationId}", notice.Link);
            Assert.DoesNotContain("R5 unread two", notice.Body, StringComparison.Ordinal);
        }

        var upload = await UploadAsync(
            student, $"/api/v1/messages/{secondId}/attachments", null, "file", "notes.pdf");
        Assert.True(upload.IsSuccessStatusCode, $"attachment upload returned {(int)upload.StatusCode}");
        var attachmentId = JsonDocument.Parse(await upload.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK,
            (await teacher.GetAsync($"/api/v1/message-attachments/{attachmentId}/content")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherStudent.GetAsync($"/api/v1/message-attachments/{attachmentId}/content")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherTeacher.GetAsync($"/api/v1/message-attachments/{attachmentId}/content")).StatusCode);

        var teacherToken = await Pass3TestData.LoginAsync(factory.CreateClient(), data.Teacher.Email);
        var outsiderToken = await Pass3TestData.LoginAsync(factory.CreateClient(), data.OtherTeacher.Email);
        await using (var outsiderHub = CreateHub(outsiderToken))
        {
            await outsiderHub.StartAsync();
            var denied = await Assert.ThrowsAsync<HubException>(() =>
                outsiderHub.InvokeAsync("JoinConversation", conversationId));
            Assert.Contains("not found", denied.Message, StringComparison.OrdinalIgnoreCase);
        }

        await ConfirmPaymentAsync(student, orderId, "r5-pay");
        var version = await OrderVersionAsync(orderId);
        (await SendAsync(teacher, HttpMethod.Post, $"/api/v1/orders/{orderId}/start", null, version))
            .EnsureSuccessStatusCode();
        version = await OrderVersionAsync(orderId);
        (await UploadAsync(teacher, $"/api/v1/orders/{orderId}/deliveries", version, "file", "delivery.pdf",
            "message", "Done")).EnsureSuccessStatusCode();
        version = await OrderVersionAsync(orderId);
        (await SendAsync(student, HttpMethod.Post, $"/api/v1/orders/{orderId}/complete", null, version))
            .EnsureSuccessStatusCode();

        var completed = JsonDocument.Parse(await student.GetStringAsync($"/api/v1/orders/{orderId}")).RootElement;
        Assert.Equal((int)OrderStatus.Completed, completed.GetProperty("status").GetInt32());
        var afterComplete = await student.PostAsJsonAsync(
            $"/api/v1/conversations/{conversationId}/messages", new { body = "Completed order still writable" });
        afterComplete.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK,
            (await teacher.GetAsync($"/api/v1/conversations/{conversationId}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await student.GetAsync($"/api/v1/message-attachments/{attachmentId}/content")).StatusCode);
    }

    [Fact]
    public async Task Message_attachments_reject_unsupported_type_size_and_signature_mismatch()
    {
        var data = await SeedAsync();
        var student = await ClientForAsync(data.Student.Email);
        var teacher = await ClientForAsync(data.Teacher.Email);
        var request = await CreateRequestAsync(student, data.ServiceId);
        var accepted = await SendAsync(
            teacher, HttpMethod.Post, $"/api/v1/learning-requests/{request.Id}/accept",
            new
            {
                finalPrice = 100m,
                currency = "SAR",
                agreedDeliveryAt = DateTimeOffset.UtcNow.AddDays(2),
                revisionAllowance = 1
            }, request.Version, "r5-attach-accept");
        accepted.EnsureSuccessStatusCode();
        var orderId = JsonDocument.Parse(await accepted.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        var opened = await student.PostAsJsonAsync("/api/v1/conversations", new
        {
            otherUserId = data.Teacher.Id,
            scope = (int)ConversationScope.Order,
            resourceId = orderId
        });
        opened.EnsureSuccessStatusCode();
        var conversationId = JsonDocument.Parse(await opened.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();
        var sent = await student.PostAsJsonAsync(
            $"/api/v1/conversations/{conversationId}/messages", new { body = "Attachment validation" });
        sent.EnsureSuccessStatusCode();
        var messageId = JsonDocument.Parse(await sent.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();

        async Task<string> UploadRawAsync(byte[] bytes, string name, string type)
        {
            var content = new MultipartFormDataContent();
            var file = new ByteArrayContent(bytes);
            file.Headers.ContentType = new MediaTypeHeaderValue(type);
            content.Add(file, "file", name);
            var response = await student.PostAsync($"/api/v1/messages/{messageId}/attachments", content);
            return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString()!;
        }

        Assert.Equal("invalid_file_type", await UploadRawAsync("not-allowed"u8.ToArray(), "payload.exe", "application/octet-stream"));
        Assert.Equal("invalid_file_signature", await UploadRawAsync("not-a-pdf"u8.ToArray(), "notes.pdf", "application/pdf"));
        Assert.Equal("invalid_file_size", await UploadRawAsync(Array.Empty<byte>(), "empty.pdf", "application/pdf"));
    }

    [Fact]
    public async Task Cancelled_unpaid_order_conversation_remains_readable_and_writable()
    {
        var data = await SeedAsync();
        var student = await ClientForAsync(data.Student.Email);
        var teacher = await ClientForAsync(data.Teacher.Email);
        var request = await CreateRequestAsync(student, data.ServiceId);
        var accepted = await SendAsync(
            teacher, HttpMethod.Post, $"/api/v1/learning-requests/{request.Id}/accept",
            new
            {
                finalPrice = 100m,
                currency = "SAR",
                agreedDeliveryAt = DateTimeOffset.UtcNow.AddDays(2),
                revisionAllowance = 1
            }, request.Version, "r5-cancel-accept");
        accepted.EnsureSuccessStatusCode();
        var acceptedJson = JsonDocument.Parse(await accepted.Content.ReadAsStringAsync()).RootElement;
        var orderId = acceptedJson.GetProperty("id").GetGuid();
        var version = acceptedJson.GetProperty("version").GetString()!;
        var opened = await student.PostAsJsonAsync("/api/v1/conversations", new
        {
            otherUserId = data.Teacher.Id,
            scope = (int)ConversationScope.Order,
            resourceId = orderId
        });
        opened.EnsureSuccessStatusCode();
        var conversationId = JsonDocument.Parse(await opened.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();
        (await SendAsync(student, HttpMethod.Post, $"/api/v1/orders/{orderId}/cancel", null, version))
            .EnsureSuccessStatusCode();
        var cancelled = JsonDocument.Parse(await student.GetStringAsync($"/api/v1/orders/{orderId}")).RootElement;
        Assert.Equal((int)OrderStatus.Cancelled, cancelled.GetProperty("status").GetInt32());
        var sent = await student.PostAsJsonAsync(
            $"/api/v1/conversations/{conversationId}/messages", new { body = "Cancelled order still writable" });
        sent.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK,
            (await teacher.GetAsync($"/api/v1/conversations/{conversationId}/messages")).StatusCode);
    }

    private HubConnection CreateHub(string token) =>
        new HubConnectionBuilder()
            .WithUrl(new Uri(factory.Server.BaseAddress, "/hubs/messages"), options =>
            {
                options.AccessTokenProvider = () => Task.FromResult<string?>(token);
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
            })
            .Build();

    private async Task<SeedData> SeedAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var otherStudent = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var otherTeacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("R5 Subject " + suffix, "code");
        var type = new ServiceCatalogItem(
            "R5 Service " + suffix, "Explanation", "svc_" + suffix, "خدمة", "شرح");
        db.AddRange(subject, type,
            new TeacherSubjectQualification(teacher.Id, subject.Id, DateTimeOffset.UtcNow));
        var profile = new TeacherProfile(teacher.Id, DateTimeOffset.UtcNow);
        profile.Update("R5 teacher", "Teacher profile for Release 5 acceptance.", "Egypt", "Cairo",
            "Egypt Standard Time", 15, DateTimeOffset.UtcNow);
        profile.Publish(DateTimeOffset.UtcNow);
        var service = new TeacherService(
            teacher.Id, subject.Id, type.Id, "Custom explanation",
            "A custom explanation for the supplied files.", 100, "SAR", 24, 1, DateTimeOffset.UtcNow);
        db.AddRange(profile, service);
        await db.SaveChangesAsync();
        return new(student, otherStudent, teacher, otherTeacher, service.Id);
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static async Task<RequestInfo> CreateRequestAsync(HttpClient student, Guid serviceId)
    {
        var response = await student.PostAsJsonAsync("/api/v1/learning-requests", new
        {
            teacherServiceId = serviceId,
            title = "R5 order communication",
            description = "Please explain every example in the supplied chapter.",
            preferredDeliveryAt = DateTimeOffset.UtcNow.AddDays(3),
            budget = 120m
        });
        response.EnsureSuccessStatusCode();
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        return new(json.GetProperty("id").GetGuid(), json.GetProperty("version").GetString()!);
    }

    private static async Task<HttpResponseMessage> SendAsync(
        HttpClient client, HttpMethod method, string url, object? body, string version, string? key = null)
    {
        var request = new HttpRequestMessage(method, url);
        if (body is not null) request.Content = JsonContent.Create(body);
        request.Headers.TryAddWithoutValidation("If-Match", version);
        if (key is not null) request.Headers.TryAddWithoutValidation("Idempotency-Key", key);
        return await client.SendAsync(request);
    }

    private static async Task<HttpResponseMessage> UploadAsync(
        HttpClient client, string url, string? version, string field, string fileName,
        string? textField = null, string? text = null)
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.ASCII.GetBytes("%PDF-1.4\nTest document"));
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        content.Add(file, field, fileName);
        if (textField is not null) content.Add(new StringContent(text ?? ""), textField);
        var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
        if (!string.IsNullOrWhiteSpace(version))
            request.Headers.TryAddWithoutValidation("If-Match", version);
        return await client.SendAsync(request);
    }

    private static async Task ConfirmPaymentAsync(HttpClient student, Guid orderId, string prefix)
    {
        var initiate = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{orderId}");
        initiate.Headers.TryAddWithoutValidation("Idempotency-Key", prefix);
        var initiated = await student.SendAsync(initiate);
        initiated.EnsureSuccessStatusCode();
        var payment = JsonDocument.Parse(await initiated.Content.ReadAsStringAsync())
            .RootElement.GetProperty("payment");
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            eventId = prefix + "-" + orderId,
            providerReference = payment.GetProperty("providerReference").GetString(),
            amount = payment.GetProperty("amount").GetDecimal(),
            currency = payment.GetProperty("currency").GetString(),
            succeeded = true
        });
        var signature = Convert.ToHexString(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes("integration-tests-only-payment-webhook-secret"), payload));
        var callback = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/mock")
        {
            Content = new ByteArrayContent(payload)
        };
        callback.Headers.TryAddWithoutValidation("X-Mock-Signature", signature);
        (await student.SendAsync(callback)).EnsureSuccessStatusCode();
    }

    private async Task<string> OrderVersionAsync(Guid orderId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return Convert.ToBase64String(await db.Orders.AsNoTracking()
            .Where(x => x.Id == orderId).Select(x => x.RowVersion).SingleAsync());
    }

    private sealed record SeedData(
        (string Id, string Email) Student,
        (string Id, string Email) OtherStudent,
        (string Id, string Email) Teacher,
        (string Id, string Email) OtherTeacher,
        Guid ServiceId);

    private sealed record RequestInfo(Guid Id, string Version);
}
