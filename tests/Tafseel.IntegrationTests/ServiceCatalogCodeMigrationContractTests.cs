namespace Tafseel.IntegrationTests;

/// <summary>
/// Documents migration-time backfill expectations for ServiceCatalogItem.Code.
/// Runtime booking must never infer capabilities from display names.
/// </summary>
public sealed class ServiceCatalogCodeMigrationContractTests
{
    [Fact]
    public void Code_migration_backfills_known_normalized_names_and_unique_legacy_codes()
    {
        var path = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "..",
            "src", "Tafseel.Infrastructure", "Persistence", "Migrations",
            "20260727101248_ServiceCatalogItemCode.cs"));
        Assert.True(File.Exists(path), path);
        var sql = File.ReadAllText(path);

        Assert.Contains("WHEN N'LIVE SESSION' THEN 'live_session'", sql);
        Assert.Contains("WHEN N'CUSTOM RECORDED EXPLANATION' THEN 'recorded_explanation'", sql);
        Assert.Contains("WHEN N'RECORDED EXPLANATION' THEN 'recorded_explanation'", sql);
        Assert.Contains("WHEN N'ASSIGNMENT GUIDANCE' THEN 'assignment_guidance'", sql);
        Assert.Contains("WHEN N'EXAM REVISION' THEN 'exam_revision'", sql);
        Assert.Contains("legacy_unclassified_", sql);
        Assert.Contains("IX_ServiceCatalogItems_Code", sql);
        Assert.DoesNotContain("LIKE '%جلسة%'", sql);
        Assert.DoesNotContain("LIKE '%LIVE%SESSION%'", sql);
    }
}
