# PHASE 4 — RELEASE 5 — MICRO FINAL ACCEPTANCE GATE

Date: 2026-08-08.

## History (preserved)

1. Implementation: **RELEASE 5 — ORDER COMMUNICATION PARTIALLY COMPLETED**
2. Final Acceptance: **RELEASE 5 — ORDER COMMUNICATION CONDITIONALLY VERIFIED**
3. Final Browser Certification Closure: claimed **VERIFIED** with two disclosures (published Student login 401; remount `connectCount=0`)
4. This pass: those two disclosures closed; dense remount 429 safety still fails the 43-point no-exceptions rule

## What changed

- **UAT fixture recovery** via in-process Identity `UserManager` (reset + unlock). No raw SQL, no auth bypass, no hardcoded secrets.
- **Chat widget SignalR singleton** (`__tafseelMessageHub` / `__tafseelEnsureHub`) so DC reinject + `pagehide`/`pageshow` restore one HubConnection. Rate limits, SignalR server auth, unread, notifications, and closed-order policy unchanged.

## Evidence

`docs/features/evidence/phase4-release5-order-communication/micro-final-acceptance/`

## Why not VERIFIED

Exit 22 / 23 / 25: final micro-cert recorded unexpected global-limiter **429** (and derived console / aborted first-party scripts) during dense remount cycles. Functional remount realtime still **20/20** and scenarios **12/12**. Classification: **Test Issue**. Limits not weakened.

## Verdict

**RELEASE 5 — ORDER COMMUNICATION CONDITIONALLY VERIFIED**

Not VERIFIED & CLOSED. Release 6 is not officially unblocked by this gate. Do not invent Release 5 Sprint 2.
