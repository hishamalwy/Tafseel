using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;

namespace Tafseel.Infrastructure.Operations;

/// <summary>
/// Liveness of the background workers that move money or enforce deadlines (order auto-release,
/// earnings maturity, live-session settlement, reservation expiry, dispute SLA).
/// <para>
/// A worker used to catch its own failure, log a warning and wait for the next tick, so a scan that
/// failed every time looked exactly like one that had nothing to do. Each worker now reports every
/// pass here. Three failures in a row log an Error (the signal an alert keys on), the
/// <c>Tafseel.Workers</c> meter carries run counts and seconds since the last success, and
/// <see cref="WorkerHealthCheck"/> turns /health/ready Degraded when a worker has not succeeded for
/// two of its intervals.
/// </para>
/// </summary>
public sealed class WorkerHeartbeats : IDisposable
{
    public const string MeterName = "Tafseel.Workers";
    private const int ErrorAfterConsecutiveFailures = 3;

    private readonly TimeProvider _clock;
    private readonly ILogger<WorkerHeartbeats> _logger;
    private readonly ConcurrentDictionary<string, State> _workers = new(StringComparer.Ordinal);
    private readonly Meter _meter = new(MeterName);
    private readonly Counter<long> _runs;

    public WorkerHeartbeats(TimeProvider clock, ILogger<WorkerHeartbeats> logger)
    {
        _clock = clock;
        _logger = logger;
        _runs = _meter.CreateCounter<long>(
            "tafseel.worker.runs", description: "Background worker passes, tagged by worker and outcome.");
        _meter.CreateObservableGauge(
            "tafseel.worker.seconds_since_success",
            () => Snapshot().Select(worker => new Measurement<double>(
                (_clock.GetUtcNow() - (worker.LastSuccessAt ?? worker.RegisteredAt)).TotalSeconds,
                new KeyValuePair<string, object?>("worker", worker.Name))),
            unit: "s",
            description: "Seconds since each worker last completed a pass (since start when it never has).");
    }

    public DateTimeOffset Now => _clock.GetUtcNow();

    public void Dispose() => _meter.Dispose();

    /// <summary>Called once when the worker starts; a worker that is switched off never registers.</summary>
    public void Register(string worker, TimeSpan interval) =>
        _workers[worker] = new State(worker, interval, _clock.GetUtcNow());

    public void Succeeded(string worker)
    {
        if (!_workers.TryGetValue(worker, out var state)) return;
        lock (state)
        {
            if (state.ConsecutiveFailures >= ErrorAfterConsecutiveFailures)
                _logger.LogInformation("Worker {Worker} recovered after {Failures} failed passes", worker, state.ConsecutiveFailures);
            state.LastSuccessAt = _clock.GetUtcNow();
            state.ConsecutiveFailures = 0;
        }
        _runs.Add(1, new KeyValuePair<string, object?>("worker", worker), new("outcome", "success"));
    }

    public void Failed(string worker)
    {
        if (!_workers.TryGetValue(worker, out var state)) return;
        int failures;
        lock (state) failures = ++state.ConsecutiveFailures;
        _runs.Add(1, new KeyValuePair<string, object?>("worker", worker), new("outcome", "failure"));
        if (failures == ErrorAfterConsecutiveFailures || failures % 12 == 0)
            _logger.LogError(
                "Worker {Worker} has failed {Failures} passes in a row; nothing it owns is moving",
                worker, failures);
    }

    public IReadOnlyList<WorkerStatus> Snapshot() =>
        _workers.Values.Select(state =>
        {
            lock (state)
                return new WorkerStatus(state.Name, state.Interval, state.RegisteredAt,
                    state.LastSuccessAt, state.ConsecutiveFailures);
        }).OrderBy(x => x.Name, StringComparer.Ordinal).ToArray();

    public sealed record WorkerStatus(
        string Name, TimeSpan Interval, DateTimeOffset RegisteredAt,
        DateTimeOffset? LastSuccessAt, int ConsecutiveFailures)
    {
        /// <summary>No success within two intervals, counting from start when there has been none yet.</summary>
        public bool IsStalled(DateTimeOffset now) => now - (LastSuccessAt ?? RegisteredAt) > Interval * 2;
    }

    private sealed class State(string name, TimeSpan interval, DateTimeOffset registeredAt)
    {
        public string Name { get; } = name;
        public TimeSpan Interval { get; } = interval;
        public DateTimeOffset RegisteredAt { get; } = registeredAt;
        public DateTimeOffset? LastSuccessAt { get; set; }
        public int ConsecutiveFailures { get; set; }
    }
}

/// <summary>
/// Degraded, not Unhealthy: a stalled worker needs a person, and taking the only instance out of
/// rotation would stop students and teachers as well without restarting anything that would help.
/// </summary>
public sealed class WorkerHealthCheck(WorkerHeartbeats heartbeats) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var workers = heartbeats.Snapshot();
        var now = heartbeats.Now;
        var stalled = workers.Where(worker => worker.IsStalled(now)).Select(worker => worker.Name).ToArray();
        var data = workers.ToDictionary(
            worker => worker.Name,
            worker => (object)new
            {
                lastSuccessAt = worker.LastSuccessAt,
                consecutiveFailures = worker.ConsecutiveFailures,
                stalled = worker.IsStalled(now)
            });
        return Task.FromResult(stalled.Length == 0
            ? HealthCheckResult.Healthy($"{workers.Count} background workers reporting.", data)
            : HealthCheckResult.Degraded($"Stalled background workers: {string.Join(", ", stalled)}.", data: data));
    }
}
