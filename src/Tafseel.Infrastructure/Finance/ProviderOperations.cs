using Microsoft.EntityFrameworkCore;
using Tafseel.Application.Finance;
using Tafseel.Domain.Finance;

namespace Tafseel.Infrastructure.Finance;

public enum CheckoutDispatchStatus { Reserved, Sending, Ready, Rejected, Unknown }

/// <summary>Durable provider side of a PaymentAttempt. Contains no card data.</summary>
public sealed class ProviderCheckout
{
    public Guid Id { get; set; }
    public Guid PaymentId { get; set; }
    public string Reference { get; set; } = "";
    public CheckoutDispatchStatus Status { get; set; }
    public string? IntentionId { get; set; }
    public string? OrderId { get; set; }
    public string? TransactionId { get; set; }
    public string? ProtectedCheckout { get; set; }
    public string? FailureCode { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastCheckedAt { get; set; }
}

/// <summary>A full refund command; the financial Refund record is created only after provider evidence.</summary>
public sealed class ProviderRefund
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PaymentId { get; set; }
    public string TransactionId { get; set; } = "";
    public string IdempotencyKey { get; set; } = "";
    public string ActorId { get; set; } = "";
    public string Reason { get; set; } = "";
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "";
    public ProviderRefundStatus Status { get; set; }
    public string? ProviderReference { get; set; }
    public string? FailureCode { get; set; }
    public bool Applied { get; set; }
    public bool UnallocatedCapture { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastCheckedAt { get; set; }
}

internal static class ProviderOperations
{
    internal static void Configure(ModelBuilder builder)
    {
        builder.Entity<ProviderCheckout>(checkout =>
        {
            checkout.Property(x => x.Id).ValueGeneratedNever();
            checkout.HasIndex(x => x.PaymentId).IsUnique();
            checkout.HasIndex(x => x.Reference).IsUnique();
            checkout.HasIndex(x => x.OrderId).IsUnique().HasFilter("[OrderId] IS NOT NULL");
            checkout.HasIndex(x => x.TransactionId).IsUnique().HasFilter("[TransactionId] IS NOT NULL");
            checkout.Property(x => x.Reference).HasMaxLength(200);
            checkout.Property(x => x.IntentionId).HasMaxLength(200);
            checkout.Property(x => x.OrderId).HasMaxLength(100);
            checkout.Property(x => x.TransactionId).HasMaxLength(100);
            checkout.Property(x => x.FailureCode).HasMaxLength(100);
            checkout.HasOne<PaymentAttempt>().WithOne().HasForeignKey<ProviderCheckout>(x => x.Id).OnDelete(DeleteBehavior.Restrict);
            checkout.HasOne<Payment>().WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
            checkout.ToTable(table => table.HasCheckConstraint("CK_ProviderCheckouts_Status", "[Status] BETWEEN 0 AND 4"));
        });
        builder.Entity<ProviderRefund>(refund =>
        {
            refund.Property(x => x.Id).ValueGeneratedNever();
            refund.HasIndex(x => x.PaymentId).IsUnique();
            refund.HasIndex(x => new { x.ActorId, x.IdempotencyKey }).IsUnique();
            refund.Property(x => x.TransactionId).HasMaxLength(100);
            refund.Property(x => x.ProviderReference).HasMaxLength(200);
            refund.Property(x => x.IdempotencyKey).HasMaxLength(100);
            refund.Property(x => x.ActorId).HasMaxLength(450);
            refund.Property(x => x.Reason).HasMaxLength(1000);
            refund.Property(x => x.FailureCode).HasMaxLength(100);
            refund.Property(x => x.Amount).HasPrecision(18, 2);
            refund.Property(x => x.Currency).HasMaxLength(3).IsUnicode(false);
            refund.HasOne<Payment>().WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.Restrict);
            refund.ToTable(table =>
            {
                table.HasCheckConstraint("CK_ProviderRefunds_Amount", "[Amount] > 0");
                table.HasCheckConstraint("CK_ProviderRefunds_Status", "[Status] BETWEEN 0 AND 4");
                table.HasCheckConstraint("CK_ProviderRefunds_Currency", "[Currency] = 'SAR'");
            });
        });
    }
}
