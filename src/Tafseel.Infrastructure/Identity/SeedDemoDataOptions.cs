namespace Tafseel.Infrastructure.Identity;

/// <summary>
/// Opt-in Development-only demo catalog content (subjects, topics, qualification topics,
/// education levels) so a fresh Development database looks populated. Never applies in
/// Staging or Production; see ADR-013. Independent of <see cref="SeedUsersOptions"/> — a
/// developer may want either without the other.
/// </summary>
public sealed class SeedDemoDataOptions
{
    public const string SectionName = "SeedDemoData";

    public bool Enabled { get; init; }
}
