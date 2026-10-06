using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Tafseel.Application.Finance;
using Tafseel.Domain.Common;

namespace Tafseel.Infrastructure.Finance;

internal sealed class PaymobPaymentProvider(
    HttpClient http, IOptions<PaymobOptions> options, ILogger<PaymobPaymentProvider> logger) : IPaymentProvider
{
    private readonly PaymobOptions _options = options.Value;
    public string Name => "Paymob";

    public async Task<ProviderInitiation> InitiateAsync(ProviderPaymentRequest request, CancellationToken ct)
    {
        ValidateCurrency(request.Currency);
        if (_options.IntegrationId <= 0 || !_options.IsLive && _options.IntegrationId != 34667)
            throw new DomainException("payment_integration_unsupported", "The payment integration is not supported.");
        var amount = MinorUnits(request.Amount);
        var names = request.Name.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        using var response = await PostAsync("v1/intention/", new
        {
            amount,
            currency = "SAR",
            payment_methods = new[] { _options.IntegrationId },
            items = new[] { new { name = request.Item, amount, quantity = 1 } },
            billing_data = new
            {
                first_name = names.ElementAtOrDefault(0) ?? "NA",
                last_name = names.ElementAtOrDefault(1) ?? "NA",
                email = request.Email, phone_number = string.IsNullOrWhiteSpace(request.Phone) ? "NA" : request.Phone,
                apartment = "NA", street = "NA", building = "NA", city = "NA", country = "SA", floor = "NA", state = "NA"
            },
            special_reference = request.Reference,
            expiration = 3600,
            notification_url = _options.NotificationUrl,
            redirection_url = QueryHelpers.AddQueryString(_options.RedirectionUrl, "paymentId", request.PaymentId.ToString())
        }, ct);
        if (!response.IsSuccessStatusCode) throw ApiFailure(response.StatusCode);
        try
        {
            using var body = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            var root = body.RootElement;
            var secret = RequiredString(root, "client_secret");
            var intention = RequiredString(root, "id");
            var order = RequiredId(root, "intention_order_id");
            if (root.TryGetProperty("special_reference", out var reference) && reference.GetString() != request.Reference)
                throw new JsonException();
            var url = QueryHelpers.AddQueryString("https://ksa.checkout.paymob.com/", new Dictionary<string, string?>
            {
                ["publicKey"] = _options.PublicKey, ["clientSecret"] = secret
            });
            return new(request.Reference, url, intention, order);
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or FormatException)
        {
            throw new DomainException("payment_provider_unknown", "The payment provider outcome is unknown. Check payment status before retrying.");
        }
    }

    public VerifiedPaymentEvent VerifyWebhook(ReadOnlyMemory<byte> payload, string signature)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            RejectDuplicateKeys(document.RootElement);
            var root = document.RootElement;
            if (RequiredString(root, "type") != "TRANSACTION")
                return new("ignored", "ignored", 0, "SAR", false, ProviderEventKind.Ignore);
            var obj = root.GetProperty("obj");
            var canonical = Canonical(obj);
            byte[] supplied;
            try { supplied = Convert.FromHexString(signature); }
            catch (FormatException) { throw InvalidSignature(); }
            var expected = HMACSHA512.HashData(Encoding.UTF8.GetBytes(_options.HmacSecret), Encoding.UTF8.GetBytes(canonical));
            if (supplied.Length != expected.Length || !CryptographicOperations.FixedTimeEquals(expected, supplied))
                throw InvalidSignature();
            return ParseTransaction(obj);
        }
        catch (Exception error) when (error is JsonException or KeyNotFoundException or InvalidOperationException or FormatException or OverflowException)
        {
            throw new DomainException("invalid_webhook", "Payment webhook payload is invalid.");
        }
    }

    // The twenty fields and their order are Paymob's Transaction Processed Callback contract.
    internal static string Canonical(JsonElement obj)
    {
        var keys = new[] { "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id",
            "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided",
            "order.id", "owner", "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success" };
        return string.Concat(keys.Select(key =>
        {
            var value = obj;
            foreach (var segment in key.Split('.')) value = value.GetProperty(segment);
            return value.ValueKind switch
            {
                JsonValueKind.String => value.GetString(), JsonValueKind.Number => value.GetRawText(),
                JsonValueKind.True => "true", JsonValueKind.False => "false", JsonValueKind.Null => "",
                _ => throw new JsonException()
            };
        }));
    }

    public async Task<ProviderRefundResult> RefundAsync(string transactionId, decimal amount, string currency, CancellationToken ct)
    {
        ValidateCurrency(currency);
        if (!long.TryParse(transactionId, out var id) || id <= 0) throw new DomainException("payment_transaction_missing", "The provider transaction was not found.");
        using var response = await PostAsync("api/acceptance/void_refund/refund", new
        {
            transaction_id = transactionId, amount_cents = MinorUnits(amount).ToString(CultureInfo.InvariantCulture)
        }, ct);
        if (!response.IsSuccessStatusCode)
            return new(response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden
                ? ProviderRefundStatus.Rejected : ProviderRefundStatus.Unknown, FailureCode: "provider_http_" + (int)response.StatusCode);
        try
        {
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            var root = document.RootElement;
            // Refund responses are evidence of a provider operation, not a local accounting instruction.
            if (root.GetProperty("amount_cents").GetInt64() != MinorUnits(amount) || RequiredString(root, "currency") != currency
                || root.TryGetProperty("is_live", out var live) && live.GetBoolean() != _options.IsLive
                || RequiredId(root, "parent_transaction") != transactionId
                || !root.GetProperty("is_refund").GetBoolean()
                || root.GetProperty("integration_id").GetInt32() != _options.IntegrationId
                || root.GetProperty("error_occured").GetBoolean())
                return new(ProviderRefundStatus.Unknown, FailureCode: "provider_refund_mismatch");
            var reference = RequiredId(root, "id");
            return new(root.GetProperty("pending").GetBoolean() ? ProviderRefundStatus.Unknown
                : root.GetProperty("success").GetBoolean() ? ProviderRefundStatus.Succeeded : ProviderRefundStatus.Rejected, reference);
        }
        catch (Exception error) when (error is JsonException or KeyNotFoundException or InvalidOperationException or FormatException)
        {
            return new(ProviderRefundStatus.Unknown, FailureCode: "provider_refund_malformed");
        }
    }

    public async Task<VerifiedPaymentEvent?> InquireAsync(string reference, CancellationToken ct, string? transactionId = null)
    {
        // The official inquiry API requires a separate API Key / generated auth token.
        using var authRequest = new HttpRequestMessage(HttpMethod.Post, "api/auth/tokens")
        { Content = JsonContent.Create(new { api_key = _options.ApiKey }) };
        using var auth = await http.SendAsync(authRequest, ct);
        if (!auth.IsSuccessStatusCode) throw ApiFailure(auth.StatusCode);
        using var document = await JsonDocument.ParseAsync(await auth.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        var token = RequiredString(document.RootElement, "token");
        using var query = transactionId is null
            ? new HttpRequestMessage(HttpMethod.Post, "api/ecommerce/orders/transaction_inquiry")
                { Content = JsonContent.Create(new { auth_token = token, merchant_order_id = reference }) }
            : new HttpRequestMessage(HttpMethod.Get, "api/acceptance/transactions/" + Uri.EscapeDataString(transactionId));
        if (transactionId is not null) query.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await http.SendAsync(query, ct);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        if (!response.IsSuccessStatusCode) throw ApiFailure(response.StatusCode);
        using var transaction = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        return ParseTransaction(transaction.RootElement);
    }

    private VerifiedPaymentEvent ParseTransaction(JsonElement obj)
    {
        var transaction = RequiredId(obj, "id");
        var order = obj.GetProperty("order");
        var orderId = RequiredId(order, "id");
        var reference = RequiredString(order, "merchant_order_id");
        var amount = obj.GetProperty("amount_cents").GetInt64();
        if (amount <= 0) throw new JsonException();
        var currency = RequiredString(obj, "currency");
        if (obj.GetProperty("integration_id").GetInt32() != _options.IntegrationId)
            throw new DomainException("payment_integration_mismatch", "The provider integration does not match this environment.");
        bool? live = obj.TryGetProperty("is_live", out var mode) ? mode.GetBoolean() : null;
        if (live is not null && live != _options.IsLive)
            throw new DomainException("payment_environment_mismatch", "The provider environment does not match this environment.");
        var pending = obj.GetProperty("pending").GetBoolean();
        var success = obj.GetProperty("success").GetBoolean();
        var refunded = obj.GetProperty("is_refunded").GetBoolean();
        var voided = obj.GetProperty("is_voided").GetBoolean();
        var captured = success && !pending && !voided && !obj.GetProperty("error_occured").GetBoolean()
            && (!obj.GetProperty("is_auth").GetBoolean() || obj.GetProperty("is_capture").GetBoolean());
        // Child refunds/voids cannot fund a purchase. Their parent callback or parent inquiry proves the refund.
        var kind = obj.GetProperty("has_parent_transaction").GetBoolean() ? ProviderEventKind.Ignore
            : refunded ? ProviderEventKind.Refund : pending ? ProviderEventKind.Pending : ProviderEventKind.Payment;
        return new($"{transaction}:{pending}:{success}:{refunded}:{voided}", reference, amount / 100m, currency,
            captured, kind, transaction, orderId, live,
            obj.TryGetProperty("refunded_amount_cents", out var refundedAmount) && refundedAmount.ValueKind != JsonValueKind.Null
                ? refundedAmount.GetInt64() / 100m : null);
    }

    private async Task<HttpResponseMessage> PostAsync(string path, object body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Token", _options.SecretKey);
        var response = await http.SendAsync(request, ct);
        logger.LogInformation("Paymob {Operation} returned HTTP {StatusCode}", path, (int)response.StatusCode);
        return response;
    }

    internal static long MinorUnits(decimal amount)
    {
        if (amount <= 0 || amount * 100 != decimal.Truncate(amount * 100) || amount > long.MaxValue / 100m)
            throw new DomainException("payment_amount_invalid", "The payment amount is invalid.");
        return checked((long)(amount * 100));
    }
    private void ValidateCurrency(string currency)
    {
        if (currency != "SAR" || _options.Currency != "SAR")
            throw new DomainException("payment_currency_unsupported", "The payment currency is not supported.");
    }
    private static string RequiredString(JsonElement value, string key) =>
        value.GetProperty(key).GetString() is { Length: > 0 } text ? text : throw new JsonException();
    private static string RequiredId(JsonElement value, string key) =>
        value.GetProperty(key).GetInt64() is > 0 and var id ? id.ToString(CultureInfo.InvariantCulture) : throw new JsonException();
    private static DomainException InvalidSignature() => new("invalid_webhook_signature", "Payment webhook signature is invalid.");
    private static DomainException ApiFailure(HttpStatusCode status) => new(
        (int)status >= 500 || status == HttpStatusCode.RequestTimeout ? "payment_provider_unknown" : "payment_provider_rejected",
        "The payment provider could not complete this request. Check payment status before retrying.");
    private static void RejectDuplicateKeys(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in element.EnumerateObject())
            {
                if (!names.Add(property.Name)) throw new JsonException();
                RejectDuplicateKeys(property.Value);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
            foreach (var child in element.EnumerateArray()) RejectDuplicateKeys(child);
    }
}
