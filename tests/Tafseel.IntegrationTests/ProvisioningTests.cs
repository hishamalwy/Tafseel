using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Infrastructure;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>
/// Deploy-time provisioning. Staging and Production never seed on startup (F-001), so without this a new
/// environment has no roles: registration fails with role_assignment_failed and the catalog is empty.
/// </summary>
public sealed class ProvisioningTests
{
    [Fact]
    public async Task Provisioning_a_migrated_empty_database_creates_the_reference_data_and_is_repeatable()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(database).BuildServiceProvider();
        await EnsureCreated(services);

        await services.ProvisionAsync(null);
        var second = await services.ProvisionAsync(null);

        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(Roles.All.Order(), (await db.Roles.Select(x => x.Name!).ToArrayAsync()).Order());
        Assert.Equal(4, await db.ServiceCatalogItems.CountAsync());
        Assert.Equal(2, await db.TeachingLanguages.CountAsync());
        Assert.Contains("No bootstrap Admin was requested.", second);
        Assert.Empty(await db.Users.ToArrayAsync());
    }

    [Fact]
    public async Task The_named_confirmed_account_becomes_the_first_Admin_once_and_the_setting_is_then_ignored()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(database).BuildServiceProvider();
        await EnsureCreated(services);
        await services.ProvisionAsync(null);
        var first = await CreateUser(services, "owner@example.test", confirmed: true);
        var second = await CreateUser(services, "someone@example.test", confirmed: true);

        var report = await services.ProvisionAsync(" owner@example.test ");
        var ignored = await services.ProvisionAsync("someone@example.test");

        Assert.Contains("The bootstrap account is now the first Admin.", report);
        Assert.Contains("An Admin already exists, so the bootstrap Admin setting was ignored.", ignored);
        await using var scope = services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.True(await users.IsInRoleAsync((await users.FindByIdAsync(first))!, Roles.Admin));
        Assert.False(await users.IsInRoleAsync((await users.FindByIdAsync(second))!, Roles.Admin));
        Assert.Single(await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().AuditLogEntries
            .Where(x => x.Action == "AdminBootstrapped" && x.EntityId == first).ToArrayAsync());
    }

    [Fact]
    public async Task An_unknown_or_unconfirmed_bootstrap_account_stops_provisioning_without_granting_anything()
    {
        await using var database = new SqliteConnection("Data Source=:memory:");
        await database.OpenAsync();
        await using var services = Services(database).BuildServiceProvider();
        await EnsureCreated(services);
        await services.ProvisionAsync(null);
        var unconfirmed = await CreateUser(services, "pending@example.test", confirmed: false);

        await Assert.ThrowsAsync<InvalidOperationException>(() => services.ProvisionAsync("missing@example.test"));
        await Assert.ThrowsAsync<InvalidOperationException>(() => services.ProvisionAsync("pending@example.test"));

        await using var scope = services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.Empty(await users.GetUsersInRoleAsync(Roles.Admin));
        Assert.False(await users.IsInRoleAsync((await users.FindByIdAsync(unconfirmed))!, Roles.Admin));
    }

    private static async Task<string> CreateUser(ServiceProvider services, string email, bool confirmed)
    {
        await using var scope = services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = new ApplicationUser { UserName = email, Email = email, FullName = email, EmailConfirmed = confirmed };
        Assert.True((await users.CreateAsync(user)).Succeeded);
        return user.Id;
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
}
