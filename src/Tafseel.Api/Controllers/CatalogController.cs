using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Tafseel.Application.Authorization;
using Tafseel.Application.Catalog;

namespace Tafseel.Api.Controllers;

[ApiController]
[Route("api/v1")]
public sealed class CatalogController(ICatalogService catalog) : ControllerBase
{
    [AllowAnonymous, HttpGet("subjects")]
    public Task<IReadOnlyCollection<CatalogItemDto>> Subjects(CancellationToken ct) =>
        catalog.GetSubjectsAsync(false, ct);

    [HttpGet("topics")]
    public async Task<IActionResult> Topics(
        [FromQuery] Guid? subjectId,
        [FromQuery] bool qualificationOnly,
        CancellationToken ct)
    {
        var items = await catalog.GetTopicsAsync(subjectId, qualificationOnly, false, ct);
        if (qualificationOnly && User.Identity?.IsAuthenticated != true)
            items = items.Select(x => x with { Resources = null }).ToArray();
        return Ok(items);
    }

    [AllowAnonymous, HttpGet("education-levels")]
    public Task<IReadOnlyCollection<CatalogItemDto>> EducationLevels(CancellationToken ct) =>
        catalog.GetEducationLevelsAsync(false, ct);

    [AllowAnonymous, HttpGet("languages")]
    public Task<IReadOnlyCollection<CatalogItemDto>> Languages(CancellationToken ct) =>
        catalog.GetLanguagesAsync(false, ct);

    [AllowAnonymous, HttpGet("services")]
    public Task<IReadOnlyCollection<CatalogItemDto>> Services(CancellationToken ct) =>
        catalog.GetServicesAsync(false, ct);

    [Authorize(Policy = Permissions.SubjectsManage), HttpPost("admin/subjects")]
    public async Task<IActionResult> CreateSubject(SubjectInput input, CancellationToken ct) =>
        Created("", await catalog.CreateSubjectAsync(input, ct));

    [Authorize(Policy = Permissions.TopicsManage), HttpPost("admin/topics")]
    public async Task<IActionResult> CreateTopic(TopicInput input, CancellationToken ct) =>
        Created("", await catalog.CreateTopicAsync(input, ct));

    [Authorize(Policy = Permissions.TopicsManage), HttpPost("admin/qualification-topics")]
    public async Task<IActionResult> CreateQualificationTopic(QualificationTopicInput input, CancellationToken ct) =>
        Created("", await catalog.CreateQualificationTopicAsync(input, ct));

    [Authorize(Policy = Permissions.TopicsManage), HttpPost("admin/qualification-topics/{id:guid}/resources/link")]
    public async Task<IActionResult> AddQualificationLink(
        Guid id, QualificationLinkResourceInput input, CancellationToken ct) =>
        Created("", await catalog.AddLinkResourceAsync(id, input, ct));

    [Authorize(Policy = Permissions.TopicsManage), RequestSizeLimit(25 * 1024 * 1024)]
    [HttpPost("admin/qualification-topics/{id:guid}/resources/file")]
    public async Task<IActionResult> AddQualificationFile(
        Guid id, IFormFile file, [FromForm] string displayName,
        [FromForm] string? displayNameAr, [FromForm] int displayOrder,
        [FromForm] bool isRequired, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return Created("", await catalog.AddFileResourceAsync(
            id, stream, file.FileName, file.ContentType, file.Length,
            displayName, displayNameAr ?? "", displayOrder, isRequired, ct));
    }

    [Authorize, HttpGet("qualification-resources/{id:guid}/content")]
    public async Task<IActionResult> QualificationResource(Guid id, CancellationToken ct)
    {
        if (!User.IsInRole(Roles.Teacher)
            && !User.HasClaim(Permissions.ClaimType, Permissions.TeachersReviewApplications)
            && !User.HasClaim(Permissions.ClaimType, Permissions.TopicsManage))
            return Forbid();
        var file = await catalog.OpenResourceAsync(id, ct);
        return File(file.Content, file.ContentType, file.FileName, enableRangeProcessing: true);
    }

    [Authorize(Policy = Permissions.SubjectsManage), HttpPost("admin/education-levels")]
    public async Task<IActionResult> CreateEducationLevel(NamedCatalogInput input, CancellationToken ct) =>
        Created("", await catalog.CreateEducationLevelAsync(input, ct));

    [Authorize(Policy = Permissions.SubjectsManage), HttpPost("admin/languages")]
    public async Task<IActionResult> CreateLanguage(NamedCatalogInput input, CancellationToken ct) =>
        Created("", await catalog.CreateLanguageAsync(input, ct));

    [Authorize(Policy = Permissions.SubjectsManage), HttpPost("admin/services")]
    public async Task<IActionResult> CreateService(NamedCatalogInput input, CancellationToken ct) =>
        Created("", await catalog.CreateServiceAsync(input, ct));

    [Authorize(Policy = Permissions.SubjectsManage), HttpGet("admin/catalog/{type}")]
    public async Task<IActionResult> AdminList(string type, CancellationToken ct) =>
        type.ToLowerInvariant() switch
        {
            "subjects" => Ok(await catalog.GetSubjectsAsync(true, ct)),
            "topics" => Ok(await catalog.GetTopicsAsync(null, false, true, ct)),
            "qualification-topics" => Ok(await catalog.GetTopicsAsync(null, true, true, ct)),
            "education-levels" => Ok(await catalog.GetEducationLevelsAsync(true, ct)),
            "languages" => Ok(await catalog.GetLanguagesAsync(true, ct)),
            "services" => Ok(await catalog.GetServicesAsync(true, ct)),
            _ => BadRequest()
        };

    [Authorize(Policy = Permissions.SubjectsManage), HttpPut("admin/catalog/{type}/{id:guid}")]
    public async Task<IActionResult> Update(string type, Guid id, NamedCatalogInput input, CancellationToken ct)
    {
        await catalog.UpdateAsync(type, id, input, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.SubjectsManage), HttpPatch("admin/catalog/{type}/{id:guid}/active")]
    public async Task<IActionResult> SetActive(string type, Guid id, SetActiveRequest request, CancellationToken ct)
    {
        await catalog.SetActiveAsync(type, id, request.IsActive, ct);
        return NoContent();
    }
}

public sealed record SetActiveRequest(bool IsActive);
