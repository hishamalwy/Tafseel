using Tafseel.Domain.Common;
using Tafseel.Domain.Orders;

namespace Tafseel.Domain.Tests;

public sealed class OpenRequestDraftTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 30, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void A_draft_keeps_what_was_typed_even_when_it_is_not_yet_publishable()
    {
        var draft = new OpenRequestDraft("student-1", Now);
        draft.Save("student-1", null, null, "  Limits  ", null, null, -5, 200, Now.AddMinutes(1));
        Assert.Equal("Limits", draft.Title);
        Assert.Equal("", draft.Requirements);
        Assert.Null(draft.BudgetMin);
        Assert.Equal(200, draft.BudgetMax);
        Assert.Equal(Now.AddMinutes(1), draft.UpdatedAt);
    }

    [Fact]
    public void Files_are_limited_to_five_and_the_same_file_is_not_attached_twice()
    {
        var draft = new OpenRequestDraft("student-1", Now);
        draft.AddAttachment("student-1", "key-1", "sheet.pdf", "application/pdf", 100, Now);
        Assert.Equal("draft_attachment_duplicate",
            Assert.Throws<DomainException>(() => draft.AddAttachment("student-1", "key-2", "SHEET.pdf", "application/pdf", 100, Now)).Code);
        for (var i = 2; i <= OpenRequestDraft.MaxAttachments; i++)
            draft.AddAttachment("student-1", $"key-{i}", $"page-{i}.pdf", "application/pdf", 100 + i, Now);
        Assert.Equal("draft_attachment_limit",
            Assert.Throws<DomainException>(() => draft.AddAttachment("student-1", "key-9", "extra.pdf", "application/pdf", 999, Now)).Code);
    }

    [Fact]
    public void Only_the_owner_changes_a_draft_and_removing_a_file_hands_back_its_storage_key()
    {
        var draft = new OpenRequestDraft("student-1", Now);
        var file = draft.AddAttachment("student-1", "key-1", "sheet.pdf", "application/pdf", 100, Now);
        Assert.Equal("draft_not_found",
            Assert.Throws<DomainException>(() => draft.RemoveAttachment("student-2", file.Id, Now)).Code);
        Assert.Equal("draft_not_found",
            Assert.Throws<DomainException>(() => draft.Save("student-2", null, null, "x", null, null, null, null, Now)).Code);
        Assert.Equal("key-1", draft.RemoveAttachment("student-1", file.Id, Now));
        Assert.Empty(draft.Attachments);
        Assert.Equal("draft_attachment_not_found",
            Assert.Throws<DomainException>(() => draft.RemoveAttachment("student-1", file.Id, Now)).Code);
    }
}
