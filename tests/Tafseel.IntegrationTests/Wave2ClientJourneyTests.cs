using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>
/// Wave 2: the journeys behind the fixed Angular calls work end to end when the API receives
/// exactly what the client sends. Bodies are raw JSON with the gateway's keys, and headers are
/// the ones the gateway sets, so a rename on either side fails here.
/// </summary>
[Trait("Category", "SqlServer")]
public sealed class Wave2ClientJourneyTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    /// <summary>J3-02 then J3-07: a direct request created and accepted as the client does it.</summary>
    [Fact]
    public async Task Student_creates_a_direct_request_and_the_teacher_accepts_it_into_an_order_awaiting_payment()
    {
        var seed = await SeedAsync();
        using var student = await ClientAsync(seed.Student.Email);
        using var teacher = await ClientAsync(seed.TeacherA.Email);
        var now = factory.Clock.GetUtcNow();

        // HttpRequestGateway.create: teacherServiceId, title, description, preferredDeliveryAt, budget.
        var created = await SendAsync(student, HttpMethod.Post, "/api/v1/learning-requests", $$"""
            {"teacherServiceId":"{{seed.ServiceA}}","title":"Explain limits","description":"Please explain limits step by step.","preferredDeliveryAt":"{{now.AddDays(3).UtcDateTime:O}}","budget":null}
            """);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var request = await JsonAsync(created);
        Assert.Equal(JsonValueKind.Null, request.GetProperty("budget").ValueKind);
        var requestId = request.GetProperty("id").GetString()!;
        var version = request.GetProperty("version").GetString()!;

        // AcceptRequestGateway.policy: the offering the request names, with its catalog limits.
        var services = JsonDocument.Parse(await teacher.GetStringAsync("/api/v1/teachers/me/marketplace-services")).RootElement;
        var catalog = services.EnumerateArray().Single(s => s.GetProperty("offerings").EnumerateArray()
            .Any(o => o.GetProperty("id").GetString() == seed.ServiceA.ToString()));
        var offering = catalog.GetProperty("offerings").EnumerateArray().Single(o => o.GetProperty("id").GetString() == seed.ServiceA.ToString());
        Assert.Equal("SAR", offering.GetProperty("currency").GetString());
        var deliveryHours = Math.Max(offering.GetProperty("deliveryHours").GetInt32(),
            catalog.GetProperty("minimumDeliveryHours").GetInt32()) + 1;

        // AcceptRequestGateway.accept: four keys, If-Match and Idempotency-Key.
        var accepted = await SendAsync(teacher, HttpMethod.Post, $"/api/v1/learning-requests/{requestId}/accept", $$"""
            {"finalPrice":{{offering.GetProperty("price").GetDecimal()}},"currency":"SAR","agreedDeliveryAt":"{{now.AddHours(deliveryHours).UtcDateTime:O}}","revisionAllowance":1}
            """, ("If-Match", version), ("Idempotency-Key", Guid.NewGuid().ToString()));
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        var order = await JsonAsync(accepted);
        Assert.Equal(0, order.GetProperty("status").GetInt32());          // OrderStatus.AwaitingPayment
        Assert.Equal(0, order.GetProperty("paymentStatus").GetInt32());   // OrderPaymentStatus.Pending

        var assigned = JsonDocument.Parse(await teacher.GetStringAsync("/api/v1/learning-requests/assigned?pageSize=50")).RootElement;
        Assert.Equal(2, assigned.GetProperty("items").EnumerateArray()
            .Single(r => r.GetProperty("id").GetString() == requestId).GetProperty("status").GetInt32()); // Accepted
    }

    /// <summary>J4-02, J4-05, J4-07: list, offer and select exactly as the marketplace page does.</summary>
    [Fact]
    public async Task Open_request_is_listed_offered_on_and_reserved_by_selection_with_both_versions()
    {
        var seed = await SeedAsync();
        using var student = await ClientAsync(seed.Student.Email);
        using var teacherA = await ClientAsync(seed.TeacherA.Email);
        using var teacherB = await ClientAsync(seed.TeacherB.Email);
        var now = factory.Clock.GetUtcNow();

        var published = await SendAsync(student, HttpMethod.Post, "/api/v1/open-marketplace/requests", $$"""
            {"subjectId":"{{seed.SubjectId}}","serviceCatalogItemId":"{{seed.CatalogId}}","title":"Explain integrals","requirements":"Every exercise, please.","deadline":"{{now.AddDays(4).UtcDateTime:O}}","budgetMin":null,"budgetMax":null}
            """);
        Assert.True(published.IsSuccessStatusCode, await published.Content.ReadAsStringAsync());
        var requestId = (await JsonAsync(published)).GetProperty("id").GetString()!;

        // HttpMarketplaceGateway.myRequests: /learning-requests/mine, open-marketplace entries only.
        var mine = await MineAsync(student, requestId);
        Assert.Equal(1, mine.GetProperty("sourcingMode").GetInt32());
        Assert.Equal(5, mine.GetProperty("status").GetInt32()); // OpenForOffers

        // HttpMarketplaceGateway.submitOffer: the opportunity route and SubmitTeacherOffer's five keys.
        foreach (var (client, amount) in new[] { (teacherA, 180m), (teacherB, 200m) })
        {
            var offered = await SendAsync(client, HttpMethod.Post, $"/api/v1/open-marketplace/opportunities/{requestId}/offers", $$"""
                {"amount":{{amount}},"deliveryHours":48,"includedRevisions":2,"validityHours":168,"message":"I can explain every exercise."}
                """);
            Assert.Equal(HttpStatusCode.Created, offered.StatusCode);
        }

        // HttpMarketplaceGateway.offers: a plain array.
        var offers = JsonDocument.Parse(await student.GetStringAsync($"/api/v1/open-marketplace/requests/{requestId}/offers")).RootElement;
        Assert.Equal(JsonValueKind.Array, offers.ValueKind);
        var chosen = offers.EnumerateArray().Single(o => o.GetProperty("amount").GetDecimal() == 180m);
        var other = offers.EnumerateArray().Single(o => o.GetProperty("amount").GetDecimal() == 200m);
        Assert.Equal(168, (int)Math.Round((chosen.GetProperty("validUntil").GetDateTimeOffset() - now).TotalHours));

        mine = await MineAsync(student, requestId);
        var requestVersion = mine.GetProperty("version").GetString()!;
        Assert.Equal(2, mine.GetProperty("offerCount").GetInt32());
        var chosenId = chosen.GetProperty("id").GetString()!;
        var staleOfferVersion = chosen.GetProperty("version").GetString()!;

        // The teacher revises the offer after the student loaded it: the version the page holds is now stale.
        var revised = await SendAsync(teacherA, HttpMethod.Put, $"/api/v1/open-marketplace/offers/{chosenId}", """
            {"amount":175,"deliveryHours":48,"includedRevisions":2,"validityHours":168,"message":"Revised: I can explain every exercise."}
            """, ("If-Match", staleOfferVersion));
        Assert.Equal(HttpStatusCode.OK, revised.StatusCode);

        var stale = await SendAsync(student, HttpMethod.Post,
            $"/api/v1/open-marketplace/requests/{requestId}/offers/{chosenId}/select", null,
            ("If-Match", requestVersion), ("X-Offer-Version", staleOfferVersion));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("concurrency_conflict", (await JsonAsync(stale)).GetProperty("code").GetString());
        mine = await MineAsync(student, requestId);
        Assert.Equal(5, mine.GetProperty("status").GetInt32()); // still open: nothing was reserved

        // Reloaded as the page does after a conflict, then selected with both current versions.
        offers = JsonDocument.Parse(await student.GetStringAsync($"/api/v1/open-marketplace/requests/{requestId}/offers")).RootElement;
        var current = offers.EnumerateArray().Single(o => o.GetProperty("id").GetString() == chosenId);
        Assert.Equal(175m, current.GetProperty("amount").GetDecimal());

        // HttpMarketplaceGateway.selectOffer: If-Match = request version, X-Offer-Version = offer version, no body.
        var selected = await SendAsync(student, HttpMethod.Post,
            $"/api/v1/open-marketplace/requests/{requestId}/offers/{chosenId}/select", null,
            ("If-Match", mine.GetProperty("version").GetString()!), ("X-Offer-Version", current.GetProperty("version").GetString()!));
        Assert.Equal(HttpStatusCode.NoContent, selected.StatusCode);

        mine = await MineAsync(student, requestId);
        Assert.Equal(6, mine.GetProperty("status").GetInt32()); // AwaitingPayment: reserved for payment
        Assert.Equal(chosenId, mine.GetProperty("selectedOfferId").GetString());
        Assert.True(mine.GetProperty("paymentReservationExpiresAt").GetDateTimeOffset() > now);
        // Selection does not create an order.
        await using (var scope = factory.Services.CreateAsyncScope())
            Assert.False(scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Orders
                .Any(o => o.LearningRequestId == Guid.Parse(requestId)));
        Assert.NotEqual(chosenId, other.GetProperty("id").GetString());
    }

    private async Task<JsonElement> MineAsync(HttpClient student, string requestId)
    {
        var page = JsonDocument.Parse(await student.GetStringAsync("/api/v1/learning-requests/mine?pageSize=50")).RootElement;
        return page.GetProperty("items").EnumerateArray().Single(r => r.GetProperty("id").GetString() == requestId).Clone();
    }

    private static async Task<HttpResponseMessage> SendAsync(
        HttpClient client, HttpMethod method, string url, string? json, params (string Name, string Value)[] headers)
    {
        var request = new HttpRequestMessage(method, url);
        if (json is not null) request.Content = new StringContent(json.Trim(), Encoding.UTF8, "application/json");
        foreach (var (name, value) in headers) request.Headers.TryAddWithoutValidation(name, value);
        return await client.SendAsync(request);
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<Seed> SeedAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacherA = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var teacherB = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var now = factory.Clock.GetUtcNow();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Wave2 Subject " + suffix, "book", "مادة");
        var catalog = new ServiceCatalogItem("Wave2 Explanation " + suffix, "Async explanation", "w2_" + suffix, "شرح", "شرح غير متزامن");
        db.AddRange(subject, catalog,
            new TeacherSubjectQualification(teacherA.Id, subject.Id, now),
            new TeacherSubjectQualification(teacherB.Id, subject.Id, now));
        foreach (var teacher in new[] { teacherA, teacherB })
        {
            var profile = new TeacherProfile(teacher.Id, now);
            profile.Update("Wave 2 teacher", "Qualified teacher profile for Wave 2 client journeys.", "Egypt", "Cairo",
                "Egypt Standard Time", 15, now);
            profile.Publish(TeacherProfileReadiness.Ready, now);
            db.Add(profile);
        }
        var serviceA = new TeacherService(teacherA.Id, subject.Id, catalog.Id, "Explanation A", "Detailed work", 100, "SAR", 48, 2, now);
        db.AddRange(serviceA,
            new TeacherService(teacherB.Id, subject.Id, catalog.Id, "Explanation B", "Fast work", 120, "SAR", 24, 1, now));
        await db.SaveChangesAsync();
        return new(student, teacherA, teacherB, subject.Id, catalog.Id, serviceA.Id);
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private sealed record Seed(
        (string Id, string Email) Student, (string Id, string Email) TeacherA, (string Id, string Email) TeacherB,
        Guid SubjectId, Guid CatalogId, Guid ServiceA);
}
