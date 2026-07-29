using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Common;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Files;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class TeacherShowcaseMvpTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Draft_submit_quality_approval_public_trust_and_archive_flow()
    {
        var seeded = await SeedTeacherAsync();
        using var teacher = await ClientForAsync(seeded.Teacher.Email);
        var draft = await CreateDraftAsync(teacher, seeded);
        var uploaded = await UploadAsync(
            teacher, draft.GetProperty("id").GetGuid(), Version(draft), "showcase.mp4", "video/mp4", ValidMp4());

        var id = uploaded.GetProperty("id").GetGuid();
        var versionId = uploaded.GetProperty("currentVersion").GetProperty("id").GetGuid();
        await SubmitAsync(teacher, id, Version(uploaded));

        var submitted = await teacher.GetFromJsonAsync<JsonElement>($"/api/v1/teachers/me/showcases/{id}");
        Assert.Equal((int)ShowcaseModerationStatus.Submitted, submitted.GetProperty("status").GetInt32());
        var immutable = await UpdateDraftAsync(teacher, id, Version(submitted), seeded, "Changed after submit");
        Assert.Equal(HttpStatusCode.BadRequest, immutable.StatusCode);
        Assert.Equal("draft_required", await CodeAsync(immutable));

        using var quality = await ClientForAsync(seeded.Quality.Email);
        var queue = await quality.GetFromJsonAsync<JsonElement>("/api/v1/teachers/showcase-moderation?pageSize=20");
        var item = queue.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("sampleId").GetGuid() == id);
        Assert.DoesNotContain("storageKey", item.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("internalNote", item.GetRawText(), StringComparison.OrdinalIgnoreCase);

        var start = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/teachers/showcase-moderation/{id}/versions/{versionId}/start-review");
        start.Headers.TryAddWithoutValidation("If-Match", item.GetProperty("version").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await quality.SendAsync(start)).StatusCode);

        queue = await quality.GetFromJsonAsync<JsonElement>(
            $"/api/v1/teachers/showcase-moderation?status={(int)ShowcaseModerationStatus.UnderReview}&pageSize=20");
        item = queue.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("sampleId").GetGuid() == id);
        var decision = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/teachers/showcase-moderation/{id}/versions/{versionId}/decision")
        {
            Content = JsonContent.Create(new
            {
                decision = ShowcaseDecision.Approve,
                reasonCode = (string?)null,
                teacherVisibleNote = "Approved for the public Showcase.",
                internalNote = "Internal moderation note."
            })
        };
        decision.Headers.TryAddWithoutValidation("If-Match", item.GetProperty("version").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await quality.SendAsync(decision)).StatusCode);

        var profile = await factory.CreateClient()
            .GetFromJsonAsync<JsonElement>($"/api/v1/teachers/{seeded.Teacher.Id}");
        var publicSample = Assert.Single(profile.GetProperty("samples").EnumerateArray());
        Assert.Equal("reviewed_showcase", publicSample.GetProperty("sourceCode").GetString());
        Assert.Equal("reviewed_showcase", publicSample.GetProperty("trustCode").GetString());
        Assert.DoesNotContain("internal", publicSample.GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.Equal(HttpStatusCode.OK,
            (await factory.CreateClient().GetAsync($"/api/v1/teachers/samples/{id}/content")).StatusCode);

        var approved = await teacher.GetFromJsonAsync<JsonElement>($"/api/v1/teachers/me/showcases/{id}");
        var archive = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/teachers/me/showcases/{id}/archive");
        archive.Headers.TryAddWithoutValidation("If-Match", Version(approved));
        Assert.Equal(HttpStatusCode.NoContent, (await teacher.SendAsync(archive)).StatusCode);
        profile = await factory.CreateClient()
            .GetFromJsonAsync<JsonElement>($"/api/v1/teachers/{seeded.Teacher.Id}");
        Assert.Empty(profile.GetProperty("samples").EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound,
            (await factory.CreateClient().GetAsync($"/api/v1/teachers/samples/{id}/content")).StatusCode);
    }

    [Fact]
    public async Task Private_media_role_boundaries_changes_request_and_new_version_are_enforced()
    {
        var seeded = await SeedTeacherAsync();
        var other = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        using var teacher = await ClientForAsync(seeded.Teacher.Email);
        using var otherTeacher = await ClientForAsync(other.Email);
        using var studentClient = await ClientForAsync(student.Email);
        var draft = await CreateDraftAsync(teacher, seeded);
        var uploaded = await UploadAsync(
            teacher, draft.GetProperty("id").GetGuid(), Version(draft), "safe.mp4", "video/mp4", ValidMp4());
        var id = uploaded.GetProperty("id").GetGuid();
        var versionId = uploaded.GetProperty("currentVersion").GetProperty("id").GetGuid();
        var privatePath = $"/api/v1/teachers/me/showcases/{id}/versions/{versionId}/content";

        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync(privatePath)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await otherTeacher.GetAsync(privatePath)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await otherTeacher.GetAsync($"/api/v1/teachers/me/showcases/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await studentClient.GetAsync("/api/v1/teachers/showcase-moderation")).StatusCode);

        await SubmitAsync(teacher, id, Version(uploaded));
        Assert.Equal(HttpStatusCode.NotFound,
            (await factory.CreateClient().GetAsync($"/api/v1/teachers/samples/{id}/content")).StatusCode);
        using var quality = await ClientForAsync(seeded.Quality.Email);
        using (var forbiddenUpload = new MultipartFormDataContent())
        {
            var qualityFile = new ByteArrayContent(ValidMp4());
            qualityFile.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
            forbiddenUpload.Add(qualityFile, "file", "quality.mp4");
            Assert.Equal(HttpStatusCode.Forbidden,
                (await quality.PostAsync($"/api/v1/teachers/me/showcases/{id}/video", forbiddenUpload)).StatusCode);
        }
        var item = await QueueItemAsync(quality, id, null);
        var start = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/teachers/showcase-moderation/{id}/versions/{versionId}/start-review");
        start.Headers.TryAddWithoutValidation("If-Match", item.GetProperty("version").GetString());
        (await quality.SendAsync(start)).EnsureSuccessStatusCode();
        item = await QueueItemAsync(quality, id, ShowcaseModerationStatus.UnderReview);
        var change = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/teachers/showcase-moderation/{id}/versions/{versionId}/decision")
        {
            Content = JsonContent.Create(new
            {
                decision = ShowcaseDecision.RequestChanges,
                reasonCode = "unrelated_to_subject",
                teacherVisibleNote = "Keep the explanation within the selected subject.",
                internalNote = "Not exposed to Teacher."
            })
        };
        change.Headers.TryAddWithoutValidation("If-Match", item.GetProperty("version").GetString());
        (await quality.SendAsync(change)).EnsureSuccessStatusCode();
        var duplicate = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/teachers/showcase-moderation/{id}/versions/{versionId}/decision")
        {
            Content = JsonContent.Create(new
            {
                decision = ShowcaseDecision.RequestChanges,
                reasonCode = "unrelated_to_subject",
                teacherVisibleNote = "Duplicate decision."
            })
        };
        duplicate.Headers.TryAddWithoutValidation("If-Match", item.GetProperty("version").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await quality.SendAsync(duplicate)).StatusCode);

        var changed = await teacher.GetFromJsonAsync<JsonElement>($"/api/v1/teachers/me/showcases/{id}");
        Assert.Equal("unrelated_to_subject",
            changed.GetProperty("currentVersion").GetProperty("decisionReasonCode").GetString());
        Assert.DoesNotContain("internalNote", changed.GetRawText(), StringComparison.OrdinalIgnoreCase);
        var nextRequest = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/teachers/me/showcases/{id}/versions");
        nextRequest.Headers.TryAddWithoutValidation("If-Match", Version(changed));
        var nextResponse = await teacher.SendAsync(nextRequest);
        nextResponse.EnsureSuccessStatusCode();
        var next = await nextResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, next.GetProperty("currentVersion").GetProperty("versionNumber").GetInt32());
        Assert.Equal(2, next.GetProperty("versions").GetArrayLength());

        var selfDecision = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/teachers/showcase-moderation/{id}/versions/{versionId}/decision")
        {
            Content = JsonContent.Create(new { decision = ShowcaseDecision.Approve })
        };
        selfDecision.Headers.TryAddWithoutValidation("If-Match", "");
        Assert.Equal(HttpStatusCode.Forbidden, (await teacher.SendAsync(selfDecision)).StatusCode);
    }

    [Fact]
    public async Task Upload_validation_rejects_wrong_extension_mime_signature_and_size()
    {
        var root = Path.Combine(Path.GetTempPath(), $"tafseel-showcase-storage-{Guid.NewGuid():N}");
        var storage = new LocalFileStorageService(Options.Create(new FileStorageOptions
        {
            RootPath = root,
            MaxDemoBytes = 16
        }));
        try
        {
            var extension = await Assert.ThrowsAsync<DomainException>(() => storage.StorePrivateVideoAsync(
                new MemoryStream(ValidMp4()), "video.mov", "video/mp4", 12, default));
            Assert.Equal("invalid_file_type", extension.Code);
            var mime = await Assert.ThrowsAsync<DomainException>(() => storage.StorePrivateVideoAsync(
                new MemoryStream(ValidMp4()), "video.mp4", "application/octet-stream", 12, default));
            Assert.Equal("invalid_file_type", mime.Code);
            var signature = await Assert.ThrowsAsync<DomainException>(() => storage.StorePrivateVideoAsync(
                new MemoryStream(new byte[12]), "video.mp4", "video/mp4", 12, default));
            Assert.Equal("invalid_file_signature", signature.Code);
            var size = await Assert.ThrowsAsync<DomainException>(() => storage.StorePrivateVideoAsync(
                new MemoryStream(ValidMp4()), "video.mp4", "video/mp4", 17, default));
            Assert.Equal("invalid_file_size", size.Code);
        }
        finally
        {
            if (Directory.Exists(root))
                Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task Draft_rejects_unqualified_subject_and_topic_from_another_subject()
    {
        var seeded = await SeedTeacherAsync();
        using var teacher = await ClientForAsync(seeded.Teacher.Email);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var otherSubject = new Subject($"Unqualified Showcase Subject {Guid.NewGuid():N}", "showcase");
        var otherTopic = new Topic(otherSubject.Id, "Wrong-subject Showcase Topic", "Intermediate");
        db.AddRange(otherSubject, otherTopic);
        await db.SaveChangesAsync();

        var unqualified = await teacher.PostAsJsonAsync("/api/v1/teachers/me/showcases", new
        {
            subjectId = otherSubject.Id,
            title = "Not allowed"
        });
        Assert.Equal(HttpStatusCode.BadRequest, unqualified.StatusCode);
        Assert.Equal("teacher_not_approved", await CodeAsync(unqualified));

        var wrongTopic = await teacher.PostAsJsonAsync("/api/v1/teachers/me/showcases", new
        {
            subjectId = seeded.SubjectId,
            topicId = otherTopic.Id,
            title = "Wrong topic"
        });
        Assert.Equal(HttpStatusCode.BadRequest, wrongTopic.StatusCode);
        Assert.Equal("invalid_topic", await CodeAsync(wrongTopic));
    }

    [Fact]
    public async Task Qualification_revocation_hides_an_approved_showcase_without_deleting_history()
    {
        var seeded = await SeedTeacherAsync();
        using var teacher = await ClientForAsync(seeded.Teacher.Email);
        var draft = await CreateDraftAsync(teacher, seeded);
        var uploaded = await UploadAsync(
            teacher, draft.GetProperty("id").GetGuid(), Version(draft), "revoked.mp4", "video/mp4", ValidMp4());
        var id = uploaded.GetProperty("id").GetGuid();
        var versionId = uploaded.GetProperty("currentVersion").GetProperty("id").GetGuid();
        await SubmitAsync(teacher, id, Version(uploaded));

        using var quality = await ClientForAsync(seeded.Quality.Email);
        var item = await QueueItemAsync(quality, id, null);
        var start = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/teachers/showcase-moderation/{id}/versions/{versionId}/start-review");
        start.Headers.TryAddWithoutValidation("If-Match", item.GetProperty("version").GetString());
        (await quality.SendAsync(start)).EnsureSuccessStatusCode();
        item = await QueueItemAsync(quality, id, ShowcaseModerationStatus.UnderReview);
        var approve = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/teachers/showcase-moderation/{id}/versions/{versionId}/decision")
        {
            Content = JsonContent.Create(new { decision = ShowcaseDecision.Approve })
        };
        approve.Headers.TryAddWithoutValidation("If-Match", item.GetProperty("version").GetString());
        (await quality.SendAsync(approve)).EnsureSuccessStatusCode();

        var revoke = await quality.PostAsJsonAsync(
            $"/api/v1/teacher-qualifications/{seeded.QualificationId}/revoke",
            new { reason = "Qualification no longer meets the subject standard." });
        revoke.EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NotFound,
            (await factory.CreateClient().GetAsync($"/api/v1/teachers/samples/{id}/content")).StatusCode);
        var retained = await teacher.GetFromJsonAsync<JsonElement>($"/api/v1/teachers/me/showcases/{id}");
        Assert.Equal((int)ShowcaseModerationStatus.Archived, retained.GetProperty("status").GetInt32());
        Assert.Equal(1, retained.GetProperty("versions").GetArrayLength());
    }

    private async Task<Seeded> SeedTeacherAsync()
    {
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var quality = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject($"Showcase Subject {suffix}", "showcase");
        var topic = new Topic(subject.Id, $"Showcase Topic {suffix}", "Intermediate");
        var serviceType = new ServiceCatalogItem(
            $"Showcase Service {suffix}", "A safe recorded explanation.", $"showcase_{suffix}",
            "خدمة عرض", "شرح مسجل آمن.");
        var profile = new TeacherProfile(teacher.Id, factory.Clock.GetUtcNow());
        profile.Update(
            "Showcase teacher", "A complete public teacher profile for Showcase validation.",
            "Egypt", "Cairo", "Egypt Standard Time", 30, factory.Clock.GetUtcNow());
        profile.Publish(factory.Clock.GetUtcNow());
        var qualification = new TeacherSubjectQualification(
            teacher.Id, subject.Id, factory.Clock.GetUtcNow());
        db.AddRange(
            subject,
            topic,
            serviceType,
            profile,
            qualification,
            new TeacherService(
                teacher.Id, subject.Id, serviceType.Id, "Recorded explanation",
                "A focused recorded explanation.", 100, "SAR", 24, 1, factory.Clock.GetUtcNow()));
        await db.SaveChangesAsync();
        return new(teacher, quality, subject.Id, topic.Id, qualification.Id);
    }

    private static async Task<JsonElement> CreateDraftAsync(HttpClient teacher, Seeded seeded)
    {
        var response = await teacher.PostAsJsonAsync("/api/v1/teachers/me/showcases", new
        {
            subjectId = seeded.SubjectId,
            topicId = seeded.TopicId,
            title = "Artificial intelligence fundamentals",
            description = "A short explanation of how machine learning models learn from examples."
        });
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static async Task<JsonElement> UploadAsync(
        HttpClient client, Guid id, string version, string fileName, string contentType, byte[] bytes)
    {
        using var multipart = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        multipart.Add(file, "file", fileName);
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/teachers/me/showcases/{id}/video")
        {
            Content = multipart
        };
        request.Headers.TryAddWithoutValidation("If-Match", version);
        var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static async Task SubmitAsync(HttpClient client, Guid id, string version)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/teachers/me/showcases/{id}/submit");
        request.Headers.TryAddWithoutValidation("If-Match", version);
        (await client.SendAsync(request)).EnsureSuccessStatusCode();
    }

    private static Task<HttpResponseMessage> UpdateDraftAsync(
        HttpClient client, Guid id, string version, Seeded seeded, string title)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/teachers/me/showcases/{id}")
        {
            Content = JsonContent.Create(new
            {
                subjectId = seeded.SubjectId,
                topicId = seeded.TopicId,
                title,
                description = "Attempted mutation."
            })
        };
        request.Headers.TryAddWithoutValidation("If-Match", version);
        return client.SendAsync(request);
    }

    private static async Task<JsonElement> QueueItemAsync(
        HttpClient quality, Guid id, ShowcaseModerationStatus? status)
    {
        var suffix = status.HasValue ? $"?status={(int)status.Value}&pageSize=20" : "?pageSize=20";
        var queue = await quality.GetFromJsonAsync<JsonElement>("/api/v1/teachers/showcase-moderation" + suffix);
        return queue.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("sampleId").GetGuid() == id);
    }

    private async Task<HttpClient> ClientForAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static string Version(JsonElement value) => value.GetProperty("version").GetString()!;
    private static byte[] ValidMp4() => [0, 0, 0, 0, (byte)'f', (byte)'t', (byte)'y', (byte)'p', 0, 0, 0, 0];
    private static async Task<string> CodeAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString()!;

    private sealed record Seeded(
        (string Id, string Email) Teacher,
        (string Id, string Email) Quality,
        Guid SubjectId,
        Guid TopicId,
        Guid QualificationId);
}
