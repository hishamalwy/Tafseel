using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tafseel.Application.Authorization;
using Tafseel.Application.Finance;

namespace Tafseel.Api.Controllers;

/// <summary>
/// Development / explicitly enabled Staging mock PSP simulator endpoints.
/// Completes payments only via the canonical Mock webhook verification path.
/// </summary>
[ApiController]
[Route("api/v1/payments/mock")]
[EnableRateLimiting("payment")]
public sealed class MockPaymentSimulatorController(IMockPaymentSimulator simulator) : ControllerBase
{
    [HttpGet("capabilities")]
    [AllowAnonymous]
    public PaymentCapabilitiesDto Capabilities() => simulator.GetCapabilities();

    [Authorize(Policy = Permissions.PaymentsViewOwn)]
    [HttpGet("simulator")]
    public Task<MockSimulatorSessionDto> Session(
        [FromQuery(Name = "ref"), Required, StringLength(200)] string providerReference,
        CancellationToken ct) =>
        simulator.GetSessionAsync(UserId(), providerReference, ct);

    [Authorize(Policy = Permissions.PaymentsViewOwn)]
    [HttpPost("simulator/complete")]
    public Task<MockSimulatorCompleteResponse> Complete(
        [FromBody] MockSimulatorCompleteRequest input,
        CancellationToken ct) =>
        simulator.CompleteAsync(UserId(), input, ct);

    private string UserId() => User.FindFirstValue("sub") ?? throw new UnauthorizedAccessException();
}
