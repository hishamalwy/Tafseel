# Phase 2 Report — Foundation

## Implemented

- .NET 8 solution with Domain, Application, Infrastructure, API, and four test projects.
- SQL Server EF Core context, ASP.NET Core Identity schema, initial migration, four centralized roles, and permission policies.
- Student/Teacher registration, login lockout, logout, current-user endpoint, JWT access tokens, hashed rotating refresh tokens, reuse detection, revocation, suspension/security-stamp validation.
- RFC 7807 errors, correlation IDs, Serilog request logging, configurable CORS, auth rate limiting, Swagger bearer authentication, readiness/liveness health checks.
- Development-only automatic migrations; production expects migrations to be applied by deployment.

## Database

`InitialIdentity` creates Identity tables plus `RefreshTokens`, including unique hash and token-family indexes and a SQL Server rowversion concurrency token. No marketplace business entities were added.

## Tests

- Permission/role mapping and privileged self-registration rules.
- Clean Architecture project-reference constraints.
- End-to-end registration, authenticated `/me`, refresh rotation, and replay rejection using an isolated in-memory database.

## Deferred and risks

- Password reset and email confirmation require the real email adapter planned for Phase 8; no insecure token-return/logging shortcut was added.
- SQL Server-specific migration behavior is generated but integration tests currently use EF InMemory; relational database coverage is added when Phase 3 introduces constraints.
- No production admin account is seeded. Create privileged accounts through an explicit deployment/admin process later.

## Next

Phase 3: academic catalog and the teacher qualification/application state machine.
