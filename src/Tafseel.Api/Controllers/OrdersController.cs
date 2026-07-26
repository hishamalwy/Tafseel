using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tafseel.Application.Authorization;
using Tafseel.Application.Common;
using Tafseel.Application.Orders;
using Tafseel.Domain.Orders;

namespace Tafseel.Api.Controllers;

[ApiController]
[Route("api/v1/learning-requests")]
public sealed class LearningRequestsController(IOrderService orders) : ControllerBase
{
    [Authorize(Policy = Permissions.StudentsCreateRequests), HttpPost]
    public async Task<IActionResult> Create(CreateLearningRequest input, CancellationToken ct)
    {
        var request = await orders.CreateRequestAsync(UserId(), input, ct);
        return Created($"/api/v1/learning-requests/{request.Id}", request);
    }

    [Authorize(Roles = Roles.Student), HttpGet("mine")]
    public Task<PagedResult<LearningRequestDto>> StudentMine(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        orders.GetStudentRequestsAsync(UserId(), page, pageSize, ct);

    [Authorize(Roles = Roles.Teacher), HttpGet("assigned")]
    public Task<PagedResult<LearningRequestDto>> TeacherAssigned(
        [FromQuery, EnumDataType(typeof(LearningRequestStatus))] LearningRequestStatus? status = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        orders.GetTeacherRequestsAsync(UserId(), status, page, pageSize, ct);

    [Authorize(Policy = Permissions.StudentsCreateRequests), EnableRateLimiting("upload")]
    [RequestSizeLimit(50 * 1024 * 1024), HttpPost("{id:guid}/attachments")]
    public async Task<IActionResult> AddAttachment(
        Guid id, IFormFile file,
        [FromHeader(Name = "If-Match"), Required] string version,
        CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        var attachment = await orders.AddRequestAttachmentAsync(
            UserId(), id, stream, file.FileName, file.ContentType, file.Length, version, ct);
        return Created($"/api/v1/learning-requests/attachments/{attachment.Id}/content", attachment);
    }

    [Authorize, HttpGet("attachments/{id:guid}/content")]
    public async Task<IActionResult> Attachment(Guid id, CancellationToken ct)
    {
        var file = await orders.OpenRequestAttachmentAsync(UserId(), id, ct);
        return File(file.Content, file.ContentType, file.FileName, enableRangeProcessing: true);
    }

    [Authorize(Roles = Roles.Teacher), HttpPost("{id:guid}/request-clarification")]
    public async Task<IActionResult> Clarify(
        Guid id, MessageInput input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await orders.RequestClarificationAsync(UserId(), id, input.Message, version, ct);
        return NoContent();
    }

    [Authorize(Roles = Roles.Student), HttpPost("{id:guid}/reply-clarification")]
    public async Task<IActionResult> Reply(
        Guid id, MessageInput input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await orders.ReplyClarificationAsync(UserId(), id, input.Message, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.RequestsDecline), HttpPost("{id:guid}/decline")]
    public async Task<IActionResult> Decline(
        Guid id, ReasonInput input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await orders.DeclineAsync(UserId(), id, input.Reason, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.RequestsAccept), HttpPost("{id:guid}/accept")]
    public async Task<IActionResult> Accept(
        Guid id, AcceptLearningRequest input,
        [FromHeader(Name = "Idempotency-Key"), Required] string idempotencyKey,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct) =>
        Ok(await orders.AcceptAsync(UserId(), id, input, idempotencyKey, version, ct));

    [Authorize(Roles = Roles.Student), HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(
        Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await orders.CancelRequestAsync(UserId(), id, version, ct);
        return NoContent();
    }

    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}

[ApiController]
[Route("api/v1/orders")]
public sealed class OrdersController(IOrderService orders) : ControllerBase
{
    [Authorize(Roles = Roles.Student), HttpGet("mine")]
    public Task<PagedResult<OrderDto>> StudentMine(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        orders.GetStudentOrdersAsync(UserId(), page, pageSize, ct);

    [Authorize(Roles = Roles.Teacher), HttpGet("assigned")]
    public Task<PagedResult<OrderDto>> TeacherAssigned(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        orders.GetTeacherOrdersAsync(UserId(), page, pageSize, ct);

    [Authorize(Policy = Permissions.RequestsAccept), HttpPost("{id:guid}/start")]
    public async Task<IActionResult> Start(
        Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await orders.StartOrderAsync(UserId(), id, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.RequestsDeliver), EnableRateLimiting("upload")]
    [RequestSizeLimit(50 * 1024 * 1024), HttpPost("{id:guid}/deliveries")]
    public async Task<IActionResult> Deliver(
        Guid id, IFormFile file, [FromForm, StringLength(2000)] string? message,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        var delivery = await orders.DeliverAsync(
            UserId(), id, stream, file.FileName, file.ContentType, file.Length, message ?? "", version, ct);
        return Created($"/api/v1/orders/deliveries/{delivery.Id}/content", delivery);
    }

    [Authorize, HttpGet("deliveries/{id:guid}/content")]
    public async Task<IActionResult> Delivery(Guid id, CancellationToken ct)
    {
        var file = await orders.OpenDeliveryAsync(UserId(), id, ct);
        return File(file.Content, file.ContentType, file.FileName, enableRangeProcessing: true);
    }

    [Authorize(Policy = Permissions.RequestsRequestRevision), HttpPost("{id:guid}/revision")]
    public async Task<IActionResult> Revise(
        Guid id, ReasonInput input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await orders.RequestRevisionAsync(UserId(), id, input.Reason, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.RequestsComplete), HttpPost("{id:guid}/complete")]
    public async Task<IActionResult> Complete(
        Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await orders.CompleteAsync(UserId(), id, version, ct);
        return NoContent();
    }

    [Authorize, HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(
        Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await orders.CancelOrderAsync(UserId(), id, version, ct);
        return NoContent();
    }

    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}
