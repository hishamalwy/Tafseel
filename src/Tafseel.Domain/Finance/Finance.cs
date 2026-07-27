using Tafseel.Domain.Common;

namespace Tafseel.Domain.Finance;

public enum PaymentStatus { Pending, Confirmed, Failed, Refunded }
public enum PaymentAttemptStatus { Created, Succeeded, Failed }
public enum EscrowEntryType { Held, Released, Refunded }
public enum LedgerAccountKind
{
    ProviderClearing,
    EscrowHeld,
    TeacherPending,
    TeacherAvailable,
    PlatformRevenue,
    RefundClearing,
    WithdrawalClearing
}
public enum WithdrawalStatus { Pending, Completed, Rejected }

public sealed class Payment
{
    private Payment() { }
    public Payment(Guid orderId, string studentId, decimal amount, string currency,
        string provider, string providerReference, string idempotencyKey, DateTimeOffset now)
        : this(orderId, null, studentId, amount, currency, provider, providerReference, idempotencyKey, now)
    {
    }

    public static Payment ForLiveSession(
        Guid liveSessionBookingId, string studentId, decimal amount, string currency,
        string provider, string providerReference, string idempotencyKey, DateTimeOffset now) =>
        new(null, liveSessionBookingId, studentId, amount, currency, provider, providerReference, idempotencyKey, now);

    private Payment(Guid? orderId, Guid? liveSessionBookingId, string studentId, decimal amount, string currency,
        string provider, string providerReference, string idempotencyKey, DateTimeOffset now)
    {
        if (amount <= 0 || currency?.Trim().Length != 3)
            throw new DomainException("invalid_payment", "Payment terms are invalid.");
        if (orderId.HasValue == liveSessionBookingId.HasValue)
            throw new DomainException("invalid_payment", "Payment must target exactly one payable.");
        Id = Guid.NewGuid();
        OrderId = orderId;
        LiveSessionBookingId = liveSessionBookingId;
        StudentId = Required(studentId, 450);
        Amount = Money(amount);
        Currency = currency.Trim().ToUpperInvariant();
        Provider = Required(provider, 50);
        ProviderReference = Required(providerReference, 200);
        InitiationIdempotencyKey = Required(idempotencyKey, 100);
        Status = PaymentStatus.Pending;
        CreatedAt = UpdatedAt = now;
    }
    public Guid Id { get; private set; }
    public Guid? OrderId { get; private set; }
    public Guid? LiveSessionBookingId { get; private set; }
    public string StudentId { get; private set; } = "";
    public decimal Amount { get; private set; }
    public string Currency { get; private set; } = "";
    public string Provider { get; private set; } = "";
    public string ProviderReference { get; private set; } = "";
    public string InitiationIdempotencyKey { get; private set; } = "";
    public PaymentStatus Status { get; private set; }
    public DateTimeOffset? ConfirmedAt { get; private set; }
    public DateTimeOffset? RefundedAt { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];

    public bool Confirm(decimal amount, string currency, DateTimeOffset now)
    {
        if (Status == PaymentStatus.Confirmed) return false;
        if (Status != PaymentStatus.Pending || Money(amount) != Amount
            || !string.Equals(currency, Currency, StringComparison.OrdinalIgnoreCase))
            throw new DomainException("payment_mismatch", "Provider payment does not match the payable.");
        Status = PaymentStatus.Confirmed;
        ConfirmedAt = UpdatedAt = now;
        return true;
    }
    public void Fail(DateTimeOffset now)
    {
        if (Status != PaymentStatus.Pending) throw InvalidTransition();
        Status = PaymentStatus.Failed;
        UpdatedAt = now;
    }
    public bool Refund(DateTimeOffset now)
    {
        if (Status == PaymentStatus.Refunded) return false;
        if (Status != PaymentStatus.Confirmed) throw InvalidTransition();
        Status = PaymentStatus.Refunded;
        RefundedAt = UpdatedAt = now;
        return true;
    }
    private static DomainException InvalidTransition() =>
        new("invalid_payment_transition", "The payment transition is not allowed.");
    internal static decimal Money(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    internal static string Required(string? value, int max)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 || value.Length > max)
            throw new DomainException("invalid_financial_record", "A required financial value is invalid.");
        return value;
    }
}

public sealed class PaymentAttempt
{
    private PaymentAttempt() { }
    public PaymentAttempt(Guid paymentId, string providerReference, PaymentAttemptStatus status,
        string? failureCode, DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid(); PaymentId = paymentId; ProviderReference = providerReference;
        Status = status; FailureCode = failureCode; CreatedAt = createdAt;
    }
    public Guid Id { get; private set; }
    public Guid PaymentId { get; private set; }
    public string ProviderReference { get; private set; } = "";
    public PaymentAttemptStatus Status { get; private set; }
    public string? FailureCode { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class PaymentWebhookRecord
{
    private PaymentWebhookRecord() { }
    public PaymentWebhookRecord(string provider, string eventId, string payloadHash,
        string providerReference, DateTimeOffset processedAt)
    {
        Id = Guid.NewGuid(); Provider = Payment.Required(provider, 50);
        EventId = Payment.Required(eventId, 200); PayloadHash = Payment.Required(payloadHash, 64);
        ProviderReference = Payment.Required(providerReference, 200); ProcessedAt = processedAt;
    }
    public Guid Id { get; private set; }
    public string Provider { get; private set; } = "";
    public string EventId { get; private set; } = "";
    public string PayloadHash { get; private set; } = "";
    public string ProviderReference { get; private set; } = "";
    public DateTimeOffset ProcessedAt { get; private set; }
}

public sealed class EscrowEntry
{
    private EscrowEntry() { }
    public EscrowEntry(Guid paymentId, Guid orderId, EscrowEntryType type, decimal amount,
        string currency, string businessKey, DateTimeOffset createdAt)
        : this(paymentId, orderId, null, type, amount, currency, businessKey, createdAt)
    {
    }

    public static EscrowEntry ForLiveSession(
        Guid paymentId, Guid liveSessionBookingId, EscrowEntryType type, decimal amount,
        string currency, string businessKey, DateTimeOffset createdAt) =>
        new(paymentId, null, liveSessionBookingId, type, amount, currency, businessKey, createdAt);

    private EscrowEntry(Guid paymentId, Guid? orderId, Guid? liveSessionBookingId, EscrowEntryType type,
        decimal amount, string currency, string businessKey, DateTimeOffset createdAt)
    {
        if (amount <= 0) throw new DomainException("invalid_escrow", "Escrow amount must be positive.");
        if (orderId.HasValue == liveSessionBookingId.HasValue)
            throw new DomainException("invalid_escrow", "Escrow must target exactly one payable.");
        Id = Guid.NewGuid(); PaymentId = paymentId; OrderId = orderId;
        LiveSessionBookingId = liveSessionBookingId; Type = type;
        Amount = Payment.Money(amount); Currency = Payment.Required(currency, 3).ToUpperInvariant();
        BusinessKey = Payment.Required(businessKey, 200); CreatedAt = createdAt;
    }
    public Guid Id { get; private set; }
    public Guid PaymentId { get; private set; }
    public Guid? OrderId { get; private set; }
    public Guid? LiveSessionBookingId { get; private set; }
    public EscrowEntryType Type { get; private set; }
    public decimal Amount { get; private set; }
    public string Currency { get; private set; } = "";
    public string BusinessKey { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class LedgerAccount
{
    private LedgerAccount() { }
    public LedgerAccount(LedgerAccountKind kind, string ownerId, string currency, DateTimeOffset now)
    {
        Id = Guid.NewGuid(); Kind = kind; OwnerId = ownerId?.Trim() ?? "";
        Currency = Payment.Required(currency, 3).ToUpperInvariant(); CreatedAt = now;
    }
    public Guid Id { get; private set; }
    public LedgerAccountKind Kind { get; private set; }
    public string OwnerId { get; private set; } = "";
    public string Currency { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class LedgerEntry
{
    private LedgerEntry() { }
    public LedgerEntry(string businessKey, Guid debitAccountId, Guid creditAccountId,
        decimal amount, string currency, string referenceType, string referenceId, DateTimeOffset now)
    {
        if (debitAccountId == creditAccountId || amount <= 0)
            throw new DomainException("invalid_ledger_entry", "Ledger transfer is invalid.");
        Id = Guid.NewGuid(); BusinessKey = Payment.Required(businessKey, 200);
        DebitAccountId = debitAccountId; CreditAccountId = creditAccountId;
        Amount = Payment.Money(amount); Currency = Payment.Required(currency, 3).ToUpperInvariant();
        ReferenceType = Payment.Required(referenceType, 50);
        ReferenceId = Payment.Required(referenceId, 200); CreatedAt = now;
    }
    public Guid Id { get; private set; }
    public string BusinessKey { get; private set; } = "";
    public Guid DebitAccountId { get; private set; }
    public Guid CreditAccountId { get; private set; }
    public decimal Amount { get; private set; }
    public string Currency { get; private set; } = "";
    public string ReferenceType { get; private set; } = "";
    public string ReferenceId { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class Refund
{
    private Refund() { }
    public Refund(Guid paymentId, Guid orderId, decimal amount, string currency,
        string idempotencyKey, string actorId, DateTimeOffset now)
    {
        Id = Guid.NewGuid(); PaymentId = paymentId; OrderId = orderId; Amount = Payment.Money(amount);
        Currency = Payment.Required(currency, 3).ToUpperInvariant();
        IdempotencyKey = Payment.Required(idempotencyKey, 100);
        ActorId = Payment.Required(actorId, 450); CreatedAt = now;
    }
    public Guid Id { get; private set; }
    public Guid PaymentId { get; private set; }
    public Guid OrderId { get; private set; }
    public decimal Amount { get; private set; }
    public string Currency { get; private set; } = "";
    public string IdempotencyKey { get; private set; } = "";
    public string ActorId { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}

public sealed class WithdrawalRequest
{
    private WithdrawalRequest() { }
    public WithdrawalRequest(string teacherId, decimal amount, string currency,
        string idempotencyKey, DateTimeOffset now)
    {
        if (amount <= 0) throw new DomainException("invalid_withdrawal", "Withdrawal amount must be positive.");
        Id = Guid.NewGuid(); TeacherId = Payment.Required(teacherId, 450); Amount = Payment.Money(amount);
        Currency = Payment.Required(currency, 3).ToUpperInvariant();
        IdempotencyKey = Payment.Required(idempotencyKey, 100);
        Status = WithdrawalStatus.Pending; CreatedAt = UpdatedAt = now;
    }
    public Guid Id { get; private set; }
    public string TeacherId { get; private set; } = "";
    public decimal Amount { get; private set; }
    public string Currency { get; private set; } = "";
    public string IdempotencyKey { get; private set; } = "";
    public WithdrawalStatus Status { get; private set; }
    public string? ProviderReference { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];
    public bool Complete(string providerReference, DateTimeOffset now)
    {
        if (Status == WithdrawalStatus.Completed) return false;
        if (Status != WithdrawalStatus.Pending) throw InvalidTransition();
        ProviderReference = Payment.Required(providerReference, 200);
        Status = WithdrawalStatus.Completed; UpdatedAt = now; return true;
    }
    public bool Reject(DateTimeOffset now)
    {
        if (Status == WithdrawalStatus.Rejected) return false;
        if (Status != WithdrawalStatus.Pending) throw InvalidTransition();
        Status = WithdrawalStatus.Rejected; UpdatedAt = now; return true;
    }
    private static DomainException InvalidTransition() =>
        new("invalid_withdrawal_transition", "The withdrawal transition is not allowed.");
}

public sealed class FinancialAuditRecord
{
    private FinancialAuditRecord() { }
    public FinancialAuditRecord(string action, string actorId, string entityType,
        string entityId, string correlationKey, DateTimeOffset now)
    {
        Id = Guid.NewGuid(); Action = Payment.Required(action, 100);
        ActorId = Payment.Required(actorId, 450); EntityType = Payment.Required(entityType, 50);
        EntityId = Payment.Required(entityId, 200); CorrelationKey = Payment.Required(correlationKey, 200);
        CreatedAt = now;
    }
    public Guid Id { get; private set; }
    public string Action { get; private set; } = "";
    public string ActorId { get; private set; } = "";
    public string EntityType { get; private set; } = "";
    public string EntityId { get; private set; } = "";
    public string CorrelationKey { get; private set; } = "";
    public DateTimeOffset CreatedAt { get; private set; }
}
