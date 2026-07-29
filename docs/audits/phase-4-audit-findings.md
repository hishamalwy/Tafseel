# Phase 4 Audit Findings

Date: 2026-07-26

## P4-001 — Favorite list depended on unrelated search pagination

- Severity: Medium
- Category: Bug
- Evidence: the first implementation joined favorite IDs to only the first 50 general marketplace results.
- Affected files: `MarketplaceService.cs`
- Real impact: a valid favorite could disappear when it was outside that unrelated page.
- Recommended fix: query favorites directly with the same public card projection.
- Tests required: repeated favorite PUT/DELETE, database uniqueness, favorite retrieval.
- Status: Closed. Favorites now use a direct ordered SQL projection.

## P4-002 — Inactive catalog services could remain publicly priced

- Severity: Medium
- Category: Data Integrity / Missing Validation
- Evidence: the initial public card projection checked only `TeacherService.IsActive`.
- Affected files: `MarketplaceService.cs`
- Real impact: a deactivated Subject or service type could still appear as an offer.
- Recommended fix: require active Subject and service catalog rows in all public service filters and projections while retaining owner history.
- Tests required: public/internal separation and filter query tests.
- Status: Closed.

## P4-003 — Unreliable online filter could silently mislead

- Severity: Medium
- Category: Missing Validation
- Evidence: no presence source exists in the repository.
- Affected files: `MarketplaceContracts.cs`, `MarketplaceService.cs`
- Real impact: silently accepting the filter would claim behavior the platform cannot verify.
- Recommended fix: accept the frontend parameter but return a stable explicit error when true.
- Tests required: anonymous search with `onlineOnly=true`.
- Status: Closed with `online_status_unavailable`.

## P4-004 — Provider-specific currency check broke SQLite regression tests

- Severity: High
- Category: Bug
- Evidence: SQL `LEN()` in the EF model caused every SQLite-backed API test to fail during schema creation.
- Affected files: `TafseelDbContext.cs`, Phase 4 migration
- Real impact: previous-phase regression suite could not run.
- Recommended fix: use a SQL expression supported by both SQL Server and SQLite, regenerate the migration, and rerun the full suite.
- Tests required: all solution tests plus fresh SQL Server migration.
- Status: Closed. The portable fixed-length pattern check replaced `LEN()`.

## P4-005 — Invalid time-zone IDs escaped as server errors

- Severity: High
- Category: Bug / Missing Validation
- Evidence: `TimeZoneInfo.FindSystemTimeZoneById` exceptions initially reached centralized handling as unexpected exceptions.
- Affected files: `Marketplace.cs`
- Real impact: invalid client input returned 500 instead of a safe validation error.
- Recommended fix: translate unsupported/corrupt time zones into the domain error `invalid_time_zone`.
- Tests required: invalid and valid time-zone integration paths.
- Status: Closed.

## P4-006 — Concurrent availability inserts require deterministic conflict handling

- Severity: High
- Category: Concurrency
- Evidence: overlap validation alone cannot serialize two empty-range reads.
- Affected files: `MarketplaceService.cs`, `TafseelDbContext.cs`
- Real impact: overlapping schedules could be inserted or a SQL deadlock could become a 500.
- Recommended fix: use a serializable transaction, supporting range index, database uniqueness, and map insert/deadlock races to `availability_conflict`.
- Tests required: synchronized overlapping API requests against SQL Server.
- Status: Closed.

## Gate

No unresolved in-scope Critical or High Phase 4 finding remains.
