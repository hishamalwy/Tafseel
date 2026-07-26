using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tafseel.Application.Authorization;
using Tafseel.Application.Common;
using Tafseel.Application.Governance;
using Tafseel.Application.Orders;

namespace Tafseel.Api.Controllers;

[ApiController, Route("api/v1")]
public sealed class GovernanceController(IGovernanceService governance) : ControllerBase
{
    [AllowAnonymous, HttpGet("teachers/{teacherId}/reviews")]
    public Task<PagedResult<ReviewDto>> Reviews(
        string teacherId, int page = 1, int pageSize = 20, CancellationToken ct = default) =>
        governance.GetTeacherReviewsAsync(teacherId, page, pageSize, ct);

    [Authorize(Policy = Permissions.ReviewsCreate), HttpPost("orders/{orderId:guid}/review")]
    public Task<ReviewDto> Review(Guid orderId, CreateReview input, CancellationToken ct) =>
        governance.CreateReviewAsync(UserId(), orderId, input, ct);

    [Authorize(Policy = Permissions.ReviewsModerate), HttpPost("admin/reviews/{id:guid}/moderate")]
    public async Task<IActionResult> Moderate(Guid id, ModerateReview input, CancellationToken ct)
    {
        await governance.ModerateReviewAsync(UserId(), id, input, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.DisputesCreate), HttpPost("disputes")]
    public Task<DisputeDto> Open(OpenDispute input, CancellationToken ct) =>
        governance.OpenDisputeAsync(UserId(), input, ct);

    [Authorize(Policy = Permissions.DisputesCreate), HttpGet("disputes/mine")]
    public Task<PagedResult<DisputeDto>> Mine(
        int page = 1, int pageSize = 20, CancellationToken ct = default) =>
        governance.GetDisputesAsync(UserId(), admin: false, page, pageSize, ct);

    [Authorize(Policy = Permissions.DisputesResolve), HttpGet("admin/disputes")]
    public Task<PagedResult<DisputeDto>> All(
        int page = 1, int pageSize = 20, CancellationToken ct = default) =>
        governance.GetDisputesAsync(UserId(), admin: true, page, pageSize, ct);

    [Authorize(Policy = Permissions.DisputesCreate), HttpPost("disputes/{id:guid}/messages")]
    public async Task<IActionResult> Message(
        Guid id, AddDisputeMessage input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await governance.AddDisputeMessageAsync(UserId(), id, input, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.DisputesCreate), EnableRateLimiting("upload")]
    [RequestSizeLimit(50 * 1024 * 1024), HttpPost("disputes/{id:guid}/evidence")]
    public async Task<AttachmentDto> Evidence(
        Guid id, IFormFile file,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return await governance.AddEvidenceAsync(
            UserId(), id, stream, file.FileName, file.ContentType, file.Length, version, ct);
    }

    [Authorize, HttpGet("dispute-evidence/{id:guid}/content")]
    public async Task<IActionResult> EvidenceContent(Guid id, CancellationToken ct)
    {
        var file = await governance.OpenEvidenceAsync(
            UserId(), id, User.HasClaim(Permissions.ClaimType, Permissions.DisputesResolve), ct);
        return File(file.Content, file.ContentType, file.FileName, enableRangeProcessing: true);
    }

    [Authorize(Policy = Permissions.DisputesResolve), HttpPost("admin/disputes/{id:guid}/start-review")]
    public async Task<IActionResult> StartReview(
        Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await governance.StartDisputeReviewAsync(UserId(), id, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.DisputesResolve), HttpPost("admin/disputes/{id:guid}/resolve")]
    public Task<DisputeDto> Resolve(
        Guid id, ResolveDispute input,
        [FromHeader(Name = "If-Match"), Required] string version,
        [FromHeader(Name = "Idempotency-Key"), Required] string key,
        CancellationToken ct) =>
        governance.ResolveDisputeAsync(UserId(), id, input, version, key, ct);

    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}
