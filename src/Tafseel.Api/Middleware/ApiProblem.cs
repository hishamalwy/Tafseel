using Microsoft.AspNetCore.Mvc;

namespace Tafseel.Api.Middleware;

public static class ApiProblem
{
    public static ProblemDetails Create(
        HttpContext context,
        int status,
        string code,
        string title,
        string? detail = null)
    {
        var problem = new ProblemDetails { Status = status, Title = title, Detail = detail };
        problem.Extensions["code"] = code;
        problem.Extensions["traceId"] = context.TraceIdentifier;
        if (context.Items[CorrelationIdMiddleware.HeaderName] is string correlationId)
            problem.Extensions["correlationId"] = correlationId;
        return problem;
    }

    public static Task WriteAsync(
        HttpContext context,
        int status,
        string code,
        string title,
        string? detail = null)
    {
        context.Response.StatusCode = status;
        return context.Response.WriteAsJsonAsync(Create(context, status, code, title, detail));
    }
}
