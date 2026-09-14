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
        // Client gone: writing a problem document fails and used to surface as 500 on Admin
        // fan-out (LocalDB "Operation cancelled by user" after the browser aborted in-flight GETs).
        if (context.RequestAborted.IsCancellationRequested
            && (exception is OperationCanceledException || IsSqlCommandCancelled(exception)))
            return true;

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
            _ when IsSqlCommandCancelled(exception) =>
                (StatusCodes.Status503ServiceUnavailable, "database_busy",
                    "The database was busy. Retry the request."),
            _ => (500, "unexpected_error", "An unexpected error occurred.")
        };

        var correlationId = context.Items[CorrelationIdMiddleware.HeaderName] as string;
        var dbDetail = DescribeDatabaseException(exception);
        if (status == StatusCodes.Status503ServiceUnavailable)
        {
            logger.LogWarning(
                exception,
                "API request retried-as-busy. Status={Status} Code={Code} TraceId={TraceId} CorrelationId={CorrelationId} Path={Path} DatabaseException={DatabaseException}",
                status,
                code,
                context.TraceIdentifier,
                correlationId,
                context.Request.Path.Value,
                dbDetail ?? "(none)");
        }
        else if (status >= 500 || dbDetail is not null)
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

    private static bool IsSqlCommandCancelled(Exception exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is OperationCanceledException or TimeoutException)
                return true;
            if (current is Microsoft.Data.SqlClient.SqlException sql)
            {
                // LocalDB aborts in-flight commands when the client disconnects, another
                // request occupies the session (MARS off), or the command times out.
                // Those used to surface as 500 unexpected_error on Admin Home.
                if (sql.Number is -2 or -1 or 2 or 1205 or 1222 or 3980)
                    return true;
                var message = sql.Message;
                if (message.Contains("Operation cancelled", StringComparison.OrdinalIgnoreCase)
                    || message.Contains("Operation canceled", StringComparison.OrdinalIgnoreCase)
                    || message.Contains("Timeout", StringComparison.OrdinalIgnoreCase)
                    || message.Contains("severe error", StringComparison.OrdinalIgnoreCase)
                    || message.Contains("batch is aborted", StringComparison.OrdinalIgnoreCase)
                    || message.Contains("session busy", StringComparison.OrdinalIgnoreCase)
                    || message.Contains("results, if any, should be discarded", StringComparison.OrdinalIgnoreCase))
                    return true;
            }
        }

        return false;
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
