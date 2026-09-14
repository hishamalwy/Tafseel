namespace Tafseel.Infrastructure.Identity;

public sealed class PrivacyOptions
{
    public const string SectionName = "Privacy";
    public int ReadNotificationDays { get; init; } = 180;
    public int AuthenticationRecordDays { get; init; } = 30;
    public int MarketplaceAnalyticsDays { get; init; } = 365;
    public int BatchSize { get; init; } = 1000;
}
