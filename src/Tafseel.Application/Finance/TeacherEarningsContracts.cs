namespace Tafseel.Application.Finance;

/// <summary>
/// Where every riyal of a teacher's balance came from, read from records the money paths already wrote.
/// Nothing here is recalculated: the price, commission and percentage are the terms snapshotted on the Order
/// or Live Session Booking (DEC-06), and the net is the amount the ledger actually credited to the teacher.
/// Withdrawals draw on the whole balance, so no withdrawal is tied to any one earning.
/// </summary>
public sealed record TeacherEarningsDto(
    IReadOnlyCollection<TeacherEarningsTotalsDto> Totals,
    IReadOnlyCollection<TeacherEarningDto> Items,
    int TotalItems);

/// <param name="Earned">Everything credited to the teacher and not reversed by a refund.</param>
/// <param name="Available">Withdrawable now (same ledger balance as <c>BalanceDto.Available</c>).</param>
/// <param name="Clearing">Still inside the objection window (<c>BalanceDto.PendingClearance</c>).</param>
/// <param name="InTransfer">Reserved by a withdrawal that has not been transferred yet.</param>
/// <param name="Transferred">Sum of withdrawals Finance has recorded as transferred to the teacher's bank.</param>
/// <param name="AddsUp">True when <c>Earned = Available + Clearing + InTransfer + Transferred</c> exactly; the page
/// only shows that sum when it holds.</param>
public sealed record TeacherEarningsTotalsDto(
    string Currency, decimal Earned, decimal Available, decimal Clearing, decimal InTransfer,
    decimal Transferred, int TransferredCount, bool AddsUp);

/// <param name="Kind"><c>order</c> or <c>live_session</c>.</param>
/// <param name="Price">The agreed price of the work (Order price, or the booking total).</param>
/// <param name="CommissionPercent">The commission percentage snapshotted on that Order or booking.</param>
/// <param name="Commission">The commission amount snapshotted on that Order or booking.</param>
/// <param name="Adjustment">Credited net minus <c>Price - Commission</c>; zero unless a discount reduced the
/// teacher's share of what the student actually paid.</param>
/// <param name="Net">What the ledger credited to the teacher for this work.</param>
/// <param name="State"><c>clearing</c>, <c>available</c> or <c>refunded</c>.</param>
/// <param name="AvailableAt">When a clearing earning becomes withdrawable.</param>
public sealed record TeacherEarningDto(
    string Kind, Guid ReferenceId, string? Title, DateTimeOffset EarnedAt,
    decimal Price, decimal CommissionPercent, decimal Commission, decimal Adjustment, decimal Net,
    string Currency, string State, DateTimeOffset? AvailableAt);

public interface ITeacherEarningsService
{
    Task<TeacherEarningsDto> GetAsync(string teacherId, int take, CancellationToken ct);
}
