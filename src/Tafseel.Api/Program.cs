using System.Security.Claims;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Text;
using System.IO.Compression;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Primitives;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using Tafseel.Api.Middleware;
using Tafseel.Application.Authorization;
using Tafseel.Infrastructure;
using Tafseel.Infrastructure.Identity;
using Tafseel.Infrastructure.Messaging;
using Tafseel.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);
// The server-owned Host JSON is the Staging baseline. Environment variables remain
// higher priority for emergency per-setting overrides, following normal .NET precedence.
builder.Configuration.AddJsonFile(
    $"appsettings.{builder.Environment.EnvironmentName}.Host.json",
    optional: true,
    reloadOnChange: false);
var configurationSources = builder.Configuration.Sources;
var hostJsonSource = configurationSources[^1];
configurationSources.RemoveAt(configurationSources.Count - 1);
var environmentSourceIndex = -1;
for (var i = 0; i < configurationSources.Count; i++)
{
    if (configurationSources[i] is Microsoft.Extensions.Configuration.EnvironmentVariables
        .EnvironmentVariablesConfigurationSource)
        environmentSourceIndex = i;
}
if (environmentSourceIndex >= 0)
    configurationSources.Insert(environmentSourceIndex, hostJsonSource);
else
    configurationSources.Add(hostJsonSource);

if (builder.Environment.IsProduction()
    && builder.Configuration.GetValue<bool>("Security:AllowInsecureRefreshCookie"))
    throw new InvalidOperationException("Production cannot allow insecure refresh cookies.");

builder.Host.UseSerilog((context, configuration) =>
    configuration.ReadFrom.Configuration(context.Configuration).WriteTo.Console());

builder.Services.AddInfrastructure(builder.Configuration, builder.Environment);
// One-shot operator commands (docs/ENVIRONMENTS.md); each exits before the site starts.
var command = args.FirstOrDefault(a => a is "provision" or "seed" or "reset-database");
if (command is "seed" or "reset-database")
{
    // The seed lives its Finance scenario through the real services on a clock it can move.
    builder.Services.AddSingleton<Tafseel.Infrastructure.Seeding.SeedClock>();
    builder.Services.AddSingleton<TimeProvider>(sp => sp.GetRequiredService<Tafseel.Infrastructure.Seeding.SeedClock>());
}
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
});
builder.Services.Configure<BrotliCompressionProviderOptions>(options =>
    options.Level = CompressionLevel.Fastest);
builder.Services.Configure<GzipCompressionProviderOptions>(options =>
    options.Level = CompressionLevel.Fastest);
builder.Services.AddHttpsRedirection(options =>
{
    options.RedirectStatusCode = StatusCodes.Status308PermanentRedirect;
    options.HttpsPort = 443;
});
builder.Services.AddHsts(options =>
{
    options.MaxAge = TimeSpan.FromDays(180);
    options.IncludeSubDomains = false;
    options.Preload = false;
});

var applicationInsightsConnection =
    builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]
    ?? builder.Configuration["ApplicationInsights:ConnectionString"];
if (!string.IsNullOrWhiteSpace(applicationInsightsConnection))
{
    builder.Services.AddApplicationInsightsTelemetry(options =>
    {
        options.ConnectionString = applicationInsightsConnection;
        options.EnableAdaptiveSampling = true;
    });
}

builder.Services.AddControllers().ConfigureApiBehaviorOptions(options =>
    options.InvalidModelStateResponseFactory = context =>
    {
        var problem = ApiProblem.Create(
            context.HttpContext,
            StatusCodes.Status400BadRequest,
            "validation_failed",
            "One or more validation errors occurred.");
        problem.Extensions["errors"] = context.ModelState
            .Where(entry => entry.Value?.Errors.Count > 0)
            .ToDictionary(
                entry => entry.Key,
                entry => entry.Value!.Errors
                    .Select(error => string.IsNullOrWhiteSpace(error.ErrorMessage)
                        ? "The supplied value is invalid."
                        : error.ErrorMessage)
                    .ToArray());
        return new BadRequestObjectResult(problem);
    });
builder.Services.AddProblemDetails(options =>
    options.CustomizeProblemDetails = context =>
    {
        context.ProblemDetails.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
        if (context.HttpContext.Items[CorrelationIdMiddleware.HeaderName] is string correlationId)
            context.ProblemDetails.Extensions["correlationId"] = correlationId;
    });
builder.Services.AddExceptionHandler<ApiExceptionHandler>();

var jwt = builder.Configuration.GetRequiredSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? throw new InvalidOperationException("JWT configuration is missing.");
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = signingKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = "name",
            RoleClaimType = ClaimTypes.Role
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var token = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token)
                    && context.HttpContext.Request.Path.StartsWithSegments("/hubs/messages"))
                    context.Token = token;
                return Task.CompletedTask;
            },
            OnTokenValidated = async context =>
            {
                var userId = context.Principal?.FindFirstValue("sub");
                var stamp = context.Principal?.FindFirstValue("security_stamp");
                var users = context.HttpContext.RequestServices.GetRequiredService<UserManager<ApplicationUser>>();
                var user = userId is null ? null : await users.FindByIdAsync(userId);
                if (user is null || user.IsSuspended || !string.Equals(user.SecurityStamp, stamp, StringComparison.Ordinal))
                    context.Fail("Token is no longer valid.");
            },
            OnChallenge = context =>
            {
                context.HandleResponse();
                return ApiProblem.WriteAsync(
                    context.HttpContext, 401, "invalid_credentials", "Authentication failed");
            },
            OnForbidden = context =>
                ApiProblem.WriteAsync(
                    context.HttpContext, 403, "forbidden", "Access forbidden")
        };
    });

builder.Services.AddAuthorization(options =>
{
    foreach (var permission in Permissions.All)
        options.AddPolicy(permission, policy =>
        {
            policy.RequireClaim(Permissions.ClaimType, permission);
            if (permission == Permissions.TeachersApply)
                policy.RequireRole(Roles.Teacher);
        });
});

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
    {
        var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
    }));

builder.Services.AddRateLimiter(options =>
{
    var authPermitLimit = builder.Environment.IsEnvironment("Testing") ? 100 : 10;
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.User.FindFirstValue("sub")
                ?? context.Connection.RemoteIpAddress?.ToString()
                ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                // Visual QA / Playwright matrices burn through public discovery calls quickly in local Development.
                PermitLimit = builder.Environment.IsEnvironment("Testing")
                    ? 10000
                    : builder.Environment.IsDevelopment() ? 5000 : 300,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = authPermitLimit,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
    // Refresh has its own policy (G-19); it must never share the sign-in budget.
    RefreshRateLimit.Add(options);
    options.OnRejected = (rejected, _) =>
    {
        RefreshRateLimit.OnRejected(rejected, rejected.HttpContext.RequestServices
            .GetRequiredService<ILoggerFactory>().CreateLogger("Tafseel.Auth.RateLimit"));
        return ValueTask.CompletedTask;
    };
    options.AddPolicy("upload", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromHours(1),
            QueueLimit = 0
        }));
    options.AddPolicy("confirmation", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 3,
            Window = TimeSpan.FromMinutes(15),
            QueueLimit = 0
        }));
    options.AddPolicy("payment", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Environment.IsEnvironment("Testing") ? 100 : 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
    // Provider webhooks are authenticated by their signature, arrive in bursts when a provider retries, and come
    // from a few provider addresses; the per-student checkout budget above would refuse them.
    options.AddPolicy("webhook", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 300,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
    options.AddPolicy("messaging", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Environment.IsEnvironment("Testing") ? 100 : 30,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
    options.AddPolicy("ai", context =>
    {
        // Keep unauthenticated AI traffic isolated without retaining bearer tokens as limiter state.
        var authorization = context.Request.Headers.Authorization.ToString();
        var key = string.IsNullOrWhiteSpace(authorization)
            ? context.Connection.RemoteIpAddress?.ToString() ?? "unknown"
            : Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(authorization)));
        return RateLimitPartition.GetFixedWindowLimiter(
        key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Environment.IsEnvironment("Testing") ? 100 : 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        });
    });
});

builder.Services.AddHealthChecks()
    .AddDbContextCheck<TafseelDbContext>("database", tags: ["ready"])
    .AddCheck<Tafseel.Infrastructure.Files.FileStorageHealthCheck>("file-storage", tags: ["ready"])
    .AddCheck<Tafseel.Infrastructure.Files.MalwareScannerHealthCheck>("malware-scanner", tags: ["ready"])
    // Degraded (still 200) when a money or deadline worker has not succeeded for two intervals.
    .AddCheck<Tafseel.Infrastructure.Operations.WorkerHealthCheck>("background-workers", tags: ["ready"])
    // Degraded (still 200) when emails have failed or stalled, or a reconciliation case is open.
    .AddCheck<Tafseel.Infrastructure.Operations.OperationalBacklogHealthCheck>("operational-backlog", tags: ["ready"]);
builder.Services.AddSignalR();
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(options =>
    {
        options.SwaggerDoc("v1", new OpenApiInfo { Title = "Tafseel API", Version = "v1" });
        options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT"
        });
        options.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            [new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            }] = []
        });
    });
}

var app = builder.Build();

// Deploy-time provisioning (`dotnet Tafseel.Api.dll provision`), run after the migrations: roles, canonical
// services and languages, plus the first Admin named by Provisioning:BootstrapAdminEmail. It exits before
// the host starts, so it neither serves traffic nor needs the payment and meeting providers.
if (command == "provision")
{
    foreach (var line in await app.Services.ProvisionAsync(app.Configuration["Provisioning:BootstrapAdminEmail"]))
        Console.WriteLine(line);
    return;
}
// `seed`: the canonical, idempotent baseline + demo data for Development, Staging and PreProduction.
// `reset-database --confirm <database>`: empty that environment's own database, migrate, seed. Both refuse Production.
if (command is "seed" or "reset-database")
{
    var clock = app.Services.GetRequiredService<Tafseel.Infrastructure.Seeding.SeedClock>();
    var password = app.Configuration["SeedUsers:Password"];
    var confirmIndex = Array.IndexOf(args, "--confirm");
    var report = command == "seed"
        ? await Tafseel.Infrastructure.Seeding.EnvironmentSeed.RunAsync(app.Services, password, clock)
        : await Tafseel.Infrastructure.Seeding.DatabaseReset.ResetAsync(app.Services,
            confirmIndex >= 0 && confirmIndex + 1 < args.Length ? args[confirmIndex + 1] : null, password, clock);
    foreach (var line in report)
        Console.WriteLine(line);
    return;
}

// Production refuses to serve with a placeholder, local or demo value, and names every such setting at once.
Tafseel.Infrastructure.Operations.ProductionConfigurationGuard.EnsureReady(app.Configuration, app.Environment);

var enforceHttps = app.Environment.IsProduction()
    || app.Configuration.GetValue<bool>("Security:EnforceHttps");
var jaasEnabled = app.Configuration["LiveSessions:Provider"] == "JaaS";

// The client shell carries one inline script - the snippet that reads the saved
// theme and stamps it on <html> before first paint, which cannot be an external
// file without reintroducing the flash it exists to prevent. Allowing it by hash
// keeps script-src free of 'unsafe-inline', and reading the hash from the shipped
// file rather than hard-coding it means editing the snippet cannot silently
// break the page: whatever ships is what is allowed.
var inlineScriptHashes = string.Concat(
    ClientShellScriptHashes(Path.Combine(AppContext.BaseDirectory, "webclient"))
        .Select(hash => $" 'sha256-{hash}'"));

static IEnumerable<string> ClientShellScriptHashes(string webClientRoot)
{
    if (!Directory.Exists(webClientRoot)) return [];
    var hashes = new HashSet<string>(StringComparer.Ordinal);
    foreach (var shell in Directory.EnumerateFiles(webClientRoot, "*.html", SearchOption.AllDirectories))
    {
        foreach (Match match in InlineScript().Matches(File.ReadAllText(shell)))
        {
            // An empty body is a <script> that does nothing; hashing it would
            // publish the hash of the empty string for no reason.
            var body = match.Groups[1].Value;
            if (string.IsNullOrWhiteSpace(body)) continue;
            hashes.Add(Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(body))));
        }
    }
    return hashes;
}

app.UseResponseCompression();
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseSerilogRequestLogging();
app.UseExceptionHandler();
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers.XContentTypeOptions = "nosniff";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    headers.Append("X-Frame-Options", "DENY");
    // Browsers ignore COOP on untrustworthy origins (http://127.0.0.1). Keep it
    // on localhost and HTTPS so the header still protects those surfaces.
    var host = context.Request.Host.Host;
    if (context.Request.IsHttps
        || string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase))
        headers.Append("Cross-Origin-Opener-Policy", "same-origin");
    headers.Append("Cross-Origin-Resource-Policy", "same-origin");
    var jaasOrigin = jaasEnabled ? " https://8x8.vc" : "";
    headers.Append("Permissions-Policy", jaasEnabled
        ? "camera=(self \"https://8x8.vc\"), microphone=(self \"https://8x8.vc\"), " +
          "geolocation=(), payment=(), display-capture=(self \"https://8x8.vc\")"
        : "camera=(), microphone=(), geolocation=(), payment=(), display-capture=()");
    var transportPolicy = enforceHttps ? "; upgrade-insecure-requests" : "";
    headers.Append("Content-Security-Policy",
        $"default-src 'self'; script-src 'self'{inlineScriptHashes}{jaasOrigin}; " +
        "style-src 'self' 'unsafe-inline'; " +
        // The protected-file viewer fetches a delivery as a blob and shows it
        // from an object URL, so blob: has to be a legal source for the three
        // media kinds it renders and for the frame the PDF viewer uses. Framing
        // stays same-origin - frame-ancestors 'none' still denies everyone else.
        "font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; " +
        $"frame-src 'self' blob:{jaasOrigin}; connect-src 'self' wss:; " +
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" + transportPolicy);
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        headers.CacheControl = "no-store";
        headers.Pragma = "no-cache";
    }
    else if (!context.Response.Headers.ContainsKey("Cache-Control"))
    {
        // Sprint 0.4 made every static file revalidate, because none of the legacy
        // ones carried a content hash and a stale copy would survive a security fix.
        // The Angular build hashes its asset names, so those are safe to cache
        // immutably and are given that header where they are served; anything that
        // reaches here without one - the HTML shells above all - still revalidates.
        headers.CacheControl = "no-cache";
    }
    await next();
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (enforceHttps)
{
    app.UseHsts();
    app.UseHttpsRedirection();
}
app.UseCors();

// Serves the client's own files - hashed bundles, fonts, images - straight from
// disk. Their names change whenever their bytes do, so a year-long immutable
// cache is safe and is the whole point of the hashing; the HTML shells are not
// served here, they go through the fallback below and keep revalidating.
var webClientFiles = Path.Combine(AppContext.BaseDirectory, "webclient");
if (Directory.Exists(webClientFiles))
{
    // The stylesheet reaches its fonts and marks as `/assets/...`, because it is
    // also the design-lab's stylesheet and that is served from a domain root.
    // The built client puts a copy under every locale, so one of them answers
    // that path: the files are images and fonts, identical in both.
    app.UseStaticFiles(new StaticFileOptions
    {
        RequestPath = "/assets",
        FileProvider = new PhysicalFileProvider(Path.Combine(webClientFiles, "en", "assets")),
        OnPrepareResponse = ctx =>
            ctx.Context.Response.Headers.CacheControl = "public, max-age=604800"
    });

    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(webClientFiles),
        ServeUnknownFileTypes = false,
        OnPrepareResponse = ctx =>
        {
            var name = ctx.File.Name;
            var hashed = !name.EndsWith(".html", StringComparison.OrdinalIgnoreCase)
                && HashedAsset().IsMatch(name);
            ctx.Context.Response.Headers.CacheControl =
                hashed ? "public, max-age=31536000, immutable" : "no-cache";
        }
    });
}

app.UseAuthentication();
app.UseRateLimiter();
app.UseAuthorization();
app.MapControllers();
app.MapHub<MessagingHub>("/hubs/messages");

// ---- old addresses ---------------------------------------------------------
// The .dc.html site is gone; the Angular client below is the site. Its addresses
// live on in delivered emails, stored notifications and bookmarks, so each known
// page redirects to its Angular route in the reader's locale (LegacyLinks), and
// anything else under /app is a 404 - never the client shell, never a 500.
// /{locale}/app/... is the same address reached from inside the client, where a
// stored notification link resolves against the <base href>.
app.MapGet("/app/{**rest}", (HttpContext context, string? rest) =>
    LegacyRedirect(context, rest, PreferredLocale(context.Request.Headers.AcceptLanguage)));
app.MapGet("/{locale:regex(^(ar|en)$)}/app/{**rest}", (HttpContext context, string locale, string? rest) =>
    LegacyRedirect(context, rest, locale.ToLowerInvariant()));

// Emails already delivered load the logo from /app/assets/brand/. The client ships
// the same files, so they are answered from there rather than redirected: some
// mail clients do not follow redirects for images.
app.MapGet("/app/assets/brand/{file}", (string file) => BrandAsset(file));
app.MapGet("/favicon.ico", () => BrandAsset("favicon.ico"));

static IResult LegacyRedirect(HttpContext context, string? rest, string locale)
{
    var file = rest ?? "";
    if (file.Contains('/')) return Results.NotFound();
    var target = Tafseel.Api.Routing.LegacyLinks.Resolve(file, context.Request.Query);
    return target is null ? Results.NotFound() : Results.Redirect($"/{locale}{target}");
}

static IResult BrandAsset(string file)
{
    var name = Path.GetFileName(file);
    if (string.IsNullOrWhiteSpace(name) || !string.Equals(name, file, StringComparison.Ordinal))
        return Results.NotFound();
    var contentType = Path.GetExtension(name).ToLowerInvariant() switch
    {
        ".png" => "image/png",
        ".svg" => "image/svg+xml",
        ".ico" => "image/x-icon",
        _ => null
    };
    var path = Path.Combine(AppContext.BaseDirectory, "webclient", "en", "assets", "brand", name);
    return contentType is not null && File.Exists(path)
        ? Results.File(path, contentType)
        : Results.NotFound();
}

// ---- web client ----------------------------------------------------------
// The Angular client publishes as one directory per locale (webclient/ar,
// webclient/en), each a complete app with hashed asset names and its own
// index.csr.html shell. There is no Node on this host, so the SSR build's
// server/ half is not deployed: the sixteen prerendered routes ship as real
// index.html files and everything else renders in the browser.
var webClientRoot = Path.Combine(AppContext.BaseDirectory, "webclient");
string[] locales = ["ar", "en"];

// ---- search engines ------------------------------------------------------------
// Only Production is indexable; every other host (staging runs the payment simulator) tells
// crawlers to stay out. The origin is the configured public site address, not the request host.
var indexable = app.Environment.IsProduction();
var siteOrigin = (app.Configuration["Email:AppBaseUrl"] ?? "").TrimEnd('/');
app.MapGet("/robots.txt", () =>
    Results.Text(Tafseel.Api.Routing.SiteIndex.Robots(indexable, siteOrigin), "text/plain; charset=utf-8"));
app.MapGet("/sitemap.xml", async (Tafseel.Application.Marketplace.IMarketplaceService marketplace, CancellationToken ct) =>
    Results.Text(
        Tafseel.Api.Routing.SiteIndex.Sitemap(siteOrigin, webClientRoot, await marketplace.GetPublicTeacherLinksAsync(ct)),
        "application/xml; charset=utf-8"));


app.MapFallback(async context =>
{
    var path = context.Request.Path.Value ?? "/";

    // A server path that reached the fallback matched no endpoint, and the answer
    // to that is 404 - not a redirect into the client. Without this an unknown
    // /api path answers a caller expecting JSON with a redirect to an HTML page.
    if (context.Request.Path.StartsWithSegments("/api")
        || context.Request.Path.StartsWithSegments("/hubs")
        || context.Request.Path.StartsWithSegments("/health"))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
    var locale = segments.Length > 0 ? segments[0].ToLowerInvariant() : "";

    // A path that does not name a locale is one of two things: a reader opening
    // the site root, or a stored link the server itself minted (AppRoutes writes
    // them without a locale, so one link stays right for a reader in either
    // language). Both are answered by negotiating and redirecting once.
    if (!locales.Contains(locale))
    {
        var wanted = PreferredLocale(context.Request.Headers.AcceptLanguage);
        context.Response.Redirect($"/{wanted}{path}{context.Request.QueryString}");
        return;
    }

    // A prerendered route is a real file (ar/about/index.html); everything else
    // gets that locale's client shell and renders from the URL.
    var rest = string.Join(Path.DirectorySeparatorChar, segments.Skip(1));
    var prerendered = Path.Combine(webClientRoot, locale, rest, "index.html");
    var shell = Path.Combine(webClientRoot, locale, "index.csr.html");
    var file = File.Exists(prerendered) ? prerendered : shell;
    if (!File.Exists(file))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    // An address no Angular route owns is a real 404: the shell still renders the not-found
    // page for the reader, but crawlers and link checkers see the status, not a soft 200.
    var afterLocale = string.Join('/', segments.Skip(1));
    if (!Tafseel.Api.Routing.SiteIndex.IsClientRoute(segments.Length > 1 ? segments[1] : ""))
        context.Response.StatusCode = StatusCodes.Status404NotFound;

    var tags = context.Response.StatusCode == StatusCodes.Status404NotFound
        ? "<meta name=\"robots\" content=\"noindex\" />"
        : Tafseel.Api.Routing.SiteIndex.HeadTags(indexable, siteOrigin, locale, afterLocale);
    context.Response.ContentType = "text/html; charset=utf-8";
    await context.Response.WriteAsync(
        Tafseel.Api.Routing.SiteIndex.WithHeadTags(await File.ReadAllTextAsync(file), tags));
});

// Arabic is the default: the reader who states no preference, or states one we
// do not publish, is far likelier to want it than English on this market.
static string PreferredLocale(StringValues acceptLanguage)
{
    foreach (var entry in acceptLanguage.ToString().Split(',', StringSplitOptions.RemoveEmptyEntries))
    {
        var tag = entry.Split(';')[0].Trim();
        if (tag.StartsWith("en", StringComparison.OrdinalIgnoreCase)) return "en";
        if (tag.StartsWith("ar", StringComparison.OrdinalIgnoreCase)) return "ar";
    }
    return "ar";
}


app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});

await IdentityInitialization.RunAsync(
    app.Environment,
    migrate => app.Services.InitializeIdentityAsync(migrate));

app.Run();

public partial class Program
{
    /// <summary>Angular names a built asset `main-A1B2C3D4.js`; that hash is what makes it safe to cache forever.</summary>


    /// <summary>An inline &lt;script&gt; - one with no src attribute - and its body.</summary>
    [GeneratedRegex(@"<script(?![^>]*src=)[^>]*>(.*?)</script>", RegexOptions.Singleline)]
    private static partial Regex InlineScript();
    [GeneratedRegex(@"-[A-Za-z0-9_]{8,}\.[a-z0-9]+$")]
    private static partial Regex HashedAsset();
}

internal static class IdentityInitialization
{
    internal static Task RunAsync(IHostEnvironment environment, Func<bool, Task> initialize) =>
        environment.IsDevelopment()
            ? initialize(true)
            : Task.CompletedTask;
}
