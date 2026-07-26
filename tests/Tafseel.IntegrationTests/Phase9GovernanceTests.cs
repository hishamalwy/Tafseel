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
using Tafseel.Domain.Finance;
using Tafseel.Domain.Governance;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
[Trait("Category", "Financial")]
public sealed class Phase9GovernanceTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    private const string WebhookSecret = "integration-tests-only-payment-webhook-secret";

    [Fact]
    public async Task Completed_paid_order_review_is_unique_moderated_and_aggregated()
    {
        var data = await SeedAsync();
        var student = await ClientAsync(data.Student.Email);
        var admin = await ClientAsync(data.Admin.Email);
        await PayAndDeliverAsync(data, student);
        var complete = await SendAsync(student, HttpMethod.Post,
            $"/api/v1/orders/{data.OrderId}/complete", null, await OrderVersionAsync(data.OrderId));
        complete.EnsureSuccessStatusCode();

        var response = await student.PostAsJsonAsync($"/api/v1/orders/{data.OrderId}/review", new
        {
            explanationClarity = 5,
            subjectKnowledge = 4,
            communication = 5,
            onTimeDelivery = 4,
            valueForMoney = 5,
            comment = "Clear and useful.",
            recommends = true
        });
        response.EnsureSuccessStatusCode();
        var review = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        var reviewId = review.GetProperty("id").GetGuid();
        Assert.Equal(4.6m, review.GetProperty("overallScore").GetDecimal());
        Assert.Equal(HttpStatusCode.Conflict,
            (await student.PostAsJsonAsync($"/api/v1/orders/{data.OrderId}/review", new
            {
                explanationClarity = 5,
                subjectKnowledge = 5,
                communication = 5,
                onTimeDelivery = 5,
                valueForMoney = 5,
                comment = "Duplicate",
                recommends = true
            })).StatusCode);

        (await admin.PostAsJsonAsync($"/api/v1/admin/reviews/{reviewId}/moderate",
            new { visible = false, reason = "Controlled moderation test." })).EnsureSuccessStatusCode();
        var publicReviews = JsonDocument.Parse(await factory.CreateClient()
            .GetStringAsync($"/api/v1/teachers/{data.Teacher.Id}/reviews")).RootElement;
        Assert.Equal(0, publicReviews.GetProperty("totalCount").GetInt32());
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var stored = await db.TeacherReviews.Include(x => x.Moderation).SingleAsync(x => x.Id == reviewId);
        Assert.Equal("Clear and useful.", stored.OriginalComment);
        Assert.False(stored.IsVisible);
        Assert.Equal(0m, await db.TeacherProfiles.Where(x => x.TeacherId == data.Teacher.Id)
            .Select(x => x.AverageRating).SingleAsync());
        Assert.True(await db.AuditLogEntries.AnyAsync(x =>
            x.Action == "ReviewModerated" && x.EntityId == reviewId.ToString()));
    }

    [Fact]
    public async Task Held_escrow_dispute_blocks_completion_and_resolves_refund_once()
    {
        var data = await SeedAsync();
        var student = await ClientAsync(data.Student.Email);
        var teacher = await ClientAsync(data.Teacher.Email);
        var outsider = await ClientAsync(data.Outsider.Email);
        var admin = await ClientAsync(data.Admin.Email);
        await PayAndDeliverAsync(data, student);
        var opened = await student.PostAsJsonAsync("/api/v1/disputes",
            new { orderId = data.OrderId, reason = "The delivery is incomplete." });
        opened.EnsureSuccessStatusCode();
        var dispute = JsonDocument.Parse(await opened.Content.ReadAsStringAsync()).RootElement;
        var disputeId = dispute.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Conflict,
            (await teacher.PostAsJsonAsync("/api/v1/disputes",
                new { orderId = data.OrderId, reason = "Duplicate dispute." })).StatusCode);

        var blocked = await SendAsync(student, HttpMethod.Post,
            $"/api/v1/orders/{data.OrderId}/complete", null, await OrderVersionAsync(data.OrderId));
        Assert.Equal(HttpStatusCode.BadRequest, blocked.StatusCode);
        Assert.Equal("order_disputed", await CodeAsync(blocked));

        var upload = await UploadEvidenceAsync(
            student, disputeId, dispute.GetProperty("version").GetString()!);
        upload.EnsureSuccessStatusCode();
        var evidenceId = JsonDocument.Parse(await upload.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound,
            (await outsider.GetAsync($"/api/v1/dispute-evidence/{evidenceId}/content")).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await admin.GetAsync($"/api/v1/dispute-evidence/{evidenceId}/content")).StatusCode);

        var version = await DisputeVersionAsync(disputeId);
        (await SendAsync(admin, HttpMethod.Post, $"/api/v1/admin/disputes/{disputeId}/start-review",
            null, version)).EnsureSuccessStatusCode();
        version = await DisputeVersionAsync(disputeId);
        var resolved = await SendAsync(admin, HttpMethod.Post, $"/api/v1/admin/disputes/{disputeId}/resolve",
            new { resolution = (int)DisputeResolution.RefundStudent, rationale = "Evidence supports the Student." },
            version, "dispute-refund");
        resolved.EnsureSuccessStatusCode();
        var replay = await SendAsync(admin, HttpMethod.Post, $"/api/v1/admin/disputes/{disputeId}/resolve",
            new { resolution = (int)DisputeResolution.RefundStudent, rationale = "Evidence supports the Student." },
            version, "dispute-refund");
        replay.EnsureSuccessStatusCode();

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Single(await db.Refunds.Where(x => x.OrderId == data.OrderId).ToArrayAsync());
        Assert.Equal(OrderPaymentStatus.Refunded,
            await db.Orders.Where(x => x.Id == data.OrderId).Select(x => x.PaymentStatus).SingleAsync());
        Assert.Single(await db.Disputes.Where(x =>
            x.Id == disputeId && x.Status == DisputeStatus.Resolved).ToArrayAsync());
        Assert.True(await db.AuditLogEntries.AnyAsync(x =>
            x.Action == "DisputeResolved" && x.EntityId == disputeId.ToString()));
    }

    [Fact]
    public async Task Admin_user_controls_metrics_reports_and_audit_are_authorized()
    {
        var data = await SeedAsync();
        var admin = await ClientAsync(data.Admin.Email);
        var outsider = await ClientAsync(data.Outsider.Email);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await outsider.GetAsync("/api/v1/admin/users")).StatusCode);
        (await admin.PutAsJsonAsync($"/api/v1/admin/users/{data.Outsider.Id}/suspension",
            new { suspended = true })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await outsider.GetAsync("/api/v1/orders/mine")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await admin.PutAsJsonAsync($"/api/v1/admin/users/{data.Admin.Id}/suspension",
                new { suspended = true })).StatusCode);

        var newReviewer = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        (await admin.PutAsJsonAsync($"/api/v1/admin/users/{newReviewer.Id}/roles",
            new { role = Roles.QualityReviewer, assigned = true })).EnsureSuccessStatusCode();
        var metrics = await admin.GetAsync("/api/v1/admin/metrics");
        metrics.EnsureSuccessStatusCode();
        (await admin.GetAsync("/api/v1/admin/reports/popular-subjects")).EnsureSuccessStatusCode();
        var audit = JsonDocument.Parse(await admin.GetStringAsync("/api/v1/admin/audit")).RootElement;
        Assert.Contains(audit.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("action").GetString() == "UserSuspended");
        Assert.Contains(audit.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("action").GetString() == "RoleAssigned");
    }

    [Fact]
    public async Task Governance_sql_constraints_uniqueness_and_rowversion_exist()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var indexes = await db.Database.SqlQueryRaw<string>(
            "SELECT name AS [Value] FROM sys.indexes WHERE object_id IN " +
            "(OBJECT_ID('TeacherReviews'),OBJECT_ID('Disputes'),OBJECT_ID('DisputeDecision'),OBJECT_ID('AuditLogEntries')) AND name IS NOT NULL")
            .ToArrayAsync();
        Assert.Contains("IX_TeacherReviews_OrderId", indexes);
        Assert.Contains("IX_Disputes_OrderId", indexes);
        Assert.Contains("IX_DisputeDecision_DisputeId", indexes);
        var constraints = await db.Database.SqlQueryRaw<string>(
            "SELECT name AS [Value] FROM sys.check_constraints WHERE parent_object_id IN " +
            "(OBJECT_ID('TeacherReviews'),OBJECT_ID('Disputes'),OBJECT_ID('DisputeDecision'))")
            .ToArrayAsync();
        Assert.Contains("CK_TeacherReviews_Overall", constraints);
        Assert.Contains("CK_Disputes_Status", constraints);
        Assert.Equal(1, await db.Database.SqlQueryRaw<int>(
            "SELECT COUNT(*) AS [Value] FROM sys.columns WHERE object_id=OBJECT_ID('Disputes') " +
            "AND name='RowVersion' AND system_type_id=189").SingleAsync());
    }

    private async Task<SeedData> SeedAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var outsider = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var admin = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Admin);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Governance Subject " + suffix, "code");
        var type = new ServiceCatalogItem("Governance Service " + suffix, "Explanation");
        var profile = new TeacherProfile(teacher.Id, factory.Clock.GetUtcNow());
        profile.Update("Governance teacher", "Teacher profile used by governance tests.",
            "Egypt", "Cairo", "Egypt Standard Time", 10, factory.Clock.GetUtcNow());
        profile.Publish(factory.Clock.GetUtcNow());
        var service = new TeacherService(teacher.Id, subject.Id, type.Id, "Governance order",
            "Order used to test reviews and disputes.", 100, "SAR", 24, 1, factory.Clock.GetUtcNow());
        var request = new LearningRequest(student.Id, teacher.Id, service.Id, "Governance request",
            "Explain the supplied material.", factory.Clock.GetUtcNow().AddDays(3), 100, factory.Clock.GetUtcNow());
        request.Accept(teacher.Id, "seed-accept", factory.Clock.GetUtcNow());
        var order = new Order(request.Id, student.Id, teacher.Id, service.Id, 100, "SAR",
            8, 15, factory.Clock.GetUtcNow().AddDays(2), 1, factory.Clock.GetUtcNow());
        db.AddRange(subject, type, profile, service, request, order,
            new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()));
        await db.SaveChangesAsync();
        return new(student, teacher, outsider, admin, order.Id);
    }

    private async Task PayAndDeliverAsync(SeedData data, HttpClient student)
    {
        var initiate = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{data.OrderId}");
        initiate.Headers.TryAddWithoutValidation("Idempotency-Key", "payment-" + data.OrderId);
        var initiated = await student.SendAsync(initiate);
        initiated.EnsureSuccessStatusCode();
        var payment = JsonDocument.Parse(await initiated.Content.ReadAsStringAsync())
            .RootElement.GetProperty("payment");
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            eventId = "payment-event-" + data.OrderId,
            providerReference = payment.GetProperty("providerReference").GetString(),
            amount = payment.GetProperty("amount").GetDecimal(),
            currency = "SAR",
            succeeded = true
        });
        var callback = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/mock")
        {
            Content = new ByteArrayContent(payload)
        };
        callback.Headers.TryAddWithoutValidation("X-Mock-Signature", Convert.ToHexString(
            HMACSHA256.HashData(Encoding.UTF8.GetBytes(WebhookSecret), payload)));
        (await factory.CreateClient().SendAsync(callback)).EnsureSuccessStatusCode();
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var order = await db.Orders.SingleAsync(x => x.Id == data.OrderId);
        order.Start(data.Teacher.Id, factory.Clock.GetUtcNow());
        order.Deliver(data.Teacher.Id, "test-storage", "delivery.pdf", "application/pdf",
            10, "Delivered", factory.Clock.GetUtcNow());
        await db.SaveChangesAsync();
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
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
    private static async Task<HttpResponseMessage> UploadEvidenceAsync(
        HttpClient client, Guid disputeId, string version)
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(Encoding.ASCII.GetBytes("%PDF-1.4\nEvidence"));
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        content.Add(file, "file", "evidence.pdf");
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/disputes/{disputeId}/evidence")
        { Content = content };
        request.Headers.TryAddWithoutValidation("If-Match", version);
        return await client.SendAsync(request);
    }
    private async Task<string> OrderVersionAsync(Guid id)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return Convert.ToBase64String(await scope.ServiceProvider.GetRequiredService<TafseelDbContext>()
            .Orders.AsNoTracking().Where(x => x.Id == id).Select(x => x.RowVersion).SingleAsync());
    }
    private async Task<string> DisputeVersionAsync(Guid id)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return Convert.ToBase64String(await scope.ServiceProvider.GetRequiredService<TafseelDbContext>()
            .Disputes.AsNoTracking().Where(x => x.Id == id).Select(x => x.RowVersion).SingleAsync());
    }
    private static async Task<string> CodeAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString()!;
    private sealed record SeedData(
        (string Id, string Email) Student,
        (string Id, string Email) Teacher,
        (string Id, string Email) Outsider,
        (string Id, string Email) Admin,
        Guid OrderId);
}
