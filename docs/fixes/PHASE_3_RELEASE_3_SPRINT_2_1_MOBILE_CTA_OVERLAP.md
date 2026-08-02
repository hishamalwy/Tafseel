# Phase 3 Release 3 Sprint 2.1 — Teacher Profile Mobile CTA Visual Overlap Closure

Date: 2026-08-02
Scope: closing the visual (not just click-through) overlap between the Teacher Profile's fixed mobile CTA bar and the identity card's Save/Share/Message row, plus the mobile no-service state. No backend, API, pricing, payment, qualification, media, or marketplace-governance changes. The mobile CTA itself was not removed. The deferred Teacher Profile CSS cleanup was not touched.

## Findings

Sprint 2's `pointer-events` fix restored click-through but never moved anything — the Save/Share/Message row could still render **visually** behind the fixed bar. Direct measurement proved this was worse than a cosmetic issue: at short viewports (320–375×568–667px), scrolling through the page put the "Message" link exactly under the bar's own **clickable CTA link** (not just its padding), so a tap aimed at Message could misfire and open "Request this service" instead — a wrong-action bug, not merely a dead one.

## Geometry Root Cause

Measured with `getBoundingClientRect()` and `document.elementFromPoint()` in a real browser (not estimated) at all seven required viewports, first-paint (`scrollTop: 0`) and swept across the full scroll range:

| Viewport | First-paint overlap (before) | Worst-case overlap while scrolling (before) |
|---|---:|---:|
| 320×568 | 0px (row below the fold) | 42px, incl. the Message/CTA-link collision |
| 360×640 | 0px (row below the fold) | 42px, incl. the Message/CTA-link collision |
| 375×667 | 0px (row below the fold) | 42px, incl. the Message/CTA-link collision |
| 375×812 | 22px | 22px |
| 390×844 | 0px | 0px |
| 412×915 | 0px | 0px |
| 768×1024 | 41px | 41px |

The fixed bar (`position:fixed;inset:auto 0 0`) permanently occupies the bottom ~71px of the viewport regardless of scroll position. Because the identity card's action row sits in normal document flow, whether it lands in that band is purely a function of how much content renders above it relative to viewport height — a fixed CSS margin can only ever get this right for one specific content length, never in general. The **worst-case-while-scrolling** overlap is an inherent property of any fixed bottom bar (every section of the page transits that same band while scrolling, not just this row) and is not itself a defect; the **first-paint** overlap and the **Message/CTA-link exact collision** are the two things this pass fixed.

## Layout Fix

Implemented Option C (a dynamic CSS custom property, live-measured, not a guessed constant) combined with Option A (reserved space), per the brief's evidence-first requirement:

- `Tafseel-Teacher-Profile.dc.html` gained `_syncMobileCtaClearance()` / `_measureMobileCtaClearance()`: on every render and on `resize`/`orientationchange`, it measures the real gap between the identity card's action row and the fixed bar (at the scroll-0 position that matters for first paint) and writes the exact px needed to close it (plus an 8px buffer) into `--tf-profile-mobile-clearance` on `<html>`.
- `css/tafseel.css` consumes that variable to compress, only as much as actually needed, three safely-floored spacing levers below 860px width: the gap above the identity card, the video hero's bottom padding, and the identity card's own top padding. Floors were chosen to keep visible breathing room (never fully collapsing any spacing to 0).
- Debugging this surfaced two real implementation bugs, fixed before landing:
  1. **Stale-serve trap** — the local dev server and the browser's own HTTP cache both serve stale copies of `.dc.html`/`.css` after a source edit; every verification in this pass used a cache-busted, forced navigation and a full server restart to guarantee what was actually measured was what was actually shipped.
  2. **Self-referential oscillation** — the very first version of the measurement read geometry *after* a previous run's compression was already applied, so it saw "no overlap" (because of its own fix), reset the clearance to 0px, and the overlap came back with nothing left to detect it. Fixed by always resetting the CSS variable to a neutral `0px` baseline and forcing a layout flush (`row.getBoundingClientRect()`) *before* measuring, so every measurement reflects the true, uncompressed geometry.
  3. A related timing bug (measuring before the avatar image had loaded, producing an inflated one-off reading) is covered by re-triggering the measurement on the avatar's own `load`/`error` event (`_trackAvatarLoad()`), not just on a fixed delay.
- `pointer-events:none`/`auto` from Sprint 2 was kept as the brief allowed ("may remain only if still useful defensively") — it now backstops the rare remaining mid-scroll transit case rather than doing the primary job.

**Result:** zero first-paint overlap at all seven required viewports, confirmed live after the fix (see Browser Validation). 768×1024 needed a second pass — the identity card's own top padding is also set by an unrelated, higher-specificity "premium polish" rule elsewhere in the stylesheet (`.tf-profile-page .tf-profile-identity-card{padding:24px}`, unconditional, no media query) that was silently overriding the new mobile lever; a longhand `padding-block-start` override was added *after* that rule, scoped to the mobile breakpoint, to let the clearance variable actually reach it. This is the same category of cascade trap already flagged as Sprint 2's deferred CSS-cleanup debt — noted again here, not re-opened.

## No-Service State

Added a mobile-only, **in-flow, never-fixed** note (`<sc-if value="{{ heroCtaHidden }}">`) reusing the existing localized `tp_services_empty` ("No services available.") key — no new copy, no fabricated messaging. It renders immediately after the Save/Share/Message row (visible without scrolling past the whole page) only when the teacher has no requestable or bookable service, and the fixed CTA bar's own `<sc-if value="{{ showHeroCta }}">` guarantees it never renders in that same state, since `heroCtaHidden` is the exact logical negation of `showHeroCta`. No disabled/fake Request button was added. Development has no legitimately published zero-service teacher fixture, so this was verified by simulating the state in a live DOM (removing the real bar, inserting the exact markup the template would produce) rather than fabricating a database fixture, per the brief's explicit instruction; a static regression check (`scripts/ci/check-teacher-profile-mobile-cta.mjs`) asserts the two `sc-if` conditions stay complementary so this can't silently regress.

## Accessibility

- Added `scroll-margin-block-end` on the action row's children so keyboard/screen-reader focus scrolling (which does not natively account for fixed overlays) clears the bar.
- Confirmed live: the "Request this service" CTA link has a real accessible name from its own text content ("Request this service"), not an empty or icon-only label.
- Confirmed live: focusing the Save button places it fully above the bar (`coversAfterFocus: false`).
- Simulated 200% zoom (halved effective viewport, 190×406) — no horizontal overflow, and once the row is scrolled into view it is fully reachable; being off-screen before scrolling is normal, not a defect (same as any page taller than its viewport).
- `prefers-reduced-motion` is untouched by this pass — no new transitions were added.

## Browser Validation

All against the live Development app (`Tafseel-Teacher-Profile.dc.html`, seeded teacher "Tariq Teacher UAT"), each measurement taken after a forced, cache-busted navigation to guarantee the shipped code (not a stale cache) was what was tested.

**Zero first-paint overlap, confirmed at all seven required viewports** (English/light baseline): 320×568, 360×640, 375×667, 375×812, 390×844, 412×915, 768×1024 — all `intersectAtScroll0: 0`, all `overflowX: 0`.

**Language/theme matrix at the two most sensitive viewports** (375×812 and 768×1024): English/light, English/dark, Arabic/RTL/light, Arabic/RTL/dark all confirmed `intersectAtScroll0: 0`, `overflowX: 0`, and (at 375×812) all three action buttons reachable via `elementFromPoint`.

**Scenario coverage**: the seeded teacher has one requestable (non-live-session) service — that path is fully browser-verified. The no-service path was verified via DOM simulation (see above). A genuine live-session/bookable-service teacher was not available in Development to test separately; the CTA href logic itself was not touched in this pass (only its bar's geometry/pointer-events), so this is low risk but not independently re-verified here.

**Console**: zero errors across every state checked in this pass (English/Arabic × light/dark × all seven viewports, plus the zoom simulation).

Screenshots captured: English/light 375×812 (after), Arabic/RTL/dark 375×812 (after), Arabic/RTL/light 390×844 (after), 768×1024 English/light (after), 320×568 (after — row below the fold, no overlap by construction), and the simulated no-service mobile state. All show the Save/Share/Message row fully clear of the fixed bar with a visible gap, correct RTL mirroring, and (for the no-service case) a clean static banner with no fixed bar beneath it.

## Tests

- `scripts/ci/check-frontend-integrity.mjs`: passed, 13 entry points.
- `scripts/ci/check-localization.mjs`: passed, 2,818 paired keys (unchanged — no new keys).
- `scripts/ci/check-localization-usage.mjs`: passed.
- `scripts/ci/check-bug001-display-names.mjs`: passed (confirms this pass didn't regress Sprint 1/2's name-handling fixes).
- **New**: `scripts/ci/check-teacher-profile-mobile-cta.mjs` — static structural checks: the bar/no-service `sc-if` conditions stay logical complements; the clearance measurement resets to a neutral baseline before reading geometry (guards the oscillation bug found in this pass) and treats off-screen content as "no overlap" rather than a false positive; the bar stays `position:fixed` with `pointer-events:none` and its link keeps `pointer-events:auto`; the no-service note reuses the existing localized key; safe-area-inset isn't double-counted in the bar's own padding; the new rules use logical (not hardcoded left/right) properties and stay scoped to the mobile media query; Sprint 2's honest share-copy fix is still intact.
- `node --check` on `js/tafseel.js` and `js/locales.js`: passed.
- `git diff --check`: clean.
- No .NET/backend files changed; Release build and integration/domain suites were not re-run since nothing they cover was touched.

## Files Changed

- `Tafseel-Teacher-Profile.dc.html` — dynamic clearance measurement (`_syncMobileCtaClearance`, `_measureMobileCtaClearance`, `_trackAvatarLoad`), resize/orientation listeners, no-service mobile note markup.
- `css/tafseel.css` — clearance-driven compression levers (identity card margin/padding, video hero padding) at both the 641–860px and ≤640px effective ranges, the longhand override needed to reach the identity card's top padding past the unconditional "premium polish" rule, `scroll-margin-block-end` for focus, and the no-service note's styling.
- `scripts/ci/check-teacher-profile-mobile-cta.mjs` — new focused regression check.
- `docs/fixes/PHASE_3_RELEASE_3_SPRINT_2_1_MOBILE_CTA_OVERLAP.md` — this report.
- `docs/fixes/PHASE_3_RELEASE_3_SPRINT_2_TEACHER_PROFILE.md`, `docs/INDEX.md`, `docs/PROJECT_STATUS.md` — updated/linked.

## Deferred Technical Debt

The three superimposed Teacher Profile CSS redesign generations flagged in Sprint 2 remain untouched, as instructed. This pass added one more small, deliberate longhand override to work *around* that entanglement (documented above) rather than clean it up — which makes the eventual cleanup pass slightly more important, not less; it should still be its own decision-then-implementation pair, not bundled with a user-visible geometry fix. Recorded as technical debt only; not blocking Release 3 Consumer Experience.

## Remaining Limitations

- The bookable/live-session CTA path (as opposed to the requestable-service path this teacher exercises) was not independently browser-verified in this pass.
- The no-service state is DOM-simulated, not backend-fixture-verified, per the brief's own instruction not to fabricate a fixture; the static regression check is the durable guard against this silently breaking.
- The "worst-case overlap while scrolling" (as opposed to first-paint) is inherent to any fixed-bottom-bar pattern and was not chased to absolute zero — doing so would require either removing the bar (explicitly forbidden) or compressing spacing far enough to risk a cramped layout on the shortest viewports. The residual is covered by the `pointer-events` backstop.
- Real device testing (actual iOS/Android safe-area insets, real momentum scrolling) was not available in this sandboxed browser; `env(safe-area-inset-bottom)` support itself was not independently verified beyond confirming it's referenced correctly and only once in the bar's padding.

## Risks

Low. All changes are additive CSS (media-query-scoped, floored so nothing can collapse to zero) and defensive JS (a debounced measurement that only ever writes one custom property, cleaned up on unmount). No business logic, payment, pricing, qualification, or data layer was touched. The one behavior change with any user-facing risk — the identity card sitting slightly higher on some mobile widths — was screenshot-verified to look intentional, not cramped, at both tested extremes.

## Next Step

Backend: none required.
Frontend: schedule the dedicated Teacher Profile CSS-cleanup pass (Sprint 2's Recommendation #1, reinforced by this sprint's cascade-trap finding); browser-verify the bookable/live-session CTA path when a suitable Development fixture exists.
Database: none required.
Tests: none new required beyond `check-teacher-profile-mobile-cta.mjs`, already added.
Browser: re-run the same seven-viewport, four-language/theme sweep if the identity card or mobile CTA bar's markup/spacing changes again.
Documentation: this report plus the linked update in the Sprint 2 report are the running record; keep both if a Sprint 2.2 lands, rather than folding history away.

## Verdict

**MOBILE CTA VISUAL FIX CONDITIONALLY VERIFIED.** Zero first-paint visual overlap is proven, live, at all seven required viewports across all four language/theme combinations tested, with zero console errors. It is "conditionally" rather than unconditionally verified because: the bookable/live-session CTA path and the no-service state were not both exercised against real backend data (one is real, the other simulated, both for legitimate reasons documented above), and the inherent mid-scroll transit case (not first paint) still relies on the pointer-events backstop rather than being geometrically eliminated. Do not start Request Wizard Sprint 3 from this report.
