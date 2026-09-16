# FIN-01 — Teacher earnings

Branch `feat/fin01-teacher-earnings`, from `23db8d7` (batch A). Gate 4 (Build) and Gate 5 (E2E/Release) for
[FIN-01](../../tickets/v1/FIN-01.md). No other ticket was started: `FIN-02` (payout details) and `FIN-03`
(requesting a withdrawal) are untouched, and nothing on the screen pretends otherwise.

## What a teacher sees now

Earnings was the generic dashboard over `/withdrawals/balances` and the business analytics: the raw field
names `available`, `pendingWithdrawal`, `pendingClearance` and `nextClearanceAt` beside performance
counters, a second tab of withdrawal rows, a search box and a Refresh button (matrix J12-01). It is now its
own screen at `/teacher/earnings`, in the order a teacher asks:

| # | Card | Arabic / English | What it says |
|---|------|------------------|--------------|
| 1 | Available to withdraw | «متاح للسحب» | The authoritative available balance, and — only when there is something to withdraw — the minimum from `GET /withdrawals/policy`: «يمكنك طلب سحب هذا المبلغ. الحد الأدنى للسحب 50 ⃁» or, under it, «تحتاج إلى 50 ⃁ على الأقل لطلب سحب.» |
| 2 | Clearing | «قيد الإتاحة» | The amount, then «يصبح متاحًا للسحب بعد انتهاء فترة الاعتراض.» and «أقرب مبلغ يصبح متاحًا في {date}» — or «يصبح متاحًا قريبًا» when the date has passed but the scan has not run, never a date in the past |
| 3 | Being transferred | «قيد التحويل» | Only when a withdrawal is actually in flight, with «يصل عادةً خلال 3 أيام عمل» |
| 4 | Why isn't it available straight away? | «لماذا لا يُتاح المبلغ فورًا؟» | A collapsed paragraph explaining the seven-day objection period in plain words |

Read-only by design: there is no withdraw button, because `FIN-03` does not exist yet and a button that
cannot work is worse than none. The withdrawals tab that implied one is gone. Nothing on the screen says
ledger, escrow, maturity, account or a DTO field name; amounts are drawn by the shared `tf-price`, so the
Arabic sentence carries the riyal mark rather than a Latin currency code.

**States.** Loading shows skeletons and claims no balance. A teacher with no completed work gets
«لا توجد أرباح بعد» with "Browse open requests", not empty money cards. A failed balances read says
«تعذّر تحميل أرباحك.» with a retry — it never becomes `0 SAR`; a failed policy read only drops the two
sentences it feeds and leaves the amounts on screen.

**Structure for UX-02.** `features/earnings/models/earnings.ts` is a pure function over the two reads, and
`LoadEarnings` composes them. The Teacher Home summary can consume the same authoritative model instead of
recomputing money in a second component. No home API was added.

## Data

Only the two contracts FIN-01 recorded: `GET /api/v1/withdrawals/balances` and `GET /api/v1/withdrawals/policy`.
No earnings-history API was invented — there is no JSON contract for one today, and the CSV statement and the
business analytics are `B11-09`. Server authorization is unchanged; the client role guard is convenience only.

## Verification

| Gate | Result |
|------|--------|
| `dotnet restore --locked-mode` · `dotnet format --verify-no-changes` | exit 0 · exit 0 |
| Release build (incl. Angular) | **0 warnings, 0 errors** |
| Architecture / Domain / Application | 1/1 · 117/117 · 14/14 |
| Integration, provider-neutral | **375/375** (was 374: the earnings empty state adds a client navigation the route scan checks) |
| Integration, SQL Server | **225/225** (was 224: + `Balances_tell_the_teacher_when_the_clearing_amount_becomes_available`) |
| Angular unit tests | **369/369 in 41 files** (was 353 in 39) |
| Contract gate / `--strict` | **215/215/0** · exit 0 (was 217 call shapes: the retired withdrawals tab stopped calling `/withdrawals/mine`, `/withdrawals/profile` and the analytics endpoint; no endpoint changed) |
| `check-js` · `check:i18n` | pass · **1,067 keys** in en/ar |
| EF pending model changes | none |
| publish + `validate-publish.ps1` · `deploy-gates.tests.ps1` | pass · 57/57 |
| Route probe (asserting) | **64/64** (adds `/ar/teacher/earnings`) |
| **FIN-01 journey** `fin01-teacher-earnings` | **7/7** |
| UX-04 regression | **7/7** |
| UX-05 regression | **6/6** |
| Wave 3B direct order | **15/15** |

[Verification summary](./evidence/verification.txt) · [route probe](./evidence/runtime-route-probe.txt) ·
[journey logs and screenshots](./evidence/e2e/).

Every journey ran against the verified publish output in Development on the throwaway `TafseelE2EFin01`
database seeded by `scripts/dev/E2ESeed`; the journeys only read the database. The UX-05 rerun used
`OpenMarketplace__OfferReservationMinutes=20` as its own journey documents; everything else used the default.

## What the journey proves

`fin01-teacher-earnings` creates the balance the way a teacher really earns one — a student requests, pays in
the mock simulator, the teacher starts and delivers, the student completes — and then:

1. the server records the teacher's net as **clearing**, with the maturity date, and nothing available;
2. the teacher's Arabic phone screen shows that amount under «قيد الإتاحة», with why it is held and the date;
3. «متاح للسحب» does **not** claim the earned amount;
4. there is no withdrawal control and no ledger, escrow, maturity or account word — and no English product
   word at all on the Arabic screen;
5. a teacher who has finished no work sees the empty state;
6. a student is refused the balances by API (403; anonymous 401) and by route.

[Arabic phone screenshot](./evidence/e2e/screenshots/fin01-earnings-ar.png) ·
[empty state](./evidence/e2e/screenshots/fin01-earnings-empty-en.png).

## Defects found

| # | Defect | Where |
|---|--------|-------|
| 1 | The minimum-withdrawal sentence interpolated the amount as text, so an Arabic sentence carried the Latin code `50 SAR`. The amount is now drawn by the shared `tf-price`. | fixed here |
| 2 | With `available = 0` the page still said "You can request a withdrawal of this amount". The sentence now appears only when there is something to withdraw. | fixed here (found in the first journey screenshot) |
| 3 | A token minted after advancing the test clock is rejected as not-yet-valid, which reads as 401 instead of the 403 the authorization actually returns. Test-only; the client is now created before the clock jump. | fixed here |

No protected financial code was changed: `FinancialService`, the ledger, escrow, the maturity worker,
idempotency, reconciliation and the migrations are untouched. The only backend change is a new test.

## Commits

| Commit | What |
|--------|------|
| `509745d` | The earnings model, gateway, use case, page and route; the dashboard section reduced to the screen; locale keys; the balances integration test |
| `b88bed6` | The FIN-01 browser journey, the UX-04 sweep update and the route probe |
| `DOCS_COMMIT` | This report and the ticket, board, blocker and readiness updates |

## Blocker count

**42 → 41.** FIN-01 is Done; no ticket was added. Recalculated by the blocker-count validation over
[`V1_RELEASE_BLOCKERS.md`](../../releases/V1_RELEASE_BLOCKERS.md).

## Not done here

`FIN-02`, `FIN-03`, `FIN-04`, `FIN-05`, `UX-01`, `UX-02`, `UX-03`, `UX-06`…`UX-09` and every provider,
infrastructure, tax and hosting ticket were not started.
