# UX-09 — the price a student was quoted, and the price they are asked for

Branch `feat/ux09-agreed-price-disclosure`, from `c3b347a` (UX-07 + UX-08). Gate 4 (Build) and Gate 5
(E2E/Release) for [UX-09](../../tickets/v1/UX-09.md), batch G on the board. No other ticket was started.

DEC-02 lets a teacher accept a Direct Request at a price of their own choosing. DEC-13 (Option A) says the
student must be able to see the price they were actually looking at when they asked. Until now that price
existed nowhere: Teacher Offerings are edited in place, so by the time a student saw the bill the number
they had been quoted was gone — and checkout labelled the agreed price «السعر المدرج» / "Listed price",
which named a figure that could by then be something else entirely.

## What was built

**The request remembers what it was sent against.** `LearningRequest` gained `ListedPriceAtRequest` and
`ListedCurrencyAtRequest` — one historical fact in two columns, written once by
`CaptureListedPrice(price, currency)`. A second capture is refused (`listed_price_immutable`), as is a
capture on an Open Request (`listed_price_direct_only`, which has an offer, not an offering) and any price
or currency outside the bounds `TeacherService` already enforces. There is no other mutator, so an edit to
the offering, an acceptance at another price, and anything else that happens to the request afterwards all
leave it alone. The constructors are untouched.

**The server reads the price itself.** `OrderService.CreateRequestAsync` captures next to
`CaptureServiceIdentity`, from the offering row it has already read and validated in the same query. The
request body has no price field and never did; a client that invents one changes nothing. This is the only
production path that creates a Direct Request, so every new one carries the snapshot.

**Nothing was backfilled.** The migration adds two nullable columns and a check constraint, and contains no
`UpdateData` and no `Sql(...)`. Requests sent before today have no such history, and manufacturing one from
the offering as it now stands would be inventing it. The constraint is spelled out rather than leaning on a
comparison with NULL — a check constraint only rejects FALSE, and `[ListedPriceAtRequest] > 0` against a
NULL price is UNKNOWN, which would have let a currency without a price through.

**One panel, three screens.** `agreedPrice()` decides the rows and `tf-price-panel` renders them, so the
request detail, the order detail and checkout cannot tell three stories about the same money. When the
agreed price differs the student reads «السعر عند إرسال الطلب» / "Price when you sent the request" and
«السعر بعد مراجعة المعلم لطلبك» / "Price after the teacher reviewed your request", then the fee and the
total; when it does not, the price is stated once. The fee percentage is the one the order recorded, never a
constant the screen knows.

**The comparison appears only when there is something to compare.** Equal prices, a null snapshot, or a
snapshot in another currency all render the plain three rows — no guessed price, no fake comparison, and
nothing that reads as an accusation: a discount is disclosed in exactly the words an increase is.

**Checkout lost the misleading line.** The `pay_context_price` fact is gone from the payment page, and the
request wizard now calls the offering price «السعر» / "Price" — the same word the student meets again later.

**No money moved.** The fee and the total still come from the order, which the server computed from the
agreed price. `ListedPriceAtRequest` is disclosure only: no code path lets it reach an arithmetic, and a
test drives it to 1 and to 999,999 to prove the totals do not move.

## Verification

| Gate | Result |
|------|--------|
| `dotnet restore --locked-mode` · `dotnet format --verify-no-changes` | exit 0 · exit 0 |
| Release build (incl. Angular) | **0 warnings, 0 errors** |
| Architecture / Domain / Application | 1/1 · **129/129** (was 117: + 12 listed-price cases) · 14/14 |
| Integration, provider-neutral | **386/386** |
| Integration, SQL Server | **235/235** (was 229: + 6 listed-price cases) |
| Angular unit tests | **502/502 in 55 files** (was 474 in 52: + 12 price model, + 8 panel, + 3 order page, + 3 payable, + 2 request loading) |
| Contract gate / `--strict` | **214/214/0** · exit 0 — unchanged: UX-09 adds no endpoint |
| `check-js` | pass (123 source files) |
| EF pending model changes | none |
| publish + `validate-publish.ps1` · `deploy-gates.tests.ps1` | pass · **57/57** |
| **UX-09 journey** | **10/10** |
| UX-01 · UX-02 · UX-03 regressions | **8/8** · **9/9** · **9/9** |
| UX-04 · UX-05 regressions | **7/7** · **6/6** |
| Wave 3B direct order · open marketplace | **15/15** · **9/9** |

[Verification summary](./evidence/verification.txt) · [journey logs](./evidence/e2e/) ·
[screenshots](./evidence/e2e/screenshots/).

The journeys ran against the verified publish output in Development on throwaway `TafseelE2EUx09*`
databases seeded by `scripts/dev/E2ESeed`. The databases are only read; every request, offering edit,
acceptance and payment in the journey happens through the product's own screens and endpoints. Three
databases were used because two journeys make incompatible demands on one host — UX-05 needs a reservation
window short enough for the reminder scan to fire (20 minutes) while Wave 3B's open marketplace asserts a
two-hour hold — and because UX-02 asserts a teacher's own totals, which the UX-09 journey's orders would
have changed.

**One SQL Server run failed and was not accepted as a result.** In the first full run
`EarningsMaturityConcurrencyTests.H_withdrawal_is_refused_at_every_point_where_money_is_still_pending`
reported a 409 — and reported it after **4 h 13 m**, in a suite that takes nine to twelve minutes, with
about 4 h 50 m of real time elapsed on the clock. The machine had stalled mid-run, and that test measures
real elapsed time. Re-run alone against the same code it passed 14/14 in 1 m 23 s, and the final full run
passed 235/235 in 11 m 58 s. No UX-09 code reaches withdrawals, payout profiles, earnings maturity or the
ledger.

## What the journey proves

The offering says 100 when the student sends the request; the teacher edits it to 120 and accepts at 150.

1. **The server recorded what the student was looking at** — the request row holds 100 SAR, read back from
   the database, before anyone edits anything.
2. **The edit did not reach it.** After the teacher changes the offering to 120 through their own services
   screen, the offering row says 120 and the request still says 100.
3. **The money is built from the agreed price**: order 150, fee 12, total 162 — 8% of 150, not of 100 and
   not of 120.
4. **The student reads both numbers on all three screens**, in Arabic on a 390px phone: the request after
   acceptance, the order before payment, and checkout, each with «السعر عند إرسال الطلب» 100 and
   «السعر بعد مراجعة المعلم لطلبك» 150 above the fee and «الإجمالي المطلوب» 162.
5. **Paying charges 162**, and afterwards the order still shows what was quoted, with the total no longer
   called something owed.
6. **A second student, sending after the edit and accepted at the same 120, sees no comparison** — «السعر»
   120, fee 9.6, total 129.6 — because there is nothing to compare.
7. **None of the forbidden wording appears** on any of those pages, in either language; every page is
   checked for «زيادة السعر», «السعر المدرج», «رفع السعر», "listed price" and "price increase".
8. **The disclosure is the student's.** The teacher's own order screen carries the agreed price and neither
   the student's fee nor their total; an outsider still gets 404 on the order.
9. **The API tells the same story the screens do** — the request and the order both return 100 beside the
   agreed 150 and the total 162.

[Request](./evidence/e2e/screenshots/ux09-01-request-comparison-ar-phone.png) ·
[checkout](./evidence/e2e/screenshots/ux09-02-checkout-comparison-ar-phone.png) ·
[paid order](./evidence/e2e/screenshots/ux09-03-order-paid-ar-phone.png) ·
[no comparison](./evidence/e2e/screenshots/ux09-04-no-comparison-ar-phone.png).

## Arabic and mobile

At 390px in Arabic the two comparison labels wrap without truncation and stay inside their card; the page
does not scroll horizontally on the request, the order or checkout. Amounts stay in Latin digits with the
house riyal mark, as `Money` requires, while the fee percentage sits inside its Arabic label in
Arabic-Indic digits. Checkout keeps the total as the loudest thing on the screen, and the receipt is padded
to clear the sticky pay bar.

## Defects found

| # | Defect | Where |
|---|--------|-------|
| 1 | The check constraint first read `(both NULL) OR ([ListedPriceAtRequest] > 0 AND [ListedCurrencyAtRequest] IS NOT NULL)`, which let a currency with no price into the table: `NULL > 0` is UNKNOWN and a check constraint rejects only FALSE. Caught by the test written to prove the constraint holds. | Fixed before the migration was committed |
| 2 | My own journey sent its second request from the first student, and the wizard keeps a draft per student — it would have resumed the first request's draft and sent the second against the wrong offering. | Caught in review; the second case now registers its own student |
| 3 | The UX-05 and Wave 3B hosts need different reservation windows (20 minutes for the reminder scan, two hours for the hold the journey asserts); the host script copied from the previous batch set neither. | Fixed in the verification scripts, not in product code |

## Backlog findings (outside this ticket)

| Finding | Evidence |
|---------|----------|
| `ux02-teacher-home` step 8 asserts `/[A-Za-z]{3,}/` never appears on the Arabic home, but the seed embeds its own random 8-hex run id in the catalog names it creates. A run id such as `61fefde3` contains `fefde` and fails the step; `280c4056` and `a65eb641` pass it. The journey is flaky on its own fixture, not on the product — it should ignore the seed's id rather than those letters. | [ux02 log](./evidence/e2e/ux02-teacher-home.log) |
| `PaymentPageComponent.priceLines` is unused (the template reads `payable.lines` directly). Pre-existing dead code, left alone as out of scope. | `payment-page.component.ts` |
| The riyal mark still falls back to the letters `SAR` until its font loads, visible in every screenshot here. | Already recorded for `UX-06` |

## Backend and financial code

`Tafseel.Domain` changed under the protected-code rule with DEC-13's authorization: a failing domain test
first (12 cases, proven failing with CS1061 before the capability existed), then the smallest change that
passes them. No fee rule, order financial snapshot, payment, ledger or payout code was touched, and the
existing financial suites are green.
