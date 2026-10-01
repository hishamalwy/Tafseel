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

    [Authorize, HttpGet("{id:guid}")]
    public Task<LearningRequestDto> Get(Guid id, CancellationToken ct) =>
        orders.GetOwnedRequestAsync(UserId(), id, ct);

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
        Response.Headers.CacheControl = "private, no-store, max-age=0";
        Response.Headers.Pragma = "no-cache";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers["Cross-Origin-Resource-Policy"] = "same-origin";
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
[Route("api/v1/open-marketplace")]
public sealed class OpenMarketplaceController(
    IOpenMarketplaceService marketplace, IOpenRequestDraftService drafts) : ControllerBase
{
    // Upload first (Product Contract §7a): the student's own draft. 204 when there is none yet.
    [Authorize(Roles = Roles.Student), HttpGet("drafts/current")]
    public async Task<IActionResult> CurrentDraft(CancellationToken ct) =>
        await drafts.GetCurrentAsync(UserId(), ct) is { } draft ? Ok(draft) : NoContent();

    [Authorize(Roles = Roles.Student), HttpPut("drafts/current")]
    public Task<OpenRequestDraftDto> SaveDraft(SaveOpenRequestDraft input, CancellationToken ct) =>
        drafts.SaveAsync(UserId(), input, ct);

    [Authorize(Roles = Roles.Student), EnableRateLimiting("upload"), RequestSizeLimit(50 * 1024 * 1024)]
    [HttpPost("drafts/current/attachments")]
    public async Task<OpenRequestDraftDto> AddDraftAttachment(IFormFile file, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return await drafts.AddAttachmentAsync(UserId(), stream, file.FileName, file.ContentType, file.Length, ct);
    }

    [Authorize(Roles = Roles.Student), HttpDelete("drafts/current/attachments/{attachmentId:guid}")]
    public Task<OpenRequestDraftDto> RemoveDraftAttachment(Guid attachmentId, CancellationToken ct) =>
        drafts.RemoveAttachmentAsync(UserId(), attachmentId, ct);

    [Authorize(Roles = Roles.Student), HttpDelete("drafts/current")]
    public async Task<IActionResult> DiscardDraft(CancellationToken ct)
    {
        await drafts.DiscardAsync(UserId(), ct);
        return NoContent();
    }

    [Authorize(Roles = Roles.Student), HttpPost("requests")]
    public async Task<IActionResult> Publish(CreateOpenLearningRequest input, CancellationToken ct)
    {
        var request = await marketplace.PublishAsync(UserId(), input, ct);
        return Created($"/api/v1/open-marketplace/requests/{request.Id}", request);
    }

    [Authorize(Roles = Roles.Teacher), HttpGet("opportunities")]
    public Task<PagedResult<OpenRequestDto>> Opportunities(
        int page = 1, int pageSize = 20, CancellationToken ct = default) =>
        marketplace.GetOpportunitiesAsync(UserId(), page, pageSize, ct);

    [Authorize(Roles = Roles.Teacher), HttpGet("opportunities/{id:guid}")]
    public Task<OpenRequestDto> Opportunity(Guid id, CancellationToken ct) =>
        marketplace.GetOpportunityAsync(UserId(), id, ct);

    [Authorize(Roles = Roles.Teacher), EnableRateLimiting("payment"), HttpPost("opportunities/{id:guid}/offers")]
    public async Task<IActionResult> SubmitOffer(Guid id, SubmitTeacherOffer input, CancellationToken ct)
    {
        var offer = await marketplace.SubmitOfferAsync(UserId(), id, input, ct);
        return Created($"/api/v1/open-marketplace/offers/{offer.Id}", offer);
    }

    [Authorize(Roles = Roles.Teacher), EnableRateLimiting("payment"), HttpPut("offers/{id:guid}")]
    public Task<TeacherOfferDto> UpdateOffer(
        Guid id, SubmitTeacherOffer input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct) =>
        marketplace.UpdateOfferAsync(UserId(), id, input, version, ct);

    [Authorize(Roles = Roles.Teacher), EnableRateLimiting("payment"), HttpPost("offers/{id:guid}/withdraw")]
    public async Task<IActionResult> WithdrawOffer(
        Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await marketplace.WithdrawOfferAsync(UserId(), id, version, ct);
        return NoContent();
    }

    [Authorize(Roles = Roles.Teacher), HttpGet("offers/mine")]
    public Task<PagedResult<TeacherOfferHistoryDto>> MyOffers(
        int page = 1, int pageSize = 20, CancellationToken ct = default) =>
        marketplace.GetMyOffersAsync(UserId(), page, pageSize, ct);

    [Authorize(Roles = Roles.Teacher), HttpGet("requests/{requestId:guid}/my-offer")]
    public Task<TeacherOfferDto> MyOffer(Guid requestId, CancellationToken ct) =>
        marketplace.GetMyOfferAsync(UserId(), requestId, ct);

    [Authorize(Roles = Roles.Student), HttpGet("requests/{requestId:guid}/offers")]
    public Task<IReadOnlyCollection<TeacherOfferDto>> Offers(Guid requestId, CancellationToken ct) =>
        marketplace.GetStudentOffersAsync(UserId(), requestId, ct);

    [Authorize(Roles = Roles.Student), HttpGet("requests/{requestId:guid}")]
    public Task<OpenRequestDto> StudentRequest(Guid requestId, CancellationToken ct) =>
        marketplace.GetStudentRequestAsync(UserId(), requestId, ct);

    [Authorize(Roles = Roles.Student), EnableRateLimiting("payment"), HttpPost("requests/{requestId:guid}/offers/{offerId:guid}/select")]
    public async Task<IActionResult> Select(
        Guid requestId, Guid offerId,
        [FromHeader(Name = "If-Match"), Required] string requestVersion,
        [FromHeader(Name = "X-Offer-Version"), Required] string offerVersion,
        CancellationToken ct)
    {
        await marketplace.SelectOfferAsync(UserId(), requestId, offerId, requestVersion, offerVersion, ct);
        return NoContent();
    }

    [Authorize(Roles = Roles.Student), HttpPost("requests/{requestId:guid}/cancel-selection")]
    public async Task<IActionResult> CancelSelection(
        Guid requestId, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await marketplace.CancelSelectionAsync(UserId(), requestId, version, ct);
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

    [Authorize, HttpGet("{id:guid}")]
    public Task<OrderDto> Get(Guid id, CancellationToken ct) =>
        orders.GetOwnedOrderAsync(UserId(), id, ct);

    [Authorize, HttpGet("{id:guid}/timeline")]
    public Task<IReadOnlyCollection<OrderTimelineEventDto>> Timeline(
        Guid id, CancellationToken ct) =>
        orders.GetTimelineAsync(UserId(), id, ct);

    [Authorize(Policy = Permissions.RequestsAccept), HttpPost("{id:guid}/start")]
    public async Task<IActionResult> Start(
        Guid id, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await orders.StartOrderAsync(UserId(), id, version, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.RequestsDeliver), EnableRateLimiting("upload")]
    [RequestSizeLimit(300 * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 300 * 1024 * 1024)]
    [HttpPost("{id:guid}/deliveries")]
    public async Task<IActionResult> Deliver(
        Guid id, [FromForm, StringLength(2000)] string? message,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        var formFiles = Request.Form.Files.Where(file => file.Length > 0).ToArray();
        var streams = new List<Stream>(formFiles.Length);
        try
        {
            var uploads = new List<DeliveryUpload>(formFiles.Length);
            foreach (var file in formFiles)
            {
                var stream = file.OpenReadStream();
                streams.Add(stream);
                uploads.Add(new DeliveryUpload(
                    stream, file.FileName, file.ContentType ?? "", file.Length));
            }

            var delivery = await orders.DeliverAsync(
                UserId(), id, uploads, message ?? "", version, ct);
            return Created($"/api/v1/orders/deliveries/{delivery.Id}/content", delivery);
        }
        finally
        {
            foreach (var stream in streams)
                await stream.DisposeAsync();
        }
    }

    [Authorize, HttpGet("deliveries/{id:guid}/content")]
    public async Task<IActionResult> Delivery(Guid id, CancellationToken ct)
    {
        var file = await orders.OpenDeliveryAsync(UserId(), id, ct);
        Response.Headers.CacheControl = "private, no-store, max-age=0";
        Response.Headers.Pragma = "no-cache";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers["Cross-Origin-Resource-Policy"] = "same-origin";
        Response.Headers.ContentDisposition = "inline";
        return File(file.Content, file.ContentType, enableRangeProcessing: true);
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

    [Authorize, HttpPost("{id:guid}/extensions")]
    public async Task<IActionResult> RequestExtension(
        Guid id, RequestOrderExtension input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await orders.RequestExtensionAsync(UserId(), id, input, version, ct);
        return NoContent();
    }

    [Authorize, HttpPost("{id:guid}/extensions/{extensionId:guid}/respond")]
    public async Task<IActionResult> RespondToExtension(
        Guid id, Guid extensionId, RespondOrderExtension input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct)
    {
        await orders.RespondToExtensionAsync(UserId(), id, extensionId, input, version, ct);
        return NoContent();
    }

    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}
