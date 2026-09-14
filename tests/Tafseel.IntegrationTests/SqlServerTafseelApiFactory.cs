using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.DependencyInjection;
using System.Data.Common;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

public sealed class SqlServerTafseelApiFactory : TafseelApiFactory
{
    private readonly string _connectionString = SqlServerTestDatabase.ConnectionString("Api");

    public FailRefreshRevocationInterceptor Failure { get; } = new();
    public CountingCommandInterceptor Commands { get; } = new();
    private int _disposed;

    protected override void ConfigureDatabase(IServiceCollection services)
    {
        RemoveDatabaseRegistration(services);
        services.AddDbContext<TafseelDbContext>(options =>
            options.UseSqlServer(_connectionString).AddInterceptors(Failure, Commands));
    }

    protected override void InitializeDatabase(IServiceProvider services) =>
        services.GetRequiredService<TafseelDbContext>().Database.Migrate();

    protected override void Dispose(bool disposing)
    {
        if (Interlocked.Exchange(ref _disposed, 1) == 1)
            return;
        try
        {
            base.Dispose(disposing);
        }
        finally
        {
            if (disposing)
                SqlServerTestDatabase.Drop(_connectionString);
        }
    }
}

/// <summary>
/// Names, creates and removes the throwaway SQL Server databases the integration tests use.
/// Every database is named <c>TafseelTest{Label}_{32 hex}</c> and nothing else is ever dropped.
/// </summary>
internal static partial class SqlServerTestDatabase
{
    // Databases from runs that were killed before disposal. Only ones older than this are swept,
    // so a suite running concurrently against the same server keeps its databases.
    private static readonly TimeSpan OrphanAge = TimeSpan.FromMinutes(
        int.TryParse(Environment.GetEnvironmentVariable("TAFSEEL_TEST_DB_ORPHAN_MINUTES"), out var minutes)
            ? Math.Max(0, minutes)
            : 120);
    private static readonly Lazy<int> Sweep = new(SweepOrphans, LazyThreadSafetyMode.ExecutionAndPublication);

    public static string ConnectionString(string label)
    {
        _ = Sweep.Value;
        var builder = ServerConnection();
        builder.InitialCatalog = $"TafseelTest{label}_{Guid.NewGuid():N}";
        builder.MultipleActiveResultSets = false;
        return builder.ConnectionString;
    }

    /// <summary>
    /// Drops the database through <c>master</c>. Unlike EnsureDeleted through the test host, this
    /// works whether the host started, failed while migrating, or has already been disposed.
    /// </summary>
    public static void Drop(string connectionString)
    {
        var database = new SqlConnectionStringBuilder(connectionString).InitialCatalog;
        if (!TestDatabaseName().IsMatch(database))
            throw new InvalidOperationException($"Refusing to drop '{database}': not a test database name.");
        using (var pooled = new SqlConnection(connectionString))
            SqlConnection.ClearPool(pooled);
        using var connection = new SqlConnection(Master(connectionString));
        connection.Open();
        DropDatabase(connection, database);
    }

    public static async Task DropAsync(string connectionString)
    {
        var database = new SqlConnectionStringBuilder(connectionString).InitialCatalog;
        if (!TestDatabaseName().IsMatch(database))
            throw new InvalidOperationException($"Refusing to drop '{database}': not a test database name.");
        await using (var pooled = new SqlConnection(connectionString))
            SqlConnection.ClearPool(pooled);
        await using var connection = new SqlConnection(Master(connectionString));
        await connection.OpenAsync();
        DropDatabase(connection, database);
    }

    private static int SweepOrphans()
    {
        var dropped = 0;
        try
        {
            using var connection = new SqlConnection(Master(ServerConnection().ConnectionString));
            connection.Open();
            var candidates = new List<string>();
            using (var query = connection.CreateCommand())
            {
                query.CommandText =
                    "SELECT name FROM sys.databases WHERE name LIKE 'TafseelTest%' AND create_date < DATEADD(minute, -@age, GETDATE())";
                query.Parameters.AddWithValue("@age", (int)OrphanAge.TotalMinutes);
                using var reader = query.ExecuteReader();
                while (reader.Read())
                    candidates.Add(reader.GetString(0));
            }
            foreach (var database in candidates.Where(x => TestDatabaseName().IsMatch(x)))
            {
                DropDatabase(connection, database);
                dropped++;
            }
        }
        catch (SqlException exception)
        {
            // Best effort: an unreachable server fails the tests themselves with a clearer error.
            Console.Error.WriteLine($"Test database orphan sweep skipped: {exception.Message}");
        }
        return dropped;
    }

    private static void DropDatabase(SqlConnection master, string database)
    {
        using var command = master.CreateCommand();
        var quoted = "[" + database.Replace("]", "]]") + "]";
        command.CommandText =
            $"IF DB_ID(@database) IS NOT NULL BEGIN ALTER DATABASE {quoted} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE {quoted}; END";
        command.Parameters.AddWithValue("@database", database);
        command.ExecuteNonQuery();
    }

    private static SqlConnectionStringBuilder ServerConnection()
    {
        var configured = Environment.GetEnvironmentVariable("TAFSEEL_SQLSERVER_TEST_CONNECTION");
        return string.IsNullOrWhiteSpace(configured)
            ? new SqlConnectionStringBuilder(
                "Server=(localdb)\\mssqllocaldb;Trusted_Connection=True;MultipleActiveResultSets=false;TrustServerCertificate=True")
            : new SqlConnectionStringBuilder(configured);
    }

    private static string Master(string connectionString) =>
        new SqlConnectionStringBuilder(connectionString) { InitialCatalog = "master", Pooling = false }.ConnectionString;

    [System.Text.RegularExpressions.GeneratedRegex("^TafseelTest[A-Za-z0-9]+_[0-9a-f]{32}$")]
    private static partial System.Text.RegularExpressions.Regex TestDatabaseName();
}

public sealed class CountingCommandInterceptor : DbCommandInterceptor
{
    private int _readCount;
    private int _writeCount;
    public int ReadCount => Volatile.Read(ref _readCount);
    public int WriteCount => Volatile.Read(ref _writeCount);
    public void Reset()
    {
        Interlocked.Exchange(ref _readCount, 0);
        Interlocked.Exchange(ref _writeCount, 0);
    }
    public override InterceptionResult<DbDataReader> ReaderExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
    {
        Interlocked.Increment(ref _readCount);
        return result;
    }
    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        Interlocked.Increment(ref _readCount);
        return ValueTask.FromResult(result);
    }
    public override InterceptionResult<int> NonQueryExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<int> result)
    {
        Interlocked.Increment(ref _writeCount);
        return result;
    }
    public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
        DbCommand command, CommandEventData eventData, InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Interlocked.Increment(ref _writeCount);
        return ValueTask.FromResult(result);
    }
}

public sealed class FailRefreshRevocationInterceptor : SaveChangesInterceptor
{
    private int _failNext;

    public void FailNext() => Interlocked.Exchange(ref _failNext, 1);

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (Volatile.Read(ref _failNext) == 1
            && eventData.Context!.ChangeTracker.Entries<RefreshToken>()
                .Any(x => x.State == EntityState.Modified && x.Entity.RevokedAt is not null)
            && Interlocked.Exchange(ref _failNext, 0) == 1)
            throw new InvalidOperationException("Controlled refresh-token revocation failure.");

        return ValueTask.FromResult(result);
    }
}
