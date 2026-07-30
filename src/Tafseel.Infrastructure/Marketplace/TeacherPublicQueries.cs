using Microsoft.EntityFrameworkCore;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Marketplace;

/// <summary>
/// Canonical Browse / public-profile Teacher eligibility and public sample projections.
/// Favorites, Reviews, Comparison, and Search must reuse these queries — do not fork filters.
/// </summary>
internal static class TeacherPublicQueries
{
    public static IQueryable<BrowsableTeacher> BrowsableTeachers(TafseelDbContext db) =>
        from profile in db.TeacherProfiles.AsNoTracking()
        join user in db.Users.AsNoTracking() on profile.TeacherId equals user.Id
        where profile.IsPublished && user.EmailConfirmed && !user.IsSuspended
            && db.TeacherSubjectQualifications.Any(q => q.TeacherId == profile.TeacherId
                && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
            && db.TeacherServices.Any(service => service.TeacherId == profile.TeacherId
                && service.IsActive
                && db.TeacherSubjectQualifications.Any(q => q.TeacherId == profile.TeacherId
                    && q.SubjectId == service.SubjectId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
                && db.Subjects.Any(subject => subject.Id == service.SubjectId && subject.IsActive)
                && db.ServiceCatalogItems.Any(type => type.Id == service.ServiceCatalogItemId
                    && type.IsActive && type.IsPublic && type.TeacherSelectable))
        select new BrowsableTeacher { Profile = profile, User = user };

    public static Task<bool> IsBrowsableAsync(
        TafseelDbContext db, string teacherId, CancellationToken ct) =>
        BrowsableTeachers(db).AnyAsync(x => x.Profile.TeacherId == teacherId, ct);

    /// <summary>
    /// Samples that may appear on the public profile (before media-existence check).
    /// </summary>
    public static IQueryable<TeacherTeachingSample> VisibleSamples(
        TafseelDbContext db, bool showcasesEnabled) =>
        db.TeacherTeachingSamples.AsNoTracking().Where(x =>
            (x.SourceType == TeachingSampleSourceType.QualificationGenerated && x.PublishedAt != null
                || showcasesEnabled
                    && x.SourceType == TeachingSampleSourceType.TeacherShowcase
                    && x.ModerationStatus == ShowcaseModerationStatus.Approved
                    && x.ArchivedAt == null
                    && x.ApprovedVersionId != null
                    && x.PublishedAt != null)
            && db.TeacherSubjectQualifications.Any(q => q.TeacherId == x.TeacherId
                && q.SubjectId == x.SubjectId
                && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
            && db.Subjects.Any(subject => subject.Id == x.SubjectId && subject.IsActive));

    public sealed class BrowsableTeacher
    {
        public TeacherProfile Profile { get; init; } = null!;
        public ApplicationUser User { get; init; } = null!;
    }
}
