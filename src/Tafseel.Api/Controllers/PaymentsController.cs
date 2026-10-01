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
public sealed class PaymentsController(
    IFinancialService finance, IPaymentProvider paymentProvider, ICouponCheckoutQuoteService couponQuotes,
    ITeacherEarningsService earnings) : ControllerBase
{
    [Authorize(Policy = Permissions.PaymentsViewOwn), EnableRateLimiting("payment")]
    [HttpPost("payments/{kind}/{id:guid}/coupon-quote")]
    public Task<CouponQuoteDto> CouponQuote(
        string kind, Guid id, ApplyCouponRequest input, CancellationToken ct) =>
        couponQuotes.QuoteAsync(UserId(), kind, id, input.CouponCode ?? "", ct);

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

    [Authorize(Policy = Permissions.PaymentsViewOwn), HttpGet("payments/open-requests/{learningRequestId:guid}/quote")]
    public Task<OpenRequestPaymentQuoteDto> OpenRequestQuote(Guid learningRequestId, CancellationToken ct) =>
        finance.QuoteOpenRequestPaymentAsync(UserId(), learningRequestId, ct);

    [Authorize(Policy = Permissions.PaymentsViewOwn), HttpGet("payments/{id:guid}")]
    public Task<PaymentDto> Get(Guid id, CancellationToken ct) =>
        finance.GetPaymentAsync(UserId(), id, ct);

    [AllowAnonymous, EnableRateLimiting("webhook"), RequestSizeLimit(64 * 1024)]
    [HttpPost("payments/webhooks/mock")]
    public Task<IActionResult> MockWebhook(
        [FromHeader(Name = "X-Mock-Signature"), Required] string signature, CancellationToken ct) =>
        ProcessWebhookAsync("Mock", signature, ct);

    /// <summary>
    /// Provider-named webhook endpoint. Fail-closed when the path provider does not match
    /// the configured/selected <see cref="IPaymentProvider.Name"/>.
    /// Signature header: X-Mock-Signature (Mock) or X-Payment-Signature (future PSPs).
    /// </summary>
    [AllowAnonymous, EnableRateLimiting("webhook"), RequestSizeLimit(64 * 1024)]
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

    [Authorize(Policy = Permissions.FinanceRefundsExecute), HttpPost("payments/{id:guid}/refund")]
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

    /// <summary>Where the balance came from: each earning's price, commission and net, and what was transferred.</summary>
    [Authorize(Policy = Permissions.WithdrawalsRequest), HttpGet("withdrawals/earnings")]
    public Task<TeacherEarningsDto> Earnings(int take = 50, CancellationToken ct = default) =>
        earnings.GetAsync(UserId(), take, ct);

    [Authorize(Policy = Permissions.WithdrawalsRequest), HttpGet("withdrawals/policy")]
    public WithdrawalPolicyDto WithdrawalPolicy() => finance.GetWithdrawalPolicy();

    [Authorize(Policy = Permissions.WithdrawalsRequest), HttpGet("withdrawals/mine")]
    public Task<Application.Common.PagedResult<WithdrawalDto>> MyWithdrawals(
        int page = 1, int pageSize = 50, CancellationToken ct = default) =>
        finance.GetMyWithdrawalsAsync(UserId(), page, pageSize, ct);

    [Authorize(Policy = Permissions.WithdrawalsRequest), HttpGet("withdrawals/profile")]
    public Task<PayoutProfileDto?> MyPayoutProfile(CancellationToken ct) =>
        finance.GetPayoutProfileAsync(UserId(), ct);

    /// <summary>Full bank details arrive once, in the body; the response is masked.</summary>
    [Authorize(Policy = Permissions.WithdrawalsRequest), EnableRateLimiting("payment"), HttpPut("withdrawals/profile")]
    public Task<PayoutProfileDto> SubmitPayoutProfile(SubmitPayoutProfile input, CancellationToken ct) =>
        finance.SubmitPayoutProfileAsync(UserId(), input, ct);

    /// <summary>Rejects a withdrawal (funds return). Marking a transfer needs initiation and bank evidence.</summary>
    [Authorize(Policy = Permissions.FinanceWithdrawalsExecute), HttpPost("withdrawals/{id:guid}/process")]
    public Task<WithdrawalDto> ProcessWithdrawal(
        Guid id, ProcessWithdrawal input,
        [FromHeader(Name = "If-Match"), Required] string version,
        [FromHeader(Name = "Idempotency-Key"), Required] string key,
        CancellationToken ct) =>
        finance.ProcessWithdrawalAsync(UserId(), id, input, version, key, ct);

    /// <summary>
    /// The audited transfer instruction for one withdrawal: the full destination snapshotted at request time.
    /// POST so it is never a cacheable or prefetchable read; every call is recorded in the financial audit.
    /// </summary>
    [Authorize(Policy = Permissions.FinanceWithdrawalsExecute), EnableRateLimiting("payment")]
    [HttpPost("admin/withdrawals/{id:guid}/transfer-instruction")]
    public Task<WithdrawalTransferInstructionDto> TransferInstruction(Guid id, CancellationToken ct)
    {
        Response.Headers.CacheControl = "private, no-store, max-age=0";
        Response.Headers.Pragma = "no-cache";
        return finance.GetWithdrawalTransferInstructionAsync(UserId(), id, ct);
    }

    /// <summary>Step 1 of 2: the payout adapter takes the instruction. The manual adapter moves no money.</summary>
    [Authorize(Policy = Permissions.FinanceWithdrawalsExecute), EnableRateLimiting("payment")]
    [HttpPost("withdrawals/{id:guid}/transfer-initiation")]
    public Task<AdminWithdrawalDto> InitiateTransfer(
        Guid id,
        [FromHeader(Name = "If-Match"), Required] string version,
        [FromHeader(Name = "Idempotency-Key"), Required] string key,
        CancellationToken ct) =>
        finance.InitiateWithdrawalTransferAsync(UserId(), id, version, key, ct);

    /// <summary>Step 2 of 2: the bank's evidence that the transfer was sent. Moves the ledger exactly once.</summary>
    [Authorize(Policy = Permissions.FinanceWithdrawalsExecute), EnableRateLimiting("payment")]
    [HttpPost("withdrawals/{id:guid}/transfer-confirmation")]
    public Task<AdminWithdrawalDto> ConfirmTransfer(
        Guid id, ConfirmWithdrawalTransfer input,
        [FromHeader(Name = "If-Match"), Required] string version,
        [FromHeader(Name = "Idempotency-Key"), Required] string key,
        CancellationToken ct) =>
        finance.ConfirmWithdrawalTransferAsync(UserId(), id, input, version, key, ct);

    [Authorize(Policy = Permissions.FinanceWithdrawalsExecute), HttpGet("admin/withdrawals")]
    public Task<Application.Common.PagedResult<AdminWithdrawalDto>> Withdrawals(
        [FromQuery] Tafseel.Domain.Finance.WithdrawalStatus? status,
        int page = 1, int pageSize = 50, CancellationToken ct = default) =>
        finance.GetWithdrawalsAsync(status, page, pageSize, ct);

    [Authorize(Policy = Permissions.FinancePayoutProfilesReview), HttpGet("admin/payout-profiles")]
    public Task<Application.Common.PagedResult<PayoutProfileDto>> PayoutProfiles(
        [FromQuery] Tafseel.Domain.Finance.PayoutVerificationStatus? status,
        int page = 1, int pageSize = 50, CancellationToken ct = default) =>
        finance.GetPayoutProfilesAsync(status, page, pageSize, ct);

    [Authorize(Policy = Permissions.FinancePayoutProfilesReview), HttpPost("admin/payout-profiles/{teacherId}/review")]
    public Task<PayoutProfileDto> ReviewPayoutProfile(
        string teacherId, ReviewPayoutProfile input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct) =>
        finance.ReviewPayoutProfileAsync(UserId(), teacherId, input, version, ct);

    /// <summary>
    /// Read-only FR-1 audit of coupon-discounted purchases against the immutable ledger and escrow trail.
    /// Reports anomalies; it never repairs a balance.
    /// </summary>
    [Authorize(Policy = Permissions.FinanceReconciliationView), HttpGet("admin/finance/reconciliation/coupons")]
    public Task<CouponReconciliationReportDto> CouponReconciliation(
        [FromQuery] int limit, CancellationToken ct) =>
        finance.ReconcileCouponPurchasesAsync(limit <= 0 ? 100 : limit, ct);

    [Authorize(Policy = Permissions.FinanceReconciliationView), HttpGet("admin/finance/reconciliation")]
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
