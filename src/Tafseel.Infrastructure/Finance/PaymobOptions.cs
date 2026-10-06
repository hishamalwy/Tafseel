using Microsoft.Extensions.Hosting;

namespace Tafseel.Infrastructure.Finance;

public sealed class PaymobOptions
{
    public string BaseUrl { get; init; } = "https://ksa.paymob.com";
    public int IntegrationId { get; init; } = 34667;
    public string Currency { get; init; } = "SAR";
    public string Mode { get; init; } = "Test";
    public string SecretKey { get; init; } = "";
    public string PublicKey { get; init; } = "";
    public string HmacSecret { get; init; } = "";
    public string ApiKey { get; init; } = "";
    public string NotificationUrl { get; init; } = "";
    public string RedirectionUrl { get; init; } = "";

    public bool IsLive => Mode == "Live";

    internal IReadOnlyList<string> Problems(bool production)
    {
        var problems = new List<string>();
        if (BaseUrl.TrimEnd('/') != "https://ksa.paymob.com") problems.Add("Paymob:BaseUrl must be https://ksa.paymob.com.");
        if (Currency != "SAR") problems.Add("Paymob:Currency must be SAR.");
        if (Mode is not ("Test" or "Live") || production && !IsLive)
            problems.Add("Paymob:Mode must be Test outside Production and Live in Production.");
        if (IntegrationId <= 0 || !IsLive && IntegrationId != 34667 || production && IntegrationId == 34667)
            problems.Add("Paymob:IntegrationId must be 34667 for Test, and the owner's KSA SAR Live integration in Production.");
        var suffix = IsLive ? "live_" : "test_";
        if (!SecretKey.StartsWith("sk_" + suffix, StringComparison.Ordinal) || Placeholder(SecretKey))
            problems.Add("Paymob:SecretKey must be a real key matching Paymob:Mode.");
        if (!PublicKey.StartsWith("pk_" + suffix, StringComparison.Ordinal) || Placeholder(PublicKey))
            problems.Add("Paymob:PublicKey must be a real key matching Paymob:Mode.");
        if (HmacSecret.Length < 32 || Placeholder(HmacSecret)) problems.Add("Paymob:HmacSecret is required.");
        if (ApiKey.Length < 32 || Placeholder(ApiKey)) problems.Add("Paymob:ApiKey is required for the documented missed-callback inquiry fallback.");
        foreach (var (key, path, value) in new[] {
            ("NotificationUrl", "/api/v1/payments/webhooks/paymob", NotificationUrl),
            ("RedirectionUrl", "/checkout/result", RedirectionUrl) })
            if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "https"
                || uri.UserInfo.Length > 0 || uri.AbsolutePath != path || uri.Query.Length > 0 || uri.Fragment.Length > 0
                || uri.IsLoopback || uri.Host.EndsWith(".invalid", StringComparison.Ordinal)
                || uri.Host.EndsWith(".example", StringComparison.Ordinal))
                problems.Add($"Paymob:{key} must be the public HTTPS {path} endpoint.");
        return problems;
    }

    private static bool Placeholder(string value) => value.Length < 16
        || new[] { "replace", "placeholder", "dummy", "example", "changeme", "xxxxxxxx" }
            .Any(word => value.Contains(word, StringComparison.OrdinalIgnoreCase));
}
