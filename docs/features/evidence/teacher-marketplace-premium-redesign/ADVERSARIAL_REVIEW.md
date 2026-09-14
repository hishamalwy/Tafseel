# Adversarial Product / Art-Direction Review

An independent reviewer raised five findings in each required category. The final disposition is below.

## Browse Teachers

1. Fixed — advanced filters collapse on phone widths.
2. Fixed — the same compact pattern now applies through 1180px; the first 1024px card begins at y=613.
3. Fixed — a lone result spans the results canvas.
4. Fixed — the narrow search placeholder uses clean ellipsis behavior.
5. Fixed — discovery-stage spacing was tightened and the actionable result enters the initial tablet viewport.

## Teacher Cards

1. Fixed — teacher names localize at render time, keeping Browse/Profile parity after a language change.
2. Fixed — amount, currency, and unit use isolated bidi runs.
3. Fixed — zero rating now reads truthfully as “No public reviews yet.”
4. Fixed — long service titles clamp to two visual lines while retaining the full accessible text.
5. Fixed — compare has stronger contrast, focus-within treatment, checked color, and a 44px row.

## Teacher Profile

1. Fixed — media failure provides Retry and, when another sample exists, an alternate-sample action.
2. Fixed — the mobile breadcrumb truncates as isolated units and removes the redundant Home crumb.
3. Fixed — settled empty/error media states use a video-off icon rather than a spinner-like circle.
4. Fixed — 641–900px uses an inline conversion summary with price, fulfillment, protection, and CTA.
5. Fixed — the duplicate identity Message action is hidden when the conversion rail is present and restored when the rail collapses.

## Services

1. Fixed — service names/descriptions use the same locale resolver in rows, rail, and sticky CTA.
2. Fixed — live services without configured availability are natively disabled and labeled Unavailable.
3. Fixed — every service has an explicit On-demand or Live text badge; color is no longer the only distinction.
4. Fixed — live service metadata shows availability state instead of misleading same-day delivery.
5. Fixed — service selection controls meet the 44px target floor.

## Reviews

1. Accepted limitation — populated reviews were not fabricated; the clean fixture truthfully verifies zero reviews.
2. Fixed — copy now covers an order or session rather than assuming a lesson.
3. Fixed — mobile review spacing accounts for the persistent CTA and safe-area clearance.
4. Fixed — dark empty-state copy and border contrast were increased.
5. Fixed — the empty-state icon now uses the marketplace’s star/review language.

## Re-review recommendation

Ship. All material hierarchy, localization, state, and accessibility findings were corrected. The only open item is populated-review visual evidence, intentionally withheld to comply with the no-fabrication requirement.
