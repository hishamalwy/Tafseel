using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
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

    private static ServiceCollection Services(SqliteConnection database)
    {
        var services = new ServiceCollection();
        services.AddLogging();
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
}
