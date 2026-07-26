using Tafseel.Domain.Common;
using Tafseel.Domain.TeacherApplications;

namespace Tafseel.Domain.Tests;

public sealed class TeacherApplicationTests
{
    [Fact]
    public void Approval_requires_complete_rubric_but_has_no_magic_score_gate()
    {
        var application = ReadyForReview();
        var lowScores = Enum.GetValues<EvaluationCriterion>().ToDictionary(x => x, _ => 1);

        application.Decide("reviewer", ReviewDecision.Approve, lowScores, null, null, DateTimeOffset.UtcNow);

        Assert.Equal(TeacherApplicationStatus.Approved, application.Status);
        Assert.Equal(1m, application.Reviews.Single().OverallScore);
    }

    [Fact]
    public void Requesting_changes_requires_a_comment()
    {
        var application = ReadyForReview();
        var scores = Enum.GetValues<EvaluationCriterion>().ToDictionary(x => x, _ => 4);

        var error = Assert.Throws<DomainException>(() =>
            application.Decide("reviewer", ReviewDecision.RequestChanges, scores, null, null, DateTimeOffset.UtcNow));

        Assert.Equal("review_comment_required", error.Code);
    }

    [Fact]
    public void Undefined_decision_is_rejected()
    {
        var application = ReadyForReview();
        var scores = Enum.GetValues<EvaluationCriterion>().ToDictionary(x => x, _ => 4);

        var error = Assert.Throws<DomainException>(() =>
            application.Decide("reviewer", (ReviewDecision)99, scores, null, null, DateTimeOffset.UtcNow));

        Assert.Equal("invalid_review_decision", error.Code);
    }

    [Fact]
    public void Undefined_or_missing_criterion_is_rejected()
    {
        var application = ReadyForReview();
        var scores = Enum.GetValues<EvaluationCriterion>().Skip(1).ToDictionary(x => x, _ => 4);
        scores[(EvaluationCriterion)99] = 4;

        var error = Assert.Throws<DomainException>(() =>
            application.Decide("reviewer", ReviewDecision.Approve, scores, null, null, DateTimeOffset.UtcNow));

        Assert.Equal("incomplete_evaluation", error.Code);
    }

    [Fact]
    public void Repeating_a_terminal_decision_is_a_conflict_without_new_history()
    {
        var application = ReadyForReview();
        var scores = Enum.GetValues<EvaluationCriterion>().ToDictionary(x => x, _ => 4);
        application.Decide("reviewer", ReviewDecision.Approve, scores, null, null, DateTimeOffset.UtcNow);
        var historyCount = application.History.Count;

        var error = Assert.Throws<DomainException>(() =>
            application.Decide("reviewer", ReviewDecision.Approve, scores, null, null, DateTimeOffset.UtcNow));

        Assert.Equal("invalid_application_transition", error.Code);
        Assert.Single(application.Reviews);
        Assert.Equal(historyCount, application.History.Count);
    }

    [Theory]
    [InlineData(ReviewDecision.Approve)]
    [InlineData(ReviewDecision.RequestChanges)]
    [InlineData(ReviewDecision.Reject)]
    public void Every_defined_decision_has_an_explicit_terminal_or_changes_transition(
        ReviewDecision decision)
    {
        var application = ReadyForReview();
        var scores = Enum.GetValues<EvaluationCriterion>().ToDictionary(x => x, _ => 4);

        application.Decide(
            "reviewer",
            decision,
            scores,
            decision == ReviewDecision.Approve ? null : "Public comment",
            null,
            DateTimeOffset.UtcNow);

        Assert.Equal(
            decision switch
            {
                ReviewDecision.Approve => TeacherApplicationStatus.Approved,
                ReviewDecision.RequestChanges => TeacherApplicationStatus.ChangesRequested,
                _ => TeacherApplicationStatus.Rejected
            },
            application.Status);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(6)]
    public void Score_outside_one_to_five_is_rejected(int score)
    {
        var application = ReadyForReview();
        var scores = Enum.GetValues<EvaluationCriterion>().ToDictionary(x => x, _ => 4);
        scores[EvaluationCriterion.SubjectKnowledge] = score;

        var error = Assert.Throws<DomainException>(() =>
            application.Decide("reviewer", ReviewDecision.Approve, scores, null, null, DateTimeOffset.UtcNow));

        Assert.Equal("incomplete_evaluation", error.Code);
    }

    [Fact]
    public void Missing_criterion_is_rejected()
    {
        var application = ReadyForReview();
        var scores = Enum.GetValues<EvaluationCriterion>().Skip(1).ToDictionary(x => x, _ => 4);

        var error = Assert.Throws<DomainException>(() =>
            application.Decide("reviewer", ReviewDecision.Approve, scores, null, null, DateTimeOffset.UtcNow));

        Assert.Equal("incomplete_evaluation", error.Code);
    }

    [Fact]
    public void Undefined_priority_is_rejected()
    {
        var application = CompleteDraft();
        application.Submit("teacher", DateTimeOffset.UtcNow);

        var error = Assert.Throws<DomainException>(() =>
            application.StartReview("reviewer", (ApplicationPriority)99, DateTimeOffset.UtcNow));

        Assert.Equal("invalid_application_priority", error.Code);
    }

    [Fact]
    public void Command_matrix_allows_only_the_documented_states()
    {
        foreach (var status in Enum.GetValues<TeacherApplicationStatus>())
        {
            AssertCommand(status, "edit", status is TeacherApplicationStatus.Draft or TeacherApplicationStatus.ChangesRequested,
                application => application.UpdateDraft(application.QualificationTopicId, "Giza", 6, "MSc"));
            AssertCommand(status, "submit", status is TeacherApplicationStatus.Draft or TeacherApplicationStatus.ChangesRequested,
                application => application.Submit("teacher", DateTimeOffset.UtcNow));
            AssertCommand(status, "start-review", status == TeacherApplicationStatus.Submitted,
                application => application.StartReview("reviewer", ApplicationPriority.High, DateTimeOffset.UtcNow));
            AssertCommand(status, "decide", status == TeacherApplicationStatus.UnderReview,
                application => application.Decide(
                    "reviewer",
                    ReviewDecision.Approve,
                    Enum.GetValues<EvaluationCriterion>().ToDictionary(x => x, _ => 4),
                    null,
                    null,
                    DateTimeOffset.UtcNow));
            AssertCommand(status, "withdraw",
                status is TeacherApplicationStatus.Draft
                    or TeacherApplicationStatus.Submitted
                    or TeacherApplicationStatus.ChangesRequested,
                application => application.Withdraw("teacher", DateTimeOffset.UtcNow));
        }
    }

    private static void AssertCommand(
        TeacherApplicationStatus status,
        string command,
        bool allowed,
        Action<TeacherApplication> action)
    {
        var application = AtStatus(status);
        if (allowed)
        {
            action(application);
            return;
        }

        var error = Assert.Throws<DomainException>(() => action(application));
        Assert.Equal("invalid_application_transition", error.Code);
        Assert.Equal(status, application.Status);
        Assert.True(application.History.Count > 0, command);
    }

    private static TeacherApplication AtStatus(TeacherApplicationStatus status)
    {
        var application = CompleteDraft();
        if (status == TeacherApplicationStatus.Draft)
            return application;
        if (status == TeacherApplicationStatus.Withdrawn)
        {
            application.Withdraw("teacher", DateTimeOffset.UtcNow);
            return application;
        }

        application.Submit("teacher", DateTimeOffset.UtcNow);
        if (status == TeacherApplicationStatus.Submitted)
            return application;
        application.StartReview("reviewer", ApplicationPriority.Medium, DateTimeOffset.UtcNow);
        if (status == TeacherApplicationStatus.UnderReview)
            return application;
        application.Decide(
            "reviewer",
            status switch
            {
                TeacherApplicationStatus.ChangesRequested => ReviewDecision.RequestChanges,
                TeacherApplicationStatus.Approved => ReviewDecision.Approve,
                _ => ReviewDecision.Reject
            },
            Enum.GetValues<EvaluationCriterion>().ToDictionary(x => x, _ => 4),
            status == TeacherApplicationStatus.Approved ? null : "Public comment",
            null,
            DateTimeOffset.UtcNow);
        return application;
    }

    private static TeacherApplication CompleteDraft()
    {
        var application = new TeacherApplication(
            "teacher", Guid.NewGuid(), Guid.NewGuid(), DateTimeOffset.UtcNow);
        application.UpdateDraft(application.QualificationTopicId, "Cairo", 5, "BSc");
        application.AttachDemo("teacher-demos/demo.mp4", 120, 180);
        return application;
    }

    private static TeacherApplication ReadyForReview()
    {
        var now = DateTimeOffset.UtcNow;
        var application = CompleteDraft();
        application.Submit("teacher", now);
        application.StartReview("reviewer", ApplicationPriority.Medium, now);
        return application;
    }
}
