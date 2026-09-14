namespace Tafseel.Application.TeacherBusiness;

public sealed record TeacherBusinessAnalyticsDto(int OffersSubmitted, int OffersSelected, int OrdersTotal,
    int OrdersCompleted, int SessionsTotal, int SessionsCompleted, decimal GrossSales, decimal NetEarnings,
    decimal OfferSelectionRate, decimal CompletionRate, int RepeatStudents);
public sealed record TeacherHomeSummaryDto(int DirectRequests, int ActiveOrders, int ActiveSessions, int UnreadMessages);
public sealed record EarningsStatementLineDto(string Type, Guid ReferenceId, DateTimeOffset Date,
    string Description, decimal Gross, decimal Fees, decimal Net, string Currency, string Status);
public interface ITeacherBusinessService
{
    Task<TeacherHomeSummaryDto> GetHomeSummaryAsync(string teacherId, CancellationToken ct);
    Task<TeacherBusinessAnalyticsDto> GetAnalyticsAsync(string teacherId, CancellationToken ct);
    Task<IReadOnlyCollection<EarningsStatementLineDto>> GetStatementAsync(string teacherId, DateTimeOffset? from, DateTimeOffset? to, CancellationToken ct);
    Task<string> GetCalendarAsync(string teacherId, CancellationToken ct);
}
