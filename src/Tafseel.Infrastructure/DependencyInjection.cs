using System.Net.Mail;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
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
using Tafseel.Domain.Catalog;
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
    private static readonly (string Name, string NameAr, string Description, string DescriptionAr, string Code, int DisplayOrder)[] CanonicalServices =
    [
        ("Custom recorded explanation", "شرح مسجّل مخصص",
            "A recorded video walking through your exact topic, step by step.",
            "فيديو مسجل يشرح موضوعك تحديدًا خطوة بخطوة.",
            "recorded_explanation", 10),
        ("Assignment guidance", "إرشاد الواجبات",
            "Coaching through your assignment, not ghostwriting.",
            "توجيه منهجي لحل واجبك دون كتابته نيابة عنك.",
            "assignment_guidance", 20),
        ("Exam revision", "مراجعة الاختبار",
            "Focused revision on your syllabus and past papers.",
            "مراجعة مكثفة لمنهجك وأسئلة الاختبارات السابقة.",
            "exam_revision", 30),
        ("Live session", "جلسة مباشرة",
            "One-to-one video call with a shared whiteboard.",
            "مكالمة فيديو فردية مع سبورة مشتركة.",
            "live_session", 40)
    ];

    private static readonly (string Name, string Code)[] CanonicalLanguages =
        [("Arabic", "ar"), ("English", "en")];

    private static readonly (string Role, string Email, string FullName)[] StagingUsers =
    [
        (Roles.Admin, "admin@gmail.com", "Tafseel Admin"),
        (Roles.Student, "student@gmail.com", "Tafseel Student"),
        (Roles.Teacher, "teacher@gmail.com", "Tafseel Teacher"),
        (Roles.QualityReviewer, "quality@gmail.com", "Tafseel Quality Reviewer")
    ];

    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        services.AddDbContext<TafseelDbContext>(options =>
            options.UseSqlServer(configuration.GetConnectionString("Tafseel")));
        // EnableRetryOnFailure omitted globally: existing user-initiated transactions would conflict
        // unless every call site uses CreateExecutionStrategy(). Startup uses IdentityStartupRetry.
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
        services.AddScoped<ICouponService, CouponService>();
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
        services.AddOptions<TeacherShowcaseOptions>()
            .Bind(configuration.GetSection(TeacherShowcaseOptions.SectionName))
            .Validate(x => x.MaxPublicPerTeacher is >= 1 and <= 20
                && x.MaxPublicPerSubject >= 1
                && x.MaxPublicPerSubject <= x.MaxPublicPerTeacher
                && x.MaxVersionsPerShowcase is >= 2 and <= 50,
                "Teacher Showcase limits are invalid.")
            .Validate(x => !environment.IsProduction() || !x.Enabled
                || x.DurableObjectStorage
                && x.MalwareScanning
                && x.ReliableMediaProbing
                && x.RetentionPolicy
                && x.CopyrightReportingPolicy
                && x.ModerationOperations
                && x.SecureMediaDelivery,
                "Production Teacher Showcases require explicitly validated Production media capabilities.")
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
                    environment.IsDevelopment() || environment.IsEnvironment("Testing")
                    || MailAddress.TryCreate(options.From, out var sender)
                    && !sender.Address.EndsWith("@resend.dev", StringComparison.OrdinalIgnoreCase)
                    && (!environment.IsProduction()
                        || new Uri(options.PasswordResetUrl).Host is not ("localhost" or "127.0.0.1")
                        && new Uri(options.ConfirmationUrl).Host is not ("localhost" or "127.0.0.1")
                        && new Uri(options.AppBaseUrl).Host is not ("localhost" or "127.0.0.1")),
                "Non-development email must use a verified sender; Production also requires non-local frontend URLs.")
            .ValidateOnStart();
        services.AddHttpClient<ResendClient>(client => client.Timeout = TimeSpan.FromSeconds(15));
        services.AddOptions<ResendClientOptions>()
            .Bind(configuration.GetRequiredSection("Resend"))
            .Validate(options => !string.IsNullOrWhiteSpace(options.ApiToken), "Resend:ApiToken is required.")
            .ValidateOnStart();
        services.AddTransient<IResend, ResendClient>();
        // Development uses a local outbox so register/confirm works without a real Resend token.
        // Testing replaces IEmailSender in the web factory; Production/Staging keep Resend.
        if (environment.IsDevelopment())
            services.AddTransient<IEmailSender, DevelopmentEmailSender>();
        else
            services.AddTransient<IEmailSender, ResendEmailSender>();
        return services;
    }

    public static async Task InitializeIdentityAsync(this IServiceProvider services, bool migrate = false)
    {
        var logger = services.GetService<ILoggerFactory>()?.CreateLogger("Tafseel.Infrastructure.IdentityStartup")
            ?? NullLogger.Instance;

        // Bounded startup retry; NonRetryingExecutionStrategy keeps the explicit transaction a single unit.
        await IdentityStartupRetry.ExecuteAsync(
            () => InitializeIdentityCoreAsync(services, migrate),
            logger);
    }

    private static async Task InitializeIdentityCoreAsync(IServiceProvider services, bool migrate)
    {
        await using var scope = services.CreateAsyncScope();
        if (migrate)
            await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Database.MigrateAsync();

        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        await BackfillCanonicalServiceLocalizationAsync(db);

        var staging = scope.ServiceProvider.GetService<IHostEnvironment>()?.IsStaging() == true;
        if (await IdentitySeedIsCurrentAsync(db, staging))
            return;

        var strategy = new NonRetryingExecutionStrategy(db);
        await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
            foreach (var role in Roles.All)
                if (!await roles.RoleExistsAsync(role))
                {
                    var result = await roles.CreateAsync(new IdentityRole(role));
                    if (!result.Succeeded)
                        throw new InvalidOperationException($"Required Identity role '{role}' could not be created.");
                }

            // Canonical services back real business logic (e.g. LiveSessionService/MarketplaceService key off
            // Code == "live_session") and must exist idempotently in every environment, not just staging demo data.
            foreach (var service in CanonicalServices)
                if (!await db.ServiceCatalogItems.AnyAsync(x => x.Code == service.Code))
                    db.Add(new ServiceCatalogItem(
                        service.Name,
                        service.Description,
                        service.Code,
                        service.NameAr,
                        service.DescriptionAr,
                        displayOrder: service.DisplayOrder));

            foreach (var language in CanonicalLanguages)
                if (!await db.TeachingLanguages.AnyAsync(x => x.Code == language.Code))
                    db.Add(new TeachingLanguage(language.Name, language.Code));
            await db.SaveChangesAsync();

            if (staging)
            {
                var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
                var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<ApplicationUser>>();
                foreach (var account in StagingUsers)
                {
                    var user = await users.FindByEmailAsync(account.Email);
                    if (user is null)
                    {
                        user = new ApplicationUser
                        {
                            UserName = account.Email,
                            Email = account.Email,
                            FullName = account.FullName,
                            EmailConfirmed = true
                        };
                        user.PasswordHash = hasher.HashPassword(user, "@Admin123");
                        var created = await users.CreateAsync(user);
                        if (!created.Succeeded)
                            throw new InvalidOperationException($"Staging demo user '{account.Email}' could not be created.");
                    }
                    else if (!user.EmailConfirmed)
                    {
                        user.EmailConfirmed = true;
                        var confirmed = await users.UpdateAsync(user);
                        if (!confirmed.Succeeded)
                            throw new InvalidOperationException($"Staging demo user '{account.Email}' could not be confirmed.");
                    }

                    if (!await users.IsInRoleAsync(user, account.Role))
                    {
                        var assigned = await users.AddToRoleAsync(user, account.Role);
                        if (!assigned.Succeeded)
                            throw new InvalidOperationException(
                                $"Staging demo user '{account.Email}' could not be assigned to '{account.Role}'.");
                    }
                }
            }

            await transaction.CommitAsync();
        });
    }

    private static async Task BackfillCanonicalServiceLocalizationAsync(TafseelDbContext db)
    {
        var codes = CanonicalServices.Select(x => x.Code).ToArray();
        var existing = await db.ServiceCatalogItems
            .Where(x => codes.Contains(x.Code))
            .ToArrayAsync();
        if (existing.Length == 0)
            return;

        var changed = false;
        foreach (var service in existing)
        {
            var canonical = CanonicalServices.First(x => x.Code == service.Code);
            var beforeNameAr = service.NameAr;
            var beforeDescriptionAr = service.DescriptionAr;
            service.BackfillLocalization(canonical.NameAr, canonical.DescriptionAr);
            if (!string.Equals(beforeNameAr, service.NameAr, StringComparison.Ordinal)
                || !string.Equals(beforeDescriptionAr, service.DescriptionAr, StringComparison.Ordinal))
                changed = true;
        }

        if (changed)
            await db.SaveChangesAsync();
    }

    private static async Task<bool> IdentitySeedIsCurrentAsync(TafseelDbContext db, bool staging)
    {
        if (await db.Roles.CountAsync(x => x.Name != null && Roles.All.Contains(x.Name)) != Roles.All.Length)
            return false;

        var serviceCodes = CanonicalServices.Select(x => x.Code).ToArray();
        if (await db.ServiceCatalogItems.CountAsync(x => serviceCodes.Contains(x.Code)) != serviceCodes.Length)
            return false;

        var languageCodes = CanonicalLanguages.Select(x => x.Code).ToArray();
        if (await db.TeachingLanguages.CountAsync(x => languageCodes.Contains(x.Code)) != languageCodes.Length)
            return false;

        if (!staging)
            return true;

        var emails = StagingUsers.Select(x => x.Email).ToArray();
        var users = await db.Users
            .Where(x => x.Email != null && emails.Contains(x.Email) && x.EmailConfirmed)
            .Select(x => new { x.Id, x.Email })
            .ToArrayAsync();
        if (users.Length != StagingUsers.Length)
            return false;

        var assignments = await (
            from user in db.Users
            join userRole in db.UserRoles on user.Id equals userRole.UserId
            join role in db.Roles on userRole.RoleId equals role.Id
            where user.Email != null && emails.Contains(user.Email)
            select new { user.Email, role.Name })
            .ToArrayAsync();

        return StagingUsers.All(expected =>
            assignments.Any(actual =>
                actual.Email == expected.Email && actual.Name == expected.Role));
    }

    private static bool ValidFrontendUrl(string value, bool requireHttps) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && uri.UserInfo.Length == 0
        && (!requireHttps || uri.Scheme == Uri.UriSchemeHttps)
        && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp);
}
