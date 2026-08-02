using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
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

[Trait("Category", "SqlServer")]
public sealed class TeacherProfileVideoCurationTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Teacher_can_hide_and_show_approved_qualification_sample_on_profile()
    {
        var seeded = await SeedPublishedTeacherWithQualificationSampleAsync();
        using var teacher = await ClientForAsync(seeded.Email);

        var videos = await teacher.GetFromJsonAsync<JsonElement>("/api/v1/teachers/me/profile-videos");
        var video = Assert.Single(videos.EnumerateArray(), x =>
            x.GetProperty("sourceCode").GetString() == "qualification_sample");
        Assert.True(video.GetProperty("isCurationEligible").GetBoolean());
        Assert.True(video.GetProperty("isProfileVisible").GetBoolean());

        var hide = new HttpRequestMessage(
            HttpMethod.Put, $"/api/v1/teachers/me/profile-videos/{video.GetProperty("id").GetGuid()}/visibility")
        {
            Content = JsonContent.Create(new { visible = false })
        };
        hide.Headers.TryAddWithoutValidation("If-Match", video.GetProperty("version").GetString());
        Assert.Equal(HttpStatusCode.OK, (await teacher.SendAsync(hide)).StatusCode);

        var publicAfterHide = await factory.CreateClient()
            .GetFromJsonAsync<JsonElement>($"/api/v1/teachers/{seeded.TeacherId}");
        Assert.Empty(publicAfterHide.GetProperty("samples").EnumerateArray());

        var hidden = await teacher.GetFromJsonAsync<JsonElement>("/api/v1/teachers/me/profile-videos");
        var hiddenVideo = Assert.Single(hidden.EnumerateArray());
        var show = new HttpRequestMessage(
            HttpMethod.Put, $"/api/v1/teachers/me/profile-videos/{hiddenVideo.GetProperty("id").GetGuid()}/visibility")
        {
            Content = JsonContent.Create(new { visible = true })
        };
        show.Headers.TryAddWithoutValidation("If-Match", hiddenVideo.GetProperty("version").GetString());
        Assert.Equal(HttpStatusCode.OK, (await teacher.SendAsync(show)).StatusCode);

        var publicAfterShow = await factory.CreateClient()
            .GetFromJsonAsync<JsonElement>($"/api/v1/teachers/{seeded.TeacherId}");
        Assert.Single(publicAfterShow.GetProperty("samples").EnumerateArray());
    }

    [Fact]
    public async Task Rejected_showcase_cannot_be_selected_for_profile()
    {
        var seeded = await SeedPublishedTeacherWithQualificationSampleAsync();
        using var teacher = await ClientForAsync(seeded.Email);
        var draft = await teacher.PostAsJsonAsync("/api/v1/teachers/me/showcases", new
        {
            subjectId = seeded.SubjectId,
            topicId = seeded.TopicId,
            title = "Rejected showcase",
            description = "Will be rejected"
        });
        draft.EnsureSuccessStatusCode();
        var body = await draft.Content.ReadFromJsonAsync<JsonElement>();
        var id = body.GetProperty("id").GetGuid();
        var version = body.GetProperty("version").GetString()!;

        using var upload = new MultipartFormDataContent();
        var file = new ByteArrayContent(ValidMp4());
        file.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
        upload.Add(file, "file", "showcase.mp4");
        var uploadRequest = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/teachers/me/showcases/{id}/video")
        { Content = upload };
        uploadRequest.Headers.TryAddWithoutValidation("If-Match", version);
        var uploaded = await teacher.SendAsync(uploadRequest);
        uploaded.EnsureSuccessStatusCode();
        var uploadedBody = await uploaded.Content.ReadFromJsonAsync<JsonElement>();
        version = uploadedBody.GetProperty("version").GetString()!;
        var versionId = uploadedBody.GetProperty("currentVersion").GetProperty("id").GetGuid();

        var submit = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/teachers/me/showcases/{id}/submit");
        submit.Headers.TryAddWithoutValidation("If-Match", version);
        Assert.Equal(HttpStatusCode.NoContent, (await teacher.SendAsync(submit)).StatusCode);

        using var quality = await ClientForAsync(seeded.QualityEmail);
        var queue = await quality.GetFromJsonAsync<JsonElement>("/api/v1/teachers/showcase-moderation?pageSize=50");
        var item = queue.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("sampleId").GetGuid() == id);
        var start = new HttpRequestMessage(
            HttpMethod.Post, $"/api/v1/teachers/showcase-moderation/{id}/versions/{versionId}/start-review");
        start.Headers.TryAddWithoutValidation("If-Match", item.GetProperty("version").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await quality.SendAsync(start)).StatusCode);
        queue = await quality.GetFromJsonAsync<JsonElement>(
            $"/api/v1/teachers/showcase-moderation?status={(int)ShowcaseModerationStatus.UnderReview}&pageSize=50");
        item = queue.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("sampleId").GetGuid() == id);
        var decision = new HttpRequestMessage(
            HttpMethod.Post, $"/api/v1/teachers/showcase-moderation/{id}/versions/{versionId}/decision")
        {
            Content = JsonContent.Create(new
            {
                decision = ShowcaseDecision.Reject,
                reasonCode = "unrelated_to_subject",
                teacherVisibleNote = "Not related to the subject.",
                internalNote = "Reject"
            })
        };
        decision.Headers.TryAddWithoutValidation("If-Match", item.GetProperty("version").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await quality.SendAsync(decision)).StatusCode);

        var videos = await teacher.GetFromJsonAsync<JsonElement>("/api/v1/teachers/me/profile-videos");
        var rejected = videos.EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id);
        Assert.False(rejected.GetProperty("isCurationEligible").GetBoolean());
        var attempt = new HttpRequestMessage(
            HttpMethod.Put, $"/api/v1/teachers/me/profile-videos/{id}/visibility")
        {
            Content = JsonContent.Create(new { visible = true })
        };
        attempt.Headers.TryAddWithoutValidation("If-Match", rejected.GetProperty("version").GetString());
        var response = await teacher.SendAsync(attempt);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("profile_video_not_eligible", await CodeAsync(response));
    }

    [Fact]
    public async Task Teacher_cannot_curate_another_teachers_video()
    {
        var seeded = await SeedPublishedTeacherWithQualificationSampleAsync();
        var other = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        using var otherClient = await ClientForAsync(other.Email);
        var attempt = new HttpRequestMessage(
            HttpMethod.Put, $"/api/v1/teachers/me/profile-videos/{seeded.SampleId}/visibility")
        {
            Content = JsonContent.Create(new { visible = false })
        };
        attempt.Headers.TryAddWithoutValidation("If-Match", "AAAAAAA=");
        var response = await otherClient.SendAsync(attempt);
        Assert.True(response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.NotFound);
        var code = await CodeAsync(response);
        Assert.True(code is "sample_not_owned" or "sample_not_found" || code.Contains("sample", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Setting_featured_is_atomic_and_at_most_one()
    {
        var seeded = await SeedPublishedTeacherWithQualificationSampleAsync();
        Guid secondId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var storage = scope.ServiceProvider.GetRequiredService<IFileStorageService>();
            var stored = await storage.StorePrivateVideoAsync(
                new MemoryStream(ValidMp4()), "second.mp4", "video/mp4", ValidMp4().Length, default);
            var second = TeacherTeachingSample.FromQualificationDemo(
                seeded.TeacherId, seeded.SubjectId, "Second sample", stored.StorageKey, 90,
                Guid.NewGuid(), Guid.NewGuid(), seeded.TopicId, seeded.QualityId, factory.Clock.GetUtcNow());
            second.SetProfileDisplayOrder(1, factory.Clock.GetUtcNow());
            db.TeacherTeachingSamples.Add(second);
            secondId = second.Id;
            await db.SaveChangesAsync();
        }

        using var teacher = await ClientForAsync(seeded.Email);
        var videos = (await teacher.GetFromJsonAsync<JsonElement>("/api/v1/teachers/me/profile-videos"))
            .EnumerateArray().Where(x => x.GetProperty("isCurationEligible").GetBoolean()).ToArray();
        Assert.True(videos.Length >= 2);

        async Task FeatureAsync(Guid id)
        {
            var current = (await teacher.GetFromJsonAsync<JsonElement>("/api/v1/teachers/me/profile-videos"))
                .EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id);
            if (current.GetProperty("isProfileFeatured").GetBoolean())
                return;
            var request = new HttpRequestMessage(
                HttpMethod.Put, $"/api/v1/teachers/me/profile-videos/{id}/featured")
            {
                Content = JsonContent.Create(new { featured = true })
            };
            request.Headers.TryAddWithoutValidation("If-Match", current.GetProperty("version").GetString());
            var response = await teacher.SendAsync(request);
            Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        }

        await FeatureAsync(seeded.SampleId);
        await FeatureAsync(secondId);

        videos = (await teacher.GetFromJsonAsync<JsonElement>("/api/v1/teachers/me/profile-videos"))
            .EnumerateArray().ToArray();
        Assert.Equal(1, videos.Count(x => x.GetProperty("isProfileFeatured").GetBoolean()));
        Assert.True(videos.Single(x => x.GetProperty("id").GetGuid() == secondId)
            .GetProperty("isProfileFeatured").GetBoolean());
    }

    private async Task<Seeded> SeedPublishedTeacherWithQualificationSampleAsync()
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var quality = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var storage = scope.ServiceProvider.GetRequiredService<IFileStorageService>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject($"Curation Subject {suffix}", "curation");
        var topic = new Topic(subject.Id, $"Curation Topic {suffix}", "Intermediate");
        var assignment = new QualificationTopic(subject.Id, $"Curation Assignment {suffix}", "Explain clearly.", 180);
        var serviceType = new ServiceCatalogItem(
            $"Curation Service {suffix}", "A safe recorded explanation.", $"curation_{suffix}",
            "خدمة تنظيم", "شرح مسجل آمن.");
        var profile = new TeacherProfile(teacher.Id, factory.Clock.GetUtcNow());
        profile.Update(
            "Curation teacher", "A complete public teacher profile for curation validation.",
            "Egypt", "Cairo", "Egypt Standard Time", 30, factory.Clock.GetUtcNow());
        profile.Publish(factory.Clock.GetUtcNow());
        var qualification = new TeacherSubjectQualification(
            teacher.Id, subject.Id, factory.Clock.GetUtcNow());
        var stored = await storage.StorePrivateVideoAsync(
            new MemoryStream(ValidMp4()), "qual.mp4", "video/mp4", ValidMp4().Length, default);
        var sample = TeacherTeachingSample.FromQualificationDemo(
            teacher.Id, subject.Id, "Qualification sample", stored.StorageKey, 120,
            Guid.NewGuid(), Guid.NewGuid(), assignment.Id, quality.Id, factory.Clock.GetUtcNow());
        sample.SetProfileFeatured(true, factory.Clock.GetUtcNow());
        db.AddRange(
            subject, topic, assignment, serviceType, profile, qualification, sample,
            new TeacherService(
                teacher.Id, subject.Id, serviceType.Id, "Recorded explanation",
                "A focused recorded explanation.", 100, "SAR", 24, 1, factory.Clock.GetUtcNow()));
        await db.SaveChangesAsync();
        return new(teacher.Id, teacher.Email, quality.Id, quality.Email, subject.Id, topic.Id, sample.Id);
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static byte[] ValidMp4() =>
        [0, 0, 0, 12, (byte)'f', (byte)'t', (byte)'y', (byte)'p', (byte)'i', (byte)'s', (byte)'o', (byte)'m'];

    private static async Task<string> CodeAsync(HttpResponseMessage response)
    {
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        return json.TryGetProperty("code", out var code) ? code.GetString()! : json.GetRawText();
    }

    private sealed record Seeded(
        string TeacherId, string Email, string QualityId, string QualityEmail,
        Guid SubjectId, Guid TopicId, Guid SampleId);
}
