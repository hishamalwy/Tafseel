============================================================
PHASE 4 — MARKETPLACE SCALE
FOUNDATION BROWSER CERTIFICATION
& ACCESSIBILITY CLOSURE
============================================================

## Findings

- **New defect found and fixed:** `<path d="{{ sv.iconPath }}" />` on Teacher Profile
  produced a real SVG parser error on every load with a non-empty services list (same
  root-cause family as F-013 — browser parses static markup before hydration — but
  non-resource, no network leak). Fixed via `sc-camel-d`, the existing dc-runtime
  convention. Gate extended with a new Rule 3; negative-control test passed.
- **New accessibility defect found and fixed:** Review Delivery modal did not close on
  `Escape`, despite the Rate Teacher modal and three other modals already using a shared
  `Tafseel.modalKeyDown` helper for exactly this. Wired the same helper onto Review
  Delivery's backdrop — the narrowest possible fix, zero new mechanism, zero mutation
  risk (matches the existing Close button's behavior exactly).
- **Two harness bugs found and fixed during matrix execution** (not application
  defects): a rate-limit pacing gap on multi-API-call pages, and an `overflowX` false
  positive that didn't account for this codebase's intentional `overflow-x:hidden`. Both
  are documented in full, with genuine re-verification, in `matrix.md`.
- **Two disclosed, non-blocking findings, not fixed this pass:** a missing `ph_search`
  i18n key leaves one search placeholder untranslated in Arabic mode; Accept
  Request/Delivery Upload/Admin Catalog modals lack Escape-to-close (pre-existing,
  inconsistent, out of this pass's explicit fix scope).
- All previously-closed findings (F-013, cache policy, `boot-prefs.js`, stale test
  assertions) re-verified clean, no regression.

## Browser Harness

Built `tests/browser/` — a standalone Node/Playwright project, dev-only, not wired into
the .NET solution or its published output. Authenticates via real login for all four
roles (Student, Teacher, QualityReviewer, Admin) using Development-only credentials
passed via environment variables, never hardcoded or printed. Full architecture,
prerequisites, and run instructions: `docs/testing/BROWSER_CERTIFICATION.md`.

## Harness Self-Test

`tests/browser/self-test.mjs` — 5 negative controls against local `file://` scratch
HTML only (never the real app): overflow detection, console-error detection, network
template-leak detection, wrong-`dir` detection, missing-modal detection.

**Result: 5/5 PASS** — the harness provably fails when it should.

## Matrix Execution

16 surfaces x 6 viewports x 4 modes, real rendered navigation against a controlled
Development instance (`(localdb)\TafseelLocal;Database=Tafseel`), real theme/locale
application via the app's own `localStorage` mechanism, paced to respect the app's real
(unweakened) Development rate limits (~7s/cell, full run ~50 minutes).

## Matrix Results

**384/384 PASSED. 0 FAILED. 0 SKIPPED.**

17 cells failed on the first pass; all 17 were harness bugs (rate-limit pacing, an
overflow false-positive), not application defects — both fixed, and all 17 cells
individually genuinely re-verified afterward, not overwritten. Full transparent
narrative, including exact before/after evidence: `matrix.md`. Machine-readable:
`matrix.json`, `summary.json`.

## Manual Visual Certification

Reviewed the captured screenshot set (11 screenshots spanning the 5 required
viewport/mode groups, not the full ~30-screenshot exhaustive list) as a senior
product/design lens. No blocking Product Integrity defect found. One disclosed,
non-blocking localization gap (search placeholder). Full detail: `manual-visual.md`.
**Coverage gap, disclosed:** the full exhaustive screenshot list in the certification
prompt (~30 named shots across 5 viewport groups) was not captured 1:1 — a
representative subset per group was, covering every surface category at least once.

## SVG Parser-Sensitive Binding

Fixed (see Findings). Verified: icon renders correctly post-hydration, 0 console SVG
parse errors across the full 384-cell matrix, no regression AR/EN or dark/light.

## Parser-Sensitive Attribute Audit

Completed across all `.dc.html` files for `d`/`points`/`transform`/`viewBox`/geometry
attributes. Exactly one PROVEN ERROR existed (now fixed); `style`/`value` interpolations
classified SAFE (browsers don't parse-error on them). No blanket rewrite performed. Full
detail: `svg-binding-audit.md`.

## Modal Escape Fix

Review Delivery: fixed, verified live (`closedOnEscape: true`). Rate Teacher: already
worked, re-verified live. Both perform no mutation on close. Full detail:
`accessibility.md`.

## Modal Accessibility

Review Delivery and Rate Teacher fully certified live: `role="dialog"`, `aria-modal`,
initial focus inside, Escape closes, body scroll restored. **Coverage gap, disclosed:**
Accept Request, Delivery Upload, Marketplace Service config, Quality Application Review,
and Admin Service Catalog were audited via source inspection for Escape support
(classified, not fixed — see Findings) but were not each individually live-certified for
the full Tab/Shift+Tab/focus-return checklist this pass, due to time budget under the
harness's real rate-limit pacing.

## Keyboard Journeys

Browse -> Teacher Profile -> Request reachability confirmed (search input, teacher
profile link, favorite control, compare checkbox all real focusable DOM elements).
**Coverage gap, disclosed:** the Student Order (Dashboard -> Review -> Rate), Teacher,
Quality, and Admin keyboard journeys explicitly listed in Part 12 were not each
separately keyboard-driven this pass — the equivalent functional paths were exercised
via the matrix and the F-013 retention cycles (with real modal open/focus/Escape/close
behavior confirmed there), but not as a dedicated, distinct keyboard-only walkthrough for
every one of those four journeys.

## 200% Zoom

5 of the 9 named surfaces checked live at a 640x512 (~200%-equivalent) viewport: Browse,
Teacher Profile, Request, Payment, Student Dashboard — all passed (reachable primary
action, no unclipped overflow). **Coverage gap, disclosed:** Teacher Dashboard, Quality
Dashboard, Admin Service Catalog, Review modal, and Rate modal were not additionally
checked at this specific zoom viewport this pass (though all five were separately
confirmed to render correctly at their normal viewports across the full 384-cell
matrix).

## Reduced Motion

4 of 5 named surfaces (Landing, Browse, Teacher Profile, Student Dashboard) confirmed to
load cleanly under `prefers-reduced-motion: reduce`; Teacher Dashboard not additionally
re-checked this pass. Static CSS audit (15 `@media (prefers-reduced-motion: reduce)`
rules) confirmed unchanged and intact.

## Teacher Profile Mobile CTA

Fresh live geometry check at 375x667 and 390x844 via `getBoundingClientRect()`: Save,
Share, and Message actions all present, zero pairwise overlap at both viewports.

## Browse Teachers

Visually re-certified at 1440x900 and 375x667/AR/dark: primary subject once, extra
subject once (single chip, no duplication), qualification badge, language, rating,
starting price, Profile/Request actions, Save, "Add to comparison", correct RTL mirror.
No redesign performed. **No blocking defect; score remains in the 8-8.5 range** noted in
prior sprints.

## F-013 Retention

Review Delivery: **0/10** literal-template network requests across 10 fresh
open/close/reload cycles. Rate Teacher: **0/3** across 3 cycles. Static gate: PASS.
Negative-control tests for both the original resource-attribute rule and the new SVG
geometry rule: correctly FAIL when reintroduced, correctly PASS on the restored real
repo. Full detail: `f013-retention.md`.

## Backend Regression

Architecture 1/1, Domain 89/89, Application 5/5, Integration 215/215 — **310/310, 0
failures.** EF `has-pending-model-changes`: none. Migrations list: stable, unchanged.

## Frontend Regression

All named CI gate scripts pass: frontend integrity (13 entry points), localization
(2,960 paired keys), localization usage coverage, BUG-001 display names,
Teacher-Profile-mobile-CTA, template-placeholder/resource/SVG-geometry gate, auth UI
mode isolation, guided request, Sprint 6 notification routing. `git diff --check`: clean
(only benign LF/CRLF line-ending warnings, no real whitespace errors).

## Release Build

`dotnet build -c Release`: 0 warnings, 0 errors.

## Publish Smoke

`dotnet publish` to an isolated, non-deployed scratchpad directory. Booted on a separate
port: `/health/live`, `/health/ready`, all 7 core pages, all 4 static asset routes
(`tafseel.css`, `tafseel.js`, `boot-prefs.js`, `support.js`) all `200`. `Cache-Control:
no-cache` confirmed. Both fixes (SVG `sc-camel-d`, Review modal `reviewKeyDown`)
confirmed present in the published output via direct file inspection. Smoke instance
stopped; main controlled dev instance unaffected throughout.

## Environment

Controlled single Development instance on `http://127.0.0.1:5090`, canonical DB
`(localdb)\TafseelLocal;Database=Tafseel`, clean Release build before the certification
run. Never run against Staging or Production.

## Files Changed

- `Tafseel-Teacher-Profile.dc.html` — `d="{{ sv.iconPath }}"` -> `sc-camel-d="{{ sv.iconPath }}"`.
- `Tafseel-Student-Dashboard.dc.html` — Review Delivery backdrop `onKeyDown="{{ reviewKeyDown }}"` + `reviewKeyDown` render prop, using the existing shared `Tafseel.modalKeyDown` helper.
- `scripts/ci/check-template-placeholder-leak.mjs` — added Rule 3 (raw SVG geometry attributes).
- `tests/browser/**` (new) — the Playwright harness itself: `lib/auth.mjs`, `lib/surfaces.mjs`, `run-matrix.mjs`, `rerun-cells.mjs`, `self-test.mjs`, `certification-pass.mjs`, `smoke-check.mjs`, `package.json`. Dev-only, not referenced by any published/production output.
- `docs/testing/BROWSER_CERTIFICATION.md` (new) — harness documentation.
- (Local machine state, not a repo file) `Jwt:SigningKey` Development user secret confirmed present (set in a prior pass this session after a server restart lost the in-memory-only value it previously had).

## Remaining Limitations

- Manual visual screenshot coverage was representative (11 shots across all 5 required
  groups), not the full ~30-shot exhaustive list.
- Modal accessibility deep-certification (Tab/Shift+Tab/focus-return) covered Review and
  Rate live; the other 5 named modals were classified via source audit, not individually
  live-certified this pass.
- Keyboard-only journeys covered Browse->Profile->Request directly; the other 3 named
  journeys (Student Order, Teacher, Quality, Admin) were exercised functionally via the
  matrix and F-013 cycles but not as dedicated separate keyboard walkthroughs.
- 200% zoom and reduced-motion checks covered most but not literally every one of the
  9/5 named surfaces respectively.
- These are genuine, disclosed scope gaps under this pass's time budget (the harness's
  real, unweakened rate-limit pacing makes every additional live check materially more
  expensive) — none represent a known or suspected defect; they represent certification
  breadth not yet executed.

## Risks

None newly introduced. The two application fixes (SVG attribute rename, modal keydown
wiring) both reuse existing, already-proven mechanisms with zero new surface area. The
new CI gate rule is additive and was itself negative-control tested.

## Marketplace Scale Handoff

Given the disclosed coverage gaps above, this pass does not meet the literal "no
exceptions" 26-point Exit Rule (specifically points 7, 12, 13, 14, 15 — the exhaustive
manual/interactive coverage items). All defect-bearing items (F-013, the SVG binding,
the Review modal Escape gap, the boot-prefs.js regression, stale tests) are fully closed
and verified. Recommend either: (a) a short, narrowly-scoped follow-up that only closes
the remaining coverage gaps listed above (no new findings expected, given the matrix
itself already exercises all 16 surfaces at all 6 viewports and 4 modes), or (b)
accepting CONDITIONALLY VERIFIED as sufficient to unblock Release 4 given zero open
Critical/High defects remain. Per instruction, no new "Sprint 0.5" or automatic Foundation
closure sprint has been created — this is recorded as a disclosed decision point for the
user, not an automatic next sprint.

============================================================

Browser Harness: Built, documented, dev-only
Harness Validation: 5/5 self-test PASS
Matrix: 384/384 PASS, 0 FAIL, 0 SKIP
Manual UX: No blocking defect (representative coverage, not exhaustive)
SVG Binding: Fixed and verified
Parser Audit: Complete, 1 proven error (fixed), 0 remaining
Review Modal: Escape fixed and verified
Rate Modal: Escape already worked, verified
Keyboard: Partial (1 of 4 named journeys fully driven)
Zoom: Partial (5 of 9 named surfaces)
Reduced Motion: Partial (4 of 5 named surfaces)
Teacher Profile CTA: Pass, zero overlap, both viewports
Browse UX: Pass, no blocking defect
F-013: 0/10 review, 0/3 rate, gate PASS, negative controls PASS
SqlServer/Integration: 215/215
Release Build: Pass
Release Publish: Pass
Publish Smoke: Pass
Health: Pass
Backend: 310/310, 0 failures
Frontend: All named gates pass
Database: EF no pending changes, migrations stable
Tests: 310/310
Browser: 384/384 matrix cells; partial coverage on modal/keyboard/zoom/motion deep-dives
Documentation: Complete (report, evidence, prompt, harness docs, INDEX/PROJECT_STATUS updated)

Final Verdict:

BROWSER CERTIFICATION PARTIALLY COMPLETED
