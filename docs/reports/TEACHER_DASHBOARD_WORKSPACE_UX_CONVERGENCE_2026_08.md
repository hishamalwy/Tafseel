# TAFSEEL — TEACHER DASHBOARD WORKSPACE UX CONVERGENCE

PASS 05 / 13. Scope: the Teacher Dashboard as a coherent **workspace** — separating WORK from
MARKETPLACE SETUP from BUSINESS from ACCOUNT, making attention and readiness truthful, and putting
the Teacher surface on the shared foundation built in PASS 02–04.

No commit, no push, no deploy. No backend business rules, APIs, schema or migrations changed. No
financial semantics touched. No fabricated data of any kind.

## Executive Verdict

Four of the brief's assumed defects were **already correct** and are recorded here as audited
passes, not as work performed. The real defects were elsewhere, and two of them were live,
user-visible bugs that no gate had caught.

| # | Brief's assumption | Finding |
|---|---|---|
| 1 | Teacher IA mixes work with selling setup | **Already correct** — the five groups already separate Overview / Work / Marketplace / Business / Account |
| 2 | Opportunities is buried under marketplace setup | **Already correct** — Opportunities already sits in the Work group |
| 3 | A selected offer awaiting payment reads as authorised work | **Already correct** — the waiting panel renders alone and returns before any work CTA |
| 4 | Fake performance metrics are shown | **Already correct** — every figure is backend-computed; response time is labelled self-reported |
| 5 | Status colour is assembled in the view model | **Real defect — fixed** (and it was actively broken, see below) |
| 6 | — | **Real defect — fixed**: page titles used five competing type scales |
| 7 | — | **Real defect — fixed**: twelve async states bypassed the shared state grammar |
| 8 | — | **Real defect — fixed**: the Reviews surface rendered *nothing* when empty |

The brief says *"if current structure is already equivalent: do not churn labels for no reason."*
Findings 1–4 were left alone and are now protected by assertions instead.

## The two live bugs

**Every Active Order status badge rendered neutral grey.** A half-finished migration in an earlier
pass left the old badge CSS appended to the tone name:

```js
statusTone: Tafseel.statusTone('order', o.rawStatus, o.paymentStatus)
  + ';display:inline-flex;align-items:center;height:24px;...'
```

so the rendered attribute read `data-tone="danger;display:inline-flex;..."`, matched no `[data-tone]`
rule, and fell through to the default neutral fill. Order status had a colour that carried no
information. Caught by *reading the value* a browser assertion printed, not by the assertion itself
— the check had passed. Fixed at [Tafseel-Teacher-Dashboard.dc.html:3415](../../Tafseel-Teacher-Dashboard.dc.html:3415);
the gate now rejects any tone value containing CSS.

**The Reviews surface went silently blank.** With no reviews the `sc-for` emitted nothing and there
was no empty state at all — not a bare paragraph, *nothing*. Now a `.tf-state[data-state="empty"]`
using the existing `tp_reviews_empty` string (no new copy invented).

## Status grammar — PASS (migrated)

The named anti-pattern (`statusStyle` / `stateColor` CSS-string maps in the view model) is gone from
the Teacher surface. Qualification and teaching-sample cards now expose a tone **name**; CSS owns
appearance via `.tf-badge[data-tone]`.

Qualification state and *application* state deliberately stay distinct: only `Qualified` maps to
`success`; an in-progress application maps to `primary` (informational), and
`ChangesRequested` / `Rejected` / `Revoked` map to `warning`. An application in progress must never
be presented as a qualification obtained.

`statusStyle` occurrences on the Teacher surface: **3 → 0**.

## Page header convergence — PASS (migrated)

The Teacher page carried **five** competing page-title scales: 26px inline (Overview), 24px inline
(seven surfaces), `clamp(25px,3vw,34px)` (a page-local `.tf-marketplace-head`), plus two page-local
header classes. Twelve page headers now use the canonical `.tf-page-header` contract with
`data-face="sans"` — the same dashboard-family voice Admin uses.

Certified live: nine Teacher surfaces resolve to **one** computed page-title role (32px / weight
800), and no `<h1>` sets its own type scale inline.

Two headers were deliberately **not** migrated, and this is a scope decision rather than an
oversight:

- `.tf-dash-inbox-head` (Messages) is shared with the Student dashboard. Dual-classing would let the
  later-defined rule win on `font-size` while the shared rule won on face and weight — a
  half-applied contract. Editing the shared rule would restyle a surface this pass has not
  certified. Left for the Student pass.
- `.tf-market-page-head` on the **Student** request mount of `js/open-marketplace.js` is untouched;
  only the Teacher mount moved to the canonical anatomy.

The now-dead `.tf-marketplace-head` rules were removed from the page's local `<style>` block.

## Async state honesty — PASS (migrated)

Twelve state renderings (loading / error / empty) bypassed the shared grammar as styled paragraphs
and inline-bordered divs; the Opportunities board used a parallel `.tf-market-state`. All now use
`.tf-state[data-state]` with the correct `role` (`status` for loading/empty, `alert` for error).

Certified live across seven surfaces: **zero** state nodes outside the shared grammar, and every
async surface resolves to exactly one canonical state.

## Financial truth — PASS (audited, unchanged)

No amount, fee, net, settlement, wallet or lifecycle semantic was touched. Certified live:

- amounts render through the canonical money formatter, no `NaN` / `undefined` / `Infinity` leaks;
- the withdrawal decision path keeps its eligibility gate — the suite asserts the pre-action
  contract and **executes no transfer**;
- every displayed analytics figure has a backend origin. The gate derives the allowed set from
  `TeacherBusinessAnalyticsDto` rather than hand-listing names, so an invented client-side metric
  fails even if plausibly named, and a real metric never trips the gate for sounding like marketing.
  (`completionRate` and `offerSelectionRate` are real: `TeacherBusinessService` derives both from
  released ledger entries with refunds excluded.)

## Information architecture — PASS (audited, not churned)

```
Overview     overview
Work         new · opportunities · orders · sessions · messages
Marketplace  services · availability · qualifications · samples
Business     reviews · earnings · withdrawals
Account      profile · settings
```

`new`, `orders` and `sessions` are **anchors into the Overview work board**, not separate sections:
clicking them lands on Overview and scrolls to the section. That is the existing design and it is
coherent (one work board, three entry points), so it was left as-is and asserted explicitly — the
anchor target must exist and be brought into view, and the nav must remain current on Overview. It
is recorded here because the nav visually highlights *Overview* after clicking *Direct Requests*,
which a future pass may wish to revisit.

Notifications intentionally has no sidebar destination — the global bell owns it.

## Teacher CI gate — `scripts/ci/check-teacher-ux.mjs`

22 assertions covering IA membership, metric provenance, selected-offer truth, tone grammar, state
grammar, shared-foundation adoption, parser safety and money formatting.

**Bidirectionally verified.** Every assertion was mutation-tested: the mutation is applied, the gate
must fail with the right message, then the file is restored. The first run exposed **four vacuous
assertions** that passed no matter what:

| Vacuous assertion | Why it could never fail | Fix |
|---|---|---|
| All IA membership checks | The group parser sliced to the next `]}`, but a single-item group closes with `]] }`, so every group's slice ran into the next group's items | Parse groups with a proper regex; the gate now also fails if fewer than five groups parse |
| `tf-page-header` adoption | Substring test — `"tf-page-header"` also matches `"tf-page-header-text"` | Match the real element, require 11+ headers, and reject inline `<h1>` type scales |
| Dense-table inline padding | The probe cell was outside the extracted table block | Extract the real dense-table block and mutate a cell inside it |
| Metric ban | Banned names by spelling, and flagged the legitimate `completionRate` | Derive the allowed set from the backend DTO |

Final: **22/22 mutations detected, 0 undetected.** The same parser shape in the PASS 04 Admin gate
was spot-checked and is sound — its asserted groups all close with `]}`.

## Teacher browser suite — `tests/browser/teacher-ux.mjs` — 18/18

Real login, real APIs, real keyboard. No destructive financial mutation.

Three checks were rewritten after their first run because they were **passing without asserting
anything** — worth naming, since a green suite that proves nothing is worse than a red one:

- the tone checks passed on *zero* badges (the reset Development DB has no qualification data);
- the overlay check matched `.tf-chat-widget`, a permanently-present hidden `[role=dialog]`, so it
  reported success before anything opened.

**Coverage limitation, stated plainly:** the Teacher's only true overlay is the service dialog, and
opening it requires marketplace catalog rows the freshly reset Development database does not hold
for the seeded Teacher. Fabricating catalog data to manufacture a green check is exactly what this
programme forbids, so instead the suite exercises the shared `Tafseel.modal` mechanic in the live
page (scroll lock → focus → Escape → release) and reports explicitly that **the service dialog
itself was not exercised**. The static gate separately asserts the Teacher dialog is wired to that
mechanic.

The tone→appearance contract is proven by injecting one probe element per tone and reading computed
style — that tests CSS, never product data, and the probe is removed afterwards.

## Responsive · RTL · Light/Dark — `tests/browser/teacher-visual-matrix.mjs` — 64/64

64 screenshots across 375 / 390 / 768 / 1024 / 1280 / 1440, EN-Light and AR-Dark, eleven
destinations. Every screenshot is accompanied by in-page assertions: no page-level horizontal
overflow, no labelled control clipped to zero width, no unresolved `{{ }}`, and a canonical page
header present.

Navigation is by `data-nav-key`, never by label — PASS 04 produced 65 "green" screenshots that were
all the same screen because Arabic labels never matched. `data-nav-key="{{ n.key }}"` was added to
the Teacher nav for this reason, and a nav miss now fails loudly instead of being swallowed.

Evidence spot-checked by **opening** the images, not by trusting the count.

Evidence: `docs/features/evidence/teacher-ux-convergence/`

## Regression

| Check | Result |
|---|---|
| Frontend CI gates | **28 / 28 pass** (including the new Teacher gate) |
| Teacher browser suite | **18 / 18** |
| Teacher visual matrix | **64 / 64** across 64 screenshots |
| Backend tests | **303 / 303** (288 integration + 14 application + 1 architecture), 0 failed |
| `dotnet format --verify-no-changes` | clean |
| EF pending model changes | none |
| Release build | **0 errors, 0 warnings** |

## Files changed

| File | Change |
|---|---|
| `Tafseel-Teacher-Dashboard.dc.html` | tone migration; 12 page headers → shared contract; 12 states → shared grammar; Reviews empty state; `data-nav-key`; dead local CSS removed; Active Orders tone bug fixed |
| `js/open-marketplace.js` | Teacher Opportunities mount → canonical page header + `.tf-state` empty (Student mount untouched) |
| `tests/browser/lib/auth.mjs` | additive `SeedTeacher` role for a freshly reset Development DB |
| `scripts/ci/check-teacher-ux.mjs` | new, 22 assertions, bidirectionally verified |
| `tests/browser/teacher-ux.mjs` | new, 18 checks |
| `tests/browser/teacher-visual-matrix.mjs` | new, 64 assertions + 64 screenshots |

## Carried forward

- `.tf-dash-inbox-head` (Messages) and the Student `.tf-market-page-head` remain on page-local
  header CSS — deliberately deferred to the Student pass.
- The Overview-anchor nav items highlight *Overview* rather than themselves.
- The Teacher service dialog is not exercised end-to-end for lack of catalog data in the reset
  Development database.

---

# REVISION 2 — PRODUCT WORKSPACE CLOSURE

Revision 1 certified the Teacher surface's *foundation* — IA, headers, state grammar, tone grammar,
overlay mechanic. It did not answer the product question: can the Teacher actually do their job
here. This revision audits all seventeen surfaces explicitly, fixes what the audit found, and closes
the traceability the pass requires.

## Executive Verdict

Twelve surfaces were **already coherent** and are recorded as audited passes, not rewritten. Six
real defects were found and fixed. Two claims made in Revision 1 are **corrected** below.

### Corrections to Revision 1

**1. The service-dialog limitation was wrong.** Revision 1 stated the dialog could not be exercised
"because the reset Development database has no marketplace catalog rows for the seeded Teacher".
The rows exist. The earlier probe read the Services DOM before its two fetches resolved, and I
recorded a race as a data limitation. The suite now opens the real dialog and certifies the full
contract: scroll lock, focus trap, accessible name, Escape, focus return. A stated limitation that
is really a race is worse than a red test — it hides a surface nobody is testing.

**2. Backend count.** Revision 1 reported 303 tests; the full suite is **423** (120 Domain + 14
Application + 1 Architecture + 288 Integration). The Domain project was absent from the tail of the
output I read.

## Starting Teacher UX

Overview answered *what is available* and *what do I owe*, but never *can I sell yet*. Six defects
were invisible to component-level certification: three legacy state nodes on the Overview
opportunities strip, an untruthful "Earnings" heading over an order list, reviews discarding the
score and date the API returns, a Student string in the Teacher greeting, and a Messages empty state
outside the shared grammar.

## Final IA

```
Overview     overview
Work         new · opportunities · orders · sessions · messages
Marketplace  services · availability · qualifications · samples
Business     reviews · earnings · withdrawals
Account      profile · settings
```

Unchanged from Revision 1 and unchurned: `new`, `orders` and `sessions` are anchors into the
Overview work board, asserted as such.

## Overview

**PASS with two fixes.** The Overview is a real work board.

| Block | Backing data | Purpose | Actionable | Verdict |
|---|---|---|---|---|
| Greeting + summary | `PENDING` (direct requests), `liveSessions` | what needs action | actions row | PASS (copy fixed) |
| Readiness | `eligibleSubjects`, `marketplaceServices`, `availability`, `isPubliclyVisible` | what blocks selling | routes to the blocking surface | **ADDED** |
| Opportunities strip | `/open-marketplace/opportunities` | what work is available | View all / Review | PASS (states fixed) |
| Direct Requests | `/learning-requests/mine` | what was offered to me | accept / decline | PASS |
| Active Orders | `/learning-requests/assigned` | what I owe | state-aware action | PASS |
| Earnings | `/withdrawals/balances` + orders | business context | Withdraw | PASS (disclaimer fixed) |
| Live Sessions | `/live-sessions/mine` | scheduled work | state-aware action | PASS |

## Attention Model

**PASS — already truthful, not rebuilt.** The greeting summary counts real pending requests minus
declined, plus real sessions (`dash_sub_counts`). No urgency, risk, SLA or priority score exists on
the surface, and the gate now forbids introducing one.

Admin's "Needs Attention" was **not** copied here. Teacher work is already grouped by kind on one
board; a second attention list would restate the same rows. The brief's own instruction applies:
*do not create Needs Attention merely because Admin has one*.

**Copy fix:** with nothing pending, the greeting fell back to `dash_sub_empty` — *"Your learning
activity will appear here"* — a Student string shown to a Teacher. The Teacher now has its own line;
the shared Student string is untouched, because the Student surface is not certified until Pass 06.

## Marketplace Readiness

**FIXED — this was the real gap.** Nothing on the Overview told a Teacher what prevented them from
selling. Services communicates per-service state well (`enabled` / `needs_configuration` /
`available` / `unavailable`), but only once you are already there.

A blocker list now renders on the Overview, derived **only** from canonical state:

| Blocker | Canonical source |
|---|---|
| No approved Subjects | `eligibleSubjects` is empty |
| No active service | no offering with `isActive && !isSuperseded` |
| Scheduled service without availability | an active `requiresScheduling` offering + empty availability |
| Public profile hidden | `profile.isPubliclyVisible === false` |

No percentage, no score, no "profile strength". A Teacher with nothing blocking them sees **no block
at all** — certified live: *"no blockers in canonical state; the block is correctly absent"*.

**A defect I introduced, caught by the suite before it shipped.** The first implementation read
`s.eligibleSubjects` on the Overview — but the Overview deliberately does not fetch that list
(`Promise.resolve(null)` occupies its slot in the initial load). The block therefore announced *"You
have no approved Subjects"* to a Teacher who has several. The browser check cross-references every
rendered blocker against the live API, which is exactly why it failed. Readiness now loads its two
lists after first paint and stays silent until it genuinely knows — and stays silent if either
lookup fails, because a failed lookup must never become a blocker claim.

## Opportunities

**PASS with a fix.** The board shows title, Subject, deadline, budget (range or open) and a Review
action per item; no competing Teacher's name, price or proposal is exposed. All four states are
modelled. The three legacy state nodes on the Overview strip (loading / empty / error) now use the
shared grammar. Empty copy is truthful — *"No open requests currently match your approved
Subjects"* — a matching statement, not a performance implication.

## Offers

**PASS — now proven by rendering, not by reading source.** Revision 1 asserted the selected-unpaid
truth from source text, which this pass explicitly rejects as insufficient.

The live lifecycle is unreachable: submitting an offer requires an approved qualification the seeded
Teacher lacks, and driving a Quality approval to manufacture one would fabricate domain state for a
test. So the check stubs **only the transport** and lets the real `mountTeacherOpportunities` render
a status-1 offer. The asserted DOM is produced by production code; nothing is persisted.

Result: the waiting panel renders **alone** — 0 controls, no work-start action, no offer editor.
Statuses 2/4/5 return before the form on the same code path.

## Orders

**PASS.** Student, title, deadline, status tone and the Teacher's amount. Money prefers `teacherNet`
over gross `price` where the API supplies it — now gated. The action hierarchy is state-aware:
start → deliver → submit revision, plus extension respond/request and dispute eligibility, each with
a busy guard. Certified live against 2 real order rows.

## Sessions

**PASS.** Reschedule-needs-response, teacher-no-show confirmation, awaiting-student-review, mark
completed, start — each derived from real session status. Student-absent reporting is confirmed
before it fires. No presence, "online now" or recurring availability is invented from session data;
the gate forbids all such names.

## Messages

**PASS — audited, not redesigned.** Messages is a **list-only entry point**: rows open the canonical
floating chat widget via `TafseelChat.open({ conversationId })`. No thread view or composer is
rendered in the page, so there is no second inbox. Certified live, and the gate rejects any
`messageThread` / `inboxThread` / `conversationPane` appearing.

Its empty state moved to the shared grammar. `.tf-dash-inbox-head` **remains deferred** as Revision 1
justified — it is shared with the Student dashboard, and dual-classing would half-apply the header
contract.

## Services

**PASS.** Every catalog item exposes its selling state (`enabled` / `needs_configuration` /
`available` / `unavailable`) with matching filters, price, delivery or live-scheduling behaviour,
revisions, and configure/enable/disable actions with confirmation on disable. Admin-owned fields
(catalog availability, public visibility, teacher-selectable) gate configuration rather than being
presented as Teacher-editable. Certified live across 4 category groups.

## Availability

**PASS.** Exact windows with explicit start/end, an explicit timezone selector (3 zones), time-off
ranges with reasons, save/remove guarded by `availabilityBusy`. Nothing advertises presence or
invents recurring weekly hours.

## Qualifications

**PASS.** Application, in-progress, changes-requested, approved, rejected and revoked stay distinct;
only `Qualified` maps to the success tone. The dashboard routes to the canonical Apply flow and does
**not** duplicate it — certified live by asserting no upload or application form exists here.

## Samples

**PASS.** Loading / error / empty / data all modelled, per-sample status tones, add-showcase route
present. No portfolio completeness score, and no copy implying production-grade media
infrastructure.

## Reviews

**PASS with a fix.** Reviews come from `/teachers/{id}/reviews` (eligible, visible reviews only) with
anonymity handled. The rounded star glyph was the *only* signal, so a 4.4 and a 4.6 looked identical
and a 4.6 looked perfect; the exact score and the `createdAt` date the API already returns are now
both shown. No ranking, percentile or "top rated" language exists — asserted live.

## Earnings

**PASS with a fix.** Concepts exposed are exactly the API's: `available`, `pendingWithdrawal` and
their sum labelled *Tracked balance* — no invented bucket. The Earnings page carried the honest lede
*"Available balance is what you can withdraw. Orders below are your tracked work, not a second
wallet"*; the Overview repeated the same order list under an "Earnings" heading **without** it. The
canonical lede now travels with the block.

**Financial invariant:** amounts before and after this revision are identical — 2 rows, `153` and
`153`, SAR, `Payment required`. No financial semantic, amount, currency or lifecycle was touched.

## Withdrawals

**PASS.** Full pre-transfer chain certified: busy guard, payout-profile verification gate, minimum
amount, available-balance ceiling, idempotency key, error feedback. **No transfer is executed** by
any suite — the pre-action contract is asserted instead.

## Profile / Settings

**PASS.** Profile owns publication state (publish/unpublish), presentation, expertise and
certificates. Settings owns account concerns only — profile info, photo, password, MFA, email,
notifications, privacy/export, deactivation. Services, Availability and Qualifications do **not**
appear in Account settings; asserted live in both directions.

## Shared Components

Page Header · State · Table/DataList · Modal · Badge · Money — all consumed, all gated. Legacy state
nodes on the Teacher surface across both revisions: **17 → 0**.

## Financial Invariants

| Invariant | Result |
|---|---|
| Amounts unchanged | PASS — 153 / 153 SAR identical before and after |
| Currency rendering canonical | PASS — `Tafseel.money` / `moneyView` only |
| Teacher net preferred over gross | PASS — gated |
| No invented bucket | PASS — `available`, `pendingWithdrawal`, tracked sum only |
| No client-side recomputation | PASS — no NaN/undefined/Infinity rendered |
| No transfer executed for coverage | PASS |

## Responsive · RTL · Light / Dark · Accessibility

64/64 assertions across 64 screenshots at 375 / 390 / 768 / 1024 / 1280 / 1440, EN-Light and
AR-Dark, eleven destinations: no page-level horizontal overflow, no labelled control clipped to zero
width, no unresolved `{{ }}`, canonical page header present on every surface. Keyboard and focus
certified through the real service dialog (focus trap, accessible name, Escape, focus return) and
the 390px drawer. Evidence opened and inspected, not merely counted.

## Teacher Browser Suites

| Suite | Checks | Result |
|---|---|---|
| `tests/browser/teacher-ux.mjs` | 18 | **18/18** |
| `tests/browser/teacher-product-ux.mjs` | 16 | **16/16** |
| `tests/browser/teacher-visual-matrix.mjs` | 64 | **64/64** |

Split deliberately: the Development auth policy is 10 req/min and the JWT expires in 15 minutes, so
one very long run risks reporting a session expiry as a product failure.

## Teacher CI Gate

`scripts/ci/check-teacher-ux.mjs` — **41 assertions**, all mutation-tested. Revision 2 added 17 and
re-scoped 2. Three vacuous assertions were found and repaired in this revision:

| Vacuous assertion | Why it could not fail | Fix |
|---|---|---|
| Readiness derives from canonical state | Matched the identifier anywhere in the file, including unrelated projections | Scoped to the readiness derivation block |
| Invented-measure ban | Tripped on my own explanatory comment | Scan code with comments stripped |
| Greeting copy ban | Same — the comment named the string | Same |

Final: **all mutations detected, 0 undetected.**

## Debt Before / After

| Item | Before | After |
|---|---|---|
| Page-title type scales | 5 | 1 |
| Legacy state nodes | 17 | 0 |
| `statusStyle` CSS-string maps | 3 | 0 |
| Tone attributes carrying CSS | 1 (live bug) | 0 |
| Surfaces with no readiness signal | Overview | 0 |
| Student copy on Teacher surfaces | 1 | 0 |
| Reviews discarding API fields | score + date | 0 |

## Visual Evidence

`docs/features/evidence/teacher-ux-convergence/` — 66 PNGs. The readiness block does not appear in
the matrix because the seeded Teacher has **no blockers**; that absence is itself the certified
behaviour, asserted by the product suite rather than illustrated by a screenshot.

## Frontend Regression

| Suite | Result |
|---|---|
| Frontend CI gates | **28 / 28** |
| Pass 01 runtime | **18 / 18** |
| Pass 01 populated surfaces | **4 / 4** |
| Pass 03 shared components | **8 / 8** |
| Pass 04 Admin suite | **17 / 17** |
| Teacher suites | **18 / 18**, **16 / 16**, **64 / 64** |

Pass 01 surfaces and Pass 03 components were failing at login before this revision — the
`*.sprint02.uat` accounts did not survive the authorized Development DB reset. Repointed to the
Development seed's own accounts (`SeedStudent` / `SeedTeacher`), restoring real populated-data
coverage rather than leaving the suites red.

## Backend Regression · EF / Format / Build

| Check | Result |
|---|---|
| Domain | 120 / 120 |
| Application | 14 / 14 |
| Architecture | 1 / 1 |
| Integration | 288 / 288 |
| **Total** | **423 / 423**, 0 failed |
| EF pending model changes | none |
| `dotnet format --verify-no-changes` | clean |
| Release build | 0 errors, 0 warnings |

## Files Changed (Revision 2)

| File | Change |
|---|---|
| `Tafseel-Teacher-Dashboard.dc.html` | readiness model + block + deferred load; Overview opportunities states; Messages empty state; Overview earnings lede; review score + date; Teacher greeting copy |
| `scripts/ci/check-teacher-ux.mjs` | +17 assertions, 2 re-scoped, 3 vacuous assertions repaired |
| `tests/browser/teacher-product-ux.mjs` | new, 16 product-workspace checks |
| `tests/browser/teacher-ux.mjs` | overlay check now opens the real service dialog |
| `tests/browser/lib/auth.mjs` | additive `SeedStudent` |
| `tests/browser/dc-table-repeater-surfaces.mjs`, `shared-components-a11y.mjs` | repointed to seeded accounts |

## Remaining Teacher Debt

- `.tf-dash-inbox-head` (Messages header) stays on page-local CSS — shared with the Student
  dashboard, deferred to Pass 06 with justification.
- Overview-anchor nav items (`new`, `orders`, `sessions`) highlight *Overview* rather than
  themselves. Coherent, documented, not churned.
- The full offer lifecycle (submit → select → pay) is not driven end to end; it requires an approved
  qualification the seeded Teacher lacks. The selected-unpaid truth is proven by rendering the real
  module instead.

## Business Decisions Required

1. Should an Overview-anchor nav item mark itself current instead of Overview? A product call, not a
   defect.
2. Should `dash_sub_empty` be split per role platform-wide, rather than the Teacher carrying its own
   line? Deferred so the Student surface is not restyled before Pass 06.
3. Is *Tracked balance* (available + pending withdrawal) the label the business wants, or should the
   two be shown separately?

## Traceability

| Item | Status | Evidence |
|---|---|---|
| Teacher inventory | PASS | 17 surfaces audited above |
| Final IA | PASS | 5 groups, 15 destinations, suite check 1 |
| Overview | PASS | block inventory table; product check 1 |
| Attention | PASS | counted summary; product check 2 |
| Readiness | PASS | blockers cross-checked against live API; product check 3 |
| Opportunities | PASS | 4 states; suite + product checks |
| Offers | PASS | real module render; product check 4 |
| Selected-awaiting-payment truth | PASS | waiting panel alone, 0 controls |
| Orders | PASS | teacher net, 2 live rows |
| Order actions | PASS | start/deliver/revision/extension/dispute + busy guard |
| Sessions | PASS | 4 state-aware actions, no presence |
| Messages | PASS | list-only entry point, no second inbox |
| Services | PASS | 4 selling states, 4 groups live |
| Availability | PASS | timezone stated, 3 zones |
| Qualifications | PASS | Apply routed not duplicated |
| Application vs Qualification | PASS | only `Qualified` maps to success |
| Samples | PASS | states + tones, no score |
| Reviews | PASS | exact score + date, no ranking |
| Earnings | PASS | canonical concepts, wallet disclaimer |
| Withdrawals | PASS | 5-step validation chain, no transfer |
| Profile | PASS | publication control present |
| Settings | PASS | account only, no selling setup |
| Page Header | PASS | 12 headers, one type role |
| State | PASS | 17 → 0 legacy nodes |
| Table / DataList | PASS | dense contract, 0 inline padding |
| Modal | PASS | real service dialog certified |
| Badge | PASS | `data-tone`, tone-name only |
| Money | PASS | canonical formatter, teacher net |
| 375 | PASS | visual matrix |
| 390 | PASS | visual matrix (EN Light + AR Dark) |
| 768 | PASS | visual matrix |
| 1024 | PASS | visual matrix |
| 1280 | PASS | visual matrix |
| 1440 | PASS | visual matrix (EN Light + AR Dark) |
| Arabic | PASS | AR-Dark matrix, nav by key |
| English | PASS | EN-Light matrix |
| Light | PASS | visual matrix |
| Dark | PASS | visual matrix |
| Keyboard | PASS | service dialog + drawer |
| Focus | PASS | trap, initial focus, return |
| 200% zoom | PASS | Admin zoom smoke retained; no Teacher page overflow at 375 |
| Teacher CI | PASS | 41 assertions, all mutation-detected |
| Teacher browser suite | PASS | 18/18 + 16/16 |
| Visual evidence | PASS | 66 PNGs, opened and inspected |
| Pass 01 | PASS | 18/18 runtime, 4/4 surfaces |
| Pass 02 | PASS | foundation gate green |
| Pass 03 | PASS | 8/8 interaction |
| Pass 04 | PASS | 17/17 Admin + Admin gate |
| Frontend | PASS | 28/28 gates |
| Backend | PASS | 423/423 |
| EF | PASS | no pending model changes |
| Format | PASS | clean |
| Release | PASS | 0 errors, 0 warnings |

Zero rows BLOCKED. Zero rows omitted.

## Pass Closure Verdict

**CLOSED.** The Teacher Dashboard has been product-audited end to end. Overview and next-action logic
are truthful; Work, Marketplace Setup, Business and Account each communicate their actual job;
Opportunities, Offers and Orders preserve marketplace authorisation truth — with the selected-unpaid
invariant proven by rendering production code rather than reading it; qualification, availability
and service readiness are understandable, and readiness stays silent rather than guessing;
financial information is exact and untouched.

## Progress

UI/UX PROGRESS: 43% · REMAINING: 57%
