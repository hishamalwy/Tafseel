using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Common;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Files;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

public sealed class OrderDeliveryStorageTests
{
    [Fact]
    public async Task Order_delivery_sniffs_octet_stream_media_and_keeps_documents()
    {
        var root = Path.Combine(Path.GetTempPath(), $"tafseel-delivery-storage-{Guid.NewGuid():N}");
        var storage = new LocalFileStorageService(Options.Create(new FileStorageOptions
        {
            RootPath = root,
            MaxAttachmentBytes = 64
        }));
        try
        {
            var mp4 = await storage.StorePrivateFileAsync(
                new MemoryStream(ValidMp4()), "lesson.mp4", "application/octet-stream", 12,
                "order-deliveries", default);
            Assert.Equal("video/mp4", mp4.ContentType);

            var png = await storage.StorePrivateFileAsync(
                new MemoryStream(ValidPng()), "slide.png", "", 12, "order-deliveries", default);
            Assert.Equal("image/png", png.ContentType);

            var wav = await storage.StorePrivateFileAsync(
                new MemoryStream(ValidWav()), "clip.wav", "audio/x-wav", 12, "order-deliveries", default);
            Assert.Equal("audio/wav", wav.ContentType);

            var pdfBytes = "%PDF-1.4\nOk"u8.ToArray();
            var pdf = await storage.StorePrivateFileAsync(
                new MemoryStream(pdfBytes), "notes.pdf", "application/pdf", pdfBytes.Length,
                "order-deliveries", default);
            Assert.Equal("application/pdf", pdf.ContentType);

            var fakeType = await Assert.ThrowsAsync<DomainException>(() => storage.StorePrivateFileAsync(
                new MemoryStream(ValidMp4()), "lesson.mp4", "image/jpeg", 12, "order-deliveries", default));
            Assert.Equal("invalid_file_type", fakeType.Code);

            var exe = await Assert.ThrowsAsync<DomainException>(() => storage.StorePrivateFileAsync(
                new MemoryStream("MZ"u8.ToArray().Concat(new byte[10]).ToArray()), "payload.exe",
                "application/octet-stream", 12, "order-deliveries", default));
            Assert.Equal("invalid_file_type", exe.Code);

            var html = await Assert.ThrowsAsync<DomainException>(() => storage.StorePrivateFileAsync(
                new MemoryStream("<html></html>"u8.ToArray()), "page.html", "text/html", 13,
                "order-deliveries", default));
            Assert.Equal("invalid_file_type", html.Code);
        }
        finally
        {
            if (Directory.Exists(root))
                Directory.Delete(root, recursive: true);
        }
    }

    private static byte[] ValidMp4() => [0, 0, 0, 0, (byte)'f', (byte)'t', (byte)'y', (byte)'p', 0, 0, 0, 0];
    private static byte[] ValidPng() => [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0];
    private static byte[] ValidWav() =>
        [(byte)'R', (byte)'I', (byte)'F', (byte)'F', 0, 0, 0, 0, (byte)'W', (byte)'A', (byte)'V', (byte)'E'];
}

[Trait("Category", "SqlServer")]
public sealed class OrderDeliveryApiTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Teacher_can_deliver_mixed_files_including_octet_stream_mp4()
    {
        var data = await SeedAsync();
        var student = await ClientForAsync(data.Student.Email);
        var teacher = await ClientForAsync(data.Teacher.Email);
        var request = await CreateAsync(student, data.ServiceId);
        var accepted = await SendAsync(
            teacher, HttpMethod.Post, $"/api/v1/learning-requests/{request.Id}/accept",
            new
            {
                finalPrice = 100m,
                currency = "SAR",
                agreedDeliveryAt = DateTimeOffset.UtcNow.AddDays(2),
                revisionAllowance = 1
            }, request.Version, "delivery-accept");
        accepted.EnsureSuccessStatusCode();
        var orderId = JsonDocument.Parse(await accepted.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        await ConfirmPaymentAsync(student, orderId);
        var version = await OrderVersionAsync(orderId);
        (await SendAsync(teacher, HttpMethod.Post, $"/api/v1/orders/{orderId}/start", null, version))
            .EnsureSuccessStatusCode();
        version = await OrderVersionAsync(orderId);

        var mixed = new MultipartFormDataContent();
        mixed.Add(FilePart(ValidMp4(), "application/octet-stream"), "files", "lesson.mp4");
        mixed.Add(FilePart(ValidPng(), "image/png"), "files", "slide.png");
        mixed.Add(FilePart("%PDF-1.4\nOk"u8.ToArray(), "application/pdf"), "file", "notes.pdf");
        mixed.Add(new StringContent("Package ready"), "message");
        var upload = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/orders/{orderId}/deliveries")
        {
            Content = mixed
        };
        upload.Headers.TryAddWithoutValidation("If-Match", version);
        var delivered = await teacher.SendAsync(upload);
        Assert.Equal(HttpStatusCode.Created, delivered.StatusCode);

        var order = JsonDocument.Parse(await student.GetStringAsync($"/api/v1/orders/{orderId}")).RootElement;
        Assert.Equal(2, order.GetProperty("status").GetInt32());
        var deliveries = order.GetProperty("deliveries").EnumerateArray().ToArray();
        Assert.Equal(3, deliveries.Length);
        Assert.All(deliveries, item => Assert.Equal("Package ready", item.GetProperty("message").GetString()));

        var byName = deliveries.ToDictionary(
            x => x.GetProperty("originalName").GetString()!,
            x => x,
            StringComparer.OrdinalIgnoreCase);
        using var mp4 = await student.GetAsync(
            $"/api/v1/orders/deliveries/{byName["lesson.mp4"].GetProperty("id").GetGuid()}/content");
        Assert.Equal(HttpStatusCode.OK, mp4.StatusCode);
        Assert.Equal("video/mp4", mp4.Content.Headers.ContentType?.MediaType);
        Assert.True(mp4.Headers.CacheControl?.NoStore);
        Assert.Equal("inline", mp4.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Equal("same-origin", Assert.Single(mp4.Headers.GetValues("Cross-Origin-Resource-Policy")));
        Assert.Equal("nosniff", Assert.Single(mp4.Headers.GetValues("X-Content-Type-Options")));
        using var png = await student.GetAsync(
            $"/api/v1/orders/deliveries/{byName["slide.png"].GetProperty("id").GetGuid()}/content");
        Assert.Equal("image/png", png.Content.Headers.ContentType?.MediaType);
        using var pdf = await student.GetAsync(
            $"/api/v1/orders/deliveries/{byName["notes.pdf"].GetProperty("id").GetGuid()}/content");
        Assert.Equal("application/pdf", pdf.Content.Headers.ContentType?.MediaType);
        Assert.Equal("inline", pdf.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Null(pdf.Content.Headers.ContentDisposition?.FileName);
    }

    [Fact]
    public async Task Delivery_rejects_executables_and_more_than_six_files()
    {
        var data = await SeedAsync();
        var student = await ClientForAsync(data.Student.Email);
        var teacher = await ClientForAsync(data.Teacher.Email);
        var request = await CreateAsync(student, data.ServiceId);
        var accepted = await SendAsync(
            teacher, HttpMethod.Post, $"/api/v1/learning-requests/{request.Id}/accept",
            new
            {
                finalPrice = 100m,
                currency = "SAR",
                agreedDeliveryAt = DateTimeOffset.UtcNow.AddDays(2),
                revisionAllowance = 0
            }, request.Version, "delivery-reject");
        accepted.EnsureSuccessStatusCode();
        var orderId = JsonDocument.Parse(await accepted.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
        await ConfirmPaymentAsync(student, orderId);
        var version = await OrderVersionAsync(orderId);
        (await SendAsync(teacher, HttpMethod.Post, $"/api/v1/orders/{orderId}/start", null, version))
            .EnsureSuccessStatusCode();
        version = await OrderVersionAsync(orderId);

        var exe = new MultipartFormDataContent();
        exe.Add(FilePart("MZ"u8.ToArray().Concat(new byte[10]).ToArray(), "application/octet-stream"),
            "file", "payload.exe");
        var exeRequest = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/orders/{orderId}/deliveries")
        {
            Content = exe
        };
        exeRequest.Headers.TryAddWithoutValidation("If-Match", version);
        var exeResponse = await teacher.SendAsync(exeRequest);
        Assert.Equal(HttpStatusCode.BadRequest, exeResponse.StatusCode);
        Assert.Equal("invalid_file_type", await CodeAsync(exeResponse));

        var tooMany = new MultipartFormDataContent();
        for (var i = 0; i < 7; i++)
            tooMany.Add(FilePart("%PDF-1.4\nOk"u8.ToArray(), "application/pdf"), "files", $"notes-{i}.pdf");
        var limitRequest = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/orders/{orderId}/deliveries")
        {
            Content = tooMany
        };
        limitRequest.Headers.TryAddWithoutValidation("If-Match", version);
        var limitResponse = await teacher.SendAsync(limitRequest);
        Assert.Equal(HttpStatusCode.BadRequest, limitResponse.StatusCode);
        Assert.Equal("delivery_file_limit", await CodeAsync(limitResponse));
    }

    private async Task<SeedData> SeedAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Delivery Subject " + suffix, "code");
        var type = new ServiceCatalogItem(
            "Delivery Service " + suffix, "Explanation", "dlv_" + suffix, "خدمة طلب", "شرح");
        db.AddRange(subject, type,
            new TeacherSubjectQualification(teacher.Id, subject.Id, DateTimeOffset.UtcNow));
        var profile = new TeacherProfile(teacher.Id, DateTimeOffset.UtcNow);
        profile.Update("Delivery teacher", "Teacher profile for delivery upload tests.", "Egypt", "Cairo",
            "Egypt Standard Time", 15, DateTimeOffset.UtcNow);
        profile.Publish(TeacherProfileReadiness.Ready, DateTimeOffset.UtcNow);
        var service = new TeacherService(
            teacher.Id, subject.Id, type.Id, "Custom explanation",
            "A custom explanation for the supplied files.", 100, "SAR", 24, 1, DateTimeOffset.UtcNow);
        db.AddRange(profile, service);
        await db.SaveChangesAsync();
        return new(student, teacher, service.Id);
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

    private static async Task ConfirmPaymentAsync(HttpClient student, Guid orderId)
    {
        var initiate = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{orderId}");
        initiate.Headers.TryAddWithoutValidation("Idempotency-Key", "delivery-pay-" + orderId);
        var initiated = await student.SendAsync(initiate);
        initiated.EnsureSuccessStatusCode();
        var payment = JsonDocument.Parse(await initiated.Content.ReadAsStringAsync())
            .RootElement.GetProperty("payment");
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            eventId = "delivery-event-" + orderId,
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

    private static ByteArrayContent FilePart(byte[] bytes, string contentType)
    {
        var part = new ByteArrayContent(bytes);
        part.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return part;
    }

    private static async Task<string> CodeAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString()!;

    private static byte[] ValidMp4() => [0, 0, 0, 0, (byte)'f', (byte)'t', (byte)'y', (byte)'p', 0, 0, 0, 0];
    private static byte[] ValidPng() => [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0];

    private sealed record SeedData(
        (string Id, string Email) Student, (string Id, string Email) Teacher, Guid ServiceId);
    private sealed record RequestInfo(Guid Id, string Version);
}
