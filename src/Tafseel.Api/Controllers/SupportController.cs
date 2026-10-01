using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tafseel.Application.Authorization;
using Tafseel.Application.Common;
using Tafseel.Application.Governance;
using Tafseel.Domain.Governance;

namespace Tafseel.Api.Controllers;

/// <summary>
/// Help and abuse reports outside paid purchases. Any signed-in person reports and follows their own cases; a person
/// who cannot sign in reports an account-access problem with an e-mail address. Admins own the queue.
/// </summary>
[ApiController]
[Route("api/v1")]
public sealed class SupportController(ISupportService support) : ControllerBase
{
    [Authorize, EnableRateLimiting("upload"), HttpPost("support/cases")]
    public Task<SupportCaseDto> Create(CreateSupportCase input, CancellationToken ct) =>
        support.CreateAsync(UserId(), input, ct);

    /// <summary>Signed-out intake, account access only; rate-limited like sign-in.</summary>
    [AllowAnonymous, EnableRateLimiting("auth"), HttpPost("support/account-access")]
    public Task<SupportCaseReceiptDto> AccountAccess(CreateAccountAccessCase input, CancellationToken ct) =>
        support.CreateAccountAccessAsync(input, ct);

    [Authorize, HttpGet("support/cases/mine")]
    public Task<PagedResult<SupportCaseListItemDto>> Mine(int page = 1, int pageSize = 20, CancellationToken ct = default) =>
        support.MineAsync(UserId(), page, pageSize, ct);

    [Authorize, HttpGet("support/cases/{id:guid}")]
    public Task<SupportCaseDto> Get(Guid id, CancellationToken ct) =>
        support.GetAsync(UserId(), IsStaff(), id, ct);

    [Authorize, EnableRateLimiting("upload"), HttpPost("support/cases/{id:guid}/messages")]
    public Task<SupportCaseDto> Message(
        Guid id, SupportMessageInput input, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct) =>
        support.AddMessageAsync(UserId(), IsStaff(), id, input, version, ct);

    [Authorize, EnableRateLimiting("upload"), RequestSizeLimit(20 * 1024 * 1024)]
    [HttpPost("support/cases/{id:guid}/attachments")]
    public async Task<SupportCaseDto> Attach(
        Guid id, IFormFile file, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return await support.AddAttachmentAsync(UserId(), id, stream, file.FileName, file.ContentType, file.Length, version, ct);
    }

    [Authorize, HttpGet("support/attachments/{id:guid}/content")]
    public async Task<IActionResult> AttachmentContent(Guid id, CancellationToken ct)
    {
        var file = await support.OpenAttachmentAsync(UserId(), IsStaff(), id, ct);
        return File(file.Content, file.ContentType, file.FileName, enableRangeProcessing: true);
    }

    [Authorize(Policy = Permissions.SupportCasesManage), HttpGet("admin/support/cases")]
    public Task<PagedResult<SupportCaseListItemDto>> Queue(
        [FromQuery] SupportCaseStatus? status, [FromQuery] SupportCaseCategory? category,
        [FromQuery, StringLength(200)] string? query, int page = 1, int pageSize = 25, CancellationToken ct = default) =>
        support.QueueAsync(status, category, query, page, pageSize, ct);

    [Authorize(Policy = Permissions.SupportCasesManage), HttpPost("admin/support/cases/{id:guid}/take")]
    public Task<SupportCaseDto> Take(Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct) =>
        support.TakeAsync(UserId(), id, version, ct);

    [Authorize(Policy = Permissions.SupportCasesManage), HttpPost("admin/support/cases/{id:guid}/resolve")]
    public Task<SupportCaseDto> Resolve(
        Guid id, ResolveSupportCase input, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct) =>
        support.ResolveAsync(UserId(), id, input, version, ct);

    private bool IsStaff() => User.HasClaim(Permissions.ClaimType, Permissions.SupportCasesManage);
    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}
