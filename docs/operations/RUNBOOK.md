# Tafseel Production Runbook

## Service overview

| Component | Notes |
|---|---|
| API | ASP.NET Core 8 (`Tafseel.Api`) |
| DB | SQL Server / Azure SQL |
| Files | Local (Dev) or Azure Blob private container (Production) |
| Payments | Config-selected `IPaymentProvider` (Mock Dev-only) |
| Live sessions | Config-selected `ILiveSessionLinkProvider` (Mock Dev-only) |
| Email | Resend (non-Dev) / Development outbox (Dev) |
| Realtime | SignalR (`/hubs/messaging`) |

## Health

| Endpoint | Meaning |
|---|---|
| `GET /health/live` | Process is up (no dependency checks) |
| `GET /health/ready` | Database + private file storage reachable |

Probe ready before sending traffic. If ready fails after deploy, keep previous revision.

## Startup / shutdown

- Prefer graceful SIGTERM / Azure App Service drain.
- Hosted `NotificationOutboxWorker` respects cancellation tokens.
- Do not kill -9 unless the process is wedged after drain timeout.

## Common incidents

### Ready unhealthy — database

1. Check Azure SQL connectivity / firewall / connection string secret.
2. Check recent migrations and blocking queries.
3. Do not re-run migrate without backup evidence.

### Ready unhealthy — file-storage

1. Confirm `FileStorage__Provider` and Blob connection string.
2. Confirm container exists and is private.
3. Check App Service outbound networking to storage.

### Payment webhooks failing

1. Confirm path `/api/v1/payments/webhooks/{provider}` matches configured provider name.
2. Confirm signature header (`X-Mock-Signature` only for Mock; Production PSP uses `X-Payment-Signature` until a provider-specific header is documented).
3. Check idempotent webhook table for duplicate event IDs (safe retries).

### Live-session join failures

1. Confirm booking is within join window and caller is a participant (domain rules unchanged).
2. Confirm `LiveSessions__Provider` matches a **registered** adapter (Mock forbidden in Production).

## Deploy (high level)

1. Staging validation on the release tag.
2. Production config gate (`scripts/ci/check-production-config.ps1`).
3. Backup DB; record restore point.
4. Manual Production workflow: migrate → deploy → health smoke.
5. Monitor Insights / logs for correlation IDs on errors.

## Logging

- Serilog console (and App Insights when configured).
- Correlation: `X-Correlation-ID` (middleware) + ProblemDetails `correlationId` / `traceId`.
- Never log JWT secrets, Blob connection strings, webhook secrets, or raw card data.
