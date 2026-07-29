using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

public sealed class StudentLearningPreferencesTests(TafseelApiFactory factory)
    : IClassFixture<TafseelApiFactory>
{
    private const string Path = "/api/v1/students/me/learning-preferences";

    [Fact]
    public async Task Anonymous_and_non_student_roles_are_rejected()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync(Path)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await factory.CreateClient().PutAsJsonAsync(Path, new { explanationStyle = "detailed" })).StatusCode);

        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var quality = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        using var teacherClient = await ClientAsync(teacher.Email);
        using var qualityClient = await ClientAsync(quality.Email);
        Assert.Equal(HttpStatusCode.Forbidden, (await teacherClient.GetAsync(Path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await qualityClient.GetAsync(Path)).StatusCode);
    }

    [Fact]
    public async Task Student_can_read_empty_create_update_reset_and_validate()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        using var client = await ClientAsync(student.Email);
        var languages = await ActiveLanguagesAsync();
        var languageId = languages[0].Id;
        var inactiveId = await CreateInactiveLanguageAsync();

        var empty = await client.GetFromJsonAsync<JsonElement>(Path);
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("explanationStyle").ValueKind);
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("preferredTeachingLanguage").ValueKind);
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("version").ValueKind);

        var created = await client.PutAsJsonAsync(Path, new
        {
            explanationStyle = "step_by_step",
            preferredTeachingLanguageId = languageId,
            version = (string?)null
        });
        created.EnsureSuccessStatusCode();
        var createdBody = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("step_by_step", createdBody.GetProperty("explanationStyle").GetString());
        Assert.Equal(languageId, createdBody.GetProperty("preferredTeachingLanguage").GetProperty("id").GetGuid());
        var version = createdBody.GetProperty("version").GetString();
        Assert.False(string.IsNullOrWhiteSpace(version));

        var identical = await client.PutAsJsonAsync(Path, new
        {
            explanationStyle = "step_by_step",
            preferredTeachingLanguageId = languageId,
            version
        });
        identical.EnsureSuccessStatusCode();
        var identicalBody = JsonDocument.Parse(await identical.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("step_by_step", identicalBody.GetProperty("explanationStyle").GetString());
        version = identicalBody.GetProperty("version").GetString();

        var unknownStyle = await client.PutAsJsonAsync(Path, new
        {
            explanationStyle = "visual_heavy",
            preferredTeachingLanguageId = (Guid?)null,
            version
        });
        Assert.Equal(HttpStatusCode.BadRequest, unknownStyle.StatusCode);
        Assert.Equal("invalid_explanation_style", await CodeAsync(unknownStyle));

        var unknownLanguage = await client.PutAsJsonAsync(Path, new
        {
            explanationStyle = "detailed",
            preferredTeachingLanguageId = Guid.NewGuid(),
            version
        });
        Assert.Equal(HttpStatusCode.NotFound, unknownLanguage.StatusCode);
        Assert.Equal("language_not_found", await CodeAsync(unknownLanguage));

        var inactive = await client.PutAsJsonAsync(Path, new
        {
            explanationStyle = "detailed",
            preferredTeachingLanguageId = inactiveId,
            version
        });
        Assert.Equal(HttpStatusCode.BadRequest, inactive.StatusCode);
        Assert.Equal("language_inactive", await CodeAsync(inactive));

        var conflict = await client.PutAsJsonAsync(Path, new
        {
            explanationStyle = "visual",
            preferredTeachingLanguageId = languageId,
            version = Convert.ToBase64String(new byte[] { 1, 2, 3, 4, 5, 6, 7, 8 })
        });
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        Assert.Equal("concurrency_conflict", await CodeAsync(conflict));

        var updated = await client.PutAsJsonAsync(Path, new
        {
            explanationStyle = "visual",
            preferredTeachingLanguageId = languageId,
            version
        });
        updated.EnsureSuccessStatusCode();
        var updatedBody = JsonDocument.Parse(await updated.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("visual", updatedBody.GetProperty("explanationStyle").GetString());
        version = updatedBody.GetProperty("version").GetString();

        var cleared = await client.PutAsJsonAsync(Path, new
        {
            explanationStyle = (string?)null,
            preferredTeachingLanguageId = (Guid?)null,
            version
        });
        cleared.EnsureSuccessStatusCode();
        var clearedBody = JsonDocument.Parse(await cleared.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(JsonValueKind.Null, clearedBody.GetProperty("explanationStyle").ValueKind);
        Assert.Equal(JsonValueKind.Null, clearedBody.GetProperty("preferredTeachingLanguage").ValueKind);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var row = await db.StudentLearningPreferences.AsNoTracking()
                .SingleAsync(x => x.UserId == student.Id);
            Assert.Null(row.ExplanationStyle);
            Assert.Null(row.PreferredTeachingLanguageId);
            Assert.Equal(1, await db.StudentLearningPreferences.CountAsync(x => x.UserId == student.Id));
        }

        var me = await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/me");
        Assert.False(me.GetRawText().Contains("explanationStyle", StringComparison.OrdinalIgnoreCase));
        Assert.False(me.GetRawText().Contains("preferredTeachingLanguage", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Inactive_stored_language_is_omitted_on_get_without_fabricating_replacement()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        using var client = await ClientAsync(student.Email);
        var languageId = await CreateActiveLanguageAsync();

        var created = await client.PutAsJsonAsync(Path, new
        {
            explanationStyle = "exam_focused",
            preferredTeachingLanguageId = languageId,
            version = (string?)null
        });
        created.EnsureSuccessStatusCode();

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var language = await db.TeachingLanguages.SingleAsync(x => x.Id == languageId);
            language.SetActive(false);
            await db.SaveChangesAsync();
        }

        var get = await client.GetFromJsonAsync<JsonElement>(Path);
        Assert.Equal("exam_focused", get.GetProperty("explanationStyle").GetString());
        Assert.Equal(JsonValueKind.Null, get.GetProperty("preferredTeachingLanguage").ValueKind);
        Assert.False(string.IsNullOrWhiteSpace(get.GetProperty("version").GetString()));
    }

    [Fact]
    public async Task Overposted_user_id_is_ignored_and_route_remains_self_scoped()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var other = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        using var client = await ClientAsync(student.Email);
        var languageId = (await ActiveLanguagesAsync())[0].Id;

        var response = await client.PutAsJsonAsync(Path, new
        {
            userId = other.Id,
            studentUserId = other.Id,
            explanationStyle = "short_direct",
            preferredTeachingLanguageId = languageId,
            version = (string?)null
        });
        response.EnsureSuccessStatusCode();

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.True(await db.StudentLearningPreferences.AnyAsync(x =>
            x.UserId == student.Id && x.ExplanationStyle == "short_direct"));
        Assert.False(await db.StudentLearningPreferences.AnyAsync(x => x.UserId == other.Id));
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private async Task<TeachingLanguage[]> ActiveLanguagesAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var items = await db.TeachingLanguages.AsNoTracking().Where(x => x.IsActive).ToArrayAsync();
        Assert.NotEmpty(items);
        return items;
    }

    private async Task<Guid> CreateActiveLanguageAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var language = new TeachingLanguage(
            $"Lang {Guid.NewGuid():N}"[..18],
            ("z" + Guid.NewGuid().ToString("N"))[..8]);
        db.Add(language);
        await db.SaveChangesAsync();
        return language.Id;
    }

    private async Task<Guid> CreateInactiveLanguageAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var language = new TeachingLanguage(
            $"Inactive {Guid.NewGuid():N}"[..18],
            ("x" + Guid.NewGuid().ToString("N"))[..8]);
        language.SetActive(false);
        db.Add(language);
        await db.SaveChangesAsync();
        return language.Id;
    }

    private static async Task<string> CodeAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString()!;
}
