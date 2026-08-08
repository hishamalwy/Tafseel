# PHASE 4 — RELEASE 5 — RATE-LIMIT-AWARE FINAL CERTIFICATION

Date: 2026-08-08.

## History (preserved)

1. Implementation: **RELEASE 5 — ORDER COMMUNICATION PARTIALLY COMPLETED**
2. Final Acceptance: **RELEASE 5 — ORDER COMMUNICATION CONDITIONALLY VERIFIED**
3. Final Browser Certification Closure: claimed **VERIFIED** with disclosures (published Student 401; remount `connectCount=0`)
4. Micro Final Acceptance: those disclosures closed; dense remount global 300/min 429 kept **CONDITIONALLY VERIFIED**
5. This pass: final canonical state

## What changed

- **Harness only** for the 429 blocker: request-budget tracer + rolling-window scheduler (`tests/browser/lib/request-budget.mjs`, `release5-rate-limit-measure.mjs`, `release5-rate-limit-final-cert.mjs`). Login-once `storageState` retained. Fail-on-429 retained (no retry-to-PASS).
- Two locale keys (`browse_sort`, `filters_h`) added so concurrent Browse Teachers references pass the Foundation usage gate. Not a messaging or rate-limit change.
- Rate limits, SignalR server auth, unread, notifications, closed-order policy, and `__tafseelMessageHub` / `__tafseelEnsureHub` unchanged.

## Evidence

`docs/features/evidence/phase4-release5-order-communication/rate-limit-final-cert/`

Micro remount 17+2 429 JSON remains under `micro-final-acceptance/`.

## Verdict

**RELEASE 5 — ORDER COMMUNICATION VERIFIED**

Release 5 is VERIFIED & CLOSED. Release 6 — Discovery & Conversion is unblocked. Do not invent Release 5 Sprint 2.
