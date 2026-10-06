using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Tafseel.Application.Finance;
using Tafseel.Domain.Common;
using Tafseel.Infrastructure.Finance;

namespace Tafseel.IntegrationTests;

public sealed class PaymobProviderTests
{
    internal static PaymobOptions Settings() => new()
    {
        SecretKey = "sk_test_" + Guid.NewGuid().ToString("N"), PublicKey = "pk_test_" + Guid.NewGuid().ToString("N"),
        HmacSecret = Guid.NewGuid().ToString("N"), ApiKey = Guid.NewGuid().ToString("N"),
        NotificationUrl = "https://tafseel.runasp.net/api/v1/payments/webhooks/paymob",
        RedirectionUrl = "https://tafseel.runasp.net/checkout/result"
    };
    internal static PaymobPaymentProvider Provider(PaymobOptions options, StubHandler handler) =>
        new(new HttpClient(handler) { BaseAddress = new("https://ksa.paymob.com/"), Timeout = TimeSpan.FromSeconds(2) },
            Options.Create(options), NullLogger<PaymobPaymentProvider>.Instance);
    internal static JsonObject Transaction(string reference = "tf_reference", long id = 200, bool success = true) => new()
    {
        ["id"] = id, ["pending"] = false, ["amount_cents"] = 10800, ["success"] = success,
        ["is_auth"] = false, ["is_capture"] = false, ["is_standalone_payment"] = true,
        ["is_voided"] = false, ["is_refunded"] = false, ["is_3d_secure"] = true,
        ["integration_id"] = 34667, ["has_parent_transaction"] = false,
        ["order"] = new JsonObject { ["id"] = 100, ["merchant_order_id"] = reference },
        ["created_at"] = "2026-10-06T12:00:00", ["currency"] = "SAR", ["owner"] = 42,
        ["source_data"] = new JsonObject { ["pan"] = "2346", ["sub_type"] = "MasterCard", ["type"] = "card" },
        ["error_occured"] = false, ["is_live"] = false, ["refunded_amount_cents"] = 0
    };
    // Independent implementation of the documented vector: test signing never calls the production Canonical helper.
    internal static string Sign(JsonObject obj, string key)
    {
        string Value(string path) { JsonNode? value = obj; foreach (var part in path.Split('.')) value = value![part];
            return value is null ? "" : value.ToJsonString().Trim('"'); }
        var canonical = string.Concat(new[] { "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction",
            "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment",
            "is_voided", "order.id", "owner", "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success" }.Select(Value));
        return Convert.ToHexString(HMACSHA512.HashData(Encoding.UTF8.GetBytes(key), Encoding.UTF8.GetBytes(canonical)));
    }
    internal static byte[] Callback(JsonObject obj) => JsonSerializer.SerializeToUtf8Bytes(new { type = "TRANSACTION", obj });
    internal static HttpResponseMessage Json(object body, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json") };
    internal sealed class StubHandler : HttpMessageHandler
    {
        internal Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> Respond { get; set; } = (_, _) => throw new InvalidOperationException("Unexpected provider network call");
        internal int Calls { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) { Calls++; return Respond(request, ct); }
    }

    [Fact]
    public async Task Intention_uses_KSA_secret_auth_exact_minor_units_and_Unified_checkout()
    {
        var options = Settings(); var paymentId = Guid.NewGuid(); var handler = new StubHandler();
        handler.Respond = async (request, ct) =>
        {
            Assert.Equal("https://ksa.paymob.com/v1/intention/", request.RequestUri!.ToString());
            Assert.Equal("Token", request.Headers.Authorization!.Scheme); Assert.Equal(options.SecretKey, request.Headers.Authorization.Parameter);
            using var payload = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)); var body = payload.RootElement;
            Assert.Equal(10800, body.GetProperty("amount").GetInt64()); Assert.Equal("SAR", body.GetProperty("currency").GetString());
            Assert.Equal(34667, body.GetProperty("payment_methods")[0].GetInt32()); Assert.Equal("tf_reference", body.GetProperty("special_reference").GetString());
            Assert.Equal(options.NotificationUrl, body.GetProperty("notification_url").GetString());
            Assert.Equal(options.RedirectionUrl + "?paymentId=" + paymentId, body.GetProperty("redirection_url").GetString());
            Assert.Equal("SA", body.GetProperty("billing_data").GetProperty("country").GetString());
            return Json(new { id = "pi_test_response", intention_order_id = 100, client_secret = "checkout_session", special_reference = "tf_reference" });
        };
        var result = await Provider(options, handler).InitiateAsync(new(paymentId, Guid.NewGuid(), "tf_reference", 108, "SAR", "Tafseel lesson", "Student Name", "student@example.test", ""), default);
        Assert.Equal("100", result.OrderId); Assert.Equal("pi_test_response", result.IntentionId);
        Assert.StartsWith("https://ksa.checkout.paymob.com/?publicKey=", result.CheckoutReference); Assert.Contains("clientSecret=checkout_session", result.CheckoutReference);
        Assert.DoesNotContain(options.SecretKey, result.CheckoutReference); Assert.DoesNotContain(options.HmacSecret, result.CheckoutReference);
    }

    [Theory]
    [InlineData(400, "payment_provider_rejected")]
    [InlineData(500, "payment_provider_unknown")]
    public async Task Intention_API_errors_are_explicit_and_do_not_retry(int status, string code)
    {
        var handler = new StubHandler { Respond = (_, _) => Task.FromResult(Json(new { error = "safe" }, (HttpStatusCode)status)) };
        var error = await Assert.ThrowsAsync<DomainException>(() => Provider(Settings(), handler).InitiateAsync(Request(), default));
        Assert.Equal(code, error.Code); Assert.Equal(1, handler.Calls);
    }
    [Fact]
    public async Task Intention_timeout_is_ambiguous_and_is_not_retried()
    {
        var handler = new StubHandler { Respond = (_, _) => throw new TaskCanceledException() };
        await Assert.ThrowsAsync<TaskCanceledException>(() => Provider(Settings(), handler).InitiateAsync(Request(), default)); Assert.Equal(1, handler.Calls);
    }
    [Theory]
    [InlineData("EGP", 108, "payment_currency_unsupported")]
    [InlineData("SAR", 108.001, "payment_amount_invalid")]
    public async Task Currency_and_precision_are_checked_before_HTTP(string currency, decimal amount, string code)
    {
        var handler = new StubHandler(); var request = Request() with { Currency = currency, Amount = amount };
        Assert.Equal(code, (await Assert.ThrowsAsync<DomainException>(() => Provider(Settings(), handler).InitiateAsync(request, default))).Code); Assert.Equal(0, handler.Calls);
    }
    [Fact]
    public async Task Previous_EGP_integration_is_rejected_before_HTTP()
    {
        var handler = new StubHandler();
        var provider = Provider(new PaymobOptions { IntegrationId = 123 }, handler);
        Assert.Equal("payment_integration_unsupported", (await Assert.ThrowsAsync<DomainException>(() => provider.InitiateAsync(Request(), default))).Code); Assert.Equal(0, handler.Calls);
    }
    private static ProviderPaymentRequest Request() => new(Guid.NewGuid(), Guid.NewGuid(), "tf_reference", 108, "SAR", "Lesson", "Student", "student@example.test", "");

    [Fact]
    public void Hmac_has_the_exact_twenty_field_order_and_lowercase_booleans()
    {
        using var document = JsonDocument.Parse(Transaction().ToJsonString());
        Assert.Equal("108002026-10-06T12:00:00SARfalsefalse20034667truefalsefalsefalsetruefalse10042false2346MasterCardcardtrue", PaymobPaymentProvider.Canonical(document.RootElement));
        var settings = Settings(); var value = Provider(settings, new());
        var success = Transaction(); Assert.True(value.VerifyWebhook(Callback(success), Sign(success, settings.HmacSecret)).Succeeded);
        success["success"] = false; Assert.False(value.VerifyWebhook(Callback(success), Sign(success, settings.HmacSecret)).Succeeded);
        success["pending"] = true; Assert.Equal(ProviderEventKind.Pending, value.VerifyWebhook(Callback(success), Sign(success, settings.HmacSecret)).Kind);
        success["has_parent_transaction"] = true; Assert.Equal(ProviderEventKind.Ignore, value.VerifyWebhook(Callback(success), Sign(success, settings.HmacSecret)).Kind);
    }
    [Theory]
    [InlineData("invalid")]
    [InlineData("")]
    public void Invalid_HMAC_is_refused(string hmac) => Assert.Equal("invalid_webhook_signature",
        Assert.Throws<DomainException>(() => Provider(Settings(), new()).VerifyWebhook(Callback(Transaction()), hmac)).Code);
    [Fact]
    public void Signed_field_tampering_and_malformed_payload_are_refused()
    {
        var settings = Settings(); var provider = Provider(settings, new()); var tx = Transaction(); var signature = Sign(tx, settings.HmacSecret);
        tx["amount_cents"] = 10801; Assert.Equal("invalid_webhook_signature", Assert.Throws<DomainException>(() => provider.VerifyWebhook(Callback(tx), signature)).Code);
        Assert.Equal("invalid_webhook", Assert.Throws<DomainException>(() => provider.VerifyWebhook(Encoding.UTF8.GetBytes("{}"), signature)).Code);
        Assert.Equal("invalid_webhook", Assert.Throws<DomainException>(() => provider.VerifyWebhook(Encoding.UTF8.GetBytes("{bad json"), signature)).Code);
    }
    [Theory]
    [InlineData("integration_id", "payment_integration_mismatch")]
    [InlineData("is_live", "payment_environment_mismatch")]
    public void Wrong_integration_or_test_live_mode_is_refused(string field, string code)
    {
        var settings = Settings(); var tx = Transaction(); tx[field] = field == "is_live" ? JsonValue.Create(true) : JsonValue.Create(123);
        Assert.Equal(code, Assert.Throws<DomainException>(() => Provider(settings, new()).VerifyWebhook(Callback(tx), Sign(tx, settings.HmacSecret))).Code);
    }

    [Theory]
    [InlineData("success", "Succeeded")]
    [InlineData("pending", "Unknown")]
    [InlineData("failure", "Rejected")]
    [InlineData("wrong_parent", "Unknown")]
    [InlineData("timeout", "timeout")]
    public async Task Refund_uses_documented_API_and_requires_matching_provider_evidence(string outcome, string expected)
    {
        var settings = Settings(); var handler = new StubHandler();
        handler.Respond = async (request, ct) =>
        {
            Assert.Equal("/api/acceptance/void_refund/refund", request.RequestUri!.AbsolutePath); Assert.Equal(settings.SecretKey, request.Headers.Authorization!.Parameter);
            using var payload = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            Assert.Equal("200", payload.RootElement.GetProperty("transaction_id").GetString()); Assert.Equal("10800", payload.RootElement.GetProperty("amount_cents").GetString());
            if (outcome == "timeout") throw new TaskCanceledException();
            return Json(new { id = 300, pending = outcome == "pending", success = outcome != "failure", amount_cents = 10800, currency = "SAR", is_live = false,
                parent_transaction = outcome == "wrong_parent" ? 999 : 200, is_refund = true, integration_id = 34667, error_occured = false });
        };
        var provider = Provider(settings, handler);
        if (outcome == "timeout") await Assert.ThrowsAsync<TaskCanceledException>(() => provider.RefundAsync("200", 108, "SAR", default));
        else Assert.Equal(expected, (await provider.RefundAsync("200", 108, "SAR", default)).Status.ToString());
        Assert.Equal(1, handler.Calls);
    }
    [Fact]
    public async Task Parent_inquiry_uses_API_key_auth_and_never_refunds_again()
    {
        var settings = Settings(); var tx = Transaction(); tx["is_refunded"] = true; tx["refunded_amount_cents"] = 10800;
        var handler = new StubHandler { Respond = async (request, ct) =>
        {
            if (request.RequestUri!.AbsolutePath == "/api/auth/tokens")
            {
                using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)); Assert.Equal(settings.ApiKey, body.RootElement.GetProperty("api_key").GetString()); return Json(new { token = "generated_token" });
            }
            Assert.Equal(HttpMethod.Get, request.Method); Assert.Equal("/api/acceptance/transactions/200", request.RequestUri.AbsolutePath);
            Assert.Equal("Bearer", request.Headers.Authorization!.Scheme); return Json(tx);
        } };
        var result = await Provider(settings, handler).InquireAsync("tf_reference", default, "200");
        Assert.Equal(ProviderEventKind.Refund, result!.Kind); Assert.Equal(108, result.RefundedAmount); Assert.Equal(2, handler.Calls);
    }
}
