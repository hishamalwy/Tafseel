# Tafseel

Tafseel is a bilingual educational marketplace that connects students with verified teachers and manages the learning-service lifecycle from teacher discovery and requests to sessions, payments, delivery, reviews, and platform operations.

The platform supports Arabic and English experiences and includes dedicated workflows for students, teachers, reviewers, finance operators, and administrators.

---

## Tech Stack

### Backend

- ASP.NET Core / .NET 8
- Entity Framework Core
- SQL Server
- SignalR
- Swagger / OpenAPI

### Frontend

- Angular
- TypeScript
- RxJS
- Arabic RTL and English LTR support

### Engineering

- GitHub Actions CI/CD
- Automated backend and frontend testing
- Browser / end-to-end testing
- Secret scanning
- Environment-specific configuration

---

## Architecture

The backend follows inward-only project dependencies:

```text
Api -> Infrastructure -> Application -> Domain
Api --------------------> Application
Infrastructure -----------------------> Domain
```

The Angular client lives in:

```text
frontend-angular/
```

The frontend is built as part of the application build process and is served by the ASP.NET Core API in deployed environments.

Generated frontend build output is intentionally excluded from source control.

---

## Platform Roles

Tafseel includes workflows for:

- Visitor
- Student
- Teacher
- Quality Reviewer
- Finance
- Admin

Each role has dedicated permissions and workflows across the platform.

See the product documentation under:

```text
docs/product/
```

---

## Repository Structure

```text
Tafseel/
├── src/                    # .NET backend
├── frontend-angular/       # Angular frontend
├── tests/                  # Automated and browser tests
├── docs/                   # Product and engineering documentation
├── css/                    # Tafseel design-system source
├── assets/                 # Shared assets and fonts
├── scripts/                # Development and CI scripts
├── .github/workflows/      # GitHub Actions
├── Tafseel Brand/          # Brand source assets
├── Tafseel.sln
├── PRODUCT.md
└── AGENTS.md
```

---

## Prerequisites

Install:

- .NET 8 SDK
- SQL Server or SQL Server LocalDB
- Node.js
- npm

---

## Local Setup

Configure development secrets:

```powershell
dotnet user-secrets set "Jwt:SigningKey" "replace-with-a-random-secret-at-least-32-characters" --project src/Tafseel.Api

dotnet user-secrets set "Resend:ApiToken" "your-resend-api-token" --project src/Tafseel.Api
```

Run the application:

```powershell
dotnet run --project src/Tafseel.Api
```

During Development, pending migrations are applied to LocalDB.

Opening `/` redirects to `/ar` or `/en` according to the browser language.

---

## Frontend Development

For Angular development with hot reload:

```powershell
cd frontend-angular
npm ci
npm start
```

The development server proxies API requests to the local Tafseel API.

A normal .NET build builds the Angular client automatically.

When working only on the API, the existing frontend build can be reused with:

```powershell
dotnet run --project src/Tafseel.Api -p:BuildWebClient=false
```

---

## Testing

Run the .NET test suite:

```powershell
dotnet test Tafseel.sln
```

Frontend, browser, and pre-production verification tooling is available under:

```text
frontend-angular/
tests/
scripts/
```

---

## API & Health Checks

Swagger is available in Development at:

```text
/swagger
```

Health endpoints:

```text
/health/live
/health/ready
```

---

## Environments

Tafseel supports:

- Development
- Staging
- PreProduction
- Production

Environment configuration, databases, canonical seed behavior, and safe reset procedures are documented in:

```text
docs/ENVIRONMENTS.md
```

Never commit environment credentials or production secrets to the repository.

Use:

- .NET User Secrets for local development
- Environment variables or the deployment secret manager for hosted environments

---

## CI/CD

CI/CD uses locked dependencies and focused GitHub Actions workflows.

Start with:

```text
docs/engineering/cicd-overview.md
docs/engineering/cicd-secrets-and-environments.md
docs/engineering/branch-protection.md
```

---

## Security

Real credentials, private keys, deployment profiles, runtime uploads, local configuration, generated builds, logs, screenshots, browser traces, and test evidence are intentionally excluded from Git.

Never reuse a credential that has appeared in:

- Source control
- Chat
- Logs
- Tickets
- Screenshots

Revoke exposed credentials and replace them with credentials stored through an appropriate secret-management mechanism.

---

## Production

Production startup deliberately protects against unsafe development configuration.

Mock or development-only providers must be replaced or explicitly handled before production deployment.

Before deployment, review:

```text
docs/releases/GO_LIVE_CHECKLIST.md
```

Database migrations must also be applied before starting the Production API.

---

## Documentation

The main documentation map is:

```text
docs/README.md
```

Product documentation:

```text
PRODUCT.md
docs/product/
```

Engineering and architecture documentation:

```text
docs/engineering/
```

Development-agent repository instructions:

```text
AGENTS.md
```

---

## License

No public license is currently specified.