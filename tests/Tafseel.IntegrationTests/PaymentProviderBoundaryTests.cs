using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Tafseel.Application.Finance;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Finance;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.Orders;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.Finance;

namespace Tafseel.IntegrationTests;

public sealed class PaymentProviderBoundaryTests
{
    [Fact]
    public async Task Paymob_refund_is_not_local_only_accounting()
    {
        using var factory = new SqlServerTafseelApiFactory();
        var probe = new ProbeProvider { Name = "Paymob" };
        using var host = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IPaymentProvider>();
            services.AddSingleton<IPaymentProvider>(probe);
        }));
        _ = host.CreateClient();
        await using var scope = host.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var student = await Pass3TestData.CreateUserAsync(host.Services, "Student");
        var teacher = await Pass3TestData.CreateUserAsync(host.Services, "Teacher");
        var admin = await Pass3TestData.CreateUserAsync(host.Services, "Admin");
        var now = factory.Clock.GetUtcNow();
        var subject = new Subject("Refund boundary", "code");
        var catalog = new ServiceCatalogItem("Refund boundary", "Explanation", "refund-boundary", "خدمة", "شرح");
        var service = new TeacherService(teacher.Id, subject.Id, catalog.Id, "Refund", "Refund boundary", 100, "SAR", 24, 1, now);
        var request = new LearningRequest(student.Id, teacher.Id, service.Id, "Refund", "Boundary", now.AddDays(3), 100, now);
        request.Accept(teacher.Id, "accept", now);
        var order = new Order(request.Id, student.Id, teacher.Id, service.Id, 100, "SAR", 8, 15, now.AddDays(2), 1, now);
        var payment = new Payment(order.Id, student.Id, 108, "SAR", "Paymob", "refund-reference", "refund-init", now);
        payment.Confirm(108, "SAR", now);
        order.ConfirmPayment(now);
        db.AddRange(subject, catalog, service, request, order, payment,
            new EscrowEntry(payment.Id, order.Id, EscrowEntryType.Held, 108, "SAR", "hold", now));
        var attempt = new PaymentAttempt(payment.Id, payment.ProviderReference, PaymentAttemptStatus.Succeeded, null, now);
        db.AddRange(attempt, new ProviderCheckout { Id = attempt.Id, PaymentId = payment.Id, Reference = payment.ProviderReference,
            Status = CheckoutDispatchStatus.Ready, OrderId = "100", TransactionId = "200", CreatedAt = now });
        await db.SaveChangesAsync();
        var finance = scope.ServiceProvider.GetRequiredService<IFinancialService>();
        await finance.RefundAsync(admin.Id, payment.Id, "Full refund", "refund-command", default);
        Assert.Equal(PaymentStatus.Confirmed, payment.Status);
        Assert.Empty(db.Refunds);
    }
    [Fact]
    public async Task Initiation_is_durable_before_network_and_retry_does_not_create_another_checkout()
    {
        using var factory = new SqlServerTafseelApiFactory();
        var probe = new ProbeProvider();
        using var host = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IPaymentProvider>();
            services.AddSingleton<IPaymentProvider>(probe);
        }));
        _ = host.CreateClient();
        await using var scope = host.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var student = await Pass3TestData.CreateUserAsync(host.Services, "Student");
        var teacher = await Pass3TestData.CreateUserAsync(host.Services, "Teacher");
        var now = factory.Clock.GetUtcNow();
        var subject = new Subject("Payment boundary", "code");
        var catalog = new ServiceCatalogItem("Payment boundary", "Explanation", "boundary", "خدمة", "شرح");
        var service = new TeacherService(teacher.Id, subject.Id, catalog.Id, "Payment", "Payment boundary", 100, "SAR", 24, 1, now);
        var request = new LearningRequest(student.Id, teacher.Id, service.Id, "Payment", "Boundary", now.AddDays(3), 100, now);
        request.Accept(teacher.Id, "accept", now);
        var order = new Order(request.Id, student.Id, teacher.Id, service.Id, 100, "SAR", 8, 15, now.AddDays(2), 1, now);
        db.AddRange(subject, catalog, service, request, order);
        await db.SaveChangesAsync();
        probe.Observe = () =>
        {
            Assert.Null(db.Database.CurrentTransaction);
            Assert.Single(db.Payments.Where(p => p.OrderId == order.Id));
            Assert.Single(db.PaymentAttempts);
        };
        var finance = scope.ServiceProvider.GetRequiredService<IFinancialService>();
        var first = await finance.InitiateOrderPaymentAsync(student.Id, order.Id, "attempt", null, default);
        var retry = await finance.InitiateOrderPaymentAsync(student.Id, order.Id, "attempt", null, default);
        Assert.Equal(first.CheckoutReference, retry.CheckoutReference);
        Assert.Equal(1, probe.Initiations);
    }

    private sealed class ProbeProvider : IPaymentProvider
    {
        public string Name { get; set; } = "Mock";
        public int Initiations { get; private set; }
        public Action? Observe { get; set; }
        public Task<ProviderInitiation> InitiateAsync(ProviderPaymentRequest request, CancellationToken ct)
        {
            Observe?.Invoke();
            Initiations++;
            return Task.FromResult(new ProviderInitiation(request.Reference, "https://ksa.checkout.paymob.com/"));
        }
        public VerifiedPaymentEvent VerifyWebhook(ReadOnlyMemory<byte> payload, string signature) => throw new NotSupportedException();
    }
}
