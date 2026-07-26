using Tafseel.Domain.Catalog;

namespace Tafseel.Domain.Tests;

public sealed class CatalogNameTests
{
    [Fact]
    public void Names_are_persisted_with_canonical_whitespace_and_case_key()
    {
        var subject = new Subject("  Data\t  Structures  ", "code");

        Assert.Equal("Data Structures", subject.Name);
        Assert.Equal("DATA STRUCTURES", subject.NormalizedName);
    }

    [Fact]
    public void Arabic_diacritics_are_preserved()
    {
        var subject = new Subject("  اللُّغَة   العربية ", "language");

        Assert.Equal("اللُّغَة العربية", subject.Name);
        Assert.NotEqual(CatalogNameNormalizer.Key("اللغة العربية"), subject.NormalizedName);
    }
}
