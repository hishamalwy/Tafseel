namespace Tafseel.Domain.Finance;

/// <summary>
/// The single authoritative rule for how long a completed purchase stays exposed to a
/// dispute-driven refund reversal, and therefore how long teacher earnings must stay unwithdrawable.
/// <para>
/// This mirrors the dispute-eligibility predicate enforced when a dispute is opened
/// (<c>GovernanceService.OpenDisputeAsync</c>): a dispute is admitted while
/// <c>referenceAt &gt;= now - WindowDays</c>, i.e. while <c>now &lt;= referenceAt + WindowDays</c>.
/// </para>
/// <para>
/// The <b>reference timestamp</b> is whatever the dispute predicate measures the window from:
/// the last <c>Delivered</c> transition for an Order, and <c>EndsAt</c> for a live session.
/// Do not re-derive either of these anywhere else — call this type.
/// </para>
/// </summary>
public static class EarningsExposurePolicy
{
    /// <summary>
    /// The last instant at which a dispute may still be opened, or <c>null</c> when the purchase can
    /// never be disputed (no delivery ever occurred, so the dispute predicate cannot be satisfied).
    /// </summary>
    public static DateTimeOffset? ExposureEndsAt(DateTimeOffset? disputeReferenceAt, int windowDays) =>
        disputeReferenceAt is null ? null : disputeReferenceAt.Value.AddDays(windowDays);

    /// <summary>
    /// True when a purchase still carries refund exposure at <paramref name="now"/> and its teacher
    /// earning must therefore be held in <c>TeacherPending</c> rather than credited as available.
    /// </summary>
    public static bool IsExposed(DateTimeOffset? disputeReferenceAt, int windowDays, DateTimeOffset now) =>
        ExposureEndsAt(disputeReferenceAt, windowDays) is DateTimeOffset endsAt && now <= endsAt;
}
