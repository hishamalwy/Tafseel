using Tafseel.Domain.Common;
using Tafseel.Domain.Orders;

namespace Tafseel.Domain.Tests;

public sealed class OrderTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 26, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Request_transition_matrix_is_explicit()
    {
        var request = Request();
        request.RequestClarification("teacher", "Please clarify.", Now.AddMinutes(1));
        Assert.Equal(LearningRequestStatus.ClarificationRequested, request.Status);
        request.ReplyToClarification("student", "Here are the details.", Now.AddMinutes(2));
        Assert.Equal(LearningRequestStatus.PendingTeacherReview, request.Status);
        Assert.True(request.Accept("teacher", "accept-1", Now.AddMinutes(3)));
        Assert.False(request.Accept("teacher", "accept-1", Now.AddMinutes(4)));
        Assert.Throws<DomainException>(() =>
            request.Decline("teacher", "No", Now.AddMinutes(5)));
        Assert.Equal(4, request.History.Count);
    }

    [Fact]
    public void Request_terminal_and_ownership_rules_hold()
    {
        var declined = Request();
        declined.Decline("teacher", "Cannot meet deadline.", Now.AddMinutes(1));
        Assert.Throws<DomainException>(() =>
            declined.RequestClarification("teacher", "Again", Now.AddMinutes(2)));
        var cancelled = Request();
        cancelled.Cancel("student", Now.AddMinutes(1));
        Assert.Throws<DomainException>(() =>
            cancelled.Accept("teacher", "accept", Now.AddMinutes(2)));
        Assert.Throws<DomainException>(() =>
            Request().Cancel("other", Now.AddMinutes(1)));
    }

    [Fact]
    public void Financial_snapshot_rounds_and_remains_stable()
    {
        var order = NewOrder(revisions: 1, price: 101);
        Assert.Equal(8m, order.StudentFeePercent);
        Assert.Equal(15m, order.TeacherCommissionPercent);
        Assert.Equal(8.08m, order.StudentFeeAmount);
        Assert.Equal(15.15m, order.TeacherCommissionAmount);
        Assert.Equal(109.08m, order.StudentTotal);
        Assert.Equal(85.85m, order.TeacherNet);
        Assert.False(typeof(Order).GetProperty(nameof(Order.Price))!.SetMethod!.IsPublic);
    }

    [Fact]
    public void Work_delivery_revision_and_completion_require_valid_state_and_owner()
    {
        var order = NewOrder(revisions: 1);
        Assert.Throws<DomainException>(() => order.Start("teacher", Now.AddMinutes(1)));
        order.ConfirmPayment(Now.AddMinutes(1));
        order.Start("teacher", Now.AddMinutes(2));
        order.Deliver("teacher", "key", "file.pdf", "application/pdf", 10, "Done", Now.AddMinutes(3));
        order.RequestRevision("student", "More detail", Now.AddMinutes(4));
        order.Deliver("teacher", "key2", "file2.pdf", "application/pdf", 10, "Revised", Now.AddMinutes(5));
        var limit = Assert.Throws<DomainException>(() =>
            order.RequestRevision("student", "Again", Now.AddMinutes(6)));
        Assert.Equal("revision_limit_reached", limit.Code);
        order.Complete("student", Now.AddMinutes(7));
        Assert.Equal(OrderStatus.Completed, order.Status);
        Assert.Equal(OrderDeliveryState.Accepted, order.DeliveryState);
        Assert.Throws<DomainException>(() =>
            order.CancelBeforePayment("student", Now.AddMinutes(8)));
    }

    [Fact]
    public void Cancellation_is_only_before_payment()
    {
        var order = NewOrder();
        order.CancelBeforePayment("student", Now.AddMinutes(1));
        Assert.Equal(OrderStatus.Cancelled, order.Status);
        var paid = NewOrder();
        paid.ConfirmPayment(Now.AddMinutes(1));
        Assert.Throws<DomainException>(() =>
            paid.CancelBeforePayment("teacher", Now.AddMinutes(2)));
    }

    private static LearningRequest Request() =>
        new("student", "teacher", Guid.NewGuid(), "Explain chapter",
            "Please explain the supplied chapter.", Now.AddDays(2), 100, Now);

    private static Order NewOrder(int revisions = 0, decimal price = 100) =>
        new(Guid.NewGuid(), "student", "teacher", Guid.NewGuid(), price, "SAR",
            8, 15, Now.AddDays(2), revisions, Now);
}
