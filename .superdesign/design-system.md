# Tafseel: incumbent design-system context

Status: extracted repository context for the Landing audit on 2026-10-05. This does not approve a new visual world or change canonical DESIGN.md. Identity and product truth derive solely from current brand assets, tokens, PRODUCT.md, DESIGN.md and the product contract. No other page is a creative reference for this task.

## Product and surface contract

Tafseel is a Saudi-first Arabic/English educational marketplace in SAR. Students seek explanations of their own material; approved teachers offer asynchronous work or scheduled live sessions. Guest discovery routes to published teacher profiles. Students can request a specific teacher or publish an open request and compare offers. Teacher qualifications are approved per subject, and publication/eligibility are server decisions. The Landing is a Persuade surface: help the visitor understand the offer and choose a real next action; signed-in role actions remain role-aware.

Keep canonical business truth authoritative: qualification, eligible offerings, price/delivery context, real reviews, availability, payment/escrow lifecycle, recovery. Never manufacture public metrics, ranking, teachers, testimonial identities, availability, or a service capability. Do not add routes, dead controls, social profiles, ranking, AI claims, or changed business rules as part of visual work.

Sources: PRODUCT.md; docs/product/TAFSEEL_PRODUCT_CONTRACT.md sections 1, 2, 3.1-3.2, 3.6-3.9, 3.13-3.15; AGENTS.md.

## Existing brand and material

The product has a custom design system, not a stock UI framework. Existing official SVG marks/lockups and pattern assets are source material. Brand primitives: violet #5036D8, bone #F8F4E8, lime #DDFA64, ink #131218. Product controls use quieter #4B3C9F in light; lime carries authority/action in dark with ink text. Cyan is reserved for live-session information. Status colors remain semantic.

The incumbent language is a well-organized study desk: warm paper, precise tools, clear annotations, bilingual typography, specific learning content. Public marketplace composition is editorial, spacious, and trust-first. Dashboards are operational and focused workflows narrow. Families can own composition and surfaces; they cannot invent a separate meaning of text, primary, success, warning, or error.

Neutrals occupy most of the page. Primary color identifies the next action or selected state. Use spacing and tonal steps before more containers. Borders are the primary light-theme separator; dark separation comes from tonal steps and borders. Elevation has a reason: overlay, sticky commerce, interaction. Existing policy rejects atmospheric glow, constellation grids, gradient text, generic smart badges, glass decoration, fabricated proof, and interchangeable card walls.

Sources: DESIGN.md:129-147, 360-401, 601-607, 629-643, 678-692; css/tafseel.css:58-132.

## Exact working foundation

For current extracted values, read the compact Part 1 of .superdesign/init/theme.md. Canonical values and raw source are in css/tafseel.css. Preserve token semantics rather than selecting a new palette/font from a generic design database.

- Light canvas/alt/surface/recessed: #F6F5F1 / #ECEAE4 / #FDFCF9 / #F4F2ED. Text #131218; secondary/muted #625E66. Primary #4B3C9F, hover #3E3188, soft #F0EEF7.
- Dark canvas/alt/surface/recessed: #121318 / #181A21 / #1C1E26 / #242630. Text #F3F0E8; secondary 82% and muted 68% of that ink in Oklab. Primary #DDFA64, primary ink #131218.
- English Montserrat; Arabic Thmanyah Sans; Saudi Riyal font is self-hosted and scoped to U+20C1. All fonts use swap. Never replace the supplied logo with browser text.
- Reading ramp 11/12/13/14/15/16/19/22/28px. Display and page-title fluid roles. Editorial type of 23px and above can be composition-specific. Preserve Arabic joins; do not add Latin tracking/capitalization habits to Arabic.
- Named spacing 4/8/12/16/20/24/32/40/48/64px. Radii 4/8/12/16/24px. Use one documented shape grammar: controls, content, large regions, short status/filter pills.
- Canonical breakpoints 480/640/768/1024/1280px. Min touch target 44px; inputs/controls at 16px where applicable.
- Motion roles 120/220/320ms, overlay enter/exit 240/160ms, cubic-bezier(.16,1,.3,1). Move transform/opacity, keep reduced-motion feedback, scope hover to capable pointers.

Measured constant-color pair contrast: secondary/canvas 5.81:1; secondary/alternate 5.27:1; surface/primary button 8.37:1; brand-violet/brand-bone 6.68:1; ink/lime 15.91:1; dark text/canvas 16.29:1. These are source-token calculations, not a complete rendered contrast audit.

## Shared mechanics to preserve

Angular 22.2 standalone components use custom tf-* primitives and plain CSS. Build/test/prestart synchronize root css/tafseel.css and assets into Angular; generated CSS is not hand edited. Landing-only CSS is lazy-extracted by sync-design-system.mjs; the small component stylesheet owns only the hero's local type declarations.

Public header geometry, keyboard skip link, locale/theme actions, route links, accessible names, visible focus, mobile menu, toast feedback, promotion dialog lifecycle, price component and factual loading/empty/error states belong to their existing component contracts. Preserve behavior while changing composition.

Use logical properties for RTL. Navigation remains textual/predictable. The DOM order should preserve need, discovery, evidence, conversion on narrow screens. Keep recovery and teacher facts accessible before media. A missing API value stays missing; an unavailable endpoint does not mean zero inventory or a new claim.

Sources: AGENTS.md frontend section; frontend-angular/angular.json; frontend-angular/scripts/sync-design-system.mjs; DESIGN.md:212-264, 274-290, 631-633, 672-685.

## Observed Landing composition

Current anatomy: public header; hero with learning promise, search and upload entry, quiet teacher recruitment, actual community counts, Saudi map; signed-in student journey where applicable; four-step product story; subject catalogue; public teacher cards; service formats; teacher/payment reassurance with escrow sequence; student action block and quieter teacher recruitment; branded footer; optional published promotion dialog/toast.

Existing strengths are product specificity in the explanation example, genuine server-fed teacher evidence, separated role paths, bilingual typography, and component-owned loading/recovery. The audit should evaluate whether each region advances the visitor's decision, whether the action language matches the actual control, whether truth survives API failure, and whether media/motion earns its place.

This is context, not an approval of every current composition or claim. The root audit owns findings and remediation priority.

## Explicit drift to keep visible

- DESIGN.md frontmatter body type says 1rem; its role ramp and CSS --type-body use 15px; --type-body-lg and body element are 16px. Use explicit roles, not an invented average.
- DESIGN.md frontmatter scrims use hue 265; current CSS uses hue 350. CSS is the current runtime evidence.
- Canonical layout breakpoints differ from legacy aliases/feature thresholds. Landing has many incumbent exceptions; do not silently bless them as new system values.
- Current Landing dark host repeats primary tokens; its decorative map locally redefines --primary as oklch(0.84 0.12 120). This is current evidence and deserves consistency review.
- Current map glow/network material conflicts with the documented no atmospheric-glow policy. Treat this as a design-contract inconsistency to resolve in audit, not proof that the identity itself should be replaced.

## Scope discipline

The user wants a page-by-page audit beginning with Landing and explicitly revoked the earlier other-page reference. This extracted system provides incumbent truth for that audit. Any replacement world or implementation remains a separate concrete design decision. Do not modify DESIGN.md, application code, brand mark, navigation labels, public routes, legal copy, or business behavior merely to produce these context files.
