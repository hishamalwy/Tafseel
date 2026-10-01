using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Seeding;

/// <summary>
/// Empties and rebuilds the database of a non-production environment: every table, view, routine and foreign key
/// is dropped, the migrations are applied from zero, and the canonical seed runs (docs/ENVIRONMENTS.md).
/// <para>
/// It works inside the existing database rather than dropping it, because shared hosts do not allow creating
/// databases. It refuses unless all of these hold:
/// the environment is Development, Staging or PreProduction; the configured connection names a database; that
/// database equals <c>Database:Name</c> in the same environment's configuration; and the operator typed that
/// name as the confirmation. There is no way to pass a connection string to it.
/// </para>
/// Private files in storage are left as they are; after a reset nothing refers to them.
/// </summary>
public static class DatabaseReset
{
    public static string TargetDatabase(IConfiguration configuration) =>
        new SqlConnectionStringBuilder(configuration.GetConnectionString("Tafseel") ?? "").InitialCatalog;

    /// <summary>Why a reset must not run, or null when it may.</summary>
    public static string? Refusal(IHostEnvironment environment, IConfiguration configuration, string? confirmation)
    {
        if (environment.IsProduction())
            return "Production is never reset.";
        if (!environment.AllowsDemoData())
            return $"Only Development, Staging and PreProduction can be reset; this host is '{environment.EnvironmentName}'.";
        var target = TargetDatabase(configuration);
        if (string.IsNullOrWhiteSpace(target))
            return "The configured connection string names no database.";
        var expected = configuration["Database:Name"];
        if (string.IsNullOrWhiteSpace(expected))
            return $"Database:Name is not set for {environment.EnvironmentName}; the reset will not guess which database is safe.";
        if (!string.Equals(expected, target, StringComparison.OrdinalIgnoreCase))
            return $"The configured connection points at '{target}', but {environment.EnvironmentName} expects '{expected}'.";
        if (!string.Equals(confirmation, target, StringComparison.Ordinal))
            return $"Type the database name to confirm: --confirm {target}";
        return null;
    }

    public static async Task<IReadOnlyList<string>> ResetAsync(
        IServiceProvider services, string? confirmation, string? seedPassword, SeedClock clock, CancellationToken ct = default)
    {
        var environment = services.GetRequiredService<IHostEnvironment>();
        var configuration = services.GetRequiredService<IConfiguration>();
        var refusal = Refusal(environment, configuration, confirmation);
        if (refusal is not null) throw new InvalidOperationException(refusal);
        if (string.IsNullOrWhiteSpace(seedPassword))
            throw new InvalidOperationException("Set SeedUsers:Password for this environment before resetting; the seed needs it.");

        var report = new List<string>();
        await using (var scope = services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            db.Database.SetCommandTimeout(TimeSpan.FromMinutes(5));
            await db.Database.ExecuteSqlRawAsync(DropEverything, ct);
            report.Add($"Emptied database '{TargetDatabase(configuration)}' ({environment.EnvironmentName}).");
            await db.Database.MigrateAsync(ct);
            report.Add($"Applied {(await db.Database.GetAppliedMigrationsAsync(ct)).Count()} migrations.");
        }
        report.AddRange(await EnvironmentSeed.RunAsync(services, seedPassword, clock, ct));
        return report;
    }

    private const string DropEverything = """
        DECLARE @sql nvarchar(max) = N'';
        SELECT @sql += N'ALTER TABLE ' + QUOTENAME(s.name) + N'.' + QUOTENAME(t.name) + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
        FROM sys.foreign_keys fk JOIN sys.tables t ON fk.parent_object_id = t.object_id JOIN sys.schemas s ON t.schema_id = s.schema_id;
        EXEC sp_executesql @sql;
        SET @sql = N'';
        SELECT @sql += N'DROP VIEW ' + QUOTENAME(s.name) + N'.' + QUOTENAME(v.name) + N';'
        FROM sys.views v JOIN sys.schemas s ON v.schema_id = s.schema_id WHERE v.is_ms_shipped = 0;
        EXEC sp_executesql @sql;
        SET @sql = N'';
        SELECT @sql += N'DROP ' + CASE o.type WHEN 'P' THEN N'PROCEDURE ' ELSE N'FUNCTION ' END + QUOTENAME(s.name) + N'.' + QUOTENAME(o.name) + N';'
        FROM sys.objects o JOIN sys.schemas s ON o.schema_id = s.schema_id
        WHERE o.is_ms_shipped = 0 AND o.type IN ('P', 'FN', 'IF', 'TF');
        EXEC sp_executesql @sql;
        SET @sql = N'';
        SELECT @sql += N'DROP TABLE ' + QUOTENAME(s.name) + N'.' + QUOTENAME(t.name) + N';'
        FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE t.is_ms_shipped = 0;
        EXEC sp_executesql @sql;
        """;
}
