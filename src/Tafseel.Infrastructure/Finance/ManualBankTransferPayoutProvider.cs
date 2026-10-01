using Tafseel.Application.Finance;
using Tafseel.Domain.Finance;

namespace Tafseel.Infrastructure.Finance;

/// <summary>
/// DEC-04 audited manual fallback. It does <b>not</b> move money and does not call any bank: initiating only
/// returns Tafseel's transfer note, and the Admin sends the bank transfer outside Tafseel using the audited
/// transfer instruction. Completion needs a <see cref="PayoutTransferEvidence.ManualAttestationKind"/> record.
/// </summary>
internal sealed class ManualBankTransferPayoutProvider : IPayoutProvider
{
    public const string ProviderName = "ManualBankTransfer";

    public string Name => ProviderName;
    public bool MovesFundsElectronically => false;
    public string CompletionEvidenceKind => PayoutTransferEvidence.ManualAttestationKind;

    public Task<PayoutInitiation> InitiateAsync(PayoutInitiationRequest request, CancellationToken ct) =>
        Task.FromResult(new PayoutInitiation(ProviderName, TransferNote(request.WithdrawalId), AwaitingManualTransfer: true));

    /// <summary>Deterministic, so a retried initiation produces the same note.</summary>
    public static string TransferNote(Guid withdrawalId) =>
        "TFS-W-" + withdrawalId.ToString("N")[..12].ToUpperInvariant();
}
