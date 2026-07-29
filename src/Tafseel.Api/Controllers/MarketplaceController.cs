using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tafseel.Application.Authorization;
using Tafseel.Application.Marketplace;

namespace Tafseel.Api.Controllers;

[ApiController]
[Route("api/v1/teachers")]
public sealed class MarketplaceController(IMarketplaceService marketplace) : ControllerBase
{
    [AllowAnonymous, HttpGet]
    public Task<Application.Common.PagedResult<TeacherCardDto>> Search(
        [FromQuery] TeacherSearch query, CancellationToken ct) => marketplace.SearchAsync(query, ct);

    [AllowAnonymous, HttpGet("compare")]
    public Task<TeacherComparisonResultDto> Compare(
        [FromQuery] string[] ids, CancellationToken ct) =>
        marketplace.CompareAsync(ids, ct);

    [AllowAnonymous, HttpGet("{teacherId}")]
    public Task<TeacherProfileDto> Profile(string teacherId, CancellationToken ct) =>
        marketplace.GetPublicProfileAsync(teacherId, ct);

    [AllowAnonymous, HttpGet("samples/{id:guid}/content")]
    public async Task<IActionResult> Sample(Guid id, CancellationToken ct)
    {
        var file = await marketplace.OpenSampleAsync(User.FindFirstValue("sub"), id, ct);
        return File(file.Content, file.ContentType, enableRangeProcessing: true);
    }

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpGet("me")]
    public Task<TeacherProfileDto> Mine(CancellationToken ct) =>
        marketplace.GetOwnProfileAsync(UserId(), ct);

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpPut("me")]
    public async Task<IActionResult> UpdateProfile(UpdateTeacherProfile input, CancellationToken ct)
    {
        await marketplace.UpdateProfileAsync(UserId(), input, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpPut("me/publication")]
    public async Task<IActionResult> PublishProfile(PublicationRequest input, CancellationToken ct)
    {
        await marketplace.SetProfilePublishedAsync(UserId(), input.Published, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpGet("me/eligible-subjects")]
    public Task<IReadOnlyCollection<NamedItemDto>> EligibleSubjects(CancellationToken ct) =>
        marketplace.GetEligibleSubjectsAsync(UserId(), ct);

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpPut("me/topics")]
    public async Task<IActionResult> SetTopics(IdList input, CancellationToken ct)
    {
        await marketplace.SetTopicsAsync(UserId(), input.Ids, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpPut("me/languages")]
    public async Task<IActionResult> SetLanguages(IdList input, CancellationToken ct)
    {
        await marketplace.SetLanguagesAsync(UserId(), input.Ids, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpGet("me/languages")]
    public Task<IReadOnlyCollection<NamedItemDto>> GetLanguages(CancellationToken ct) =>
        marketplace.GetLanguagesAsync(UserId(), ct);

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpPut("me/education-levels")]
    public async Task<IActionResult> SetEducationLevels(IdList input, CancellationToken ct)
    {
        await marketplace.SetEducationLevelsAsync(UserId(), input.Ids, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersManageOwnServices), HttpPost("me/services")]
    public async Task<IActionResult> AddService(TeacherServiceInput input, CancellationToken ct)
    {
        var service = await marketplace.AddServiceAsync(UserId(), input, ct);
        return Created($"/api/v1/teachers/me/services/{service.Id}", service);
    }

    [Authorize(Policy = Permissions.TeachersManageOwnServices), HttpPut("me/services/{id:guid}")]
    public async Task<IActionResult> UpdateService(
        Guid id, TeacherServiceInput input, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await marketplace.UpdateServiceAsync(UserId(), id, input, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersManageOwnServices), HttpPut("me/services/{id:guid}/active")]
    public async Task<IActionResult> SetServiceActive(
        Guid id, ActiveRequest input, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await marketplace.SetServiceActiveAsync(UserId(), id, input.Active, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersManageOwnServices), EnableRateLimiting("upload")]
    [RequestSizeLimit(250 * 1024 * 1024), HttpPost("me/samples")]
    public async Task<IActionResult> AddSample(
        IFormFile file,
        [FromForm] Guid subjectId,
        [FromForm] Guid? topicId,
        [FromForm, Required, StringLength(200)] string title,
        [FromForm, Range(1, 3600)] int durationSeconds,
        CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        var sample = await marketplace.AddSampleAsync(
            UserId(), subjectId, topicId, title, stream, file.FileName, file.ContentType,
            file.Length, durationSeconds, ct);
        return Created($"/api/v1/teachers/samples/{sample.Id}/content", sample);
    }

    [Authorize(Policy = Permissions.TeachersManageOwnServices), HttpPut("me/samples/{id:guid}/publication")]
    public async Task<IActionResult> PublishSample(Guid id, PublicationRequest input, CancellationToken ct)
    {
        await marketplace.SetSamplePublishedAsync(UserId(), id, input.Published, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersManageOwnShowcases), HttpGet("me/showcases")]
    public Task<Application.Common.PagedResult<TeacherShowcaseDto>> MyShowcases(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        marketplace.GetShowcasesAsync(UserId(), page, pageSize, ct);

    [Authorize(Policy = Permissions.TeachersManageOwnShowcases), HttpGet("me/showcases/{id:guid}")]
    public Task<TeacherShowcaseDto> MyShowcase(Guid id, CancellationToken ct) =>
        marketplace.GetShowcaseAsync(UserId(), id, ct);

    [Authorize(Policy = Permissions.TeachersManageOwnShowcases), HttpPost("me/showcases")]
    public async Task<IActionResult> CreateShowcase(CreateShowcaseInput input, CancellationToken ct)
    {
        var showcase = await marketplace.CreateShowcaseAsync(UserId(), input, ct);
        return Created($"/api/v1/teachers/me/showcases/{showcase.Id}", showcase);
    }

    [Authorize(Policy = Permissions.TeachersManageOwnShowcases), HttpPut("me/showcases/{id:guid}")]
    public Task<TeacherShowcaseDto> UpdateShowcase(
        Guid id, UpdateShowcaseDraftInput input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct) =>
        marketplace.UpdateShowcaseDraftAsync(UserId(), id, input, version, ct);

    [Authorize(Policy = Permissions.TeachersManageOwnShowcases), EnableRateLimiting("upload")]
    [RequestSizeLimit(250 * 1024 * 1024), HttpPost("me/showcases/{id:guid}/video")]
    public async Task<TeacherShowcaseDto> UploadShowcaseVideo(
        Guid id, IFormFile file,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return await marketplace.UploadShowcaseVideoAsync(
            UserId(), id, stream, file.FileName, file.ContentType, file.Length, version, ct);
    }

    [Authorize(Policy = Permissions.TeachersManageOwnShowcases), HttpPost("me/showcases/{id:guid}/submit")]
    public async Task<IActionResult> SubmitShowcase(
        Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await marketplace.SubmitShowcaseAsync(UserId(), id, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersManageOwnShowcases), HttpPost("me/showcases/{id:guid}/versions")]
    public Task<TeacherShowcaseDto> CreateShowcaseVersion(
        Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct) =>
        marketplace.CreateShowcaseVersionAsync(UserId(), id, version, ct);

    [Authorize(Policy = Permissions.TeachersManageOwnShowcases), HttpPost("me/showcases/{id:guid}/archive")]
    public async Task<IActionResult> ArchiveShowcase(
        Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await marketplace.ArchiveShowcaseAsync(UserId(), id, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersManageOwnShowcases), HttpPut("me/showcases/order")]
    public async Task<IActionResult> ReorderShowcases(ShowcaseOrderInput input, CancellationToken ct)
    {
        await marketplace.ReorderShowcasesAsync(UserId(), input, ct);
        return NoContent();
    }

    [Authorize, HttpGet("me/showcases/{id:guid}/versions/{versionId:guid}/content")]
    public async Task<IActionResult> ShowcaseVersionContent(
        Guid id, Guid versionId, CancellationToken ct)
    {
        var canReview = User.HasClaim(Permissions.ClaimType, Permissions.TeachersReviewShowcases);
        var file = await marketplace.OpenShowcaseVersionAsync(UserId(), canReview, id, versionId, ct);
        return File(file.Content, file.ContentType, enableRangeProcessing: true);
    }

    [Authorize(Policy = Permissions.TeachersReviewShowcases), HttpGet("showcase-moderation")]
    public Task<Application.Common.PagedResult<ShowcaseQueueItemDto>> ShowcaseQueue(
        [FromQuery, EnumDataType(typeof(Tafseel.Domain.Marketplace.ShowcaseModerationStatus))]
        Tafseel.Domain.Marketplace.ShowcaseModerationStatus? status,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        marketplace.GetShowcaseQueueAsync(status, page, pageSize, ct);

    [Authorize(Policy = Permissions.TeachersReviewShowcases)]
    [HttpPost("showcase-moderation/{id:guid}/versions/{versionId:guid}/start-review")]
    public async Task<IActionResult> StartShowcaseReview(
        Guid id, Guid versionId,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await marketplace.StartShowcaseReviewAsync(UserId(), id, versionId, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersReviewShowcases)]
    [HttpPost("showcase-moderation/{id:guid}/versions/{versionId:guid}/decision")]
    public async Task<IActionResult> DecideShowcase(
        Guid id, Guid versionId, ShowcaseDecisionInput input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await marketplace.DecideShowcaseAsync(UserId(), id, versionId, input, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpPost("me/availability/rules")]
    public async Task<IActionResult> AddRule(AvailabilityRuleInput input, CancellationToken ct) =>
        Created("", await marketplace.AddAvailabilityRuleAsync(UserId(), input, ct));

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpDelete("me/availability/rules/{id:guid}")]
    public async Task<IActionResult> RemoveRule(Guid id, CancellationToken ct)
    {
        await marketplace.RemoveAvailabilityRuleAsync(UserId(), id, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpPost("me/availability/exceptions")]
    public async Task<IActionResult> AddException(AvailabilityExceptionInput input, CancellationToken ct) =>
        Created("", await marketplace.AddAvailabilityExceptionAsync(UserId(), input, ct));

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpDelete("me/availability/exceptions/{id:guid}")]
    public async Task<IActionResult> RemoveException(Guid id, CancellationToken ct)
    {
        await marketplace.RemoveAvailabilityExceptionAsync(UserId(), id, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpPost("me/{kind:regex(^certifications|experience$)}")]
    public async Task<IActionResult> AddCredential(string kind, CredentialInput input, CancellationToken ct) =>
        Created("", await marketplace.AddCredentialAsync(UserId(), kind == "certifications", input, ct));

    [Authorize(Policy = Permissions.TeachersManageOwnProfile), HttpDelete("me/{kind:regex(^certifications|experience$)}/{id:guid}")]
    public async Task<IActionResult> RemoveCredential(string kind, Guid id, CancellationToken ct)
    {
        await marketplace.RemoveCredentialAsync(UserId(), kind == "certifications", id, ct);
        return NoContent();
    }

    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}

[ApiController]
[Authorize(Roles = Roles.Student)]
[Route("api/v1/favorite-teachers")]
public sealed class FavoriteTeachersController(IMarketplaceService marketplace) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyCollection<TeacherCardDto>> Get(CancellationToken ct) =>
        marketplace.GetFavoritesAsync(UserId(), ct);

    [HttpPut("{teacherId}")]
    public async Task<IActionResult> Add(string teacherId, CancellationToken ct)
    {
        await marketplace.FavoriteAsync(UserId(), teacherId, ct);
        return NoContent();
    }

    [HttpDelete("{teacherId}")]
    public async Task<IActionResult> Remove(string teacherId, CancellationToken ct)
    {
        await marketplace.UnfavoriteAsync(UserId(), teacherId, ct);
        return NoContent();
    }

    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}

public sealed record PublicationRequest(bool Published);
public sealed record ActiveRequest(bool Active);
public sealed record IdList([param: MaxLength(100)] IReadOnlyCollection<Guid> Ids);
