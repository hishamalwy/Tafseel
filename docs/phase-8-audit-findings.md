# Phase 8 Audit Findings

Date: 2026-07-26

## P8-001 — Real-time failure could turn a persisted send into HTTP 500

- Severity: High
- Category: Observability Gap
- Evidence: SignalR broadcast occurred after persistence but its exception initially escaped.
- Affected files: `MessagingService.cs`
- Real impact: a client retry could create a duplicate persisted message.
- Recommended fix: isolate and log real-time delivery failure after the system-of-record commit.
- Tests required: persisted-message and reconnect retrieval tests.
- Status: Closed.

## P8-002 — Notification preference did not snapshot in-app visibility

- Severity: Medium
- Category: Validation Gap
- Evidence: email-required events needed a Notification row for the outbox even when in-app notifications were disabled.
- Affected files: `Messaging.cs`, `MessagingService.cs`, Phase 8 migration
- Real impact: disabled in-app notices could still appear.
- Recommended fix: snapshot `InAppVisible` and filter notification queries.
- Tests required: preference update and notification retrieval.
- Status: Closed.

## P8-003 — Concurrent conversation creation could duplicate inquiry threads

- Severity: High
- Category: Concurrency Risk
- Evidence: general conversations have no resource ID and cannot use the resource unique index.
- Affected files: `MessagingService.cs`
- Real impact: simultaneous create requests could produce duplicate threads.
- Recommended fix: serializable transaction plus SQL application lock over the stable participant/resource key.
- Tests required: duplicate create and SQL unique-index tests.
- Status: Closed.

## P8-004 — Application notification changed the existing concurrency error

- Severity: High
- Category: Concurrency Risk
- Evidence: concurrent reviewer decisions first competed on a shared notification deduplication key.
- Affected files: `TeacherApplicationService.cs`
- Real impact: callers received `database_conflict` instead of the established rowversion conflict.
- Recommended fix: derive the key from the unique Review record so the losing transaction rolls it back.
- Tests required: existing concurrent-decision regression test.
- Status: Closed.

## P8-005 — Outbox test did not execute the failure path

- Severity: Medium
- Category: Test Gap
- Evidence: the first test asserted only that an outbox row existed.
- Affected files: `Phase8MessagingTests.cs`, `TafseelApiFactory.cs`
- Real impact: retry isolation could regress unnoticed.
- Recommended fix: controlled email failure, explicit dispatcher invocation, and pending/attempt assertion.
- Tests required: outbox failure isolation.
- Status: Closed.

## Gate

No unresolved in-scope Critical or High Phase 8 finding remains.
