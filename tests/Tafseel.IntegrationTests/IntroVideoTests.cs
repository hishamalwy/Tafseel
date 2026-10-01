using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>PRODUCT-P1: one optional public introduction video, and application videos only with a recorded consent.</summary>
[Trait("Category", "SqlServer")]
public sealed class IntroVideoTests(SqlServerTafseelApiFactory factory) : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task An_application_video_is_shown_only_after_consent_and_hiding_it_withdraws_that_consent()
    {
        var seeded = await SeedAsync();
        using var teacher = await ClientForAsync(seeded.Email);
        using var visitor = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });

        // Review material is private: nothing on the profile, and the old ways to publish it refuse.
        var profile = await visitor.GetFromJsonAsync<JsonElement>($"/api/v1/teachers/{seeded.TeacherId}");
        Assert.Empty(profile.GetProperty("samples").EnumerateArray());
        Assert.Equal(JsonValueKind.Null, profile.GetProperty("introVideo").ValueKind);
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync($"/api/v1/teachers/samples/{seeded.SampleId}/content")).StatusCode);
        var legacy = await teacher.PutAsJsonAsync($"/api/v1/teachers/me/samples/{seeded.SampleId}/publication", new { published = true });
        Assert.Equal(HttpStatusCode.BadRequest, legacy.StatusCode);
        Assert.Contains("use_intro_video", await legacy.Content.ReadAsStringAsync());

        var mine = await teacher.GetFromJsonAsync<JsonElement>("/api/v1/teachers/me/intro-video");
        Assert.False(mine.GetProperty("hasVideo").GetBoolean());
        var option = Assert.Single(mine.GetProperty("applicationVideos").EnumerateArray());
        Assert.Equal(seeded.SampleId, option.GetProperty("sampleId").GetGuid());

        var noConsent = await teacher.PostAsJsonAsync("/api/v1/teachers/me/intro-video/from-application",
            new { sampleId = seeded.SampleId, consent = false });
        Assert.Equal(HttpStatusCode.BadRequest, noConsent.StatusCode);
        Assert.Contains("intro_video_consent_required", await noConsent.Content.ReadAsStringAsync());

        var used = await teacher.PostAsJsonAsync("/api/v1/teachers/me/intro-video/from-application",
            new { sampleId = seeded.SampleId, consent = true });
        used.EnsureSuccessStatusCode();
        var intro = await used.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("application", intro.GetProperty("sourceCode").GetString());
        Assert.True(intro.GetProperty("isPublic").GetBoolean());
        Assert.NotEqual(JsonValueKind.Null, intro.GetProperty("consentedAt").ValueKind);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var consent = await db.TeacherVideoConsents.SingleAsync(x => x.TeacherId == seeded.TeacherId);
            Assert.Equal(seeded.SampleId, consent.SampleId);
            Assert.Equal(TeacherVideoConsent.ShowApplicationVideoStatement, consent.Statement);
            Assert.Null(consent.WithdrawnAt);
        }

        profile = await visitor.GetFromJsonAsync<JsonElement>($"/api/v1/teachers/{seeded.TeacherId}");
        var contentUrl = profile.GetProperty("introVideo").GetProperty("contentUrl").GetString()!;
        var played = await visitor.GetAsync(contentUrl);
        Assert.Equal(HttpStatusCode.OK, played.StatusCode);
        Assert.Empty(profile.GetProperty("samples").EnumerateArray());

        var hidden = await SendAsync(teacher, HttpMethod.Put, "/api/v1/teachers/me/intro-video/visibility",
            new { visible = false }, intro.GetProperty("version").GetString()!);
        hidden.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(contentUrl)).StatusCode);
        profile = await visitor.GetFromJsonAsync<JsonElement>($"/api/v1/teachers/{seeded.TeacherId}");
        Assert.Equal(JsonValueKind.Null, profile.GetProperty("introVideo").ValueKind);
        // The teacher still previews it.
        Assert.Equal(HttpStatusCode.OK, (await teacher.GetAsync(contentUrl)).StatusCode);

        // Hiding withdrew the consent, so showing it again needs a new one.
        var reshow = await SendAsync(teacher, HttpMethod.Put, "/api/v1/teachers/me/intro-video/visibility",
            new { visible = true }, (await hidden.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("version").GetString()!);
        Assert.Equal(HttpStatusCode.BadRequest, reshow.StatusCode);
        Assert.Contains("intro_video_consent_required", await reshow.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_teacher_uploads_previews_shows_replaces_and_removes_their_own_intro()
    {
        var seeded = await SeedAsync();
        using var teacher = await ClientForAsync(seeded.Email);
        using var visitor = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });

        var infected = await UploadAsync(teacher, ValidMp4().Concat(Encoding.ASCII.GetBytes(
            @"X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")).ToArray(), null);
        Assert.Equal(HttpStatusCode.BadRequest, infected.StatusCode);
        Assert.Contains("file_rejected_malware", await infected.Content.ReadAsStringAsync());

        var uploaded = await UploadAsync(teacher, ValidMp4(), null);
        uploaded.EnsureSuccessStatusCode();
        var intro = await uploaded.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("upload", intro.GetProperty("sourceCode").GetString());
        Assert.False(intro.GetProperty("isPublic").GetBoolean());
        var contentUrl = $"/api/v1/teachers/{seeded.TeacherId}/intro-video/content";
        Assert.Equal(HttpStatusCode.OK, (await teacher.GetAsync(contentUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(contentUrl)).StatusCode);

        // Replacing an existing intro needs the version the teacher saw.
        var stale = await UploadAsync(teacher, ValidMp4(), null);
        Assert.Equal(HttpStatusCode.BadRequest, stale.StatusCode);

        var shown = await SendAsync(teacher, HttpMethod.Put, "/api/v1/teachers/me/intro-video/visibility",
            new { visible = true }, intro.GetProperty("version").GetString()!);
        shown.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await visitor.GetAsync(contentUrl)).StatusCode);

        var replaced = await UploadAsync(teacher, ValidMp4(), (await shown.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("version").GetString());
        replaced.EnsureSuccessStatusCode();
        var afterReplace = await replaced.Content.ReadFromJsonAsync<JsonElement>();
        // A new video starts hidden until the teacher has watched it and chooses to show it.
        Assert.False(afterReplace.GetProperty("isPublic").GetBoolean());

        var removed = await SendAsync(teacher, HttpMethod.Delete, "/api/v1/teachers/me/intro-video", null,
            afterReplace.GetProperty("version").GetString()!);
        removed.EnsureSuccessStatusCode();
        Assert.False((await removed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("hasVideo").GetBoolean());
        Assert.Equal(HttpStatusCode.NotFound, (await teacher.GetAsync(contentUrl)).StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.True(await db.AuditLogEntries.AnyAsync(x => x.Action == "IntroVideoRemoved" && x.ActorId == seeded.TeacherId));
    }

    [Fact]
    public async Task A_reused_application_video_leaves_the_profile_when_its_qualification_is_revoked()
    {
        var seeded = await SeedAsync();
        using var teacher = await ClientForAsync(seeded.Email);
        using var visitor = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        (await teacher.PostAsJsonAsync("/api/v1/teachers/me/intro-video/from-application",
            new { sampleId = seeded.SampleId, consent = true })).EnsureSuccessStatusCode();
        var contentUrl = $"/api/v1/teachers/{seeded.TeacherId}/intro-video/content";
        Assert.Equal(HttpStatusCode.OK, (await visitor.GetAsync(contentUrl)).StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var qualification = await db.TeacherSubjectQualifications.SingleAsync(x => x.TeacherId == seeded.TeacherId);
            qualification.Revoke(seeded.QualityId, "Qualification withdrawn for the intro test.", factory.Clock.GetUtcNow());
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(contentUrl)).StatusCode);
    }

    private async Task<Seeded> SeedAsync()
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var quality = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var storage = scope.ServiceProvider.GetRequiredService<IFileStorageService>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject($"Intro Subject {suffix}", "intro");
        var assignment = new QualificationTopic(subject.Id, $"Intro Assignment {suffix}", "Explain clearly.", 180);
        var serviceType = new ServiceCatalogItem(
            $"Intro Service {suffix}", "A safe recorded explanation.", $"intro_{suffix}", "خدمة تعريف", "شرح مسجل آمن.");
        var now = factory.Clock.GetUtcNow();
        var profile = new TeacherProfile(teacher.Id, now);
        profile.Update("Intro teacher", "A complete public teacher profile for intro video validation.",
            "Egypt", "Cairo", "Egypt Standard Time", 30, now);
        profile.Publish(TeacherProfileReadiness.Ready, now);
        var qualification = new TeacherSubjectQualification(teacher.Id, subject.Id, now);
        var stored = await storage.StorePrivateVideoAsync(new MemoryStream(ValidMp4()), "qual.mp4", "video/mp4", ValidMp4().Length, default);
        var sample = TeacherTeachingSample.FromQualificationDemo(
            teacher.Id, subject.Id, "Application video", stored.StorageKey, 120,
            Guid.NewGuid(), Guid.NewGuid(), assignment.Id, quality.Id, now);
        sample.SetProfileVisibility(false, now);
        db.AddRange(subject, assignment, serviceType, profile, qualification, sample,
            new TeacherService(teacher.Id, subject.Id, serviceType.Id, "Recorded explanation",
                "A focused recorded explanation.", 100, "SAR", 24, 1, now));
        await db.SaveChangesAsync();
        return new(teacher.Id, teacher.Email, quality.Id, sample.Id);
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static async Task<HttpResponseMessage> UploadAsync(HttpClient client, byte[] bytes, string? version)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/teachers/me/intro-video")
        {
            Content = new MultipartFormDataContent { { file, "file", "intro.mp4" } }
        };
        if (version is not null) request.Headers.TryAddWithoutValidation("If-Match", version);
        return await client.SendAsync(request);
    }

    private static async Task<HttpResponseMessage> SendAsync(HttpClient client, HttpMethod method, string url, object? body, string version)
    {
        var request = new HttpRequestMessage(method, url);
        if (body is not null) request.Content = JsonContent.Create(body);
        request.Headers.TryAddWithoutValidation("If-Match", version);
        return await client.SendAsync(request);
    }

    private static byte[] ValidMp4() =>
        [0, 0, 0, 12, (byte)'f', (byte)'t', (byte)'y', (byte)'p', (byte)'i', (byte)'s', (byte)'o', (byte)'m'];

    private sealed record Seeded(string TeacherId, string Email, string QualityId, Guid SampleId);
}
