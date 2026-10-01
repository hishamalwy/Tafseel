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
        where EligibleServices(db, true).Any(service => service.TeacherId == profile.TeacherId)
        select new BrowsableTeacher { Profile = profile, User = user };

    /// <summary>Canonical rule for services that may accept new commerce.</summary>
    public static IQueryable<Domain.Marketplace.TeacherService> EligibleServices(
        TafseelDbContext db, bool requirePublishedProfile = true) =>
        from service in db.TeacherServices
        join catalog in db.ServiceCatalogItems on service.ServiceCatalogItemId equals catalog.Id
        join profile in db.TeacherProfiles on service.TeacherId equals profile.TeacherId
        join user in db.Users on service.TeacherId equals user.Id
        where (!requirePublishedProfile || profile.IsPublished)
            && user.EmailConfirmed && !user.IsSuspended
            && !string.IsNullOrEmpty(profile.Headline) && !string.IsNullOrEmpty(profile.Bio)
            && !string.IsNullOrEmpty(profile.Country) && !string.IsNullOrEmpty(profile.City)
            && service.IsActive && service.SupersededByTeacherServiceId == null
            && catalog.IsActive && catalog.IsPublic && catalog.TeacherSelectable
            && db.Subjects.Any(subject => subject.Id == service.SubjectId && subject.IsActive)
            && db.TeacherSubjectQualifications.Any(q => q.TeacherId == service.TeacherId
                && q.SubjectId == service.SubjectId
                && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
            && (!catalog.RequiresScheduling
                || db.TeacherAvailabilityRules.Any(rule => rule.TeacherId == service.TeacherId))
        select service;

    public static Task<bool> IsBrowsableAsync(
        TafseelDbContext db, string teacherId, CancellationToken ct) =>
        BrowsableTeachers(db).AnyAsync(x => x.Profile.TeacherId == teacherId, ct);

    /// <summary>
    /// Reviewed showcases that may appear on the public profile (before media-existence check). Application
    /// videos never appear here: a teacher shows one only as their introduction video, after consenting
    /// (see <see cref="PublicIntroVideos"/>).
    /// </summary>
    public static IQueryable<TeacherTeachingSample> VisibleSamples(
        TafseelDbContext db, bool showcasesEnabled) =>
        db.TeacherTeachingSamples.AsNoTracking().Where(x =>
            x.IsProfileVisible
            && (showcasesEnabled
                    && x.SourceType == TeachingSampleSourceType.TeacherShowcase
                    && x.ModerationStatus == ShowcaseModerationStatus.Approved
                    && x.ArchivedAt == null
                    && x.ApprovedVersionId != null
                    && x.PublishedAt != null)
            && db.TeacherSubjectQualifications.Any(q => q.TeacherId == x.TeacherId
                && q.SubjectId == x.SubjectId
                && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
            && db.Subjects.Any(subject => subject.Id == x.SubjectId && subject.IsActive));

    /// <summary>
    /// Introduction videos a visitor may play: shown by the teacher, and, for a reused application video, still
    /// backed by an active qualification in an active subject and a consent that has not been withdrawn.
    /// </summary>
    public static IQueryable<TeacherIntroVideo> PublicIntroVideos(TafseelDbContext db) =>
        db.TeacherIntroVideos.AsNoTracking().Where(x => x.IsPublic && x.StorageKey != ""
            && (x.Source == IntroVideoSource.OwnUpload
                || x.Source == IntroVideoSource.ApplicationVideo
                    && db.TeacherVideoConsents.Any(c => c.Id == x.ConsentId && c.WithdrawnAt == null)
                    && db.TeacherSubjectQualifications.Any(q => q.TeacherId == x.TeacherId
                        && q.SubjectId == x.SourceSubjectId
                        && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
                    && db.Subjects.Any(subject => subject.Id == x.SourceSubjectId && subject.IsActive)));

    public sealed class BrowsableTeacher
    {
        public TeacherProfile Profile { get; init; } = null!;
        public ApplicationUser User { get; init; } = null!;
    }
}
