# UX-02 — Teacher home: action first

Branch `feat/ux02-teacher-home`, from `0c51867` (UX-01). Gate 4 (Build) and Gate 5 (E2E/Release) for
[UX-02](../../tickets/v1/UX-02.md), batch D on the board. No other ticket was started: `UX-03` (navigation,
the bell and the merged Work list) is untouched, and every route the home links to already existed.

## What a teacher sees now

`/teacher/home` was the generic dashboard over a counters endpoint, a raw balances object and up to a hundred
notifications — the same grid whether the teacher had a paid order to start or nothing at all, and with no
word about what was stopping students finding them (UX_PRINCIPLES §6.3). It now answers five questions, in
this order:

| # | Section | Arabic / English | What it holds |
|---|---------|------------------|---------------|
| 0 | Setup | the blocker's own title | The **first** blocking reason the server gave, with one sentence, one button and the screen that fixes it, plus «خطوات متبقية: {n}». While it is there it owns the only filled button on the page |
| 1 | Needs your attention | «يحتاج انتباهك» | At most three things only the teacher can move — T1–T9 from the ticket, ordered by urgency; requests oldest first, because students asked in that order |
| 2 | Open requests for you | «طلبات مفتوحة تناسبك» | The three soonest open requests this teacher has not offered on, with «عرض الكل ({n})». Shown only to a teacher students can already find |
| 3 | Your next session | «جلستك القادمة» | The nearest confirmed session more than 15 minutes away |
| 4 | Earnings | «أرباحي» | «متاح للسحب» and «قيد الإتاحة» with the next-availability date — FIN-01's model, not a second calculation — and a link to the full screen |

A teacher waiting on a qualification sees the setup card and nothing else: no work, no open requests, no
money — and the page asks the server for none of them. A teacher who is approved but not yet visible sees
the setup card first, then any paid work, next session and earnings they already have; the opportunities
preview stays hidden, because they cannot win work students cannot route to them.

The home acts on nothing. Every card opens the item's own screen — `/requests/:id`, `/orders/:id`,
`/live-sessions/:id`, `/teacher/opportunities/:id`, `/teacher/earnings` — which owns the business action and
the server's rules. The only buttons on the page are retry.

## How the decision is made

Two pure functions, both teacher-specific by design — `UX-01` composed the student's home from the student's
questions and this composes the teacher's from theirs; there is no shared dashboard engine:

- `features/teacher-home/models/setup-card.ts` turns the server's readiness into one card. It re-decides
  nothing: `GET /teachers/onboarding-status` returns the blocking reasons in its own order and whether the
  teacher is ready to publish, and this file picks the first, words it (by application stage where the
  reason is a missing qualification), names the screen that fixes it and counts what is left. Being
  unpublished is not a step of its own — it is what the publication screen is for — so it only becomes the
  card when nothing else is left. A code the client does not know is still shown as a card, never printed.
- `features/teacher-home/models/teacher-home.ts` ranks the work T1 (a session happening now) to T9 (a time
  the student proposed), caps the list at three, previews the opportunities, picks the nearest session and
  reads money through **FIN-01's `Earnings.summary`**. Work that is waiting on the student or on nobody —
  an unpaid order, work in progress and on time, a delivery under review, a reschedule the teacher proposed
  — is not on the home at all, as the ticket's Gate 2 decided; «عرض كل أعمالي» always links to `/teacher/work`.

`LoadTeacherHome` reads readiness first and alone, because it decides the whole view: if it fails the home
cannot honestly claim the teacher is visible, so the failure is raised rather than guessed around. Everything
after it is read in parallel and fails on its own — a section that failed says «تعذّر التحميل.» with a retry
where it would have been, and never becomes an empty list or a zero balance.

## Data

No home endpoint, as the ticket's endpoint audit concluded. Six existing reads, one of them conditional:
`/teachers/onboarding-status`, `/learning-requests/assigned?status=0`, `/orders/assigned`,
`/live-sessions/mine`, `/open-marketplace/opportunities` (visible teachers only) and `/withdrawals/balances`.
An applying teacher costs exactly one call. No API, DTO, migration or backend file changed in this branch.

## Verification

| Gate | Result |
|------|--------|
| `dotnet restore --locked-mode` · `dotnet format --verify-no-changes` | exit 0 · exit 0 |
| Release build (incl. Angular) | **0 warnings, 0 errors** |
| Architecture / Domain / Application | 1/1 · 117/117 · 14/14 |
| Integration, provider-neutral | **381/381** (was 378: the route scan sees the home's new static links) |
| Integration, SQL Server | **225/225** (unchanged; UX-02 adds no backend behaviour) |
| Angular unit tests | **424/424 in 46 files** (was 389 in 43: + 11 setup, + 15 classifier, + 9 page) |
| Contract gate / `--strict` | **222/222/0** · exit 0 (was 218 shapes: onboarding status, assigned requests, assigned orders, opportunities) |
| `check-js` · `check:i18n` | pass · **1,097 keys** in en/ar |
| EF pending model changes | none |
| publish + `validate-publish.ps1` · `deploy-gates.tests.ps1` | pass · 57/57 |
| Route probe (asserting) | **64/64** (`/teacher/home` already existed; it is now its own screen) |
| **UX-02 journey** `ux02-teacher-home` | **9/9** |
| UX-01 regression | **8/8** |
| UX-04 regression | **7/7** |
| UX-05 regression | **6/6** |
| FIN-01 regression | **7/7** |
| Wave 3B direct order | **15/15** |
| Wave 3B open marketplace | **9/9** |

[Verification summary](./evidence/verification.txt) · [route probe](./evidence/runtime-route-probe.txt) ·
[screenshots](./evidence/e2e/screenshots/).

Every journey ran against the verified publish output in Development, on throwaway databases seeded by
`scripts/dev/E2ESeed` (`TafseelE2EUx02b` for UX-02, UX-01, UX-04 and both Wave 3B journeys; `TafseelE2EUx02c`,
started with `OpenMarketplace__OfferReservationMinutes=20`, for FIN-01 and UX-05). The journeys only read the
database.

## What the journey proves

`ux02-teacher-home` builds every state through the product's own flows — no SQL was written — with an Arabic
teacher on a 390×844 phone:

1. a teacher who registers as a teacher and confirms their address is told «ابدأ طلب الانضمام في مادتك» with
   one 44px «ابدأ الطلب» button to `/teach/apply` and «خطوات متبقية: 3» — and no work, opportunities,
   earnings, grid, search or Refresh behind it; the card is above the fold and no server code is printed;
2. a published teacher who switches their profile off through the real publication screen is told
   «Your profile is ready for students» with «Review and go visible», and is offered no open requests while
   invisible; switching back on clears the card and the preview returns — the home re-evaluates from the
   server, not from a guess;
3. a student's new direct request is the first thing on the home, as the only filled button, and opens the
   request's own screen;
4. once the student pays, «تم الدفع — ابدأ العمل» leads instead, naming the teacher's own net as the server
   calculated it, drawn with the riyal mark, and linking to that order;
5. an open request the student published appears in the preview with its deadline and budget, carries no
   student identity, and opens `/teacher/opportunities/:id`;
6. a booked and paid session becomes «جلستك القادمة» — «مؤكدة», when it starts in words — without becoming
   an outstanding task;
7. after the work is started, delivered and completed, «قيد الإتاحة» shows exactly what
   `GET /withdrawals/balances` returns, with no ledger, escrow, maturity or account word;
8. the whole home carries no id, no raw field, no numeric badge and no English product word; every link is a
   44px target; nothing scrolls sideways; and a student who opens `/teacher/home` is sent to their own home.

[Setup blocker](./evidence/e2e/screenshots/ux02-home-setup-ar.png) ·
[new request](./evidence/e2e/screenshots/ux02-home-new-request-ar.png) ·
[paid order to start](./evidence/e2e/screenshots/ux02-home-start-work-ar.png) ·
[the full home](./evidence/e2e/screenshots/ux02-home-full-ar.png).

## Defects found

| # | Defect | Where |
|---|--------|-------|
| 1 | On the Arabic phone a money label and its amount sat on separate lines: the shared `.tf-price-line` is a flex box, so «صافي ربحك» and «الميزانية» broke before their numbers. The two money lines are now flex rows that share a baseline. | Found by the journey screenshots; fixed here |
| 2 | The UX-04 sweep still audited `/teacher/home` as a generic dashboard section and timed out waiting for a grid that no longer exists. | Fixed here: Home's own words are audited by this ticket's journey, as `/student/overview` already was |

## Decisions and deviations

| # | What | Why |
|---|------|-----|
| 1 | Passive current work is not on the teacher home at all | The ticket's Gate 2 decided it: an order in progress and on time is not a task, and «عرض كل أعمالي» is always one tap away. This is deliberately unlike the student home, where "In progress" answers a question the student actually asks |
| 2 | Amounts are their own line beside a label rather than inside the sentence | `Money.format` writes the Latin code, which inside an Arabic sentence is the one English phrase on the screen — the remedy FIN-01 and UX-01 already adopted |
| 3 | «تبدأ خلال ٣ ساعات» is computed in the page | `FormatService.relative` only looks backwards; the shared helper is untouched |
| 4 | The setup card's readiness comes from the shared `OnboardingState`/`Readiness` contract in `teacher-setup` | Readiness rules are the server's and are already modelled once; this ticket adds wording, not rules |

**Observation, not changed here:** the SAMA riyal mark falls back to the letters `SAR` until the
`saudi_riyal` font is confirmed loaded (`html.tf-riyal-font-ok`), so the screenshots show "SAR 170". That is
shared `tf-price` behaviour on every screen that shows money — FIN-01's and UX-01's released evidence show
the same — and belongs to `UX-06`.

No protected financial code was changed: `FinancialService`, the ledger, escrow, the maturity worker,
idempotency, reconciliation and the migrations are untouched. This branch contains no backend change at all;
the only shared test change is one helper export (`outboxLink`) so a journey can register its own teacher.

## Commits

| Commit | What |
|--------|------|
| `131271b` | The teacher home: setup card, classifier, ports, gateway, use case, page and route; the Home dashboard area emptied; locale keys; the three spec files |
| `86e82c2` | The UX-02 browser journey, the harness `outboxLink` export and the UX-04 sweep update |
| `this commit` | This report and the ticket, board, blocker and readiness updates |

## Blocker count

**40 → 39.** UX-02 is Done; no ticket was added. Recalculated by the blocker-count validation over
[`V1_RELEASE_BLOCKERS.md`](../../releases/V1_RELEASE_BLOCKERS.md).

## Not done here

`UX-03`, `UX-06`…`UX-09`, `FIN-02`…`FIN-07`, `PROD-01` and every provider, infrastructure, tax and hosting
ticket were not started. The Teacher navigation still lists the old sections — reducing it to six items, the
header bell and the merged Work list are `UX-03`, which this ticket unblocks.
