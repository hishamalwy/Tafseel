using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Tafseel.Application.Authorization;
using Tafseel.Domain.Catalog;
using Tafseel.Domain.Marketplace;
using Tafseel.Domain.TeacherApplications;
using Tafseel.Infrastructure;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Persistence;

// Seeds the people and catalog a browser journey needs on a throwaway database that a running
// Development host has already migrated, and prints what it created as JSON.
//   default (Wave 2): a student, two published teachers qualified in one subject, each with an
//                     asynchronous service.
//   TAFSEEL_E2E_SCENARIO=supply (Wave 3A): a quality reviewer and catalog data only.
//   TAFSEEL_E2E_SCENARIO=fulfilment (Wave 3B): two published teachers and an unrelated student.
//
//   ConnectionStrings__Tafseel=...;Database=TafseelE2E...   TAFSEEL_E2E_PASSWORD=...   dotnet run
var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Tafseel")
    ?? throw new InvalidOperationException("Set ConnectionStrings__Tafseel to the throwaway database.");
var database = new SqlConnectionStringBuilder(connection).InitialCatalog;
if (!database.StartsWith("TafseelE2E", StringComparison.OrdinalIgnoreCase))
    throw new InvalidOperationException($"Refusing to seed '{database}': only TafseelE2E* databases.");
var password = Environment.GetEnvironmentVariable("TAFSEEL_E2E_PASSWORD")
    ?? throw new InvalidOperationException("Set TAFSEEL_E2E_PASSWORD.");

var host = Host.CreateDefaultBuilder(args)
    .UseEnvironment("Development")
    .ConfigureAppConfiguration((_, config) =>
    {
        config.Sources.Clear();
        config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:SigningKey"] = "e2e-seed-only-signing-key-never-used-for-tokens-32",
            ["Payments:WebhookSecret"] = "e2e-seed-only-webhook-secret-never-used-32chars",
            ["Resend:ApiToken"] = "e2e-seed-only"
        });
        config.AddJsonFile(Path.Combine(RepoRoot(), "src", "Tafseel.Api", "appsettings.json"), optional: false);
        config.AddJsonFile(Path.Combine(RepoRoot(), "src", "Tafseel.Api", "appsettings.Development.json"), optional: true);
        config.AddEnvironmentVariables();
    })
    .ConfigureServices((context, services) =>
    {
        services.AddSignalR();
        services.AddInfrastructure(context.Configuration, context.HostingEnvironment);
    })
    .Build();

await using var scope = host.Services.CreateAsyncScope();
var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
var db = scope.ServiceProvider.GetRequiredService<TafseelDbContext>();
var now = DateTimeOffset.UtcNow;
var run = Guid.NewGuid().ToString("N")[..8];

async Task<(string Id, string Email)> UserAsync(string role, string handle, string name, string englishName)
{
    var email = $"e2e-{handle}-{run}@example.test";
    var user = new ApplicationUser { UserName = email, Email = email, FullName = name, FullNameEnglish = englishName, EmailConfirmed = true };
    var created = await users.CreateAsync(user, password);
    if (!created.Succeeded) throw new InvalidOperationException(string.Join("; ", created.Errors.Select(e => e.Description)));
    await users.AddToRoleAsync(user, role);
    return (user.Id, email);
}

if (Environment.GetEnvironmentVariable("TAFSEEL_E2E_SCENARIO") == "supply")
{
    // Wave 3A: only who and what the supply journey needs to exist beforehand - a quality
    // reviewer, two subjects with a qualification topic each (the second is applied for and rejected),
    // and the service types a teacher can pick. The teacher, the application, the review, the
    // qualification, the profile, services, availability and publication all happen in the UI.
    var reviewer = await UserAsync(Roles.QualityReviewer, "reviewer", "مراجع الجودة", "E2E Quality Reviewer");
    var physics = new Subject($"E2E Physics {run}", "atom", $"فيزياء تجريبية {run}");
    var chemistry = new Subject($"E2E Chemistry {run}", "flask", $"كيمياء تجريبية {run}");
    var assignment = new QualificationTopic(physics.Id, $"Newton's second law {run}",
        "Record a short explanation of F = ma with one worked example.", 300);
    var chemistryAssignment = new QualificationTopic(chemistry.Id, $"Balancing equations {run}",
        "Record a short explanation of balancing a chemical equation.", 300);
    var topic = new Topic(physics.Id, $"Mechanics {run}", "intermediate", $"الميكانيكا {run}");
    var explanation = new ServiceCatalogItem($"E2E Worked explanation {run}", "A recorded explanation of the student's question.",
        $"e2e_explain_{run}", "شرح مسجّل تجريبي", "شرح مسجّل لسؤال الطالب", minPrice: 20, maxPrice: 500);
    var live = new ServiceCatalogItem($"E2E Live lesson {run}", "A live one-to-one lesson.",
        $"e2e_live_{run}", "درس مباشر تجريبي", "درس مباشر فردي", requiresScheduling: true, allowedDurations: [60],
        minPrice: 50, maxPrice: 800);
    db.AddRange(physics, chemistry, assignment, chemistryAssignment, topic, explanation, live);
    var languages = db.TeachingLanguages.Count();
    if (languages == 0) db.AddRange(new TeachingLanguage("Arabic", "ar"), new TeachingLanguage("English", "en"));
    await db.SaveChangesAsync();
    Console.WriteLine(JsonSerializer.Serialize(new
    {
        run,
        reviewer = new { reviewer.Id, reviewer.Email },
        subjectId = physics.Id, subjectName = physics.Name,
        unqualifiedSubjectId = chemistry.Id, unqualifiedSubjectName = chemistry.Name,
        qualificationTopicId = assignment.Id,
        explanation = new { explanation.Id, explanation.Code },
        live = new { live.Id, live.Code }
    }));
    return;
}

if (Environment.GetEnvironmentVariable("TAFSEEL_E2E_SCENARIO") == "fulfilment")
{
    // Wave 3B: the supply the demand journeys buy from, already published - the 3A journey proves
    // that path through the UI, so here it is a prerequisite, not the thing under test. Two teachers
    // qualified in one subject, each with the canonical recorded-explanation and live-session
    // services and open availability every day, plus one unrelated student used only to prove
    // refusals. The buying student registers in the UI; no request, offer, order, payment,
    // booking, delivery, message or review exists before the journeys create it.
    var recorded = db.ServiceCatalogItems.Single(x => x.Code == "recorded_explanation");
    var liveType = db.ServiceCatalogItems.Single(x => x.Code == "live_session");
    var maths = new Subject($"E2E Calculus {run}", "book", $"تفاضل وتكامل تجريبي {run}");
    db.Add(maths);
    var outsider = await UserAsync(Roles.Student, "outsider", "طالب آخر", "E2E Unrelated Student");
    // A reviewer and an admin so a journey can read their navigation. They own no data here; nothing in
    // the fulfilment journeys depends on them, and they exercise no capability of their own.
    var reviewer = await UserAsync(Roles.QualityReviewer, "reviewer", "مراجع الجودة", "E2E Quality Reviewer");
    var administrator = await UserAsync(Roles.Admin, "admin", "مشرف تفصيل", "E2E Admin");
    var teachers = new List<object>();
    foreach (var (handle, name, englishName, headline, price) in new[]
    {
        ("teacher-a", "معلمة التفاضل", "Calculus Teacher A", "Patient calculus explanations", 100m),
        ("teacher-b", "معلم التفاضل", "Calculus Teacher B", "Fast calculus explanations", 120m)
    })
    {
        var teacher = await UserAsync(Roles.Teacher, handle, name, englishName);
        var profile = new TeacherProfile(teacher.Id, now);
        profile.Update(headline, "Qualified calculus teacher for the Tafseel fulfilment journeys.", "Saudi Arabia", "Riyadh",
            "UTC", 15, now);
        profile.Publish(TeacherProfileReadiness.Ready, now);
        var explanation = new TeacherService(teacher.Id, maths.Id, recorded.Id, $"Worked calculus explanation {handle}",
            "A recorded walk-through of your exact exercise.", price, "SAR", 48, 2, now);
        var session = new TeacherService(teacher.Id, maths.Id, liveType.Id, $"Live calculus session {handle}",
            "A one-to-one live session on the part you are stuck on.", 120, "SAR", 24, 0, now);
        db.AddRange(profile, explanation, session, new TeacherSubjectQualification(teacher.Id, maths.Id, now));
        foreach (var day in Enum.GetValues<DayOfWeek>())
            db.Add(new TeacherAvailabilityRule(teacher.Id, day, new TimeOnly(0, 0), new TimeOnly(23, 30), "UTC", 30));
        teachers.Add(new { teacher.Id, teacher.Email, explanationServiceId = explanation.Id, liveServiceId = session.Id });
    }
    await db.SaveChangesAsync();
    Console.WriteLine(JsonSerializer.Serialize(new
    {
        run,
        outsider = new { outsider.Id, outsider.Email },
        reviewer = new { reviewer.Id, reviewer.Email },
        admin = new { administrator.Id, administrator.Email },
        teacherA = teachers[0],
        teacherB = teachers[1],
        subjectId = maths.Id, subjectName = maths.Name,
        recordedCatalogId = recorded.Id,
        liveCatalogId = liveType.Id
    }));
    return;
}

var student = await UserAsync(Roles.Student, "student", "طالب التجربة", "E2E Student");
var teacherA = await UserAsync(Roles.Teacher, "teacher-a", "معلمة الرياضيات", "Maths Teacher A");
var teacherB = await UserAsync(Roles.Teacher, "teacher-b", "معلم الرياضيات", "Maths Teacher B");

var subject = new Subject($"E2E Mathematics {run}", "book", $"رياضيات تجريبية {run}");
var catalog = new ServiceCatalogItem($"E2E Explanation {run}", "Asynchronous explanation", $"e2e_{run}", "شرح تجريبي", "شرح غير متزامن");
db.AddRange(subject, catalog,
    new TeacherSubjectQualification(teacherA.Id, subject.Id, now),
    new TeacherSubjectQualification(teacherB.Id, subject.Id, now));
foreach (var (teacher, headline) in new[] { (teacherA, "Patient maths explanations"), (teacherB, "Fast maths explanations") })
{
    var profile = new TeacherProfile(teacher.Id, now);
    profile.Update(headline, "Qualified teacher seeded for the Tafseel browser journeys.", "Saudi Arabia", "Riyadh",
        "Arab Standard Time", 15, now);
    profile.Publish(TeacherProfileReadiness.Ready, now);
    db.Add(profile);
}
var serviceA = new TeacherService(teacherA.Id, subject.Id, catalog.Id, "Explanation A", "Worked explanations of your files.", 100, "SAR", 48, 2, now);
var serviceB = new TeacherService(teacherB.Id, subject.Id, catalog.Id, "Explanation B", "Quick explanations of your files.", 120, "SAR", 24, 1, now);
db.AddRange(serviceA, serviceB);
await db.SaveChangesAsync();

Console.WriteLine(JsonSerializer.Serialize(new
{
    student = new { student.Id, student.Email },
    teacherA = new { teacherA.Id, teacherA.Email, serviceId = serviceA.Id },
    teacherB = new { teacherB.Id, teacherB.Email, serviceId = serviceB.Id },
    subjectId = subject.Id,
    catalogId = catalog.Id
}));

static string RepoRoot()
{
    for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        if (File.Exists(Path.Combine(dir.FullName, "Tafseel.sln"))) return dir.FullName;
    throw new InvalidOperationException("Could not find Tafseel.sln.");
}
