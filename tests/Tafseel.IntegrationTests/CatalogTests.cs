using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Infrastructure.Identity;

namespace Tafseel.IntegrationTests;

public sealed class CatalogTests(TafseelApiFactory factory) : IClassFixture<TafseelApiFactory>
{
    [Fact]
    public async Task Admin_can_create_edit_and_deactivate_subject()
    {
        var email = $"admin-{Guid.NewGuid():N}@example.com";
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var admin = new ApplicationUser
            {
                UserName = email,
                Email = email,
                FullName = "Test Admin",
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

        var created = await client.PostAsJsonAsync("/api/v1/admin/subjects", new { name = "Mathematics", icon = "sigma" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PutAsJsonAsync($"/api/v1/admin/catalog/subjects/{id}",
                new { name = "Advanced Mathematics", detail = "sigma" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PatchAsJsonAsync($"/api/v1/admin/catalog/subjects/{id}/active",
                new { isActive = false })).StatusCode);

        client.DefaultRequestHeaders.Authorization = null;
        var subjects = await client.GetFromJsonAsync<JsonElement[]>("/api/v1/subjects");
        Assert.DoesNotContain(subjects!, subject => subject.GetProperty("id").GetGuid() == id);
    }
}
