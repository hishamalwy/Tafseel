using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

[Trait("Category", "SqlServer")]
[Trait("Category", "Financial")]
public sealed class MockPaymentSimulatorTests : IClassFixture<MockPaymentSimulatorTests.SimulatorFactory>
{
    private readonly SimulatorFactory _factory;

    public MockPaymentSimulatorTests(SimulatorFactory factory) => _factory = factory;

    [Fact]
    public async Task Simulator_success_confirms_payment_through_canonical_webhook_path()
    {
        var data = await SeedAsync();
        var student = await ClientAsync(data.Student.Email);

        var caps = JsonDocument.Parse(await student.GetStringAsync("/api/v1/payments/mock/capabilities"))
            .RootElement;
        Assert.True(caps.GetProperty("mockSimulatorEnabled").GetBoolean());

        var initiate = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{data.OrderId}");
        initiate.Headers.TryAddWithoutValidation("Idempotency-Key", "mock-sim-init");
        var initiated = await student.SendAsync(initiate);
        initiated.EnsureSuccessStatusCode();
        using var initiationDoc = JsonDocument.Parse(await initiated.Content.ReadAsStringAsync());
        var checkout = initiationDoc.RootElement.GetProperty("checkoutReference").GetString()!;
        var payment = initiationDoc.RootElement.GetProperty("payment");
        var reference = payment.GetProperty("providerReference").GetString()!;
        Assert.StartsWith("/app/Tafseel-Mock-Checkout.dc.html", checkout, StringComparison.Ordinal);
        Assert.Contains(reference, checkout, StringComparison.Ordinal);

        var session = JsonDocument.Parse(
            await student.GetStringAsync($"/api/v1/payments/mock/simulator?ref={Uri.EscapeDataString(reference)}"))
            .RootElement;
        Assert.Equal(reference, session.GetProperty("providerReference").GetString());
        Assert.Equal((int)PaymentStatus.Pending, session.GetProperty("status").GetInt32());

        var complete = await student.PostAsJsonAsync("/api/v1/payments/mock/simulator/complete", new
        {
            providerReference = reference,
            succeeded = true,
            returnPath = "/app/Tafseel-Student-Dashboard.dc.html"
        });
        complete.EnsureSuccessStatusCode();
        using var completeDoc = JsonDocument.Parse(await complete.Content.ReadAsStringAsync());
        Assert.Equal((int)PaymentStatus.Confirmed, completeDoc.RootElement.GetProperty("status").GetInt32());

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(PaymentStatus.Confirmed,
            await db.Payments.Where(x => x.ProviderReference == reference).Select(x => x.Status).SingleAsync());
        Assert.Equal(OrderPaymentStatus.Paid,
            await db.Orders.Where(x => x.Id == data.OrderId).Select(x => x.PaymentStatus).SingleAsync());
        Assert.True(await db.PaymentWebhookRecords.AnyAsync(x =>
            x.Provider == "Mock" && x.ProviderReference == reference));
    }

    [Fact]
    public async Task Simulator_failure_does_not_mark_order_paid()
    {
        var data = await SeedAsync();
        var student = await ClientAsync(data.Student.Email);
        var initiate = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{data.OrderId}");
        initiate.Headers.TryAddWithoutValidation("Idempotency-Key", "mock-sim-fail");
        var initiated = await student.SendAsync(initiate);
        initiated.EnsureSuccessStatusCode();
        var reference = JsonDocument.Parse(await initiated.Content.ReadAsStringAsync())
            .RootElement.GetProperty("payment").GetProperty("providerReference").GetString()!;

        var complete = await student.PostAsJsonAsync("/api/v1/payments/mock/simulator/complete", new
        {
            providerReference = reference,
            succeeded = false
        });
        complete.EnsureSuccessStatusCode();

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        Assert.Equal(PaymentStatus.Pending,
            await db.Payments.Where(x => x.ProviderReference == reference).Select(x => x.Status).SingleAsync());
        Assert.Equal(OrderPaymentStatus.Pending,
            await db.Orders.Where(x => x.Id == data.OrderId).Select(x => x.PaymentStatus).SingleAsync());
        Assert.Contains(await db.PaymentAttempts.Where(x => x.ProviderReference == reference).ToListAsync(),
            x => x.Status == PaymentAttemptStatus.Failed);
    }

    [Fact]
    public async Task Simulator_rejects_open_redirect_return_path()
    {
        var data = await SeedAsync();
        var student = await ClientAsync(data.Student.Email);
        var initiate = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/payments/orders/{data.OrderId}");
        initiate.Headers.TryAddWithoutValidation("Idempotency-Key", "mock-sim-redirect");
        var initiated = await student.SendAsync(initiate);
        initiated.EnsureSuccessStatusCode();
        var reference = JsonDocument.Parse(await initiated.Content.ReadAsStringAsync())
            .RootElement.GetProperty("payment").GetProperty("providerReference").GetString()!;

        var complete = await student.PostAsJsonAsync("/api/v1/payments/mock/simulator/complete", new
        {
            providerReference = reference,
            succeeded = true,
            returnPath = "https://evil.example/phish"
        });
        complete.EnsureSuccessStatusCode();
        var returnUrl = JsonDocument.Parse(await complete.Content.ReadAsStringAsync())
            .RootElement.GetProperty("returnUrl").GetString()!;
        Assert.StartsWith("/app/", returnUrl, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("evil.example", returnUrl, StringComparison.OrdinalIgnoreCase);
    }

    private async Task<SeedData> SeedAsync()
    {
        var student = await Pass3TestData.CreateUserAsync(_factory.Services, Roles.Student);
        var teacher = await Pass3TestData.CreateUserAsync(_factory.Services, Roles.Teacher);
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var suffix = Guid.NewGuid().ToString("N");
        var subject = new Subject("Sim Subject " + suffix, "code");
        var type = new ServiceCatalogItem(
            "Sim Service " + suffix, "Explanation", "svc_" + suffix, "خدمة", "شرح");
        var service = new TeacherService(teacher.Id, subject.Id, type.Id, "Sim order",
            "Order used for mock simulator.", 100, "SAR", 24, 1, _factory.Clock.GetUtcNow());
        var request = new LearningRequest(student.Id, teacher.Id, service.Id, "Sim request",
            "Explain the supplied material.", _factory.Clock.GetUtcNow().AddDays(3), 100, _factory.Clock.GetUtcNow());
        request.Accept(teacher.Id, "seed-accept", _factory.Clock.GetUtcNow());
        var order = new Order(request.Id, student.Id, teacher.Id, service.Id, 100, "SAR",
            8, 15, _factory.Clock.GetUtcNow().AddDays(2), 1, _factory.Clock.GetUtcNow());
        db.AddRange(subject, type, service, request, order,
            new TeacherSubjectQualification(teacher.Id, subject.Id, _factory.Clock.GetUtcNow()));
        await db.SaveChangesAsync();
        return new(student, order.Id);
    }

    private async Task<HttpClient> ClientAsync(string email)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await Pass3TestData.LoginAsync(client, email));
        return client;
    }

    private sealed record SeedData((string Id, string Email) Student, Guid OrderId);

    /// <summary>
    /// SQL Server factory with Mock simulator explicitly enabled (default Testing keeps it off).
    /// </summary>
    public sealed class SimulatorFactory : TafseelApiFactory
    {
        private readonly string _connectionString = SqlServerTestDatabase.ConnectionString("MockSim");
        private int _disposed;

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("Payments:Mock:Enabled", "true");
            builder.UseSetting("Payments:Mock:SimulatorEnabled", "true");
        }

        protected override void ConfigureDatabase(IServiceCollection services)
        {
            RemoveDatabaseRegistration(services);
            services.AddDbContext<TafseelDbContext>(options => options.UseSqlServer(_connectionString));
        }

        protected override void InitializeDatabase(IServiceProvider services) =>
            services.GetRequiredService<TafseelDbContext>().Database.Migrate();

        protected override void Dispose(bool disposing)
        {
            if (Interlocked.Exchange(ref _disposed, 1) == 1)
                return;
            if (disposing)
            {
                using var scope = Services.CreateScope();
                scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Database.EnsureDeleted();
            }
            base.Dispose(disposing);
        }
    }
}
