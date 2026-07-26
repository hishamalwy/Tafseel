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
        if (disposing)
        {
            using var scope = Services.CreateScope();
            scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Database.EnsureDeleted();
        }
        base.Dispose(disposing);
    }
}

internal static class SqlServerTestDatabase
{
    public static string ConnectionString(string label)
    {
        var configured = Environment.GetEnvironmentVariable("TAFSEEL_SQLSERVER_TEST_CONNECTION");
        var builder = string.IsNullOrWhiteSpace(configured)
            ? new SqlConnectionStringBuilder(
                "Server=(localdb)\\mssqllocaldb;Trusted_Connection=True;MultipleActiveResultSets=false;TrustServerCertificate=True")
            : new SqlConnectionStringBuilder(configured);
        builder.InitialCatalog = $"TafseelTest{label}_{Guid.NewGuid():N}";
        builder.MultipleActiveResultSets = false;
        return builder.ConnectionString;
    }
}

public sealed class CountingCommandInterceptor : DbCommandInterceptor
{
    private int _readCount;
    public int ReadCount => Volatile.Read(ref _readCount);
    public void Reset() => Interlocked.Exchange(ref _readCount, 0);
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
