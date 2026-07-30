using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Tafseel.Application.Email;
using Tafseel.Infrastructure;
using Tafseel.Infrastructure.Persistence;

namespace Tafseel.IntegrationTests;

public class TafseelApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private readonly string _filesPath = Path.Combine(Path.GetTempPath(), $"tafseel-tests-{Guid.NewGuid():N}");
    public TestEmailSender EmailSender { get; } = new();
    public MutableTimeProvider Clock { get; } = new(DateTimeOffset.UtcNow);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        _connection.Open();
        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:SigningKey", "integration-tests-only-signing-key-32-bytes");
        builder.UseSetting("Resend:ApiToken", "integration-tests-only-resend-token");
        builder.UseSetting("Payments:WebhookSecret", "integration-tests-only-payment-webhook-secret");
        builder.UseSetting("FileStorage:Provider", "Local");
        builder.UseSetting("FileStorage:RootPath", _filesPath);
        builder.ConfigureServices(services =>
        {
            ConfigureDatabase(services);
            services.RemoveAll<IEmailSender>();
            services.AddSingleton<IEmailSender>(EmailSender);
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
        });
    }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        var host = base.CreateHost(builder);
        using var scope = host.Services.CreateScope();
        InitializeDatabase(scope.ServiceProvider);
        host.Services.InitializeIdentityAsync().GetAwaiter().GetResult();
        return host;
    }

    protected virtual void ConfigureDatabase(IServiceCollection services)
    {
        _connection.Open();
        RemoveDatabaseRegistration(services);
        services.AddDbContext<TafseelDbContext>(options => options.UseSqlite(_connection));
    }

    protected virtual void InitializeDatabase(IServiceProvider services) =>
        services.GetRequiredService<TafseelDbContext>().Database.EnsureCreated();

    protected static void RemoveDatabaseRegistration(IServiceCollection services)
    {
        var registrations = services
            .Where(x => x.ServiceType == typeof(DbContextOptions<TafseelDbContext>)
                || x.ServiceType.Name.StartsWith("IDbContextOptionsConfiguration", StringComparison.Ordinal))
            .ToArray();
        foreach (var registration in registrations)
            services.Remove(registration);
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            _connection.Dispose();
            if (Directory.Exists(_filesPath)
                && Path.GetFullPath(_filesPath).StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase))
                Directory.Delete(_filesPath, recursive: true);
        }
    }

    public async Task ConfirmLatestEmailAsync(HttpClient client, string email)
    {
        var response = await client.PostAsJsonAsync(
            "/api/v1/auth/confirm-email", new { email, token = EmailSender.GetLastToken(email) });
        response.EnsureSuccessStatusCode();
    }
}

public sealed class MutableTimeProvider(DateTimeOffset now) : TimeProvider
{
    private long _utcTicks = now.UtcTicks;
    public override DateTimeOffset GetUtcNow() =>
        new(Interlocked.Read(ref _utcTicks), TimeSpan.Zero);
    public void SetUtcNow(DateTimeOffset value) =>
        Interlocked.Exchange(ref _utcTicks, value.UtcTicks);
}

public sealed class TestEmailSender : IEmailSender
{
    private readonly ConcurrentDictionary<string, string> _messages = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, int> _counts = new(StringComparer.OrdinalIgnoreCase);
    private int _failNext;

    public void FailNext() => Interlocked.Exchange(ref _failNext, 1);

    public Task SendAsync(string to, string subject, string htmlBody, CancellationToken cancellationToken)
    {
        if (Interlocked.Exchange(ref _failNext, 0) == 1)
            throw new InvalidOperationException("Controlled email failure.");
        _messages[to] = htmlBody;
        _counts.AddOrUpdate(to, 1, (_, count) => count + 1);
        return Task.CompletedTask;
    }

    public string GetLastHtml(string email) =>
        _messages.TryGetValue(email, out var html)
            ? html
            : throw new InvalidOperationException($"No test email was captured for {email}.");

    public string GetLastToken(string email)
    {
        var encoded = Regex.Match(GetLastHtml(email), @"token=([^""&]+)").Groups[1].Value;
        return Uri.UnescapeDataString(WebUtility.HtmlDecode(encoded));
    }

    public int Count(string email) => _counts.GetValueOrDefault(email);
}
