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
    Guid Id, Guid? OrderId, Guid? LiveSessionBookingId, string TeacherId,
    int ExplanationClarity, int SubjectKnowledge, int Communication,
    int OnTimeDelivery, int ValueForMoney, decimal OverallScore,
    string OriginalComment, bool Recommends, bool IsVisible, DateTimeOffset CreatedAt);
/// <summary>Public teacher reviews — no StudentId / OrderId (private marketplace identifiers).</summary>
public sealed record PublicTeacherReviewDto(
    Guid Id, string TeacherId,
    int ExplanationClarity, int SubjectKnowledge, int Communication,
    int OnTimeDelivery, int ValueForMoney, decimal OverallScore,
    string OriginalComment, bool Recommends, DateTimeOffset CreatedAt);
public sealed record ModerateReview(
    bool Visible,
    [param: Required, StringLength(1000), NotWhiteSpace] string Reason);

public enum AdminReviewVisibilityFilter { All, Visible, Hidden }
public enum AdminReviewSort { Newest, Oldest, HighestRating, LowestRating }

/// <summary>Admin operational list projection — deliberately excludes Student identity (name/
/// email); reviews are anonymous-to-public by design and Admin does not need Student PII to
/// moderate visibility. OrderId is retained as the operational identifier already used
/// elsewhere in Admin tooling.</summary>
public sealed record AdminReviewListItemDto(
    Guid Id, Guid? OrderId, Guid? LiveSessionBookingId, string TeacherId, string TeacherDisplayName, string TeacherDisplayNameEnglish,
    bool TeacherHasAvatar, string ServiceName, decimal OverallScore, bool Recommends,
    string CommentExcerpt, DateTimeOffset CreatedAt, bool IsVisible,
    DateTimeOffset? LastModeratedAt, string? LastModerationReason);

public sealed record AdminReviewQueueSummaryDto(int Visible, int Hidden, int Total);

public sealed record ReviewModerationRecordDto(
    Guid Id, string ActorId, string? ActorDisplayName, bool Visible, string Reason, DateTimeOffset CreatedAt);

public sealed record AdminReviewDetailDto(
    Guid Id, Guid? OrderId, Guid? LiveSessionBookingId, string TeacherId, string TeacherDisplayName, string TeacherDisplayNameEnglish,
    bool TeacherHasAvatar, string ServiceName,
    int ExplanationClarity, int SubjectKnowledge, int Communication, int OnTimeDelivery, int ValueForMoney,
    decimal OverallScore, string OriginalComment, bool Recommends, DateTimeOffset CreatedAt,
    bool IsVisible, IReadOnlyCollection<ReviewModerationRecordDto> ModerationHistory);

public sealed record OpenDispute(
    Guid? OrderId,
    [param: Required, StringLength(2000), NotWhiteSpace] string Reason,
    Guid? LiveSessionBookingId = null);
public sealed record AddDisputeMessage(
    [param: Required, StringLength(2000), NotWhiteSpace] string Body);
public sealed record ResolveDispute(
    DisputeResolution Resolution,
    [param: Required, StringLength(2000), NotWhiteSpace] string Rationale);
public sealed record DisputeMessageDto(Guid Id, string SenderId, string Body, DateTimeOffset CreatedAt);
public sealed record DisputeDecisionDto(
    Guid Id, string ActorId, DisputeResolution Resolution, string Rationale, DateTimeOffset CreatedAt);
public sealed record DisputeStatusHistoryDto(
    Guid Id, DisputeStatus? PreviousStatus, DisputeStatus NextStatus,
    string ActorId, DateTimeOffset CreatedAt);
public sealed record EligibleDisputeTargetDto(
    string Type, Guid Id, string Title, string TitleArabic,
    string OtherPartyName, string OtherPartyNameEnglish,
    decimal Amount, string Currency, DateTimeOffset ActivityAt, DateTimeOffset EligibleUntil);
public sealed record DisputeDto(
    Guid Id, Guid? OrderId, Guid? LiveSessionBookingId, string StudentId, string TeacherId, string OpenedById,
    string Reason, DisputeStatus Status, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt,
    DateTimeOffset? ActionDueAt,
    IReadOnlyCollection<DisputeMessageDto> Messages,
    IReadOnlyCollection<AttachmentDto> Evidence,
    IReadOnlyCollection<DisputeDecisionDto> Decisions,
    IReadOnlyCollection<DisputeStatusHistoryDto> History,
    string Version);

public sealed record AdminUserDto(
    string Id, string FullName, string Email, bool IsSuspended, DateTimeOffset CreatedAt,
    IReadOnlyCollection<string> Roles);
public sealed record SetSuspension(bool Suspended);
public sealed record SetRole(
    [param: Required] string Role,
    bool Assigned);
public sealed record DashboardMetrics(
    int TotalUsers, int ActiveStudents, int ActiveTeachers, int PendingApplications,
    int TotalOrders, decimal ConfirmedPayments, decimal PlatformRevenue,
    int OpenDisputes, int PendingWithdrawals);
/// <summary>
/// Read-only Admin command-centre projection: one call answering "what needs Admin attention now?".
/// Every field is a queue count with a matching Admin destination — no scores, no SLAs, no
/// derived financial truth. Reconciliation health is copied from the canonical
/// <see cref="Tafseel.Application.Finance.ReconciliationDto"/>, never recomputed here.
/// </summary>
public sealed record AdminAttentionDto(
    int TeacherApplications,
    int OpenDisputes,
    int SilentSessions,
    int OverdueOrders,
    int PendingWithdrawals,
    int PendingPayoutProfiles,
    int SuspendedWithActiveCommerce,
    int StuckPayments,
    bool ReconciliationBalanced,
    int ReconciliationAnomalies,
    AdminPlatformSummaryDto Platform,
    int OpenSupportCases = 0);

/// <summary>Non-actionable platform context shown under the attention queues on Admin Home.</summary>
public sealed record AdminPlatformSummaryDto(
    int TotalUsers, int ActiveStudents, int ActiveTeachers, int TotalOrders,
    decimal ConfirmedPayments, decimal PlatformRevenue, string Currency);

public sealed record PopularSubjectMetric(Guid SubjectId, string Name, int Services, int Orders);
public sealed record AuditDto(
    Guid Id, string ActorId, string Action, string EntityType, string EntityId,
    string Summary, string CorrelationId, DateTimeOffset CreatedAt,
    string? ActorName = null, string? ActorNameEnglish = null);
public sealed record AdminOperationItemDto(
    Guid Id, string Title, string StudentName, string TeacherName, int Status,
    DateTimeOffset CreatedAt, DateTimeOffset ScheduledAt, decimal? Amount, string Currency,
    Guid? PaymentId = null, bool CanRefund = false, string? RefundUnavailableReason = null,
    DateTimeOffset? EndsAt = null, DateTimeOffset? PassiveOutcomeDeadline = null,
    bool PassiveReviewRequired = false, Guid? DisputeId = null, int? DisputeStatus = null,
    string? EscrowState = null, int EvidenceCount = 0, string? Version = null,
    bool CanResolveSessionOutcome = false);
public sealed record ResolvePassiveSessionOutcome(
    [param: Required, StringLength(2000), NotWhiteSpace] string Reason);

public interface IGovernanceService
{
    Task<ReviewDto> CreateReviewAsync(string studentId, Guid orderId, CreateReview input, CancellationToken ct);
    Task<ReviewDto> CreateLiveSessionReviewAsync(string studentId, Guid liveSessionBookingId, CreateReview input, CancellationToken ct);
    Task<PagedResult<PublicTeacherReviewDto>> GetTeacherReviewsAsync(string teacherId, int page, int pageSize, CancellationToken ct);
    Task<PagedResult<AdminReviewListItemDto>> GetAdminReviewsAsync(
        int page, int pageSize, AdminReviewVisibilityFilter visibility, int? rating,
        string? search, AdminReviewSort sort, CancellationToken ct);
    Task<AdminReviewDetailDto> GetAdminReviewAsync(Guid id, CancellationToken ct);
    Task<AdminReviewQueueSummaryDto> GetAdminReviewSummaryAsync(CancellationToken ct);
    Task ModerateReviewAsync(string adminId, Guid id, ModerateReview input, CancellationToken ct);
    Task<DisputeDto> OpenDisputeAsync(string userId, OpenDispute input, CancellationToken ct);
    Task<IReadOnlyCollection<EligibleDisputeTargetDto>> GetEligibleDisputeTargetsAsync(
        string userId, CancellationToken ct);
    Task<PagedResult<DisputeDto>> GetDisputesAsync(string userId, bool admin, int page, int pageSize, string? filter, CancellationToken ct);
    /// <summary>The staff list, searchable by dispute, order or session id and by either party's name or e-mail.</summary>
    Task<PagedResult<DisputeDto>> GetDisputesAsync(
        string userId, bool admin, int page, int pageSize, string? filter, string? search, CancellationToken ct);
    Task<DisputeDto> GetDisputeAsync(string userId, Guid id, bool admin, CancellationToken ct);
    Task AddDisputeMessageAsync(string userId, Guid id, AddDisputeMessage input, string version, CancellationToken ct);
    Task AddAdminDisputeMessageAsync(string adminId, Guid id, AddDisputeMessage input, string version, CancellationToken ct);
    Task<AttachmentDto> AddEvidenceAsync(string userId, Guid id, Stream stream, string fileName,
        string contentType, long size, string version, CancellationToken ct);
    Task<PrivateFile> OpenEvidenceAsync(string userId, Guid id, bool admin, CancellationToken ct);
    Task StartDisputeReviewAsync(string adminId, Guid id, string version, CancellationToken ct);
    Task<DisputeDto> ResolveDisputeAsync(
        string adminId, Guid id, ResolveDispute input, string version, string idempotencyKey, CancellationToken ct);
}

public interface IAdminService
{
    Task<PagedResult<AdminUserDto>> GetUsersAsync(int page, int pageSize, string? search, string? role, CancellationToken ct);
    Task SetSuspensionAsync(string adminId, string userId, bool suspended, CancellationToken ct);
    Task SetRoleAsync(string adminId, string userId, string role, bool assigned, CancellationToken ct);
    Task<DashboardMetrics> GetMetricsAsync(CancellationToken ct);
    Task<AdminAttentionDto> GetAttentionAsync(CancellationToken ct);
    Task<IReadOnlyCollection<PopularSubjectMetric>> GetPopularSubjectsAsync(CancellationToken ct);
    Task<PagedResult<AuditDto>> GetAuditAsync(
        int page, int pageSize, string? search, string? action, string? entityType, CancellationToken ct);
    Task<PagedResult<AdminOperationItemDto>> GetRequestsAsync(
        int page, int pageSize, string? search, string? filter, CancellationToken ct);
    Task<PagedResult<AdminOperationItemDto>> GetOrdersAsync(
        int page, int pageSize, string? search, string? filter, CancellationToken ct);
    Task<PagedResult<AdminOperationItemDto>> GetSessionsAsync(
        int page, int pageSize, string? search, string? filter, CancellationToken ct);
    Task ResolveSessionCompletedAsync(string adminId, Guid id, ResolvePassiveSessionOutcome input,
        string version, string idempotencyKey, CancellationToken ct);
    Task ResolveSessionStudentNoShowAsync(string adminId, Guid id, ResolvePassiveSessionOutcome input,
        string version, string idempotencyKey, CancellationToken ct);
    Task ResolveSessionTeacherNoShowAsync(string adminId, Guid id, ResolvePassiveSessionOutcome input,
        string version, string idempotencyKey, CancellationToken ct);
    Task<Guid> EscalateSessionDisputeAsync(string adminId, Guid id, ResolvePassiveSessionOutcome input,
        string version, string idempotencyKey, CancellationToken ct);
}

public sealed class DisputeOptions
{
    public const string SectionName = "Disputes";
    public int WindowDays { get; init; } = 7;
    public int InitialResponseHours { get; init; } = 24;
    public int ResolutionHours { get; init; } = 72;
}
