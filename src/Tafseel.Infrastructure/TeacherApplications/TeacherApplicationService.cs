using Microsoft.EntityFrameworkCore;
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
            x => x.TeacherId == teacherId && x.SubjectId == input.SubjectId, ct);
        if (duplicate || qualified)
            throw new DomainException("duplicate_teacher_application", "An active application already exists for this subject.");

        var application = new TeacherApplication(teacherId, input.SubjectId, input.QualificationTopicId, clock.GetUtcNow());
        application.UpdateDraft(input.QualificationTopicId, input.City, input.ExperienceYears, input.Degree);
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
        application.UpdateDraft(input.QualificationTopicId, input.City, input.ExperienceYears, input.Degree);
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
                x.Id, x.DisplayName, x.DisplayNameAr, Type = x.ResourceType.ToString(),
                x.Url, x.OriginalFileName, x.DisplayOrder, x.IsRequired
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
                "/app/Tafseel-Quality-Dashboard.dc.html",
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

    public async Task<IReadOnlyCollection<TeacherApplicationDto>> GetQueueAsync(
        TeacherApplicationStatus? status,
        CancellationToken ct)
    {
        var query = db.TeacherApplications.AsNoTracking();
        if (status.HasValue)
            query = query.Where(x => x.Status == status);
        var applications = await query.OrderByDescending(x => x.Priority).ThenBy(x => x.SubmittedAt)
            .ToArrayAsync(ct);
        return await MapAsync(applications, ct);
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
        application.StartReview(reviewerId, priority, clock.GetUtcNow());
        await notifications.QueueAsync(application.TeacherId, "ApplicationUnderReview",
            "Application under review", "A quality reviewer has started reviewing your application.",
            "/app/Tafseel-Teacher-Apply.dc.html?view=status",
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
        if (input.Scores.GroupBy(x => x.Criterion).Any(group => group.Count() != 1))
            throw new DomainException("incomplete_evaluation", "Each evaluation criterion must be scored exactly once.");
        var scores = input.Scores
            .GroupBy(x => x.Criterion)
            .ToDictionary(x => x.Key, x => x.Single().Score);

        var now = clock.GetUtcNow();
        application.Decide(
            reviewerId, input.Decision, scores, input.Comment, input.InternalNotes, now);
        if (input.Decision == ReviewDecision.Approve
            && !await db.TeacherSubjectQualifications.AnyAsync(
                x => x.TeacherId == application.TeacherId && x.SubjectId == application.SubjectId, ct))
            db.TeacherSubjectQualifications.Add(new(
                application.TeacherId, application.SubjectId, application.Id,
                application.QualificationTopicId, reviewerId, now));
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
                db.TeacherTeachingSamples.Add(TeacherTeachingSample.FromQualificationDemo(
                    application.TeacherId, application.SubjectId, title, demo.StorageKey,
                    demo.DurationSeconds, application.Id, demo.Id, application.QualificationTopicId,
                    reviewerId, now));
            }
        }
        await notifications.QueueAsync(application.TeacherId, "ApplicationDecision",
            $"Teacher application {input.Decision}", input.Comment ?? "Your application was reviewed.",
            "/app/Tafseel-Teacher-Apply.dc.html?view=status",
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
        var qualification = await db.TeacherSubjectQualifications
            .SingleOrDefaultAsync(x => x.Id == qualificationId, ct)
            ?? throw new DomainException("qualification_not_found", "Qualification was not found.");
        if (!qualification.IsActive) return;
        var now = clock.GetUtcNow();
        qualification.Revoke(reviewerId, input.Reason, now);
        var services = await db.TeacherServices
            .Where(x => x.TeacherId == qualification.TeacherId
                && x.SubjectId == qualification.SubjectId && x.IsActive).ToArrayAsync(ct);
        foreach (var service in services) service.SetActive(false, now);
        var samples = await db.TeacherTeachingSamples
            .Where(x => x.TeacherId == qualification.TeacherId
                && x.SubjectId == qualification.SubjectId && x.PublishedAt != null).ToArrayAsync(ct);
        foreach (var sample in samples) sample.Unpublish();
        await notifications.QueueAsync(
            qualification.TeacherId, "QualificationRevoked", "Subject qualification updated",
            input.Reason, "/app/Tafseel-Teacher-Apply.dc.html?view=status",
            $"qualification-revoked:{qualification.Id}", email: true, ct);
        await db.SaveChangesAsync(ct);
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
        var hasActiveService = await (
            from service in db.TeacherServices.AsNoTracking()
            join type in db.ServiceCatalogItems.AsNoTracking()
                on service.ServiceCatalogItemId equals type.Id
            where service.TeacherId == teacherId && service.IsActive
                && approvedSubjectIds.Contains(service.SubjectId)
                && type.IsActive && type.IsPublic && type.TeacherSelectable
                && (!type.RequiresScheduling || hasAvailability)
            select service.Id).AnyAsync(ct);
        var publiclyVisible = profile?.IsPublished == true && profileComplete
            && approvedSubjectIds.Length > 0 && hasActiveService
            && user.EmailConfirmed && !user.IsSuspended;
        var demoUploaded = application?.DemoStorageKey is not null;
        var status = user.IsSuspended ? TeacherOnboardingStatus.Suspended
            : !user.EmailConfirmed ? TeacherOnboardingStatus.EmailUnconfirmed
            : application is null ? TeacherOnboardingStatus.ApplicationRequired
            : application.Status == TeacherApplicationStatus.Draft && !demoUploaded ? TeacherOnboardingStatus.DemoRequired
            : application.Status == TeacherApplicationStatus.Draft ? TeacherOnboardingStatus.ReadyToSubmit
            : application.Status == TeacherApplicationStatus.Submitted ? TeacherOnboardingStatus.PendingReview
            : application.Status == TeacherApplicationStatus.UnderReview ? TeacherOnboardingStatus.UnderReview
            : application.Status == TeacherApplicationStatus.ChangesRequested ? TeacherOnboardingStatus.ChangesRequested
            : application.Status == TeacherApplicationStatus.Rejected ? TeacherOnboardingStatus.Rejected
            : approvedSubjectIds.Length > 0 && !profileComplete ? TeacherOnboardingStatus.ApprovedButProfileIncomplete
            : approvedSubjectIds.Length > 0 && (!hasActiveService || !publiclyVisible)
                ? TeacherOnboardingStatus.ApprovedButNotPublished
            : TeacherOnboardingStatus.Published;
        var (action, url) = status switch
        {
            TeacherOnboardingStatus.ApplicationRequired => ("Start your subject application", "Tafseel-Teacher-Apply.dc.html"),
            TeacherOnboardingStatus.DemoRequired or TeacherOnboardingStatus.ReadyToSubmit
                or TeacherOnboardingStatus.ChangesRequested => ("Continue your application", "Tafseel-Teacher-Apply.dc.html"),
            TeacherOnboardingStatus.PendingReview or TeacherOnboardingStatus.UnderReview
                or TeacherOnboardingStatus.Rejected => ("View application status", "Tafseel-Teacher-Apply.dc.html?view=status"),
            _ => ("Continue teacher setup", "Tafseel-Teacher-Dashboard.dc.html")
        };
        var blockers = new List<string>();
        if (!user.EmailConfirmed) blockers.Add("email_unconfirmed");
        if (approvedSubjectIds.Length == 0) blockers.Add("qualification_required");
        if (!profileComplete) blockers.Add("profile_incomplete");
        if (!hasActiveService) blockers.Add("active_service_required");
        if (profile?.IsPublished != true) blockers.Add("profile_not_published");
        return new(status, user.EmailConfirmed, application?.Id, application?.Status,
            application?.SubjectId, application?.QualificationTopicId, demoUploaded,
            status == TeacherOnboardingStatus.ReadyToSubmit, approvedSubjectIds,
            profileComplete, hasActiveService, publiclyVisible,
            action, url, blockers);
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
                application.Id, user.FullName, SubjectName = subject.Name,
                AssignmentTitle = assignment.Name, assignment.Instructions,
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
        return applications.Select(x =>
        {
            var detail = rows[x.Id];
            latestDemos.TryGetValue(x.Id, out var latestDemo);
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
                detail.SubmissionVersion, feedback.GetValueOrDefault(x.Id),
                x.City, x.ExperienceYears, x.Degree,
                latestDemo?.AssignmentResourceManifest ?? "[]");
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
