# Tafseel F-001 Identity Initialization Fix Report

Audit/fix baseline: branch `main`, commit `6c42d7e`, 2026-07-29.

Scope was limited to F-001. No roadmap feature, frontend, database schema, migration, workflow, provider, metric, file-storage, SignalR, portfolio, revision or favorite behavior was changed.

## Findings

Final classification: **Production Bug**.

### Exact pre-fix behavior

`src/Tafseel.Api/Program.cs` contained:

```csharp
if (!app.Environment.IsEnvironment("Testing"))
    await app.Services.InitializeIdentityAsync(app.Environment.IsDevelopment());
```

`InitializeIdentityAsync(bool migrate = false)` did not perform an environment check. It always called `InitializeIdentityCoreAsync(services, migrate)` through the bounded startup retry.

`InitializeIdentityCoreAsync` behaved as follows:

1. If `migrate` was `true`, it called `Database.MigrateAsync()`.
2. Regardless of `migrate`, it resolved `TafseelDbContext`.
3. It checked whether the canonical roles, service catalog items and teaching languages were current.
4. If not current, it repaired/seeds them transactionally.
5. If the registered host environment was Staging, it also created or repaired the four Staging demo identities, confirmation flags and role assignments.

Therefore the boolean argument controlled automatic migration only. It did not prevent initializer invocation or seed execution.

| Environment | Program invoked initializer before fix | `migrate` argument | Migration through this path | Seed/repair through this path | Demo identities |
|---|---:|---:|---:|---:|---:|
| Development | Yes | `true` | Yes | Yes | No |
| Testing | No | N/A | No | No from `Program` | No from `Program` |
| Testing via `TafseelApiFactory` | Explicit test-factory invocation | `false` | No; test factory uses `EnsureCreated` | Yes | No |
| Staging | Yes | `false` | No | Yes | Yes |
| Production | Yes by control flow | `false` | No | Yes | No |

Current Production configuration is designed to fail closed while only mock providers are registered. That validation can prevent a real Production host from reaching the final initializer line today, but it does not make the initializer control flow correct. Once valid providers are registered, the pre-fix Production path would invoke seed repair.

### Exact post-fix behavior

The startup boundary now delegates to `IdentityInitialization.RunAsync`. The executable policy invokes the provided initializer only when `IHostEnvironment.IsDevelopment()` is true and passes `migrate: true`.

| Environment | Program invokes initializer after fix | Migration through this path | Seed/repair through this path |
|---|---:|---:|---:|
| Development | Yes, once, with `migrate: true` | Yes, preserving existing Development behavior | Yes |
| Testing | No | No | No from `Program`; canonical test factory still bootstraps explicitly |
| Staging | No | No | No |
| Production | No | No | No |

Existing initializer internals and direct test-only calls were not redesigned or removed.

## Root Cause

The startup condition guarded only Testing:

```text
not Testing -> call initializer
```

The boolean passed to the initializer was named `migrate`, and its only migration-specific effect was:

```text
migrate == true -> Database.MigrateAsync()
```

All role/catalog/language checks and repairs occurred after that branch regardless of the boolean. Staging-specific demo-user behavior was selected inside `InitializeIdentityCoreAsync` from `IHostEnvironment`, so calling the initializer in Staging with `false` still created/repaired demo users.

The defect was therefore at the invocation boundary, not in EF migration selection or the idempotent seed implementation.

## Fix

The smallest explicit startup-boundary policy was added:

```text
Development -> invoke initializer with migrations enabled
any other environment -> completed task without invoking the initializer
```

The initializer, seed definitions, roles, catalog items, languages, demo identities, passwords, claims, authorization rules, transaction/retry behavior and configuration validation are unchanged.

An internal executable seam accepts the environment and initializer delegate. This permits behavior-level tests to prove invocation count and migration intent without starting Production with invalid providers or touching a real database.

`Tafseel.IntegrationTests` received internal access only to test that boundary. This does not change the HTTP/API surface.

## Validation

### 1. Release API build

Command:

```powershell
dotnet build src/Tafseel.Api/Tafseel.Api.csproj -c Release --no-restore
```

- Exit code: `0`
- Passed: build succeeded, 4 projects
- Failed: `0`
- Skipped: `0`
- Warnings: `0`
- Errors: `0`

### 2. First targeted bootstrap attempt

Command:

```powershell
dotnet test tests/Tafseel.IntegrationTests/Tafseel.IntegrationTests.csproj -c Release --no-restore --filter FullyQualifiedName~RoleBootstrapTests --logger "console;verbosity=normal"
```

- Exit code: `1`
- Passed: `0` tests executed
- Failed: `0` tests executed; test project compilation failed
- Skipped: `0`
- Error: `CS0182` because `Environments.Staging` and `Environments.Production` are properties and cannot be `[InlineData]` constants.
- Classification: **Test Issue**
- Resolution: changed only the two test attributes to literal environment names and reran the same command.

### 3. Targeted startup/bootstrap tests after test correction

Command:

```powershell
dotnet test tests/Tafseel.IntegrationTests/Tafseel.IntegrationTests.csproj -c Release --no-restore --filter FullyQualifiedName~RoleBootstrapTests --logger "console;verbosity=normal"
```

- Exit code: `0`
- Passed: `10`
- Failed: `0`
- Skipped: `0`

Covered:

- Development invokes exactly once with migrations enabled.
- Staging invokes zero times.
- Production invokes zero times.
- Testing invokes zero times at the Program boundary.
- The canonical Testing factory still performs its intentional explicit bootstrap.
- Empty, repeated and partially seeded databases retain idempotent repair.
- Staging initializer internals retain their existing direct-call behavior.
- Non-Staging direct bootstrap does not create demo users.
- Transaction rollback and bounded fast path remain intact.

The Testing-factory test logged an existing SQLite translation warning from `NotificationOutboxWorker`; it did not fail the test and was not caused or changed by F-001.

### 4. Configuration validation tests

Command:

```powershell
dotnet test tests/Tafseel.IntegrationTests/Tafseel.IntegrationTests.csproj -c Release --no-build --filter FullyQualifiedName~ConfigurationValidationTests --logger "console;verbosity=normal"
```

- Exit code: `0`
- Passed: `30`
- Failed: `0`
- Skipped: `0`

Production still rejects:

- Development signing keys.
- Mock payment provider.
- Mock live-session provider.
- HTTP frontend URLs.
- Resend sandbox sender.

Other JWT, email, fee, payment, live-session and dispute fail-fast checks also passed.

### 5. Relevant identity and retry integration tests

Command:

```powershell
dotnet test tests/Tafseel.IntegrationTests/Tafseel.IntegrationTests.csproj -c Release --no-build --filter "FullyQualifiedName~IdentityStartupRetryTests|FullyQualifiedName~AuthenticationTests" --logger "console;verbosity=normal"
```

- Exit code: `0`
- Passed: `20`
- Failed: `0`
- Skipped: `0`

Authentication registration, confirmation, login, refresh rotation/replay containment, profile/password changes, password reset and startup retry behavior remained green.

### 6. Wider integration suite

Command:

```powershell
dotnet test tests/Tafseel.IntegrationTests/Tafseel.IntegrationTests.csproj -c Release --no-build --logger "console;verbosity=minimal"
```

- Exit code: `1`
- Passed: `129`
- Failed: `1`
- Skipped: `0`
- Total: `130`

Failure:

```text
Phase4MarketplaceTests.Public_search_has_fixed_sort_pagination_filters_and_two_queries
Expected query count: 1–2
Actual query count: 4
```

Classification: **Test Issue** outside F-001. The failing assertion measures a shared query interceptor and is order/isolation sensitive. No Marketplace code was changed.

### 7. Isolated rerun of the wider-suite failure

Command:

```powershell
dotnet test tests/Tafseel.IntegrationTests/Tafseel.IntegrationTests.csproj -c Release --no-build --filter FullyQualifiedName~Public_search_has_fixed_sort_pagination_filters_and_two_queries --logger "console;verbosity=normal"
```

- Exit code: `0`
- Passed: `1`
- Failed: `0`
- Skipped: `0`

The pass in isolation confirms the wider-suite failure is not an F-001 production regression. It remains an unchanged test-isolation issue.

### 8. Diff and migration scope check

Command:

```powershell
git diff --check
```

- Exit code: `0`
- Passed: whitespace check
- Failed: `0`
- Skipped: not applicable

Command:

```powershell
git diff --name-only -- src/Tafseel.Infrastructure/Persistence/Migrations
```

- Exit code: `0`
- Passed: no migration files listed
- Failed: `0`
- Skipped: not applicable

No migration was generated or applied.

## Files Changed

### `src/Tafseel.Api/Program.cs`

- Why: replace the non-Testing call with the explicit Development-only startup boundary.
- Important symbols: startup call; internal `IdentityInitialization.RunAsync`.
- Backward compatibility: Development retains initializer execution with `migrate: true`; Testing retains Program-level skip; Staging and Production intentionally stop startup seed execution. No API contract change.

### `src/Tafseel.Api/Properties/AssemblyInfo.cs`

- Why: allow the existing integration-test assembly to execute the internal startup boundary policy.
- Important symbols: `InternalsVisibleTo("Tafseel.IntegrationTests")`.
- Backward compatibility: build/test metadata only; no runtime or HTTP behavior change.

### `tests/Tafseel.IntegrationTests/RoleBootstrapTests.cs`

- Why: prove Development, Testing, Staging and Production invocation behavior and preserve the Testing factory bootstrap.
- Important symbols: `Development_startup_invokes_bootstrap_with_migrations_enabled`, `Non_development_startup_does_not_invoke_bootstrap`, `Testing_factory_preserves_its_intentional_bootstrap`.
- Backward compatibility: test-only.

### `TAFSEEL_F001_IDENTITY_INITIALIZATION_FIX_REPORT.md`

- Why: required evidence and validation report.
- Important symbols: not applicable.
- Backward compatibility: documentation-only.

The pre-existing untracked `TAFSEEL_PHASE_0_1_AUDIT_REPORT.md` from the prior pass was not modified in this pass.

## Risks

### Development bootstrap risk

Low. Development still invokes the same initializer once with `migrate: true`. Existing idempotency, transaction, retry and repair tests passed.

### Testing behavior risk

Low. Program still does not bootstrap in Testing. `TafseelApiFactory` continues to `EnsureCreated` and then explicitly invokes `InitializeIdentityAsync()` with migrations disabled. A behavior-level factory test passed.

### Staging data risk

Reduced. Normal Staging application startup can no longer invoke seed repair or create demo identities through this path. Existing demo definitions/direct initializer behavior remain in code as required, but are unreachable from normal Staging startup.

### Production startup risk

Reduced. Normal Production startup no longer reaches the initializer, seed checks or `MigrateAsync` through this path. Configuration validation remains unchanged and continues to fail closed for invalid/mock Production configuration.

### Validation risk

The full provider integration suite is not entirely green because of one pre-existing/order-sensitive Marketplace query-count test. It passed in isolation and does not touch the changed startup boundary.

## Remaining Issues

- The unrelated `Public_search_has_fixed_sort_pagination_filters_and_two_queries` test remains order/isolation sensitive. It was not modified because this pass is strictly limited to F-001.
- The existing SQLite `NotificationOutboxWorker` translation warning remains unchanged.
- All roadmap findings from the Phase 0–1 audit remain unchanged and out of scope.

## Final Verdict

**F-001 CONFIRMED AND FIXED**

The required environment behavior is covered by focused executable tests, the affected API builds cleanly, identity/configuration regressions pass, no migration path remains for Staging/Production through normal startup, and configuration fail-fast protections remain intact. The unrelated full-suite test failure is explicitly reported and reproduced as passing in isolation.

## Next Step

Perform one focused product pass for the owned order lifecycle timeline using only existing persisted lifecycle evidence, with no new event bus and no inferred events.
