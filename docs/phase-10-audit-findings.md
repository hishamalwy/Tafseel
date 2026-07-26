# Phase 10 Audit Findings

Date: 2026-07-26

## P10-001 — Missing Admin withdrawal queue

- Severity: High
- Impact: the existing process endpoint could not be reached safely because the UI had no authorized way to discover pending IDs and rowversions.
- Fix: add a paginated, permission-protected pending-withdrawal query and wire approve/reject with concurrency and idempotency headers.
- Status: Closed.

## P10-002 — Design-only actions reported success without persistence

- Severity: High
- Impact: request submission, teacher decisions, account suspension, delivery, and notification reads could mislead users.
- Fix: route implemented actions through the central API client and show backend errors.
- Status: Closed for implemented backend workflows.

## P10-003 — Browser token storage risk

- Severity: High
- Impact: persistent browser storage would widen token theft after script injection.
- Fix: access token remains in memory; refresh token remains in the API's HttpOnly `__Host-` cookie.
- Status: Closed.

## P10-004 — Serving the repository as a static directory would expose configuration

- Severity: Critical
- Impact: a broad static-file provider could expose JSON configuration or source files.
- Fix: serve only an explicit page/asset allowlist.
- Status: Closed.

## P10-005 — Chat transport is bounded polling

- Severity: Low
- Impact: incoming browser messages may appear up to five seconds late.
- Fix: documented bounded polling while the authenticated SignalR hub remains available.
- Status: Accepted; upgrade when measured product latency requires it.

## Gate

No unresolved in-scope Critical or High Phase 10 finding remains.
