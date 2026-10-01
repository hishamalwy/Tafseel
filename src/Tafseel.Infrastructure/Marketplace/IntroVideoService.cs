using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Common;
using Tafseel.Application.Marketplace;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Governance;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Marketplace;

/// <summary>
/// PRODUCT-P1 (one public introduction). A teacher has at most one introduction video on the public profile: their
/// own upload (scanned by the storage pipeline like every upload) or, only after a recorded consent, the video they
/// recorded for a teaching application. Application videos stay private review material until then.
/// </summary>
internal sealed class IntroVideoService(
    TafseelDbContext db,
    IFileStorageService files,
    AuditWriter audit,
    TimeProvider clock) : IIntroVideoService
{
    public async Task<IntroVideoDto> GetOwnAsync(string teacherId, CancellationToken ct) =>
        await MapAsync(teacherId, await db.TeacherIntroVideos.AsNoTracking().SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct), ct);

    public async Task<IntroVideoDto> UploadAsync(
        string teacherId, Stream content, string fileName, string contentType, long size, string? expectedVersion,
        CancellationToken ct)
    {
        var intro = await TrackedAsync(teacherId, expectedVersion, ct);
        var stored = await files.StorePrivateVideoAsync(content, fileName, contentType, size, ct);
        var now = clock.GetUtcNow();
        string? replaced;
        try
        {
            replaced = intro.UseUpload(stored.StorageKey, SafeFileName(fileName), stored.ContentType, stored.Size, now);
            WithdrawConsents(teacherId, now);
            audit.AddCurrent("IntroVideoUploaded", "TeacherIntroVideo", intro.Id.ToString(),
                "The teacher uploaded an introduction video (hidden until they show it).");
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            await files.DeletePrivateFileAsync(stored.StorageKey, ct);
            throw;
        }
        if (replaced is not null) await DeleteQuietlyAsync(replaced, ct);
        return await GetOwnAsync(teacherId, ct);
    }

    public async Task<IntroVideoDto> UseApplicationVideoAsync(
        string teacherId, UseApplicationVideoInput input, string? expectedVersion, CancellationToken ct)
    {
        if (!input.Consent)
            throw new DomainException("intro_video_consent_required", "Showing an application video needs the teacher's consent.");
        var sample = await ApplicationVideos(teacherId).SingleOrDefaultAsync(x => x.Id == input.SampleId, ct)
            ?? throw new DomainException("intro_video_source_not_found", "That application video was not found.");
        if (sample.StorageKey is null || !await files.PrivateFileExistsAsync(sample.StorageKey, ct))
            throw new DomainException("inaccessible_media", "The application video is unavailable.");
        var intro = await TrackedAsync(teacherId, expectedVersion, ct);
        var now = clock.GetUtcNow();
        WithdrawConsents(teacherId, now);
        var consent = TeacherVideoConsent.Grant(teacherId, sample.Id, sample.StorageKey, now);
        db.TeacherVideoConsents.Add(consent);
        var replaced = intro.UseApplicationVideo(consent, sample.SubjectId, sample.DurationSeconds, now);
        audit.AddCurrent("IntroVideoConsentGranted", "TeacherIntroVideo", intro.Id.ToString(),
            $"The teacher agreed to show application video {sample.Id} on their public profile (consent {consent.Id}).");
        await db.SaveChangesAsync(ct);
        if (replaced is not null) await DeleteQuietlyAsync(replaced, ct);
        return await GetOwnAsync(teacherId, ct);
    }

    public async Task<IntroVideoDto> SetVisibilityAsync(string teacherId, bool visible, string expectedVersion, CancellationToken ct)
    {
        var intro = await ExistingAsync(teacherId, expectedVersion, ct);
        var now = clock.GetUtcNow();
        if (visible)
        {
            // Showing a reused application video again is a new agreement; hiding it withdrew the last one.
            if (intro.Source == IntroVideoSource.ApplicationVideo && !await HasLiveConsentAsync(intro, ct))
                throw new DomainException("intro_video_consent_required", "Showing an application video needs the teacher's consent.");
            intro.Show(now);
        }
        else
        {
            intro.Hide(now);
            if (intro.Source == IntroVideoSource.ApplicationVideo) WithdrawConsents(teacherId, now);
        }
        audit.AddCurrent(visible ? "IntroVideoShown" : "IntroVideoHidden", "TeacherIntroVideo", intro.Id.ToString(),
            visible ? "The introduction video is shown on the public profile." : "The introduction video is hidden from the public profile.");
        await db.SaveChangesAsync(ct);
        return await GetOwnAsync(teacherId, ct);
    }

    public async Task<IntroVideoDto> RemoveAsync(string teacherId, string expectedVersion, CancellationToken ct)
    {
        var intro = await ExistingAsync(teacherId, expectedVersion, ct);
        var ownFile = intro.Source == IntroVideoSource.OwnUpload ? intro.StorageKey : null;
        WithdrawConsents(teacherId, clock.GetUtcNow());
        db.TeacherIntroVideos.Remove(intro);
        audit.AddCurrent("IntroVideoRemoved", "TeacherIntroVideo", intro.Id.ToString(),
            "The teacher removed their introduction video.");
        await db.SaveChangesAsync(ct);
        // An application video is review material and is never deleted from here.
        if (ownFile is not null) await DeleteQuietlyAsync(ownFile, ct);
        return await GetOwnAsync(teacherId, ct);
    }

    public async Task<IntroVideoFile> OpenAsync(string? requesterId, string teacherId, CancellationToken ct)
    {
        var owner = string.Equals(requesterId, teacherId, StringComparison.Ordinal);
        var intro = owner
            ? await db.TeacherIntroVideos.AsNoTracking().SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct)
            : await TeacherPublicQueries.PublicIntroVideos(db).SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct);
        if (intro is null || !owner && !await TeacherPublicQueries.IsBrowsableAsync(db, teacherId, ct))
            throw new DomainException("intro_video_not_found", "The introduction video was not found.");
        if (!await files.PrivateFileExistsAsync(intro.StorageKey, ct))
            throw new DomainException("inaccessible_media", "The introduction video is unavailable.");
        return new(await files.OpenPrivateVideoAsync(intro.StorageKey, ct), intro.ContentType);
    }

    private IQueryable<TeacherTeachingSample> ApplicationVideos(string teacherId) =>
        db.TeacherTeachingSamples.AsNoTracking().Where(x => x.TeacherId == teacherId
            && x.SourceType == TeachingSampleSourceType.QualificationGenerated
            && x.StorageKey != null
            && db.TeacherSubjectQualifications.Any(q => q.TeacherId == teacherId && q.SubjectId == x.SubjectId
                && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null));

    private async Task<TeacherIntroVideo> TrackedAsync(string teacherId, string? expectedVersion, CancellationToken ct)
    {
        var intro = await db.TeacherIntroVideos.SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct);
        if (intro is null)
        {
            intro = TeacherIntroVideo.Start(teacherId, clock.GetUtcNow());
            db.TeacherIntroVideos.Add(intro);
            return intro;
        }
        // Replacing an existing video is a change to it, so it needs the version the teacher saw.
        ApplyVersion(intro, expectedVersion ?? throw new DomainException("intro_video_version_required",
            "Reload the page and try again."));
        return intro;
    }

    private async Task<TeacherIntroVideo> ExistingAsync(string teacherId, string expectedVersion, CancellationToken ct)
    {
        var intro = await db.TeacherIntroVideos.SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct)
            ?? throw new DomainException("intro_video_not_found", "The introduction video was not found.");
        ApplyVersion(intro, expectedVersion);
        return intro;
    }

    private Task<bool> HasLiveConsentAsync(TeacherIntroVideo intro, CancellationToken ct) =>
        intro.ConsentId is { } id
            ? db.TeacherVideoConsents.AnyAsync(x => x.Id == id && x.WithdrawnAt == null, ct)
            : Task.FromResult(false);

    private void WithdrawConsents(string teacherId, DateTimeOffset now)
    {
        foreach (var consent in db.TeacherVideoConsents.Where(x => x.TeacherId == teacherId && x.WithdrawnAt == null))
            consent.Withdraw(now);
    }

    private async Task<IntroVideoDto> MapAsync(string teacherId, TeacherIntroVideo? intro, CancellationToken ct)
    {
        var options = await (
            from sample in ApplicationVideos(teacherId)
            join subject in db.Subjects.AsNoTracking() on sample.SubjectId equals subject.Id
            join topic in db.QualificationTopics.AsNoTracking() on sample.QualificationAssignmentId equals (Guid?)topic.Id into topics
            from topic in topics.DefaultIfEmpty()
            orderby sample.CreatedAt, sample.Id
            select new
            {
                sample.Id,
                sample.SubjectId,
                subject.Name,
                subject.NameAr,
                sample.Title,
                sample.DurationSeconds,
                TitleAr = topic == null ? null : topic.TitleAr != "" ? topic.TitleAr : topic.NameAr
            })
            .ToArrayAsync(ct);
        var consent = intro?.ConsentId is { } consentId
            ? await db.TeacherVideoConsents.AsNoTracking().SingleOrDefaultAsync(x => x.Id == consentId, ct)
            : null;
        var videos = options.Select(x => new ApplicationVideoOptionDto(
            x.Id, x.SubjectId, x.Name, x.NameAr, x.Title, x.DurationSeconds,
            intro?.Source == IntroVideoSource.ApplicationVideo && intro.SourceSampleId == x.Id,
            string.IsNullOrWhiteSpace(x.TitleAr) ? null : x.TitleAr)).ToArray();
        if (intro is null || intro.StorageKey.Length == 0)
            return new(false, null, false, null, null, null, null, null, null, null, videos,
                TeacherVideoConsent.ShowApplicationVideoStatement);
        return new(true,
            intro.Source == IntroVideoSource.OwnUpload ? "upload" : "application",
            intro.IsPublic,
            intro.Source == IntroVideoSource.OwnUpload ? intro.FileName : null,
            intro.ContentType, intro.DurationSeconds, intro.UpdatedAt,
            consent?.WithdrawnAt is null ? consent?.GrantedAt : null,
            consent?.Statement,
            Convert.ToBase64String(intro.RowVersion), videos,
            TeacherVideoConsent.ShowApplicationVideoStatement);
    }

    private void ApplyVersion(TeacherIntroVideo intro, string version)
    {
        byte[] bytes;
        try { bytes = Convert.FromBase64String(version.Trim('"')); }
        catch { throw new DomainException("invalid_concurrency_token", "The version is invalid."); }
        db.Entry(intro).Property(x => x.RowVersion).OriginalValue = bytes;
    }

    private async Task DeleteQuietlyAsync(string storageKey, CancellationToken ct)
    {
        // Nothing points at the file any more, so it can never be served; a failed delete must not undo the change.
        try { await files.DeletePrivateFileAsync(storageKey, ct); } catch (Exception) when (!ct.IsCancellationRequested) { }
    }

    private static string SafeFileName(string fileName)
    {
        var name = Path.GetFileName(fileName);
        return name.Length is 0 or > 255 ? "introduction-video" : name;
    }
}
