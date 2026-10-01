# Tafseel production launch readiness

**Audit date:** 2026-09-30 · **Working tree:** `feat/ux06-arabic-phone-sweep` at `75a90e1` plus the uncommitted
product-completeness work (443 changed or untracked paths), inspected as it is. **Verdict:** NOT READY FOR PUBLIC
LAUNCH (see [§8](#8-verdict); score 45 % in [§7](#7-go-live-readiness-score)).

This document replaces "percent complete" with launch evidence. It keeps three things apart:

| Question | Answer today |
|---|---|
| **A. Product complete?** | Yes, for V1 scope. All 35 launch jobs and 14 lifecycles are built (PRODUCT_COMPLETENESS_FINAL.md). |
| **B. Deployable?** | Code yes; environment no. A Production build starts only when every mandatory dependency is real and configured, and refuses otherwise with the list of what is missing. No production host, database, storage account, scanner, mail domain or payment provider exists yet. |
| **C. Public-launch ready?** | No. There is no payment provider, no production infrastructure, no legal/tax position, no alerting, and no named operators. |

The source outranks older documents. [V1_RELEASE_BLOCKERS.md](V1_RELEASE_BLOCKERS.md) (Release Control 3, 2026-09-17) is stale for
FIN-02…07, PROD-01, SEC-04 and SEC-05: those are built in the current tree. This matrix is the launch register from
2026-09-30 on.

Companion documents written in this pass:

- [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md): the checkbox list for launch day.
- [PAYMENT_PROVIDER_INTEGRATION_CONTRACT.md](PAYMENT_PROVIDER_INTEGRATION_CONTRACT.md): what PAY-02 must implement, once a provider is chosen.
- [PRODUCTION_SECRETS_CHECKLIST.md](../operations/PRODUCTION_SECRETS_CHECKLIST.md): every secret and setting name, without values.
- [DATABASE_RUNBOOK.md](../operations/DATABASE_RUNBOOK.md): migration, backup and restore, with the restore proof.
- [OBSERVABILITY_AND_ALERTS.md](../operations/OBSERVABILITY_AND_ALERTS.md): provider-neutral alert requirements.
- [DAY1_RUNBOOK.md](../operations/DAY1_RUNBOOK.md): what an operator does when something goes wrong.

---

## 1. Launch blocker matrix

Severity: **LAUNCH-BLOCKER** (cannot take real money or real users) · **MUST-BEFORE-PUBLIC-LAUNCH** · **SHOULD-BEFORE-LAUNCH** · **POST-LAUNCH**.
"Can implement now?" means from this repository, without external credentials or an owner decision.
**Fixed** means implemented in this pass (§5).

| ID | Area | Requirement | Current state | Launch severity | Can implement now? | External dependency | Evidence |
|---|---|---|---|---|---|---|---|
| L-01 | Hosting | Named provider and region for API, DB, storage, secrets, logs | Not chosen. Direction only: managed PaaS, one instance | LAUNCH-BLOCKER | No | **DEC-12**: owner + data-residency advice | V1_OWNER_DECISIONS DEC-12 |
| L-02 | Domain | Production domain; one public origin | Not chosen. Production settings hold `app.example.invalid`; policies name `support@tafseel.com` (ownership unverified) | LAUNCH-BLOCKER | No | Owner: register domain, confirm mailbox | `appsettings.Production.json`; `policies-page.component.html:28` |
| L-03 | HTTPS | TLS, redirect, HSTS, secure cookies | Code: HTTPS redirect (308) + HSTS 180 d in Production; refresh cookie `Secure`, `HttpOnly`, `SameSite=Strict`; insecure cookie refused at startup. Certificate and TLS termination are host work | MUST-BEFORE-PUBLIC-LAUNCH | Code done | Host TLS certificate; `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` behind a TLS-terminating proxy | `Program.cs:46`, `:64-74`, `:398`; `AuthController.cs:443` |
| L-04 | Database | Managed SQL Server: encryption, least-privilege login, automated backups | Not provisioned (INF-03) | LAUNCH-BLOCKER | No | DEC-12 | — |
| L-05 | Migrations | All migrations apply from zero and re-apply safely | **Proved** on SQL Server 2025 in this pass: idempotent release script from empty database, then re-applied over the latest schema; no model drift | PASS | Done | — | [DATABASE_RUNBOOK §6](../operations/DATABASE_RUNBOOK.md#6-proof-run-2026-09-30) |
| L-06 | Storage | Private object storage; authorized streaming; no public URLs | `AzureBlobFileStorageService` behind `IFileStorageService`; Production refuses `Local`; content streams through authorized endpoints with `no-store`, `nosniff`; blob names are server-generated GUIDs. No storage account | LAUNCH-BLOCKER (config) | Code ready | Storage account + private container (DEC-12). If DEC-12 is not Azure: STOR-01 adapter | `DependencyInjection.cs:386-406`; `AzureBlobFileStorageService.cs` |
| L-07 | Malware scanning | Every upload scanned before store; scanner down → upload refused | Built (SEC-04): scan-before-store decorator, ClamAV INSTREAM adapter, 120 s timeout, `Unavailable` refuses the upload, readiness Unhealthy when clamd is unreachable. Production refuses the development scanner | LAUNCH-BLOCKER (config) | Code ready | clamd host with signature updates, `StreamMaxLength ≥ 250 MB`; real-engine test (EICAR) in staging | `MalwareScanning.cs`; `ScanningFileStorageService.cs`; `MalwareScanningTests` |
| L-08 | Email | Real transactional mail from a verified domain; production links | Resend adapter; outbox with retry (5 attempts, backoff) then `Failed`; EN/AR templates; links from `Email:AppBaseUrl`. Production previously accepted placeholder URLs/sender — **fixed** (L-48) | LAUNCH-BLOCKER (config) | Code ready | Verified sending domain (SPF/DKIM/DMARC), Resend production key | `ResendEmailSender.cs`; `MessagingService.cs:495-570` |
| L-09 | Payments | Real PSP: checkout, signed webhook, refunds, reconciliation | **Mock only.** Production refuses to start without a registered real provider (correct). No PSP chosen (PAY-01). The port has no refund or refund-status call, so refunds today are ledger-only | LAUNCH-BLOCKER | No (no provider) | **PAY-01** provider + merchant account; **DEC-08** before contract | `DependencyInjection.cs:351-362`, `:484-519`; [contract](PAYMENT_PROVIDER_INTEGRATION_CONTRACT.md) |
| L-10 | Payouts | Audited payout of teacher earnings | Manual bank-transfer adapter behind `IPayoutProvider`; AES-GCM sealed IBAN vault; evidence-only completion; self-guards; audited destination reads. Host refuses to start outside Dev/Testing without vault keys | MUST-BEFORE-PUBLIC-LAUNCH | Code ready | Vault key in secret store; bank account for transfers; named Finance operator | `ManualBankTransferPayoutProvider.cs`; `PayoutDestinationVault.cs`; `PayoutLoopTests` |
| L-11 | Meeting | Real rooms, participant-only, join window | JaaS adapter: per-participant RS256 JWT scoped to one room and to the join window; teacher moderator; recording/file-upload off. A shared `StaticJwt` was accepted in Production — **fixed** (L-50). No real sandbox call yet | LAUNCH-BLOCKER (config + sandbox) | Code ready | JaaS account, RSA key pair, KeyId; two-party sandbox call | `JaasLiveSessionLinkProvider.cs`; [JAAS_LIVE_SESSIONS.md](../operations/JAAS_LIVE_SESSIONS.md) |
| L-12 | Secrets | No production secret in source; rotation of exposed ones | Tracked files: none found (scan of all tracked files; matches were identifiers). Ignored local files hold **staging** DB password, Resend token and a deploy password (`deploy/iis-runasp/appsettings.Staging.Host.json`, a `.pubxml.user`); never in git history. SEC-01/SEC-02 rotation not evidenced | LAUNCH-BLOCKER (SEC-01/02) | No | Owner rotates and confirms old values fail | [PRODUCTION_SECRETS_CHECKLIST](../operations/PRODUCTION_SECRETS_CHECKLIST.md) |
| L-13 | Encryption keys | Durable Data Protection key ring; payout vault keys | Key ring on filesystem path. Production now requires an **absolute** path (fixed). In the container image the default path is ephemeral: it must be a mounted durable volume or keys are lost on restart (email/reset links break) | MUST-BEFORE-PUBLIC-LAUNCH | Guard done | Durable volume or key store (INF-04) | `DependencyInjection.cs:254-259` |
| L-14 | Authentication | Strong passwords, lockout, confirmation, revocation | 10-char complex passwords; lockout 5 / 15 min; confirmed email required; refresh tokens persisted and rotated; security stamp checked on every request; suspended users refused; email-enumeration fixed | PASS | — | — | `DependencyInjection.cs:261-274`; `Program.cs:147-155`; `MfaLockoutAndEnumerationTests` |
| L-15 | Privileged MFA | MFA for Admin, Finance, QualityReviewer | TOTP MFA exists in the API and the sign-in form accepts a code, but there is **no enrollment screen and no enforcement** for any role | MUST-BEFORE-PUBLIC-LAUNCH (decision) | No (policy) | **SECURITY DECISION** (§6) | `AuthenticationService.cs:161-174`, `:503` |
| L-16 | Authorization | Permission per action; resource by id **and** caller | Permission policies on every action; participant queries return 404 to outsiders; self-processing guards on money | PASS (see test results) | — | — | `Authorization.cs`; SQL Server suite (§4) |
| L-17 | Rate limiting | Abuse-sensitive endpoints limited; webhooks not naively IP-blocked | Policies: auth 10/min/IP, confirmation 3/15 min, upload 10/h/user, payment 10/min/user, messaging 30/min, AI 10/min, global 300/min. **Provider webhooks shared the 10/min payment bucket** — a PSP retry burst would be refused — **fixed** (own policy) | PASS after fix | Done | — | `Program.cs` rate limiter; `PaymentsController.cs` |
| L-18 | CORS | Exact HTTPS origins; no `*` | Explicit origins with credentials. Production accepted the placeholder origin — **fixed** (guard rejects `*`, HTTP, localhost, placeholder domains) | PASS after fix | Done | Real origin (L-02) | `ProductionConfigurationGuard.cs` |
| L-19 | Headers | HSTS, CSP, nosniff, Referrer, Permissions, frame | All present. CSP: `default-src 'self'`, script hashes (no `unsafe-inline` scripts), JaaS origin only when JaaS is on, `frame-ancestors 'none'`, `upgrade-insecure-requests`. `style-src 'unsafe-inline'` remains (Angular inline styles) | PASS | — | A PSP with hosted fields/iframe will need its origin in `script-src`/`frame-src` (PAY-02) | `Program.cs:346-390` |
| L-20 | CSRF | State-changing calls not forgeable | API calls use a bearer token in the `Authorization` header; the only cookie (refresh) is `SameSite=Strict`, `HttpOnly`, path-scoped | PASS (not applicable to bearer calls) | — | — | `AuthController.cs:440-447` |
| L-21 | File security | Private, authorized, typed, sized, scanned | Content endpoints authorize the caller, stream with `private, no-store`, `nosniff`, same-origin CORP; type/size rules in `PrivateMediaRules`; scanning before store | PASS | — | — | `PrivateMediaRules.cs`; DEC-11 note |
| L-22 | Logging | Structured, correlated, no secrets | Serilog structured console; `X-Correlation-Id` middleware; problem details carry `traceId`/`correlationId`; request logs carry path only (no query string, so the SignalR `access_token` is not logged); failures log type names, not tokens | PASS | — | Log sink (DEC-12) | `CorrelationIdMiddleware.cs`; `ApiExceptionHandler.cs` |
| L-23 | Monitoring / error tracking | Central errors, metrics, traces | Application Insights wiring is opt-in by connection string; `Tafseel.Workers` meter. No vendor chosen | MUST-BEFORE-PUBLIC-LAUNCH | Code ready | OBS-01 vendor (DEC-12) | `Program.cs:76-86` |
| L-24 | Alerting | Actionable alerts with an owner | None configured. Provider-neutral requirements written | LAUNCH-BLOCKER | Requirements done | Vendor + on-call owner | [OBSERVABILITY_AND_ALERTS.md](../operations/OBSERVABILITY_AND_ALERTS.md) |
| L-25 | Health checks | Liveness vs readiness, no sensitive detail | `/health/live` (process only); `/health/ready`: database, storage, scanner (Unhealthy) and workers (Degraded). **Added** operational-backlog check: failed/overdue email and open reconciliation cases (Degraded). Responses are the status word only | PASS | Done | — | `Program.cs` health registration; `OperationalBacklogHealthCheck.cs` |
| L-26 | Backups | Automated database backups; object versioning | Not provisioned. Procedure and repeatable drill script written | LAUNCH-BLOCKER | Procedure done | Managed backups + blob soft delete/versioning (DEC-12) | [DATABASE_RUNBOOK](../operations/DATABASE_RUNBOOK.md) |
| L-27 | Restore | Proven restore into a clean environment | **Proved on SQL Server (non-production data)** in this pass: full backup with checksum → verify → restore to a new database → `DBCC CHECKDB` → identical row counts and migration history. Production drill still required on the chosen platform | MUST-BEFORE-PUBLIC-LAUNCH | Local proof done | Production platform drill (REL-01) | [DATABASE_RUNBOOK §6](../operations/DATABASE_RUNBOOK.md#6-proof-run-2026-09-30) |
| L-28 | Database maintenance | Statistics/index maintenance, retention | `DataRetentionWorker` prunes notifications, auth records, analytics on configured windows. No index/statistics job | SHOULD-BEFORE-LAUNCH | No (platform) | Managed DB automatic tuning or a weekly job | `DataRetentionWorker.cs` |
| L-29 | Jobs | Money/deadline workers observable, single run | Six in-process hosted workers with heartbeats; Degraded readiness after two missed intervals; Error log after 3 failures. Designed for **one instance** (DEC-12 direction) | PASS for one instance | — | Re-check before scale-out | `WorkerHeartbeats.cs` |
| L-30 | Webhooks | Signed, deduplicated, persisted | HMAC verification (mock); event id + payload hash persisted; Serializable + application lock; duplicate event is a no-op. **Gap for a real PSP:** a *successful* capture arriving after an open-request reservation expired is refused (400), so money captured at the PSP has no order — PAY-02 must route it to a refund or exception | MUST (PAY-02) | No (protected finance code; needs PSP) | PAY-02 | `FinancialService.cs:187-230`; [contract §5](PAYMENT_PROVIDER_INTEGRATION_CONTRACT.md#5-edge-cases-the-adapter-must-handle) |
| L-31 | Idempotency | Money calls replay-safe | `Idempotency-Key` with unique indexes on payments, refunds, withdrawals, dispute resolution | PASS | — | — | Finance tests |
| L-32 | Provider callbacks | Browser return never proves payment | Payment is confirmed only by a verified webhook; the return page reads server state | PASS by design | — | PSP return URL on the production domain | `FinancialService.ProcessWebhookAsync` |
| L-33 | Legal pages | Terms, Privacy, Refund/Cancellation, Teacher, Integrity, Disputes (EN/AR) | Six policies published in both languages (v2026-08-12) and consistent with the implemented rules (7-day dispute window, 72 h auto-completion, 24 h session cancellation). **Not legally reviewed.** Missing: legal entity and registration, governing law, controller and data location, retention periods, personal-use/copyright of deliveries (DEC-11), payout timing | LAUNCH-BLOCKER | No | **LEG-01** legal review; DEC-08; DEC-12 | `static-policy.repository.ts` |
| L-34 | Tax / VAT | Tax position of the platform fee, commission and teacher sales | Undecided. No tax logic exists | LAUNCH-BLOCKER | No | **DEC-08** qualified Saudi tax advice | V1_OWNER_DECISIONS DEC-08 |
| L-35 | E-invoicing | Invoice/receipt obligation and format | Undecided. No invoice or receipt document is produced | LAUNCH-BLOCKER | No | DEC-08 | — |
| L-36 | Production admin | First Admin without shared credentials | `dotnet Tafseel.Api.dll provision` creates reference data and promotes `Provisioning:BootstrapAdminEmail` (a registered, confirmed account) only while no Admin exists; audited. The production workflow did not run it — **fixed** | PASS after fix | Done | Named owner email | `DependencyInjection.cs:743-789`; `deploy-production.yml` |
| L-37 | Finance setup | Named Finance operator(s) | Admin assigns the Finance role in People; vault key required | MUST-BEFORE-PUBLIC-LAUNCH | No | Named person(s) | [DAY1_RUNBOOK §1](../operations/DAY1_RUNBOOK.md#1-day-1-accounts) |
| L-38 | Reviewer setup | Named Quality reviewer(s) | Admin assigns QualityReviewer; self-review is blocked | MUST-BEFORE-PUBLIC-LAUNCH | No | Named person(s) | same |
| L-39 | Support intake | Somewhere for help and abuse reports | `/help` cases (signed in and account-access) → Admin queue `/admin/help` (`Support.Cases.Manage`). Policy contact mailbox unverified | MUST-BEFORE-PUBLIC-LAUNCH | No | Named Admin owner; working mailbox | `SupportController.cs` |
| L-40 | CI/CD | Deterministic gates before release | CI: format, build, architecture/domain/application/integration, SQL Server suite, API contract, Angular tests (+ locale and style guards), browser journeys, publish + migration drift. Security: dependency audit. Release: all of these, SBOM, idempotent script, signed digest. Gaps **fixed**: contract check now `--strict`; stale infrastructure check repaired and added; deploy config check extended | PASS after fix | Done | GitHub `production` environment with reviewers (INF-02) | `.github/workflows/*.yml` |
| L-41 | Production deployment | Reproducible, no manual copying | Immutable image by digest → approval → idempotent migration with backup evidence → provision → deploy hook → smoke → automatic image rollback on failed smoke. Target platform and deploy hook do not exist | LAUNCH-BLOCKER | Workflow done | INF-07 deploy target (DEC-12) | `deploy-production.yml` |
| L-42 | Rollback | Documented, honest | Application: previous image by digest. Database: never rolled back automatically; migrations must be backward-compatible with the previous release (expand/contract), otherwise restore from backup | MUST-BEFORE-PUBLIC-LAUNCH | Docs done | Drill on staging (REL-01) | [DATABASE_RUNBOOK §5](../operations/DATABASE_RUNBOOK.md#5-rollback) |
| L-43 | Smoke test | Post-deploy proof | Health, both locales, config file not served, anonymous `auth/me` = 401 | SHOULD-BEFORE-LAUNCH (extend with a real sign-in and a sandbox payment in staging) | Partly | — | `deploy-production.yml` |
| L-44 | Incident response | Detect, own, act, escalate | DAY1 runbook written. No on-call owner, no status page, no escalation contacts | MUST-BEFORE-PUBLIC-LAUNCH | Docs done | Named on-call owner | [DAY1_RUNBOOK](../operations/DAY1_RUNBOOK.md) |
| L-45 | Staging | Production-like rehearsal | The current staging host (RunASP, IIS) runs mocks and local disk; it proves the app, not the providers | MUST-BEFORE-PUBLIC-LAUNCH | Plan done (§3) | DEC-12, sandbox accounts | [deploy/RUNASP-STAGING.md](../../deploy/RUNASP-STAGING.md) |
| L-46 | Demo accounts | No known credentials in Production | Demo users are seeded only by the Development startup path; Production never runs it. **Added:** Production refuses `SeedUsers:Enabled` / `SeedDemoData:Enabled` | PASS after fix | Done | — | `ProductionConfigurationGuard.cs` |
| L-47 | Performance | Initial bundle headroom | Initial 693.57 kB raw / 142 kB transfer against a 700 kB warning (ENG-01) | SHOULD-BEFORE-LAUNCH | Yes (not done: product/UI work is frozen) | — | build output 2026-09-30 |
| L-48 | Host filtering / production config | Production must refuse placeholder or local values | `AllowedHosts` was inherited as `localhost;127.0.0.1` (every real request would get 400); placeholder CORS, email sender and URLs (`*.example`, `*.invalid`) passed validation; LocalDB connection string, relative key path and a non-Resend token were accepted — **fixed**: `ProductionConfigurationGuard` refuses start and lists every problem | PASS after fix | Done | Real values | `ProductionConfigurationGuard.cs`; `ProductionConfigurationGuardTests` |
| L-49 | Forwarded headers | Correct scheme and client IP behind a proxy | Not configured in code; the framework switch `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` must be set on proxy hosts (otherwise HTTPS redirect loops and all anonymous users share one rate-limit bucket). Must **not** be set where clients reach Kestrel/IIS directly | MUST-BEFORE-PUBLIC-LAUNCH (config) | Documented | Host choice | [PRODUCTION_SECRETS_CHECKLIST](../operations/PRODUCTION_SECRETS_CHECKLIST.md) |
| L-50 | Meeting access | No shared meeting credential in Production | `JaaS:StaticJwt` (one token for everyone) was accepted in Production — **fixed**: Production requires per-participant signing and refuses the JaaS sample Key ID | PASS after fix | Done | — | `DependencyInjection.cs` JaaS validation; `ConfigurationValidationTests` |
| L-51 | Payment-exception backlog | Operators see stuck money | Finance reconciliation cases and payment trail screens exist; readiness now Degraded while a reconciliation case is open | PASS | Done | Alert routing (L-24) | `OperationalBacklogHealthCheck.cs` |

| L-52 | Large uploads | A teacher's 3-minute demo/intro video up to the promised 250 MB reaches the scanner | Endpoints allowed 250 MB but bound `IFormFile` under ASP.NET Core's default 128 MiB multipart limit, so videos of 128–250 MB failed — **fixed** on the demo, intro, sample and showcase uploads, with a test that every upload above 128 MiB raises its form limit. Proxy must allow ≥ 300 MB bodies and ≥ 5 min requests; the scanner spools to temp disk | PASS after fix (proxy config pending) | Done | Proxy limits (DEC-12) | `MarketplaceController.cs`, `TeacherApplicationsController.cs`; `ProductionConfigurationGuardTests` |

**Count:** 15 LAUNCH-BLOCKERs, all external or owner-dependent (L-01, 02, 04, 06, 07, 08, 09, 11, 12, 24, 26, 33, 34, 35, 41).
No LAUNCH-BLOCKER remains that code in this repository can close.

---

## 2. External blockers, precisely

Each needs something only the owner can supply. **CODE STATE** says whether the repository is ready to receive it.

**BLOCKED: Hosting and region (DEC-12)**
NEEDED FROM OWNER: provider name; region; confirmation from data-residency advice that the region is acceptable for Saudi
users' personal and payment data; billing account; who holds the root account.
CODE STATE: READY (container image, idempotent migration script, health endpoints, provider-neutral deploy hook).
NEXT ACTION: decide DEC-12, then provision SQL, storage, secret store, log sink and the deploy hook (INF-03, INF-04, INF-07).

**BLOCKED: Real payment provider (PAY-01 → PAY-02 → PAY-03)**
NEEDED FROM OWNER: provider name (evaluate at least Moyasar and Tap Payments, including marketplace/payout capability);
signed merchant agreement (after DEC-08); sandbox account; merchant id; publishable key; secret key; webhook signing
secret; allowed callback/return domain (the production origin); settlement bank account; supported methods (mada, cards,
Apple Pay) and their fees.
CODE STATE: NOT READY — no adapter exists. The port, webhook route, idempotency, ledger and Production fail-closed guard
are ready. The adapter needs a refund call the port does not have yet.
NEXT ACTION: choose the provider, then implement PAY-02 against [the contract](PAYMENT_PROVIDER_INTEGRATION_CONTRACT.md)
and run PAY-03 in its sandbox.

**BLOCKED: Payouts (PAY-04a, launch mode = manual)**
NEEDED FROM OWNER: a 32-byte random vault key in the secret store (`PayoutDestinations:ActiveKeyId` and
`PayoutDestinations:Keys:<id>`); the company bank account that sends transfers; the named Finance operator(s); confirmation
that manual audited payouts are the launch mode (DEC-04 says yes).
CODE STATE: READY.
NEXT ACTION: generate the key in the secret store (never in a file), run one staging payout drill end to end.

**BLOCKED: Meeting provider (MEET-01)**
NEEDED FROM OWNER: JaaS account on a paid or trial plan; confirm the AppId in `appsettings.json` is the owner's account;
RSA key pair generated by the owner; the public key uploaded to JaaS; its Key ID; the private PEM in the secret store.
CODE STATE: READY.
NEXT ACTION: configure staging with the key, run the two-party sandbox call in [JAAS_LIVE_SESSIONS.md](../operations/JAAS_LIVE_SESSIONS.md#verify-with-a-jaas-sandbox).

**BLOCKED: Email (INF-06)**
NEEDED FROM OWNER: the sending domain; DNS access to add Resend's SPF, DKIM and DMARC records; a Resend production API
key; the From name and address (for example `Tafseel <noreply@<domain>>`); a monitored reply mailbox.
CODE STATE: READY (sender, templates EN/AR, outbox retry; Production refuses the Resend sandbox sender and placeholder URLs).
NEXT ACTION: verify the domain in Resend, send confirmation and reset emails from staging.

**BLOCKED: Object storage (INF-05)**
NEEDED FROM OWNER: storage account (Azure Blob if DEC-12 is Azure); a private container `tafseel-private`; its connection
string in the secret store; soft delete and versioning switched on.
CODE STATE: READY for Azure Blob. NOT READY if DEC-12 picks a non-Azure store (STOR-01: an S3-compatible adapter behind
`IFileStorageService`, about 2 days).
NEXT ACTION: provision after DEC-12; verify anonymous access to the container fails.

**BLOCKED: Malware scanner (SEC-04 host)**
NEEDED FROM OWNER: a clamd host reachable only from the API network (for example the official `clamav/clamav` image as a
sidecar); `StreamMaxLength` ≥ 250 MB; freshclam signature updates enabled.
CODE STATE: READY (fail-safe; readiness Unhealthy when clamd is down).
NEXT ACTION: deploy clamd in staging; upload the EICAR test file and a clean file; stop clamd and confirm uploads are refused.

**BLOCKED: Monitoring and alerts (OBS-01, OBS-02)**
NEEDED FROM OWNER: the vendor (Application Insights is wired; any OpenTelemetry-capable sink works); the on-call person;
where alerts go (email/phone).
CODE STATE: READY (structured logs, correlation ids, meter, readiness checks).
NEXT ACTION: create the alerts in [OBSERVABILITY_AND_ALERTS.md](../operations/OBSERVABILITY_AND_ALERTS.md) and send a test alert.

**BLOCKED: Legal and tax (LEG-01, DEC-08)**
NEEDED FROM OWNER: legal entity name and commercial registration; VAT registration status; qualified Saudi tax advice on
the platform fee, commission and teacher sales (DEC-08); whether receipts or e-invoices must be issued and in what format;
lawyer-reviewed Terms, Privacy, Refund/Cancellation and Teacher Agreement in Arabic and English; retention periods.
CODE STATE: policy pages exist and render both languages; NO tax or invoice logic (by design until decided).
NEXT ACTION: send the six policy texts and §6 questions to counsel.

**BLOCKED: Credential rotation (SEC-01, SEC-02)**
NEEDED FROM OWNER: confirmation that the old seed/UAT password and the four staging host secrets were replaced, every
affected account reset, and old values fail.
CODE STATE: READY (no secret in tracked files).
NEXT ACTION: rotate; also move the local `deploy/iis-runasp/appsettings.Staging.Host.json` values into the host's secret
settings and delete the local copy.

---

## 3. Deployment architecture (provider-neutral)

The simplest thing that works for one instance. No Kubernetes.

```
Browser ──HTTPS──▶ TLS-terminating front (PaaS ingress / reverse proxy)
                     │  X-Forwarded-For/Proto (ASPNETCORE_FORWARDEDHEADERS_ENABLED=true)
                     ▼
               Tafseel container (one instance, port 8080)
               ├─ serves the Angular client (ar/, en/) and /api, /hubs, /health
               ├─ in-process workers (money deadlines, outbox, retention)
               ├──▶ managed SQL Server (private network, TLS, least-privilege login)
               ├──▶ private object storage (container tafseel-private)
               ├──▶ clamd (private network, TCP 3310)
               ├──▶ Resend (HTTPS out)          ├──▶ JaaS (browser joins 8x8.vc with a server-signed JWT)
               └──▶ PSP API (HTTPS out)  ◀── PSP webhooks POST /api/v1/payments/webhooks/{provider}
Secrets: platform secret store → environment variables. Logs/metrics: platform sink or OpenTelemetry.
```

| Part | Choice | Notes |
|---|---|---|
| Frontend hosting | Same container as the API | One origin: no CORS needed for the site itself; `Cors:AllowedOrigins` may stay empty |
| API hosting | The release image (`ghcr.io/…/tafseel@sha256:…`) on a managed container/app platform | Health probe `/health/ready`; liveness `/health/live` |
| SQL Server | Managed SQL Server-compatible database with point-in-time restore | App login: `db_datareader`, `db_datawriter`, `EXECUTE`; migrations run with a separate DDL login |
| Object storage | Private container; soft delete + versioning | Only the API reads it |
| Scanner | clamd sidecar or private service | Never public |
| Email | Resend | Outbound HTTPS only |
| Payment callbacks | `POST https://<domain>/api/v1/payments/webhooks/<provider>` | Public; authenticated by signature |
| Meeting | JaaS | No inbound callback: settlement is Tafseel's own lifecycle |
| Network | Inbound 443 only; outbound 443 (Resend, PSP, JaaS), 1433 (SQL), 3310 (clamd) | Proxy: request body ≥ 300 MB, request timeout ≥ 5 min (video uploads), WebSockets on for `/hubs/messages` |
| Disk | Writable temp directory with room for concurrent uploads (each up to 250 MB is spooled once for scanning) | The container runs as non-root; `/tmp` is writable |

**Staging plan.** Same image, same platform, same database engine; its own database, storage container, clamd, Resend
domain (or subdomain), PSP **sandbox** keys and JaaS keys. `ASPNETCORE_ENVIRONMENT=Staging` (not indexable). Mocks stay
for local development only; they cannot certify a provider. QA-01 runs here on a fresh database.

---

## 4. Test evidence (this pass)

Runs on 2026-09-30, SQL Server 2025 Developer on the audit machine, Release configuration.

| Gate | Result |
|---|---|
| `dotnet build Tafseel.sln -c Release` | 0 warnings, 0 errors |
| Domain / Application / Architecture | 151/151 · 14/14 · 1/1 |
| Integration, full suite (SQLite + SQL Server, incl. `PromotionsTests`) | 748/749 in the full run; the one failure was a stale expectation (4 staging demo users; the Finance demo user makes 5), fixed and re-run: `RoleBootstrapTests` 10/10 |
| SQL Server category alone, before any change in this pass | 264/264, including the four tests never run before |
| New tests (guard, JaaS, webhook policy, upload form limits, backlog health) | all pass |
| Angular unit tests (+ locale, style, UX-06, skip-link guards) | 607/607 in 72 files; 1827 keys, 378 server codes in EN and AR |
| API contract `--strict` | 296 shapes, 296 routes, 0 violations |
| Dependency audit | 0 vulnerabilities |
| Production-infrastructure structural check | passes (repaired; was failing on a stale assertion) |
| `dotnet format --verify-no-changes` | 1 file fails: `IntroVideoService.cs:174` whitespace (edited in parallel; not touched) |
| Browser journeys, published Release build, fresh SQL Server database each, mock providers | **27/27**: 22 in the first run; `uat-button-sweep`, `uat-operations`, `uat-promo-controls` were interrupted when the machine suspended networking (`ERR_NETWORK_IO_SUSPENDED`) and passed on re-run; `ux03-navigation`, `ux04-product-words`, `uat-operations` expected the pre-D-08 settings pages and passed after their expectations were moved to `/account` (and the Quality nav link now points at `/account` instead of a redirect) |
| Migrations from zero / re-apply / upgrade 40→49 | pass (with `sqlcmd -I`) |
| Backup/restore drills | 2/2 PASS |

**Production-like UAT coverage** (journeys above, EN desktop and AR 390 px where the journey covers both): visitor browse
and filters; student and teacher registration and confirmation; teacher qualification and a second subject; intro
video; direct request, acceptance, agreed-price disclosure, payment (mock), delivery, revision, completion; open
request, offers, reservation, payment; messaging and files; live session request, teacher approval, payment, join
(mock room), settlement, review; disputes with refund and release; help case and account-access intake; Finance
payment lookup, refund, payout-detail verification, withdrawal with evidence; account settings; Admin people,
operations, marketing; the every-button sweep for Visitor, Student, Teacher, QualityReviewer, Admin and Finance in
English desktop and Arabic phone. **Not covered: any real provider** (payment, meeting, email, storage, scanner) —
that is QA-01 on staging.

---

## 5. Implemented in this pass

1. **`ProductionConfigurationGuard`** (Production only, before the host starts): refuses `AllowedHosts` that is empty, `*`
   or local; CORS origins that are not exact HTTPS or are local or placeholder; placeholder or local email sender and
   links, links on a host the site does not answer; a LocalDB or placeholder connection string; a relative Data
   Protection key path; a Resend key that is not a live key format; a short webhook secret; demo seeding switched on. It
   lists every problem at once.
2. **JaaS in Production** requires per-participant signing (no `StaticJwt`) and refuses the sample Key ID.
3. **Webhook rate limit**: provider webhooks have their own per-source policy instead of the 10/min checkout bucket.
4. **Operational backlog readiness check**: Degraded when an email has permanently failed in the last 24 h, when
   emails are overdue by more than 30 minutes, or when a reconciliation case is open.
5. **CI/CD**: API contract check `--strict` in CI; the stale production-infrastructure check repaired and added to CI;
   the production deploy now runs `provision` after the migration and validates the complete list of production settings.
6. **Production migration step fixed:** `sqlcmd` now runs with `-I`. Without it (the ODBC tools default to
   `QUOTED_IDENTIFIER OFF`) the first filtered index fails and the release's migration would have stopped on the first
   production deploy. Found by applying the release script to an empty SQL Server database.
7. **Large video uploads** (L-52): the four 250 MB endpoints now raise the multipart form limit; a test guards every
   upload above 128 MiB.
8. **Backup/restore drill script** `scripts/ops/Test-TafseelBackupRestore.ps1`, run against a fresh, migrated database
   and a journey database.
9. **Journey and test drift from the completeness pass**, aligned with decided behaviour, not fenced: `ux03`, `ux04`,
   `uat-operations` now expect the shared `/account` screen (D-08); the Quality nav's Account item links to `/account`
   instead of a redirect; `RoleBootstrapTests` counts the Finance demo user (D-02).
10. Launch documents listed at the top.

---

## 6. Owner decisions required

| # | Decision | Why | Exact value needed | Blocks |
|---|---|---|---|---|
| 1 | DEC-12 hosting provider and region | Nothing can be provisioned | Provider, region, residency sign-off | L-01, 04, 06, 07, 13, 23, 24, 26, 41 |
| 2 | Production domain | Links, cookies, CORS, PSP callbacks, email domain | e.g. `tafseel.sa` and the app origin | L-02, 08, 09, 18 |
| 3 | DEC-08 VAT and e-invoicing | Checkout wording, receipts, PSP contract | Written tax position | L-09, 33, 34, 35 |
| 4 | PAY-01 payment provider | Real money | Provider + credentials (§2) | L-09, 30 |
| 5 | Privileged-account MFA | Admin and Finance can move or refund money; one password is the only barrier | "Mandatory for Admin/Finance/QualityReviewer at launch" (needs enrollment screen + enforcement, about 3 days) **or** "accepted risk until V1.1" with compensating controls (named accounts, strong unique passwords, lockout, audit review) | L-15 |
| 6 | On-call owner and escalation | Alerts need a person | Name, contact, hours | L-24, 44 |
| 7 | Day-1 operators | Least privilege | Names for Admin (≥2, so one can be suspended safely), Finance, QualityReviewer | L-36…39 |
| 8 | RPO/RTO | Backup configuration | Confirm or change the PROPOSED ≤15 min / ≤4 h | L-26, 27 |
| 9 | Retention periods | Privacy policy; storage cost | Days for help cases, intro videos, scan records, deleted-account data | L-33 |
| 10 | Support mailbox | Policies publish it | A working, monitored address on the owned domain | L-39 |

---

## 7. Go-live readiness score

Not the product-completeness percentage. Each area is scored on launch evidence; weights reflect what stops real
users and real money.

| Area | Weight | Score | Why |
|---|---:|---:|---|
| Application / product | 15 | 90 % | Complete and tested; one format violation; bundle headroom thin; MFA undecided |
| Providers | 20 | 30 % | Payment not implemented (no provider); meeting, email, storage, scanner code-ready but unconfigured; payouts manual and ready |
| Infrastructure | 15 | 25 % | Image, workflows, migration/provision steps ready; nothing provisioned; no domain |
| Security | 10 | 65 % | Strong application controls; rotation unevidenced; privileged MFA undecided; no external test |
| Data / backup | 10 | 55 % | Migrations and restore proven locally; no production backups |
| Observability | 10 | 40 % | Signals, readiness and alert set defined; no vendor, alerts or on-call |
| Operations | 5 | 45 % | Roles, provisioning and Day-1 runbook defined; no named people |
| Legal / policy | 10 | 15 % | Pages exist; not reviewed; tax undecided |
| Production QA | 5 | 45 % | Every automated suite and 27/27 journeys green on mocks; no sandbox-provider run |
| **Total** | **100** | **45 %** | |

## 8. Verdict

**NOT READY FOR PUBLIC LAUNCH.** The code is launch-grade for V1 and refuses to start in Production with anything
fake or missing. What separates Tafseel from launch is outside the repository: a payment provider, a host and region,
the production domain and mail domain, storage and scanner hosting, monitoring with an on-call person, the legal and tax
position, credential rotation, and a staging rehearsal (QA-01) with sandbox providers.
