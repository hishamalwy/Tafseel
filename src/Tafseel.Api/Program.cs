using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
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

builder.Host.UseSerilog((context, configuration) =>
    configuration.ReadFrom.Configuration(context.Configuration).WriteTo.Console());

builder.Services.AddInfrastructure(builder.Configuration, builder.Environment);
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
                PermitLimit = builder.Environment.IsEnvironment("Testing") ? 10000 : 300,
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
    options.AddPolicy("messaging", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue("sub") ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Environment.IsEnvironment("Testing") ? 100 : 30,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
});

builder.Services.AddHealthChecks()
    .AddDbContextCheck<TafseelDbContext>("database", tags: ["ready"]);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSignalR();
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

var app = builder.Build();

app.UseMiddleware<CorrelationIdMiddleware>();
app.UseSerilogRequestLogging();
app.UseExceptionHandler();
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers.XContentTypeOptions = "nosniff";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    headers.Append("X-Frame-Options", "DENY");
    headers.Append("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    headers.Append("Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
        "font-src 'self'; img-src 'self' data:; connect-src 'self' wss:; " +
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        headers.CacheControl = "no-store";
        headers.Pragma = "no-cache";
    }
    await next();
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (!app.Environment.IsDevelopment() && !app.Environment.IsEnvironment("Testing"))
    app.UseHsts();
app.UseHttpsRedirection();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<MessagingHub>("/hubs/messages");

var frontendRoot = Path.Combine(AppContext.BaseDirectory, "frontend");
var frontendPages = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    "Tafseel-Landing.dc.html", "Tafseel-Browse-Teachers.dc.html", "Tafseel-Teacher-Profile.dc.html",
    "Tafseel-Request.dc.html", "Tafseel-Student-Dashboard.dc.html", "Tafseel-Teacher-Dashboard.dc.html",
    "Tafseel-Quality-Dashboard.dc.html", "Tafseel-Admin-Dashboard.dc.html", "Tafseel-Auth.dc.html",
    "Tafseel-Teacher-Apply.dc.html", "Tafseel-Chat.dc.html", "Tafseel-Book-Session.dc.html", "Tafseel-Payment.dc.html"
};
app.MapGet("/", () => Results.Redirect("/app/Tafseel-Landing.dc.html"));
app.MapGet("/app/{file}", (string file) =>
    frontendPages.Contains(file)
        ? Results.File(Path.Combine(frontendRoot, file), "text/html; charset=utf-8")
        : Results.NotFound());
app.MapGet("/app/support.js", () =>
    Results.File(Path.Combine(frontendRoot, "support.js"), "text/javascript; charset=utf-8"));
app.MapGet("/app/js/{file}", (string file) =>
    file is "locales.js" or "tafseel.js" or "api.js" or "auth.js" or "teacher-apply.js" or "chat.js"
        ? Results.File(Path.Combine(frontendRoot, "js", file), "text/javascript; charset=utf-8")
        : Results.NotFound());
app.MapGet("/app/js/vendor/{file}", (string file) =>
    file is "react.production.min.js" or "react-dom.production.min.js" or "babel.min.js"
        ? Results.File(Path.Combine(frontendRoot, "js", "vendor", file), "text/javascript; charset=utf-8")
        : Results.NotFound());
app.MapGet("/app/css/tafseel.css", () =>
    Results.File(Path.Combine(frontendRoot, "css", "tafseel.css"), "text/css; charset=utf-8"));
app.MapGet("/app/assets/fonts/thmanyah-sans/{file}", (string file) =>
    file is "thmanyah-sans-light.woff2" or "thmanyah-sans-regular.woff2"
        or "thmanyah-sans-medium.woff2" or "thmanyah-sans-bold.woff2"
        or "thmanyah-sans-black.woff2"
        ? Results.File(Path.Combine(frontendRoot, "assets", "fonts", "thmanyah-sans", file), "font/woff2")
        : Results.NotFound());
app.MapGet("/app/assets/fonts/inter/{file}", (string file) =>
    file is "inter-regular.woff2" or "inter-medium.woff2"
        or "inter-semibold.woff2" or "inter-bold.woff2"
        ? Results.File(Path.Combine(frontendRoot, "assets", "fonts", "inter", file), "font/woff2")
        : Results.NotFound());
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});

if (!app.Environment.IsEnvironment("Testing"))
    await app.Services.InitializeIdentityAsync(app.Environment.IsDevelopment());

app.Run();

public partial class Program;
