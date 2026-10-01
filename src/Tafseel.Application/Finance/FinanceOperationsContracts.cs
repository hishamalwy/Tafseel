using System.ComponentModel.DataAnnotations;
using Tafseel.Application.Common;
using Tafseel.Domain.Finance;

namespace Tafseel.Application.Finance;

/// <summary>
/// One payment as a money operator finds it: who paid, for what, and whether it needs attention.
/// <see cref="Stuck"/> matches the attention count: pending longer than the settlement window.
/// </summary>
public sealed record FinancePaymentListItemDto(
    Guid Id, decimal Amount, string Currency, PaymentStatus Status, string Provider, string ProviderReference,
    DateTimeOffset CreatedAt, string PurchaseKind, Guid? PurchaseId, string? PurchaseTitle,
    string StudentId, string? StudentName, string? StudentEmail,
    string? TeacherId, string? TeacherName, bool Refunded, bool Stuck, int FailedAttempts);

public sealed record FinancePaymentAttemptDto(Guid Id, string ProviderReference, PaymentAttemptStatus Status,
    string? FailureCode, DateTimeOffset CreatedAt);

public sealed record FinanceWebhookRecordDto(Guid Id, string Provider, string EventId, DateTimeOffset ProcessedAt);

/// <summary>The purchase the payment is for, with the status an operator needs to judge a refund.</summary>
public sealed record FinancePurchaseDto(string Kind, Guid Id, string? Title, string Status, string? PaymentStatus,
    decimal Price, string Currency, bool HasDispute, Guid? DisputeId);

public sealed record FinanceEscrowEntryDto(EscrowEntryType Type, decimal Amount, string Currency, DateTimeOffset CreatedAt);

public sealed record FinanceRefundDto(Guid Id, decimal Amount, string Currency, string ActorId, string? ActorName,
    DateTimeOffset CreatedAt);

/// <summary>One ledger movement touching this purchase, named by account kind (never by balance).</summary>
public sealed record FinanceLedgerLineDto(string BusinessKey, string DebitAccount, string CreditAccount,
    decimal Amount, string Currency, DateTimeOffset CreatedAt);

/// <param name="RefundAvailable">Whether the existing full-refund rules would accept a refund by this viewer now.</param>
/// <param name="RefundBlockedReason">Error code explaining why not, when not.</param>
public sealed record FinancePaymentDetailDto(
    FinancePaymentListItemDto Payment,
    IReadOnlyCollection<FinancePaymentAttemptDto> Attempts,
    IReadOnlyCollection<FinanceWebhookRecordDto> Webhooks,
    FinancePurchaseDto? Purchase,
    IReadOnlyCollection<FinanceEscrowEntryDto> Escrow,
    IReadOnlyCollection<FinanceRefundDto> Refunds,
    IReadOnlyCollection<FinanceLedgerLineDto> Ledger,
    bool RefundAvailable, string? RefundBlockedReason);

/// <summary>Search filters. <c>Query</c> matches an id (payment, order, session or request), a provider
/// reference, or a student's or teacher's name or email. <c>Status</c> is a payment status or <c>stuck</c>.</summary>
public sealed record FinancePaymentSearch(string? Query, string? Status, DateTimeOffset? From, DateTimeOffset? To,
    int Page = 1, int PageSize = 25);

public sealed record FinancialAuditItemDto(Guid Id, string Action, string ActorId, string? ActorName,
    string EntityType, string EntityId, string CorrelationKey, DateTimeOffset CreatedAt);

public sealed record ReconciliationExceptionDto(
    Guid Id, string Kind, Guid? PaymentId, Guid? OrderId, Guid? LiveSessionBookingId, decimal Difference,
    string Detail, ReconciliationExceptionStatus Status, DateTimeOffset FirstDetectedAt, DateTimeOffset LastDetectedAt,
    bool DetectedInLatestScan, string? AcknowledgedBy, string? AcknowledgedByName, DateTimeOffset? AcknowledgedAt,
    string? AcknowledgementNote, string? ResolvedBy, string? ResolvedByName, DateTimeOffset? ResolvedAt,
    string? ResolutionNote, string Version);

/// <summary>A reconciliation run: the totals and invariants, plus how many exception cases are still open.</summary>
public sealed record ReconciliationScanDto(ReconciliationDto Report, int OpenExceptions, int AcknowledgedExceptions,
    int NewExceptions, int ReopenedExceptions);

public sealed record AnnotateReconciliationException([param: StringLength(1000)] string? Note);

/// <summary>What a Finance operator's home needs first: the queues that wait on them.</summary>
public sealed record FinanceAttentionDto(int StuckPayments, int FailedPaymentsLast24Hours,
    int PayoutProfilesAwaitingReview, int WithdrawalsAwaitingTransfer, int TransfersAwaitingEvidence,
    int OpenReconciliationExceptions, bool LedgerBalanced);

public interface IFinanceOperationsService
{
    Task<PagedResult<FinancePaymentListItemDto>> SearchPaymentsAsync(FinancePaymentSearch search, CancellationToken ct);
    Task<FinancePaymentDetailDto> GetPaymentAsync(string viewerId, Guid paymentId, CancellationToken ct);
    Task<PagedResult<FinancialAuditItemDto>> GetFinancialAuditAsync(string? query, string? entityType,
        DateTimeOffset? from, DateTimeOffset? to, int page, int pageSize, CancellationToken ct);
    Task<ReconciliationScanDto> ScanReconciliationAsync(string actorId, CancellationToken ct);
    Task<PagedResult<ReconciliationExceptionDto>> GetReconciliationExceptionsAsync(
        ReconciliationExceptionStatus? status, int page, int pageSize, CancellationToken ct);
    Task<ReconciliationExceptionDto> AcknowledgeExceptionAsync(string actorId, Guid id, string? note, string version, CancellationToken ct);
    Task<ReconciliationExceptionDto> ResolveExceptionAsync(string actorId, Guid id, string? note, string version, CancellationToken ct);
    Task<FinanceAttentionDto> GetAttentionAsync(CancellationToken ct);
}
