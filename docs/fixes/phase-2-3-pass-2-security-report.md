# Tafseel Phase 2–3 Hardening — Pass 2 Security Report

Date: 2026-07-26  
Scope: Critical Security and Authorization only. Pass 3 and Phase 4 were not started.

## 1. Findings Addressed

- AUD-001: repository checked; external Resend credential revocation remains unverified.
- AUD-002: standards-compliant `__Host-` refresh-cookie contract.
- AUD-003: atomic password reset, security-stamp change, and refresh-token revocation.
- AUD-004: transactional replay containment and deterministic concurrent refresh.
- AUD-005: email confirmation before authentication.
- AUD-006: atomic registration and initial role assignment.
- AUD-007: `Teachers.Apply` policy plus existing ownership enforcement.
- AUD-017: only JWT/email/cookie validation needed by Pass 2.
- AUD-031: atomic, checked role bootstrap.
- AUD-016: logout was minimally corrected because compatible cookie deletion and revocation are part of the Pass 2 session contract.
- AUD-029: only security logging and correlation propagation needed by Pass 2.

No Phase 3 state-machine, file-hardening, marketplace, payment, order, session, messaging, notification, review, dispute, wallet, or escrow work was added.

## 2. Files Changed

### Production

- `src/Tafseel.Application/Authentication/Authentication.cs` — registration-without-tokens result, confirmation operations, and stable authentication outcomes.
- `src/Tafseel.Application/Authorization/Authorization.cs` — centralized `Teachers.Apply` constant.
- `src/Tafseel.Infrastructure/Identity/ApplicationUser.cs` — persisted confirmation-send timestamp for cooldown.
- `src/Tafseel.Infrastructure/Identity/AuthenticationService.cs` — transactional registration/reset/replay, confirmation flow, safe security logging.
- `src/Tafseel.Infrastructure/DependencyInjection.cs` — JWT/email/provider validation and atomic role initialization.
- `src/Tafseel.Infrastructure/Email/ResendEmailSender.cs` — configured confirmation URL.
- `src/Tafseel.Infrastructure/Persistence/Migrations/20260726123640_Pass2EmailConfirmation.cs` — confirmation cooldown column.
- `src/Tafseel.Infrastructure/Persistence/Migrations/20260726123640_Pass2EmailConfirmation.Designer.cs` — generated model metadata.
- `src/Tafseel.Infrastructure/Persistence/Migrations/TafseelDbContextModelSnapshot.cs` — updated model snapshot.
- `src/Tafseel.Api/Controllers/AuthController.cs` — confirmation endpoints, cookie contract, stable Pass 2 problems, anonymous idempotent logout.
- `src/Tafseel.Api/Controllers/TeacherApplicationsController.cs` — applicant permission policies.
- `src/Tafseel.Api/Middleware/ApiProblem.cs` — one RFC 7807 constructor/writer for changed security endpoints.
- `src/Tafseel.Api/Middleware/CorrelationIdMiddleware.cs` — Serilog correlation scope.
- `src/Tafseel.Api/Program.cs` — JWT 401/403 problems, applicant policy role requirement, confirmation rate limit.
- `src/Tafseel.Api/appsettings.json` — confirmation URL and MARS disabled for reliable savepoint/transaction behavior.
- `src/Tafseel.Api/Tafseel.Api.csproj` — safe local User Secrets identifier.

### Tests

- `tests/Tafseel.IntegrationTests/TafseelApiFactory.cs` — confirmation-aware email capture and provider hook.
- `tests/Tafseel.IntegrationTests/SqlServerTafseelApiFactory.cs` — temporary SQL Server LocalDB database and controlled revocation failure.
- `tests/Tafseel.IntegrationTests/AuthenticationTests.cs` — confirmed-login flow and stable refresh problems.
- `tests/Tafseel.IntegrationTests/EmailConfirmationSecurityTests.cs` — confirmation, cookie, cooldown, rate limit, expiry, delivery-failure tests.
- `tests/Tafseel.IntegrationTests/SqlServerAuthenticationSecurityTests.cs` — SQL Server atomicity/concurrency/failure tests.
- `tests/Tafseel.IntegrationTests/TeacherApplicationAuthorizationTests.cs` — permission and ownership matrix.
- `tests/Tafseel.IntegrationTests/RoleBootstrapTests.cs` — empty/repeated/partial/failing role initialization.
- `tests/Tafseel.IntegrationTests/ConfigurationValidationTests.cs` — JWT/email/Resend invalid-boundary tests.
- `tests/Tafseel.IntegrationTests/CatalogTests.cs` — directly provisioned admin is explicitly confirmed.
- `tests/Tafseel.IntegrationTests/TeacherApplicationFlowTests.cs` — confirmed teacher/reviewer accounts and non-assigned reviewer denial.

### Documentation

- `README.md` — safe secret storage and replacement guidance.
- `docs/authentication.md` — implemented confirmation and cookie/CSRF contract.
- `docs/phase-2-3-pass-2-security-report.md` — this report.

## 3. Authentication Behavior Before and After

| Behavior | Before | After |
|---|---|---|
| Registration | Issued access and refresh tokens immediately | Creates Student/Teacher atomically, sends confirmation, returns `202` with `confirmationRequired=true`, no tokens |
| Role assignment | Result ignored; orphan user possible | Result checked inside the same relational transaction; failure rolls back the user |
| Login | Unconfirmed account could authenticate | Returns `401 email_confirmation_required` until Identity confirmation succeeds |
| Refresh cookie | `__Host-` cookie had invalid scoped Path | Valid `__Host-` contract with `Path=/` |
| Password reset | Password/stamp and token revocation could partially commit | One transaction; response succeeds only after full commit |
| Replay handling | Family revoke and stamp update were separate | One transaction; repeated containment is safe and concurrent refresh has one winner |
| Logout | Required a valid access token | Cookie-based revocation/deletion is anonymous and idempotent |
| Security errors | Mixed manually built responses | Changed security endpoints use stable RFC 7807 codes with trace/correlation IDs |

## 4. Cookie Contract

```text
Name: __Host-tafseel-refresh
Secure: true
HttpOnly: true
Path: /
Domain: not set
SameSite: Strict
```

Creation and deletion use the same method and options. The raw refresh token remains only in the encrypted transport cookie and internal authentication result; it is not returned by API response bodies, headers, logs, Swagger contracts, query strings, or JavaScript-readable storage.

The tests assert the exact `Set-Cookie` attributes for creation and deletion. Playwright was not added because no browser framework exists in the repository; adding one only for cookie parsing would be unnecessary. A final smoke test in each supported production browser remains recommended after deployment.

### CSRF analysis

- Refresh and logout are POST-only and depend on a `SameSite=Strict` cookie.
- Strict blocks the cookie on cross-site requests. Exact credentialed CORS origins remain required but are not a replacement for SameSite.
- A frontend on a different origin under the same registrable site can use the cookie. A frontend on a different site cannot; changing to `SameSite=None` requires a separate explicit design and anti-CSRF token/origin enforcement.
- Confirmation does not use ambient authentication. It requires the Identity confirmation bearer token in the POST body.
- Confirmation resend is anonymous and therefore non-enumerating, rate-limited, and protected by a persisted two-minute per-account cooldown.
- Same-site subdomain compromise remains a broader deployment/XSS threat and is not solved by cookie attributes.

## 5. Email-Confirmation Flow

1. Student or Teacher submits registration.
2. User creation and role assignment commit atomically.
3. ASP.NET Core Identity creates a confirmation token.
4. The existing email abstraction sends a configured trusted frontend link.
5. Registration returns no access or refresh token.
6. Unconfirmed login returns `email_confirmation_required`.
7. Frontend submits email and token to `POST /api/v1/auth/confirm-email`.
8. Identity validates and confirms the address.
9. Repeating a successful confirmation is idempotent.
10. Normal login can then issue access and refresh tokens.

Implemented endpoints:

```text
POST /api/v1/auth/request-email-confirmation
POST /api/v1/auth/confirm-email
```

Resend responses do not reveal whether an email exists. The endpoint has a fixed-window rate limit of three requests per 15 minutes per observed client IP and a persisted two-minute user cooldown. Invalid, altered, and deterministically expired tokens are rejected. Admin and QualityReviewer self-registration remain forbidden.

No Auth HTML page was added.

## 6. Transaction Boundaries

### Registration

One transaction covers:

- Identity user creation.
- Initial Student/Teacher role assignment.
- Commit before any success result.

Every `IdentityResult` is checked. Returned role-assignment failures and thrown role-store failures both roll back. Confirmation email is intentionally after the database commit because external email cannot participate in the SQL transaction; a delivery failure returns `confirmation_send_failed`, and the user can safely request resend.

### Password reset

One SQL transaction covers:

- Identity reset-token validation and password update.
- Identity security-stamp update performed by `ResetPasswordAsync`.
- Revocation of every active refresh token.
- Final commit.

No password hash is manually changed. A controlled failure on refresh-token persistence rolls back the password, stamp, and token changes. MARS is disabled so EF Core savepoints and transaction failure behavior remain reliable.

### Refresh rotation and replay

Normal rotation revokes the presented token and inserts its replacement in one transaction. Reuse of a replaced token:

- Finds the complete family.
- Revokes every active member.
- Changes the Identity security stamp.
- Commits before returning `refresh_token_reused`.

If two refresh requests race, rowversion allows exactly one rotation. The losing request enters transactional replay containment. A repeated replay finds no active family member and returns the same safe error without repeatedly changing the stamp.

## 7. Permission Changes

`Teachers.Apply` is now a centralized constant and policy. The policy requires both:

- The `Teachers.Apply` claim.
- The `Teacher` role.

It protects create, update, demo upload/replacement, submit, withdraw, and own-list endpoints. Existing Application-layer ownership checks remain unchanged. The tests prove:

- Anonymous: `401`.
- Student: `403`.
- Teacher without permission: `403`.
- Teacher owner with permission: allowed.
- Different Teacher with permission: safe `404` from ownership.
- QualityReviewers: cannot act as applicants.
- Admin: does not become an applicant merely because Admin has broad permission claims.
- Suspended Teacher: `401`.
- A non-assigned QualityReviewer cannot decide an application.
- The assigned reviewer can still approve.

## 8. Security Logs Added

Structured events now cover:

- Registration success and safe failure outcomes.
- Role-assignment failure.
- Invalid, locked, suspended, and unconfirmed login outcomes.
- Confirmation request, completion, invalid token, and delivery failure.
- Password-reset completion and delivery failure.
- Refresh rotation.
- Replay detection with user ID, token-family ID, timestamp, and containment outcome.
- Logout/token revocation.

`X-Correlation-ID` is pushed into Serilog `LogContext`, so request and service logs share the same identifier.

Passwords, access tokens, refresh tokens, reset tokens, confirmation tokens, authorization headers, cookie values, and full email bodies are never logged. Provider email exceptions are reduced to safe failure-type metadata rather than returned to clients or written with provider payload details.

No generic audit-table subsystem was added.

## 9. Errors for Changed Endpoints

Stable codes implemented:

```text
invalid_credentials
email_confirmation_required
invalid_confirmation_token
confirmation_send_failed
account_suspended
refresh_token_missing
refresh_token_invalid
refresh_token_expired
refresh_token_reused
registration_failed
role_assignment_failed
forbidden
```

Changed security problems include `traceId` and `correlationId`. Anonymous authentication failures use `401`; authenticated policy denial uses `403`; invalid confirmation uses `400`; duplicate registration is the only registration state conflict using `409`. Provider details and stack traces are not returned.

## 10. Tests Added

- Browser-compatible creation/deletion cookie attribute contract.
- Student and Teacher confirmation-required registration.
- No token/cookie before confirmation.
- Unconfirmed login denial and confirmed login success.
- Valid, altered, expired, and repeated confirmation behavior.
- Non-enumerating confirmation resend, cooldown, rate limiting, and provider failure.
- Privileged self-registration denial.
- Missing/replayed refresh stable problems and correlation.
- SQL Server successful password reset revoking old sessions.
- SQL Server failure injection rolling back password, stamp, and sessions.
- SQL Server normal rotation, replay, family containment, stamp invalidation, repeated replay.
- SQL Server synchronized concurrent refresh with exactly one winner.
- SQL Server replay-containment failure rollback.
- SQL Server role-assignment failure rollback with no orphan user.
- Full applicant authorization/ownership matrix.
- Assigned versus different QualityReviewer decision behavior.
- Empty, repeated, partial, and failing role bootstrap.
- JWT, email URL/sender, production HTTPS, and Resend-token startup validation.

No arbitrary delay is used for concurrency; the race test uses a `Barrier`.

## 11. Exact Commands and Results

```text
dotnet restore Tafseel.sln
Passed — all projects up to date.

dotnet build Tafseel.sln -c Release --no-restore
Passed — 0 warnings, 0 errors.

dotnet test Tafseel.sln -c Release --no-build --logger "console;verbosity=minimal"
Passed — 45/45 tests, 0 failed, 0 skipped.

dotnet test tests/Tafseel.IntegrationTests/Tafseel.IntegrationTests.csproj -c Release --no-build --filter "FullyQualifiedName~SqlServerAuthenticationSecurityTests" --logger "console;verbosity=minimal"
Passed — 5/5 SQL Server tests, 0 failed, 0 skipped.

dotnet ef migrations has-pending-model-changes --project src/Tafseel.Infrastructure --startup-project src/Tafseel.Api --configuration Release --no-build
Passed — no pending model changes.
```

Suite totals:

- Domain: 3 passed.
- Application: 5 passed.
- Architecture: 1 passed.
- Integration: 36 passed.
- Total: 45 passed.

## 12. SQL Server Results

Docker is unavailable on this workstation. The relational security suite used the installed SQL Server LocalDB engine, not SQLite or EF InMemory. Each fixture creates a unique temporary database, applies all three real migrations, runs HTTP-level tests through the production EF provider, and deletes the database afterward.

Verified on SQL Server:

- Password-reset commit and forced rollback.
- Old/new password behavior after rollback.
- Refresh-token revocation rollback.
- Security-stamp rollback.
- Normal refresh rotation.
- Replaced-token reuse.
- Full family revocation.
- Exactly one concurrent refresh winner.
- Deterministic repeated replay.
- Role-assignment failure rollback and absence of orphan user.

No SQL Server test was skipped.

## 13. Finding Status

| Finding | Status | Pass 2 evidence |
|---|---|---|
| AUD-001 | External Blocker | No credential found in repository; provider revocation not independently confirmed |
| AUD-002 | Closed | Exact creation/deletion cookie contract tests |
| AUD-003 | Closed | SQL Server success and failure-injection rollback tests |
| AUD-004 | Closed | SQL Server rotation/replay/concurrency/failure tests |
| AUD-005 | Closed | Confirmation, denial, resend, expiry, rate, and delivery tests |
| AUD-006 | Closed | SQL Server missing-role rollback test; no user remains |
| AUD-007 | Closed | Policy reflection and HTTP authorization/ownership matrix |
| AUD-008 | Still Open | Pass 3 scope |
| AUD-009 | Still Open | Later file-hardening pass |
| AUD-010 | Still Open | Later file-hardening pass |
| AUD-011 | Still Open | Later file/deployment pass |
| AUD-012 | Still Open | Later persistence pass |
| AUD-013 | Partially Closed | Pass 2 SQL Server security coverage added; broader SQL Server coverage remains |
| AUD-014 | Still Open | Version-control action remains |
| AUD-015 | Still Open | Later deployment pass |
| AUD-016 | Closed | Anonymous idempotent cookie logout with compatible deletion contract |
| AUD-017 | Partially Closed | JWT/email/cookie portion closed; unrelated file options remain |
| AUD-018 | Still Open | Later deployment pass |
| AUD-019 | Still Open | Later persistence pass |
| AUD-020 | Still Open | Pass 3/persistence scope |
| AUD-021 | Still Open | Pass 3 catalog scope |
| AUD-022 | Still Open | Pass 3/persistence scope |
| AUD-023 | Still Open | Later concurrency/API pass |
| AUD-024 | Still Open | Later validation pass |
| AUD-025 | Partially Closed | Changed auth endpoints centralized; unrelated Phase 3 contracts remain |
| AUD-026 | Still Open | Later file/API pass |
| AUD-027 | Still Open | Later performance pass |
| AUD-028 | Still Open | Later performance pass |
| AUD-029 | Partially Closed | Security correlation/logging closed; generic audit subsystem remains |
| AUD-030 | Partially Closed | Authentication docs corrected; unrelated Phase reports remain |
| AUD-031 | Closed | Empty/repeat/partial/failure bootstrap tests |
| AUD-032 | Still Open | Pass 3 business confirmation/persistence scope |
| AUD-033 | Still Open | Later file-hardening pass |
| AUD-034 | Still Open | Later file-hardening pass |
| AUD-035 | Still Open | Later build/deployment pass |
| AUD-036 | Still Open | Later architecture-test pass |

## 14. External Actions Required

AUD-001 is not closed. Perform these steps manually in the Resend account:

1. Open the Resend dashboard and go to **API Keys**.
2. Identify the credential disclosed in the prior conversation by its prefix; do not paste it into another ticket, command history, or document.
3. Revoke/delete that credential immediately.
4. Review Resend activity, email logs, recipients, volume, failures, and account/audit history from the disclosure time onward.
5. If activity is suspicious, preserve evidence, rotate related credentials, and review sender-domain/DNS configuration and account access.
6. Create a replacement key with only the sending access required by Tafseel.
7. Configure local development without committing it:

   ```powershell
   dotnet user-secrets set "Resend:ApiToken" "<replacement-key>" --project src/Tafseel.Api
   ```

8. Configure deployment through the platform secret manager as `Resend__ApiToken`; do not put it in JSON, `.env`, Docker image layers, CI logs, or source control.
9. Set `Email:From` to a verified sender and both frontend URLs to trusted HTTPS routes.
10. Send one controlled confirmation email, verify delivery/link behavior, and independently verify that the revoked credential can no longer authenticate.
11. Record the revocation time and verifier outside this repository. Only then may AUD-001 be marked Closed.

A final real-browser smoke test should also verify that the deployed browser stores and deletes the `__Host-tafseel-refresh` cookie exactly as expected. The automated RFC attribute contract already passes.

## 15. Pass 3 Decision

The code-side Pass 2 findings are closed with provider-neutral and SQL Server evidence. However, the externally disclosed live-looking credential remains a Critical blocker until revocation is independently confirmed.

```text
NOT SAFE TO PROCEED TO PASS 3
```

Unresolved Critical/High Pass 2 blocker:

- AUD-001 — Resend credential revocation and activity review are not independently confirmed.
