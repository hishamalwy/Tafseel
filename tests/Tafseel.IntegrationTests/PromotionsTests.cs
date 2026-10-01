using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Infrastructure.Identity;

namespace Tafseel.IntegrationTests;

public sealed class PromotionsTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Admin_publishes_a_promotion_and_the_public_landing_feed_serves_it()
    {
        using var client = await AdminClientAsync();
        var couponCode = "PROMO" + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
        var coupon = await client.PostAsJsonAsync("/api/v1/admin/coupons", new
        {
            name = "Promotion test coupon",
            code = couponCode,
            discountType = 0,
            discountValue = 20,
            expiresAt = (DateTimeOffset?)null
        });
        Assert.Equal(HttpStatusCode.Created, coupon.StatusCode);
        var couponId = (await coupon.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var created = await client.PostAsJsonAsync("/api/v1/admin/promotions", new
        {
            kind = 0,
            titleEn = "20% off your first request",
            titleAr = "خصم 20% على أول طلب لك",
            eyebrowEn = "Limited offer",
            eyebrowAr = "عرض لفترة محدودة",
            bodyEn = "An exclusive discount on your first request.",
            bodyAr = "خصم حصري على أول طلب.",
            highlightEn = "20%",
            highlightAr = "20%",
            couponCode,
            ctaLabelEn = "Claim the offer",
            ctaLabelAr = "استفد من العرض",
            ctaHref = "/teachers",
            accent = (string?)null,
            startsAt = (DateTimeOffset?)null,
            endsAt = DateTimeOffset.UtcNow.AddDays(5),
            displayOrder = 0
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var body = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = body.GetProperty("id").GetGuid();
        Assert.Equal("discount", body.GetProperty("kindCode").GetString());
        Assert.Equal("violet", body.GetProperty("accent").GetString());
        Assert.True(body.GetProperty("isLive").GetBoolean());
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("version").GetString()));

        // The admin list is the regression guard for the concurrency-token mapping:
        // it is the only payload that base64-encodes RowVersion.
        var list = await client.GetAsync("/api/v1/admin/promotions");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        var listed = await list.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Contains(listed.EnumerateArray(), x => x.GetProperty("id").GetGuid() == id);

        using var anonymous = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var live = await anonymous.GetAsync("/api/v1/promotions");
        Assert.Equal(HttpStatusCode.OK, live.StatusCode);
        var feed = await live.Content.ReadFromJsonAsync<JsonElement>();
        var served = feed.EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id);
        Assert.Equal(couponCode, served.GetProperty("couponCode").GetString());
        Assert.Equal("خصم 20% على أول طلب لك", served.GetProperty("titleAr").GetString());

        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PatchAsJsonAsync($"/api/v1/admin/coupons/{couponId}/active", new { isActive = false })).StatusCode);
        var withoutCoupon = await anonymous.GetFromJsonAsync<JsonElement>("/api/v1/promotions");
        Assert.DoesNotContain(withoutCoupon.EnumerateArray(), x => x.GetProperty("id").GetGuid() == id);
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PatchAsJsonAsync($"/api/v1/admin/coupons/{couponId}/active", new { isActive = true })).StatusCode);

        // Deactivating removes it from the public feed but keeps it in the admin list.
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PatchAsJsonAsync($"/api/v1/admin/promotions/{id}/active", new { isActive = false })).StatusCode);
        var afterHide = await anonymous.GetFromJsonAsync<JsonElement>("/api/v1/promotions");
        Assert.DoesNotContain(afterHide.EnumerateArray(), x => x.GetProperty("id").GetGuid() == id);
        var adminAfterHide = await client.GetFromJsonAsync<JsonElement>("/api/v1/admin/promotions");
        Assert.Contains(adminAfterHide.EnumerateArray(), x => x.GetProperty("id").GetGuid() == id);

        Assert.Equal(HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/v1/admin/promotions/{id}")).StatusCode);
    }

    [Fact]
    public async Task Scheduled_promotions_stay_out_of_the_public_feed_until_their_window_opens()
    {
        using var client = await AdminClientAsync();
        var created = await client.PostAsJsonAsync("/api/v1/admin/promotions", Input(
            titleEn: "Future event", titleAr: "فعالية قادمة",
            startsAt: DateTimeOffset.UtcNow.AddDays(3), endsAt: DateTimeOffset.UtcNow.AddDays(4)));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        using var anonymous = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var feed = await anonymous.GetFromJsonAsync<JsonElement>("/api/v1/promotions");
        Assert.DoesNotContain(feed.EnumerateArray(), x => x.GetProperty("id").GetGuid() == id);

        await client.DeleteAsync($"/api/v1/admin/promotions/{id}");
    }

    [Fact]
    public async Task Promotion_links_may_not_carry_an_executable_scheme()
    {
        using var client = await AdminClientAsync();
        var response = await client.PostAsJsonAsync("/api/v1/admin/promotions", Input(
            titleEn: "Bad link", titleAr: "رابط غير صالح", ctaHref: "javascript:alert(1)"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Promotions_require_an_authenticated_administrator()
    {
        using var anonymous = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anonymous.GetAsync("/api/v1/admin/promotions")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/api/v1/promotions")).StatusCode);
    }

    [Fact]
    public async Task Platform_stats_are_public_and_non_negative()
    {
        using var anonymous = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var stats = await anonymous.GetFromJsonAsync<JsonElement>("/api/v1/platform/stats");
        Assert.True(stats.GetProperty("students").GetInt32() >= 0);
        Assert.True(stats.GetProperty("teachers").GetInt32() >= 0);
        Assert.True(stats.GetProperty("subjects").GetInt32() >= 0);
        Assert.True(stats.GetProperty("completedSessions").GetInt32() >= 0);
    }

    private static object Input(
        string titleEn,
        string titleAr,
        string? ctaHref = null,
        DateTimeOffset? startsAt = null,
        DateTimeOffset? endsAt = null) => new
        {
            kind = 4,
            titleEn,
            titleAr,
            eyebrowEn = (string?)null,
            eyebrowAr = (string?)null,
            bodyEn = (string?)null,
            bodyAr = (string?)null,
            highlightEn = (string?)null,
            highlightAr = (string?)null,
            couponCode = (string?)null,
            ctaLabelEn = (string?)null,
            ctaLabelAr = (string?)null,
            ctaHref,
            accent = (string?)null,
            startsAt,
            endsAt,
            displayOrder = 0
        };

    private async Task<HttpClient> AdminClientAsync()
    {
        var email = $"admin-promo-{Guid.NewGuid():N}@example.com";
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var admin = new ApplicationUser
            {
                UserName = email,
                Email = email,
                FullName = "Promotions Admin",
                EmailConfirmed = true
            };
            Assert.True((await users.CreateAsync(admin, "Strong!Password1")).Succeeded);
            Assert.True((await users.AddToRoleAsync(admin, Roles.Admin)).Succeeded);
        }

        var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = "Strong!Password1" });
        var token = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}
