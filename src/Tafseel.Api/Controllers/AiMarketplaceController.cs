using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tafseel.Application.Ai;
using Tafseel.Application.Authorization;

namespace Tafseel.Api.Controllers;

[ApiController]
[Route("api/v1/ai")]
[Authorize(Policy = Permissions.StudentsCreateRequests)]
[EnableRateLimiting("ai")]
public sealed class AiMarketplaceController(IAiMarketplaceAssistant assistant) : ControllerBase
{
    /// <summary>
    /// Whether the client may offer each AI action (UX-08). Read-only, and deliberately outside the `ai`
    /// rate-limit partition: asking whether a button should exist must never spend the budget for using it.
    /// </summary>
    [HttpGet("capabilities"), DisableRateLimiting]
    public AiCapabilitiesDto Capabilities() => assistant.GetCapabilities();

    [HttpPost("discovery")]
    public Task<AiDiscoveryResult> Discovery(AiDiscoveryInput input, CancellationToken ct) =>
        assistant.InterpretDiscoveryAsync(input, ct);

    [HttpPost("request-assistant")]
    public Task<AiRequestAssistantResult> RequestAssistant(
        AiRequestAssistantInput input, CancellationToken ct) => assistant.AssistRequestAsync(input, ct);

    [HttpPost("product-help")]
    public Task<AiProductHelpResult> ProductHelp(AiProductHelpInput input, CancellationToken ct) =>
        assistant.AnswerProductHelpAsync(input, ct);
}
