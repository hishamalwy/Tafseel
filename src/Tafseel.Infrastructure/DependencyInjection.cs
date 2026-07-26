using System.Net.Mail;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Resend;
using Tafseel.Application.Authentication;
using Tafseel.Application.Authorization;
using Tafseel.Application.Catalog;
using Tafseel.Application.Email;
using Tafseel.Application.Finance;
using Tafseel.Application.Governance;
using Tafseel.Application.Marketplace;
using Tafseel.Application.Messaging;
using Tafseel.Application.LiveSessions;
using Tafseel.Application.Orders;
using Tafseel.Application.TeacherApplications;
using Tafseel.Infrastructure.Catalog;
using Tafseel.Infrastructure.Email;
using Tafseel.Infrastructure.Finance;
using Tafseel.Infrastructure.Governance;
using Tafseel.Infrastructure.Files;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Marketplace;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.LiveSessions;
using Tafseel.Infrastructure.Orders;
using Tafseel.Infrastructure.Persistence;
using Tafseel.Infrastructure.TeacherApplications;

namespace Tafseel.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        services.AddDbContext<TafseelDbContext>(options =>
            options.UseSqlServer(configuration.GetConnectionString("Tafseel")));
        services.AddHttpContextAccessor();
        var keysPath = configuration["DataProtection:KeysPath"] ?? "App_Data/keys";
        if (!Path.IsPathRooted(keysPath))
            keysPath = Path.Combine(environment.ContentRootPath, keysPath);
        services.AddDataProtection()
            .SetApplicationName("Tafseel")
            .PersistKeysToFileSystem(new DirectoryInfo(keysPath));

        services.AddIdentityCore<ApplicationUser>(options =>
            {
                options.Password.RequiredLength = 10;
                options.Password.RequireDigit = true;
                options.Password.RequireLowercase = true;
                options.Password.RequireUppercase = true;
                options.Password.RequireNonAlphanumeric = true;
                options.User.RequireUniqueEmail = true;
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            })
            .AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<TafseelDbContext>()
            .AddDefaultTokenProviders();

        services.AddSingleton(TimeProvider.System);
        services.AddOptions<JwtOptions>()
            .Bind(configuration.GetRequiredSection(JwtOptions.SectionName))
            .Validate(options =>
                    !string.IsNullOrWhiteSpace(options.Issuer)
                    && !string.IsNullOrWhiteSpace(options.Audience)
                    && options.SigningKey.Length >= 32
                    && !options.SigningKey.StartsWith("REPLACE_", StringComparison.Ordinal),
                "JWT issuer, audience, and a non-placeholder signing key of at least 32 characters are required.")
            .Validate(options =>
                    options.AccessTokenMinutes is >= 1 and <= 60
                    && options.RefreshTokenDays is >= 1 and <= 90
                    && TimeSpan.FromDays(options.RefreshTokenDays) > TimeSpan.FromMinutes(options.AccessTokenMinutes),
                "JWT access lifetime must be 1-60 minutes and refresh lifetime 1-90 days and longer than access lifetime.")
            .Validate(options =>
                    !environment.IsProduction()
                    || !options.SigningKey.Contains("development", StringComparison.OrdinalIgnoreCase),
                "Production cannot use a development signing key.")
            .ValidateOnStart();
        services.AddScoped<IAuthenticationService, AuthenticationService>();
        services.AddScoped<ICatalogService, CatalogService>();
        services.AddScoped<ITeacherApplicationService, TeacherApplicationService>();
        services.AddScoped<IMarketplaceService, MarketplaceService>();
        services.AddScoped<IOrderService, OrderService>();
        services.AddScoped<ILiveSessionService, LiveSessionService>();
        services.AddScoped<IFinancialService, FinancialService>();
        services.AddSingleton<IPaymentProvider, MockPaymentProvider>();
        services.AddScoped<IMessagingService, MessagingService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<NotificationWriter>();
        services.AddScoped<IGovernanceService, GovernanceService>();
        services.AddScoped<IAdminService, AdminService>();
        services.AddScoped<AuditWriter>();
        services.AddSingleton<Microsoft.AspNetCore.SignalR.IUserIdProvider, SubjectUserIdProvider>();
        services.AddHostedService<NotificationOutboxWorker>();
        services.AddSingleton<ILiveSessionLinkProvider, MockLiveSessionLinkProvider>();
        services.AddScoped<IFileStorageService, LocalFileStorageService>();
        services.Configure<FileStorageOptions>(configuration.GetSection(FileStorageOptions.SectionName));
        services.AddOptions<FeeOptions>()
            .Bind(configuration.GetRequiredSection(FeeOptions.SectionName))
            .Validate(x => x.StudentFeePercent is >= 0 and <= 100
                && x.TeacherCommissionPercent is >= 0 and <= 100
                && decimal.Round(x.StudentFeePercent, 4) == x.StudentFeePercent
                && decimal.Round(x.TeacherCommissionPercent, 4) == x.TeacherCommissionPercent,
                "Student fee and teacher commission percentages must be between 0 and 100 with at most four decimal places.")
            .ValidateOnStart();
        services.AddOptions<LiveSessionOptions>()
            .Bind(configuration.GetRequiredSection(LiveSessionOptions.SectionName))
            .Validate(x => x.EmergencyPremiumPercent is >= 0 and <= 1000
                && decimal.Round(x.EmergencyPremiumPercent, 4) == x.EmergencyPremiumPercent
                && x.CancellationWindowHours is >= 0 and <= 720
                && x.JoinWindowMinutes is >= 0 and <= 120,
                "Live session premium, cancellation, and join-window settings are invalid.")
            .Validate(x => x.Provider == "Mock",
                "No non-mock live-session provider is registered.")
            .Validate(x => !environment.IsProduction() || x.Provider != "Mock",
                "The mock live-session provider is forbidden in Production.")
            .ValidateOnStart();
        services.AddOptions<PaymentOptions>()
            .Bind(configuration.GetRequiredSection(PaymentOptions.SectionName))
            .Validate(x => x.Provider == "Mock" && x.WebhookSecret.Length >= 32,
                "The local mock payment provider requires a webhook secret of at least 32 characters.")
            .Validate(x => !environment.IsProduction() || x.Provider != "Mock",
                "The mock payment provider is forbidden in Production.")
            .Validate(x => !x.AutoReleaseEnabled,
                "Automatic escrow release is not enabled until the product policy is approved.")
            .ValidateOnStart();
        services.AddOptions<DisputeOptions>()
            .Bind(configuration.GetRequiredSection(DisputeOptions.SectionName))
            .Validate(x => x.WindowDays is >= 1 and <= 90,
                "Dispute window must be between 1 and 90 days.")
            .ValidateOnStart();

        services.AddOptions<EmailOptions>()
            .Bind(configuration.GetRequiredSection(EmailOptions.SectionName))
            .Validate(options =>
                    MailAddress.TryCreate(options.From, out var sender)
                    && !string.IsNullOrWhiteSpace(sender.DisplayName),
                "Email:From must contain a valid address and non-empty sender name.")
            .Validate(options =>
                    ValidFrontendUrl(options.PasswordResetUrl, environment.IsProduction())
                    && ValidFrontendUrl(options.ConfirmationUrl, environment.IsProduction())
                    && ValidFrontendUrl(options.AppBaseUrl, environment.IsProduction()),
                "Email frontend URLs must be absolute and use HTTPS in Production.")
            .Validate(options =>
                    !environment.IsProduction()
                    || MailAddress.TryCreate(options.From, out var sender)
                    && !sender.Address.EndsWith("@resend.dev", StringComparison.OrdinalIgnoreCase)
                    && new Uri(options.PasswordResetUrl).Host is not ("localhost" or "127.0.0.1")
                    && new Uri(options.ConfirmationUrl).Host is not ("localhost" or "127.0.0.1")
                    && new Uri(options.AppBaseUrl).Host is not ("localhost" or "127.0.0.1"),
                "Production email must use a verified sender and non-local frontend URLs.")
            .ValidateOnStart();
        services.AddHttpClient<ResendClient>(client => client.Timeout = TimeSpan.FromSeconds(15));
        services.AddOptions<ResendClientOptions>()
            .Bind(configuration.GetRequiredSection("Resend"))
            .Validate(options => !string.IsNullOrWhiteSpace(options.ApiToken), "Resend:ApiToken is required.")
            .ValidateOnStart();
        services.AddTransient<IResend, ResendClient>();
        services.AddTransient<IEmailSender, ResendEmailSender>();
        return services;
    }

    public static async Task InitializeIdentityAsync(this IServiceProvider services, bool migrate = false)
    {
        await using var scope = services.CreateAsyncScope();
        if (migrate)
            await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Database.MigrateAsync();

        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        await using var transaction = await db.Database.BeginTransactionAsync();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        foreach (var role in Roles.All)
            if (!await roles.RoleExistsAsync(role))
            {
                var result = await roles.CreateAsync(new IdentityRole(role));
                if (!result.Succeeded)
                    throw new InvalidOperationException($"Required Identity role '{role}' could not be created.");
            }
        await transaction.CommitAsync();
    }

    private static bool ValidFrontendUrl(string value, bool requireHttps) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && uri.UserInfo.Length == 0
        && (!requireHttps || uri.Scheme == Uri.UriSchemeHttps)
        && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp);
}
