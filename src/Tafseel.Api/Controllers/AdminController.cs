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
        int page = 1, int pageSize = 20, string? search = null, CancellationToken ct = default) =>
        admin.GetUsersAsync(page, pageSize, search, ct);

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

    [Authorize(Policy = Permissions.ReportsView), HttpGet("reports/popular-subjects")]
    public Task<IReadOnlyCollection<PopularSubjectMetric>> PopularSubjects(CancellationToken ct) =>
        admin.GetPopularSubjectsAsync(ct);

    [Authorize(Policy = Permissions.ReportsView), HttpGet("audit")]
    public Task<PagedResult<AuditDto>> Audit(
        int page = 1, int pageSize = 50, CancellationToken ct = default) =>
        admin.GetAuditAsync(page, pageSize, ct);

    [Authorize(Policy = "PlatformSettings.Manage"), HttpGet("coupons")]
    public Task<IReadOnlyCollection<CouponDto>> Coupons(CancellationToken ct) => coupons.ListAsync(ct);

    [Authorize(Policy = "PlatformSettings.Manage"), HttpPost("coupons")]
    public async Task<IActionResult> CreateCoupon(CreateCoupon input, CancellationToken ct) =>
        Created("", await coupons.CreateAsync(input, ct));

    [Authorize(Policy = "PlatformSettings.Manage"), HttpPut("coupons/{id:guid}")]
    public Task<CouponDto> UpdateCoupon(
        Guid id, UpdateCoupon input, [FromHeader(Name = "If-Match"), Required] string version, CancellationToken ct) =>
        coupons.UpdateAsync(id, input, version, ct);

    [Authorize(Policy = "PlatformSettings.Manage"), HttpPatch("coupons/{id:guid}/active")]
    public async Task<IActionResult> SetCouponActive(Guid id, SetCouponActiveRequest input, CancellationToken ct)
    {
        await coupons.SetActiveAsync(id, input.IsActive, ct);
        return NoContent();
    }

    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}

public sealed record SetCouponActiveRequest(bool IsActive);
