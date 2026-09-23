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

    // Shared by Staging demo-user seeding and opt-in Development demo-user seeding (ADR-012):
    // both paths seed the same canonical accounts/roles, only the password source differs.
    private static readonly (string Role, string Email, string FullName, string FullNameEnglish)[] DemoUserAccounts =
    [
        (Roles.Admin, "admin@gmail.com", "Tafseel Admin", "Tafseel Admin"),
        (Roles.Student, "student@gmail.com", "Tafseel Student", "Tafseel Student"),
        (Roles.Teacher, "teacher@gmail.com", "معلم تفصيل", "Tafseel Teacher"),
        (Roles.QualityReviewer, "quality@gmail.com", "Tafseel Quality Reviewer", "Tafseel Quality Reviewer")
    ];

    // Opt-in Development-only demo catalog content (ADR-013). Real production subjects/topics are
    // business content decided separately; this is placeholder content so a fresh Development
    // database has something to browse. QualificationTopic max duration mirrors the 3-minute
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
                    && TimeSpan.FromDays(options.RefreshTokenDays) > TimeSpan.FromMinutes(options.AccessTokenMinutes),
                "JWT access lifetime must be 1-60 minutes and refresh lifetime 1-90 days and longer than access lifetime.")
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
        services.AddScoped<ITeacherBusinessService, TeacherBusinessService>();
        services.AddScoped<IMarketplaceIntelligenceService, MarketplaceIntelligenceService>();
        services.AddScoped<IOrderService, OrderService>();
        services.AddScoped<IOpenMarketplaceService, OpenMarketplaceService>();
        services.AddScoped<OpenMarketplaceReservationExpiryService>();
        services.AddOptions<OpenMarketplaceOptions>().Bind(configuration.GetSection(OpenMarketplaceOptions.SectionName))
            .Validate(x => x.OfferReservationMinutes is >= 15 and <= 1440, "Offer reservation must be 15-1440 minutes.")
            .ValidateOnStart();
        services.AddHostedService<OpenMarketplaceReservationWorker>();
        services.AddHostedService<OrderAutoReleaseWorker>();
        services.AddHostedService<LiveSessionSettlementWorker>();
        // Registered as itself as well so the maturity pass can be driven deterministically
        // (tests, and any future operational trigger) instead of only by the timer.
        services.AddSingleton<EarningsMaturityWorker>();
        services.AddHostedService(sp => sp.GetRequiredService<EarningsMaturityWorker>());
        services.AddScoped<ILiveSessionService, LiveSessionService>();
        services.AddScoped<IFinancialService, FinancialService>();
        services.AddScoped<ICouponService, CouponService>();
        services.AddScoped<IPromotionService, PromotionService>();
        services.AddScoped<IPlatformStatsService, PlatformStatsService>();
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
        services.AddHostedService<DisputeSlaWorker>();
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
        services.AddOptions<WithdrawalOptions>()
            .Bind(configuration.GetSection(WithdrawalOptions.SectionName))
            .Validate(x => x.MinimumAmount > 0 && x.Currency.Length == 3
                && x.ExpectedSettlementBusinessDays is >= 1 and <= 30
                && x.MaturityBatchSize is >= 1 and <= 500,
                "Withdrawal minimum, currency, settlement window, or maturity batch size are invalid.")
            .ValidateOnStart();
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
            .Validate(x => !x.AutoReleaseEnabled || x.AutoReleaseAfterHours is >= 24 and <= 720,
                "Payments:AutoReleaseAfterHours must be between 24 and 720 when automatic release is enabled.")
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
                    || (x.Mock.DefaultReturnPath.StartsWith('/')
                        && !x.Mock.DefaultReturnPath.StartsWith("//", StringComparison.Ordinal)
                        && !x.Mock.DefaultReturnPath.Contains("://", StringComparison.Ordinal)),
                "Payments:Mock:DefaultReturnPath must be a site-relative path such as /student/overview.")
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
        // Before the seed-is-current guard below, which returns early on every database that already
        // has its roles and services - which is every database that needs this correction (DEC-01).
        await ApplyCanonicalServicePolicyAsync(db);

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

            // After the services exist, so a database created in this same run gets the decided policy
            // rather than the domain's unset-price fallback (DEC-01).
            await ApplyCanonicalServicePolicyAsync(db);

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
                            FullNameEnglish = account.FullNameEnglish,
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
                await SeedDevelopmentAdditionalReviewerAsync(environment, seedUsersOptions, users, logger);
            }

            if (demoCatalogSeedEnabled)
                await SeedDevelopmentDemoCatalogAsync(environment, seedDemoDataOptions, db, logger);

            await transaction.CommitAsync();
        });
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

        if (developmentSeedEnabled)
        {
            (string Email, string Role)[] additionalAccounts =
            [
                ("qa.reviewer.sprint02@example.com", Roles.QualityReviewer),
                ("qa.admin.sprint02@example.com", Roles.Admin)
            ];
            foreach (var account in additionalAccounts)
            {
                var assigned = await (
                    from user in db.Users
                    join userRole in db.UserRoles on user.Id equals userRole.UserId
                    join role in db.Roles on userRole.RoleId equals role.Id
                    where user.Email == account.Email && user.EmailConfirmed && role.Name == account.Role
                    select user.Id)
                    .AnyAsync();
                if (!assigned)
                    return false;
            }
        }

        // Heuristic only (subject presence, not topics/qualification-topics/education-levels): if it
        // under-detects staleness, SeedDevelopmentDemoCatalogAsync still repairs idempotently on the
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
                    FullNameEnglish = account.FullNameEnglish,
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
    /// Phase 4 Sprint 0.2: creates a small number of additional, clearly-labeled Development-only UAT
    /// accounts for privileged roles (QualityReviewer, Admin), separate from the canonical
    /// <see cref="DemoUserAccounts"/> list. Exists because the canonical `quality@gmail.com` /
    /// `admin@gmail.com` accounts already have an unknown password in this environment, and this
    /// sprint's rules forbid resetting an existing account's password merely for convenience.
    /// Shares the exact same safety properties as <see cref="SeedDevelopmentDemoUsersAsync"/>: gated
    /// on Development + SeedUsers:Enabled (re-checked here, not trusting the caller), idempotent,
    /// never resets a password on an account that already exists, no Staging/Production effect.
    /// </summary>
    private static async Task SeedDevelopmentAdditionalReviewerAsync(
        IHostEnvironment? environment,
        SeedUsersOptions? seedOptions,
        UserManager<ApplicationUser> users,
        ILogger logger)
    {
        if (environment?.IsDevelopment() != true || seedOptions?.Enabled != true)
            return;

        if (string.IsNullOrWhiteSpace(seedOptions.Password))
            return; // SeedDevelopmentDemoUsersAsync already throws a clear error for this case.

        (string Email, string FullName, string Role)[] accounts =
        [
            ("qa.reviewer.sprint02@example.com", "Sprint 0.2 UAT Reviewer", Roles.QualityReviewer),
            ("qa.admin.sprint02@example.com", "Sprint 0.2 UAT Admin", Roles.Admin)
        ];

        foreach (var account in accounts)
        {
            var user = await users.FindByEmailAsync(account.Email);
            if (user is null)
            {
                user = new ApplicationUser
                {
                    UserName = account.Email,
                    Email = account.Email,
                    FullName = account.FullName,
                    FullNameEnglish = account.FullName,
                    EmailConfirmed = true
                };
                var created = await users.CreateAsync(user, seedOptions.Password);
                if (!created.Succeeded)
                    throw new InvalidOperationException(
                        $"Development additional-reviewer UAT user '{account.Email}' could not be created: "
                        + string.Join("; ", created.Errors.Select(x => x.Description)));
                logger.LogInformation("Development additional-reviewer UAT seeding: created {Email}.", account.Email);
            }
            else if (!user.EmailConfirmed)
            {
                user.EmailConfirmed = true;
                await users.UpdateAsync(user);
            }

            if (!await users.IsInRoleAsync(user, account.Role))
            {
                var assigned = await users.AddToRoleAsync(user, account.Role);
                if (!assigned.Succeeded)
                    throw new InvalidOperationException(
                        $"Development additional-reviewer UAT user '{account.Email}' could not be assigned to '{account.Role}'.");
            }
        }
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
                var topic = await db.Topics
                    .FirstOrDefaultAsync(x => x.SubjectId == subject.Id && x.NormalizedName == topicKey);
                if (topic is null)
                {
                    db.Add(new Tafseel.Domain.Catalog.Topic(
                        subject.Id, topicSeed.Name, topicSeed.Difficulty, topicSeed.NameAr));
                    logger.LogInformation(
                        "Development demo catalog seeding: created topic {Topic} under {Subject}.",
                        topicSeed.Name, subjectSeed.Name);
                }
                else if (string.IsNullOrWhiteSpace(topic.NameAr))
                {
                    // Topics seeded before Arabic names existed would otherwise stay English in the Arabic UI.
                    topic.Update(topic.Name, topic.Difficulty, topicSeed.NameAr);
                    logger.LogInformation(
                        "Development demo catalog seeding: added Arabic name for topic {Topic}.", topicSeed.Name);
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

        if (!await db.Promotions.AnyAsync())
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
                "Development demo catalog seeding: created {Count} landing promotions.", DemoPromotions.Length);
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
