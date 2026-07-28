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
    public async Task Admin_can_manage_catalog_and_teacher_can_download_assignment_pdf()
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
        var assignment = await client.PostAsJsonAsync("/api/v1/admin/qualification-topics", new
        {
            subjectId = id,
            name = "Explain the supplied PDF",
            instructions = "Explain the attached PDF clearly.",
            maxVideoSeconds = 180
        });
        Assert.Equal(HttpStatusCode.Created, assignment.StatusCode);
        var assignmentId = (await assignment.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        using var pdf = new ByteArrayContent("%PDF-1.4\nQualification assignment"u8.ToArray());
        pdf.Headers.ContentType = new("application/pdf");
        using var upload = new MultipartFormDataContent
        {
            { pdf, "file", "assignment.pdf" },
            { new StringContent("Assignment PDF"), "displayName" },
            { new StringContent(""), "displayNameAr" },
            { new StringContent("0"), "displayOrder" },
            { new StringContent("true"), "isRequired" }
        };
        var uploaded = await client.PostAsync(
            $"/api/v1/admin/qualification-topics/{assignmentId}/resources/file", upload);
        var uploadBody = await uploaded.Content.ReadAsStringAsync();
        Assert.True(uploaded.StatusCode == HttpStatusCode.Created, uploadBody);
        var resourceUrl = JsonDocument.Parse(uploadBody).RootElement.GetProperty("url").GetString();

        var teacherEmail = $"teacher-{Guid.NewGuid():N}@example.com";
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var teacher = new ApplicationUser
            {
                UserName = teacherEmail,
                Email = teacherEmail,
                FullName = "Test Teacher",
                EmailConfirmed = true
            };
            Assert.True((await users.CreateAsync(teacher, "Strong!Password1")).Succeeded);
            Assert.True((await users.AddToRoleAsync(teacher, Roles.Teacher)).Succeeded);
        }
        var teacherLogin = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = teacherEmail,
            password = "Strong!Password1"
        });
        var teacherToken = (await teacherLogin.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", teacherToken);
        var downloaded = await client.GetAsync(resourceUrl!);
        Assert.Equal(HttpStatusCode.OK, downloaded.StatusCode);
        Assert.Equal("application/pdf", downloaded.Content.Headers.ContentType?.MediaType);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
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
