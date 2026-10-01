using Tafseel.Domain.Common;

namespace Tafseel.Domain.Finance;

/// <summary>Open (detected, nobody has looked) → Acknowledged (someone owns it) → Resolved (explained and closed).</summary>
public enum ReconciliationExceptionStatus { Open = 0, Acknowledged = 1, Resolved = 2 }

/// <summary>
/// One reconciliation anomaly as a case a money operator owns. It records what was detected and what people
/// concluded; it never changes a balance. A mistake in the ledger is corrected, if ever, by the protected
/// financial workflows, not from here.
/// </summary>
public sealed class ReconciliationException
{
    private ReconciliationException() { }

    public static ReconciliationException Detect(string fingerprint, string kind, Guid? paymentId, Guid? orderId,
        Guid? liveSessionBookingId, decimal difference, string detail, DateTimeOffset now) => new()
        {
            Id = Guid.NewGuid(),
            Fingerprint = Payment.Required(fingerprint, 200),
            Kind = Payment.Required(kind, 60),
            PaymentId = paymentId is { } id && id != Guid.Empty ? id : null,
            OrderId = orderId,
            LiveSessionBookingId = liveSessionBookingId,
            Difference = Payment.Money(difference),
            Detail = Clip(detail, 500),
            Status = ReconciliationExceptionStatus.Open,
            FirstDetectedAt = now,
            LastDetectedAt = now,
            DetectedInLatestScan = true
        };

    public Guid Id { get; private set; }
    /// <summary>Stable identity of the anomaly across scans (kind plus the record it is about).</summary>
    public string Fingerprint { get; private set; } = "";
    public string Kind { get; private set; } = "";
    public Guid? PaymentId { get; private set; }
    public Guid? OrderId { get; private set; }
    public Guid? LiveSessionBookingId { get; private set; }
    public decimal Difference { get; private set; }
    public string Detail { get; private set; } = "";
    public ReconciliationExceptionStatus Status { get; private set; }
    public DateTimeOffset FirstDetectedAt { get; private set; }
    public DateTimeOffset LastDetectedAt { get; private set; }
    /// <summary>False once a later scan no longer finds the anomaly; the case stays for its history.</summary>
    public bool DetectedInLatestScan { get; private set; }
    public string? AcknowledgedBy { get; private set; }
    public DateTimeOffset? AcknowledgedAt { get; private set; }
    public string? AcknowledgementNote { get; private set; }
    public string? ResolvedBy { get; private set; }
    public DateTimeOffset? ResolvedAt { get; private set; }
    public string? ResolutionNote { get; private set; }
    /// <summary>The difference the operator explained; a different one later is a new problem and reopens the case.</summary>
    public decimal? ResolvedDifference { get; private set; }
    public byte[] RowVersion { get; private set; } = [];

    /// <summary>A scan found this anomaly again. Returns true when a resolved case had to be reopened.</summary>
    public bool Seen(decimal difference, string detail, DateTimeOffset now)
    {
        difference = Payment.Money(difference);
        LastDetectedAt = now;
        DetectedInLatestScan = true;
        Detail = Clip(detail, 500);
        var reopened = Status == ReconciliationExceptionStatus.Resolved && ResolvedDifference != difference;
        Difference = difference;
        if (reopened)
        {
            Status = ReconciliationExceptionStatus.Open;
            AcknowledgedBy = null; AcknowledgedAt = null; AcknowledgementNote = null;
        }
        return reopened;
    }

    public void NotSeen() => DetectedInLatestScan = false;

    public void Acknowledge(string actorId, string? note, DateTimeOffset now)
    {
        if (Status != ReconciliationExceptionStatus.Open)
            throw new DomainException("reconciliation_exception_transition_invalid",
                "Only an open exception can be acknowledged.");
        AcknowledgedBy = Payment.Required(actorId, 450);
        AcknowledgedAt = now;
        AcknowledgementNote = string.IsNullOrWhiteSpace(note) ? null : Clip(note, 1000);
        Status = ReconciliationExceptionStatus.Acknowledged;
    }

    public void Resolve(string actorId, string? note, DateTimeOffset now)
    {
        if (Status == ReconciliationExceptionStatus.Resolved)
            throw new DomainException("reconciliation_exception_transition_invalid",
                "This exception is already resolved.");
        var text = note?.Trim() ?? "";
        if (text.Length < 10)
            throw new DomainException("reconciliation_resolution_note_required",
                "Explain what you found and why the case can close (at least 10 characters).");
        ResolvedBy = Payment.Required(actorId, 450);
        ResolvedAt = now;
        ResolutionNote = Clip(text, 1000);
        ResolvedDifference = Difference;
        Status = ReconciliationExceptionStatus.Resolved;
    }

    private static string Clip(string? value, int max)
    {
        var text = (value ?? "").Trim();
        return text.Length <= max ? text : text[..max];
    }
}
