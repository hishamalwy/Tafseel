using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Tafseel.Application.Marketing;

namespace Tafseel.Api.Controllers;

[ApiController]
[Route("api/v1")]
public sealed class PromotionsController(
    IPromotionService promotions,
    IPlatformStatsService stats) : ControllerBase
{
    /// <summary>Live promo slots for the landing page, in display order.</summary>
    [AllowAnonymous, HttpGet("promotions")]
    public Task<IReadOnlyCollection<PromotionDto>> Live(CancellationToken ct) =>
        promotions.GetLiveAsync(ct);

    /// <summary>Public counters behind the landing page's mini dashboard.</summary>
    [AllowAnonymous, HttpGet("platform/stats")]
    public Task<PlatformStatsDto> Stats(CancellationToken ct) => stats.GetAsync(ct);

    [Authorize(Policy = "PlatformSettings.Manage"), HttpGet("admin/promotions")]
    public Task<IReadOnlyCollection<AdminPromotionDto>> List(CancellationToken ct) =>
        promotions.ListAsync(ct);

    [Authorize(Policy = "PlatformSettings.Manage"), HttpPost("admin/promotions")]
    public async Task<IActionResult> Create(PromotionInput input, CancellationToken ct) =>
        Created("", await promotions.CreateAsync(input, ct));

    [Authorize(Policy = "PlatformSettings.Manage"), HttpPut("admin/promotions/{id:guid}")]
    public Task<AdminPromotionDto> Update(
        Guid id, PromotionInput input, [FromHeader(Name = "If-Match"), Required] string version,
        CancellationToken ct) =>
        promotions.UpdateAsync(id, input, version, ct);

    [Authorize(Policy = "PlatformSettings.Manage"), HttpPatch("admin/promotions/{id:guid}/active")]
    public async Task<IActionResult> SetActive(Guid id, SetPromotionActiveRequest input, CancellationToken ct)
    {
        await promotions.SetActiveAsync(id, input.IsActive, ct);
        return NoContent();
    }

    [Authorize(Policy = "PlatformSettings.Manage"), HttpDelete("admin/promotions/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await promotions.DeleteAsync(id, ct);
        return NoContent();
    }
}

public sealed record SetPromotionActiveRequest(bool IsActive);
