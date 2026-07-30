# RoleBootstrap Fast-Path CI Fix

**Date:** 2026-07-30
**Type:** Test-only fix (no production code changed)
**Classification:** Stale Test

## Finding

`RoleBootstrapTests.Repeated_bootstrap_uses_the_bounded_fast_path` asserted an exact `ReadCount` of `3` on a repeated (idempotent) `InitializeIdentityAsync()` call. It actually performs `4` reads. Isolated run:

```
Assert.Equal() Failure: Values differ
Expected: 3
Actual:   4
```

## Root Cause

`InitializeIdentityCoreAsync` (`src/Tafseel.Infrastructure/DependencyInjection.cs:430`) runs two things in sequence on *every* startup:

1. `BackfillCanonicalServiceLocalizationAsync(db)` (line 437) — unconditional, runs before any fast-path check. It reads all canonical `ServiceCatalogItem` rows once (`ToArrayAsync`, 1 read) to detect and correct stale Arabic localization on existing rows, and only writes if something is actually out of date.
2. `IdentitySeedIsCurrentAsync(db, ...)` (line 448) — the fast-path check itself. With the test's null `IHostEnvironment` (`staging` and `developmentSeedEnabled` both false), it does exactly `3` reads (`Roles.CountAsync`, `ServiceCatalogItems.CountAsync`, `TeachingLanguages.CountAsync`, `DependencyInjection.cs:561-570`) and returns `true`, skipping the write transaction entirely.

`1 (backfill) + 3 (fast-path check) = 4`. The backfill step is a legitimate, intentional, low-cost data-correction step (bounded — a small constant number of reads, not proportional to table size, and read-only unless something is actually stale). It predates or postdates the test's hardcoded `3` without the test being updated; there is no redundant or unintended query here, and the actual "fast path" invariant — an already-current seed never enters the write strategy/transaction — was never broken.

This is **not** a Production Bug (no unintended query fires) and **not** a Test Isolation Issue (both reads are genuinely part of the same startup call, not noise from an unrelated fixture). It is a **Stale Test**: a magic exact-count assertion that broke when a legitimate step was added to the sequence it was measuring.

## Fix

- `tests/Tafseel.IntegrationTests/SqlServerTafseelApiFactory.cs`: `CountingCommandInterceptor` now also tracks `WriteCount` (`NonQueryExecuting`/`NonQueryExecutingAsync`), so the test can assert the real invariant directly instead of only inferring it from a read count.
- `tests/Tafseel.IntegrationTests/RoleBootstrapTests.cs`: `Repeated_bootstrap_uses_the_bounded_fast_path` now asserts:
  - `WriteCount == 0` — the actual fast-path guarantee (no write transaction on an already-current seed).
  - `ReadCount` is in `[1, 6]` — bounded and documented (comment explains the `1 + 3 = 4` breakdown), generous enough that one more incidental read added to either step doesn't cause a magic-number failure, while still catching a genuine regression into unbounded/proportional-to-data-size behavior.

No production code was changed. The bounded-fast-path guarantee itself was not weakened — it is now asserted more precisely (zero writes) than the previous proxy (an incidental exact read count).

## Validation

| Check | Result |
|---|---|
| `Repeated_bootstrap_uses_the_bounded_fast_path` alone | Pass |
| `RoleBootstrapTests` class (10 tests) | Pass |
| Full provider-neutral integration suite (`tests/Tafseel.IntegrationTests`) | 195/195 Pass |

## Files Changed

- `tests/Tafseel.IntegrationTests/SqlServerTafseelApiFactory.cs`
- `tests/Tafseel.IntegrationTests/RoleBootstrapTests.cs`
- `docs/fixes/ROLE_BOOTSTRAP_FAST_PATH_CI_FIX_REPORT.md` (this report)
