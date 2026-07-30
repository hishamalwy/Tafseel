using Tafseel.Application.LiveSessions;

namespace Tafseel.Infrastructure.LiveSessions;

/// <summary>Development-only join URL generator. Forbidden in Production by options validation.</summary>
internal sealed class MockLiveSessionLinkProvider : ILiveSessionLinkProvider
{
    public Task<string> GetJoinUrlAsync(Guid bookingId, string joinKey, CancellationToken ct) =>
        Task.FromResult($"https://meet.local/session/{bookingId:N}?key={Uri.EscapeDataString(joinKey)}");
}
