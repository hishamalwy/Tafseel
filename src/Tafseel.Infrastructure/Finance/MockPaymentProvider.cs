using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Tafseel.Application.Finance;
using Tafseel.Domain.Common;

namespace Tafseel.Infrastructure.Finance;

internal sealed class MockPaymentProvider(
    IOptionsMonitor<PaymentOptions> options) : IPaymentProvider
{
    private PaymentOptions Opts => options.CurrentValue;
    private byte[] Secret => Encoding.UTF8.GetBytes(Opts.WebhookSecret);
    public string Name => "Mock";

    // Registered exclusively in Testing. Real customer environments always use Paymob.
    public Task<ProviderInitiation> InitiateAsync(ProviderPaymentRequest request, CancellationToken ct) =>
        Task.FromResult(new ProviderInitiation(request.Reference, $"/checkout/result?paymentId={request.PaymentId}"));

    public VerifiedPaymentEvent VerifyWebhook(ReadOnlyMemory<byte> payload, string signature)
    {
        byte[] supplied;
        try { supplied = Convert.FromHexString(signature); }
        catch { throw InvalidSignature(); }
        var expected = HMACSHA256.HashData(Secret, payload.Span);
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

    internal (byte[] Payload, string Signature) CreateSignedWebhook(
        string eventId, string providerReference, decimal amount, string currency, bool succeeded)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(new { eventId, providerReference, amount, currency, succeeded });
        return (payload, Convert.ToHexString(HMACSHA256.HashData(Secret, payload)));
    }

    private static DomainException InvalidSignature() =>
        new("invalid_webhook_signature", "Payment webhook signature is invalid.");
}
