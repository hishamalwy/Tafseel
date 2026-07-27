using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Tafseel.Application.Authorization;
using Tafseel.Infrastructure;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

public sealed class RoleBootstrapTests
{
    [Fact]
    public async Task Bootstrap_handles_empty_repeated_and_partially_existing_role_sets()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(database).BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();
        await services.InitializeIdentityAsync();
        await using (var scope = services.CreateAsyncScope())
        {
            var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
            Assert.True((await roles.DeleteAsync((await roles.FindByNameAsync(Roles.Teacher))!)).Succeeded);
        }
        await services.InitializeIdentityAsync();

        await using var verification = services.CreateAsyncScope();
        var db = verification.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(Roles.All.Order(), await db.Roles.Select(x => x.Name!).OrderBy(x => x).ToArrayAsync());
    }

    [Fact]
    public async Task Bootstrap_failure_rolls_back_roles_created_before_the_failure()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        var collection = Services(database);
        collection.AddSingleton<IRoleValidator<IdentityRole>, RejectTeacherRoleValidator>();
        await using var services = collection.BuildServiceProvider();
        await EnsureCreated(services);

        await Assert.ThrowsAsync<InvalidOperationException>(() => services.InitializeIdentityAsync());

        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Empty(await db.Roles.AsNoTracking().ToArrayAsync());
    }

    [Fact]
    public async Task Staging_bootstrap_creates_each_demo_user_once_and_repairs_confirmation_and_role()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(database, Environments.Staging).BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();
        Dictionary<string, string> ids;
        await using (var scope = services.CreateAsyncScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var expected = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["admin@gmail.com"] = Roles.Admin,
                ["student@gmail.com"] = Roles.Student,
                ["teacher@gmail.com"] = Roles.Teacher,
                ["quality@gmail.com"] = Roles.QualityReviewer
            };
            ids = [];
            foreach (var account in expected)
            {
                var user = (await users.FindByEmailAsync(account.Key))!;
                ids[account.Key] = user.Id;
                Assert.True(user.EmailConfirmed);
                Assert.Equal([account.Value], await users.GetRolesAsync(user));
                Assert.True(await users.CheckPasswordAsync(user, "@Admin123"));
            }

            var student = (await users.FindByEmailAsync("student@gmail.com"))!;
            Assert.True((await users.RemoveFromRoleAsync(student, Roles.Student)).Succeeded);
            var admin = (await users.FindByEmailAsync("admin@gmail.com"))!;
            admin.EmailConfirmed = false;
            Assert.True((await users.UpdateAsync(admin)).Succeeded);
        }

        await services.InitializeIdentityAsync();

        await using var verification = services.CreateAsyncScope();
        var verificationUsers = verification.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.Equal(4, await verification.ServiceProvider.GetRequiredService<TafseelDbContext>().Users.CountAsync());
        foreach (var account in ids)
            Assert.Equal(account.Value, (await verificationUsers.FindByEmailAsync(account.Key))!.Id);
        Assert.True((await verificationUsers.FindByEmailAsync("admin@gmail.com"))!.EmailConfirmed);
        Assert.True(await verificationUsers.IsInRoleAsync(
            (await verificationUsers.FindByEmailAsync("student@gmail.com"))!, Roles.Student));
    }

    [Fact]
    public async Task Demo_users_are_not_created_outside_staging()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(database, Environments.Production).BuildServiceProvider();
        await EnsureCreated(services);

        await services.InitializeIdentityAsync();

        await using var scope = services.CreateAsyncScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Users.ToArrayAsync());
    }

    private static ServiceCollection Services(SqliteConnection database, string? environment = null)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        if (environment is not null)
            services.AddSingleton<IHostEnvironment>(new TestHostEnvironment(environment));
        services.AddDbContext<TafseelDbContext>(options => options.UseSqlite(database));
        services.AddIdentityCore<ApplicationUser>()
            .AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<TafseelDbContext>();
        return services;
    }

    private static async Task EnsureCreated(ServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Database.EnsureCreatedAsync();
    }

    private sealed class RejectTeacherRoleValidator : IRoleValidator<IdentityRole>
    {
        public Task<IdentityResult> ValidateAsync(RoleManager<IdentityRole> manager, IdentityRole role) =>
            Task.FromResult(role.Name == Roles.Teacher
                ? IdentityResult.Failed(new IdentityError { Code = "rejected_role" })
                : IdentityResult.Success);
    }

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "Tafseel.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
