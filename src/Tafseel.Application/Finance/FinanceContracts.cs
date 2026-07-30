using System.ComponentModel.DataAnnotations;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Orders;
using Tafseel.Application.Common;

namespace Tafseel.Application.Finance;

public sealed record PaymentDto(
    Guid Id, Guid? OrderId, Guid? LiveSessionBookingId, decimal Amount, string Currency, string Provider,
    string ProviderReference, PaymentStatus Status, DateTimeOffset CreatedAt);
public sealed record PaymentInitiationDto(PaymentDto Payment, string CheckoutReference);
public sealed record MockWebhookEvent(
    [param: Required, StringLength(200)] string EventId,
    [param: Required, StringLength(200)] string ProviderReference,
    decimal Amount,
    [param: Required, RegularExpression("^[A-Za-z]{3}$")] string Currency,
    bool Succeeded);
public sealed record RefundDto(
    Guid Id, Guid PaymentId, Guid OrderId, decimal Amount, string Currency, DateTimeOffset CreatedAt);
public sealed record RequestWithdrawal(
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal Amount,
    [param: Required, RegularExpression("^[A-Za-z]{3}$")] string Currency);
public sealed record WithdrawalDto(
    Guid Id, decimal Amount, string Currency, WithdrawalStatus Status,
    string? ProviderReference, DateTimeOffset CreatedAt, string Version);
public sealed record AdminWithdrawalDto(
    Guid Id, string TeacherId, decimal Amount, string Currency, WithdrawalStatus Status,
    string? ProviderReference, DateTimeOffset CreatedAt, string Version,
    string? TeacherDisplayName = null, string? TeacherDisplayNameEnglish = null);
public sealed record ProcessWithdrawal(
    bool Approve,
    [param: StringLength(200)] string? ProviderReference);
public sealed record BalanceDto(string Currency, decimal Available, decimal PendingWithdrawal);
public sealed record ReconciliationDto(
    decimal TotalPayments, decimal EscrowHeld, decimal EscrowReleased, decimal Refunded,
    decimal TeacherAvailable, decimal PendingWithdrawals, decimal PlatformRevenue,
    int UnbalancedEntries, int OrphanPayments);

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
    Task ProcessWebhookAsync(ReadOnlyMemory<byte> payload, string signature, CancellationToken ct);
    Task<PaymentDto> GetPaymentAsync(string userId, Guid paymentId, CancellationToken ct);
    Task<RefundDto> RefundAsync(string adminId, Guid paymentId, string idempotencyKey, CancellationToken ct);
    Task<WithdrawalDto> RequestWithdrawalAsync(
        string teacherId, RequestWithdrawal input, string idempotencyKey, CancellationToken ct);
    Task<WithdrawalDto> ProcessWithdrawalAsync(
        string adminId, Guid id, ProcessWithdrawal input, string version, string idempotencyKey, CancellationToken ct);
    Task<IReadOnlyCollection<BalanceDto>> GetBalancesAsync(string teacherId, CancellationToken ct);
    Task<PagedResult<AdminWithdrawalDto>> GetWithdrawalsAsync(
        WithdrawalStatus? status, int page, int pageSize, CancellationToken ct);
    Task<ReconciliationDto> ReconcileAsync(CancellationToken ct);
    Task ReleaseOrderEscrowAsync(Order order, string actorId, CancellationToken ct);
    Task SettleDisputeAsync(
        Order order, bool refundStudent, string actorId, string idempotencyKey, CancellationToken ct);
}

public sealed class PaymentOptions
{
    public const string SectionName = "Payments";
    public string Provider { get; init; } = "Mock";
    public string WebhookSecret { get; init; } = "";
    public bool AutoReleaseEnabled { get; init; }
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
    public string DefaultReturnPath { get; init; } = "/app/Tafseel-Student-Dashboard.dc.html";
}

public sealed record PaymentCapabilitiesDto(string Provider, bool MockSimulatorEnabled);

public sealed record MockSimulatorSessionDto(
    string ProviderReference,
    Guid PaymentId,
    decimal Amount,
    string Currency,
    PaymentStatus Status,
    Guid? OrderId,
    Guid? LiveSessionBookingId);

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
