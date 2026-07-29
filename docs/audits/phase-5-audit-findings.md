# Phase 5 Audit Findings

Date: 2026-07-26

## P5-001 — Student DTO exposed Teacher financial terms

- Severity: High
- Category: Information Disclosure
- Evidence: the first shared Order DTO returned Teacher commission and net to both roles.
- Affected files: `OrderContracts.cs`, `OrderService.cs`
- Real impact: Students could see Teacher-side commercial terms that are unrelated to their payment summary.
- Recommended fix: role-aware projection with nullable Teacher-only values.
- Tests required: Student and Teacher dashboard contract assertions.
- Status: Closed.

## P5-002 — Failed file mutations could leave orphaned private files

- Severity: High
- Category: Data Integrity
- Evidence: storage completed before domain/rowversion save; a later failure had no compensation.
- Affected files: `IFileStorageService`, `LocalFileStorageService`, `OrderService.cs`
- Real impact: failed retries could accumulate files with no authorized database owner.
- Recommended fix: safe private-file deletion compensation around attachment and delivery persistence.
- Tests required: file validation, ownership, concurrency regression.
- Status: Closed.

## P5-003 — Global acceptance-key uniqueness had the wrong scope

- Severity: Medium
- Category: Data Integrity
- Evidence: the initial schema made `AcceptanceIdempotencyKey` globally unique.
- Affected files: `TafseelDbContext.cs`, Phase 5 migration
- Real impact: two unrelated requests using the same client-generated key could conflict.
- Recommended fix: scope idempotency to the request aggregate and use unique Order.RequestId for exactly-once creation.
- Tests required: concurrent same-request acceptance and exactly-one Order.
- Status: Closed.

## P5-004 — Financial formulas were protected only by domain code

- Severity: High
- Category: Financial Integrity
- Evidence: initial checks validated ranges but not equality of snapshotted fees/totals to their formulas.
- Affected files: `Orders.cs`, `TafseelDbContext.cs`
- Real impact: direct SQL or a persistence defect could create an internally inconsistent order snapshot.
- Recommended fix: normalize money to two decimals, permit at most four fee-percentage decimals, and add a formula check constraint.
- Tests required: rounding, fee configuration boundaries, and SQL constraint presence.
- Status: Closed.

## P5-005 — Handled domain errors were logged as HTTP 500

- Severity: Medium
- Category: Observability
- Evidence: request logging ran inside exception handling and observed the exception before RFC 7807 mapping.
- Affected files: `Program.cs`
- Real impact: false server-error telemetry and alert noise.
- Recommended fix: place request logging outside centralized exception handling.
- Tests required: stable ProblemDetails and regression suite.
- Status: Closed.

## P5-006 — Isolated configuration tests omitted mandatory Fees

- Severity: Medium
- Category: Test Defect
- Evidence: the full suite failed because configuration-validation fixtures did not provide the newly required section.
- Affected files: `ConfigurationValidationTests.cs`
- Real impact: unrelated JWT/email boundary tests failed before reaching their target validation.
- Recommended fix: include valid fee defaults and add explicit invalid fee boundary cases.
- Tests required: full configuration suite.
- Status: Closed.

## Gate

No unresolved in-scope Critical or High Phase 5 finding remains.
