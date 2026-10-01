using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>
/// Upload first (Product Contract §7a): the file is scanned into the student's own draft before anything else is
/// asked, survives a refused publish, and moves onto the open request when it is published.
/// </summary>
[Trait("Category", "SqlServer")]
public sealed class OpenRequestDraftTests(SqlServerTafseelApiFactory factory) : IClassFixture<SqlServerTafseelApiFactory>
{
    private const string Eicar = @"X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

    [Fact]
    public async Task A_clean_file_uploaded_first_survives_a_refused_publish_and_moves_onto_the_published_request()
    {
        var (subjectId, catalogId) = await CatalogAsync();
        var studentUser = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var student = await ClientAsync(studentUser.Email);

        Assert.Equal(HttpStatusCode.NoContent, (await student.GetAsync("/api/v1/open-marketplace/drafts/current")).StatusCode);

        var uploaded = await UploadAsync(student, Pdf("chapter four"), "chapter-4.pdf");
        Assert.Equal(HttpStatusCode.OK, uploaded.StatusCode);
        var draft = await uploaded.Content.ReadFromJsonAsync<JsonElement>();
        var draftId = draft.GetProperty("id").GetGuid();
        Assert.Equal("chapter-4.pdf", Assert.Single(draft.GetProperty("attachments").EnumerateArray()).GetProperty("originalName").GetString());

        // The same file twice is refused; the draft still holds one.
        var duplicate = await UploadAsync(student, Pdf("chapter four"), "chapter-4.pdf");
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        Assert.Equal("draft_attachment_duplicate", await CodeAsync(duplicate));

        // What is typed is kept: a refresh reads it back with the file.
        (await student.PutAsJsonAsync("/api/v1/open-marketplace/drafts/current",
            new
            {
                subjectId,
                serviceCatalogItemId = catalogId,
                title = "Explain chapter four",
                requirements = (string?)null,
                deadline = (DateTimeOffset?)null,
                budgetMin = (decimal?)null,
                budgetMax = (decimal?)null
            })).EnsureSuccessStatusCode();
        var reread = await student.GetFromJsonAsync<JsonElement>("/api/v1/open-marketplace/drafts/current");
        Assert.Equal("Explain chapter four", reread.GetProperty("title").GetString());
        Assert.Single(reread.GetProperty("attachments").EnumerateArray());

        // A publish the rules refuse (deadline in the past) changes nothing: the clean file is still attached.
        var refused = await student.PostAsJsonAsync("/api/v1/open-marketplace/requests", Publish(subjectId, catalogId, draftId,
            factory.Clock.GetUtcNow().AddDays(-1)));
        Assert.False(refused.IsSuccessStatusCode);
        Assert.Single((await student.GetFromJsonAsync<JsonElement>("/api/v1/open-marketplace/drafts/current"))
            .GetProperty("attachments").EnumerateArray());

        var published = await student.PostAsJsonAsync("/api/v1/open-marketplace/requests",
            Publish(subjectId, catalogId, draftId, factory.Clock.GetUtcNow().AddDays(3)));
        Assert.Equal(HttpStatusCode.Created, published.StatusCode);
        var request = await published.Content.ReadFromJsonAsync<JsonElement>();
        var attachment = Assert.Single(request.GetProperty("attachments").EnumerateArray());
        Assert.Equal("chapter-4.pdf", attachment.GetProperty("originalName").GetString());

        // The draft is gone, and the file is now the request's: the student can open it.
        Assert.Equal(HttpStatusCode.NoContent, (await student.GetAsync("/api/v1/open-marketplace/drafts/current")).StatusCode);
        var content = await student.GetAsync($"/api/v1/learning-requests/attachments/{attachment.GetProperty("id").GetGuid()}/content");
        Assert.Equal(HttpStatusCode.OK, content.StatusCode);
        Assert.StartsWith("%PDF", Encoding.ASCII.GetString(await content.Content.ReadAsByteArrayAsync()));
        await using var scope = factory.Services.CreateAsyncScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().OpenRequestDrafts.AnyAsync(x => x.Id == draftId));
    }

    [Fact]
    public async Task An_infected_or_unsupported_file_never_joins_the_draft()
    {
        var studentUser = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var student = await ClientAsync(studentUser.Email);

        var infected = await UploadAsync(student, Encoding.ASCII.GetBytes("%PDF-1.4\n" + Eicar), "homework.pdf");
        Assert.Equal(HttpStatusCode.BadRequest, infected.StatusCode);
        Assert.Equal("file_rejected_malware", await CodeAsync(infected));

        var executable = await UploadAsync(student, Encoding.ASCII.GetBytes("MZ not a document"), "setup.exe", "application/octet-stream");
        Assert.False(executable.IsSuccessStatusCode);

        var draft = await student.GetAsync("/api/v1/open-marketplace/drafts/current");
        if (draft.StatusCode == HttpStatusCode.OK)
            Assert.Empty((await draft.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("attachments").EnumerateArray());
        else
            Assert.Equal(HttpStatusCode.NoContent, draft.StatusCode);
    }

    [Fact]
    public async Task A_draft_belongs_to_its_student_only()
    {
        var (subjectId, catalogId) = await CatalogAsync();
        var owner = await ClientAsync((await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student)).Email);
        var other = await ClientAsync((await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student)).Email);
        var teacher = await ClientAsync((await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher)).Email);

        var draft = await (await UploadAsync(owner, Pdf("private notes"), "notes.pdf")).Content.ReadFromJsonAsync<JsonElement>();
        var draftId = draft.GetProperty("id").GetGuid();
        var attachmentId = Assert.Single(draft.GetProperty("attachments").EnumerateArray()).GetProperty("id").GetGuid();

        // Another student neither sees it, nor removes its file, nor publishes with it.
        Assert.Equal(HttpStatusCode.NoContent, (await other.GetAsync("/api/v1/open-marketplace/drafts/current")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await other.DeleteAsync($"/api/v1/open-marketplace/drafts/current/attachments/{attachmentId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync("/api/v1/open-marketplace/requests",
            Publish(subjectId, catalogId, draftId, factory.Clock.GetUtcNow().AddDays(2)))).StatusCode);
        // A teacher has no draft endpoints at all.
        Assert.Equal(HttpStatusCode.Forbidden, (await teacher.GetAsync("/api/v1/open-marketplace/drafts/current")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await UploadAsync(teacher, Pdf("x"), "x.pdf")).StatusCode);

        // The owner still has the file, and can remove it.
        var removed = await owner.DeleteAsync($"/api/v1/open-marketplace/drafts/current/attachments/{attachmentId}");
        removed.EnsureSuccessStatusCode();
        Assert.Empty((await removed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("attachments").EnumerateArray());
    }

    private static object Publish(Guid subjectId, Guid catalogId, Guid draftId, DateTimeOffset deadline) => new
    {
        subjectId,
        serviceCatalogItemId = catalogId,
        title = "Explain chapter four",
        requirements = "Explain every exercise in the attached chapter.",
        deadline,
        budgetMin = (decimal?)null,
        budgetMax = (decimal?)null,
        draftId
    };

    private static byte[] Pdf(string text) => Encoding.ASCII.GetBytes("%PDF-1.4\n" + text);

    private static async Task<HttpResponseMessage> UploadAsync(
        HttpClient client, byte[] bytes, string name, string contentType = "application/pdf")
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "file", name);
        return await client.PostAsync("/api/v1/open-marketplace/drafts/current/attachments", form);
    }

    private static async Task<string?> CodeAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private async Task<(Guid SubjectId, Guid CatalogId)> CatalogAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Draft Subject " + suffix, "book", "مادة المسودة");
        var catalog = new ServiceCatalogItem("Draft Explanation " + suffix, "Async explanation",
            "draft_" + suffix, "شرح المسودة", "شرح غير متزامن");
        db.AddRange(subject, catalog);
        await db.SaveChangesAsync();
        return (subject.Id, catalog.Id);
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }
}
