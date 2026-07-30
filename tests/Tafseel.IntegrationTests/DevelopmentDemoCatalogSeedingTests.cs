using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Tafseel.Infrastructure;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>
/// Opt-in Development-only demo catalog content (subjects/topics/qualification topics/education
/// levels), ADR-013. Independent of SeedUsersOptions; mirrors the harness already used by
/// DevelopmentDemoUserSeedingTests for the same InitializeIdentityAsync pipeline.
/// </summary>
public sealed class DevelopmentDemoCatalogSeedingTests
{
    private static readonly string[] ExpectedSubjects =
    [
        "Mathematics", "Physics", "Chemistry", "Biology",
        "English Language", "Arabic Language", "Computer Science"
    ];

    [Fact]
    public async Task Disabled_by_default_does_not_seed_demo_catalog()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        // No SeedDemoDataOptions registered: mirrors production default (section absent -> Enabled=false).
        await using var services = Services(database, Environments.Development).BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();

        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Empty(await db.Subjects.ToArrayAsync());
        Assert.Empty(await db.Topics.ToArrayAsync());
        Assert.Empty(await db.QualificationTopics.ToArrayAsync());
        Assert.Empty(await db.EducationLevels.ToArrayAsync());
    }

    [Fact]
    public async Task Development_enabled_seeds_subjects_topics_qualification_topics_and_education_levels()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(
                database, Environments.Development, new SeedDemoDataOptions { Enabled = true })
            .BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();

        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var subjects = await db.Subjects.ToArrayAsync();
        Assert.Equal(ExpectedSubjects.Length, subjects.Length);
        foreach (var name in ExpectedSubjects)
        {
            var subject = Assert.Single(subjects, x => x.Name == name);
            Assert.NotEmpty(subject.NameAr);
            Assert.NotEmpty(subject.Icon);
            Assert.True(subject.IsActive);

            var topics = await db.Topics.Where(x => x.SubjectId == subject.Id).ToArrayAsync();
            Assert.NotEmpty(topics);

            var qualificationTopics = await db.QualificationTopics.Where(x => x.SubjectId == subject.Id).ToArrayAsync();
            var qualificationTopic = Assert.Single(qualificationTopics);
            Assert.NotEmpty(qualificationTopic.TitleAr);
            Assert.NotEmpty(qualificationTopic.InstructionsAr);
            Assert.InRange(qualificationTopic.MinVideoSeconds, 30, qualificationTopic.ExpectedVideoSeconds);
            Assert.InRange(qualificationTopic.ExpectedVideoSeconds, qualificationTopic.MinVideoSeconds, qualificationTopic.MaxVideoSeconds);
            Assert.InRange(qualificationTopic.MaxVideoSeconds, qualificationTopic.ExpectedVideoSeconds, 600);
        }

        var levels = await db.EducationLevels.ToArrayAsync();
        Assert.Equal(4, levels.Length);
        Assert.All(levels, x => Assert.NotEmpty(x.NameAr));
    }

    [Fact]
    public async Task Repeated_seeding_does_not_duplicate_catalog_content()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(
                database, Environments.Development, new SeedDemoDataOptions { Enabled = true })
            .BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();
        await services.InitializeIdentityAsync();
        await services.InitializeIdentityAsync();

        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(ExpectedSubjects.Length, await db.Subjects.CountAsync());
        Assert.Equal(4, await db.EducationLevels.CountAsync());
        foreach (var name in ExpectedSubjects)
            Assert.Equal(1, await db.Subjects.CountAsync(x => x.Name == name));
    }

    [Fact]
    public async Task Partial_state_is_repaired_missing_subject_and_topic_are_recreated()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(
                database, Environments.Development, new SeedDemoDataOptions { Enabled = true })
            .BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();

        await using (var scope = services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            // Drift #1: delete an entire subject (cascades its topics/qualification topics).
            var mathematics = await db.Subjects.SingleAsync(x => x.Name == "Mathematics");
            db.Topics.RemoveRange(db.Topics.Where(x => x.SubjectId == mathematics.Id));
            db.QualificationTopics.RemoveRange(db.QualificationTopics.Where(x => x.SubjectId == mathematics.Id));
            db.Subjects.Remove(mathematics);

            // Drift #2: delete just one topic under an otherwise-intact subject.
            var physics = await db.Subjects.SingleAsync(x => x.Name == "Physics");
            var mechanics = await db.Topics.SingleAsync(x => x.SubjectId == physics.Id && x.Name == "Mechanics");
            db.Topics.Remove(mechanics);

            await db.SaveChangesAsync();
        }

        await services.InitializeIdentityAsync();

        await using var verification = services.CreateAsyncScope();
        var verifyDb = verification.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(ExpectedSubjects.Length, await verifyDb.Subjects.CountAsync());

        var recreatedMathematics = await verifyDb.Subjects.SingleAsync(x => x.Name == "Mathematics");
        Assert.NotEmpty(await verifyDb.Topics.Where(x => x.SubjectId == recreatedMathematics.Id).ToArrayAsync());
        Assert.NotEmpty(await verifyDb.QualificationTopics.Where(x => x.SubjectId == recreatedMathematics.Id).ToArrayAsync());

        var repairedPhysics = await verifyDb.Subjects.SingleAsync(x => x.Name == "Physics");
        Assert.Contains(
            await verifyDb.Topics.Where(x => x.SubjectId == repairedPhysics.Id).Select(x => x.Name).ToArrayAsync(),
            name => name == "Mechanics");
    }

    [Fact]
    public async Task Demo_catalog_is_never_seeded_in_production_even_when_enabled()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(
                database, Environments.Production, new SeedDemoDataOptions { Enabled = true })
            .BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();

        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Empty(await db.Subjects.ToArrayAsync());
    }

    [Fact]
    public async Task Demo_catalog_is_never_seeded_in_staging_even_when_enabled()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(
                database, Environments.Staging, new SeedDemoDataOptions { Enabled = true })
            .BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();

        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Empty(await db.Subjects.ToArrayAsync());
    }

    private static ServiceCollection Services(
        SqliteConnection database,
        string environment,
        SeedDemoDataOptions? seedDemoData = null)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment(environment));
        services.AddDbContext<TafseelDbContext>(options => options.UseSqlite(database));
        services.AddIdentityCore<ApplicationUser>().AddRoles<IdentityRole>().AddEntityFrameworkStores<TafseelDbContext>();
        if (seedDemoData is not null)
            services.AddSingleton(Options.Create(seedDemoData));
        return services;
    }

    private static async Task EnsureCreated(ServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Database.EnsureCreatedAsync();
    }

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "Tafseel.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
