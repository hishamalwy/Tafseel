using Microsoft.EntityFrameworkCore;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Governance;

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
        return Map(application);
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
        application.AttachDemo(file.StorageKey, durationSeconds, topic.MaxVideoSeconds);
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
        return applications.Select(Map).ToArray();
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
        return applications.Select(Map).ToArray();
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
        await db.SaveChangesAsync(ct);
    }

    public async Task DecideAsync(
        string reviewerId,
        Guid applicationId,
        DecideTeacherApplication input,
        string expectedVersion,
        CancellationToken ct)
    {
        var application = await Required(applicationId, ct);
        SetExpectedVersion(application, expectedVersion);
        if (input.Scores.GroupBy(x => x.Criterion).Any(group => group.Count() != 1))
            throw new DomainException("incomplete_evaluation", "Each evaluation criterion must be scored exactly once.");
        var scores = input.Scores
            .GroupBy(x => x.Criterion)
            .ToDictionary(x => x.Key, x => x.Single().Score);

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        application.Decide(
            reviewerId, input.Decision, scores, input.Comment, input.InternalNotes, clock.GetUtcNow());
        if (input.Decision == ReviewDecision.Approve
            && !await db.TeacherSubjectQualifications.AnyAsync(
                x => x.TeacherId == application.TeacherId && x.SubjectId == application.SubjectId, ct))
            db.TeacherSubjectQualifications.Add(new(
                application.TeacherId, application.SubjectId, clock.GetUtcNow()));
        await notifications.QueueAsync(application.TeacherId, "ApplicationDecision",
            $"Teacher application {input.Decision}", input.Comment ?? "Your application was reviewed.",
            $"/teacher-applications/{application.Id}",
            $"application:{application.Id}:review:{application.Reviews.Last().Id}",
            true, ct);
        audit.Add(reviewerId, "TeacherApplicationDecision", "TeacherApplication",
            application.Id.ToString(), $"Decision: {input.Decision}.",
            $"application:{application.Id}:review:{application.Reviews.Last().Id}");
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
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

    private static TeacherApplicationDto Map(TeacherApplication x) =>
        new(x.Id, x.TeacherId, x.SubjectId, x.QualificationTopicId,
            x.Status, x.Priority, x.AssignedReviewerId, x.SubmittedAt,
            Convert.ToBase64String(x.RowVersion ?? []));

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
