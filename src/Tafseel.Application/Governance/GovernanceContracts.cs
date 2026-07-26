using System.ComponentModel.DataAnnotations;
using Tafseel.Application.Common;
using Tafseel.Application.Orders;
using Tafseel.Domain.Governance;

namespace Tafseel.Application.Governance;

public sealed record CreateReview(
    [param: Range(1, 5)] int ExplanationClarity,
    [param: Range(1, 5)] int SubjectKnowledge,
    [param: Range(1, 5)] int Communication,
    [param: Range(1, 5)] int OnTimeDelivery,
    [param: Range(1, 5)] int ValueForMoney,
    [param: Required, StringLength(2000), NotWhiteSpace] string Comment,
    bool Recommends);
public sealed record ReviewDto(
    Guid Id, Guid OrderId, string TeacherId,
    int ExplanationClarity, int SubjectKnowledge, int Communication,
    int OnTimeDelivery, int ValueForMoney, decimal OverallScore,
    string OriginalComment, bool Recommends, bool IsVisible, DateTimeOffset CreatedAt);
public sealed record ModerateReview(
    bool Visible,
    [param: Required, StringLength(1000), NotWhiteSpace] string Reason);

public sealed record OpenDispute(
    Guid OrderId,
    [param: Required, StringLength(2000), NotWhiteSpace] string Reason);
public sealed record AddDisputeMessage(
    [param: Required, StringLength(2000), NotWhiteSpace] string Body);
public sealed record ResolveDispute(
    DisputeResolution Resolution,
    [param: Required, StringLength(2000), NotWhiteSpace] string Rationale);
public sealed record DisputeMessageDto(Guid Id, string SenderId, string Body, DateTimeOffset CreatedAt);
public sealed record DisputeDecisionDto(
    Guid Id, string ActorId, DisputeResolution Resolution, string Rationale, DateTimeOffset CreatedAt);
public sealed record DisputeDto(
    Guid Id, Guid OrderId, string StudentId, string TeacherId, string OpenedById,
    string Reason, DisputeStatus Status, DateTimeOffset CreatedAt,
    IReadOnlyCollection<DisputeMessageDto> Messages,
    IReadOnlyCollection<AttachmentDto> Evidence,
    IReadOnlyCollection<DisputeDecisionDto> Decisions,
    string Version);

public sealed record AdminUserDto(
    string Id, string FullName, string Email, bool IsSuspended, IReadOnlyCollection<string> Roles);
public sealed record SetSuspension(bool Suspended);
public sealed record SetRole(
    [param: Required] string Role,
    bool Assigned);
public sealed record DashboardMetrics(
    int TotalUsers, int ActiveStudents, int ActiveTeachers, int PendingApplications,
    int TotalOrders, decimal ConfirmedPayments, decimal PlatformRevenue,
    int OpenDisputes, int PendingWithdrawals);
public sealed record PopularSubjectMetric(Guid SubjectId, string Name, int Services, int Orders);
public sealed record AuditDto(
    Guid Id, string ActorId, string Action, string EntityType, string EntityId,
    string Summary, string CorrelationId, DateTimeOffset CreatedAt);

public interface IGovernanceService
{
    Task<ReviewDto> CreateReviewAsync(string studentId, Guid orderId, CreateReview input, CancellationToken ct);
    Task<PagedResult<ReviewDto>> GetTeacherReviewsAsync(string teacherId, int page, int pageSize, CancellationToken ct);
    Task ModerateReviewAsync(string adminId, Guid id, ModerateReview input, CancellationToken ct);
    Task<DisputeDto> OpenDisputeAsync(string userId, OpenDispute input, CancellationToken ct);
    Task<PagedResult<DisputeDto>> GetDisputesAsync(string userId, bool admin, int page, int pageSize, CancellationToken ct);
    Task AddDisputeMessageAsync(string userId, Guid id, AddDisputeMessage input, string version, CancellationToken ct);
    Task<AttachmentDto> AddEvidenceAsync(string userId, Guid id, Stream stream, string fileName,
        string contentType, long size, string version, CancellationToken ct);
    Task<PrivateFile> OpenEvidenceAsync(string userId, Guid id, bool admin, CancellationToken ct);
    Task StartDisputeReviewAsync(string adminId, Guid id, string version, CancellationToken ct);
    Task<DisputeDto> ResolveDisputeAsync(
        string adminId, Guid id, ResolveDispute input, string version, string idempotencyKey, CancellationToken ct);
}

public interface IAdminService
{
    Task<PagedResult<AdminUserDto>> GetUsersAsync(int page, int pageSize, string? search, CancellationToken ct);
    Task SetSuspensionAsync(string adminId, string userId, bool suspended, CancellationToken ct);
    Task SetRoleAsync(string adminId, string userId, string role, bool assigned, CancellationToken ct);
    Task<DashboardMetrics> GetMetricsAsync(CancellationToken ct);
    Task<IReadOnlyCollection<PopularSubjectMetric>> GetPopularSubjectsAsync(CancellationToken ct);
    Task<PagedResult<AuditDto>> GetAuditAsync(int page, int pageSize, CancellationToken ct);
}

public sealed class DisputeOptions
{
    public const string SectionName = "Disputes";
    public int WindowDays { get; init; } = 7;
}
