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
// Development host has already migrated: a student, two published teachers qualified in one
// subject, each with an asynchronous service. Prints what it created as JSON.
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
