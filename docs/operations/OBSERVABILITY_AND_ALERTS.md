# Observability and alerts (provider-neutral)

No monitoring vendor is chosen (OBS-01, waits on DEC-12). This defines what Production must detect and who acts,
in terms any log/metric/uptime tool can implement. Application Insights is already wired (set
`APPLICATIONINSIGHTS_CONNECTION_STRING`); any OpenTelemetry-capable sink or plain container-log collection also works.

## 1. Signals the application already emits

| Signal | Where | Notes |
|---|---|---|
| Liveness | `GET /health/live` → 200 `Healthy` | Process only; never touches dependencies |
| Readiness | `GET /health/ready` → 200 `Healthy`/`Degraded`, 503 `Unhealthy` | Body is the status word only; no dependency detail is exposed |
| Readiness checks | `database`, `file-storage`, `malware-scanner` (Unhealthy when down); `background-workers`, `operational-backlog` (Degraded) | Detail is in the health-check log and telemetry, not the response |
| Structured request log | Serilog: `HTTP {Method} {Path} responded {StatusCode} in {Elapsed} ms` | Path only (no query string) |
| Correlation | `X-Correlation-Id` response header; `traceId` + `correlationId` in every problem response | Ask users for the reference shown on error screens |
| Errors | `API request failed. Status=… Code=… TraceId=… CorrelationId=… Path=…` (Error) for 5xx and DB faults | Exception type and stack go to the sink, never to the client |
| Worker meter | `Tafseel.Workers`: `tafseel.worker.runs{worker,outcome}`, `tafseel.worker.seconds_since_success{worker}` | Workers: `order-auto-release`, `earnings-maturity`, `live-session-settlement`, `reservation-expiry`, `dispute-sla` |
| Worker failure | `Worker {Worker} has failed {Failures} passes in a row; nothing it owns is moving` (Error, at 3 and every 12) | |
| Scanner | `Upload refused: the malware scanner is unavailable (…)` (Error); `Upload refused by {Engine} in {Category}: {Signature}` (Warning) | |
| Storage | `Azure Blob upload failed for a private object.` (Error); download/exists/delete (Warning) | |
| Email | `Notification outbox delivery failed for {OutboxId}` (Warning); `Password reset / Email confirmation / Existing-account notice email delivery failed for user {UserId}: {FailureType}` (Error) | |
| Auth | `Login denied for locked user`, `Suspended user login denied` (Warning); refresh rate-limit rejections | |
| Business audit | `AuditLogEntries`, `FinancialAuditRecords` tables | **Separate from telemetry**: kept in the database, read in Admin/Finance screens, retained with financial records |

Never logged: passwords, tokens, reset/confirmation codes, IBANs (sealed; reads are audited, not logged), file
contents, JaaS keys. Database exception text may quote a duplicate value (for example an email on a unique index):
restrict log access to operators and keep log retention ≤ 30 days unless the owner decides otherwise.

## 2. Alerts

Severity: **P1** page the on-call now (any hour) · **P2** same business day · **P3** next business day.

| # | Alert | Condition (provider-neutral) | Sev | First action (see DAY1_RUNBOOK) |
|---|---|---|---|---|
| A1 | API unavailable | External uptime probe of `https://<domain>/health/live` fails 3 × 1 min from 2 locations | P1 | §2.12 provider/host outage |
| A2 | Not ready | `/health/ready` returns 503 for 3 consecutive minutes | P1 | Check which check is Unhealthy in telemetry |
| A3 | Database unavailable | Readiness `database` Unhealthy, or > 5 SQL connection errors in 5 min | P1 | §2.13 database issue |
| A4 | Error-rate spike | 5xx > 2 % of requests over 5 min with ≥ 20 requests, or > 20 `API request failed` in 5 min | P1 | Correlate by `CorrelationId`; roll back if it started with a deploy |
| A5 | Payment webhook failing | Any 4xx/5xx on `POST /api/v1/payments/webhooks/*` sustained 10 min, or PSP dashboard reports failed deliveries | P1 | §2.1 payment stuck |
| A6 | Payment exception backlog | Readiness `operational-backlog` Degraded with `openReconciliationCases > 0` for 30 min | P2 | Finance → Reconciliation |
| A7 | Malware scanner unavailable | Readiness `malware-scanner` Unhealthy 2 min, or any `malware scanner is unavailable` log | P1 (uploads are refused) | §2.4 scanner down |
| A8 | Storage unavailable | Readiness `file-storage` Unhealthy 2 min, or ≥ 3 `Azure Blob upload failed` in 5 min | P1 | §2.5 storage down |
| A9 | Email failure spike | ≥ 5 `outbox delivery failed` in 15 min, any `…email delivery failed` Error, or `operational-backlog` shows failed/overdue emails | P2 (P1 if confirmation/reset) | §2.6 email down |
| A10 | Meeting provider failure | ≥ 3 5xx on `GET /api/v1/live-sessions/*/join` in 10 min, or a user report of "cannot join" during a session window | P1 during a session, else P2 | §2.7 meeting issue |
| A11 | Money/deadline worker stalled | `background-workers` Degraded 15 min, or `seconds_since_success{worker} > 2 × interval`, or the worker Error log | P1 for `order-auto-release`, `earnings-maturity`, `live-session-settlement`; P2 otherwise | Restart the instance once; if it persists, escalate |
| A12 | Backup failure | Platform backup job failed or no successful backup in 26 h; PITR disabled | P1 | §2.13 database issue |
| A13 | Certificate expiry | TLS certificate expires in < 14 days | P2 | Renew |
| A14 | Auth abuse | > 50 HTTP 429 on `/api/v1/auth/*` in 5 min from one address, or > 20 lockouts in 15 min | P2 | Watch; block at the edge if one source |
| A15 | Withdrawal ageing | Withdrawal pending longer than `Withdrawals:ExpectedSettlementBusinessDays` (3) — Finance home list | P3 | Finance processes the queue |

Every alert names its runbook section and goes to the on-call owner. A test alert must be received before QA-01
(release gate "Observability live").

## 3. Dashboards (minimum)

1. Availability: live/ready, request rate, 5xx rate, p95 latency by route group (`/api/v1/payments`, `/orders`, `/live-sessions`, `/auth`).
2. Money: webhook responses by status, payments confirmed per hour, open reconciliation cases, withdrawals pending.
3. Workers: `seconds_since_success` per worker, run outcomes.
4. Dependencies: SQL DTU/vCore and connections, storage errors, scanner reachability, email outbox failures.

## 4. What is still external

- The vendor and its configuration (DEC-12/OBS-01).
- The on-call person, their hours and escalation contact (owner decision 6 in PRODUCTION_LAUNCH_READINESS).
- The external uptime probe (must run outside the hosting platform).
