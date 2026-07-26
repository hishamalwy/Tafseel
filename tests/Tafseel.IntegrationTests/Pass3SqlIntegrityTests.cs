using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
public sealed class Pass3SqlConstraintTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Sql_constraints_reject_invalid_ranges_enums_and_historical_cascades()
    {
        var reviewer = await Pass3TestData.CreateUserAsync(factory.Services, Roles.QualityReviewer);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var (subject, topic) = await Pass3TestData.SeedCatalogAsync(factory.Services);
        var application = await Pass3TestData.SeedApplicationAsync(
            factory.Services, teacher.Id, subject, topic, TeacherApplicationStatus.Approved, reviewer.Id);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var reviewId = await db.Set<TeacherApplicationReview>()
            .Where(x => x.TeacherApplicationId == application.Id)
            .Select(x => x.Id)
            .SingleAsync();
        var historyId = await db.Set<TeacherApplicationStatusHistory>()
            .Where(x => x.TeacherApplicationId == application.Id)
            .Select(x => x.Id)
            .FirstAsync();

        await AssertConstraint(db,
            $"UPDATE [TeacherApplications] SET [ExperienceYears] = {-1} WHERE [Id] = {application.Id}");
        await AssertConstraint(db,
            $"UPDATE [TeacherApplications] SET [ExperienceYears] = {81} WHERE [Id] = {application.Id}");
        await AssertConstraint(db,
            $"UPDATE [TeacherApplications] SET [DemoDurationSeconds] = {0} WHERE [Id] = {application.Id}");
        await AssertConstraint(db,
            $"UPDATE [TeacherApplications] SET [DemoDurationSeconds] = {601} WHERE [Id] = {application.Id}");
        await AssertConstraint(db,
            $"UPDATE [TeacherApplications] SET [Status] = {99} WHERE [Id] = {application.Id}");
        await AssertConstraint(db,
            $"UPDATE [TeacherApplications] SET [Priority] = {99} WHERE [Id] = {application.Id}");
        await AssertConstraint(db,
            $"UPDATE [QualificationTopics] SET [MaxVideoSeconds] = {29} WHERE [Id] = {topic.Id}");
        await AssertConstraint(db,
            $"UPDATE [QualificationTopics] SET [MaxVideoSeconds] = {601} WHERE [Id] = {topic.Id}");
        await AssertConstraint(db,
            $"UPDATE [TeacherApplicationReview] SET [Decision] = {99} WHERE [Id] = {reviewId}");
        await AssertConstraint(db,
            $"UPDATE [TeacherEvaluationScore] SET [Score] = {0} WHERE [TeacherApplicationReviewId] = {reviewId} AND [Criterion] = {0}");
        await AssertConstraint(db,
            $"UPDATE [TeacherEvaluationScore] SET [Score] = {6} WHERE [TeacherApplicationReviewId] = {reviewId} AND [Criterion] = {0}");
        await AssertConstraint(db,
            $"UPDATE [TeacherEvaluationScore] SET [Criterion] = {99} WHERE [TeacherApplicationReviewId] = {reviewId} AND [Criterion] = {0}");
        await AssertConstraint(db,
            $"UPDATE [TeacherApplicationStatusHistory] SET [NextStatus] = {99} WHERE [Id] = {historyId}");
        await AssertConstraint(db,
            $"DELETE FROM [TeacherApplications] WHERE [Id] = {application.Id}");

        Assert.Equal(1, await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE [TeacherApplications] SET [ExperienceYears] = {0}, [DemoDurationSeconds] = {1}, [Priority] = {0}, [Status] = {0} WHERE [Id] = {application.Id}"));
        Assert.Equal(1, await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE [TeacherApplications] SET [ExperienceYears] = {80}, [DemoDurationSeconds] = {600}, [Priority] = {2}, [Status] = {6} WHERE [Id] = {application.Id}"));
        Assert.Equal(1, await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE [QualificationTopics] SET [MaxVideoSeconds] = {30} WHERE [Id] = {topic.Id}"));
        Assert.Equal(1, await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE [QualificationTopics] SET [MaxVideoSeconds] = {600} WHERE [Id] = {topic.Id}"));
        Assert.Equal(1, await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE [TeacherApplicationReview] SET [Decision] = {2} WHERE [Id] = {reviewId}"));
        Assert.Equal(1, await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE [TeacherEvaluationScore] SET [Score] = {1} WHERE [TeacherApplicationReviewId] = {reviewId} AND [Criterion] = {0}"));
        Assert.Equal(1, await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE [TeacherEvaluationScore] SET [Score] = {5} WHERE [TeacherApplicationReviewId] = {reviewId} AND [Criterion] = {8}"));
    }

    private static async Task AssertConstraint(TafseelDbContext db, FormattableString sql)
    {
        var error = await Assert.ThrowsAsync<SqlException>(
            () => db.Database.ExecuteSqlInterpolatedAsync(sql));
        Assert.Equal(547, error.Number);
    }
}

[Trait("Category", "SqlServer")]
public sealed class Pass3MigrationTests
{
    [Fact]
    public async Task Fresh_and_previous_state_migrations_succeed_with_deterministic_backfill()
    {
        await VerifyFreshMigration();
        await VerifyUpgradeMigration();
        await VerifyDuplicateAbort();
    }

    private static async Task VerifyFreshMigration()
    {
        var connectionString = ConnectionString("Fresh");
        try
        {
            await using var db = CreateContext(connectionString);
            await db.Database.MigrateAsync();
            var count = await db.Database.SqlQueryRaw<int>(
                "SELECT COUNT(*) AS [Value] FROM sys.check_constraints WHERE [name] LIKE 'CK_%'")
                .SingleAsync();
            Assert.True(count >= 17);
        }
        finally
        {
            await DropDatabase(connectionString);
        }
    }

    private static async Task VerifyUpgradeMigration()
    {
        var connectionString = ConnectionString("Upgrade");
        try
        {
            await using var db = CreateContext(connectionString);
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync("20260726123640_Pass2EmailConfirmation");
            var id = Guid.NewGuid();
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO [Subjects] ([Id], [Name], [IsActive], [Icon]) VALUES ({id}, {"  Data   Science  "}, {true}, {"code"})");

            await migrator.MigrateAsync();

            var normalized = await db.Database.SqlQuery<string>(
                $"SELECT [NormalizedName] AS [Value] FROM [Subjects] WHERE [Id] = {id}")
                .SingleAsync();
            Assert.Equal("DATA SCIENCE", normalized);
        }
        finally
        {
            await DropDatabase(connectionString);
        }
    }

    private static async Task VerifyDuplicateAbort()
    {
        var connectionString = ConnectionString("DuplicateAbort");
        try
        {
            await using var db = CreateContext(connectionString);
            var migrator = db.GetService<IMigrator>();
            await migrator.MigrateAsync("20260726123640_Pass2EmailConfirmation");
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO [Subjects] ([Id], [Name], [IsActive], [Icon]) VALUES ({Guid.NewGuid()}, {"Data Science"}, {true}, {"code"})");
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO [Subjects] ([Id], [Name], [IsActive], [Icon]) VALUES ({Guid.NewGuid()}, {" Data   Science "}, {true}, {"code"})");

            var error = await Assert.ThrowsAsync<SqlException>(() => migrator.MigrateAsync());

            Assert.Equal(51000, error.Number);
            Assert.Contains("duplicate normalized Subject names", error.Message);
        }
        finally
        {
            await DropDatabase(connectionString);
        }
    }

    private static TafseelDbContext CreateContext(string connectionString) =>
        new(new DbContextOptionsBuilder<TafseelDbContext>()
            .UseSqlServer(connectionString)
            .Options);

    private static string ConnectionString(string label) =>
        SqlServerTestDatabase.ConnectionString($"Migration{label}");

    private static async Task DropDatabase(string connectionString)
    {
        var builder = new SqlConnectionStringBuilder(connectionString);
        var database = builder.InitialCatalog;
        builder.InitialCatalog = "master";
        await using var connection = new SqlConnection(builder.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText =
            $"IF DB_ID(@database) IS NOT NULL BEGIN ALTER DATABASE [{database.Replace("]", "]]")}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{database.Replace("]", "]]")}]; END";
        command.Parameters.AddWithValue("@database", database);
        await command.ExecuteNonQueryAsync();
    }
}
