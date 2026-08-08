# PHASE 4 — MARKETPLACE SCALE — FOUNDATION FINAL CERTIFICATION RUN — FULL MATRIX + ACCESSIBILITY + VISUAL CLOSURE

(Verbatim intent, reconstructed from the user's final large prompt in this session —
see the session transcript for the exact original wording. This is a certification run,
not a feature/redesign/architecture sprint.)

Scope: run and document, with real evidence, all of:

1. Establish a clean certification environment (DB, health, cache headers, UAT
   accounts, business-state sanity).
2. Full 384-cell (6 viewports x 4 modes x 16 surfaces) responsive/localization matrix
   with machine-readable JSON evidence asserting `totalCells === 384` and
   `passedCells === 384`.
3. Full manual visual certification of a specific required subset of surfaces.
4. Exact Teacher Profile mobile CTA geometry re-check at 375x667 and 390x844 using
   `getBoundingClientRect()`/`elementFromPoint()`.
5. Cross-modal live certification (Review Delivery, Rate Teacher, Accept Request,
   Delivery Upload, Marketplace Service config, Quality Application Review,
   Media/Showcase Review, Admin Service Catalog Editor, Review Moderation).
6. F-013 retention check: >=10 open/close/reload cycles, 0/10 literal-template
   requests required, plus a negative-control test (deliberately reintroduce a raw
   `<img src="{{ fakeBinding }}">` into a scratch copy only, confirm the gate FAILS,
   remove the scratch file, confirm the real repo PASSES).
7. Fresh keyboard-only accessibility pass (Browse->Profile->Request and
   Dashboard->Review->Rate), with `role="dialog"`/`aria-modal`/focus/Escape checks.
8. 200% zoom pass on 9 named surfaces.
9. Reduced-motion simulation.
10. Dark-mode contrast spot check.
11. Cache-policy retention re-check.
12. Resource-safety gate re-validation.
13. Full backend/frontend regression.
14. Clean Release build + publish (to an isolated, non-deployed output) + smoke test.

Explicit non-negotiable constraints:
- Do NOT start Analytics/Search/Discovery/Recommendations/Messaging.
- Do NOT redesign Browse Teachers or Teacher Profile.
- Do NOT refactor `support.js`.
- Do NOT change any business rule (qualification, Service Catalog governance,
  payment, Order lifecycle, rating/review).
- Do NOT fabricate data.
- Do NOT commit/push/deploy.
- Do NOT create a "Sprint 0.5" — this pass is documented as
  `docs/fixes/PHASE_4_FOUNDATION_FINAL_CERTIFICATION.md` (no sprint number).

A 21-point Final Exit Rule governs the verdict — "NO EXCEPTIONS": full VERIFIED only if
all 21 conditions are literally true (including exactly 384/384 matrix cells), otherwise
CONDITIONALLY VERIFIED. The user explicitly stated: "Do not invent a new closure sprint
automatically."
