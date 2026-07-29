using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Tafseel.Application.Common;
using Tafseel.Application.LiveSessions;
using Tafseel.Application.Marketplace;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Messaging;

namespace Tafseel.Infrastructure.Marketplace;

internal sealed class MarketplaceService(
    TafseelDbContext db,
    IFileStorageService files,
    IOptions<LiveSessionOptions> liveSessionOptions,
    NotificationWriter notifications,
    TimeProvider clock) : IMarketplaceService
{
    private readonly LiveSessionOptions _liveSessionOptions = liveSessionOptions.Value;
    private static readonly string[] Sorts =
        ["name", "highest-rated", "lowest-price", "highest-price"];

    public async Task<PagedResult<TeacherCardDto>> SearchAsync(TeacherSearch input, CancellationToken ct)
    {
        var page = Math.Max(1, input.Page);
        var pageSize = Math.Clamp(input.PageSize, 1, 50);
        var sort = input.Sort.Trim().ToLowerInvariant();
        if (!Sorts.Contains(sort, StringComparer.Ordinal))
            throw new DomainException("invalid_sort", "The requested teacher sort is not supported.");
        if (input.OnlineOnly)
            throw new DomainException("online_status_unavailable", "Online status is not currently available.");
        if (input.MinimumRating is < 0 or > 5 || input.MaximumPrice is <= 0)
            throw new DomainException("invalid_filter", "A marketplace filter is outside its allowed range.");

        var query =
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
                        && type.IsActive && type.IsPublic && type.TeacherSelectable
                        && (!type.RequiresScheduling || db.TeacherAvailabilityRules.Any(
                            rule => rule.TeacherId == profile.TeacherId))))
            select new { profile, user };

        if (!string.IsNullOrWhiteSpace(input.Search))
        {
            var term = input.Search.Trim();
            query = query.Where(x =>
                x.user.FullName.Contains(term) || x.profile.Headline.Contains(term) || x.profile.Bio.Contains(term));
        }
        if (input.SubjectId.HasValue)
            query = query.Where(x => db.TeacherSubjectQualifications.Any(q =>
                q.TeacherId == x.profile.TeacherId && q.SubjectId == input.SubjectId
                && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null
                && db.Subjects.Any(s => s.Id == q.SubjectId && s.IsActive)));
        if (input.TopicId.HasValue)
            query = query.Where(x => db.TeacherTopics.Any(t =>
                t.TeacherId == x.profile.TeacherId && t.TopicId == input.TopicId));
        if (input.EducationLevelId.HasValue)
            query = query.Where(x => db.TeacherEducationLevels.Any(level =>
                level.TeacherId == x.profile.TeacherId && level.EducationLevelId == input.EducationLevelId));
        if (input.ServiceTypeId.HasValue)
            query = query.Where(x => db.TeacherServices.Any(service =>
                service.TeacherId == x.profile.TeacherId && service.IsActive
                && service.ServiceCatalogItemId == input.ServiceTypeId
                && db.ServiceCatalogItems.Any(type => type.Id == service.ServiceCatalogItemId && type.IsActive)
                && db.Subjects.Any(subject => subject.Id == service.SubjectId && subject.IsActive)));
        if (input.MinimumRating is > 0)
            query = query.Where(x => x.profile.RatingCount > 0
                && x.profile.AverageRating >= input.MinimumRating);
        if (input.MaximumPrice.HasValue)
            query = query.Where(x => db.TeacherServices.Any(service =>
                service.TeacherId == x.profile.TeacherId && service.IsActive && service.Price <= input.MaximumPrice
                && db.ServiceCatalogItems.Any(type => type.Id == service.ServiceCatalogItemId && type.IsActive)
                && db.Subjects.Any(subject => subject.Id == service.SubjectId && subject.IsActive)));
        if (input.LanguageIds is { Length: > 0 })
            query = query.Where(x => input.LanguageIds.All(languageId =>
                db.TeacherLanguages.Any(language =>
                    language.TeacherId == x.profile.TeacherId && language.LanguageId == languageId)));
        if (input.VerifiedOnly)
            query = query.Where(x => db.TeacherSubjectQualifications.Any(q =>
                q.TeacherId == x.profile.TeacherId
                && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null));
        if (input.AvailableThisWeek)
        {
            var weekStart = clock.GetUtcNow();
            var weekEnd = weekStart.AddDays(7);
            query = query.Where(x =>
                db.TeacherAvailabilityRules.Any(rule => rule.TeacherId == x.profile.TeacherId)
                && !db.TeacherAvailabilityExceptions.Any(exception =>
                    exception.TeacherId == x.profile.TeacherId
                    && exception.StartsAt < weekEnd && exception.EndsAt > weekStart));
        }

        query = sort switch
        {
            "highest-rated" => query.OrderByDescending(x => x.profile.RatingCount > 0)
                .ThenByDescending(x => x.profile.AverageRating)
                .ThenBy(x => x.user.FullName)
                .ThenBy(x => x.profile.TeacherId),
            "lowest-price" => query.OrderBy(x => db.TeacherServices
                .Where(s => s.TeacherId == x.profile.TeacherId && s.IsActive
                    && db.Subjects.Any(subject => subject.Id == s.SubjectId && subject.IsActive)
                    && db.ServiceCatalogItems.Any(type => type.Id == s.ServiceCatalogItemId && type.IsActive))
                .Min(s => (decimal?)s.Price) ?? decimal.MaxValue)
                .ThenBy(x => x.user.FullName)
                .ThenBy(x => x.profile.TeacherId),
            "highest-price" => query.OrderByDescending(x => db.TeacherServices
                .Where(s => s.TeacherId == x.profile.TeacherId && s.IsActive
                    && db.Subjects.Any(subject => subject.Id == s.SubjectId && subject.IsActive)
                    && db.ServiceCatalogItems.Any(type => type.Id == s.ServiceCatalogItemId && type.IsActive))
                .Min(s => (decimal?)s.Price) ?? 0)
                .ThenBy(x => x.user.FullName)
                .ThenBy(x => x.profile.TeacherId),
            _ => query.OrderBy(x => x.user.FullName)
                .ThenBy(x => x.profile.TeacherId)
        };

        var count = await query.CountAsync(ct);
        var rows = await query.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new TeacherCardDto(
                x.profile.TeacherId,
                x.user.FullName,
                x.profile.Headline,
                x.profile.Country,
                db.TeacherSubjectQualifications.Any(q => q.TeacherId == x.profile.TeacherId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null),
                x.profile.RatingCount > 0 ? x.profile.AverageRating : null,
                x.profile.RatingCount,
                null,
                null,
                db.TeacherServices.Where(s => s.TeacherId == x.profile.TeacherId && s.IsActive
                        && db.Subjects.Any(subject => subject.Id == s.SubjectId && subject.IsActive)
                        && db.ServiceCatalogItems.Any(type => type.Id == s.ServiceCatalogItemId && type.IsActive))
                    .Min(s => (decimal?)s.Price),
                db.TeacherServices.Where(s => s.TeacherId == x.profile.TeacherId && s.IsActive
                        && db.Subjects.Any(subject => subject.Id == s.SubjectId && subject.IsActive)
                        && db.ServiceCatalogItems.Any(type => type.Id == s.ServiceCatalogItemId && type.IsActive))
                    .OrderBy(s => s.Price).Select(s => s.Currency).FirstOrDefault(),
                db.TeacherSubjectQualifications.Where(q => q.TeacherId == x.profile.TeacherId
                        && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
                    .Join(db.Subjects, q => q.SubjectId, s => s.Id, (_, s) => s.Name).ToArray(),
                db.TeacherLanguages.Where(language => language.TeacherId == x.profile.TeacherId)
                    .Join(db.TeachingLanguages, language => language.LanguageId, item => item.Id, (_, item) => item.Name)
                    .ToArray(),
                x.user.FullNameEnglish,
                !string.IsNullOrEmpty(x.user.AvatarStorageKey)))
            .ToArrayAsync(ct);
        return new(rows, page, pageSize, count);
    }

    public async Task<TeacherProfileDto> GetPublicProfileAsync(string teacherId, CancellationToken ct)
    {
        var profile = await db.TeacherProfiles.AsNoTracking()
            .SingleOrDefaultAsync(x => x.TeacherId == teacherId && x.IsPublished, ct)
            ?? throw new DomainException("teacher_not_found", "Teacher was not found.");
        if (!await db.Users.AnyAsync(x => x.Id == teacherId && x.EmailConfirmed && !x.IsSuspended, ct))
            throw new DomainException("teacher_not_found", "Teacher was not found.");
        if (!await db.TeacherSubjectQualifications.AnyAsync(x => x.TeacherId == teacherId
                && x.Status == TeacherQualificationStatus.Approved && x.RevokedAt == null, ct)
            || !await db.TeacherServices.AnyAsync(x => x.TeacherId == teacherId && x.IsActive
                && db.TeacherSubjectQualifications.Any(q => q.TeacherId == teacherId
                    && q.SubjectId == x.SubjectId && q.Status == TeacherQualificationStatus.Approved
                    && q.RevokedAt == null)
                && db.ServiceCatalogItems.Any(type => type.Id == x.ServiceCatalogItemId
                    && type.IsActive && type.IsPublic && type.TeacherSelectable
                    && (!type.RequiresScheduling || db.TeacherAvailabilityRules.Any(
                        rule => rule.TeacherId == teacherId))), ct))
            throw new DomainException("teacher_not_found", "Teacher was not found.");
        return await BuildProfileAsync(profile, publicOnly: true, ct);
    }

    public async Task<TeacherProfileDto> GetOwnProfileAsync(string teacherId, CancellationToken ct)
    {
        var profile = await db.TeacherProfiles.AsNoTracking().SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct);
        if (profile is null)
            return EmptyProfile(teacherId, await TeacherNameAsync(teacherId, ct));
        return await BuildProfileAsync(profile, publicOnly: false, ct);
    }

    public async Task<IReadOnlyCollection<NamedItemDto>> GetLanguagesAsync(string teacherId, CancellationToken ct)
    {
        await RequireTeacherAsync(teacherId, ct);
        // EF Core can't translate ordering after projecting into a custom DTO in the Join selector.
        // Order first, then project into NamedItemDto.
        return await db.TeacherLanguages.AsNoTracking()
            .Where(x => x.TeacherId == teacherId)
            .Join(
                db.TeachingLanguages,
                x => x.LanguageId,
                x => x.Id,
                (teacherLanguage, teachingLanguage) => new { teachingLanguage.Id, teachingLanguage.Name })
            .OrderBy(x => x.Name)
            .Select(x => new NamedItemDto(x.Id, x.Name))
            .ToArrayAsync(ct);
    }

    public async Task UpdateProfileAsync(string teacherId, UpdateTeacherProfile input, CancellationToken ct)
    {
        await RequireTeacherAsync(teacherId, ct);
        var profile = await db.TeacherProfiles.FindAsync([teacherId], ct);
        if (profile is null)
            db.TeacherProfiles.Add(profile = new TeacherProfile(teacherId, clock.GetUtcNow()));
        profile.Update(input.Headline, input.Bio, input.Country, input.City, input.TimeZoneId, input.ResponseTimeMinutes, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }

    public async Task SetProfilePublishedAsync(string teacherId, bool published, CancellationToken ct)
    {
        var profile = await OwnedProfileAsync(teacherId, ct);
        if (published)
        {
            if (!await db.TeacherSubjectQualifications.AnyAsync(x => x.TeacherId == teacherId
                    && x.Status == TeacherQualificationStatus.Approved && x.RevokedAt == null, ct))
                throw new DomainException("teacher_not_approved", "An approved subject qualification is required.");
            var hasAvailability = await db.TeacherAvailabilityRules.AnyAsync(
                x => x.TeacherId == teacherId, ct);
            if (!await (
                    from service in db.TeacherServices
                    join type in db.ServiceCatalogItems on service.ServiceCatalogItemId equals type.Id
                    where service.TeacherId == teacherId && service.IsActive
                        && type.IsActive && type.IsPublic && type.TeacherSelectable
                        && (!type.RequiresScheduling || hasAvailability)
                        && db.TeacherSubjectQualifications.Any(q => q.TeacherId == teacherId
                            && q.SubjectId == service.SubjectId
                            && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
                    select service.Id).AnyAsync(ct))
                throw new DomainException("active_service_required", "Create an active service in an approved subject before publishing.");
            profile.Publish(clock.GetUtcNow());
        }
        else profile.Unpublish(clock.GetUtcNow());
        await notifications.QueueAsync(
            teacherId, published ? "ProfilePublished" : "ProfileUnpublished",
            published ? "Profile published" : "Profile unpublished",
            published ? "Your teacher profile is now public." : "Your teacher profile is no longer public.",
            "/app/Tafseel-Teacher-Dashboard.dc.html?section=profile",
            $"profile-publication:{teacherId}:{published}", email: false, ct);
        await db.SaveChangesAsync(ct);
    }

    public Task SetTopicsAsync(string teacherId, IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        ReplaceTopicsAsync(teacherId, ids.Distinct().ToArray(), ct);

    public Task SetLanguagesAsync(string teacherId, IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        ReplaceLanguagesAsync(teacherId, ids.Distinct().ToArray(), ct);

    public Task SetEducationLevelsAsync(string teacherId, IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        ReplaceEducationLevelsAsync(teacherId, ids.Distinct().ToArray(), ct);

    public async Task<TeacherServiceDto> AddServiceAsync(string teacherId, TeacherServiceInput input, CancellationToken ct)
    {
        await RequireActiveQualificationAsync(teacherId, input.SubjectId, ct);
        if (!await db.ServiceCatalogItems.AnyAsync(x => x.Id == input.ServiceCatalogItemId && x.IsActive, ct))
            throw new DomainException("service_type_not_found", "An active service type is required.");
        var service = new TeacherService(
            teacherId, input.SubjectId, input.ServiceCatalogItemId, input.Title, input.Description,
            input.Price, input.Currency, input.DeliveryHours, input.Revisions, clock.GetUtcNow());
        db.Add(service);
        await db.SaveChangesAsync(ct);
        var type = await db.ServiceCatalogItems.AsNoTracking().SingleAsync(
            x => x.Id == service.ServiceCatalogItemId, ct);
        return Map(service, type, profilePublished: false, hasActiveQualification: true, hasAvailability: false);
    }

    public async Task UpdateServiceAsync(string teacherId, Guid id, TeacherServiceInput input, string version, CancellationToken ct)
    {
        var service = await OwnedServiceAsync(teacherId, id, version, ct);
        if (service.SubjectId != input.SubjectId || service.ServiceCatalogItemId != input.ServiceCatalogItemId)
            throw new DomainException("service_scope_immutable", "Service subject and type cannot be changed.");
        await RequireActiveQualificationAsync(teacherId, service.SubjectId, ct);
        service.Update(input.Title, input.Description, input.Price, input.Currency, input.DeliveryHours, input.Revisions, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }

    public async Task SetServiceActiveAsync(string teacherId, Guid id, bool active, string version, CancellationToken ct)
    {
        var service = await OwnedServiceAsync(teacherId, id, version, ct);
        if (active)
        {
            await RequireActiveQualificationAsync(teacherId, service.SubjectId, ct);
            if (!await db.ServiceCatalogItems.AnyAsync(x => x.Id == service.ServiceCatalogItemId && x.IsActive, ct))
                throw new DomainException("service_type_not_found", "An active service type is required.");
        }
        service.SetActive(active, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }

    public async Task<TeachingSampleDto> AddSampleAsync(
        string teacherId, Guid subjectId, Guid? topicId, string title, Stream stream, string fileName,
        string contentType, long size, int durationSeconds, CancellationToken ct)
    {
        await RequireActiveQualificationAsync(teacherId, subjectId, ct);
        if (topicId.HasValue && !await db.Topics.AnyAsync(x =>
                x.Id == topicId && x.SubjectId == subjectId && x.IsActive, ct))
            throw new DomainException("topic_not_found", "An active topic in the approved subject is required.");
        if (string.IsNullOrWhiteSpace(title) || title.Trim().Length > 200)
            throw new DomainException("invalid_sample_title", "A teaching sample title is required.");
        var stored = await files.StorePrivateVideoAsync(stream, fileName, contentType, size, ct);
        var sample = new TeacherTeachingSample(
            teacherId, subjectId, topicId, title, stored.StorageKey, durationSeconds, clock.GetUtcNow());
        db.Add(sample);
        await db.SaveChangesAsync(ct);
        return Map(sample);
    }

    public async Task SetSamplePublishedAsync(string teacherId, Guid id, bool published, CancellationToken ct)
    {
        var sample = await db.TeacherTeachingSamples.SingleOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId, ct)
            ?? throw new DomainException("sample_not_owned", "Teaching sample was not found.");
        if (!published && sample.SourceDemoSubmissionId.HasValue)
            throw new DomainException(
                "qualification_sample_locked",
                "An approved qualification demo remains public while its subject qualification is active.");
        if (published)
        {
            await RequireActiveQualificationAsync(teacherId, sample.SubjectId, ct);
            sample.Publish(clock.GetUtcNow());
        }
        else sample.Unpublish();
        await db.SaveChangesAsync(ct);
    }

    public async Task<SampleFile> OpenSampleAsync(string? requesterId, Guid id, CancellationToken ct)
    {
        var sample = await db.TeacherTeachingSamples.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("sample_not_found", "Teaching sample was not found.");
        if (!sample.IsPublished && !string.Equals(sample.TeacherId, requesterId, StringComparison.Ordinal))
            throw new DomainException("sample_not_found", "Teaching sample was not found.");
        return new(await files.OpenPrivateVideoAsync(sample.StorageKey, ct), "video/mp4");
    }

    public async Task<AvailabilityRuleDto> AddAvailabilityRuleAsync(string teacherId, AvailabilityRuleInput input, CancellationToken ct)
    {
        await RequireTeacherAsync(teacherId, ct);
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            if (await db.TeacherAvailabilityRules.AnyAsync(x => x.TeacherId == teacherId
                    && x.DayOfWeek == input.DayOfWeek && x.Start < input.End && input.Start < x.End, ct))
                throw new DomainException("availability_conflict", "The availability rule overlaps an existing rule.");
            var rule = new TeacherAvailabilityRule(
                teacherId, input.DayOfWeek, input.Start, input.End, input.TimeZoneId, input.SlotMinutes);
            db.Add(rule);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Map(rule);
        }
        catch (DbUpdateException)
        {
            throw new DomainException("availability_conflict", "The availability rule conflicts with an existing rule.");
        }
        catch (Exception exception) when (exception.GetBaseException() is SqlException { Number: 1205 })
        {
            throw new DomainException("availability_conflict", "The availability rule conflicts with a concurrent update.");
        }
    }

    public async Task RemoveAvailabilityRuleAsync(string teacherId, Guid id, CancellationToken ct)
    {
        var rule = await db.TeacherAvailabilityRules.SingleOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId, ct)
            ?? throw new DomainException("availability_not_owned", "Availability rule was not found.");
        db.Remove(rule);
        await db.SaveChangesAsync(ct);
    }

    public async Task<AvailabilityExceptionDto> AddAvailabilityExceptionAsync(string teacherId, AvailabilityExceptionInput input, CancellationToken ct)
    {
        await RequireTeacherAsync(teacherId, ct);
        var item = new TeacherAvailabilityException(teacherId, input.StartsAt, input.EndsAt, input.Reason ?? "");
        db.Add(item);
        await db.SaveChangesAsync(ct);
        return Map(item);
    }

    public async Task RemoveAvailabilityExceptionAsync(string teacherId, Guid id, CancellationToken ct)
    {
        var item = await db.TeacherAvailabilityExceptions.SingleOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId, ct)
            ?? throw new DomainException("availability_exception_not_owned", "Availability exception was not found.");
        db.Remove(item);
        await db.SaveChangesAsync(ct);
    }

    public async Task<CredentialDto> AddCredentialAsync(string teacherId, bool certification, CredentialInput input, CancellationToken ct)
    {
        await RequireTeacherAsync(teacherId, ct);
        TeacherCredential credential = certification
            ? new TeacherCertification(teacherId, input.Title, input.Organization, input.From, input.To)
            : new TeacherExperience(teacherId, input.Title, input.Organization, input.From, input.To);
        db.Add(credential);
        await db.SaveChangesAsync(ct);
        return Map(credential);
    }

    public async Task RemoveCredentialAsync(string teacherId, bool certification, Guid id, CancellationToken ct)
    {
        TeacherCredential? credential = certification
            ? await db.TeacherCertifications.SingleOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId, ct)
            : await db.TeacherExperiences.SingleOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId, ct);
        if (credential is null)
            throw new DomainException("credential_not_owned", "Teacher credential was not found.");
        db.Remove(credential);
        await db.SaveChangesAsync(ct);
    }

    public async Task FavoriteAsync(string studentId, string teacherId, CancellationToken ct)
    {
        if (!await db.TeacherProfiles.AnyAsync(x => x.TeacherId == teacherId && x.IsPublished, ct))
            throw new DomainException("teacher_not_found", "Teacher was not found.");
        if (await db.FavoriteTeachers.AnyAsync(x => x.StudentId == studentId && x.TeacherId == teacherId, ct))
            return;
        db.Add(new FavoriteTeacher(studentId, teacherId, clock.GetUtcNow()));
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            if (!await db.FavoriteTeachers.AsNoTracking()
                    .AnyAsync(x => x.StudentId == studentId && x.TeacherId == teacherId, ct))
                throw;
        }
    }

    public async Task UnfavoriteAsync(string studentId, string teacherId, CancellationToken ct)
    {
        var favorite = await db.FavoriteTeachers.FindAsync([studentId, teacherId], ct);
        if (favorite is null) return;
        db.Remove(favorite);
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyCollection<TeacherCardDto>> GetFavoritesAsync(string studentId, CancellationToken ct)
    {
        var ids = await db.FavoriteTeachers.AsNoTracking().Where(x => x.StudentId == studentId)
            .OrderByDescending(x => x.CreatedAt).Select(x => x.TeacherId).ToArrayAsync(ct);
        if (ids.Length == 0) return [];
        var cards = await (
            from favorite in db.FavoriteTeachers.AsNoTracking()
            join profile in db.TeacherProfiles.AsNoTracking() on favorite.TeacherId equals profile.TeacherId
            join user in db.Users.AsNoTracking() on profile.TeacherId equals user.Id
            where favorite.StudentId == studentId && profile.IsPublished
            orderby favorite.CreatedAt descending
            select new TeacherCardDto(
                profile.TeacherId, user.FullName, profile.Headline, profile.Country,
                db.TeacherSubjectQualifications.Any(q => q.TeacherId == profile.TeacherId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null),
                profile.RatingCount > 0 ? profile.AverageRating : null,
                profile.RatingCount, null, null,
                db.TeacherServices.Where(s => s.TeacherId == profile.TeacherId && s.IsActive
                        && db.Subjects.Any(subject => subject.Id == s.SubjectId && subject.IsActive)
                        && db.ServiceCatalogItems.Any(type => type.Id == s.ServiceCatalogItemId && type.IsActive))
                    .Min(s => (decimal?)s.Price),
                db.TeacherServices.Where(s => s.TeacherId == profile.TeacherId && s.IsActive
                        && db.Subjects.Any(subject => subject.Id == s.SubjectId && subject.IsActive)
                        && db.ServiceCatalogItems.Any(type => type.Id == s.ServiceCatalogItemId && type.IsActive))
                    .OrderBy(s => s.Price).Select(s => s.Currency).FirstOrDefault(),
                db.TeacherSubjectQualifications.Where(q => q.TeacherId == profile.TeacherId
                        && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
                    .Join(db.Subjects, q => q.SubjectId, s => s.Id, (_, s) => s.Name).ToArray(),
                db.TeacherLanguages.Where(language => language.TeacherId == profile.TeacherId)
                    .Join(db.TeachingLanguages, language => language.LanguageId, item => item.Id, (_, item) => item.Name)
                    .ToArray(),
                user.FullNameEnglish,
                !string.IsNullOrEmpty(user.AvatarStorageKey)))
            .ToArrayAsync(ct);
        return cards;
    }

    private async Task ReplaceTopicsAsync(string teacherId, Guid[] ids, CancellationToken ct)
    {
        await RequireTeacherAsync(teacherId, ct);
        var valid = await db.Topics.Where(x => ids.Contains(x.Id) && x.IsActive
                && db.Subjects.Any(subject => subject.Id == x.SubjectId && subject.IsActive)
                && db.TeacherSubjectQualifications.Any(q => q.TeacherId == teacherId && q.SubjectId == x.SubjectId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null))
            .Select(x => x.Id).ToArrayAsync(ct);
        if (valid.Length != ids.Length)
            throw new DomainException("topic_not_approved", "Every topic must be active and belong to an approved subject.");
        db.TeacherTopics.RemoveRange(db.TeacherTopics.Where(x => x.TeacherId == teacherId));
        db.TeacherTopics.AddRange(ids.Select(id => new TeacherTopic(teacherId, id)));
        await db.SaveChangesAsync(ct);
    }

    private async Task ReplaceLanguagesAsync(string teacherId, Guid[] ids, CancellationToken ct)
    {
        await RequireTeacherAsync(teacherId, ct);
        if (ids.Length == 0)
            throw new DomainException("language_required", "At least one teaching language is required.");
        if (await db.TeachingLanguages.CountAsync(x => ids.Contains(x.Id) && x.IsActive, ct) != ids.Length)
            throw new DomainException("language_not_found", "Every teaching language must be active.");
        if (!await db.TeacherProfiles.AnyAsync(x => x.TeacherId == teacherId, ct))
            db.TeacherProfiles.Add(new TeacherProfile(teacherId, clock.GetUtcNow()));
        db.TeacherLanguages.RemoveRange(db.TeacherLanguages.Where(x => x.TeacherId == teacherId));
        db.TeacherLanguages.AddRange(ids.Select(id => new TeacherLanguage(teacherId, id)));
        await db.SaveChangesAsync(ct);
    }

    private async Task ReplaceEducationLevelsAsync(string teacherId, Guid[] ids, CancellationToken ct)
    {
        await RequireTeacherAsync(teacherId, ct);
        if (await db.EducationLevels.CountAsync(x => ids.Contains(x.Id) && x.IsActive, ct) != ids.Length)
            throw new DomainException("education_level_not_found", "Every education level must be active.");
        db.TeacherEducationLevels.RemoveRange(db.TeacherEducationLevels.Where(x => x.TeacherId == teacherId));
        db.TeacherEducationLevels.AddRange(ids.Select(id => new TeacherEducationLevel(teacherId, id)));
        await db.SaveChangesAsync(ct);
    }

    private async Task<TeacherProfileDto> BuildProfileAsync(TeacherProfile profile, bool publicOnly, CancellationToken ct)
    {
        var teacherId = profile.TeacherId;
        var subjects = await db.TeacherSubjectQualifications.AsNoTracking().Where(x => x.TeacherId == teacherId
                && x.Status == TeacherQualificationStatus.Approved && x.RevokedAt == null)
            .Join(db.Subjects, x => x.SubjectId, x => x.Id, (_, x) => new NamedItemDto(x.Id, x.Name)).ToArrayAsync(ct);
        var topics = await db.TeacherTopics.AsNoTracking().Where(x => x.TeacherId == teacherId)
            .Join(db.Topics, x => x.TopicId, x => x.Id, (_, x) => new NamedItemDto(x.Id, x.Name)).ToArrayAsync(ct);
        var languages = await db.TeacherLanguages.AsNoTracking().Where(x => x.TeacherId == teacherId)
            .Join(db.TeachingLanguages, x => x.LanguageId, x => x.Id, (_, x) => new NamedItemDto(x.Id, x.Name)).ToArrayAsync(ct);
        var levels = await db.TeacherEducationLevels.AsNoTracking().Where(x => x.TeacherId == teacherId)
            .Join(db.EducationLevels, x => x.EducationLevelId, x => x.Id, (_, x) => new NamedItemDto(x.Id, x.Name)).ToArrayAsync(ct);
        var hasActiveQualification = subjects.Length > 0;
        var hasAvailability = await db.TeacherAvailabilityRules.AsNoTracking().AnyAsync(x => x.TeacherId == teacherId, ct);
        var servicesQuery =
            from ts in db.TeacherServices.AsNoTracking()
            join type in db.ServiceCatalogItems.AsNoTracking()
                on ts.ServiceCatalogItemId equals type.Id
            where ts.TeacherId == teacherId
            select new { ts, type };
        var samplesQuery = db.TeacherTeachingSamples.AsNoTracking().Where(x => x.TeacherId == teacherId);
        if (publicOnly)
        {
            servicesQuery = servicesQuery.Where(x => x.ts.IsActive
                && db.TeacherSubjectQualifications.Any(q => q.TeacherId == teacherId
                    && q.SubjectId == x.ts.SubjectId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
                && db.Subjects.Any(subject => subject.Id == x.ts.SubjectId && subject.IsActive)
                && x.type.IsActive
                && x.type.IsPublic
                && x.type.TeacherSelectable);
            samplesQuery = samplesQuery.Where(x => x.PublishedAt != null
                && db.TeacherSubjectQualifications.Any(q => q.TeacherId == teacherId
                    && q.SubjectId == x.SubjectId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null));
        }
        var services = (await servicesQuery.ToArrayAsync(ct))
            .OrderBy(x => x.type.DisplayOrder).ThenBy(x => x.ts.CreatedAt)
            .Select(x => Map(x.ts, x.type, profile.IsPublished, hasActiveQualification, hasAvailability))
            .ToArray();
        var samples = (await samplesQuery.ToArrayAsync(ct)).Select(Map).ToArray();
        var rules = (await db.TeacherAvailabilityRules.AsNoTracking().Where(x => x.TeacherId == teacherId).ToArrayAsync(ct)).Select(Map).ToArray();
        var exceptions = (await db.TeacherAvailabilityExceptions.AsNoTracking().Where(x => x.TeacherId == teacherId).ToArrayAsync(ct)).Select(Map).ToArray();
        var certifications = (await db.TeacherCertifications.AsNoTracking().Where(x => x.TeacherId == teacherId).ToArrayAsync(ct)).Select(Map).ToArray();
        var experience = (await db.TeacherExperiences.AsNoTracking().Where(x => x.TeacherId == teacherId).ToArrayAsync(ct)).Select(Map).ToArray();
        var user = await db.Users.AsNoTracking().SingleAsync(x => x.Id == teacherId, ct);
        var profileComplete = !string.IsNullOrWhiteSpace(profile.Headline)
            && !string.IsNullOrWhiteSpace(profile.Bio)
            && !string.IsNullOrWhiteSpace(profile.Country)
            && !string.IsNullOrWhiteSpace(profile.City);
        var hasEligibleService = services.Any(x => x.IsActive && x.IsCatalogActive
            && x.IsPublic && x.TeacherSelectable
            && (!x.RequiresScheduling || hasAvailability));
        var blockers = new List<string>();
        if (!user.EmailConfirmed) blockers.Add("email_unconfirmed");
        if (user.IsSuspended) blockers.Add("account_suspended");
        if (!hasActiveQualification) blockers.Add("qualification_required");
        if (!profileComplete) blockers.Add("profile_incomplete");
        if (!hasEligibleService) blockers.Add("eligible_active_service_required");
        var eligible = blockers.Count == 0;
        return new(
            teacherId, await TeacherNameAsync(teacherId, ct), profile.Headline, profile.Bio, profile.Country,
            profile.City, profile.TimeZoneId, subjects.Length > 0,
            profile.RatingCount > 0 ? profile.AverageRating : null, profile.RatingCount,
            null, publicOnly ? null : profile.ResponseTimeMinutes, subjects, topics, languages, levels,
            services, samples, rules, exceptions, certifications, experience,
            new LiveSessionBookingPolicyDto(
                _liveSessionOptions.EmergencyPremiumPercent,
                _liveSessionOptions.CancellationWindowHours),
            profileComplete, eligible, blockers, profile.IsPublished && eligible,
            subjects.Select(x => x.Id).ToArray(), user.FullNameEnglish, user.HasAvatar);
    }

    private static TeacherProfileDto EmptyProfile(string teacherId, string name) =>
        new(teacherId, name, "", "", "", "", "UTC", false, null, 0, null, null,
            [], [], [], [], [], [], [], [], [], [], null);

    private async Task<TeacherProfile> OwnedProfileAsync(string teacherId, CancellationToken ct) =>
        await db.TeacherProfiles.SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct)
        ?? throw new DomainException("profile_not_found", "Teacher profile was not found.");

    private async Task<TeacherService> OwnedServiceAsync(string teacherId, Guid id, string version, CancellationToken ct)
    {
        var service = await db.TeacherServices.SingleOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId, ct)
            ?? throw new DomainException("service_not_owned", "Teacher service was not found.");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(version.Trim('"')); }
        catch { throw new DomainException("invalid_concurrency_token", "The service version is invalid."); }
        db.Entry(service).Property(x => x.RowVersion).OriginalValue = bytes;
        return service;
    }

    private async Task RequireActiveQualificationAsync(string teacherId, Guid subjectId, CancellationToken ct)
    {
        if (!await db.TeacherSubjectQualifications.AnyAsync(x => x.TeacherId == teacherId && x.SubjectId == subjectId
                && x.Status == TeacherQualificationStatus.Approved && x.RevokedAt == null, ct)
            || !await db.Subjects.AnyAsync(x => x.Id == subjectId && x.IsActive, ct))
            throw new DomainException("teacher_not_approved", "An active approved subject qualification is required.");
    }

    private async Task RequireTeacherAsync(string teacherId, CancellationToken ct)
    {
        if (!await db.Users.AnyAsync(x => x.Id == teacherId, ct))
            throw new DomainException("teacher_not_found", "Teacher was not found.");
    }

    private async Task<string> TeacherNameAsync(string teacherId, CancellationToken ct) =>
        await db.Users.AsNoTracking().Where(x => x.Id == teacherId).Select(x => x.FullName).SingleAsync(ct);

    private static TeacherServiceDto Map(
        TeacherService x,
        Domain.Catalog.ServiceCatalogItem type,
        bool profilePublished,
        bool hasActiveQualification,
        bool hasAvailability)
    {
        var canRequest = x.IsActive && type.IsActive && type.IsPublic && type.TeacherSelectable && !type.RequiresScheduling;
        var canBook = x.IsActive
            && type.IsActive
            && type.IsPublic
            && type.TeacherSelectable
            && type.RequiresScheduling
            && string.Equals(type.Code, "live_session", StringComparison.Ordinal)
            && profilePublished
            && hasActiveQualification
            && hasAvailability;
        return new(
            x.Id,
            x.SubjectId,
            x.ServiceCatalogItemId,
            type.Code,
            type.Type,
            x.Title,
            x.Description,
            x.Price,
            x.Currency,
            x.DeliveryHours,
            x.Revisions,
            x.IsActive,
            type.IsActive,
            type.IsPublic,
            type.TeacherSelectable,
            type.RequiresScheduling,
            type.AllowedDurations,
            type.MinPrice,
            type.MaxPrice,
            type.DisplayOrder,
            canRequest,
            canBook,
            Convert.ToBase64String(x.RowVersion));
    }
    private static TeachingSampleDto Map(TeacherTeachingSample x) =>
        new(x.Id, x.SubjectId, x.TopicId, x.Title, x.DurationSeconds, x.PublishedAt);
    private static AvailabilityRuleDto Map(TeacherAvailabilityRule x) =>
        new(x.Id, x.DayOfWeek, x.Start, x.End, x.TimeZoneId, x.SlotMinutes);
    private static AvailabilityExceptionDto Map(TeacherAvailabilityException x) =>
        new(x.Id, x.StartsAt, x.EndsAt, x.Reason);
    private static CredentialDto Map(TeacherCredential x) =>
        new(x.Id, x.Title, x.Organization, x.From, x.To);

}
