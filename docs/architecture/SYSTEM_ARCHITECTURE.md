# Tafseel System Architecture

## Overview

Tafseel is an ASP.NET Core 8 educational marketplace with an EF Core/SQL Server backend and a DC/HTML frontend containing embedded React components. The repository uses a layered solution and keeps business transitions outside controllers.

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

The frontend consists of twelve `.dc.html` pages with `support.js`, embedded React/Babel, shared API/localization/runtime modules and `css/tafseel.css`. Arabic/English and RTL/LTR behavior use the existing localization runtime. The frontend is not a separate SPA project.

## Deployment

GitHub Actions runs CI, security, database, Docker and Staging workflows. Staging deployment is automated after its gates. Production deployment and database migration remain manual. Configuration validation fails closed for unsupported Production providers or invalid secrets/settings. Normal identity initialization is Development-only.
