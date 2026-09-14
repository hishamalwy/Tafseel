using System.Diagnostics.Metrics;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

namespace Tafseel.Api.Middleware;

/// <summary>
/// The rate limit for <c>POST /api/v1/auth/refresh</c> (G-19).
///
/// Refresh used to share the sign-in policy (10 a minute per IP), which is sized to slow
/// password guessing. Refresh is not a guessing surface: it needs a valid, rotating,
/// HttpOnly refresh cookie, and the client calls it on every full page load, so several tabs,
/// or several readers behind one NAT address, exhausted the sign-in budget and were signed
/// out. It has its own fixed window instead, per IP, and every rejection is logged and
/// counted so the limit can be tuned from production evidence.
///
/// The refresh token's validation, rotation, security-stamp check, session revocation and
/// cookie attributes are unchanged; this only decides how often the endpoint is served.
/// </summary>
public static class RefreshRateLimit
{
    public const string PolicyName = "refresh";
    public const int PermitLimitPerMinute = 60;

    private static readonly Meter Meter = new("Tafseel.Api.Auth");
    private static readonly Counter<long> Throttled = Meter.CreateCounter<long>(
        "tafseel.auth.refresh.throttled", unit: "{request}",
        description: "Refresh requests rejected by the refresh rate limit.");

    public static void Add(RateLimiterOptions options) =>
        options.AddPolicy(PolicyName, context => RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = PermitLimitPerMinute,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    /// <summary>Called for every rejected request; records the ones this policy rejected.</summary>
    public static void OnRejected(OnRejectedContext rejected, ILogger logger)
    {
        var endpoint = rejected.HttpContext.GetEndpoint();
        var policy = endpoint?.Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName;
        if (!string.Equals(policy, PolicyName, StringComparison.Ordinal)) return;

        var retryAfter = rejected.Lease.TryGetMetadata(MetadataName.RetryAfter, out var wait)
            ? (int?)Math.Ceiling(wait.TotalSeconds)
            : null;
        if (retryAfter is not null)
            rejected.HttpContext.Response.Headers.RetryAfter = retryAfter.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);

        Throttled.Add(1);
        // No IP or cookie material: the correlation id ties it to the request log line.
        logger.LogWarning(
            "Refresh throttled: {PermitLimit}/min limit reached; retry after {RetryAfterSeconds}s (correlation {CorrelationId})",
            PermitLimitPerMinute, retryAfter, rejected.HttpContext.TraceIdentifier);
    }
}
