using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Tafseel.Domain.Catalog;
using Tafseel.Infrastructure;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>
/// DEC-01, applied (UX-06). The canonical services used to be created without price bounds, so the domain's
/// last-resort fallback stood in and a teacher was told their price could be anything from 0.01 to 1,000,000
/// SAR. The decided policy is now put on every canonical service that was never configured — on a new
/// database and on an existing one — and a policy an Admin actually chose is never overwritten.
/// </summary>
public sealed class CanonicalServicePolicyTests
{
    private sealed record Policy(decimal Min, decimal Max, decimal Default, decimal Recommended,
        int? MinHours, int? DefaultHours, int? MaxHours, int DefaultRevisions, int MaxRevisions);

    private static readonly Dictionary<string, Policy> Dec01 = new()
    {
        ["recorded_explanation"] = new(50m, 800m, 120m, 120m, 12, 48, 336, 2, 5),
        ["assignment_guidance"] = new(60m, 1_000m, 150m, 150m, 24, 72, 336, 2, 3),
        ["exam_revision"] = new(80m, 1_500m, 200m, 200m, 24, 72, 240, 1, 3),
        ["live_session"] = new(60m, 600m, 150m, 150m, null, null, null, 0, 0)
    };

    [Fact]
    public async Task A_new_database_starts_with_the_decided_policy()
    {
        await using var harness = await Harness.CreateAsync();

        await harness.Services.InitializeIdentityAsync();

        foreach (var (code, expected) in Dec01)
            AssertPolicy(await harness.ServiceAsync(code), expected);
    }

    [Fact]
    public async Task A_database_from_before_the_policy_is_corrected_on_the_next_start()
    {
        // Every database that needs this is one whose roles and services already exist, which is exactly
        // when the seed-is-current guard returns early — so the correction cannot live behind it.
        await using var harness = await Harness.CreateAsync();
        await harness.Services.InitializeIdentityAsync();
        await harness.SetBoundsAsync("recorded_explanation", 0.01m, 120m, 120m, 1_000_000m);
        await harness.SetBoundsAsync("exam_revision", 0.01m, 200m, 200m, 1_000_000m);

        await harness.Services.InitializeIdentityAsync();

        AssertPolicy(await harness.ServiceAsync("recorded_explanation"), Dec01["recorded_explanation"]);
        AssertPolicy(await harness.ServiceAsync("exam_revision"), Dec01["exam_revision"]);
    }

    [Fact]
    public async Task A_live_service_is_recognised_by_its_own_fallback_minimum()
    {
        // The live service arrives with the domain's live minimum (30), not the async one (0.01), and the
        // shared maximum (1,000,000). Both are fallbacks; neither was chosen.
        await using var harness = await Harness.CreateAsync();
        await harness.Services.InitializeIdentityAsync();
        await harness.SetBoundsAsync("live_session", 30m, 150m, 150m, 1_000_000m);

        await harness.Services.InitializeIdentityAsync();

        AssertPolicy(await harness.ServiceAsync("live_session"), Dec01["live_session"]);
    }

    [Fact]
    public async Task A_policy_an_admin_chose_is_left_exactly_as_it_is()
    {
        await using var harness = await Harness.CreateAsync();
        await harness.Services.InitializeIdentityAsync();
        await harness.SetBoundsAsync("assignment_guidance", 70m, 180m, 200m, 900m);

        await harness.Services.InitializeIdentityAsync();

        var service = await harness.ServiceAsync("assignment_guidance");
        Assert.Equal(70m, service.MinPrice);
        Assert.Equal(900m, service.MaxPrice);
        Assert.Equal(180m, service.DefaultPrice);
        Assert.Equal(200m, service.RecommendedPrice);
    }

    [Fact]
    public async Task An_admin_who_moved_only_one_bound_is_not_overruled()
    {
        // A minimum raised by hand is a decision, even if the maximum was never touched. The correction is
        // for services nobody configured, not a way to reapply the table over someone's work.
        await using var harness = await Harness.CreateAsync();
        await harness.Services.InitializeIdentityAsync();
        await harness.SetBoundsAsync("exam_revision", 90m, 200m, 200m, 1_000_000m);

        await harness.Services.InitializeIdentityAsync();

        var service = await harness.ServiceAsync("exam_revision");
        Assert.Equal(90m, service.MinPrice);
        Assert.Equal(1_000_000m, service.MaxPrice);
    }

    [Fact]
    public async Task Starting_again_changes_nothing_once_the_policy_is_in_place()
    {
        await using var harness = await Harness.CreateAsync();
        await harness.Services.InitializeIdentityAsync();
        var before = await harness.SnapshotAsync();

        await harness.Services.InitializeIdentityAsync();

        Assert.Equal(before, await harness.SnapshotAsync());
    }

    private static void AssertPolicy(ServiceCatalogItem service, Policy expected)
    {
        Assert.Equal(expected.Min, service.MinPrice);
        Assert.Equal(expected.Max, service.MaxPrice);
        Assert.Equal(expected.Default, service.DefaultPrice);
        Assert.Equal(expected.Recommended, service.RecommendedPrice);
        Assert.Equal(expected.MinHours, service.MinimumDeliveryHours);
        Assert.Equal(expected.DefaultHours, service.DefaultDeliveryHours);
        Assert.Equal(expected.MaxHours, service.MaximumDeliveryHours);
        Assert.Equal(expected.DefaultRevisions, service.DefaultRevisions);
        Assert.Equal(expected.MaxRevisions, service.MaximumRevisions);
        Assert.Equal("SAR", service.CurrencyCode);
    }

    private sealed class Harness : IAsyncDisposable
    {
        private readonly SqliteConnection database;
        public ServiceProvider Services { get; }

        private Harness(SqliteConnection database, ServiceProvider services)
        {
            this.database = database;
            Services = services;
        }

        public static async Task<Harness> CreateAsync()
        {
            var database = new SqliteConnection("Data Source=:memory:");
            await database.OpenAsync();
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddSingleton<IHostEnvironment>(new TestHostEnvironment());
            services.AddDbContext<TafseelDbContext>(options => options.UseSqlite(database));
            services.AddIdentityCore<ApplicationUser>().AddRoles<IdentityRole>().AddEntityFrameworkStores<TafseelDbContext>();
            var provider = services.BuildServiceProvider();
            await using (var scope = provider.CreateAsyncScope())
                await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Database.EnsureCreatedAsync();
            return new Harness(database, provider);
        }

        public async Task<ServiceCatalogItem> ServiceAsync(string code)
        {
            await using var scope = Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            return await db.ServiceCatalogItems.AsNoTracking().SingleAsync(x => x.Code == code);
        }

        /// <summary>Sets a service's price bounds the way an Admin would, keeping everything else as it is.</summary>
        public async Task SetBoundsAsync(string code, decimal min, decimal @default, decimal recommended, decimal max)
        {
            await using var scope = Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var service = await db.ServiceCatalogItems.SingleAsync(x => x.Code == code);
            service.ConfigurePolicy(
                service.CategoryCode, service.IconCode, service.OrderType, service.QualificationPolicy,
                service.CurrencyCode, min, @default, recommended, max,
                service.MinimumDeliveryHours, service.DefaultDeliveryHours, service.RecommendedDeliveryHours,
                service.MaximumDeliveryHours, service.DefaultRevisions, service.MaximumRevisions,
                service.IsPublic, service.TeacherSelectable, service.AllowedDurations, service.DisplayOrder,
                hasReferences: true);
            await db.SaveChangesAsync();
        }

        public async Task<string> SnapshotAsync()
        {
            await using var scope = Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var rows = await db.ServiceCatalogItems.AsNoTracking().OrderBy(x => x.Code)
                .Select(x => new { x.Code, x.MinPrice, x.MaxPrice, x.DefaultPrice, x.RecommendedPrice,
                    x.DefaultRevisions, x.MaximumRevisions, x.AllowedDurationsCsv })
                .ToArrayAsync();
            return string.Join('|', rows.Select(x => x.ToString()));
        }

        public async ValueTask DisposeAsync()
        {
            await Services.DisposeAsync();
            await database.DisposeAsync();
        }
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "Tafseel.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
