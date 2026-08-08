# Responsive / Localization Matrix — Browser Certification

Real, rendered, Playwright-driven matrix against a live controlled Development instance
(canonical DB `(localdb)\TafseelLocal;Database=Tafseel`). Not a structural/HTTP-only
sweep — every cell performs a real navigation, real theme/locale application via the
same `localStorage` mechanism the app's own `boot-prefs.js` reads, and real DOM/network
assertions (see `docs/testing/BROWSER_CERTIFICATION.md` for the full per-cell check
list).

**16 surfaces x 6 viewports x 4 modes = 384 cells. Final result: 384/384 PASSED, 0
FAILED, 0 SKIPPED.** Machine-readable: `matrix.json`, `summary.json`.

## How 384/384 was reached (full transparency)

The first full run surfaced 17 failing cells, none of which were real product defects —
all were either harness bugs or harness false positives, found, fixed, and then
genuinely re-verified (not silently marked passing):

1. **Harness bug — rate-limit collision (9 cells: `payment`, `teacher-qualifications`).**
   The app's real Development `"payment"` rate-limit policy is 10 req/min; the harness's
   pacing didn't fully account for it on pages that fire multiple API calls per load.
   Fixed by pacing more conservatively and confirmed via a fixed-per-cell 15s
   re-verification pass — all 9 passed cleanly once given proper spacing. This is a
   harness pacing defect, not an application defect: the rate limiter did exactly what
   it's designed to do.
2. **Harness assertion bug — `overflowX` false positive (8 cells: `landing` x6,
   `teacher-profile` x2, all Arabic/RTL narrow viewports).** The initial check used raw
   `scrollWidth > innerWidth`, which doesn't account for this codebase's deliberate,
   site-wide `overflow-x:hidden` on `html`/`body` (used so decorative bleed elements —
   glows, blobs — can extend past the content box with zero visible/user-facing effect).
   Confirmed via direct inspection (`body.scrollWidth=399` vs `innerWidth=375`, but
   `overflow-x:hidden` on both `html` and `body` means the extra 24px is never visible,
   no scrollbar, no shift). Fixed the assertion to only flag *unclipped* overflow, then
   re-verified — all 8 passed.

Both fixes are in `tests/browser/run-matrix.mjs`, documented inline with the
justification above. Neither the app's frontend nor backend was changed to make these
cells pass — only the harness's own measurement was corrected.

## What "384/384" does and does not cover

Every cell checks: page load, `html`/`body` real (unclipped) horizontal overflow,
`lang`/`dir`/`data-theme` correctness, DOM template-leak absence, network template-leak
absence, new first-party console/page errors, new first-party failed requests (excluding
one documented benign anonymous-session probe), a reachable primary action, and — for
the two modal surfaces — correct `role="dialog"` presence and full within-viewport
containment. It does not perform a full interactive click-through of every control on
every cell (384 x full interaction would multiply runtime well beyond this pass's
budget) — deeper interaction (keyboard journeys, modal Escape/focus, exact CTA geometry)
is covered separately and is documented in `accessibility.md`, `manual-visual.md`, and
`f013-retention.md`.
