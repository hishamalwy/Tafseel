using Tafseel.Application.LiveSessions;

namespace Tafseel.Infrastructure.LiveSessions;

/// <summary>Development-only join URL generator. Forbidden in Production by options validation.</summary>
internal sealed class MockLiveSessionLinkProvider : ILiveSessionLinkProvider
{
    public Task<LiveSessionJoinLink> GetJoinLinkAsync(Guid bookingId, string joinKey, string userId,
        string displayName, bool isTeacher, DateTimeOffset validFrom, DateTimeOffset validUntil, CancellationToken ct) =>
        Task.FromResult(new LiveSessionJoinLink($"https://meet.local/session/{bookingId:N}?key={Uri.EscapeDataString(joinKey)}"));
}
