using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Tafseel.Application.Authorization;
using Tafseel.Application.Finance;
using Tafseel.Application.Orders;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Catalog;
using Tafseel.Infrastructure.Finance;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.Infrastructure.Seeding;

/// <summary>
/// A <see cref="TimeProvider"/> the seed can move, so the Finance scenario can be lived through by the real
/// services (a purchase two weeks ago whose earning has matured today) instead of writing ledger rows by hand.
/// Registered as the host's clock only for the `seed` command; the running site always uses the system clock.
/// </summary>
public sealed class SeedClock : TimeProvider
{
    private DateTimeOffset? _now;
    public override DateTimeOffset GetUtcNow() => _now ?? System.GetUtcNow();
    public void TravelTo(DateTimeOffset? now) => _now = now;
}

/// <summary>
/// The one canonical seed for Development, Staging and PreProduction (docs/ENVIRONMENTS.md). Every step is
/// idempotent, so running it twice changes nothing:
/// <list type="number">
/// <item>reference data every environment needs (roles, canonical services with the DEC-01 policy, languages);</item>
/// <item>the shared baseline catalog (subjects, topics, qualification topics, education levels, promotions);</item>
/// <item>one demo account per role, with the environment's own seed password;</item>
/// <item>the demo teacher's published supply (profile, qualification, services, availability);</item>
/// <item>a small Finance scenario, lived through the real order, payment, delivery and payout services.</item>
/// </list>
/// Production is refused outright: it gets reference data and its first Admin from `provision` only.
/// </summary>
public static class EnvironmentSeed
{
    internal const string StudentEmail = "student@gmail.com";
    internal const string TeacherEmail = "teacher@gmail.com";
    internal const string FinanceEmail = "finance@gmail.com";
    internal const string SubjectName = "Mathematics";
    internal const string CompletedTitle = "Seed · Derivatives chapter review";
    internal const string InProgressTitle = "Seed · Integration practice set";
    internal const string RefundedTitle = "Seed · Limits worked examples";
    /// <summary>A structurally valid test IBAN (checksum passes); no real account.</summary>
    internal const string TestIban = "SA0380000000608010167519";

    public static async Task<IReadOnlyList<string>> RunAsync(
        IServiceProvider services, string? password, SeedClock clock, CancellationToken ct = default)
    {
        var environment = services.GetRequiredService<IHostEnvironment>();
        if (!environment.AllowsDemoData())
            throw new InvalidOperationException(
                $"The seed runs only in Development, Staging or PreProduction; '{environment.EnvironmentName}' is refused.");
        if (string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException(
                "Set SeedUsers:Password (SeedUsers__Password) for this environment before seeding; it is never printed.");
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("Tafseel.Seed");
        var report = new List<string>();

        await using (var scope = services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            await DependencyInjection.EnsureReferenceDataAsync(scope.ServiceProvider, db);
            report.Add("Reference data: roles, canonical services with the DEC-01 policy, teaching languages.");
            await DependencyInjection.SeedDemoCatalogAsync(environment, db, logger);
            report.Add("Baseline catalog: subjects, topics, qualification topics, education levels.");
            await DependencyInjection.SeedDemoAccountsAsync(environment, password,
                scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>(), logger);
            report.Add($"Demo accounts: {string.Join(", ", DependencyInjection.DemoUserAccounts.Select(x => $"{x.Email} ({x.Role})"))}.");
        }

        report.Add(await SeedTeacherSupplyAsync(services, clock.GetUtcNow(), ct));
        report.Add(await SeedFinanceScenarioAsync(services, clock, ct));
        return report;
    }

    private static async Task<string> SeedTeacherSupplyAsync(IServiceProvider services, DateTimeOffset now, CancellationToken ct)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var teacherId = await UserIdAsync(db, TeacherEmail, ct);
        if (await db.TeacherProfiles.AnyAsync(x => x.TeacherId == teacherId && x.IsPublished, ct))
            return "Demo teacher supply: already published.";

        var subjectKey = CatalogNameNormalizer.Key(SubjectName);
        var subject = await db.Subjects.SingleAsync(x => x.NormalizedName == subjectKey, ct);
        var recorded = await db.ServiceCatalogItems.SingleAsync(x => x.Code == "recorded_explanation", ct);
        var live = await db.ServiceCatalogItems.SingleAsync(x => x.Code == "live_session", ct);

        var profile = await db.TeacherProfiles.SingleOrDefaultAsync(x => x.TeacherId == teacherId, ct);
        if (profile is null)
        {
            profile = new TeacherProfile(teacherId, now);
            db.Add(profile);
        }
        profile.Update("Mathematics explained step by step",
            "Demo teacher for this environment. I explain calculus and algebra exercises step by step, in Arabic or English.",
            "Saudi Arabia", "Riyadh", "Asia/Riyadh", 30, now);
        if (!await db.TeacherSubjectQualifications.AnyAsync(x => x.TeacherId == teacherId && x.SubjectId == subject.Id, ct))
            db.Add(new TeacherSubjectQualification(teacherId, subject.Id, now));
        if (!await db.TeacherServices.AnyAsync(x => x.TeacherId == teacherId && x.ServiceCatalogItemId == recorded.Id, ct))
            db.Add(new TeacherService(teacherId, subject.Id, recorded.Id, "Recorded explanation of your exercise",
                "A recorded walk-through of your exact exercise, step by step.", 120m, "SAR", 48, 2, now));
        if (!await db.TeacherServices.AnyAsync(x => x.TeacherId == teacherId && x.ServiceCatalogItemId == live.Id, ct))
            db.Add(new TeacherService(teacherId, subject.Id, live.Id, "Live one-to-one session",
                "A live session on the part you are stuck on.", 150m, "SAR", 24, 0, now));
        if (!await db.TeacherAvailabilityRules.AnyAsync(x => x.TeacherId == teacherId, ct))
            foreach (var day in Enum.GetValues<DayOfWeek>())
                db.Add(new TeacherAvailabilityRule(teacherId, day, new TimeOnly(9, 0), new TimeOnly(22, 0), "Asia/Riyadh", 60));
        profile.Publish(TeacherProfileReadiness.Ready, now);
        await db.SaveChangesAsync(ct);
        return $"Demo teacher supply: {TeacherEmail} qualified in {SubjectName}, recorded and live services, published.";
    }

    /// <summary>
    /// A completed purchase whose earning has matured and is being withdrawn to a verified IBAN, a purchase in
    /// progress (money held in escrow), a refunded purchase, and a clean reconciliation run - so every Finance
    /// screen has something true to show. Everything goes through the services that own the ledger.
    /// </summary>
    private static async Task<string> SeedFinanceScenarioAsync(IServiceProvider services, SeedClock clock, CancellationToken ct)
    {
        string studentId, teacherId, financeId;
        await using (var scope = services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
            studentId = await UserIdAsync(db, StudentEmail, ct);
            teacherId = await UserIdAsync(db, TeacherEmail, ct);
            financeId = await UserIdAsync(db, FinanceEmail, ct);
            if (await db.LearningRequests.AnyAsync(x => x.StudentId == studentId && x.Title == CompletedTitle, ct))
                return "Finance scenario: already present.";
        }

        var today = clock.GetUtcNow();
        try
        {
            clock.TravelTo(today.AddDays(-14));
            var completed = await PaidOrderAsync(services, studentId, teacherId, CompletedTitle, "completed", ct);
            await using (var scope = services.CreateAsyncScope())
            {
                var orders = scope.ServiceProvider.GetRequiredService<IOrderService>();
                var order = await orders.GetOwnedOrderAsync(teacherId, completed, ct);
                await orders.StartOrderAsync(teacherId, completed, order.Version, ct);
                order = await orders.GetOwnedOrderAsync(teacherId, completed, ct);
                var pdf = MinimalPdf("Tafseel seed delivery: worked solutions for the derivatives chapter.");
                await using var stream = new MemoryStream(pdf);
                await orders.DeliverAsync(teacherId, completed,
                    [new DeliveryUpload(stream, "derivatives-worked-solutions.pdf", "application/pdf", pdf.Length)],
                    "Here are the worked solutions, step by step.", order.Version, ct);
            }
            clock.TravelTo(today.AddDays(-13));
            await using (var scope = services.CreateAsyncScope())
            {
                var orders = scope.ServiceProvider.GetRequiredService<IOrderService>();
                var order = await orders.GetOwnedOrderAsync(studentId, completed, ct);
                await orders.CompleteAsync(studentId, completed, order.Version, ct);
            }

            clock.TravelTo(today.AddDays(-2));
            var refunded = await PaidOrderAsync(services, studentId, teacherId, RefundedTitle, "refunded", ct);
            clock.TravelTo(today.AddDays(-1));
            var inProgress = await PaidOrderAsync(services, studentId, teacherId, InProgressTitle, "in-progress", ct);
            await using (var scope = services.CreateAsyncScope())
            {
                var orders = scope.ServiceProvider.GetRequiredService<IOrderService>();
                var order = await orders.GetOwnedOrderAsync(teacherId, inProgress, ct);
                await orders.StartOrderAsync(teacherId, inProgress, order.Version, ct);
                var finance = scope.ServiceProvider.GetRequiredService<IFinancialService>();
                var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
                var payment = await db.Payments.AsNoTracking().SingleAsync(x => x.OrderId == refunded, ct);
                await finance.RefundAsync(financeId, payment.Id,
                    "Seed scenario: the student asked to cancel before work started.", "seed-refund-limits", ct);
            }
        }
        finally
        {
            clock.TravelTo(null);
        }

        await using (var scope = services.CreateAsyncScope())
        {
            var finance = scope.ServiceProvider.GetRequiredService<IFinancialService>();
            foreach (var id in await finance.GetDueEarningMaturityIdsAsync(100, ct))
                await finance.MatureTeacherEarningAsync(id, ct);
            var profile = await finance.SubmitPayoutProfileAsync(teacherId,
                new SubmitPayoutProfile("Tafseel Demo Teacher", "SA", "bank_transfer", "Demo Bank", TestIban, "1234"), ct);
            await finance.ReviewPayoutProfileAsync(financeId, teacherId, new ReviewPayoutProfile(true, null), profile.Version, ct);
            await finance.RequestWithdrawalAsync(teacherId, new RequestWithdrawal(60m, "SAR"), "seed-withdrawal-1", ct);
            await scope.ServiceProvider.GetRequiredService<IFinanceOperationsService>().ScanReconciliationAsync(financeId, ct);
        }
        return "Finance scenario: completed purchase with a matured earning, verified IBAN and a pending 60 SAR withdrawal; "
            + "a purchase in progress (escrow held); a refunded purchase; a reconciliation scan.";
    }

    /// <summary>Direct request → teacher accepts at the listed price → student pays → verified (mock) webhook.</summary>
    private static async Task<Guid> PaidOrderAsync(
        IServiceProvider services, string studentId, string teacherId, string title, string key, CancellationToken ct)
    {
        await using var scope = services.CreateAsyncScope();
        var provider = scope.ServiceProvider;
        var now = provider.GetRequiredService<TimeProvider>().GetUtcNow();
        var db = provider.GetRequiredService<TafseelDbContext>();
        var recorded = await db.ServiceCatalogItems.SingleAsync(x => x.Code == "recorded_explanation", ct);
        var service = await db.TeacherServices.AsNoTracking()
            .SingleAsync(x => x.TeacherId == teacherId && x.ServiceCatalogItemId == recorded.Id && x.IsActive, ct);
        var orders = provider.GetRequiredService<IOrderService>();
        var request = await orders.CreateRequestAsync(studentId, new CreateLearningRequest(service.Id, title,
            "Seeded request for this environment's Finance screens. Please explain each step.", now.AddDays(3), null), ct);
        var order = await orders.AcceptAsync(teacherId, request.Id,
            new AcceptLearningRequest(service.Price, service.Currency, now.AddDays(2), 2),
            $"seed-accept-{key}", request.Version, ct);
        var finance = provider.GetRequiredService<IFinancialService>();
        var payment = await finance.InitiateOrderPaymentAsync(studentId, order.Id, $"seed-pay-{key}", null, ct);
        var (payload, signature) = provider.GetRequiredService<MockPaymentProvider>().CreateSignedWebhook(
            $"seed-event-{key}", payment.Payment.ProviderReference, payment.Payment.Amount, payment.Payment.Currency, true);
        await finance.ProcessWebhookAsync(payload, signature, ct);
        return order.Id;
    }

    private static async Task<string> UserIdAsync(TafseelDbContext db, string email, CancellationToken ct) =>
        await db.Users.Where(x => x.NormalizedEmail == email.ToUpperInvariant()).Select(x => x.Id).SingleOrDefaultAsync(ct)
        ?? throw new InvalidOperationException($"Demo account {email} is missing; the account step must run first.");

    /// <summary>A one-page PDF with a line of text: enough for the delivery type check and a viewer.</summary>
    private static byte[] MinimalPdf(string text)
    {
        var content = $"BT /F1 12 Tf 72 720 Td ({text.Replace("(", "").Replace(")", "")}) Tj ET";
        var objects = new[]
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            $"<< /Length {content.Length} >>\nstream\n{content}\nendstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        };
        var pdf = new StringBuilder("%PDF-1.4\n");
        var offsets = new List<int>();
        for (var i = 0; i < objects.Length; i++)
        {
            offsets.Add(Encoding.ASCII.GetByteCount(pdf.ToString()));
            pdf.Append($"{i + 1} 0 obj\n{objects[i]}\nendobj\n");
        }
        var xref = Encoding.ASCII.GetByteCount(pdf.ToString());
        pdf.Append($"xref\n0 {objects.Length + 1}\n0000000000 65535 f \n");
        foreach (var offset in offsets) pdf.Append($"{offset:D10} 00000 n \n");
        pdf.Append($"trailer\n<< /Size {objects.Length + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
        return Encoding.ASCII.GetBytes(pdf.ToString());
    }
}
