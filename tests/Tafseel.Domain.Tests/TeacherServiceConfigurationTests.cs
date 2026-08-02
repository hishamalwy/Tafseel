using Tafseel.Domain.Common;
using Tafseel.Domain.Marketplace;

namespace Tafseel.Domain.Tests;

public sealed class TeacherServiceConfigurationTests
{
    [Fact]
    public void Teacher_configures_terms_and_bilingual_approach_without_catalog_identity()
    {
        var now = DateTimeOffset.UtcNow;
        var service = New(now);

        service.Configure(150, "sar", 24, 1, "Structured steps", "خطوات منظمة", now.AddMinutes(1));

        Assert.Equal(150, service.Price);
        Assert.Equal("SAR", service.Currency);
        Assert.Equal("Structured steps", service.ApproachEn);
        Assert.Equal("خطوات منظمة", service.ApproachAr);
        Assert.Equal("Catalog title", service.Title);
    }

    [Fact]
    public void Superseded_service_cannot_be_enabled()
    {
        var service = New(DateTimeOffset.UtcNow);
        service.SupersedeBy(Guid.NewGuid(), DateTimeOffset.UtcNow);

        var error = Assert.Throws<DomainException>(() => service.SetActive(true, DateTimeOffset.UtcNow));

        Assert.Equal("teacher_service_superseded", error.Code);
        Assert.False(service.IsActive);
    }

    [Fact]
    public void Approach_is_bounded_per_language()
    {
        var service = New(DateTimeOffset.UtcNow);
        var error = Assert.Throws<DomainException>(() => service.Configure(
            120, "SAR", 48, 2, new string('x', 1001), "", DateTimeOffset.UtcNow));
        Assert.Equal("invalid_teacher_service_approach", error.Code);
    }

    private static TeacherService New(DateTimeOffset now) => new(
        "teacher", Guid.NewGuid(), Guid.NewGuid(), "Catalog title", "Catalog description",
        120, "SAR", 48, 2, now);
}
