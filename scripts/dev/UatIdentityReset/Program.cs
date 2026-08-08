using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Tafseel.Infrastructure;
using Tafseel.Infrastructure.Identity;

var email = args.ElementAtOrDefault(0) ?? throw new InvalidOperationException("email required");
var password = Environment.GetEnvironmentVariable("TAFSEEL_UAT_SESSION_PASSWORD")
    ?? Environment.GetEnvironmentVariable("TAFSEEL_UAT_STUDENT_PASSWORD")
    ?? throw new InvalidOperationException("password env required");

static string FindRepoRoot()
{
    foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
    {
        var dir = new DirectoryInfo(start);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Tafseel.sln")))
            dir = dir.Parent;
        if (dir is not null) return dir.FullName;
    }
    throw new InvalidOperationException("repo root not found");
}

var repo = FindRepoRoot();
Directory.SetCurrentDirectory(repo);

var host = Host.CreateDefaultBuilder(args)
    .UseContentRoot(repo)
    .ConfigureAppConfiguration((_, config) =>
    {
        config.AddJsonFile(Path.Combine(repo, "src", "Tafseel.Api", "appsettings.json"), false);
        config.AddJsonFile(Path.Combine(repo, "src", "Tafseel.Api", "appsettings.Development.json"), true);
        config.AddEnvironmentVariables();
        config.AddUserSecrets("eab50fee-08f8-468d-97bd-1ea59632a82d", true);
    })
    .ConfigureServices((ctx, services) =>
    {
        services.AddSignalR();
        services.AddInfrastructure(ctx.Configuration, ctx.HostingEnvironment);
    })
    .UseEnvironment("Development")
    .Build();

using var scope = host.Services.CreateScope();
var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
var user = await users.FindByEmailAsync(email) ?? throw new InvalidOperationException("user not found");
await users.SetLockoutEndDateAsync(user, null);
await users.ResetAccessFailedCountAsync(user);
var token = await users.GeneratePasswordResetTokenAsync(user);
var reset = await users.ResetPasswordAsync(user, token, password);
Console.WriteLine(reset.Succeeded
    ? $"identity-reset-ok {email}"
    : $"identity-reset-fail {string.Join("; ", reset.Errors.Select(x => x.Description))}");
Environment.Exit(reset.Succeeded ? 0 : 1);
