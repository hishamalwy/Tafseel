using System.ComponentModel.DataAnnotations;
using Tafseel.Domain.Finance;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Orders;
using Tafseel.Application.Common;

namespace Tafseel.Application.Finance;

public sealed record PaymentDto(
    Guid Id, Guid? OrderId, Guid? LiveSessionBookingId, Guid? LearningRequestId, decimal Amount, string Currency, string Provider,
    string ProviderReference, PaymentStatus Status, DateTimeOffset CreatedAt);
public sealed record PaymentInitiationDto(PaymentDto Payment, string CheckoutReference);
public sealed record OpenRequestPaymentQuoteDto(
    decimal OfferAmount, decimal StudentFeePercent, decimal StudentFeeAmount,
    decimal Total, string Currency, DateTimeOffset ReservationExpiresAt);
public sealed record MockWebhookEvent(
    [param: Required, StringLength(200)] string EventId,
    [param: Required, StringLength(200)] string ProviderReference,
    decimal Amount,
    [param: Required, RegularExpression("^[A-Za-z]{3}$")] string Currency,
    bool Succeeded);
public sealed record RefundDto(
    Guid Id, Guid PaymentId, Guid? OrderId, Guid? LiveSessionBookingId,
    decimal Amount, string Currency, DateTimeOffset CreatedAt);
public sealed record AdminRefundRequest(
    [param: Required, NotWhiteSpace, StringLength(1000)] string Reason);
public sealed record RequestWithdrawal(
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal Amount,
    [param: Required, RegularExpression("^[A-Za-z]{3}$")] string Currency);
/// <summary>A teacher's withdrawal. The destination is masked; the full destination never appears here.</summary>
public sealed record WithdrawalDto(
    Guid Id, decimal Amount, string Currency, WithdrawalStatus Status,
    string? ProviderReference, DateTimeOffset CreatedAt, string Version,
    string? PayoutMethod = null, string? DestinationLabel = null, string? RejectionReason = null,
    DateTimeOffset? UpdatedAt = null, DateTimeOffset? TransferInitiatedAt = null, DateTimeOffset? TransferredAt = null);
/// <summary>
/// Admin list row. Masked like every list; <see cref="HasDestinationSnapshot"/> is false for withdrawals
/// requested before the payout loop, which can only be rejected (the teacher then re-enters their details).
/// </summary>
public sealed record AdminWithdrawalDto(
    Guid Id, string TeacherId, decimal Amount, string Currency, WithdrawalStatus Status,
    string? ProviderReference, DateTimeOffset CreatedAt, string Version,
    string? TeacherDisplayName = null, string? TeacherDisplayNameEnglish = null,
    string? PayoutMethod = null, string? DestinationLabel = null, string? RejectionReason = null,
    DateTimeOffset? UpdatedAt = null, bool HasDestinationSnapshot = false, string? InitiationReference = null,
    DateTimeOffset? TransferInitiatedAt = null, DateTimeOffset? TransferredAt = null);
/// <summary>
/// Rejects a withdrawal (funds return to Available). <c>Approve = true</c> is refused: a transfer is recorded
/// only through initiation and bank evidence. After initiation the operator must also confirm that no money
/// was sent.
/// </summary>
public sealed record ProcessWithdrawal(
    bool Approve,
    [param: StringLength(200)] string? ProviderReference,
    [param: StringLength(500)] string? RejectionReason = null,
    bool ConfirmNoTransferSent = false);
/// <summary>
/// Full bank-transfer details, sent once over HTTPS in the body. The IBAN is sealed by the payout destination
/// vault before it is stored; no read model returns it. Only <c>bank_transfer</c> is accepted in V1.
/// </summary>
public sealed record SubmitPayoutProfile(
    [param: Required, StringLength(150)] string LegalName,
    [param: Required, RegularExpression("^[A-Za-z]{2}$")] string CountryCode,
    [param: Required, StringLength(30)] string PayoutMethod,
    [param: Required, StringLength(80)] string BankName,
    [param: Required, StringLength(42, MinimumLength = 15)] string Iban,
    [param: Required, RegularExpression("^[A-Za-z0-9]{4}$")] string IdentityLast4);
public sealed record ReviewPayoutProfile(bool Approve, [param: StringLength(500)] string? RejectionReason);
/// <param name="TransferReady">Verified and holding a full, sealed destination a transfer can be made to.</param>
/// <param name="ReenrollmentRequired">Saved before full destinations were collected: the teacher must enter
/// the bank details again before any withdrawal.</param>
public sealed record PayoutProfileDto(string TeacherId, string LegalName, string CountryCode,
    string PayoutMethod, string DestinationLabel, string IdentityLast4,
    PayoutVerificationStatus Status, string? RejectionReason, DateTimeOffset SubmittedAt,
    DateTimeOffset? ReviewedAt, string Version, bool TransferReady = false, bool ReenrollmentRequired = false);
/// <param name="Available">Withdrawable now.</param>
/// <param name="PendingWithdrawal">Reserved by a withdrawal request that is awaiting payout.</param>
/// <param name="PendingClearance">Earned but still inside its dispute-refund exposure window; not withdrawable.</param>
/// <param name="NextClearanceAt">When the earliest clearing amount becomes withdrawable, if any.</param>
public sealed record BalanceDto(
    string Currency, decimal Available, decimal PendingWithdrawal,
    decimal PendingClearance = 0, DateTimeOffset? NextClearanceAt = null);
public sealed record WithdrawalPolicyDto(decimal MinimumAmount, string Currency, int ExpectedSettlementBusinessDays);
public sealed class WithdrawalOptions
{
    public const string SectionName = "Withdrawals";
    public decimal MinimumAmount { get; init; } = 50;
    public string Currency { get; init; } = "SAR";
    public int ExpectedSettlementBusinessDays { get; init; } = 3;
    /// <summary>Upper bound on earnings promoted per maturity scan, so the worker stays bounded.</summary>
    public int MaturityBatchSize { get; init; } = 100;
}
public sealed record ReconciliationDto(
    decimal TotalPayments, decimal EscrowHeld, decimal EscrowReleased, decimal Refunded,
    decimal TeacherAvailable, decimal PendingWithdrawals, decimal PlatformRevenue,
    int UnbalancedEntries, int OrphanPayments,
    decimal TeacherPendingClearance = 0,
    int OverReleasedPayments = 0,
    int AllocationMismatches = 0,
    int NegativeTeacherAvailableAccounts = 0,
    int NegativeTeacherPendingAccounts = 0,
    int OrphanPendingMaturities = 0,
    int MaturedAfterRefund = 0,
    int DuplicateBusinessKeys = 0,
    IReadOnlyCollection<ReconciliationAnomalyDto>? Anomalies = null)
{
    /// <summary>True when every invariant checked by this report holds.</summary>
    public bool IsBalanced =>
        UnbalancedEntries == 0 && OrphanPayments == 0 && OverReleasedPayments == 0
        && AllocationMismatches == 0 && NegativeTeacherAvailableAccounts == 0
        && NegativeTeacherPendingAccounts == 0 && OrphanPendingMaturities == 0
        && MaturedAfterRefund == 0 && DuplicateBusinessKeys == 0;
}

/// <summary>One drill-down row for an Admin to investigate. Read-only: reconciliation never repairs.</summary>
public sealed record ReconciliationAnomalyDto(
    string Kind, Guid PaymentId, Guid? OrderId, Guid? LiveSessionBookingId,
    decimal Captured, decimal Expected, decimal Actual, decimal Difference, string Detail);

/// <summary>
/// Read-only historical audit of coupon-discounted purchases (FR-1). Sourced from the immutable
/// ledger and escrow trail — never inferred from current Order fields.
/// </summary>
public sealed record CouponReconciliationRowDto(
    Guid PaymentId, Guid? OrderId, Guid? LiveSessionBookingId,
    decimal ConfirmedAmount, decimal CouponDiscount,
    decimal ExpectedTeacherAllocation, decimal ExpectedPlatformAllocation,
    decimal EscrowHeld, decimal EscrowReleased, decimal EscrowRefunded,
    decimal ActualTeacherCredit, decimal ActualPlatformCredit,
    decimal Difference, string Status);

public sealed record CouponReconciliationReportDto(
    int RecordsChecked, int Balanced, int OverReleased, int UnderReleased,
    int MissingEscrow, int DuplicateMovement, int NeedsManualReview,
    IReadOnlyCollection<CouponReconciliationRowDto> Rows);

public sealed record ProviderInitiation(string ProviderReference, string CheckoutReference);
public sealed record VerifiedPaymentEvent(
    string EventId, string ProviderReference, decimal Amount, string Currency, bool Succeeded);

public interface IPaymentProvider
{
    string Name { get; }
    Task<ProviderInitiation> InitiateAsync(Guid paymentId, decimal amount, string currency, CancellationToken ct);
    VerifiedPaymentEvent VerifyWebhook(ReadOnlyMemory<byte> payload, string signature);
}

public interface IFinancialService
{
    Task<PaymentInitiationDto> InitiateOrderPaymentAsync(
        string studentId, Guid orderId, string idempotencyKey, string? couponCode, CancellationToken ct);
    Task<PaymentInitiationDto> InitiateLiveSessionPaymentAsync(
        string studentId, Guid liveSessionBookingId, string idempotencyKey, string? couponCode, CancellationToken ct);
    Task<PaymentInitiationDto> InitiateOpenRequestPaymentAsync(
        string studentId, Guid learningRequestId, string idempotencyKey, string? couponCode, CancellationToken ct);
    Task<OpenRequestPaymentQuoteDto> QuoteOpenRequestPaymentAsync(
        string studentId, Guid learningRequestId, CancellationToken ct);
    Task ProcessWebhookAsync(ReadOnlyMemory<byte> payload, string signature, CancellationToken ct);
    Task<PaymentDto> GetPaymentAsync(string userId, Guid paymentId, CancellationToken ct);
    Task<RefundDto> RefundAsync(
        string adminId, Guid paymentId, string reason, string idempotencyKey, CancellationToken ct);
    Task<WithdrawalDto> RequestWithdrawalAsync(
        string teacherId, RequestWithdrawal input, string idempotencyKey, CancellationToken ct);
    Task<WithdrawalDto> ProcessWithdrawalAsync(
        string adminId, Guid id, ProcessWithdrawal input, string version, string idempotencyKey, CancellationToken ct);
    /// <summary>Audited, on-demand transfer instruction (full destination). Never cached, never listed.</summary>
    Task<WithdrawalTransferInstructionDto> GetWithdrawalTransferInstructionAsync(
        string adminId, Guid id, CancellationToken ct);
    Task<AdminWithdrawalDto> InitiateWithdrawalTransferAsync(
        string adminId, Guid id, string version, string idempotencyKey, CancellationToken ct);
    Task<AdminWithdrawalDto> ConfirmWithdrawalTransferAsync(
        string adminId, Guid id, ConfirmWithdrawalTransfer input, string version, string idempotencyKey, CancellationToken ct);
    Task<IReadOnlyCollection<BalanceDto>> GetBalancesAsync(string teacherId, CancellationToken ct);
    WithdrawalPolicyDto GetWithdrawalPolicy();
    Task<PagedResult<WithdrawalDto>> GetMyWithdrawalsAsync(
        string teacherId, int page, int pageSize, CancellationToken ct);
    Task<PagedResult<AdminWithdrawalDto>> GetWithdrawalsAsync(
        WithdrawalStatus? status, int page, int pageSize, CancellationToken ct);
    Task<PayoutProfileDto?> GetPayoutProfileAsync(string teacherId, CancellationToken ct);
    Task<PayoutProfileDto> SubmitPayoutProfileAsync(string teacherId, SubmitPayoutProfile input, CancellationToken ct);
    Task<PagedResult<PayoutProfileDto>> GetPayoutProfilesAsync(
        PayoutVerificationStatus? status, int page, int pageSize, CancellationToken ct);
    Task<PayoutProfileDto> ReviewPayoutProfileAsync(
        string adminId, string teacherId, ReviewPayoutProfile input, string version, CancellationToken ct);
    Task<ReconciliationDto> ReconcileAsync(CancellationToken ct);
    Task<CouponReconciliationReportDto> ReconcileCouponPurchasesAsync(int limit, CancellationToken ct);
    /// <summary>Promotes one due earning from clearance to available. Idempotent and concurrency-safe.</summary>
    Task<bool> MatureTeacherEarningAsync(Guid maturityId, CancellationToken ct);
    /// <summary>Bounded batch of earnings whose refund exposure window has ended.</summary>
    Task<IReadOnlyCollection<Guid>> GetDueEarningMaturityIdsAsync(int batchSize, CancellationToken ct);
    Task ReleaseOrderEscrowAsync(Order order, string actorId, CancellationToken ct);
    Task ReleaseLiveSessionEscrowAsync(LiveSessionBooking booking, string actorId, CancellationToken ct);
    Task RefundLiveSessionEscrowAsync(
        LiveSessionBooking booking, string actorId, string idempotencyKey, CancellationToken ct);
    Task SettleDisputeAsync(
        Order order, bool refundStudent, string actorId, string idempotencyKey, CancellationToken ct);
    Task SettleLiveSessionDisputeAsync(
        LiveSessionBooking booking, bool refundStudent, string actorId, string idempotencyKey, CancellationToken ct);
}

public sealed class PaymentOptions
{
    public const string SectionName = "Payments";
    public string Provider { get; init; } = "Mock";
    public string WebhookSecret { get; init; } = "";
    public bool AutoReleaseEnabled { get; init; }
    public int AutoReleaseAfterHours { get; init; } = 72;
    /// <summary>Mock-provider controls. Ignored when Provider is not Mock.</summary>
    public MockPaymentOptions Mock { get; init; } = new();
}

/// <summary>
/// Development / explicitly enabled Staging mock PSP controls.
/// Production must keep SimulatorEnabled=false (and Provider != Mock).
/// </summary>
public sealed class MockPaymentOptions
{
    /// <summary>When Provider=Mock, must remain true. Production forbids Provider=Mock entirely.</summary>
    public bool Enabled { get; init; } = true;
    /// <summary>Exposes the browser checkout simulator and server-side signed webhook helper.</summary>
    public bool SimulatorEnabled { get; init; }
    /// <summary>Relative app path after a simulated outcome (open-redirect safe).</summary>
    public string DefaultReturnPath { get; init; } = Common.AppRoutes.StudentHome;
}

public sealed record PaymentCapabilitiesDto(string Provider, bool MockSimulatorEnabled);

public sealed record MockSimulatorSessionDto(
    string ProviderReference,
    Guid PaymentId,
    decimal Amount,
    string Currency,
    PaymentStatus Status,
    Guid? OrderId,
    Guid? LiveSessionBookingId,
    Guid? LearningRequestId = null);

public sealed record MockSimulatorCompleteRequest(
    [param: Required, StringLength(200)] string ProviderReference,
    bool Succeeded,
    [param: StringLength(300)] string? ReturnPath);

public sealed record MockSimulatorCompleteResponse(
    PaymentStatus Status,
    Guid PaymentId,
    string ReturnUrl);

public interface IMockPaymentSimulator
{
    bool IsActive { get; }
    PaymentCapabilitiesDto GetCapabilities();
    Task<MockSimulatorSessionDto> GetSessionAsync(
        string studentId, string providerReference, CancellationToken ct);
    Task<MockSimulatorCompleteResponse> CompleteAsync(
        string studentId, MockSimulatorCompleteRequest input, CancellationToken ct);
}
