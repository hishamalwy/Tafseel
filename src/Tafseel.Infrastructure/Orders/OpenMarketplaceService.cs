using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Tafseel.Application.Catalog;
using Tafseel.Application.Common;
using Tafseel.Application.Orders;
using Tafseel.Domain.Common;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Marketplace;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Orders;

internal sealed class OpenMarketplaceService(
    TafseelDbContext db,
    NotificationWriter notifications,
    TimeProvider clock, Microsoft.Extensions.Options.IOptions<OpenMarketplaceOptions> options) : IOpenMarketplaceService
{
    private readonly OpenMarketplaceOptions _options = options.Value;
    public async Task<OpenRequestDto> PublishAsync(
        string studentId, CreateOpenLearningRequest input, CancellationToken ct)
    {
        var subject = await db.Subjects.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == input.SubjectId && x.IsActive, ct)
            ?? throw new DomainException("subject_not_found", "Subject was not found.");
        var catalog = await db.ServiceCatalogItems
            .SingleOrDefaultAsync(x => x.Id == input.ServiceCatalogItemId
                && x.IsActive && x.IsPublic && x.TeacherSelectable && !x.RequiresScheduling, ct)
            ?? throw new DomainException("service_not_found", "Service was not found.");
        ServiceCatalogPolicyValidator.EnsureAsyncRequest(catalog);
        var request = new LearningRequest(
            studentId, subject.Id, input.Title, input.Requirements, input.Deadline,
            input.BudgetMin, input.BudgetMax, clock.GetUtcNow());
        request.CaptureServiceIdentity(catalog);
        if (input.DraftId is { } draftId)
        {
            // Upload first: the student's own draft hands its already-scanned files to the request, and goes.
            var draft = await db.OpenRequestDrafts.Include(x => x.Attachments)
                .SingleOrDefaultAsync(x => x.Id == draftId && x.StudentId == studentId, ct)
                ?? throw new DomainException("draft_not_found", "The draft was not found.");
            foreach (var file in draft.Attachments.OrderBy(x => x.CreatedAt))
                request.AddAttachment(studentId, file.StorageKey, file.OriginalName, file.ContentType, file.Size, clock.GetUtcNow());
            db.Remove(draft);
        }
        db.Add(request);
        await db.SaveChangesAsync(ct);
        return Map(request, subject.Name, subject.NameAr, catalog.Name, catalog.NameAr, 0);
    }

    public async Task<PagedResult<OpenRequestDto>> GetOpportunitiesAsync(
        string teacherId, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var query = EligibleRequests(teacherId).AsNoTracking();
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.PreferredDeliveryAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Include(x => x.Attachments).AsSplitQuery()
            .ToArrayAsync(ct);
        var subjects = await db.Subjects.AsNoTracking().Where(x => rows.Select(r => r.SubjectId).Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var services = await db.ServiceCatalogItems.AsNoTracking()
            .Where(x => rows.Select(r => r.ServiceCatalogItemId).Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var ids = rows.Select(x => x.Id).ToArray();
        var counts = await db.TeacherOffers.AsNoTracking().Where(x => ids.Contains(x.LearningRequestId)
                && (x.Status == TeacherOfferStatus.Submitted || x.Status == TeacherOfferStatus.Selected))
            .GroupBy(x => x.LearningRequestId).Select(x => new { Id = x.Key, Count = x.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count, ct);
        var myOffers = await db.TeacherOffers.AsNoTracking()
            .Where(x => ids.Contains(x.LearningRequestId) && x.TeacherId == teacherId)
            .ToDictionaryAsync(x => x.LearningRequestId, ct);
        return new(rows.Select(x =>
        {
            var subject = subjects[x.SubjectId!.Value];
            var service = services[x.ServiceCatalogItemId!.Value];
            return Map(x, subject.Name, subject.NameAr, service.Name, service.NameAr,
                counts.GetValueOrDefault(x.Id), myOffers.GetValueOrDefault(x.Id) is { } offer ? MapOwnOffer(offer) : null);
        }).ToArray(), page, pageSize, total);
    }

    public async Task<PagedResult<TeacherOfferHistoryDto>> GetMyOffersAsync(
        string teacherId, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var query = db.TeacherOffers.AsNoTracking().Where(x => x.TeacherId == teacherId);
        var total = await query.CountAsync(ct);
        var offers = await query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToArrayAsync(ct);
        var requestIds = offers.Select(x => x.LearningRequestId).Distinct().ToArray();
        var requests = await db.LearningRequests.AsNoTracking().Where(x => requestIds.Contains(x.Id))
            .Select(x => new { x.Id, x.Title, x.SubjectId, x.ServiceCatalogItemId, x.Status, x.SelectedOfferId })
            .ToDictionaryAsync(x => x.Id, ct);
        var subjectIds = requests.Values.Select(x => x.SubjectId).OfType<Guid>().Distinct().ToArray();
        var serviceIds = requests.Values.Select(x => x.ServiceCatalogItemId).OfType<Guid>().Distinct().ToArray();
        var subjects = await db.Subjects.AsNoTracking().Where(x => subjectIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var services = await db.ServiceCatalogItems.AsNoTracking().Where(x => serviceIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var orders = await db.Orders.AsNoTracking()
            .Where(x => requestIds.Contains(x.LearningRequestId) && x.TeacherId == teacherId)
            .Select(x => new { x.Id, x.LearningRequestId }).ToDictionaryAsync(x => x.LearningRequestId, x => x.Id, ct);
        return new(offers.Select(offer =>
        {
            var request = requests[offer.LearningRequestId];
            var subject = request.SubjectId is { } subjectId ? subjects.GetValueOrDefault(subjectId) : null;
            var service = request.ServiceCatalogItemId is { } serviceId ? services.GetValueOrDefault(serviceId) : null;
            var someoneElse = offer.Status == TeacherOfferStatus.NotSelected
                || request.Status == LearningRequestStatus.ConvertedToOrder && !orders.ContainsKey(request.Id);
            return new TeacherOfferHistoryDto(
                offer.Id, request.Id, request.Title,
                subject?.Name ?? "", subject?.NameAr, service?.Name ?? "", service?.NameAr,
                offer.Amount, offer.Currency, offer.DeliveryHours, offer.Status, request.Status, someoneElse,
                orders.TryGetValue(request.Id, out var orderId) ? orderId : null,
                offer.CreatedAt, offer.UpdatedAt, offer.ValidUntil);
        }).ToArray(), page, pageSize, total);
    }

    public async Task<OpenRequestDto> GetOpportunityAsync(
        string teacherId, Guid requestId, CancellationToken ct)
    {
        var request = await EligibleRequests(teacherId).AsNoTracking().Include(x => x.Attachments)
            .SingleOrDefaultAsync(x => x.Id == requestId, ct)
            ?? throw new DomainException("opportunity_not_found", "Opportunity was not found.");
        var subject = await db.Subjects.AsNoTracking().SingleAsync(x => x.Id == request.SubjectId, ct);
        var service = await db.ServiceCatalogItems.AsNoTracking()
            .SingleAsync(x => x.Id == request.ServiceCatalogItemId, ct);
        var count = await db.TeacherOffers.CountAsync(x => x.LearningRequestId == request.Id
            && (x.Status == TeacherOfferStatus.Submitted || x.Status == TeacherOfferStatus.Selected), ct);
        var myOffer = await db.TeacherOffers.AsNoTracking().SingleOrDefaultAsync(
            x => x.LearningRequestId == request.Id && x.TeacherId == teacherId, ct);
        return Map(request, subject.Name, subject.NameAr, service.Name, service.NameAr, count,
            myOffer is null ? null : MapOwnOffer(myOffer));
    }

    public async Task<OpenRequestDto> GetStudentRequestAsync(
        string studentId, Guid requestId, CancellationToken ct)
    {
        var row = await (from request in db.LearningRequests.AsNoTracking().Include(x => x.Attachments)
                         join subject in db.Subjects.AsNoTracking() on request.SubjectId equals subject.Id
                         join service in db.ServiceCatalogItems.AsNoTracking() on request.ServiceCatalogItemId equals service.Id
                         where request.Id == requestId && request.StudentId == studentId
                             && request.SourcingMode == RequestSourcingMode.OpenMarketplace
                         select new OpportunityRow(request, subject.Name, subject.NameAr, service.Name, service.NameAr,
                             db.TeacherOffers.Count(x => x.LearningRequestId == request.Id
                                 && x.Status != TeacherOfferStatus.Withdrawn && x.Status != TeacherOfferStatus.Expired)))
            .SingleOrDefaultAsync(ct)
            ?? throw new DomainException("request_not_owned", "Learning request was not found.");
        return Map(row.Request, row.SubjectName, row.SubjectNameAr,
            row.ServiceName, row.ServiceNameAr, row.OfferCount);
    }

    public async Task<TeacherOfferDto> SubmitOfferAsync(
        string teacherId, Guid requestId, SubmitTeacherOffer input, CancellationToken ct)
    {
        var request = await RequireEligibleRequestAsync(teacherId, requestId, ct);
        var catalog = await db.ServiceCatalogItems.SingleAsync(x => x.Id == request.ServiceCatalogItemId, ct);
        ServiceCatalogPolicyValidator.EnsureOfferingTerms(
            catalog, input.Amount, "SAR", input.DeliveryHours, catalog.DefaultRevisions);
        var service = await ActiveServiceAsync(teacherId, request.SubjectId!.Value,
            request.ServiceCatalogItemId!.Value, ct);
        var existing = await db.TeacherOffers.SingleOrDefaultAsync(
            x => x.LearningRequestId == requestId && x.TeacherId == teacherId, ct);
        if (existing is null)
        {
            existing = new(requestId, teacherId, service.Id,
                input.Amount, input.DeliveryHours, input.IncludedRevisions, input.Message,
                clock.GetUtcNow().AddHours(input.ValidityHours), clock.GetUtcNow());
            db.Add(existing);
        }
        else if (existing.Status == TeacherOfferStatus.Withdrawn)
            existing.Resubmit(teacherId, input.Amount, input.DeliveryHours, input.IncludedRevisions,
                input.Message, clock.GetUtcNow().AddHours(input.ValidityHours), clock.GetUtcNow());
        else
            throw new DomainException("offer_already_exists", "Update the existing Offer instead.");
        await notifications.QueueAsync(request.StudentId, "OfferReceived", "New Teacher Offer",
            request.Title, AppRoutes.RequestOffers(request.Id), $"offer:{existing.Id}:submitted", true, ct);
        await db.SaveChangesAsync(ct);
        return await MapOfferAsync(existing, includeTeacher: false, ct);
    }

    public async Task<TeacherOfferDto> UpdateOfferAsync(
        string teacherId, Guid offerId, SubmitTeacherOffer input, string version, CancellationToken ct)
    {
        var offer = await db.TeacherOffers.SingleOrDefaultAsync(x => x.Id == offerId && x.TeacherId == teacherId, ct)
            ?? throw new DomainException("offer_not_owned", "Offer was not found.");
        await RequireEligibleRequestAsync(teacherId, offer.LearningRequestId, ct);
        ApplyVersion(offer, version);
        var request = await db.LearningRequests.AsNoTracking().SingleAsync(x => x.Id == offer.LearningRequestId, ct);
        var catalog = await db.ServiceCatalogItems.SingleAsync(x => x.Id == request.ServiceCatalogItemId, ct);
        ServiceCatalogPolicyValidator.EnsureOfferingTerms(
            catalog, input.Amount, "SAR", input.DeliveryHours, catalog.DefaultRevisions);
        offer.Update(teacherId, input.Amount, input.DeliveryHours, input.IncludedRevisions,
            input.Message, clock.GetUtcNow().AddHours(input.ValidityHours), clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
        return await MapOfferAsync(offer, includeTeacher: false, ct);
    }

    public async Task WithdrawOfferAsync(
        string teacherId, Guid offerId, string version, CancellationToken ct)
    {
        var offer = await db.TeacherOffers.SingleOrDefaultAsync(x => x.Id == offerId && x.TeacherId == teacherId, ct)
            ?? throw new DomainException("offer_not_owned", "Offer was not found.");
        ApplyVersion(offer, version);
        offer.Withdraw(teacherId, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyCollection<TeacherOfferDto>> GetStudentOffersAsync(
        string studentId, Guid requestId, CancellationToken ct)
    {
        if (!await db.LearningRequests.AsNoTracking().AnyAsync(
                x => x.Id == requestId && x.StudentId == studentId
                    && x.SourcingMode == RequestSourcingMode.OpenMarketplace, ct))
            throw new DomainException("request_not_owned", "Learning request was not found.");
        var offers = await db.TeacherOffers.AsNoTracking()
            .Where(x => x.LearningRequestId == requestId
                && x.Status != TeacherOfferStatus.Withdrawn
                && x.Status != TeacherOfferStatus.Expired
                && x.ValidUntil > clock.GetUtcNow())
            .OrderBy(x => x.CreatedAt).ToArrayAsync(ct);
        var result = new List<TeacherOfferDto>(offers.Length);
        foreach (var offer in offers) result.Add(await MapOfferAsync(offer, includeTeacher: true, ct));
        return result;
    }

    public async Task<TeacherOfferDto> GetMyOfferAsync(
        string teacherId, Guid requestId, CancellationToken ct)
    {
        var offer = await db.TeacherOffers.AsNoTracking().SingleOrDefaultAsync(
            x => x.LearningRequestId == requestId && x.TeacherId == teacherId, ct)
            ?? throw new DomainException("offer_not_owned", "Offer was not found.");
        return await MapOfferAsync(offer, includeTeacher: false, ct);
    }

    public async Task SelectOfferAsync(
        string studentId, Guid requestId, Guid offerId,
        string requestVersion, string offerVersion, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"open-request:{requestId}", ct);
        var request = await db.LearningRequests.SingleOrDefaultAsync(x => x.Id == requestId && x.StudentId == studentId, ct)
            ?? throw new DomainException("request_not_owned", "Learning request was not found.");
        var offer = await db.TeacherOffers.SingleOrDefaultAsync(
            x => x.Id == offerId && x.LearningRequestId == requestId, ct)
            ?? throw new DomainException("offer_not_found", "Offer was not found.");
        ApplyVersion(request, requestVersion);
        ApplyVersion(offer, offerVersion);
        await RequireEligibleRequestAsync(offer.TeacherId, requestId, ct);
        var now = clock.GetUtcNow();
        if (now >= offer.ValidUntil)
        {
            offer.Expire(now);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            throw new DomainException("offer_expired", "The Offer has expired.");
        }
        request.SelectOffer(studentId, offerId, now, _options.OfferReservationMinutes);
        offer.Select(now);
        await notifications.QueueAsync(offer.TeacherId, "OfferSelected", "Your Offer was selected",
            $"The Student has {_options.OfferReservationMinutes} minutes to complete payment.", AppRoutes.Request(request.Id),
            $"offer:{offer.Id}:selected", true, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task CancelSelectionAsync(
        string studentId, Guid requestId, string requestVersion, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockAsync($"open-request:{requestId}", ct);
        var request = await db.LearningRequests.SingleOrDefaultAsync(x => x.Id == requestId && x.StudentId == studentId, ct)
            ?? throw new DomainException("request_not_owned", "Learning request was not found.");
        ApplyVersion(request, requestVersion);
        var offer = request.SelectedOfferId is Guid id
            ? await db.TeacherOffers.SingleAsync(x => x.Id == id, ct)
            : throw new DomainException("invalid_request_transition", "The learning request transition is not allowed.");
        request.CancelOfferSelection(studentId, clock.GetUtcNow());
        offer.Reopen(clock.GetUtcNow());
        var payments = await db.Payments.Where(x => x.LearningRequestId == request.Id
            && x.Status == Domain.Finance.PaymentStatus.Pending).ToArrayAsync(ct);
        foreach (var payment in payments) payment.Fail(clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private IQueryable<LearningRequest> EligibleRequests(string teacherId)
    {
        var now = clock.GetUtcNow();
        return db.LearningRequests.Where(request =>
                request.SourcingMode == RequestSourcingMode.OpenMarketplace
                && ((request.Status == LearningRequestStatus.OpenForOffers
                        && request.PreferredDeliveryAt > now)
                    || (request.Status == LearningRequestStatus.AwaitingPayment
                        && db.TeacherOffers.Any(offer => offer.Id == request.SelectedOfferId
                            && offer.TeacherId == teacherId
                            && offer.Status == TeacherOfferStatus.Selected)))
                && request.StudentId != teacherId
                && db.Subjects.Any(subject => subject.Id == request.SubjectId && subject.IsActive)
                && db.ServiceCatalogItems.Any(service => service.Id == request.ServiceCatalogItemId
                    && service.IsActive && service.IsPublic && service.TeacherSelectable
                    && !service.RequiresScheduling && service.OrderType == Domain.Catalog.ServiceOrderTypes.AsyncRequest)
                && TeacherPublicQueries.EligibleServices(db, true).Any(x => x.TeacherId == teacherId
                    && x.SubjectId == request.SubjectId && x.ServiceCatalogItemId == request.ServiceCatalogItemId
                    && x.IsActive && x.SupersededByTeacherServiceId == null));
    }

    private async Task<LearningRequest> RequireEligibleRequestAsync(
        string teacherId, Guid requestId, CancellationToken ct) =>
        (await EligibleRequests(teacherId).SingleOrDefaultAsync(x => x.Id == requestId, ct))
        ?? throw new DomainException("opportunity_not_found", "Opportunity was not found.");

    private async Task<Domain.Marketplace.TeacherService> ActiveServiceAsync(
        string teacherId, Guid subjectId, Guid catalogId, CancellationToken ct) =>
        await db.TeacherServices.SingleOrDefaultAsync(x => x.TeacherId == teacherId
            && x.SubjectId == subjectId && x.ServiceCatalogItemId == catalogId
            && x.IsActive && x.SupersededByTeacherServiceId == null, ct)
        ?? throw new DomainException("teacher_service_not_found", "Teacher service was not found.");

    private async Task<TeacherOfferDto> MapOfferAsync(TeacherOffer offer, bool includeTeacher, CancellationToken ct)
    {
        string? name = null, englishName = null;
        decimal? rating = null;
        var reviews = 0;
        if (includeTeacher)
        {
            var user = await db.Users.AsNoTracking().Where(x => x.Id == offer.TeacherId)
                .Select(x => new { x.FullName, x.FullNameEnglish }).SingleAsync(ct);
            var profile = await db.TeacherProfiles.AsNoTracking().Where(x => x.TeacherId == offer.TeacherId)
                .Select(x => new { x.AverageRating, x.RatingCount }).SingleAsync(ct);
            name = user.FullName;
            englishName = user.FullNameEnglish;
            rating = profile.AverageRating;
            reviews = profile.RatingCount;
        }
        return new(offer.Id, offer.LearningRequestId, offer.TeacherId, offer.Amount, offer.Currency,
            offer.DeliveryHours, offer.Message, offer.Status, offer.CreatedAt, offer.UpdatedAt,
            Convert.ToBase64String(offer.RowVersion), name, englishName, rating, reviews,
            ProfileUrl: includeTeacher ? AppRoutes.TeacherProfile(offer.TeacherId) : null,
            IncludedRevisions: offer.IncludedRevisions, ValidUntil: offer.ValidUntil);
    }

    private static TeacherOfferDto MapOwnOffer(TeacherOffer offer) =>
        new(offer.Id, offer.LearningRequestId, offer.TeacherId, offer.Amount, offer.Currency,
            offer.DeliveryHours, offer.Message, offer.Status, offer.CreatedAt, offer.UpdatedAt,
            Convert.ToBase64String(offer.RowVersion), IncludedRevisions: offer.IncludedRevisions, ValidUntil: offer.ValidUntil);

    private static OpenRequestDto Map(
        LearningRequest request, string subject, string? subjectAr,
        string service, string? serviceAr, int offerCount, TeacherOfferDto? myOffer = null) =>
        new(request.Id, request.SubjectId!.Value, request.ServiceCatalogItemId!.Value,
            request.Title, request.Description, request.PreferredDeliveryAt, request.BudgetMin, request.BudgetMax,
            "SAR", request.Status, request.PublishedAt!.Value, request.PaymentReservationExpiresAt,
            request.SelectedOfferId, subject, subjectAr, service, serviceAr,
            request.Attachments.Select(x => new AttachmentDto(
                x.Id, x.OriginalName, x.ContentType, x.Size, x.CreatedAt)).ToArray(),
            Convert.ToBase64String(request.RowVersion), offerCount, myOffer);

    private void ApplyVersion(LearningRequest item, string version) =>
        db.Entry(item).Property(x => x.RowVersion).OriginalValue = DecodeVersion(version);
    private void ApplyVersion(TeacherOffer item, string version) =>
        db.Entry(item).Property(x => x.RowVersion).OriginalValue = DecodeVersion(version);
    private static byte[] DecodeVersion(string version)
    {
        try { return Convert.FromBase64String(version.Trim('"')); }
        catch { throw new DomainException("invalid_concurrency_token", "The resource version is invalid."); }
    }
    /// <summary>Verified transaction-scoped lock; throws rather than continuing unlocked.</summary>
    private Task LockAsync(string resource, CancellationToken ct) =>
        db.Database.AcquireAsync(resource, ct);

    private sealed record OpportunityRow(
        LearningRequest Request, string SubjectName, string? SubjectNameAr,
        string ServiceName, string? ServiceNameAr, int OfferCount);
}

internal sealed class OpenMarketplaceReservationExpiryService(
    TafseelDbContext db, NotificationWriter notifications, TimeProvider clock)
{
    public async Task RunAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var reminders = await db.LearningRequests.AsNoTracking()
            .Where(x => x.Status == LearningRequestStatus.AwaitingPayment
                && x.PaymentReservationExpiresAt > now
                && x.PaymentReservationExpiresAt <= now.AddMinutes(30))
            .Select(x => new { x.Id, x.StudentId, x.PaymentReservationExpiresAt }).ToArrayAsync(ct);
        foreach (var item in reminders)
        {
            var minutes = Math.Max(1, (int)Math.Ceiling((item.PaymentReservationExpiresAt!.Value - now).TotalMinutes));
            await notifications.QueueAsync(item.StudentId, "OfferReservationReminder",
                "Complete payment to keep your Offer",
                $"Your selected Offer reservation expires in about {minutes} minutes.",
                AppRoutes.Request(item.Id),
                $"request:{item.Id}:reservation-reminder:{item.PaymentReservationExpiresAt.Value.UtcTicks}", true, ct);
        }
        if (reminders.Length > 0) await db.SaveChangesAsync(ct);
        var ids = await db.LearningRequests.AsNoTracking()
            .Where(x => x.Status == LearningRequestStatus.AwaitingPayment
                && x.PaymentReservationExpiresAt <= now)
            .Select(x => x.Id).ToArrayAsync(ct);
        foreach (var id in ids)
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            await db.Database.AcquireAsync("open-request:" + id, ct);
            var request = await db.LearningRequests.SingleAsync(x => x.Id == id, ct);
            if (request.Status != LearningRequestStatus.AwaitingPayment
                || request.PaymentReservationExpiresAt > now || request.SelectedOfferId is not Guid offerId)
            {
                await tx.CommitAsync(ct);
                continue;
            }
            var offer = await db.TeacherOffers.SingleAsync(x => x.Id == offerId, ct);
            if (!request.ExpireOfferSelection(now))
            {
                await tx.CommitAsync(ct);
                continue;
            }
            offer.Reopen(now);
            var pendingPayments = await db.Payments.Where(x =>
                x.LearningRequestId == request.Id && x.Status == Domain.Finance.PaymentStatus.Pending).ToArrayAsync(ct);
            foreach (var payment in pendingPayments) payment.Fail(now);
            await notifications.QueueAsync(request.StudentId, "OfferReservationExpired", "Offer reservation expired",
                "The request is open for Offers again.", AppRoutes.RequestOffers(request.Id),
                $"request:{request.Id}:reservation-expired:{now.UtcTicks}", true, ct);
            await notifications.QueueAsync(offer.TeacherId, "OfferReservationExpired", "Offer selection expired",
                "Your Offer is available to the Student again.", AppRoutes.Request(request.Id),
                $"offer:{offer.Id}:reservation-expired:{now.UtcTicks}", true, ct);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }

        var expiringIds = await db.LearningRequests.AsNoTracking()
            .Where(x => x.SourcingMode == RequestSourcingMode.OpenMarketplace
                && x.Status == LearningRequestStatus.OpenForOffers
                && x.PreferredDeliveryAt <= now)
            .OrderBy(x => x.PreferredDeliveryAt).ThenBy(x => x.Id)
            .Select(x => x.Id).Take(100).ToArrayAsync(ct);
        foreach (var id in expiringIds)
        {
            await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
            await db.Database.AcquireAsync("open-request:" + id, ct);
            var request = await db.LearningRequests.SingleAsync(x => x.Id == id, ct);
            if (request.Expire(now))
            {
                foreach (var offer in await db.TeacherOffers.Where(x => x.LearningRequestId == id).ToArrayAsync(ct))
                    offer.Expire(now);
                await notifications.QueueAsync(request.StudentId, "RequestExpired", "Request expired",
                    "The request deadline passed without conversion to an Order.", AppRoutes.Request(id),
                    $"request:{id}:expired", true, ct);
                await db.SaveChangesAsync(ct);
            }
            await tx.CommitAsync(ct);
        }
    }
}
