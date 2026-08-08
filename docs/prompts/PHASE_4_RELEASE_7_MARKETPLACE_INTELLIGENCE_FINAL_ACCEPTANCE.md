============================================================
PHASE 4 — MARKETPLACE SCALE
RELEASE 7 — MARKETPLACE INTELLIGENCE

FINAL ACCEPTANCE CLOSURE
============================================================

## Previous Context

Canonical chain (reconcile living docs; do not erase history):

- R5 VERIFIED & CLOSED (rate-limit-aware cert, 0 unexpected 429).
- R6 VERIFIED & CLOSED (Final Acceptance 16/16, 0 unexpected 429, Integration 226/226).
  Evidence: docs/features/evidence/phase4-release6-discovery-conversion/final-acceptance/
  and docs/fixes/PHASE_4_RELEASE_6_FINAL_ACCEPTANCE_CLOSURE.md.
- R7 is CONDITIONALLY VERIFIED until this gate. Old “R6 remains open” is STALE — fix living docs only.
- Historical R7 CONDITIONALLY VERIFIED must be preserved in the feature report.

============================================================
CONCURRENT R9 WARNING — CRITICAL
============================================================

Another agent is implementing Release 9 AI-Assisted Marketplace in the SAME worktree.

Before ANY shared-file edit: inspect git status + git diff.

Collision areas: Browse, Teacher Profile, Guided Request, locales, shared JS, analytics helper,
Program.cs, DI, rate limiting, browser session helpers, frontend gates, PROJECT_STATUS, INDEX,
migrations/snapshot.

DO NOT revert/overwrite R9 AI provider/instrumentation/config. Do not declare R9 status.
If R9 added analytics hooks, inspect; do NOT absorb into R7 metrics unless they fit existing
R7 governance and are explicitly safe. Only ensure R9 does not corrupt R7 metric truth.

============================================================
NON-NEGOTIABLE
============================================================

- No Marketplace Intelligence V2, no second event table, no AI/ranking/Best Match, no public internal metrics
- No Browse/Profile/Student Dashboard redesign, no R8 impl, no Order Communication changes
- Do not weaken rate limits (auth 10/min/IP, global 300/min)
- No raw SQL for UAT business records; no commit/push/deploy
- Accepted browser run: 0 unexpected 429. Preserve failed JSON under distinct filenames. No retry-until-green.
- Do not invent retention duration. Classify A (existing policy applies) or B (Privacy/Governance Decision Required before Production). Feature not BLOCKED solely for missing legal duration unless project policy requires it.
- Do not fabricate external screen-reader PASS.
- Classify findings before fixing (Production Bug / UI/View / API Mismatch / Business Ambiguity / Test Issue / UAT Fixture / Privacy/Governance Decision / etc.). Fixture absence ≠ Production Bug.

============================================================
UAT / HARNESS
============================================================

- Reuse R5/R6 login-once storageState, request-budget scheduler
  (tests/browser/lib/request-budget.mjs, session.mjs, auth.mjs).
- Student student.sprint02.uat@example.com, Teacher teacher.sprint02.uat@example.com,
  Admin qa.admin.sprint02@example.com typically. Passwords from TAFSEEL_UAT_* / SeedUsers
  user-secrets — NEVER print.
- Do not reset UAT users unless login impossible.
- Dev API :5090; frontend from bin/Release/net8.0/frontend — rebuild+restart after JS/HTML changes.
- Isolated publish separate port then STOP. Check 5090/5092 locks.

============================================================
PLAN
============================================================

1. Save prompt to docs/prompts/PHASE_4_RELEASE_7_MARKETPLACE_INTELLIGENCE_FINAL_ACCEPTANCE.md
2. Reconcile PROJECT_STATUS/INDEX + R5/R6/R7 reports. Write worktree-reconciliation.md listing R7 vs R9 vs R6 files.
3. Re-audit MarketplaceIntelligenceService, contracts, controllers, event entity, ingestion, Admin UI, frontend analytics helper. Confirm no ranking/PII/raw search/client-trusted transactional facts.
4. Reuse R6 UAT fixtures. Isolate events via time range / session / ClientEventId — do not delete historical events.
5. Browser E2E: browse_viewed, teacher_opened (not silent direct-profile conversion unless documented), service_selected once, request_started (draft restore not double-counted).
6. ONE full async lifecycle via supported APIs/browser + mock payment simulator only: Browse→Profile→service→request→submit→accept→order→pay start/confirm→start work if required→delivery→complete→review. Stage-by-stage Admin funnel (future stages not early). Prove transactional stages from canonical records not client events.
7. Drop-off journey: stop before submit. Zero-result Browse→persist→Admin, privacy (no raw query/PII), dedup, recovery not re-recording zero.
8. ClientEventId idempotency; spoof payment_confirmed/order_completed/review_submitted rejected; invalid IDs rejected.
9. Exact transaction reconciliation JSON. Historical: pre-R7 transactional OK, pre-R7 discovery N/A. Coverage-start UI.
10. Retention governance + event growth bounds. Admin Overview/Funnel/Demand-Supply/Subjects/Services/Matrix/Zero Results/date filters. Authz Admin 200 Student/Teacher/Quality 403. DTO privacy. Telemetry failure must not break Browse/Profile.
11. R9 telemetry audit (no prompts/PII in R7 store). No ranking. F-002 intact. Migration audit + EF no pending. Query performance.
12. Rate-limit-aware 21/21 browser suite. Responsive 390/768/1024/1440 R7 surfaces AR+EN. Keyboard a11y.
13. R6 integrity + Browse/Profile/Compare/Request/Live smoke. R5 integrity + messages smoke. R4 Admin/Quality + Foundation gates.
14. Sequential full backend after browser (baseline 1/89/5/226, may rise from R9). 0 fail 0 skip 0 exclusions. If R9 tests fail, classify ownership — do not delete them. Frontend gates including R9 if present. Release build. Isolated publish smoke then stop.
15. Docs: fixes report + evidence pack + update feature report (preserve Conditional), retrospective, INDEX, PROJECT_STATUS. Honest product scores. R8 handoff only — do not implement R8.

============================================================
EXIT
============================================================

Return EXACTLY the original Release 7 final response format.

VERIFIED only if all 86 conditions hold (original 81 exit conditions plus this gate’s
fixture/lifecycle/authz/privacy/R9-audit/responsive/integrity closures).

If and ONLY if VERIFIED write the three exact closing lines.

Otherwise CONDITIONALLY VERIFIED / PARTIALLY COMPLETED / BLOCKED.

No R7 Sprint 2.
