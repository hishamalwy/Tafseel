using System.Data.Common;
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

        var correlationId = context.Items[CorrelationIdMiddleware.HeaderName] as string;
        var dbDetail = DescribeDatabaseException(exception);
        if (status >= 500 || dbDetail is not null)
        {
            logger.LogError(
                exception,
                "API request failed. Status={Status} Code={Code} TraceId={TraceId} CorrelationId={CorrelationId} Path={Path} DatabaseException={DatabaseException}",
                status,
                code,
                context.TraceIdentifier,
                correlationId,
                context.Request.Path.Value,
                dbDetail ?? "(none)");
        }
        else if (exception is DbUpdateException)
        {
            logger.LogWarning(
                exception,
                "Database update conflict. Status={Status} Code={Code} TraceId={TraceId} CorrelationId={CorrelationId} Path={Path} DatabaseException={DatabaseException}",
                status,
                code,
                context.TraceIdentifier,
                correlationId,
                context.Request.Path.Value,
                dbDetail ?? exception.Message);
        }

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

    private static string? DescribeDatabaseException(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is Microsoft.Data.SqlClient.SqlException sql)
                return $"SqlException #{sql.Number}: {sql.Message}";

            if (current is DbException db)
                return $"{db.GetType().Name}: {db.Message}";
        }

        // EF often surfaces missing-column / schema mismatches with an InvalidOperationException.
        if (exception is InvalidOperationException invalid
            && (invalid.Message.Contains("Invalid column", StringComparison.OrdinalIgnoreCase)
                || invalid.Message.Contains("Invalid object", StringComparison.OrdinalIgnoreCase)
                || invalid.InnerException is DbException))
            return $"InvalidOperationException: {invalid.Message}";

        return null;
    }
}
