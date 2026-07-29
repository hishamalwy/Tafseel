using Tafseel.Domain.Common;

namespace Tafseel.Domain.Students;

/// <summary>
/// Stable persisted codes for Student explanation-style defaults.
/// Labels are localized in the client; do not persist display text.
/// </summary>
public static class ExplanationStyleCodes
{
    public const string StepByStep = "step_by_step";
    public const string ShortDirect = "short_direct";
    public const string Detailed = "detailed";
    public const string Visual = "visual";
    public const string ExamFocused = "exam_focused";
    public const string PracticeFocused = "practice_focused";

    public static readonly IReadOnlyList<string> All =
    [
        StepByStep,
        ShortDirect,
        Detailed,
        Visual,
        ExamFocused,
        PracticeFocused
    ];

    public static bool IsAllowed(string? value) =>
        value is null || All.Contains(value, StringComparer.Ordinal);
}

/// <summary>
/// Explicit Student-controlled learning defaults (1:1). Not a diagnosis and not matching input.
/// </summary>
public sealed class StudentLearningPreference
{
    private StudentLearningPreference() { }

    public StudentLearningPreference(string userId, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(userId))
            throw new DomainException("invalid_user", "Student user id is required.");
        UserId = userId.Trim();
        CreatedAt = now;
        UpdatedAt = now;
    }

    public string UserId { get; private set; } = "";
    public string? ExplanationStyle { get; private set; }
    public Guid? PreferredTeachingLanguageId { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public byte[] RowVersion { get; private set; } = new byte[8];

    public void Update(string? explanationStyle, Guid? preferredTeachingLanguageId, DateTimeOffset now)
    {
        if (!ExplanationStyleCodes.IsAllowed(explanationStyle))
            throw new DomainException("invalid_explanation_style", "Explanation style is not allowed.");
        ExplanationStyle = explanationStyle;
        PreferredTeachingLanguageId = preferredTeachingLanguageId;
        UpdatedAt = now;
    }
}
