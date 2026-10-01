using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Tafseel.Application.Authorization;
using Tafseel.Application.Common;
using Tafseel.Application.Finance;
using Tafseel.Domain.Finance;

namespace Tafseel.Api.Controllers;

/// <summary>
/// The money operator's workspace: payment investigation, reconciliation cases and the financial audit trail.
/// Each endpoint needs exactly the Finance permission for its duty; Admin holds them all as owner access.
/// Refunds and transfers keep their endpoints under <c>payments/</c> and <c>withdrawals/</c>.
/// </summary>
[ApiController]
[Route("api/v1/finance")]
public sealed class FinanceController(IFinanceOperationsService operations) : ControllerBase
{
    [Authorize(Policy = Permissions.FinancePaymentsView), HttpGet("attention")]
    public Task<FinanceAttentionDto> Attention(CancellationToken ct) => operations.GetAttentionAsync(ct);

    [Authorize(Policy = Permissions.FinancePaymentsView), HttpGet("payments")]
    public Task<PagedResult<FinancePaymentListItemDto>> Payments(
        [FromQuery, StringLength(200)] string? query, [FromQuery, StringLength(20)] string? status,
        [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to,
        int page = 1, int pageSize = 25, CancellationToken ct = default) =>
        operations.SearchPaymentsAsync(new(query, status, from, to, page, pageSize), ct);

    [Authorize(Policy = Permissions.FinancePaymentsView), HttpGet("payments/{id:guid}")]
    public Task<FinancePaymentDetailDto> Payment(Guid id, CancellationToken ct) =>
        operations.GetPaymentAsync(UserId(), id, ct);

    [Authorize(Policy = Permissions.FinanceAuditView), HttpGet("audit")]
    public Task<PagedResult<FinancialAuditItemDto>> Audit(
        [FromQuery, StringLength(200)] string? query, [FromQuery, StringLength(50)] string? entityType,
        [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to,
        int page = 1, int pageSize = 50, CancellationToken ct = default) =>
        operations.GetFinancialAuditAsync(query, entityType, from, to, page, pageSize, ct);

    /// <summary>Runs reconciliation and turns each anomaly into a case (new, seen again, or no longer found).</summary>
    [Authorize(Policy = Permissions.FinanceReconciliationView), HttpPost("reconciliation/scan")]
    public Task<ReconciliationScanDto> Scan(CancellationToken ct) =>
        operations.ScanReconciliationAsync(UserId(), ct);

    [Authorize(Policy = Permissions.FinanceReconciliationView), HttpGet("reconciliation/exceptions")]
    public Task<PagedResult<ReconciliationExceptionDto>> Exceptions(
        [FromQuery] ReconciliationExceptionStatus? status, int page = 1, int pageSize = 50, CancellationToken ct = default) =>
        operations.GetReconciliationExceptionsAsync(status, page, pageSize, ct);

    [Authorize(Policy = Permissions.FinanceReconciliationResolve), HttpPost("reconciliation/exceptions/{id:guid}/acknowledge")]
    public Task<ReconciliationExceptionDto> Acknowledge(
        Guid id, AnnotateReconciliationException input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct) =>
        operations.AcknowledgeExceptionAsync(UserId(), id, input.Note, version, ct);

    [Authorize(Policy = Permissions.FinanceReconciliationResolve), HttpPost("reconciliation/exceptions/{id:guid}/resolve")]
    public Task<ReconciliationExceptionDto> Resolve(
        Guid id, AnnotateReconciliationException input,
        [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct) =>
        operations.ResolveExceptionAsync(UserId(), id, input.Note, version, ct);

    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}
