using Tafseel.Domain.Common;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;

namespace Tafseel.Domain.Tests;

public sealed class TeacherGrowthAndProfileCurationDomainTests
{
    [Fact]
    public void Revoked_qualification_can_be_reactivated_for_same_subject()
    {
        var now = DateTimeOffset.UtcNow;
        var qualification = new TeacherSubjectQualification(
            "teacher", Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "reviewer", now);
        qualification.Revoke("reviewer", "Evidence no longer valid.", now.AddHours(1));
        Assert.False(qualification.IsActive);

        var applicationId = Guid.NewGuid();
        var assignmentId = Guid.NewGuid();
        qualification.Reactivate(applicationId, assignmentId, "reviewer-2", now.AddHours(2));

        Assert.True(qualification.IsActive);
        Assert.Equal(applicationId, qualification.ApplicationId);
        Assert.Equal(assignmentId, qualification.QualificationAssignmentId);
        Assert.Null(qualification.RevokedAt);
        Assert.Equal(TeacherQualificationStatus.Approved, qualification.Status);
    }

    [Fact]
    public void Qualification_sample_can_be_hidden_without_changing_approval_publication()
    {
        var now = DateTimeOffset.UtcNow;
        var sample = TeacherTeachingSample.FromQualificationDemo(
            "teacher", Guid.NewGuid(), "Qualification sample", "teacher-demos/demo.mp4", 120,
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "reviewer", now);

        Assert.True(sample.IsPublished);
        Assert.True(sample.IsProfileVisible);

        sample.SetProfileVisibility(false, now.AddMinutes(1));
        Assert.False(sample.IsProfileVisible);
        Assert.True(sample.IsPublished);
        Assert.False(sample.IsProfileFeatured);
    }

    [Fact]
    public void Rejected_showcase_cannot_be_selected_for_profile()
    {
        var now = DateTimeOffset.UtcNow;
        var sample = TeacherTeachingSample.CreateShowcaseDraft(
            "teacher", Guid.NewGuid(), null, "Draft", null, now);
        sample.CurrentVersion().ReplaceVideo("teacher-demos/video.mp4", "video.mp4", "video/mp4", 12);
        sample.Submit("teacher", now);
        sample.StartReview("reviewer", now);
        sample.Decide(
            "reviewer", ShowcaseDecision.Reject, "unrelated_to_subject",
            "Not related.", "Internal", now);

        var error = Assert.Throws<DomainException>(() =>
            sample.SetProfileVisibility(true, now.AddMinutes(1)));
        Assert.Equal("profile_video_not_eligible", error.Code);
    }

    [Fact]
    public void Featured_requires_visible_and_hiding_clears_featured()
    {
        var now = DateTimeOffset.UtcNow;
        var sample = TeacherTeachingSample.FromQualificationDemo(
            "teacher", Guid.NewGuid(), "Qualification sample", "teacher-demos/demo.mp4", 120,
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "reviewer", now);
        sample.SetProfileFeatured(true, now);
        Assert.True(sample.IsProfileFeatured);

        sample.SetProfileVisibility(false, now.AddMinutes(1));
        Assert.False(sample.IsProfileFeatured);
    }
}
