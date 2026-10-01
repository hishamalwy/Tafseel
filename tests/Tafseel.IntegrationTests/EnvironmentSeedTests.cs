using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Orders;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Seeding;

namespace Tafseel.IntegrationTests;

/// <summary>
/// The one canonical seed (docs/ENVIRONMENTS.md): same baseline everywhere it runs, a Finance scenario lived through
/// the real services, idempotent, and never in Production.
/// </summary>
[Trait("Category", "SqlServer")]
public sealed class EnvironmentSeedTests(SqlServerTafseelApiFactory factory) : IClassFixture<SqlServerTafseelApiFactory>
{
    private const string Password = "Seed-tests-Password-1!";

    [Fact]
    public async Task The_seed_builds_the_demo_environment_once_and_its_ledger_balances()
    {
        var clock = new SeedClock();
        await using var host = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.AddSingleton(clock);
            services.AddSingleton<TimeProvider>(clock);
        }));
        var services = new EnvironmentOverride(host.Services, Environments.Staging);

        var first = await EnvironmentSeed.RunAsync(services, Password, clock);
        Assert.Contains(first, line => line.StartsWith("Finance scenario: completed purchase", StringComparison.Ordinal));
        var afterFirst = await SnapshotAsync(host.Services);

        var second = await EnvironmentSeed.RunAsync(services, Password, clock);
        Assert.Contains("Finance scenario: already present.", second);
        Assert.Equal(afterFirst, await SnapshotAsync(host.Services));

        await using var scope = host.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(["admin@gmail.com", "finance@gmail.com", "quality@gmail.com", "student@gmail.com", "teacher@gmail.com"],
            await db.Users.Select(x => x.Email!).OrderBy(x => x).ToArrayAsync());
        var statuses = await db.Orders.Select(x => x.Status).ToArrayAsync();
        Assert.Equal([OrderStatus.InProgress, OrderStatus.Completed, OrderStatus.Cancelled], statuses.Order().ToArray());
        Assert.Equal(WithdrawalStatus.Pending, (await db.WithdrawalRequests.SingleAsync()).Status);
        Assert.Equal(PayoutVerificationStatus.Verified, (await db.TeacherPayoutProfiles.SingleAsync()).Status);
        Assert.Equal(1, await db.Refunds.CountAsync());
        Assert.Equal(0, await db.ReconciliationExceptions.CountAsync(x => x.Status == ReconciliationExceptionStatus.Open));
        var entries = await db.LedgerEntries.Select(x => new { x.DebitAccountId, x.CreditAccountId, x.Amount }).ToArrayAsync();
        var balances = entries.SelectMany(x => new[] { (Account: x.CreditAccountId, Amount: x.Amount), (Account: x.DebitAccountId, Amount: -x.Amount) });
        Assert.Equal(0m, balances.Sum(x => x.Amount));
    }

    [Fact]
    public async Task Production_and_a_missing_password_are_refused_before_anything_is_written()
    {
        var clock = new SeedClock();
        var production = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            EnvironmentSeed.RunAsync(new EnvironmentOverride(factory.Services, Environments.Production), Password, clock));
        Assert.Contains("Production", production.Message);
        var blank = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            EnvironmentSeed.RunAsync(new EnvironmentOverride(factory.Services, Environments.Staging), " ", clock));
        Assert.Contains("SeedUsers__Password", blank.Message);
    }

    [Theory]
    [InlineData("Production", "Tafseel_Staging", "Tafseel_Staging", "Tafseel_Staging", "never reset")]
    [InlineData("Testing", "Tafseel_Staging", "Tafseel_Staging", "Tafseel_Staging", "Only Development")]
    [InlineData("Staging", "Tafseel_Staging", "", "Tafseel_Staging", "Database:Name")]
    [InlineData("Staging", "Tafseel_Development", "Tafseel_Staging", "Tafseel_Development", "expects")]
    [InlineData("Staging", "Tafseel_Staging", "Tafseel_Staging", "tafseel_staging", "confirm")]
    [InlineData("Staging", "Tafseel_Staging", "Tafseel_Staging", null, "confirm")]
    [InlineData("PreProduction", "db63194", "db63194", "Tafseel_Staging", "confirm")]
    public void A_reset_is_refused_unless_the_environment_the_database_and_the_confirmation_agree(
        string environment, string database, string expected, string? confirmation, string reason)
    {
        var refusal = DatabaseReset.Refusal(new Host(environment), Configuration(database, expected), confirmation);
        Assert.NotNull(refusal);
        Assert.Contains(reason, refusal);
    }

    [Theory]
    [InlineData("Development", "Tafseel_Development")]
    [InlineData("Staging", "Tafseel_Staging")]
    [InlineData("PreProduction", "db63194")]
    public void A_reset_may_run_on_its_own_environment_database_with_the_typed_name(string environment, string database) =>
        Assert.Null(DatabaseReset.Refusal(new Host(environment), Configuration(database, database), database));

    private static IConfiguration Configuration(string database, string expected) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Tafseel"] = $"Server=localhost;Database={database};Trusted_Connection=True",
            ["Database:Name"] = expected
        }).Build();

    private static async Task<string> SnapshotAsync(IServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return string.Join("|", await db.Users.CountAsync(), await db.Subjects.CountAsync(), await db.Topics.CountAsync(),
            await db.QualificationTopics.CountAsync(), await db.TeacherServices.CountAsync(), await db.LearningRequests.CountAsync(),
            await db.Orders.CountAsync(), await db.Payments.CountAsync(), await db.LedgerEntries.CountAsync(),
            await db.WithdrawalRequests.CountAsync(), await db.Promotions.CountAsync());
    }

    /// <summary>The test host under another environment name, as the `seed` command would see it.</summary>
    private sealed class EnvironmentOverride(IServiceProvider inner, string environment) : IServiceProvider
    {
        private readonly Host _host = new(environment);
        public object? GetService(Type serviceType) =>
            serviceType == typeof(IHostEnvironment) ? _host : inner.GetService(serviceType);
    }

    private sealed class Host(string environment) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environment;
        public string ApplicationName { get; set; } = "Tafseel.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
