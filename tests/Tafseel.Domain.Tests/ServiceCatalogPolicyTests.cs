using Tafseel.Domain.Catalog;
using Tafseel.Domain.Common;

namespace Tafseel.Domain.Tests;

public sealed class ServiceCatalogPolicyTests
{
    [Fact]
    public void Valid_async_policy_is_complete()
    {
        var item = Async();
        item.EnsurePolicyComplete();
        Assert.False(item.RequiresScheduling);
    }

    [Fact]
    public void Valid_live_policy_is_complete()
    {
        var item = Live();
        item.EnsurePolicyComplete();
        Assert.True(item.RequiresScheduling);
        Assert.Equal([30, 60], item.AllowedDurations);
    }

    [Theory]
    [InlineData("bad_category", "academic_support", "async_request", "subject_qualification_required", "SAR", "invalid_service_category")]
    [InlineData("academic_support", "academic_support", "bad_order", "subject_qualification_required", "SAR", "invalid_service_order_type")]
    [InlineData("academic_support", "academic_support", "async_request", "bad_policy", "SAR", "invalid_service_qualification_policy")]
    [InlineData("academic_support", "academic_support", "async_request", "subject_qualification_required", "USD", "unsupported_service_currency")]
    public void Finite_policy_codes_are_enforced(string category, string icon, string orderType, string qualification, string currency, string code)
    {
        var ex = Assert.Throws<DomainException>(() => New(category, icon, orderType, qualification, currency));
        Assert.Equal(code, ex.Code);
    }

    [Fact]
    public void Price_ordering_is_enforced() => AssertCode("invalid_service_price_policy", () => New(min: 100, standard: 90));

    [Fact]
    public void Delivery_ordering_is_enforced() => AssertCode("invalid_service_delivery_policy", () => New(minDelivery: 72, defaultDelivery: 48));

    [Fact]
    public void Revision_boundaries_are_enforced() => AssertCode("invalid_service_revision_policy", () => New(defaultRevisions: 4, maximumRevisions: 3));

    [Fact]
    public void Live_delivery_is_rejected()
    {
        var item = Live();
        AssertCode("live_service_delivery_forbidden", () => item.ConfigurePolicy(
            item.CategoryCode, item.IconCode, item.OrderType, item.QualificationPolicy, item.CurrencyCode,
            item.MinPrice!.Value, item.DefaultPrice, item.RecommendedPrice, item.MaxPrice!.Value,
            1, null, null, null, 0, 0, true, true, [30], 0, false));
    }

    [Fact]
    public void Live_revisions_are_rejected() => AssertCode("live_service_revisions_forbidden", () => New(orderType: ServiceOrderTypes.LiveSession, minDelivery: null, defaultDelivery: null, recommendedDelivery: null, maxDelivery: null, defaultRevisions: 1, maximumRevisions: 1, durations: [30]));

    [Fact]
    public void Referenced_order_type_is_immutable()
    {
        var item = Async();
        AssertCode("service_order_type_immutable", () => Configure(item, ServiceOrderTypes.LiveSession, item.QualificationPolicy, true));
    }

    [Fact]
    public void Referenced_qualification_policy_is_immutable()
    {
        var item = Async();
        AssertCode("service_qualification_policy_immutable", () => Configure(item, item.OrderType, "future_policy", true));
    }

    private static ServiceCatalogItem Async() => New();
    private static ServiceCatalogItem Live() => New(orderType: ServiceOrderTypes.LiveSession, minDelivery: null, defaultDelivery: null, recommendedDelivery: null, maxDelivery: null, defaultRevisions: 0, maximumRevisions: 0, durations: [30, 60]);

    private static ServiceCatalogItem New(
        string category = ServiceCategoryCodes.AcademicSupport,
        string icon = ServiceIconCodes.AcademicSupport,
        string orderType = ServiceOrderTypes.AsyncRequest,
        string qualification = ServiceQualificationPolicies.SubjectQualificationRequired,
        string currency = "SAR",
        decimal min = 10,
        decimal standard = 20,
        int? minDelivery = 1,
        int? defaultDelivery = 48,
        int? recommendedDelivery = 48,
        int? maxDelivery = 8760,
        int defaultRevisions = 2,
        int maximumRevisions = 20,
        int[]? durations = null) =>
        new("Service", "Description", "test_service_" + Guid.NewGuid().ToString("N"), "خدمة", "وصف",
            categoryCode: category, iconCode: icon, orderType: orderType, qualificationPolicy: qualification,
            currencyCode: currency, minPrice: min, defaultPrice: standard, recommendedPrice: standard,
            maxPrice: 1000, minimumDeliveryHours: minDelivery, defaultDeliveryHours: defaultDelivery,
            recommendedDeliveryHours: recommendedDelivery, maximumDeliveryHours: maxDelivery,
            defaultRevisions: defaultRevisions, maximumRevisions: maximumRevisions, allowedDurations: durations);

    private static void Configure(ServiceCatalogItem item, string orderType, string qualification, bool referenced) =>
        item.ConfigurePolicy(item.CategoryCode, item.IconCode, orderType, qualification, item.CurrencyCode,
            item.MinPrice!.Value, item.DefaultPrice, item.RecommendedPrice, item.MaxPrice!.Value,
            orderType == ServiceOrderTypes.LiveSession ? null : item.MinimumDeliveryHours,
            orderType == ServiceOrderTypes.LiveSession ? null : item.DefaultDeliveryHours,
            orderType == ServiceOrderTypes.LiveSession ? null : item.RecommendedDeliveryHours,
            orderType == ServiceOrderTypes.LiveSession ? null : item.MaximumDeliveryHours,
            orderType == ServiceOrderTypes.LiveSession ? 0 : item.DefaultRevisions,
            orderType == ServiceOrderTypes.LiveSession ? 0 : item.MaximumRevisions,
            item.IsPublic, item.TeacherSelectable, orderType == ServiceOrderTypes.LiveSession ? [30] : [], item.DisplayOrder, referenced);

    private static void AssertCode(string code, Action action) => Assert.Equal(code, Assert.Throws<DomainException>(action).Code);
}
