using Tafseel.Domain.Common;

namespace Tafseel.Domain.Orders;

public enum TeacherOfferStatus { Submitted, Selected, Accepted, Withdrawn, NotSelected, Expired }

public sealed class TeacherOffer
{
    private TeacherOffer() { }

    public TeacherOffer(Guid learningRequestId, string teacherId, Guid teacherServiceId,
        decimal amount, int deliveryHours, string message, DateTimeOffset now)
        : this(learningRequestId, teacherId, teacherServiceId, amount, deliveryHours, 2, message, now.AddDays(7), now) { }
    public TeacherOffer(Guid learningRequestId, string teacherId, Guid teacherServiceId,
        decimal amount, int deliveryHours, int includedRevisions, string message, DateTimeOffset validUntil, DateTimeOffset now)
    {
        if (learningRequestId == Guid.Empty || teacherServiceId == Guid.Empty)
            throw new DomainException("invalid_offer", "Offer target is required.");
        Id = Guid.NewGuid();
        LearningRequestId = learningRequestId;
        TeacherId = Required(teacherId, 450, "teacher");
        TeacherServiceId = teacherServiceId;
        SetTerms(amount, deliveryHours, includedRevisions, message, validUntil, now);
        Currency = "SAR";
        Status = TeacherOfferStatus.Submitted;
        CreatedAt = UpdatedAt = now;
    }

    public Guid Id { get; private set; }
    public Guid LearningRequestId { get; private set; }
    public string TeacherId { get; private set; } = "";
    public Guid TeacherServiceId { get; private set; }
    public decimal Amount { get; private set; }
    public string Currency { get; private set; } = "SAR";
    public int DeliveryHours { get; private set; }
    public string Message { get; private set; } = "";
    public int IncludedRevisions { get; private set; }
    public DateTimeOffset ValidUntil { get; private set; }
    public TeacherOfferStatus Status { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? SelectedAt { get; private set; }
    public DateTimeOffset? AcceptedAt { get; private set; }
    public DateTimeOffset? WithdrawnAt { get; private set; }
    public byte[] RowVersion { get; private set; } = [];

    public void Update(string teacherId, decimal amount, int deliveryHours, string message, DateTimeOffset now)
        => Update(teacherId, amount, deliveryHours, IncludedRevisions, message, ValidUntil, now);
    public void Update(string teacherId, decimal amount, int deliveryHours, int includedRevisions, string message, DateTimeOffset validUntil, DateTimeOffset now)
    {
        RequireTeacher(teacherId);
        if (Status != TeacherOfferStatus.Submitted) throw InvalidTransition();
        SetTerms(amount, deliveryHours, includedRevisions, message, validUntil, now);
        UpdatedAt = now;
    }

    public void Resubmit(string teacherId, decimal amount, int deliveryHours, string message, DateTimeOffset now)
        => Resubmit(teacherId, amount, deliveryHours, IncludedRevisions, message, now.AddDays(7), now);
    public void Resubmit(string teacherId, decimal amount, int deliveryHours, int includedRevisions, string message, DateTimeOffset validUntil, DateTimeOffset now)
    {
        RequireTeacher(teacherId);
        if (Status != TeacherOfferStatus.Withdrawn) throw InvalidTransition();
        SetTerms(amount, deliveryHours, includedRevisions, message, validUntil, now);
        Status = TeacherOfferStatus.Submitted;
        WithdrawnAt = null;
        UpdatedAt = now;
    }

    public void Withdraw(string teacherId, DateTimeOffset now)
    {
        RequireTeacher(teacherId);
        if (Status != TeacherOfferStatus.Submitted) throw InvalidTransition();
        Status = TeacherOfferStatus.Withdrawn;
        WithdrawnAt = UpdatedAt = now;
    }

    public void Select(DateTimeOffset now)
    {
        if (Status != TeacherOfferStatus.Submitted) throw InvalidTransition();
        if (now >= ValidUntil) throw new DomainException("offer_expired", "The Offer has expired.");
        Status = TeacherOfferStatus.Selected;
        SelectedAt = UpdatedAt = now;
    }

    public void Reopen(DateTimeOffset now)
    {
        if (Status != TeacherOfferStatus.Selected) throw InvalidTransition();
        Status = TeacherOfferStatus.Submitted;
        UpdatedAt = now;
    }

    public void Accept(DateTimeOffset now)
    {
        if (Status != TeacherOfferStatus.Selected) throw InvalidTransition();
        Status = TeacherOfferStatus.Accepted;
        AcceptedAt = UpdatedAt = now;
    }

    public void MarkNotSelected(DateTimeOffset now)
    {
        if (Status != TeacherOfferStatus.Submitted) return;
        Status = TeacherOfferStatus.NotSelected;
        UpdatedAt = now;
    }

    public void Expire(DateTimeOffset now)
    {
        if (Status is not (TeacherOfferStatus.Submitted or TeacherOfferStatus.Selected)) return;
        Status = TeacherOfferStatus.Expired;
        UpdatedAt = now;
    }

    private void SetTerms(decimal amount, int deliveryHours, int includedRevisions, string message, DateTimeOffset validUntil, DateTimeOffset now)
    {
        if (amount is <= 0 or > 1_000_000)
            throw new DomainException("invalid_offer_amount", "Offer amount is invalid.");
        if (deliveryHours is < 1 or > 8760)
            throw new DomainException("invalid_offer_delivery", "Offer delivery commitment is invalid.");
        if (includedRevisions is < 0 or > 20 || validUntil <= now || validUntil > now.AddDays(30))
            throw new DomainException("invalid_offer_scope", "Offer revisions or validity are invalid.");
        Amount = decimal.Round(amount, 2, MidpointRounding.AwayFromZero);
        DeliveryHours = deliveryHours;
        IncludedRevisions = includedRevisions;
        ValidUntil = validUntil;
        Message = Required(message, 2000, "proposal");
    }

    private void RequireTeacher(string teacherId)
    {
        if (TeacherId != teacherId) throw new DomainException("offer_not_owned", "Offer was not found.");
    }

    private static string Required(string? value, int max, string name)
    {
        value = value?.Trim() ?? "";
        if (value.Length is 0 || value.Length > max)
            throw new DomainException("invalid_offer", $"{name} is required.");
        return value;
    }

    private static DomainException InvalidTransition() =>
        new("invalid_offer_transition", "The Offer transition is not allowed.");
}
