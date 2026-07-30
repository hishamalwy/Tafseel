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
using Microsoft.Extensions.Options;
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
using Tafseel.Application.Students;
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
using Tafseel.Infrastructure.Students;
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

    // Shared by Staging demo-user seeding and opt-in Development demo-user seeding (ADR-012):
    // both paths seed the same canonical accounts/roles, only the password source differs.
    private static readonly (string Role, string Email, string FullName)[] DemoUserAccounts =
    [
        (Roles.Admin, "admin@gmail.com", "Tafseel Admin"),
        (Roles.Student, "student@gmail.com", "Tafseel Student"),
        (Roles.Teacher, "teacher@gmail.com", "Tafseel Teacher"),
        (Roles.QualityReviewer, "quality@gmail.com", "Tafseel Quality Reviewer")
    ];

    // Opt-in Development-only demo catalog content (ADR-013). Real production subjects/topics are
    // business content decided separately; this is placeholder content so a fresh Development
    // database has something to browse. QualificationTopic max duration mirrors the 3-minute
    // teaching-demo copy already shown to applicants in Tafseel-Auth.dc.html.
    private static readonly (
        string Name, string NameAr, string Icon, int DisplayOrder,
        (string Name, string Difficulty)[] Topics,
        (string Name, string TitleAr, string Instructions, string InstructionsAr,
            int MinSeconds, int ExpectedSeconds, int MaxSeconds,
            string EvaluationGuidance, string EvaluationGuidanceAr)[] QualificationTopics
    )[] DemoSubjects =
    [
        ("Mathematics", "الرياضيات", "📐", 10,
            [("Algebra", "Foundational"), ("Geometry", "Standard"), ("Calculus", "Advanced")],
            [("Solve a quadratic equation", "حل معادلة من الدرجة الثانية",
                "Record yourself walking a student through solving a quadratic equation step by step, as if teaching it for the first time.",
                "سجّل نفسك وأنت تشرح لطالب كيفية حل معادلة من الدرجة الثانية خطوة بخطوة، وكأنك تشرحها لأول مرة.",
                30, 120, 180,
                "Look for a clear step-by-step method, correct terminology, and a pace a first-time learner could follow.",
                "ركّز على وضوح الخطوات، صحة المصطلحات، وسرعة تناسب طالب يسمع الشرح لأول مرة.")]),
        ("Physics", "الفيزياء", "🧲", 20,
            [("Mechanics", "Standard"), ("Electricity", "Standard"), ("Optics", "Advanced")],
            [("Explain Newton's second law", "شرح قانون نيوتن الثاني",
                "Record yourself explaining Newton's second law of motion with a everyday example a student can relate to.",
                "سجّل نفسك وأنت تشرح قانون نيوتن الثاني للحركة مستخدمًا مثالًا من الحياة اليومية يفهمه الطالب.",
                30, 120, 180,
                "Look for a correct explanation of force, mass and acceleration, and a relatable real-world example.",
                "ركّز على شرح صحيح للقوة والكتلة والتسارع، ومثال واقعي يقرّب الفكرة للطالب.")]),
        ("Chemistry", "الكيمياء", "🧪", 30,
            [("Organic Chemistry", "Advanced"), ("Chemical Reactions", "Standard")],
            [("Balance a chemical equation", "موازنة معادلة كيميائية",
                "Record yourself teaching a student how to balance a simple chemical equation.",
                "سجّل نفسك وأنت تعلّم طالبًا كيفية موازنة معادلة كيميائية بسيطة.",
                30, 90, 150,
                "Look for correct balancing method and clear explanation of conservation of mass.",
                "ركّز على صحة طريقة الموازنة ووضوح شرح مبدأ حفظ الكتلة.")]),
        ("Biology", "الأحياء", "🧬", 40,
            [("Human Anatomy", "Standard"), ("Genetics", "Advanced")],
            [("Explain the cell cycle", "شرح دورة الخلية",
                "Record yourself explaining the stages of the cell cycle to a student new to biology.",
                "سجّل نفسك وأنت تشرح مراحل دورة الخلية لطالب جديد على مادة الأحياء.",
                30, 120, 180,
                "Look for correct ordering of stages and clear, simple language.",
                "ركّز على ترتيب صحيح للمراحل ولغة بسيطة وواضحة.")]),
        ("English Language", "اللغة الإنجليزية", "🔤", 50,
            [("Grammar", "Foundational"), ("Essay Writing", "Standard")],
            [("Teach the present perfect tense", "شرح زمن المضارع التام",
                "Record yourself teaching the present perfect tense with example sentences.",
                "سجّل نفسك وأنت تشرح زمن المضارع التام (Present Perfect) مع أمثلة توضيحية.",
                30, 90, 150,
                "Look for correct usage examples and a clear contrast with the simple past.",
                "ركّز على أمثلة استخدام صحيحة ومقارنة واضحة مع الماضي البسيط.")]),
        ("Arabic Language", "اللغة العربية", "📖", 60,
            [("Grammar (النحو)", "Standard"), ("Literature (الأدب)", "Advanced")],
            [("Explain a grammar rule", "شرح قاعدة نحوية",
                "Record yourself explaining a foundational Arabic grammar rule with example sentences.",
                "سجّل نفسك وأنت تشرح قاعدة نحوية أساسية مع أمثلة توضيحية.",
                30, 120, 180,
                "Look for correct grammatical terminology and clear illustrative examples.",
                "ركّز على صحة المصطلحات النحوية ووضوح الأمثلة التوضيحية.")]),
        ("Computer Science", "علوم الحاسب", "💻", 70,
            [("Programming Basics", "Foundational"), ("Data Structures", "Advanced")],
            [("Explain a for-loop", "شرح حلقة التكرار for",
                "Record yourself explaining how a for-loop works to someone writing their first program.",
                "سجّل نفسك وأنت تشرح كيف تعمل حلقة التكرار for لشخص يكتب أول برنامج له.",
                30, 90, 150,
                "Look for a correct, beginner-friendly explanation and a simple working example.",
                "ركّز على شرح صحيح وسهل لمبتدئ، مع مثال بسيط يعمل فعليًا.")])
    ];

    private static readonly (string Name, string NameAr)[] DemoEducationLevels =
    [
        ("Elementary", "الابتدائي"),
        ("Middle School", "المتوسط"),
        ("High School", "الثانوي"),
        ("University", "الجامعي")
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
        services.AddSingleton<MockPaymentProvider>();
        services.AddScoped<IMockPaymentSimulator, MockPaymentSimulator>();
        services.AddSingleton<IPaymentProvider>(sp =>
        {
            var provider = sp.GetRequiredService<IOptions<PaymentOptions>>().Value.Provider;
            return provider switch
            {
                "Mock" => sp.GetRequiredService<MockPaymentProvider>(),
                _ => throw new InvalidOperationException(
                    $"Payment provider '{provider}' is not registered. Development uses Mock; Production requires a registered real provider.")
            };
        });
        services.AddScoped<IMessagingService, MessagingService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<NotificationWriter>();
        services.AddScoped<IStudentLearningPreferenceService, StudentLearningPreferenceService>();
        services.AddScoped<IGovernanceService, GovernanceService>();
        services.AddScoped<IAdminService, AdminService>();
        services.AddScoped<AuditWriter>();
        services.AddSingleton<Microsoft.AspNetCore.SignalR.IUserIdProvider, SubjectUserIdProvider>();
        services.AddHostedService<NotificationOutboxWorker>();
        services.AddSingleton<MockLiveSessionLinkProvider>();
        services.AddSingleton<ILiveSessionLinkProvider>(sp =>
        {
            var provider = sp.GetRequiredService<IOptions<LiveSessionOptions>>().Value.Provider;
            return provider switch
            {
                "Mock" => sp.GetRequiredService<MockLiveSessionLinkProvider>(),
                // Zoom / GoogleMeet / MicrosoftTeams adapters are intentionally not registered until
                // vendor credentials and join-window contracts are approved — fail closed instead of faking.
                _ => throw new InvalidOperationException(
                    $"Live-session provider '{provider}' is not registered. Development uses Mock; Production requires a registered real provider (Zoom, GoogleMeet, or MicrosoftTeams).")
            };
        });
        services.AddOptions<FileStorageOptions>()
            .Bind(configuration.GetSection(FileStorageOptions.SectionName))
            .Validate(options =>
                    string.Equals(options.Provider, "Local", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(options.Provider, "AzureBlob", StringComparison.OrdinalIgnoreCase),
                "FileStorage:Provider must be Local or AzureBlob.")
            .Validate(options =>
                    !string.Equals(options.Provider, "Local", StringComparison.OrdinalIgnoreCase)
                    || !string.IsNullOrWhiteSpace(options.RootPath),
                "FileStorage:RootPath is required for the Local provider.")
            .Validate(options =>
                    !string.Equals(options.Provider, "AzureBlob", StringComparison.OrdinalIgnoreCase)
                    || !string.IsNullOrWhiteSpace(options.AzureBlob.ConnectionString)
                    && !options.AzureBlob.ConnectionString.StartsWith("REPLACE_", StringComparison.Ordinal)
                    && !string.IsNullOrWhiteSpace(options.AzureBlob.ContainerName),
                "FileStorage AzureBlob provider requires a non-placeholder ConnectionString and ContainerName.")
            .Validate(options =>
                    !environment.IsProduction()
                    || string.Equals(options.Provider, "AzureBlob", StringComparison.OrdinalIgnoreCase),
                "Production requires FileStorage:Provider=AzureBlob (Local storage is forbidden).")
            .ValidateOnStart();
        services.AddScoped<IFileStorageService>(sp =>
        {
            var options = sp.GetRequiredService<IOptions<FileStorageOptions>>().Value;
            return options.Provider.Equals("AzureBlob", StringComparison.OrdinalIgnoreCase)
                ? ActivatorUtilities.CreateInstance<AzureBlobFileStorageService>(sp)
                : ActivatorUtilities.CreateInstance<LocalFileStorageService>(sp);
        });
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
            .Validate(x =>
                    x.Provider == "Mock"
                    || x.Provider is "Zoom" or "GoogleMeet" or "MicrosoftTeams",
                "LiveSessions:Provider must be Mock, Zoom, GoogleMeet, or MicrosoftTeams.")
            .Validate(x =>
                    x.Provider != "Mock"
                    || !environment.IsProduction(),
                "The mock live-session provider is forbidden in Production.")
            .Validate(x =>
                    environment.IsProduction()
                    || x.Provider == "Mock",
                "Non-Production environments must use LiveSessions:Provider=Mock until a real adapter is registered.")
            .Validate(x =>
                    !environment.IsProduction()
                    || x.Provider == "Mock"
                    || false,
                "No non-mock live-session provider implementation is registered yet (Zoom/GoogleMeet/MicrosoftTeams). Production remains fail-closed.")
            .ValidateOnStart();
        services.AddOptions<PaymentOptions>()
            .Bind(configuration.GetRequiredSection(PaymentOptions.SectionName))
            .Validate(x =>
                    x.Provider != "Mock" || x.WebhookSecret.Length >= 32,
                "The Mock payment provider requires a webhook secret of at least 32 characters.")
            .Validate(x =>
                    x.Provider == "Mock"
                    || !x.Provider.StartsWith("REPLACE_", StringComparison.Ordinal),
                "Payment provider placeholders are not allowed.")
            .Validate(x =>
                    !environment.IsProduction() || x.Provider != "Mock",
                "The mock payment provider is forbidden in Production.")
            .Validate(x =>
                    environment.IsProduction() || x.Provider == "Mock",
                "Non-Production environments must use Payments:Provider=Mock until a real PSP adapter is registered.")
            .Validate(x =>
                    !environment.IsProduction() || x.Provider == "Mock" || false,
                "No non-mock payment provider implementation is registered yet. Production remains fail-closed.")
            .Validate(x => !x.AutoReleaseEnabled,
                "Automatic escrow release is not enabled until the product policy is approved.")
            .Validate(x =>
                    x.Provider != "Mock" || x.Mock.Enabled,
                "Payments:Provider=Mock requires Payments:Mock:Enabled=true.")
            .Validate(x =>
                    !x.Mock.SimulatorEnabled || x.Provider == "Mock",
                "Payments:Mock:SimulatorEnabled requires Payments:Provider=Mock.")
            .Validate(x =>
                    !environment.IsProduction() || !x.Mock.SimulatorEnabled,
                "The mock payment simulator is forbidden in Production.")
            .Validate(x =>
                    string.IsNullOrWhiteSpace(x.Mock.DefaultReturnPath)
                    || x.Mock.DefaultReturnPath.StartsWith("/app/", StringComparison.OrdinalIgnoreCase),
                "Payments:Mock:DefaultReturnPath must be an /app/ relative path.")
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

        // Opt-in Development-only demo user seeding (ADR-012). The password is only ever required
        // when it would actually be used (Development and Enabled); Staging/Production never need it
        // and are never asked to provide it, because the seeding path itself never runs there
        // (see IdentityInitialization.RunAsync and the redundant guard in SeedDevelopmentDemoUsersAsync).
        services.AddOptions<SeedUsersOptions>()
            .Bind(configuration.GetSection(SeedUsersOptions.SectionName))
            .Validate(options => options.IsValid(environment.IsDevelopment()),
                "SeedUsers:Password (or the SeedUsers__Password environment variable) is required " +
                "when SeedUsers:Enabled is true in Development.")
            .ValidateOnStart();

        // Opt-in Development-only demo catalog content (ADR-013). Independent of SeedUsers: no
        // secret involved, just placeholder subjects/topics so a fresh Development database has
        // something to browse. Never applies in Staging/Production (same guard pattern as ADR-012).
        services.AddOptions<SeedDemoDataOptions>()
            .Bind(configuration.GetSection(SeedDemoDataOptions.SectionName));
        return services;
    }

    public static async Task InitializeIdentityAsync(this IServiceProvider services, bool migrate = false)
    {
        var logger = services.GetService<ILoggerFactory>()?.CreateLogger("Tafseel.Infrastructure.IdentityStartup")
            ?? NullLogger.Instance;

        // Bounded startup retry; NonRetryingExecutionStrategy keeps the explicit transaction a single unit.
        await IdentityStartupRetry.ExecuteAsync(
            () => InitializeIdentityCoreAsync(services, migrate, logger),
            logger);
    }

    private static async Task InitializeIdentityCoreAsync(IServiceProvider services, bool migrate, ILogger logger)
    {
        await using var scope = services.CreateAsyncScope();
        if (migrate)
            await scope.ServiceProvider.GetRequiredService<TafseelDbContext>().Database.MigrateAsync();

        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        await BackfillCanonicalServiceLocalizationAsync(db);

        var environment = scope.ServiceProvider.GetService<IHostEnvironment>();
        var staging = environment?.IsStaging() == true;
        // Resolving .Value runs SeedUsersOptions.IsValid: it throws OptionsValidationException with a
        // safe (password-free) message if Enabled=true in Development without a configured password.
        // The predicate is self-gating, so this is a no-op outside Development-and-Enabled.
        var seedUsersOptions = scope.ServiceProvider.GetService<IOptions<SeedUsersOptions>>()?.Value;
        var developmentSeedEnabled = environment?.IsDevelopment() == true && seedUsersOptions?.Enabled == true;
        var seedDemoDataOptions = scope.ServiceProvider.GetService<IOptions<SeedDemoDataOptions>>()?.Value;
        var demoCatalogSeedEnabled = environment?.IsDevelopment() == true && seedDemoDataOptions?.Enabled == true;
        if (await IdentitySeedIsCurrentAsync(db, staging, developmentSeedEnabled, demoCatalogSeedEnabled))
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
                foreach (var account in DemoUserAccounts)
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

            if (developmentSeedEnabled)
            {
                var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
                await SeedDevelopmentDemoUsersAsync(environment, seedUsersOptions, users, logger);
            }

            if (demoCatalogSeedEnabled)
                await SeedDevelopmentDemoCatalogAsync(environment, seedDemoDataOptions, db, logger);

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

    private static async Task<bool> IdentitySeedIsCurrentAsync(
        TafseelDbContext db, bool staging, bool developmentSeedEnabled, bool demoCatalogSeedEnabled)
    {
        if (await db.Roles.CountAsync(x => x.Name != null && Roles.All.Contains(x.Name)) != Roles.All.Length)
            return false;

        var serviceCodes = CanonicalServices.Select(x => x.Code).ToArray();
        if (await db.ServiceCatalogItems.CountAsync(x => serviceCodes.Contains(x.Code)) != serviceCodes.Length)
            return false;

        var languageCodes = CanonicalLanguages.Select(x => x.Code).ToArray();
        if (await db.TeachingLanguages.CountAsync(x => languageCodes.Contains(x.Code)) != languageCodes.Length)
            return false;

        // Staging and opt-in Development seeding expect the exact same accounts/roles; only the
        // password source differs, and this fast-path check never verifies passwords either way
        // (see SeedDevelopmentDemoUsersAsync), keeping repeated startups bounded.
        if (staging || developmentSeedEnabled)
        {
            var emails = DemoUserAccounts.Select(x => x.Email).ToArray();
            var users = await db.Users
                .Where(x => x.Email != null && emails.Contains(x.Email) && x.EmailConfirmed)
                .Select(x => new { x.Id, x.Email })
                .ToArrayAsync();
            if (users.Length != DemoUserAccounts.Length)
                return false;

            var assignments = await (
                from user in db.Users
                join userRole in db.UserRoles on user.Id equals userRole.UserId
                join role in db.Roles on userRole.RoleId equals role.Id
                where user.Email != null && emails.Contains(user.Email)
                select new { user.Email, role.Name })
                .ToArrayAsync();

            if (!DemoUserAccounts.All(expected =>
                    assignments.Any(actual => actual.Email == expected.Email && actual.Name == expected.Role)))
                return false;
        }

        // Heuristic only (subject presence, not topics/qualification-topics/education-levels): if it
        // under-detects staleness, SeedDevelopmentDemoCatalogAsync still repairs idempotently on the
        // full pass it would trigger for an unrelated reason; this just keeps repeated startups bounded.
        if (demoCatalogSeedEnabled)
        {
            var subjectNames = DemoSubjects.Select(x => CatalogNameNormalizer.Key(x.Name)).ToArray();
            if (await db.Subjects.CountAsync(x => subjectNames.Contains(x.NormalizedName)) != DemoSubjects.Length)
                return false;
        }

        return true;
    }

    /// <summary>
    /// Creates/repairs the four canonical demo accounts from configuration. Defensive guard: this
    /// must never create accounts outside Development, even if called directly or misconfigured
    /// elsewhere — the check here does not trust the caller's gating.
    /// </summary>
    private static async Task SeedDevelopmentDemoUsersAsync(
        IHostEnvironment? environment,
        SeedUsersOptions? seedOptions,
        UserManager<ApplicationUser> users,
        ILogger logger)
    {
        if (environment?.IsDevelopment() != true || seedOptions?.Enabled != true)
            return;

        if (string.IsNullOrWhiteSpace(seedOptions.Password))
            throw new InvalidOperationException(
                "SeedUsers:Enabled is true but SeedUsers:Password is not configured. Set it via " +
                "User Secrets or the SeedUsers__Password environment variable (Development only).");

        foreach (var account in DemoUserAccounts)
        {
            var user = await users.FindByEmailAsync(account.Email);
            var wasExisting = user is not null;
            if (user is null)
            {
                user = new ApplicationUser
                {
                    UserName = account.Email,
                    Email = account.Email,
                    FullName = account.FullName,
                    EmailConfirmed = true
                };
                // Standard UserManager.CreateAsync(user, password): runs full Identity password
                // validation and hashing, unlike the Staging shortcut above.
                var created = await users.CreateAsync(user, seedOptions.Password);
                if (!created.Succeeded)
                    throw new InvalidOperationException(
                        $"Development demo user '{account.Email}' could not be created: "
                        + string.Join("; ", created.Errors.Select(x => x.Description)));
                logger.LogInformation("Development demo user seeding: created {Email}.", account.Email);
            }
            else
            {
                if (!user.EmailConfirmed)
                {
                    user.EmailConfirmed = true;
                    var confirmed = await users.UpdateAsync(user);
                    if (!confirmed.Succeeded)
                        throw new InvalidOperationException(
                            $"Development demo user '{account.Email}' email confirmation could not be repaired.");
                    logger.LogInformation(
                        "Development demo user seeding: repaired email confirmation for {Email}.", account.Email);
                }
                else
                {
                    logger.LogInformation("Development demo user seeding: {Email} already exists.", account.Email);
                }

                // Never reset an existing account's password; just report a mismatch so a developer
                // can tell why login fails, without ever logging either password.
                if (!await users.CheckPasswordAsync(user, seedOptions.Password))
                    logger.LogWarning(
                        "Development demo user seeding: {Email} exists but does not accept the " +
                        "configured SeedUsers:Password; its stored password was left unchanged.",
                        account.Email);
            }

            if (!await users.IsInRoleAsync(user, account.Role))
            {
                var assigned = await users.AddToRoleAsync(user, account.Role);
                if (!assigned.Succeeded)
                    throw new InvalidOperationException(
                        $"Development demo user '{account.Email}' could not be assigned to role '{account.Role}'.");
                // Only log this as a "repair" when the account already existed; a brand-new account
                // getting its one canonical role is expected, not drift.
                if (wasExisting)
                    logger.LogInformation(
                        "Development demo user seeding: repaired role for {Email} -> {Role}.", account.Email, account.Role);
            }
        }

        logger.LogInformation("Development demo user seeding completed ({Count} accounts).", DemoUserAccounts.Length);
    }

    /// <summary>
    /// Creates/repairs demo subjects, topics, qualification topics and education levels. Defensive
    /// guard mirrors <see cref="SeedDevelopmentDemoUsersAsync"/>: never trusts the caller's gating.
    /// </summary>
    private static async Task SeedDevelopmentDemoCatalogAsync(
        IHostEnvironment? environment,
        SeedDemoDataOptions? options,
        TafseelDbContext db,
        ILogger logger)
    {
        if (environment?.IsDevelopment() != true || options?.Enabled != true)
            return;

        foreach (var subjectSeed in DemoSubjects)
        {
            var subjectKey = CatalogNameNormalizer.Key(subjectSeed.Name);
            var subject = await db.Subjects.FirstOrDefaultAsync(x => x.NormalizedName == subjectKey);
            if (subject is null)
            {
                subject = new Subject(subjectSeed.Name, subjectSeed.Icon, subjectSeed.NameAr, subjectSeed.DisplayOrder);
                db.Add(subject);
                logger.LogInformation("Development demo catalog seeding: created subject {Subject}.", subjectSeed.Name);
            }

            foreach (var topicSeed in subjectSeed.Topics)
            {
                var topicKey = CatalogNameNormalizer.Key(topicSeed.Name);
                if (!await db.Topics.AnyAsync(x => x.SubjectId == subject.Id && x.NormalizedName == topicKey))
                {
                    db.Add(new Tafseel.Domain.Catalog.Topic(subject.Id, topicSeed.Name, topicSeed.Difficulty));
                    logger.LogInformation(
                        "Development demo catalog seeding: created topic {Topic} under {Subject}.",
                        topicSeed.Name, subjectSeed.Name);
                }
            }

            foreach (var qualificationSeed in subjectSeed.QualificationTopics)
            {
                var qualificationKey = CatalogNameNormalizer.Key(qualificationSeed.Name);
                if (await db.QualificationTopics.AnyAsync(
                        x => x.SubjectId == subject.Id && x.NormalizedName == qualificationKey))
                    continue;

                var qualificationTopic = new QualificationTopic(
                    subject.Id, qualificationSeed.Name, qualificationSeed.Instructions, qualificationSeed.MaxSeconds);
                qualificationTopic.Configure(
                    qualificationSeed.Name, qualificationSeed.TitleAr,
                    qualificationSeed.Instructions, qualificationSeed.InstructionsAr,
                    qualificationSeed.ExpectedSeconds, qualificationSeed.MinSeconds, qualificationSeed.MaxSeconds,
                    qualificationSeed.EvaluationGuidance, qualificationSeed.EvaluationGuidanceAr, displayOrder: 10);
                db.Add(qualificationTopic);
                logger.LogInformation(
                    "Development demo catalog seeding: created qualification topic {Topic} under {Subject}.",
                    qualificationSeed.Name, subjectSeed.Name);
            }
        }

        foreach (var levelSeed in DemoEducationLevels)
        {
            var levelKey = CatalogNameNormalizer.Key(levelSeed.Name);
            if (await db.EducationLevels.AnyAsync(x => x.NormalizedName == levelKey))
                continue;

            var level = new EducationLevel(levelSeed.Name);
            level.Rename(levelSeed.Name, levelSeed.NameAr);
            db.Add(level);
            logger.LogInformation("Development demo catalog seeding: created education level {Level}.", levelSeed.Name);
        }

        await db.SaveChangesAsync();
        logger.LogInformation(
            "Development demo catalog seeding completed ({Subjects} subjects).", DemoSubjects.Length);
    }

    private static bool ValidFrontendUrl(string value, bool requireHttps) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && uri.UserInfo.Length == 0
        && (!requireHttps || uri.Scheme == Uri.UriSchemeHttps)
        && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp);
}
