using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Tafseel.Application.Authorization;
using Tafseel.Application.Common;
using Tafseel.Application.Finance;
using Tafseel.Application.Governance;

namespace Tafseel.Api.Controllers;

[ApiController, Route("api/v1/admin")]
public sealed class AdminController(IAdminService admin, ICouponService coupons) : ControllerBase
{
    [Authorize(Policy = Permissions.UsersView), HttpGet("users")]
    public Task<PagedResult<AdminUserDto>> Users(
        int page = 1, int pageSize = 20, string? search = null, string? role = null, CancellationToken ct = default) =>
        admin.GetUsersAsync(page, pageSize, search, role, ct);

    [Authorize(Policy = Permissions.UsersManage), HttpPut("users/{id}/suspension")]
    public async Task<IActionResult> Suspension(string id, SetSuspension input, CancellationToken ct)
    {
        await admin.SetSuspensionAsync(UserId(), id, input.Suspended, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.UsersManage), HttpPut("users/{id}/roles")]
    public async Task<IActionResult> Role(string id, SetRole input, CancellationToken ct)
    {
        await admin.SetRoleAsync(UserId(), id, input.Role, input.Assigned, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.ReportsView), HttpGet("metrics")]
    public Task<DashboardMetrics> Metrics(CancellationToken ct) => admin.GetMetricsAsync(ct);

    /// <summary>
    /// Admin Home's single read-only summary. Answers "what needs Admin attention now?" without
    /// downloading any collection. Reports.View is Admin-only, so QualityReviewer receives 403.
    /// </summary>
    [Authorize(Policy = Permissions.ReportsView), HttpGet("attention")]
    public Task<AdminAttentionDto> Attention(CancellationToken ct) => admin.GetAttentionAsync(ct);

    [Authorize(Policy = Permissions.ReportsView), HttpGet("reports/popular-subjects")]
    public Task<IReadOnlyCollection<PopularSubjectMetric>> PopularSubjects(CancellationToken ct) =>
        admin.GetPopularSubjectsAsync(ct);

    [Authorize(Policy = Permissions.ReportsView), HttpGet("audit")]
    public Task<PagedResult<AuditDto>> Audit(
        int page = 1, int pageSize = 50, string? search = null, string? action = null,
        string? entityType = null, CancellationToken ct = default) =>
        admin.GetAuditAsync(page, pageSize, search, action, entityType, ct);

    [Authorize(Policy = Permissions.ReportsView), HttpGet("operations/requests")]
    public Task<PagedResult<AdminOperationItemDto>> Requests(
        int page = 1, int pageSize = 50, string? search = null, string? filter = null,
        CancellationToken ct = default) =>
        admin.GetRequestsAsync(page, pageSize, search, filter, ct);

    [Authorize(Policy = Permissions.ReportsView), HttpGet("operations/orders")]
    public Task<PagedResult<AdminOperationItemDto>> Orders(
        int page = 1, int pageSize = 50, string? search = null, string? filter = null,
        CancellationToken ct = default) =>
        admin.GetOrdersAsync(page, pageSize, search, filter, ct);

    [Authorize(Policy = Permissions.ReportsView), HttpGet("operations/sessions")]
    public Task<PagedResult<AdminOperationItemDto>> Sessions(
        int page = 1, int pageSize = 50, string? search = null, string? filter = null,
        CancellationToken ct = default) =>
        admin.GetSessionsAsync(page, pageSize, search, filter, ct);

    [Authorize(Policy = Permissions.DisputesResolve), HttpPost("operations/sessions/{id:guid}/complete")]
    public async Task<IActionResult> ResolveSessionCompleted(
        Guid id, ResolvePassiveSessionOutcome input,
        [FromHeader(Name = "If-Match"), Required] string version,
        [FromHeader(Name = "Idempotency-Key"), Required] string idempotencyKey, CancellationToken ct)
    {
        await admin.ResolveSessionCompletedAsync(UserId(), id, input, version, idempotencyKey, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.DisputesResolve), HttpPost("operations/sessions/{id:guid}/student-no-show")]
    public async Task<IActionResult> ResolveSessionStudentNoShow(
        Guid id, ResolvePassiveSessionOutcome input,
        [FromHeader(Name = "If-Match"), Required] string version,
        [FromHeader(Name = "Idempotency-Key"), Required] string idempotencyKey, CancellationToken ct)
    {
        await admin.ResolveSessionStudentNoShowAsync(UserId(), id, input, version, idempotencyKey, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.DisputesResolve), HttpPost("operations/sessions/{id:guid}/teacher-no-show")]
    public async Task<IActionResult> ResolveSessionTeacherNoShow(
        Guid id, ResolvePassiveSessionOutcome input,
        [FromHeader(Name = "If-Match"), Required] string version,
        [FromHeader(Name = "Idempotency-Key"), Required] string idempotencyKey, CancellationToken ct)
    {
        await admin.ResolveSessionTeacherNoShowAsync(UserId(), id, input, version, idempotencyKey, ct);
        return NoContent();
    }

    [Authorize(Policy = Permissions.DisputesResolve), HttpPost("operations/sessions/{id:guid}/dispute")]
    public async Task<IActionResult> EscalateSessionDispute(
        Guid id, ResolvePassiveSessionOutcome input,
        [FromHeader(Name = "If-Match"), Required] string version,
        [FromHeader(Name = "Idempotency-Key"), Required] string idempotencyKey, CancellationToken ct)
    {
        var disputeId = await admin.EscalateSessionDisputeAsync(
            UserId(), id, input, version, idempotencyKey, ct);
        return Created($"/api/v1/admin/disputes/{disputeId}", new { disputeId });
    }

    [Authorize(Policy = Permissions.PlatformSettingsManage), HttpGet("coupons")]
    public Task<IReadOnlyCollection<CouponDto>> Coupons(CancellationToken ct) => coupons.ListAsync(ct);

    [Authorize(Policy = Permissions.PlatformSettingsManage), HttpPost("coupons")]
    public async Task<IActionResult> CreateCoupon(CreateCoupon input, CancellationToken ct) =>
        Created("", await coupons.CreateAsync(input, ct));

    [Authorize(Policy = Permissions.PlatformSettingsManage), HttpPut("coupons/{id:guid}")]
    public Task<CouponDto> UpdateCoupon(
        Guid id, UpdateCoupon input, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct) =>
        coupons.UpdateAsync(id, input, version, ct);

    [Authorize(Policy = Permissions.PlatformSettingsManage), HttpPatch("coupons/{id:guid}/active")]
    public async Task<IActionResult> SetCouponActive(Guid id, SetCouponActiveRequest input, CancellationToken ct)
    {
        await coupons.SetActiveAsync(id, input.IsActive, ct);
        return NoContent();
    }

    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}

public sealed record SetCouponActiveRequest(bool IsActive);
