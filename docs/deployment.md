# Deployment

## Staging

The current Staging target is the Linux .NET 8 Azure App Service code app `tafseel-api-hisham` on Free F1. It is a demo environment, not Production.

Run `Deploy Staging - Azure App Service` manually with a full Git SHA. The workflow:

1. Confirms the SHA belongs to `main`.
2. Requires successful CI, Security, Database, and Docker checks for that exact commit.
3. Restores the locked solution, builds Release, and publishes `src/Tafseel.Api/Tafseel.Api.csproj`.
4. Authenticates with Azure OIDC and deploys the prebuilt directory to the App Service `Production` slot.
5. Tests `/health/live`, `/health/ready`, `/app/Tafseel-Landing.dc.html`, and anonymous access to `/api/v1/auth/me`.

It does not run target-database migrations. Apply the reviewed idempotent SQL artifact to the Staging database before the first deployment. Application startup in `Staging` does not migrate the database.

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
ConnectionStrings__Tafseel=<staging SQL Server connection string>
Jwt__Issuer=Tafseel.Api
Jwt__Audience=Tafseel.Web
Jwt__SigningKey=<random value, at least 32 characters>
Resend__ApiToken=<rotated Resend staging token>
Email__From=Tafseel <onboarding@resend.dev>
Email__ConfirmationUrl=https://tafseel-api-hisham.azurewebsites.net/app/Tafseel-Auth.dc.html
Email__PasswordResetUrl=https://tafseel-api-hisham.azurewebsites.net/app/Tafseel-Auth.dc.html
Email__AppBaseUrl=https://tafseel-api-hisham.azurewebsites.net/app
Cors__AllowedOrigins__0=https://tafseel-api-hisham.azurewebsites.net
Payments__Provider=Mock
Payments__WebhookSecret=<random value, at least 32 characters>
Payments__AutoReleaseEnabled=false
LiveSessions__Provider=Mock
DataProtection__KeysPath=/home/data-protection-keys
FileStorage__RootPath=/home/tafseel-files
```

Do not add `WEBSITE_RUN_FROM_PACKAGE`, a publish profile, or Azure client credentials as application settings. Azure deployment identity values belong only in the GitHub `staging` Environment.

Cancel the workflow proposed by Azure Deployment Center instead of pressing **Save**: saving it would commit a second deployment workflow. Configure or reuse the user-assigned identity and its GitHub federated credential separately, then use this repository-owned workflow.

## Production

1. Create and validate a semantic GitHub Release.
2. Confirm backup evidence and migration review.
3. Run `Deploy Production` with the existing version and migration confirmation.
4. Approve the protected Production Environment.
5. The workflow downloads release assets, verifies checksums and image digest, validates configuration and SQL connectivity, applies SQL separately, deploys the immutable digest using the configured safe strategy, and runs production-safe smoke tests.

Application startup never applies Production migrations. Failed health triggers application-image rollback only; database rollback remains manual.

## Production deployment adapter

`DEPLOY_HOOK_URL` receives authenticated JSON with environment, immutable image, revision/version, and strategy. It must return non-2xx until the platform has accepted and recorded the operation. Implement the hook using least-privilege OIDC in the target platform and preserve rolling or blue-green semantics.

Troubleshooting evidence is in job summaries and failure artifacts. Do not retry a migration or financial/provider operation until its idempotency and database state are understood.
