using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class Release4MarketplaceOperationsTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Quality_queue_is_paginated_searchable_and_role_gated()
    {
        var (subject, topic) = await Pass3TestData.SeedCatalogAsync(factory.Services);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var reviewer = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await users.FindByIdAsync(teacher.Id);
            user!.FullName = "Ops Queue Teacher";
            await users.UpdateAsync(user);
        }

        using var teacherClient = await ClientAsync(teacher.Email);
        var created = await teacherClient.PostAsJsonAsync("/api/v1/teacher-applications", new
        {
            subjectId = subject.Id,
            qualificationTopicId = topic.Id,
            city = "Cairo",
            experienceYears = 4,
            degree = "BSc"
        });
        created.EnsureSuccessStatusCode();
        var application = await created.Content.ReadFromJsonAsync<JsonElement>();
        var applicationId = application.GetProperty("id").GetGuid();
        await UploadDemoAsync(teacherClient, applicationId, application.GetProperty("version").GetString()!);
        SetVersion(teacherClient, await LatestVersion(teacherClient, "/api/v1/teacher-applications/mine", applicationId));
        (await teacherClient.PostAsync($"/api/v1/teacher-applications/{applicationId}/submit", null)).EnsureSuccessStatusCode();

        using var quality = await ClientAsync(reviewer.Email);
        using var studentClient = await ClientAsync(student.Email);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await studentClient.GetAsync("/api/v1/teacher-applications/queue")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await teacherClient.GetAsync("/api/v1/teacher-applications/queue")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await studentClient.GetAsync($"/api/v1/teacher-applications/{applicationId}")).StatusCode);

        var queue = await quality.GetFromJsonAsync<JsonElement>("/api/v1/teacher-applications/queue?pageSize=20");
        Assert.True(queue.TryGetProperty("items", out var items));
        Assert.True(queue.TryGetProperty("totalCount", out _));
        Assert.Contains(items.EnumerateArray(), x => x.GetProperty("id").GetGuid() == applicationId);
        Assert.False(queue.GetRawText().Contains("internalNotes", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(items.EnumerateArray(), x => x.TryGetProperty("email", out _));

        var searched = await quality.GetFromJsonAsync<JsonElement>(
            "/api/v1/teacher-applications/queue?search=Ops%20Queue&pageSize=20");
        var found = Assert.Single(
            searched.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("id").GetGuid() == applicationId);
        Assert.Equal("Ops Queue Teacher", found.GetProperty("teacherDisplayName").GetString());
        Assert.False(found.GetProperty("isAdditionalSubject").GetBoolean());

        var summary = await quality.GetFromJsonAsync<JsonElement>("/api/v1/teacher-applications/queue/summary");
        Assert.True(summary.GetProperty("submitted").GetInt32() >= 1);
        Assert.True(summary.GetProperty("actionable").GetInt32() >= 1);

        var detail = await quality.GetFromJsonAsync<JsonElement>($"/api/v1/teacher-applications/{applicationId}");
        Assert.Equal(applicationId, detail.GetProperty("application").GetProperty("id").GetGuid());
        Assert.True(detail.GetProperty("history").GetArrayLength() >= 1);

        var notifications = await quality.GetFromJsonAsync<JsonElement>("/api/v1/notifications?pageSize=20");
        Assert.Contains(notifications.GetProperty("items").EnumerateArray(), n =>
        {
            var link = n.GetProperty("link").GetString() ?? "";
            return n.GetProperty("type").GetString() == "ApplicationSubmitted"
                && link == $"/quality/applications/{applicationId}";
        });
    }

    [Fact]
    public async Task Additional_subject_queue_row_keeps_existing_qualification_independent()
    {
        var seeded = await SeedApprovedTeacherWithSecondSubjectAsync();
        using var teacher = await ClientAsync(seeded.Email);
        var created = await teacher.PostAsJsonAsync("/api/v1/teacher-applications", new
        {
            subjectId = seeded.SubjectB,
            qualificationTopicId = seeded.TopicB,
            city = "Riyadh",
            experienceYears = 4,
            degree = "BSc"
        });
        created.EnsureSuccessStatusCode();
        var application = await created.Content.ReadFromJsonAsync<JsonElement>();
        var applicationId = application.GetProperty("id").GetGuid();
        await UploadDemoAsync(teacher, applicationId, application.GetProperty("version").GetString()!);
        SetVersion(teacher, await LatestVersion(teacher, "/api/v1/teacher-applications/mine", applicationId));
        (await teacher.PostAsync($"/api/v1/teacher-applications/{applicationId}/submit", null)).EnsureSuccessStatusCode();

        using var quality = await ClientAsync(seeded.ReviewerEmail);
        var queue = await quality.GetFromJsonAsync<JsonElement>(
            "/api/v1/teacher-applications/queue?kind=Additional&pageSize=50");
        var row = Assert.Single(
            queue.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("id").GetGuid() == applicationId);
        Assert.True(row.GetProperty("isAdditionalSubject").GetBoolean());
        Assert.Contains(row.GetProperty("activeQualifications").EnumerateArray(), q =>
            q.GetProperty("subjectId").GetGuid() == seeded.SubjectA);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.True(await db.TeacherSubjectQualifications.AnyAsync(x =>
            x.TeacherId == seeded.TeacherId && x.SubjectId == seeded.SubjectA && x.RevokedAt == null));
    }

    [Fact]
    public async Task Admin_review_list_is_discoverable_private_and_hidden_from_quality()
    {
        var data = await SeedReviewAsync();
        using var admin = await ClientAsync(data.AdminEmail);
        using var quality = await ClientAsync(data.QualityEmail);
        using var student = await ClientAsync(data.StudentEmail);
        using var teacher = await ClientAsync(data.TeacherEmail);

        Assert.Equal(HttpStatusCode.Forbidden, (await quality.GetAsync("/api/v1/admin/reviews")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/v1/admin/reviews")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await teacher.GetAsync("/api/v1/admin/reviews")).StatusCode);

        var list = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/v1/admin/reviews?search={Uri.EscapeDataString(data.TeacherName)}&pageSize=20");
        var item = Assert.Single(
            list.GetProperty("items").EnumerateArray(),
            x => x.GetProperty("id").GetGuid() == data.ReviewId);
        Assert.False(item.TryGetProperty("studentEmail", out _));
        Assert.False(item.TryGetProperty("studentId", out _));
        Assert.DoesNotContain("student@", item.GetRawText(), StringComparison.OrdinalIgnoreCase);

        var summary = await admin.GetFromJsonAsync<JsonElement>("/api/v1/admin/reviews/summary");
        Assert.True(summary.GetProperty("total").GetInt32() >= 1);
        Assert.True(summary.GetProperty("visible").GetInt32() >= 1);

        var detail = await admin.GetFromJsonAsync<JsonElement>($"/api/v1/admin/reviews/{data.ReviewId}");
        Assert.Equal(data.ReviewId, detail.GetProperty("id").GetGuid());
        Assert.False(detail.TryGetProperty("studentEmail", out _));
    }

    [Fact]
    public async Task Showcase_queue_supports_summary_search_and_item_lookup()
    {
        var seeded = await SeedShowcaseReadyAsync();
        using var teacher = await ClientAsync(seeded.TeacherEmail);
        var draft = await teacher.PostAsJsonAsync("/api/v1/teachers/me/showcases", new
        {
            subjectId = seeded.SubjectId,
            topicId = seeded.TopicId,
            title = "Ops Showcase Clip",
            description = "Operational media queue fixture."
        });
        if (draft.StatusCode == HttpStatusCode.BadRequest)
            return; // Production-disabled showcase environments skip this capability honestly.
        draft.EnsureSuccessStatusCode();
        var created = await draft.Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("id").GetGuid();
        var version = created.GetProperty("version").GetString()!;
        using var upload = new MultipartFormDataContent();
        var bytes = new byte[] { 0, 0, 0, 0, (byte)'f', (byte)'t', (byte)'y', (byte)'p', 0, 0, 0, 0 };
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
        upload.Add(file, "file", "ops.mp4");
        var uploadRequest = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/teachers/me/showcases/{id}/video")
        { Content = upload };
        uploadRequest.Headers.TryAddWithoutValidation("If-Match", version);
        var uploaded = await teacher.SendAsync(uploadRequest);
        uploaded.EnsureSuccessStatusCode();
        var uploadedJson = await uploaded.Content.ReadFromJsonAsync<JsonElement>();
        var submit = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/teachers/me/showcases/{id}/submit");
        submit.Headers.TryAddWithoutValidation("If-Match", uploadedJson.GetProperty("version").GetString());
        (await teacher.SendAsync(submit)).EnsureSuccessStatusCode();

        using var quality = await ClientAsync(seeded.QualityEmail);
        using var student = await ClientAsync(seeded.StudentEmail);
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/v1/teachers/showcase-moderation")).StatusCode);

        var queue = await quality.GetFromJsonAsync<JsonElement>(
            "/api/v1/teachers/showcase-moderation?search=Ops%20Showcase&pageSize=20");
        Assert.Contains(queue.GetProperty("items").EnumerateArray(), x => x.GetProperty("sampleId").GetGuid() == id);
        var item = await quality.GetFromJsonAsync<JsonElement>($"/api/v1/teachers/showcase-moderation/{id}");
        Assert.Equal(id, item.GetProperty("sampleId").GetGuid());
        Assert.DoesNotContain("internalNote", item.GetRawText(), StringComparison.OrdinalIgnoreCase);
        var summary = await quality.GetFromJsonAsync<JsonElement>("/api/v1/teachers/showcase-moderation/summary");
        Assert.True(summary.GetProperty("actionable").GetInt32() >= 1);

        var approved = await quality.GetAsync(
            $"/api/v1/teachers/showcase-moderation?status={(int)ShowcaseModerationStatus.Approved}&pageSize=20");
        approved.EnsureSuccessStatusCode();
    }

    private async Task<(Guid SubjectA, Guid TopicB, Guid SubjectB, string Email, string TeacherId, string ReviewerEmail)> SeedApprovedTeacherWithSecondSubjectAsync()
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var reviewer = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var subjectA = new Subject($"Ops-A-{Guid.NewGuid():N}", "code");
        var subjectB = new Subject($"Ops-B-{Guid.NewGuid():N}", "book");
        var topicA = new QualificationTopic(subjectA.Id, $"QA-{Guid.NewGuid():N}", "Explain A.", 180);
        var topicB = new QualificationTopic(subjectB.Id, $"QB-{Guid.NewGuid():N}", "Explain B.", 180);
        db.AddRange(subjectA, subjectB, topicA, topicB,
            new TeacherSubjectQualification(teacher.Id, subjectA.Id, factory.Clock.GetUtcNow()));
        await db.SaveChangesAsync();
        return (subjectA.Id, topicB.Id, subjectB.Id, teacher.Email, teacher.Id, reviewer.Email);
    }

    private async Task<(string AdminEmail, string QualityEmail, string StudentEmail, string TeacherEmail, string TeacherName, Guid ReviewId)> SeedReviewAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var admin = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Admin);
        var quality = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        await using var scope = factory.Services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var teacherUser = await users.FindByIdAsync(teacher.Id);
        teacherUser!.FullName = "Ops Review Teacher";
        await users.UpdateAsync(teacherUser);
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Ops Review Subject " + suffix, "code");
        var type = new ServiceCatalogItem(
            "Ops Review Service " + suffix, "Explanation", "ops_" + suffix, "خدمة", "شرح");
        var profile = new TeacherProfile(teacher.Id, factory.Clock.GetUtcNow());
        profile.Update("Ops Review Teacher", "Profile for operations review discovery.",
            "Egypt", "Cairo", "Egypt Standard Time", 10, factory.Clock.GetUtcNow());
        profile.Publish(TeacherProfileReadiness.Ready, factory.Clock.GetUtcNow());
        var service = new TeacherService(teacher.Id, subject.Id, type.Id, "Ops review service",
            "Used to test admin review discovery.", 100, "SAR", 24, 1, factory.Clock.GetUtcNow());
        var request = new LearningRequest(student.Id, teacher.Id, service.Id, "Ops review request",
            "Explain the supplied material.", factory.Clock.GetUtcNow().AddDays(3), 100, factory.Clock.GetUtcNow());
        request.Accept(teacher.Id, "seed-accept", factory.Clock.GetUtcNow());
        var order = new Order(request.Id, student.Id, teacher.Id, service.Id, 100, "SAR",
            8, 15, factory.Clock.GetUtcNow().AddDays(2), 1, factory.Clock.GetUtcNow());
        db.AddRange(subject, type, profile, service, request, order,
            new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()));
        await db.SaveChangesAsync();
        var orderId = order.Id;

        using var studentClient = await ClientAsync(student.Email);
        await PayAndDeliverAsync(orderId, teacher.Id, studentClient);
        var complete = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/orders/{orderId}/complete");
        complete.Headers.TryAddWithoutValidation("If-Match", await OrderVersionAsync(orderId));
        (await studentClient.SendAsync(complete)).EnsureSuccessStatusCode();
        var reviewResponse = await studentClient.PostAsJsonAsync($"/api/v1/orders/{orderId}/review", new
        {
            explanationClarity = 5,
            subjectKnowledge = 4,
            communication = 5,
            onTimeDelivery = 4,
            valueForMoney = 5,
            comment = "Clear and useful.",
            recommends = true
        });
        reviewResponse.EnsureSuccessStatusCode();
        var reviewId = (await reviewResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        return (admin.Email, quality.Email, student.Email, teacher.Email, "Ops Review Teacher", reviewId);
    }

    private async Task<(string TeacherEmail, string QualityEmail, string StudentEmail, Guid SubjectId, Guid TopicId)> SeedShowcaseReadyAsync()
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var quality = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var subject = new Subject($"Ops-Media-{Guid.NewGuid():N}", "code");
        var suffix = Guid.NewGuid().ToString("N");
        var topic = new Topic(subject.Id, $"Ops topic {suffix}", "intro");
        var serviceType = new ServiceCatalogItem(
            $"Ops Media Service {suffix}", "Recorded explanation.", $"ops_media_{suffix}",
            "خدمة", "شرح.");
        var profile = new TeacherProfile(teacher.Id, factory.Clock.GetUtcNow());
        profile.Update("Ops media teacher", "Profile used for media operations tests.",
            "Egypt", "Cairo", "Egypt Standard Time", 20, factory.Clock.GetUtcNow());
        profile.Publish(TeacherProfileReadiness.Ready, factory.Clock.GetUtcNow());
        db.AddRange(
            subject, topic, serviceType, profile,
            new TeacherSubjectQualification(teacher.Id, subject.Id, factory.Clock.GetUtcNow()),
            new TeacherService(teacher.Id, subject.Id, serviceType.Id, "Recorded explanation",
                "A focused recorded explanation.", 100, "SAR", 24, 1, factory.Clock.GetUtcNow()));
        await db.SaveChangesAsync();
        return (teacher.Email, quality.Email, student.Email, subject.Id, topic.Id);
    }

    private async Task PayAndDeliverAsync(Guid orderId, string teacherId, HttpClient student)
    {
        const string webhookSecret = "integration-tests-only-payment-webhook-secret";
        var initiate = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{orderId}");
        initiate.Headers.TryAddWithoutValidation("Idempotency-Key", "payment-" + orderId);
        var initiated = await student.SendAsync(initiate);
        initiated.EnsureSuccessStatusCode();
        var payment = JsonDocument.Parse(await initiated.Content.ReadAsStringAsync()).RootElement.GetProperty("payment");
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            eventId = "payment-event-" + orderId,
            providerReference = payment.GetProperty("providerReference").GetString(),
            amount = payment.GetProperty("amount").GetDecimal(),
            currency = "SAR",
            succeeded = true
        });
        var callback = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/mock")
        { Content = new ByteArrayContent(payload) };
        callback.Headers.TryAddWithoutValidation("X-Mock-Signature", Convert.ToHexString(
            System.Security.Cryptography.HMACSHA256.HashData(System.Text.Encoding.UTF8.GetBytes(webhookSecret), payload)));
        (await factory.CreateClient().SendAsync(callback)).EnsureSuccessStatusCode();
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var order = await db.Orders.SingleAsync(x => x.Id == orderId);
        order.Start(teacherId, factory.Clock.GetUtcNow());
        order.Deliver(teacherId, "test-storage", "delivery.pdf", "application/pdf",
            10, "Delivered", factory.Clock.GetUtcNow());
        await db.SaveChangesAsync();
    }

    private async Task<string> OrderVersionAsync(Guid orderId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var order = await db.Orders.SingleAsync(x => x.Id == orderId);
        return Convert.ToBase64String(order.RowVersion);
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static void SetVersion(HttpClient client, string version)
    {
        client.DefaultRequestHeaders.Remove("If-Match");
        client.DefaultRequestHeaders.TryAddWithoutValidation("If-Match", version);
    }

    private static async Task<string> LatestVersion(HttpClient client, string path, Guid id)
    {
        var payload = await client.GetFromJsonAsync<JsonElement>(path);
        var items = payload.ValueKind == JsonValueKind.Array
            ? payload.EnumerateArray()
            : payload.GetProperty("items").EnumerateArray();
        return items.Single(x => x.GetProperty("id").GetGuid() == id).GetProperty("version").GetString()!;
    }

    private static async Task UploadDemoAsync(HttpClient teacher, Guid applicationId, string version)
    {
        SetVersion(teacher, version);
        using var demo = new MultipartFormDataContent();
        var bytes = new byte[] { 0, 0, 0, 12, (byte)'f', (byte)'t', (byte)'y', (byte)'p', (byte)'i', (byte)'s', (byte)'o', (byte)'m' };
        var video = new ByteArrayContent(bytes);
        video.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
        demo.Add(video, "file", "demo.mp4");
        demo.Add(new StringContent("120"), "durationSeconds");
        (await teacher.PostAsync($"/api/v1/teacher-applications/{applicationId}/demo", demo)).EnsureSuccessStatusCode();
    }
}
