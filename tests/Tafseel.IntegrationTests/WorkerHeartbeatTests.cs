using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging.Abstractions;
using Tafseel.Infrastructure.Operations;

namespace Tafseel.IntegrationTests;

// F-OBS-1: the workers that release escrow and mature earnings used to fail with a log warning
// and nothing else. The heartbeat makes a stalled money worker visible on /health/ready.
public sealed class WorkerHeartbeatTests
{
    private static readonly DateTimeOffset Start = new(2026, 9, 23, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task A_worker_that_keeps_succeeding_is_healthy()
    {
        var (clock, heartbeats, check) = Create();
        heartbeats.Register("order-auto-release", TimeSpan.FromMinutes(5));

        for (var tick = 0; tick < 6; tick++)
        {
            clock.SetUtcNow(clock.GetUtcNow() + TimeSpan.FromMinutes(5));
            heartbeats.Succeeded("order-auto-release");
        }

        Assert.Equal(HealthStatus.Healthy, (await check.CheckHealthAsync(new())).Status);
    }

    [Fact]
    public async Task A_worker_with_no_success_for_two_intervals_degrades_readiness_and_names_itself()
    {
        var (clock, heartbeats, check) = Create();
        heartbeats.Register("earnings-maturity", TimeSpan.FromMinutes(5));
        heartbeats.Register("order-auto-release", TimeSpan.FromMinutes(5));
        heartbeats.Succeeded("earnings-maturity");
        heartbeats.Succeeded("order-auto-release");

        clock.SetUtcNow(clock.GetUtcNow() + TimeSpan.FromMinutes(11));
        heartbeats.Succeeded("order-auto-release");
        heartbeats.Failed("earnings-maturity");

        var result = await check.CheckHealthAsync(new());
        Assert.Equal(HealthStatus.Degraded, result.Status);
        Assert.Contains("earnings-maturity", result.Description);
        Assert.DoesNotContain("order-auto-release", result.Description);
    }

    [Fact]
    public async Task A_worker_that_never_succeeds_after_start_degrades_readiness_after_two_intervals()
    {
        var (clock, heartbeats, check) = Create();
        heartbeats.Register("live-session-settlement", TimeSpan.FromMinutes(5));

        clock.SetUtcNow(clock.GetUtcNow() + TimeSpan.FromMinutes(9));
        Assert.Equal(HealthStatus.Healthy, (await check.CheckHealthAsync(new())).Status);

        clock.SetUtcNow(clock.GetUtcNow() + TimeSpan.FromMinutes(2));
        Assert.Equal(HealthStatus.Degraded, (await check.CheckHealthAsync(new())).Status);
    }

    [Fact]
    public async Task Recovery_clears_the_degraded_state_and_the_failure_streak()
    {
        var (clock, heartbeats, check) = Create();
        heartbeats.Register("dispute-sla", TimeSpan.FromMinutes(15));
        for (var tick = 0; tick < 3; tick++)
        {
            clock.SetUtcNow(clock.GetUtcNow() + TimeSpan.FromMinutes(15));
            heartbeats.Failed("dispute-sla");
        }
        Assert.Equal(3, heartbeats.Snapshot().Single().ConsecutiveFailures);
        Assert.Equal(HealthStatus.Degraded, (await check.CheckHealthAsync(new())).Status);

        heartbeats.Succeeded("dispute-sla");
        Assert.Equal(0, heartbeats.Snapshot().Single().ConsecutiveFailures);
        Assert.Equal(HealthStatus.Healthy, (await check.CheckHealthAsync(new())).Status);
    }

    private static (MutableTimeProvider Clock, WorkerHeartbeats Heartbeats, WorkerHealthCheck Check) Create()
    {
        var clock = new MutableTimeProvider(Start);
        var heartbeats = new WorkerHeartbeats(clock, NullLogger<WorkerHeartbeats>.Instance);
        return (clock, heartbeats, new WorkerHealthCheck(heartbeats));
    }
}

public sealed class WorkerHeartbeatHostTests(TafseelApiFactory factory) : IClassFixture<TafseelApiFactory>
{
    [Fact]
    public async Task Every_money_and_deadline_worker_reports_and_readiness_includes_them()
    {
        using var client = factory.CreateClient();
        var ready = await client.GetAsync("/health/ready");
        Assert.Equal(System.Net.HttpStatusCode.OK, ready.StatusCode);

        var names = factory.Services.GetRequiredService<WorkerHeartbeats>().Snapshot().Select(x => x.Name).ToArray();
        Assert.Equal(
            ["dispute-sla", "earnings-maturity", "live-session-settlement", "order-auto-release", "reservation-expiry"],
            names);

        var checks = factory.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<HealthCheckServiceOptions>>()
            .Value.Registrations;
        var workers = Assert.Single(checks, x => x.Name == "background-workers");
        Assert.Contains("ready", workers.Tags);
    }
}
