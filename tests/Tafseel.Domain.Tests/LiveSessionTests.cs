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
        booking.ConfirmPayment("payment", Now.AddMinutes(1));
        booking.Reschedule("student", Now.AddDays(2), Now.AddDays(2).AddHours(1), Now.AddMinutes(2));
        Assert.Equal(1, booking.RescheduleCount);
        Assert.Contains(booking.History, x => x.Action == "Rescheduled"
            && x.PreviousStatus == x.NextStatus);
        booking.Cancel("teacher", Now.AddMinutes(3));
        Assert.Equal(LiveSessionStatus.Cancelled, booking.Status);
        Assert.Throws<DomainException>(() => booking.Complete("teacher", Now.AddDays(3)));
    }

    [Fact]
    public void Completion_and_no_show_wait_until_session_end_and_enforce_actor()
    {
        var booking = Booking(30);
        booking.ConfirmPayment("payment", Now.AddMinutes(1));
        Assert.Throws<DomainException>(() => booking.MarkStudentNoShow("teacher", Now.AddMinutes(2)));
        Assert.Throws<DomainException>(() => booking.MarkTeacherNoShow("teacher", booking.EndsAt.AddMinutes(1)));
        booking.MarkStudentNoShow("teacher", booking.EndsAt.AddMinutes(1));
        Assert.Equal(LiveSessionStatus.StudentNoShow, booking.Status);

        var teacherNoShow = Booking(30);
        teacherNoShow.ConfirmPayment("payment", Now.AddMinutes(1));
        teacherNoShow.MarkTeacherNoShow("student", teacherNoShow.EndsAt.AddMinutes(1));
        Assert.Equal(LiveSessionStatus.TeacherNoShow, teacherNoShow.Status);

        var completed = Booking(30);
        completed.ConfirmPayment("payment", Now.AddMinutes(1));
        completed.Complete("teacher", completed.EndsAt.AddMinutes(1));
        Assert.Equal(LiveSessionStatus.Completed, completed.Status);
    }

    private static LiveSessionBooking Booking(int minutes) =>
        new("student", "teacher", Guid.NewGuid(), "Revision session", "",
            Now.AddDays(1), Now.AddDays(1).AddMinutes(minutes), "UTC", "UTC",
            100, "SAR", 50, 24, "join-key", Now);
}
