using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class Phase5OrderTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Concurrent_acceptance_is_idempotent_and_financial_snapshot_is_immutable()
    {
        var data = await SeedAsync();
        var student = await ClientForAsync(data.Student.Email);
        var teacher = await ClientForAsync(data.Teacher.Email);
        var request = await CreateAsync(student, data.ServiceId);
        var body = new
        {
            finalPrice = 101m,
            currency = "SAR",
            agreedDeliveryAt = DateTimeOffset.UtcNow.AddDays(2),
            revisionAllowance = 1
        };
        var accepts = await Task.WhenAll(
            SendAsync(teacher, HttpMethod.Post, $"/api/v1/learning-requests/{request.Id}/accept",
                body, request.Version, "same-acceptance"),
            SendAsync(teacher, HttpMethod.Post, $"/api/v1/learning-requests/{request.Id}/accept",
                body, request.Version, "same-acceptance"));
        Assert.All(accepts, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode));

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var orders = await db.Orders.Where(x => x.LearningRequestId == request.Id).ToArrayAsync();
        var order = Assert.Single(orders);
        Assert.Equal(8m, order.StudentFeePercent);
        Assert.Equal(15m, order.TeacherCommissionPercent);
        Assert.Equal(8.08m, order.StudentFeeAmount);
        Assert.Equal(15.15m, order.TeacherCommissionAmount);
        Assert.Equal(109.08m, order.StudentTotal);
        Assert.Equal(85.85m, order.TeacherNet);
        Assert.Equal(1, await db.LearningRequests.CountAsync(x =>
            x.Id == request.Id && x.Status == LearningRequestStatus.Accepted));

        var retryWithDifferentKey = await SendAsync(
            teacher, HttpMethod.Post, $"/api/v1/learning-requests/{request.Id}/accept",
            body, request.Version, "different-key");
        Assert.Equal(HttpStatusCode.Conflict, retryWithDifferentKey.StatusCode);
    }

    [Fact]
    public async Task Ownership_attachments_and_problem_details_are_enforced()
    {
        var data = await SeedAsync();
        var student = await ClientForAsync(data.Student.Email);
        var otherStudent = await ClientForAsync(data.OtherStudent.Email);
        var teacher = await ClientForAsync(data.Teacher.Email);
        var otherTeacher = await ClientForAsync(data.OtherTeacher.Email);
        var request = await CreateAsync(student, data.ServiceId);

        var missingVersion = await student.PostAsJsonAsync(
            $"/api/v1/learning-requests/{request.Id}/cancel", new { });
        Assert.Equal(HttpStatusCode.BadRequest, missingVersion.StatusCode);
        var problem = JsonDocument.Parse(await missingVersion.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("validation_failed", problem.GetProperty("code").GetString());
        Assert.True(problem.TryGetProperty("traceId", out _));

        var crossTeacher = await SendAsync(otherTeacher, HttpMethod.Post,
            $"/api/v1/learning-requests/{request.Id}/request-clarification",
            new { message = "Not mine" }, request.Version);
        Assert.Equal(HttpStatusCode.NotFound, crossTeacher.StatusCode);
        var crossStudent = await SendAsync(otherStudent, HttpMethod.Post,
            $"/api/v1/learning-requests/{request.Id}/cancel", null, request.Version);
        Assert.Equal(HttpStatusCode.NotFound, crossStudent.StatusCode);

        var upload = await UploadAsync(
            student, $"/api/v1/learning-requests/{request.Id}/attachments",
            request.Version, "file", "notes.pdf");
        Assert.Equal(HttpStatusCode.Created, upload.StatusCode);
        var attachmentId = JsonDocument.Parse(await upload.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherStudent.GetAsync($"/api/v1/learning-requests/attachments/{attachmentId}/content")).StatusCode);
        using var teacherDownload =
            await teacher.GetAsync($"/api/v1/learning-requests/attachments/{attachmentId}/content");
        Assert.Equal(HttpStatusCode.OK, teacherDownload.StatusCode);

        var version = await RequestVersionAsync(request.Id);
        (await SendAsync(teacher, HttpMethod.Post,
            $"/api/v1/learning-requests/{request.Id}/request-clarification",
            new { message = "Which examples matter most?" }, version)).EnsureSuccessStatusCode();
        version = await RequestVersionAsync(request.Id);
        (await SendAsync(student, HttpMethod.Post,
            $"/api/v1/learning-requests/{request.Id}/reply-clarification",
            new { message = "Please cover all worked examples." }, version)).EnsureSuccessStatusCode();

        var page = JsonDocument.Parse(await student.GetStringAsync(
            "/api/v1/learning-requests/mine?page=1&pageSize=500")).RootElement;
        Assert.Equal(50, page.GetProperty("pageSize").GetInt32());
    }

    [Fact]
    public async Task Payment_delivery_revision_and_completion_rules_hold_end_to_end()
    {
        var data = await SeedAsync();
        var student = await ClientForAsync(data.Student.Email);
        var otherStudent = await ClientForAsync(data.OtherStudent.Email);
        var teacher = await ClientForAsync(data.Teacher.Email);
        var otherTeacher = await ClientForAsync(data.OtherTeacher.Email);
        var request = await CreateAsync(student, data.ServiceId);
        var accepted = await SendAsync(
            teacher, HttpMethod.Post, $"/api/v1/learning-requests/{request.Id}/accept",
            new
            {
                finalPrice = 100m,
                currency = "SAR",
                agreedDeliveryAt = DateTimeOffset.UtcNow.AddDays(2),
                revisionAllowance = 1
            }, request.Version, "flow-accept");
        accepted.EnsureSuccessStatusCode();
        var acceptedJson = JsonDocument.Parse(await accepted.Content.ReadAsStringAsync()).RootElement;
        var orderId = acceptedJson.GetProperty("id").GetGuid();
        var version = acceptedJson.GetProperty("version").GetString()!;
        var studentOrder = JsonDocument.Parse(await student.GetStringAsync("/api/v1/orders/mine"))
            .RootElement.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == orderId);
        Assert.Equal(JsonValueKind.Null, studentOrder.GetProperty("teacherCommissionPercent").ValueKind);
        Assert.Equal(JsonValueKind.Null, studentOrder.GetProperty("teacherNet").ValueKind);
        var teacherOrder = JsonDocument.Parse(await teacher.GetStringAsync("/api/v1/orders/assigned"))
            .RootElement.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == orderId);
        Assert.Equal(15m, teacherOrder.GetProperty("teacherCommissionPercent").GetDecimal());

        var early = await SendAsync(teacher, HttpMethod.Post, $"/api/v1/orders/{orderId}/start", null, version);
        Assert.Equal(HttpStatusCode.BadRequest, early.StatusCode);
        Assert.Equal("payment_required", await CodeAsync(early));

        await ConfirmPaymentAsync(student, orderId);
        version = await OrderVersionAsync(orderId);
        (await SendAsync(teacher, HttpMethod.Post, $"/api/v1/orders/{orderId}/start", null, version))
            .EnsureSuccessStatusCode();
        version = await OrderVersionAsync(orderId);

        var crossDelivery = await UploadAsync(
            otherTeacher, $"/api/v1/orders/{orderId}/deliveries", version, "file", "delivery.pdf", "message", "Done");
        Assert.Equal(HttpStatusCode.NotFound, crossDelivery.StatusCode);
        var delivery = await UploadAsync(
            teacher, $"/api/v1/orders/{orderId}/deliveries", version, "file", "delivery.pdf", "message", "Done");
        Assert.Equal(HttpStatusCode.Created, delivery.StatusCode);
        var deliveryId = JsonDocument.Parse(await delivery.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();
        Assert.Equal("Done", JsonDocument.Parse(await delivery.Content.ReadAsStringAsync())
            .RootElement.GetProperty("message").GetString());
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherStudent.GetAsync($"/api/v1/orders/deliveries/{deliveryId}/content")).StatusCode);
        using var ownerDownload = await student.GetAsync($"/api/v1/orders/deliveries/{deliveryId}/content");
        Assert.Equal(HttpStatusCode.OK, ownerDownload.StatusCode);

        version = await OrderVersionAsync(orderId);
        (await SendAsync(student, HttpMethod.Post, $"/api/v1/orders/{orderId}/revision",
            new { reason = "Please add one example." }, version)).EnsureSuccessStatusCode();
        version = await OrderVersionAsync(orderId);
        (await UploadAsync(teacher, $"/api/v1/orders/{orderId}/deliveries",
            version, "file", "revised.pdf", "message", "Revised")).EnsureSuccessStatusCode();
        version = await OrderVersionAsync(orderId);
        var limit = await SendAsync(student, HttpMethod.Post, $"/api/v1/orders/{orderId}/revision",
            new { reason = "One more." }, version);
        Assert.Equal(HttpStatusCode.BadRequest, limit.StatusCode);
        Assert.Equal("revision_limit_reached", await CodeAsync(limit));

        (await SendAsync(student, HttpMethod.Post, $"/api/v1/orders/{orderId}/complete", null, version))
            .EnsureSuccessStatusCode();
        version = await OrderVersionAsync(orderId);
        var immutable = await SendAsync(student, HttpMethod.Post, $"/api/v1/orders/{orderId}/revision",
            new { reason = "After complete." }, version);
        Assert.Equal(HttpStatusCode.Conflict, immutable.StatusCode);
    }

    [Fact]
    public async Task Sql_server_order_constraints_rowversions_and_indexes_exist()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var constraints = await db.Database.SqlQueryRaw<string>(
            "SELECT name AS [Value] FROM sys.check_constraints WHERE parent_object_id IN (OBJECT_ID('Orders'), OBJECT_ID('LearningRequests'))")
            .ToArrayAsync();
        Assert.Contains("CK_Orders_Fees", constraints);
        Assert.Contains("CK_Orders_FinancialSnapshot", constraints);
        Assert.Contains("CK_Orders_Revisions", constraints);
        Assert.Contains("CK_LearningRequests_Status", constraints);
        var indexes = await db.Database.SqlQueryRaw<string>(
            "SELECT name AS [Value] FROM sys.indexes WHERE object_id IN (OBJECT_ID('Orders'), OBJECT_ID('LearningRequests')) AND name IS NOT NULL")
            .ToArrayAsync();
        Assert.Contains("IX_Orders_LearningRequestId", indexes);
        Assert.Contains("IX_LearningRequests_TeacherId_Status_CreatedAt", indexes);
        var rowversions = await db.Database.SqlQueryRaw<string>(
            "SELECT c.name AS [Value] FROM sys.columns c WHERE c.object_id IN (OBJECT_ID('Orders'), OBJECT_ID('LearningRequests')) AND c.is_rowguidcol = 0 AND c.system_type_id = 189")
            .ToArrayAsync();
        Assert.Equal(2, rowversions.Count(x => x == "RowVersion"));
    }

    private async Task<SeedData> SeedAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var otherStudent = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var otherTeacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Order Subject " + suffix, "code");
        var type = new ServiceCatalogItem("Order Service " + suffix, "Explanation");
        db.AddRange(subject, type,
            new TeacherSubjectQualification(teacher.Id, subject.Id, DateTimeOffset.UtcNow));
        var profile = new TeacherProfile(teacher.Id, DateTimeOffset.UtcNow);
        profile.Update("Order teacher", "Teacher profile for request integration tests.", "Egypt", "Cairo",
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

    private static async Task<RequestInfo> CreateAsync(HttpClient student, Guid serviceId)
    {
        var response = await student.PostAsJsonAsync("/api/v1/learning-requests", new
        {
            teacherServiceId = serviceId,
            title = "Explain chapter five",
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
        HttpClient client, string url, string version, string field, string fileName,
        string? textField = null, string? text = null)
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.ASCII.GetBytes("%PDF-1.4\nTest document"));
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        content.Add(file, field, fileName);
        if (textField is not null) content.Add(new StringContent(text ?? ""), textField);
        var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
        request.Headers.TryAddWithoutValidation("If-Match", version);
        return await client.SendAsync(request);
    }

    private static async Task ConfirmPaymentAsync(HttpClient student, Guid orderId)
    {
        var initiate = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{orderId}");
        initiate.Headers.TryAddWithoutValidation("Idempotency-Key", "phase5-payment");
        var initiated = await student.SendAsync(initiate);
        initiated.EnsureSuccessStatusCode();
        var payment = JsonDocument.Parse(await initiated.Content.ReadAsStringAsync())
            .RootElement.GetProperty("payment");
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            eventId = "phase5-event-" + orderId,
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

    private async Task<string> RequestVersionAsync(Guid requestId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return Convert.ToBase64String(await db.LearningRequests.AsNoTracking()
            .Where(x => x.Id == requestId).Select(x => x.RowVersion).SingleAsync());
    }

    private static async Task<string> CodeAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString()!;

    private sealed record SeedData(
        (string Id, string Email) Student,
        (string Id, string Email) OtherStudent,
        (string Id, string Email) Teacher,
        (string Id, string Email) OtherTeacher,
        Guid ServiceId);
    private sealed record RequestInfo(Guid Id, string Version);
}
