using System.ComponentModel.DataAnnotations;
using Tafseel.Application.Common;
using Tafseel.Application.Orders;
using Tafseel.Domain.Governance;

namespace Tafseel.Application.Governance;

public sealed record CreateSupportCase(
    SupportCaseCategory Category,
    [param: Required, StringLength(4000, MinimumLength = 10)] string Description,
    [param: StringLength(200)] string? RelatedReference);

/// <summary>For someone who cannot sign in. No account is involved; staff reply to the e-mail given.</summary>
public sealed record CreateAccountAccessCase(
    [param: Required, EmailAddress, StringLength(256)] string Email,
    [param: StringLength(150)] string? FullName,
    [param: Required, StringLength(4000, MinimumLength = 10)] string Description);

public sealed record SupportMessageInput([param: Required, StringLength(4000, MinimumLength = 1)] string Body);
public sealed record ResolveSupportCase([param: Required, StringLength(2000, MinimumLength = 10)] string Outcome);

public sealed record SupportCaseMessageDto(Guid Id, bool FromStaff, bool Mine, string? AuthorName, string Body, DateTimeOffset CreatedAt);
public sealed record SupportCaseAttachmentDto(Guid Id, string FileName, string ContentType, long Size, DateTimeOffset CreatedAt);

/// <param name="ReporterName">Only in staff reads. A reporter never sees staff members' personal details either.</param>
public sealed record SupportCaseDto(
    Guid Id, string Reference, SupportCaseCategory Category, SupportCaseStatus Status, string Description,
    string? RelatedReference, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt,
    string? Outcome, DateTimeOffset? ResolvedAt, bool Owned, string? OwnerName,
    string? ReporterName, string? ReporterEmail, string? ContactEmail, string? ContactName,
    IReadOnlyCollection<SupportCaseMessageDto> Messages, IReadOnlyCollection<SupportCaseAttachmentDto> Attachments,
    string Version);

public sealed record SupportCaseListItemDto(
    Guid Id, string Reference, SupportCaseCategory Category, SupportCaseStatus Status, DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt, string? OwnerName, string? ReporterName, bool FromSignedOutReporter, string Summary);

public sealed record SupportCaseReceiptDto(string Reference);

public interface ISupportService
{
    Task<SupportCaseDto> CreateAsync(string reporterId, CreateSupportCase input, CancellationToken ct);
    Task<SupportCaseReceiptDto> CreateAccountAccessAsync(CreateAccountAccessCase input, CancellationToken ct);
    Task<PagedResult<SupportCaseListItemDto>> MineAsync(string reporterId, int page, int pageSize, CancellationToken ct);
    Task<SupportCaseDto> GetAsync(string viewerId, bool staff, Guid id, CancellationToken ct);
    Task<SupportCaseDto> AddMessageAsync(string viewerId, bool staff, Guid id, SupportMessageInput input, string version, CancellationToken ct);
    Task<SupportCaseDto> AddAttachmentAsync(string reporterId, Guid id, Stream stream, string fileName, string contentType,
        long size, string version, CancellationToken ct);
    Task<PrivateFile> OpenAttachmentAsync(string viewerId, bool staff, Guid attachmentId, CancellationToken ct);
    Task<PagedResult<SupportCaseListItemDto>> QueueAsync(SupportCaseStatus? status, SupportCaseCategory? category,
        string? query, int page, int pageSize, CancellationToken ct);
    Task<SupportCaseDto> TakeAsync(string staffId, Guid id, string version, CancellationToken ct);
    Task<SupportCaseDto> ResolveAsync(string staffId, Guid id, ResolveSupportCase input, string version, CancellationToken ct);
}
