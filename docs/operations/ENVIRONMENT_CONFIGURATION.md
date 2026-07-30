# Environment Configuration Matrix

## Environments

| Environment | ASPNETCORE_ENVIRONMENT | Storage | Payments | Live sessions | Email |
|---|---|---|---|---|---|
| Development | Development | Local | Mock + **simulator on** | Mock | Development outbox |
| Testing | Testing | Local | Mock (simulator off by default) | Mock | Test double |
| Staging | Staging | Prefer AzureBlob | Mock (simulator **off** unless explicit) or sandbox PSP | Prefer real sandbox meeting | Resend verified |
| Production | Production | **AzureBlob required** | **Real provider required** (Mock + simulator **forbidden**) | **Real provider required** | Resend verified HTTPS URLs |

Production boot **fail-closes** if Mock payment/live-session providers are selected or if Local storage is selected. Real PSP/meeting adapters must be registered in code before Production can start with those provider names.

## Configuration matrix (selected keys)

| Key | Dev | Production |
|---|---|---|
| `ConnectionStrings__Tafseel` | LocalDB / SQL | Azure SQL secret |
| `Jwt__SigningKey` | Dev secret ≥32 | Secret store, non-dev |
| `FileStorage__Provider` | `Local` | `AzureBlob` |
| `FileStorage__AzureBlob__ConnectionString` | unused | Secret store |
| `FileStorage__AzureBlob__ContainerName` | n/a | `tafseel-private` (private) |
| `Payments__Provider` | `Mock` | Registered real name |
| `Payments__WebhookSecret` | ≥32 chars | PSP secret |
| `Payments__Mock__Enabled` | `true` | must be `false` / unused |
| `Payments__Mock__SimulatorEnabled` | `true` (Dev) | **forbidden** (`true` fails gate) |
| `LiveSessions__Provider` | `Mock` | `Zoom` / `GoogleMeet` / `MicrosoftTeams` (when registered) |
| `Resend__ApiToken` | optional | required |
| `Email__From` | may use sandbox in Dev | verified sender |
| `Cors__AllowedOrigins__0` | localhost HTTPS | exact HTTPS origin |
| `DataProtection__KeysPath` | relative OK | absolute durable |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | optional | recommended |
| `TeacherShowcases__Enabled` | optional | only with ADR-011 gates true |

## Secrets matrix

| Secret | Where | Rotate |
|---|---|---|
| SQL connection string | Azure App Settings / Key Vault | On personnel change / leak |
| JWT signing key | Key Vault | Planned rotation window |
| Resend API token | Key Vault | On leak |
| Payment webhook secret | Key Vault | With PSP dashboard |
| Azure Blob connection string | Key Vault | Prefer RBAC + managed identity later |
| App Insights connection string | App Settings | Low sensitivity; still protect |

Never commit secrets. Production placeholders (`REPLACE_*`) must not remain at runtime.

## Operational dependencies

- Azure App Service (or equivalent) for API
- Azure SQL
- Azure Blob Storage (private)
- Resend (transactional email)
- Payment PSP (TBD registration)
- Meeting provider (Zoom and/or Google Meet and/or Teams — TBD)
- Application Insights (recommended)
- GitHub Actions OIDC to Azure for deploy

## Supported browsers

- Last two stable versions of Chrome, Edge, Firefox, Safari
- Mobile Safari / Chrome Android for Student/Teacher primary flows
- No IE support

## Supported devices

- Desktop ≥1280px for Admin/Quality dense tables
- Tablet ≥768px for Teacher/Student dashboards
- Phone ≥375px for Student booking/pay and Teacher queue actions

## Provider registration status

| Provider slot | Status |
|---|---|
| FileStorage Local | Implemented (Dev/Testing) |
| FileStorage AzureBlob | Implemented (Production-prepared) |
| Payments Mock | Implemented (non-Production) |
| Payments real PSP | **Not registered** — Production blocked |
| LiveSessions Mock | Implemented (non-Production) |
| LiveSessions Zoom | Name reserved — **not implemented** |
| LiveSessions GoogleMeet | Name reserved — **not implemented** |
| LiveSessions MicrosoftTeams | Name reserved — **not implemented** |
