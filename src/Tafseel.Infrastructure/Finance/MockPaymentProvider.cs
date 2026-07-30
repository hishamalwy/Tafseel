using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Tafseel.Application.Finance;
using Tafseel.Domain.Common;

namespace Tafseel.Infrastructure.Finance;

internal sealed class MockPaymentProvider(
    IOptions<PaymentOptions> options,
    IHostEnvironment environment) : IPaymentProvider
{
    private readonly PaymentOptions _options = options.Value;
    private readonly byte[] _secret = Encoding.UTF8.GetBytes(options.Value.WebhookSecret);
    public string Name => "Mock";

    public bool IsSimulatorActive =>
        !environment.IsProduction()
        && string.Equals(_options.Provider, "Mock", StringComparison.OrdinalIgnoreCase)
        && _options.Mock.Enabled
        && _options.Mock.SimulatorEnabled;

    public Task<ProviderInitiation> InitiateAsync(
        Guid paymentId, decimal amount, string currency, CancellationToken ct)
    {
        var reference = $"mock_{paymentId:N}";
        var checkout = IsSimulatorActive
            ? QueryHelpers.AddQueryString("/app/Tafseel-Mock-Checkout.dc.html", "ref", reference)
            : reference;
        return Task.FromResult(new ProviderInitiation(reference, checkout));
    }

    public VerifiedPaymentEvent VerifyWebhook(ReadOnlyMemory<byte> payload, string signature)
    {
        byte[] supplied;
        try { supplied = Convert.FromHexString(signature); }
        catch { throw InvalidSignature(); }
        var expected = HMACSHA256.HashData(_secret, payload.Span);
        if (supplied.Length != expected.Length
            || !CryptographicOperations.FixedTimeEquals(supplied, expected))
            throw InvalidSignature();
        try
        {
            return JsonSerializer.Deserialize<VerifiedPaymentEvent>(payload.Span,
                new JsonSerializerOptions(JsonSerializerDefaults.Web)
                {
                    PropertyNameCaseInsensitive = true
                }) ?? throw new JsonException();
        }
        catch (JsonException)
        {
            throw new DomainException("invalid_webhook", "Payment webhook payload is invalid.");
        }
    }

    /// <summary>
    /// Builds a canonical Mock webhook body + HMAC. Used only by the Dev/Staging simulator
    /// so the browser never holds <c>Payments:WebhookSecret</c>.
    /// </summary>
    public (byte[] Payload, string Signature) CreateSignedWebhook(
        string eventId, string providerReference, decimal amount, string currency, bool succeeded)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            eventId,
            providerReference,
            amount,
            currency,
            succeeded
        }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var signature = Convert.ToHexString(HMACSHA256.HashData(_secret, payload));
        return (payload, signature);
    }

    private static DomainException InvalidSignature() =>
        new("invalid_webhook_signature", "Payment webhook signature is invalid.");
}
