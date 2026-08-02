using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class MarketplaceTeacherServicesRelease2Tests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Teacher_catalog_exposes_admin_policy_and_real_qualification_state()
    {
        var seed = await SeedAsync();
        var response = await (await ClientForAsync(seed.Email)).GetAsync("/api/v1/teachers/me/marketplace-services");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var item = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement
            .EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == seed.CatalogId);
        Assert.True(item.GetProperty("canEnable").GetBoolean());
        Assert.Equal("available", item.GetProperty("availabilityState").GetString());
        Assert.Equal(120m, item.GetProperty("recommendedPrice").GetDecimal());
        Assert.True(item.GetProperty("subjects")[0].GetProperty("isQualificationActive").GetBoolean());
    }

    [Fact]
    public async Task Enable_is_idempotent_and_teacher_cannot_override_catalog_identity()
    {
        var seed = await SeedAsync();
        var client = await ClientForAsync(seed.Email);

        var first = await client.PostAsJsonAsync("/api/v1/teachers/me/services", Input(seed));
        var second = await client.PostAsJsonAsync("/api/v1/teachers/me/services", Input(seed));

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        var firstJson = JsonDocument.Parse(await first.Content.ReadAsStringAsync()).RootElement;
        var secondJson = JsonDocument.Parse(await second.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(firstJson.GetProperty("id").GetGuid(), secondJson.GetProperty("id").GetGuid());
        Assert.Equal(seed.CatalogName, firstJson.GetProperty("title").GetString());
        Assert.Equal("Clear checkpoints", firstJson.GetProperty("approachEn").GetString());

        var rejected = await client.PostAsJsonAsync("/api/v1/teachers/me/services",
            Input(seed, title: "Teacher invented title"));
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.Contains("teacher_service_title_catalog_owned", await rejected.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Catalog_bounds_and_revoked_qualification_block_enable()
    {
        var seed = await SeedAsync();
        var client = await ClientForAsync(seed.Email);

        var outOfRange = await client.PostAsJsonAsync("/api/v1/teachers/me/services", Input(seed, price: 500));
        Assert.Equal(HttpStatusCode.BadRequest, outOfRange.StatusCode);
        Assert.Contains("service_price_out_of_policy", await outOfRange.Content.ReadAsStringAsync());

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var qualification = await db.TeacherSubjectQualifications.SingleAsync(x =>
                x.TeacherId == seed.TeacherId && x.SubjectId == seed.SubjectId);
            qualification.Revoke(seed.TeacherId, "Certification test", factory.Clock.GetUtcNow());
            await db.SaveChangesAsync();
        }

        var revoked = await client.PostAsJsonAsync("/api/v1/teachers/me/services", Input(seed));
        Assert.Equal(HttpStatusCode.BadRequest, revoked.StatusCode);
        Assert.Contains("teacher_not_approved", await revoked.Content.ReadAsStringAsync());
    }

    [Fact]
    public void Migration_repairs_duplicates_without_moving_historical_references()
    {
        var path = Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "src",
            "Tafseel.Infrastructure", "Persistence", "Migrations"), "*MarketplaceTeacherServicesRelease2.cs").Single();
        var migration = File.ReadAllText(path);

        Assert.Contains("NonTerminalReferences", migration);
        Assert.Contains("SupersededByTeacherServiceId", migration);
        Assert.Contains("ROW_NUMBER() OVER", migration);
        Assert.Contains("[Rank] > 1", migration);
        Assert.DoesNotContain("UPDATE [LearningRequests]", migration);
        Assert.DoesNotContain("UPDATE [Orders]", migration);
        Assert.DoesNotContain("UPDATE [LiveSessionBookings]", migration);
    }

    private async Task<Seed> SeedAsync()
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Release 2 " + suffix, "code");
        var catalog = new ServiceCatalogItem(
            "Catalog " + suffix, "Admin-owned description", "release2_" + suffix,
            "خدمة الكتالوج", "وصف تديره المنصة", minPrice: 80, maxPrice: 200,
            defaultPrice: 120, recommendedPrice: 120, minimumDeliveryHours: 12,
            defaultDeliveryHours: 24, recommendedDeliveryHours: 24, maximumDeliveryHours: 72,
            defaultRevisions: 1, maximumRevisions: 3);
        db.AddRange(subject, catalog, new TeacherSubjectQualification(
            teacher.Id, subject.Id, factory.Clock.GetUtcNow()));
        await db.SaveChangesAsync();
        return new(teacher.Id, teacher.Email, subject.Id, catalog.Id, catalog.Name);
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static object Input(Seed seed, decimal price = 120, string? title = null) => new
    {
        subjectId = seed.SubjectId,
        serviceCatalogItemId = seed.CatalogId,
        title,
        price,
        currency = "SAR",
        deliveryHours = 24,
        revisions = 1,
        approachEn = "Clear checkpoints",
        approachAr = "نقاط متابعة واضحة",
        isAvailable = true
    };

    private sealed record Seed(
        string TeacherId, string Email, Guid SubjectId, Guid CatalogId, string CatalogName);
}
