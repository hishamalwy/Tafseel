using System.Security.Claims;
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tafseel.Application.Authorization;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.TeacherApplications;

namespace Tafseel.Api.Controllers;

[ApiController]
[Route("api/v1/teacher-applications")]
public sealed class TeacherApplicationsController(ITeacherApplicationService applications) : ControllerBase
{
    [Authorize(Policy = Permissions.TeachersApply), HttpPost]
    public async Task<IActionResult> Create(CreateTeacherApplication input, CancellationToken ct) =>
        Created("", await applications.CreateAsync(UserId(), input, ct));

    [Authorize(Policy = Permissions.TeachersApply), HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        CreateTeacherApplication input,
        [FromHeader(Name = "If-Match"), Required] string expectedVersion,
        CancellationToken ct)
    {
        await applications.UpdateAsync(UserId(), id, input, expectedVersion, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersApply), HttpGet("mine")]
    public Task<IReadOnlyCollection<TeacherApplicationDto>> Mine(CancellationToken ct) =>
        applications.GetMineAsync(UserId(), ct);

    [Authorize(Policy = Permissions.TeachersApply), HttpGet("~/api/v1/teachers/onboarding-status")]
    public Task<TeacherOnboardingStatusDto> OnboardingStatus(CancellationToken ct) =>
        applications.GetOnboardingStatusAsync(UserId(), ct);

    [Authorize, HttpGet("{id:guid}/demo/content")]
    public async Task<IActionResult> DemoContent(Guid id, CancellationToken ct)
    {
        var canReview = User.HasClaim(Permissions.ClaimType, Permissions.TeachersReviewApplications);
        var file = await applications.OpenDemoAsync(UserId(), id, canReview, ct);
        return File(file.Content, file.ContentType, file.FileName, enableRangeProcessing: true);
    }

    [Authorize(Policy = Permissions.TeachersApply), EnableRateLimiting("upload")]
    [RequestSizeLimit(250 * 1024 * 1024), HttpPost("{id:guid}/demo")]
    public async Task<IActionResult> UploadDemo(
        Guid id,
        IFormFile file,
        [FromForm, Range(1, 600)] int durationSeconds,
        [FromHeader(Name = "If-Match"), Required] string expectedVersion,
        CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return Ok(await applications.UploadDemoAsync(
            UserId(), id, stream, file.FileName, file.ContentType, file.Length, durationSeconds, expectedVersion, ct));
    }

    [Authorize(Policy = Permissions.TeachersApply), HttpPost("{id:guid}/submit")]
    public async Task<IActionResult> Submit(
        Guid id,
        [FromHeader(Name = "If-Match"), Required] string expectedVersion,
        CancellationToken ct)
    {
        await applications.SubmitAsync(UserId(), id, expectedVersion, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersApply), HttpPost("{id:guid}/withdraw")]
    public async Task<IActionResult> Withdraw(
        Guid id,
        [FromHeader(Name = "If-Match"), Required] string expectedVersion,
        CancellationToken ct)
    {
        await applications.WithdrawAsync(UserId(), id, expectedVersion, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersReviewApplications), HttpGet("queue")]
    public Task<IReadOnlyCollection<TeacherApplicationDto>> Queue(
        [FromQuery, EnumDataType(typeof(TeacherApplicationStatus))] TeacherApplicationStatus? status,
        CancellationToken ct) =>
        applications.GetQueueAsync(status, ct);

    [Authorize(Policy = Permissions.TeachersReviewApplications), HttpPost("{id:guid}/start-review")]
    public async Task<IActionResult> StartReview(
        Guid id,
        StartReviewRequest request,
        [FromHeader(Name = "If-Match"), Required] string expectedVersion,
        CancellationToken ct)
    {
        await applications.StartReviewAsync(UserId(), id, request.Priority, expectedVersion, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersReviewApplications), HttpPost("{id:guid}/decision")]
    public async Task<IActionResult> Decide(
        Guid id,
        DecideTeacherApplication input,
        [FromHeader(Name = "If-Match"), Required] string expectedVersion,
        CancellationToken ct)
    {
        await applications.DecideAsync(UserId(), id, input, expectedVersion, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.TeachersReviewApplications), HttpPost("~/api/v1/teacher-qualifications/{id:guid}/revoke")]
    public async Task<IActionResult> RevokeQualification(
        Guid id, RevokeQualificationInput input, CancellationToken ct)
    {
        await applications.RevokeQualificationAsync(UserId(), id, input, ct);
        return NoContent();
    }

    private string UserId() =>
        User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}

public sealed record StartReviewRequest(
    [param: EnumDataType(typeof(ApplicationPriority))] ApplicationPriority Priority);
