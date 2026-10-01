# Production secrets and settings checklist

Every name the Production host needs, **without values**. Values live only in the platform's secret store
(DEC-12) and the GitHub `production` environment, never in the repository, a document, a ticket or a chat.
Environment-variable form uses `__` for `:` (for example `Email:From` → `Email__From`).

The host checks these at startup and refuses to serve if any is missing, a placeholder, local, or a demo value
(`ProductionConfigurationGuard` plus the options validators in `DependencyInjection.cs`). The deploy workflow checks
the same names before it migrates (`scripts/ci/check-production-config.ps1`).

## 1. Secrets (secret store only)

| Name | What it is | How to create | Rotate |
|---|---|---|---|
| `ConnectionStrings__Tafseel` | App login to the production database: `db_datareader`, `db_datawriter`, `EXECUTE`. `Encrypt=True` | Platform SQL admin creates a contained user; not `sa`, not the migration login | On staff change or leak |
| `Jwt__SigningKey` | HMAC key for access tokens, ≥ 32 characters, must not contain "development" | `openssl rand -base64 48` in the secret store | Planned window: rotating signs every user out |
| `Resend__ApiToken` | Resend API key (`re_…`), sending-only scope, production domain | Resend dashboard | On leak |
| `Payments__WebhookSecret` | The PSP's webhook signing secret, ≥ 32 characters | PSP dashboard (PAY-02) | With the PSP |
| `FileStorage__AzureBlob__ConnectionString` | Storage account connection string for the private container | Platform; later replace with managed identity | On leak |
| `PayoutDestinations__Keys__<id>` | 32 random bytes, base64: seals teachers' bank details (AES-GCM) | `openssl rand -base64 32` **inside** the secret store | Add a new id, switch `ActiveKeyId`; keep old ids until every destination was resealed. **Losing every key loses every stored IBAN** |
| `JaaS__PrivateKeyPem` | RSA private key for JaaS participant tokens (PEM, newlines preserved) | Owner generates the pair; uploads the public half to JaaS | On leak or staff change |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Telemetry sink (if Application Insights is chosen) | Platform | Low sensitivity |
| `GROQ_API_KEY` | Only if `Ai__Enabled=true` (off at launch) | Groq console | On leak |
| Deploy: `SQL_SERVER`, `SQL_DATABASE`, `SQL_USERNAME`, `SQL_PASSWORD` | **Migration** login (DDL rights), used only by the deploy job | Platform SQL admin | After each release window if shared |
| Deploy: `DEPLOY_HOOK_URL`, `DEPLOY_HOOK_TOKEN` | Platform deploy trigger | Platform | On leak |
| Deploy: `BACKUP_EVIDENCE_ID` | Id of the pre-migration backup (not secret, but per-release) | Recorded by the operator | Every release |

## 2. Settings (not secret, still environment-specific)

| Name | Production value | Refused when |
|---|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` | — |
| `AllowedHosts` | The public host names, `;`-separated (e.g. `tafseel.sa;www.tafseel.sa`) | empty, `*`, localhost, placeholder |
| `ASPNETCORE_FORWARDEDHEADERS_ENABLED` | `true` when TLS ends at a proxy/ingress (the container image serves HTTP on 8080). **Do not set** where clients reach the app directly (IIS in-process), or clients can forge their IP | deploy gate: not `true` |
| `Cors__AllowedOrigins__0…` | Empty for the same-origin site. Only add exact `https://` origins of a separate front end | `*`, HTTP, path, localhost, placeholder |
| `Email__From` | `Tafseel <noreply@<verified domain>>` | `@resend.dev`, placeholder domain |
| `Email__AppBaseUrl` | `https://<public host>` (must be in `AllowedHosts`) | HTTP, placeholder, host not served |
| `Email__ConfirmationUrl`, `Email__PasswordResetUrl` | `https://<same host>/auth` | different host, HTTP, placeholder |
| `DataProtection__KeysPath` | Absolute path on a **durable, access-restricted** volume shared by every instance | relative path |
| `Payments__Provider` | The registered PSP adapter name (PAY-02) | `Mock`, `REPLACE_*`, unregistered |
| `Payments__Mock__Enabled`, `Payments__Mock__SimulatorEnabled` | `false` | `true` |
| `LiveSessions__Provider` | `JaaS` | `Mock` |
| `JaaS__AppId` | `vpaas-magic-cookie-…` of the owner's account | not the owner's account |
| `JaaS__KeyId` | `<AppId>/<key id>` from the JaaS console | sample key id, `StaticJwt` set |
| `FileStorage__Provider` | `AzureBlob` (or the STOR-01 adapter) | `Local` |
| `FileStorage__AzureBlob__ContainerName` | `tafseel-private` (private access level) | — |
| `MalwareScanning__Mode` | `ClamAv` | `Development` |
| `MalwareScanning__ClamAv__Host`, `__Port`, `__TimeoutSeconds` | clamd on the private network, `3310`, `120` | placeholder |
| `PayoutDestinations__ActiveKeyId` | Id of the current vault key (letters, digits, `-_.`) | missing |
| `Provisioning__BootstrapAdminEmail` | The owner's registered, confirmed email, first deploy only | — (ignored once an Admin exists) |
| `Fees__StudentFeePercent`, `Fees__TeacherCommissionPercent` | `8`, `15` (DEC-06) | out of range |
| `SeedUsers__Enabled`, `SeedDemoData__Enabled` | unset / `false` | `true` |
| `TeacherShowcases__Enabled` | `false` (V1.1) | `true` without every media gate |
| `Ai__Enabled` | `false` at launch (sends request text to a third party; needs a privacy decision) | — |

## 3. Classification of what the repository holds today (2026-09-30 scan)

| Found | Where | Class | Action |
|---|---|---|---|
| JaaS AppId `vpaas-magic-cookie-3cf9…` | `appsettings.json` | Public identifier (appears in every meeting URL) | Owner confirms it is their account |
| JaaS KeyId `…/1afb6e-SAMPLE_APP` | `appsettings.json` | Public sample value | Production refuses it |
| `local-dev-only-…` JWT/webhook values, `local-dev-dummy-token` | `Properties/launchSettings.json` | Development placeholders, not secrets | None; Production refuses their shapes |
| `ci-only-…`, `release-only-…` values | workflows | CI placeholders for `dotnet ef` design-time | None |
| Staging demo password (`@Admin123`) | `DependencyInjection.cs` staging seed path (reachable only from tests; the host runs seeding in Development only), `DEPLOYMENT_RUNBOOK.md` | Known development credential | SEC-01: rotate on every environment that ever used it; Production never seeds |
| Staging DB password, Resend token | `deploy/iis-runasp/appsettings.Staging.Host.json` (**git-ignored, never committed**) | Staging secret on a workstation | SEC-02: rotate, move to the host's settings, delete the file |
| Web-deploy password | `src/Tafseel.Api/Properties/PublishProfiles/*.pubxml.user` (**git-ignored, never committed**) | Staging deploy secret on a workstation | Rotate with SEC-02; delete the profile |
| Production secrets | — | none found | — |

The scan covered every tracked file for key, password, connection-string, private-key, token and SAS patterns; all
tracked hits were identifiers (for example `re_rejected`). Git history of the two ignored files is empty.

## 4. Handling rules

- Generate keys inside the secret store; never paste a production value into a terminal that logs, a file, or chat.
- Two people know where the payout vault key is backed up; losing it makes every sealed IBAN unreadable.
- After any suspected exposure: rotate, redeploy, confirm the old value fails, record it in the incident log.
- Logs never contain these values: the startup checks name settings, not values; failures log exception types.
