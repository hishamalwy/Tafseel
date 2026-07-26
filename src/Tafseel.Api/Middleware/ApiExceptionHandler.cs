using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tafseel.Domain.Common;

namespace Tafseel.Api.Middleware;

public sealed class ApiExceptionHandler(
    IProblemDetailsService problemDetails,
    ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext context,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (status, code, title) = exception switch
        {
            DomainException domain when domain.Code.Contains("not_found", StringComparison.Ordinal)
                || domain.Code.Contains("not_owned", StringComparison.Ordinal) =>
                (404, domain.Code, domain.Message),
            DomainException domain when domain.Code.Contains("duplicate", StringComparison.Ordinal)
                || domain.Code.Contains("transition", StringComparison.Ordinal)
                || domain.Code.Contains("conflict", StringComparison.Ordinal) =>
                (409, domain.Code, domain.Message),
            DomainException domain => (400, domain.Code, domain.Message),
            DbUpdateConcurrencyException => (409, "concurrency_conflict", "The resource changed. Reload it and retry with the latest version."),
            DbUpdateException => (409, "database_conflict", "The operation conflicts with existing data."),
            _ => (500, "unexpected_error", "An unexpected error occurred.")
        };

        if (status == 500)
            logger.LogError(exception, "Unhandled request exception");

        context.Response.StatusCode = status;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = new ProblemDetails
            {
                Status = status,
                Title = title,
                Extensions = { ["code"] = code }
            },
            Exception = exception
        });
    }
}
