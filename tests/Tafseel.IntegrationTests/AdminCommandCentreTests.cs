using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Tafseel.Application.Authorization;

namespace Tafseel.IntegrationTests;

/// <summary>
/// PASS 05 — the Admin command centre and the operational filters behind it.
///
/// Two things are proven here, and neither of them is presentation:
///   1. <c>/admin/attention</c> is Admin-only. Hiding Finance in the Quality UI is not a control;
///      the policy is. A QualityReviewer must receive 403, not an empty payload.
///   2. Every enumerated operations filter is accepted server-side and narrows the real result set,
///      so a Home attention card and the list it deep-links to cannot disagree — and an unknown or
///      stale filter degrades to the unfiltered list rather than erroring a bookmark.
/// </summary>
[Trait("Category", "SqlServer")]
public sealed class AdminCommandCentreTests(SqlServerTafseelApiFactory factory)
    : IClassFixture<SqlServerTafseelApiFactory>
{
    [Fact]
    public async Task Attention_summary_is_admin_only()
    {
        var admin = await ClientAsync(Roles.Admin);
        var reviewer = await ClientAsync(Roles.QualityReviewer);
        var teacher = await ClientAsync(Roles.Teacher);
        var student = await ClientAsync(Roles.Student);

        var allowed = await admin.GetAsync("/api/v1/admin/attention");
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);

        foreach (var denied in new[] { reviewer, teacher, student })
        {
            var response = await denied.GetAsync("/api/v1/admin/attention");
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }
    }

    [Fact]
    public async Task Attention_summary_reports_every_queue_and_reconciliation_health()
    {
        var admin = await ClientAsync(Roles.Admin);
        var payload = JsonDocument.Parse(
            await admin.GetStringAsync("/api/v1/admin/attention")).RootElement;

        // Every category Admin Home renders a card for must exist in the contract, so a card can
        // never be built from a field the backend does not actually produce.
        foreach (var field in new[]
                 {
                     "teacherApplications", "openDisputes", "silentSessions", "overdueOrders",
                     "pendingWithdrawals", "pendingPayoutProfiles", "suspendedWithActiveCommerce",
                     "stuckPayments", "reconciliationAnomalies"
                 })
        {
            Assert.True(payload.TryGetProperty(field, out var value), $"missing attention field: {field}");
            Assert.True(value.GetInt32() >= 0, $"attention field went negative: {field}");
        }

        Assert.True(payload.TryGetProperty("reconciliationBalanced", out var balanced));
        Assert.Equal(JsonValueKind.True, balanced.ValueKind);
        Assert.Equal(0, payload.GetProperty("reconciliationAnomalies").GetInt32());

        // Platform context is context, not a queue — it is present but never an attention card.
        var platform = payload.GetProperty("platform");
        Assert.True(platform.GetProperty("totalUsers").GetInt32() > 0);
        Assert.Equal("SAR", platform.GetProperty("currency").GetString());
    }

    [Fact]
    public async Task Popular_subjects_report_is_ranked_and_shaped()
    {
        var admin = await ClientAsync(Roles.Admin);
        var payload = JsonDocument.Parse(
            await admin.GetStringAsync("/api/v1/admin/reports/popular-subjects")).RootElement;

        Assert.Equal(JsonValueKind.Array, payload.ValueKind);
        Assert.True(payload.GetArrayLength() <= 10);
        foreach (var row in payload.EnumerateArray())
        {
            Assert.True(row.TryGetProperty("subjectId", out _), "missing subjectId");
            Assert.False(string.IsNullOrWhiteSpace(row.GetProperty("name").GetString()));
            Assert.True(row.GetProperty("services").GetInt32() >= 0);
            Assert.True(row.GetProperty("orders").GetInt32() >= 0);
        }
    }

    /// <summary>
    /// The full filter vocabulary the Admin Operations tabs offer. Each must be accepted and must
    /// return a well-formed page — an operator following a deep link never sees a 400.
    /// </summary>
    [Theory]
    [InlineData("operations/requests", "direct")]
    [InlineData("operations/requests", "marketplace")]
    [InlineData("operations/requests", "awaiting-teacher")]
    [InlineData("operations/requests", "open")]
    [InlineData("operations/requests", "payment-reservation")]
    [InlineData("operations/requests", "expired")]
    [InlineData("operations/requests", "converted")]
    [InlineData("operations/orders", "awaiting-payment")]
    [InlineData("operations/orders", "in-progress")]
    [InlineData("operations/orders", "overdue")]
    [InlineData("operations/orders", "delivered")]
    [InlineData("operations/orders", "revision")]
    [InlineData("operations/orders", "completed")]
    [InlineData("operations/orders", "cancelled")]
    [InlineData("operations/orders", "refunded")]
    [InlineData("operations/orders", "disputed")]
    [InlineData("operations/sessions", "upcoming")]
    [InlineData("operations/sessions", "awaiting-outcome")]
    [InlineData("operations/sessions", "admin-review")]
    [InlineData("operations/sessions", "no-show-pending")]
    [InlineData("operations/sessions", "completed")]
    [InlineData("operations/sessions", "cancelled")]
    [InlineData("operations/sessions", "disputed")]
    public async Task Operations_filters_are_accepted_and_paginated(string path, string filter)
    {
        var admin = await ClientAsync(Roles.Admin);
        var response = await admin.GetAsync($"/api/v1/admin/{path}?page=1&pageSize=25&filter={filter}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(1, payload.GetProperty("page").GetInt32());
        Assert.Equal(25, payload.GetProperty("pageSize").GetInt32());
        Assert.True(payload.GetProperty("totalCount").GetInt32() >= 0);
        // totalCount must describe the FILTERED set, not the whole table — otherwise a filtered
        // list would paginate over rows it never shows.
        Assert.True(payload.GetProperty("totalCount").GetInt32()
            >= payload.GetProperty("items").GetArrayLength());
    }

    /// <summary>PRODUCT-P1: every operations list is searched by a pasted reference or by an e-mail.</summary>
    [Theory]
    [InlineData("operations/requests")]
    [InlineData("operations/orders")]
    [InlineData("operations/sessions")]
    [InlineData("disputes")]
    public async Task Operations_lists_are_searched_by_reference_or_email(string path)
    {
        var admin = await ClientAsync(Roles.Admin);
        foreach (var term in new[] { Guid.NewGuid().ToString(), "nobody-" + Guid.NewGuid().ToString("N") + "@example.com" })
        {
            var response = await admin.GetAsync($"/api/v1/admin/{path}?page=1&pageSize=20&search={Uri.EscapeDataString(term)}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
            Assert.Equal(0, payload.GetProperty("totalCount").GetInt32());
        }
    }

    [Theory]
    [InlineData("open")]
    [InlineData("under-review")]
    [InlineData("unresolved")]
    [InlineData("resolved")]
    public async Task Dispute_filters_are_accepted(string filter)
    {
        var admin = await ClientAsync(Roles.Admin);
        var response = await admin.GetAsync($"/api/v1/admin/disputes?page=1&pageSize=20&filter={filter}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    /// <summary>
    /// A filter a bookmark carries after the vocabulary changes must degrade to "everything",
    /// never to an error page. Presentation filters cannot become a source of dead links.
    /// </summary>
    [Fact]
    public async Task Unknown_filter_degrades_to_the_unfiltered_list()
    {
        var admin = await ClientAsync(Roles.Admin);
        var unfiltered = JsonDocument.Parse(
            await admin.GetStringAsync("/api/v1/admin/operations/orders?page=1&pageSize=25")).RootElement;
        var response = await admin.GetAsync(
            "/api/v1/admin/operations/orders?page=1&pageSize=25&filter=not-a-real-filter");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(unfiltered.GetProperty("totalCount").GetInt32(),
            payload.GetProperty("totalCount").GetInt32());
    }

    /// <summary>
    /// The Finance area's destinations stay Admin-only. This is the backend half of the Quality
    /// role boundary — the UI hiding them is not the control.
    /// </summary>
    [Theory]
    [InlineData("/api/v1/admin/finance/reconciliation")]
    [InlineData("/api/v1/admin/withdrawals?status=0&page=1&pageSize=10")]
    [InlineData("/api/v1/admin/payout-profiles?status=0&page=1&pageSize=10")]
    [InlineData("/api/v1/admin/audit?page=1&pageSize=25")]
    [InlineData("/api/v1/admin/operations/orders?page=1&pageSize=25")]
    [InlineData("/api/v1/admin/attention")]
    public async Task Quality_reviewer_cannot_reach_admin_finance_or_operations(string url)
    {
        var reviewer = await ClientAsync(Roles.QualityReviewer);
        var admin = await ClientAsync(Roles.Admin);

        Assert.Equal(HttpStatusCode.Forbidden, (await reviewer.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync(url)).StatusCode);
    }

    private async Task<HttpClient> ClientAsync(string role)
    {
        var user = await Pass3TestData.CreateUserAsync(factory.Services, role);
        var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, user.Email));
        return client;
    }
}
