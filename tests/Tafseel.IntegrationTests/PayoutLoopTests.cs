using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Finance;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>PRODUCT-P0 teacher payout loop (DEC-04 manual adapter). Defect demonstrations first.</summary>
[Trait("Category", "SqlServer")]
[Trait("Category", "Financial")]
public sealed class PayoutLoopTests(SqlServerTafseelApiFactory factory) : IClassFixture<SqlServerTafseelApiFactory>
{
    private const string WebhookSecret = "integration-tests-only-payment-webhook-secret";

    // A previous test may have moved the shared clock past a maturity date; tokens are validated
    // against wall time, so every test starts from now.
    private readonly bool _clockReset = ResetClock(factory);

    private static bool ResetClock(SqlServerTafseelApiFactory factory)
    {
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        return true;
    }

    [Fact]
    public async Task Defect_arbitrary_reference_cannot_mark_a_withdrawal_transferred()
    {
        var data = await AvailableTeacherAsync();
        var (teacher, admin) = (data.Teacher, data.Admin);
        await VerifiedProfileAsync(data, teacher, admin);
        var requested = await SendAsync(teacher, HttpMethod.Post, "/api/v1/withdrawals",
            new { amount = 60, currency = "SAR" }, null, "defect-withdraw");
        requested.EnsureSuccessStatusCode();
        var withdrawal = await JsonAsync(requested);
        var id = withdrawal.GetProperty("id").GetGuid();

        var process = await SendAsync(admin, HttpMethod.Post, $"/api/v1/withdrawals/{id}/process",
            new { approve = true, providerReference = "anything" },
            withdrawal.GetProperty("version").GetString(), "defect-process");

        Assert.Equal(HttpStatusCode.BadRequest, process.StatusCode);
        Assert.False(await LedgerKeyExistsAsync($"withdrawal:{id}:paid"));
    }

    [Fact]
    public async Task Defect_admin_who_is_also_the_teacher_cannot_verify_their_own_payout_profile()
    {
        var both = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        await AddRoleAsync(both.Id, Roles.Admin);
        var client = await ClientAsync(both.Email);
        var submitted = await client.PutAsJsonAsync("/api/v1/withdrawals/profile", new
        {
            legalName = "Self Reviewer",
            countryCode = "SA",
            payoutMethod = "bank_transfer",
            bankName = "Test Bank",
            iban = "SA0380000000608010167519",
            identityLast4 = "1234"
        });
        submitted.EnsureSuccessStatusCode();
        var profile = await JsonAsync(submitted);
        var review = await SendAsync(client, HttpMethod.Post,
            $"/api/v1/admin/payout-profiles/{both.Id}/review", new { approve = true },
            profile.GetProperty("version").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, review.StatusCode);
    }

    [Fact]
    public async Task Defect_masked_label_alone_is_not_a_transfer_capable_destination()
    {
        var teacherUser = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var teacher = await ClientAsync(teacherUser.Email);
        var submitted = await teacher.PutAsJsonAsync("/api/v1/withdrawals/profile", new
        {
            legalName = "Masked Only",
            countryCode = "SA",
            payoutMethod = "Bank transfer",
            destinationLabel = "IBAN •••• 1234",
            identityLast4 = "1234"
        });
        Assert.Equal(HttpStatusCode.BadRequest, submitted.StatusCode);
    }

    [Fact]
    public async Task Finance_operator_closes_the_loop_with_instruction_initiation_and_bank_evidence()
    {
        // Staff sign in before the seed moves the clock: tokens are validated against wall time.
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var financeUser = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Finance);
        var finance = await ClientAsync(financeUser.Email);
        var data = await AvailableTeacherAsync();
        await VerifiedProfileAsync(data, data.Teacher, finance);

        // The teacher only ever sees the masked destination.
        var mine = await data.Teacher.GetStringAsync("/api/v1/withdrawals/profile");
        Assert.DoesNotContain("0608010167519", mine);
        Assert.Contains("••••7519", mine);

        var requested = await SendAsync(data.Teacher, HttpMethod.Post, "/api/v1/withdrawals",
            new { amount = 60, currency = "SAR" }, null, "loop-withdraw");
        requested.EnsureSuccessStatusCode();
        var withdrawal = await JsonAsync(requested);
        var id = withdrawal.GetProperty("id").GetGuid();

        // PRODUCT-P1: the Finance team is told about the new bank details and the new withdrawal.
        await using (var noticeScope = factory.Services.CreateAsyncScope())
        {
            var notices = noticeScope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            Assert.True(await notices.Notifications.AnyAsync(x => x.UserId == financeUser.Id && x.Type == "FinanceQueue"
                && x.Link == "/finance/payout-profiles"));
            Assert.True(await notices.Notifications.AnyAsync(x => x.UserId == financeUser.Id && x.Type == "FinanceQueue"
                && x.Link == "/finance/withdrawals" && x.DeduplicationKey.Contains(id.ToString())));
        }

        // Evidence before initiation is refused.
        var early = await SendAsync(finance, HttpMethod.Post, $"/api/v1/withdrawals/{id}/transfer-confirmation",
            Evidence("BANKREF-EARLY"), withdrawal.GetProperty("version").GetString(), "loop-early");
        Assert.Equal(HttpStatusCode.BadRequest, early.StatusCode);

        // The instruction discloses the full destination and is audited on every read.
        var instruction = await SendAsync(finance, HttpMethod.Post, $"/api/v1/admin/withdrawals/{id}/transfer-instruction", null);
        instruction.EnsureSuccessStatusCode();
        Assert.True(instruction.Headers.CacheControl?.NoStore);
        var detail = await JsonAsync(instruction);
        Assert.Equal("SA0380000000608010167519", detail.GetProperty("iban").GetString());
        Assert.False(detail.GetProperty("readyToSend").GetBoolean());
        Assert.False(detail.GetProperty("providerMovesFunds").GetBoolean());
        Assert.Equal(1, await AuditCountAsync("WithdrawalTransferInstructionViewed", id));

        var initiated = await SendAsync(finance, HttpMethod.Post, $"/api/v1/withdrawals/{id}/transfer-initiation", null,
            withdrawal.GetProperty("version").GetString(), "loop-initiate");
        initiated.EnsureSuccessStatusCode();
        var afterInitiation = await JsonAsync(initiated);
        Assert.Equal((int)WithdrawalStatus.TransferInitiated, afterInitiation.GetProperty("status").GetInt32());
        var note = afterInitiation.GetProperty("initiationReference").GetString()!;
        Assert.StartsWith("TFS-W-", note);
        Assert.False(await LedgerKeyExistsAsync($"withdrawal:{id}:paid"));

        // Tafseel's own note is not bank evidence.
        var ownNote = await SendAsync(finance, HttpMethod.Post, $"/api/v1/withdrawals/{id}/transfer-confirmation",
            Evidence(note), afterInitiation.GetProperty("version").GetString(), "loop-note");
        Assert.Equal(HttpStatusCode.BadRequest, ownNote.StatusCode);
        // Neither is an unconfirmed attestation.
        var unconfirmed = await SendAsync(finance, HttpMethod.Post, $"/api/v1/withdrawals/{id}/transfer-confirmation",
            Evidence("BANKREF-001", confirmed: false), afterInitiation.GetProperty("version").GetString(), "loop-unconfirmed");
        Assert.Equal(HttpStatusCode.BadRequest, unconfirmed.StatusCode);

        var confirmed = await SendAsync(finance, HttpMethod.Post, $"/api/v1/withdrawals/{id}/transfer-confirmation",
            Evidence("BANKREF-001"), afterInitiation.GetProperty("version").GetString(), "loop-confirm");
        confirmed.EnsureSuccessStatusCode();
        var done = await JsonAsync(confirmed);
        Assert.Equal((int)WithdrawalStatus.Completed, done.GetProperty("status").GetInt32());
        Assert.Equal("BANKREF-001", done.GetProperty("providerReference").GetString());
        Assert.True(await LedgerKeyExistsAsync($"withdrawal:{id}:paid"));

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var evidence = await db.PayoutTransferEvidences.AsNoTracking().SingleAsync(x => x.WithdrawalId == id);
        Assert.Equal(financeUser.Id, evidence.RecordedBy);
        Assert.Equal(PayoutTransferEvidence.ManualAttestationKind, evidence.Kind);
        // The IBAN is never stored in clear.
        var stored = await db.TeacherPayoutProfiles.AsNoTracking().SingleAsync(x => x.TeacherId == data.TeacherId);
        Assert.DoesNotContain("0608010167519", Encoding.UTF8.GetString(stored.DestinationCiphertext!));
    }

    [Fact]
    public async Task A_bank_reference_proves_one_transfer_and_a_started_transfer_is_cancelled_only_when_none_was_sent()
    {
        var data = await AvailableTeacherAsync();
        await VerifiedProfileAsync(data, data.Teacher, data.Admin);
        var first = await RequestAndInitiateAsync(data, 60, "dup-a");
        (await SendAsync(data.Admin, HttpMethod.Post, $"/api/v1/withdrawals/{first.Id}/transfer-confirmation",
            Evidence("BANKREF-DUP"), first.Version, "dup-confirm-a")).EnsureSuccessStatusCode();

        // Another teacher's transfer cannot reuse the same bank reference.
        data = await AvailableTeacherAsync();
        await VerifiedProfileAsync(data, data.Teacher, data.Admin);
        var second = await RequestAndInitiateAsync(data, 60, "dup-b");
        var reused = await SendAsync(data.Admin, HttpMethod.Post, $"/api/v1/withdrawals/{second.Id}/transfer-confirmation",
            Evidence("BANKREF-DUP"), second.Version, "dup-confirm-b");
        Assert.Equal(HttpStatusCode.Conflict, reused.StatusCode);
        Assert.Contains("transfer_reference_duplicate", await reused.Content.ReadAsStringAsync());

        var unsure = await SendAsync(data.Admin, HttpMethod.Post, $"/api/v1/withdrawals/{second.Id}/process",
            new { approve = false, rejectionReason = "Bank rejected the account." }, second.Version, "dup-reject-unsure");
        Assert.Equal(HttpStatusCode.BadRequest, unsure.StatusCode);
        var cancelled = await SendAsync(data.Admin, HttpMethod.Post, $"/api/v1/withdrawals/{second.Id}/process",
            new { approve = false, rejectionReason = "Bank rejected the account.", confirmNoTransferSent = true },
            second.Version, "dup-reject");
        cancelled.EnsureSuccessStatusCode();
        Assert.True(await LedgerKeyExistsAsync($"withdrawal:{second.Id}:return"));
    }

    [Fact]
    public async Task Staff_who_is_also_the_teacher_cannot_handle_their_own_withdrawal()
    {
        var data = await AvailableTeacherAsync();
        await VerifiedProfileAsync(data, data.Teacher, data.Admin);
        var requested = await SendAsync(data.Teacher, HttpMethod.Post, "/api/v1/withdrawals",
            new { amount = 60, currency = "SAR" }, null, "self-withdraw");
        requested.EnsureSuccessStatusCode();
        var withdrawal = await JsonAsync(requested);
        var id = withdrawal.GetProperty("id").GetGuid();

        await AddRoleAsync(data.TeacherId, Roles.Finance);
        // A fresh token carries the new role; it is issued at wall time so the moved clock cannot reject it.
        var now = factory.Clock.GetUtcNow();
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var self = await ClientAsync(data.TeacherEmail);
        factory.Clock.SetUtcNow(now);
        var instruction = await SendAsync(self, HttpMethod.Post, $"/api/v1/admin/withdrawals/{id}/transfer-instruction", null);
        Assert.Equal(HttpStatusCode.BadRequest, instruction.StatusCode);
        var initiate = await SendAsync(self, HttpMethod.Post, $"/api/v1/withdrawals/{id}/transfer-initiation", null,
            withdrawal.GetProperty("version").GetString(), "self-initiate");
        Assert.Equal(HttpStatusCode.BadRequest, initiate.StatusCode);
        var reject = await SendAsync(self, HttpMethod.Post, $"/api/v1/withdrawals/{id}/process",
            new { approve = false, rejectionReason = "Self" }, withdrawal.GetProperty("version").GetString(), "self-reject");
        Assert.Equal(HttpStatusCode.BadRequest, reject.StatusCode);
        Assert.Contains("withdrawal_self_processing_forbidden", await reject.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Staff_who_taught_the_purchase_cannot_refund_it()
    {
        var data = await AvailableTeacherAsync();
        Guid paymentId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            paymentId = await db.Payments.Where(x => x.OrderId == data.OrderId).Select(x => x.Id).SingleAsync();
        }
        await AddRoleAsync(data.TeacherId, Roles.Finance);
        var now = factory.Clock.GetUtcNow();
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var self = await ClientAsync(data.TeacherEmail);
        factory.Clock.SetUtcNow(now);
        var refund = await SendAsync(self, HttpMethod.Post, $"/api/v1/payments/{paymentId}/refund",
            new { reason = "Refunding my own sale." }, null, "self-refund");
        Assert.Equal(HttpStatusCode.BadRequest, refund.StatusCode);
        Assert.Contains("refund_self_processing_forbidden", await refund.Content.ReadAsStringAsync());
        Assert.False(await LedgerKeyExistsAsync($"refund:{paymentId}"));
    }

    [Fact]
    public async Task Finance_finds_a_payment_by_id_or_person_and_reads_its_whole_trail()
    {
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var financeUser = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Finance);
        var finance = await ClientAsync(financeUser.Email);
        var data = await AvailableTeacherAsync();
        Guid paymentId; string studentEmail;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var payment = await db.Payments.AsNoTracking().SingleAsync(x => x.OrderId == data.OrderId);
            paymentId = payment.Id;
            studentEmail = await db.Users.Where(u => u.Id == payment.StudentId).Select(u => u.Email!).SingleAsync();
        }

        var byOrder = await JsonAsync(await finance.GetAsync($"/api/v1/finance/payments?query={data.OrderId}"));
        Assert.Equal(paymentId, byOrder.GetProperty("items")[0].GetProperty("id").GetGuid());
        var byStudent = await JsonAsync(await finance.GetAsync($"/api/v1/finance/payments?query={Uri.EscapeDataString(studentEmail)}"));
        Assert.Contains(byStudent.GetProperty("items").EnumerateArray(), x => x.GetProperty("id").GetGuid() == paymentId);

        var detail = await JsonAsync(await finance.GetAsync($"/api/v1/finance/payments/{paymentId}"));
        Assert.Equal("Order", detail.GetProperty("purchase").GetProperty("kind").GetString());
        Assert.NotEmpty(detail.GetProperty("webhooks").EnumerateArray());
        Assert.NotEmpty(detail.GetProperty("escrow").EnumerateArray());
        Assert.NotEmpty(detail.GetProperty("ledger").EnumerateArray());
        Assert.True(detail.GetProperty("refundAvailable").GetBoolean());

        // Teachers never reach the operator's lookup, not even for their own sale.
        Assert.Equal(HttpStatusCode.Forbidden, (await data.Teacher.GetAsync($"/api/v1/finance/payments/{paymentId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await data.Teacher.GetAsync("/api/v1/finance/audit")).StatusCode);

        // The staff member who taught it is told why they cannot refund it before they try.
        await AddRoleAsync(data.TeacherId, Roles.Finance);
        var now = factory.Clock.GetUtcNow();
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var self = await ClientAsync(data.TeacherEmail);
        factory.Clock.SetUtcNow(now);
        var own = await JsonAsync(await self.GetAsync($"/api/v1/finance/payments/{paymentId}"));
        Assert.False(own.GetProperty("refundAvailable").GetBoolean());
        Assert.Equal("refund_self_processing_forbidden", own.GetProperty("refundBlockedReason").GetString());
    }

    [Fact]
    public async Task Stuck_payments_are_listed_and_every_money_action_is_in_the_financial_audit()
    {
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var financeUser = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Finance);
        var finance = await ClientAsync(financeUser.Email);
        var data = await AvailableTeacherAsync();
        Guid stuckId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var paid = await db.Payments.AsNoTracking().SingleAsync(x => x.OrderId == data.OrderId);
            var requestId = await db.Orders.Where(x => x.Id == data.OrderId).Select(x => x.LearningRequestId).SingleAsync();
            var stuck = Payment.ForOpenRequest(requestId, paid.StudentId, 10, "SAR", "Mock", "stuck-" + Guid.NewGuid().ToString("N"),
                "stuck-" + Guid.NewGuid().ToString("N"), factory.Clock.GetUtcNow().AddHours(-7));
            db.Add(stuck);
            await db.SaveChangesAsync();
            stuckId = stuck.Id;
        }
        var stuckList = await JsonAsync(await finance.GetAsync("/api/v1/finance/payments?status=stuck&pageSize=100"));
        Assert.Contains(stuckList.GetProperty("items").EnumerateArray(), x => x.GetProperty("id").GetGuid() == stuckId);
        var attention = await JsonAsync(await finance.GetAsync("/api/v1/finance/attention"));
        Assert.True(attention.GetProperty("stuckPayments").GetInt32() >= 1);

        await VerifiedProfileAsync(data, data.Teacher, finance);
        var audit = await JsonAsync(await finance.GetAsync($"/api/v1/finance/audit?query={data.TeacherId}&pageSize=100"));
        Assert.Contains(audit.GetProperty("items").EnumerateArray(), x => x.GetProperty("action").GetString() == "PayoutProfileVerified"
            && x.GetProperty("actorId").GetString() == financeUser.Id);
    }

    [Fact]
    public async Task Reconciliation_anomalies_become_cases_that_are_acknowledged_and_resolved_with_a_note()
    {
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var financeUser = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Finance);
        var finance = await ClientAsync(financeUser.Email);
        var data = await AvailableTeacherAsync();
        // A confirmed capture with no escrow hold is an orphan payment: the reconciliation reports it.
        Guid orphanId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var paid = await db.Payments.AsNoTracking().SingleAsync(x => x.OrderId == data.OrderId);
            var requestId = await db.Orders.Where(x => x.Id == data.OrderId).Select(x => x.LearningRequestId).SingleAsync();
            var orphan = Payment.ForOpenRequest(requestId, paid.StudentId, 25, "SAR", "Mock", "orphan-" + Guid.NewGuid().ToString("N"),
                "orphan-" + Guid.NewGuid().ToString("N"), factory.Clock.GetUtcNow());
            orphan.Confirm(25, "SAR", factory.Clock.GetUtcNow());
            db.Add(orphan);
            await db.SaveChangesAsync();
            orphanId = orphan.Id;
        }

        var scan = await JsonAsync(await finance.PostAsync("/api/v1/finance/reconciliation/scan", null));
        Assert.True(scan.GetProperty("openExceptions").GetInt32() >= 1);
        var again = await JsonAsync(await finance.PostAsync("/api/v1/finance/reconciliation/scan", null));
        Assert.Equal(0, again.GetProperty("newExceptions").GetInt32());

        var cases = await JsonAsync(await finance.GetAsync("/api/v1/finance/reconciliation/exceptions?pageSize=100"));
        var item = cases.GetProperty("items").EnumerateArray().Single(x =>
            x.TryGetProperty("paymentId", out var p) && p.ValueKind == JsonValueKind.String && p.GetGuid() == orphanId);
        var id = item.GetProperty("id").GetGuid();

        var tooShort = await SendAsync(finance, HttpMethod.Post, $"/api/v1/finance/reconciliation/exceptions/{id}/resolve",
            new { note = "ok" }, item.GetProperty("version").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, tooShort.StatusCode);
        var acknowledged = await SendAsync(finance, HttpMethod.Post, $"/api/v1/finance/reconciliation/exceptions/{id}/acknowledge",
            new { note = "Looking at the provider export." }, item.GetProperty("version").GetString());
        acknowledged.EnsureSuccessStatusCode();
        var ack = await JsonAsync(acknowledged);
        var resolved = await SendAsync(finance, HttpMethod.Post, $"/api/v1/finance/reconciliation/exceptions/{id}/resolve",
            new { note = "Test capture created without a purchase; no customer money involved." }, ack.GetProperty("version").GetString());
        resolved.EnsureSuccessStatusCode();
        var closed = await JsonAsync(resolved);
        Assert.Equal((int)ReconciliationExceptionStatus.Resolved, closed.GetProperty("status").GetInt32());
        Assert.Equal(financeUser.Id, closed.GetProperty("resolvedBy").GetString());

        // A later scan that still finds the same anomaly with the same difference does not reopen the case.
        await finance.PostAsync("/api/v1/finance/reconciliation/scan", null);
        var after = await JsonAsync(await finance.GetAsync("/api/v1/finance/reconciliation/exceptions?status=Resolved&pageSize=100"));
        Assert.Contains(after.GetProperty("items").EnumerateArray(), x => x.GetProperty("id").GetGuid() == id);
        Assert.Equal(3, await AuditCountAsync("ReconciliationExceptionDetected", id)
            + await AuditCountAsync("ReconciliationExceptionAcknowledged", id)
            + await AuditCountAsync("ReconciliationExceptionResolved", id));
    }

    [Fact]
    public async Task Finance_role_holds_money_duties_and_nothing_else()
    {
        var financeUser = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Finance);
        var finance = await ClientAsync(financeUser.Email);
        foreach (var url in new[] { "/api/v1/admin/withdrawals", "/api/v1/admin/payout-profiles",
                     "/api/v1/admin/finance/reconciliation" })
            Assert.Equal(HttpStatusCode.OK, (await finance.GetAsync(url)).StatusCode);
        foreach (var url in new[] { "/api/v1/admin/users", "/api/v1/admin/audit", "/api/v1/admin/operations/orders",
                     "/api/v1/admin/coupons", "/api/v1/admin/disputes", "/api/v1/teacher-applications/queue" })
            Assert.Equal(HttpStatusCode.Forbidden, (await finance.GetAsync(url)).StatusCode);
        var roleChange = await finance.PutAsJsonAsync($"/api/v1/admin/users/{financeUser.Id}/roles",
            new { role = "Admin", assigned = true });
        Assert.Equal(HttpStatusCode.Forbidden, roleChange.StatusCode);

        // Teachers and students hold none of the money duties.
        var teacherUser = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var teacher = await ClientAsync(teacherUser.Email);
        Assert.Equal(HttpStatusCode.Forbidden, (await teacher.GetAsync("/api/v1/admin/withdrawals")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await teacher.GetAsync("/api/v1/admin/payout-profiles")).StatusCode);
    }

    // ---- helpers ----

    private object Evidence(string reference, bool confirmed = true, decimal amount = 60) => new
    {
        bankReference = reference,
        sourceInstitution = "Tafseel operating account",
        // The host's clock, which the seed moved past the earning's maturity.
        transferredAt = factory.Clock.GetUtcNow(),
        amount,
        currency = "SAR",
        confirmedAgainstBankRecord = confirmed
    };

    [Fact]
    public async Task Earnings_statement_explains_the_balance_from_recorded_terms_and_transfers()
    {
        // Outsiders sign in before the seed moves the clock: tokens are validated against wall time.
        var outsider = await ClientAsync((await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher)).Email);
        var student = await ClientAsync((await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student)).Email);
        var data = await AvailableTeacherAsync();
        await VerifiedProfileAsync(data, data.Teacher, data.Admin);
        var (id, version) = await RequestAndInitiateAsync(data, 60, "statement-withdraw");
        (await SendAsync(data.Admin, HttpMethod.Post, $"/api/v1/withdrawals/{id}/transfer-confirmation",
            Evidence("BANKREF-STATEMENT"), version, "statement-confirm")).EnsureSuccessStatusCode();

        var statement = await JsonAsync(await data.Teacher.GetAsync("/api/v1/withdrawals/earnings"));

        // DEC-06 terms snapshotted on the Order: 100 SAR, 15% commission, 85 SAR credited by the ledger.
        var item = Assert.Single(statement.GetProperty("items").EnumerateArray());
        Assert.Equal("order", item.GetProperty("kind").GetString());
        Assert.Equal(data.OrderId, item.GetProperty("referenceId").GetGuid());
        Assert.Equal(100m, item.GetProperty("price").GetDecimal());
        Assert.Equal(15m, item.GetProperty("commissionPercent").GetDecimal());
        Assert.Equal(15m, item.GetProperty("commission").GetDecimal());
        Assert.Equal(85m, item.GetProperty("net").GetDecimal());
        Assert.Equal(0m, item.GetProperty("adjustment").GetDecimal());
        Assert.Equal("available", item.GetProperty("state").GetString());

        // 85 earned = 25 available + 60 transferred, and the balance endpoint agrees.
        var totals = Assert.Single(statement.GetProperty("totals").EnumerateArray());
        Assert.Equal(85m, totals.GetProperty("earned").GetDecimal());
        Assert.Equal(60m, totals.GetProperty("transferred").GetDecimal());
        Assert.Equal(1, totals.GetProperty("transferredCount").GetInt32());
        Assert.Equal(25m, totals.GetProperty("available").GetDecimal());
        Assert.Equal(0m, totals.GetProperty("inTransfer").GetDecimal());
        Assert.True(totals.GetProperty("addsUp").GetBoolean());
        var balance = (await JsonAsync(await data.Teacher.GetAsync("/api/v1/withdrawals/balances")))[0];
        Assert.Equal(totals.GetProperty("available").GetDecimal(), balance.GetProperty("available").GetDecimal());

        // Another teacher sees none of it; a student cannot read a statement at all.
        var other = await JsonAsync(await outsider.GetAsync("/api/v1/withdrawals/earnings"));
        Assert.Empty(other.GetProperty("items").EnumerateArray());
        Assert.Empty(other.GetProperty("totals").EnumerateArray());
        Assert.Equal(HttpStatusCode.Forbidden, (await student.GetAsync("/api/v1/withdrawals/earnings")).StatusCode);
    }

    private async Task<(Guid Id, string Version)> RequestAndInitiateAsync(SeedData data, decimal amount, string key)
    {
        var requested = await SendAsync(data.Teacher, HttpMethod.Post, "/api/v1/withdrawals",
            new { amount, currency = "SAR" }, null, key);
        requested.EnsureSuccessStatusCode();
        var withdrawal = await JsonAsync(requested);
        var id = withdrawal.GetProperty("id").GetGuid();
        var initiated = await SendAsync(data.Admin, HttpMethod.Post, $"/api/v1/withdrawals/{id}/transfer-initiation", null,
            withdrawal.GetProperty("version").GetString(), key + "-initiate");
        initiated.EnsureSuccessStatusCode();
        return (id, (await JsonAsync(initiated)).GetProperty("version").GetString()!);
    }

    private async Task<int> AuditCountAsync(string action, Guid entityId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return await db.FinancialAuditRecords.CountAsync(x => x.Action == action && x.EntityId == entityId.ToString());
    }

    private async Task VerifiedProfileAsync(SeedData data, HttpClient teacher, HttpClient admin)
    {
        var submitted = await teacher.PutAsJsonAsync("/api/v1/withdrawals/profile", new
        {
            legalName = "Verified Teacher",
            countryCode = "SA",
            payoutMethod = "bank_transfer",
            bankName = "Test Bank",
            iban = "SA0380000000608010167519",
            identityLast4 = "1234"
        });
        submitted.EnsureSuccessStatusCode();
        var profile = await JsonAsync(submitted);
        var review = await SendAsync(admin, HttpMethod.Post,
            $"/api/v1/admin/payout-profiles/{data.TeacherId}/review", new { approve = true },
            profile.GetProperty("version").GetString());
        review.EnsureSuccessStatusCode();
    }

    private async Task<SeedData> AvailableTeacherAsync()
    {
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var admin = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Admin);
        Guid orderId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var now = factory.Clock.GetUtcNow();
            var suffix = Guid.NewGuid().ToString("N");
            var subject = new Subject("Payout Subject " + suffix, "code");
            var type = new ServiceCatalogItem("Payout Service " + suffix, "Explanation", "svc_" + suffix, "خدمة", "شرح");
            var service = new TeacherService(teacher.Id, subject.Id, type.Id, "Payout order",
                "Order used to prove the payout loop.", 100, "SAR", 24, 1, now);
            var request = new LearningRequest(student.Id, teacher.Id, service.Id, "Payout request",
                "Explain the supplied material.", now.AddDays(3), 100, now);
            request.Accept(teacher.Id, "seed-accept", now);
            var order = new Order(request.Id, student.Id, teacher.Id, service.Id, 100, "SAR",
                8, 15, now.AddDays(2), 1, now);
            db.AddRange(subject, type, service, request, order,
                new TeacherSubjectQualification(teacher.Id, subject.Id, now));
            await db.SaveChangesAsync();
            orderId = order.Id;
        }

        var studentClient = await ClientAsync(student.Email);
        var init = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{orderId}")
        {
            Content = JsonContent.Create(new { })
        };
        init.Headers.TryAddWithoutValidation("Idempotency-Key", "payout-init-" + orderId);
        var initiated = await studentClient.SendAsync(init);
        initiated.EnsureSuccessStatusCode();
        var payment = (await JsonAsync(initiated)).GetProperty("payment");
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            eventId = "payout-" + orderId,
            providerReference = payment.GetProperty("providerReference").GetString(),
            amount = payment.GetProperty("amount").GetDecimal(),
            currency = "SAR",
            succeeded = true
        });
        var webhook = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/mock")
        {
            Content = new ByteArrayContent(payload)
        };
        webhook.Headers.TryAddWithoutValidation("X-Mock-Signature",
            Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(WebhookSecret), payload)));
        (await factory.CreateClient().SendAsync(webhook)).EnsureSuccessStatusCode();

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var order = await db.Orders.SingleAsync(x => x.Id == orderId);
            order.Start(teacher.Id, factory.Clock.GetUtcNow());
            order.Deliver(teacher.Id, "storage", "delivery.pdf", "application/pdf", 8, "Delivered", factory.Clock.GetUtcNow());
            await db.SaveChangesAsync();
        }
        string version;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            version = Convert.ToBase64String(await db.Orders.AsNoTracking().Where(x => x.Id == orderId)
                .Select(x => x.RowVersion).SingleAsync());
        }
        (await SendAsync(studentClient, HttpMethod.Post, $"/api/v1/orders/{orderId}/complete", null, version))
            .EnsureSuccessStatusCode();

        DateTimeOffset maturesAt;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            maturesAt = await db.TeacherEarningMaturities.Where(x => x.OrderId == orderId)
                .Select(x => x.MaturesAt).SingleAsync();
        }
        // Sign in before the clock moves: tokens are validated against wall time.
        var teacherClient = await ClientAsync(teacher.Email);
        var adminClient = await ClientAsync(admin.Email);
        factory.Clock.SetUtcNow(maturesAt.AddMinutes(1));
        await factory.Services.GetRequiredService<EarningsMaturityWorker>().MatureDueEarningsAsync(default);
        return new(teacher.Id, teacher.Email, admin.Id, admin.Email, orderId, teacherClient, adminClient);
    }

    private async Task AddRoleAsync(string userId, string role)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByIdAsync(userId);
        Assert.True((await users.AddToRoleAsync(user!, role)).Succeeded);
    }

    private async Task<bool> LedgerKeyExistsAsync(string key)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return await db.LedgerEntries.AnyAsync(x => x.BusinessKey == key);
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    private static async Task<HttpResponseMessage> SendAsync(
        HttpClient client, HttpMethod method, string url, object? body, string? version = null, string? key = null)
    {
        var request = new HttpRequestMessage(method, url);
        if (body is not null) request.Content = JsonContent.Create(body);
        if (version is not null) request.Headers.TryAddWithoutValidation("If-Match", version);
        if (key is not null) request.Headers.TryAddWithoutValidation("Idempotency-Key", key);
        return await client.SendAsync(request);
    }

    private sealed record SeedData(string TeacherId, string TeacherEmail, string AdminId, string AdminEmail, Guid OrderId,
        HttpClient Teacher, HttpClient Admin);
}
