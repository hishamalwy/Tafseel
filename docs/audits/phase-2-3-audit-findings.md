# Phase 2–3 Audit Findings — Pass 1 Baseline

Audit date: 2026-07-26  
Scope: the implemented .NET 8 Phase 2 foundation and Phase 3 catalog/teacher-qualification backend only.  
Pass constraint: inspection and evidence collection only. No production code, migrations, configuration, or tests were changed.

## 1. Executive Summary

The solution restores, builds, publishes, and passes its current test suite. Clean Architecture project-reference direction is correct, JWT validation checks issuer/audience/signature/lifetime, refresh tokens are hashed and rotated, teacher-application ownership is checked server-side, reviewer assignment is enforced, and private uploads are not exposed through static-file middleware.

The current scope is not production-ready. One externally disclosed credential must be revoked immediately. The most important code defects are an invalid `__Host-` refresh-cookie definition that standards-compliant browsers reject, non-atomic session invalidation during password reset and refresh-token replay handling, immediate authentication without email ownership confirmation, ignored Identity role-assignment failures, incomplete enum/rubric validation, client-asserted video duration, and file writes that are not coordinated with database commits or cleanup. SQL Server-specific constraints and concurrency behavior have no SQL Server integration coverage.

Pass 1 found 36 open items:

| Severity | Count |
|---|---:|
| Critical | 1 |
| High | 14 |
| Medium | 18 |
| Low | 3 |

No fixes were applied in this pass.

## 2. Baseline Evidence

### Repository inventory

- Eight solution projects: four production projects and four test projects.
- Two EF Core migrations: `InitialIdentity` and `CatalogAndTeacherApplications`.
- Production layers: `Tafseel.Domain`, `Tafseel.Application`, `Tafseel.Infrastructure`, and `Tafseel.Api`.
- Test layers: Domain, Application, Architecture, and Integration.
- The eight existing `.dc.html` frontend pages and their shared CSS/JavaScript were retained unchanged.
- At audit start, all backend solution/source/test/docs files were untracked and `README.md` was already modified. This was pre-existing state and was not altered except for this audit document.

### Commands and results

| Command | Result |
|---|---|
| `dotnet restore Tafseel.sln --locked-mode` | Passed; 8 projects restored. No lock files exist, so the command did not provide deterministic locked restore. |
| `dotnet build Tafseel.sln -c Release --no-restore` | Passed; 0 warnings, 0 errors. |
| `dotnet test Tafseel.sln -c Release --no-build --logger "console;verbosity=normal"` | Passed; 14/14 tests, 0 failed, 0 skipped. |
| `dotnet publish src/Tafseel.Api/Tafseel.Api.csproj -c Release --no-restore` | Passed; publish output created outside the repository. |
| `dotnet list Tafseel.sln package --vulnerable --include-transitive` | No known vulnerable packages reported by the configured NuGet sources. |
| `dotnet list Tafseel.sln package --outdated --include-transitive --highest-minor` | Several patch/minor updates available, including .NET 8 packages from `8.0.21` to `8.0.29`. |
| `dotnet ef migrations has-pending-model-changes ...` | Passed; no model changes pending after the latest migration. |
| `dotnet ef migrations list ... --no-connect` | Found both migrations; applied status could not be determined without connecting to SQL Server. |
| `dotnet format Tafseel.sln --verify-no-changes --no-restore --severity info` | Exit 1 for information-level style/analyzer suggestions only; no compiler warning or error was found. |

Test totals:

- Domain: 3 passed.
- Application: 5 passed.
- Architecture: 1 passed.
- Integration: 5 passed.
- SQL Server integration tests: 0.

## 3. Current-Scope Scorecard

These scores describe the repository before fixes. They are not production-readiness claims.

| Area | Score / 10 | Evidence |
|---|---:|---|
| Architecture | 8 | Project dependencies point inward and architecture tests pass; API composition necessarily references Infrastructure. Enforcement tests cover references only. |
| Clean Code and SOLID | 7 | Controllers are thin and boundaries are explicit; several service methods mix persistence, external storage, and workflow coordination without failure compensation. |
| Domain Model | 6 | Teacher workflow behavior lives in the aggregate, but invalid enum values and incomplete rubric keys can bypass invariants. |
| Security | 4 | Strong JWT/refresh foundations exist, but a disclosed provider key, unconfirmed accounts, non-atomic session invalidation, and upload abuse remain. |
| Authentication | 4 | Lockout, rotation, hashing, replay detection, and reset exist; browser refresh-cookie behavior, confirmation, logout, and transactional invalidation are defective. |
| Authorization | 6 | Central policies and ownership checks exist; teacher application commands still authorize by role rather than the declared permission. |
| Database | 5 | Relationships, indexes, rowversion, and migrations exist; audit cascades, missing checks, and provider-specific untested behavior remain. |
| Concurrency | 5 | SQL Server rowversion is configured; no SQL Server concurrency test, client concurrency contract, or idempotent retry behavior exists. |
| File Storage | 3 | Names are generated, storage is private, and basic signature/MIME/size checks exist; duration is trusted, cleanup is absent, and local disk is always selected. |
| API Design | 6 | Versioned routes and DTOs exist; `Location`, errors, pagination, and internal storage-key responses need correction. |
| Validation | 4 | Some DataAnnotations and domain rules exist; enum membership, lengths, streamed size, and database checks are incomplete. |
| Error Handling | 6 | Central RFC 7807 handling exists; framework auth/model errors and concurrency/constraint errors are not consistently coded. |
| Observability | 4 | Serilog request logs, health checks, and response correlation IDs exist; audit/security events and correlation-enriched logs do not. |
| Testing | 4 | All 14 current tests pass; high-risk negative, concurrency, SQL Server, file, and authorization cases are largely absent. |
| Performance | 5 | Read queries use projection and `AsNoTracking`; reviewer/catalog lists are unbounded and workflow mutations load growing aggregate history. |
| Maintainability | 7 | The codebase is small and understandable; validation and catalog authorization rules are scattered or too coarse. |
| Documentation | 6 | Architecture and flows are documented; several validation and test-provider claims are stale or stronger than implementation. |
| Deployment Readiness | 2 | Publish passes, but production storage, persistent Data Protection, proxy configuration, verified email, secrets, CI, and versioned backend files are missing. |
| Overall Current-Scope Readiness | 4 | A sound prototype foundation with blocking Critical/High findings. |

## 4. Findings

### AUD-001 — Disclosed Resend credential

- **Classification:** Security Vulnerability
- **Severity:** Critical
- **Evidence:** A live-looking Resend API credential was supplied in the task conversation. A path-only repository scan found no matching secret committed in source; `src/Tafseel.Api/appsettings.json:18-20` correctly contains an empty token.
- **Affected files/systems:** External Resend account; deployment secret store; `README.md:17-20`.
- **Impact:** Anyone with access to the disclosed value may send mail under the account, consume quota, harm sender reputation, or use password-reset email capability.
- **Recommended action:** Revoke/rotate the credential in Resend immediately, review provider activity, and place only the replacement in User Secrets or the deployment secret manager. Never reuse or commit the disclosed value.
- **Code modification required:** No; external credential rotation and deployment configuration are required.
- **Tests needed:** Send one controlled email with the replacement credential from an approved environment; confirm the revoked credential fails.
- **Status:** Closed on 2026-07-26. The user confirmed dashboard revocation of the exposed replacement. A full repository scan (excluding only build and Git metadata) found no Resend-shaped credential, User Secrets contains only the current send-only `Resend:ApiToken`, and a controlled real registration returned `202 confirmationRequired=true`. Gmail independently showed the resulting `Confirm your Tafseel email` message in the intended inbox. Runtime logs were scanned without exposing values and contained no Resend-shaped credential.

### AUD-002 — Browser-invalid `__Host-` refresh cookie

- **Classification:** Production Bug
- **Severity:** High
- **Evidence:** `src/Tafseel.Api/Controllers/AuthController.cs:14` uses the `__Host-` prefix, while `AuthController.cs:136-143` sets `Path = "/api/v1/auth"`. The `__Host-` cookie contract requires `Secure`, no `Domain`, and `Path=/`.
- **Affected files:** `src/Tafseel.Api/Controllers/AuthController.cs`; `tests/Tafseel.IntegrationTests/AuthenticationTests.cs`.
- **Impact:** Standards-compliant browsers reject the refresh cookie, so refresh and logout sessions fail even though `HttpClient` integration tests pass.
- **Recommended action:** Set `Path=/` or use a non-`__Host-` name with a deliberately scoped path. Retain `Secure`, `HttpOnly`, and an explicit SameSite policy.
- **Code modification required:** Yes.
- **Tests needed:** Browser-level or Playwright cookie acceptance test plus integration assertions for name, Path, Secure, HttpOnly, and SameSite attributes.
- **Status:** Open.

### AUD-003 — Password reset and refresh-token revocation are not atomic

- **Classification:** Security Vulnerability
- **Severity:** High
- **Evidence:** `src/Tafseel.Infrastructure/Identity/AuthenticationService.cs:177-187` resets the Identity password/security stamp before separately loading and saving refresh-token revocations. There is no transaction covering the Identity update and token revocation.
- **Affected files:** `src/Tafseel.Infrastructure/Identity/AuthenticationService.cs`; `src/Tafseel.Infrastructure/Persistence/TafseelDbContext.cs`.
- **Impact:** If token revocation fails after the password changes, an existing refresh token can still mint a new access token carrying the new security stamp.
- **Recommended action:** Coordinate password/security-stamp update and refresh-token revocation in one relational transaction, with explicit failure behavior and no successful response until all changes commit.
- **Code modification required:** Yes.
- **Tests needed:** Relational failure-injection test and SQL Server integration test proving an old refresh token cannot be used after a successful reset and that partial completion is rolled back.
- **Status:** Open.

### AUD-004 — Refresh-token replay response is not transactional

- **Classification:** Security Vulnerability
- **Severity:** High
- **Evidence:** `AuthenticationService.cs:85-96` and `109-120` revoke a family, update the Identity security stamp, and save through separate Identity/DbContext operations without an explicit transaction.
- **Affected files:** `src/Tafseel.Infrastructure/Identity/AuthenticationService.cs`.
- **Impact:** A database failure can leave family revocation and access-token invalidation in different states, weakening replay containment.
- **Recommended action:** Execute family revocation and security-stamp update in one database transaction and verify the affected token family.
- **Code modification required:** Yes.
- **Tests needed:** SQL Server replay and concurrent-refresh tests with controlled failure between operations.
- **Status:** Open.

### AUD-005 — Email ownership is not confirmed before authentication

- **Classification:** Security Vulnerability
- **Severity:** High
- **Evidence:** `src/Tafseel.Infrastructure/DependencyInjection.cs:29-42` does not require confirmed email. `AuthenticationService.cs:46-51` immediately assigns a role and issues tokens. There are no confirmation endpoints. `docs/authentication.md:19` confirms that email confirmation is deferred.
- **Affected files:** Identity configuration, authentication service/controller, authentication documentation.
- **Impact:** A user can register and act under an email address they do not control, undermining identity, notifications, and future account-recovery assumptions.
- **Recommended action:** Add email confirmation issuance/verification and prevent normal login or privileged teacher workflow use until confirmed. Preserve non-enumerating responses.
- **Code modification required:** Yes.
- **Tests needed:** Confirmation success, invalid/expired token, unconfirmed login denial, duplicate request throttling, and non-enumeration tests.
- **Status:** Open.

### AUD-006 — Registration ignores role-assignment failure

- **Classification:** Production Bug
- **Severity:** High
- **Evidence:** `AuthenticationService.cs:46-51` checks `CreateAsync` but ignores the `IdentityResult` returned by `AddToRoleAsync`, then issues tokens. No transaction compensates by removing a user if role assignment fails.
- **Affected files:** `src/Tafseel.Infrastructure/Identity/AuthenticationService.cs`.
- **Impact:** Registration can return success for an account with no intended role, leaving an orphaned or unusable identity row and inconsistent authorization state.
- **Recommended action:** Check role assignment, make user creation plus initial role assignment atomic or compensate safely, and return a stable failure.
- **Code modification required:** Yes.
- **Tests needed:** Forced role-store failure test proving no successful token and no orphan account remain.
- **Status:** Open.

### AUD-007 — Teacher application commands bypass the declared permission

- **Classification:** Authorization Gap
- **Severity:** High
- **Evidence:** `src/Tafseel.Api/Controllers/TeacherApplicationsController.cs:15-54` uses `Roles.Teacher` for create/update/upload/submit/withdraw. `src/Tafseel.Application/Authorization/Authorization.cs:23-24,36-40` declares `Teachers.Apply`, but the endpoints do not enforce it.
- **Affected files:** Teacher applications controller; permission definitions; authorization tests.
- **Impact:** Removing or withholding `Teachers.Apply` cannot prevent a Teacher-role account from applying. The authorization model behaves differently from its declared policies.
- **Recommended action:** Use the centralized permission policy and retain resource ownership checks in the service.
- **Code modification required:** Yes.
- **Tests needed:** Role-without-permission denial, wrong-role denial, owner success, and non-owner indistinguishable-not-found tests.
- **Status:** Open.

### AUD-008 — Invalid enum values can corrupt review semantics and bypass the complete rubric

- **Classification:** State Machine Issue
- **Severity:** High
- **Evidence:** `src/Tafseel.Domain/TeacherApplications/TeacherApplication.cs:102-115` checks only score count/range and maps every unknown `ReviewDecision` to rejection. It does not verify that score keys are all defined `EvaluationCriterion` values. `TeacherApplicationService.cs:128-136` checks duplicates but not enum membership.
- **Affected files:** Domain aggregate, Application contracts, teacher application service/controller.
- **Impact:** Nine distinct keys containing an undefined enum value can omit a required criterion and still approve. Undefined decisions are silently interpreted as rejection instead of rejected as invalid input.
- **Recommended action:** Validate `Enum.IsDefined` at the API/application boundary and enforce exact set equality inside the aggregate; reject undefined decisions/priorities explicitly.
- **Code modification required:** Yes.
- **Tests needed:** Undefined decision, priority, criterion, missing-real-criterion-plus-unknown-key, duplicates, and all valid decisions.
- **Status:** Closed in Pass 3 — API/Application validation and Domain guards reject undefined decisions, priorities, criteria, duplicates, missing criteria, and scores outside 1–5; exact-rubric and transition tests pass.

### AUD-009 — Demo duration is trusted from the client

- **Classification:** File Security Issue
- **Severity:** High
- **Evidence:** `TeacherApplicationsController.cs:32-40` accepts `durationSeconds` from form data. `TeacherApplicationService.cs:67-69` passes it to the aggregate without deriving media duration from the stored video.
- **Affected files:** Teacher application controller/service; file-storage abstraction and adapter.
- **Impact:** A teacher can upload an arbitrarily long video while claiming it is within the topic limit, bypassing a core qualification rule and consuming excessive storage/processing.
- **Recommended action:** Probe duration server-side with a constrained media parser after upload, reject mismatches, and delete rejected temporary files.
- **Code modification required:** Yes.
- **Tests needed:** Real MP4 fixtures above/below limit, falsified duration metadata, malformed media, and parser timeout/resource-limit tests.
- **Status:** Open.

### AUD-010 — File writes are not compensated when workflow persistence fails

- **Classification:** File Security Issue
- **Severity:** High
- **Evidence:** `TeacherApplicationService.cs:67-70` writes the file before attaching it and saving the application. `LocalFileStorageService.cs` exposes no delete operation. Replacing a demo also never removes the old object.
- **Affected files:** File-storage contract/adapter; teacher application service.
- **Impact:** validation, database, cancellation, and rowversion failures leave orphan files. Concurrent replacement can leak one or more large videos and eventually exhaust local disk.
- **Recommended action:** Add staged write/finalize/delete semantics or explicit compensation, retain the previous file until commit succeeds, and make retry/replacement behavior deterministic.
- **Code modification required:** Yes.
- **Tests needed:** DB-save failure cleanup, cancellation cleanup, concurrent replacement, repeated upload, and old-file retirement tests.
- **Status:** Open.

### AUD-011 — Local filesystem storage is selected in every environment

- **Classification:** Deployment Risk
- **Severity:** High
- **Evidence:** `src/Tafseel.Infrastructure/DependencyInjection.cs:55-56` always registers `LocalFileStorageService`. `appsettings.json:25-27` uses a relative `App_Data` path. There is no production startup guard or object-storage adapter.
- **Affected files:** Infrastructure composition, file configuration, deployment documentation.
- **Impact:** Multi-instance deployments lose consistency; container restarts can lose files; relative paths vary by working directory; local capacity becomes an application-wide availability risk.
- **Recommended action:** Fail production startup unless a production private-object-storage implementation is configured. Keep local storage explicitly development/testing-only.
- **Code modification required:** Yes, plus external storage configuration.
- **Tests needed:** Production configuration validation and adapter contract tests.
- **Status:** Open — external storage remains a blocker.

### AUD-012 — Application audit history can be cascade-deleted

- **Classification:** Database Integrity Issue
- **Severity:** High
- **Evidence:** `src/Tafseel.Infrastructure/Persistence/TafseelDbContext.cs:75-76,93` leaves required child relationships at cascade defaults. Migration `20260726114227_CatalogAndTeacherApplications.cs:196-201,219-224,239-244` explicitly cascades reviews, status history, and scores.
- **Affected files:** DbContext model and Phase 3 migration.
- **Impact:** Deleting a teacher application can silently erase the decision trail and evaluation evidence that should be immutable/auditable.
- **Recommended action:** Define deliberate restrictive/no-action deletion for historical roots or prohibit application deletion with a database-level policy; preserve immutable history.
- **Code modification required:** Yes, including a migration.
- **Tests needed:** SQL Server FK deletion tests proving historical rows cannot be cascaded away.
- **Status:** Closed for the implemented Phase 3 aggregate — application review/history and review/score foreign keys are restrictive, with SQL Server delete proof. Broader future audit retention remains future-scope.

### AUD-013 — SQL Server-specific correctness has no SQL Server tests

- **Classification:** Test Gap
- **Severity:** High
- **Evidence:** `tests/Tafseel.IntegrationTests/TafseelApiFactory.cs:16,34-35,45` replaces SQL Server with in-memory SQLite and uses `EnsureCreated`. The production model depends on SQL Server rowversion and filtered indexes at `TafseelDbContext.cs:40,68-71`. Current integration tests total five.
- **Affected files:** Integration test project/factory and database tests.
- **Impact:** Passing tests do not prove filtered-index syntax, rowversion conflict handling, SQL collation behavior, migration application, or SQL Server transaction behavior.
- **Recommended action:** Add containerized SQL Server migration and integration suites for provider-specific behavior; retain SQLite only for fast provider-neutral tests.
- **Code modification required:** Yes, tests and test infrastructure.
- **Tests needed:** Migration-from-empty, filtered uniqueness, rowversion conflict, transaction rollback, FK/check constraints, and representative query tests.
- **Status:** Partially closed — Pass 2 security and Pass 3 migration, constraint, uniqueness, reapplication, and synchronized rowversion tests run on SQL Server LocalDB. Future domains still require their own provider-specific proof.

### AUD-014 — Backend implementation is not versioned in Git

- **Classification:** Deployment Risk
- **Severity:** High
- **Evidence:** Baseline `git status --short` shows `Tafseel.sln`, `.gitignore`, `docs/`, `src/`, and `tests/` as untracked; only frontend files and `README.md` are tracked.
- **Affected files:** Entire backend and documentation set.
- **Impact:** The implemented backend cannot be reproduced, reviewed, built by CI, rolled back, or deployed from repository history.
- **Recommended action:** After audit/fixes, review and intentionally commit the backend, migrations, tests, and safe configuration. Do not stage secrets or runtime uploads.
- **Code modification required:** No functional code change; version-control action is required.
- **Tests needed:** Clean-clone restore/build/test and migration generation check in CI.
- **Status:** Open.

### AUD-015 — Identity Data Protection keys are not deployment-safe

- **Classification:** Deployment Risk
- **Severity:** High
- **Evidence:** Identity default token providers are enabled at `DependencyInjection.cs:40-42`, but no persistent/shared ASP.NET Core Data Protection key configuration exists in `Program.cs` or Infrastructure composition.
- **Affected files:** API/Infrastructure service registration; production deployment configuration.
- **Impact:** Password-reset/confirmation tokens can fail after restart or across instances; ephemeral container keys can invalidate outstanding tokens.
- **Recommended action:** Configure encrypted persistent/shared Data Protection keys and a stable application name in production, with key access restricted to the application.
- **Code modification required:** Yes, plus external key-store configuration.
- **Tests needed:** Generate on one instance, validate on another, and validate across restart/key rotation.
- **Status:** Open.

### AUD-016 — Logout requires a still-valid access token

- **Classification:** Production Bug
- **Severity:** Medium
- **Evidence:** `AuthController.cs:44-51` places `[Authorize]` on logout even though the refresh token is already supplied by the secure cookie.
- **Affected files:** Auth controller and authentication tests.
- **Impact:** Once the 15-minute access token expires, a user cannot call logout to revoke the still-valid 30-day refresh token; the cookie may remain until expiry.
- **Recommended action:** Allow the endpoint to clear/revoke the presented refresh cookie without requiring an access token, while retaining CSRF/SameSite protections and idempotency.
- **Code modification required:** Yes.
- **Tests needed:** Logout with expired/missing access token but valid cookie; repeated logout; invalid cookie.
- **Status:** Open.

### AUD-017 — Security-sensitive options are under-validated

- **Classification:** Configuration Risk
- **Severity:** Medium
- **Evidence:** `DependencyInjection.cs:45-51` validates only JWT signing-key length/prefix. `JwtOptions.cs:6-10` permits empty issuer/audience and non-positive or excessive lifetimes. Email and file options at `DependencyInjection.cs:56,58-60` have no startup validation; the default reset URL is HTTP localhost at `ResendEmailSender.cs:10-11`.
- **Affected files:** JWT/email/file options, configuration, startup.
- **Impact:** Misconfiguration can issue immediately expired or excessive tokens, generate unusable/insecure reset links, select unsafe storage paths, or allow startup with no email capability.
- **Recommended action:** Validate issuer, audience, bounded lifetimes, HTTPS production reset URL, sender, nonempty provider token when email is enabled, rooted/approved storage configuration, and positive upload limits.
- **Code modification required:** Yes.
- **Tests needed:** Startup validation tests for every invalid boundary and environment-specific requirement.
- **Status:** Open.

### AUD-018 — Reverse-proxy and HTTPS behavior is not configured

- **Classification:** Deployment Risk
- **Severity:** Medium
- **Evidence:** `src/Tafseel.Api/Program.cs:80-98,134` partitions rate limits using `RemoteIpAddress` and redirects HTTPS, but never enables trusted forwarded headers or HSTS.
- **Affected files:** API middleware pipeline and deployment documentation.
- **Impact:** Behind a proxy, all clients may share one rate-limit identity, scheme detection may be wrong, and transport hardening depends entirely on undocumented infrastructure.
- **Recommended action:** Configure trusted proxy networks/headers, production HSTS, and document TLS termination. Never trust forwarded headers from arbitrary sources.
- **Code modification required:** Yes, plus deployment configuration.
- **Tests needed:** Proxy integration tests for client IP, scheme, redirect, rate-limit partitioning, and spoofed-header rejection.
- **Status:** Open.

### AUD-019 — Database constraints do not enforce core domain ranges and enum validity

- **Classification:** Database Integrity Issue
- **Severity:** Medium
- **Evidence:** `TafseelDbContext.cs` configures lengths/indexes but no check constraints for experience years, demo/max duration, evaluation scores, or enum columns. The migration creates plain integer columns for these values.
- **Affected files:** DbContext model, Phase 3 migration, domain entities.
- **Impact:** Direct SQL, import jobs, or future code defects can persist values the domain rejects, corrupting review and application state.
- **Recommended action:** Add focused SQL check constraints for stable invariants and enum ranges; do not duplicate mutable business policy in checks.
- **Code modification required:** Yes, including a migration.
- **Tests needed:** SQL Server constraint tests for every lower/upper boundary and undefined enum value.
- **Status:** Closed in Pass 3 — named SQL constraints cover supported Phase 3 ranges/enums, normalized-name non-emptiness, and status-history consistency; lower, upper, and invalid values are exercised on SQL Server.

### AUD-020 — Subject deactivation leaves active child topics publicly visible

- **Classification:** Database Integrity Issue
- **Severity:** Medium
- **Evidence:** `CatalogService.cs:97-111` toggles only the selected item. Public topic queries at `CatalogService.cs:14-27,132-133` filter child `IsActive` but do not require the parent Subject to remain active.
- **Affected files:** Catalog service/domain policy; catalog tests.
- **Impact:** Public APIs can return active topics and qualification topics belonging to a deactivated subject, creating contradictory catalog state.
- **Recommended action:** Decide and enforce one rule: cascade-deactivate children transactionally, or filter public children by active parent and prevent reactivation under an inactive parent.
- **Code modification required:** Yes; business confirmation may be needed for cascade semantics.
- **Tests needed:** Parent deactivation/reactivation scenarios for normal and qualification topics.
- **Status:** Closed in Pass 3 — public child queries require active child and parent, child creation/reactivation requires an active parent, and submission rechecks the active Subject/Qualification Topic without mutating historical child state.

### AUD-021 — Topic names are globally unique instead of subject-scoped

- **Classification:** Domain Modeling Issue
- **Severity:** Medium
- **Evidence:** `TafseelDbContext.cs:43-55,109-115` applies a unique `Name` index to every TPC catalog table and additionally creates `(SubjectId, Name)` indexes for topics.
- **Affected files:** DbContext model and Phase 3 migration.
- **Impact:** Two subjects cannot use the same legitimate topic name, despite the presence of a subject-scoped uniqueness index. The global index is stricter than the visible domain model.
- **Recommended action:** Confirm intended uniqueness; if topic identity is subject-scoped, remove the redundant global topic/qualification-topic name indexes and retain normalized subject-scoped uniqueness.
- **Code modification required:** Yes, including a migration after business confirmation.
- **Tests needed:** Same topic name in different subjects succeeds; duplicate within one subject fails; case/whitespace variants follow the chosen normalization rule.
- **Status:** Closed in Pass 3 — Topic and Qualification Topic uniqueness is `(SubjectId, NormalizedName)` and incorrect global indexes were removed.

### AUD-022 — Catalog uniqueness depends on database collation

- **Classification:** Database Integrity Issue
- **Severity:** Medium
- **Evidence:** `Catalog.cs:19-24` trims names but does not create a canonical key. Unique indexes at `TafseelDbContext.cs:52,55,114` depend on the deployed SQL Server collation for case/accent behavior; SQLite tests use different semantics.
- **Affected files:** Catalog domain/model/migration and integration tests.
- **Impact:** Case or accent variants may be duplicates in one environment and distinct in another, producing inconsistent API behavior.
- **Recommended action:** Define product-level normalization and enforce it consistently in application validation and indexed database columns/collation.
- **Code modification required:** Yes, likely including a migration.
- **Tests needed:** SQL Server case, whitespace, and accent duplicate matrix.
- **Status:** Closed in Pass 3 — centralized Unicode NFC, whitespace-collapse, invariant-uppercase normalization is persisted and uniquely indexed; accents and Arabic diacritics are retained.

### AUD-023 — Application concurrency is server-detected but not an explicit API contract

- **Classification:** Concurrency Risk
- **Severity:** Medium
- **Evidence:** Shadow rowversion is configured at `TafseelDbContext.cs:68`, but `TeacherApplicationDto` in `TeacherApplicationContracts.cs:11-19` exposes no version/ETag. Commands accept no expected version or idempotency key. `ApiExceptionHandler.cs:26` collapses concurrency into generic `database_conflict`.
- **Affected files:** DbContext, contracts, controllers, exception handler.
- **Impact:** Parallel reviewers are protected from silent lost updates by EF, but clients cannot perform intentional optimistic concurrency, understand current state/version, or safely retry commands.
- **Recommended action:** Expose an opaque concurrency token/ETag for reviewer mutations, return a stable concurrency error, and make retry-sensitive terminal decisions idempotent where semantics permit.
- **Code modification required:** Yes.
- **Tests needed:** Two synchronized SQL Server reviewers; one succeeds, one gets a documented 409/412; repeated identical decision has defined behavior.
- **Status:** Partially closed — all current Phase 3 workflow writes require opaque `If-Match` rowversion and stale writes return `409 concurrency_conflict`; broader future-domain concurrency and generic API consistency remain open.

### AUD-024 — API input validation does not cover lengths or defined enum values

- **Classification:** Validation Gap
- **Severity:** Medium
- **Evidence:** Catalog and teacher-application request records in `CatalogContracts.cs` and `TeacherApplicationContracts.cs` have no field validators. Database max lengths are configured only in `TafseelDbContext.cs:50-67,82-91,113`; undefined numeric enums bind successfully.
- **Affected files:** Application/API contracts, controllers, exception mapping.
- **Impact:** Oversized strings reach SQL Server and become generic 409 conflicts; invalid enums reach domain logic; clients do not receive stable field-level 400 errors.
- **Recommended action:** Add boundary validation for required fields, lengths, enum membership, collection size, score range, and identifier rules while retaining domain invariants.
- **Code modification required:** Yes.
- **Tests needed:** Boundary-value API tests and exact validation ProblemDetails assertions.
- **Status:** Closed for current Phase 3 contracts — parameter validation covers required/non-whitespace fields, lengths, GUIDs, ranges, exact rubric shape, comments, and enum membership, returning RFC 7807 field errors with correlation identifiers.

### AUD-025 — Success and error contracts are inconsistent

- **Classification:** API Contract Mismatch
- **Severity:** Medium
- **Evidence:** Create endpoints use `Created("", ...)` at `CatalogController.cs:35-57` and `TeacherApplicationsController.cs:15-17`. Auth errors are manually built at `AuthController.cs:85-108,124-134`, while exceptions use `IProblemDetailsService`; framework authentication responses are not customized.
- **Affected files:** Controllers, exception/authentication middleware, OpenAPI output.
- **Impact:** `201` responses have no usable `Location`; error codes/trace/correlation/validation shapes vary by failure path, complicating frontend integration.
- **Recommended action:** Return resolvable resource locations where a GET exists or use the appropriate success code; centralize RFC 7807 extensions and customize 401/403/model-validation responses.
- **Code modification required:** Yes.
- **Tests needed:** Contract snapshots for create, validation, 401, 403, 404, 409, and 500 responses including correlation identifiers.
- **Status:** Open.

### AUD-026 — Internal storage keys are returned to clients

- **Classification:** API Contract Mismatch
- **Severity:** Medium
- **Evidence:** `StoredFile` includes `StorageKey` at `TeacherApplicationContracts.cs:26`; upload returns it directly at `TeacherApplicationsController.cs:38-40`. Generated keys reveal the internal `teacher-demos/yyyy/MM/...` layout from `LocalFileStorageService.cs:36,46`.
- **Affected files:** File contract, upload controller/service.
- **Impact:** The API leaks persistence details and couples clients to a local-storage implementation, making future object-storage migration harder.
- **Recommended action:** Return a file/media ID and safe metadata only; keep provider keys internal and authorize any future download through an application use case.
- **Code modification required:** Yes.
- **Tests needed:** Response-contract test proving no path/provider key is exposed.
- **Status:** Open.

### AUD-027 — Reviewer and catalog lists are unbounded

- **Classification:** Performance Issue
- **Severity:** Medium
- **Evidence:** Catalog APIs return complete arrays in `CatalogService.cs:11-37`; teacher `mine` and reviewer queue call `ToArrayAsync` without pagination at `TeacherApplicationService.cs:87-107`. The queue order has no supporting status/priority/submitted index in `TafseelDbContext.cs`.
- **Affected files:** Application contracts, services, controllers, indexes.
- **Impact:** Response time, memory, and database load grow without a server-side bound; reviewer queues can become operationally unusable.
- **Recommended action:** Add bounded pagination and whitelisted filters/sorts. Add indexes only after matching actual query plans, starting with reviewer queue access.
- **Code modification required:** Yes, possibly with a migration.
- **Tests needed:** Pagination bounds/metadata, deterministic sorting, invalid page size, and representative query-plan/performance checks.
- **Status:** Open.

### AUD-028 — Mutations load the full growing application history

- **Classification:** Performance Issue
- **Severity:** Medium
- **Evidence:** Every `Owned`/`Required` workflow operation loads all History, Reviews, and Scores using split queries at `TeacherApplicationService.cs:146-160`, even for update, upload, submit, withdraw, and start-review.
- **Affected files:** Teacher application service and aggregate persistence strategy.
- **Impact:** Command cost grows with historical reviews and status transitions and executes unnecessary queries, increasing latency and contention.
- **Recommended action:** Load only data required for each command, or map append-only children without materializing the complete graph. Preserve domain invariants without introducing a generic repository.
- **Code modification required:** Yes.
- **Tests needed:** Query-count tests and correctness tests for commands with large history.
- **Status:** Open.

### AUD-029 — Audit/security events and correlation-enriched logs are missing

- **Classification:** Observability Gap
- **Severity:** Medium
- **Evidence:** `CorrelationIdMiddleware.cs:14-16` stores/returns the identifier but does not push it into Serilog `LogContext`. Only request logs and unexpected/email failures are logged. Catalog changes, role creation failure, review assignment/decision, replay detection, and account security actions have no structured audit record.
- **Affected files:** API middleware/logging, Identity initialization/authentication, catalog and review workflows.
- **Impact:** Incident response cannot reliably correlate requests or reconstruct sensitive administrative/reviewer changes.
- **Recommended action:** Enrich logs with correlation/user/action context and add append-only audit records for currently implemented sensitive operations, excluding tokens, passwords, and private content.
- **Code modification required:** Yes, likely including an audit-table migration.
- **Tests needed:** Log/audit assertions for catalog mutations, review decisions, replay detection, password reset, and failure paths; verify secrets are absent.
- **Status:** Open.

### AUD-030 — Documentation overstates current guarantees

- **Classification:** Documentation Mismatch
- **Severity:** Low
- **Evidence:** `docs/phase-3-report.md:9` and `docs/file-storage.md:9-10` present size/duration validation without stating that size is declared metadata and duration is client-supplied. `docs/phase-3-report.md:8` says password reset revokes all tokens without documenting the transactional gap. `docs/phase-2-report.md:19,24` still says in-memory/EF InMemory while current integration tests use SQLite.
- **Affected files:** Phase reports, authentication/file documentation.
- **Impact:** Maintainers and reviewers can assume protections and test coverage stronger than the implementation.
- **Recommended action:** After fixes, update documentation to describe measured server-side checks, transactional guarantees, provider coverage, and remaining external controls precisely.
- **Code modification required:** Documentation only.
- **Tests needed:** None directly; verify documentation against executed commands and implementation during final audit.
- **Status:** Partially closed — Phase 3 documentation now states that duration is client metadata and that local file storage/media hardening are not production-ready. Unrelated older/future-domain documentation remains subject to later passes.

### AUD-031 — Identity role bootstrap ignores creation failures

- **Classification:** Production Bug
- **Severity:** Medium
- **Evidence:** `DependencyInjection.cs:72-75` calls `RoleManager.CreateAsync` without checking the returned `IdentityResult`.
- **Affected files:** Infrastructure startup initialization.
- **Impact:** Startup can continue with missing roles, causing registration/authorization failures later with no clear deployment error.
- **Recommended action:** Check every result and fail startup with a safe, actionable error if role initialization fails.
- **Code modification required:** Yes.
- **Tests needed:** Role-store failure and partially initialized database startup tests.
- **Status:** Open.

### AUD-032 — Duplicate-application rules differ between application code and the database

- **Classification:** Database Integrity Issue
- **Severity:** Medium
- **Evidence:** `TeacherApplicationService.cs:25-30` treats `Approved` as a duplicate, while the filtered unique index at `TafseelDbContext.cs:69-71` protects only statuses 0–3 and excludes Approved.
- **Affected files:** Teacher application service, DbContext, Phase 3 migration.
- **Impact:** The service and database encode different definitions of “active/duplicate.” Future write paths or imports can create records the service would reject.
- **Recommended action:** Confirm whether an approved teacher may ever reapply for the same subject, then align the database constraint and service rule.
- **Code modification required:** Yes after business confirmation; likely migration.
- **Tests needed:** Approved/rejected/withdrawn reapplication matrix plus concurrent creation test on SQL Server.
- **Status:** Closed in Pass 3 — service and filtered unique index use the four nonterminal statuses; Rejected/Withdrawn permit reapplication, ChangesRequested is not replaceable, and the unique qualification plus transactional checks block approved-teacher reapplication.

### AUD-033 — Upload size is not enforced while streaming inside the storage boundary

- **Classification:** File Security Issue
- **Severity:** Medium
- **Evidence:** `LocalFileStorageService.cs:25-26` checks the caller-supplied `size`, then `:43-45` copies the remaining stream without counting bytes or enforcing a hard limit. The controller has a separate hard-coded request-size attribute at `TeacherApplicationsController.cs:30-31`.
- **Affected files:** File-storage adapter/contract and upload controller.
- **Impact:** The storage abstraction is unsafe if invoked by another transport or with incorrect metadata, and controller/config limits can drift. Partial oversized files may remain after failure.
- **Recommended action:** Enforce the configured limit on actual streamed bytes, use one authoritative limit, and remove partial output on overflow/cancellation.
- **Code modification required:** Yes.
- **Tests needed:** Stream longer/shorter than declared size, exact boundary, oversized multipart body, and cancellation cleanup.
- **Status:** Open.

### AUD-034 — MP4 validation proves only a minimal marker

- **Classification:** File Security Issue
- **Severity:** Medium
- **Evidence:** `LocalFileStorageService.cs:31-34` accepts any 12-byte-or-longer stream with `ftyp` at bytes 4–7. The integration fixture at `TeacherApplicationFlowTests.cs:38-45` uses exactly 12 synthetic bytes and treats them as a valid video.
- **Affected files:** File-storage adapter and integration test fixtures.
- **Impact:** Non-video or deliberately malformed content can pass the current check. MIME/signature checks do not provide malware safety.
- **Recommended action:** Validate media structure/duration using a constrained parser, preserve malware-scanning as an external production gate, and keep parsing isolated from the API process where practical.
- **Code modification required:** Yes, plus an external scanner for production.
- **Tests needed:** Real valid MP4, truncated/corrupt/polyglot samples, parser timeout, and scanner rejection contract.
- **Status:** Open.

### AUD-035 — Dependency and SDK restore are not deterministic

- **Classification:** Configuration Risk
- **Severity:** Low
- **Evidence:** No `packages.lock.json`, `global.json`, or central package-management file exists. `dotnet restore --locked-mode` succeeded without a lock file, while the outdated-package check found available patches.
- **Affected files:** Solution-wide build configuration and CI.
- **Impact:** Clean environments can select different SDK tooling or transitive dependency graphs over time, making releases harder to reproduce.
- **Recommended action:** Pin an approved .NET 8 SDK band and adopt lock files or another deliberate deterministic dependency policy. Evaluate updates; do not upgrade blindly.
- **Code modification required:** Build-configuration files only.
- **Tests needed:** Clean-clone locked restore/build/test in CI and scheduled vulnerability scan.
- **Status:** Open.

### AUD-036 — Current architecture tests enforce only assembly references

- **Classification:** Test Gap
- **Severity:** Low
- **Evidence:** `tests/Tafseel.ArchitectureTests/DependencyTests.cs:5-22` checks assembly references only. It does not verify thin controllers, no controller `DbContext`, no EF entities in API responses, or policy coverage.
- **Affected files:** Architecture test project.
- **Impact:** Later changes can violate important architectural rules while the single architecture test still passes.
- **Recommended action:** Add focused executable rules for the boundaries explicitly required by the architecture, without introducing a large framework unless it materially simplifies the tests.
- **Code modification required:** Tests only.
- **Tests needed:** Controller dependency/return-type, layer namespace/reference, and authorization-attribute policy coverage tests.
- **Status:** Open.

## 5. Verified Strengths

- Domain has no EF Core or ASP.NET Core dependency.
- Application does not reference Infrastructure or API.
- Controllers do not inject `TafseelDbContext` or return EF entities directly.
- JWT validation enables issuer, audience, signing-key, and lifetime checks with a 30-second clock skew.
- Authenticated requests validate suspension and security stamp.
- Refresh tokens are generated with a CSPRNG, stored as SHA-256 hashes, rotated, uniquely indexed, and carry a rowversion.
- Public registration rejects Admin and QualityReviewer roles.
- Password-reset request responses do not reveal whether the account exists, and reset tokens are not logged or returned.
- Teacher application owner checks return not-found semantics to non-owners.
- Only the assigned reviewer can decide an application.
- All nine valid rubric criteria are required by the intended aggregate rule; there is no hidden score threshold.
- Approval creates a subject-specific qualification inside a database transaction.
- Catalog and application foreign keys use restrictive deletion for their main external references.
- Read-only EF queries generally use projections and `AsNoTracking`.
- Files receive generated names and are not served by static-file middleware.
- No repository file contains the disclosed Resend credential pattern.
- NuGet reported no known vulnerable packages from the configured sources at audit time.

## 6. Pass 1 Conclusion

`NOT SAFE TO START PHASE 4`

Blocking findings:

- No Critical findings remain open. AUD-001 was closed after dashboard revocation, clean scans, least-privilege storage, and controlled delivery verification.
- AUD-002 — invalid browser refresh cookie.
- AUD-003 and AUD-004 — non-atomic session invalidation.
- AUD-005 — unconfirmed accounts receive authenticated access.
- AUD-006 — non-atomic/unchecked initial role assignment.
- AUD-007 — declared teacher-application permission is bypassed.
- AUD-008 — invalid enum/rubric inputs can corrupt decisions.
- AUD-009 and AUD-010 — client-trusted duration and uncompensated file writes.
- AUD-011 — development storage is active in production composition.
- AUD-012 — audit history can cascade-delete.
- AUD-013 — no SQL Server proof for SQL Server-specific integrity/concurrency.
- AUD-014 — backend is not versioned.
- AUD-015 — Identity token keys are not shared/persistent for deployment.

Per the requested workflow, work stops after Pass 1. No fixes, migrations, future Phase 4 features, or frontend changes were made.

## 7. Pass 3 Addendum — 2026-07-26

The Pass 1 conclusion above is retained as historical audit evidence. Pass 2 and Pass 3 subsequently closed the scoped Critical/High blockers and the Phase 3 domain/catalog findings identified in their reports. See `phase-2-3-pass-2-security-report.md` and `phase-2-3-pass-3-domain-report.md` for executed evidence and the current readiness decision.
