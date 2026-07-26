using Tafseel.Domain.Common;

namespace Tafseel.Domain.TeacherApplications;

public enum TeacherApplicationStatus { Draft, Submitted, UnderReview, ChangesRequested, Approved, Rejected, Withdrawn }
public enum ApplicationPriority { Low, Medium, High }
public enum ReviewDecision { Approve, RequestChanges, Reject }
public enum EvaluationCriterion
{
    SubjectKnowledge,
    InformationAccuracy,
    ExplanationClarity,
    CommunicationSkills,
    TeachingStructure,
    VoiceQuality,
    VideoQuality,
    StudentEngagement,
    Professionalism
}

public sealed class TeacherApplication
{
    private readonly List<TeacherApplicationStatusHistory> _history = [];
    private readonly List<TeacherApplicationReview> _reviews = [];
    private TeacherApplication() { }

    public TeacherApplication(string teacherId, Guid subjectId, Guid qualificationTopicId, DateTimeOffset now)
    {
        Id = Guid.NewGuid();
        TeacherId = teacherId;
        SubjectId = subjectId;
        QualificationTopicId = qualificationTopicId;
        CreatedAt = now;
        AddHistory(null, TeacherApplicationStatus.Draft, teacherId, null, now);
    }

    public Guid Id { get; private init; }
    public string TeacherId { get; private init; } = "";
    public Guid SubjectId { get; private init; }
    public Guid QualificationTopicId { get; private set; }
    public string City { get; private set; } = "";
    public int ExperienceYears { get; private set; }
    public string Degree { get; private set; } = "";
    public string? DemoStorageKey { get; private set; }
    public int? DemoDurationSeconds { get; private set; }
    public TeacherApplicationStatus Status { get; private set; }
    public ApplicationPriority Priority { get; private set; } = ApplicationPriority.Medium;
    public string? AssignedReviewerId { get; private set; }
    public DateTimeOffset CreatedAt { get; private init; }
    public DateTimeOffset? SubmittedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];
    public IReadOnlyCollection<TeacherApplicationStatusHistory> History => _history;
    public IReadOnlyCollection<TeacherApplicationReview> Reviews => _reviews;

    public void UpdateDraft(Guid qualificationTopicId, string city, int experienceYears, string degree)
    {
        EnsureStatus(TeacherApplicationStatus.Draft, TeacherApplicationStatus.ChangesRequested);
        if (experienceYears is < 0 or > 80)
            throw new DomainException("invalid_experience", "Experience years must be between 0 and 80.");
        QualificationTopicId = qualificationTopicId;
        City = Required(city, "city_required");
        Degree = Required(degree, "degree_required");
        ExperienceYears = experienceYears;
    }

    public void AttachDemo(string storageKey, int durationSeconds, int maximumSeconds)
    {
        EnsureStatus(TeacherApplicationStatus.Draft, TeacherApplicationStatus.ChangesRequested);
        if (durationSeconds is <= 0 || durationSeconds > maximumSeconds)
            throw new DomainException("invalid_demo_duration", $"Demo must not exceed {maximumSeconds} seconds.");
        DemoStorageKey = Required(storageKey, "demo_required");
        DemoDurationSeconds = durationSeconds;
    }

    public void Submit(string actorId, DateTimeOffset now)
    {
        EnsureStatus(TeacherApplicationStatus.Draft, TeacherApplicationStatus.ChangesRequested);
        if (string.IsNullOrWhiteSpace(City) || string.IsNullOrWhiteSpace(Degree) || DemoStorageKey is null)
            throw new DomainException("application_incomplete", "Profile details and a demo video are required.");
        TransitionTo(TeacherApplicationStatus.Submitted, actorId, null, now);
        SubmittedAt = now;
    }

    public void StartReview(string reviewerId, ApplicationPriority priority, DateTimeOffset now)
    {
        EnsureStatus(TeacherApplicationStatus.Submitted);
        if (!Enum.IsDefined(priority))
            throw new DomainException("invalid_application_priority", "Application priority is invalid.");
        AssignedReviewerId = reviewerId;
        Priority = priority;
        TransitionTo(TeacherApplicationStatus.UnderReview, reviewerId, null, now);
    }

    public TeacherApplicationReview Decide(
        string reviewerId,
        ReviewDecision decision,
        IReadOnlyDictionary<EvaluationCriterion, int> scores,
        string? comment,
        string? internalNotes,
        DateTimeOffset now)
    {
        EnsureStatus(TeacherApplicationStatus.UnderReview);
        if (!Enum.IsDefined(decision))
            throw new DomainException("invalid_review_decision", "Review decision is invalid.");
        if (AssignedReviewerId != reviewerId)
            throw new DomainException("reviewer_not_assigned", "Only the assigned reviewer can decide this application.");
        var criteria = Enum.GetValues<EvaluationCriterion>();
        if (scores.Count != criteria.Length
            || scores.Keys.Any(key => !Enum.IsDefined(key))
            || criteria.Any(criterion => !scores.ContainsKey(criterion))
            || scores.Values.Any(score => score is < 1 or > 5))
            throw new DomainException("incomplete_evaluation", "All evaluation criteria require a score from 1 to 5.");
        if (decision is not ReviewDecision.Approve && string.IsNullOrWhiteSpace(comment))
            throw new DomainException("review_comment_required", "A comment is required for rejection or requested changes.");

        var review = new TeacherApplicationReview(
            Id, reviewerId, decision, scores, comment?.Trim(), internalNotes?.Trim(), now);
        _reviews.Add(review);
        var next = decision switch
        {
            ReviewDecision.Approve => TeacherApplicationStatus.Approved,
            ReviewDecision.RequestChanges => TeacherApplicationStatus.ChangesRequested,
            _ => TeacherApplicationStatus.Rejected
        };
        TransitionTo(next, reviewerId, comment, now);
        return review;
    }

    public void Withdraw(string teacherId, DateTimeOffset now)
    {
        if (TeacherId != teacherId)
            throw new DomainException("application_not_owned", "Only the applicant can withdraw this application.");
        EnsureStatus(
            TeacherApplicationStatus.Draft,
            TeacherApplicationStatus.Submitted,
            TeacherApplicationStatus.ChangesRequested);
        TransitionTo(TeacherApplicationStatus.Withdrawn, teacherId, null, now);
    }

    private void TransitionTo(TeacherApplicationStatus next, string actorId, string? note, DateTimeOffset now)
    {
        var previous = Status;
        Status = next;
        AddHistory(previous, next, actorId, note, now);
    }

    private void AddHistory(
        TeacherApplicationStatus? previous,
        TeacherApplicationStatus next,
        string actorId,
        string? note,
        DateTimeOffset now) =>
        _history.Add(new(Id, previous, next, actorId, note, now));

    private void EnsureStatus(params TeacherApplicationStatus[] allowed)
    {
        if (!allowed.Contains(Status))
            throw new DomainException("invalid_application_transition", $"Cannot perform this action while application is {Status}.");
    }

    private static string Required(string value, string code) =>
        string.IsNullOrWhiteSpace(value) ? throw new DomainException(code, "Value is required.") : value.Trim();
}

public sealed class TeacherApplicationReview
{
    private readonly List<TeacherEvaluationScore> _scores = [];
    private TeacherApplicationReview() { }
    internal TeacherApplicationReview(
        Guid applicationId,
        string reviewerId,
        ReviewDecision decision,
        IReadOnlyDictionary<EvaluationCriterion, int> scores,
        string? comment,
        string? internalNotes,
        DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid();
        TeacherApplicationId = applicationId;
        ReviewerId = reviewerId;
        Decision = decision;
        Comment = comment;
        InternalNotes = internalNotes;
        CreatedAt = createdAt;
        _scores.AddRange(scores.Select(score => new TeacherEvaluationScore(Id, score.Key, score.Value)));
    }
    public Guid Id { get; private init; }
    public Guid TeacherApplicationId { get; private init; }
    public string ReviewerId { get; private init; } = "";
    public ReviewDecision Decision { get; private init; }
    public string? Comment { get; private init; }
    public string? InternalNotes { get; private init; }
    public DateTimeOffset CreatedAt { get; private init; }
    public IReadOnlyCollection<TeacherEvaluationScore> Scores => _scores;
    public decimal OverallScore => _scores.Count == 0 ? 0 : (decimal)_scores.Sum(x => x.Score) / _scores.Count;
}

public sealed class TeacherEvaluationScore
{
    private TeacherEvaluationScore() { }
    internal TeacherEvaluationScore(Guid reviewId, EvaluationCriterion criterion, int score)
    {
        Id = Guid.NewGuid();
        TeacherApplicationReviewId = reviewId;
        Criterion = criterion;
        Score = score;
    }
    public Guid Id { get; private init; }
    public Guid TeacherApplicationReviewId { get; private init; }
    public EvaluationCriterion Criterion { get; private init; }
    public int Score { get; private init; }
}

public sealed class TeacherApplicationStatusHistory
{
    private TeacherApplicationStatusHistory() { }
    internal TeacherApplicationStatusHistory(
        Guid applicationId,
        TeacherApplicationStatus? previousStatus,
        TeacherApplicationStatus nextStatus,
        string actorId,
        string? note,
        DateTimeOffset createdAt)
    {
        Id = Guid.NewGuid();
        TeacherApplicationId = applicationId;
        PreviousStatus = previousStatus;
        NextStatus = nextStatus;
        ActorId = actorId;
        Note = note;
        CreatedAt = createdAt;
    }
    public Guid Id { get; private init; }
    public Guid TeacherApplicationId { get; private init; }
    public TeacherApplicationStatus? PreviousStatus { get; private init; }
    public TeacherApplicationStatus NextStatus { get; private init; }
    public string ActorId { get; private init; } = "";
    public string? Note { get; private init; }
    public DateTimeOffset CreatedAt { get; private init; }
}

public sealed class TeacherSubjectQualification
{
    private TeacherSubjectQualification() { }
    public TeacherSubjectQualification(string teacherId, Guid subjectId, DateTimeOffset approvedAt)
    {
        Id = Guid.NewGuid();
        TeacherId = teacherId;
        SubjectId = subjectId;
        ApprovedAt = approvedAt;
    }
    public Guid Id { get; private init; }
    public string TeacherId { get; private init; } = "";
    public Guid SubjectId { get; private init; }
    public DateTimeOffset ApprovedAt { get; private init; }
}
