# Phase 3 Release 3 Sprint 7 — Landing Experience & First Impression

Date: 2026-08-02
Scope: the public Landing page (`Tafseel-Landing.dc.html`) as the marketplace's first impression. No business rules, marketplace flows, APIs, pricing, qualification, Orders, Payment, or Reviews were touched. No statistics, testimonials, success metrics, response times, or numbers were fabricated.

## Findings

The Landing page is already a mature, largely well-built premium-marketplace hero: real illustrative-but-clearly-labeled hero mockup, an honest "these are marketing illustrations, not verified student reviews" disclosure on the testimonial marquee, real live-fetched subject/teacher/service data with proper loading/empty states, and a working typewriter/rotating-word hero that respects `prefers-reduced-motion`. Two real, concrete defects were found on close audit and fixed: (1) the hero's trust-stat row permanently displayed an em dash ("—") for two of its three stats ("Requests completed," "Average rating") because those formulas remain unapproved under ADR-005/F-002 — correctly never fabricated, but left rendering as visibly broken/unfinished forever instead of being removed; (2) the "verified teacher" badges on the hero mockup card and featured teacher cards still used a raw `✓` text glyph in a colored circle, inconsistent with the inline-SVG icon language already established on Teacher Profile (Sprint 2) and Browse Teachers (Release 3 Sprint 1).

## Product Audit

**First impression (Part 1).** Within the first viewport a visitor sees: the brand mark and Arabic wordmark, a real verified-teacher count pill, a headline that names the product's actual differentiator ("Skip the generic course — Learn around your [needs/level/pace/schedule]"), a subheadline naming the concrete mechanic (upload material, pick timing, get the exact part explained), a working search bar with rotating example placeholders, twin CTAs (search / become a teacher), and a live product mockup showing the real request → delivery → escrow-release flow. This covers "what/who/why/trust/next action" within one screen — no changes needed here.

**Hero (Part 2).** Headline, subhead, and mockup already communicate *personalized* (not generic) learning — the mockup literally shows a student's own uploaded files and a teacher's response to that specific request, not a generic course thumbnail. Typography, spacing, and hierarchy read as intentional (clamp-based fluid type, staggered reveal animation, `prefers-reduced-motion` respected). Sound as-is.

**Trust (Part 3).** "Why students trust Tafseel" section correctly limits itself to process claims that are actually enforced: identity/credential review, a reviewed recorded demo, escrow payment held until Student approval, ongoing quality-team scoring — nothing here claims an unapproved metric. The escrow-flow rail lists five real steps matching the actual payment lifecycle. No badge, number, or claim in this section was invented; none needed removal.

**How It Works (Part 4).** Two complementary sections exist: a 4-step "Student manual" (richer, benefit-oriented copy) and a 4-step numbered "How Tafseel works" (terser, scannable). Both cover the same real journey (define need → compare → customize request → learn with payment held until approval) without contradicting each other — acceptable redundancy for a marketing page, not confusing duplication.

## UX Audit

The two fixed issues were UX defects: a permanently-broken-looking stat ("—" forever reads as a bug, not as "data pending") actively hurt the "why is this trustworthy" question Part 1 asks about, and the icon inconsistency broke the visual continuity a Student would notice moving from Landing into Browse/Profile (both already fixed in earlier sprints). Everything else audited — hero, how-it-works, subjects grid with real skeleton/empty states, featured teachers with real loading/empty states — was already coherent.

## Trust Audit

No fabricated badge, number, testimonial, or response time was found anywhere on the page — confirmed by reading `renderVals()` line-by-line. The testimonial marquee explicitly discloses itself as "Illustrative scenarios... Marketing illustrations — not verified student reviews" in both languages, which is the correct pattern under F-002 (rather than either fabricating fake reviews or hiding the marquee entirely). The hero stat pill and the fixed stat row both derive from the one real number available (`GET /teachers?pageSize=4` → `totalCount`), with an explicit `null` fallback state before it loads.

## Conversion Audit

Primary CTA (hero search → Browse Teachers), secondary CTA (Become a teacher), sticky header carrying both at all times, footer CTA split (find a teacher / become a teacher) — all real destinations, no dead ends found in the primary conversion paths. One minor, deliberately **not fixed** dead-end was found: the footer's "Privacy" and "Terms" are plain `<span>` text, not links to real pages (none exist in this app yet). They are not styled to imply interactivity (no link color, no hover state, no cursor change), so they read as inert placeholder labels rather than a "looks-clickable-but-isn't" trap — see Remaining Limitations for why this was left alone rather than fixed with fabricated legal content.

## Visual Design Audit

Whitespace, card treatment, button hierarchy, and section rhythm are consistent with the rest of the marketplace's design system (shared `--r-*`, `--shadow-*`, `--surface`/`--bg-alt` tokens). The one inconsistency found (raw `✓` glyph vs. the established SVG icon language) is fixed. The broader icon set elsewhere on the page (the six "why trust us" reason icons, the escrow-step shield emoji) still uses lightweight Unicode glyphs rather than SVG; these are lower-visibility, lower-conversion-impact than the hero/featured-card badges and were left alone this pass to keep the diff small and reviewable — see Product Recommendations.

## Product Recommendations

Respecting ADR-005, F-002, and "no fake marketing":

1. **Extend the SVG icon treatment to the "why trust us" reasons grid and escrow shield** in a follow-up pass, for full consistency with Teacher Profile/Browse Teachers — lower priority than the hero/featured-card fix already shipped since those glyphs are decorative rather than trust-signaling badges.
2. **When a "requests completed" or "average rating" formula is eventually approved** (tracked as an open business-rule decision per `docs/PROJECT_STATUS.md`), re-add the hero stat row with real values rather than reintroducing empty placeholders.
3. **Footer Privacy/Terms**: either build real minimal policy pages or remove the two labels entirely; do not leave them as inert text indefinitely. Out of scope for a UI-polish sprint since it requires actual legal content, not a design change.
4. Continue the established pattern of auditing before touching — this page was already close to premium-marketplace quality; the highest-value work left is on pages not yet audited this deep, not further Landing rewrites.

## Root Cause

**Hero stats**: the stats array always emitted 3 entries; two were hardcoded to the literal string `'—'` with no real data source, because `ResponseTimeMinutes`/rating-formula work remains blocked by unapproved business rules (`docs/PROJECT_STATUS.md` → "Blocked By Business Rules" → "Teacher metric formulas, date windows, exclusions and privacy boundaries"). Nobody removed the two placeholder entries once it became clear they'd stay empty indefinitely.

**Icon glyphs**: the hero mockup and featured-teacher-card badges predate the SVG icon convention introduced during the Teacher Profile Conversion Redesign and Browse Teachers Release 3 Sprint 1 passes, and were never backfilled — the same category of gap those two prior reports already found and fixed elsewhere.

## Implementation

Frontend-only, one file (`Tafseel-Landing.dc.html`):

- `stats` now returns an empty array until `teacherTotal` resolves, then exactly one entry (the real verified-teacher count) — never the two dead placeholders. The stat-grid `<div>` is now wrapped in `<sc-if value="{{ hasStats }}">` so the bordered/padded row doesn't render at all while there's nothing honest to show in it (avoiding an empty, oddly-spaced strip during the loading state).
- The hero-card and featured-teacher-card verified badges now render an inline SVG checkmark (`stroke`-based, matching the exact path already used by Teacher Profile's qualification icon) instead of a `✓` text character, sized to fit the existing 15–16px circular badge.

No `Tafseel.t()` keys were added, removed, or changed, so no localization file changes were required.

## Browser Validation

Validated against `http://localhost:5090/app/Tafseel-Landing.dc.html` (Development) in the in-app browser, using cache-busted forced navigation to guarantee fresh code after each edit.

- **Stat row**: DOM-confirmed exactly one child in `.tf-stat-grid`, text reading the real seeded count ("1 · Verified teachers" in English, "١ · معلم موثّق" in Arabic with correct Arabic-Indic numerals) — no `—` anywhere.
- **Icon fix**: confirmed one `<svg>` inside the hero mockup card and one inside the single seeded featured-teacher `<article>`; screenshot-verified as a clean filled checkmark badge next to "Dr. Hisham Alawi" (hero, rotates through 4 illustrative teacher examples) and "Tariq Teacher UAT" (real featured-teacher card, real 5.0★ rating, real "SAR 120" price).
- **Responsive**: zero horizontal overflow (`scrollWidth - clientWidth === 0`) confirmed at all six required widths — 375, 390, 768, 1024, 1280, 1440.
- **Language/theme**: English/light and Arabic/RTL/dark both confirmed via `document.documentElement.lang`/`dir`/`data-theme`, correct number localization, zero overflow in both.
- **Console**: zero errors across every state checked (initial load, both language/theme toggles, all six viewport widths).
- **Sections spot-checked visually**: hero, popular subjects (skeleton→real cards), How Tafseel Works, featured teacher card, Six ways to get help — all rendered cleanly with real data, no layout breakage.

## Tests

- `scripts/ci/check-frontend-integrity.mjs`: passed, 13 entry points.
- `scripts/ci/check-localization.mjs`: passed, 2,960 paired keys (unchanged — no new keys).
- `scripts/ci/check-localization-usage.mjs`: passed.
- `scripts/ci/check-bug001-display-names.mjs`: passed (confirms no regression to prior display-name fixes).
- `node --check` on `js/tafseel.js` and `js/locales.js`: passed.
- `git diff --check` on `Tafseel-Landing.dc.html`: clean.
- No .NET/backend files changed; Release build and integration/domain suites were not re-run since nothing they cover was touched this pass.

## Files Changed

- `Tafseel-Landing.dc.html` — removed the two permanently-empty hero stats, gated the stat row behind real data, replaced two `✓` text glyphs with inline SVG checkmarks.
- `docs/fixes/PHASE_3_RELEASE_3_SPRINT_7_LANDING_EXPERIENCE.md` — this report.
- `docs/prompts/PHASE_3_RELEASE_3_SPRINT_7_LANDING_EXPERIENCE.md` — saved prompt.
- `docs/INDEX.md`, `docs/PROJECT_STATUS.md` — indexed and status-updated.

## Remaining Limitations

- The footer's Privacy/Terms labels remain inert (no destination page exists); left alone rather than fabricating legal content or removing a familiar footer pattern outright — see Product Recommendations #3.
- The "why trust us" reason icons and escrow shield still use lightweight Unicode glyphs rather than SVG; lower priority than the fixed badges since they're decorative, not trust-signaling — see Product Recommendations #1.
- Only one seeded Development teacher exists, so the featured-teachers grid's multi-card layout (as opposed to a single card) was not visually exercised this pass.
- Performance metrics (paint timing, layout-shift scores) were not instrumented; only console-error-free rendering and absence of horizontal overflow were verified, consistent with the browser tooling available in this session.

## Risks

Low. Both changes are narrowly scoped: one conditionally renders fewer DOM nodes (strictly less content, no new failure surface), the other swaps a text character for an inline SVG using an already-shipped path from Teacher Profile. No business logic, pricing, qualification, payment, or data-fetching code was touched.

## Next Step

Backend: none required.
Frontend: extend SVG icons to the reasons/escrow section (Recommendation #1) when convenient; decide the Privacy/Terms footer question (Recommendation #3) with product input.
Database: none required.
Tests: none new required for this diff.
Browser: re-verify the hero stat row once a "requests completed" or "average rating" formula is approved and implemented, since this pass changed how that row renders when data is absent.
Documentation: this report plus the saved prompt are the record for Sprint 7; PROJECT_STATUS.md's roadmap should note the hero stat placeholder question as resolved (removed rather than left broken) until the underlying metrics are approved.

## Verdict

**LANDING EXPERIENCE SPRINT 7 — TWO REAL DEFECTS FOUND AND FIXED, BROWSER-VERIFIED.** The full 11-part audit was completed against the live rendered page, not source reading alone. The page was already close to premium-marketplace quality from prior work; this pass's contribution is narrow and honest — removing a permanently-broken-looking placeholder and finishing an icon-consistency pass already established elsewhere — rather than a claim that the whole page was rebuilt.
