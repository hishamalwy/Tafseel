# ADR-012: Optional Development Demo User Seeding

## Status

Accepted.

## Context

ADR-004 restricts demo/staging identity seeding to a `staging` check inside the initializer, which
the Program.cs startup gate only ever invokes with `IsDevelopment() == true`. Since `IsStaging()` and
`IsDevelopment()` cannot both be true for a single hosted process, normal startup never creates the
four canonical demo accounts (`admin@gmail.com`, `student@gmail.com`, `teacher@gmail.com`,
`quality@gmail.com`) in any environment, including Development. A developer with a fresh Development
database has roles, catalog services and languages, but no account to log in with.

Any fix must not weaken ADR-004: Staging and Production must still never receive demo identities, and
whatever password is used must never be hardcoded or committed, since Development demo credentials are
predictable canonical emails that would otherwise become a standing target if checked in.

## Decision

Add an opt-in `SeedUsers` options section (`SeedUsers:Enabled`, `SeedUsers:Password`) sourced from User
Secrets or environment variables only — never from `appsettings*.json`. The initializer seeds the same
four canonical accounts already used by Staging (same emails, roles, canonical `DemoUserAccounts` list)
but only when both:

- the resolved `IHostEnvironment.IsDevelopment()` is true, and
- `SeedUsers:Enabled` is true.

This check is duplicated defensively inside `SeedDevelopmentDemoUsersAsync` itself (not just at the
call site), so the accounts are never created even if the method is ever invoked directly or the outer
gate is refactored incorrectly. `SeedUsersOptions.IsValid` requires a non-blank password only when both
conditions hold; Staging and Production are never asked to supply one and a startup validation failure
there is structurally impossible.

Unlike the Staging path — which sets `PasswordHash` directly via `IPasswordHasher` and bypasses
`UserManager` password validation — Development seeding calls `UserManager.CreateAsync(user, password)`,
so the configured password is subject to the same Identity password policy as any real signup and is
hashed through the standard pipeline.

Seeding is idempotent and repair-only for existing accounts: a missing account is created, a missing
role or unconfirmed email is repaired, but an existing account's password is never reset. If a demo
account exists with a password that no longer matches `SeedUsers:Password`, that is logged as a warning
(email only, no password material) rather than silently overwritten or silently ignored.

## Consequences

- A developer enables the four demo accounts locally with `dotnet user-secrets set "SeedUsers:Enabled"
  "true"` and `dotnet user-secrets set "SeedUsers:Password" "<local-password>"`, both scoped to
  `src/Tafseel.Api`.
- Staging's existing hardcoded-password demo seeding is untouched; both paths now share the same
  canonical account/role list to avoid duplication, but remain otherwise independent.
- Disabling seeding (`SeedUsers:Enabled=false`, the default) or reverting to Staging/Production leaves
  behavior identical to before this ADR.
- The fast idempotency check (`IdentitySeedIsCurrentAsync`) does not verify passwords, matching its
  existing Staging behavior, to keep repeated startups bounded; a password-mismatch warning is only
  guaranteed to surface on a startup that also performs a real repair pass.

## Alternatives Considered

- Reuse the Staging hardcoded password (`@Admin123`) for Development too: rejected — a fixed, checked-in
  password for a feature explicitly required to be secret-sourced defeats the purpose.
- Seed unconditionally whenever `IsDevelopment()`: rejected — the task requires seeding disabled by
  default, and unconditional seeding surprises anyone running Development against a shared or
  non-throwaway database.
- Validate `SeedUsers:Password` unconditionally (regardless of environment/Enabled): rejected — would
  force Staging/Production to reason about a Development-only setting and could fail startup there for
  no operational reason.
- Reset an existing demo account's password whenever `SeedUsers:Password` changes: rejected without
  evidence it's needed; silently changing a credential on startup is surprising. Left as a possible
  future explicit, disabled-by-default option if a real need appears.
