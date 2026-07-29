# Phase 7 Audit Findings

Date: 2026-07-26

## P7-001 — Failed provider event made payment unrecoverable

- Severity: High
- Category: State Machine Issue
- Evidence: the first callback implementation moved the unique Order Payment to `Failed`, preventing a later successful provider event.
- Affected files: `src/Tafseel.Infrastructure/Finance/FinancialService.cs`
- Real impact: a recoverable payment attempt could permanently block the Order.
- Recommended fix: record the failed attempt while leaving the Payment pending.
- Tests required: failed event followed by successful verified event.
- Status: Closed.

## P7-002 — A second full refund key could duplicate money movement

- Severity: Critical
- Category: Financial Correctness Issue
- Evidence: idempotency was initially scoped to `(PaymentId, key)` while only full refunds are supported.
- Affected files: `FinancialService.cs`, `TafseelDbContext.cs`, Phase 7 migration
- Real impact: a caller using another key could create a second refund and ledger transfer.
- Recommended fix: reject any second key and add a unique `Refund.PaymentId` index.
- Tests required: same-key replay and different-key rejection.
- Status: Closed.

## P7-003 — Webhook request body was unbounded

- Severity: High
- Category: Security Vulnerability
- Evidence: the anonymous callback buffered the complete request body.
- Affected files: `src/Tafseel.Api/Controllers/PaymentsController.cs`
- Real impact: oversized requests could consume excessive memory.
- Recommended fix: apply a 64 KiB request-size limit and rate limiting.
- Tests required: endpoint regression and server request-size behavior.
- Status: Closed.

## P7-004 — Reconciliation result could be mistaken for arbitrary balancing logic

- Severity: Medium
- Category: Accounting Reconciliation Issue
- Evidence: ledger entries represent one debit and one credit in a single immutable row, so `UnbalancedEntries` is structurally zero.
- Affected files: `Finance.cs`, `FinancialService.cs`
- Real impact: documentation could imply a looser journal model than implemented.
- Recommended fix: document that a transfer row is the atomic balanced journal unit and retain SQL account/amount checks.
- Tests required: cross-account positive-entry Domain tests and SQL constraints.
- Status: Closed.

## P7-005 — Concurrent scheduling surfaced wrapped SQL deadlocks as HTTP 500

- Severity: High
- Category: Concurrency Risk
- Evidence: full regression exposed EF's transient `InvalidOperationException` wrapper around SQL deadlock 1205.
- Affected files: `src/Tafseel.Infrastructure/LiveSessions/LiveSessionService.cs`
- Real impact: simultaneous bookings intermittently returned 500 instead of a deterministic conflict.
- Recommended fix: serialize each Teacher schedule with a transaction-owned SQL application lock and map wrapped SQL failures to conflict.
- Tests required: repeated SQL Server concurrent booking.
- Status: Closed.

## Gate

No unresolved in-scope Critical or High Phase 7 finding remains.
