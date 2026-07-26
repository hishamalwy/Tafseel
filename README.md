# Tafseel

Tafseel is a personalized educational marketplace that connects students with verified teachers.

## Backend

The .NET 8 backend foundation lives in `src/` and follows inward-only project dependencies:

```text
Api -> Infrastructure -> Application -> Domain
Api --------------------> Application
Infrastructure -----------------------> Domain
```

Local setup:

```powershell
dotnet user-secrets set "Jwt:SigningKey" "replace-with-a-random-secret-at-least-32-characters" --project src/Tafseel.Api
dotnet user-secrets set "Resend:ApiToken" "your-new-resend-key" --project src/Tafseel.Api
dotnet run --project src/Tafseel.Api
```

Development startup applies pending migrations to LocalDB. Production deployments must apply migrations before starting the API.
Open the local frontend at `/app/Tafseel-Landing.dc.html`.

Run the checks:

```powershell
dotnet test Tafseel.sln
```

CI/CD uses locked dependencies and focused GitHub Actions workflows. Start with [the CI/CD overview](docs/cicd-overview.md), [environment setup](docs/cicd-secrets-and-environments.md), and [branch protection](docs/branch-protection.md).

Swagger is available at `/swagger` in Development. Health endpoints are `/health/live` and `/health/ready`.

Replace `Email:From` with an address on a verified Resend domain before production. `onboarding@resend.dev` is for initial testing only.
Set `Email:ConfirmationUrl` and `Email:PasswordResetUrl` to trusted HTTPS frontend routes in production.

Production startup deliberately fails while mock payment or live-session providers are selected. Complete [the production checklist](docs/production-checklist.md) before deployment.

Never reuse a credential pasted into chat, logs, tickets, or source control. Revoke it in Resend, review email/activity logs, create a replacement with the minimum required access, and store it only in User Secrets locally or the deployment secret manager.
