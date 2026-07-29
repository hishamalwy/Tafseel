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
