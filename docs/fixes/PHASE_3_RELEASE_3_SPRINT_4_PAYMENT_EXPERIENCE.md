# Phase 3 Release 3 Sprint 4 — Payment Experience & Consumer Confidence

Date: 2026-08-02  
Scope: Student Payment + Mock Checkout only — product/UX/conversion/trust audit and frontend confidence fixes. No payment math, settlement, wallet, webhook, pricing, or marketplace-governance changes. No commit / push / deploy.

Evidence: [phase3-r3-sprint4-payment](./evidence/phase3-r3-sprint4-payment/)

## Summary

Payment was a thin checkout strip after a strong Request Wizard: weak teacher/service continuity, English-hardcoded strings, a noisy unused coupon surface, emoji trust glyphs, and a mock path that could strand Students when a payment had already been initiated under a different idempotency key. This sprint turns Payment into a **purchase continuation** of the Request Wizard — same commercial context language, honest mock labeling, recoverable resume, and non-dead-end success/failure — without changing the Teacher-accept → Order → Student-pays → Teacher-starts lifecycle.

## Product findings

1. **Context loss (critical).** Payment showed order title + fee lines but dropped teacher avatar/name, qualification badge, category, agreed delivery, revisions, uploaded files, and request reference after Wizard/Profile.
2. **Coupon ghost UI.** A “discount unavailable” block implied promotions that Governance / ADR-005 do not surface on this path — hesitation without value.
3. **Idempotency stranding (conversion).** Frontend used `payment-order-{id}` while existing initiations (and integration tests) use `payment-{id}`. Re-clicking Pay threw `payment_already_initiated` with no resume path — abandonment.
4. **Mock honesty gap.** Method row did not clearly say Development/Staging simulator vs live card collection.
5. **Success dead-end risk.** Intermediate “payment started” and mock success needed explicit next steps (teacher can start, track orders, notifications) without claiming local paid status.

## UX findings

1. Mobile lacked a sticky total + Pay CTA; desktop summary CTA was easy to lose below the fold on long context.
2. Trust used emoji (🛡) inconsistently with Request/Profile SVG language.
3. Mock checkout lacked commercial rail and cancel/retry clarity after failure.
4. Loading state is intentionally minimal (no commercial rail) — short-lived; acceptable if enrichment stays fast.
5. English plural polish remains approximate (`1 free revisions`) — shared Profile/Request string, not invented here.

## Conversion findings

| Question | Before | After |
|---|---|---|
| What am I paying for? | Order title only | Context rail: service + category + files |
| Who receives the work? | Easy to lose | Avatar + teacher name + qualified badge |
| How much? | Fee lines present | Listed price + platform fee + total unchanged |
| What happens after pay? | Thin | After-pay note + success next steps |
| When does Teacher start? | Unclear | Explicit: after payment confirmation |
| Protections? | Weak / emoji | Held-until-approve copy + SVG shield |

## Trust findings

Verified against ADR-005 / F-002:

- **Qualified on Tafseel** only when `trustBadges` includes `qualified_on_tafseel` (no fabricated badges).
- **Protected payment / held securely** uses existing hold-until-approve language — no refund SLA, no response-time guarantee, no success-rate or popularity claims.
- **Mock** labeled as Development/Staging simulator; copy states confirmation only via signed webhook path.
- **References** show short order / request IDs for support continuity — not as fake tracking numbers.
- Coupon / discount inventing removed from this surface.

## Product recommendations

Respecting ADR-005, F-002, existing payment flow and business rules:

1. **Keep mock resume discovery** (GET simulator session) — do not invent a public “pending payment URL” API in this release; deterministic Mock refs are Staging-only.
2. **Next sprint candidate:** Student Order Timeline / post-pay tracking polish so success CTAs land on a richer progress surface (still no invented KPIs).
3. **Pluralization helper** for `1 free revision` / AR file counts — extract once shared with Profile/Request.
4. **Do not reintroduce coupons** on Student Payment until a governed, fee-honest promotion product exists.
5. **Real PSP adapter** remains the Production cutover blocker (F-003) — UI must keep webhook-confirmation honesty when that lands.

## Root cause

Payment was built as a **financial initiation form** after Order creation, not as the last conversion screen of a marketplace purchase. Commercial facts lived on Profile/Request and were dropped at the Payment boundary. A later key rename (`payment-order-*`) broke idempotent resume against existing rows. Mock success then under-explained lifecycle without fabricating paid state locally.

## Implementation

Frontend-only (presentation + resume UX):

- **`Tafseel-Payment.dc.html`** — commercial context rail (teacher, badge, service, category, price, delivery, revisions, files, refs, protection, after-pay); honest mock method; removed coupon UI; mobile sticky CTA; initiated success next-steps; idempotency key aligned to `payment-{id}`; resume on `payment_already_initiated` when mock; gated “Continue to checkout” only when mock session exists.
- **`Tafseel-Mock-Checkout.dc.html`** — order commercial context when `orderId` present; cancel → Payment; failure retry + back; confirmed success next-steps + dual CTAs; auto-return preserved.
- **`css/tafseel.css`** — `.tf-pay-*` layout, sticky context ≥960px, mobile CTA ≤959px with safe-area, reduced-motion.
- **`js/locales.js`** — EN/AR pay/mock context, method honesty, next steps, resume / already-initiated copy.

No backend, schema, pricing, settlement, wallet, or webhook changes.

## Browser validation

Host: `http://127.0.0.1:5090` (Release API, `TafseelLocalDb`), student `student@gmail.com`, orders `3f011f19-…` (pending initiation resume) and `b12a719d-…` (fail → succeed).

| Case | Result |
|---|---|
| AR dark 1440 — Payment | Context rail + fees SAR 100 / 8 / 108; mock method; overflow OK |
| EN light 1440 / 768 / 375 | LTR context; sticky mobile CTA @375/768; no horizontal overflow @375 |
| Pay → Mock redirect | Idempotent resume returns `/app/Tafseel-Mock-Checkout.dc.html?ref=mock_…` |
| Mock fail → retry UI | Status failed attempt; not marked paid; succeed still available |
| Mock succeed | Confirmed via webhook path copy; 4 next steps; Go to my orders; auto-return (DOM-verified before redirect; auto-return lands on Student dashboard) |
| Cancel | Returns to `Tafseel-Payment.dc.html?orderId=…` unpaid |
| Continue to checkout | Shown only when mock simulator session exists |
| Console | No payment-page errors observed on validated states |

Evidence: `pay-ar-dark-1440.png`, `pay-en-light-1440.png`, `pay-en-light-375.png`, `pay-en-light-768.png`, `mock-ar-dark-desktop.png`, `mock-fail-ar-dark.png`.

## Tests

| Gate | Result |
|---|---|
| `dotnet build … -c Release` | Passed (0 errors / 0 warnings on Api build) |
| `check-localization.mjs` | Passed — 2,864 paired keys |
| `check-localization-usage.mjs` | Passed |
| `check-frontend-integrity.mjs` | Passed — 13 entry points |
| `check-js.mjs` | Passed |
| `check-bug001-display-names.mjs` | Passed |
| `check-guided-request.mjs` | Passed (consumer regression neighbor) |
| Payment math / webhook / settlement suites | Not re-run (no backend payment changes) |

## Files changed

- `Tafseel-Payment.dc.html`
- `Tafseel-Mock-Checkout.dc.html`
- `css/tafseel.css`
- `js/locales.js`
- `docs/fixes/PHASE_3_RELEASE_3_SPRINT_4_PAYMENT_EXPERIENCE.md`
- `docs/fixes/evidence/phase3-r3-sprint4-payment/*`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

## Remaining limitations

1. Full 1024/1280 dark×AR matrix screenshots not every combination — sampled AR dark desktop + EN light 375/768/1440; layout CSS is shared.
2. Keyboard deep tab-order audit not instrumented beyond focusable CTAs present in a11y snapshots.
3. Duplicate desktop+mobile Pay buttons exist by design below 960px (summary CTA hidden; sticky shown) — same `onPay` handler.
4. Live-session payment path shares enrichment patterns but was not re-driven with a fresh live booking fixture this sprint.
5. Real PSP UX still pending F-003 — mock honesty must remain until then.

## Risks

Low–medium. Presentation-only except deterministic Mock resume URL construction (Staging/Dev Mock provider contract already `mock_{guid:N}`). Wrong resume if a non-Mock provider were enabled while UI still offered mock continue — gated by `/payments/mock/capabilities` + simulator GET. Reverting locales restores thinner copy.

## Next step

**Sprint 5 candidate (Release 3 close-out):** Student Order Timeline / post-payment confidence — progress clarity, delivery/revision expectations, notification honesty — still without inventing KPIs or changing settlement.

Roadmap: Phase 3 Release 3 consumer surfaces — Browse ✓, Profile ✓, Request ✓, Payment ✓; Timeline/Reviews remain for Release 3/4 close-out.

## Final verdict

**PAYMENT EXPERIENCE & CONSUMER CONFIDENCE CONDITIONALLY VERIFIED.** Commercial context continuity, honest mock checkout, recoverable resume, and non-dead-end success/failure are browser-proven on authenticated Development data without changing payment calculations or lifecycle rules. Conditional for remaining viewport/language screenshot pairs and live-session payment re-drive.
