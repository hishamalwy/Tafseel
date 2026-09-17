using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
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

/// <summary>
/// UX-09 / DEC-13: the price a student saw when they sent a Direct Request is preserved, whatever the
/// teacher does to the offering afterwards, and whatever price the request is accepted at. What the student
/// pays is still computed from the agreed price — the history is disclosure, not arithmetic.
/// </summary>
[Trait("Category", "SqlServer")]
public sealed class DirectRequestListedPriceTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task The_offering_price_the_student_saw_survives_every_later_edit()
    {
        var data = await SeedAsync(listedPrice: 100m);
        var student = await ClientForAsync(data.Student.Email);
        var teacher = await ClientForAsync(data.Teacher.Email);

        // The student sends the request while the offering says 100.
        var created = await student.PostAsJsonAsync("/api/v1/learning-requests", new
        {
            teacherServiceId = data.ServiceId,
            title = "Explain the chain rule",
            description = "Please explain every worked example in the attached chapter.",
            preferredDeliveryAt = DateTimeOffset.UtcNow.AddDays(3),
            budget = 120m
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var request = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement;
        var requestId = request.GetProperty("id").GetGuid();
        Assert.Equal(100m, request.GetProperty("listedPriceAtRequest").GetDecimal());
        Assert.Equal("SAR", request.GetProperty("listedCurrencyAtRequest").GetString());

        // The teacher raises the offering to 120. That is tomorrow's price, not this request's.
        await UpdateOfferingAsync(teacher, data.ServiceId, 120m);
        Assert.Equal(100m, (await ReadRequestAsync(student, requestId)).GetProperty("listedPriceAtRequest").GetDecimal());

        // The teacher accepts at 150, which is what the student will actually be charged on.
        var order = await AcceptAsync(teacher, requestId, 150m);
        Assert.Equal(150m, order.GetProperty("price").GetDecimal());
        Assert.Equal(100m, order.GetProperty("listedPriceAtRequest").GetDecimal());
        Assert.Equal("SAR", order.GetProperty("listedCurrencyAtRequest").GetString());

        // The fee and the total come from the agreed price: 8% of 150 is 12, and the student owes 162.
        Assert.Equal(12m, order.GetProperty("studentFeeAmount").GetDecimal());
        Assert.Equal(162m, order.GetProperty("studentTotal").GetDecimal());

        // A second edit moves nothing that has already happened.
        await UpdateOfferingAsync(teacher, data.ServiceId, 130m);
        var afterSecondEdit = await ReadRequestAsync(student, requestId);
        Assert.Equal(100m, afterSecondEdit.GetProperty("listedPriceAtRequest").GetDecimal());
        var orderId = order.GetProperty("id").GetGuid();
        var orderAfter = await ReadOrderAsync(student, orderId);
        Assert.Equal(100m, orderAfter.GetProperty("listedPriceAtRequest").GetDecimal());
        Assert.Equal(150m, orderAfter.GetProperty("price").GetDecimal());
        Assert.Equal(162m, orderAfter.GetProperty("studentTotal").GetDecimal());

        // And the offering itself really did move, so the test is not passing vacuously.
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(130m, await db.TeacherServices.Where(x => x.Id == data.ServiceId)
            .Select(x => x.Price).SingleAsync());
    }

    [Fact]
    public async Task A_price_sent_by_the_client_is_ignored()
    {
        var data = await SeedAsync(listedPrice: 100m);
        var student = await ClientForAsync(data.Student.Email);

        var created = await student.PostAsJsonAsync("/api/v1/learning-requests", new
        {
            teacherServiceId = data.ServiceId,
            title = "Explain the chain rule",
            description = "Please explain every worked example in the attached chapter.",
            preferredDeliveryAt = DateTimeOffset.UtcNow.AddDays(3),
            budget = 120m,
            // None of these are part of the contract; the server reads the offering itself.
            listedPriceAtRequest = 1m,
            listedCurrencyAtRequest = "USD"
        });

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var request = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(100m, request.GetProperty("listedPriceAtRequest").GetDecimal());
        Assert.Equal("SAR", request.GetProperty("listedCurrencyAtRequest").GetString());
    }

    [Fact]
    public async Task A_request_from_before_the_snapshot_existed_stays_empty_and_still_works()
    {
        var data = await SeedAsync(listedPrice: 100m);
        var student = await ClientForAsync(data.Student.Email);
        var teacher = await ClientForAsync(data.Teacher.Email);
        var created = await student.PostAsJsonAsync("/api/v1/learning-requests", new
        {
            teacherServiceId = data.ServiceId,
            title = "Explain the chain rule",
            description = "Please explain every worked example in the attached chapter.",
            preferredDeliveryAt = DateTimeOffset.UtcNow.AddDays(3),
            budget = 120m
        });
        var requestId = JsonDocument.Parse(await created.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();

        // Make it look like a row written before this migration: both columns empty, which is the only
        // shape the check constraint allows besides a whole snapshot.
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE LearningRequests SET ListedPriceAtRequest = NULL, ListedCurrencyAtRequest = NULL WHERE Id = {requestId}");
        }

        var request = await ReadRequestAsync(student, requestId);
        Assert.Equal(JsonValueKind.Null, request.GetProperty("listedPriceAtRequest").ValueKind);
        Assert.Equal(JsonValueKind.Null, request.GetProperty("listedCurrencyAtRequest").ValueKind);

        // Nothing about the missing history blocks the transaction.
        var order = await AcceptAsync(teacher, requestId, 150m);
        Assert.Equal(JsonValueKind.Null, order.GetProperty("listedPriceAtRequest").ValueKind);
        Assert.Equal(150m, order.GetProperty("price").GetDecimal());
        Assert.Equal(162m, order.GetProperty("studentTotal").GetDecimal());
    }

    [Fact]
    public async Task Half_a_snapshot_is_not_a_state_the_database_will_hold()
    {
        var data = await SeedAsync(listedPrice: 100m);
        var student = await ClientForAsync(data.Student.Email);
        var created = await student.PostAsJsonAsync("/api/v1/learning-requests", new
        {
            teacherServiceId = data.ServiceId,
            title = "Explain the chain rule",
            description = "Please explain every worked example in the attached chapter.",
            preferredDeliveryAt = DateTimeOffset.UtcNow.AddDays(3),
            budget = 120m
        });
        var requestId = JsonDocument.Parse(await created.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();

        // A price with no currency means nothing, and the constraint says so.
        await Assert.ThrowsAnyAsync<Exception>(() => db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE LearningRequests SET ListedCurrencyAtRequest = NULL WHERE Id = {requestId}"));
        await Assert.ThrowsAnyAsync<Exception>(() => db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE LearningRequests SET ListedPriceAtRequest = NULL WHERE Id = {requestId}"));
    }

    [Fact]
    public async Task Only_the_two_participants_can_read_the_price_history()
    {
        var data = await SeedAsync(listedPrice: 100m);
        var student = await ClientForAsync(data.Student.Email);
        var teacher = await ClientForAsync(data.Teacher.Email);
        var created = await student.PostAsJsonAsync("/api/v1/learning-requests", new
        {
            teacherServiceId = data.ServiceId,
            title = "Explain the chain rule",
            description = "Please explain every worked example in the attached chapter.",
            preferredDeliveryAt = DateTimeOffset.UtcNow.AddDays(3),
            budget = 120m
        });
        var requestId = JsonDocument.Parse(await created.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();
        var order = await AcceptAsync(teacher, requestId, 150m);
        var orderId = order.GetProperty("id").GetGuid();

        // The teacher is a participant and sees the same history — it was their own price.
        Assert.Equal(100m, (await ReadRequestAsync(teacher, requestId)).GetProperty("listedPriceAtRequest").GetDecimal());

        var outsider = await ClientForAsync(data.OtherStudent.Email);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/v1/learning-requests/{requestId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/v1/orders/{orderId}")).StatusCode);

        var anonymous = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/v1/learning-requests/{requestId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/v1/orders/{orderId}")).StatusCode);
    }

    [Fact]
    public async Task An_open_request_never_carries_a_listed_price()
    {
        var data = await SeedAsync(listedPrice: 100m);
        var student = await ClientForAsync(data.Student.Email);

        var published = await student.PostAsJsonAsync("/api/v1/open-marketplace/requests", new
        {
            subjectId = data.SubjectId,
            serviceCatalogItemId = data.CatalogId,
            title = "Explain the chain rule",
            requirements = "Please explain every worked example in the attached chapter.",
            deadline = DateTimeOffset.UtcNow.AddDays(3),
            budgetMin = 90m,
            budgetMax = 200m
        });
        Assert.Equal(HttpStatusCode.Created, published.StatusCode);
        var requestId = JsonDocument.Parse(await published.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var stored = await db.LearningRequests.AsNoTracking()
            .Where(x => x.Id == requestId)
            .Select(x => new { x.ListedPriceAtRequest, x.ListedCurrencyAtRequest, x.SourcingMode })
            .SingleAsync();

        Assert.Equal(RequestSourcingMode.OpenMarketplace, stored.SourcingMode);
        Assert.Null(stored.ListedPriceAtRequest);
        Assert.Null(stored.ListedCurrencyAtRequest);
    }

    // ---- helpers ----

    private static async Task<JsonElement> ReadRequestAsync(HttpClient client, Guid requestId)
    {
        var response = await client.GetAsync($"/api/v1/learning-requests/{requestId}");
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    private static async Task<JsonElement> ReadOrderAsync(HttpClient client, Guid orderId)
    {
        var response = await client.GetAsync($"/api/v1/orders/{orderId}");
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    private static async Task<JsonElement> AcceptAsync(HttpClient teacher, Guid requestId, decimal price)
    {
        var current = await ReadRequestAsync(teacher, requestId);
        var accept = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/learning-requests/{requestId}/accept")
        {
            Content = JsonContent.Create(new
            {
                finalPrice = price,
                currency = "SAR",
                agreedDeliveryAt = DateTimeOffset.UtcNow.AddDays(3),
                revisionAllowance = 1
            })
        };
        accept.Headers.TryAddWithoutValidation("If-Match", current.GetProperty("version").GetString());
        accept.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString("N"));
        var response = await teacher.SendAsync(accept);
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    /// <summary>The teacher edits their own offering, through the screen they would use.</summary>
    private async Task UpdateOfferingAsync(HttpClient teacher, Guid serviceId, decimal price)
    {
        Guid subjectId, catalogId;
        string version;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var service = await db.TeacherServices.AsNoTracking().SingleAsync(x => x.Id == serviceId);
            subjectId = service.SubjectId;
            catalogId = service.ServiceCatalogItemId;
            version = Convert.ToBase64String(service.RowVersion);
        }
        var update = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/teachers/me/services/{serviceId}")
        {
            Content = JsonContent.Create(new
            {
                subjectId,
                serviceCatalogItemId = catalogId,
                // The title belongs to the catalog, not to the teacher; only the price is being changed.
                description = "A custom explanation for the supplied files.",
                price,
                currency = "SAR",
                deliveryHours = 24,
                revisions = 1
            })
        };
        update.Headers.TryAddWithoutValidation("If-Match", version);
        var response = await teacher.SendAsync(update);
        response.EnsureSuccessStatusCode();
    }

    private async Task<SeedData> SeedAsync(decimal listedPrice)
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var otherStudent = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Listed Subject " + suffix, "code");
        var catalog = new ServiceCatalogItem(
            "Listed Service " + suffix, "Explanation", "listed_" + suffix, "خدمة", "شرح");
        db.AddRange(subject, catalog,
            new TeacherSubjectQualification(teacher.Id, subject.Id, DateTimeOffset.UtcNow));
        var profile = new TeacherProfile(teacher.Id, DateTimeOffset.UtcNow);
        profile.Update("Listed price teacher", "Teacher profile for listed-price tests.", "Egypt", "Cairo",
            "Egypt Standard Time", 15, DateTimeOffset.UtcNow);
        profile.Publish(TeacherProfileReadiness.Ready, DateTimeOffset.UtcNow);
        var service = new TeacherService(
            teacher.Id, subject.Id, catalog.Id, "Custom explanation",
            "A custom explanation for the supplied files.", listedPrice, "SAR", 24, 1, DateTimeOffset.UtcNow);
        db.AddRange(profile, service);
        await db.SaveChangesAsync();
        return new(student, otherStudent, teacher, service.Id, subject.Id, catalog.Id);
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private sealed record SeedData(
        (string Id, string Email) Student, (string Id, string Email) OtherStudent,
        (string Id, string Email) Teacher, Guid ServiceId, Guid SubjectId, Guid CatalogId);
}
