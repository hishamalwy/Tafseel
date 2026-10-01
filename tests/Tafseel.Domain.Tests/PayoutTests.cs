using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;

namespace Tafseel.Domain.Tests;

/// <summary>PRODUCT-P0 payout loop: destination, snapshot, initiation, evidence, safe rejection, self-guards.</summary>
public sealed class PayoutTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 29, 12, 0, 0, TimeSpan.Zero);
    // Deliberately fake test IBANs that pass the ISO 7064 checksum; they belong to nobody.
    private const string SaudiIban = "SA0380000000608010167519";
    private const string OtherSaudiIban = "SA4420000001234567891234";

    [Fact]
    public void Withdrawal_cannot_be_marked_transferred_without_initiation_and_evidence()
    {
        // Was the defect: Complete("anything") moved a requested withdrawal straight to transferred.
        var item = Requested();
        var evidence = Evidence(item, "FT26272ABCD", Now.AddMinutes(5));
        var error = Assert.Throws<DomainException>(() => item.ConfirmTransferred(evidence, Now.AddMinutes(10)));
        Assert.Equal("withdrawal_transfer_not_initiated", error.Code);
        Assert.Equal(WithdrawalStatus.Pending, item.Status);
        Assert.Null(item.ProviderReference);
    }

    [Fact]
    public void Initiated_withdrawal_becomes_transferred_only_with_consistent_evidence()
    {
        var item = Requested();
        Assert.True(item.InitiateTransfer("admin", "ManualBankTransfer", "TFS-W-1", "init-key", Now.AddMinutes(1)));
        Assert.False(item.InitiateTransfer("admin", "ManualBankTransfer", "TFS-W-1", "init-key", Now.AddMinutes(2)));
        Assert.Equal(WithdrawalStatus.TransferInitiated, item.Status);

        Assert.Equal("transfer_amount_mismatch", Assert.Throws<DomainException>(() => item.ConfirmTransferred(
            PayoutTransferEvidence.ManualAttestation(item.Id, "admin", "Tafseel operating account", "FT26272ABCD",
                Now.AddMinutes(3), 99.99m, "SAR", true, "confirm", Now.AddMinutes(4)), Now.AddMinutes(4))).Code);
        Assert.Equal("transfer_reference_not_from_bank", Assert.Throws<DomainException>(() =>
            item.ConfirmTransferred(Evidence(item, "tfs-w-1", Now.AddMinutes(3)), Now.AddMinutes(4))).Code);
        Assert.Equal("transfer_time_invalid", Assert.Throws<DomainException>(() =>
            item.ConfirmTransferred(Evidence(item, "FT26272ABCD", Now.AddMinutes(-10)), Now.AddMinutes(4))).Code);
        Assert.Equal("transfer_time_invalid", Assert.Throws<DomainException>(() =>
            item.ConfirmTransferred(Evidence(item, "FT26272ABCD", Now.AddHours(3)), Now.AddMinutes(4))).Code);
        Assert.Equal(WithdrawalStatus.TransferInitiated, item.Status);

        item.ConfirmTransferred(Evidence(item, "FT26272ABCD", Now.AddMinutes(3)), Now.AddMinutes(4));
        Assert.Equal(WithdrawalStatus.Completed, item.Status);
        Assert.Equal("FT26272ABCD", item.ProviderReference);
        Assert.Equal(Now.AddMinutes(3), item.TransferredAt);
        Assert.Equal("invalid_withdrawal_transition", Assert.Throws<DomainException>(() =>
            item.Reject("admin", "late", true, Now.AddMinutes(5))).Code);
    }

    [Theory]
    [InlineData("", true, "invalid_transfer_reference")]
    [InlineData("x", true, "invalid_transfer_reference")]
    [InlineData("aaaa", true, "invalid_transfer_reference")]
    [InlineData("REF 123 <script>", true, "invalid_transfer_reference")]
    [InlineData("FT26272ABCD", false, "transfer_attestation_required")]
    public void Evidence_is_structured_not_free_text(string reference, bool attested, string code)
    {
        var error = Assert.Throws<DomainException>(() => PayoutTransferEvidence.ManualAttestation(
            Guid.NewGuid(), "admin", "Tafseel operating account", reference, Now, 100, "SAR", attested, "key", Now));
        Assert.Equal(code, error.Code);
        Assert.Equal("transfer_source_required", Assert.Throws<DomainException>(() => PayoutTransferEvidence.ManualAttestation(
            Guid.NewGuid(), "admin", " ", "FT26272ABCD", Now, 100, "SAR", true, "key", Now)).Code);
    }

    [Fact]
    public void Nobody_handles_their_own_withdrawal()
    {
        var item = Requested();
        Assert.Equal("withdrawal_self_processing_forbidden", Assert.Throws<DomainException>(() =>
            item.InitiateTransfer("teacher", "ManualBankTransfer", "TFS-W-1", "k", Now)).Code);
        Assert.Equal("withdrawal_self_processing_forbidden", Assert.Throws<DomainException>(() =>
            item.Reject("teacher", "no", false, Now)).Code);
        item.InitiateTransfer("admin", "ManualBankTransfer", "TFS-W-1", "k", Now);
        Assert.Equal("withdrawal_self_processing_forbidden", Assert.Throws<DomainException>(() =>
            item.ConfirmTransferred(PayoutTransferEvidence.ManualAttestation(item.Id, "teacher", "Bank", "FT26272ABCD",
                Now, 100, "SAR", true, "c", Now), Now)).Code);
    }

    [Fact]
    public void Initiated_transfer_is_cancelled_only_when_no_money_was_sent()
    {
        var item = Requested();
        item.InitiateTransfer("admin", "ManualBankTransfer", "TFS-W-1", "k", Now);
        Assert.Equal("withdrawal_transfer_may_have_been_sent", Assert.Throws<DomainException>(() =>
            item.Reject("admin", "Bank refused the account", false, Now.AddMinutes(1))).Code);
        Assert.Equal(WithdrawalStatus.TransferInitiated, item.Status);
        Assert.True(item.Reject("admin", "Bank refused the account", true, Now.AddMinutes(1)));
        Assert.False(item.Reject("admin", "Bank refused the account", true, Now.AddMinutes(2)));
        Assert.Equal(WithdrawalStatus.Rejected, item.Status);
    }

    [Fact]
    public void Legacy_withdrawal_without_a_destination_can_only_be_rejected()
    {
        var legacy = new WithdrawalRequest("teacher", 60, "SAR", "legacy", Now);
        Assert.False(legacy.HasDestinationSnapshot);
        Assert.Equal("withdrawal_destination_missing", Assert.Throws<DomainException>(() =>
            legacy.InitiateTransfer("admin", "ManualBankTransfer", "TFS-W-2", "k", Now)).Code);
        Assert.True(legacy.Reject("admin", "Please re-enter your bank details and request again.", false, Now));
    }

    [Fact]
    public void Destination_snapshot_does_not_follow_later_profile_edits()
    {
        var profile = VerifiedProfile();
        var item = WithdrawalRequest.ToVerifiedDestination("teacher", 100, "SAR", "w", profile, Now);
        var snapshot = item.DestinationCiphertext!.ToArray();
        profile.SubmitBankTransfer(BankTransferDestination.Create("Teacher Name", "Other Bank", OtherSaudiIban, "SA"),
            "1234", new SealedPayoutDestination("k1", [9, 9, 9]), Now.AddMinutes(1));
        Assert.Equal(snapshot, item.DestinationCiphertext);
        Assert.Equal("Riyad Bank ••••7519", item.DestinationLabel);
        Assert.Equal(PayoutVerificationStatus.Pending, profile.Status);
    }

    [Fact]
    public void Masked_only_profiles_are_not_transfer_capable_and_cannot_be_verified()
    {
        var profile = VerifiedProfile();
        Assert.True(profile.CanReceiveTransfers);
        // A profile row saved before the payout loop has a masked label and no sealed destination.
        var legacy = (TeacherPayoutProfile)Activator.CreateInstance(typeof(TeacherPayoutProfile), nonPublic: true)!;
        typeof(TeacherPayoutProfile).GetProperty(nameof(TeacherPayoutProfile.TeacherId))!.SetValue(legacy, "teacher");
        typeof(TeacherPayoutProfile).GetProperty(nameof(TeacherPayoutProfile.PayoutMethod))!.SetValue(legacy, "Bank transfer");
        typeof(TeacherPayoutProfile).GetProperty(nameof(TeacherPayoutProfile.DestinationLabel))!.SetValue(legacy, "IBAN •••• 1234");
        typeof(TeacherPayoutProfile).GetProperty(nameof(TeacherPayoutProfile.Status))!.SetValue(legacy, PayoutVerificationStatus.Verified);
        Assert.False(legacy.HasTransferCapableDestination);
        Assert.False(legacy.CanReceiveTransfers);
        Assert.Equal("payout_destination_reenrollment_required", Assert.Throws<DomainException>(() =>
            legacy.Review(true, null, "admin", Now)).Code);
        Assert.Equal("payout_destination_reenrollment_required", Assert.Throws<DomainException>(() =>
            WithdrawalRequest.ToVerifiedDestination("teacher", 60, "SAR", "k", legacy, Now)).Code);
    }

    [Fact]
    public void Teacher_cannot_verify_their_own_payout_details()
    {
        var profile = new TeacherPayoutProfile("teacher", Destination(), "1234",
            new SealedPayoutDestination("k1", [1, 2, 3]), Now);
        Assert.Equal("payout_self_review_forbidden", Assert.Throws<DomainException>(() =>
            profile.Review(true, null, "teacher", Now)).Code);
    }

    [Theory]
    [InlineData("SA0380000000608010167518", "invalid_iban")]
    [InlineData("SA03800000006080101675", "invalid_iban")]
    [InlineData("AE070331234567890123456", "iban_country_mismatch")]
    [InlineData("not an iban", "invalid_iban")]
    public void Iban_is_checked_before_it_is_sealed(string iban, string code)
    {
        Assert.Equal(code, Assert.Throws<DomainException>(() =>
            BankTransferDestination.Create("Teacher Name", "Riyad Bank", iban, "SA")).Code);
    }

    [Fact]
    public void Plain_destination_never_prints_the_full_iban()
    {
        var destination = BankTransferDestination.Create("Teacher Name", "Riyad Bank", "sa03 8000 0000 6080 1016 7519", "sa");
        Assert.Equal(SaudiIban, destination.Iban);
        Assert.Equal("Riyad Bank ••••7519", destination.ToString());
        Assert.DoesNotContain("8000", destination.MaskedLabel);
    }

    private static BankTransferDestination Destination() =>
        BankTransferDestination.Create("Teacher Name", "Riyad Bank", SaudiIban, "SA");

    private static TeacherPayoutProfile VerifiedProfile()
    {
        var profile = new TeacherPayoutProfile("teacher", Destination(), "1234",
            new SealedPayoutDestination("k1", [1, 2, 3]), Now);
        profile.Review(true, null, "admin", Now);
        return profile;
    }

    private static WithdrawalRequest Requested() =>
        WithdrawalRequest.ToVerifiedDestination("teacher", 100, "SAR", "request", VerifiedProfile(), Now);

    private static PayoutTransferEvidence Evidence(WithdrawalRequest item, string reference, DateTimeOffset at) =>
        PayoutTransferEvidence.ManualAttestation(item.Id, "admin", "Tafseel operating account", reference,
            at, item.Amount, item.Currency, true, "confirm", at);
}
