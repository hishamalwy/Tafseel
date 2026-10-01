using System.ComponentModel.DataAnnotations;
using Tafseel.Domain.Finance;

namespace Tafseel.Application.Finance;

/// <summary>
/// Evidence that the bank transfer happened, as the operator reads it from the bank's own record.
/// A human attestation, not bank-side cryptographic verification (DEC-04 manual adapter).
/// </summary>
public sealed record ConfirmWithdrawalTransfer(
    [param: Required, StringLength(64, MinimumLength = 4)] string BankReference,
    [param: Required, StringLength(100, MinimumLength = 2)] string SourceInstitution,
    DateTimeOffset TransferredAt,
    [param: Range(typeof(decimal), "0.01", "1000000")] decimal Amount,
    [param: Required, RegularExpression("^[A-Za-z]{3}$")] string Currency,
    bool ConfirmedAgainstBankRecord);

/// <summary>
/// What an Admin needs to send one bank transfer: the destination snapshotted when the teacher requested the
/// withdrawal, the amount, and whether it may be sent now. Returned only by the audited instruction endpoint.
/// </summary>
/// <param name="TransferNote">Tafseel's reference to put on the bank transfer, so the statement line can be matched.</param>
/// <param name="ReadyToSend">True only once the transfer was started in Tafseel (status TransferInitiated).</param>
public sealed record WithdrawalTransferInstructionDto(
    Guid WithdrawalId, WithdrawalStatus Status, decimal Amount, string Currency,
    string TeacherId, string? TeacherDisplayName,
    string BeneficiaryName, string BankName, string Iban, string CountryCode, string DestinationLabel,
    string TransferNote, DateTimeOffset RequestedAt, DateTimeOffset? DestinationVerifiedAt,
    DateTimeOffset? TransferInitiatedAt, bool ReadyToSend, string Provider, bool ProviderMovesFunds,
    string Version);

/// <summary>What a payout adapter is asked to do. The destination stays sealed; an adapter that needs it opens it.</summary>
public sealed record PayoutInitiationRequest(
    Guid WithdrawalId, string TeacherId, decimal Amount, string Currency, SealedPayoutDestination Destination);

/// <param name="Reference">The adapter's reference for this payout (for the manual adapter, the bank transfer note).</param>
/// <param name="AwaitingManualTransfer">True when a person must still send the money outside Tafseel.</param>
public sealed record PayoutInitiation(string Provider, string Reference, bool AwaitingManualTransfer);

/// <summary>
/// DEC-04 permanent payout port. An automated adapter (PAY-01 / PAY-04b) may replace or sit beside the manual
/// one without changing ledger semantics: reserve on request, provider clearing on confirmed transfer,
/// return on a safe rejection.
/// </summary>
public interface IPayoutProvider
{
    string Name { get; }
    /// <summary>False for the manual adapter: it prepares an instruction and records initiation only.</summary>
    bool MovesFundsElectronically { get; }
    /// <summary>The kind of evidence that confirms a transfer made through this adapter.</summary>
    string CompletionEvidenceKind { get; }
    Task<PayoutInitiation> InitiateAsync(PayoutInitiationRequest request, CancellationToken ct);
}

/// <summary>
/// Seals and opens full payout destinations. Implementations must fail closed when their key material is
/// unavailable and must never log, persist or return the plaintext except to the caller that asked.
/// </summary>
public interface IPayoutDestinationVault
{
    SealedPayoutDestination Seal(string teacherId, BankTransferDestination destination);
    BankTransferDestination Open(string teacherId, SealedPayoutDestination destination);
}
