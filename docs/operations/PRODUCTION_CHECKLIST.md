# Production Checklist

Use this checklist before promoting a build to Production. Do not tick items you have not evidenced.

## Preconditions

- [ ] Staging Gate green for the exact commit/tag
- [ ] Release artifacts immutable and retained
- [ ] No Mock payment or live-session provider in Production env
- [ ] `FileStorage__Provider=AzureBlob` with non-placeholder connection string
- [ ] JWT signing key ≥32 chars, non-development, from secret store
- [ ] Resend (or approved email) verified sender (not `@resend.dev`)
- [ ] CORS exact HTTPS origins only
- [ ] `DataProtection__KeysPath` absolute durable path (or Key Vault/Blob DP provider)
- [ ] SQL connection string from secret store; TLS required
- [ ] Application Insights connection string configured (recommended)

## Providers

- [ ] Payment provider registered in code **and** selected by `Payments__Provider`
- [ ] Payment webhook URL + signature secret configured
- [ ] Live-session provider registered in code **and** selected by `LiveSessions__Provider`
- [ ] Azure Blob private container exists; anonymous access disabled
- [ ] Showcase Production media gates only enabled after ADR-011 evidence

## Database

- [ ] Backup completed and restore point recorded **before** migrate
- [ ] Migration plan reviewed (forward-only; no auto Production migrate outside runbook)
- [ ] Migrate executed with documented operator and ticket
- [ ] Post-migrate smoke queries passed

## Security

- [ ] Secrets rotated or confirmed current
- [ ] HSTS enabled (non-Dev)
- [ ] Rate limiting enabled
- [ ] Admin/Quality accounts MFA policy confirmed (org process)
- [ ] No Production seed users enabled

## Smoke

- [ ] `/health/live` 200
- [ ] `/health/ready` 200 (database + file-storage)
- [ ] Auth login (Student/Teacher)
- [ ] Catalog browse
- [ ] File upload path for one attachment category
- [ ] Payment initiate against sandbox PSP (if cutover includes payments)
- [ ] Live-session join against real provider (if cutover includes sessions)

## Rollback

- [ ] Previous app slot/revision identified
- [ ] DB rollback strategy agreed (restore vs compensating migration)
- [ ] On-call contact and escalation path posted
