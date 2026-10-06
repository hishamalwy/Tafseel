using System.Net.Mail;
using System.Security.Cryptography;
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
using Tafseel.Application.Ai;
using Tafseel.Application.Authentication;
using Tafseel.Application.Authorization;
using Tafseel.Application.Catalog;
using Tafseel.Application.Common;
using Tafseel.Application.Email;
using Tafseel.Application.Finance;
using Tafseel.Application.Governance;
using Tafseel.Application.Marketing;
using Tafseel.Application.Marketplace;
using Tafseel.Application.MarketplaceIntelligence;
using Tafseel.Application.Messaging;
using Tafseel.Application.LiveSessions;
using Tafseel.Application.Orders;
using Tafseel.Application.Students;
using Tafseel.Application.TeacherApplications;
using Tafseel.Application.TeacherBusiness;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Governance;
using Tafseel.Domain.Marketing;
using Tafseel.Infrastructure.Catalog;
using Tafseel.Infrastructure.Ai;
using Tafseel.Infrastructure.Email;
using Tafseel.Infrastructure.Finance;
using Tafseel.Infrastructure.Governance;
using Tafseel.Infrastructure.Files;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Marketing;
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

    /// <summary>
    /// The V1 Catalog Service price, delivery and revision policy (DEC-01).
    ///
    /// Until now the canonical services were created without bounds, and the domain's own last-resort
    /// defaults stood in: 0.01 SAR to 1,000,000 SAR. A teacher setting a price was told that was the policy,
    /// which is not guidance a person can act on (UX-06). The decided table is business configuration, so it
    /// belongs here, on the path that already guarantees the canonical services exist in every environment —
    /// not in a screen, which must keep rendering whatever the server says the policy is.
    /// </summary>
    private static readonly (
        string Code, decimal MinPrice, decimal MaxPrice, decimal DefaultPrice, decimal RecommendedPrice,
        int? MinHours, int? DefaultHours, int? RecommendedHours, int? MaxHours,
        int DefaultRevisions, int MaxRevisions)[] CanonicalServicePolicy =
    [
        ("recorded_explanation", 50m, 800m, 120m, 120m, 12, 48, 48, 336, 2, 5),
        ("assignment_guidance", 60m, 1_000m, 150m, 150m, 24, 72, 72, 336, 2, 3),
        ("exam_revision", 80m, 1_500m, 200m, 200m, 24, 72, 72, 240, 1, 3),
        ("live_session", 60m, 600m, 150m, 150m, null, null, null, null, 0, 0)
    ];

    /// <summary>
    /// The bounds the domain falls back to when a service was never given any: 0.01 SAR for an async
    /// service, 30 SAR for a live one, and 1,000,000 SAR at the top for both. A service still carrying any
    /// of these was never configured by anyone (DEC-01).
    /// </summary>
    private const decimal UnsetAsyncMinimumPrice = 0.01m;
    private const decimal UnsetLiveMinimumPrice = 30m;
    private const decimal UnsetMaximumPrice = 1_000_000m;

    private static readonly (string Name, string Code)[] CanonicalLanguages =
        [("Arabic", "ar"), ("English", "en")];

    // The canonical demo accounts, one per role (ADR-012). Created only where demo data is allowed, with the
    // environment's own seed password; finance@gmail.com is the one Finance demo account.
    internal static readonly (string Role, string Email, string FullName, string FullNameEnglish)[] DemoUserAccounts =
    [
        (Roles.Admin, "admin@gmail.com", "Tafseel Admin", "Tafseel Admin"),
        (Roles.Student, "student@gmail.com", "Tafseel Student", "Tafseel Student"),
        (Roles.Teacher, "teacher@gmail.com", "معلم تفصيل", "Tafseel Teacher"),
        (Roles.QualityReviewer, "quality@gmail.com", "Tafseel Quality Reviewer", "Tafseel Quality Reviewer"),
        // PRODUCT-P1: the Finance role (money duties only). Help reports are Admin work, so there is no support account.
        (Roles.Finance, "finance@gmail.com", "مالية تفصيل", "Tafseel Finance")
    ];

    // Baseline catalog content shared by Development, Staging and PreProduction (ADR-013). Real
    // production subjects/topics are business content decided separately. QualificationTopic max duration mirrors the 3-minute
    // teaching-demo copy already shown to applicants on the sign-in screen.
    private static readonly (
        string Name, string NameAr, string Icon, int DisplayOrder,
        (string Name, string NameAr, string Difficulty)[] Topics,
        (string Name, string TitleAr, string Instructions, string InstructionsAr,
            int MinSeconds, int ExpectedSeconds, int MaxSeconds,
            string EvaluationGuidance, string EvaluationGuidanceAr)[] QualificationTopics
    )[] DemoSubjects =
    [
        ("Mathematics", "الرياضيات", "📐", 10,
            [("Algebra", "الجبر", "Foundational"), ("Geometry", "الهندسة", "Standard"),
                ("Calculus", "التفاضل والتكامل", "Advanced")],
            [("Solve a quadratic equation", "حل معادلة من الدرجة الثانية",
                "Record yourself walking a student through solving a quadratic equation step by step, as if teaching it for the first time.",
                "سجّل نفسك وأنت تشرح لطالب كيفية حل معادلة من الدرجة الثانية خطوة بخطوة، وكأنك تشرحها لأول مرة.",
                30, 120, 180,
                "Look for a clear step-by-step method, correct terminology, and a pace a first-time learner could follow.",
                "ركّز على وضوح الخطوات، صحة المصطلحات، وسرعة تناسب طالب يسمع الشرح لأول مرة.")]),
        ("Physics", "الفيزياء", "🧲", 20,
            [("Mechanics", "الميكانيكا", "Standard"), ("Electricity", "الكهرباء", "Standard"),
                ("Optics", "البصريات", "Advanced")],
            [("Explain Newton's second law", "شرح قانون نيوتن الثاني",
                "Record yourself explaining Newton's second law of motion with a everyday example a student can relate to.",
                "سجّل نفسك وأنت تشرح قانون نيوتن الثاني للحركة مستخدمًا مثالًا من الحياة اليومية يفهمه الطالب.",
                30, 120, 180,
                "Look for a correct explanation of force, mass and acceleration, and a relatable real-world example.",
                "ركّز على شرح صحيح للقوة والكتلة والتسارع، ومثال واقعي يقرّب الفكرة للطالب.")]),
        ("Chemistry", "الكيمياء", "🧪", 30,
            [("Organic Chemistry", "الكيمياء العضوية", "Advanced"),
                ("Chemical Reactions", "التفاعلات الكيميائية", "Standard")],
            [("Balance a chemical equation", "موازنة معادلة كيميائية",
                "Record yourself teaching a student how to balance a simple chemical equation.",
                "سجّل نفسك وأنت تعلّم طالبًا كيفية موازنة معادلة كيميائية بسيطة.",
                30, 90, 150,
                "Look for correct balancing method and clear explanation of conservation of mass.",
                "ركّز على صحة طريقة الموازنة ووضوح شرح مبدأ حفظ الكتلة.")]),
        ("Biology", "الأحياء", "🧬", 40,
            [("Human Anatomy", "تشريح الإنسان", "Standard"), ("Genetics", "علم الوراثة", "Advanced")],
            [("Explain the cell cycle", "شرح دورة الخلية",
                "Record yourself explaining the stages of the cell cycle to a student new to biology.",
                "سجّل نفسك وأنت تشرح مراحل دورة الخلية لطالب جديد على مادة الأحياء.",
                30, 120, 180,
                "Look for correct ordering of stages and clear, simple language.",
                "ركّز على ترتيب صحيح للمراحل ولغة بسيطة وواضحة.")]),
        ("English Language", "اللغة الإنجليزية", "🔤", 50,
            [("Grammar", "القواعد", "Foundational"), ("Essay Writing", "كتابة المقال", "Standard")],
            [("Teach the present perfect tense", "شرح زمن المضارع التام",
                "Record yourself teaching the present perfect tense with example sentences.",
                "سجّل نفسك وأنت تشرح زمن المضارع التام (Present Perfect) مع أمثلة توضيحية.",
                30, 90, 150,
                "Look for correct usage examples and a clear contrast with the simple past.",
                "ركّز على أمثلة استخدام صحيحة ومقارنة واضحة مع الماضي البسيط.")]),
        ("Arabic Language", "اللغة العربية", "📖", 60,
            [("Grammar (النحو)", "النحو", "Standard"), ("Literature (الأدب)", "الأدب", "Advanced")],
            [("Explain a grammar rule", "شرح قاعدة نحوية",
                "Record yourself explaining a foundational Arabic grammar rule with example sentences.",
                "سجّل نفسك وأنت تشرح قاعدة نحوية أساسية مع أمثلة توضيحية.",
                30, 120, 180,
                "Look for correct grammatical terminology and clear illustrative examples.",
                "ركّز على صحة المصطلحات النحوية ووضوح الأمثلة التوضيحية.")]),
        ("Computer Science", "علوم الحاسب", "💻", 70,
            [("Programming Basics", "أساسيات البرمجة", "Foundational"),
                ("Data Structures", "هياكل البيانات", "Advanced")],
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

    /// <summary>
    /// Development-only landing promos, one per kind, so the promo band renders
    /// every layout before an admin publishes real content.
    /// </summary>
    private static readonly (
        PromotionKind Kind,
        string EyebrowEn, string EyebrowAr,
        string TitleEn, string TitleAr,
        string BodyEn, string BodyAr,
        string HighlightEn, string HighlightAr,
        string CouponCode,
        string CtaLabelEn, string CtaLabelAr, string CtaHref,
        int? EndsInDays, int DisplayOrder
    )[] DemoPromotions =
    [
        (PromotionKind.Discount,
            "Limited offer", "عرض لفترة محدودة",
            "20% off your first request", "خصم 20% على أول طلب لك",
            "Start your journey with Tafseel and use an exclusive discount on your first request.",
            "ابدأ رحلتك مع تفصيل واستفد من خصم حصري على أول طلب.",
            "20%", "20%",
            "TAFSEEL20",
            "Claim the offer", "استفد من العرض", AppRoutes.BrowseTeachers,
            5, 0),
        (PromotionKind.Feature,
            "New", "جديد",
            "Post a request, let teachers come to you", "انشر طلبك ودع المعلمين يتنافسون",
            "Describe what you need once and receive competing offers from qualified teachers.",
            "صف ما تحتاجه مرة واحدة واستقبل عروضًا متنافسة من معلمين مؤهلين.",
            "", "",
            "",
            "Try it now", "جرّبها الآن", AppRoutes.NewRequest,
            null, 1),
        (PromotionKind.Spotlight,
            "Spotlight", "الأكثر طلبًا",
            "Exam season revision, ready when you are", "مراجعة موسم الاختبارات جاهزة لك",
            "Focused revision sessions on your syllabus and past papers, with evening and weekend slots.",
            "جلسات مراجعة مركزة على منهجك وأسئلة الاختبارات السابقة، بمواعيد مسائية ونهاية الأسبوع.",
            "", "",
            "",
            "Browse teachers", "تصفح المعلمين", AppRoutes.BrowseTeachers,
            null, 2)
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
                    && options.SessionRefreshHours is >= 1 and <= 24
                    && TimeSpan.FromDays(options.RefreshTokenDays) > TimeSpan.FromMinutes(options.AccessTokenMinutes),
                "JWT access lifetime must be 1-60 minutes, refresh lifetime 1-90 days and longer than access lifetime, and the session refresh lifetime 1-24 hours.")
            .Validate(options =>
                    !environment.IsProduction()
                    || !options.SigningKey.Contains("development", StringComparison.OrdinalIgnoreCase),
                "Production cannot use a development signing key.")
            .ValidateOnStart();
        services.AddScoped<IAuthenticationService, AuthenticationService>();
        services.AddOptions<PrivacyOptions>()
            .Bind(configuration.GetSection(PrivacyOptions.SectionName))
            .Validate(x => x.ReadNotificationDays is >= 30 and <= 730
                && x.AuthenticationRecordDays is >= 1 and <= 180
                && x.MarketplaceAnalyticsDays is >= 30 and <= 1095
                && x.BatchSize is >= 100 and <= 5000,
                "Privacy retention limits are invalid.")
            .ValidateOnStart();
        services.AddScoped<DataRetentionService>();
        services.AddHostedService<DataRetentionWorker>();
        services.AddScoped<ICatalogService, CatalogService>();
        services.AddOptions<AiOptions>()
            .Bind(configuration.GetSection(AiOptions.SectionName))
            .Validate(x => string.Equals(x.Provider, "Groq", StringComparison.Ordinal),
                "Ai:Provider must be Groq. Unknown providers are not registered.")
            .Validate(x => Uri.TryCreate(x.Endpoint, UriKind.Absolute, out var endpoint)
                    && (endpoint.Scheme == Uri.UriSchemeHttps
                        || !environment.IsProduction() && endpoint.Scheme == Uri.UriSchemeHttp),
                "Ai:Endpoint must be an absolute HTTPS URL (HTTP is allowed only outside Production).")
            .Validate(x => !string.IsNullOrWhiteSpace(x.Model)
                    && x.TimeoutSeconds is >= 2 and <= 60
                    && x.MaxInputCharacters is >= 100 and <= 10_000
                    && x.MaxOutputTokens is >= 50 and <= 4_000,
                "AI model and request bounds are invalid.")
            .ValidateOnStart();
        services.AddSingleton<IAiProvider, GroqAiProvider>();
        services.AddScoped<IAiMarketplaceAssistant, AiMarketplaceAssistant>();
        services.AddScoped<ITeacherApplicationService, TeacherApplicationService>();
        services.AddScoped<IMarketplaceService, MarketplaceService>();
        services.AddScoped<IIntroVideoService, IntroVideoService>();
        services.AddScoped<ITeacherBusinessService, TeacherBusinessService>();
        services.AddScoped<IMarketplaceIntelligenceService, MarketplaceIntelligenceService>();
        services.AddScoped<IOrderService, OrderService>();
        services.AddScoped<IOpenMarketplaceService, OpenMarketplaceService>();
        services.AddScoped<IOpenRequestDraftService, OpenRequestDraftService>();
        services.AddScoped<OpenMarketplaceReservationExpiryService>();
        services.AddOptions<OpenMarketplaceOptions>().Bind(configuration.GetSection(OpenMarketplaceOptions.SectionName))
            .Validate(x => x.OfferReservationMinutes is >= 15 and <= 1440, "Offer reservation must be 15-1440 minutes.")
            .ValidateOnStart();
        services.AddSingleton<Tafseel.Infrastructure.Operations.WorkerHeartbeats>();
        services.AddHostedService<OpenMarketplaceReservationWorker>();
        services.AddHostedService<OrderAutoReleaseWorker>();
        services.AddHostedService<LiveSessionSettlementWorker>();
        // Registered as itself as well so the maturity pass can be driven deterministically
        // (tests, and any future operational trigger) instead of only by the timer.
        services.AddSingleton<EarningsMaturityWorker>();
        services.AddHostedService(sp => sp.GetRequiredService<EarningsMaturityWorker>());
        services.AddScoped<ILiveSessionService, LiveSessionService>();
        services.AddScoped<IFinancialService, FinancialService>();
        services.AddScoped<IFinanceOperationsService, FinanceOperationsService>();
        services.AddScoped<ITeacherEarningsService, TeacherEarningsService>();
        services.AddScoped<ISupportService, SupportService>();
        services.AddScoped<ICouponService, CouponService>();
        services.AddScoped<ICouponCheckoutQuoteService, CouponCheckoutQuoteService>();
        services.AddScoped<IPromotionService, PromotionService>();
        services.AddScoped<IPlatformStatsService, PlatformStatsService>();
        services.AddScoped<PaymentCheckoutService>();
        if (environment.IsEnvironment("Testing")) services.AddSingleton<MockPaymentProvider>();
        if (configuration["Payments:Provider"] == "Paymob") services.AddHostedService<PaymobRecoveryWorker>();
        services.AddHttpClient<PaymobPaymentProvider>((sp, client) =>
        {
            client.BaseAddress = new Uri(sp.GetRequiredService<IOptions<PaymobOptions>>().Value.BaseUrl.TrimEnd('/') + "/");
            client.Timeout = TimeSpan.FromSeconds(25);
        }).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false })
            .RemoveAllLoggers();
        services.AddScoped<IPaymentProvider>(sp =>
        {
            var selected = sp.GetRequiredService<IOptions<PaymentOptions>>().Value.Provider;
            return selected switch
            {
                "Paymob" => sp.GetRequiredService<PaymobPaymentProvider>(),
                "Mock" when environment.IsEnvironment("Testing") => sp.GetRequiredService<MockPaymentProvider>(),
                _ => throw new InvalidOperationException("Payments:Provider must be Paymob. Deterministic fakes are for Testing only.")
            };
        });
        services.AddScoped<IMessagingService, MessagingService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<NotificationWriter>();
        services.AddScoped<IStudentLearningPreferenceService, StudentLearningPreferenceService>();
        services.AddScoped<IGovernanceService, GovernanceService>();
        services.AddHostedService<DisputeSlaWorker>();
        services.AddScoped<IAdminService, AdminService>();
        services.AddScoped<AuditWriter>();
        services.AddSingleton<Microsoft.AspNetCore.SignalR.IUserIdProvider, SubjectUserIdProvider>();
        services.AddHostedService<NotificationOutboxWorker>();
        services.AddSingleton<MockLiveSessionLinkProvider>();
        services.AddSingleton<JaasLiveSessionLinkProvider>();
        services.AddSingleton<ILiveSessionLinkProvider>(sp =>
        {
            var provider = sp.GetRequiredService<IOptions<LiveSessionOptions>>().Value.Provider;
            return provider switch
            {
                "Mock" => sp.GetRequiredService<MockLiveSessionLinkProvider>(),
                "JaaS" => sp.GetRequiredService<JaasLiveSessionLinkProvider>(),
                _ => throw new InvalidOperationException(
                    $"Live-session provider '{provider}' is not registered. Use Mock or JaaS.")
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
        // SEC-04: every upload is scanned before it is stored; Production requires a real engine (clamd).
        services.AddOptions<MalwareScanningOptions>()
            .Bind(configuration.GetSection(MalwareScanningOptions.SectionName))
            .Validate(x => x.Mode is "Development" or "ClamAv", "MalwareScanning:Mode must be Development or ClamAv.")
            .Validate(x => x.Mode != "ClamAv" || (!string.IsNullOrWhiteSpace(x.ClamAv.Host)
                    && !x.ClamAv.Host.StartsWith("REPLACE_", StringComparison.Ordinal) && x.ClamAv.Port is > 0 and < 65536),
                "MalwareScanning:ClamAv requires a Host and Port.")
            .Validate(x => !environment.IsProduction() || x.Mode == "ClamAv",
                "Production requires MalwareScanning:Mode=ClamAv; the development scanner only recognises a test file.")
            .ValidateOnStart();
        services.AddSingleton<IMalwareScanner>(sp =>
            sp.GetRequiredService<IOptions<MalwareScanningOptions>>().Value.Enforced
                ? ActivatorUtilities.CreateInstance<ClamAvMalwareScanner>(sp)
                : new DevelopmentMalwareScanner());
        services.AddScoped<IFileStorageService>(sp =>
        {
            var options = sp.GetRequiredService<IOptions<FileStorageOptions>>().Value;
            IFileStorageService storage = options.Provider.Equals("AzureBlob", StringComparison.OrdinalIgnoreCase)
                ? ActivatorUtilities.CreateInstance<AzureBlobFileStorageService>(sp)
                : ActivatorUtilities.CreateInstance<LocalFileStorageService>(sp);
            return ActivatorUtilities.CreateInstance<ScanningFileStorageService>(sp, storage);
        });
        services.AddOptions<FeeOptions>()
            .Bind(configuration.GetRequiredSection(FeeOptions.SectionName))
            .Validate(x => x.StudentFeePercent is >= 0 and <= 100
                && x.TeacherCommissionPercent is >= 0 and <= 100
                && decimal.Round(x.StudentFeePercent, 4) == x.StudentFeePercent
                && decimal.Round(x.TeacherCommissionPercent, 4) == x.TeacherCommissionPercent,
                "Student fee and teacher commission percentages must be between 0 and 100 with at most four decimal places.")
            .ValidateOnStart();
        services.AddOptions<WithdrawalOptions>()
            .Bind(configuration.GetSection(WithdrawalOptions.SectionName))
            .Validate(x => x.MinimumAmount > 0 && x.Currency.Length == 3
                && x.ExpectedSettlementBusinessDays is >= 1 and <= 30
                && x.MaturityBatchSize is >= 1 and <= 500,
                "Withdrawal minimum, currency, settlement window, or maturity batch size are invalid.")
            .ValidateOnStart();
        // DEC-04 payout destinations. Outside Development/Testing the host refuses to start without key
        // material from the secret store; in Development/Testing a missing key makes every payout-destination
        // operation fail closed instead. There is no default key.
        services.AddOptions<PayoutDestinationOptions>()
            .Bind(configuration.GetSection(PayoutDestinationOptions.SectionName))
            .Validate(x => (string.IsNullOrEmpty(x.ActiveKeyId) && x.Keys.Count == 0) || x.IsUsable(out _),
                "PayoutDestinations key material is invalid: the active key must be listed and every key must be 32 random bytes, base64-encoded.")
            .Validate(x => environment.IsDevelopment() || environment.IsEnvironment("Testing") || x.IsUsable(out _),
                "PayoutDestinations:ActiveKeyId and its key are required outside Development/Testing; supply them from the secret store.")
            .ValidateOnStart();
        services.AddSingleton<IPayoutDestinationVault, AesGcmPayoutDestinationVault>();
        // The only payout adapter until PAY-01 selects a provider. It moves no money (see its summary).
        services.AddSingleton<IPayoutProvider, ManualBankTransferPayoutProvider>();
        services.AddOptions<LiveSessionOptions>()
            .Bind(configuration.GetRequiredSection(LiveSessionOptions.SectionName))
            .Validate(x => x.EmergencyPremiumPercent is >= 0 and <= 1000
                && decimal.Round(x.EmergencyPremiumPercent, 4) == x.EmergencyPremiumPercent
                && x.CancellationWindowHours is >= 0 and <= 720
                && x.JoinWindowMinutes is >= 0 and <= 120
                && x.NoShowGraceMinutes is >= 5 and <= 120
                && x.SettlementReviewHours is >= 1 and <= 168,
                "Live session premium, cancellation, and join-window settings are invalid.")
            .Validate(x =>
                    x.Provider == "Mock"
                    || x.Provider == "JaaS",
                "LiveSessions:Provider must be Mock or JaaS.")
            .Validate(x =>
                    x.Provider != "Mock"
                    || !environment.IsProduction(),
                "The mock live-session provider is forbidden in Production.")
            .ValidateOnStart();
        services.AddOptions<JaasOptions>()
            .Bind(configuration.GetSection(JaasOptions.SectionName))
            .Validate(x => configuration.GetValue<string>("LiveSessions:Provider") != "JaaS"
                || (x.AppId.StartsWith("vpaas-magic-cookie-", StringComparison.Ordinal)
                    && (ValidJaasStaticJwt(x.StaticJwt)
                        || (x.KeyId.StartsWith(x.AppId + "/", StringComparison.Ordinal)
                            && JaasSigningKey.IsUsable(x)))),
                "JaaS requires an AppId and either a private signing key (JaaS:PrivateKeyPem or JaaS:PrivateKeyPath) or a sandbox StaticJwt.")
            // A static token is one identity for every participant, is bound to no room or join window, and
            // expires on its own; PreProduction rehearses Production, so it signs per participant too.
            .Validate(x => !(environment.IsProduction() || environment.IsPreProduction())
                    || configuration.GetValue<string>("LiveSessions:Provider") != "JaaS"
                    || string.IsNullOrWhiteSpace(x.StaticJwt),
                "Production and PreProduction JaaS require per-participant signing: remove JaaS:StaticJwt from the settings (the host settings file is the usual place).")
            .Validate(x => !(environment.IsProduction() || environment.IsPreProduction())
                    || configuration.GetValue<string>("LiveSessions:Provider") != "JaaS"
                    || !x.KeyId.Contains("SAMPLE_APP", StringComparison.OrdinalIgnoreCase),
                "Production and PreProduction JaaS require per-participant signing with the account's own key: JaaS:KeyId is the sample app's key.")
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
            .Validate(x => x.Provider == "Paymob" || environment.IsEnvironment("Testing") && x.Provider == "Mock",
                "Payments:Provider must be Paymob. Mock is restricted to Testing.")
            .Validate(x => !x.AutoReleaseEnabled || x.AutoReleaseAfterHours is >= 24 and <= 720,
                "Payments:AutoReleaseAfterHours must be between 24 and 720 when automatic release is enabled.")
            .ValidateOnStart();
        services.AddOptions<PaymobOptions>().Bind(configuration.GetSection("Paymob"))
            .Validate(x => configuration["Payments:Provider"] != "Paymob" || x.Problems(environment.IsProduction()).Count == 0,
                "Paymob settings are missing or invalid. Use KSA, SAR, matching mode keys and public HTTPS callback URLs.")
            .Validate(x => !environment.IsPreProduction() || !x.IsLive,
                "PreProduction requires Paymob Test mode.")
            .ValidateOnStart();
        services.AddOptions<DisputeOptions>()
            .Bind(configuration.GetRequiredSection(DisputeOptions.SectionName))
            .Validate(x => x.WindowDays is >= 1 and <= 90
                    && x.InitialResponseHours is >= 1 and <= 168
                    && x.ResolutionHours is >= 1 and <= 720,
                "Dispute window and response SLAs are invalid.")
            .ValidateOnStart();
        services.AddOptions<OrderLifecycleOptions>()
            .Bind(configuration.GetRequiredSection(OrderLifecycleOptions.SectionName))
            .Validate(x => x.NonDeliveryGraceHours is >= 1 and <= 720,
                "Orders:NonDeliveryGraceHours must be between 1 and 720.")
            .ValidateOnStart();
        services.AddOptions<TeacherShowcaseOptions>()
            .Bind(configuration.GetSection(TeacherShowcaseOptions.SectionName))
            .Validate(x => x.MaxPublicPerTeacher is >= 1 and <= 20
                && x.MaxPublicPerSubject >= 1
                && x.MaxPublicPerSubject <= x.MaxPublicPerTeacher
                && x.MaxVersionsPerShowcase is >= 2 and <= 50
                && x.MaxFilesPerUpload is >= 1 and <= 20,
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
                "Email frontend URLs must be absolute; Production requires HTTPS.")
            .Validate(options =>
                    environment.IsDevelopment() || environment.IsEnvironment("Testing")
                    || MailAddress.TryCreate(options.From, out var sender)
                    && !sender.Address.EndsWith("@resend.dev", StringComparison.OrdinalIgnoreCase)
                    && (!environment.IsProduction()
                        || new Uri(options.PasswordResetUrl).Host is not ("localhost" or "127.0.0.1")
                        && new Uri(options.ConfirmationUrl).Host is not ("localhost" or "127.0.0.1")
                        && new Uri(options.AppBaseUrl).Host is not ("localhost" or "127.0.0.1")),
                "Non-development email must use a verified sender; Production also requires non-local frontend URLs.")
            .Validate(options => options.Delivery is "Resend" or "Outbox",
                "Email:Delivery must be Resend or Outbox.")
            .Validate(options => !environment.IsProduction()
                    || options.Delivery == "Resend" && options.SuppressedRecipients.Length == 0,
                "Production sends every email through Resend and suppresses no recipient.")
            .ValidateOnStart();
        services.AddHttpClient<ResendClient>(client => client.Timeout = TimeSpan.FromSeconds(15));
        services.AddOptions<ResendClientOptions>()
            .Bind(configuration.GetRequiredSection("Resend"))
            .Validate(options => !string.IsNullOrWhiteSpace(options.ApiToken), "Resend:ApiToken is required.")
            .ValidateOnStart();
        services.AddTransient<IResend, ResendClient>();
        // Development (and a Staging that asks for Email:Delivery=Outbox) writes mail to a local outbox, so
        // register/confirm works without sending anything. Testing replaces IEmailSender in the web factory.
        // Either way the seeded demo addresses are suppressed: they are real mailboxes of other people.
        var outbox = environment.IsDevelopment()
            || string.Equals(configuration["Email:Delivery"], "Outbox", StringComparison.OrdinalIgnoreCase);
        services.AddTransient<DevelopmentEmailSender>();
        services.AddTransient<ResendEmailSender>();
        services.AddTransient<IEmailSender>(sp => ActivatorUtilities.CreateInstance<SuppressingEmailSender>(sp,
            outbox ? sp.GetRequiredService<DevelopmentEmailSender>() : sp.GetRequiredService<ResendEmailSender>()));

        // Demo-account seeding (ADR-012). At startup the password is only required when it would be used
        // (Development and Enabled); the explicit `seed` command requires it itself (EnvironmentSeed).
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
        // Before the seed-is-current guard below, which returns early on every database that already
        // has its roles and services - which is every database that needs this correction (DEC-01).
        await ApplyCanonicalServicePolicyAsync(db);

        var environment = scope.ServiceProvider.GetService<IHostEnvironment>();
        // Startup seeds demo data only in Development, and only when a developer opted in. Staging and
        // PreProduction get the same demo data from the explicit, password-carrying `seed` command
        // (Seeding/EnvironmentSeed.cs); Production never does. There is no built-in password anywhere.
        // Resolving .Value runs SeedUsersOptions.IsValid, which throws a password-free error when a developer
        // enabled seeding without configuring SeedUsers:Password.
        var seedUsersOptions = scope.ServiceProvider.GetService<IOptions<SeedUsersOptions>>()?.Value;
        var developmentSeedEnabled = environment?.IsDevelopment() == true && seedUsersOptions?.Enabled == true;
        var seedDemoDataOptions = scope.ServiceProvider.GetService<IOptions<SeedDemoDataOptions>>()?.Value;
        var demoCatalogSeedEnabled = environment?.IsDevelopment() == true && seedDemoDataOptions?.Enabled == true;
        if (await IdentitySeedIsCurrentAsync(db, developmentSeedEnabled, demoCatalogSeedEnabled))
            return;

        var strategy = new NonRetryingExecutionStrategy(db);
        await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            await EnsureReferenceDataAsync(scope.ServiceProvider, db);

            if (developmentSeedEnabled)
                await SeedDemoAccountsAsync(environment, seedUsersOptions!.Password,
                    scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>(), logger);

            if (demoCatalogSeedEnabled)
                await SeedDemoCatalogAsync(environment, db, logger);

            await transaction.CommitAsync();
        });
    }

    /// <summary>
    /// The data every environment needs before anyone can use it: the Identity roles, the canonical
    /// Catalog Services with their DEC-01 policy, and the teaching languages. Idempotent.
    /// </summary>
    internal static async Task EnsureReferenceDataAsync(IServiceProvider scoped, TafseelDbContext db)
    {
        var roles = scoped.GetRequiredService<RoleManager<IdentityRole>>();
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

        // After the services exist, so a database created in this same run gets the decided policy
        // rather than the domain's unset-price fallback (DEC-01).
        await ApplyCanonicalServicePolicyAsync(db);
    }

    /// <summary>
    /// Deploy-time provisioning for Staging and Production, which never seed on startup (F-001): run
    /// <c>dotnet Tafseel.Api.dll provision</c> after the migrations. Creates the reference data and, when
    /// <paramref name="bootstrapAdminEmail"/> names an existing, confirmed account and no Admin exists yet,
    /// makes that account the first Admin. It never migrates and never creates demo users or demo catalog.
    /// Returns what it did, for the deploy log.
    /// </summary>
    public static async Task<IReadOnlyList<string>> ProvisionAsync(
        this IServiceProvider services, string? bootstrapAdminEmail, CancellationToken ct = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
        var report = new List<string>();
        var strategy = new NonRetryingExecutionStrategy(db);
        await strategy.ExecuteAsync(async () =>
        {
            report.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            await BackfillCanonicalServiceLocalizationAsync(db);
            await EnsureReferenceDataAsync(scope.ServiceProvider, db);
            report.Add("Roles, canonical services and teaching languages are in place.");
            report.Add(await PromoteBootstrapAdminAsync(scope.ServiceProvider, db, bootstrapAdminEmail));
            await transaction.CommitAsync(ct);
        });
        return report;
    }

    /// <summary>
    /// The first Admin of an environment, whom no one can appoint from inside the app. It only acts while
    /// there is no Admin at all, so the setting cannot be used to gain Admin once the environment has one.
    /// </summary>
    private static async Task<string> PromoteBootstrapAdminAsync(
        IServiceProvider scoped, TafseelDbContext db, string? email)
    {
        if (string.IsNullOrWhiteSpace(email))
            return "No bootstrap Admin was requested.";
        var users = scoped.GetRequiredService<UserManager<ApplicationUser>>();
        if ((await users.GetUsersInRoleAsync(Roles.Admin)).Count > 0)
            return "An Admin already exists, so the bootstrap Admin setting was ignored.";
        var user = await users.FindByEmailAsync(email.Trim())
            ?? throw new InvalidOperationException("The bootstrap Admin account does not exist. Register it first.");
        if (!user.EmailConfirmed)
            throw new InvalidOperationException("The bootstrap Admin account must confirm its email first.");
        if (user.IsSuspended)
            throw new InvalidOperationException("The bootstrap Admin account is suspended.");
        var added = await users.AddToRoleAsync(user, Roles.Admin);
        if (!added.Succeeded)
            throw new InvalidOperationException("The bootstrap Admin role could not be assigned.");
        await users.UpdateSecurityStampAsync(user);
        db.Add(new AuditLogEntry(user.Id, "AdminBootstrapped", "User", user.Id,
            "First Admin appointed by deploy-time provisioning.", "provisioning", DateTimeOffset.UtcNow));
        await db.SaveChangesAsync();
        return "The bootstrap account is now the first Admin.";
    }

    /// <summary>
    /// Puts the DEC-01 policy on the canonical services that have never been given one.
    ///
    /// A service whose bounds an Admin has actually configured is left exactly as it is: this only replaces
    /// the domain's unset-price fallback, which is what made the teacher services screen offer a range of
    /// 0.01 to 1,000,000 SAR. Idempotent, so it settles on the decided table and then stops changing
    /// anything.
    /// </summary>
    private static async Task ApplyCanonicalServicePolicyAsync(TafseelDbContext db)
    {
        var codes = CanonicalServicePolicy.Select(x => x.Code).ToArray();
        var services = await db.ServiceCatalogItems.Where(x => codes.Contains(x.Code)).ToArrayAsync();
        var changed = false;

        foreach (var service in services)
        {
            var policy = CanonicalServicePolicy.First(x => x.Code == service.Code);
            var fallbackMinimum = service.OrderType == ServiceOrderTypes.LiveSession
                ? UnsetLiveMinimumPrice : UnsetAsyncMinimumPrice;
            // Both bounds still at their fallbacks means nobody chose this policy. The fallback minimum
            // depends on the order type: a live service arrives at 30, not 0.01, which is why the first
            // pass missed it. One bound moved means an Admin touched it, and that is left alone.
            var unset = (service.MinPrice ?? fallbackMinimum) == fallbackMinimum
                && (service.MaxPrice ?? UnsetMaximumPrice) == UnsetMaximumPrice;
            if (!unset || (service.MinPrice == policy.MinPrice && service.MaxPrice == policy.MaxPrice))
                continue;

            // Everything but the decided numbers is the service's own current configuration: this call
            // applies a price policy, it does not re-create the service. `hasReferences: true` is the
            // conservative reading — the order type and qualification policy are unchanged either way.
            service.ConfigurePolicy(
                service.CategoryCode, service.IconCode, service.OrderType, service.QualificationPolicy,
                service.CurrencyCode,
                policy.MinPrice, policy.DefaultPrice, policy.RecommendedPrice, policy.MaxPrice,
                policy.MinHours, policy.DefaultHours, policy.RecommendedHours, policy.MaxHours,
                policy.DefaultRevisions, policy.MaxRevisions,
                service.IsPublic, service.TeacherSelectable, service.AllowedDurations, service.DisplayOrder,
                hasReferences: true);
            changed = true;
        }

        if (changed) await db.SaveChangesAsync();
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
        TafseelDbContext db, bool developmentSeedEnabled, bool demoCatalogSeedEnabled)
    {
        if (await db.Roles.CountAsync(x => x.Name != null && Roles.All.Contains(x.Name)) != Roles.All.Length)
            return false;

        var serviceCodes = CanonicalServices.Select(x => x.Code).ToArray();
        if (await db.ServiceCatalogItems.CountAsync(x => serviceCodes.Contains(x.Code)) != serviceCodes.Length)
            return false;

        var languageCodes = CanonicalLanguages.Select(x => x.Code).ToArray();
        if (await db.TeachingLanguages.CountAsync(x => languageCodes.Contains(x.Code)) != languageCodes.Length)
            return false;

        // The fast path never verifies passwords (see SeedDemoAccountsAsync), keeping repeated startups bounded.
        if (developmentSeedEnabled)
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
        // under-detects staleness, SeedDemoCatalogAsync still repairs idempotently on the
        // full pass it would trigger for an unrelated reason; this just keeps repeated startups bounded.
        if (demoCatalogSeedEnabled)
        {
            var subjectNames = DemoSubjects.Select(x => CatalogNameNormalizer.Key(x.Name)).ToArray();
            if (await db.Subjects.CountAsync(x => subjectNames.Contains(x.NormalizedName)) != DemoSubjects.Length)
                return false;

            // Databases seeded before topics carried Arabic names would otherwise keep showing
            // English topic names in the Arabic UI, since the fast path skips the repair pass.
            var topicNames = DemoSubjects.SelectMany(x => x.Topics)
                .Select(x => CatalogNameNormalizer.Key(x.Name)).ToArray();
            if (await db.Topics.AnyAsync(x => topicNames.Contains(x.NormalizedName) && x.NameAr == ""))
                return false;
        }

        return true;
    }

    /// <summary>
    /// Creates/repairs the canonical demo accounts (one per role) with the environment's seed password. Defensive
    /// guard: never creates accounts in Production or an unknown environment, whatever the caller did.
    /// </summary>
    internal static async Task SeedDemoAccountsAsync(
        IHostEnvironment? environment,
        string? password,
        UserManager<ApplicationUser> users,
        ILogger logger)
    {
        if (!environment.AllowsDemoData())
            return;

        if (string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException(
                "Demo accounts need SeedUsers:Password. Set it via User Secrets (Development) or the " +
                "SeedUsers__Password environment variable / server-owned host settings (Staging, PreProduction).");

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
                    FullNameEnglish = account.FullNameEnglish,
                    EmailConfirmed = true
                };
                // Standard UserManager.CreateAsync(user, password): runs full Identity password
                // validation and hashing, never a pre-hashed shortcut.
                var created = await users.CreateAsync(user, password);
                if (!created.Succeeded)
                    throw new InvalidOperationException(
                        $"Demo user '{account.Email}' could not be created: "
                        + string.Join("; ", created.Errors.Select(x => x.Description)));
                logger.LogInformation("Demo user seeding: created {Email}.", account.Email);
            }
            else
            {
                if (!user.EmailConfirmed)
                {
                    user.EmailConfirmed = true;
                    var confirmed = await users.UpdateAsync(user);
                    if (!confirmed.Succeeded)
                        throw new InvalidOperationException(
                            $"Demo user '{account.Email}' email confirmation could not be repaired.");
                    logger.LogInformation(
                        "Demo user seeding: repaired email confirmation for {Email}.", account.Email);
                }
                else
                {
                    logger.LogInformation("Demo user seeding: {Email} already exists.", account.Email);
                }

                // Never reset an existing account's password; just report a mismatch so a developer
                // can tell why login fails, without ever logging either password.
                if (!await users.CheckPasswordAsync(user, password))
                    logger.LogWarning(
                        "Demo user seeding: {Email} exists but does not accept the " +
                        "configured seed password; its stored password was left unchanged.",
                        account.Email);
            }

            if (!await users.IsInRoleAsync(user, account.Role))
            {
                var assigned = await users.AddToRoleAsync(user, account.Role);
                if (!assigned.Succeeded)
                    throw new InvalidOperationException(
                        $"Demo user '{account.Email}' could not be assigned to role '{account.Role}'.");
                // Only log this as a "repair" when the account already existed; a brand-new account
                // getting its one canonical role is expected, not drift.
                if (wasExisting)
                    logger.LogInformation(
                        "Demo user seeding: repaired role for {Email} -> {Role}.", account.Email, account.Role);
            }
        }

        logger.LogInformation("Demo user seeding completed ({Count} accounts).", DemoUserAccounts.Length);
    }

    /// <summary>
    /// Creates/repairs the baseline catalog every non-production environment shares: subjects, topics,
    /// qualification topics and education levels (plus sample landing promotions in Development only). Defensive guard mirrors
    /// <see cref="SeedDemoAccountsAsync"/>: never trusts the caller's gating.
    /// </summary>
    internal static async Task SeedDemoCatalogAsync(
        IHostEnvironment? environment,
        TafseelDbContext db,
        ILogger logger)
    {
        if (!environment.AllowsDemoData())
            return;

        foreach (var subjectSeed in DemoSubjects)
        {
            var subjectKey = CatalogNameNormalizer.Key(subjectSeed.Name);
            var subject = await db.Subjects.FirstOrDefaultAsync(x => x.NormalizedName == subjectKey);
            if (subject is null)
            {
                subject = new Subject(subjectSeed.Name, subjectSeed.Icon, subjectSeed.NameAr, subjectSeed.DisplayOrder);
                db.Add(subject);
                logger.LogInformation("Demo catalog seeding: created subject {Subject}.", subjectSeed.Name);
            }

            foreach (var topicSeed in subjectSeed.Topics)
            {
                var topicKey = CatalogNameNormalizer.Key(topicSeed.Name);
                var topic = await db.Topics
                    .FirstOrDefaultAsync(x => x.SubjectId == subject.Id && x.NormalizedName == topicKey);
                if (topic is null)
                {
                    db.Add(new Tafseel.Domain.Catalog.Topic(
                        subject.Id, topicSeed.Name, topicSeed.Difficulty, topicSeed.NameAr));
                    logger.LogInformation(
                        "Demo catalog seeding: created topic {Topic} under {Subject}.",
                        topicSeed.Name, subjectSeed.Name);
                }
                else if (string.IsNullOrWhiteSpace(topic.NameAr))
                {
                    // Topics seeded before Arabic names existed would otherwise stay English in the Arabic UI.
                    topic.Update(topic.Name, topic.Difficulty, topicSeed.NameAr);
                    logger.LogInformation(
                        "Demo catalog seeding: added Arabic name for topic {Topic}.", topicSeed.Name);
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
                    "Demo catalog seeding: created qualification topic {Topic} under {Subject}.",
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
            logger.LogInformation("Demo catalog seeding: created education level {Level}.", levelSeed.Name);
        }

        // Sample promotions are Development placeholders, not baseline: a published promotion opens a modal on the
        // landing page, which would stand between a PreProduction tester and the "Upload your file" action.
        if (environment.IsDevelopment() && !await db.Promotions.AnyAsync())
        {
            var now = DateTimeOffset.UtcNow;
            foreach (var promotionSeed in DemoPromotions)
            {
                var promotion = new Promotion(
                    promotionSeed.Kind, promotionSeed.TitleEn, promotionSeed.TitleAr, now);
                promotion.Configure(
                    promotionSeed.Kind, promotionSeed.TitleEn, promotionSeed.TitleAr,
                    promotionSeed.EyebrowEn, promotionSeed.EyebrowAr,
                    promotionSeed.BodyEn, promotionSeed.BodyAr,
                    promotionSeed.HighlightEn, promotionSeed.HighlightAr,
                    promotionSeed.CouponCode,
                    promotionSeed.CtaLabelEn, promotionSeed.CtaLabelAr, promotionSeed.CtaHref,
                    accent: null, startsAt: null,
                    endsAt: promotionSeed.EndsInDays is { } days ? now.AddDays(days) : null,
                    promotionSeed.DisplayOrder, now);
                db.Add(promotion);
            }
            logger.LogInformation(
                "Demo catalog seeding: created {Count} landing promotions.", DemoPromotions.Length);
        }

        await db.SaveChangesAsync();
        logger.LogInformation(
            "Demo catalog seeding completed ({Subjects} subjects).", DemoSubjects.Length);
    }

    private static bool ValidJaasStaticJwt(string token) =>
        !string.IsNullOrWhiteSpace(token) && token.Split('.').Length == 3;

    private static bool ValidFrontendUrl(string value, bool requireHttps) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && uri.UserInfo.Length == 0
        && (!requireHttps || uri.Scheme == Uri.UriSchemeHttps)
        && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp);
}
