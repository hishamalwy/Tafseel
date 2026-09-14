using Tafseel.Domain.Common;

namespace Tafseel.Domain.Finance;

public enum TeacherEarningMaturityStatus { Pending, Matured, Reversed }

/// <summary>
/// Schedules the promotion of one teacher earning from <see cref="LedgerAccountKind.TeacherPending"/>
/// to <see cref="LedgerAccountKind.TeacherAvailable"/>.
/// <para>
/// This record is a <b>schedule</b>, not a second source of monetary truth. The money itself lives in
/// <c>LedgerEntry</c> rows; promotion and reversal are made idempotent by the unique
/// <c>LedgerEntry.BusinessKey</c> index, so a lost or replayed schedule row can never move money twice.
/// </para>
/// </summary>
public sealed class TeacherEarningMaturity
{
    private TeacherEarningMaturity() { }

    private TeacherEarningMaturity(
        Guid paymentId, Guid? orderId, Guid? liveSessionBookingId, string teacherId,
        decimal amount, string currency, DateTimeOffset maturesAt, string businessKey, DateTimeOffset now)
    {
        if (new[] { orderId.HasValue, liveSessionBookingId.HasValue }.Count(x => x) != 1)
            throw new DomainException("invalid_earning_maturity", "An earning maturity must target exactly one payable.");
        if (amount <= 0)
            throw new DomainException("invalid_earning_maturity", "Earning maturity amount must be positive.");
        Id = Guid.NewGuid();
        PaymentId = paymentId;
        OrderId = orderId;
        LiveSessionBookingId = liveSessionBookingId;
        TeacherId = Payment.Required(teacherId, 450);
        Amount = Payment.Money(amount);
        Currency = Payment.Required(currency, 3).ToUpperInvariant();
        MaturesAt = maturesAt;
        BusinessKey = Payment.Required(businessKey, 200);
        Status = TeacherEarningMaturityStatus.Pending;
        CreatedAt = now;
    }

    public static TeacherEarningMaturity ForOrder(
        Guid paymentId, Guid orderId, string teacherId, decimal amount, string currency,
        DateTimeOffset maturesAt, DateTimeOffset now) =>
        new(paymentId, orderId, null, teacherId, amount, currency, maturesAt, $"order:{orderId}:teacher-maturity", now);

    public static TeacherEarningMaturity ForLiveSession(
        Guid paymentId, Guid liveSessionBookingId, string teacherId, decimal amount, string currency,
        DateTimeOffset maturesAt, DateTimeOffset now) =>
        new(paymentId, null, liveSessionBookingId, teacherId, amount, currency, maturesAt,
            $"live-session:{liveSessionBookingId}:teacher-maturity", now);

    public Guid Id { get; private set; }
    public Guid PaymentId { get; private set; }
    public Guid? OrderId { get; private set; }
    public Guid? LiveSessionBookingId { get; private set; }
    public string TeacherId { get; private set; } = "";
    public decimal Amount { get; private set; }
    public string Currency { get; private set; } = "";
    public DateTimeOffset MaturesAt { get; private set; }
    public TeacherEarningMaturityStatus Status { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset? SettledAt { get; private set; }
    /// <summary>Stable key shared by the promotion ledger entry, so promotion cannot be written twice.</summary>
    public string BusinessKey { get; private set; } = "";
    public byte[] RowVersion { get; private set; } = [];

    /// <summary>
    /// <see cref="MaturesAt"/> is the <b>last instant a dispute may still be opened</b>, so money is only
    /// due strictly after it. This mirrors the dispute predicate <c>referenceAt &gt;= now - WindowDays</c>,
    /// which admits a dispute at exactly <c>referenceAt + WindowDays</c>.
    /// </summary>
    public bool IsDue(DateTimeOffset now) =>
        Status == TeacherEarningMaturityStatus.Pending && now > MaturesAt;

    /// <summary>Promotes pending money to available. Returns false when already settled (idempotent).</summary>
    public bool Mature(DateTimeOffset now)
    {
        if (Status == TeacherEarningMaturityStatus.Matured) return false;
        if (Status != TeacherEarningMaturityStatus.Pending)
            throw new DomainException("earning_maturity_reversed", "A reversed earning cannot mature.");
        if (now <= MaturesAt)
            throw new DomainException("earning_not_matured", "The earning is still inside its refund exposure window.");
        Status = TeacherEarningMaturityStatus.Matured;
        SettledAt = now;
        return true;
    }

    /// <summary>Marks the pending earning reversed by a refund. Returns false when already reversed (idempotent).</summary>
    public bool Reverse(DateTimeOffset now)
    {
        if (Status == TeacherEarningMaturityStatus.Reversed) return false;
        if (Status != TeacherEarningMaturityStatus.Pending)
            throw new DomainException("earning_already_matured", "A matured earning cannot be reversed from pending.");
        Status = TeacherEarningMaturityStatus.Reversed;
        SettledAt = now;
        return true;
    }
}
