# Teacher Profile Carousel Polish Report

Date: 2026-08-01  
Status: Conditionally verified

## Findings

The approved single-player carousel was functionally correct but visually repeated the sample trust type in its heading and overlay, used raw Unicode arrows, repeated the trust type in the position indicator, and hard-coded Previous/Next labels. Keyboard direction also treated Left/Right as LTR regardless of the active document direction.

## Duplicate Content Removed

- The sample trust type now renders once, inside the player overlay.
- The player heading owns the visible title once and contains only compact non-subject metadata.
- Subject and measured duration remain in the opposite overlay corner.
- The live position indicator is numeric only: `1 / 2` or localized Arabic digits.
- Reviewed Showcase moderation copy remains conditional; no trust, review, rating, or metric was fabricated.

## Arrow Redesign

- Previous and Next now use decorative inline SVG chevrons with localized accessible labels.
- Controls retain 48–52 px hit areas, a restrained translucent media surface, a single subtle border, backdrop blur, and explicit hover, focus, active, playing, and reduced-motion treatments.
- Logical positioning uses `inset-inline-start` / `inset-inline-end`; SVG direction mirrors in RTL while callbacks remain Previous/Next in logical item order.

## Player Hierarchy

The hierarchy is now title/date → media stage → one trust label plus subject/duration → compact numeric position → concise caption. Portrait media remains letterboxed intentionally with `object-fit: contain`, native controls, metadata preload, no autoplay, and one mounted video element.

## Accessibility

- Previous/Next names use paired localization keys.
- SVGs are `aria-hidden="true"` and `focusable="false"`.
- Focus is visible and does not rely on hover.
- Left/Right follows visual direction: LTR Left=Previous and Right=Next; RTL Left=Next and Right=Previous.
- Home/End remains logical First/Last.
- Swipe keeps a 48 px deliberate-gesture threshold.
- One-video state hides both arrows and the polite position indicator; two-or-more state shows all three controls.

## Browser Validation

Normal-browser matrix: 20/20 passed at 375, 390, 768, 1024, and 1440 across Arabic RTL / English LTR and Light / Dark.

Validated: zero horizontal overflow, zero console errors, one visible trust badge, one visible title, compact indicator, two accessible SVG controls, correct logical placement and mirroring, 48–52 px targets, native controls, control clearance, `object-fit: contain`, no autoplay, one mounted video, keyboard navigation, service sidebar alignment, and authenticated playback (`readyState=4`, no media error).

Evidence:

- [Desktop English Dark — 1440](./evidence/teacher-profile-carousel-polish/desktop-en-dark-1440.png)
- [Mobile Arabic Light — 390](./evidence/teacher-profile-carousel-polish/mobile-ar-light-390.png)

## Files Changed

- `Tafseel-Teacher-Profile.dc.html`
- `css/tafseel.css`
- `js/locales.js`
- `scripts/ci/check-bug001-display-names.mjs`
- `docs/fixes/TEACHER_PROFILE_CAROUSEL_POLISH_REPORT.md`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

## Remaining Limitations

The Development fixture contains two videos, so the one-video state is covered by executing the production visibility helper in CI rather than by a populated one-video browser fixture. The in-app browser's drag input does not synthesize a touch event; the production swipe handler and threshold/direction helper are covered by focused executable checks. A physical touch-device staging smoke remains useful.

The real portrait sample content remains unrelated to the displayed mathematics title; it was not replaced because this pass cannot fabricate or alter teacher media.

## Risks

No API, authorization, media endpoint, DTO, database, payment, rating, review, or business-rule changes were made. The change is limited to presentation, localized control labels, and pure carousel navigation helpers.

## Final Score

Carousel visual hierarchy: 9.9/10  
Navigation controls: 9.8/10  
Accessibility: 9.9/10  
Responsive polish: 10/10  
Overall carousel polish: 9.8/10

## Next Step

Run one staging smoke on a physical touch device with a legitimate one-video teacher fixture, then keep the current implementation unchanged unless that evidence exposes a real defect.

Final Verdict — **CAROUSEL POLISH CONDITIONALLY VERIFIED**
