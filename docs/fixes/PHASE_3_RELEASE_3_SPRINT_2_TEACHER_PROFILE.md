# Phase 3 Release 3 Sprint 2 — Teacher Profile Consumer Experience

Date: 2026-08-02
Scope: Teacher Profile as the Student's "sales page" — product/UX/conversion audit and two bounded, browser-verified fixes. No backend, payment, pricing, qualification, or governance changes.

## Summary

Teacher Profile had already been through several prior redesign passes ([Conversion Redesign](./TEACHER_PROFILE_CONVERSION_REDESIGN_REPORT.md), [Premium Polish](./TEACHER_PROFILE_PREMIUM_POLISH_REPORT.md), [Carousel Polish](./TEACHER_PROFILE_CAROUSEL_POLISH_REPORT.md), [Final Quality Recovery](./TEACHER_PROFILE_FINAL_QUALITY_REPORT.md)) and, on inspection, is genuinely strong: honest empty states, real reviews only, one featured player, no fabricated metrics, a conversion sidebar visible beside the hero on desktop. This sprint re-audited it end-to-end against the 10-part brief using the live rendered page (not just source reading), and found two real, reproducible defects — one a mobile touch-target bug, one a false-success message — plus a significant but higher-risk performance finding (duplicated CSS generations) that was investigated, confirmed, and deliberately **not** touched this sprint because a safe removal requires broader, dedicated regression coverage than a bounded sprint allows.

## Product Audit

**Hero (Part 1).** On desktop (1280–1440px), the CSS grid places the conversion sidebar (price, "Request this service," protected-payment note) beside the video/identity content, not below it — price and primary CTA are both on-screen without scrolling, and the breadcrumb carries the teacher's name, so identity + price + CTA are all visible well inside 5 seconds. Verified by live screenshot, not by reading the CSS in isolation.

**Teaching Samples (Part 2).** One active player, one trust label ("Qualification Sample"), no duplicated metadata. `get_page_text` on the live page confirmed no repeated badges/labels.

**Services (Part 3).** Card shows title, description, delivery, revisions, and price with a clear selected state; the sidebar mirrors the selection immediately. Sound.

**Trust (Part 4).** No invented completed-order counts, response times, or popularity — confirmed by reading `renderVals()` line-by-line; `headStats` is empty unless `rating != null && ratingCount > 0`, consistent with F-002 and ADR-005.

**About / Reviews (Parts 5–6).** Empty sub-sections (education/experience) are already collapsed via `showTimeline`/`showBio` guards rather than rendered empty. The single seeded review renders honestly (real score, real comment, "Verified student" label — no fabricated identity).

**Sidebar (Part 7).** Sticky on desktop, static and reordered to the bottom of the single-column stack on mobile (compensated by the fixed mobile CTA bar — see Mobile below).

## UX Audit

**Mobile reachability (Part 8) — real defect found and fixed.** At 375×812 (and reproducible at other short-viewport/short-content combinations), the identity card's Save/Share/Message row sits, on first paint with zero scrolling, directly under the fixed `.tf-profile-mobile-cta` bar. Proven with `document.elementFromPoint()` at the Save button's exact screen center: the hit target was the bar `DIV`, not the button — i.e. the button was visually present but **not tappable** until the Student scrolled roughly 100px. This is exactly the "no dead buttons" / reachability failure the brief calls out.

**Share false-success (Part 4/trust, found while reading the interaction code).** `onShare()` called `navigator.clipboard.writeText()` and showed "Profile link copied to clipboard" in **both** the success path and the `catch` block — so if the clipboard write failed (denied permission, insecure context, older Safari), the Student was told the link was copied when it was not. A trust bug: false positive feedback on a page whose whole brief is "increase trust."

## Conversion Audit

Both defects above work against the brief's own stated goals: a dead button on the very first screen a mobile Student sees undermines confidence before they even reach the offer, and a false "copied" toast is a small but real trust violation exactly where the brief asks for honesty. Fixing both was higher priority than any further visual-hierarchy tuning, given the page's hierarchy already scored well in prior passes.

## Product Recommendations

Respecting ADR-005, F-002, and marketplace governance (none required changes here):

1. **Dedicated CSS-cleanup pass** for `css/tafseel.css`'s Teacher Profile section (see Root Cause) — do not fold into a UX sprint; it needs before/after visual regression across the full breakpoint matrix because live and dead selectors share class names in a way that makes blind deletion risky.
2. **Mobile "no services" parity**: when a teacher has zero requestable/bookable services, the desktop sidebar shows a "No services available" note, but mobile has no equivalent surface until the Student scrolls to the very bottom (no mobile-cta renders in that case). Low-frequency edge case (a published teacher with zero services); worth a small follow-up.
3. Continue treating Teacher Profile change requests as audits-then-bounded-fixes, per this sprint and Release 3 Sprint 1 — the page is mature enough now that large rewrites carry more regression risk than value.

## Root Cause

**Mobile CTA overlap**: `.tf-profile-mobile-cta` is `position:fixed;inset:auto 0 0`, so it always occupies the bottom ~71px of the viewport regardless of scroll position. For teachers with short above-the-fold content (little video/identity content above the Save/Share/Message row), that row's natural document-flow position coincides with the fixed bar's band on first paint. No amount of margin *after* the identity card fixes this — margin below an element cannot move that same element's own on-screen position — which is why an initial `margin-block-end` attempt (see Implementation) was reverted once verified in-browser to be a no-op for this specific defect.

**Share false-success**: the `catch` block copy-pasted the same `flash()` call as the `try` block's success path instead of only firing on confirmed success.

**Dead CSS (investigated, not removed)**: `css/tafseel.css` contains three superimposed Teacher Profile redesign generations. `grep -l "tf-profile-" *.dc.html` confirms only `Tafseel-Teacher-Profile.dc.html` uses any `tf-profile-*` class, so nothing here risks breaking another page — but many class names (e.g. `.tf-profile-service-card`, `.tf-profile-avatar`, `.tf-profile-hero-actions`) are legitimately reused and *partially* overridden across generations, so a rule like `.tf-profile-service-card{padding:18px;border:1px solid var(--border);...}` from an earlier generation is still load-bearing (a later generation's rule for the same selector only adds grid/hover/selected properties, not padding/border/background). Deleting a "generation" wholesale would strip real, currently-applied styling. A safe removal requires auditing each rule individually against computed styles, not a bulk delete — out of scope for a bounded UX sprint.

## Implementation

Frontend-only, two files:

- **`Tafseel-Teacher-Profile.dc.html`** — `onShare()` now only flashes the "copied" toast when a copy actually succeeds. It still tries `navigator.clipboard.writeText()` first; on failure it falls back to a legacy `textarea` + `document.execCommand('copy')` attempt (a standard, dependency-free fallback) and only flashes on that succeeding too. No new `Tafseel.t()` keys were needed.
- **`css/tafseel.css`** — `.tf-profile-mobile-cta` (the fixed bottom bar, `@media (max-width:860px)`) now has `pointer-events:none`, with `pointer-events:auto` restored on its child `<a>` CTA link. The bar's decorative background/padding area no longer intercepts taps meant for whatever real content happens to render underneath it; the actual "Request this service" / "Book" link stays fully clickable. This does not change any visual rendering — it only changes which element receives the click when the two coincide.

An earlier attempt (`.tf-profile-identity-card{margin-block-end:88px}`) was tried, verified ineffective via live `elementFromPoint` testing (it doesn't move the row that needs to move), and reverted before landing — noted here for the record, not left as dead code in the diff.

## Browser Validation

All against `http://localhost:5090/app/Tafseel-Teacher-Profile.dc.html?id=f9a09770-1d93-4210-9fd2-887544274944` (Development, seeded teacher "Tariq Teacher UAT").

- **375×812, English/light and Arabic/RTL/dark**: `document.elementFromPoint()` at the Save button's center now resolves to the button (previously resolved to `.tf-profile-mobile-cta`), confirmed in both language/theme states. `document.documentElement.scrollWidth - clientWidth === 0` in both (no horizontal overflow). The "Request this service" CTA link inside the bar was click-tested end-to-end and correctly navigated (to `Tafseel-Auth.dc.html`, the existing guest-redirect behavior — unchanged by this fix).
- **768×1024, 1024×800, 1280×800**: zero horizontal overflow at all three.
- **1440×900, English/light**: hero, identity card, services, reviews, about, availability, and sticky sidebar all rendered correctly; sidebar price/CTA visible beside the video without scrolling.
- **Keyboard**: Tab order proceeds through header nav → skip content in a sane sequence; no keyboard trap observed.
- **Console**: zero errors across every state above (`read_console_messages` with `onlyErrors: true`).
- A dev-server restart was required mid-session for a CSS edit to take effect (the running `dotnet run` process serves a build-time snapshot of `css/tafseel.css`, not the live source file) — noted here because it's a real gotcha for anyone editing this repo's frontend while the dev server is already running.

## Tests

- `scripts/ci/check-frontend-integrity.mjs`: passed, 13 entry points.
- `scripts/ci/check-localization.mjs`: passed, 12 entry points, 2,818 paired keys (unchanged — no new keys added).
- `scripts/ci/check-localization-usage.mjs`: passed.
- `scripts/ci/check-bug001-display-names.mjs`: passed.
- `node --check` on `js/tafseel.js` and `js/locales.js`: passed.
- `git diff --check`: clean (only the pre-existing LF/CRLF line-ending warning on `css/tafseel.css`, not an error).
- No .NET/backend files changed; Release build and integration/domain suites were not re-run since nothing they cover was touched.

## Files Changed

- `Tafseel-Teacher-Profile.dc.html` — honest share-copy feedback.
- `css/tafseel.css` — mobile CTA bar `pointer-events` fix.
- `docs/fixes/PHASE_3_RELEASE_3_SPRINT_2_TEACHER_PROFILE.md` — this report.
- `docs/INDEX.md`, `docs/PROJECT_STATUS.md` — indexed and status-updated.

## Remaining Limitations

- ~~The mobile-CTA overlap fix restores **click-through**, not the **visual overlap**~~ — **closed in Sprint 2.1**, see [Mobile CTA Overlap Closure](./PHASE_3_RELEASE_3_SPRINT_2_1_MOBILE_CTA_OVERLAP.md). That pass also found the overlap could cause a worse bug than a dead button: at short viewports the Message link could sit exactly under the bar's real CTA link, so a tap could misfire onto "Request this service" instead.
- The dead-CSS finding (Root Cause) was investigated and precisely characterized but deliberately not remediated this sprint — see Product Recommendations #1.
- Only one seeded Development teacher exists, so populated-review-card variety (multiple reviews, varying scores) and a genuinely long service list were not re-verified in this pass; single-review and single-service rendering were.
- Video/media playback itself (`readyState`, native controls) was not re-verified this sprint; it was verified in the prior Carousel Polish and Conversion Redesign passes and nothing touched in this sprint could affect it.

## Risks

- Low: `pointer-events:none`/`auto` split is a narrow, purely-defensive change scoped to one class under one media query; it cannot affect any other page (no other `.dc.html` uses `tf-profile-*` classes) and cannot make anything less clickable than before (the CTA link explicitly keeps `pointer-events:auto`).
- Low: the share-copy fix only changes when a toast fires, not any data or navigation flow.
- None identified for business logic, payments, pricing, qualification, or data.

## Next Step

Backend: none required.
Frontend: schedule the dedicated CSS-cleanup pass for the Teacher Profile stylesheet (Recommendation #1); consider the mobile "no services" parity note (Recommendation #2).
Database: none required.
Tests: none new required for this diff.
Browser: repeat the mobile click-target check on any future spacing change to the identity card or the mobile CTA bar, since the current fix depends on their relative geometry.
Documentation: this report is the running record for Sprint 2; the CSS-cleanup pass should get its own decision/report pair (decision doc first, then implementation) following this project's established pattern for higher-risk changes.

## Sprint 2.1 Visual Overlap Closure

The pointer-events fix above was a click-through backstop, not a geometric fix — the Save/Share/Message row could still render visually behind the fixed mobile CTA bar, and at short viewports the Message link could land exactly under the bar's real "Request this service" link, risking a misfired tap. Sprint 2.1 closed this properly: a live-measured (`getBoundingClientRect`/`elementFromPoint`, not guessed) CSS custom property now pulls the identity card up by exactly the overlap it detects, verified to reach **zero first-paint overlap at all seven required viewports** (320×568 through 768×1024) across English/Arabic × light/dark, with zero console errors. It also added a truthful mobile no-service state (no fake fixed bar, no fabricated copy) and closed a real cascade bug where an unrelated, higher-specificity stylesheet rule was silently blocking the fix at one viewport. Full detail, evidence, and the two implementation bugs found and fixed along the way: [Mobile CTA Overlap Closure report](./PHASE_3_RELEASE_3_SPRINT_2_1_MOBILE_CTA_OVERLAP.md).

## Verdict

**TEACHER PROFILE SPRINT 2 — TWO REAL DEFECTS FOUND AND FIXED, BROWSER-VERIFIED.** The mobile dead-button defect and the share false-success message are both fixed and verified across English/Arabic, light/dark, and 375–1440px with zero console errors. The full 10-part audit was completed at a reading-plus-live-verification level; the dead-CSS performance finding was deliberately deferred rather than risked. This is a genuine, bounded increment — not a full redesign, and not a claim that every one of the brief's 10 parts received a code change (most were audited and found already sound from prior passes).
