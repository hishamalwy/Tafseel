using System.Data;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Tafseel.Domain.Common;

namespace Tafseel.Infrastructure.Persistence;

/// <summary>
/// The canonical transaction-scoped application lock.
/// <para>
/// <c>sp_getapplock</c> reports failure through its <b>return value</b>, not an exception. A plain
/// <c>EXEC</c> therefore succeeds as a SQL command even when the lock was never granted, and the caller
/// continues unlocked. Every lock in this codebase must go through this helper so that
/// "command executed" and "lock acquired" cannot diverge.
/// </para>
/// <para>
/// The lock is taken on the caller's own connection and ambient transaction, so it is released exactly
/// when that transaction ends. No second connection is opened and transaction ownership is unchanged.
/// </para>
/// </summary>
internal static class ApplicationLock
{
    private const int TimeoutMilliseconds = 10000;

    /// <summary>
    /// Acquires the lock or throws. Use for mutations that must never proceed unserialized.
    /// </summary>
    /// <exception cref="DomainException">
    /// A specific <c>lock_timeout</c>, <c>lock_cancelled</c>, <c>lock_deadlock</c>, or
    /// <c>lock_error</c> code when the lock could not be granted. The caller's transaction is left for
    /// the surrounding <c>using</c> to roll back, so no partial mutation is committed.
    /// </exception>
    public static async Task AcquireAsync(
        this DatabaseFacade database, string resource, CancellationToken ct)
    {
        var result = await ExecuteAsync(database, resource, ct);
        ThrowIfNotAcquired(result);
    }

    /// <summary>
    /// Attempts to acquire the lock, returning whether it was granted. Use only where the caller has an
    /// explicit safe fallback (for example a background pass that retries on its next run).
    /// </summary>
    public static async Task<bool> TryAcquireAsync(
        this DatabaseFacade database, string resource, CancellationToken ct)
        => (await ExecuteAsync(database, resource, ct)) >= 0;

    internal static void ThrowIfNotAcquired(int result)
    {
        if (result >= 0) return;
        throw result switch
        {
            -1 => new DomainException("lock_timeout", "The resource is busy. Please retry in a moment."),
            -2 => new DomainException("lock_cancelled", "Lock acquisition was cancelled."),
            -3 => new DomainException("lock_deadlock", "Lock acquisition was chosen as a deadlock victim."),
            _ => new DomainException("lock_error", "The application lock could not be acquired.")
        };
    }

    private static async Task<int> ExecuteAsync(
        DatabaseFacade database, string resource, CancellationToken ct)
    {
        // Providers without application locks (in-memory/SQLite test hosts) rely on the surrounding
        // Serializable transaction plus unique-index idempotency instead.
        if (!database.IsSqlServer()) return 0;

        var connection = database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
            await connection.OpenAsync(ct);

        // Executed as a stored procedure so the return value is readable. A composed SqlQuery cannot be
        // used: EF wraps it in a subquery, which is invalid around a procedure call and fails at runtime
        // rather than reporting a lock failure.
        await using var command = connection.CreateCommand();
        command.Transaction = database.CurrentTransaction?.GetDbTransaction();
        command.CommandType = CommandType.StoredProcedure;
        command.CommandText = "sp_getapplock";
        command.Parameters.Add(Text(command, "@Resource", resource));
        command.Parameters.Add(Text(command, "@LockMode", "Exclusive"));
        // Transaction-owned: released on commit or rollback, never leaked to the pooled connection.
        command.Parameters.Add(Text(command, "@LockOwner", "Transaction"));
        command.Parameters.Add(Number(command, "@LockTimeout", TimeoutMilliseconds));
        var result = command.CreateParameter();
        result.ParameterName = "@Result";
        result.DbType = DbType.Int32;
        result.Direction = ParameterDirection.ReturnValue;
        command.Parameters.Add(result);

        await command.ExecuteNonQueryAsync(ct);

        /* 0  granted immediately
           1  granted after waiting
          -1  timeout      -2  cancelled
          -3  deadlock     -999 parameter/validation error */
        return result.Value is int code ? code : -999;

        static DbParameter Text(DbCommand command, string name, string value)
        {
            var parameter = command.CreateParameter();
            parameter.ParameterName = name;
            parameter.DbType = DbType.String;
            parameter.Value = value;
            return parameter;
        }

        static DbParameter Number(DbCommand command, string name, int value)
        {
            var parameter = command.CreateParameter();
            parameter.ParameterName = name;
            parameter.DbType = DbType.Int32;
            parameter.Value = value;
            return parameter;
        }
    }
}
