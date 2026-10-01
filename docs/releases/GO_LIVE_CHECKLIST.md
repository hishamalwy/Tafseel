# Tafseel go-live checklist

State on **2026-09-30** (launch-readiness pass). Every line is `[PASS]`, `[BLOCKED]` or `[NOT APPLICABLE]`; a
`[BLOCKED]` line names what unblocks it. Launch only when no line is `[BLOCKED]`. Details and evidence:
[PRODUCTION_LAUNCH_READINESS.md](PRODUCTION_LAUNCH_READINESS.md) (L-xx ids).

**Summary: 62 PASS · 53 BLOCKED · 4 NOT APPLICABLE.** Verdict: NOT READY FOR PUBLIC LAUNCH.

## APPLICATION

- [PASS] V1 product scope built: 35 launch jobs, 14 lifecycles (PRODUCT_COMPLETENESS_FINAL)
- [PASS] Release build and publish succeed; Angular client served per locale (`ar`, `en`)
- [PASS] Production refuses mock payment, mock meeting, simulator, local storage, development scanner (L-48, startup proof in DATABASE_RUNBOOK §6)
- [PASS] Production refuses placeholder/local/demo settings and names each one (`ProductionConfigurationGuard`, L-48)
- [PASS] No Development shortcuts in Production: Swagger, demo seeding and startup migration run in Development only
- [PASS] Errors return problem details with `traceId`/`correlationId`, no stack traces
- [BLOCKED] `dotnet format --verify-no-changes` clean — one whitespace violation in `IntroVideoService.cs:174` (product-completeness work, edited in parallel during this pass; not touched). Unblock: `dotnet format whitespace --include src/Tafseel.Infrastructure/Marketplace/IntroVideoService.cs`
- [BLOCKED] Initial bundle headroom (ENG-01): 693.6 kB of a 700 kB warning. SHOULD, not a hard blocker; unblock with the ENG-01 split

## DATABASE

- [PASS] All 49 migrations apply to an empty SQL Server database from the release's idempotent script
- [PASS] Re-applying the script over the latest schema is a no-op
- [PASS] Upgrade from the last committed schema (40 → 49) succeeds
- [PASS] No model drift (`has-pending-model-changes`)
- [PASS] 9 new migrations pass the destructive-change gate (0 warnings)
- [PASS] Production migration step uses `sqlcmd -I` (fixed: without it the filtered indexes fail)
- [PASS] `provision` creates roles, DEC-01 catalog policy, languages; bootstrap Admin only when none exists
- [BLOCKED] Production SQL Server provisioned (encryption, least-privilege logins, PITR) — DEC-12 → INF-03
- [BLOCKED] Production migration applied with backup evidence (DATA-01) — INF-03

## PAYMENTS

- [PASS] Payment lifecycle, escrow, ledger, idempotency and webhook deduplication (tests)
- [PASS] Browser return never confirms a payment; only a signed webhook does
- [PASS] Webhooks have their own rate-limit policy (not the 10/min checkout bucket)
- [BLOCKED] Payment provider selected and contracted — PAY-01 (after DEC-08)
- [BLOCKED] Provider adapter implemented incl. provider refunds and unknown-event handling — PAY-02 ([contract](PAYMENT_PROVIDER_INTEGRATION_CONTRACT.md))
- [BLOCKED] Captured-after-reservation-expiry handled (refund or exception case) — PAY-02
- [BLOCKED] Sandbox scenarios 1–14 proven with reconciliation clean — PAY-03
- [BLOCKED] Webhook URL and return domain registered at the provider — PAY-01 + domain

## PAYOUTS

- [PASS] `IPayoutProvider` with the audited manual bank-transfer adapter (DEC-04 launch mode)
- [PASS] IBANs sealed with AES-GCM; masked for teachers; full read only by audited Finance/Admin action
- [PASS] Evidence-only completion; self-processing guards; payout loop journey passes (fin02)
- [NOT APPLICABLE] Maker-checker (two-person approval) — documented post-launch (D-03)
- [BLOCKED] Vault key generated in the production secret store with two custodians — DEC-12
- [BLOCKED] Company bank account and named Finance operator — owner
- [BLOCKED] One staging payout drill end to end with a real transfer reference — staging

## MEETINGS

- [PASS] JaaS adapter: per-participant RS256 token bound to one room and the join window; teacher moderator; recording/file upload off
- [PASS] Production refuses the mock provider, a shared `StaticJwt` and the sample Key ID
- [PASS] Join refused to outsiders (404), outside the window, for unpaid/cancelled bookings (tests)
- [NOT APPLICABLE] Provider callback/webhook — none needed; settlement is Tafseel's own lifecycle
- [BLOCKED] JaaS account, key pair and Key ID configured — owner (MEET-01)
- [BLOCKED] Two-party sandbox call incl. Arabic phone — MEET-01

## EMAIL

- [PASS] Resend sender; EN/AR templates; outbox retries 5× then `Failed`; failures visible on readiness
- [PASS] Production refuses the Resend sandbox sender and placeholder/local link hosts; links must be on an allowed host
- [BLOCKED] Sending domain verified (SPF, DKIM, DMARC) and production API key — INF-06, domain
- [BLOCKED] Confirmation, reset and one notification email received from staging in both languages — INF-06
- [BLOCKED] Reply-to / support mailbox working — owner

## STORAGE

- [PASS] Private-by-default: files stream only through authorized endpoints; storage keys never leave the server
- [PASS] Unguessable server-generated object names; type and size validated; `no-store`, `nosniff`
- [PASS] Production refuses local storage; readiness checks the container
- [PASS] Video uploads up to the promised 250 MB pass the form limit (fixed; guarded by a test); proxy must allow ≥ 300 MB
- [BLOCKED] Storage account + private container + soft delete/versioning — DEC-12 → INF-05 (STOR-01 if not Azure)
- [BLOCKED] Anonymous access to the container proven to fail — INF-05

## MALWARE SCANNING

- [PASS] Every upload scanned before it is stored; infected refused and recorded; clean stored
- [PASS] Scanner unavailable → upload refused (fail safe), readiness Unhealthy, Error log
- [PASS] Production refuses the development scanner
- [BLOCKED] clamd hosted on the private network with signature updates and `StreamMaxLength ≥ 250 MB` — DEC-12
- [BLOCKED] Staging proof with the real engine: EICAR refused, clean accepted, clamd stopped → refused — staging

## SECURITY

- [PASS] Password policy, lockout, email confirmation, refresh-token rotation, security-stamp revocation, suspension
- [PASS] Authorization by permission and by participant (404 to outsiders); self-processing guards
- [PASS] Headers: HSTS, CSP with script hashes, nosniff, frame DENY + `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy, COOP/CORP
- [PASS] CORS exact origins only; Production refuses `*`, HTTP, localhost and placeholders
- [PASS] CSRF not applicable to bearer calls; refresh cookie `SameSite=Strict`, `HttpOnly`, `Secure`
- [PASS] Rate limits on auth, confirmation, uploads, payments, messaging, AI, help intake; global per-user/IP limit
- [PASS] No TODO bypasses, no detailed errors, no sensitive-data logging (sweep 2026-09-30)
- [PASS] Dependency audit: 0 vulnerable packages
- [BLOCKED] Privileged-account MFA policy decided (and built if mandatory) — owner decision 5
- [BLOCKED] `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` set on the proxy host (and not on a directly exposed host) — DEC-12
- [BLOCKED] External penetration test or at least an authenticated DAST scan of staging — SHOULD; after staging exists

## SECRETS

- [PASS] No production secret in tracked files or history (scan 2026-09-30)
- [PASS] Required secret and setting names listed without values ([PRODUCTION_SECRETS_CHECKLIST](../operations/PRODUCTION_SECRETS_CHECKLIST.md))
- [PASS] Deploy gate validates every required name before migrating
- [BLOCKED] SEC-01: old seed/UAT password rotated everywhere, old value fails — owner
- [BLOCKED] SEC-02: staging host secrets rotated; local `appsettings.Staging.Host.json` and publish profile removed — owner
- [BLOCKED] Production secrets created in the secret store / GitHub `production` environment — DEC-12, INF-02
- [BLOCKED] Durable, shared Data Protection key volume (INF-04) — DEC-12

## OBSERVABILITY

- [PASS] Structured logs with correlation ids; no secrets or IBANs logged
- [PASS] Liveness and readiness separated; readiness covers database, storage, scanner, workers, email/reconciliation backlog; status word only
- [PASS] Worker meter and Error log after 3 failed passes
- [PASS] Provider-neutral alert set A1–A15 defined ([OBSERVABILITY_AND_ALERTS](../operations/OBSERVABILITY_AND_ALERTS.md))
- [BLOCKED] Monitoring vendor configured, logs centralised — OBS-01 (DEC-12)
- [BLOCKED] Alerts A1–A15 created, external uptime probe running, test alert received — OBS-01/02
- [BLOCKED] On-call owner named — owner decision 6

## BACKUP

- [PASS] Backup → verify → restore to a new database → `DBCC CHECKDB` → identical fingerprints (two drills, non-production data)
- [PASS] Repeatable drill script `scripts/ops/Test-TafseelBackupRestore.ps1`
- [PASS] Rollback documented honestly: image rollback automatic, database forward-only ([DATABASE_RUNBOOK §5](../operations/DATABASE_RUNBOOK.md#5-rollback))
- [BLOCKED] Production automated backups/PITR enabled and a failed-backup alert — INF-03
- [BLOCKED] Point-in-time restore drill on the real platform, timed against the agreed RTO — REL-01
- [BLOCKED] RPO/RTO agreed (PROPOSED ≤ 15 min / ≤ 4 h) — owner decision 8
- [BLOCKED] Object storage soft delete + versioning on — INF-05

## LEGAL

- [PASS] Terms, Privacy, Refund & Cancellation, Academic Integrity, Teacher Agreement, Escrow & Disputes published in AR and EN; consistent with the implemented rules
- [BLOCKED] Legal review of every policy for the launch jurisdiction (LEG-01)
- [BLOCKED] Legal entity, registration and governing law stated — owner
- [BLOCKED] Delivery personal-use/copyright terms (DEC-11) and data location/processors in Privacy (DEC-12) — LEG-01
- [BLOCKED] Retention periods decided — owner decision 9
- [BLOCKED] Support/notice mailbox on the owned domain working — owner decision 10

## TAX

- [BLOCKED] VAT position on student fee, commission and teacher services — DEC-08 (qualified Saudi tax advice)
- [BLOCKED] Receipt/tax-invoice/e-invoicing obligation and format — DEC-08
- [BLOCKED] Checkout wording and provider contract updated for the tax decision — DEC-08 → PAY-01

## OPERATIONS

- [PASS] Day-1 roles defined: Admin (≥ 2), Finance, QualityReviewer; no Support role needed (Admins own `/admin/help`)
- [PASS] First Admin provisioned without shared credentials (`provision` + bootstrap email; audited)
- [PASS] Production deploy runs `provision` after the migration
- [PASS] Day-1 runbook for 13 situations ([DAY1_RUNBOOK](../operations/DAY1_RUNBOOK.md))
- [BLOCKED] Named people for Admin, Finance, QualityReviewer — owner decision 7
- [BLOCKED] Runbook walked through by the on-call owner (release gate) — owner
- [BLOCKED] Staging environment production-like (real DB engine, storage, scanner, sandbox PSP/JaaS/email) — DEC-12

## QA

- [PASS] Domain tests 151/151 · Application 14/14 · Architecture 1/1
- [PASS] Integration tests, full suite (SQLite + SQL Server): 748/749 in the full run, the stale demo-user count fixed and re-run 10/10
- [PASS] SQL Server integration suite 264/264 on SQL Server 2025, including the four tests never run before
- [PASS] Frontend unit tests 607/607 and production build with locale, style, UX-06 and skip-link guards
- [PASS] API contract `--strict`: 296/296 routes, 0 violations
- [PASS] Browser journeys on fresh databases with a published Release build (mock providers): 27/27 (after re-running 3 interrupted by machine sleep and fixing 3 with pre-D-08 expectations)
- [BLOCKED] QA-01: every V1 journey on staging with **sandbox** providers, EN/AR, desktop and phone — PAY-02, MEET-01, staging
- [NOT APPLICABLE] Load test — not required for a single-instance soft launch; SHOULD before marketing pushes

## DNS/HTTPS

- [PASS] HTTPS redirect (308) and HSTS in Production; insecure refresh cookie refused at startup
- [BLOCKED] Domain registered; DNS A/CNAME to the platform — owner
- [BLOCKED] TLS certificate issued with auto-renewal; expiry alert A13 — DEC-12
- [BLOCKED] `AllowedHosts`, email links and PSP return URL on the production domain — domain
- [NOT APPLICABLE] CORS origins for the site — same origin; leave `Cors:AllowedOrigins` empty unless a separate front end is added

## POST-DEPLOYMENT

- [PASS] Automated smoke: ready, live, both locales, config file not served, anonymous `auth/me` = 401; automatic image rollback on failure
- [BLOCKED] Manual smoke on production: owner signs in, Admin screens load, Finance screens load, a teacher application uploads (scanner), a confirmation email arrives — first deploy
- [BLOCKED] First real low-value payment and full refund end to end on production, reconciled against the PSP dashboard — PAY-02
- [BLOCKED] Alerts silent for 24 h after launch; incident log opened — OBS-01
