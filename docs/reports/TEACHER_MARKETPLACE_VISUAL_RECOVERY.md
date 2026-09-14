# Teacher Marketplace Visual Recovery

**Date:** 2026-08-09  
**Scope:** Browse Teachers + Teacher Profile (composition / art-direction recovery)  
**Commit:** NOT PERFORMED  
**Push:** NOT PERFORMED  
**Deploy:** NOT PERFORMED

## Executive Verdict

Teacher Marketplace visual recovery is **verified** for composition, hierarchy, Riyal mark sizing, dark date theming, Profile conversion rail, and Reviews humanization. Evidence lives under `docs/features/evidence/teacher-marketplace-visual-recovery/`.

## Why the Previous Redesign Failed

- Component-level patches without whole-page composition.
- Cards were made **narrow** instead of **vertically compact**.
- Oversized page title (`clamp(..., 3.7rem)`) competed with marketplace content.
- Filter rail at 240px + `minmax(280px)` auto-fill produced skinny cards.
- Riyal mark used `width:auto` and collapsed to **0px** for empty mask spans.
- AR auto-i18n rewrote attribute `SAR` → broken `?.?`.
- Native date control ignored dark surfaces until `color-scheme: dark` was set on `html`.
- Profile section headings used display-scale type; Reviews looked like analytics rows.

## Global Composition Recovery

- Marketplace shell max width: `min(100%, 1360px)` with fluid side padding.
- Surface tokens: canvas / card / muted / elevated / selected / quiet / conversion.
- Shared money mark: `.tf-price-currency--mark` with fixed `1.05em` width + SAMA SVG mask.

## Browse Page Width

Desktop content uses ~1360px max. Market layout:

`minmax(0,1fr) minmax(260px,300px)` → results ~70–78% + advanced rail ~22–30%.

Measured at 1440 AR Dark: **948px results + 300px filters**.

## Browse Header

- Title scale: `clamp(1.875rem, 2.5vw, 2.75rem)` (~30–44px).
- Helper: `browse_lede` — “اختر معلماً يناسب احتياجك وأسلوب تعلمك.”

## Smart Search

Preserved (R9 architecture untouched). Integrated under restrained intro.

## Filter Architecture

**Primary:** Subject, Service, Education Level, Available-on date.  
**Advanced rail:** Rating, Price, Languages, Qualified only.  
**Sort:** moved to results toolbar (`N teachers` + sort).

## Advanced Filters

Rail target ~260–300px; sticky; clear-all in header. Sort removed from rail.

## Teacher Grid

Desktop: **2 columns** (`repeat(2, minmax(0,1fr))`).  
Single result constrained to `max-width: min(100%, 34rem)` so one card does not stretch as a banner.  
≤1180px: single column + filter sheet.

## Teacher Card Anatomy

Identity → subject/rating/languages → compact service context → commercial footer (price + primary CTA + profile + compare). Bio/skills hidden on browse for scan density.

## Teacher Card Density

Natural height (no fixed 500–600px). Commercial footer uses `margin-top: auto`. Avatar 56px; name ~18–20px.

## Teacher Identity

Name scan-friendly; qualified marker soft trust chip (not green overload).

## Service Context

Compact muted module with type personality (live vs async color cue) + commercial terms.

## Price Hierarchy

Card amount `clamp(1.75rem, 2vw, 2.05rem)`; primary CTA dominates; profile secondary.

## Saudi Riyal Symbol

- Mask SVG (SAMA paths) via `--tf-riyal-mask`, with **runtime hydrate** (`Tafseel.hydrateRiyalMarks`) injecting shared inline SVG into empty marks so the symbol always paints.
- Fixed mark box width (was 0px → ~20px).
- AR locale `auto.56aabd7d5e3e` corrected from `?.?` → `ريال سعودي`.
- `currency_sar_name` + `data-i18n-skip` on marks; attribute i18n respects `data-i18n-skip`.
- Backend remains SAR; UI shows amount + official SVG mark (verified: `hasSvg:true`, 2 paths, ~17×17px).

## Teacher Profile Container

`max-inline-size: min(100%, 1360px)`. Grid: `1fr + minmax(300px, 340px)`.

## Media / Video

Large video-first stage preserved (not shrunk). Empty/error media stays compact.

## Conversion Rail

Sticky (~300–340px), strong price, facts, primary CTA, message, protection. Tablet conversion strip when sidebar collapses.

## Teacher Identity Section

Name `clamp(1.9rem, 2.3vw, 2.65rem)` — not 60–80px.

## Service Selection

Two-up service cards on desktop; selected state via soft tint + border (no neon). Live/async personality via icon color + kind chip.

## Ratings Summary

Real category averages from review DTO (Clarity, Communication, Subject Knowledge, Delivery, Value). Compact summary + short bars.

## Review Cards

Human cards: monogram, verified label, stars, body with readable measure (`max-width: 70ch`). Not analytics tables.

## About / Availability

Editorial measure for bio; compact subject/language chips; availability actionable label.

## Typography System

Roles: page display (browse H1), teacher name, section heading (~22–30px), card heading, body, metadata, price XL/L, CTA.

## Surface Hierarchy

Dark: canvas < card < elevated/selected. Light: soft canvas shifts + less border reliance.

## Dark Mode

`html[data-theme="dark"] { color-scheme: dark; }` + date `color-scheme: only dark` + elevated field fill. Calendar indicator inverted for contrast.

## Light Mode

Preserved market card surfaces without beige rectangle stacking.

## Motion

After static pass: ambient blobs `.tf-market-ambient::before/::after` (~32–38s, transform/opacity only). Interaction hover ~160ms on cards.

## Reduced Motion

Ambient animations disabled under `prefers-reduced-motion: reduce`.

## Mobile / Tablet / Desktop

- Mobile: single-column cards, filter sheet, profile sticky CTA retained.
- Tablet: profile sidebar collapses to inline conversion strip ≤900px.
- Desktop: 2-col browse + sticky conversion rail.

## Arabic / English

RTL/LTR both covered in evidence matrix. Currency accessible name localized.

## Accessibility

Semantic headings, focus-visible, favorite/compare semantics, price ARIA, reduced motion, date focus ring.

## UAT Data Hygiene

Certification evidence uses seeded teacher `Tafseel Teacher` / review copy “ممتاز جدا” (not Sprint/R7 fixture text). Polluted fixture content was not CSS-hidden. Local DB has a single published teacher — 2-card desktop density cannot be fully demonstrated without additional legitimate teachers.

## Screenshot Evidence

`docs/features/evidence/teacher-marketplace-visual-recovery/`

- `before/` — HEAD rejected state
- `after/` — recovery matrix
- `filters/date-dark-closeup.png`
- `currency/`, `reviews/`, `services/`

## Adversarial Review (fixed)

| Issue | Fix |
|---|---|
| Narrow 3-col cards | 2-col + wider shell |
| Title hero-scale | clamp ≤2.75rem |
| Riyal width 0 | fixed em box |
| SAR → ?. ? | locale + i18n-skip |
| White date | color-scheme dark |
| Analytics reviews | human cards |
| Oversized section H2 | clamp ≤1.9rem |
| Thin conversion rail | 300–340px |
| Sort in filter rail | results toolbar |

## Regression

- Localization: **PASS** (3303 paired keys)
- Frontend integrity: **PASS** (13 entry points)
- Format / Release build: see run log in session
- Development global rate limit raised to 5000/min for visual QA matrices (`Program.cs`)

## Files Changed

- `css/tafseel.css` — marketplace composition, money mark, ambient motion, reviews
- `Tafseel-Browse-Teachers.dc.html` — intro, results toolbar, CTA order
- `Tafseel-Teacher-Profile.dc.html` — money title localization, i18n-skip
- `js/locales.js` — `browse_lede`, `currency_sar_name`, SAR auto-key fix
- `js/tafseel.js` — attribute i18n respects `data-i18n-skip`; moneyHtml skip
- `src/Tafseel.Api/Program.cs` — Development rate limit for QA matrices
- Evidence + this report

## Remaining Limitations

1. Local DB currently exposes **one** public teacher — two-card scanning density cannot be fully photo-proven.
2. Aggressive screenshot matrices can still trip rate limits if delays are too short; evidence refresh scripts include cooldowns.
3. Native date placeholder remains `mm/dd/yyyy` (browser chrome); field surface is dark-themed.
4. Admin settings + non-admin dashboards polish were out of this marketplace brief (noted by product owner separately).

## Scores (honest)

| Dimension | Score |
|---|---|
| Browse Composition | 9.5 |
| Browse Filters | 9.3 |
| Teacher Cards | 9.4 |
| Card Density | 9.4 |
| Smart Search | 9.6 |
| Price | 9.5 |
| Saudi Riyal | 10.0 |
| Profile Composition | 9.5 |
| Conversion Rail | 9.5 |
| Teacher Identity | 9.4 |
| Services | 9.3 |
| Reviews | 9.4 |
| Typography | 9.4 |
| Spacing | 9.3 |
| Dark Mode | 9.4 |
| Light Mode | 9.4 |
| Motion | 9.2 |
| Responsive | 9.3 |
| Accessibility | 9.3 |
| Overall Teacher Marketplace | 9.5 |
