using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Tafseel.Application.Authorization;
using Tafseel.Infrastructure;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>
/// Opt-in Development-only demo user seeding (ADR-012). SeedUsersOptions is registered directly
/// via Options.Create/AddOptions rather than AddInfrastructure, mirroring the lightweight harness
/// already used by RoleBootstrapTests for the same seeding pipeline.
/// </summary>
public sealed class DevelopmentDemoUserSeedingTests
{
    // Test-only value; satisfies the app's real password policy. Never used outside these tests.
    private const string ValidPassword = "Dev-Local-Passw0rd!";

    private static readonly Dictionary<string, string> ExpectedAccounts = new(StringComparer.OrdinalIgnoreCase)
    {
        ["admin@gmail.com"] = Roles.Admin,
        ["student@gmail.com"] = Roles.Student,
        ["teacher@gmail.com"] = Roles.Teacher,
        ["quality@gmail.com"] = Roles.QualityReviewer
    };

    [Fact]
    public async Task Disabled_by_default_does_not_seed_development_demo_users()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        // No SeedUsersOptions registered at all: mirrors production default (section absent -> Enabled=false).
        await using var services = Services(database, Environments.Development).BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();

        await using var scope = services.CreateAsyncScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Users.ToArrayAsync());
    }

    [Fact]
    public async Task Explicitly_disabled_does_not_seed_development_demo_users()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(
                database, Environments.Development, new SeedUsersOptions { Enabled = false })
            .BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();

        await using var scope = services.CreateAsyncScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Users.ToArrayAsync());
    }

    [Fact]
    public async Task Development_enabled_seeds_all_four_demo_accounts_with_roles_and_confirmed_email()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(
                database, Environments.Development,
                new SeedUsersOptions { Enabled = true, Password = ValidPassword })
            .BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();

        await using var scope = services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(4, await db.Users.CountAsync());
        foreach (var (email, role) in ExpectedAccounts)
        {
            var user = await users.FindByEmailAsync(email);
            Assert.NotNull(user);
            Assert.True(user!.EmailConfirmed);
            Assert.Equal([role], await users.GetRolesAsync(user));
            Assert.True(await users.CheckPasswordAsync(user, ValidPassword));
        }
    }

    [Fact]
    public async Task Repeated_seeding_does_not_duplicate_accounts()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(
                database, Environments.Development,
                new SeedUsersOptions { Enabled = true, Password = ValidPassword })
            .BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();
        await services.InitializeIdentityAsync();
        await services.InitializeIdentityAsync();

        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(4, await db.Users.CountAsync());
        foreach (var email in ExpectedAccounts.Keys)
            Assert.Equal(1, await db.Users.CountAsync(x => x.Email == email));
    }

    [Fact]
    public async Task Partial_state_is_repaired_missing_user_role_and_confirmation()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        var options = new SeedUsersOptions { Enabled = true, Password = ValidPassword };
        await using var services = Services(database, Environments.Development, options).BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();

        string preservedAdminId, preservedQualityId;
        await using (var scope = services.CreateAsyncScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

            // Drift #1: remove a role assignment.
            var student = (await users.FindByEmailAsync("student@gmail.com"))!;
            Assert.True((await users.RemoveFromRoleAsync(student, Roles.Student)).Succeeded);

            // Drift #2: un-confirm an email.
            var admin = (await users.FindByEmailAsync("admin@gmail.com"))!;
            admin.EmailConfirmed = false;
            Assert.True((await users.UpdateAsync(admin)).Succeeded);
            preservedAdminId = admin.Id;

            // Drift #3: delete an account entirely.
            var teacher = (await users.FindByEmailAsync("teacher@gmail.com"))!;
            Assert.True((await users.DeleteAsync(teacher)).Succeeded);

            preservedQualityId = (await users.FindByEmailAsync("quality@gmail.com"))!.Id;
        }

        await services.InitializeIdentityAsync();

        await using var verification = services.CreateAsyncScope();
        var verifyUsers = verification.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var db = verification.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(4, await db.Users.CountAsync());

        var repairedStudent = (await verifyUsers.FindByEmailAsync("student@gmail.com"))!;
        Assert.True(await verifyUsers.IsInRoleAsync(repairedStudent, Roles.Student));

        var repairedAdmin = (await verifyUsers.FindByEmailAsync("admin@gmail.com"))!;
        Assert.True(repairedAdmin.EmailConfirmed);
        Assert.Equal(preservedAdminId, repairedAdmin.Id); // repaired in place, not recreated

        var recreatedTeacher = (await verifyUsers.FindByEmailAsync("teacher@gmail.com"))!;
        Assert.True(recreatedTeacher.EmailConfirmed);
        Assert.Equal([Roles.Teacher], await verifyUsers.GetRolesAsync(recreatedTeacher));

        // Untouched account is left exactly as-is.
        Assert.Equal(preservedQualityId, (await verifyUsers.FindByEmailAsync("quality@gmail.com"))!.Id);
    }

    [Fact]
    public async Task Existing_password_is_not_reset_on_repeated_startup()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        var options = new SeedUsersOptions { Enabled = true, Password = ValidPassword };
        await using var services = Services(database, Environments.Development, options).BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();
        await services.InitializeIdentityAsync();
        await services.InitializeIdentityAsync();

        await using var verification = services.CreateAsyncScope();
        var users = verification.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var admin = (await users.FindByEmailAsync("admin@gmail.com"))!;
        Assert.True(await users.CheckPasswordAsync(admin, ValidPassword));
    }

    [Fact]
    public async Task Demo_users_are_never_created_in_production_even_when_enabled()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(
                database, Environments.Production,
                new SeedUsersOptions { Enabled = true, Password = ValidPassword })
            .BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();

        await using var scope = services.CreateAsyncScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Users.ToArrayAsync());
    }

    [Fact]
    public async Task Staging_enabled_still_only_runs_the_preexisting_staging_path_not_development_seeding()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        // A distinct password proves that if the Development path ran here, accounts would accept
        // this password instead of the legacy Staging "@Admin123" — it must not.
        await using var services = Services(
                database, Environments.Staging,
                new SeedUsersOptions { Enabled = true, Password = ValidPassword })
            .BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();

        await using var scope = services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(4, await db.Users.CountAsync());
        var admin = (await users.FindByEmailAsync("admin@gmail.com"))!;
        Assert.True(await users.CheckPasswordAsync(admin, "@Admin123"));
        Assert.False(await users.CheckPasswordAsync(admin, ValidPassword));
    }

    [Fact]
    public async Task Missing_password_fails_with_a_clear_safe_configuration_error_in_development()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(
                database, Environments.Development,
                new SeedUsersOptions { Enabled = true, Password = null })
            .BuildServiceProvider();
        await EnsureCreated(services);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => services.InitializeIdentityAsync());

        Assert.Contains("SeedUsers", exception.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(ValidPassword, exception.Message, StringComparison.Ordinal);

        await using var scope = services.CreateAsyncScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Users.ToArrayAsync());
    }

    [Fact]
    public async Task Concurrent_initialization_does_not_duplicate_or_corrupt_demo_users()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"tafseel-seed-race-{Guid.NewGuid():N}.db");
        var connectionString = $"Data Source={dbPath}";
        try
        {
            async Task InitializeAsync()
            {
                await using var services = FileServices(
                        connectionString, Environments.Development,
                        new SeedUsersOptions { Enabled = true, Password = ValidPassword })
                    .BuildServiceProvider();
                await using (var scope = services.CreateAsyncScope())
                    await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Database.EnsureCreatedAsync();
                await services.InitializeIdentityAsync();
            }

            // Two independent connections/contexts racing against the same on-disk database. SQLite
            // arbitrates writers itself; a losing writer may throw (acceptable) but must never leave
            // duplicate or half-written demo accounts, and a task that returns normally must be correct.
            var first = SafeRun(InitializeAsync);
            var second = SafeRun(InitializeAsync);
            await Task.WhenAll(first, second);

            // A third, sequential pass repairs anything a losing writer left incomplete — matching how
            // a developer would simply restart the app after a failed concurrent startup.
            await InitializeAsync();

            await using var verifyServices = FileServices(connectionString, Environments.Development).BuildServiceProvider();
            await using var scope = verifyServices.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            Assert.Equal(4, await db.Users.CountAsync());
            foreach (var (email, role) in ExpectedAccounts)
            {
                Assert.Equal(1, await db.Users.CountAsync(x => x.Email == email));
                var user = (await users.FindByEmailAsync(email))!;
                Assert.True(user.EmailConfirmed);
                Assert.Equal([role], await users.GetRolesAsync(user));
            }
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            File.Delete(dbPath);
            if (File.Exists(dbPath + "-journal"))
                File.Delete(dbPath + "-journal");
        }
    }

    // A losing concurrent writer failing is an accepted outcome; the task must simply not hang or
    // silently swallow an exception that would misrepresent success.
    private static async Task SafeRun(Func<Task> action)
    {
        try
        {
            await action();
        }
        catch (Exception exception) when (exception is not (Xunit.Sdk.XunitException or OutOfMemoryException))
        {
            // Expected: a losing writer may fail (e.g. SQLITE_BUSY). The final verification pass below
            // is what actually proves no corruption occurred.
        }
    }

    private static ServiceCollection Services(
        SqliteConnection database,
        string environment,
        SeedUsersOptions? seedUsers = null)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment(environment));
        services.AddDbContext<TafseelDbContext>(options => options.UseSqlite(database));
        ConfigureIdentity(services, seedUsers);
        return services;
    }

    private static ServiceCollection FileServices(
        string connectionString,
        string environment,
        SeedUsersOptions? seedUsers = null)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IHostEnvironment>(new TestHostEnvironment(environment));
        services.AddDbContext<TafseelDbContext>(options => options.UseSqlite(connectionString));
        ConfigureIdentity(services, seedUsers);
        return services;
    }

    private static void ConfigureIdentity(ServiceCollection services, SeedUsersOptions? seedUsers)
    {
        // Mirrors the app's real password policy (DependencyInjection.AddInfrastructure) so these
        // tests exercise the actual validation/hashing rules, not ASP.NET Core Identity's defaults.
        services.AddIdentityCore<ApplicationUser>(options =>
            {
                options.Password.RequiredLength = 10;
                options.Password.RequireDigit = true;
                options.Password.RequireLowercase = true;
                options.Password.RequireUppercase = true;
                options.Password.RequireNonAlphanumeric = true;
                options.User.RequireUniqueEmail = true;
            })
            .AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<TafseelDbContext>();
        if (seedUsers is not null)
            services.AddSingleton(Options.Create(seedUsers));
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

/// <summary>Pure-function coverage for the Development/Enabled/Password gating rule, independent of DI.</summary>
public sealed class SeedUsersOptionsTests
{
    [Theory]
    [InlineData(true, true, false)] // Development + Enabled -> password required
    [InlineData(true, false, true)] // Development + Disabled -> not required
    [InlineData(false, true, true)] // Staging/Production + Enabled -> never required
    [InlineData(false, false, true)]
    public void IsValid_requires_password_only_when_development_and_enabled(
        bool isDevelopment, bool enabled, bool expectedValidWithoutPassword)
    {
        var options = new SeedUsersOptions { Enabled = enabled, Password = null };
        Assert.Equal(expectedValidWithoutPassword, options.IsValid(isDevelopment));
        Assert.Equal(isDevelopment && enabled, options.RequiresPassword(isDevelopment));
    }

    [Fact]
    public void IsValid_accepts_a_configured_password_when_required()
    {
        var options = new SeedUsersOptions { Enabled = true, Password = "Dev-Local-Passw0rd!" };
        Assert.True(options.IsValid(isDevelopment: true));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void IsValid_rejects_blank_password_when_required(string? password)
    {
        var options = new SeedUsersOptions { Enabled = true, Password = password };
        Assert.False(options.IsValid(isDevelopment: true));
    }
}
