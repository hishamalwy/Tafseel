using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Tafseel.Application.Finance;
using Tafseel.Domain.Common;

namespace Tafseel.Infrastructure.Finance;

internal sealed class MockPaymentProvider(IOptions<PaymentOptions> options) : IPaymentProvider
{
    private readonly byte[] _secret = Encoding.UTF8.GetBytes(options.Value.WebhookSecret);
    public string Name => "Mock";

    public Task<ProviderInitiation> InitiateAsync(
        Guid paymentId, decimal amount, string currency, CancellationToken ct)
    {
        var reference = $"mock_{paymentId:N}";
        return Task.FromResult(new ProviderInitiation(reference, reference));
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

    private static DomainException InvalidSignature() =>
        new("invalid_webhook_signature", "Payment webhook signature is invalid.");
}
