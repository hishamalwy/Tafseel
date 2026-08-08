using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Tafseel.Application.Authorization;
using Tafseel.Application.MarketplaceIntelligence;

namespace Tafseel.Api.Controllers;

[ApiController, Route("api/v1/marketplace-intelligence")]
public sealed class MarketplaceIntelligenceController(IMarketplaceIntelligenceService intelligence) : ControllerBase
{
    [AllowAnonymous, HttpPost("events")]
    public async Task<IActionResult> Track(TrackMarketplaceInteraction input, CancellationToken ct)
    {
        await intelligence.TrackAsync(User.FindFirstValue("sub"), input, ct);
        return Accepted();
    }
}

[ApiController, Route("api/v1/admin/marketplace-intelligence")]
public sealed class AdminMarketplaceIntelligenceController(IMarketplaceIntelligenceService intelligence) : ControllerBase
{
    [Authorize(Policy = Permissions.MarketplaceIntelligenceView), HttpGet]
    public Task<MarketplaceIntelligenceReport> Get(
        [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to,
        [FromQuery] Guid? subjectId, [FromQuery] Guid? serviceCatalogItemId,
        CancellationToken ct) =>
        intelligence.GetReportAsync(new(from, to, subjectId, serviceCatalogItemId), ct);
}
