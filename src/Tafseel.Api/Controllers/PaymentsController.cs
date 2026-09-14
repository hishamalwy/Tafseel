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

    [Authorize(Policy = Permissions.PaymentsViewOwn), EnableRateLimiting("payment")]
    [HttpPost("payments/open-requests/{learningRequestId:guid}")]
    public Task<PaymentInitiationDto> InitiateOpenRequest(
        Guid learningRequestId,
        [FromHeader(Name = "Idempotency-Key"), Required] string key,
        [FromBody] ApplyCouponRequest? body,
        CancellationToken ct) =>
        finance.InitiateOpenRequestPaymentAsync(UserId(), learningRequestId, key, body?.CouponCode, ct);

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
        Guid id, AdminRefundRequest input,
        [FromHeader(Name = "Idempotency-Key"), Required] string key, CancellationToken ct) =>
        finance.RefundAsync(UserId(), id, input.Reason, key, ct);

    [Authorize(Policy = Permissions.WithdrawalsRequest), HttpPost("withdrawals")]
    public Task<WithdrawalDto> RequestWithdrawal(
        RequestWithdrawal input,
        [FromHeader(Name = "Idempotency-Key"), Required] string key, CancellationToken ct) =>
        finance.RequestWithdrawalAsync(UserId(), input, key, ct);

    [Authorize(Policy = Permissions.WithdrawalsRequest), HttpGet("withdrawals/balances")]
    public Task<IReadOnlyCollection<BalanceDto>> Balances(CancellationToken ct) =>
        finance.GetBalancesAsync(UserId(), ct);

    [Authorize(Policy = Permissions.WithdrawalsRequest), HttpGet("withdrawals/policy")]
    public WithdrawalPolicyDto WithdrawalPolicy() => finance.GetWithdrawalPolicy();

    [Authorize(Policy = Permissions.WithdrawalsRequest), HttpGet("withdrawals/mine")]
    public Task<Application.Common.PagedResult<WithdrawalDto>> MyWithdrawals(
        int page = 1, int pageSize = 50, CancellationToken ct = default) =>
        finance.GetMyWithdrawalsAsync(UserId(), page, pageSize, ct);

    [Authorize(Policy = Permissions.WithdrawalsRequest), HttpGet("withdrawals/profile")]
    public Task<PayoutProfileDto?> MyPayoutProfile(CancellationToken ct) =>
        finance.GetPayoutProfileAsync(UserId(), ct);

    [Authorize(Policy = Permissions.WithdrawalsRequest), HttpPut("withdrawals/profile")]
    public Task<PayoutProfileDto> SubmitPayoutProfile(SubmitPayoutProfile input, CancellationToken ct) =>
        finance.SubmitPayoutProfileAsync(UserId(), input, ct);

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

    [Authorize(Policy = Permissions.WithdrawalsReview), HttpGet("admin/payout-profiles")]
    public Task<Application.Common.PagedResult<PayoutProfileDto>> PayoutProfiles(
        [FromQuery] Tafseel.Domain.Finance.PayoutVerificationStatus? status,
        int page = 1, int pageSize = 50, CancellationToken ct = default) =>
        finance.GetPayoutProfilesAsync(status, page, pageSize, ct);

    [Authorize(Policy = Permissions.WithdrawalsReview), HttpPost("admin/payout-profiles/{teacherId}/review")]
    public Task<PayoutProfileDto> ReviewPayoutProfile(
        string teacherId, ReviewPayoutProfile input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct) =>
        finance.ReviewPayoutProfileAsync(UserId(), teacherId, input, version, ct);

    /// <summary>
    /// Read-only FR-1 audit of coupon-discounted purchases against the immutable ledger and escrow trail.
    /// Reports anomalies; it never repairs a balance.
    /// </summary>
    [Authorize(Policy = Permissions.ReportsView), HttpGet("admin/finance/reconciliation/coupons")]
    public Task<CouponReconciliationReportDto> CouponReconciliation(
        [FromQuery] int limit, CancellationToken ct) =>
        finance.ReconcileCouponPurchasesAsync(limit <= 0 ? 100 : limit, ct);

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
