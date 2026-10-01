# Environments

Four logical environments. Each has **its own database**; Development, Staging and PreProduction start from the
**same deterministic seed** (same schema, catalog, services, prices, roles and demo accounts) and then diverge
through use. Production never receives demo data.

| | Development | Staging | PreProduction | Production |
|---|---|---|---|---|
| Purpose | Developer machine | Integration and testing | Production-like final testing before real payments | Real users, real money (later) |
| `ASPNETCORE_ENVIRONMENT` | `Development` | `Staging` | `PreProduction` | `Production` |
| URL | `https://localhost:7272` / `http://localhost:5089` | `http://localhost:5200` (launch profile "Staging (local)") | `https://tafseel.runasp.net` | not provisioned (DEC-12) |
| Database | `Tafseel_Development` (local SQL Server) | `Tafseel_Staging` (local SQL Server) | `db63194` on `db63194.databaseasp.net` (MonsterASP; the host allows one database) | not provisioned |
| Settings file | `appsettings.Development.json` + User Secrets | `appsettings.Staging.json` + `appsettings.Staging.Host.json` (git-ignored) | `appsettings.PreProduction.json` + `appsettings.PreProduction.Host.json` (server-owned, git-ignored) | `appsettings.Production.json` + secret store |
| Payments | Mock + simulator | Mock + simulator | **Mock + simulator, on purpose**; every screen shows "Test environment" | Real provider required (mock refused) |
| Live sessions | Mock, or JaaS from User Secrets | Mock | JaaS, signed per participant with the account's RSA key ([JAAS_PREPRODUCTION.md](operations/JAAS_PREPRODUCTION.md)) | JaaS with the account's own key |
| Email | Files in `App_Data/dev-outbox` | Files in `App_Data/dev-outbox` | Resend, real mail | Resend |
| Demo recipients | suppressed | suppressed | **suppressed**: mail to the five demo addresses is never sent | none exist |
| File storage | Local `App_Data` | Local `App_Data/staging` | Local `D:\Sites\site84355\wwwroot\App_Data` (host) | Azure Blob (private) |
| Malware scanning | Development scanner (EICAR only) | Development scanner | Development scanner (no ClamAV on this host) | ClamAV required |
| HTTPS | optional | no (local HTTP) | enforced, HSTS, secure cookies | enforced |
| Demo data | on startup when `SeedUsers:Enabled`, or `seed` | `seed` / `reset-database` | `seed` / `reset-database` | never (`provision` only) |
| Search engines | — | not indexable | not indexable | indexable |

PreProduction behaves like Production for authorization, security headers, HTTPS and cookies, migrations (never on
startup), money rules, payouts, sessions and account security. What it deliberately does differently: simulated
payments (marked on every screen), demo accounts and a demo Finance scenario, the development scanner and local
storage (the shared host offers neither ClamAV nor object storage), and suppressed mail to demo addresses.

## The canonical seed

One implementation: `src/Tafseel.Infrastructure/Seeding/EnvironmentSeed.cs`. Idempotent — running it twice changes nothing.

1. Reference data: roles, the four canonical services with the DEC-01 price policy, teaching languages.
2. Baseline catalog: seven subjects with topics and qualification topics, education levels. (Three sample landing
   promotions are added in Development only: a published promotion opens a modal on the landing page.)
3. Demo accounts, one per role, all with the environment's seed password:
   `admin@gmail.com` (Admin), `quality@gmail.com` (QualityReviewer), `finance@gmail.com` (Finance),
   `teacher@gmail.com` (Teacher), `student@gmail.com` (Student).
4. Demo teacher supply: `teacher@gmail.com` qualified in Mathematics, recorded-explanation (120 SAR) and live-session
   (150 SAR/h) services, availability every day 09:00–22:00 Riyadh, profile published.
5. Finance scenario, lived through the real order, payment, delivery, refund and payout services (no hand-written
   ledger rows): a completed purchase whose teacher earning has matured, a verified IBAN payout profile (test IBAN
   `SA03 8000 …7519`), a **pending 60 SAR withdrawal**, a purchase in progress (escrow held), a **refunded**
   purchase, and a reconciliation scan with no open case.

The demo addresses are real Gmail mailboxes that belong to other people, so every environment lists them in
`Email:SuppressedRecipients`: nothing is ever mailed to them.

## Commands

All run from the API project (`src/Tafseel.Api`) or the published folder (`dotnet Tafseel.Api.dll …`), with
`ASPNETCORE_ENVIRONMENT` set. None starts the site.

| Command | What it does | Allowed in |
|---|---|---|
| `seed` | The canonical seed above | Development, Staging, PreProduction |
| `reset-database --confirm <database>` | Empties **this environment's own database** (tables, views, routines), applies every migration, then seeds | Development, Staging, PreProduction |
| `provision` | Reference data and the first Admin from `Provisioning:BootstrapAdminEmail` | every environment (Production's only one) |

`reset-database` refuses: Production; any environment other than the three above; a connection that names no
database; a database different from `Database:Name` in the same environment's settings; and a confirmation that is
not exactly that database name. It takes no connection string. Stored files are left in place; nothing refers to them
after a reset.

```bash
# Local Staging, from src/Tafseel.Api
ASPNETCORE_ENVIRONMENT=Staging dotnet run --no-launch-profile -- reset-database --confirm Tafseel_Staging
```

## The seed password

`SeedUsers:Password` (environment variable `SeedUsers__Password`). It is never in a tracked file and never logged.

- Development: User Secrets — `dotnet user-secrets set "SeedUsers:Password" "<value>" --project src/Tafseel.Api`.
- Staging (local): `src/Tafseel.Api/appsettings.Staging.Host.json` (git-ignored; generated on this machine).
- PreProduction: `deploy/iis-runasp/appsettings.PreProduction.Host.json` locally (git-ignored), published to the
  host as the server-owned settings file.

It must satisfy the password policy (10+ characters, upper, lower, digit, symbol). Changing it later does not change
existing accounts; reset the database or use the password-reset flow.

## Development

1. SQL Server on `localhost` (Windows authentication). Create the database once: `CREATE DATABASE Tafseel_Development`.
2. User Secrets: `Jwt:SigningKey`, `Payments:WebhookSecret`, `Resend:ApiToken` (any value; mail goes to the outbox),
   `PayoutDestinations:ActiveKeyId` and `PayoutDestinations:Keys:<id>` (32 random bytes, base64), `SeedUsers:Password`,
   and optionally `SeedUsers:Enabled`/`SeedDemoData:Enabled` to seed accounts and catalog on startup.
3. `dotnet run --project src/Tafseel.Api` (migrates on startup), then once: `dotnet run --project src/Tafseel.Api -- seed`.

## Staging (local)

1. `CREATE DATABASE Tafseel_Staging` on `localhost`.
2. `src/Tafseel.Api/appsettings.Staging.Host.json` with `Jwt`, `Payments:WebhookSecret`, `Resend:ApiToken` (unused;
   Outbox delivery), `PayoutDestinations` and `SeedUsers:Password`.
3. `reset-database --confirm Tafseel_Staging`, then run the "Staging (local)" launch profile.

## PreProduction (tafseel.runasp.net)

- Settings: `appsettings.PreProduction.json` (tracked, no secrets) + `appsettings.PreProduction.Host.json` on the
  server with `ConnectionStrings:Tafseel`, `Database:Name` (`db63194`), `Jwt:SigningKey`, `Resend:ApiToken`,
  `Payments:WebhookSecret`, `PayoutDestinations`, `SeedUsers:Password`, `FileStorage:RootPath`, `DataProtection:KeysPath`,
  `JaaS:AppId`, `JaaS:KeyId` and `JaaS:PrivateKeyPath` are in the tracked file; the private key itself is the file
  `App_Data\jaas\jaas-private-key.pem` on the server, uploaded by hand and never published, logged or sent to the browser.
  A static JaaS token is refused here, as in Production. Without the key file the site does not start: upload it first.
- Deploy: `dotnet publish src/Tafseel.Api -c Release -p:PublishProfile=tafseel-preproduction` (Web Deploy; the profile
  sets `EnvironmentName=PreProduction` in `web.config` and uploads the host settings file). Profiles are git-ignored.
- Migrations and seed: run `reset-database --confirm db63194` (first time or to start over) or `seed` from a trusted
  machine with `ASPNETCORE_ENVIRONMENT=PreProduction` and the host settings file present; startup never migrates.
- Smoke: `https://tafseel.runasp.net/health/ready` → `Healthy`; sign in as each demo account.

**Isolation limit.** The shared host provides one database. PreProduction owns it; Staging therefore runs locally
(`Tafseel_Staging`). Nothing else may point at `db63194`.

## Production

Not provisioned. Everything required is in [releases/GO_LIVE_CHECKLIST.md](releases/GO_LIVE_CHECKLIST.md) and
[operations/PRODUCTION_SECRETS_CHECKLIST.md](operations/PRODUCTION_SECRETS_CHECKLIST.md). The host refuses to start with
mock payments, mock meetings, the development scanner, local storage, demo seeding, suppressed recipients, outbox mail
or placeholder settings.

## Giving someone the Finance role

Admin → People → search the person → **Roles** → tick **Finance** → confirm. They land on `/finance/home` at their next
sign-in. Clearing the tick ends their sessions and the Finance screens and APIs refuse them (403).
[product/ROLES_AND_PERMISSIONS.md](product/ROLES_AND_PERMISSIONS.md) has the permission table.
