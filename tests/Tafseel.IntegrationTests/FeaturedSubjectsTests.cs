using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Infrastructure.Identity;

namespace Tafseel.IntegrationTests;

public sealed class FeaturedSubjectsTests(TafseelApiFactory factory) : IClassFixture<TafseelApiFactory>
{
    [Fact]
    public async Task Featured_subjects_are_active_ordered_by_display_order_capped_and_deterministic()
    {
        var email = $"admin-featured-{Guid.NewGuid():N}@example.com";
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var admin = new ApplicationUser
            {
                UserName = email,
                Email = email,
                FullName = "Featured Admin",
                EmailConfirmed = true
            };
            Assert.True((await users.CreateAsync(admin, "Strong!Password1")).Succeeded);
            Assert.True((await users.AddToRoleAsync(admin, Roles.Admin)).Succeeded);
        }

        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "Strong!Password1"
        });
        var token = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var stamp = Guid.NewGuid().ToString("N")[..8];
        var created = new List<(Guid Id, int Order)>();
        for (var i = 0; i < 5; i++)
        {
            var order = i + 1;
            var response = await client.PostAsJsonAsync("/api/v1/admin/subjects", new
            {
                name = $"FeatSub {stamp} {order:D2}",
                icon = "book",
                nameAr = $"مادة {order}",
                displayOrder = order
            });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            var id = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
            created.Add((id, order));
        }

        var inactiveId = created[0].Id;
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PatchAsJsonAsync($"/api/v1/admin/catalog/subjects/{inactiveId}/active",
                new { isActive = false })).StatusCode);

        client.DefaultRequestHeaders.Authorization = null;
        var featured = await client.GetFromJsonAsync<JsonElement[]>("/api/v1/subjects/featured?take=4");
        Assert.NotNull(featured);
        Assert.InRange(featured!.Length, 0, 4);
        Assert.DoesNotContain(featured, x => x.GetProperty("id").GetGuid() == inactiveId);
        Assert.All(featured, x => Assert.True(x.GetProperty("isActive").GetBoolean()));

        for (var i = 1; i < featured.Length; i++)
        {
            var prev = featured[i - 1].GetProperty("displayOrder").GetInt32();
            var next = featured[i].GetProperty("displayOrder").GetInt32();
            Assert.True(prev <= next);
        }

        var ours = featured
            .Where(x => created.Any(c => c.Id == x.GetProperty("id").GetGuid()))
            .Select(x => x.GetProperty("id").GetGuid())
            .ToArray();
        var expectedOurs = created.Where(c => c.Id != inactiveId).OrderBy(c => c.Order).Select(c => c.Id).Take(4).ToArray();
        // Any of our active subjects that appear in the featured window must keep DisplayOrder sequence.
        Assert.Equal(ours, expectedOurs.Where(id => ours.Contains(id)).ToArray());

        var again = await client.GetFromJsonAsync<JsonElement[]>("/api/v1/subjects/featured?take=4");
        Assert.Equal(
            featured.Select(x => x.GetProperty("id").GetGuid()),
            again!.Select(x => x.GetProperty("id").GetGuid()));
    }
}
