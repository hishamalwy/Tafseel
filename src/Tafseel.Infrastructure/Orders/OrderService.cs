using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Tafseel.Application.Common;
using Tafseel.Application.Finance;
using Tafseel.Application.Orders;
using Tafseel.Application.TeacherApplications;
using Tafseel.Domain.Common;
using Tafseel.Domain.Orders;
using Tafseel.Domain.Governance;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Messaging;

namespace Tafseel.Infrastructure.Orders;

internal sealed class OrderService(
    TafseelDbContext db,
    IFileStorageService files,
    IFinancialService finance,
    NotificationWriter notifications,
    IOptions<FeeOptions> feeOptions,
    TimeProvider clock) : IOrderService
{
    private readonly FeeOptions _fees = feeOptions.Value;

    public async Task<LearningRequestDto> CreateRequestAsync(
        string studentId, CreateLearningRequest input, CancellationToken ct)
    {
        var service = await db.TeacherServices.AsNoTracking().SingleOrDefaultAsync(x =>
                x.Id == input.TeacherServiceId && x.IsActive
                && db.Subjects.Any(subject => subject.Id == x.SubjectId && subject.IsActive)
                && db.ServiceCatalogItems.Any(type => type.Id == x.ServiceCatalogItemId && type.IsActive)
                && db.TeacherSubjectQualifications.Any(q =>
                    q.TeacherId == x.TeacherId && q.SubjectId == x.SubjectId)
                && db.TeacherProfiles.Any(profile =>
                    profile.TeacherId == x.TeacherId && profile.IsPublished), ct)
            ?? throw new DomainException("teacher_service_not_found", "Teacher service was not found.");
        var request = new LearningRequest(
            studentId, service.TeacherId, service.Id, input.Title, input.Description,
            input.PreferredDeliveryAt, input.Budget, clock.GetUtcNow());
        db.Add(request);
        await notifications.QueueAsync(service.TeacherId, "NewRequest", "New learning request",
            request.Title, $"/requests/{request.Id}", $"request:{request.Id}:created", true, ct);
        await db.SaveChangesAsync(ct);
        return Map(request);
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
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            await files.DeletePrivateFileAsync(stored.StorageKey, CancellationToken.None);
            throw;
        }
        return Map(request.Attachments.Last());
    }

    public async Task<PrivateFile> OpenRequestAttachmentAsync(string userId, Guid attachmentId, CancellationToken ct)
    {
        var item = await (
            from attachment in db.LearningRequestAttachments.AsNoTracking()
            join request in db.LearningRequests.AsNoTracking()
                on attachment.LearningRequestId equals request.Id
            where attachment.Id == attachmentId
                && (request.StudentId == userId || request.TeacherId == userId)
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
            "Clarification requested", message, $"/requests/{request.Id}",
            $"request:{request.Id}:clarification:{request.UpdatedAt.UtcTicks}", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task ReplyClarificationAsync(
        string studentId, Guid requestId, string message, string version, CancellationToken ct)
    {
        var request = await OwnedRequestAsync(studentId, requestId, student: true, version, ct);
        request.ReplyToClarification(studentId, message, clock.GetUtcNow());
        await notifications.QueueAsync(request.TeacherId, "ClarificationReplied",
            "Student replied", message, $"/requests/{request.Id}",
            $"request:{request.Id}:reply:{request.UpdatedAt.UtcTicks}", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task DeclineAsync(
        string teacherId, Guid requestId, string reason, string version, CancellationToken ct)
    {
        var request = await OwnedRequestAsync(teacherId, requestId, student: false, version, ct);
        request.Decline(teacherId, reason, clock.GetUtcNow());
        await notifications.QueueAsync(request.StudentId, "RequestDeclined", "Request declined",
            reason, $"/requests/{request.Id}", $"request:{request.Id}:declined", true, ct);
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
                return Map(existing, teacherView: true);
            }
            ApplyVersion(request, version);
            var service = await db.TeacherServices.AsNoTracking().SingleOrDefaultAsync(x =>
                    x.Id == request.TeacherServiceId && x.TeacherId == teacherId && x.IsActive
                    && db.Subjects.Any(subject => subject.Id == x.SubjectId && subject.IsActive)
                    && db.ServiceCatalogItems.Any(type => type.Id == x.ServiceCatalogItemId && type.IsActive)
                    && db.TeacherSubjectQualifications.Any(q =>
                        q.TeacherId == teacherId && q.SubjectId == x.SubjectId), ct)
                ?? throw new DomainException("teacher_service_not_found", "Teacher service is no longer available.");
            if (!string.Equals(service.Currency, input.Currency, StringComparison.OrdinalIgnoreCase))
                throw new DomainException("currency_mismatch", "Accepted currency must match the teacher service.");
            request.Accept(teacherId, idempotencyKey, clock.GetUtcNow());
            var order = new Order(
                request.Id, request.StudentId, teacherId, service.Id, input.FinalPrice, input.Currency,
                _fees.StudentFeePercent, _fees.TeacherCommissionPercent, input.AgreedDeliveryAt,
                input.RevisionAllowance, clock.GetUtcNow());
            db.Add(order);
            await notifications.QueueAsync(request.StudentId, "PaymentRequired",
                "Request accepted — payment required", request.Title, $"/orders/{order.Id}",
                $"order:{order.Id}:payment-required", true, ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Map(order, teacherView: true);
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
                return Map(await OrderWithChildren().SingleAsync(x => x.LearningRequestId == requestId, ct), teacherView: true);
            throw;
        }
    }

    public async Task CancelRequestAsync(
        string studentId, Guid requestId, string version, CancellationToken ct)
    {
        var request = await OwnedRequestAsync(studentId, requestId, student: true, version, ct);
        request.Cancel(studentId, clock.GetUtcNow());
        await db.SaveChangesAsync(ct);
    }

    public Task<PagedResult<OrderDto>> GetStudentOrdersAsync(
        string studentId, int page, int pageSize, CancellationToken ct) =>
        OrderPageAsync(db.Orders.Where(x => x.StudentId == studentId), page, pageSize, teacherView: false, ct);

    public Task<PagedResult<OrderDto>> GetTeacherOrdersAsync(
        string teacherId, int page, int pageSize, CancellationToken ct) =>
        OrderPageAsync(db.Orders.Where(x => x.TeacherId == teacherId), page, pageSize, teacherView: true, ct);

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
            "Your order is now in progress.", $"/orders/{order.Id}", $"order:{order.Id}:started", true, ct);
        await db.SaveChangesAsync(ct);
    }

    public async Task<DeliveryDto> DeliverAsync(
        string teacherId, Guid orderId, Stream stream, string fileName, string contentType,
        long size, string message, string version, CancellationToken ct)
    {
        var order = await OwnedOrderAsync(teacherId, orderId, teacher: true, version, ct);
        var stored = await files.StorePrivateFileAsync(
            stream, fileName, contentType, size, "order-deliveries", ct);
        try
        {
            order.Deliver(
                teacherId, stored.StorageKey, SafeName(fileName), stored.ContentType, stored.Size,
                message, clock.GetUtcNow());
            await notifications.QueueAsync(order.StudentId, "DeliveryUploaded", "Delivery uploaded",
                "Your teacher uploaded a delivery.", $"/orders/{order.Id}",
                $"order:{order.Id}:delivery:{order.Deliveries.Last().Id}", true, ct);
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            await files.DeletePrivateFileAsync(stored.StorageKey, CancellationToken.None);
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
            reason, $"/orders/{order.Id}", $"order:{order.Id}:revision:{order.RevisionsUsed}", true, ct);
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
            "The Student approved the delivery.", $"/orders/{order.Id}",
            $"order:{order.Id}:completed", true, ct);
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

    private async Task<PagedResult<LearningRequestDto>> RequestPageAsync(
        IQueryable<LearningRequest> query, int page, int pageSize, CancellationToken ct)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var count = await query.CountAsync(ct);
        var items = await query.AsNoTracking().OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Include(x => x.Attachments).Include(x => x.Clarifications).AsSplitQuery().ToArrayAsync(ct);
        return new(items.Select(Map).ToArray(), page, pageSize, count);
    }

    private async Task<PagedResult<OrderDto>> OrderPageAsync(
        IQueryable<Order> query, int page, int pageSize, bool teacherView, CancellationToken ct)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var count = await query.CountAsync(ct);
        var items = await query.AsNoTracking().OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Include(x => x.Deliveries).AsSplitQuery().ToArrayAsync(ct);
        return new(items.Select(x => Map(x, teacherView)).ToArray(), page, pageSize, count);
    }

    private IQueryable<LearningRequest> RequestWithChildren() =>
        db.LearningRequests.Include(x => x.Attachments).Include(x => x.Clarifications).AsSplitQuery();
    private IQueryable<Order> OrderWithChildren() =>
        db.Orders.Include(x => x.Deliveries).AsSplitQuery();

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

    private static LearningRequestDto Map(LearningRequest x) =>
        new(x.Id, x.StudentId, x.TeacherId, x.TeacherServiceId, x.Title, x.Description,
            x.PreferredDeliveryAt, x.Budget, x.Status, x.CreatedAt,
            x.Attachments.Select(Map).ToArray(), x.Clarifications.Select(c =>
                new ClarificationDto(c.Id, c.SenderId, c.Message, c.CreatedAt)).ToArray(),
            Convert.ToBase64String(x.RowVersion));
    private static OrderDto Map(Order x, bool teacherView) =>
        new(x.Id, x.LearningRequestId, x.StudentId, x.TeacherId, x.TeacherServiceId,
            x.Price, x.Currency, x.StudentFeePercent, teacherView ? x.TeacherCommissionPercent : null,
            x.StudentFeeAmount, teacherView ? x.TeacherCommissionAmount : null,
            x.StudentTotal, teacherView ? x.TeacherNet : null,
            x.AgreedDeliveryAt, x.RevisionAllowance, x.RevisionsUsed, x.Status,
            x.PaymentStatus, x.DeliveryState, x.CreatedAt,
            x.Deliveries.Select(Map).ToArray(), Convert.ToBase64String(x.RowVersion));
    private static AttachmentDto Map(LearningRequestAttachment x) =>
        new(x.Id, x.OriginalName, x.ContentType, x.Size, x.CreatedAt);
    private static DeliveryDto Map(OrderDelivery x) =>
        new(x.Id, x.OriginalName, x.ContentType, x.Size, x.Message, x.CreatedAt);

    private sealed record TimelineRow(
        string Id, string EventType, DateTimeOffset OccurredAt, string ActorRole,
        int SourcePriority, OrderTimelineMetadataDto? Metadata);
}
