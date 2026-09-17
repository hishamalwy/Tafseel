# UX-07 and UX-08 — hiding what V1 cannot deliver

Branch `feat/ux07-ux08-hide-unusable`, from `02a0092` (UX-03). Gate 4 (Build) and Gate 5 (E2E/Release) for
[UX-07](../../tickets/v1/UX-07.md) and [UX-08](../../tickets/v1/UX-08.md), batch F on the board. No other
ticket was started.

Both tickets answer the same rule ([UX_PRINCIPLES §2](../../product/UX_PRINCIPLES.md#2-rules),
PRODUCTION_READINESS U10): **V1 never offers a capability the person cannot use.** One hides a coupon that
cannot be redeemed; the other hides a button that is guaranteed to fail.

## UX-07 — promo codes

The landing page opened an entry dialog carrying a promotion's `couponCode` under «استخدم الكود» with a copy
button, and the Development seed publishes a 20%-off campaign with code `TAFSEEL20`. V1 checkout has no
coupon field (`DEC-09`, `B11-08`), so both the code and the discount itself were promises Tafseel could not
keep.

- **`V1_PROMOTIONS.showable`** (`features/landing/models/promotion.ts`) drops `Discount` campaigns before the
  landing picks the one to open, so a discount is never the campaign a visitor meets. `Campaigns.primary`
  reads through it.
- **The dialog renders no code.** The code block and its copy button are gone from
  `promo-wizard.component.html`; `code()` and `copyCode()` stay, unrendered, for when redemption ships, and
  the `promoCodeLabel`/`promoCopy` keys stay with them.
- **Nothing else changed.** Non-discount campaigns (Feature, Announcement, Spotlight, Event) open exactly as
  before, with their eyebrow, title, body, highlight, countdown and CTA. Checkout was already free of any
  coupon affordance and is untouched, as is every server coupon and promotion capability.

**No financial code was touched.** Discount allocation, payment totals, fees and the ledger are exactly as
they were; the journey pays a real order and asserts the amount charged is the one the server calculated.

## UX-08 — the AI writing helper

The direct-request wizard always showed «ساعدني في الكتابة». With `Ai:Enabled=false` — the default outside
Development — pressing it called the assistant, which answered `Disabled`, and the page said «المساعد غير
متاح حاليًا.» A dead control, and one that spent the student's AI rate-limit budget to discover it.

- **`GET /api/v1/ai/capabilities`** → `{ "requestAssistant": boolean }`. Policy `StudentsCreateRequests`, the
  same as the assistant; `[DisableRateLimiting]`, so asking whether a button should exist never spends the
  budget for using it. It mirrors the existing `payments/mock/capabilities` pattern.
- **The server is the authority.** `requestAssistant` is `IAiProvider.IsAvailable` — for the real provider,
  exactly the condition its constructor already applies: switched on **and** holding credentials. The client
  infers nothing from its environment.
- **The answer says only that.** One boolean; no provider, model, endpoint, key, timeout or diagnostic — held
  by an integration test that greps the response body for each of them.
- **Hidden means hidden.** `AssistWithBrief.isAvailable()` asks once per application load and caches the
  answer; the wizard renders the button and the draft panel only when it is true. A refusal, an outage or a
  timeout resolves to false, so the helper is never shown and then taken away, and no AI request is made.

## Verification

| Gate | Result |
|------|--------|
| `dotnet restore --locked-mode` · `dotnet format --verify-no-changes` | exit 0 · exit 0 |
| Release build (incl. Angular) | **0 warnings, 0 errors** |
| Architecture / Domain / Application | 1/1 · 117/117 · 14/14 |
| Integration, provider-neutral | **386/386** (was 382: + 4 provider-availability cases) |
| Integration, SQL Server | **229/229** (was 225: + 4 capability endpoint tests) |
| Angular unit tests | **474/474 in 52 files** (was 461 in 50: + 2 promotion model, + 4 promo dialog, + 2 gateway, + 5 wizard) |
| Contract gate / `--strict` | **214/214/0** · exit 0 (was 213: the one new read, with its route in the committed endpoint snapshot) |
| `check-js` · `check:i18n` | pass · **1,104 keys** in en/ar |
| EF pending model changes | none |
| publish + `validate-publish.ps1` · `deploy-gates.tests.ps1` | pass · 57/57 |
| Route probe (asserting) | **64/64** |
| **UX-07 + UX-08 journey** | **7/7** |
| UX-01 regression | **8/8** |
| UX-03 regression | **9/9** |
| Wave 3B direct order | **15/15** |
| Wave 3B open marketplace | **9/9** |

[Verification summary](./evidence/verification.txt) · [route probe](./evidence/runtime-route-probe.txt) ·
[screenshots](./evidence/e2e/screenshots/).

The journey ran against the verified publish output in Development on the throwaway `TafseelE2EUx0708`
database, seeded by `scripts/dev/E2ESeed`, with the host's default configuration — which is AI disabled, the
state V1 ships in. The database is only read; the two campaigns the journey needs are published through the
admin API, the way an admin publishes one.

## What the journey proves

1. **A real coupon is published and never reaches the visitor.** The journey publishes a `Discount` campaign
   carrying a code and an `Announcement` beside it, confirms `GET /promotions` really is serving 4 codes, then
   opens the Arabic landing at 390px: the announcement is what opens, the discount never does, no code appears
   anywhere on the page, and there is no «استخدم الكود» or copy button. The dialog that remains is whole — body
   and call to action both present, no gap where the code block was.
2. **Checkout offers no code and charges the server's amount.** No coupon input, no Apply button, no promo
   language; the total shown is the order's `studentTotal` read back from the API, and paying it in the mock
   simulator still works.
3. **The capability is still on the server** — `/promotions` answers and the admin coupon API still exists.
4. **With AI disabled the wizard has no helper.** No button, no draft panel, no "unavailable" message, no
   "coming soon" — and the only AI request the page makes is the single capability read.
5. **The endpoint answers the student and no one else**: one field, nothing about how AI is provided, and a
   teacher is refused (403).
6. **The wizard still works with the helper gone**, through to the delivery step, making no AI request.

[Landing](./evidence/e2e/screenshots/ux07-landing-ar.png) ·
[checkout](./evidence/e2e/screenshots/ux07-checkout-ar.png) ·
[request wizard](./evidence/e2e/screenshots/ux08-wizard-ar.png).

## Arabic and mobile

At 390px in Arabic: the promo dialog, checkout and the wizard's goal step all render without horizontal
scroll, and removing the code block and the helper button leaves no empty card, heading or action row — the
specs assert that every remaining field still carries content, and the journey asserts it on the rendered
page.

## Defects found

| # | Defect | Where |
|---|--------|-------|
| 1 | The account menu's sign-out use case was resolved eagerly, so a spec rendering the wizard had to provide the session gateway. | Fixed in UX-03; noted here because this batch's specs exercised it |
| 2 | The wizard's capability promise was unguarded: a rejection would have surfaced as an unhandled rejection rather than a hidden button. The component now fails closed on its own. | Found while writing the spec; fixed here |

## Backlog findings (outside this batch)

| Finding | Evidence |
|---------|----------|
| The request wizard's optional prompt fields render their raw keys as labels (`whatYouTried`, `whereStuck` — English in an Arabic page) and the literal string `undefined` as their value, because `req_prompt_*` keys do not exist and `prompts()[key]` is undefined. Pre-existing since `b85371b`, unrelated to either ticket and not required by their acceptance criteria. | [wizard screenshot](./evidence/e2e/screenshots/ux08-wizard-ar.png) |
| The riyal mark falls back to the letters `SAR` until its font loads (shared `tf-price`), and the teacher services screen shows price ranges in Latin digits. | Recorded for `UX-06` in the UX-02 and UX-03 audits |

## Backend and financial code

UX-07 changed **no** backend file. UX-08 added one read endpoint and the property behind it:
`AiMarketplaceController.Capabilities`, `AiCapabilitiesDto`, `IAiMarketplaceAssistant.GetCapabilities`,
`IAiProvider.IsAvailable` and `GroqAiProvider.IsAvailable` (`_client is not null`). No AI endpoint's
authorization changed, no rate limit was weakened, and no financial, ledger, discount or payment code was
touched anywhere in this batch.

## Commits

| Commit | What |
|--------|------|
| `4d13f4b` | UX-07: discount campaigns filtered out, the dialog's code block removed, model and dialog specs |
| `5f738fd` | UX-08: the capability endpoint, the provider property, the cached client read, the hidden helper, and their specs |
| `3a6933f` | The browser journey and the endpoint snapshot |
| `this commit` | This report and the ticket, board, blocker and readiness updates |

## Blocker count

**38 → 36.** Both tickets are Done; none was added.

## Not done here

`UX-06`, `UX-09`, `FIN-02`…`FIN-07`, `PROD-01` and every provider, infrastructure, tax and hosting ticket
were not started. Coupon redemption, the coupon and promotion editors, and enabling AI in any environment
remain `B11-08`, `B11-12` and `B11-11`.
