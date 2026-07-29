using Tafseel.Domain.Common;
using Tafseel.Domain.Marketplace;

namespace Tafseel.Domain.Tests;

public sealed class TeacherShowcaseTests
{
    [Fact]
    public void Submitted_showcase_is_immutable_and_approval_selects_one_public_version()
    {
        var now = DateTimeOffset.UtcNow;
        var sample = TeacherTeachingSample.CreateShowcaseDraft(
            "teacher", Guid.NewGuid(), null, "Draft title", "Draft description", now);
        sample.CurrentVersion().ReplaceVideo(
            "teacher-demos/video.mp4", "../video.mp4", "video/mp4", 12);
        Assert.Equal("video.mp4", sample.CurrentVersion().OriginalFileName);

        sample.Submit("teacher", now.AddMinutes(1));

        var immutable = Assert.Throws<DomainException>(() =>
            sample.UpdateDraft(null, "Changed", null, now.AddMinutes(2)));
        Assert.Equal("draft_required", immutable.Code);

        sample.StartReview("reviewer", now.AddMinutes(3));
        sample.Decide("reviewer", ShowcaseDecision.Approve, null, null, "Private", now.AddMinutes(4));

        Assert.Equal(ShowcaseModerationStatus.Approved, sample.ModerationStatus);
        Assert.Equal(sample.CurrentVersionId, sample.ApprovedVersionId);
        Assert.True(sample.IsPublished);
    }

    [Fact]
    public void Changes_request_retains_version_and_resubmission_increments_number()
    {
        var now = DateTimeOffset.UtcNow;
        var sample = TeacherTeachingSample.CreateShowcaseDraft(
            "teacher", Guid.NewGuid(), null, "Version one", null, now);
        sample.CurrentVersion().ReplaceVideo(
            "teacher-demos/video.mp4", "video.mp4", "video/mp4", 12);
        sample.Submit("teacher", now);
        sample.StartReview("reviewer", now);
        sample.Decide(
            "reviewer", ShowcaseDecision.RequestChanges, "unrelated_to_subject",
            "Keep the explanation within the selected subject.", "Internal", now);

        var next = sample.CreateNextVersion(now.AddMinutes(1));

        Assert.Equal(2, next.VersionNumber);
        Assert.Equal(2, sample.Versions.Count);
        Assert.Equal(ShowcaseModerationStatus.ChangesRequested, sample.Versions.Single(x => x.VersionNumber == 1).Status);
        Assert.Equal(ShowcaseModerationStatus.Draft, sample.ModerationStatus);
    }

    [Fact]
    public void Qualification_sample_cannot_enter_showcase_moderation()
    {
        var sample = TeacherTeachingSample.FromQualificationDemo(
            "teacher", Guid.NewGuid(), "Qualification sample", "teacher-demos/demo.mp4", 120,
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "reviewer", DateTimeOffset.UtcNow);

        var error = Assert.Throws<DomainException>(() =>
            sample.StartReview("reviewer", DateTimeOffset.UtcNow));

        Assert.Equal("qualification_sample_locked", error.Code);
        Assert.Equal(TeachingSampleSourceType.QualificationGenerated, sample.SourceType);
        Assert.True(sample.IsPublished);
    }
}
