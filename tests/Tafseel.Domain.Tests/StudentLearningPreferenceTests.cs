using Tafseel.Domain.Common;
using Tafseel.Domain.Students;

namespace Tafseel.Domain.Tests;

public sealed class StudentLearningPreferenceTests
{
    [Fact]
    public void Allowed_styles_are_stable_codes_only()
    {
        Assert.True(ExplanationStyleCodes.IsAllowed(null));
        Assert.True(ExplanationStyleCodes.IsAllowed(ExplanationStyleCodes.StepByStep));
        Assert.False(ExplanationStyleCodes.IsAllowed("visual_heavy"));
        Assert.False(ExplanationStyleCodes.IsAllowed("Step_By_Step"));
        Assert.Equal(6, ExplanationStyleCodes.All.Count);
    }

    [Fact]
    public void Update_accepts_nullable_reset_and_rejects_unknown_style()
    {
        var now = DateTimeOffset.UtcNow;
        var preference = new StudentLearningPreference("student-1", now);
        var languageId = Guid.NewGuid();

        preference.Update(ExplanationStyleCodes.Detailed, languageId, now.AddMinutes(1));
        Assert.Equal(ExplanationStyleCodes.Detailed, preference.ExplanationStyle);
        Assert.Equal(languageId, preference.PreferredTeachingLanguageId);

        preference.Update(null, null, now.AddMinutes(2));
        Assert.Null(preference.ExplanationStyle);
        Assert.Null(preference.PreferredTeachingLanguageId);

        var error = Assert.Throws<DomainException>(() =>
            preference.Update("unsupported", null, now.AddMinutes(3)));
        Assert.Equal("invalid_explanation_style", error.Code);
    }

    [Fact]
    public void Constructor_requires_student_user_id()
    {
        var error = Assert.Throws<DomainException>(() =>
            new StudentLearningPreference(" ", DateTimeOffset.UtcNow));
        Assert.Equal("invalid_user", error.Code);
    }
}
