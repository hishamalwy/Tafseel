using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

namespace Tafseel.Infrastructure.Identity;

/// <summary>
/// Bounded retry for Identity bootstrap during application startup.
/// Owns retry policy for the startup transaction as a single unit. Global EF
/// <c>EnableRetryOnFailure</c> is not used because it conflicts with user-initiated
/// transactions elsewhere in Infrastructure.
/// </summary>
internal static class IdentityStartupRetry
{
    public const int MaxAttempts = 5;

    /// <summary>
    /// Azure SQL / SQL Server transient error numbers commonly seen during cold start
    /// and throttling (see also SqlClient <see cref="SqlException.IsTransient"/>).
    /// </summary>
    internal static readonly int[] TransientSqlErrorNumbers =
    [
        40613, // Database is not currently available
        40197, // Service error processing request; retry
        40501, // Service is busy
        49918, // Not enough resources
        49919, // Too many create/update operations
        49920  // Too many operations in progress
    ];

    public static async Task ExecuteAsync(
        Func<Task> operation,
        ILogger logger,
        Func<int, TimeSpan>? delayFactory = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(operation);
        ArgumentNullException.ThrowIfNull(logger);
        delayFactory ??= DelayFactoryOverride ?? DefaultDelay;

        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            try
            {
                await operation().ConfigureAwait(false);
                return;
            }
            catch (Exception exception) when (IsTransient(exception, out var sqlErrorNumber))
            {
                if (attempt >= MaxAttempts)
                {
                    throw new InvalidOperationException(
                        $"Identity initialization failed after {MaxAttempts} attempts due to transient SQL Server/Azure SQL unavailability"
                        + (sqlErrorNumber is null ? "." : $" (SQL error {sqlErrorNumber})."),
                        exception);
                }

                var delay = delayFactory(attempt);
                logger.LogWarning(
                    exception,
                    "Identity initialization attempt {Attempt} of {MaxAttempts} failed with transient SQL error {SqlErrorNumber}; retrying after {Delay}.",
                    attempt,
                    MaxAttempts,
                    sqlErrorNumber?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? "n/a",
                    delay);

                await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    /// <summary>Test hook to avoid multi-second backoff in unit tests.</summary>
    internal static Func<int, TimeSpan>? DelayFactoryOverride { get; set; }

    public static bool IsTransient(Exception exception) =>
        IsTransient(exception, out _);

    public static bool IsTransient(Exception exception, out int? sqlErrorNumber)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            switch (current)
            {
                case TimeoutException:
                    sqlErrorNumber = null;
                    return true;
                case SqlException sqlException:
                    sqlErrorNumber = sqlException.Number;
                    if (sqlException.IsTransient)
                        return true;
                    if (TransientSqlErrorNumbers.Contains(sqlException.Number))
                        return true;
                    foreach (SqlError error in sqlException.Errors)
                    {
                        if (TransientSqlErrorNumbers.Contains(error.Number))
                        {
                            sqlErrorNumber = error.Number;
                            return true;
                        }
                    }

                    break;
            }
        }

        sqlErrorNumber = null;
        return false;
    }

    internal static TimeSpan DefaultDelay(int failedAttempt) =>
        TimeSpan.FromSeconds(Math.Pow(2, failedAttempt - 1));
}
