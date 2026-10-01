using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Application.Finance;
using Tafseel.Application.Governance;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Governance;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Finance;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

/// <summary>
/// Concurrency verification for FR-2, against real SQL Server transactions and application locks.
/// <para>
/// The invariant under test, stated once: <b>money that is withdrawable must never be exposed to a
/// dispute that is still validly openable or open.</b> Equivalently, the pair
/// (earning matured, dispute unresolved) must be unreachable.
/// </para>
/// <para>
/// Order economics: price 100 SAR, fee 8%, commission 15% → capture 108, TeacherNet 85, margin 23.
/// Dispute window is 7 days measured from the last Delivered transition.
/// </para>
/// </summary>
[Trait("Category", "SqlServer")]
[Trait("Category", "Financial")]
public sealed class EarningsMaturityConcurrencyTests : IClassFixture<SqlServerTafseelApiFactory>
{
    private readonly SqlServerTafseelApiFactory factory;

    public EarningsMaturityConcurrencyTests(SqlServerTafseelApiFactory factory)
    {
        this.factory = factory;
        factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
    }

    private const string WebhookSecret = "integration-tests-only-payment-webhook-secret";
    private const decimal TeacherNet = 85m;

    // ============================================================== A

    [Fact]
    public async Task A_dispute_committed_before_maturity_evaluates_keeps_the_earning_pending()
    {
        var data = await ReadyToMatureAsync("race-a");
        await OpenDisputeAsync(data);

        factory.Clock.SetUtcNow((await MaturesAtAsync(data)).AddMinutes(1));
        await WorkerAsync().MatureDueEarningsAsync(default);

        Assert.Equal(TeacherEarningMaturityStatus.Pending, await StatusAsync(data));
        await AssertInvariantAsync(data);
        await AssertNotWithdrawableAsync(data);
    }

    // ============================================================== B and C

    [Theory]
    // (B) maturity begins while the window is still open, dispute races it.
    [InlineData(0, 8)]
    // (C) dispute begins immediately before the deadline, maturity immediately after.
    [InlineData(-1, 8)]
    public async Task BC_concurrent_dispute_and_maturity_never_leave_withdrawable_money_exposed(
        int disputeOffsetSeconds, int attempts)
    {
        for (var attempt = 0; attempt < attempts; attempt++)
        {
            factory.Clock.SetUtcNow(DateTimeOffset.UtcNow);
            var data = await ReadyToMatureAsync($"race-bc-{disputeOffsetSeconds}-{attempt}");
            var maturesAt = await MaturesAtAsync(data);

            // The student's token must be minted before the clock crosses the deadline.
            var student = await ClientAsync(data.StudentEmail);
            // Both operations read the same clock; place it so each side is individually plausible.
            factory.Clock.SetUtcNow(maturesAt.AddSeconds(disputeOffsetSeconds < 0 ? 0 : 1));

            var maturityId = await MaturityIdAsync(data);
            var barrier = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

            var disputeTask = Task.Run(async () =>
            {
                await barrier.Task;
                return await SendAsync(student, HttpMethod.Post, "/api/v1/disputes",
                    new { orderId = data.OrderId, reason = "Concurrent dispute during maturity." });
            });
            var maturityTask = Task.Run(async () =>
            {
                await barrier.Task;
                // A fresh scope per attempt: the worker uses its own scope in production too.
                await using var scope = factory.Services.CreateAsyncScope();
                var finance = scope.ServiceProvider.GetRequiredService<IFinancialService>();
                try { return await finance.MatureTeacherEarningAsync(maturityId, default); }
                catch { return false; }
            });

            barrier.SetResult();
            var dispute = await disputeTask;
            var matured = await maturityTask;

            var status = await StatusAsync(data);
            var disputeOpened = dispute.StatusCode == HttpStatusCode.OK;

            // The whole point: these two must never both be true.
            Assert.False(matured && disputeOpened,
                $"attempt {attempt}: earning matured AND a dispute was accepted — withdrawable money is exposed");
            Assert.False(status == TeacherEarningMaturityStatus.Matured && disputeOpened,
                $"attempt {attempt}: matured schedule coexists with an accepted dispute");

            // Whichever side lost must have lost cleanly, not silently.
            if (disputeOpened)
            {
                Assert.Equal(TeacherEarningMaturityStatus.Pending, status);
                await AssertNotWithdrawableAsync(data);
            }
            else
            {
                Assert.Equal(HttpStatusCode.BadRequest, dispute.StatusCode);
                Assert.Contains("dispute_not_allowed", await dispute.Content.ReadAsStringAsync());
            }
            await AssertInvariantAsync(data);
        }
    }

    /// <summary>
    /// Deterministic reproduction of the exact interleaving that scenarios B and C can only hit by luck.
    /// <para>
    /// <c>OpenDisputeAsync</c> takes the application lock <c>dispute-order:{id}</c> and holds it for the
    /// rest of its transaction — across its eligibility check, its insert and its commit. This test holds
    /// that same real lock on a separate connection, which is precisely the state of an in-flight dispute
    /// that has already passed eligibility but has not yet committed, and then runs a maturity pass.
    /// </para>
    /// <para>
    /// Nothing is mocked: the lock resource, the database and the service are all real. Without the
    /// matching lock in <c>MatureTeacherEarningAsync</c>, maturity reads <c>Disputes</c>, sees nothing
    /// (the insert is uncommitted, and shared range locks do not conflict), promotes the money, and the
    /// dispute then commits — leaving withdrawable money exposed to a valid dispute.
    /// </para>
    /// </summary>
    [Fact]
    public async Task An_in_flight_dispute_transaction_blocks_maturity()
    {
        var data = await ReadyToMatureAsync("race-inflight");
        var maturityId = await MaturityIdAsync(data);
        factory.Clock.SetUtcNow((await MaturesAtAsync(data)).AddSeconds(1));

        await using var holder = new SqlConnection(
            factory.Services.GetRequiredService<TafseelDbContext>().Database.GetConnectionString());
        await holder.OpenAsync();
        await using var holderTransaction = (SqlTransaction)await holder.BeginTransactionAsync();
        await using (var takeLock = holder.CreateCommand())
        {
            takeLock.Transaction = holderTransaction;
            takeLock.CommandType = System.Data.CommandType.StoredProcedure;
            takeLock.CommandText = "sp_getapplock";
            AddParameter(takeLock, "@Resource", $"dispute-order:{data.OrderId}");
            AddParameter(takeLock, "@LockMode", "Exclusive");
            AddParameter(takeLock, "@LockOwner", "Transaction");
            await takeLock.ExecuteNonQueryAsync();
        }

        bool matured;
        try
        {
            await using var scope = factory.Services.CreateAsyncScope();
            var finance = scope.ServiceProvider.GetRequiredService<IFinancialService>();
            matured = await finance.MatureTeacherEarningAsync(maturityId, default);
        }
        finally
        {
            await holderTransaction.RollbackAsync();
        }

        Assert.False(matured, "maturity promoted money while a dispute transaction was still in flight");
        Assert.Equal(TeacherEarningMaturityStatus.Pending, await StatusAsync(data));
        await AssertNotWithdrawableAsync(data);

        // Once the dispute transaction is gone the earning matures normally, proving the block was the
        // lock and not some unrelated failure.
        await WorkerAsync().MatureDueEarningsAsync(default);
        Assert.Equal(TeacherEarningMaturityStatus.Matured, await StatusAsync(data));
    }

    private static void AddParameter(SqlCommand command, string name, string value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = System.Data.DbType.String;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    // ============================================================== D

    [Fact]
    public async Task D_unresolved_dispute_after_the_deadline_blocks_maturity_indefinitely()
    {
        var data = await ReadyToMatureAsync("race-d");
        await OpenDisputeAsync(data);
        var maturesAt = await MaturesAtAsync(data);

        foreach (var days in new[] { 1, 10, 90 })
        {
            factory.Clock.SetUtcNow(maturesAt.AddDays(days));
            await WorkerAsync().MatureDueEarningsAsync(default);
            Assert.Equal(TeacherEarningMaturityStatus.Pending, await StatusAsync(data));
            await AssertNotWithdrawableAsync(data);
        }
        await AssertInvariantAsync(data);
    }

    // ============================================================== E

    [Fact]
    public async Task E_refund_student_resolution_means_the_earning_never_becomes_available()
    {
        var data = await ReadyToMatureAsync("race-e");
        var disputeId = await OpenDisputeAsync(data);
        await ResolveAsync(data, disputeId, DisputeResolution.RefundStudent, "resolve-e");

        Assert.Equal(TeacherEarningMaturityStatus.Reversed, await StatusAsync(data));

        factory.Clock.SetUtcNow((await MaturesAtAsync(data)).AddDays(30));
        await WorkerAsync().MatureDueEarningsAsync(default);

        Assert.Equal(TeacherEarningMaturityStatus.Reversed, await StatusAsync(data));
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Empty(await db.LedgerEntries
            .Where(x => x.BusinessKey == $"order:{data.OrderId}:teacher-maturity").ToArrayAsync());
        Assert.Equal(0m, await BalanceAsync(data.TeacherId, LedgerAccountKind.TeacherAvailable));
        Assert.Equal(0m, await BalanceAsync(data.TeacherId, LedgerAccountKind.TeacherPending));
    }

    // ============================================================== F and G

    [Theory]
    // (F) the teacher won the dispute — the money is theirs, but only once the window has also passed.
    [InlineData((int)DisputeResolution.ReleaseTeacher)]
    // (G) no financial action — the earning is untouched and follows the ordinary schedule.
    [InlineData((int)DisputeResolution.NoFinancialAction)]
    public async Task FG_teacher_favourable_resolutions_mature_only_after_resolution_and_deadline(
        int resolution)
    {
        var data = await ReadyToMatureAsync($"race-fg-{resolution}");
        var disputeId = await OpenDisputeAsync(data);
        var maturesAt = await MaturesAtAsync(data);
        // Minted before the jump: JWT lifetimes are validated against real wall time.
        var admin = await ClientAsync(data.AdminEmail);

        // Still unresolved and past the deadline: blocked.
        factory.Clock.SetUtcNow(maturesAt.AddMinutes(5));
        await WorkerAsync().MatureDueEarningsAsync(default);
        Assert.Equal(TeacherEarningMaturityStatus.Pending, await StatusAsync(data));
        await AssertNotWithdrawableAsync(data);

        await ResolveAsync(data, disputeId, (DisputeResolution)resolution, $"resolve-fg-{resolution}", admin);

        // Resolution alone does not release it early; the schedule still governs.
        Assert.Equal(TeacherEarningMaturityStatus.Pending, await StatusAsync(data));

        // Resolved AND past the deadline: matures on the next pass.
        await WorkerAsync().MatureDueEarningsAsync(default);
        Assert.Equal(TeacherEarningMaturityStatus.Matured, await StatusAsync(data));
        Assert.Equal(TeacherNet, await BalanceAsync(data.TeacherId, LedgerAccountKind.TeacherAvailable));
        Assert.Equal(0m, await BalanceAsync(data.TeacherId, LedgerAccountKind.TeacherPending));
        await AssertInvariantAsync(data);
    }

    [Fact]
    public async Task FG_resolution_before_the_deadline_still_waits_for_the_deadline()
    {
        var data = await ReadyToMatureAsync("race-fg-early");
        var disputeId = await OpenDisputeAsync(data);
        await ResolveAsync(data, disputeId, DisputeResolution.ReleaseTeacher, "resolve-early");

        // Resolved well inside the window: still not due.
        await WorkerAsync().MatureDueEarningsAsync(default);
        Assert.Equal(TeacherEarningMaturityStatus.Pending, await StatusAsync(data));
        await AssertNotWithdrawableAsync(data);

        factory.Clock.SetUtcNow((await MaturesAtAsync(data)).AddSeconds(1));
        await WorkerAsync().MatureDueEarningsAsync(default);
        Assert.Equal(TeacherEarningMaturityStatus.Matured, await StatusAsync(data));
    }

    // ============================================================== H

    [Fact]
    public async Task H_withdrawal_is_refused_at_every_point_where_money_is_still_pending()
    {
        var data = await ReadyToMatureAsync("race-h");
        var teacher = await ClientAsync(data.TeacherEmail);
        await VerifyPayoutProfileAsync(data, teacher);

        // 1. Pending, inside the window.
        await AssertWithdrawalRefusedAsync(teacher, "h-1");

        // 2. Pending, past the deadline but with an unresolved dispute.
        var disputeId = await OpenDisputeAsync(data);
        var admin = await ClientAsync(data.AdminEmail);
        factory.Clock.SetUtcNow((await MaturesAtAsync(data)).AddMinutes(1));
        await WorkerAsync().MatureDueEarningsAsync(default);
        await AssertWithdrawalRefusedAsync(teacher, "h-2");

        // 3. Concurrent withdrawal attempts while a maturity pass runs — pending is a different account,
        //    so no interleaving can make it withdrawable.
        var maturityPass = Task.Run(() => WorkerAsync().MatureDueEarningsAsync(default));
        var withdrawals = await Task.WhenAll(
            WithdrawAsync(teacher, 50, "h-3a"),
            WithdrawAsync(teacher, 50, "h-3b"));
        await maturityPass;
        Assert.All(withdrawals, x => Assert.Equal(HttpStatusCode.BadRequest, x.StatusCode));

        // 4. Resolved in the teacher's favour and past the deadline — now, and only now, withdrawable.
        await ResolveAsync(data, disputeId, DisputeResolution.ReleaseTeacher, "resolve-h", admin);
        await WorkerAsync().MatureDueEarningsAsync(default);
        (await WithdrawAsync(teacher, 50, "h-4")).EnsureSuccessStatusCode();
    }

    // ============================================================== reconciliation requirements

    [Fact]
    public async Task Reconciliation_detects_a_confirmed_payment_with_no_escrow_hold()
    {
        var data = await ReadyToMatureAsync("recon-missing-escrow");
        Guid paymentId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            paymentId = await db.Payments.Where(x => x.OrderId == data.OrderId).Select(x => x.Id).SingleAsync();
            // Simulate a capture whose custody record was never written.
            var held = await db.EscrowEntries
                .SingleAsync(x => x.PaymentId == paymentId && x.Type == EscrowEntryType.Held);
            db.Remove(held);
            await db.SaveChangesAsync();
        }

        var report = await ReconcileAsync();
        Assert.True(report.OrphanPayments >= 1);
        var anomaly = Assert.Single(report.Anomalies!,
            x => x.Kind == "MissingEscrowHold" && x.PaymentId == paymentId);
        Assert.Equal(data.OrderId, anomaly.OrderId);
        Assert.False(report.IsBalanced);
    }

    [Fact]
    public async Task Reconciliation_detects_released_plus_refunded_exceeding_the_capture()
    {
        var data = await ReadyToMatureAsync("recon-over-release");
        Guid paymentId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            paymentId = await db.Payments.Where(x => x.OrderId == data.OrderId).Select(x => x.Id).SingleAsync();
            // Escrow movement beyond the confirmed capture — what pre-fix FR-1 produced.
            db.Add(new EscrowEntry(paymentId, data.OrderId, EscrowEntryType.Refunded, 40m, "SAR",
                $"order:{data.OrderId}:synthetic-over-refund", factory.Clock.GetUtcNow()));
            await db.SaveChangesAsync();
        }

        var report = await ReconcileAsync();
        var anomaly = Assert.Single(report.Anomalies!,
            x => x.Kind == "EscrowOverReleased" && x.PaymentId == paymentId);
        Assert.Equal(108m, anomaly.Captured);
        Assert.Equal(148m, anomaly.Actual);
        Assert.Equal(40m, anomaly.Difference);
        Assert.True(report.OverReleasedPayments >= 1);
        Assert.False(report.IsBalanced);
    }

    [Fact]
    public async Task Reconciliation_detects_duplicate_financial_movement()
    {
        var data = await ReadyToMatureAsync("recon-duplicate");
        Guid paymentId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            paymentId = await db.Payments.Where(x => x.OrderId == data.OrderId).Select(x => x.Id).SingleAsync();
            // A replayed release: the same escrow movement recorded twice.
            db.Add(new EscrowEntry(paymentId, data.OrderId, EscrowEntryType.Released, 108m, "SAR",
                $"order:{data.OrderId}:release-duplicate", factory.Clock.GetUtcNow()));
            await db.SaveChangesAsync();
        }

        var report = await ReconcileAsync();
        var anomaly = Assert.Single(report.Anomalies!,
            x => x.Kind == "EscrowOverReleased" && x.PaymentId == paymentId);
        Assert.Equal(108m, anomaly.Captured);
        Assert.Equal(216m, anomaly.Actual);
        Assert.Equal(108m, anomaly.Difference);
        Assert.False(report.IsBalanced);
    }

    [Fact]
    public async Task The_unique_business_key_index_makes_a_duplicate_ledger_movement_impossible()
    {
        var data = await ReadyToMatureAsync("recon-key");
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var escrow = await db.LedgerAccounts.FirstAsync(x => x.Kind == LedgerAccountKind.EscrowHeld);
        var platform = await db.LedgerAccounts.FirstAsync(x => x.Kind == LedgerAccountKind.PlatformRevenue);
        db.Add(new LedgerEntry($"order:{data.OrderId}:teacher-release", escrow.Id, platform.Id,
            1m, "SAR", "Order", data.OrderId.ToString(), factory.Clock.GetUtcNow()));
        await Assert.ThrowsAnyAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    // ============================================================== invariants and helpers

    /// <summary>The single safety property: matured money and an unresolved dispute cannot coexist.</summary>
    private async Task AssertInvariantAsync(SeedData data)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var matured = await db.TeacherEarningMaturities.AsNoTracking()
            .AnyAsync(x => x.OrderId == data.OrderId && x.Status == TeacherEarningMaturityStatus.Matured);
        var unresolved = await db.Disputes.AsNoTracking()
            .AnyAsync(x => x.OrderId == data.OrderId && x.Status != DisputeStatus.Resolved);
        Assert.False(matured && unresolved,
            "withdrawable money coexists with an unresolved dispute");
    }

    private async Task AssertNotWithdrawableAsync(SeedData data)
    {
        Assert.Equal(0m, await BalanceAsync(data.TeacherId, LedgerAccountKind.TeacherAvailable));
        Assert.Equal(TeacherNet, await BalanceAsync(data.TeacherId, LedgerAccountKind.TeacherPending));
    }

    private static async Task AssertWithdrawalRefusedAsync(HttpClient teacher, string key)
    {
        var attempt = await WithdrawAsync(teacher, 50, key);
        Assert.Equal(HttpStatusCode.BadRequest, attempt.StatusCode);
        Assert.Contains("insufficient_balance", await attempt.Content.ReadAsStringAsync());
    }

    private async Task<ReconciliationDto> ReconcileAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<IFinancialService>().ReconcileAsync(default);
    }

    private EarningsMaturityWorker WorkerAsync() =>
        factory.Services.GetRequiredService<EarningsMaturityWorker>();

    private async Task<TeacherEarningMaturityStatus> StatusAsync(SeedData data)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return await db.TeacherEarningMaturities.AsNoTracking()
            .Where(x => x.OrderId == data.OrderId).Select(x => x.Status).SingleAsync();
    }

    private async Task<Guid> MaturityIdAsync(SeedData data)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return await db.TeacherEarningMaturities.AsNoTracking()
            .Where(x => x.OrderId == data.OrderId).Select(x => x.Id).SingleAsync();
    }

    private async Task<DateTimeOffset> MaturesAtAsync(SeedData data)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return await db.TeacherEarningMaturities.AsNoTracking()
            .Where(x => x.OrderId == data.OrderId).Select(x => x.MaturesAt).SingleAsync();
    }

    private async Task<decimal> BalanceAsync(string teacherId, LedgerAccountKind kind)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var account = await db.LedgerAccounts.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Kind == kind && x.OwnerId == teacherId);
        if (account is null) return 0;
        var credits = await db.LedgerEntries.AsNoTracking()
            .Where(x => x.CreditAccountId == account.Id).SumAsync(x => (decimal?)x.Amount) ?? 0;
        var debits = await db.LedgerEntries.AsNoTracking()
            .Where(x => x.DebitAccountId == account.Id).SumAsync(x => (decimal?)x.Amount) ?? 0;
        return credits - debits;
    }

    private async Task<Guid> OpenDisputeAsync(SeedData data)
    {
        var student = await ClientAsync(data.StudentEmail);
        var opened = await SendAsync(student, HttpMethod.Post, "/api/v1/disputes",
            new { orderId = data.OrderId, reason = "Delivery did not match the agreed scope." });
        opened.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await opened.Content.ReadAsStringAsync())
            .RootElement.GetProperty("id").GetGuid();
    }

    private async Task ResolveAsync(
        SeedData data, Guid disputeId, DisputeResolution resolution, string key,
        HttpClient? authenticatedAdmin = null)
    {
        var admin = authenticatedAdmin ?? await ClientAsync(data.AdminEmail);
        (await SendAsync(admin, HttpMethod.Post, $"/api/v1/admin/disputes/{disputeId}/start-review",
            null, await DisputeVersionAsync(disputeId))).EnsureSuccessStatusCode();
        (await SendAsync(admin, HttpMethod.Post, $"/api/v1/admin/disputes/{disputeId}/resolve",
            new { resolution = (int)resolution, rationale = "Reviewed with the supplied evidence." },
            await DisputeVersionAsync(disputeId), key)).EnsureSuccessStatusCode();
    }

    private async Task<string> DisputeVersionAsync(Guid disputeId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        return Convert.ToBase64String(await db.Disputes.AsNoTracking()
            .Where(x => x.Id == disputeId).Select(x => x.RowVersion).SingleAsync());
    }

    /// <summary>Seeds a paid, delivered, completed Order whose teacher earning is sitting in clearance.</summary>
    private async Task<SeedData> ReadyToMatureAsync(string key)
    {
        var data = await SeedAsync();
        var student = await ClientAsync(data.StudentEmail);
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{data.OrderId}");
        request.Headers.TryAddWithoutValidation("Idempotency-Key", key);
        request.Content = JsonContent.Create(new { });
        var response = await student.SendAsync(request);
        response.EnsureSuccessStatusCode();
        var payment = JsonDocument.Parse(await response.Content.ReadAsStringAsync())
            .RootElement.GetProperty("payment");
        (await WebhookAsync(Payload($"{key}-confirm",
            payment.GetProperty("providerReference").GetString()!,
            payment.GetProperty("amount").GetDecimal(), "SAR", true))).EnsureSuccessStatusCode();

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var order = await db.Orders.SingleAsync(x => x.Id == data.OrderId);
            order.Start(data.TeacherId, factory.Clock.GetUtcNow());
            order.Deliver(data.TeacherId, "storage", "d.pdf", "application/pdf", 8,
                "Delivered", factory.Clock.GetUtcNow());
            await db.SaveChangesAsync();
        }

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            var version = Convert.ToBase64String(await db.Orders.AsNoTracking()
                .Where(x => x.Id == data.OrderId).Select(x => x.RowVersion).SingleAsync());
            (await SendAsync(student, HttpMethod.Post,
                $"/api/v1/orders/{data.OrderId}/complete", null, version)).EnsureSuccessStatusCode();
        }
        Assert.Equal(TeacherEarningMaturityStatus.Pending, await StatusAsync(data));
        return data;
    }

    private async Task VerifyPayoutProfileAsync(SeedData data, HttpClient teacher)
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
        var profile = JsonDocument.Parse(await submitted.Content.ReadAsStringAsync()).RootElement;
        var admin = await ClientAsync(data.AdminEmail);
        (await SendAsync(admin, HttpMethod.Post,
            $"/api/v1/admin/payout-profiles/{data.TeacherId}/review", new { approve = true },
            profile.GetProperty("version").GetString()!)).EnsureSuccessStatusCode();
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private async Task<HttpResponseMessage> WebhookAsync(byte[] payload)
    {
        var signature = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(WebhookSecret), payload));
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/payments/webhooks/mock")
        {
            Content = new ByteArrayContent(payload)
        };
        request.Headers.TryAddWithoutValidation("X-Mock-Signature", signature);
        return await factory.CreateClient().SendAsync(request);
    }

    private static byte[] Payload(
        string eventId, string reference, decimal amount, string currency, bool succeeded) =>
        JsonSerializer.SerializeToUtf8Bytes(new { eventId, providerReference = reference, amount, currency, succeeded });

    private static async Task<HttpResponseMessage> SendAsync(
        HttpClient client, HttpMethod method, string url, object? body,
        string? version = null, string? idempotencyKey = null)
    {
        var request = new HttpRequestMessage(method, url);
        if (body is not null) request.Content = JsonContent.Create(body);
        if (version is not null) request.Headers.TryAddWithoutValidation("If-Match", version);
        if (idempotencyKey is not null) request.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);
        return await client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> WithdrawAsync(HttpClient client, decimal amount, string key) =>
        SendAsync(client, HttpMethod.Post, "/api/v1/withdrawals",
            new { amount, currency = "SAR" }, null, key);

    private async Task<SeedData> SeedAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Teacher);
        var admin = await Pass3TestData.CreateUserAsync(factory.Services, Roles.Admin);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var now = factory.Clock.GetUtcNow();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Race Subject " + suffix, "code");
        var type = new ServiceCatalogItem("Race Service " + suffix, "Explanation", "svc_" + suffix, "خدمة", "شرح");
        var service = new TeacherService(teacher.Id, subject.Id, type.Id, "Race order",
            "Order used to prove concurrency safety.", 100, "SAR", 24, 1, now);
        var request = new LearningRequest(student.Id, teacher.Id, service.Id, "Race request",
            "Explain the supplied material.", now.AddDays(3), 100, now);
        request.Accept(teacher.Id, "seed-accept", now);
        var order = new Order(request.Id, student.Id, teacher.Id, service.Id, 100, "SAR",
            8, 15, now.AddDays(2), 1, now);
        db.AddRange(subject, type, service, request, order,
            new TeacherSubjectQualification(teacher.Id, subject.Id, now));
        await db.SaveChangesAsync();
        return new(student.Email, teacher.Email, admin.Email, teacher.Id, order.Id);
    }

    private sealed record SeedData(
        string StudentEmail, string TeacherEmail, string AdminEmail, string TeacherId, Guid OrderId);
}
