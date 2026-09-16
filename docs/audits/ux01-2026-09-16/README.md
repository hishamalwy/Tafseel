# UX-01 — Student home: action first

Branch `feat/ux01-student-home`, from `0d5075f` (FIN-01). Gate 4 (Build) and Gate 5 (E2E/Release) for
[UX-01](../../tickets/v1/UX-01.md), batch C on the board. No other ticket was started: `UX-02` (teacher
home) and `UX-03` (navigation, the bell and the merged lists) are untouched, and every route the home links
to already existed.

## What a student sees now

`/student/overview` was the generic dashboard over four sources — `/learning-requests/mine`, `/orders/mine`,
`/live-sessions/mine` and `/notifications?pageSize=100` — merged into one grid of up to ~250 identical cards
with numeric statuses, a search box and a Refresh button, in no particular order (UX_PRINCIPLES §6.2). It is
now a screen that answers four questions, in this order:

| # | Section | Arabic / English | What it holds |
|---|---------|------------------|---------------|
| 1 | Needs your attention | «يحتاج انتباهك» | At most three things only the student can move — A1…A12 from the ticket, ordered by urgency. The first card's CTA is the only filled button on the page; the rest are outline |
| 2 | In progress | «قيد التنفيذ» | At most three items waiting on someone else, each wearing its product status from `UX-04`, then "See all my requests" |
| 3 | Your next session | «جلستك القادمة» | The nearest confirmed session more than 15 minutes away: teacher, when, and «تبدأ خلال ٣ ساعات» |
| 4 | Start something new | «ابدأ طلبًا جديدًا» | Find a teacher → `/teachers`; Post a request → `/requests/new` |

A student with no requests, orders or sessions sees «أهلًا {firstName}، كيف نساعدك اليوم؟» and the two ways
to start — no empty section headings, and not "nothing needs your attention", which is cold comfort to
someone who has never had anything.

The home acts on nothing. Every card links to the item's own screen, which owns the business action and the
server's rules; the only button on the page is retry.

## How the decision is made

`features/student-home/models/student-home.ts` is a pure function: the three lists, the viewer, the clock and
a formatter in, the composed home out. It re-derives no domain rule — it reads the states the server already
decided and ranks them A1 (a session happening now) to A12 (a review worth writing), keeps one card per item
(an order hides the request it came from, by `learningRequestId`), caps each list at three with a "see all"
link, and picks the nearest upcoming session. Being pure and given its formatter, its specs assert the
Arabic and English sentences that ship rather than a mock's.

`LoadStudentHome` reads the three lists at once and is explicit about partial failure: a list that failed is
not a list that is empty. If one fails the rest still render under an inline notice and "nothing needs your
attention" is suppressed; only when all three fail does the page show its own sentence and a retry — never a
server exception. A payment hold counts down in the page and, at zero, the card goes and the lists are read
again; the page only recomposes every second while something is actually counting down.

This is deliberately not a shared dashboard abstraction: `UX-02` will compose the teacher's home from the
teacher's own questions, as FIN-01's earnings model already does for money.

## Data

No home endpoint, as the ticket's endpoint audit concluded: the three existing lists carry every field the
classification needs (`?page=1&pageSize=50`, newest first). No API, DTO, migration or backend file changed in
this branch — the contract gate sees three more client call shapes, all matching routes that already exist.

## Verification

| Gate | Result |
|------|--------|
| `dotnet restore --locked-mode` · `dotnet format --verify-no-changes` | exit 0 · exit 0 |
| Release build (incl. Angular) | **0 warnings, 0 errors** |
| Architecture / Domain / Application | 1/1 · 117/117 · 14/14 |
| Integration, provider-neutral | **378/378** (was 375: the route scan sees the home's three new static links) |
| Integration, SQL Server | **225/225** (unchanged; UX-01 adds no backend test because it adds no backend behaviour) |
| Angular unit tests | **389/389 in 43 files** (was 369 in 41: + 12 classifier, + 8 page) |
| Contract gate / `--strict` | **218/218/0** · exit 0 (was 215 shapes: the three list reads the home makes) |
| `check-js` · `check:i18n` | pass · **1,083 keys** in en/ar |
| EF pending model changes | none |
| publish + `validate-publish.ps1` · `deploy-gates.tests.ps1` | pass · 57/57 |
| Route probe (asserting) | **64/64** (`/student/overview` already existed; it is now its own screen) |
| **UX-01 journey** `ux01-student-home` | **8/8** |
| UX-04 regression | **7/7** |
| UX-05 regression | **6/6** |
| FIN-01 regression | **7/7** |
| Wave 3B direct order | **15/15** |
| Wave 3B open marketplace | **9/9** |

[Verification summary](./evidence/verification.txt) · [route probe](./evidence/runtime-route-probe.txt) ·
[screenshots](./evidence/e2e/screenshots/).

Every journey ran against the verified publish output in Development, on throwaway databases seeded by
`scripts/dev/E2ESeed` (`TafseelE2EUx01` for UX-01, UX-04, Wave 3B direct and Wave 3B open marketplace;
`TafseelE2EUx01B`, started with `OpenMarketplace__OfferReservationMinutes=20`, for UX-05 and FIN-01). The
journeys only read the database.

## What the journey proves

`ux01-student-home` builds every state through the product's own flows — no SQL was written — with an Arabic
student on a 390×844 phone:

1. a brand-new student gets the welcome and both ways to start, with no grid, no search box, no Refresh, no
   id, no `null` and no English word anywhere on the page; the welcome and both start cards are above the
   fold and each is a ≥ 44px target;
2. the two start cards open `/ar/teachers` and `/ar/requests/new`;
3. a request the teacher has not answered sits under «قيد التنفيذ» as «بانتظار المعلم» and opens the request
   itself — while «لا يوجد ما يحتاج انتباهك الآن.» says nothing is waiting on the student;
4. the moment the teacher accepts, «المعلم قبل طلبك — أكمل الدفع» is the first thing on the home, the only
   filled button, with the amount the student actually pays (the total with the platform fee, read back from
   the order) and a link to that order's checkout — and the request is not repeated as a second copy;
5. after paying in the mock simulator the same work reads «تم الدفع» under «قيد التنفيذ» and asks for
   nothing;
6. a booked and paid session becomes «جلستك القادمة» — «مؤكدة», when it starts in words, and its own screen
   one tap away — without becoming an outstanding task;
7. the whole home carries no id, no raw field, no numeric badge and no English product word; every link is a
   44px target; nothing scrolls sideways; and a teacher who opens `/student/overview` is sent to their own
   home.

[New student](./evidence/e2e/screenshots/ux01-home-new-student-ar.png) ·
[payment waiting](./evidence/e2e/screenshots/ux01-home-action-required-ar.png) ·
[the full home](./evidence/e2e/screenshots/ux01-home-full-ar.png).

## Decisions and deviations

| # | What | Why |
|---|------|-----|
| 1 | The amount on a payment card is its own line — the label «المبلغ» plus the shared `tf-price` — rather than the ticket's single sentence «المبلغ {studentTotal}» | `Money.format` writes the Latin code (`194.4 SAR`), which inside an Arabic sentence is the one English phrase on the screen. Same remedy as FIN-01 defect 1. The payment card also names the work and the teacher, so a student with two accepted orders can tell them apart |
| 2 | A paid order reads «تم الدفع», not UX-01's «تم الدفع — بانتظار بدء المعلم» | The two tickets disagree; `UX-04` owns the status vocabulary and UX-01 defers to it ("Status words and CTA verbs come from `UX-04`") |
| 3 | «تبدأ خلال ٣ ساعات» is computed in the page, not by `FormatService.relative` | That helper only looks backwards ("2 hours ago") and hands a future moment to a plain date, which would have repeated the date already on the card. The helper is untouched; the four lines live in the home |
| 4 | The gateway spells each URL out instead of sharing a `page(path)` helper | The contract gate resolves literal URLs only; the helper made all three reads `UNRESOLVED_CALL` (caught by the gate, fixed before commit) |

**Observation, not changed here:** the SAMA riyal mark falls back to the letters `SAR` until the
`saudi_riyal` font is confirmed loaded (`html.tf-riyal-font-ok`, `src/generated/tafseel.css`), so the
screenshots show "SAR 194.4". That is the shared `tf-price` behaviour on every screen that shows money —
FIN-01's own released evidence shows the same — and belongs to `UX-06`, not to this ticket.

No protected financial code was changed: `FinancialService`, the ledger, escrow, the maturity worker,
idempotency, reconciliation and the migrations are untouched. This branch contains no backend change at all.

## Commits

| Commit | What |
|--------|------|
| `e7736fa` | The student home: classifier, ports, gateway, use case, page and route; the overview dashboard section emptied; locale keys; the unit and page specs |
| `33e1f51` | The UX-01 browser journey, and the UX-04 sweep no longer auditing Home as a dashboard section |
| `this commit` | This report and the ticket, board, blocker and readiness updates |

## Blocker count

**41 → 40.** UX-01 is Done; no ticket was added. Recalculated by the blocker-count validation over
[`V1_RELEASE_BLOCKERS.md`](../../releases/V1_RELEASE_BLOCKERS.md).

## Not done here

`UX-02`, `UX-03`, `UX-06`…`UX-09`, `FIN-02`…`FIN-07`, `PROD-01` and every provider, infrastructure, tax and
hosting ticket were not started. The Student navigation still lists the old sections — renaming and reducing
it to five items is `UX-03`, which this ticket unblocks.
