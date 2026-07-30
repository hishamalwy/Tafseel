using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tafseel.Application.Authorization;
using Tafseel.Application.Finance;

namespace Tafseel.Api.Controllers;

[ApiController]
[Route("api/v1")]
public sealed class PaymentsController(IFinancialService finance, IPaymentProvider paymentProvider) : ControllerBase
{
    [Authorize(Policy = Permissions.PaymentsViewOwn), EnableRateLimiting("payment")]
    [HttpPost("payments/orders/{orderId:guid}")]
    public async Task<PaymentInitiationDto> Initiate(
        Guid orderId,
        [FromHeader(Name = "Idempotency-Key"), Required] string key,
        [FromBody] ApplyCouponRequest? body,
        CancellationToken ct) =>
        await finance.InitiateOrderPaymentAsync(UserId(), orderId, key, body?.CouponCode, ct);

    [Authorize(Policy = Permissions.PaymentsViewOwn), EnableRateLimiting("payment")]
    [HttpPost("payments/live-sessions/{liveSessionBookingId:guid}")]
    public async Task<PaymentInitiationDto> InitiateLiveSession(
        Guid liveSessionBookingId,
        [FromHeader(Name = "Idempotency-Key"), Required] string key,
        [FromBody] ApplyCouponRequest? body,
        CancellationToken ct) =>
        await finance.InitiateLiveSessionPaymentAsync(UserId(), liveSessionBookingId, key, body?.CouponCode, ct);

    [Authorize(Policy = Permissions.PaymentsViewOwn), HttpGet("payments/{id:guid}")]
    public Task<PaymentDto> Get(Guid id, CancellationToken ct) =>
        finance.GetPaymentAsync(UserId(), id, ct);

    [AllowAnonymous, EnableRateLimiting("payment"), RequestSizeLimit(64 * 1024)]
    [HttpPost("payments/webhooks/mock")]
    public Task<IActionResult> MockWebhook(
        [FromHeader(Name = "X-Mock-Signature"), Required] string signature, CancellationToken ct) =>
        ProcessWebhookAsync("Mock", signature, ct);

    /// <summary>
    /// Provider-named webhook endpoint. Fail-closed when the path provider does not match
    /// the configured/selected <see cref="IPaymentProvider.Name"/>.
    /// Signature header: X-Mock-Signature (Mock) or X-Payment-Signature (future PSPs).
    /// </summary>
    [AllowAnonymous, EnableRateLimiting("payment"), RequestSizeLimit(64 * 1024)]
    [HttpPost("payments/webhooks/{provider}")]
    public async Task<IActionResult> Webhook(
        string provider,
        [FromHeader(Name = "X-Mock-Signature")] string? mockSignature,
        [FromHeader(Name = "X-Payment-Signature")] string? paymentSignature,
        CancellationToken ct)
    {
        var signature = mockSignature ?? paymentSignature;
        if (string.IsNullOrWhiteSpace(signature))
            return BadRequest();
        return await ProcessWebhookAsync(provider, signature, ct);
    }

    [Authorize(Policy = Permissions.PaymentsManage), HttpPost("payments/{id:guid}/refund")]
    public Task<RefundDto> Refund(
        Guid id, [FromHeader(Name = "Idempotency-Key"), Required] string key, CancellationToken ct) =>
        finance.RefundAsync(UserId(), id, key, ct);

    [Authorize(Policy = Permissions.WithdrawalsRequest), HttpPost("withdrawals")]
    public Task<WithdrawalDto> RequestWithdrawal(
        RequestWithdrawal input,
        [FromHeader(Name = "Idempotency-Key"), Required] string key, CancellationToken ct) =>
        finance.RequestWithdrawalAsync(UserId(), input, key, ct);

    [Authorize(Policy = Permissions.WithdrawalsRequest), HttpGet("withdrawals/balances")]
    public Task<IReadOnlyCollection<BalanceDto>> Balances(CancellationToken ct) =>
        finance.GetBalancesAsync(UserId(), ct);

    [Authorize(Policy = Permissions.WithdrawalsReview), HttpPost("withdrawals/{id:guid}/process")]
    public Task<WithdrawalDto> ProcessWithdrawal(
        Guid id, ProcessWithdrawal input,
        [FromHeader(Name = "If-Match"), Required] string version,
        [FromHeader(Name = "Idempotency-Key"), Required] string key,
        CancellationToken ct) =>
        finance.ProcessWithdrawalAsync(UserId(), id, input, version, key, ct);

    [Authorize(Policy = Permissions.WithdrawalsReview), HttpGet("admin/withdrawals")]
    public Task<Application.Common.PagedResult<AdminWithdrawalDto>> Withdrawals(
        [FromQuery] Tafseel.Domain.Finance.WithdrawalStatus? status,
        int page = 1, int pageSize = 50, CancellationToken ct = default) =>
        finance.GetWithdrawalsAsync(status, page, pageSize, ct);

    [Authorize(Policy = Permissions.ReportsView), HttpGet("admin/finance/reconciliation")]
    public Task<ReconciliationDto> Reconciliation(CancellationToken ct) =>
        finance.ReconcileAsync(ct);

    private async Task<IActionResult> ProcessWebhookAsync(string provider, string signature, CancellationToken ct)
    {
        if (!string.Equals(provider, paymentProvider.Name, StringComparison.OrdinalIgnoreCase))
            return Unauthorized();

        using var buffer = new MemoryStream();
        await Request.Body.CopyToAsync(buffer, ct);
        await finance.ProcessWebhookAsync(buffer.ToArray(), signature, ct);
        return NoContent();
    }

    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}
