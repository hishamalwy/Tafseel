# Phase 11 Audit Findings

Date: 2026-07-26

## Closed

### P11-001 — Publish omitted frontend assets

Frontend assets are linked into build and publish output under `frontend/`, and the runtime resolves them from `AppContext.BaseDirectory`.

### P11-002 — Production could start with mock critical providers

Startup validation now rejects mock payment and live-session providers in Production.

### P11-003 — Weak browser and transport defaults

Global rate limiting, HSTS, clickjacking protection, MIME sniffing protection, referrer and permissions policies, API no-store headers, and CSP are active.

### P11-004 — Ephemeral Data Protection keys

Keys are persisted to a configured directory with a stable application name.

### P11-005 — Frontend lifecycle gaps

Student payment/completion/revision/dispute and live-session join actions, plus teacher delivery, balance, withdrawal, and live-session actions, now call the existing protected APIs.

## Open production blockers

- Real payment provider and verified webhook configuration.
- Real live-session provider.
- Verified Resend sender/domain and production URLs.
- Production SQL Server, backups, TLS, and migration execution.
- Durable encrypted Data Protection key storage.
- Private object storage and malware scanning for uploads.
- Replacement of the design-document runtime, whose `new Function` execution currently requires CSP `unsafe-eval`.
- External monitoring, alerting, and operational runbooks.

These require deployment credentials, infrastructure, or provider decisions and cannot be safely fabricated in source.
