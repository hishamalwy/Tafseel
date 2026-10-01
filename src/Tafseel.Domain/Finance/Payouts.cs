using System.Numerics;
using Tafseel.Domain.Common;

namespace Tafseel.Domain.Finance;

/// <summary>Payout methods a payout adapter can actually execute. V1: bank transfer only (DEC-04).</summary>
public static class PayoutMethods
{
    public const string BankTransfer = "bank_transfer";
}

/// <summary>
/// A full bank-transfer destination in plain text. It exists only in memory: it is validated here, sealed by
/// the payout destination vault before it is stored, and opened again only for an audited transfer
/// instruction. <see cref="ToString"/> is masked so the value cannot leak through a log line.
/// </summary>
public sealed class BankTransferDestination
{
    // ISO 13616 lengths for the countries the payout form offers; any other country gets the generic bounds.
    private static readonly IReadOnlyDictionary<string, int> IbanLengths = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        ["SA"] = 24,
        ["AE"] = 23,
        ["KW"] = 30,
        ["QA"] = 29,
        ["BH"] = 22,
        ["OM"] = 23,
        ["JO"] = 30,
        ["EG"] = 29
    };

    private BankTransferDestination(string beneficiaryName, string bankName, string iban, string countryCode)
    {
        BeneficiaryName = beneficiaryName; BankName = bankName; Iban = iban; CountryCode = countryCode;
    }

    public string BeneficiaryName { get; }
    public string BankName { get; }
    public string Iban { get; }
    public string CountryCode { get; }

    /// <summary>What every ordinary read shows: the bank and the last four characters of the IBAN.</summary>
    public string MaskedLabel => $"{BankName} ••••{Iban[^4..]}";

    public override string ToString() => MaskedLabel;

    public static BankTransferDestination Create(string? beneficiaryName, string? bankName, string? iban, string? countryCode)
    {
        var beneficiary = (beneficiaryName ?? "").Trim();
        if (beneficiary.Length is < 2 or > 150 || beneficiary.Any(char.IsControl))
            throw new DomainException("payout_beneficiary_invalid", "The account holder name is invalid.");
        var bank = (bankName ?? "").Trim();
        if (bank.Length is < 2 or > 80 || bank.Any(c => char.IsDigit(c) || char.IsControl(c)))
            throw new DomainException("payout_bank_name_invalid", "The bank name is invalid.");
        var country = (countryCode ?? "").Trim().ToUpperInvariant();
        if (country.Length != 2 || !country.All(c => c is >= 'A' and <= 'Z'))
            throw new DomainException("invalid_financial_record", "A required financial value is invalid.");
        var normalized = new string((iban ?? "").Where(c => !char.IsWhiteSpace(c) && c != '-').ToArray()).ToUpperInvariant();
        if (!IsValidIban(normalized))
            throw new DomainException("invalid_iban", "The IBAN is not valid.");
        if (!normalized.StartsWith(country, StringComparison.Ordinal))
            throw new DomainException("iban_country_mismatch", "The IBAN belongs to a different country than the account country.");
        return new(beneficiary, bank, normalized, country);
    }

    private static bool IsValidIban(string iban)
    {
        if (iban.Length is < 15 or > 34) return false;
        if (!iban.All(c => c is >= 'A' and <= 'Z' or >= '0' and <= '9')) return false;
        if (!char.IsAsciiLetterUpper(iban[0]) || !char.IsAsciiLetterUpper(iban[1])
            || !char.IsAsciiDigit(iban[2]) || !char.IsAsciiDigit(iban[3])) return false;
        if (IbanLengths.TryGetValue(iban[..2], out var length) && iban.Length != length) return false;
        // ISO 7064 MOD 97-10: move the first four characters to the end, letters become 10..35.
        var rearranged = iban[4..] + iban[..4];
        var digits = string.Concat(rearranged.Select(c => char.IsAsciiDigit(c) ? c.ToString() : (c - 'A' + 10).ToString()));
        return BigInteger.Parse(digits) % 97 == 1;
    }
}

/// <summary>
/// The encrypted form of a <see cref="BankTransferDestination"/>, produced by the payout destination vault.
/// The domain stores and copies it but can never read it.
/// </summary>
public sealed class SealedPayoutDestination
{
    public SealedPayoutDestination(string keyId, byte[] ciphertext)
    {
        keyId = keyId?.Trim() ?? "";
        if (keyId.Length is 0 or > 32 || !keyId.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.'))
            throw new DomainException("invalid_financial_record", "A required financial value is invalid.");
        if (ciphertext is null || ciphertext.Length is 0 or > 2048)
            throw new DomainException("invalid_financial_record", "A required financial value is invalid.");
        KeyId = keyId;
        Ciphertext = ciphertext.ToArray();
    }

    public string KeyId { get; }
    public byte[] Ciphertext { get; }
}

/// <summary>
/// The structured record that makes a withdrawal <i>Transferred</i>. For the manual adapter it is a human
/// attestation: an operator states that the bank's own record shows this transfer, and gives the bank's
/// reference, the sending institution, the time and the amount. It is <b>not</b> bank-side cryptographic
/// verification; it is attributable, audited and reconciled later against the bank statement.
/// </summary>
public sealed class PayoutTransferEvidence
{
    public const string ManualAttestationKind = "ManualAttestation";
    /// <summary>Version of the statement the operator confirms in the UI (shown verbatim there).</summary>
    public const string ManualAttestationStatement = "bank-record-checked-v1";

    private PayoutTransferEvidence() { }

    public static PayoutTransferEvidence ManualAttestation(
        Guid withdrawalId, string recordedBy, string? sourceInstitution, string? bankReference,
        DateTimeOffset transferredAt, decimal amount, string? currency, bool confirmedAgainstBankRecord,
        string idempotencyKey, DateTimeOffset now)
    {
        if (!confirmedAgainstBankRecord)
            throw new DomainException("transfer_attestation_required",
                "Confirm that the bank's own record shows this transfer.");
        var reference = (bankReference ?? "").Trim();
        if (reference.Length is < 4 or > 64 || !char.IsAsciiLetterOrDigit(reference[0])
            || !reference.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '/' or '.' or '_')
            || reference.Distinct().Count() < 2)
            throw new DomainException("invalid_transfer_reference",
                "Enter the reference exactly as the bank shows it (4-64 letters, digits, - / . _).");
        var source = (sourceInstitution ?? "").Trim();
        if (source.Length is < 2 or > 100 || source.Any(char.IsControl))
            throw new DomainException("transfer_source_required", "Name the bank account the transfer was sent from.");
        if (amount <= 0)
            throw new DomainException("transfer_amount_mismatch", "The transferred amount must equal the withdrawal amount.");
        return new PayoutTransferEvidence
        {
            Id = Guid.NewGuid(),
            WithdrawalId = withdrawalId,
            Kind = ManualAttestationKind,
            RecordedBy = Payment.Required(recordedBy, 450),
            RecordedAt = now,
            SourceInstitution = source,
            BankReference = reference,
            TransferredAt = transferredAt.ToUniversalTime(),
            Amount = Payment.Money(amount),
            Currency = Payment.Required(currency, 3).ToUpperInvariant(),
            Attestation = ManualAttestationStatement,
            IdempotencyKey = Payment.Required(idempotencyKey, 100)
        };
    }

    public Guid Id { get; private set; }
    public Guid WithdrawalId { get; private set; }
    public string Kind { get; private set; } = "";
    public string RecordedBy { get; private set; } = "";
    public DateTimeOffset RecordedAt { get; private set; }
    public string SourceInstitution { get; private set; } = "";
    public string BankReference { get; private set; } = "";
    public DateTimeOffset TransferredAt { get; private set; }
    public decimal Amount { get; private set; }
    public string Currency { get; private set; } = "";
    public string Attestation { get; private set; } = "";
    public string IdempotencyKey { get; private set; } = "";
}
