using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Common;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Governance;
using Tafseel.Domain.Marketplace;
using Tafseel.Application.Authorization;
using System.Text.Json;
using System.Data;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Data.SqlClient;

namespace Tafseel.Infrastructure.TeacherApplications;

internal sealed class TeacherApplicationService(
    TafseelDbContext db,
    IFileStorageService files,
    NotificationWriter notifications,
    AuditWriter audit,
    TimeProvider clock) : ITeacherApplicationService
{
    public async Task<TeacherApplicationDto> CreateAsync(
        string teacherId,
        CreateTeacherApplication input,
        CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var topic = await db.QualificationTopics.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == input.QualificationTopicId && x.IsActive, ct);
        if (topic is null || topic.SubjectId != input.SubjectId
            || !await db.Subjects.AnyAsync(x => x.Id == input.SubjectId && x.IsActive, ct))
            throw new DomainException("qualification_topic_not_found", "Select an active qualification topic for this subject.");

        var duplicate = await db.TeacherApplications.AnyAsync(x =>
            x.TeacherId == teacherId && x.SubjectId == input.SubjectId
            && x.Status >= TeacherApplicationStatus.Draft
            && x.Status <= TeacherApplicationStatus.ChangesRequested, ct);
        var qualified = await db.TeacherSubjectQualifications.AnyAsync(
            x => x.TeacherId == teacherId && x.SubjectId == input.SubjectId
                && x.Status == TeacherQualificationStatus.Approved && x.RevokedAt == null, ct);
        if (duplicate || qualified)
            throw new DomainException("duplicate_teacher_application", "An active application already exists for this subject.");

        var application = new TeacherApplication(teacherId, input.SubjectId, input.QualificationTopicId, clock.GetUtcNow());
        application.UpdateDraft(input.QualificationTopicId, input.City, input.ExperienceYears, input.Degree ?? "");
        db.TeacherApplications.Add(application);
        try
        {
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException)
        {
            throw new DomainException("duplicate_teacher_application", "An active application or qualification already exists for this subject.");
        }
        return (await MapAsync([application], ct)).Single();
    }

    public async Task UpdateAsync(
        string teacherId,
        Guid applicationId,
        CreateTeacherApplication input,
        string expectedVersion,
        CancellationToken ct)
    {
        var application = await Owned(applicationId, teacherId, ct);
        SetExpectedVersion(application, expectedVersion);
        var topic = await db.QualificationTopics.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == input.QualificationTopicId && x.IsActive, ct);
        if (topic is null || topic.SubjectId != application.SubjectId)
            throw new DomainException("qualification_topic_not_found", "Select an active qualification topic for this subject.");
        application.UpdateDraft(input.QualificationTopicId, input.City, input.ExperienceYears, input.Degree ?? "");
        await db.SaveChangesAsync(ct);
    }

    public async Task<StoredFile> UploadDemoAsync(
        string teacherId,
        Guid applicationId,
        Stream stream,
        string fileName,
        string contentType,
        long size,
        int durationSeconds,
        string expectedVersion,
        CancellationToken ct)
    {
        var application = await Owned(applicationId, teacherId, ct);
        SetExpectedVersion(application, expectedVersion);
        var topic = await db.QualificationTopics.AsNoTracking()
            .SingleAsync(x => x.Id == application.QualificationTopicId, ct);
        var file = await files.StorePrivateVideoAsync(stream, fileName, contentType, size, ct);
        var resourceManifest = JsonSerializer.Serialize(await db.QualificationAssignmentResources.AsNoTracking()
            .Where(x => x.QualificationAssignmentId == topic.Id)
            .OrderBy(x => x.DisplayOrder)
            .Select(x => new
            {
                x.Id,
                x.DisplayName,
                x.DisplayNameAr,
                Type = x.ResourceType.ToString(),
                x.Url,
                x.OriginalFileName,
                x.DisplayOrder,
                x.IsRequired
            }).ToArrayAsync(ct));
        var submissionId = Guid.NewGuid();
        var submissionVersion = await db.TeacherDemoSubmissions.CountAsync(
            x => x.TeacherApplicationId == application.Id, ct) + 1;
        application.AttachDemo(
            submissionId, file.StorageKey, durationSeconds, topic.MinVideoSeconds, topic.MaxVideoSeconds);
        db.TeacherDemoSubmissions.Add(new(
            submissionId, application.Id, teacherId, application.SubjectId, application.QualificationTopicId,
            file.StorageKey, Path.GetFileName(fileName), file.ContentType, file.Size,
            durationSeconds, submissionVersion, clock.GetUtcNow(),
            topic.Name, topic.Instructions, resourceManifest));
        await db.SaveChangesAsync(ct);
        return file;
    }

    public async Task SubmitAsync(string teacherId, Guid applicationId, string expectedVersion, CancellationToken ct)
    {
        var application = await Owned(applicationId, teacherId, ct);
        SetExpectedVersion(application, expectedVersion);
        var topicIsAvailable = await db.QualificationTopics.AsNoTracking().AnyAsync(
            topic => topic.Id == application.QualificationTopicId
                && topic.SubjectId == application.SubjectId
                && topic.IsActive
                && db.Subjects.Any(subject => subject.Id == application.SubjectId && subject.IsActive), ct);
        if (!topicIsAvailable)
            throw new DomainException(
                "qualification_topic_not_found",
                "The selected subject and qualification topic must be active when submitting.");
        application.Submit(teacherId, clock.GetUtcNow());
        var reviewerIds = await (
            from userRole in db.UserRoles
            join role in db.Roles on userRole.RoleId equals role.Id
            where role.Name == Roles.QualityReviewer
            select userRole.UserId).Distinct().ToArrayAsync(ct);
        foreach (var reviewerId in reviewerIds)
            await notifications.QueueAsync(reviewerId, "ApplicationSubmitted",
                "New teacher application", "A teacher application is ready for review.",
                AppRoutes.QualityApplication(application.Id),
                $"application-submitted:{application.Id}:{reviewerId}", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task WithdrawAsync(string teacherId, Guid applicationId, string expectedVersion, CancellationToken ct)
    {
        var application = await Owned(applicationId, teacherId, ct);
        SetExpectedVersion(application, expectedVersion);
        application.Withdraw(teacherId, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyCollection<TeacherApplicationDto>> GetMineAsync(string teacherId, CancellationToken ct)
    {
        var applications = await db.TeacherApplications.AsNoTracking()
            .Where(x => x.TeacherId == teacherId)
            .OrderByDescending(x => x.CreatedAt)
            .ToArrayAsync(ct);
        return await MapAsync(applications, ct);
    }

    public async Task<IReadOnlyCollection<TeacherQualificationCardDto>> GetMyQualificationsAsync(
        string teacherId, CancellationToken ct)
    {
        var subjects = await db.Subjects.AsNoTracking()
            .OrderBy(x => x.DisplayOrder).ThenBy(x => x.Name).ThenBy(x => x.Id)
            .ToArrayAsync(ct);
        var topicsBySubject = (await db.QualificationTopics.AsNoTracking()
                .Where(x => x.IsActive).ToArrayAsync(ct))
            .GroupBy(x => x.SubjectId)
            .ToDictionary(x => x.Key, x => x.ToArray());
        var qualifications = await db.TeacherSubjectQualifications.AsNoTracking()
            .Where(x => x.TeacherId == teacherId).ToArrayAsync(ct);
        var qualificationBySubject = qualifications.ToDictionary(x => x.SubjectId);
        var applications = await db.TeacherApplications.AsNoTracking()
            .Where(x => x.TeacherId == teacherId)
            .OrderByDescending(x => x.CreatedAt)
            .ToArrayAsync(ct);
        var latestAppBySubject = applications
            .GroupBy(x => x.SubjectId)
            .ToDictionary(x => x.Key, x => x.First());
        var decidedAtByApp = applications.Length == 0
            ? new Dictionary<Guid, DateTimeOffset?>()
            : await db.Set<TeacherApplicationReview>().AsNoTracking()
                .Where(x => applications.Select(a => a.Id).Contains(x.TeacherApplicationId))
                .GroupBy(x => x.TeacherApplicationId)
                .Select(g => new { ApplicationId = g.Key, DecidedAt = g.Max(x => x.CreatedAt) })
                .ToDictionaryAsync(x => x.ApplicationId, x => (DateTimeOffset?)x.DecidedAt, ct);

        var relevantSubjectIds = subjects
            .Where(s => s.IsActive || qualificationBySubject.ContainsKey(s.Id) || latestAppBySubject.ContainsKey(s.Id))
            .Select(s => s.Id)
            .ToHashSet();

        var cards = new List<TeacherQualificationCardDto>();
        foreach (var subject in subjects.Where(s => relevantSubjectIds.Contains(s.Id)))
        {
            qualificationBySubject.TryGetValue(subject.Id, out var qualification);
            latestAppBySubject.TryGetValue(subject.Id, out var application);
            var hasActiveTask = topicsBySubject.ContainsKey(subject.Id);
            var decidedAt = application is not null
                ? decidedAtByApp.GetValueOrDefault(application.Id)
                : null;

            if (qualification?.IsActive == true)
            {
                cards.Add(new(
                    subject.Id, subject.Name, subject.NameAr,
                    TeacherQualificationCardState.Qualified,
                    application?.Id, application?.Status, application?.SubmittedAt, decidedAt,
                    qualification.ApprovedAt, null, application?.DemoStorageKey is not null,
                    "Manage services for this subject",
                    AppRoutes.TeacherServices,
                    false, null));
                continue;
            }

            if (qualification is { IsActive: false })
            {
                cards.Add(new(
                    subject.Id, subject.Name, subject.NameAr,
                    TeacherQualificationCardState.Revoked,
                    application?.Id, application?.Status, application?.SubmittedAt, decidedAt,
                    qualification.ApprovedAt, qualification.RevokedAt,
                    application?.DemoStorageKey is not null,
                    hasActiveTask && subject.IsActive
                        ? "Re-apply for this subject"
                        : "Subject unavailable for re-application",
                    hasActiveTask && subject.IsActive
                        ? AppRoutes.TeacherApplyForSubject(subject.Id)
                        : null,
                    hasActiveTask && subject.IsActive,
                    !subject.IsActive ? "subject_inactive"
                        : !hasActiveTask ? "no_qualification_task" : null));
                continue;
            }

            if (application is not null
                && application.Status is TeacherApplicationStatus.Draft
                    or TeacherApplicationStatus.Submitted
                    or TeacherApplicationStatus.UnderReview)
            {
                cards.Add(new(
                    subject.Id, subject.Name, subject.NameAr,
                    TeacherQualificationCardState.ApplicationInProgress,
                    application.Id, application.Status, application.SubmittedAt, decidedAt,
                    null, null, application.DemoStorageKey is not null,
                    "Continue application",
                    AppRoutes.TeacherApply,
                    false, null));
                continue;
            }

            if (application?.Status == TeacherApplicationStatus.ChangesRequested)
            {
                cards.Add(new(
                    subject.Id, subject.Name, subject.NameAr,
                    TeacherQualificationCardState.ChangesRequested,
                    application.Id, application.Status, application.SubmittedAt, decidedAt,
                    null, null, application.DemoStorageKey is not null,
                    "Update and resubmit",
                    AppRoutes.TeacherApply,
                    false, null));
                continue;
            }

            if (application?.Status == TeacherApplicationStatus.Rejected)
            {
                cards.Add(new(
                    subject.Id, subject.Name, subject.NameAr,
                    TeacherQualificationCardState.Rejected,
                    application.Id, application.Status, application.SubmittedAt, decidedAt,
                    null, null, application.DemoStorageKey is not null,
                    hasActiveTask && subject.IsActive
                        ? "Apply again for this subject"
                        : "Subject unavailable",
                    hasActiveTask && subject.IsActive
                        ? AppRoutes.TeacherApplyForSubject(subject.Id)
                        : null,
                    hasActiveTask && subject.IsActive,
                    !subject.IsActive ? "subject_inactive"
                        : !hasActiveTask ? "no_qualification_task" : null));
                continue;
            }

            // Available / unavailable (including withdrawn terminal apps with no qual)
            if (!subject.IsActive)
            {
                if (application is not null)
                    cards.Add(new(
                        subject.Id, subject.Name, subject.NameAr,
                        TeacherQualificationCardState.Unavailable,
                        application.Id, application.Status, application.SubmittedAt, decidedAt,
                        null, null, application.DemoStorageKey is not null,
                        "Subject inactive", null, false, "subject_inactive"));
                continue;
            }

            if (!hasActiveTask)
            {
                cards.Add(new(
                    subject.Id, subject.Name, subject.NameAr,
                    TeacherQualificationCardState.Unavailable,
                    application?.Id, application?.Status, application?.SubmittedAt, decidedAt,
                    null, null, application?.DemoStorageKey is not null,
                    "No active qualification task", null, false, "no_qualification_task"));
                continue;
            }

            cards.Add(new(
                subject.Id, subject.Name, subject.NameAr,
                TeacherQualificationCardState.AvailableToApply,
                application?.Id, application?.Status, application?.SubmittedAt, decidedAt,
                null, null, application?.DemoStorageKey is not null,
                "Apply to teach this subject",
                AppRoutes.TeacherApplyForSubject(subject.Id),
                true, null));
        }

        return cards
            .OrderBy(x => x.State switch
            {
                TeacherQualificationCardState.Qualified => 0,
                TeacherQualificationCardState.ChangesRequested => 1,
                TeacherQualificationCardState.ApplicationInProgress => 2,
                TeacherQualificationCardState.Rejected => 3,
                TeacherQualificationCardState.Revoked => 4,
                TeacherQualificationCardState.AvailableToApply => 5,
                _ => 6
            })
            .ThenBy(x => x.SubjectName)
            .ToArray();
    }

    public async Task<PagedResult<TeacherApplicationDto>> GetQueueAsync(
        TeacherApplicationStatus? status,
        TeacherApplicationQualificationKind kind,
        TeacherApplicationQueueScope scope,
        string? search,
        Guid? subjectId,
        DateTimeOffset? submittedFrom,
        DateTimeOffset? submittedTo,
        TeacherApplicationQueueSort sort,
        int page,
        int pageSize,
        CancellationToken ct)
    {
        if (status is TeacherApplicationStatus.Draft or TeacherApplicationStatus.Withdrawn)
            throw new DomainException(
                "invalid_application_status",
                "The operational queue does not include Draft or Withdrawn applications.");
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var query =
            from application in db.TeacherApplications.AsNoTracking()
            join user in db.Users.AsNoTracking() on application.TeacherId equals user.Id
            join subject in db.Subjects.AsNoTracking() on application.SubjectId equals subject.Id
            select new { application, user, subject };
        if (status.HasValue)
            query = query.Where(x => x.application.Status == status);
        else if (scope == TeacherApplicationQueueScope.All)
            query = query.Where(x =>
                x.application.Status != TeacherApplicationStatus.Draft
                && x.application.Status != TeacherApplicationStatus.Withdrawn);
        else
            query = query.Where(x =>
                x.application.Status == TeacherApplicationStatus.Submitted
                || x.application.Status == TeacherApplicationStatus.UnderReview);
        if (subjectId is { } filterSubject && filterSubject != Guid.Empty)
            query = query.Where(x => x.application.SubjectId == filterSubject);
        if (submittedFrom.HasValue)
            query = query.Where(x => x.application.SubmittedAt >= submittedFrom);
        if (submittedTo.HasValue)
            query = query.Where(x => x.application.SubmittedAt <= submittedTo);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x =>
                EF.Functions.Like(x.user.FullName, $"%{term}%")
                || EF.Functions.Like(x.user.FullNameEnglish, $"%{term}%")
                || EF.Functions.Like(x.subject.Name, $"%{term}%")
                || EF.Functions.Like(x.subject.NameAr, $"%{term}%"));
        }
        if (kind != TeacherApplicationQualificationKind.All)
        {
            var otherActiveQuals = db.TeacherSubjectQualifications.AsNoTracking()
                .Where(q => q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null);
            if (kind == TeacherApplicationQualificationKind.Additional)
            {
                query = query.Where(x => otherActiveQuals.Any(q =>
                    q.TeacherId == x.application.TeacherId && q.SubjectId != x.application.SubjectId));
            }
            else
            {
                query = query.Where(x => !otherActiveQuals.Any(q =>
                    q.TeacherId == x.application.TeacherId && q.SubjectId != x.application.SubjectId));
            }
        }
        // Oldest actionable first: Quality work is a FIFO queue. Newest-first remains available
        // as an explicit sort. Priority stays visible on the row but is not a fabricated SLA score.
        query = sort == TeacherApplicationQueueSort.NewestFirst
            ? query.OrderByDescending(x => x.application.SubmittedAt).ThenByDescending(x => x.application.Id)
            : query.OrderBy(x => x.application.SubmittedAt).ThenBy(x => x.application.Id);
        var total = await query.CountAsync(ct);
        var ids = await query.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => x.application.Id).ToArrayAsync(ct);
        var applications = await db.TeacherApplications.AsNoTracking()
            .Where(x => ids.Contains(x.Id)).ToArrayAsync(ct);
        var ordered = ids.Select(id => applications.Single(x => x.Id == id)).ToArray();
        return new(await MapAsync(ordered, ct), page, pageSize, total);
    }

    public async Task<TeacherApplicationQueueSummaryDto> GetQueueSummaryAsync(CancellationToken ct)
    {
        var operational = db.TeacherApplications.AsNoTracking()
            .Where(x => x.Status != TeacherApplicationStatus.Draft
                && x.Status != TeacherApplicationStatus.Withdrawn);
        var submitted = await operational.CountAsync(x => x.Status == TeacherApplicationStatus.Submitted, ct);
        var underReview = await operational.CountAsync(x => x.Status == TeacherApplicationStatus.UnderReview, ct);
        var changesRequested = await operational.CountAsync(
            x => x.Status == TeacherApplicationStatus.ChangesRequested, ct);
        var otherActiveQuals = db.TeacherSubjectQualifications.AsNoTracking()
            .Where(q => q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null);
        var additionalActionable = await operational
            .Where(x => x.Status == TeacherApplicationStatus.Submitted
                || x.Status == TeacherApplicationStatus.UnderReview)
            .CountAsync(x => otherActiveQuals.Any(q =>
                q.TeacherId == x.TeacherId && q.SubjectId != x.SubjectId), ct);
        return new(submitted + underReview, submitted, underReview, changesRequested, additionalActionable);
    }

    public async Task<TeacherApplicationQueueDetailDto> GetQueueDetailAsync(
        Guid applicationId, CancellationToken ct)
    {
        var application = await db.TeacherApplications.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == applicationId, ct)
            ?? throw new DomainException("teacher_application_not_found", "Teacher application was not found.");
        if (application.Status is TeacherApplicationStatus.Draft or TeacherApplicationStatus.Withdrawn)
            throw new DomainException("teacher_application_not_found", "Teacher application was not found.");
        var mapped = (await MapAsync([application], ct)).Single();
        var history = await db.Set<TeacherApplicationStatusHistory>().AsNoTracking()
            .Where(x => x.TeacherApplicationId == applicationId)
            .OrderBy(x => x.CreatedAt).ToArrayAsync(ct);
        var reviews = await db.Set<TeacherApplicationReview>().AsNoTracking()
            .Where(x => x.TeacherApplicationId == applicationId)
            .OrderBy(x => x.CreatedAt).ToArrayAsync(ct);
        var actorIds = history.Select(x => x.ActorId)
            .Concat(reviews.Select(x => x.ReviewerId))
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct().ToArray();
        var qualification = await db.TeacherSubjectQualifications.AsNoTracking()
            .SingleOrDefaultAsync(x => x.TeacherId == application.TeacherId && x.SubjectId == application.SubjectId, ct);
        if (qualification?.RevokedByUserId is { } revokedBy) actorIds = [.. actorIds, revokedBy];
        var names = await db.Users.AsNoTracking()
            .Where(x => actorIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.FullName, ct);
        SubjectQualificationDto? qualificationDto = null;
        if (qualification is not null)
            qualificationDto = new(qualification.Id, qualification.IsActive, qualification.ApprovedAt, qualification.RevokedAt,
                qualification.RevocationReason,
                qualification.RevokedByUserId is null ? null : names.GetValueOrDefault(qualification.RevokedByUserId),
                await db.TeacherServices.CountAsync(x => x.TeacherId == application.TeacherId
                    && x.SubjectId == application.SubjectId && x.IsActive, ct));
        return new(
            mapped,
            history.Select(x => new TeacherApplicationHistoryItemDto(
                x.PreviousStatus, x.NextStatus, x.CreatedAt,
                names.GetValueOrDefault(x.ActorId), x.Note)).ToArray(),
            reviews.Select(x => new TeacherApplicationReviewSummaryDto(
                x.CreatedAt, x.Decision, x.Comment,
                names.GetValueOrDefault(x.ReviewerId), x.InternalNotes)).ToArray(),
            qualificationDto);
    }

    public async Task StartReviewAsync(
        string reviewerId,
        Guid applicationId,
        ApplicationPriority priority,
        string expectedVersion,
        CancellationToken ct)
    {
        var application = await Required(applicationId, ct);
        SetExpectedVersion(application, expectedVersion);
        EnsureNotOwnApplication(application, reviewerId);
        application.StartReview(reviewerId, priority, clock.GetUtcNow());
        await notifications.QueueAsync(application.TeacherId, "ApplicationUnderReview",
            "Application under review", "A quality reviewer has started reviewing your application.",
            AppRoutes.TeacherApply,
            $"application-review-started:{application.Id}", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task DecideAsync(
        string reviewerId,
        Guid applicationId,
        DecideTeacherApplication input,
        string expectedVersion,
        CancellationToken ct)
    {
        await using IDbContextTransaction? transaction = db.Database.IsSqlServer()
            ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct)
            : null;
        var application = await Required(applicationId, ct);
        SetExpectedVersion(application, expectedVersion);
        EnsureNotOwnApplication(application, reviewerId);
        if (input.Scores.GroupBy(x => x.Criterion).Any(group => group.Count() != 1))
            throw new DomainException("incomplete_evaluation", "Each evaluation criterion must be scored exactly once.");
        var scores = input.Scores
            .GroupBy(x => x.Criterion)
            .ToDictionary(x => x.Key, x => x.Single().Score);

        var now = clock.GetUtcNow();
        application.Decide(
            reviewerId, input.Decision, scores, input.Comment, input.InternalNotes, now);
        if (input.Decision == ReviewDecision.Approve)
        {
            var existingQualification = await db.TeacherSubjectQualifications
                .SingleOrDefaultAsync(
                    x => x.TeacherId == application.TeacherId && x.SubjectId == application.SubjectId, ct);
            if (existingQualification is null)
            {
                db.TeacherSubjectQualifications.Add(new(
                    application.TeacherId, application.SubjectId, application.Id,
                    application.QualificationTopicId, reviewerId, now));
            }
            else if (!existingQualification.IsActive)
            {
                existingQualification.Reactivate(
                    application.Id, application.QualificationTopicId, reviewerId, now);
            }
        }
        if (input.Decision == ReviewDecision.Approve)
        {
            var demo = await db.TeacherDemoSubmissions
                .OrderByDescending(x => x.SubmissionVersion)
                .FirstOrDefaultAsync(x => x.TeacherApplicationId == application.Id, ct);
            if (demo is null && application.DemoStorageKey is not null && application.DemoDurationSeconds.HasValue)
            {
                demo = new(
                    application.LatestDemoSubmissionId ?? Guid.NewGuid(), application.Id,
                    application.TeacherId, application.SubjectId, application.QualificationTopicId,
                    application.DemoStorageKey, "qualification-demo.mp4", "video/mp4", 1,
                    application.DemoDurationSeconds.Value, 1, application.SubmittedAt ?? now);
                db.TeacherDemoSubmissions.Add(demo);
            }
            if (demo is null)
                throw new DomainException("demo_required", "The latest valid demo submission is required.");
            if (!await db.TeacherTeachingSamples.AnyAsync(x => x.SourceDemoSubmissionId == demo.Id, ct))
            {
                var title = await db.QualificationTopics.Where(x => x.Id == application.QualificationTopicId)
                    .Select(x => x.Name).SingleAsync(ct);
                var sample = TeacherTeachingSample.FromQualificationDemo(
                    application.TeacherId, application.SubjectId, title, demo.StorageKey,
                    demo.DurationSeconds, application.Id, demo.Id, application.QualificationTopicId,
                    reviewerId, now);
                // DEC-UX-01: the demo was recorded as review material. It becomes a sample the teacher can
                // show, but nobody sees it on the profile until the teacher explicitly chooses to show it.
                sample.SetProfileVisibility(false, now);
                db.TeacherTeachingSamples.Add(sample);
            }
        }
        await notifications.QueueAsync(application.TeacherId, "ApplicationDecision",
            input.Decision switch
            {
                ReviewDecision.Approve => "Your teaching application was approved",
                ReviewDecision.RequestChanges => "Changes requested on your teaching application",
                _ => "Your teaching application was not approved"
            },
            input.Comment ?? "Your application was reviewed.",
            AppRoutes.TeacherApply,
            $"application:{application.Id}:review:{application.Reviews.Last().Id}",
            true, ct);
        audit.Add(reviewerId, "TeacherApplicationDecision", "TeacherApplication",
            application.Id.ToString(), $"Decision: {input.Decision}.",
            $"application:{application.Id}:review:{application.Reviews.Last().Id}");
        try
        {
            await db.SaveChangesAsync(ct);
            if (transaction is not null) await transaction.CommitAsync(ct);
        }
        catch (Exception ex) when (ex.GetBaseException() is SqlException { Number: 1205 })
        {
            throw new DbUpdateConcurrencyException(
                "The application was decided by another reviewer.", ex);
        }
    }

    public async Task RevokeQualificationAsync(
        string reviewerId, Guid qualificationId, RevokeQualificationInput input, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var qualification = await db.TeacherSubjectQualifications
            .SingleOrDefaultAsync(x => x.Id == qualificationId, ct)
            ?? throw new DomainException("qualification_not_found", "Qualification was not found.");
        if (!qualification.IsActive)
        {
            await transaction.CommitAsync(ct);
            return;
        }
        await db.Database.AcquireAsync(
            "teacher-showcase-subject:" + qualification.TeacherId + ":" + qualification.SubjectId, ct);
        var now = clock.GetUtcNow();
        qualification.Revoke(reviewerId, input.Reason, now);
        var services = await db.TeacherServices
            .Where(x => x.TeacherId == qualification.TeacherId
                && x.SubjectId == qualification.SubjectId && x.IsActive).ToArrayAsync(ct);
        foreach (var service in services) service.SetActive(false, now);
        var samples = await db.TeacherTeachingSamples
            .Where(x => x.TeacherId == qualification.TeacherId
                && x.SubjectId == qualification.SubjectId
                && (x.PublishedAt != null || x.SourceType == TeachingSampleSourceType.TeacherShowcase))
            .ToArrayAsync(ct);
        foreach (var sample in samples)
        {
            sample.HideForQualificationRevocation(now);
            if (sample.SourceType == TeachingSampleSourceType.TeacherShowcase)
                audit.Add(reviewerId, "ShowcaseHiddenByQualificationRevocation",
                    "TeacherTeachingSample", sample.Id.ToString(),
                    "Teacher Showcase hidden because its subject qualification was revoked.",
                    $"qualification:{qualification.Id}:showcase:{sample.Id}");
        }
        // A reused application video in this subject stops being the public introduction, and its consent ends.
        var intro = await db.TeacherIntroVideos.SingleOrDefaultAsync(x => x.TeacherId == qualification.TeacherId
            && x.Source == IntroVideoSource.ApplicationVideo && x.SourceSubjectId == qualification.SubjectId, ct);
        if (intro is not null)
        {
            intro.Hide(now);
            foreach (var consent in await db.TeacherVideoConsents
                         .Where(x => x.TeacherId == qualification.TeacherId && x.WithdrawnAt == null).ToArrayAsync(ct))
                consent.Withdraw(now);
        }
        audit.Add(reviewerId, "QualificationRevoked", "TeacherSubjectQualification", qualification.Id.ToString(),
            // The full reason is kept on the qualification itself; the audit line holds up to 2000 characters.
            $"Qualification withdrawn; {services.Length} service(s) paused. Reason: {qualification.RevocationReason}" is { Length: > 2000 } line
                ? line[..1999] + "…"
                : $"Qualification withdrawn; {services.Length} service(s) paused. Reason: {qualification.RevocationReason}",
            $"qualification:{qualification.Id}:revoked");
        await notifications.QueueAsync(
            qualification.TeacherId, "QualificationRevoked", "Subject qualification withdrawn",
            // The full reason stays on the qualification and in the audit; a notification holds up to 1000 characters.
            (qualification.RevocationReason ?? input.Reason) is { Length: > 1000 } longReason ? longReason[..999] + "…" : qualification.RevocationReason ?? input.Reason,
            AppRoutes.TeacherApply,
            $"qualification-revoked:{qualification.Id}", email: true, ct);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    /// <summary>
    /// Roles are additive, so a teacher can also hold the Quality Reviewer role. Reviewing is
    /// still never done on one's own application: approval grants a qualification.
    /// </summary>
    private static void EnsureNotOwnApplication(TeacherApplication application, string reviewerId)
    {
        if (string.Equals(application.TeacherId, reviewerId, StringComparison.Ordinal))
            throw new DomainException("self_review_forbidden", "You cannot review your own application.");
    }

    public async Task<TeacherOnboardingStatusDto> GetOnboardingStatusAsync(
        string teacherId, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == teacherId, ct)
            ?? throw new DomainException("teacher_not_found", "Teacher was not found.");
        var application = await db.TeacherApplications.AsNoTracking()
            .Where(x => x.TeacherId == teacherId)
            .OrderByDescending(x => x.CreatedAt).FirstOrDefaultAsync(ct);
        var approvedSubjectIds = await db.TeacherSubjectQualifications.AsNoTracking()
            .Where(x => x.TeacherId == teacherId
                && x.Status == TeacherQualificationStatus.Approved && x.RevokedAt == null)
            .Select(x => x.SubjectId).ToArrayAsync(ct);
        var profile = await db.TeacherProfiles.AsNoTracking()
            .SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct);
        var profileComplete = profile is not null
            && !string.IsNullOrWhiteSpace(profile.Headline)
            && !string.IsNullOrWhiteSpace(profile.Bio)
            && !string.IsNullOrWhiteSpace(profile.Country)
            && !string.IsNullOrWhiteSpace(profile.City);
        var hasAvailability = await db.TeacherAvailabilityRules.AsNoTracking()
            .AnyAsync(x => x.TeacherId == teacherId, ct);
        var hasPublicSample = await db.TeacherTeachingSamples.AsNoTracking()
            .AnyAsync(x => x.TeacherId == teacherId && x.PublishedAt != null && x.IsProfileVisible
                && approvedSubjectIds.Contains(x.SubjectId), ct);
        var activeQualifiedServices = await (
            from service in db.TeacherServices.AsNoTracking()
            join type in db.ServiceCatalogItems.AsNoTracking()
                on service.ServiceCatalogItemId equals type.Id
            where service.TeacherId == teacherId && service.IsActive
                && approvedSubjectIds.Contains(service.SubjectId)
                && type.IsActive && type.IsPublic && type.TeacherSelectable
            select new { service.Id, type.RequiresScheduling }).ToArrayAsync(ct);
        var hasQualifiedActiveService = activeQualifiedServices.Length > 0;
        var needsAvailability = activeQualifiedServices.Any(x => x.RequiresScheduling) && !hasAvailability;
        var hasActiveService = hasQualifiedActiveService && !needsAvailability;
        var publiclyVisible = profile?.IsPublished == true && profileComplete
            && approvedSubjectIds.Length > 0 && hasActiveService
            && user.EmailConfirmed && !user.IsSuspended;
        var readyForPublication = profileComplete
            && approvedSubjectIds.Length > 0 && hasActiveService
            && user.EmailConfirmed && !user.IsSuspended
            && profile?.IsPublished != true;
        var demoUploaded = application?.DemoStorageKey is not null;
        // Approved qualifications take precedence over a newer draft/in-progress application
        // so multi-subject teachers are not kicked off the dashboard.
        var status = user.IsSuspended ? TeacherOnboardingStatus.Suspended
            : !user.EmailConfirmed ? TeacherOnboardingStatus.EmailUnconfirmed
            : approvedSubjectIds.Length > 0
                ? (!profileComplete ? TeacherOnboardingStatus.ApprovedButProfileIncomplete
                    : (!hasActiveService || !publiclyVisible)
                        ? TeacherOnboardingStatus.ApprovedButNotPublished
                        : TeacherOnboardingStatus.Published)
            : application is null ? TeacherOnboardingStatus.ApplicationRequired
            : application.Status == TeacherApplicationStatus.Draft && !demoUploaded ? TeacherOnboardingStatus.DemoRequired
            : application.Status == TeacherApplicationStatus.Draft ? TeacherOnboardingStatus.ReadyToSubmit
            : application.Status == TeacherApplicationStatus.Submitted ? TeacherOnboardingStatus.PendingReview
            : application.Status == TeacherApplicationStatus.UnderReview ? TeacherOnboardingStatus.UnderReview
            : application.Status == TeacherApplicationStatus.ChangesRequested ? TeacherOnboardingStatus.ChangesRequested
            : application.Status == TeacherApplicationStatus.Rejected ? TeacherOnboardingStatus.Rejected
            : TeacherOnboardingStatus.ApplicationRequired;
        var (action, url) = status switch
        {
            TeacherOnboardingStatus.ApplicationRequired => ("Start your subject application", AppRoutes.TeacherApply),
            TeacherOnboardingStatus.DemoRequired or TeacherOnboardingStatus.ReadyToSubmit
                or TeacherOnboardingStatus.ChangesRequested => ("Continue your application", AppRoutes.TeacherApply),
            TeacherOnboardingStatus.PendingReview or TeacherOnboardingStatus.UnderReview
                or TeacherOnboardingStatus.Rejected => ("View application status", AppRoutes.TeacherApply),
            TeacherOnboardingStatus.ApprovedButProfileIncomplete => ("Complete profile", AppRoutes.TeacherProfileArea),
            TeacherOnboardingStatus.ApprovedButNotPublished => ("Finish marketplace setup", AppRoutes.TeacherPublication),
            TeacherOnboardingStatus.Published => ("Open teacher dashboard", AppRoutes.TeacherHome),
            _ => ("Continue teacher setup", AppRoutes.TeacherHome)
        };
        var blockers = new List<string>();
        var missing = new List<string>();
        if (!user.EmailConfirmed) { blockers.Add("email_unconfirmed"); missing.Add("confirm_email"); }
        if (user.IsSuspended) blockers.Add("account_suspended");
        if (approvedSubjectIds.Length == 0) { blockers.Add("qualification_required"); missing.Add("get_approved_qualification"); }
        if (!profileComplete) { blockers.Add("profile_incomplete"); missing.Add("complete_profile"); }
        if (!hasQualifiedActiveService) { blockers.Add("active_service_required"); missing.Add("add_approved_subject_service"); }
        if (needsAvailability) { blockers.Add("availability_required"); missing.Add("set_availability"); }
        if (!hasPublicSample) missing.Add("add_public_sample");
        if (profile?.IsPublished != true)
        {
            blockers.Add("profile_not_published");
            if (readyForPublication) missing.Add("ready_for_publication");
            else if (approvedSubjectIds.Length > 0) missing.Add("publish_profile");
        }
        return new(status, user.EmailConfirmed, application?.Id, application?.Status,
            application?.SubjectId, application?.QualificationTopicId, demoUploaded,
            status == TeacherOnboardingStatus.ReadyToSubmit, approvedSubjectIds,
            profileComplete, hasActiveService, publiclyVisible,
            action, url, blockers,
            hasAvailability, hasPublicSample, readyForPublication, missing);
    }

    public async Task<PrivateMediaFile> OpenDemoAsync(
        string requesterId, Guid applicationId, bool canReview, CancellationToken ct)
    {
        var application = await db.TeacherApplications.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == applicationId, ct)
            ?? throw new DomainException("teacher_application_not_found", "Teacher application was not found.");
        if (!canReview && application.TeacherId != requesterId)
            throw new DomainException("application_not_owned", "Teacher application was not found.");
        var demo = await db.TeacherDemoSubmissions.AsNoTracking()
            .Where(x => x.TeacherApplicationId == applicationId)
            .OrderByDescending(x => x.SubmissionVersion).FirstOrDefaultAsync(ct);
        var storageKey = demo?.StorageKey ?? application.DemoStorageKey
            ?? throw new DomainException("demo_required", "Demo was not found.");
        return new(await files.OpenPrivateVideoAsync(storageKey, ct),
            demo?.ContentType ?? "video/mp4", demo?.OriginalFileName ?? "qualification-demo.mp4");
    }

    private async Task<TeacherApplication> Owned(Guid id, string teacherId, CancellationToken ct)
    {
        var application = await Required(id, ct);
        if (application.TeacherId != teacherId)
            throw new DomainException("application_not_owned", "Teacher application was not found.");
        return application;
    }

    private async Task<TeacherApplication> Required(Guid id, CancellationToken ct) =>
        await db.TeacherApplications
            .Include(x => x.History)
            .Include(x => x.Reviews).ThenInclude(x => x.Scores)
            .AsSplitQuery()
            .SingleOrDefaultAsync(x => x.Id == id, ct)
        ?? throw new DomainException("teacher_application_not_found", "Teacher application was not found.");

    private async Task<IReadOnlyCollection<TeacherApplicationDto>> MapAsync(
        IReadOnlyCollection<TeacherApplication> applications, CancellationToken ct)
    {
        var ids = applications.Select(x => x.Id).ToArray();
        var rows = await (
            from application in db.TeacherApplications.AsNoTracking()
            join user in db.Users.AsNoTracking() on application.TeacherId equals user.Id
            join subject in db.Subjects.AsNoTracking() on application.SubjectId equals subject.Id
            join assignment in db.QualificationTopics.AsNoTracking()
                on application.QualificationTopicId equals assignment.Id
            where ids.Contains(application.Id)
            select new
            {
                application.Id,
                user.FullName,
                SubjectName = subject.Name,
                SubjectNameAr = subject.NameAr,
                AssignmentTitle = assignment.Name,
                AssignmentTitleAr = assignment.TitleAr,
                assignment.Instructions,
                SubmissionVersion = db.TeacherDemoSubmissions
                    .Where(x => x.TeacherApplicationId == application.Id)
                    .Max(x => (int?)x.SubmissionVersion) ?? 0
            }).ToDictionaryAsync(x => x.Id, ct);
        var latestDemos = (await db.TeacherDemoSubmissions.AsNoTracking()
                .Where(x => ids.Contains(x.TeacherApplicationId)).ToArrayAsync(ct))
            .GroupBy(x => x.TeacherApplicationId)
            .ToDictionary(x => x.Key, x => x.OrderByDescending(d => d.SubmissionVersion).First());
        var reviewRows = await db.Set<TeacherApplicationReview>().AsNoTracking()
            .Where(x => ids.Contains(x.TeacherApplicationId))
            .Select(x => new { x.TeacherApplicationId, x.Comment, x.CreatedAt }).ToArrayAsync(ct);
        var feedback = reviewRows.GroupBy(x => x.TeacherApplicationId)
            .ToDictionary(x => x.Key, x => x.OrderByDescending(r => r.CreatedAt)
                .Select(r => r.Comment).FirstOrDefault());
        var teacherIds = applications.Select(x => x.TeacherId).Distinct().ToArray();
        var qualificationRows = await (
            from qualification in db.TeacherSubjectQualifications.AsNoTracking()
            join subject in db.Subjects.AsNoTracking() on qualification.SubjectId equals subject.Id
            where teacherIds.Contains(qualification.TeacherId)
                && qualification.Status == TeacherQualificationStatus.Approved
                && qualification.RevokedAt == null
            select new
            {
                qualification.TeacherId,
                qualification.SubjectId,
                subject.Name,
                subject.NameAr,
                qualification.ApprovedAt
            }).ToArrayAsync(ct);
        var qualsByTeacher = qualificationRows.GroupBy(x => x.TeacherId).ToDictionary(
            g => g.Key,
            g => (IReadOnlyCollection<OperationalQualifiedSubjectDto>)g
                .Select(x => new OperationalQualifiedSubjectDto(x.SubjectId, x.Name, x.NameAr, x.ApprovedAt))
                .ToArray());
        return applications.Select(x =>
        {
            var detail = rows[x.Id];
            latestDemos.TryGetValue(x.Id, out var latestDemo);
            qualsByTeacher.TryGetValue(x.TeacherId, out var teacherQuals);
            teacherQuals ??= [];
            var publicFeedback = feedback.GetValueOrDefault(x.Id);
            return new TeacherApplicationDto(
                x.Id, x.TeacherId, x.SubjectId, x.QualificationTopicId,
                x.Status, x.Priority, x.AssignedReviewerId, x.SubmittedAt,
                Convert.ToBase64String(x.RowVersion ?? []), detail.FullName,
                detail.SubjectName,
                string.IsNullOrWhiteSpace(latestDemo?.AssignmentTitleSnapshot)
                    ? detail.AssignmentTitle : latestDemo.AssignmentTitleSnapshot,
                string.IsNullOrWhiteSpace(latestDemo?.AssignmentInstructionsSnapshot)
                    ? detail.Instructions : latestDemo.AssignmentInstructionsSnapshot,
                x.DemoStorageKey is not null, x.DemoDurationSeconds,
                detail.SubmissionVersion, publicFeedback,
                x.City, x.ExperienceYears, x.Degree,
                latestDemo?.AssignmentResourceManifest ?? "[]",
                detail.SubjectNameAr,
                detail.AssignmentTitleAr,
                teacherQuals.Any(q => q.SubjectId != x.SubjectId),
                teacherQuals,
                !string.IsNullOrWhiteSpace(publicFeedback));
        }).ToArray();
    }

    private void SetExpectedVersion(TeacherApplication application, string expectedVersion)
    {
        try
        {
            var value = Convert.FromBase64String(expectedVersion.Trim().Trim('"'));
            if (value.Length == 0)
                throw new FormatException();
            db.Entry(application).Property(x => x.RowVersion).OriginalValue = value;
        }
        catch (FormatException)
        {
            throw new DomainException("invalid_concurrency_token", "A valid application version is required.");
        }
    }
}
