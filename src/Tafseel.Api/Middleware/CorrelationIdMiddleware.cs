using Serilog.Context;

namespace Tafseel.Api.Middleware;

public sealed class CorrelationIdMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-Correlation-ID";

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.Request.Headers.TryGetValue(HeaderName, out var supplied)
            && Guid.TryParse(supplied, out var parsed)
                ? parsed.ToString()
                : Guid.NewGuid().ToString();

        context.Items[HeaderName] = correlationId;
        context.Response.Headers[HeaderName] = correlationId;
        using var _ = LogContext.PushProperty("CorrelationId", correlationId);
        await next(context);
    }
}
