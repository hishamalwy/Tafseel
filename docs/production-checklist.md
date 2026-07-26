# Production Checklist

Date: 2026-07-26

## Blocking

- [ ] Configure a supported real `IPaymentProvider`; verify signed webhooks, retries, reconciliation, refunds, and payouts in its sandbox.
- [ ] Configure a real `ILiveSessionLinkProvider`; verify participant authorization and join-window behavior.
- [ ] Verify a Resend domain and replace `onboarding@resend.dev`.
- [ ] Store JWT, Resend, payment, database, and provider secrets in the deployment secret manager.
- [ ] Set trusted HTTPS confirmation/reset URLs and exact CORS origins.
- [ ] Provision production SQL Server with encryption, least-privilege credentials, backups, restore drills, and monitoring.
- [ ] Review and apply `artifacts/tafseel-idempotent.sql` before starting the new application version.
- [ ] Mount durable encrypted Data Protection key storage shared by all instances.
- [ ] Replace local private-file storage with durable private object storage and enable malware scanning.
- [ ] Remove the `.dc.html` runtime dependency on `new Function`, then remove CSP `unsafe-eval`.
- [ ] Configure centralized logs, metrics, alerts, uptime checks, and on-call ownership.
- [ ] Configure GitHub `staging` and protected `production` Environments, required reviewers, secrets, and variables.
- [ ] Protect `main` with every required check in `branch-protection.md`.
- [ ] Run CI, Security, Database, Docker, and Release workflows successfully on GitHub.
- [ ] Validate the deployment adapter using least-privilege/OIDC credentials.

## Required validation

- [ ] Run the Release test suite against the release candidate and production-like SQL Server.
- [ ] Run provider sandbox payment, refund, escrow release, dispute settlement, and withdrawal scenarios.
- [ ] Run authorization tests with Student, Teacher, QualityReviewer, Admin, suspended, and anonymous accounts.
- [ ] Run upload limits, signature validation, malware, and private-download tests.
- [ ] Run restore, rollback, secret rotation, and key persistence drills.
- [ ] Review retention, privacy, legal, tax, refund, dispute, and safeguarding policies for the launch jurisdictions.

## Decision

The repository passes its internal engineering gate. It is not approved for public production traffic until all Blocking items are complete.
