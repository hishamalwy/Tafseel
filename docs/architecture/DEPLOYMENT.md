# Tafseel Deployment Architecture

## GitHub Actions

The repository contains focused workflows for CI, security scanning, database checks, Docker image work, Staging gates/deployment, Production deployment and scheduled maintenance. Locked dependency restore and validation gates are preserved.

## Staging

Staging deployment follows its required workflow gates. Normal application startup does not run Development identity/catalog initialization and does not apply migrations. Environment settings must provide non-Development email configuration and valid secrets.

## Production

Production deployment remains manual. Current startup validation deliberately fails while mock payment or live-session providers are selected. Production is not considered ready until the production checklist and external integrations are completed.

## Manual Migrations

Staging and Production database migrations are generated/reviewed separately and applied manually. Application startup must not apply them. Development bootstrap retains its existing migration behavior.

## Environment Configuration

Configuration contracts include:

- SQL Server connection string.
- JWT issuer, audience, signing key and lifetimes.
- CORS origins.
- Resend token and verified sender.
- Email application, confirmation and password-reset URLs.
- Payment provider and webhook secret.
- Live-session provider and timing settings.
- Fee, dispute, file-storage and data-protection settings.

## Startup Validation

Options validation fails startup for missing/placeholder JWT settings, invalid URLs/senders, missing Resend credentials, invalid fee/timing boundaries, automatic financial release and unsupported Production providers.

## Development-only Initialization

Normal startup invokes identity/catalog initialization only in Development and passes migrations enabled, preserving the established Development behavior.

Testing skips the Program startup invocation and uses the explicit integration-test factory bootstrap.

Staging and Production do not invoke the initializer, do not repair seed data, do not create demo identities and do not trigger migrations through this path.

### Optional Development demo users (ADR-012)

Disabled by default. Enabling seeds the same four canonical accounts as Staging
(`admin@gmail.com` / Admin, `student@gmail.com` / Student, `teacher@gmail.com` / Teacher,
`quality@gmail.com` / QualityReviewer) into a Development database only. The password is never
checked in; it must come from User Secrets or an environment variable.

Enable locally, from the repository root:

```powershell
dotnet user-secrets set "SeedUsers:Enabled" "true" --project .\src\Tafseel.Api
dotnet user-secrets set "SeedUsers:Password" "<LOCAL_DEVELOPMENT_PASSWORD>" --project .\src\Tafseel.Api
```

`<LOCAL_DEVELOPMENT_PASSWORD>` must satisfy the app's password policy (at least 10 characters,
upper- and lower-case, a digit, and a non-alphanumeric character). Then start the app in Development
as usual; the accounts are created (or repaired) on startup.

Environment variable equivalents (e.g. for a shell instead of User Secrets):

```powershell
$env:SeedUsers__Enabled = "true"
$env:SeedUsers__Password = "<LOCAL_DEVELOPMENT_PASSWORD>"
```

Disable again:

```powershell
dotnet user-secrets set "SeedUsers:Enabled" "false" --project .\src\Tafseel.Api
```

Never put a real password in `appsettings.json`, `appsettings.Development.json`, source code, tests,
documentation, or CI logs. Staging and Production ignore `SeedUsers` entirely — enabling it there has
no effect, by design and by an in-code defensive guard (see ADR-012).

### Optional Development demo catalog content (ADR-013)

Disabled by default, independent of `SeedUsers` (no secret needed — no credentials involved). Enabling
seeds seven demo subjects (with topics and one teaching-demo qualification topic each) and four
education levels into a Development database only, so Browse Teachers / Teacher Apply / request forms
have something to show.

```powershell
dotnet user-secrets set "SeedDemoData:Enabled" "true" --project .\src\Tafseel.Api
```

Environment variable equivalent: `$env:SeedDemoData__Enabled = "true"`. Disable again with
`dotnet user-secrets set "SeedDemoData:Enabled" "false" --project .\src\Tafseel.Api`. Staging and
Production ignore it entirely, same guarantee as `SeedUsers`.
