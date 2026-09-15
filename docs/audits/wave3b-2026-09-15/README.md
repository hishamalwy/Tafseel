# Wave 3B — demand, transaction, communication and fulfilment

Branch `feat/wave3b-demand-fulfilment`, from `28489b9` (Wave 3A). Scope: J4-01, J4-08, J5-01,
J6-04, J6-06, J7-01, J9-02, J8-02, J8-05, J8-06 and the P1 behaviour they need. Mock payment and
mock meeting providers only. Wave 3C (withdrawals, admin finance), real providers and DRM/video
were not started.

## The paths, end to end

No Postman call, SQL edit or seeded business state. The seed (`scripts/dev/E2ESeed`,
`TAFSEEL_E2E_SCENARIO=fulfilment`) creates two **already published** teachers — each qualified in
one subject, with the canonical recorded-explanation and live-session services and open weekly
availability — and one unrelated student used only to prove refusals. Publishing a teacher through
the UI is the Wave 3A journey (18/18 again below); here it is a prerequisite, not the thing under
test. The buying students register through `/auth`. **No learning request, offer, order, payment,
booking, delivery, message or review is seeded**; the database was empty of them before the final
run (0 users, requests, orders and payments before seeding). The journeys only *read* the database
to confirm what the server recorded (the SQL helper refuses any statement that writes).

### Direct request (`tests/browser/wave3b-direct-order.e2e.mjs`, **15/15**)

The student side runs **in Arabic at 390px** (RTL, no horizontal scroll and no content spilling
out of a card on every screen); the teacher runs in English on desktop.

| # | Step | Screen |
|---|------|--------|
| 1 | Student registers, confirms from the outbox, signs in | `/ar/auth` |
| 2 | Browses to the published teacher; the live service reads "جلسة مباشرة", the recorded one "2 أيام" | `/ar/teachers`, `/ar/teachers/:id` |
| 3 | Chooses the recorded service, sends the request, lands on it (no order yet) | `/ar/requests/new` → `/ar/requests/:id` |
| 4 | Teacher opens it from the work list, accepts: price 150, one revision | `/teacher/work?tab=requests` → `/requests/:id` (accept dialog) |
| 5 | Student opens the order, pays in the mock simulator; order stays awaiting the teacher | `/ar/orders/:id` → `/ar/checkout?orderId=` → `/ar/checkout/simulator` → `/ar/orders/:id` |
| 6 | Teacher starts the paid order | `/orders/:id` |
| 7 | Student messages from the order; teacher opens the same conversation and replies | `/conversations/:id` |
| 8 | Teacher delivers a PDF with a note | `/orders/:id` (deliver panel) |
| 9 | Student asks for a revision; teacher sees it and delivers again | same |
| 10 | Allowance spent: no revision offered; the server refuses one (`revision_limit_reached`) | same |
| 11 | Student completes; teacher is told the earnings are **pending clearance** | same |
| 12 | Student reviews once (an unrated review sends nothing); a second is refused (409) | same |
| 13 | A visitor sees the review and the 4.8 rating on the public profile | `/teachers/:id` |
| 14 | Outsiders get 404 for the order, its conversation and its delivery file; one order, one payment | API |

### Open marketplace (`tests/browser/wave3b-open-marketplace.e2e.mjs`, **9/9**)

| # | Step | Screen |
|---|------|--------|
| 1 | Student picks "open request" over "direct teacher"; publishing empty sends nothing; publishes from the real catalog with a budget | `/requests/new` → `/requests/new/open` → `/requests/:id` |
| 2 | Teacher A discovers it (the student is not identified), sends an offer, changes it (PUT, If-Match) | `/teacher/opportunities` → `/teacher/opportunities/:id` |
| 3 | Teacher B sends, withdraws and sends again; B cannot withdraw A's offer (404) | same |
| 4 | Student compares both offers as written; no ranking words | `/requests/:id/offers` |
| 5 | A selection against terms that changed meanwhile is refused (409), explained, shown with the new price; the request stays open | same |
| 6 | Select (If-Match + X-Offer-Version), release, select again; two-hour countdown; **no order**; A's held offer can no longer be edited or withdrawn | same, `/teacher/opportunities/:id` |
| 7 | Pay the reserved request: while the simulator is open there is still no order and the payment is pending; after it, **exactly one order** at the offer price, on its screen | `/checkout?learningRequestId=` → simulator → `/requests/:id?paid=1` → `/orders/:id` |
| 8 | Checkout no longer offers the converted request; a second payment is refused; the teacher can start | `/checkout`, `/orders/:id` |

### Messaging (`tests/browser/wave3b-messaging.e2e.mjs`, **8/8**)

Setting: a real order from the request wizard and the accept dialog. Both participants open the
order's conversation from the order screen and reach the **same** thread (one row in
`Conversations` for the order). The student's message reaches the teacher's open page over
**SignalR in 92 ms, without a reload and without a GET of the messages**; the reply reaches the
student the same way. A message to someone in the inbox shows as unread and clears when opened
(`POST /conversations/{id}/read`, and the server agrees). A PDF sent in the thread opens for the
teacher through `GET /message-attachments/{id}/content` (200) and is refused to an unrelated
student and another teacher (404) and to an anonymous request (401); the page carries no storage
address. **Fallback, separately:** with `/hubs/messages` blocked, the page says it is polling and
the message still arrives by `GET`.

### Live session (`tests/browser/wave3b-live-session.e2e.mjs`, **9/9**, real time, ~80 minutes)

| # | Step |
|---|------|
| 1 | Student books and pays the nearest 30-minute slot with teacher A and with teacher B, and a slot three hours later with A (booking awaits payment while the simulator is open) |
| 2 | Both participants reach the booking from their work lists |
| 3 | Joining the later session is refused by the server (`join_window_closed`), no room opens; an unrelated student and another teacher get 404 |
| 4 | Teacher A cancels the later session; the dialog says the student is refunded; payment Refunded |
| 5 | In the window, student and teacher both join through the page (mock room URL); completion is neither offered nor accepted (409) before the end |
| 6 | After the end, teacher A asks to complete (CompletionPending); the teacher cannot confirm; the student confirms (Completed); the teacher is told earnings are pending clearance |
| 7 | Before the 15-minute grace the no-show is neither offered nor accepted (409); after it the student reports teacher B absent (TeacherNoShowPending); the student cannot confirm; teacher B confirms (TeacherNoShow); an outsider gets 404 |
| 8 | The existing finance flow's records: completed — payment Confirmed, escrow held and released, one earning maturity **Pending**; teacher no-show — payment Refunded, escrow held and refunded; cancelled — Refunded |

Nothing changes a clock or a row: the journey waits for the server's window and grace period.

## Payment state transitions observed

| Journey | Observed |
|---------|----------|
| Direct order | no payment → `Payments.Status` Pending (0) while the simulator is open, order `AwaitingPayment/Pending` → payment Confirmed (1), order `AwaitingPayment/Paid` → teacher starts `InProgress` → `Delivered` → `RevisionRequested` → `Delivered` → `Completed`; `TeacherEarningMaturities` Pending (0) |
| Open request | request `OpenForOffers` (5) → select `AwaitingPayment` (6) → release (5) → select (6); payment Pending with **no order** → Confirmed; request `ConvertedToOrder` (7); offer A Accepted (2), offer B NotSelected (4); one order `AwaitingPayment/Paid` at 135.00 |
| Live session | booking `AwaitingPayment` (0) while the simulator is open → `Confirmed` (1) → `CompletionPending` (6) → `Completed` (2); `Confirmed` → `TeacherNoShowPending` (8) → `TeacherNoShow` (5), payment Refunded (3); cancelled by the teacher (3), payment Refunded |

## Commits

| Capability | Commit |
|------------|--------|
| Server: live-session slot generation looped forever near midnight (test red → green) | `073ad97` |
| Server authorization tests for the new screens' actions | `b775a06` |
| Open requests, offers, opportunities, request screen (J4-01, J4-05..07) | `b85371b` |
| Reserved open-request checkout and return to the order (J4-08, J5-01) | `f67daef` |
| Order screen for both participants (J6-04, J6-06, J7-01) | `80f5755` |
| Messaging with SignalR and polling fallback (J9-02) | `2b85a11` |
| Live-session screen: join, completion, no-show settlement (J8-02, J8-05, J8-06) | `633cb86` |
| Routing: items open on their own screens; row actions and interim link routes removed; strings | `93e064d` |
| Public reviews rendered empty; live services read as recorded (J7-01, 3A observation) | `71d9dd2` |
| Wave 3B journeys, fulfilment seed, route probe, Wave 1 deep-link expectations | `012258d` |
| A long file name spilled out of its card (found in the final screenshots) | `29d6ba0` |
| Pre-existing flaky offer-privacy assertion (found by the baseline reproduction) | `e8aa5a3` |
| This report, evidence and the matrix | the commit after `e8aa5a3` |

## Matrix rows

| Row | Before | Now |
|-----|--------|-----|
| J4-01 post an open request | NO UI | **DONE** |
| J4-08 pay for the reserved request | NO UI | **DONE** |
| J5-01 pay for an accepted order | NO UI | **DONE** |
| J6-04 request a revision | NO UI | **DONE** |
| J6-06 order detail and history | PARTIAL (read-only page) | **DONE** — all participant actions on the page |
| J7-01 review a completed order | NO UI | **DONE** for orders; the live-session review endpoint has no UI (not needed by the covered path) — **PARTIAL** for sessions |
| J9-02 read and send messages | NO UI, no SignalR client | **DONE** |
| J8-02 join a session | PARTIAL (student only) | **DONE** for both roles |
| J8-05 complete / no-show / settlement | NO UI | **DONE** |
| J8-06 open a session | PARTIAL (redirect to list) | **DONE** — its own screen |
| J4-06 teacher edits or withdraws an offer | NO UI | **DONE** |
| J4-05, J4-07 | DONE in the marketplace list (Wave 2) | also on the new opportunity and offers screens |
| J9-01 conversation list | PARTIAL | **DONE** as the inbox |
| J6-05 extensions | — | unchanged: no UI built, the path does not need one |

## Screens and routes

| Route | Screen | Who |
|-------|--------|-----|
| `/requests/new/open` | the two ways to ask; open request form from the catalog | Student |
| `/requests/:requestId` | request for its student or assigned teacher: status, brief, clarifications, accept/decline, cancel, offer count, reservation countdown, pay, resulting order | participants |
| `/requests/:requestId/offers` | offer comparison, select with both versions, reservation, release, pay | Student |
| `/teacher/opportunities/:requestId` | opportunity brief without student identity, send / change / withdraw / resend an offer, held state | Teacher |
| `/orders/:orderId` | order for both participants (rewritten) | participants |
| `/messages`, `/conversations/:conversationId` | inbox with unread counts; thread, composer with attachment, live state | signed in |
| `/live-sessions/:sessionId` | booking for both participants: window, join, reschedule, cancel with the refund rule, files, completion, no-show, settlement | participants |

Feature folders `features/demand`, `features/messages`, `features/live-sessions` (models, ports,
HTTP gateways, use cases, pages) and the rewritten `features/orders`, all lazy with route-level
providers; initial bundle **696.70 kB** of 700 kB; `@microsoft/signalr` (10.0.11) is imported
dynamically on the messages screen only. They use the Wave 3A `WorkspaceShellComponent` and one
shared stylesheet (`shared/styles/workspace-detail.css`); nothing was added to
`DashboardPageComponent` — its start, deliver, upload, join and complete row actions were removed
and each card now opens its item's screen. The interim link routes that forwarded these deep links
to dashboard lists (Wave 1) are gone; `student/messages` and `teacher/messages` redirect to
`/messages`. Wave 1's E2E expectations for those links were updated to the real screens.

## API calls added

Demand: `GET /open-marketplace/requests/{id}`, `GET …/requests/{id}/offers`,
`POST …/requests/{id}/offers/{offerId}/select` (If-Match, X-Offer-Version), `POST …/cancel-selection`
(If-Match), `POST /open-marketplace/requests`, `GET /open-marketplace/opportunities/{id}`,
`POST …/opportunities/{id}/offers`, `PUT /open-marketplace/offers/{id}` (If-Match),
`POST …/offers/{id}/withdraw` (If-Match), `GET /learning-requests/{id}`,
`POST /learning-requests/{id}/{cancel,reply-clarification,request-clarification,decline}` (If-Match),
`GET /learning-requests/attachments/{id}/content`, `GET /services`, `GET /subjects`, `GET /orders/mine` and `/orders/assigned` (to find the order a request became).

Checkout: `POST /payments/open-requests/{learningRequestId}` (Idempotency-Key).

Orders: `POST /orders/{id}/{start,revision,complete,cancel}` (If-Match),
`POST /orders/{id}/deliveries` (multipart `files` + `message`, If-Match, upload progress),
`POST /orders/{orderId}/review`, `GET /orders/deliveries/{id}/content`, `POST /conversations`
(scope Order).

Messaging: `GET /conversations?page=&pageSize=`, `GET /conversations/{id}/messages`,
`POST /conversations/{id}/messages`, `POST /conversations/{id}/read` (If-Match),
`POST /messages/{id}/attachments`, `GET /message-attachments/{id}/content`; hub `/hubs/messages`
(`JoinConversation`, `MessageReceived`, `NotificationChanged`).

Live sessions: `GET /live-sessions/mine`, `GET /live-sessions/{id}/join`,
`POST /live-sessions/{id}/{complete,no-show,settlement/confirm,cancel,reschedule,reschedule/respond}`
(If-Match), `POST /live-sessions/{id}/attachments`, `GET /live-sessions/attachments/{id}/content`,
`POST /conversations` (scope LiveSession).

Contract gate: **217 call shapes, 217 matches, 0 violations**; `--strict` exit 0 (Wave 3A: 175). The
computed protected-content paths are declared in `tests/contracts/dynamic-client-calls.json`; no
allow-list, no wildcard.

## Authorization

New: `Wave3BFulfilmentAuthorizationTests` (SQL Server, 3 tests). Orders — another student and
another teacher cannot read the order (404), another student cannot start a payment (no payment row
is created), the student cannot start (403) and another teacher cannot (404), another student
cannot ask for a revision or complete (404) and the teacher cannot (403), another student cannot
review (404) and the teacher cannot (403); exactly one review. Open requests — another teacher
cannot change or withdraw an offer (404); another student cannot read the request, its offers,
select or pay (404); a teacher cannot read the student's offers (403); a selected offer cannot be
changed or withdrawn by its teacher; the order is created once. Live sessions — the student cannot
request completion and teacher B's student cannot confirm it (404); the teacher cannot confirm their
own completion (409); the teacher cannot report their own absence (404); the reporting student
cannot confirm it (409); another student cannot confirm it (404).

Already covered and relied on: `Phase8MessagingTests` (conversation privacy, duplicate conversation
returns the same id, read state, attachment 404/200), `Phase5OrderTests` (conversation for someone
else's order 404, delivery upload and content 404 for outsiders, revision limit), `Phase6LiveSessionTests`
(join too early, outsider join and attachment 404), `OpenMarketplaceTests` (request attachments,
competitor privacy, stale versions, tampered amounts), `Phase9GovernanceTests` (duplicate review 409,
rating aggregate). The E2E journeys repeat the key refusals against the running host.

## Backend production files changed, and why

Only `src/Tafseel.Infrastructure/LiveSessions/LiveSessionService.cs` (6 lines): slot generation
stepped a `TimeOnly`, which wraps at midnight. For a weekly rule ending within one session length
of midnight (for example 22:00–23:30 with 60-minute sessions) `start + duration <= end` never
became false, so `GET /live-sessions/teachers/{id}/slots`, `GET /live-sessions/availability-summaries`
and therefore **every public profile of that teacher** spun a server thread forever — a
teacher-triggerable denial of service through the Wave 3A availability editor. Found when the seeded
teachers' profile never loaded. It now steps a `TimeSpan`. `LiveSessionSlotMidnightTests` (2 tests):
before the change the run hung and the test host was aborted after 90 s; after it both pass, and the
last slot before the rule's end books.

`Tafseel.Domain`, `FinancialService`, the ledger, escrow, earnings maturity, the exposure/dispute
window, payment idempotency, reconciliation and migrations are unchanged
(`git diff 28489b9..HEAD -- src` touches the one file above).

## Defects found on the way

| Defect | Where | Proof |
|--------|-------|-------|
| Slot generation infinite loop near midnight (server) | `LiveSessionService.CalculateSlots` | `LiveSessionSlotMidnightTests` hung before, pass after; E2E profile loads |
| Public reviews showed no text and no stars: the client read `rating`/`body`/names, the API sends `overallScore`/`originalComment` and no student | `http-teacher.gateway.ts` | `teacher-mapping.spec` (J7-01); direct E2E step 13 |
| A live service was labelled "Recorded" with "1 days" (3A observation) | `Teacher.isLiveService`/delivery label | `teacher-delivery.spec`; direct E2E step 2 |
| A message arriving in the open thread was never marked read (the cached unread count predated it), in real time and when polling | `messages-page.component.ts` | `messages-page.component.spec`: 2 tests fail without the fix; messaging E2E unread step |
| A long delivery file name spilled out of its card under the next column (desktop) and off the card (phone) | `workspace-detail.css` | the journeys' new card-containment check; final screenshots |
| Back arrow pointed the wrong way in Arabic | `workspace-detail.css` | final Arabic screenshots |
| `OpenMarketplaceTests` (pre-existing, since `e01b944`) failed at random: it checked a competitor amount was absent with `DoesNotContain("150")` over raw JSON, and an offer id ended `…cf1509f` | test only | failed once in the first baseline reproduction; compares values now; 5/5 |
| Old order spec asserted the read-only page | `order-detail-page.component.spec.ts` | rewritten for the participant-aware page |

## Kept from Wave 3A

- Revoke stays out of the UI: `POST /teacher-qualifications/{id}/revoke` still needs a qualification
  id no read endpoint returns; nothing was invented.
- `GET /teachers/me` empty until the core profile exists: untouched; the profile editor sequence and
  the 3A journey (18/18) are unchanged.
- "Recorded · 1 days" was a presentation defect and is fixed as such; the service model is unchanged.

## Verification

| Gate | Result |
|------|--------|
| `dotnet restore --locked-mode` | exit 0 |
| `dotnet format --verify-no-changes` | exit 0 (after reflowing one object initializer in the new authorization test) |
| Release build (incl. Angular) | 0 warnings, 0 errors |
| Architecture / Domain / Application | 1/1 · 117/117 · 14/14 |
| Integration, provider-neutral | **375/375** (Wave 3A: 357) |
| Integration, SQL Server | **223/223** (Wave 3A: 218) |
| Angular unit tests | **331/331** in 37 files (Wave 3A: 270) |
| Contract gate / `--strict` | 217/217/0 · exit 0 |
| `check-js`, `check:i18n` | pass · 940 keys in en/ar |
| EF pending model changes | none |
| publish + `validate-publish.ps1` | pass |
| `deploy-gates.tests.ps1` | 57/57 |
| Wave 3B direct / open marketplace / messaging / live session E2E | **15/15 · 9/9 · 8/8 · 9/9** on a fresh database against the verified publish output; the direct journey was run again after the card-overflow fix (`29d6ba0`, stylesheet only) with its new containment check |
| Wave 3A E2E regression | **18/18** (fresh database) |
| Wave 2 E2E regression | **6/6** (fresh database) |
| Wave 1 E2E regression | **8/8** (fresh database) |
| route probe (asserting) | **58/58** ([probe](./evidence/runtime-route-probe.txt)) |
| clean checkout (`git archive 29d6ba0`) | locked restore, `npm ci`, build 0 warnings; 1/1 · 117/117 · 14/14 · neutral 375/375 · SQL Server 223/223; Angular 331/331; `--strict` 217/217/0 ([summary](./evidence/clean-checkout.txt)) |
| baseline reproduction (`run-baseline.sh` on `e8aa5a3`) | working tree, disposable copy and `git archive HEAD` all green; Angular 331; every .NET suite (neutral 375, SQL Server 223 in both copy and archive); `check-js`, deploy, staging-migration and migration-safety script tests; no pending model changes; publish and validation; baseline matcher 171/171 with 0 wrong verbs, gate 217/217/0. The first run (on `29d6ba0`) had one SQL Server failure, the pre-existing flaky assertion fixed in `e8aa5a3` ([summary](./evidence/baseline-reproduction.txt)) |

[Verification summary](./evidence/verification.txt), [E2E logs and screenshots](./evidence/e2e/).

## Not verified here

- **G-20** (container image): Docker is not installed on this machine and nothing was pushed, so the
  **Docker / image** CI job has not run for this branch. Still pending external CI.
- **Credential rotation** remains an external action before staging security approval.
- Real payment and meeting providers, DRM/video, withdrawals and admin finance: out of scope.
