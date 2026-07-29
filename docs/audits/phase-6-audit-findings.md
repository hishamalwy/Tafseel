# Phase 6 Audit Findings

Date: 2026-07-26

## P6-001 — Partial-minute durations could pass domain validation

- Severity: High
- Category: Database Integrity Issue
- Evidence: duration validation converted total minutes to `int`, so 30 minutes and extra seconds appeared as 30.
- Affected files: `src/Tafseel.Domain/LiveSessions/LiveSessions.cs`
- Real impact: persisted session boundaries could disagree with the four supported exact durations.
- Recommended fix: compare the full `TimeSpan` to the four supported values and enforce a SQL Server duration constraint.
- Tests required: partial-minute rejection and SQL constraint discovery.
- Status: Closed.

## P6-002 — Session contract values were weaker than persistence limits

- Severity: Medium
- Category: Validation Gap
- Evidence: one- or two-character currencies and notes longer than 2,000 characters reached persistence.
- Affected files: `src/Tafseel.Domain/LiveSessions/LiveSessions.cs`
- Real impact: invalid input could fail late as a database error rather than a stable domain validation response.
- Recommended fix: enforce exact three-character currency and the note length in the aggregate.
- Tests required: invalid currency and oversized-note domain tests.
- Status: Closed.

## P6-003 — Completion endpoint used a role check instead of the permission policy

- Severity: High
- Category: Authorization Gap
- Evidence: `LiveSessionsController.Complete` used `Roles.Teacher` while other sensitive operations use centralized permissions.
- Affected files: `src/Tafseel.Api/Controllers/LiveSessionsController.cs`
- Real impact: permission revocation could not independently remove completion authority.
- Recommended fix: require `Sessions.ManageOwn`; retain server-side teacher ownership.
- Tests required: permission policy and ownership regression.
- Status: Closed.

## P6-004 — Financial price formulas needed database enforcement

- Severity: High
- Category: Financial Correctness Issue
- Evidence: the initial model constrained ranges and totals but did not prove the emergency premium was calculated from its snapshotted percentage.
- Affected files: `src/Tafseel.Infrastructure/Persistence/TafseelDbContext.cs`, Phase 6 migration
- Real impact: direct writes or persistence defects could create an inconsistent session price snapshot.
- Recommended fix: add the rounded premium formula to the SQL check constraint.
- Tests required: SQL constraint discovery and booking price assertion.
- Status: Closed.

## P6-005 — System payment actor cannot be a user foreign key

- Severity: High
- Category: Database Integrity Issue
- Evidence: payment confirmation history can be authored by a provider/system identifier, but the first migration linked every history actor to `AspNetUsers`.
- Affected files: `TafseelDbContext.cs`, Phase 6 migration
- Real impact: legitimate webhook confirmation would fail referential integrity.
- Recommended fix: keep the actor identifier auditable without a user FK; regenerate the migration.
- Tests required: confirmed-payment persistence in SQL Server.
- Status: Closed.

## Gate

No unresolved in-scope Critical or High Phase 6 finding remains.
