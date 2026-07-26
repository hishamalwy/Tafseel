using Tafseel.Domain.Common;
using Tafseel.Domain.Governance;

namespace Tafseel.Domain.Tests;

public sealed class GovernanceTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 26, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Review_preserves_original_content_through_moderation()
    {
        var review = new TeacherReview(
            Guid.NewGuid(), "student", "teacher", 5, 4, 3, 5, 4, "Original review", true, Now);
        Assert.Equal(4.2m, review.OverallScore);
        review.Moderate("admin", visible: false, "Policy violation", Now.AddMinutes(1));
        Assert.False(review.IsVisible);
        Assert.Equal("Original review", review.OriginalComment);
        Assert.Single(review.Moderation);
        Assert.Throws<DomainException>(() =>
            review.Moderate("admin", visible: true, "", Now.AddMinutes(2)));
    }

    [Fact]
    public void Review_scores_and_self_review_are_rejected()
    {
        Assert.Throws<DomainException>(() => new TeacherReview(
            Guid.NewGuid(), "student", "teacher", 0, 4, 3, 5, 4, "Review", true, Now));
        Assert.Throws<DomainException>(() => new TeacherReview(
            Guid.NewGuid(), "same", "same", 5, 4, 3, 5, 4, "Review", true, Now));
    }

    [Fact]
    public void Dispute_resolution_is_explicit_and_idempotent()
    {
        var dispute = new Dispute(Guid.NewGuid(), "student", "teacher", "student", "Incomplete work", Now);
        dispute.StartReview("admin", Now.AddMinutes(1));
        Assert.True(dispute.Resolve("admin", DisputeResolution.RefundStudent,
            "Evidence supports the Student.", "resolution-key", Now.AddMinutes(2)));
        Assert.False(dispute.Resolve("admin", DisputeResolution.RefundStudent,
            "Evidence supports the Student.", "resolution-key", Now.AddMinutes(3)));
        Assert.Throws<DomainException>(() => dispute.Resolve("admin", DisputeResolution.ReleaseTeacher,
            "Different result.", "other-key", Now.AddMinutes(4)));
    }
}
