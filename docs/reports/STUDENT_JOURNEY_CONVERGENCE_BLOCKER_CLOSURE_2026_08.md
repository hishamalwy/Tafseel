# TAFSEEL — STUDENT JOURNEY CONVERGENCE BLOCKER CLOSURE

Continuation of
[STUDENT_JOURNEY_AND_UI_CONVERGENCE_IMPLEMENTATION_2026_08.md](./STUDENT_JOURNEY_AND_UI_CONVERGENCE_IMPLEMENTATION_2026_08.md).
Date: 2026-08-17. No commit, push, deploy, Azure or Production change was performed.

## Executive Verdict

**STUDENT JOURNEY & UI CONVERGENCE BLOCKED.**

> **Superseded by final certification (2026-08-17).** The format blocker is
> now CLOSED (whitespace-only, proven by hash), backend is 423/423, all 17
> frontend gates and 4 convergence gates pass, EF/Release/publish/health are
> green, and the payment tail, reservation expiry, cancellation and
> idempotency/race cases are certified. The verdict remains **BLOCKED** on a
> severe pre-existing Admin Users table rendering defect and on incomplete
> visual/responsive/RTL/accessibility certification. See
> [STUDENT_JOURNEY_FINAL_CERTIFICATION_2026_08.md](./STUDENT_JOURNEY_FINAL_CERTIFICATION_2026_08.md).

This continuation closed the two stale frontend gates, the Open Request
simplification, the searchable Subject picker, the role-aware Teacher Profile,
the low-value chrome audit, the Quality/Admin ownership questions, and — most
importantly — produced the **real awaiting-payment evidence** the previous pass
could not, by driving a genuine Student → Teacher → Offer → Select journey
through the application's own API. Backend is 422/422, all 17 frontend gates
pass, three new behavioural gates pass, EF is clean, Release builds 0/0, and the
isolated publish smoke returns 200 on both health endpoints with every change
present in the published output.

It is **BLOCKED** on two counts, stated plainly rather than rounded away:

1. `dotnet format --verify-no-changes` fails on **8 files this pass never
   touched** — pre-existing whitespace violations in the already-dirty working
   tree. Phase 0 of the governing prompt forbids overwriting unrelated work, and
   another session is actively running against those files, so they were not
   reformatted. This is a one-command fix, but it is not this pass's to make.
2. Several original Parts remain **NOT DONE** (Landing dead-space composition,
   dynamic background, global Light Mode audit beyond the dashboard tier,
   payment completion through to Order, reservation-expiry and idempotency
   certification, full responsive/RTL/accessibility matrices). Under the stated
   rule — *if something is partial, status = BLOCKED* — these cannot be dressed
   as complete.

## Previous Blocked State

The prior report left these open: Parts 5, 6, 7, 8, 14, 15, 17, 18, 21–30, plus
`check-auth-return` and `check-bug001-display-names` failing, and the
awaiting-payment module implemented but unevidenced.

## Closure Checklist

| From prior report | Now |
|---|---|
| check-auth-return FAIL | **CLOSED** — canonical rule implemented + gate rewritten |
| check-bug001-display-names FAIL | **CLOSED** — equivalence proven, gate re-pinned |
| P7 Open Request simplification | **CLOSED** |
| P8 Subject search | **CLOSED** |
| P8 Subject "Other" | **CLOSED as BUSINESS DECISION BLOCKER** (no unsafe path shipped) |
| P15 Role-aware Teacher Profile | **CLOSED** |
| P14 Low-value chrome | **CLOSED** |
| P17 Quality complaints ownership | **CLOSED — already correct in code** |
| P18 Admin staff access | **BUSINESS DECISION BLOCKER** (finding documented) |
| P3 Awaiting-payment evidence | **CLOSED — real state, real screenshots** |
| P21 Backend regression | **CLOSED** — 422/422 |
| P22 Frontend regression | **CLOSED** — 17/17 + 3 new gates |
| P23 EF / Release build | **CLOSED** |
| P24 Publish / health | **CLOSED** |
| P23 dotnet format | **BLOCKED — pre-existing, 8 untouched files** |
| P4/P5 Landing composition, P6 background | **NOT DONE** |
| P6 Global Light Mode audit | **NOT DONE beyond dashboard tier** |
| P14 payment→Order, P15 expiry, P16 idempotency | **NOT DONE** |
| P17–P19 responsive / RTL / a11y full matrices | **NOT DONE** |

## Auth Return Decision

Implemented the canonical rule exactly as specified:

**explicit safe continuation target → role home.**

`Tafseel.roleHomeHref(roles)` is the single source: Student → the context-aware
Landing (it now carries their Requests, Offer counts and awaiting-payment
action, so it continues the journey instead of restarting discovery); Teacher →
Teacher Dashboard; Admin → Admin Dashboard; Quality → Quality Dashboard.

Two deliberate refinements over a literal reading:

* `?return=` is now honoured for **every** role, not only pure Students. Sign-in
  interrupted a journey; it is not the destination. Safety is unchanged —
  `safeAppReturnHref` admits only same-origin application pages and
  authorization remains server-side.
* A Teacher who has **not** finished onboarding is still routed by lifecycle
  first, ahead of both the return target and the role home, or they land on a
  workspace they cannot yet use.

The obsolete Browse Teachers default was **not** restored to satisfy the test.
Both `check-auth-return.mjs` and `check-auth-ui.mjs` were rewritten to pin the
new rule, including a `doesNotMatch` assertion that prevents the old default
from creeping back.

## Display Name Gate

`check-bug001-display-names` asserted `showTimeline: timeline.length > 0`. The
current profile has no `timeline` at all — so the gate was traced before being
touched.

**Finding:** the feature was not removed. A later redesign **split** the single
combined credential timeline into two independently labelled sections —
`showCertifications: certifications.length > 0` and
`showExperience: experience.length > 0`.

**Equivalence proven:** both empty → nothing renders (identical to the old
combined gate); either populated → renders, now under a correct heading rather
than a generic one. No empty-state placeholder is emitted for either;
`tp_timeline_empty` survives in `locales.js` as an orphaned key that no surface
references. The gate was re-pinned to the new bindings *after* proving this — it
was not weakened.

## Open Request Simplification

Canonical structure now: **Subject → Service → What do you need? → Files →
Deadline → Budget → Review & Publish.**

* **Title removed from the form.** It is `[Required, NotWhiteSpace,
  StringLength(200)]` on `CreateOpenLearningRequest`, so it is now *derived*:
  first meaningful sentence of the requirements, whitespace-collapsed, cut on a
  word boundary at 90 chars with an ellipsis, falling back to
  `Subject · Service` when too short. Deterministic string handling — **no model,
  no generation**. The derived title is visible in the Review step before
  anything is published, and the real request published during E2E carried
  "Explain integration by parts, chapter 4".
* **Requirements is the writing surface** — 6 rows, its own hint ("Write the
  part you need explained. If you upload a file, say what you need from it."),
  matching the intended Arabic phrasing.
* **Service stays async-only**, which already matched backend truth (the server
  rejects scheduled services here).
* **Deadline** carries a future floor (`min` = now + 1h) plus an explicit
  submit-time check; the server remains authoritative.
* **Budget** unchanged — optional, open-to-offers or a validated range, never
  `0 SAR` for open.
* **Visibility consent moved to the Review step** and now gates the irreversible
  Publish button. It was mid-form ceremony before; it belongs at the point where
  the Student actually decides to expose the request and its files. The consent
  artifact is preserved, not dropped.
* Submit label corrected to **"Continue to review"** — it previously read
  "Submit request" for a button that only opens the review step.

## Searchable Subject

An ARIA 1.2 combobox replaces the long `<select>`: type to filter (EN and AR
names), Up/Down to move, Enter to commit, Escape to close, clear button, and a
blur reconciliation that commits an exact typed match or clears.

**The committed value is only ever a real canonical `SubjectId`**, written to a
hidden input from the catalogue entry itself. Typing invalidates any previous
commit, and unmatched free text clears rather than lingering — so no path
invents a Subject client-side. Because a hidden input is exempt from constraint
validation, the SubjectId is checked explicitly at submit.

## Other Subject Safety

Investigated the domain before building anything:

* `LearningRequest.SubjectId` **is** nullable (`Guid?`), so a null subject is
  structurally possible.
* But `CreateOpenLearningRequest.SubjectId` is a required `Guid`, Open
  Marketplace eligibility matches Teachers by **exact SubjectId qualification**,
  and there is **no** `RequestedSubjectText`, **no** `SubjectResolutionStatus`,
  **no** mapping workflow and **no** support/contact endpoint anywhere in the
  solution.

A safe Other path therefore needs new domain fields, a migration, an eligibility
guard, and — critically — an **unmatched-Subject routing policy that does not
exist**: who maps it, on what SLA, and what the Student sees meanwhile.

**Shipped instead:** a truthful "Can't find your subject?" disclosure that
states Tafseel does not cover that subject yet, explains no qualified Teacher
could receive the request, and keeps the picker open. It collects no free text,
creates no draft, and cannot publish. Gate-asserted: no
`requestedSubjectText` field is submitted, and publish is blocked without a
canonical SubjectId.

**BUSINESS DECISION BLOCKER — SUBJECT MAPPING WORKFLOW NOT YET DEFINED.** No
fake SubjectId, no unsafe matching, no invented policy.

## Role-Aware Teacher Profile

A Teacher opening their own public profile previews it; they do not shop on it.

Self-view now suppresses **Request this Teacher**, **Book**, the mobile purchase
bar, **Message** and **Save teacher**, and offers **Manage services** +
**Edit profile** with the note *"This is how Students see your public profile."*
**Share** is kept — sharing your own profile is legitimate.

Adversarial review caught two the first implementation missed: `Message` and
`Save teacher` live in the identity row (`.tf-mkp-idacts`), a different block
from the service shelf, so a Teacher could still message and favourite
themselves. Both fixed; the gate now checks **both** action regions.

**A false-positive was caught and corrected.** The first gate run "passed" the
no-purchase-action assertions against `teacher.sprint02.uat` — whose public
profile returns **404** (only the 3 seeded teachers are publicly discoverable).
Nothing rendered, so every "action absent" assertion passed vacuously. The gate
now runs against a genuinely published teacher and asserts the profile actually
renders before judging anything.

Student view verified unchanged in the same run.

## Low-Value Chrome

**Learning Preferences — HIDDEN, domain preserved.** `StudentLearningPreferences`
is persisted, returned on the session, and purged on account deletion, but
grepping the whole solution finds **no consumer** in matching, teacher search,
request creation, offer eligibility, ranking or delivery — only
`AuthenticationService` (read for the session, deleted on erasure). A settings
surface that changes nothing is dead chrome. The UI is gated behind
`showLearningPreferences: false`; the table, migration, API and stored rows are
untouched, so flipping one boolean restores it the moment a real consumer exists.

**Live Sessions — KEPT.** Evidence-first, not assumed: a full
`LiveSessionService`, a settlement worker, a link provider, `live_session` in the
canonical service catalogue with Teachers actively offering it, and passing
`Phase6LiveSessionTests`. This is an active feature, so hiding it would have been
the wrong call.

## Quality Complaints

**Not ambiguous — already answered by the code.** `Authorization.ForRole`:

* `Roles.Admin` → `All` (includes `DisputesResolve`).
* `Roles.QualityReviewer` → **exactly** `TeachersReviewApplications`,
  `TeachersReviewShowcases`, `ReportsView`. **No dispute permission at all.**

So Admin/Operations owns complaint and dispute resolution; Quality owns
teaching-quality review. The UI already matches exactly: the Quality Dashboard
contains **zero** dispute/complaint references, the Admin Dashboard contains 35.

Adding a Quality Complaints tab would call endpoints Quality is not authorized
for and 403. **ALREADY CORRECT — no change made, and deliberately so.**

## Admin Staff & Access

**Finding:** `GovernanceService.GetUsersAsync` queries `db.Users` **unfiltered**,
so privileged Admin and QualityReviewer accounts appear in the same customer
table as Students and Teachers, alongside a `PUT users/{id}/roles`
(`UsersManage`) mutation.

A correct **Staff & Access** separation needs policy that does not exist in the
repository: who may grant or revoke Admin, whether self-demotion is blocked,
whether the last Admin is protected, and what is audited. Building a
role-management surface without those answers risks privilege escalation.

**BUSINESS DECISION BLOCKER — PRIVILEGED ROLE MANAGEMENT POLICY UNDEFINED.** No
escalation UI was created. Least privilege preserved.

## Awaiting Payment — real evidence

`tests/browser/convergence-e2e.mjs` drives the real journey through the
application's own authenticated API client (`Tafseel.api` evaluated in a
logged-in page). No forged tokens, no raw SQL.

Verified in one run:

| Step | Result |
|---|---|
| Student publishes an Open Request | `39705b82…` status **5 (OpenForOffers)** |
| Qualified Teacher sees the Opportunity | yes |
| Anonymous opens the Opportunity | **401** |
| Anonymous reads the Student request | **401** |
| Qualified Teacher submits an Offer | `db7b7d0e…` |
| Student request list carries Offer count | **offerCount = 1** |
| Student selects the Offer | ok |
| Request state | **6 (AwaitingPayment)** |
| Reservation | server-issued, **120 min** exactly |
| Landing | **ACTION REQUIRED** + Continue to payment |
| Needs Attention | **Payment due** + Pay now, *"Reservation expires in 119 min"* |
| Teacher's own Offer | **Selected** (waiting for payment) |

Landing and Needs Attention named the same request with the same
server-authoritative reservation, from the one shared `projectStudentJourney`
projection — the Part 12 requirement, demonstrated rather than asserted.

Evidence: `closure/e2e/01-landing-awaiting-payment.png`,
`closure/awaiting-payment/student/…`, `closure/awaiting-payment/teacher/…`.

An early capture attempt screenshotted the **login page** because the working
context had spent its session; the harness now uses a freshly authenticated
context per evidence page and throws if it lands on Auth, so a lost session can
never again be captured as if it were the product.

## Backend Regression

| Suite | Result |
|---|---|
| Architecture | **1 / 1** |
| Domain | **120 / 120** |
| Application | **14 / 14** |
| Integration | **287 / 287** |
| **Total** | **422 / 422** |

An initial run showed 3 integration failures
(`Migration_repairs_duplicates…`, `Migration_contains_deterministic_backfill…`,
`Code_migration_backfills…`). Root-caused, not excused: these tests resolve
migration `.cs` files relative to the test output directory, and the isolated
`BaseOutputPath` used to avoid the concurrent session's file lock broke that
resolution. Re-run with the default output path: **287/287, 0 failed.** Not a
product defect.

## Frontend Regression

All 17 canonical gates pass, including the two previously failing ones.

Two regressions were introduced during this pass and fixed:

* `check-auth-ui` still asserted `roles.includes('Student')` for the return
  scope — updated to the canonical rule.
* `check-localization` caught two genuinely unregistered strings I introduced
  (`Clear subject`, `Describe what you're stuck on…`). The gate was right; the
  markup was corrected to the registered values rather than the gate relaxed.

New behavioural gates:

| Gate | Checks |
|---|---|
| `convergence-promo-gate` | 13 — single campaign, dismissal persistence, no backlog drip-feed, cooldown lapse |
| `convergence-open-request-gate` | 17 — no Title field, consent relocated, async-only service, deadline floor, combobox filter/keyboard/commit, free text cannot become a Subject, publish blocked without canonical SubjectId |
| `convergence-role-profile-gate` | 13 — self-view suppression across both action regions, owner actions, Student view unchanged, plus anti-vacuous-pass and session guards |

## Format / EF / Release / Publish / Health

| Gate | Result |
|---|---|
| `dotnet format --verify-no-changes` | **FAIL — pre-existing, see blockers** |
| EF `has-pending-model-changes` | **Clean** — "No changes have been made to the model since the last migration" |
| `dotnet build -c Release` | **0 errors, 0 warnings** |
| Isolated publish | **Succeeded** |
| `/health/live` (Staging, :5123) | **200** |
| `/health/ready` (Staging, :5123) | **200** |

`OfferCount` needed no migration — it is a computed projection, not a stored
column, which is why EF stays clean.

The publish smoke initially returned **400** on every endpoint. Not a defect:
`appsettings.Staging.json` sets `AllowedHosts: "tafseel.runasp.net"`, so host
filtering correctly rejected `127.0.0.1`. Re-run with the proper `Host` header:
all 200, and `roleHomeHref`, `data-subject-picker`, `data-owner-action`,
`tf-journey-card` and `campaignDialogCoolingDown` all confirmed present in the
published output. The isolated instance was stopped afterwards.

## Files Changed (this continuation)

| File | Change |
|---|---|
| `Tafseel-Auth.dc.html` | Canonical post-login destination |
| `js/tafseel.js` | `roleHomeHref` |
| `Tafseel-Open-Marketplace.dc.html` | Simplified form, Subject combobox, consent relocated |
| `js/open-marketplace.js` | `mountSubjectPicker`, `deriveRequestTitle`, deadline floor, consent gating, attribute i18n |
| `js/open-marketplace-locales.js` | New EN + AR keys |
| `Tafseel-Teacher-Profile.dc.html` | `viewerIsOwner`, owner actions, self-view suppression |
| `js/locales.js` | Owner-action keys (EN + AR) |
| `Tafseel-Student-Dashboard.dc.html` | Learning Preferences gated off |
| `css/tafseel.css` | Subject picker, owner note |
| `scripts/ci/check-auth-return.mjs`, `check-auth-ui.mjs`, `check-bug001-display-names.mjs` | Re-pinned to canonical behaviour |
| `tests/browser/convergence-{e2e,open-request-gate,role-profile-gate}.mjs`, `lib/auth.mjs` | New gates + `PublishedTeacher` role |

## Business Decision Blockers

1. **Subject mapping workflow undefined** — blocks a canonical "Other Subject"
   path. UI safely refuses rather than publishing something unanswerable.
2. **Privileged role management policy undefined** — blocks a Staff & Access
   surface. No escalation UI created.

Neither blocks the shipped user path: both are safely hidden.

## Repository-Controlled Blockers

1. **`dotnet format` fails on 8 untouched files** —
   `src/Tafseel.Domain/Governance/Governance.cs`,
   `src/Tafseel.Infrastructure/Governance/GovernanceService.cs`,
   `.../Identity/AuthenticationService.cs`, `.../Marketplace/MarketplaceService.cs`,
   `.../Orders/OpenMarketplaceService.cs`,
   `tests/Tafseel.IntegrationTests/{AuthenticationTests,Phase6LiveSessionTests,Phase7FinancialTests}.cs`.
   None were edited here. Fix: `dotnet format Tafseel.sln`.
2. **Parts still NOT DONE** — Landing dead-space composition (P5), dynamic
   background (P6), global Light Mode audit beyond the dashboard tier (P2),
   payment completion → Order (P14 tail), reservation-expiry (P15) and payment
   idempotency (P16) certification, and the full responsive / RTL / accessibility
   matrices (P17–P19).

## Known Test Issue

The Development auth policy is 10 req/min. Running the three convergence gates
back-to-back can exhaust it, dropping a session mid-gate — the Teacher Profile
then renders publicly and the self-view assertions invert. `convergence-role-profile-gate`
now detects a missing session and exits **2** with a "re-run alone" message
rather than reporting a false product failure. Run alone: **13/13.**

## Final Verdict

**STUDENT JOURNEY & UI CONVERGENCE BLOCKED.**
