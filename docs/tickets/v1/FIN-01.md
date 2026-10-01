# FIN-01 — Teacher earnings screen

| Field | Value |
|-------|-------|
| **ID** | `FIN-01` |
| **Release** | V1 |
| **Priority** | P1 |
| **Blocker** | yes |
| **Size** | M |
| **Owner** | Frontend (Angular) · Product review |
| **Status** | **Done** (2026-09-16, `feat/fin01-teacher-earnings`) |
| **Gates** | ☑ 1 Business ☑ 2 UX ☑ 3 Contract ☑ 4 Build ☑ 5 E2E/Release |

## Actor
Teacher (signed in, role Teacher).

## Problem
Teacher › Earnings › Summary (`/teacher/earnings`) is the generic dashboard
(`features/dashboards/models/dashboard.ts:61`, sources `/withdrawals/balances` and
`/teachers/me/business/analytics`). It renders each API object as the same entity card
([UX_PRINCIPLES §6.1](../../product/UX_PRINCIPLES.md#61-how-the-generic-dashboard-renders-applies-to-every-generic-section)):
field names such as `available`, `pendingWithdrawal`, `pendingClearance`, `nextClearanceAt`, a
"Currency" field, a Refresh button and a search box, followed by analytics counters (offers submitted,
selection rate, gross sales). A teacher cannot tell what they may withdraw now, why part of the money
is not withdrawable yet, or when it will be. Matrix J12-01.

## User goal
As a teacher, I want to see how much I can withdraw now, how much is still clearing and when the next
amount becomes available, so that I trust Tafseel with my earnings and know when I can be paid.

## Business rule
- [Contract §3.9 Earnings](../../product/TAFSEEL_PRODUCT_CONTRACT.md#39-earnings): accepted work credits
  the teacher net as **pending clearance** (not withdrawable); it becomes **available** when the exposure
  (dispute) window ends — 7 days after the last delivery or after the session end. An open dispute keeps
  the amount held until it is resolved (§3.12).
- [Contract §3.10](../../product/TAFSEEL_PRODUCT_CONTRACT.md#310-withdrawal-and-payout-profile): minimum
  withdrawal 50 SAR; expected settlement 3 business days; a withdrawal in progress is no longer available.
- DEC-03 (open, **non-blocking**): a completion after the window has already ended credits *Available*
  directly. The screen shows whatever the server returns, so either outcome of DEC-03 needs no change here.
- No new business rule.

## Business states
Read-only. Per currency (V1: SAR only), the server returns:

| Server value | Product term (AR / EN) | Meaning for the teacher |
|--------------|------------------------|-------------------------|
| `available` | متاح للسحب / Available to withdraw | Can be withdrawn now (withdrawal action is `FIN-03`) |
| `pendingClearance` | قيد الإتاحة / Clearing | Earned; becomes withdrawable after the objection period |
| `nextClearanceAt` | أقرب موعد إتاحة / Next amount available | Earliest date a clearing amount becomes withdrawable (date only; the API gives no amount per date) |
| `pendingWithdrawal` | قيد التحويل / Being transferred | Withdrawals requested and not yet completed or rejected |

Transitions shown to the teacher (no action on this screen): work accepted → *Clearing* → objection period
ends → *Available* → withdrawal requested → *Being transferred* → paid (or returned to *Available*).

## Preconditions
- Teacher account; `WithdrawalsRequest` permission (all teachers).
- No payout profile or published profile is required to view earnings.

## Happy path
1. Teacher opens **Earnings** («أرباحي») from navigation (`/teacher/earnings`) or "Earnings details" on
   Teacher home (`UX-02`).
2. The screen loads balances and withdrawal policy in parallel.
3. The teacher sees three amounts in this order: *Available to withdraw*, *Clearing* (with the next date),
   *Being transferred* (only when above zero).
4. The teacher expands «لماذا لا يُتاح المبلغ فورًا؟» / "Why isn't it available straight away?" and reads the
   one-paragraph explanation.

## Negative cases
| Case | What the teacher sees |
|------|------------------------|
| Balances list is empty (new teacher, no ledger accounts yet) | Empty state (below) — never "0" cards with no explanation |
| All amounts are zero | Same empty state |
| `pendingClearance > 0` and `nextClearanceAt` is null | Clearing card without a date line |
| `nextClearanceAt` is in the past (maturity not yet processed, or a dispute is holding the amount) | «يصبح متاحًا قريبًا» / "Becoming available soon" instead of a past date |
| `available > 0` but below the policy minimum | Helper line «تحتاج إلى {min} على الأقل لطلب سحب» / "You need at least {min} to request a withdrawal" |
| Policy request fails but balances succeed | Amounts shown; minimum/settlement lines omitted (no invented numbers) |
| Balances request fails | Error state with retry; no amounts shown |
| 401 | Existing session handling (sign-in, return to `/teacher/earnings`) |
| 403 (non-teacher) | Route guard already restricts `/teacher/*`; if reached, "not available to you" state |
| More than one currency returned | One group of cards per currency, SAR first (not expected in V1) |

## Authorization
- `GET /withdrawals/balances` and `/withdrawals/policy`: policy `WithdrawalsRequest`; the balances are the
  caller's own (`sub`), never another teacher's.
- Students, Quality Reviewers: 403; the teacher route guard prevents navigation.
- The teacher must not see ledger account names, maturity records, internal ids or other teachers' data —
  none is in the response.

## UX
- **Entry point:** Teacher navigation item 5 **Earnings** («أرباحي», `UX-03`); "Earnings details" link on the
  Teacher home earnings summary (`UX-02`); the existing earnings notifications that link to `/teacher/earnings`.
- **Information hierarchy:**
  1. Page title «أرباحي» / "Earnings".
  2. **Available to withdraw** — the largest figure on the page.
  3. **Clearing** — amount + next-availability line.
  4. **Being transferred** — only when `pendingWithdrawal > 0`.
  5. Collapsed explanation «لماذا لا يُتاح المبلغ فورًا؟».
  6. (Slot reserved for `FIN-02`/`FIN-03`: payout details and withdraw action. FIN-01 renders nothing there.)
- **Primary CTA per state:**

  | State | Primary CTA |
  |-------|-------------|
  | Has amounts | None on FIN-01 (the withdraw button belongs to `FIN-03`; no dead button is shown) |
  | Empty (no earnings yet) | «تصفّح الطلبات المفتوحة» / "Browse open requests" → `/teacher/opportunities` |
  | Error | «إعادة المحاولة» / "Try again" |

- **Wording (AR / EN):**

  | Key (proposed) | Arabic | English |
  |----------------|--------|---------|
  | `earn_title` | أرباحي | Earnings |
  | `earn_available` | متاح للسحب | Available to withdraw |
  | `earn_available_help` | يمكنك طلب سحب هذا المبلغ. الحد الأدنى للسحب {min}. | You can request a withdrawal of this amount. The minimum withdrawal is {min}. |
  | `earn_available_below_min` | تحتاج إلى {min} على الأقل لطلب سحب. | You need at least {min} to request a withdrawal. |
  | `earn_clearing` | قيد الإتاحة | Clearing |
  | `earn_clearing_help` | يصبح متاحًا للسحب بعد انتهاء فترة الاعتراض. | Becomes available to withdraw once the objection period ends. |
  | `earn_next_date` | أقرب مبلغ يصبح متاحًا في {date} | The next amount becomes available on {date} |
  | `earn_next_soon` | يصبح متاحًا قريبًا | Becoming available soon |
  | `earn_transferring` | قيد التحويل | Being transferred |
  | `earn_transferring_help` | طلب سحب قيد المعالجة. يصل عادةً خلال {days} أيام عمل. | A withdrawal is being processed. It usually arrives within {days} business days. |
  | `earn_why_title` | لماذا لا يُتاح المبلغ فورًا؟ | Why isn't it available straight away? |
  | `earn_why_body` | بعد اكتمال العمل نحتفظ بأرباحك مدة 7 أيام من آخر تسليم أو من انتهاء الجلسة، وهي المدة التي يمكن للطالب خلالها الاعتراض. إذا فُتح اعتراض يبقى المبلغ محفوظًا حتى يُحسم، ثم يصبح متاحًا للسحب. | After work is completed we hold your earnings for 7 days from the last delivery or the end of the session — the period in which the student can raise an objection. If an objection is opened, the amount stays held until it is resolved; then it becomes available to withdraw. |
  | `earn_empty_title` | لا توجد أرباح بعد | No earnings yet |
  | `earn_empty_body` | تظهر أرباحك هنا بعد اكتمال أول عمل: تبدأ «قيد الإتاحة» ثم تصبح «متاحة للسحب». | Your earnings appear here after your first completed work: first as "Clearing", then "Available to withdraw". |
  | `earn_error` | تعذّر تحميل أرباحك. | We couldn't load your earnings. |

  Amounts use the existing `tf-price` component (SAR symbol and Arabic-Indic digit rules as elsewhere);
  dates use the viewer's time zone, Arabic month names in Arabic («١٥ سبتمبر ٢٠٢٦»-style per the app's
  locale formatter). Never shown: "ledger", "maturity", "escrow", "account", "PendingWithdrawal",
  "Currency", "Refresh", ids. The 7-day figure must match Contract §3.9; if Admin/config changes the
  window, the copy changes with it (test asserts the text against the contract value).
- **Mobile (390px):** single column; each amount is one full-width card (label, amount at ≥ 24px, one helper
  line); no tables; the explanation is an accordion; no horizontal scroll; the empty-state CTA is ≥ 44px.
  Everything above the fold except the explanation.
- **Loading / empty / error / not-available states:** loading = two skeleton cards; empty = title, body, CTA;
  error = message + «إعادة المحاولة»; not-available = existing "not available to you" pattern.
- **Confirmation dialogs:** none (read-only).
- **Gate question:** yes — three product words (متاح للسحب، قيد الإتاحة، قيد التحويل), each with a sentence
  saying what it means and when it changes; no internal terms.

## API contracts
No new API contract; presentation/composition only.

| UI action | Endpoint | Verb | Request | Headers / concurrency | Response | Resulting server state |
|-----------|----------|------|---------|-----------------------|----------|------------------------|
| Open Earnings | `/api/v1/withdrawals/balances` | GET | — | Bearer; `Cache-Control: no-store` (all `/api`) | `BalanceDto[]` = `{ currency, available, pendingWithdrawal, pendingClearance, nextClearanceAt? }` | none |
| Open Earnings | `/api/v1/withdrawals/policy` | GET | — | Bearer | `WithdrawalPolicyDto` = `{ minimumAmount, currency, expectedSettlementBusinessDays }` | none |

**Recent movements:** no JSON endpoint lists individual credits. `GET /teachers/me/business/statement.csv`
exists (English columns, statuses "Released"/"Refunded", no clearing/available split) and
`/teachers/me/business/analytics` returns performance counters; both are "Teacher business analytics and
exports", deferred to V1.1 (`B11-09`). FIN-01 therefore shows **no movement list and no analytics**; the
generic analytics cards are removed from the Earnings screen.

Error codes the UI must explain: none specific (read-only); network/5xx → error state; 401 → sign-in; 403 →
not available.

## Analytics / observability
None new. Existing API request logging covers the two reads.

## Acceptance criteria
- [x] AC1 Available, Clearing and (when > 0) Being transferred are shown with AR/EN labels above; no raw field names, "Currency", ids or Refresh/search controls.
- [x] AC2 Clearing shows «أقرب مبلغ يصبح متاحًا في {date}» when `nextClearanceAt` is in the future, «يصبح متاحًا قريبًا» when in the past, and no date line when null.
- [x] AC3 When `0 < available < minimumAmount`, the below-minimum helper is shown; the minimum comes from the policy response, not a constant.
- [x] AC4 Empty balances (or all zeros) show the empty state with "Browse open requests".
- [x] AC5 A failed balances call shows the error state with retry; a failed policy call still shows amounts without minimum/settlement lines.
- [x] AC6 The analytics counters and the statement download are not on the screen.
- [x] AC7 At 390px in Arabic: no horizontal scroll, amounts readable, accordion works, touch targets ≥ 44px.
- [x] AC8 The explanation text's day count equals Contract §3.9 (7 days).

## Tests
| Level | Test | Proves |
|-------|------|--------|
| Unit / component | `earnings-page.component.spec.ts`: states (amounts, empty array, zeros, null/past/future next date, below minimum, policy failure, balances failure) | AC1–AC6 |
| Unit | earnings presenter maps `BalanceDto` → view model; no field name leaks | AC1 |
| Integration / authorization | Existing `FinancialSafety` tests (completion → pending clearance → available after maturity); existing authorization tests for `WithdrawalsRequest` | server values the screen relies on |
| Contract gate | `check-api-contract.mjs --strict` | 0 violations (no contract change) |
| Browser journey | Seeded teacher with a completed order inside the window and a matured one: Earnings shows Available and Clearing with a date; Arabic 390px screenshot; new teacher sees the empty state | happy path + empty; Arabic phone |

## Out of scope
- Payout profile (`FIN-02`), withdrawal request and history (`FIN-03`), Admin withdrawals (`FIN-04`), payout
  execution (`PAY-04a`, `FIN-05`).
- Movement list, CSV statement, analytics (`B11-09`, V1.1).
- Any change to ledger, maturity worker, `FinancialService` or balances computation (protected).
- DEC-03 behaviour.

## Dependencies
- None blocking. Consumed by `UX-02` (earnings summary) and followed by `FIN-03`.

## Evidence (filled at Done)

**Commits:** `509745d` (model, gateway, use case, page, route, locales, integration test) ·
`b88bed6` (browser journey, UX-04 sweep update, route probe).

**Built:** `/teacher/earnings` is its own screen (`features/earnings/`): Available to withdraw with the
minimum from the policy endpoint, Clearing with the objection-period sentence and the next-availability date,
Being transferred only when a withdrawal is in flight, and a collapsed explanation of the seven-day window.
No withdraw button (that is `FIN-03`), no analytics, no movement list, and no ledger, escrow, maturity or
account word. The old Earnings tabs are gone from the generic dashboard. `features/earnings/models/earnings.ts`
is pure, so `UX-02`'s home summary can read the same authoritative model.

**Tests:** Angular **369/369 in 41 files** (was 353/39): `earnings.spec.ts` (6 cases: the three amounts,
the transferring card only above zero, date/soon/none, below-minimum from the policy, empty, unusable values)
and `teacher-earnings-page.component.spec.ts` (10 cases: the four states, both languages, loading, balances
failure vs policy failure, zero available, no dead button, no internal words). SQL Server **225/225** with
`Balances_tell_the_teacher_when_the_clearing_amount_becomes_available`: after a completed order the net is
clearing with `nextClearanceAt` = the maturity date; after the maturity worker it is available with no date;
a student gets 403 and an anonymous caller 401 from balances and policy. Strict contract gate 215/215/0
(no endpoint changed). Route probe 64/64.

**Browser journey:** `tests/browser/fin01-teacher-earnings.e2e.mjs` — **7/7**
(log). The balance is earned through
the real flow (request → pay → start → deliver → complete), then the Arabic phone screen shows it under
«قيد الإتاحة» — not as withdrawable — with the date and the explanation; the empty state and the student's
403/route refusal are proven in the same run.
Screenshots.
Regressions: UX-04 7/7, UX-05 6/6, Wave 3B direct order 15/15.

**Found while building:** the minimum sentence interpolated the amount as text, putting the Latin code
`50 SAR` inside an Arabic sentence (now drawn by `tf-price`), and with `available = 0` the page still said
"You can request a withdrawal of this amount" (the sentence now appears only when there is something to
withdraw). Both fixed here; details in the audit.
