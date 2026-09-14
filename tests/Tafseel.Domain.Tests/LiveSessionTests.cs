using Tafseel.Domain.Common;
using Tafseel.Domain.LiveSessions;

namespace Tafseel.Domain.Tests;

public sealed class LiveSessionTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 26, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(30)]
    [InlineData(60)]
    [InlineData(90)]
    [InlineData(120)]
    public void Supported_durations_are_accepted(int minutes) =>
        Assert.Equal(minutes, (Booking(minutes).EndsAt - Booking(minutes).StartsAt).TotalMinutes);

    [Theory]
    [InlineData(15)]
    [InlineData(45)]
    [InlineData(121)]
    public void Unsupported_durations_are_rejected(int minutes) =>
        Assert.Throws<DomainException>(() => Booking(minutes));

    [Fact]
    public void Partial_minute_duration_and_invalid_contract_values_are_rejected()
    {
        Assert.Throws<DomainException>(() => new LiveSessionBooking(
            "student", "teacher", Guid.NewGuid(), "Revision", "",
            Now.AddDays(1), Now.AddDays(1).AddMinutes(30).AddSeconds(1), "UTC", "UTC",
            100, "SAR", 0, 24, "key", Now));
        Assert.Throws<DomainException>(() => new LiveSessionBooking(
            "student", "teacher", Guid.NewGuid(), "Revision", new string('x', 2001),
            Now.AddDays(1), Now.AddDays(1).AddMinutes(30), "UTC", "UTC",
            100, "SAR", 0, 24, "key", Now));
        Assert.Throws<DomainException>(() => new LiveSessionBooking(
            "student", "teacher", Guid.NewGuid(), "Revision", "",
            Now.AddDays(1), Now.AddDays(1).AddMinutes(30), "UTC", "UTC",
            100, "S", 0, 24, "key", Now));
    }

    [Fact]
    public void Payment_reschedule_cancel_and_terminal_rules_are_explicit()
    {
        var booking = Booking(60);
        var originalStart = booking.StartsAt;
        booking.ConfirmPayment("payment", Now.AddMinutes(1));

        // A reschedule is a proposal the other participant answers; it never changes status.
        var declinedStart = Now.AddDays(3);
        booking.RequestReschedule("teacher", declinedStart, declinedStart.AddHours(1), Now.AddMinutes(2));
        booking.RespondToReschedule("student", accept: false, Now.AddMinutes(3));
        Assert.Equal(originalStart, booking.StartsAt);
        Assert.Equal(0, booking.RescheduleCount);

        var newStart = Now.AddDays(2);
        booking.RequestReschedule("student", newStart, newStart.AddHours(1), Now.AddMinutes(4));
        Assert.Throws<DomainException>(() =>
            booking.RequestReschedule("teacher", newStart, newStart.AddHours(1), Now.AddMinutes(5)));
        Assert.Throws<DomainException>(() => booking.RespondToReschedule("student", accept: true, Now.AddMinutes(5)));
        booking.RespondToReschedule("teacher", accept: true, Now.AddMinutes(6));
        Assert.Equal(1, booking.RescheduleCount);
        Assert.Equal(newStart, booking.StartsAt);
        Assert.Null(booking.RescheduleRequestedAt);
        Assert.Contains(booking.History, x => x.Action == "RescheduleRejected" && x.PreviousStatus == x.NextStatus);
        Assert.Contains(booking.History, x => x.Action == "Rescheduled" && x.PreviousStatus == x.NextStatus);
        Assert.Equal(LiveSessionStatus.Confirmed, booking.Status);

        booking.Cancel("teacher", Now.AddMinutes(7));
        Assert.Equal(LiveSessionStatus.Cancelled, booking.Status);
        Assert.Throws<DomainException>(() => booking.RequestCompletion("teacher", booking.EndsAt.AddMinutes(1)));
        Assert.Throws<DomainException>(() => booking.MarkStudentNoShow("teacher", booking.EndsAt.AddHours(1)));
        Assert.Throws<DomainException>(() => booking.FinalizeSettlement(booking.EndsAt.AddDays(1)));
    }

    [Fact]
    public void Completion_and_no_show_wait_until_session_end_and_enforce_actor()
    {
        // No-show is claimed by one party after the 15-minute grace period and settles when
        // the other party confirms it.
        var booking = Booking(30);
        booking.ConfirmPayment("payment", Now.AddMinutes(1));
        Assert.Throws<DomainException>(() => booking.MarkStudentNoShow("teacher", Now.AddMinutes(2)));
        Assert.Throws<DomainException>(() => booking.MarkStudentNoShow("teacher", booking.EndsAt.AddMinutes(14)));
        Assert.Throws<DomainException>(() => booking.MarkTeacherNoShow("teacher", booking.EndsAt.AddMinutes(16)));
        booking.MarkStudentNoShow("teacher", booking.EndsAt.AddMinutes(15));
        Assert.Equal(LiveSessionStatus.StudentNoShowPending, booking.Status);
        Assert.Throws<DomainException>(() => booking.ConfirmSettlement("teacher", booking.EndsAt.AddMinutes(20)));
        booking.ConfirmSettlement("student", booking.EndsAt.AddMinutes(20));
        Assert.Equal(LiveSessionStatus.StudentNoShow, booking.Status);

        var teacherNoShow = Booking(30);
        teacherNoShow.ConfirmPayment("payment", Now.AddMinutes(1));
        Assert.Throws<DomainException>(() => teacherNoShow.MarkTeacherNoShow("student", teacherNoShow.EndsAt.AddMinutes(1)));
        teacherNoShow.MarkTeacherNoShow("student", teacherNoShow.EndsAt.AddMinutes(15));
        Assert.Equal(LiveSessionStatus.TeacherNoShowPending, teacherNoShow.Status);
        Assert.Throws<DomainException>(() => teacherNoShow.ConfirmSettlement("student", teacherNoShow.EndsAt.AddMinutes(20)));
        teacherNoShow.ConfirmSettlement("teacher", teacherNoShow.EndsAt.AddMinutes(20));
        Assert.Equal(LiveSessionStatus.TeacherNoShow, teacherNoShow.Status);

        // Completion is requested by the teacher once the session has ended and, if the student
        // stays silent, finalized by the settlement pass.
        var completed = Booking(30);
        completed.ConfirmPayment("payment", Now.AddMinutes(1));
        Assert.Throws<DomainException>(() => completed.RequestCompletion("teacher", completed.EndsAt.AddMinutes(-1)));
        Assert.Throws<DomainException>(() => completed.RequestCompletion("student", completed.EndsAt));
        completed.RequestCompletion("teacher", completed.EndsAt);
        Assert.Equal(LiveSessionStatus.CompletionPending, completed.Status);
        completed.FinalizeSettlement(completed.EndsAt.AddDays(1));
        Assert.Equal(LiveSessionStatus.Completed, completed.Status);
        Assert.Contains(completed.History, x => x.Action == "SettlementAutoFinalized" && x.ActorId == "system:settlement");
    }

    private static LiveSessionBooking Booking(int minutes) =>
        new("student", "teacher", Guid.NewGuid(), "Revision session", "",
            Now.AddDays(1), Now.AddDays(1).AddMinutes(minutes), "UTC", "UTC",
            100, "SAR", 50, 24, "join-key", Now);
}
