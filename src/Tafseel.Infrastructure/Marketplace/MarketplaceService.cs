using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Tafseel.Application.Common;
using Tafseel.Application.Catalog;
using Tafseel.Application.LiveSessions;
using Tafseel.Application.Marketplace;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Common;
using Tafseel.Domain.LiveSessions;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Governance;

namespace Tafseel.Infrastructure.Marketplace;

internal sealed class MarketplaceService(
    TafseelDbContext db,
    IFileStorageService files,
    IOptions<LiveSessionOptions> liveSessionOptions,
    IOptions<TeacherShowcaseOptions> showcaseOptions,
    NotificationWriter notifications,
    AuditWriter audit,
    IHostEnvironment environment,
    TimeProvider clock) : IMarketplaceService
{
    private readonly LiveSessionOptions _liveSessionOptions = liveSessionOptions.Value;
    private readonly TeacherShowcaseOptions _showcaseOptions = showcaseOptions.Value;
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
        if (input.AvailableThisWeek)
            throw new DomainException(
                "availability_filter_unavailable",
                "Use the bounded availability summary instead of a schedule-presence filter.");
        if (input.MinimumRating is < 0 or > 5 || input.MaximumPrice is <= 0)
            throw new DomainException("invalid_filter", "A marketplace filter is outside its allowed range.");

        var query = TeacherPublicQueries.BrowsableTeachers(db);

        if (!string.IsNullOrWhiteSpace(input.Search))
        {
            var term = input.Search.Trim();
            query = query.Where(x =>
                x.User.FullName.Contains(term) || x.Profile.Headline.Contains(term) || x.Profile.Bio.Contains(term));
        }
        if (input.SubjectId.HasValue)
            query = query.Where(x => db.TeacherSubjectQualifications.Any(q =>
                q.TeacherId == x.Profile.TeacherId && q.SubjectId == input.SubjectId
                && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null
                && db.Subjects.Any(s => s.Id == q.SubjectId && s.IsActive)));
        if (input.TopicId.HasValue)
            query = query.Where(x => db.TeacherTopics.Any(t =>
                t.TeacherId == x.Profile.TeacherId && t.TopicId == input.TopicId
                && db.Topics.Any(topic => topic.Id == t.TopicId && topic.IsActive
                    && db.Subjects.Any(subject => subject.Id == topic.SubjectId && subject.IsActive)
                    && db.TeacherSubjectQualifications.Any(q =>
                        q.TeacherId == x.Profile.TeacherId && q.SubjectId == topic.SubjectId
                        && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null))));
        if (input.EducationLevelId.HasValue)
            query = query.Where(x => db.TeacherEducationLevels.Any(level =>
                level.TeacherId == x.Profile.TeacherId && level.EducationLevelId == input.EducationLevelId
                && db.EducationLevels.Any(item => item.Id == level.EducationLevelId && item.IsActive)));
        if (input.ServiceTypeId.HasValue)
            query = query.Where(x => db.TeacherServices.Any(service =>
                service.TeacherId == x.Profile.TeacherId && service.IsActive && service.SupersededByTeacherServiceId == null
                && service.ServiceCatalogItemId == input.ServiceTypeId
                && db.ServiceCatalogItems.Any(type => type.Id == service.ServiceCatalogItemId && type.IsActive)
                && db.Subjects.Any(subject => subject.Id == service.SubjectId && subject.IsActive)));
        if (input.MinimumRating is > 0)
            query = query.Where(x => x.Profile.RatingCount > 0
                && x.Profile.AverageRating >= input.MinimumRating);
        if (input.MaximumPrice.HasValue)
            query = query.Where(x => db.TeacherServices.Any(service =>
                service.TeacherId == x.Profile.TeacherId && service.IsActive && service.SupersededByTeacherServiceId == null
                && service.Price <= input.MaximumPrice
                && db.ServiceCatalogItems.Any(type => type.Id == service.ServiceCatalogItemId && type.IsActive)
                && db.Subjects.Any(subject => subject.Id == service.SubjectId && subject.IsActive)));
        if (input.LanguageIds is { Length: > 0 })
            query = query.Where(x => input.LanguageIds.All(languageId =>
                db.TeacherLanguages.Any(language =>
                    language.TeacherId == x.Profile.TeacherId && language.LanguageId == languageId
                    && db.TeachingLanguages.Any(item => item.Id == language.LanguageId && item.IsActive))));
        if (input.VerifiedOnly)
            query = query.Where(x => db.TeacherSubjectQualifications.Any(q =>
                q.TeacherId == x.Profile.TeacherId
                && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null));
        query = sort switch
        {
            "highest-rated" => query.OrderByDescending(x => x.Profile.RatingCount > 0)
                .ThenByDescending(x => x.Profile.AverageRating)
                .ThenBy(x => x.User.FullName)
                .ThenBy(x => x.Profile.TeacherId),
            "lowest-price" => query.OrderBy(x => db.TeacherServices
                .Where(s => s.TeacherId == x.Profile.TeacherId && s.IsActive && s.SupersededByTeacherServiceId == null
                    && db.Subjects.Any(subject => subject.Id == s.SubjectId && subject.IsActive)
                    && db.ServiceCatalogItems.Any(type => type.Id == s.ServiceCatalogItemId && type.IsActive))
                .Min(s => (decimal?)s.Price) ?? decimal.MaxValue)
                .ThenBy(x => x.User.FullName)
                .ThenBy(x => x.Profile.TeacherId),
            "highest-price" => query.OrderByDescending(x => db.TeacherServices
                .Where(s => s.TeacherId == x.Profile.TeacherId && s.IsActive && s.SupersededByTeacherServiceId == null
                    && db.Subjects.Any(subject => subject.Id == s.SubjectId && subject.IsActive)
                    && db.ServiceCatalogItems.Any(type => type.Id == s.ServiceCatalogItemId && type.IsActive))
                .Min(s => (decimal?)s.Price) ?? 0)
                .ThenBy(x => x.User.FullName)
                .ThenBy(x => x.Profile.TeacherId),
            _ => query.OrderBy(x => x.User.FullName)
                .ThenBy(x => x.Profile.TeacherId)
        };

        var count = await query.CountAsync(ct);
        var pageRows = await query.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new
            {
                x.Profile.TeacherId,
                x.User.FullName,
                x.Profile.Headline,
                x.Profile.Country,
                Verified = db.TeacherSubjectQualifications.Any(q => q.TeacherId == x.Profile.TeacherId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null
                    && db.Subjects.Any(s => s.Id == q.SubjectId && s.IsActive)),
                Rating = x.Profile.RatingCount > 0 ? (decimal?)x.Profile.AverageRating : null,
                x.Profile.RatingCount,
                StartingPrice = db.TeacherServices.Where(s => s.TeacherId == x.Profile.TeacherId && s.IsActive
                        && s.SupersededByTeacherServiceId == null
                        && db.Subjects.Any(subject => subject.Id == s.SubjectId && subject.IsActive)
                        && db.ServiceCatalogItems.Any(type => type.Id == s.ServiceCatalogItemId && type.IsActive))
                    .Min(s => (decimal?)s.Price),
                Currency = db.TeacherServices.Where(s => s.TeacherId == x.Profile.TeacherId && s.IsActive
                        && s.SupersededByTeacherServiceId == null
                        && db.Subjects.Any(subject => subject.Id == s.SubjectId && subject.IsActive)
                        && db.ServiceCatalogItems.Any(type => type.Id == s.ServiceCatalogItemId && type.IsActive))
                    .OrderBy(s => s.Price).Select(s => s.Currency).FirstOrDefault(),
                Subjects = db.TeacherSubjectQualifications.Where(q => q.TeacherId == x.Profile.TeacherId
                        && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null
                        && db.Subjects.Any(s => s.Id == q.SubjectId && s.IsActive))
                    .Join(db.Subjects, q => q.SubjectId, s => s.Id, (_, s) => s.Name).ToArray(),
                Languages = db.TeacherLanguages.Where(language => language.TeacherId == x.Profile.TeacherId)
                    .Join(db.TeachingLanguages.Where(item => item.IsActive),
                        language => language.LanguageId, item => item.Id, (_, item) => item.Name)
                    .ToArray(),
                x.User.FullNameEnglish,
                HasAvatar = !string.IsNullOrEmpty(x.User.AvatarStorageKey)
            })
            .ToArrayAsync(ct);
        var rows = pageRows.Select(x => new TeacherCardDto(
            x.TeacherId, x.FullName, x.Headline, x.Country, x.Verified,
            x.Rating, x.RatingCount, null, null, x.StartingPrice, x.Currency,
            x.Subjects, x.Languages, x.FullNameEnglish, x.HasAvatar,
            TrustBadges(x.Verified))).ToArray();
        return new(rows, page, pageSize, count);
    }

    public async Task<TeacherComparisonResultDto> CompareAsync(string[] ids, CancellationToken ct)
    {
        if (ids is null || ids.Length < 2)
            throw new DomainException(
                "comparison_requires_two_teachers", "Select at least two Teachers to compare.");
        if (ids.Length > 3)
            throw new DomainException(
                "comparison_limit_exceeded", "No more than three Teachers can be compared.");

        var requestedIds = new string[ids.Length];
        for (var index = 0; index < ids.Length; index++)
        {
            if (!Guid.TryParse(ids[index], out var parsed))
                throw new DomainException(
                    "comparison_invalid_teacher_id", "A comparison Teacher identifier is invalid.");
            requestedIds[index] = parsed.ToString();
        }
        if (requestedIds.Distinct(StringComparer.OrdinalIgnoreCase).Count() != requestedIds.Length)
            throw new DomainException(
                "comparison_duplicate_teacher", "Each compared Teacher must be unique.");

        var profiles = await TeacherPublicQueries.BrowsableTeachers(db)
            .Where(x => requestedIds.Contains(x.Profile.TeacherId))
            .Select(x => new
            {
                x.Profile.TeacherId,
                x.User.FullName,
                x.User.FullNameEnglish,
                HasAvatar = x.User.AvatarStorageKey != null && x.User.AvatarStorageKey != "",
                x.Profile.Headline,
                x.Profile.Bio,
                Rating = x.Profile.RatingCount > 0 ? (decimal?)x.Profile.AverageRating : null,
                x.Profile.RatingCount
            }).ToArrayAsync(ct);

        var availableIds = profiles.Select(x => x.TeacherId).ToArray();
        if (availableIds.Length == 0)
            return new(ids.Length, ids.Length, []);

        var subjects = await (
            from qualification in db.TeacherSubjectQualifications.AsNoTracking()
            join subject in db.Subjects.AsNoTracking() on qualification.SubjectId equals subject.Id
            where availableIds.Contains(qualification.TeacherId)
                && qualification.Status == TeacherQualificationStatus.Approved
                && qualification.RevokedAt == null && subject.IsActive
            orderby qualification.TeacherId, subject.Name, subject.Id
            select new
            {
                qualification.TeacherId,
                Item = new ComparisonNamedItemDto(subject.Id, subject.Name, subject.NameAr)
            }).ToArrayAsync(ct);
        var topics = await (
            from teacherTopic in db.TeacherTopics.AsNoTracking()
            join topic in db.Topics.AsNoTracking() on teacherTopic.TopicId equals topic.Id
            where availableIds.Contains(teacherTopic.TeacherId) && topic.IsActive
                && db.Subjects.Any(subject => subject.Id == topic.SubjectId && subject.IsActive)
                && db.TeacherSubjectQualifications.Any(q =>
                    q.TeacherId == teacherTopic.TeacherId && q.SubjectId == topic.SubjectId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
            orderby teacherTopic.TeacherId, topic.Name, topic.Id
            select new
            {
                teacherTopic.TeacherId,
                Item = new ComparisonNamedItemDto(topic.Id, topic.Name, topic.NameAr)
            }).ToArrayAsync(ct);
        var languages = await (
            from teacherLanguage in db.TeacherLanguages.AsNoTracking()
            join language in db.TeachingLanguages.AsNoTracking()
                on teacherLanguage.LanguageId equals language.Id
            where availableIds.Contains(teacherLanguage.TeacherId) && language.IsActive
            orderby teacherLanguage.TeacherId, language.Name, language.Id
            select new
            {
                teacherLanguage.TeacherId,
                Item = new ComparisonNamedItemDto(language.Id, language.Name, language.NameAr)
            }).ToArrayAsync(ct);
        var educationLevels = await (
            from teacherLevel in db.TeacherEducationLevels.AsNoTracking()
            join level in db.EducationLevels.AsNoTracking()
                on teacherLevel.EducationLevelId equals level.Id
            where availableIds.Contains(teacherLevel.TeacherId) && level.IsActive
            orderby teacherLevel.TeacherId, level.Name, level.Id
            select new
            {
                teacherLevel.TeacherId,
                Item = new ComparisonNamedItemDto(level.Id, level.Name, level.NameAr)
            }).ToArrayAsync(ct);
        var services = await (
            from service in db.TeacherServices.AsNoTracking()
            join type in db.ServiceCatalogItems.AsNoTracking()
                on service.ServiceCatalogItemId equals type.Id
            where availableIds.Contains(service.TeacherId) && service.IsActive
                && service.SupersededByTeacherServiceId == null
                && type.IsActive && type.IsPublic && type.TeacherSelectable
                && db.Subjects.Any(subject => subject.Id == service.SubjectId && subject.IsActive)
                && db.TeacherSubjectQualifications.Any(q => q.TeacherId == service.TeacherId
                    && q.SubjectId == service.SubjectId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
            orderby type.DisplayOrder, service.CreatedAt, service.Id
            select new
            {
                service.TeacherId,
                Item = new TeacherComparisonServiceDto(
                    service.Title, type.Name, type.NameAr, service.Price, service.Currency,
                    type.RequiresScheduling)
            }).ToArrayAsync(ct);
        var experience = await db.TeacherExperiences.AsNoTracking()
            .Where(x => availableIds.Contains(x.TeacherId))
            .OrderByDescending(x => x.From).ThenBy(x => x.Title).ThenBy(x => x.Id)
            .Select(x => new
            {
                x.TeacherId,
                Item = new TeacherComparisonExperienceDto(
                    x.Title, x.Organization, x.From, x.To)
            }).ToArrayAsync(ct);
        var sampleCounts = await CountPublicPlayableSamplesAsync(availableIds, ct);

        static IReadOnlyCollection<TItem> Items<TItem>(
            string teacherId, IEnumerable<(string TeacherId, TItem Item)> source) =>
            source.Where(x => x.TeacherId == teacherId).Select(x => x.Item).ToArray();

        var subjectRows = subjects.Select(x => (x.TeacherId, x.Item)).ToArray();
        var topicRows = topics.Select(x => (x.TeacherId, x.Item)).ToArray();
        var languageRows = languages.Select(x => (x.TeacherId, x.Item)).ToArray();
        var levelRows = educationLevels.Select(x => (x.TeacherId, x.Item)).ToArray();
        var serviceRows = services.Select(x => (x.TeacherId, x.Item)).ToArray();
        var experienceRows = experience.Select(x => (x.TeacherId, x.Item)).ToArray();
        var profileRows = profiles.ToDictionary(x => x.TeacherId, StringComparer.OrdinalIgnoreCase);

        var compared = requestedIds.Where(profileRows.ContainsKey).Select(teacherId =>
        {
            var profile = profileRows[teacherId];
            var teacherSubjects = Items(teacherId, subjectRows);
            var verified = teacherSubjects.Count > 0;
            var teacherServices = Items(teacherId, serviceRows);
            var startingService = teacherServices
                .OrderBy(x => x.Price).ThenBy(x => x.Currency, StringComparer.Ordinal).FirstOrDefault();
            return new TeacherComparisonDto(
                profile.TeacherId, profile.FullName, profile.FullNameEnglish, profile.HasAvatar,
                profile.Headline, profile.Bio, verified, profile.Rating, profile.RatingCount,
                teacherSubjects, Items(teacherId, topicRows),
                Items(teacherId, languageRows), Items(teacherId, levelRows), teacherServices,
                startingService?.Price, startingService?.Currency,
                Items(teacherId, experienceRows), sampleCounts.GetValueOrDefault(teacherId),
                TrustBadges(verified));
        }).ToArray();

        return new(ids.Length, ids.Length - compared.Length, compared);
    }

    public async Task<TeacherProfileDto> GetPublicProfileAsync(string teacherId, CancellationToken ct)
    {
        if (!await TeacherPublicQueries.IsBrowsableAsync(db, teacherId, ct))
            throw new DomainException("teacher_not_found", "Teacher was not found.");
        var profile = await db.TeacherProfiles.AsNoTracking()
            .SingleAsync(x => x.TeacherId == teacherId, ct);
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
                (teacherLanguage, teachingLanguage) => new { teachingLanguage.Id, teachingLanguage.Name, teachingLanguage.NameAr })
            .OrderBy(x => x.Name)
            .Select(x => new NamedItemDto(x.Id, x.Name, x.NameAr))
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
            var user = await db.Users.AsNoTracking().SingleAsync(x => x.Id == teacherId, ct);
            if (!user.EmailConfirmed)
                throw new DomainException("email_unconfirmed", "Confirm your email before publishing.");
            if (user.IsSuspended)
                throw new DomainException("account_suspended", "Suspended accounts cannot publish.");
            if (string.IsNullOrWhiteSpace(profile.Country) || string.IsNullOrWhiteSpace(profile.City))
                throw new DomainException("profile_incomplete", "Complete your profile country and city before publishing.");
            if (!await db.TeacherSubjectQualifications.AnyAsync(x => x.TeacherId == teacherId
                    && x.Status == TeacherQualificationStatus.Approved && x.RevokedAt == null, ct))
                throw new DomainException("teacher_not_approved", "An approved subject qualification is required.");
            var hasAvailability = await db.TeacherAvailabilityRules.AnyAsync(
                x => x.TeacherId == teacherId, ct);
            if (!await (
                    from service in db.TeacherServices
                    join type in db.ServiceCatalogItems on service.ServiceCatalogItemId equals type.Id
                    where service.TeacherId == teacherId && service.IsActive
                        && service.SupersededByTeacherServiceId == null
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

    public async Task<IReadOnlyCollection<NamedItemDto>> GetEligibleSubjectsAsync(
        string teacherId, CancellationToken ct)
    {
        await RequireTeacherAsync(teacherId, ct);
        var rows = await (
            from q in db.TeacherSubjectQualifications.AsNoTracking()
            join s in db.Subjects.AsNoTracking() on q.SubjectId equals s.Id
            where q.TeacherId == teacherId
                && q.Status == TeacherQualificationStatus.Approved
                && q.RevokedAt == null
                && s.IsActive
            select new { s.Id, s.Name, s.NameAr }).ToArrayAsync(ct);
        return rows
            .OrderBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .Select(x => new NamedItemDto(x.Id, x.Name, x.NameAr))
            .ToArray();
    }

    public Task SetTopicsAsync(string teacherId, IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        ReplaceTopicsAsync(teacherId, ids.Distinct().ToArray(), ct);

    public Task SetLanguagesAsync(string teacherId, IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        ReplaceLanguagesAsync(teacherId, ids.Distinct().ToArray(), ct);

    public Task SetEducationLevelsAsync(string teacherId, IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        ReplaceEducationLevelsAsync(teacherId, ids.Distinct().ToArray(), ct);

    public async Task<IReadOnlyCollection<TeacherMarketplaceServiceDto>> GetMarketplaceServicesAsync(
        string teacherId, CancellationToken ct)
    {
        await RequireTeacherAsync(teacherId, ct);
        var suspended = await db.Users.AsNoTracking().Where(x => x.Id == teacherId)
            .Select(x => x.IsSuspended).SingleAsync(ct);
        var profilePublished = await db.TeacherProfiles.AsNoTracking()
            .Where(x => x.TeacherId == teacherId).Select(x => x.IsPublished).SingleOrDefaultAsync(ct);
        var hasAvailability = await db.TeacherAvailabilityRules.AsNoTracking()
            .AnyAsync(x => x.TeacherId == teacherId, ct);
        var qualificationRows = await (
            from qualification in db.TeacherSubjectQualifications.AsNoTracking()
            join subject in db.Subjects.AsNoTracking() on qualification.SubjectId equals subject.Id
            where qualification.TeacherId == teacherId
            orderby subject.Name, subject.Id
            select new
            {
                subject.Id,
                subject.Name,
                subject.NameAr,
                SubjectActive = subject.IsActive,
                QualificationActive = qualification.Status == TeacherQualificationStatus.Approved
                    && qualification.RevokedAt == null
            }).ToArrayAsync(ct);
        var subjects = qualificationRows.Select(x => new TeacherMarketplaceSubjectDto(
            x.Id, x.Name, x.NameAr, x.SubjectActive, x.QualificationActive)).ToArray();
        var eligibleSubjectIds = qualificationRows
            .Where(x => x.SubjectActive && x.QualificationActive).Select(x => x.Id).ToHashSet();
        var catalog = await db.ServiceCatalogItems.AsNoTracking()
            .OrderBy(x => x.DisplayOrder).ThenBy(x => x.Name).ThenBy(x => x.Id).ToArrayAsync(ct);
        var offeringRows = await db.TeacherServices.AsNoTracking()
            .Where(x => x.TeacherId == teacherId).ToArrayAsync(ct);

        return catalog.Select(item =>
        {
            var policyComplete = IsPolicyComplete(item);
            var canEnable = !suspended && item.IsActive && item.IsPublic && item.TeacherSelectable
                && policyComplete && eligibleSubjectIds.Count > 0;
            var state = suspended ? "account_suspended"
                : !item.IsActive ? "catalog_inactive"
                : !item.IsPublic ? "catalog_hidden"
                : !item.TeacherSelectable ? "catalog_unavailable"
                : !policyComplete ? "policy_incomplete"
                : eligibleSubjectIds.Count == 0 ? "qualification_required"
                : "available";
            var offerings = offeringRows.Where(x => x.ServiceCatalogItemId == item.Id)
                .OrderBy(x => x.CreatedAt).ThenBy(x => x.Id)
                .Select(x => Map(x, item, profilePublished, eligibleSubjectIds.Contains(x.SubjectId), hasAvailability))
                .ToArray();
            return new TeacherMarketplaceServiceDto(
                item.Id, item.Code, item.Name, item.NameAr, item.Description, item.DescriptionAr,
                item.CategoryCode, item.IconCode, item.OrderType, item.QualificationPolicy,
                item.CurrencyCode, item.MinPrice ?? 0, item.DefaultPrice, item.RecommendedPrice,
                item.MaxPrice ?? 0, item.MinimumDeliveryHours, item.DefaultDeliveryHours,
                item.RecommendedDeliveryHours, item.MaximumDeliveryHours, item.DefaultRevisions,
                item.MaximumRevisions, item.AllowedDurations, item.DisplayOrder, item.IsActive,
                item.IsPublic, item.TeacherSelectable, policyComplete, canEnable, state, subjects, offerings);
        }).ToArray();
    }

    public async Task<TeacherServiceDto> AddServiceAsync(string teacherId, TeacherServiceInput input, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockTeacherServiceAsync(teacherId, input.SubjectId, input.ServiceCatalogItemId, ct);
        await RequireActiveQualificationAsync(teacherId, input.SubjectId, ct);
        var catalog = await db.ServiceCatalogItems.SingleOrDefaultAsync(x =>
            x.Id == input.ServiceCatalogItemId && x.IsActive && x.IsPublic && x.TeacherSelectable, ct);
        if (catalog is null)
            throw new DomainException("service_type_not_found", "An active public teacher-selectable service type is required.");
        EnsureLegacyCatalogIdentity(input.Title, catalog);
        var approachEn = input.ApproachEn ?? input.Description ?? "";
        var approachAr = input.ApproachAr ?? "";
        ServiceCatalogPolicyValidator.EnsureOfferingTerms(
            catalog, input.Price, input.Currency, input.DeliveryHours, input.Revisions);
        var existing = await db.TeacherServices.SingleOrDefaultAsync(x =>
            x.TeacherId == teacherId && x.SubjectId == input.SubjectId
            && x.ServiceCatalogItemId == input.ServiceCatalogItemId
            && x.SupersededByTeacherServiceId == null, ct);
        if (existing is not null)
        {
            existing.Configure(input.Price, input.Currency, input.DeliveryHours, input.Revisions,
                approachEn, approachAr, clock.GetUtcNow());
            existing.SetActive(input.IsAvailable ?? true, clock.GetUtcNow());
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Map(existing, catalog, profilePublished: false, hasActiveQualification: true, hasAvailability: false);
        }
        var service = new TeacherService(
            teacherId, input.SubjectId, input.ServiceCatalogItemId, catalog.Name,
            string.IsNullOrWhiteSpace(approachEn) ? catalog.Description : approachEn,
            input.Price, input.Currency, input.DeliveryHours, input.Revisions, clock.GetUtcNow());
        service.Configure(input.Price, input.Currency, input.DeliveryHours, input.Revisions,
            approachEn, approachAr, clock.GetUtcNow());
        service.SetActive(input.IsAvailable ?? true, clock.GetUtcNow());
        db.Add(service);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Map(service, catalog, profilePublished: false, hasActiveQualification: true, hasAvailability: false);
    }

    public async Task UpdateServiceAsync(string teacherId, Guid id, TeacherServiceInput input, string version, CancellationToken ct)
    {
        var service = await OwnedServiceAsync(teacherId, id, version, ct);
        if (service.SubjectId != input.SubjectId || service.ServiceCatalogItemId != input.ServiceCatalogItemId)
            throw new DomainException("service_scope_immutable", "Service subject and type cannot be changed.");
        if (service.IsSuperseded)
            throw new DomainException("teacher_service_superseded", "A superseded Teacher service cannot be configured.");
        await RequireActiveQualificationAsync(teacherId, service.SubjectId, ct);
        var catalog = await db.ServiceCatalogItems.AsNoTracking().SingleAsync(
            x => x.Id == service.ServiceCatalogItemId, ct);
        EnsureLegacyCatalogIdentity(input.Title, catalog);
        ServiceCatalogPolicyValidator.EnsureOfferingTerms(
            catalog, input.Price, input.Currency, input.DeliveryHours, input.Revisions);
        service.Configure(input.Price, input.Currency, input.DeliveryHours, input.Revisions,
            input.ApproachEn ?? input.Description ?? service.ApproachEn,
            input.ApproachAr ?? service.ApproachAr, clock.GetUtcNow());
        if (input.IsAvailable.HasValue)
        {
            if (input.IsAvailable.Value)
            {
                if (!catalog.IsActive || !catalog.IsPublic || !catalog.TeacherSelectable)
                    throw new DomainException("service_type_not_found", "An active public teacher-selectable service type is required.");
            }
            service.SetActive(input.IsAvailable.Value, clock.GetUtcNow());
        }
        await db.SaveChangesAsync(ct);
    }

    public async Task SetServiceActiveAsync(string teacherId, Guid id, bool active, string version, CancellationToken ct)
    {
        var service = await OwnedServiceAsync(teacherId, id, version, ct);
        if (active)
        {
            if (service.IsSuperseded)
                throw new DomainException("teacher_service_superseded", "A superseded Teacher service cannot be enabled.");
            await RequireActiveQualificationAsync(teacherId, service.SubjectId, ct);
            var catalog = await db.ServiceCatalogItems.AsNoTracking().SingleOrDefaultAsync(x =>
                x.Id == service.ServiceCatalogItemId && x.IsActive && x.IsPublic && x.TeacherSelectable, ct);
            if (catalog is null)
                throw new DomainException("service_type_not_found", "An active public teacher-selectable service type is required.");
            ServiceCatalogPolicyValidator.EnsureOfferingTerms(
                catalog, service.Price, service.Currency, service.DeliveryHours, service.Revisions);
        }
        service.SetActive(active, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }

    public async Task<TeachingSampleDto> AddSampleAsync(
        string teacherId, Guid subjectId, Guid? topicId, string title, Stream stream, string fileName,
        string contentType, long size, int durationSeconds, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        await RequireActiveQualificationAsync(teacherId, subjectId, ct);
        await RequireValidTopicAsync(subjectId, topicId, ct);
        await RequireShowcaseCapacityAsync(teacherId, subjectId, ct);
        var stored = await files.StorePrivateVideoAsync(stream, fileName, contentType, size, ct);
        var now = clock.GetUtcNow();
        var sample = TeacherTeachingSample.CreateShowcaseDraft(
            teacherId, subjectId, topicId, title, null, now);
        sample.CurrentVersion().ReplaceVideo(
            stored.StorageKey, SafeFileName(fileName), stored.ContentType, stored.Size);
        db.Add(sample);
        audit.AddCurrent("ShowcaseCreated", "TeacherTeachingSample", sample.Id.ToString(), "Teacher Showcase draft created with MP4 media.");
        try { await db.SaveChangesAsync(ct); }
        catch
        {
            await files.DeletePrivateFileAsync(stored.StorageKey, ct);
            throw;
        }
        return Map(sample, sample.CurrentVersion());
    }

    public async Task SetSamplePublishedAsync(string teacherId, Guid id, bool published, CancellationToken ct)
    {
        var sample = await db.TeacherTeachingSamples.SingleOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId, ct)
            ?? throw new DomainException("sample_not_owned", "Teaching sample was not found.");
        if (sample.SourceType == TeachingSampleSourceType.TeacherShowcase)
            throw new DomainException(
                "direct_sample_publication_forbidden",
                "Teacher Showcases require Quality approval and cannot be published directly.");
        if (!published)
            throw new DomainException(
                "qualification_sample_locked",
                "An approved qualification demo remains public while its subject qualification is active.");
        await RequireActiveQualificationAsync(teacherId, sample.SubjectId, ct);
        sample.Publish(clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }

    public async Task<SampleFile> OpenSampleAsync(string? requesterId, Guid id, CancellationToken ct)
    {
        var sample = await db.TeacherTeachingSamples.AsNoTracking()
            .Include(x => x.Versions)
            .SingleOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new DomainException("sample_not_found", "Teaching sample was not found.");
        string? storageKey;
        if (sample.SourceType == TeachingSampleSourceType.QualificationGenerated)
            storageKey = sample.StorageKey;
        else
        {
            if (!ShowcasesEnabled)
                throw new DomainException("sample_not_found", "Teaching sample was not found.");
            var versionId = string.Equals(sample.TeacherId, requesterId, StringComparison.Ordinal)
                ? sample.CurrentVersionId
                : sample.ApprovedVersionId;
            storageKey = sample.Versions.SingleOrDefault(x => x.Id == versionId)?.StorageKey;
        }
        var owner = string.Equals(sample.TeacherId, requesterId, StringComparison.Ordinal);
        if (!owner && !await IsPublicSampleAsync(sample, storageKey, ct))
            throw new DomainException("sample_not_found", "Teaching sample was not found.");
        if (storageKey is null || !await files.PrivateFileExistsAsync(storageKey, ct))
            throw new DomainException("inaccessible_media", "Teaching sample media is unavailable.");
        return new(await files.OpenPrivateVideoAsync(storageKey, ct), "video/mp4");
    }

    public async Task<PagedResult<TeacherShowcaseDto>> GetShowcasesAsync(
        string teacherId, int page, int pageSize, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 20);
        var query = db.TeacherTeachingSamples.AsNoTracking()
            .Include(x => x.Versions)
            .Where(x => x.TeacherId == teacherId
                && x.SourceType == TeachingSampleSourceType.TeacherShowcase);
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.ArchivedAt != null)
            .ThenBy(x => x.DisplayOrder).ThenByDescending(x => x.UpdatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(items.Select(MapShowcase).ToArray(), page, pageSize, total);
    }

    public async Task<TeacherShowcaseDto> GetShowcaseAsync(
        string teacherId, Guid id, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        return MapShowcase(await OwnedShowcaseAsync(teacherId, id, tracking: false, ct));
    }

    public async Task<TeacherShowcaseDto> CreateShowcaseAsync(
        string teacherId, CreateShowcaseInput input, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        await RequireActiveQualificationAsync(teacherId, input.SubjectId, ct);
        await RequireValidTopicAsync(input.SubjectId, input.TopicId, ct);
        await RequireShowcaseCapacityAsync(teacherId, input.SubjectId, ct);
        var sample = TeacherTeachingSample.CreateShowcaseDraft(
            teacherId, input.SubjectId, input.TopicId, input.Title, input.Description, clock.GetUtcNow());
        db.Add(sample);
        audit.AddCurrent("ShowcaseCreated", "TeacherTeachingSample", sample.Id.ToString(), "Teacher Showcase draft created.");
        await db.SaveChangesAsync(ct);
        return MapShowcase(sample);
    }

    public async Task<TeacherShowcaseDto> UpdateShowcaseDraftAsync(
        string teacherId, Guid id, UpdateShowcaseDraftInput input, string version, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        var sample = await OwnedShowcaseAsync(teacherId, id, tracking: true, ct);
        ApplyVersionToSample(sample, version);
        await RequireActiveQualificationAsync(teacherId, input.SubjectId, ct);
        await RequireValidTopicAsync(input.SubjectId, input.TopicId, ct);
        if (sample.SubjectId != input.SubjectId)
            sample.ChangeDraftSubject(input.SubjectId, clock.GetUtcNow());
        sample.UpdateDraft(input.TopicId, input.Title, input.Description, clock.GetUtcNow());
        audit.AddCurrent("ShowcaseDraftUpdated", "TeacherTeachingSample", sample.Id.ToString(), "Teacher Showcase draft metadata updated.");
        await db.SaveChangesAsync(ct);
        return MapShowcase(sample);
    }

    public async Task<TeacherShowcaseDto> UploadShowcaseVideoAsync(
        string teacherId, Guid id, Stream stream, string fileName, string contentType,
        long size, string version, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        var sample = await OwnedShowcaseAsync(teacherId, id, tracking: true, ct);
        ApplyVersionToSample(sample, version);
        if (sample.ModerationStatus != ShowcaseModerationStatus.Draft)
            throw new DomainException("draft_required", "Only a Draft Showcase can accept media.");
        var stored = await files.StorePrivateVideoAsync(stream, fileName, contentType, size, ct);
        sample.CurrentVersion().ReplaceVideo(
            stored.StorageKey, SafeFileName(fileName), stored.ContentType, stored.Size);
        audit.AddCurrent("ShowcaseVersionUploaded", "TeacherTeachingSample", sample.Id.ToString(), "Draft MP4 media uploaded.");
        try { await db.SaveChangesAsync(ct); }
        catch
        {
            await files.DeletePrivateFileAsync(stored.StorageKey, ct);
            throw;
        }
        return MapShowcase(sample);
    }

    public async Task SubmitShowcaseAsync(
        string teacherId, Guid id, string version, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockShowcaseAsync(id, ct);
        var sample = await OwnedShowcaseAsync(teacherId, id, tracking: true, ct);
        ApplyVersionToSample(sample, version);
        await RequireActiveQualificationAsync(teacherId, sample.SubjectId, ct);
        await RequireValidTopicAsync(sample.SubjectId, sample.CurrentVersion().TopicId, ct);
        sample.Submit(teacherId, clock.GetUtcNow());
        await NotifyQualityReviewersAsync(sample, ct);
        audit.AddCurrent("ShowcaseSubmitted", "TeacherTeachingSample", sample.Id.ToString(), $"Showcase version {sample.CurrentVersion().VersionNumber} submitted.");
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public async Task<TeacherShowcaseDto> CreateShowcaseVersionAsync(
        string teacherId, Guid id, string version, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockShowcaseAsync(id, ct);
        var sample = await OwnedShowcaseAsync(teacherId, id, tracking: true, ct);
        ApplyVersionToSample(sample, version);
        if (sample.Versions.Count >= _showcaseOptions.MaxVersionsPerShowcase)
            throw new DomainException("sample_version_limit", "The Showcase version limit has been reached.");
        sample.CreateNextVersion(clock.GetUtcNow());
        audit.AddCurrent("ShowcaseVersionCreated", "TeacherTeachingSample", sample.Id.ToString(), $"Showcase version {sample.CurrentVersion().VersionNumber} created.");
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return MapShowcase(sample);
    }

    public async Task ArchiveShowcaseAsync(
        string teacherId, Guid id, string version, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockShowcaseAsync(id, ct);
        var sample = await OwnedShowcaseAsync(teacherId, id, tracking: true, ct);
        ApplyVersionToSample(sample, version);
        sample.Archive(clock.GetUtcNow());
        audit.AddCurrent("ShowcaseArchived", "TeacherTeachingSample", sample.Id.ToString(), "Teacher archived approved Showcase.");
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public async Task ReorderShowcasesAsync(
        string teacherId, ShowcaseOrderInput input, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        var ids = input.Ids?.Distinct().ToArray() ?? [];
        if (ids.Length is 0 or > 6 || ids.Length != (input.Ids?.Count ?? 0))
            throw new DomainException("invalid_sample_order", "Supply each approved Showcase exactly once.");
        var samples = await db.TeacherTeachingSamples.Where(x =>
            x.TeacherId == teacherId && x.SourceType == TeachingSampleSourceType.TeacherShowcase
            && x.ModerationStatus == ShowcaseModerationStatus.Approved && x.ArchivedAt == null).ToArrayAsync(ct);
        if (samples.Length != ids.Length || samples.Any(x => !ids.Contains(x.Id)))
            throw new DomainException("invalid_sample_order", "Supply each approved Showcase exactly once.");
        var now = clock.GetUtcNow();
        for (var index = 0; index < ids.Length; index++)
            samples.Single(x => x.Id == ids[index]).SetDisplayOrder(index, now);
        audit.AddCurrent("ShowcaseReordered", "TeacherTeachingSample", teacherId, "Approved Teacher Showcases reordered.");
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyCollection<ProfileVideoDto>> GetProfileVideosAsync(
        string teacherId, CancellationToken ct)
    {
        var samples = await db.TeacherTeachingSamples.AsNoTracking()
            .Include(x => x.Versions)
            .Where(x => x.TeacherId == teacherId)
            .OrderByDescending(x => x.IsProfileFeatured)
            .ThenBy(x => x.ProfileDisplayOrder)
            .ThenBy(x => x.CreatedAt)
            .ThenBy(x => x.Id)
            .ToArrayAsync(ct);
        return await MapProfileVideosAsync(samples, ct);
    }

    public async Task<ProfileVideoDto> SetProfileVideoVisibilityAsync(
        string teacherId, Guid id, bool visible, string version, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockTeacherProfileVideosAsync(teacherId, ct);
        var sample = await OwnedCurationSampleAsync(teacherId, id, ct);
        ApplyVersionToSample(sample, version);
        var now = clock.GetUtcNow();
        if (visible)
        {
            await EnsureActiveSubjectQualificationForCurationAsync(teacherId, sample.SubjectId, ct);
            var visibleCount = await db.TeacherTeachingSamples.CountAsync(x =>
                x.TeacherId == teacherId && x.IsProfileVisible && x.Id != id, ct);
            if (visibleCount >= _showcaseOptions.MaxPublicPerTeacher)
                throw new DomainException(
                    "profile_video_limit",
                    $"At most {_showcaseOptions.MaxPublicPerTeacher} videos can be visible on the profile.");
            if (!sample.IsProfileVisible)
            {
                var nextOrder = await db.TeacherTeachingSamples
                    .Where(x => x.TeacherId == teacherId && x.IsProfileVisible)
                    .Select(x => (int?)x.ProfileDisplayOrder).MaxAsync(ct) ?? -1;
                sample.SetProfileDisplayOrder(nextOrder + 1, now);
            }
        }
        sample.SetProfileVisibility(visible, now);
        audit.AddCurrent(
            visible ? "ProfileVideoShown" : "ProfileVideoHidden",
            "TeacherTeachingSample", sample.Id.ToString(),
            visible ? "Teacher showed an approved video on profile." : "Teacher hid an approved video from profile.");
        await db.SaveChangesAsync(ct);
        await NormalizeProfileVideoOrderAsync(teacherId, now, ct);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        var refreshed = await db.TeacherTeachingSamples.AsNoTracking()
            .Include(x => x.Versions)
            .SingleAsync(x => x.Id == id, ct);
        return (await MapProfileVideosAsync([refreshed], ct)).Single();
    }

    public async Task<ProfileVideoDto> SetProfileVideoFeaturedAsync(
        string teacherId, Guid id, bool featured, string version, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockTeacherProfileVideosAsync(teacherId, ct);
        var sample = await OwnedCurationSampleAsync(teacherId, id, ct);
        ApplyVersionToSample(sample, version);
        var now = clock.GetUtcNow();
        if (featured)
        {
            await EnsureActiveSubjectQualificationForCurationAsync(teacherId, sample.SubjectId, ct);
            if (!sample.IsProfileVisible)
            {
                var visibleCount = await db.TeacherTeachingSamples.CountAsync(x =>
                    x.TeacherId == teacherId && x.IsProfileVisible && x.Id != id, ct);
                if (visibleCount >= _showcaseOptions.MaxPublicPerTeacher)
                    throw new DomainException(
                        "profile_video_limit",
                        $"At most {_showcaseOptions.MaxPublicPerTeacher} videos can be visible on the profile.");
                sample.SetProfileVisibility(true, now);
            }
            var others = await db.TeacherTeachingSamples
                .Where(x => x.TeacherId == teacherId && x.IsProfileFeatured && x.Id != id)
                .ToArrayAsync(ct);
            foreach (var other in others)
                other.ClearProfileFeatured(now);
            if (others.Length > 0)
                await db.SaveChangesAsync(ct);
        }
        sample.SetProfileFeatured(featured, now);
        audit.AddCurrent(
            featured ? "ProfileVideoFeatured" : "ProfileVideoUnfeatured",
            "TeacherTeachingSample", sample.Id.ToString(),
            featured ? "Teacher set featured profile video." : "Teacher cleared featured profile video.");
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        var refreshed = await db.TeacherTeachingSamples.AsNoTracking()
            .Include(x => x.Versions)
            .SingleAsync(x => x.Id == id, ct);
        return (await MapProfileVideosAsync([refreshed], ct)).Single();
    }

    public async Task ReorderProfileVideosAsync(
        string teacherId, ProfileVideoOrderInput input, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockTeacherProfileVideosAsync(teacherId, ct);
        var ids = input.Ids?.Distinct().ToArray() ?? [];
        if (ids.Length == 0 || ids.Length != (input.Ids?.Count ?? 0))
            throw new DomainException("invalid_profile_video_order", "Supply each visible profile video exactly once.");
        var visible = await db.TeacherTeachingSamples
            .Where(x => x.TeacherId == teacherId && x.IsProfileVisible).ToArrayAsync(ct);
        if (visible.Length != ids.Length || visible.Any(x => !ids.Contains(x.Id)))
            throw new DomainException("invalid_profile_video_order", "Supply each visible profile video exactly once.");
        if (visible.Any(x => !x.IsCurationEligible()))
            throw new DomainException("profile_video_not_eligible", "Only eligible videos can be ordered.");
        var now = clock.GetUtcNow();
        for (var index = 0; index < ids.Length; index++)
            visible.Single(x => x.Id == ids[index]).SetProfileDisplayOrder(index, now);
        audit.AddCurrent("ProfileVideosReordered", "TeacherTeachingSample", teacherId, "Teacher reordered profile videos.");
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public async Task<PagedResult<ShowcaseQueueItemDto>> GetShowcaseQueueAsync(
        ShowcaseModerationStatus? status, int page, int pageSize, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        if (status is not null and not (ShowcaseModerationStatus.Submitted or ShowcaseModerationStatus.UnderReview))
            throw new DomainException("invalid_sample_status", "The moderation queue supports Submitted and UnderReview.");
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var query =
            from version in db.TeacherTeachingSampleVersions.AsNoTracking()
            join sample in db.TeacherTeachingSamples.AsNoTracking()
                on version.TeacherTeachingSampleId equals sample.Id
            join user in db.Users.AsNoTracking() on sample.TeacherId equals user.Id
            join subject in db.Subjects.AsNoTracking() on sample.SubjectId equals subject.Id
            join topicValue in db.Topics.AsNoTracking() on version.TopicId equals topicValue.Id into topicRows
            from topic in topicRows.DefaultIfEmpty()
            where sample.SourceType == TeachingSampleSourceType.TeacherShowcase
                && sample.CurrentVersionId == version.Id && sample.ArchivedAt == null
                && (status.HasValue
                    ? version.Status == status
                    : version.Status == ShowcaseModerationStatus.Submitted
                        || version.Status == ShowcaseModerationStatus.UnderReview)
            select new { version, sample, user, subject, topic };
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.version.SubmittedAt).ThenBy(x => x.version.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        return new(rows.Select(x => new ShowcaseQueueItemDto(
            x.sample.Id, x.version.Id, x.version.VersionNumber, x.sample.TeacherId, x.user.FullName,
            x.sample.SubjectId, x.subject.Name, x.subject.NameAr, x.version.TopicId,
            x.topic == null ? null : x.topic.Name, x.topic == null ? null : x.topic.NameAr,
            x.version.Title, x.version.Description, x.version.OriginalFileName ?? "showcase.mp4",
            x.version.FileSize, x.version.SubmittedAt!.Value, x.version.Status,
            x.version.AssignedReviewerId, Convert.ToBase64String(x.version.RowVersion))).ToArray(),
            page, pageSize, total);
    }

    public async Task StartShowcaseReviewAsync(
        string reviewerId, Guid id, Guid versionId, string version, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockShowcaseAsync(id, ct);
        var sample = await ReviewableShowcaseAsync(id, versionId, ct);
        ApplyVersion(sample.CurrentVersion(), version);
        sample.StartReview(reviewerId, clock.GetUtcNow());
        audit.AddCurrent("ShowcaseReviewStarted", "TeacherTeachingSample", id.ToString(), $"Showcase version {sample.CurrentVersion().VersionNumber} review started.");
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public async Task DecideShowcaseAsync(
        string reviewerId, Guid id, Guid versionId, ShowcaseDecisionInput input,
        string version, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockShowcaseAsync(id, ct);
        var sample = await ReviewableShowcaseAsync(id, versionId, ct);
        await LockShowcaseSubjectAsync(sample.TeacherId, sample.SubjectId, ct);
        ApplyVersion(sample.CurrentVersion(), version);
        if (input.Decision == ShowcaseDecision.Approve)
        {
            await RequireActiveQualificationAsync(sample.TeacherId, sample.SubjectId, ct);
            await RequireValidTopicAsync(sample.SubjectId, sample.CurrentVersion().TopicId, ct);
            var versionEntity = sample.CurrentVersion();
            if (versionEntity.StorageKey is null
                || !await files.PrivateFileExistsAsync(versionEntity.StorageKey, ct))
                throw new DomainException("inaccessible_media", "Showcase media is unavailable.");
            var teacherPublicCount = await db.TeacherTeachingSamples.CountAsync(x =>
                x.TeacherId == sample.TeacherId && x.Id != sample.Id
                && x.SourceType == TeachingSampleSourceType.TeacherShowcase
                && x.ModerationStatus == ShowcaseModerationStatus.Approved && x.ArchivedAt == null, ct);
            var subjectPublicCount = await db.TeacherTeachingSamples.CountAsync(x =>
                x.TeacherId == sample.TeacherId && x.SubjectId == sample.SubjectId && x.Id != sample.Id
                && x.SourceType == TeachingSampleSourceType.TeacherShowcase
                && x.ModerationStatus == ShowcaseModerationStatus.Approved && x.ArchivedAt == null, ct);
            if (teacherPublicCount >= _showcaseOptions.MaxPublicPerTeacher
                || subjectPublicCount >= _showcaseOptions.MaxPublicPerSubject)
                throw new DomainException("sample_public_limit", "Archive an approved Showcase before approving another.");
        }
        sample.Decide(
            reviewerId, input.Decision, input.ReasonCode,
            input.TeacherVisibleNote, input.InternalNote, clock.GetUtcNow());
        var status = sample.ModerationStatus!.Value;
        await notifications.QueueAsync(
            sample.TeacherId, $"Showcase{status}", $"Teacher Showcase {status}",
            input.TeacherVisibleNote ?? $"Your Teacher Showcase was {status.ToString().ToLowerInvariant()}.",
            "/app/Tafseel-Teacher-Dashboard.dc.html?section=samples",
            $"showcase:{sample.Id}:version:{versionId}:decision:{status}", true, ct);
        audit.AddCurrent(
            status switch
            {
                ShowcaseModerationStatus.Approved => "ShowcaseApproved",
                ShowcaseModerationStatus.ChangesRequested => "ShowcaseChangesRequested",
                _ => "ShowcaseRejected"
            },
            "TeacherTeachingSample", id.ToString(),
            $"Showcase version {sample.CurrentVersion().VersionNumber} decision: {status}.");
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public async Task<SampleFile> OpenShowcaseVersionAsync(
        string requesterId, bool canReview, Guid id, Guid versionId, CancellationToken ct)
    {
        RequireShowcasesEnabled();
        var row = await (
            from version in db.TeacherTeachingSampleVersions.AsNoTracking()
            join sample in db.TeacherTeachingSamples.AsNoTracking()
                on version.TeacherTeachingSampleId equals sample.Id
            where sample.Id == id && version.Id == versionId
                && sample.SourceType == TeachingSampleSourceType.TeacherShowcase
            select new { version, sample }).SingleOrDefaultAsync(ct)
            ?? throw new DomainException("sample_not_found", "Teacher Showcase was not found.");
        var owner = string.Equals(row.sample.TeacherId, requesterId, StringComparison.Ordinal);
        var reviewable = canReview && row.version.Status != ShowcaseModerationStatus.Draft;
        if (!owner && !reviewable)
            throw new DomainException("sample_not_found", "Teacher Showcase was not found.");
        if (row.version.StorageKey is null
            || !await files.PrivateFileExistsAsync(row.version.StorageKey, ct))
            throw new DomainException("inaccessible_media", "Showcase media is unavailable.");
        return new(await files.OpenPrivateVideoAsync(row.version.StorageKey, ct), "video/mp4");
    }

    public async Task<AvailabilityRuleDto> AddAvailabilityRuleAsync(string teacherId, AvailabilityRuleInput input, CancellationToken ct)
    {
        await RequireTeacherAsync(teacherId, ct);
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            await LockScheduleAsync(teacherId, ct);
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
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockScheduleAsync(teacherId, ct);
        var rule = await db.TeacherAvailabilityRules.SingleOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId, ct)
            ?? throw new DomainException("availability_not_owned", "Availability rule was not found.");
        var reserving = await db.LiveSessionBookings.AsNoTracking()
            .Where(x => x.TeacherId == teacherId
                && (x.Status == LiveSessionStatus.AwaitingPayment
                    || x.Status == LiveSessionStatus.Confirmed)
                && x.EndsAt > clock.GetUtcNow())
            .ToArrayAsync(ct);
        if (reserving.Any(booking => RuleContains(rule, booking.StartsAt, booking.EndsAt)))
            throw new DomainException(
                "availability_booking_conflict",
                "The availability rule contains a reserved future session.");
        db.Remove(rule);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public async Task<AvailabilityExceptionDto> AddAvailabilityExceptionAsync(string teacherId, AvailabilityExceptionInput input, CancellationToken ct)
    {
        await RequireTeacherAsync(teacherId, ct);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockScheduleAsync(teacherId, ct);
        var item = new TeacherAvailabilityException(teacherId, input.StartsAt, input.EndsAt, input.Reason ?? "");
        if (await db.LiveSessionBookings.AsNoTracking().AnyAsync(x =>
                x.TeacherId == teacherId
                && (x.Status == LiveSessionStatus.AwaitingPayment
                    || x.Status == LiveSessionStatus.Confirmed)
                && x.StartsAt < item.EndsAt && item.StartsAt < x.EndsAt, ct))
            throw new DomainException(
                "availability_booking_conflict",
                "An availability exception cannot overlap a reserved session.");
        db.Add(item);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
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
        if (!await TeacherPublicQueries.IsBrowsableAsync(db, teacherId, ct))
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
        var cards = await (
            from favorite in db.FavoriteTeachers.AsNoTracking()
            join browsable in TeacherPublicQueries.BrowsableTeachers(db)
                on favorite.TeacherId equals browsable.Profile.TeacherId
            where favorite.StudentId == studentId
            orderby favorite.CreatedAt descending
            select new
            {
                browsable.Profile.TeacherId,
                browsable.User.FullName,
                browsable.Profile.Headline,
                browsable.Profile.Country,
                Verified = db.TeacherSubjectQualifications.Any(q => q.TeacherId == browsable.Profile.TeacherId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null
                    && db.Subjects.Any(s => s.Id == q.SubjectId && s.IsActive)),
                Rating = browsable.Profile.RatingCount > 0 ? (decimal?)browsable.Profile.AverageRating : null,
                browsable.Profile.RatingCount,
                StartingPrice = db.TeacherServices.Where(s => s.TeacherId == browsable.Profile.TeacherId && s.IsActive
                        && s.SupersededByTeacherServiceId == null
                        && db.Subjects.Any(subject => subject.Id == s.SubjectId && subject.IsActive)
                        && db.ServiceCatalogItems.Any(type => type.Id == s.ServiceCatalogItemId && type.IsActive))
                    .Min(s => (decimal?)s.Price),
                Currency = db.TeacherServices.Where(s => s.TeacherId == browsable.Profile.TeacherId && s.IsActive
                        && s.SupersededByTeacherServiceId == null
                        && db.Subjects.Any(subject => subject.Id == s.SubjectId && subject.IsActive)
                        && db.ServiceCatalogItems.Any(type => type.Id == s.ServiceCatalogItemId && type.IsActive))
                    .OrderBy(s => s.Price).Select(s => s.Currency).FirstOrDefault(),
                Subjects = db.TeacherSubjectQualifications.Where(q => q.TeacherId == browsable.Profile.TeacherId
                        && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null
                        && db.Subjects.Any(s => s.Id == q.SubjectId && s.IsActive))
                    .Join(db.Subjects, q => q.SubjectId, s => s.Id, (_, s) => s.Name).ToArray(),
                Languages = db.TeacherLanguages.Where(language => language.TeacherId == browsable.Profile.TeacherId)
                    .Join(db.TeachingLanguages.Where(item => item.IsActive),
                        language => language.LanguageId, item => item.Id, (_, item) => item.Name)
                    .ToArray(),
                browsable.User.FullNameEnglish,
                HasAvatar = !string.IsNullOrEmpty(browsable.User.AvatarStorageKey)
            })
            .ToArrayAsync(ct);
        return cards.Select(x => new TeacherCardDto(
            x.TeacherId, x.FullName, x.Headline, x.Country, x.Verified,
            x.Rating, x.RatingCount, null, null, x.StartingPrice, x.Currency,
            x.Subjects, x.Languages, x.FullNameEnglish, x.HasAvatar,
            TrustBadges(x.Verified))).ToArray();
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
            .Join(db.Subjects.Where(s => s.IsActive), x => x.SubjectId, x => x.Id,
                (_, x) => new NamedItemDto(x.Id, x.Name, x.NameAr)).ToArrayAsync(ct);
        var topicsQuery =
            from teacherTopic in db.TeacherTopics.AsNoTracking()
            join topic in db.Topics.AsNoTracking() on teacherTopic.TopicId equals topic.Id
            where teacherTopic.TeacherId == teacherId
            select new { teacherTopic, topic };
        var languagesQuery =
            from teacherLanguage in db.TeacherLanguages.AsNoTracking()
            join language in db.TeachingLanguages.AsNoTracking() on teacherLanguage.LanguageId equals language.Id
            where teacherLanguage.TeacherId == teacherId
            select new { teacherLanguage, language };
        var levelsQuery =
            from teacherLevel in db.TeacherEducationLevels.AsNoTracking()
            join level in db.EducationLevels.AsNoTracking() on teacherLevel.EducationLevelId equals level.Id
            where teacherLevel.TeacherId == teacherId
            select new { teacherLevel, level };
        if (publicOnly)
        {
            topicsQuery = topicsQuery.Where(x => x.topic.IsActive
                && db.Subjects.Any(subject => subject.Id == x.topic.SubjectId && subject.IsActive)
                && db.TeacherSubjectQualifications.Any(q =>
                    q.TeacherId == teacherId && q.SubjectId == x.topic.SubjectId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null));
            languagesQuery = languagesQuery.Where(x => x.language.IsActive);
            levelsQuery = levelsQuery.Where(x => x.level.IsActive);
        }
        var topics = await topicsQuery
            .OrderBy(x => x.topic.Name).ThenBy(x => x.topic.Id)
            .Select(x => new NamedItemDto(x.topic.Id, x.topic.Name, x.topic.NameAr))
            .ToArrayAsync(ct);
        var languages = await languagesQuery
            .OrderBy(x => x.language.Name).ThenBy(x => x.language.Id)
            .Select(x => new NamedItemDto(x.language.Id, x.language.Name, x.language.NameAr))
            .ToArrayAsync(ct);
        var levels = await levelsQuery
            .OrderBy(x => x.level.Name).ThenBy(x => x.level.Id)
            .Select(x => new NamedItemDto(x.level.Id, x.level.Name, x.level.NameAr))
            .ToArrayAsync(ct);
        var verifiedSubjectIds = subjects.Select(x => x.Id).ToHashSet();
        var hasActiveQualification = verifiedSubjectIds.Count > 0;
        var hasAvailability = await db.TeacherAvailabilityRules.AsNoTracking().AnyAsync(x => x.TeacherId == teacherId, ct);
        var servicesQuery =
            from ts in db.TeacherServices.AsNoTracking()
            join type in db.ServiceCatalogItems.AsNoTracking()
                on ts.ServiceCatalogItemId equals type.Id
            where ts.TeacherId == teacherId
            select new { ts, type };
        var samplesQuery = publicOnly
            ? TeacherPublicQueries.VisibleSamples(db, ShowcasesEnabled).Where(x => x.TeacherId == teacherId)
            : db.TeacherTeachingSamples.AsNoTracking()
                .Include(x => x.Versions)
                .Where(x => x.TeacherId == teacherId);
        if (publicOnly)
        {
            samplesQuery = samplesQuery.Include(x => x.Versions);
            servicesQuery = servicesQuery.Where(x => x.ts.IsActive && x.ts.SupersededByTeacherServiceId == null
                && db.TeacherSubjectQualifications.Any(q => q.TeacherId == teacherId
                    && q.SubjectId == x.ts.SubjectId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
                && db.Subjects.Any(subject => subject.Id == x.ts.SubjectId && subject.IsActive)
                && x.type.IsActive
                && x.type.IsPublic
                && x.type.TeacherSelectable);
        }
        var services = (await servicesQuery.ToArrayAsync(ct))
            .OrderBy(x => x.type.DisplayOrder).ThenBy(x => x.ts.CreatedAt)
            .Select(x => Map(x.ts, x.type, profile.IsPublished,
                verifiedSubjectIds.Contains(x.ts.SubjectId), hasAvailability))
            .ToArray();
        var sampleRows = await samplesQuery
            .OrderByDescending(x => x.IsProfileFeatured)
            .ThenBy(x => x.ProfileDisplayOrder)
            .ThenBy(x => x.SourceType)
            .ThenBy(x => x.DisplayOrder)
            .ThenBy(x => x.CreatedAt)
            .ThenBy(x => x.Id)
            .ToArrayAsync(ct);
        if (publicOnly)
        {
            var available = new List<TeacherTeachingSample>(sampleRows.Length);
            foreach (var sample in sampleRows)
            {
                var key = sample.SourceType == TeachingSampleSourceType.QualificationGenerated
                    ? sample.StorageKey
                    : sample.Versions.SingleOrDefault(x => x.Id == sample.ApprovedVersionId)?.StorageKey;
                if (key is not null && await files.PrivateFileExistsAsync(key, ct))
                    available.Add(sample);
            }
            sampleRows = available.Take(_showcaseOptions.MaxPublicPerTeacher).ToArray();
        }
        var samples = sampleRows.Select(Map).ToArray();
        var rules = publicOnly
            ? []
            : (await db.TeacherAvailabilityRules.AsNoTracking()
                .Where(x => x.TeacherId == teacherId).ToArrayAsync(ct)).Select(Map).ToArray();
        var exceptions = publicOnly
            ? []
            : (await db.TeacherAvailabilityExceptions.AsNoTracking()
                .Where(x => x.TeacherId == teacherId).ToArrayAsync(ct)).Select(Map).ToArray();
        var certifications = (await db.TeacherCertifications.AsNoTracking().Where(x => x.TeacherId == teacherId).ToArrayAsync(ct)).Select(Map).ToArray();
        var experience = (await db.TeacherExperiences.AsNoTracking().Where(x => x.TeacherId == teacherId).ToArrayAsync(ct)).Select(Map).ToArray();
        var user = await db.Users.AsNoTracking().SingleAsync(x => x.Id == teacherId, ct);
        var profileComplete = !string.IsNullOrWhiteSpace(profile.Headline)
            && !string.IsNullOrWhiteSpace(profile.Bio)
            && !string.IsNullOrWhiteSpace(profile.Country)
            && !string.IsNullOrWhiteSpace(profile.City);
        var blockers = new List<string>();
        if (!user.EmailConfirmed) blockers.Add("email_unconfirmed");
        if (user.IsSuspended) blockers.Add("account_suspended");
        if (!hasActiveQualification) blockers.Add("qualification_required");
        if (!profileComplete) blockers.Add("profile_incomplete");
        if (!services.Any(x => x.IsActive && x.IsCatalogActive && x.IsPublic && x.TeacherSelectable
                && verifiedSubjectIds.Contains(x.SubjectId)))
            blockers.Add("eligible_active_service_required");
        else if (services.Any(x => x.IsActive && x.IsCatalogActive && x.IsPublic && x.TeacherSelectable
                && verifiedSubjectIds.Contains(x.SubjectId) && x.RequiresScheduling)
            && !hasAvailability)
            blockers.Add("availability_required");
        var eligible = blockers.Count == 0;
        var qualifiedOnTafseel = !user.IsSuspended && subjects.Length > 0;
        return new(
            teacherId, await TeacherNameAsync(teacherId, ct), profile.Headline, profile.Bio, profile.Country,
            publicOnly ? "" : profile.City,
            publicOnly ? "" : profile.TimeZoneId,
            subjects.Length > 0,
            profile.RatingCount > 0 ? profile.AverageRating : null, profile.RatingCount,
            null, publicOnly ? null : profile.ResponseTimeMinutes, subjects, topics, languages, levels,
            services, samples, rules, exceptions, certifications, experience,
            new LiveSessionBookingPolicyDto(
                _liveSessionOptions.EmergencyPremiumPercent,
                _liveSessionOptions.CancellationWindowHours),
            publicOnly ? false : profileComplete,
            publicOnly ? false : eligible,
            publicOnly ? [] : blockers,
            publicOnly || (profile.IsPublished && eligible),
            subjects.Select(x => x.Id).ToArray(), user.FullNameEnglish, user.HasAvatar,
            TrustBadges(qualifiedOnTafseel));
    }

    private static TeacherProfileDto EmptyProfile(string teacherId, string name) =>
        new(teacherId, name, "", "", "", "", "UTC", false, null, 0, null, null,
            [], [], [], [], [], [], [], [], [], [], null,
            TrustBadges: TrustBadges(false));

    private async Task<Dictionary<string, int>> CountPublicPlayableSamplesAsync(
        IReadOnlyCollection<string> teacherIds, CancellationToken ct)
    {
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        if (teacherIds.Count == 0) return counts;
        var rows = await TeacherPublicQueries.VisibleSamples(db, ShowcasesEnabled)
            .Where(x => teacherIds.Contains(x.TeacherId))
            .Include(x => x.Versions)
            .OrderBy(x => x.TeacherId)
            .ThenByDescending(x => x.IsProfileFeatured)
            .ThenBy(x => x.ProfileDisplayOrder)
            .ThenBy(x => x.SourceType)
            .ThenBy(x => x.DisplayOrder)
            .ThenBy(x => x.CreatedAt)
            .ThenBy(x => x.Id)
            .ToArrayAsync(ct);
        foreach (var sample in rows)
        {
            var key = sample.SourceType == TeachingSampleSourceType.QualificationGenerated
                ? sample.StorageKey
                : sample.Versions.SingleOrDefault(x => x.Id == sample.ApprovedVersionId)?.StorageKey;
            if (key is null || !await files.PrivateFileExistsAsync(key, ct))
                continue;
            var current = counts.GetValueOrDefault(sample.TeacherId);
            if (current >= _showcaseOptions.MaxPublicPerTeacher)
                continue;
            counts[sample.TeacherId] = current + 1;
        }
        return counts;
    }

    private static IReadOnlyCollection<TeacherTrustBadgeDto> TrustBadges(bool qualifiedOnTafseel) =>
        qualifiedOnTafseel
            ?
            [
                new TeacherTrustBadgeDto(
                    TeacherTrustBadgeCodes.QualifiedOnTafseel,
                    TeacherTrustBadgeCodes.CategoryVerification,
                    TeacherTrustBadgeCodes.RuleVersionV1)
            ]
            : [];

    private async Task<TeacherProfile> OwnedProfileAsync(string teacherId, CancellationToken ct) =>
        await db.TeacherProfiles.SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct)
        ?? throw new DomainException("profile_not_found", "Teacher profile was not found.");

    private bool ShowcasesEnabled =>
        environment.IsDevelopment() || environment.IsEnvironment("Testing") || _showcaseOptions.Enabled;

    private void RequireShowcasesEnabled()
    {
        if (!ShowcasesEnabled)
            throw new DomainException(
                "showcase_unavailable",
                "Teacher Showcases are not enabled in this environment.");
    }

    private async Task<TeacherTeachingSample> OwnedShowcaseAsync(
        string teacherId, Guid id, bool tracking, CancellationToken ct)
    {
        IQueryable<TeacherTeachingSample> query = db.TeacherTeachingSamples.Include(x => x.Versions);
        if (!tracking) query = query.AsNoTracking();
        return await query.SingleOrDefaultAsync(x =>
                x.Id == id && x.TeacherId == teacherId
                && x.SourceType == TeachingSampleSourceType.TeacherShowcase, ct)
            ?? throw new DomainException("sample_not_owned", "Teacher Showcase was not found.");
    }

    private async Task<TeacherTeachingSample> ReviewableShowcaseAsync(
        Guid id, Guid versionId, CancellationToken ct)
    {
        var sample = await db.TeacherTeachingSamples.Include(x => x.Versions)
            .SingleOrDefaultAsync(x =>
                x.Id == id && x.SourceType == TeachingSampleSourceType.TeacherShowcase
                && x.CurrentVersionId == versionId && x.ArchivedAt == null, ct)
            ?? throw new DomainException("sample_not_found", "Teacher Showcase was not found.");
        if (sample.CurrentVersion().Id != versionId)
            throw new DomainException("sample_version_not_found", "Teacher Showcase version was not found.");
        return sample;
    }

    private async Task RequireShowcaseCapacityAsync(
        string teacherId, Guid subjectId, CancellationToken ct)
    {
        var total = await db.TeacherTeachingSamples.CountAsync(x =>
            x.TeacherId == teacherId && x.SourceType == TeachingSampleSourceType.TeacherShowcase
            && x.ArchivedAt == null, ct);
        var subject = await db.TeacherTeachingSamples.CountAsync(x =>
            x.TeacherId == teacherId && x.SubjectId == subjectId
            && x.SourceType == TeachingSampleSourceType.TeacherShowcase && x.ArchivedAt == null, ct);
        if (total >= _showcaseOptions.MaxPublicPerTeacher
            || subject >= _showcaseOptions.MaxPublicPerSubject)
            throw new DomainException(
                "sample_limit",
                "Archive an existing Teacher Showcase before creating another.");
    }

    private async Task RequireValidTopicAsync(Guid subjectId, Guid? topicId, CancellationToken ct)
    {
        if (topicId.HasValue && !await db.Topics.AnyAsync(x =>
                x.Id == topicId && x.SubjectId == subjectId && x.IsActive, ct))
            throw new DomainException("invalid_topic", "An active topic in the selected subject is required.");
    }

    private async Task<bool> IsPublicSampleAsync(
        TeacherTeachingSample sample, string? storageKey, CancellationToken ct)
    {
        if (!sample.IsPublished || storageKey is null || !sample.IsProfileVisible)
            return false;
        if (sample.SourceType == TeachingSampleSourceType.TeacherShowcase
            && (!ShowcasesEnabled || sample.ModerationStatus != ShowcaseModerationStatus.Approved
                || sample.ArchivedAt.HasValue || sample.ApprovedVersionId is null))
            return false;
        return await db.TeacherProfiles.AsNoTracking().AnyAsync(x =>
                x.TeacherId == sample.TeacherId && x.IsPublished, ct)
            && await db.Users.AsNoTracking().AnyAsync(x =>
                x.Id == sample.TeacherId && x.EmailConfirmed && !x.IsSuspended, ct)
            && await db.Subjects.AsNoTracking().AnyAsync(x =>
                x.Id == sample.SubjectId && x.IsActive, ct)
            && await db.TeacherSubjectQualifications.AsNoTracking().AnyAsync(x =>
                x.TeacherId == sample.TeacherId && x.SubjectId == sample.SubjectId
                && x.Status == TeacherQualificationStatus.Approved && x.RevokedAt == null, ct)
            && await files.PrivateFileExistsAsync(storageKey, ct);
    }

    private async Task NotifyQualityReviewersAsync(
        TeacherTeachingSample sample, CancellationToken ct)
    {
        var roleId = await db.Roles.AsNoTracking()
            .Where(x => x.Name == Tafseel.Application.Authorization.Roles.QualityReviewer)
            .Select(x => x.Id).SingleAsync(ct);
        var reviewerIds = await db.UserRoles.AsNoTracking().Where(x => x.RoleId == roleId)
            .Select(x => x.UserId).ToArrayAsync(ct);
        foreach (var reviewerId in reviewerIds)
            await notifications.QueueAsync(
                reviewerId, "ShowcaseSubmitted", "Teacher Showcase submitted",
                "A Teacher Showcase is ready for Quality review.",
                "/app/Tafseel-Quality-Dashboard.dc.html?section=showcases",
                $"showcase:{sample.Id}:version:{sample.CurrentVersionId}:submitted:{reviewerId}",
                false, ct);
    }

    private Task LockShowcaseAsync(Guid id, CancellationToken ct) =>
        db.Database.IsSqlServer()
            ? db.Database.ExecuteSqlInterpolatedAsync(
                $"EXEC sp_getapplock @Resource={"teacher-showcase:" + id}, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000", ct)
            : Task.CompletedTask;

    private Task LockShowcaseSubjectAsync(string teacherId, Guid subjectId, CancellationToken ct) =>
        db.Database.IsSqlServer()
            ? db.Database.ExecuteSqlInterpolatedAsync(
                $"EXEC sp_getapplock @Resource={"teacher-showcase-subject:" + teacherId + ":" + subjectId}, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000", ct)
            : Task.CompletedTask;

    private Task LockTeacherProfileVideosAsync(string teacherId, CancellationToken ct) =>
        db.Database.IsSqlServer()
            ? db.Database.ExecuteSqlInterpolatedAsync(
                $"EXEC sp_getapplock @Resource={"teacher-profile-videos:" + teacherId}, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000", ct)
            : Task.CompletedTask;

    private async Task<TeacherTeachingSample> OwnedCurationSampleAsync(
        string teacherId, Guid id, CancellationToken ct) =>
        await db.TeacherTeachingSamples
            .Include(x => x.Versions)
            .SingleOrDefaultAsync(x => x.Id == id && x.TeacherId == teacherId, ct)
        ?? throw new DomainException("sample_not_owned", "Teaching sample was not found.");

    private async Task EnsureActiveSubjectQualificationForCurationAsync(
        string teacherId, Guid subjectId, CancellationToken ct)
    {
        if (!await db.TeacherSubjectQualifications.AnyAsync(x =>
                x.TeacherId == teacherId && x.SubjectId == subjectId
                && x.Status == TeacherQualificationStatus.Approved && x.RevokedAt == null, ct)
            || !await db.Subjects.AnyAsync(x => x.Id == subjectId && x.IsActive, ct))
            throw new DomainException(
                "profile_video_not_eligible",
                "Only videos for an active approved subject qualification can be shown.");
    }

    private async Task NormalizeProfileVideoOrderAsync(
        string teacherId, DateTimeOffset now, CancellationToken ct)
    {
        var visible = await db.TeacherTeachingSamples
            .Where(x => x.TeacherId == teacherId && x.IsProfileVisible)
            .OrderByDescending(x => x.IsProfileFeatured)
            .ThenBy(x => x.ProfileDisplayOrder)
            .ThenBy(x => x.CreatedAt)
            .ThenBy(x => x.Id)
            .ToArrayAsync(ct);
        for (var index = 0; index < visible.Length; index++)
            visible[index].SetProfileDisplayOrder(index, now);
    }

    private async Task<IReadOnlyCollection<ProfileVideoDto>> MapProfileVideosAsync(
        IReadOnlyCollection<TeacherTeachingSample> samples, CancellationToken ct)
    {
        if (samples.Count == 0) return [];
        var subjectIds = samples.Select(x => x.SubjectId).Distinct().ToArray();
        var topicIds = samples
            .Select(x => x.SourceType == TeachingSampleSourceType.QualificationGenerated
                ? x.TopicId
                : x.Versions.SingleOrDefault(v => v.Id == (x.ApprovedVersionId ?? x.CurrentVersionId))?.TopicId)
            .Where(x => x.HasValue).Select(x => x!.Value).Distinct().ToArray();
        var subjects = await db.Subjects.AsNoTracking()
            .Where(x => subjectIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var topics = topicIds.Length == 0
            ? new Dictionary<Guid, Topic>()
            : await db.Topics.AsNoTracking()
                .Where(x => topicIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, ct);
        var activeQualSubjects = (await db.TeacherSubjectQualifications.AsNoTracking()
                .Where(x => samples.Select(s => s.TeacherId).Contains(x.TeacherId)
                    && subjectIds.Contains(x.SubjectId)
                    && x.Status == TeacherQualificationStatus.Approved && x.RevokedAt == null)
                .Select(x => x.SubjectId).ToArrayAsync(ct))
            .ToHashSet();

        return samples.Select(sample =>
        {
            subjects.TryGetValue(sample.SubjectId, out var subject);
            Guid? topicId = sample.TopicId;
            string title = sample.Title;
            string? description = null;
            int? duration = sample.DurationSeconds;
            string sourceCode;
            string trustCode;
            string moderationStatus;
            if (sample.SourceType == TeachingSampleSourceType.QualificationGenerated)
            {
                sourceCode = "qualification_sample";
                trustCode = "qualification_sample";
                moderationStatus = sample.PublishedAt is null ? "unpublished" : "approved";
            }
            else
            {
                var version = sample.Versions.SingleOrDefault(v => v.Id == (sample.ApprovedVersionId ?? sample.CurrentVersionId));
                topicId = version?.TopicId;
                title = version?.Title ?? sample.Title;
                description = version?.Description;
                duration = version?.DurationSeconds;
                moderationStatus = (sample.ModerationStatus ?? ShowcaseModerationStatus.Draft).ToString();
                sourceCode = sample.ModerationStatus == ShowcaseModerationStatus.Approved
                    ? "reviewed_showcase" : "teacher_showcase";
                trustCode = sample.ModerationStatus == ShowcaseModerationStatus.Approved
                    ? "reviewed_showcase" : "private_showcase";
            }
            topics.TryGetValue(topicId ?? Guid.Empty, out var topic);
            var eligible = sample.IsCurationEligible()
                && activeQualSubjects.Contains(sample.SubjectId)
                && subject?.IsActive == true
                && (sample.SourceType != TeachingSampleSourceType.TeacherShowcase || ShowcasesEnabled);
            var block = !eligible
                ? sample.SourceType == TeachingSampleSourceType.TeacherShowcase
                    && sample.ModerationStatus is ShowcaseModerationStatus.Draft
                        or ShowcaseModerationStatus.Submitted
                        or ShowcaseModerationStatus.UnderReview
                        or ShowcaseModerationStatus.ChangesRequested
                    ? "pending_or_in_review"
                    : sample.ModerationStatus == ShowcaseModerationStatus.Rejected
                        ? "rejected"
                        : sample.ModerationStatus == ShowcaseModerationStatus.Archived
                            || sample.ArchivedAt.HasValue
                            ? "archived"
                            : !activeQualSubjects.Contains(sample.SubjectId)
                                ? "qualification_inactive"
                                : "not_eligible"
                : null;
            return new ProfileVideoDto(
                sample.Id, sample.SubjectId, subject?.Name, subject?.NameAr,
                topicId, topic?.Name, topic?.NameAr, title, description, duration,
                sourceCode, trustCode, moderationStatus, eligible,
                sample.IsProfileVisible, sample.ProfileDisplayOrder, sample.IsProfileFeatured,
                Convert.ToBase64String(sample.RowVersion), block);
        }).ToArray();
    }

    private void ApplyVersion(TeacherTeachingSampleVersion versionEntity, string version)
    {
        byte[] bytes;
        try { bytes = Convert.FromBase64String(version.Trim('"')); }
        catch { throw new DomainException("invalid_concurrency_token", "The Showcase version is invalid."); }
        db.Entry(versionEntity).Property(x => x.RowVersion).OriginalValue = bytes;
    }

    private void ApplyVersionToSample(TeacherTeachingSample sample, string version)
    {
        byte[] bytes;
        try { bytes = Convert.FromBase64String(version.Trim('"')); }
        catch { throw new DomainException("invalid_concurrency_token", "The Showcase version is invalid."); }
        db.Entry(sample).Property(x => x.RowVersion).OriginalValue = bytes;
    }

    private static string SafeFileName(string fileName)
    {
        var name = Path.GetFileName(fileName);
        if (name.Length is 0 or > 255)
            throw new DomainException("invalid_file_name", "The uploaded file name is invalid.");
        return name;
    }

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

    private static void EnsureLegacyCatalogIdentity(string? title, Domain.Catalog.ServiceCatalogItem catalog)
    {
        if (!string.IsNullOrWhiteSpace(title)
            && !string.Equals(title.Trim(), catalog.Name, StringComparison.Ordinal)
            && !string.Equals(title.Trim(), catalog.NameAr, StringComparison.Ordinal))
            throw new DomainException(
                "teacher_service_title_catalog_owned",
                "Service title is owned by the marketplace catalog and cannot be changed by Teachers.");
    }

    private static bool IsPolicyComplete(Domain.Catalog.ServiceCatalogItem catalog)
    {
        try { catalog.EnsurePolicyComplete(); return true; }
        catch (DomainException) { return false; }
    }

    private static bool IsOfferingCompliant(
        TeacherService service, Domain.Catalog.ServiceCatalogItem catalog)
    {
        if (service.IsSuperseded) return false;
        try
        {
            ServiceCatalogPolicyValidator.EnsureOfferingTerms(
                catalog, service.Price, service.Currency, service.DeliveryHours, service.Revisions);
            return true;
        }
        catch (DomainException) { return false; }
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

    private Task LockScheduleAsync(string teacherId, CancellationToken ct) =>
        db.Database.IsSqlServer()
            ? db.Database.ExecuteSqlInterpolatedAsync(
                $"EXEC sp_getapplock @Resource={"session-schedule:" + teacherId}, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000", ct)
            : Task.CompletedTask;

    private Task LockTeacherServiceAsync(
        string teacherId, Guid subjectId, Guid catalogItemId, CancellationToken ct) =>
        db.Database.IsSqlServer()
            ? db.Database.ExecuteSqlInterpolatedAsync(
                $"EXEC sp_getapplock @Resource={"teacher-service:" + teacherId + ":" + subjectId + ":" + catalogItemId}, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000", ct)
            : Task.CompletedTask;

    private static bool RuleContains(
        TeacherAvailabilityRule rule,
        DateTimeOffset startsAt,
        DateTimeOffset endsAt)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(rule.TimeZoneId);
        var localStart = TimeZoneInfo.ConvertTime(startsAt, zone);
        var localEnd = TimeZoneInfo.ConvertTime(endsAt, zone);
        return localStart.Date == localEnd.Date
            && localStart.DayOfWeek == rule.DayOfWeek
            && TimeOnly.FromDateTime(localStart.DateTime) >= rule.Start
            && TimeOnly.FromDateTime(localEnd.DateTime) <= rule.End;
    }

    private static TeacherServiceDto Map(
        TeacherService x,
        Domain.Catalog.ServiceCatalogItem type,
        bool profilePublished,
        bool hasActiveQualification,
        bool hasAvailability)
    {
        var compliant = IsOfferingCompliant(x, type);
        var canRequest = x.IsActive && !x.IsSuperseded && compliant && hasActiveQualification
            && type.IsActive && type.IsPublic && type.TeacherSelectable && !type.RequiresScheduling;
        var canBook = x.IsActive
            && !x.IsSuperseded
            && compliant
            && type.IsActive
            && type.IsPublic
            && type.TeacherSelectable
            && type.RequiresScheduling
            && string.Equals(type.Code, "live_session", StringComparison.Ordinal)
            && profilePublished
            && hasActiveQualification
            && hasAvailability;
        var state = x.IsSuperseded ? "superseded"
            : !hasActiveQualification ? "qualification_required"
            : !type.IsActive ? "catalog_inactive"
            : !type.IsPublic ? "catalog_hidden"
            : !type.TeacherSelectable ? "catalog_unavailable"
            : !compliant ? "policy_correction_required"
            : !x.IsActive ? "disabled"
            : "configured";
        return new TeacherServiceDto(
            x.Id,
            x.SubjectId,
            x.ServiceCatalogItemId,
            type.Code,
            type.Type,
            type.Name,
            string.IsNullOrWhiteSpace(x.ApproachEn) ? x.ApproachAr : x.ApproachEn,
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
            Convert.ToBase64String(x.RowVersion))
        {
            NameEn = type.Name,
            NameAr = type.NameAr,
            DescriptionEn = type.Description,
            DescriptionAr = type.DescriptionAr,
            CategoryCode = type.CategoryCode,
            IconCode = type.IconCode,
            OrderType = type.OrderType,
            QualificationPolicy = type.QualificationPolicy,
            ApproachEn = x.ApproachEn,
            ApproachAr = x.ApproachAr,
            DefaultPrice = type.DefaultPrice,
            RecommendedPrice = type.RecommendedPrice,
            MinimumDeliveryHours = type.MinimumDeliveryHours,
            DefaultDeliveryHours = type.DefaultDeliveryHours,
            RecommendedDeliveryHours = type.RecommendedDeliveryHours,
            MaximumDeliveryHours = type.MaximumDeliveryHours,
            DefaultRevisions = type.DefaultRevisions,
            MaximumRevisions = type.MaximumRevisions,
            IsQualified = hasActiveQualification,
            IsCompliant = compliant,
            IsSuperseded = x.IsSuperseded,
            SupersededByTeacherServiceId = x.SupersededByTeacherServiceId,
            ConfigurationState = state
        };
    }
    private static TeachingSampleDto Map(TeacherTeachingSample x)
    {
        if (x.SourceType == TeachingSampleSourceType.QualificationGenerated)
            return new(
                x.Id, x.SubjectId, x.TopicId, x.Title, x.DurationSeconds, x.PublishedAt,
                "qualification_sample", "qualification_sample", null, x.DisplayOrder,
                x.IsProfileVisible, x.ProfileDisplayOrder, x.IsProfileFeatured);
        var versionId = x.ApprovedVersionId ?? x.CurrentVersionId;
        var version = x.Versions.SingleOrDefault(item => item.Id == versionId)
            ?? throw new DomainException("sample_version_not_found", "Teacher Showcase version was not found.");
        return Map(x, version);
    }

    private static TeachingSampleDto Map(
        TeacherTeachingSample sample, TeacherTeachingSampleVersion version) =>
        new(
            sample.Id, sample.SubjectId, version.TopicId, version.Title,
            version.DurationSeconds, sample.PublishedAt,
            sample.ModerationStatus == ShowcaseModerationStatus.Approved
                ? "reviewed_showcase" : "teacher_showcase",
            sample.ModerationStatus == ShowcaseModerationStatus.Approved
                ? "reviewed_showcase" : "private_showcase",
            version.Description, sample.DisplayOrder,
            sample.IsProfileVisible, sample.ProfileDisplayOrder, sample.IsProfileFeatured);

    private static ShowcaseVersionDto MapShowcaseVersion(TeacherTeachingSampleVersion version) =>
        new(
            version.Id, version.VersionNumber, version.TopicId, version.Title, version.Description,
            version.Status, version.OriginalFileName, version.ContentType, version.FileSize,
            version.DurationSeconds, version.CreatedAt, version.SubmittedAt,
            version.DecisionReasonCode, version.TeacherVisibleNote,
            Convert.ToBase64String(version.RowVersion));

    private static TeacherShowcaseDto MapShowcase(TeacherTeachingSample sample)
    {
        var current = sample.Versions.SingleOrDefault(x => x.Id == sample.CurrentVersionId)
            ?? throw new DomainException("sample_version_not_found", "The current Showcase version was not found.");
        return new(
            sample.Id, sample.SubjectId, sample.SourceType,
            sample.ModerationStatus ?? ShowcaseModerationStatus.Draft,
            sample.CurrentVersionId, sample.ApprovedVersionId, sample.ArchivedAt,
            sample.DisplayOrder, Convert.ToBase64String(sample.RowVersion),
            MapShowcaseVersion(current),
            sample.Versions.OrderByDescending(x => x.VersionNumber)
                .Take(20).Select(MapShowcaseVersion).ToArray());
    }
    private static AvailabilityRuleDto Map(TeacherAvailabilityRule x) =>
        new(x.Id, x.DayOfWeek, x.Start, x.End, x.TimeZoneId, x.SlotMinutes);
    private static AvailabilityExceptionDto Map(TeacherAvailabilityException x) =>
        new(x.Id, x.StartsAt, x.EndsAt, x.Reason);
    private static CredentialDto Map(TeacherCredential x) =>
        new(x.Id, x.Title, x.Organization, x.From, x.To);

}
