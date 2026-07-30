using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Tafseel.Application.Marketplace;
using Tafseel.Application.Students;
using Tafseel.Domain.Common;
using Tafseel.Domain.Students;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Students;

public sealed class StudentLearningPreferenceService(TafseelDbContext db) : IStudentLearningPreferenceService
{
    public async Task<StudentLearningPreferenceDto> GetAsync(string studentUserId, CancellationToken ct)
    {
        var item = await db.StudentLearningPreferences.AsNoTracking()
            .SingleOrDefaultAsync(x => x.UserId == studentUserId, ct);
        if (item is null)
            return new StudentLearningPreferenceDto(null, null, null);

        return await MapAsync(item, ct);
    }

    public async Task<StudentLearningPreferenceDto> UpsertAsync(
        string studentUserId, UpdateStudentLearningPreference input, CancellationToken ct)
    {
        var style = NormalizeStyle(input.ExplanationStyle);
        var languageId = await ResolveActiveLanguageIdAsync(input.PreferredTeachingLanguageId, ct);
        var now = DateTimeOffset.UtcNow;
        var usesAppManagedRowVersion = IsSqliteProvider(db.Database);

        var item = await db.StudentLearningPreferences
            .SingleOrDefaultAsync(x => x.UserId == studentUserId, ct);

        if (item is null)
        {
            if (!string.IsNullOrWhiteSpace(input.Version))
                throw new DomainException(
                    "concurrency_conflict",
                    "The resource changed. Reload it and retry with the latest version.");

            item = new StudentLearningPreference(studentUserId, now);
            item.Update(style, languageId, now);
            if (usesAppManagedRowVersion)
                item.AdvanceRowVersion();
            db.StudentLearningPreferences.Add(item);
        }
        else
        {
            ApplyExpectedVersion(item, input.Version);
            item.Update(style, languageId, now);
            if (usesAppManagedRowVersion)
                item.AdvanceRowVersion();
        }

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new DomainException(
                "concurrency_conflict",
                "The resource changed. Reload it and retry with the latest version.");
        }

        // Reload RowVersion after SaveChanges for an accurate response version.
        await db.Entry(item).ReloadAsync(ct);
        return await MapAsync(item, ct);
    }

    private async Task<StudentLearningPreferenceDto> MapAsync(
        StudentLearningPreference item, CancellationToken ct)
    {
        NamedItemDto? language = null;
        if (item.PreferredTeachingLanguageId is Guid languageId)
        {
            var catalog = await db.TeachingLanguages.AsNoTracking()
                .SingleOrDefaultAsync(x => x.Id == languageId, ct);
            // Inactive or missing catalog entries are treated as no preference on GET.
            if (catalog is { IsActive: true })
                language = new NamedItemDto(catalog.Id, catalog.Name, catalog.NameAr);
        }

        return new StudentLearningPreferenceDto(
            item.ExplanationStyle,
            language,
            Convert.ToBase64String(item.RowVersion));
    }

    private async Task<Guid?> ResolveActiveLanguageIdAsync(Guid? languageId, CancellationToken ct)
    {
        if (languageId is null)
            return null;

        var catalog = await db.TeachingLanguages.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == languageId.Value, ct);
        if (catalog is null)
            throw new DomainException("language_not_found", "Teaching language was not found.");
        if (!catalog.IsActive)
            throw new DomainException("language_inactive", "Teaching language is not active.");
        return catalog.Id;
    }

    private static string? NormalizeStyle(string? style)
    {
        if (string.IsNullOrWhiteSpace(style))
            return null;
        var trimmed = style.Trim();
        if (!ExplanationStyleCodes.IsAllowed(trimmed))
            throw new DomainException("invalid_explanation_style", "Explanation style is not allowed.");
        return trimmed;
    }

    private void ApplyExpectedVersion(StudentLearningPreference item, string? version)
    {
        if (string.IsNullOrWhiteSpace(version))
            throw new DomainException(
                "concurrency_conflict",
                "The resource changed. Reload it and retry with the latest version.");

        byte[] expected;
        try
        {
            expected = Convert.FromBase64String(version.Trim().Trim('"'));
        }
        catch (FormatException)
        {
            throw new DomainException(
                "concurrency_conflict",
                "The resource changed. Reload it and retry with the latest version.");
        }

        db.Entry(item).Property(x => x.RowVersion).OriginalValue = expected;
    }

    private static bool IsSqliteProvider(DatabaseFacade database) =>
        database.ProviderName?.Contains("Sqlite", StringComparison.OrdinalIgnoreCase) == true;
}
