# Deployment

## Staging

The current Staging target is the Linux .NET 8 Azure App Service code app `tafseel-api-hisham` on Free F1. It is a demo environment, not Production.

### Automatic path

Every successful push to `main` follows:

1. CI, Security, Database, and Docker checks run for that exact commit.
2. `Staging Gate` waits (bounded retry, finite timeout) until every required check-run for that SHA succeeds, and fails immediately on failure/cancelled/timed_out.
3. `Deploy Staging - Azure App Service` starts automatically via `workflow_run` after `Staging Gate` succeeds.
4. The resolved revision is always `github.event.workflow_run.head_sha` (the validated push commit), never the latest `main` tip and never the deploy workflow’s default-branch `github.sha`.
5. The `staging-db-migrate` job logs in to Azure with OIDC, rebuilds the exact-SHA EF migration bundle and idempotent SQL, verifies artifact hashes, confirms the target is only `tafseel-staging-db`, inspects DB identity, applies only pending migrations, verifies `__EFMigrationsHistory`, and checks the latest migration’s expected schema objects.
6. Only after migration success does the `staging-azure` job publish `src/Tafseel.Api/Tafseel.Api.csproj` and deploy the prebuilt zip to App Service without restarting it. Starting the app and running `scripts/ci/staging-smoke.sh` are manual steps.

### Manual fallback

Run `Deploy Staging - Azure App Service` with `workflow_dispatch` and a full 40-character Git SHA when you need an emergency/manual redeploy of an already validated `main` commit. The same SHA validation, migration safety, target-database checks, and pre-deploy migration execution still apply.

### What the deploy verifies

1. Confirms the SHA belongs to `main`.
2. Requires successful check-runs for that exact commit (names in `scripts/ci/required-staging-gates.txt`):
   `build-and-provider-neutral`, `sql-server`, `publish-smoke`, `dependencies-and-secrets`, `codeql-csharp`, `codeql-javascript-typescript`, `migrations`, `image`.
3. Rebuilds the exact-SHA migration artifacts:
   - `artifacts/migrations/tafseel-staging-migrate`
   - `artifacts/migrations/tafseel-idempotent.sql`
4. Validates artifact hashes and refuses to run unless the target database name is exactly `tafseel-staging-db`.
5. Applies the migration bundle before deploying the application. Transient Azure SQL conditions are retried with a small bounded retry budget; invalid credentials, wrong target DB, policy failures, SQL logic errors, and verification failures stop immediately.
6. Verifies `__EFMigrationsHistory` contains the latest expected `MigrationId`, records the current/target/latest-applied migrations in the Step Summary, and checks the latest migration’s created tables/columns where practical.
7. Restores the locked solution, builds Release, publishes the API project, validates publish output, authenticates with Azure OIDC, and deploys the prebuilt package to the App Service `Production` slot.
8. Leaves the app restart and post-deployment smoke checks manual.
9. Records the exact deployed SHA in the GitHub Step Summary.

Application startup in `Staging` does not migrate the database (`InitializeIdentityAsync` only migrates in Development). `Database.Migrate()`, `MigrateAsync()`, and `EnsureCreated()` must remain out of Staging and Production startup. Migration failure stops deployment because `staging-azure` depends on successful completion of `staging-db-migrate`.

The Free F1 Staging app may use mock payment/live-session providers and `/home` local persistence for demonstration. It must not be promoted to Production, scaled to multiple instances, or treated as durable file storage.

Staging initializes these idempotent demo accounts only when `ASPNETCORE_ENVIRONMENT=Staging`:

```text
admin@gmail.com   Admin
student@gmail.com Student
teacher@gmail.com Teacher
quality@gmail.com QualityReviewer
Password: @Admin123
```

These credentials are public staging/demo credentials. Never reuse them, their password, or their accounts in Production.

Configure these Azure App Service application settings before deployment:

```text
ASPNETCORE_ENVIRONMENT=Staging
ASPNETCORE_FORWARDEDHEADERS_ENABLED=true
SCM_DO_BUILD_DURING_DEPLOYMENT=false
WEBSITE_WARMUP_PATH=/health/ready
WEBSITE_WARMUP_STATUSES=200
ConnectionStrings__Tafseel=<staging SQL Server connection string>
Jwt__Issuer=Tafseel.Api
Jwt__Audience=Tafseel.Web
Jwt__SigningKey=<random value, at least 32 characters>
Resend__ApiToken=<rotated Resend staging token>
Email__From=Tafseel <noreply@your-verified-domain.example>
Email__ConfirmationUrl=https://tafseel-api-hisham-dchqfbhsfbbndfgx.francecentral-01.azurewebsites.net/app/Tafseel-Auth.dc.html
Email__PasswordResetUrl=https://tafseel-api-hisham-dchqfbhsfbbndfgx.francecentral-01.azurewebsites.net/app/Tafseel-Auth.dc.html
Email__AppBaseUrl=https://tafseel-api-hisham-dchqfbhsfbbndfgx.francecentral-01.azurewebsites.net/app
Cors__AllowedOrigins__0=https://tafseel-api-hisham-dchqfbhsfbbndfgx.francecentral-01.azurewebsites.net
Payments__Provider=Mock
Payments__WebhookSecret=<random value, at least 32 characters>
Payments__AutoReleaseEnabled=false
LiveSessions__Provider=Mock
DataProtection__KeysPath=/home/data-protection-keys
FileStorage__RootPath=/home/tafseel-files
```

`/health/live` confirms that the process can serve requests and deliberately
does not query dependencies. `/health/ready` includes the tagged database check
and is the App Service Health Check and warmup path. Startup initialization
finishes before Kestrel accepts either request, so a `200` readiness response
means both startup fail-fast work and the database check succeeded.

Do not add `WEBSITE_RUN_FROM_PACKAGE`, a publish profile, or Azure client credentials as application settings. Azure deployment identity values belong only in the GitHub `staging` Environment.

Cancel the workflow proposed by Azure Deployment Center instead of pressing **Save**: saving it would commit a second deployment workflow. Configure or reuse the user-assigned identity and its GitHub federated credential separately, then use this repository-owned workflow.

### Staging database authentication

The repository shows Azure OIDC is intended for Azure control-plane deployment only. It does not prove that the GitHub federated principal has Azure SQL Microsoft Entra configuration or database-level data-plane permissions. Until that is explicitly set up and reviewed, use a dedicated Staging SQL login in the GitHub `staging` Environment:

```text
STAGING_SQL_SERVER=<logical-server-name>.database.windows.net
STAGING_SQL_DATABASE=tafseel-staging-db
STAGING_SQL_USERNAME=<staging-migration-login>
STAGING_SQL_PASSWORD=<rotated-secret>
```

Keep the login scoped to `tafseel-staging-db` with least privilege, rotate it regularly, and never reuse Production SQL credentials.

### Destructive or coordinated migrations

The automatic Staging path is only for reviewed expand-safe migrations. If `scripts/ci/check-migration-safety.ps1` blocks a migration, do not widen the approvals broadly. Review the exact blocked migration and operation, then use an expand/migrate/contract release sequence or a manual DBA-reviewed change instead. Production migration/deploy remains manual and approval-gated.

### Manual fallback and troubleshooting

- `workflow_dispatch` still requires a full 40-character validated `main` SHA and runs the same migration-then-deploy path.
- Use `artifacts/migrations/tafseel-idempotent.sql` for human review and emergency/manual DBA execution if automation is blocked before deployment.
- If `staging-db-migrate` fails on authentication or target validation, fix the secret/configuration issue and rerun; the workflow does not continue silently.
- If readiness fails after deployment, investigate schema state, migration evidence, and App Service logs before retrying.

## Production

Production deployment remains manual.

1. Create and validate a semantic GitHub Release.
2. Confirm backup evidence and migration review.
3. Run `Deploy Production` with the existing version and migration confirmation.
4. Approve the protected Production Environment.
5. The workflow downloads release assets, verifies checksums and image digest, validates configuration and SQL connectivity, applies SQL separately, deploys the immutable digest using the configured safe strategy, and runs production-safe smoke tests.

Application startup never applies Production migrations. Failed health triggers application-image rollback only; database rollback remains manual. Production migration/deploy approvals and the existing manual SQL application step remain unchanged by the Staging automation.

## Production deployment adapter

`DEPLOY_HOOK_URL` receives authenticated JSON with environment, immutable image, revision/version, and strategy. It must return non-2xx until the platform has accepted and recorded the operation. Implement the hook using least-privilege OIDC in the target platform and preserve rolling or blue-green semantics.

Troubleshooting evidence is in job summaries and failure artifacts. Do not retry a migration or financial/provider operation until its idempotency and database state are understood.
