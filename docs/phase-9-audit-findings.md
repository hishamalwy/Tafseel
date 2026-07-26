# Phase 9 Audit Findings

Date: 2026-07-26

## P9-001 — Popular-subject report was not SQL-translatable

- Severity: High
- Category: Query correctness
- Impact: the Admin report returned HTTP 500.
- Fix: project to a SQL-translatable anonymous aggregate, then map after materialization.
- Status: Closed.

## P9-002 — Public review contract exposed Student identifiers

- Severity: High
- Category: Privacy
- Impact: anonymous teacher-profile visitors could correlate reviews to account IDs.
- Fix: remove Student ID from the public review DTO.
- Status: Closed.

## P9-003 — Concurrent review changes could race rating aggregates

- Severity: High
- Category: Concurrency
- Impact: simultaneous reviews/moderation could persist a stale teacher average.
- Fix: serialize rating updates per teacher inside the existing transactions.
- Status: Closed.

## P9-004 — Catalog administration lacked the general audit trail

- Severity: Medium
- Category: Audit coverage
- Impact: catalog changes were not visible in the unified Admin audit feed.
- Fix: snapshot changed catalog entries before save and append an actor/correlation-aware audit record.
- Status: Closed.

## P9-005 — Session-reminder scan contained an untranslated time expression

- Severity: High
- Category: Regression / background reliability
- Impact: the Phase 8 outbox worker logged scan failures during the full Phase 9 gate.
- Fix: compute the reminder cutoff before constructing the EF query.
- Status: Closed.

## Gate

No unresolved in-scope Critical or High Phase 9 finding remains.
