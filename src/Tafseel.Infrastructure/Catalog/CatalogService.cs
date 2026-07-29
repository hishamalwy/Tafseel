using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Catalog;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Common;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Governance;
using Tafseel.Application.TeacherApplications;

namespace Tafseel.Infrastructure.Catalog;

internal sealed class CatalogService(
    TafseelDbContext db, AuditWriter audit, IFileStorageService files, TimeProvider clock) : ICatalogService
{
    public async Task<IReadOnlyCollection<CatalogItemDto>> GetSubjectsAsync(bool includeInactive, CancellationToken ct) =>
        await Query(db.Subjects, includeInactive)
            .Select(x => new CatalogItemDto(x.Id, x.Name, x.IsActive, x.Icon, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, x.NameAr))
            .ToArrayAsync(ct);

    public async Task<IReadOnlyCollection<CatalogItemDto>> GetTopicsAsync(Guid? subjectId, bool qualificationOnly, bool includeInactive, CancellationToken ct)
    {
        if (qualificationOnly)
        {
            var query = Query(db.QualificationTopics, includeInactive);
            if (!includeInactive)
                query = query.Where(x => db.Subjects.Any(subject => subject.Id == x.SubjectId && subject.IsActive));
            if (subjectId.HasValue) query = query.Where(x => x.SubjectId == subjectId);
            var assignments = await query.OrderBy(x => x.DisplayOrder).ThenBy(x => x.Name).ToArrayAsync(ct);
            var ids = assignments.Select(x => x.Id).ToArray();
            var resources = await db.QualificationAssignmentResources.AsNoTracking()
                .Where(x => ids.Contains(x.QualificationAssignmentId))
                .OrderBy(x => x.DisplayOrder).ToArrayAsync(ct);
            return assignments.Select(x => new CatalogItemDto(
                x.Id, x.Name, x.IsActive, x.Instructions, x.SubjectId,
                DisplayOrder: x.DisplayOrder, TitleAr: x.TitleAr, InstructionsAr: x.InstructionsAr,
                MinVideoSeconds: x.MinVideoSeconds, ExpectedVideoSeconds: x.ExpectedVideoSeconds,
                MaxVideoSeconds: x.MaxVideoSeconds, EvaluationGuidance: x.EvaluationGuidance,
                EvaluationGuidanceAr: x.EvaluationGuidanceAr,
                Resources: resources.Where(r => r.QualificationAssignmentId == x.Id)
                    .Select(r => new CatalogResourceDto(
                        r.Id, r.DisplayName, r.DisplayNameAr,
                        r.ResourceType == QualificationResourceType.File
                            ? $"/api/v1/qualification-resources/{r.Id}/content" : r.Url,
                        r.DisplayOrder,
                        r.IsRequired, r.ResourceType == QualificationResourceType.File,
                        r.OriginalFileName, r.ContentType)).ToArray()))
                .ToArray();
        }
        else
        {
            var query = Query(db.Topics, includeInactive);
            if (!includeInactive)
                query = query.Where(x => db.Subjects.Any(subject => subject.Id == x.SubjectId && subject.IsActive));
            if (subjectId.HasValue) query = query.Where(x => x.SubjectId == subjectId);
            return await query.Select(x => new CatalogItemDto(
                x.Id, x.Name, x.IsActive, x.Difficulty, x.SubjectId, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null))
                .ToArrayAsync(ct);
        }
    }

    public async Task<IReadOnlyCollection<CatalogItemDto>> GetEducationLevelsAsync(bool includeInactive, CancellationToken ct) =>
        await Query(db.EducationLevels, includeInactive)
            .Select(x => new CatalogItemDto(x.Id, x.Name, x.IsActive, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null))
            .ToArrayAsync(ct);

    public async Task<IReadOnlyCollection<CatalogItemDto>> GetLanguagesAsync(bool includeInactive, CancellationToken ct) =>
        await Query(db.TeachingLanguages, includeInactive)
            .Select(x => new CatalogItemDto(x.Id, x.Name, x.IsActive, null, null, x.Code, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null))
            .ToArrayAsync(ct);

    public async Task<IReadOnlyCollection<CatalogItemDto>> GetServicesAsync(bool includeInactive, CancellationToken ct)
    {
        // Project mapped scalars inside LINQ (EF-translatable). AllowedDurations is derived from CSV after materialization.
        var rows = await Query(db.ServiceCatalogItems, includeInactive)
            .OrderBy(x => x.DisplayOrder).ThenBy(x => x.Name)
            .Select(x => new
            {
                x.Id,
                x.Name,
                x.IsActive,
                x.Description,
                x.Code,
                x.Type,
                x.IsPublic,
                x.TeacherSelectable,
                x.RequiresScheduling,
                x.AllowedDurationsCsv,
                x.MinPrice,
                x.MaxPrice,
                x.DisplayOrder,
                x.NameAr
            })
            .ToArrayAsync(ct);

        return rows.Select(x => new CatalogItemDto(
            x.Id,
            x.Name,
            x.IsActive,
            x.Description,
            null,
            x.Code,
            x.Type,
            x.IsPublic,
            x.TeacherSelectable,
            x.RequiresScheduling,
            ParseDurations(x.AllowedDurationsCsv),
            x.MinPrice,
            x.MaxPrice,
            x.DisplayOrder,
            NameAr: x.NameAr)).ToArray();
    }

    private static IReadOnlyCollection<int>? ParseDurations(string? csv)
    {
        if (string.IsNullOrWhiteSpace(csv)) return [];
        return csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(int.Parse)
            .ToArray();
    }

    public Task<CatalogItemDto> CreateSubjectAsync(SubjectInput input, CancellationToken ct) =>
        AddAsync(new Subject(input.Name, input.Icon, input.NameAr), x => new(x.Id, x.Name, x.IsActive, x.Icon, NameAr: x.NameAr), ct);

    public async Task<CatalogItemDto> CreateTopicAsync(TopicInput input, CancellationToken ct)
    {
        await RequireActiveSubject(input.SubjectId, ct);
        return await AddAsync(new Topic(input.SubjectId, input.Name, input.Difficulty),
            x => new(x.Id, x.Name, x.IsActive, x.Difficulty, x.SubjectId), ct);
    }

    public async Task<CatalogItemDto> CreateQualificationTopicAsync(QualificationTopicInput input, CancellationToken ct)
    {
        await RequireActiveSubject(input.SubjectId, ct);
        var assignment = new QualificationTopic(input.SubjectId, input.Name, input.Instructions, input.MaxVideoSeconds);
        assignment.Configure(input.Name, input.TitleAr, input.Instructions, input.InstructionsAr,
            input.ExpectedVideoSeconds, input.MinVideoSeconds, input.MaxVideoSeconds,
            input.EvaluationGuidance, input.EvaluationGuidanceAr, input.DisplayOrder);
        return await AddAsync(assignment,
            x => new(x.Id, x.Name, x.IsActive, x.Instructions, x.SubjectId,
                DisplayOrder: x.DisplayOrder, TitleAr: x.TitleAr, InstructionsAr: x.InstructionsAr,
                MinVideoSeconds: x.MinVideoSeconds, ExpectedVideoSeconds: x.ExpectedVideoSeconds,
                MaxVideoSeconds: x.MaxVideoSeconds, EvaluationGuidance: x.EvaluationGuidance,
                EvaluationGuidanceAr: x.EvaluationGuidanceAr), ct);
    }

    public Task<CatalogItemDto> CreateEducationLevelAsync(NamedCatalogInput input, CancellationToken ct) =>
        AddAsync(new EducationLevel(input.Name), x => new(x.Id, x.Name, x.IsActive), ct);

    public Task<CatalogItemDto> CreateLanguageAsync(NamedCatalogInput input, CancellationToken ct) =>
        AddAsync(new TeachingLanguage(input.Name, input.Detail ?? ""),
            x => new(x.Id, x.Name, x.IsActive, Code: x.Code), ct);

    public Task<CatalogItemDto> CreateServiceAsync(NamedCatalogInput input, CancellationToken ct) =>
        AddAsync(
            new ServiceCatalogItem(
                input.Name,
                input.Detail ?? "",
                input.Code ?? throw new DomainException("service_code_required", "Service code is required."),
                input.Type,
                input.IsPublic ?? true,
                input.TeacherSelectable ?? true,
                input.RequiresScheduling ?? false,
                input.AllowedDurations,
                input.MinPrice,
                input.MaxPrice,
                input.DisplayOrder ?? 0,
                input.NameAr ?? ""),
            x => new(
                x.Id, x.Name, x.IsActive, x.Description, null, x.Code, x.Type, x.IsPublic,
                x.TeacherSelectable, x.RequiresScheduling, x.AllowedDurations, x.MinPrice, x.MaxPrice, x.DisplayOrder,
                NameAr: x.NameAr),
            ct);

    public async Task UpdateAsync(string type, Guid id, NamedCatalogInput input, CancellationToken ct)
    {
        switch (type.ToLowerInvariant())
        {
            case "subjects":
                (await Required(db.Subjects, id, ct)).Update(input.Name, input.Detail ?? "", input.NameAr);
                break;
            case "topics":
                (await Required(db.Topics, id, ct)).Update(input.Name, input.Detail ?? "");
                break;
            case "qualification-topics":
                var qualificationTopic = await Required(db.QualificationTopics, id, ct);
                qualificationTopic.Update(
                    input.Name, input.Detail ?? "", input.MaxVideoSeconds ?? qualificationTopic.MaxVideoSeconds);
                break;
            case "education-levels":
                (await Required(db.EducationLevels, id, ct)).Rename(input.Name);
                break;
            case "languages":
                (await Required(db.TeachingLanguages, id, ct)).Update(input.Name, input.Detail ?? "");
                break;
            case "services":
                {
                    var service = await Required(db.ServiceCatalogItems, id, ct);
                    service.Update(
                        input.Name,
                        input.Detail ?? "",
                        string.IsNullOrWhiteSpace(input.Code) ? service.Code : input.Code,
                        string.IsNullOrWhiteSpace(input.Type) ? service.Type : input.Type,
                        input.IsPublic ?? service.IsPublic,
                        input.TeacherSelectable ?? service.TeacherSelectable,
                        input.RequiresScheduling ?? service.RequiresScheduling,
                        input.AllowedDurations ?? service.AllowedDurations,
                        input.MinPrice ?? service.MinPrice,
                        input.MaxPrice ?? service.MaxPrice,
                        input.DisplayOrder ?? service.DisplayOrder,
                        input.NameAr);
                    break;
                }
            default:
                throw new DomainException("invalid_catalog_type", "Unknown catalog type.");
        }
        await SaveCatalogAsync(ct);
    }

    public async Task SetActiveAsync(string type, Guid id, bool active, CancellationToken ct)
    {
        CatalogItem? item = type.ToLowerInvariant() switch
        {
            "subjects" => await db.Subjects.FindAsync([id], ct),
            "topics" => await db.Topics.FindAsync([id], ct),
            "qualification-topics" => await db.QualificationTopics.FindAsync([id], ct),
            "education-levels" => await db.EducationLevels.FindAsync([id], ct),
            "languages" => await db.TeachingLanguages.FindAsync([id], ct),
            "services" => await db.ServiceCatalogItems.FindAsync([id], ct),
            _ => throw new DomainException("invalid_catalog_type", "Unknown catalog type.")
        };
        if (item is null) throw new DomainException("catalog_item_not_found", "Catalog item was not found.");
        if (active && item is Topic topic)
            await RequireActiveSubject(topic.SubjectId, ct);
        if (active && item is QualificationTopic qualificationTopic)
            await RequireActiveSubject(qualificationTopic.SubjectId, ct);
        item.SetActive(active);
        await SaveCatalogAsync(ct);
    }

    public async Task<CatalogResourceDto> AddLinkResourceAsync(
        Guid assignmentId, QualificationLinkResourceInput input, CancellationToken ct)
    {
        await Required(db.QualificationTopics, assignmentId, ct);
        var resource = new QualificationAssignmentResource(
            assignmentId, QualificationResourceType.Link, input.DisplayName, input.DisplayNameAr,
            "", "", "", 0, input.Url, input.DisplayOrder, input.IsRequired, clock.GetUtcNow());
        db.Add(resource);
        await db.SaveChangesAsync(ct);
        return ResourceDto(resource);
    }

    public async Task<CatalogResourceDto> AddFileResourceAsync(
        Guid assignmentId, Stream stream, string fileName, string contentType, long size,
        string displayName, string displayNameAr, int displayOrder, bool isRequired, CancellationToken ct)
    {
        await Required(db.QualificationTopics, assignmentId, ct);
        var stored = await files.StorePrivateFileAsync(
            stream, fileName, contentType, size, "qualification-resources", ct);
        var resource = new QualificationAssignmentResource(
            assignmentId, QualificationResourceType.File, displayName, displayNameAr,
            Path.GetFileName(fileName), stored.StorageKey, stored.ContentType, stored.Size,
            null, displayOrder, isRequired, clock.GetUtcNow());
        db.Add(resource);
        await db.SaveChangesAsync(ct);
        return ResourceDto(resource);
    }

    public async Task<CatalogFile> OpenResourceAsync(Guid resourceId, CancellationToken ct)
    {
        var resource = await db.QualificationAssignmentResources.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == resourceId
                && x.ResourceType == QualificationResourceType.File
                && db.QualificationTopics.Any(a => a.Id == x.QualificationAssignmentId && a.IsActive), ct)
            ?? throw new DomainException("qualification_resource_not_found", "Qualification resource was not found.");
        return new(await files.OpenPrivateFileAsync(resource.StorageKey, ct),
            resource.ContentType, resource.OriginalFileName);
    }

    private static CatalogResourceDto ResourceDto(QualificationAssignmentResource resource) =>
        new(resource.Id, resource.DisplayName, resource.DisplayNameAr,
            resource.ResourceType == QualificationResourceType.File
                ? $"/api/v1/qualification-resources/{resource.Id}/content" : resource.Url,
            resource.DisplayOrder, resource.IsRequired, resource.ResourceType == QualificationResourceType.File,
            resource.OriginalFileName, resource.ContentType);

    private async Task RequireActiveSubject(Guid id, CancellationToken ct)
    {
        if (!await db.Subjects.AnyAsync(x => x.Id == id && x.IsActive, ct))
            throw new DomainException("subject_not_found", "An active subject is required.");
    }

    private async Task<CatalogItemDto> AddAsync<T>(T item, Func<T, CatalogItemDto> map, CancellationToken ct)
        where T : CatalogItem
    {
        db.Add(item);
        await SaveCatalogAsync(ct);
        return map(item);
    }

    private async Task SaveCatalogAsync(CancellationToken ct)
    {
        try
        {
            var changes = db.ChangeTracker.Entries<CatalogItem>()
                .Where(x => x.State is EntityState.Added or EntityState.Modified).ToArray();
            foreach (var entry in changes)
                audit.AddCurrent(
                    entry.State == EntityState.Added ? "CatalogItemCreated" : "CatalogItemUpdated",
                    entry.Entity.GetType().Name,
                    entry.Entity.Id.ToString(),
                    entry.State == EntityState.Added ? "Catalog item created." : "Catalog item updated.");
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException exception)
        {
            if (IsUniqueCodeViolation(exception))
                throw new DomainException(
                    "catalog_code_duplicate",
                    "A service catalog item with the same code already exists.");
            throw new DomainException(
                "catalog_name_conflict",
                "A catalog item with the same normalized name already exists in this scope.");
        }
    }

    private static bool IsUniqueCodeViolation(DbUpdateException exception)
    {
        for (var current = exception.InnerException; current is not null; current = current.InnerException)
        {
            var message = current.Message;
            if (message.Contains("IX_ServiceCatalogItems_Code", StringComparison.OrdinalIgnoreCase)
                || message.Contains("ServiceCatalogItems_Code", StringComparison.OrdinalIgnoreCase)
                || (message.Contains("UNIQUE", StringComparison.OrdinalIgnoreCase)
                    && message.Contains("Code", StringComparison.OrdinalIgnoreCase)))
                return true;
        }
        return false;
    }

    private static async Task<T> Required<T>(DbSet<T> set, Guid id, CancellationToken ct) where T : CatalogItem =>
        await set.FindAsync([id], ct)
        ?? throw new DomainException("catalog_item_not_found", "Catalog item was not found.");

    private static IQueryable<T> Query<T>(DbSet<T> set, bool includeInactive) where T : CatalogItem =>
        includeInactive ? set.AsNoTracking() : set.AsNoTracking().Where(x => x.IsActive);
}
