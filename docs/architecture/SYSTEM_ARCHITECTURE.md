# Tafseel System Architecture

## Overview

Tafseel is an ASP.NET Core 8 educational marketplace with an EF Core/SQL Server backend and an Angular client (`frontend-angular/`) served by the same host. The repository uses a layered solution and keeps business transitions outside controllers.

## Projects

| Project | Responsibility |
|---|---|
| `Tafseel.Domain` | Entities, lifecycle transitions and domain exceptions |
| `Tafseel.Application` | DTOs, service contracts, authorization constants and configuration contracts |
| `Tafseel.Infrastructure` | EF Core, Identity, application-service implementations, email, files, payments and external-provider abstractions |
| `Tafseel.Api` | HTTP controllers, middleware, hosting, JWT, SignalR and static frontend delivery |

Tests are split across Domain, Application, Architecture and Integration test projects.

## Dependency Direction

```text
Tafseel.Domain
    ↑
Tafseel.Application
    ↑
Tafseel.Infrastructure
    ↑
Tafseel.Api
```

`Tafseel.Infrastructure` also references Domain directly. Domain has no project dependency. Controllers depend on application contracts rather than EF entities.

## Authentication

ASP.NET Core Identity stores users and roles. JWT access tokens use configured issuer, audience, signing key and lifetime validation. Refresh tokens are hashed, rotated and grouped into replay-containment families.

## Authorization

The canonical roles are Student, Teacher, Quality Reviewer and Admin. Permission policies are registered in the API. Service methods additionally enforce resource ownership for private requests, orders, sessions, conversations, notifications and files.

## SignalR

`MessagingHub` is mapped at `/hubs/messages`. It requires authentication and validates conversation membership. Messages are persisted before realtime delivery. Student and Teacher dashboards host the canonical chat interface; polling is fallback only.

## Email

Resend is the non-Development provider. Development uses a local sender. Email sender identity, API token and frontend URLs are validated at startup. Optional notification emails use the existing persistent outbox worker.

## Payments

The finance model includes payments, attempts, callback records, ledger entries, hold records, refunds, withdrawals and financial audit records. Callback verification and idempotency are server-side. Only a mock provider is registered, and Production validation rejects it.

## Database

EF Core 8 targets SQL Server. `TafseelDbContext` contains Identity, catalog, qualification, marketplace, order, session, finance, messaging and governance aggregates. Migrations are stored in Infrastructure and are applied manually outside Development.

## Frontend

The frontend is the Angular client in `frontend-angular/`, built by `Tafseel.Api.csproj` into `webclient/{ar,en}` and served by `Program.cs`: `/` negotiates `/ar/` or `/en/`, prerendered pages are real files, and every other client path gets that locale's shell. The design system (`css/tafseel.css`, `assets/`) is copied into the build. Links the server writes into notifications and emails come from `AppRoutes` and are locale-free. The retired `.dc.html` pages are gone; their `/app/*` addresses redirect to the matching Angular route (`Routing/LegacyLinks.cs`).

## Quality targets

> **DRAFT — owner to confirm** (2026-09-23 audit, F-ARCH-1). Values marked `PROPOSED` are starting
> points sized for one application instance (the DEC-12 direction), not measurements. Confirm or
> change them in [`V1_OWNER_DECISIONS.md`](../releases/V1_OWNER_DECISIONS.md); INF-03 (backups) and
> REL-01 (recovery drills) are judged against them.

| Dimension | Target | Basis |
|---|---|---|
| 12-month scale ceiling | `PROPOSED` 5,000 registered students, 300 published teachers, 200 paid orders/day at peak | One instance plus one managed SQL database; revisit at 70 % of any figure |
| API latency | `PROPOSED` p95 ≤ 500 ms for reads and ≤ 1 s for payment initiation, excluding the provider's hosted checkout | Every money path runs Serializable with an app lock; this bounds lock hold time |
| Availability | `PROPOSED` 99.5 % per calendar month (≈ 3.6 h downtime), single instance accepted for V1 | DEC-12: single application instance |
| RPO (SQL database) | `PROPOSED` ≤ 15 minutes | Requires managed point-in-time restore; the ledger is the system of record for money |
| RTO (application and database) | `PROPOSED` ≤ 4 hours | Restore to a new database, repoint the connection string (BACKUP_AND_RESTORE.md) |
| RPO/RTO (blob storage) | `PROPOSED` ≤ 24 h / ≤ 4 h | Deliveries and evidence; soft delete plus versioning on the container |
| Background workers | Degraded on `/health/ready` after two missed intervals | `WorkerHeartbeats` (RUNBOOK: "Ready degraded — background-workers") |

## Deployment

GitHub Actions runs CI, security, database, Docker and Staging workflows. Staging deployment is automated after its gates. Production deployment and database migration remain manual. Configuration validation fails closed for unsupported Production providers or invalid secrets/settings. Normal identity initialization is Development-only.
