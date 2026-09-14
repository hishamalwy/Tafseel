using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Tafseel.Application.Common;
using Tafseel.Application.Catalog;
using Tafseel.Application.Finance;
using Tafseel.Application.Orders;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Domain.Governance;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Marketplace;

namespace Tafseel.Infrastructure.Orders;

internal sealed class OrderService(
    TafseelDbContext db,
    IFileStorageService files,
    IFinancialService finance,
    NotificationWriter notifications,
    IOptions<FeeOptions> feeOptions,
    IOptions<OrderLifecycleOptions> lifecycleOptions,
    TimeProvider clock) : IOrderService
{
    private readonly FeeOptions _fees = feeOptions.Value;
    private readonly OrderLifecycleOptions _lifecycle = lifecycleOptions.Value;

    public async Task<LearningRequestDto> CreateRequestAsync(
        string studentId, CreateLearningRequest input, CancellationToken ct)
    {
        // Align with public CanRequest: active, public, teacher-selectable, non-scheduling services only.
        var row = await (
            from service in db.TeacherServices.AsNoTracking()
            join catalog in db.ServiceCatalogItems.AsNoTracking()
                on service.ServiceCatalogItemId equals catalog.Id
            where service.Id == input.TeacherServiceId && service.IsActive
                && service.SupersededByTeacherServiceId == null
                && catalog.IsActive && catalog.IsPublic && catalog.TeacherSelectable
                && !catalog.RequiresScheduling
                && db.Subjects.Any(subject => subject.Id == service.SubjectId && subject.IsActive)
                && db.TeacherSubjectQualifications.Any(q =>
                    q.TeacherId == service.TeacherId && q.SubjectId == service.SubjectId
                    && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
                && TeacherPublicQueries.EligibleServices(db, true)
                    .Any(eligible => eligible.Id == service.Id)
            select new { service, catalog }).SingleOrDefaultAsync(ct)
            ?? throw new DomainException("teacher_service_not_found", "Teacher service was not found.");
        ServiceCatalogPolicyValidator.EnsureAsyncRequest(row.catalog);
        ServiceCatalogPolicyValidator.EnsureOfferingTerms(
            row.catalog, row.service.Price, row.service.Currency, row.service.DeliveryHours, row.service.Revisions);
        var request = new LearningRequest(
            studentId, row.service.TeacherId, row.service.Id, input.Title, input.Description,
            input.PreferredDeliveryAt, input.Budget, clock.GetUtcNow());
        request.CaptureServiceIdentity(row.catalog);
        db.Add(request);
        await notifications.QueueAsync(row.service.TeacherId, "NewRequest", "New learning request",
            request.Title, AppRoutes.Request(request.Id), $"request:{request.Id}:created", true, ct);
        await db.SaveChangesAsync(ct);
        return await MapRequestAsync(request, ct);
    }

    public async Task<AttachmentDto> AddRequestAttachmentAsync(
        string studentId, Guid requestId, Stream stream, string fileName, string contentType,
        long size, string version, CancellationToken ct)
    {
        var request = await OwnedRequestAsync(studentId, requestId, student: true, version, ct);
        var stored = await files.StorePrivateFileAsync(
            stream, fileName, contentType, size, "request-attachments", ct);
        try
        {
            request.AddAttachment(
                studentId, stored.StorageKey, SafeName(fileName), stored.ContentType, stored.Size, clock.GetUtcNow());
            // Ensure the LearningRequest row is updated so SQL Server advances RowVersion for upload chaining.
            db.Entry(request).Property(x => x.UpdatedAt).IsModified = true;
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            await files.DeletePrivateFileAsync(stored.StorageKey, CancellationToken.None);
            throw;
        }
        // Return the updated request row version so clients can chain multi-file uploads safely.
        var requestVersion = Convert.ToBase64String(
            (byte[])db.Entry(request).Property(x => x.RowVersion).CurrentValue!);
        return Map(request.Attachments.Last(), requestVersion);
    }

    public async Task<PrivateFile> OpenRequestAttachmentAsync(string userId, Guid attachmentId, CancellationToken ct)
    {
        var item = await (
            from attachment in db.LearningRequestAttachments.AsNoTracking()
            join request in db.LearningRequests.AsNoTracking()
                on attachment.LearningRequestId equals request.Id
            where attachment.Id == attachmentId
                && (request.StudentId == userId || request.TeacherId == userId
                    || (request.SourcingMode == RequestSourcingMode.OpenMarketplace
                        && request.Status == LearningRequestStatus.OpenForOffers
                        && request.PreferredDeliveryAt > clock.GetUtcNow()
                        && db.Users.Any(user => user.Id == userId && !user.IsSuspended)
                        && db.TeacherProfiles.Any(profile => profile.TeacherId == userId && profile.IsPublished)
                        && db.Subjects.Any(subject => subject.Id == request.SubjectId && subject.IsActive)
                        && db.TeacherSubjectQualifications.Any(q => q.TeacherId == userId
                            && q.SubjectId == request.SubjectId
                            && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null))
                    || (request.Status == LearningRequestStatus.AwaitingPayment
                        && db.TeacherOffers.Any(offer => offer.Id == request.SelectedOfferId
                            && offer.TeacherId == userId && offer.Status == TeacherOfferStatus.Selected)
                        && db.Users.Any(user => user.Id == userId && !user.IsSuspended)
                        && db.TeacherProfiles.Any(profile => profile.TeacherId == userId && profile.IsPublished)
                        && db.TeacherSubjectQualifications.Any(q => q.TeacherId == userId
                            && q.SubjectId == request.SubjectId
                            && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)))
            select new { attachment.StorageKey, attachment.ContentType, attachment.OriginalName })
            .SingleOrDefaultAsync(ct)
            ?? throw new DomainException("attachment_not_owned", "Attachment was not found.");
        return new(await files.OpenPrivateFileAsync(item.StorageKey, ct), item.ContentType, item.OriginalName);
    }

    public Task<PagedResult<LearningRequestDto>> GetStudentRequestsAsync(
        string studentId, int page, int pageSize, CancellationToken ct) =>
        RequestPageAsync(db.LearningRequests.Where(x => x.StudentId == studentId), page, pageSize, ct);

    public Task<PagedResult<LearningRequestDto>> GetTeacherRequestsAsync(
        string teacherId, LearningRequestStatus? status, int page, int pageSize, CancellationToken ct)
    {
        var query = db.LearningRequests.Where(x => x.TeacherId == teacherId);
        if (status.HasValue) query = query.Where(x => x.Status == status);
        return RequestPageAsync(query, page, pageSize, ct);
    }

    public async Task RequestClarificationAsync(
        string teacherId, Guid requestId, string message, string version, CancellationToken ct)
    {
        var request = await OwnedRequestAsync(teacherId, requestId, student: false, version, ct);
        request.RequestClarification(teacherId, message, clock.GetUtcNow());
        await notifications.QueueAsync(request.StudentId, "ClarificationRequested",
            "Clarification requested", message, AppRoutes.Request(request.Id),
            $"request:{request.Id}:clarification:{request.UpdatedAt.UtcTicks}", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task ReplyClarificationAsync(
        string studentId, Guid requestId, string message, string version, CancellationToken ct)
    {
        var request = await OwnedRequestAsync(studentId, requestId, student: true, version, ct);
        request.ReplyToClarification(studentId, message, clock.GetUtcNow());
        await notifications.QueueAsync(request.TeacherId!, "ClarificationReplied",
            "Student replied", message, AppRoutes.Request(request.Id),
            $"request:{request.Id}:reply:{request.UpdatedAt.UtcTicks}", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task DeclineAsync(
        string teacherId, Guid requestId, string reason, string version, CancellationToken ct)
    {
        var request = await OwnedRequestAsync(teacherId, requestId, student: false, version, ct);
        request.Decline(teacherId, reason, clock.GetUtcNow());
        await notifications.QueueAsync(request.StudentId, "RequestDeclined", "Request declined",
            reason, AppRoutes.Request(request.Id), $"request:{request.Id}:declined", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task<OrderDto> AcceptAsync(
        string teacherId, Guid requestId, AcceptLearningRequest input,
        string idempotencyKey, string version, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey) || idempotencyKey.Trim().Length > 100)
            throw new DomainException("invalid_idempotency_key", "A valid Idempotency-Key header is required.");
        idempotencyKey = idempotencyKey.Trim();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        try
        {
            var request = await db.LearningRequests.SingleOrDefaultAsync(
                    x => x.Id == requestId && x.TeacherId == teacherId, ct)
                ?? throw new DomainException("request_not_owned", "Learning request was not found.");
            if (request.Status == LearningRequestStatus.Accepted
                && request.AcceptanceIdempotencyKey == idempotencyKey)
            {
                var existing = await OrderWithChildren().SingleAsync(x => x.LearningRequestId == requestId, ct);
                await transaction.CommitAsync(ct);
                return await MapOrderAsync(existing, teacherView: true, ct);
            }
            ApplyVersion(request, version);
            var row = await (
                from service in db.TeacherServices.AsNoTracking()
                join catalog in db.ServiceCatalogItems.AsNoTracking()
                    on service.ServiceCatalogItemId equals catalog.Id
                where service.Id == request.TeacherServiceId && service.TeacherId == teacherId
                    && catalog.IsActive
                    && db.Subjects.Any(subject => subject.Id == service.SubjectId && subject.IsActive)
                && db.TeacherSubjectQualifications.Any(q =>
                        q.TeacherId == teacherId && q.SubjectId == service.SubjectId
                        && q.Status == TeacherQualificationStatus.Approved && q.RevokedAt == null)
                select new { service, catalog }).SingleOrDefaultAsync(ct)
                ?? throw new DomainException("teacher_service_not_found", "Teacher service is no longer available.");
            if (!string.Equals(row.service.Currency, input.Currency, StringComparison.OrdinalIgnoreCase))
                throw new DomainException("currency_mismatch", "Accepted currency must match the teacher service.");
            var now = clock.GetUtcNow();
            var deliveryHours = input.DeliveryHours
                ?? Math.Max(1, (int)Math.Ceiling((input.AgreedDeliveryAt - now).TotalHours));
            ServiceCatalogPolicyValidator.EnsureAcceptedTerms(
                row.catalog, input.FinalPrice, input.Currency, now, now.AddHours(deliveryHours), input.RevisionAllowance);
            request.Accept(teacherId, idempotencyKey, now);
            var order = new Order(
                request.Id, request.StudentId, teacherId, row.service.Id, input.FinalPrice, input.Currency,
                _fees.StudentFeePercent, _fees.TeacherCommissionPercent, input.AgreedDeliveryAt,
                input.RevisionAllowance, now, deliveryHours);
            order.CaptureServiceIdentity(row.catalog);
            db.Add(order);
            await notifications.QueueAsync(request.StudentId, "PaymentRequired",
                "Request accepted — payment required", request.Title, AppRoutes.Order(order.Id),
                $"order:{order.Id}:payment-required", true, ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return await MapOrderAsync(order, teacherView: true, ct);
        }
        catch (Exception exception) when (exception is DbUpdateConcurrencyException or DbUpdateException)
        {
            await transaction.RollbackAsync(ct);
            db.ChangeTracker.Clear();
            var accepted = await db.LearningRequests.AsNoTracking().SingleOrDefaultAsync(x =>
                x.Id == requestId && x.TeacherId == teacherId
                && x.Status == LearningRequestStatus.Accepted
                && x.AcceptanceIdempotencyKey == idempotencyKey, ct);
            if (accepted is not null)
                return await MapOrderAsync(
                    await OrderWithChildren().SingleAsync(x => x.LearningRequestId == requestId, ct),
                    teacherView: true, ct);
            throw;
        }
    }

    public async Task CancelRequestAsync(
        string studentId, Guid requestId, string version, CancellationToken ct)
    {
        var request = await OwnedRequestAsync(studentId, requestId, student: true, version, ct);
        var now = clock.GetUtcNow();
        request.Cancel(studentId, now);
        if (request.SourcingMode == RequestSourcingMode.OpenMarketplace)
        {
            var offers = await db.TeacherOffers.Where(x => x.LearningRequestId == request.Id).ToArrayAsync(ct);
            foreach (var offer in offers) offer.Expire(now);
            var payments = await db.Payments.Where(x => x.LearningRequestId == request.Id
                && x.Status == Domain.Finance.PaymentStatus.Pending).ToArrayAsync(ct);
            foreach (var payment in payments) payment.Fail(now);
        }
        await db.SaveChangesAsync(ct);
    }

    public Task<PagedResult<OrderDto>> GetStudentOrdersAsync(
        string studentId, int page, int pageSize, CancellationToken ct) =>
        OrderPageAsync(db.Orders.Where(x => x.StudentId == studentId), page, pageSize, teacherView: false, ct);

    public Task<PagedResult<OrderDto>> GetTeacherOrdersAsync(
        string teacherId, int page, int pageSize, CancellationToken ct) =>
        OrderPageAsync(db.Orders.Where(x => x.TeacherId == teacherId), page, pageSize, teacherView: true, ct);

    public async Task<OrderDto> GetOwnedOrderAsync(string userId, Guid orderId, CancellationToken ct)
    {
        var order = await OrderWithChildren().AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == orderId && (x.StudentId == userId || x.TeacherId == userId), ct)
            ?? throw new DomainException("order_not_owned", "Order was not found.");
        return await MapOrderAsync(order, teacherView: order.TeacherId == userId, ct);
    }

    public async Task<LearningRequestDto> GetOwnedRequestAsync(string userId, Guid requestId, CancellationToken ct)
    {
        var request = await RequestWithChildren().AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == requestId && (x.StudentId == userId || x.TeacherId == userId), ct)
            ?? throw new DomainException("request_not_owned", "Learning request was not found.");
        return await MapRequestAsync(request, ct);
    }

    public async Task<IReadOnlyCollection<OrderTimelineEventDto>> GetTimelineAsync(
        string userId, Guid orderId, CancellationToken ct)
    {
        var ownership = await db.Orders.AsNoTracking()
            .Where(x => x.Id == orderId && (x.StudentId == userId || x.TeacherId == userId))
            .Select(x => new { x.StudentId, x.TeacherId })
            .SingleOrDefaultAsync(ct)
            ?? throw new DomainException("order_not_owned", "Order was not found.");

        var rows = new List<TimelineRow>(87);
        var history = await db.Set<OrderStatusHistory>().AsNoTracking()
            .Where(x => x.OrderId == orderId
                && (x.NextStatus == OrderStatus.AwaitingPayment
                    || x.NextStatus == OrderStatus.InProgress
                    || x.NextStatus == OrderStatus.Completed
                    || x.NextStatus == OrderStatus.Cancelled))
            .Select(x => new { x.Id, x.NextStatus, x.ActorId, x.CreatedAt })
            .ToArrayAsync(ct);
        rows.AddRange(history.Select(x => new TimelineRow(
            $"order-status:{x.Id:N}",
            x.NextStatus switch
            {
                OrderStatus.AwaitingPayment => "awaiting_payment",
                OrderStatus.InProgress => "work_started",
                OrderStatus.Completed => "completed",
                _ => "cancelled"
            },
            x.CreatedAt,
            ActorRole(x.ActorId, ownership.StudentId, ownership.TeacherId),
            10,
            null)));

        var payment = await db.Payments.AsNoTracking()
            .Where(x => x.OrderId == orderId)
            .Select(x => new { x.Id, x.ConfirmedAt, x.RefundedAt })
            .SingleOrDefaultAsync(ct);
        if (payment?.ConfirmedAt is DateTimeOffset confirmedAt)
            rows.Add(new(
                $"payment-confirmed:{payment.Id:N}", "payment_confirmed",
                confirmedAt, "system", 20, null));
        if (payment?.RefundedAt is DateTimeOffset refundedAt)
            rows.Add(new(
                $"payment-refunded:{payment.Id:N}", "payment_refunded",
                refundedAt, "system", 20, null));

        var deliveries = await db.OrderDeliveries.AsNoTracking()
            .Where(x => x.OrderId == orderId)
            .Select(x => new { x.Id, x.OriginalName, x.CreatedAt })
            .ToArrayAsync(ct);
        rows.AddRange(deliveries.Select(x => new TimelineRow(
            $"delivery:{x.Id:N}", "delivery_uploaded", x.CreatedAt, "teacher", 30,
            new(null, x.OriginalName))));

        var revisions = await db.Set<RevisionRequest>().AsNoTracking()
            .Where(x => x.OrderId == orderId)
            .Select(x => new { x.Id, x.Sequence, x.CreatedAt })
            .ToArrayAsync(ct);
        rows.AddRange(revisions.Select(x => new TimelineRow(
            $"revision:{x.Id:N}", "revision_requested", x.CreatedAt, "student", 40,
            new(x.Sequence))));

        return rows
            .OrderBy(x => x.OccurredAt)
            .ThenBy(x => x.SourcePriority)
            .ThenBy(x => x.Id, StringComparer.Ordinal)
            .Select(x => new OrderTimelineEventDto(
                x.Id, x.EventType, x.OccurredAt, x.ActorRole, x.Metadata))
            .ToArray();
    }

    public async Task StartOrderAsync(string teacherId, Guid orderId, string version, CancellationToken ct)
    {
        var order = await OwnedOrderAsync(teacherId, orderId, teacher: true, version, ct);
        order.Start(teacherId, clock.GetUtcNow());
        await notifications.QueueAsync(order.StudentId, "WorkStarted", "Teacher started work",
            "Your order is now in progress.", AppRoutes.Order(order.Id), $"order:{order.Id}:started", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task<DeliveryDto> DeliverAsync(
        string teacherId, Guid orderId, IReadOnlyList<DeliveryUpload> uploads, string message, string version,
        CancellationToken ct)
    {
        if (uploads is null || uploads.Count == 0)
            throw new DomainException("delivery_file_required", "At least one delivery file is required.");
        if (uploads.Count > TeacherMediaTypes.MaxFilesPerDelivery)
            throw new DomainException("delivery_file_limit", "Too many files in one delivery.");

        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        await db.Database.AcquireAsync($"dispute-order:{orderId}", ct);
        var order = await OwnedOrderAsync(teacherId, orderId, teacher: true, version, ct);
        if (await db.Disputes.AnyAsync(
                dispute => dispute.OrderId == orderId && dispute.Status != DisputeStatus.Resolved, ct))
            throw new DomainException("order_disputed", "The Order cannot be delivered while a dispute is open.");
        var stored = new List<StoredFile>(uploads.Count);
        try
        {
            foreach (var upload in uploads)
            {
                stored.Add(await files.StorePrivateFileAsync(
                    upload.Stream, upload.FileName, upload.ContentType, upload.Size, "order-deliveries", ct));
            }

            var package = stored.Select((file, index) => new OrderDeliveryFile(
                file.StorageKey, SafeName(uploads[index].FileName), file.ContentType, file.Size)).ToArray();
            order.Deliver(teacherId, package, message, clock.GetUtcNow());
            await notifications.QueueAsync(order.StudentId, "DeliveryUploaded", "Delivery uploaded",
                "Your teacher uploaded a delivery.", AppRoutes.Order(order.Id),
                $"order:{order.Id}:delivery:{order.Deliveries.Last().Id}", true, ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch
        {
            foreach (var file in stored)
                await files.DeletePrivateFileAsync(file.StorageKey, CancellationToken.None);
            throw;
        }
        return Map(order.Deliveries.Last());
    }

    public async Task<PrivateFile> OpenDeliveryAsync(string userId, Guid deliveryId, CancellationToken ct)
    {
        var item = await (
            from delivery in db.OrderDeliveries.AsNoTracking()
            join order in db.Orders.AsNoTracking() on delivery.OrderId equals order.Id
            where delivery.Id == deliveryId && (order.StudentId == userId || order.TeacherId == userId)
            select new { delivery.StorageKey, delivery.ContentType, delivery.OriginalName })
            .SingleOrDefaultAsync(ct)
            ?? throw new DomainException("delivery_not_owned", "Delivery was not found.");
        return new(await files.OpenPrivateFileAsync(item.StorageKey, ct), item.ContentType, item.OriginalName);
    }

    public async Task RequestRevisionAsync(
        string studentId, Guid orderId, string reason, string version, CancellationToken ct)
    {
        var order = await OwnedOrderAsync(studentId, orderId, teacher: false, version, ct);
        order.RequestRevision(studentId, reason, clock.GetUtcNow());
        await notifications.QueueAsync(order.TeacherId, "RevisionRequested", "Revision requested",
            reason, AppRoutes.Order(order.Id), $"order:{order.Id}:revision:{order.RevisionsUsed}", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task CompleteAsync(string studentId, Guid orderId, string version, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var order = await OwnedOrderAsync(studentId, orderId, teacher: false, version, ct);
        if (await db.Disputes.AnyAsync(
                x => x.OrderId == orderId && x.Status != DisputeStatus.Resolved, ct))
            throw new DomainException("order_disputed", "The Order cannot complete while a dispute is open.");
        order.Complete(studentId, clock.GetUtcNow());
        await finance.ReleaseOrderEscrowAsync(order, studentId, ct);
        await notifications.QueueAsync(order.TeacherId, "OrderCompleted", "Order completed",
            "The Student approved the delivery.", AppRoutes.Order(order.Id),
            $"order:{order.Id}:completed", true, ct);
        await notifications.QueueAsync(order.StudentId, "OrderCompleted", "Order completed",
            "You can rate this completed service when ready.", AppRoutes.Order(order.Id),
            $"order:{order.Id}:completed:student", true, ct);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public async Task CancelOrderAsync(string userId, Guid orderId, string version, CancellationToken ct)
    {
        var order = await db.Orders.SingleOrDefaultAsync(
                x => x.Id == orderId && (x.StudentId == userId || x.TeacherId == userId), ct)
            ?? throw new DomainException("order_not_owned", "Order was not found.");
        ApplyVersion(order, version);
        order.CancelBeforePayment(userId, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }

    public async Task RequestExtensionAsync(
        string userId, Guid orderId, RequestOrderExtension input, string version, CancellationToken ct)
    {
        var order = await ParticipantOrderAsync(userId, orderId, version, ct);
        order.RequestExtension(userId, input.ProposedDeliveryAt, input.Reason, clock.GetUtcNow());
        var other = userId == order.StudentId ? order.TeacherId : order.StudentId;
        await notifications.QueueAsync(other, "OrderExtensionRequested", "Delivery extension requested",
            input.Reason, AppRoutes.Order(order.Id), $"order:{order.Id}:extension:{order.Extensions.Last().Id}", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task RespondToExtensionAsync(
        string userId, Guid orderId, Guid extensionId, RespondOrderExtension input,
        string version, CancellationToken ct)
    {
        var order = await ParticipantOrderAsync(userId, orderId, version, ct);
        order.RespondToExtension(userId, extensionId, input.Accept, input.Response, clock.GetUtcNow());
        var other = userId == order.StudentId ? order.TeacherId : order.StudentId;
        await notifications.QueueAsync(other, "OrderExtensionDecided",
            input.Accept ? "Delivery extension accepted" : "Delivery extension declined",
            input.Response ?? "", AppRoutes.Order(order.Id),
            $"order:{order.Id}:extension:{extensionId}:decision", true, ct);
        await db.SaveChangesAsync(ct);
    }

    private async Task<LearningRequest> OwnedRequestAsync(
        string userId, Guid id, bool student, string version, CancellationToken ct)
    {
        var request = await RequestWithChildren().SingleOrDefaultAsync(
                x => x.Id == id && (student ? x.StudentId == userId : x.TeacherId == userId), ct)
            ?? throw new DomainException("request_not_owned", "Learning request was not found.");
        ApplyVersion(request, version);
        return request;
    }

    private async Task<Order> OwnedOrderAsync(
        string userId, Guid id, bool teacher, string version, CancellationToken ct)
    {
        var order = await OrderWithChildren().SingleOrDefaultAsync(
                x => x.Id == id && (teacher ? x.TeacherId == userId : x.StudentId == userId), ct)
            ?? throw new DomainException("order_not_owned", "Order was not found.");
        ApplyVersion(order, version);
        return order;
    }
    private async Task<Order> ParticipantOrderAsync(
        string userId, Guid id, string version, CancellationToken ct)
    {
        var order = await OrderWithChildren().SingleOrDefaultAsync(
                x => x.Id == id && (x.StudentId == userId || x.TeacherId == userId), ct)
            ?? throw new DomainException("order_not_owned", "Order was not found.");
        ApplyVersion(order, version);
        return order;
    }

    private async Task<PagedResult<LearningRequestDto>> RequestPageAsync(
        IQueryable<LearningRequest> query, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var count = await query.CountAsync(ct);
        var items = await query.AsNoTracking().OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Include(x => x.Attachments).Include(x => x.Clarifications).AsSplitQuery().ToArrayAsync(ct);
        var names = await ResolveUserNamesAsync(
            items.SelectMany(x => new[] { x.StudentId, x.TeacherId }).OfType<string>(), ct);
        /* Offer counts for the open-sourced rows on this page only — one grouped
           query, not one per row. Withdrawn and Expired Offers are excluded so the
           number matches OpenRequestDto.OfferCount on the request detail surface. */
        var openIds = items
            .Where(x => x.SourcingMode == RequestSourcingMode.OpenMarketplace)
            .Select(x => x.Id).ToArray();
        var offerCounts = openIds.Length == 0
            ? new Dictionary<Guid, int>()
            : await db.TeacherOffers.AsNoTracking()
                .Where(x => openIds.Contains(x.LearningRequestId)
                    && x.Status != TeacherOfferStatus.Withdrawn
                    && x.Status != TeacherOfferStatus.Expired)
                .GroupBy(x => x.LearningRequestId)
                .Select(g => new { g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        var requestIdsForOutcomes = items.Select(x => x.Id).ToArray();
        var outcomes = await db.Orders.AsNoTracking().Where(x => requestIdsForOutcomes.Contains(x.LearningRequestId))
            .Select(x => new RequestOutcome(x.LearningRequestId, x.Status, x.PaymentStatus))
            .ToDictionaryAsync(x => x.LearningRequestId, ct);
        return new(items.Select(x => Map(x, names,
                x.SourcingMode == RequestSourcingMode.OpenMarketplace
                    ? offerCounts.GetValueOrDefault(x.Id)
                    : null, outcomes.GetValueOrDefault(x.Id))).ToArray(),
            page, pageSize, count);
    }

    private async Task<PagedResult<OrderDto>> OrderPageAsync(
        IQueryable<Order> query, int page, int pageSize, bool teacherView, CancellationToken ct)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var count = await query.CountAsync(ct);
        var items = await query.AsNoTracking().OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Include(x => x.Deliveries).Include(x => x.Extensions).AsSplitQuery().ToArrayAsync(ct);
        var names = await ResolveUserNamesAsync(
            items.SelectMany(x => new[] { x.StudentId, x.TeacherId }), ct);
        var requestIds = items.Select(x => x.LearningRequestId).Distinct().ToArray();
        var titles = await db.LearningRequests.AsNoTracking()
            .Where(x => requestIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Title, ct);
        var reviews = await LoadReviewStatesAsync(items.Select(x => x.Id), ct);
        var orderIds = items.Select(x => x.Id).ToArray();
        var disputed = await db.Disputes.AsNoTracking().Where(x => x.OrderId.HasValue
                && orderIds.Contains(x.OrderId.Value))
            .Select(x => x.OrderId!.Value).ToArrayAsync(ct);
        return new(items.Select(x => Map(
                x, teacherView, names, titles.GetValueOrDefault(x.LearningRequestId),
                reviews.GetValueOrDefault(x.Id), clock.GetUtcNow(), disputed.Contains(x.Id))).ToArray(),
            page, pageSize, count);
    }

    private async Task<LearningRequestDto> MapRequestAsync(LearningRequest request, CancellationToken ct)
    {
        var names = await ResolveUserNamesAsync(
            new[] { request.StudentId, request.TeacherId }.OfType<string>(), ct);
        var outcome = await db.Orders.AsNoTracking().Where(x => x.LearningRequestId == request.Id)
            .Select(x => new RequestOutcome(x.LearningRequestId, x.Status, x.PaymentStatus)).SingleOrDefaultAsync(ct);
        return Map(request, names, outcome: outcome);
    }

    private async Task<OrderDto> MapOrderAsync(Order order, bool teacherView, CancellationToken ct)
    {
        var names = await ResolveUserNamesAsync([order.StudentId, order.TeacherId], ct);
        var title = await db.LearningRequests.AsNoTracking()
            .Where(x => x.Id == order.LearningRequestId)
            .Select(x => x.Title)
            .SingleOrDefaultAsync(ct);
        var reviews = await LoadReviewStatesAsync([order.Id], ct);
        var disputed = await db.Disputes.AsNoTracking().AnyAsync(x => x.OrderId == order.Id, ct);
        return Map(order, teacherView, names, title, reviews.GetValueOrDefault(order.Id), clock.GetUtcNow(), disputed);
    }

    private async Task<IReadOnlyDictionary<Guid, ReviewState>> LoadReviewStatesAsync(
        IEnumerable<Guid> orderIds, CancellationToken ct)
    {
        var ids = orderIds.Distinct().ToArray();
        if (ids.Length == 0)
            return new Dictionary<Guid, ReviewState>();
        var rows = await db.TeacherReviews.AsNoTracking()
            .Where(x => x.OrderId.HasValue && ids.Contains(x.OrderId.Value))
            .Select(x => new { OrderId = x.OrderId!.Value, x.OverallScore, x.OriginalComment, x.IsVisible, x.CreatedAt })
            .ToArrayAsync(ct);
        return rows.ToDictionary(
            x => x.OrderId,
            x => new ReviewState(true, x.OverallScore, x.OriginalComment, x.IsVisible, x.CreatedAt));
    }

    private readonly record struct ReviewState(
        bool HasReview, decimal OverallScore, string Comment, bool IsVisible, DateTimeOffset CreatedAt);

    private async Task<IReadOnlyDictionary<string, (string FullName, string? FullNameEnglish)>> ResolveUserNamesAsync(
        IEnumerable<string> userIds, CancellationToken ct)
    {
        var ids = userIds.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().ToArray();
        if (ids.Length == 0)
            return new Dictionary<string, (string, string?)>();
        var rows = await db.Users.AsNoTracking()
            .Where(u => ids.Contains(u.Id))
            .Select(u => new { u.Id, u.FullName, u.FullNameEnglish })
            .ToArrayAsync(ct);
        return rows.ToDictionary(
            x => x.Id,
            x => (x.FullName, (string?)x.FullNameEnglish));
    }

    private static string? NameOf(
        IReadOnlyDictionary<string, (string FullName, string? FullNameEnglish)> names, string? userId) =>
        userId is not null &&
        names.TryGetValue(userId, out var value) ? value.FullName : null;

    private static string? EnglishNameOf(
        IReadOnlyDictionary<string, (string FullName, string? FullNameEnglish)> names, string? userId) =>
        userId is not null &&
        names.TryGetValue(userId, out var value) ? value.FullNameEnglish : null;

    private IQueryable<LearningRequest> RequestWithChildren() =>
        db.LearningRequests.Include(x => x.Attachments).Include(x => x.Clarifications).AsSplitQuery();
    private IQueryable<Order> OrderWithChildren() =>
        db.Orders.Include(x => x.Deliveries).Include(x => x.Extensions).AsSplitQuery();

    private void ApplyVersion(LearningRequest request, string version) =>
        db.Entry(request).Property(x => x.RowVersion).OriginalValue = DecodeVersion(version);

    private void ApplyVersion(Order order, string version) =>
        db.Entry(order).Property(x => x.RowVersion).OriginalValue = DecodeVersion(version);

    private static byte[] DecodeVersion(string version)
    {
        try { return Convert.FromBase64String(version.Trim('"')); }
        catch { throw new DomainException("invalid_concurrency_token", "The resource version is invalid."); }
    }

    private static string SafeName(string fileName) =>
        Path.GetFileName(fileName) is { Length: > 0 and <= 255 } name ? name : "attachment";

    private static string ActorRole(string actorId, string studentId, string teacherId) =>
        actorId == studentId ? "student" : actorId == teacherId ? "teacher" : "system";

    private static LearningRequestDto Map(
        LearningRequest x,
        IReadOnlyDictionary<string, (string FullName, string? FullNameEnglish)>? names = null,
        int? offerCount = null,
        RequestOutcome? outcome = null) =>
        new(x.Id, x.StudentId, x.TeacherId, x.TeacherServiceId, x.Title, x.Description,
            x.PreferredDeliveryAt, x.Budget, x.Status, x.CreatedAt,
            x.Attachments.Select(a => Map(a)).ToArray(), x.Clarifications.Select(c =>
                new ClarificationDto(c.Id, c.SenderId, c.Message, c.CreatedAt)).ToArray(),
            Convert.ToBase64String(x.RowVersion),
            names is null ? null : NameOf(names, x.StudentId),
            names is null ? null : NameOf(names, x.TeacherId),
            names is null ? null : EnglishNameOf(names, x.StudentId),
            names is null ? null : EnglishNameOf(names, x.TeacherId),
            x.ServiceCatalogItemId, x.CatalogCode, x.CategoryCode, x.OrderType,
            x.ServiceNameEnglish, x.ServiceNameArabic,
            x.SourcingMode, x.SelectedOfferId, x.PaymentReservationExpiresAt, offerCount,
            outcome?.Status, outcome?.PaymentStatus);
    private OrderDto Map(
        Order x, bool teacherView,
        IReadOnlyDictionary<string, (string FullName, string? FullNameEnglish)>? names = null,
        string? requestTitle = null,
        ReviewState review = default,
        DateTimeOffset now = default,
        bool hasDispute = false)
    {
        var hasReview = review.HasReview;
        var canSubmit = !teacherView
            && x.Status == OrderStatus.Completed
            && x.PaymentStatus == OrderPaymentStatus.Paid
            && !hasReview;
        // Owner-safe review payload on student Order lists; teachers only need HasReview.
        var exposeOwnerReview = !teacherView && hasReview;
        return new(x.Id, x.LearningRequestId, x.StudentId, x.TeacherId, x.TeacherServiceId,
            x.Price, x.Currency, x.StudentFeePercent, teacherView ? x.TeacherCommissionPercent : null,
            x.StudentFeeAmount, teacherView ? x.TeacherCommissionAmount : null,
            x.StudentTotal, teacherView ? x.TeacherNet : null,
            x.AgreedDeliveryAt, x.RevisionAllowance, x.RevisionsUsed, x.Status,
            x.PaymentStatus, x.DeliveryState, x.CreatedAt,
            x.Deliveries.Select(Map).ToArray(), Convert.ToBase64String(x.RowVersion),
            names is null ? null : NameOf(names, x.StudentId),
            names is null ? null : NameOf(names, x.TeacherId),
            names is null ? null : EnglishNameOf(names, x.StudentId),
            names is null ? null : EnglishNameOf(names, x.TeacherId),
            requestTitle,
            x.ServiceCatalogItemId, x.CatalogCode, x.CategoryCode, x.OrderType,
            x.ServiceNameEnglish, x.ServiceNameArabic,
            hasReview,
            exposeOwnerReview ? review.OverallScore : null,
            exposeOwnerReview ? review.Comment : null,
            exposeOwnerReview ? review.IsVisible : null,
            exposeOwnerReview ? review.CreatedAt : null,
            canSubmit,
            x.IsOverdue(now),
            !teacherView && !hasDispute && x.PaymentStatus == OrderPaymentStatus.Paid
                && x.Status is OrderStatus.AwaitingPayment or OrderStatus.InProgress
                && x.Deliveries.Count == 0
                && now > x.AgreedDeliveryAt.AddHours(_lifecycle.NonDeliveryGraceHours),
            x.Extensions.OrderByDescending(e => e.CreatedAt).Select(e => new OrderExtensionDto(
                e.Id, e.RequestedById, e.RespondedById, e.ProposedDeliveryAt,
                e.Reason, e.Response, e.Status, e.CreatedAt)).ToArray());
    }
    private static AttachmentDto Map(LearningRequestAttachment x, string? version = null) =>
        new(x.Id, x.OriginalName, x.ContentType, x.Size, x.CreatedAt, version);
    private static DeliveryDto Map(OrderDelivery x) =>
        new(x.Id, x.OriginalName, x.ContentType, x.Size, x.Message, x.CreatedAt);

    private sealed record TimelineRow(
        string Id, string EventType, DateTimeOffset OccurredAt, string ActorRole,
        int SourcePriority, OrderTimelineMetadataDto? Metadata);
    private sealed record RequestOutcome(
        Guid LearningRequestId, OrderStatus Status, OrderPaymentStatus PaymentStatus);
}
