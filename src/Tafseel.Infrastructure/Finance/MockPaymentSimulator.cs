using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Tafseel.Application.Finance;
using Tafseel.Domain.Common;
using Tafseel.Domain.Finance;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Finance;

/// <summary>
/// Dev/Staging mock checkout helper. Signs webhooks server-side and routes them through
/// <see cref="IFinancialService.ProcessWebhookAsync"/> — never marks orders paid directly.
/// </summary>
internal sealed class MockPaymentSimulator(
    MockPaymentProvider mockProvider,
    IFinancialService finance,
    IOptions<PaymentOptions> paymentOptions,
    TafseelDbContext db) : IMockPaymentSimulator
{
    public bool IsActive => mockProvider.IsSimulatorActive;

    public PaymentCapabilitiesDto GetCapabilities() =>
        new(paymentOptions.Value.Provider, IsActive);

    public async Task<MockSimulatorSessionDto> GetSessionAsync(
        string studentId, string providerReference, CancellationToken ct)
    {
        EnsureActive();
        var payment = await LoadOwnedAsync(studentId, providerReference, ct);
        return new(payment.ProviderReference, payment.Id, payment.Amount, payment.Currency,
            payment.Status, payment.OrderId, payment.LiveSessionBookingId);
    }

    public async Task<MockSimulatorCompleteResponse> CompleteAsync(
        string studentId, MockSimulatorCompleteRequest input, CancellationToken ct)
    {
        EnsureActive();
        var payment = await LoadOwnedAsync(studentId, input.ProviderReference, ct);
        var returnUrl = SanitizeReturnPath(input.ReturnPath, paymentOptions.Value.Mock.DefaultReturnPath);

        if (payment.Status == PaymentStatus.Confirmed)
            return new(payment.Status, payment.Id, returnUrl);

        if (payment.Status != PaymentStatus.Pending)
            throw new DomainException("payment_not_simulatable", "This payment cannot be simulated.");

        var eventId = $"mock-sim-{payment.Id:N}-{Guid.NewGuid():N}";
        var (payload, signature) = mockProvider.CreateSignedWebhook(
            eventId, payment.ProviderReference, payment.Amount, payment.Currency, input.Succeeded);

        await finance.ProcessWebhookAsync(payload, signature, ct);

        var refreshed = await db.Payments.AsNoTracking()
            .SingleAsync(x => x.Id == payment.Id, ct);
        return new(refreshed.Status, refreshed.Id, returnUrl);
    }

    private void EnsureActive()
    {
        if (!IsActive)
            throw new DomainException("mock_simulator_disabled", "The mock payment simulator is not enabled.");
    }

    private async Task<Payment> LoadOwnedAsync(
        string studentId, string providerReference, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(providerReference)
            || !providerReference.StartsWith("mock_", StringComparison.Ordinal))
            throw new DomainException("payment_not_owned", "Payment was not found.");

        return await db.Payments.AsNoTracking()
            .SingleOrDefaultAsync(x =>
                x.Provider == mockProvider.Name
                && x.ProviderReference == providerReference
                && x.StudentId == studentId, ct)
            ?? throw new DomainException("payment_not_owned", "Payment was not found.");
    }

    private static string SanitizeReturnPath(string? path, string defaultPath)
    {
        if (string.IsNullOrWhiteSpace(path))
            return defaultPath;
        var trimmed = path.Trim();
        if (!trimmed.StartsWith("/app/", StringComparison.OrdinalIgnoreCase))
            return defaultPath;
        if (trimmed.Contains("://", StringComparison.Ordinal)
            || trimmed.Contains('\\')
            || trimmed.Contains("..", StringComparison.Ordinal))
            return defaultPath;
        return trimmed;
    }
}
