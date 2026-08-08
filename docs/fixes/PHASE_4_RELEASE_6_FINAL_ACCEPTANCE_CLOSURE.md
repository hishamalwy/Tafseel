# PHASE 4 — RELEASE 6 — DISCOVERY & CONVERSION — FINAL ACCEPTANCE CLOSURE

Date: 2026-08-08.

## History (preserved)

1. Implementation / first closure pass: **RELEASE 6 — DISCOVERY & CONVERSION CONDITIONALLY VERIFIED**  
   Authenticated Favorites, guest→Auth continuation, and populated live conversion were not browser-proven. Some docs still reported a Release 5 status conflict.
2. This pass: remaining acceptance gaps closed without redesigning Browse/Profile, without a Discovery domain, and without reopening Release 5 messaging.

## Canonical reconciliation

Release 5 latest canonical status is **VERIFIED & CLOSED** after [Rate-Limit-Aware Final Certification](./PHASE_4_RELEASE_5_RATE_LIMIT_AWARE_FINAL_CERTIFICATION.md) (0 unexpected 429, remount 20/20, Integration 224/224, limits unchanged). Historical R5 Partial → Conditional → claimed VERIFIED-with-disclosures → Micro Conditional is preserved.

Stale “R5 conflict / R6 not chain-unblocked because of R5” statements in living R6 docs are corrected here. Historical Conditional wording is kept in the Release 6 report.

## What changed this pass

- Same-origin Auth return sanitizer (`safeAppReturnHref` / `authHref`); guest protected action continues to Guided Request with Teacher + TeacherService.
- Profile exact-service availability fetch (no cross-service book fallback); favorite in-flight guard.
- Browse URL state for filters + compare IDs; `_teacherRequest` ignores stale browse responses after popstate.
- 375 Profile CTA: restore Sprint 2.1 clearance pull-up (`calc(18px - var(--tf-profile-mobile-clearance))`), compact identity action row, `documentElement.scrollTop`, delayed remasure. Not a Profile redesign.
- Rate-limit-aware cert runner reused R5 login-once `storageState` + request-budget scheduler. Limits unchanged (auth 10/min/IP, global 300/min).
- Concurrent Release 7 analytics instrumentation on Browse/Profile/`Tafseel.analytics` was inspected and preserved.

Failed cert JSON kept under distinct names (`attempt1`–`attempt5`). Accepted run: attempt 6, **16/16**, **0 unexpected 429**.

## Evidence

`docs/features/evidence/phase4-release6-discovery-conversion/final-acceptance/`

## Verdict

**RELEASE 6 — DISCOVERY & CONVERSION VERIFIED**

Release 6 is VERIFIED & CLOSED. Do not invent Release 6 Sprint 2. Release 7 — Marketplace Intelligence is unblocked from the Release 6 chain (R7 may remain conditionally verified for its own remaining gates).
