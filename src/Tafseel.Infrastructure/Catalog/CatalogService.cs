using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Catalog;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Common;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Governance;

namespace Tafseel.Infrastructure.Catalog;

internal sealed class CatalogService(TafseelDbContext db, AuditWriter audit) : ICatalogService
{
    public async Task<IReadOnlyCollection<CatalogItemDto>> GetSubjectsAsync(bool includeInactive, CancellationToken ct) =>
        await Query(db.Subjects, includeInactive).Select(x => new CatalogItemDto(x.Id, x.Name, x.IsActive, x.Icon, null)).ToArrayAsync(ct);

    public async Task<IReadOnlyCollection<CatalogItemDto>> GetTopicsAsync(Guid? subjectId, bool qualificationOnly, bool includeInactive, CancellationToken ct)
    {
        if (qualificationOnly)
        {
            var query = Query(db.QualificationTopics, includeInactive);
            if (!includeInactive)
                query = query.Where(x => db.Subjects.Any(subject => subject.Id == x.SubjectId && subject.IsActive));
            if (subjectId.HasValue) query = query.Where(x => x.SubjectId == subjectId);
            return await query.Select(x => new CatalogItemDto(x.Id, x.Name, x.IsActive, x.Instructions, x.SubjectId)).ToArrayAsync(ct);
        }
        else
        {
            var query = Query(db.Topics, includeInactive);
            if (!includeInactive)
                query = query.Where(x => db.Subjects.Any(subject => subject.Id == x.SubjectId && subject.IsActive));
            if (subjectId.HasValue) query = query.Where(x => x.SubjectId == subjectId);
            return await query.Select(x => new CatalogItemDto(x.Id, x.Name, x.IsActive, x.Difficulty, x.SubjectId)).ToArrayAsync(ct);
        }
    }

    public async Task<IReadOnlyCollection<CatalogItemDto>> GetEducationLevelsAsync(bool includeInactive, CancellationToken ct) =>
        await Query(db.EducationLevels, includeInactive).Select(x => new CatalogItemDto(x.Id, x.Name, x.IsActive, null, null)).ToArrayAsync(ct);

    public async Task<IReadOnlyCollection<CatalogItemDto>> GetLanguagesAsync(bool includeInactive, CancellationToken ct) =>
        await Query(db.TeachingLanguages, includeInactive).Select(x => new CatalogItemDto(x.Id, x.Name, x.IsActive, x.Code, null)).ToArrayAsync(ct);

    public async Task<IReadOnlyCollection<CatalogItemDto>> GetServicesAsync(bool includeInactive, CancellationToken ct) =>
        await Query(db.ServiceCatalogItems, includeInactive).Select(x => new CatalogItemDto(x.Id, x.Name, x.IsActive, x.Description, null)).ToArrayAsync(ct);

    public Task<CatalogItemDto> CreateSubjectAsync(SubjectInput input, CancellationToken ct) =>
        AddAsync(new Subject(input.Name, input.Icon), x => new(x.Id, x.Name, x.IsActive, x.Icon), ct);

    public async Task<CatalogItemDto> CreateTopicAsync(TopicInput input, CancellationToken ct)
    {
        await RequireActiveSubject(input.SubjectId, ct);
        return await AddAsync(new Topic(input.SubjectId, input.Name, input.Difficulty),
            x => new(x.Id, x.Name, x.IsActive, x.Difficulty, x.SubjectId), ct);
    }

    public async Task<CatalogItemDto> CreateQualificationTopicAsync(QualificationTopicInput input, CancellationToken ct)
    {
        await RequireActiveSubject(input.SubjectId, ct);
        return await AddAsync(new QualificationTopic(input.SubjectId, input.Name, input.Instructions, input.MaxVideoSeconds),
            x => new(x.Id, x.Name, x.IsActive, x.Instructions, x.SubjectId), ct);
    }

    public Task<CatalogItemDto> CreateEducationLevelAsync(NamedCatalogInput input, CancellationToken ct) =>
        AddAsync(new EducationLevel(input.Name), x => new(x.Id, x.Name, x.IsActive), ct);

    public Task<CatalogItemDto> CreateLanguageAsync(NamedCatalogInput input, CancellationToken ct) =>
        AddAsync(new TeachingLanguage(input.Name, input.Detail ?? ""),
            x => new(x.Id, x.Name, x.IsActive, x.Code), ct);

    public Task<CatalogItemDto> CreateServiceAsync(NamedCatalogInput input, CancellationToken ct) =>
        AddAsync(new ServiceCatalogItem(input.Name, input.Detail ?? ""),
            x => new(x.Id, x.Name, x.IsActive, x.Description), ct);

    public async Task UpdateAsync(string type, Guid id, NamedCatalogInput input, CancellationToken ct)
    {
        switch (type.ToLowerInvariant())
        {
            case "subjects":
                (await Required(db.Subjects, id, ct)).Update(input.Name, input.Detail ?? "");
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
                (await Required(db.ServiceCatalogItems, id, ct)).Update(input.Name, input.Detail ?? "");
                break;
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
        catch (DbUpdateException)
        {
            throw new DomainException(
                "catalog_name_conflict",
                "A catalog item with the same normalized name already exists in this scope.");
        }
    }

    private static async Task<T> Required<T>(DbSet<T> set, Guid id, CancellationToken ct) where T : CatalogItem =>
        await set.FindAsync([id], ct)
        ?? throw new DomainException("catalog_item_not_found", "Catalog item was not found.");

    private static IQueryable<T> Query<T>(DbSet<T> set, bool includeInactive) where T : CatalogItem =>
        includeInactive ? set.AsNoTracking() : set.AsNoTracking().Where(x => x.IsActive);
}
