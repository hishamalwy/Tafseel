# TAFSEEL — STUDENT JOURNEY & UI CONVERGENCE IMPLEMENTATION

Date: 2026-08-16. No commit, push, deploy, Azure or Production change was performed.

## Executive Verdict

**STUDENT JOURNEY & UI CONVERGENCE BLOCKED.**

> **Superseded in part (2026-08-17).** A blocker-closure continuation closed
> the two stale gates, Open Request simplification, the searchable Subject
> picker, the role-aware Teacher Profile, the chrome audit, the Quality/Admin
> ownership questions, the real awaiting-payment evidence, and the full
> backend/frontend/EF/Release/publish/health regression. The verdict remains
> BLOCKED. See
> [STUDENT_JOURNEY_CONVERGENCE_BLOCKER_CLOSURE_2026_08.md](./STUDENT_JOURNEY_CONVERGENCE_BLOCKER_CLOSURE_2026_08.md)
> — the consolidated Part 1–30 traceability below is the current one.

> **Superseded by final certification (2026-08-17).** The format blocker is
> now CLOSED (whitespace-only, proven by hash), backend is 423/423, all 17
> frontend gates and 4 convergence gates pass, EF/Release/publish/health are
> green, and the payment tail, reservation expiry, cancellation and
> idempotency/race cases are certified. The verdict remains **BLOCKED** on a
> severe pre-existing Admin Users table rendering defect and on incomplete
> visual/responsive/RTL/accessibility certification. See
> [STUDENT_JOURNEY_FINAL_CERTIFICATION_2026_08.md](./STUDENT_JOURNEY_FINAL_CERTIFICATION_2026_08.md).

This pass delivered and verified a coherent slice of the convergence — the
context-aware Landing, the role-aware sourcing CTAs, promo-popup persistence, the
Needs Attention composition fix, and a Light Mode panel-hierarchy token — each
proven with rendered evidence. It did **not** complete the full 30-part scope. The
prompt's own hard-failure list includes items this pass did not implement or did
not certify (Open Request simplification, Subject search/Other, Teacher IA audit,
role-aware Teacher Profile, Quality/Admin ownership decisions, the full E2E
request→offer→payment journey, backend regression, format/EF/publish/health
gates). Per the stated rules, an incomplete certification is BLOCKED, not
"mostly done".

Two **pre-existing** frontend gate failures were also found (see
*Repository-Controlled Blockers*). They are not caused by this pass.

## Scope

Implemented and evidenced: Parts 1, 2 (partial — dashboard panel tier), 3, 4, 16.
Backend: one additive DTO field plus one grouped query.
Not implemented this pass: Parts 5, 6, 7, 8, 14, 15, 17, 18, 21–30.
Verified as already correct from the prior Marketplace Experience Convergence:
Parts 9, 10, 11, 13 (partially), 19.

## Pre-Implementation Evidence

The working tree was already dirty on arrival: **246 modified/untracked paths**
from prior sessions, on `main`, last commit `2681767 R9 Done`. All attribution
below is therefore stated against observed behaviour, not against `git diff`,
which conflates this pass with pre-existing uncommitted work.

Environment established: .NET 9 SDK, Node 22, Playwright Chromium present,
LocalDB instance `TafseelLocal` running with a populated `Tafseel` database.

A second Claude session was already running the app on port 5090 and holding a
lock on the shared `src/Tafseel.Api/bin/Debug/net8.0` output, which blocked
backend rebuilds. Rather than stop another session's server, this pass built and
ran its own instance on port **5099** with an isolated
`BaseOutputPath`, leaving the other session untouched.

UAT identities were prepared with the repository's own
`scripts/dev/UatIdentityReset` tool (ASP.NET Identity `UserManager` password
reset). **No raw SQL fixture mutation was performed.** SQL was used read-only,
for inspection.

### Baseline defects found by looking at the rendered product

| # | Defect | Where |
|---|--------|-------|
| 1 | Primary Student CTA rendered **"＋ No — receive offers"** | Student Dashboard overview |
| 2 | Promo dialog opened on **every** page entry, with a **1 / 3 Next/Back carousel** | Landing |
| 3 | Attention CTA buttons had **different widths per row** | Student Dashboard |
| 4 | Landing offered a Student with live requests **no continuation at all** | Landing |
| 5 | Landing hero had **no Post a Request CTA** | Landing |

## Student Dashboard Attention Fix (Part 1)

**Root cause found, not guessed.** `.tf-attention-card` was a per-card
`grid-template-columns: minmax(0,1fr) auto` where the CTA wrapped onto row 2 in
column 1. Because each card computes its own column widths, the button's width
tracked that card's meta text — `"Aug 15, 2026"`, `"108 SAR"` and `"1"` produced
three visibly different button widths down one list.

Fix: named grid areas `"body cta" / "meta cta"` so the action occupies a stable
column, is vertically centred, right-aligned, `min-width:136px`, and collapses to
full width below 560px. The panel pair keeps `align-items:stretch`; the attention
panel and its empty state now `flex:1` so the surface's content claims the shared
height instead of hugging the top.

Evidence: `after/student-dashboard/student-overview-1440-en-light.png`,
`…-1440-ar-dark.png`, `…-390-ar-light.png`, `…-390-en-dark.png`.

## Light Mode Surface Hierarchy (Part 2 — partial)

**Root cause:** in Light Mode `--surface-2` is `#F7F4EC` while the canvas `--bg`
is `#F3F0E8`. A panel filled with `--surface-2` is *lighter than the canvas by a
hair*, so only its border implied a surface at all — the reported "everything
blends into one beige".

Fix: a new `--dash-panel-muted` token on `.tf-dashboard-shell`, defined as
`color-mix(in oklab, var(--bg) 78%, var(--border))` — a *recessed* step below the
canvas rather than a near-identical lighter one. Dark Mode explicitly keeps
`--surface-2`, because dark already separates correctly by going lighter, so the
change cannot regress it. Verified in both themes.

**This is a partial delivery.** Only the dashboard panel tier was reconciled. The
global audit the prompt requires across Quality Dashboard, Admin Dashboard,
Landing modules, Open Request and Payment was **not** performed.

## Context-Aware Landing (Part 3)

For an authenticated Student with live requests, the hero's second column stops
explaining the product and continues the journey; guests, Teachers, staff and
Students with nothing live still get How Tafseel Works.

Constraints honoured: at most three rows, no filters, no tables, no history, no
account settings — a summary, not a second dashboard.

**One state engine (Part 12).** A new shared
`Tafseel.projectStudentJourney(requests)` in `js/tafseel.js` sits beside the
existing `projectStudentAttentionItems`, so Landing and the dashboard cannot
disagree about where a Student stands. Ordering is by action value: awaiting
payment → offers received → open for offers → other active. Terminal states
(Declined/Cancelled/Expired/ConvertedToOrder) are excluded as history.

**Server-authoritative reservation.** The countdown is derived from
`PaymentReservationExpiresAt`. An already-elapsed reservation renders as
*expired*, never as invented remaining minutes.

**Loading / empty / error are distinct (Part 25).** A failed load is held as
`error` and falls back to How Tafseel Works — an API failure is never converted
into "you have no requests".

Evidence — guest, Student and Teacher, each at 1440 EN light, 1440 AR dark,
390 AR light, 390 EN dark, in `after/landing/`.

**Gap:** the awaiting-payment module is implemented (including the selected
Offer's price via the canonical Riyal renderer) but is **not evidenced against
real data** — the UAT Student currently holds only Direct requests
(2 × PendingTeacherReview, 7 × Accepted) and one ConvertedToOrder open request.
Producing that state requires the full E2E below, which was not run.

## Landing CTA Changes (Part 4)

`tf-hero-actions` is now a role-aware group:

| Viewer | Primary | Secondary | Teacher join |
|--------|---------|-----------|--------------|
| Guest / Student | **Post a Request** | Browse teachers | shown |
| Teacher | **View opportunities** | Teacher dashboard | hidden |
| Admin / Quality | **Open dashboard** | — | hidden |

A Teacher is never asked to post a Student request; staff are never offered
Student conversion. "Become a teacher" is a guest recruitment path and is hidden
once the viewer holds a Tafseel role. Until the session resolves the page shows
the public Student path, which is both the common case and the correct guest
experience, so no CTA flashes into something else.

The Student Dashboard's broken CTA was traced to `sd_request_route_offers` /
`sd_request_route_direct` — the *Yes/No answer labels* of a route-chooser question
that no longer exists, rendered as standalone buttons. Rebound to
`nav_post_request` / `nav_browse`, with a new `sd_create_actions_label` group
label added in EN and AR.

Evidence: `after/landing/landing-teacher-1440-en-light.png` (View opportunities,
no Student CTA) and `after/student-dashboard/student-overview-1440-en-light.png`.

## Promo Behaviour (Part 16)

Previously the dialog opened on **every** entry — the code comment said so
explicitly — and presented three campaigns as a Next/Back/dots carousel.

Delivered:

* **One primary promo.** Carousel removed: no dots, no Back, no `n / m` counter.
* **Per-campaign engagement**, keyed on the campaign's own `Guid` id, recording
  `seenAt` / `dismissedAt` / `claimedAt` (`Tafseel.campaignEngagement`,
  `recordCampaign`, `campaignIsEligible` in `js/tafseel.js`). Storage failures
  degrade to "show it", never to a thrown error. The store is bounded to 60 ids.
* **A dismissal cooldown.** Per-campaign eligibility alone still let a backlog be
  drip-fed one dialog per refresh — the same interruption as the carousel, only
  slower. This was found by testing, not assumed: the first fix passed every
  assertion except the reload check, because dismissing campaign 1 promoted
  campaign 2. After any dismissal or claim, auto-open goes quiet for 24h; the
  campaign itself is never re-shown at all.

Verified by a new behavioural gate, `tests/browser/convergence-promo-gate.mjs`
— 13/13 assertions pass, including that a campaign the visitor never dismissed
still shows once the cooldown lapses, so dismissal cannot permanently silence
marketing.

## Backend

One additive change, to give Landing and the dashboard a truthful Offer count
without an N+1:

* `LearningRequestDto` gains optional `int? OfferCount` (null for Direct
  requests, which are never offered against).
* `OrderService.RequestPageAsync` resolves counts for the page's open-sourced
  rows with **one grouped query**, excluding `Withdrawn` and `Expired` so the
  number matches `OpenRequestDto.OfferCount` on the request detail surface.

No parallel domain workflow was created. `LearningRequest`, `TeacherOffer`, the
two-hour reservation, the Payment pipeline and the Order lifecycle are unchanged.
No migration is required (no schema change).

## Files Changed (this pass)

| File | Change |
|------|--------|
| `Tafseel-Landing.dc.html` | Journey module markup + bindings; role-aware hero actions; promo persistence lifecycle; single-campaign wizard |
| `Tafseel-Student-Dashboard.dc.html` | CTA label rebinding |
| `css/tafseel.css` | `.tf-hero-action*`, `.tf-journey-*`, attention grid areas, `--dash-panel-muted` |
| `js/tafseel.js` | `campaign*` engagement helpers; `projectStudentJourney`; status constants |
| `js/locales.js` | `sd_create_actions_label` (EN + AR) |
| `src/Tafseel.Application/Orders/OrderContracts.cs` | `LearningRequestDto.OfferCount` |
| `src/Tafseel.Infrastructure/Orders/OrderService.cs` | Grouped Offer-count query; `Map` overload |
| `tests/browser/convergence-shots.mjs` | New evidence harness (scroll-settles reveals before capture) |
| `tests/browser/convergence-promo-gate.mjs` | New Part 16 behavioural gate |
| `.claude/launch.json` | Isolated dev server on 5099 |

## Frontend Tests

Run against the working tree:

| Gate | Result |
|------|--------|
| check-auth-ui, check-localization, check-frontend-integrity | PASS |
| check-guided-request, check-sprint6-notification-routing | PASS |
| check-release6-discovery, check-release7-marketplace-intelligence | PASS |
| check-release9-ai-assisted-marketplace, check-unified-discovery-search | PASS |
| check-template-placeholder-leak, check-localization-usage | PASS |
| check-open-marketplace, check-service-catalog-release1 | PASS |
| check-release5-order-communication, check-teacher-profile-mobile-cta | PASS |
| **check-auth-return** | **FAIL — pre-existing** |
| **check-bug001-display-names** | **FAIL — pre-existing** |
| convergence-promo-gate (new) | PASS 13/13 |

## Repository-Controlled Blockers

Both failures are pre-existing in the uncommitted working tree and were **not**
introduced by this pass:

1. **`check-auth-return.mjs`** asserts `js/tafseel.js` contains
   `roles.indexOf('Student') … return 'Tafseel-Browse-Teachers.dc.html'`. That
   string is absent from `js/tafseel.js` **at `HEAD`** as well — verified with
   `git show HEAD:js/tafseel.js`. `dashboardHrefForSession` returns
   `Tafseel-Student-Dashboard.dc.html` for a Student. Either the product
   intentionally changed the Student landing and the gate was never updated, or
   the shared helper regressed. **This needs a product decision, not a silent
   edit**, so it was left alone.
2. **`check-bug001-display-names.mjs`** asserts `Tafseel-Teacher-Profile.dc.html`
   contains `showTimeline: timeline.length > 0`. That file was never opened for
   writing in this pass.

## Deferred Items — NOT done in this pass

Stated plainly so nothing here reads as delivered:

* Part 5 Landing dead-space composition; Part 6 dynamic ambient background.
* Part 7 Open Request form simplification; Part 8 searchable Subject picker and
  the safe "Other" path. **No fake `SubjectId` was created** — the risk the
  prompt names was avoided by not shipping the feature, not by shipping it
  unsafely.
* Parts 14/15 low-value chrome audit (Learning Preferences, Live Sessions) and
  role-aware Teacher Profile self-conversion actions.
* Parts 17/18 Quality complaint ownership and Admin staff-access separation.
* Parts 20–24 full visual-system, responsive, RTL and accessibility
  certification beyond the four-cell matrix captured for changed surfaces.
* Parts 28/29 adversarial screenshot review at the demanded volume, and the
  full Student and Teacher E2E journeys.
* Part 30 backend regression, `dotnet format --verify-no-changes`, EF
  `has-pending-model-changes`, Release build, isolated publish smoke,
  `/health/live` and `/health/ready` verification.


## Traceability — consolidated Parts 1–30

Statuses are only IMPLEMENTED / ALREADY CORRECT / BLOCKED / NOT APPLICABLE.
Anything partial is BLOCKED. Evidence paths are relative to
`docs/features/evidence/student-journey-convergence/`.

| # | Requirement | Status | Evidence | Files | Test |
|---|---|---|---|---|---|
| 1 | Needs Attention composition + equal height | IMPLEMENTED | `after/student-dashboard/*` | Student Dashboard, `css/tafseel.css` | 4-cell matrix |
| 2 | Light Mode surface hierarchy (global audit) | BLOCKED | dashboard tier only (`--dash-panel-muted`); Quality/Admin/Payment/Open Request not audited | `css/tafseel.css` | light+dark dashboard |
| 3 | Landing context-aware My Requests | IMPLEMENTED | `after/landing/landing-student-*` | Landing, `js/tafseel.js` | 4-cell matrix |
| 3b | Landing Action Required (awaiting payment) | IMPLEMENTED | `closure/e2e/01-landing-awaiting-payment.png` | Landing, `js/tafseel.js` | `convergence-e2e` |
| 4 | Post a Request primary + role-aware CTA | IMPLEMENTED | `after/landing/landing-teacher-*` | Landing, `css/tafseel.css` | 4-cell matrix |
| 5 | Landing dead-space composition | BLOCKED | not performed | — | — |
| 6 | Subtle dynamic background | BLOCKED | not performed (static composition not closed) | — | — |
| 7 | Open Request form simplification | IMPLEMENTED | `closure/open-request/*` | Open Marketplace page, `js/open-marketplace.js` | `convergence-open-request-gate` |
| 7b | Title derived, not asked | IMPLEMENTED | E2E title "Explain integration by parts, chapter 4" | `js/open-marketplace.js` | `convergence-open-request-gate` |
| 7c | Deadline day+time, no past date | IMPLEMENTED | `min` floor + submit check | `js/open-marketplace.js` | `convergence-open-request-gate` |
| 7d | Budget optional, no 0 SAR | ALREADY CORRECT | unchanged | — | `convergence-open-request-gate` |
| 8 | Searchable Subject picker | IMPLEMENTED | `closure/open-request/*` | Open Marketplace page, `css/tafseel.css` | `convergence-open-request-gate` |
| 8b | Safe "Other Subject" path | BLOCKED (BUSINESS) | no mapping workflow, no support endpoint; truthful refusal shipped | Open Marketplace page | `convergence-open-request-gate` |
| 9 | My Requests (Direct + Open) | ALREADY CORRECT | prior convergence pass | Student Dashboard | `check-open-marketplace` |
| 10 | Offers belong to Request | ALREADY CORRECT | no top-level Offers nav | Student Dashboard | `check-open-marketplace` |
| 10b | Offer count without N+1 | IMPLEMENTED | E2E `offerCount = 1` | `OrderContracts.cs`, `OrderService.cs` | `convergence-e2e` |
| 11 | Profile return continuity | ALREADY CORRECT | sessionStorage, not query string | Teacher Profile | `check-open-marketplace` |
| 12 | One canonical state engine | IMPLEMENTED | Landing 120 min / Needs Attention 119 min, same request | `js/tafseel.js` | `convergence-e2e` |
| 13 | Teacher Opportunities inside shell | ALREADY CORRECT | grouped under Work | Teacher Dashboard | `check-open-marketplace` |
| 13b | Direct Requests vs Opportunities labelling | BLOCKED | not audited this pass | — | — |
| 14 | Hide low-value chrome | IMPLEMENTED | Learning Preferences gated; Live Sessions kept on evidence | Student Dashboard | grep audit + `Phase6LiveSessionTests` |
| 15 | Role-aware Teacher Profile | IMPLEMENTED | `closure/profile/teacher-self-view-*`, `teacher-student-view-*` | Teacher Profile, `js/locales.js` | `convergence-role-profile-gate` |
| 16 | Promo persistence, no carousel | IMPLEMENTED | reload test | Landing, `js/tafseel.js` | `convergence-promo-gate` |
| 17 | Quality complaints ownership | ALREADY CORRECT | Quality has no dispute permission; Quality UI has 0 refs, Admin 35 | `Authorization.cs` | permission audit |
| 18 | Admin Staff & Access | BLOCKED (BUSINESS) | `db.Users` unfiltered mixes staff; no escalation policy | `GovernanceService.cs` | documented |
| 19 | Open Marketplace presentation reduced | ALREADY CORRECT | public Post a Request entry | Open Marketplace page | `check-open-marketplace` |
| 20 | Three visual families only | ALREADY CORRECT | no fourth system introduced | — | `check-frontend-integrity` |
| 21 | Request/Landing visual quality | IMPLEMENTED | compact rows, no card wall | `css/tafseel.css` | visual review |
| 22 | Responsive full matrix (375–1440) | BLOCKED | only 1440 + 390 captured for changed surfaces | — | 4-cell matrix |
| 23 | RTL audit | IMPLEMENTED (changed surfaces) | `after/landing/*-ar-*`, `closure/open-request/*-ar-*` | Landing, CSS | visual review |
| 24 | Accessibility certification | BLOCKED | combobox keyboard/ARIA covered; full audit not run | `js/open-marketplace.js` | `convergence-open-request-gate` |
| 25 | Loading / empty / error distinct | IMPLEMENTED | API error never becomes empty state | Landing | code + fallback path |
| 26 | Evidence directory | IMPLEMENTED | `before/`, `after/`, `closure/` | — | — |
| 27 | Screenshot matrix | BLOCKED | required 4 cells captured; full per-surface matrix not | — | — |
| 28 | Adversarial visual review | IMPLEMENTED | found CTA-width, self-favourite/self-message, login-page capture | — | fixes re-verified |
| 29 | Product flow E2E | BLOCKED | publish→offer→select→AwaitingPayment proven; payment→Order not run | `convergence-e2e.mjs` | `convergence-e2e` |
| 29b | Attachment/eligibility security | IMPLEMENTED | anonymous 401 on opportunity + request | — | `convergence-e2e` |
| 30 | Backend regression | IMPLEMENTED | 1 + 120 + 14 + 287 = **422/422** | — | `dotnet test` |
| 30b | Frontend gates | IMPLEMENTED | **17/17** + 3 new gates | `scripts/ci/*` | gate sweep |
| 30c | `dotnet format` | BLOCKED | 8 pre-existing files, none touched here | — | `--verify-no-changes` |
| 30d | EF pending model changes | IMPLEMENTED | clean | — | `dotnet ef` |
| 30e | Release build | IMPLEMENTED | 0 errors, 0 warnings | — | `dotnet build -c Release` |
| 30f | Isolated publish + health | IMPLEMENTED | `/health/live` 200, `/health/ready` 200 | — | publish smoke |
| — | Reservation expiry / cancellation | BLOCKED | not certified | — | — |
| — | Payment idempotency / races | BLOCKED | not certified this pass | — | — |

## Final Verdict

**STUDENT JOURNEY & UI CONVERGENCE BLOCKED** — see
[the closure report](./STUDENT_JOURNEY_CONVERGENCE_BLOCKER_CLOSURE_2026_08.md)
for what this continuation closed and what remains.
