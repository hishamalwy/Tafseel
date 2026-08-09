using System.Globalization;
using System.Text;
using Tafseel.Application.Catalog;

namespace Tafseel.Application.Ai;

public static class DiscoveryText
{
    public static string Key(string value)
    {
        var decomposed = value.Normalize(NormalizationForm.FormD);
        var chars = decomposed
            .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            .Select(c => char.IsLetterOrDigit(c) ? char.ToLowerInvariant(c) : ' ')
            .ToArray();
        return string.Join(' ', new string(chars).Split(
            (char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    public static bool HasArabic(string value) => value.Any(c => c is >= '\u0600' and <= '\u06FF');
}

public static class DiscoverySubjectAliases
{
    private static readonly string[] Mathematics =
    [
        "mathematics", "math", "maths", "calculus", "integrals", "integral", "integration",
        "رياضيات", "الرياضيات", "تكامل", "التكامل", "تفاضل", "التفاضل", "حساب"
    ];

    public static IReadOnlyCollection<string> CanonicalKeys(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return [];
        var key = DiscoveryText.Key(text);
        var mathKeys = Mathematics.Select(DiscoveryText.Key).ToArray();
        if (mathKeys.Contains(key) || mathKeys.Any(alias =>
                key.Contains(alias, StringComparison.Ordinal)
                || alias.Contains(key, StringComparison.Ordinal)))
            return new HashSet<string>(StringComparer.Ordinal)
            {
                "mathematics",
                DiscoveryText.Key("رياضيات"),
                DiscoveryText.Key("الرياضيات"),
                key
            }.ToArray();
        return [key];
    }
}

public static class DiscoveryServiceAliases
{
    private static readonly string[] Live =
    [
        "live", "live session", "online session", "online live",
        "جلسة مباشرة", "جلسه مباشره", "جلسة اونلاين", "جلسه اونلاين", "اونلاين"
    ];

    public static bool IsLive(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        var key = DiscoveryText.Key(text);
        return Live.Select(DiscoveryText.Key).Any(alias =>
            key == alias || key.Contains(alias, StringComparison.Ordinal)
            || alias.Contains(key, StringComparison.Ordinal));
    }
}

public static class DiscoveryCalendar
{
    public static DateOnly? ResolveUpcoming(
        string? dayText, string? dateText, DateTimeOffset utcNow, TimeZoneInfo zone)
    {
        var localNow = TimeZoneInfo.ConvertTime(utcNow, zone);
        var today = DateOnly.FromDateTime(localNow.DateTime);

        if (!string.IsNullOrWhiteSpace(dateText)
            && DateOnly.TryParse(dateText.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var exact)
            && exact >= today)
            return exact;

        var day = ParseDay(dayText);
        if (day is null) return null;
        var delta = ((int)day.Value - (int)today.DayOfWeek + 7) % 7;
        return today.AddDays(delta);
    }

    public static DayOfWeek? ParseDay(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var key = DiscoveryText.Key(text);
        return key switch
        {
            "sunday" or "sun" or "الاحد" or "الأحد" => DayOfWeek.Sunday,
            "monday" or "mon" or "الاثنين" => DayOfWeek.Monday,
            "tuesday" or "tue" or "الثلاثاء" => DayOfWeek.Tuesday,
            "wednesday" or "wed" or "الاربعاء" or "الأربعاء" => DayOfWeek.Wednesday,
            "thursday" or "thu" or "thurs" or "الخميس" or "خميس" => DayOfWeek.Thursday,
            "friday" or "fri" or "الجمعة" or "جمعه" => DayOfWeek.Friday,
            "saturday" or "sat" or "السبت" => DayOfWeek.Saturday,
            _ => key.Contains("thursday", StringComparison.Ordinal) || key.Contains("خميس", StringComparison.Ordinal)
                ? DayOfWeek.Thursday
                : null
        };
    }

    public static string WeekdayLabel(DateOnly date, bool arabic) => arabic
        ? date.DayOfWeek switch
        {
            DayOfWeek.Sunday => "الأحد",
            DayOfWeek.Monday => "الاثنين",
            DayOfWeek.Tuesday => "الثلاثاء",
            DayOfWeek.Wednesday => "الأربعاء",
            DayOfWeek.Thursday => "الخميس",
            DayOfWeek.Friday => "الجمعة",
            _ => "السبت"
        }
        : date.ToString("dddd", CultureInfo.GetCultureInfo("en-US"));
}

public static class DiscoveryCatalogResolver
{
    public static ResolvedCatalogItem ResolveSubject(
        string? subjectText, string? topicContext, IReadOnlyCollection<CatalogItemDto> subjects)
    {
        var direct = ResolveNames(subjectText, subjects);
        if (!direct.IsEmpty) return direct;
        return ResolveNames(topicContext, subjects);
    }

    public static ResolvedCatalogItem ResolveService(
        string serviceIntent, string? serviceText, IReadOnlyCollection<CatalogItemDto> services)
    {
        var byText = ResolveNames(serviceText, services);
        if (!byText.IsEmpty) return PreferLiveCode(byText);
        if (serviceIntent == "live_session" || DiscoveryServiceAliases.IsLive(serviceText))
        {
            var live = services.Where(x =>
                string.Equals(x.Code, "live_session", StringComparison.OrdinalIgnoreCase)
                || string.Equals(x.OrderType, Domain.Catalog.ServiceOrderTypes.LiveSession, StringComparison.OrdinalIgnoreCase))
                .ToArray();
            var coded = live.Where(x =>
                string.Equals(x.Code, "live_session", StringComparison.OrdinalIgnoreCase)).ToArray();
            return new(coded.Length == 1 ? coded : live);
        }
        if (serviceIntent == "async_request")
            return new(services.Where(x =>
                string.Equals(x.OrderType, Domain.Catalog.ServiceOrderTypes.AsyncRequest, StringComparison.OrdinalIgnoreCase))
                .ToArray());
        return ResolvedCatalogItem.Empty;
    }

    public static ResolvedCatalogItem ResolveNames(string? text, IReadOnlyCollection<CatalogItemDto> items)
    {
        if (string.IsNullOrWhiteSpace(text) || items.Count == 0) return ResolvedCatalogItem.Empty;
        var wanted = DiscoverySubjectAliases.CanonicalKeys(text);
        var exact = items.Where(item => Names(item).Select(DiscoveryText.Key).Any(wanted.Contains)).ToArray();
        if (exact.Length > 0) return new(exact);
        var contained = items.Where(item => Names(item).Select(DiscoveryText.Key).Any(name =>
            wanted.Any(key => name.Contains(key, StringComparison.Ordinal)
                || key.Contains(name, StringComparison.Ordinal)))).ToArray();
        return new(contained);
    }

    private static ResolvedCatalogItem PreferLiveCode(ResolvedCatalogItem resolution)
    {
        if (resolution.Items.Count <= 1) return resolution;
        var coded = resolution.Items.Where(x =>
            string.Equals(x.Code, "live_session", StringComparison.OrdinalIgnoreCase)).ToArray();
        return coded.Length == 1 ? new(coded) : resolution;
    }

    private static IEnumerable<string> Names(CatalogItemDto item) =>
        new[] { item.Name, item.NameEn, item.NameAr, item.Code }.Where(x => !string.IsNullOrWhiteSpace(x))!;
}

public sealed record ResolvedCatalogItem(IReadOnlyCollection<CatalogItemDto> Items)
{
    public static readonly ResolvedCatalogItem Empty = new([]);
    public bool IsEmpty => Items.Count == 0;
    public bool IsAmbiguous => Items.Count > 1;
    public CatalogItemDto? Single => Items.Count == 1 ? Items.First() : null;
}
