# TAFSEEL — FINAL STUDENT JOURNEY CERTIFICATION

Date: 2026-08-17. No commit, push, deploy, Azure or Production change was performed.

Follows
[the implementation report](./STUDENT_JOURNEY_AND_UI_CONVERGENCE_IMPLEMENTATION_2026_08.md)
and [the blocker-closure report](./STUDENT_JOURNEY_CONVERGENCE_BLOCKER_CLOSURE_2026_08.md).

## Executive Verdict

**STUDENT JOURNEY & UI CONVERGENCE BLOCKED.**

> **Superseded by visual & admin closure (2026-08-17).** The Admin Users
> blank-row defect was root-caused to HTML foster-parenting of `<sc-for>`
> inside `<tbody>` — a systemic issue affecting **13 tables across 4 pages**,
> not one panel. It remains BLOCKED pending a shared `support.js` runtime
> decision. See
> [FINAL_VISUAL_AND_ADMIN_CLOSURE_2026_08.md](./FINAL_VISUAL_AND_ADMIN_CLOSURE_2026_08.md).

Every release and financial-integrity gate this pass set out to close is now
green: `dotnet format` passes, backend is **423/423**, all **17** frontend gates
plus **4** behavioural convergence gates pass, EF is clean, Release builds 0/0,
the isolated publish returns **200 Healthy** on both endpoints, and the payment
tail is proven end to end — one legitimate payment produces **exactly one
canonical Order** at the selected Offer's price, with the reservation consumed,
the winner Accepted and the loser NotSelected.

It is BLOCKED on one **severe visual defect** and on visual certification that
this pass did not complete:

1. **The Admin Dashboard Users table renders 8 loaded users as a single blank
   row.** The API returns all 8 records correctly, so this is a rendering defect,
   not a data one. It sits in `Tafseel-Admin-Dashboard.dc.html`, a file this pass
   never edited, and root-causing a DC-runtime binding failure there is outside
   this certification's scope — but it is a real, repository-controlled, severe
   visual defect, and the stated rule is that no such defect may remain.
2. Landing dead-space composition, the global Light Mode token audit beyond the
   dashboard tier, and the full responsive / RTL / accessibility matrices were
   not completed. Partial means BLOCKED.

## Scope of This Pass

Certification only. No domain change, no new product feature, no IA rework. The
sole production-code changes were the whitespace-only formatter run and one new
integration test.

## Preserved Verified Work

Nothing on the preserve list was modified. The context-aware Landing, role homes,
auth-return precedence, role-aware CTAs, My Requests architecture, Teacher
Opportunities placement, self-profile suppression, derived titles, the ARIA
Subject picker, promo persistence, `OfferCount`, and the canonical
LearningRequest / TeacherOffer / Payment / Order model are untouched.

## Format Closure

**PASS.**

The prior blocker was ownership, not formatting: another session was live on the
shared output. This pass re-checked first — **no `Tafseel.Api` process was
running, every port was free, and all 8 files were 3–4 days stale**. With
ownership released, the formatter was applied per project.

Then it was **proved** rather than assumed to be safe: each file's whitespace was
stripped and SHA-256 hashed before and after.

| File | Whitespace-stripped hash |
|---|---|
| Governance.cs, GovernanceService.cs, AuthenticationService.cs, MarketplaceService.cs, OpenMarketplaceService.cs, AuthenticationTests.cs, Phase6LiveSessionTests.cs, Phase7FinancialTests.cs | **identical before and after** |

Zero semantic change; only line wrapping. `--verify-no-changes` now exits 0.

## Landing Static Composition

**BLOCKED — not performed.** The Landing renders correctly in every captured
state (guest, Student with requests, Student awaiting payment, Teacher), but the
dead-space and section-rhythm audit was not carried out, so it cannot be called
certified.

## Dynamic Background

**NOT APPLICABLE — STATIC COMPOSITION PREFERRED.**

Ambient motion is an enhancement layered on finished static composition. Since
the composition pass above is *not* closed, adding motion now would decorate an
unfinished layout — precisely what the brief forbids. No motion was added, and
per the brief this does not by itself block release.

## Global Light Mode

**BLOCKED — partially certified.** The dashboard panel tier is fixed and proven
(`--dash-panel-muted` recessed below the canvas; dark unchanged). Quality and
Admin were rendered and reviewed this pass — and that review is what surfaced the
Admin defects below. The full token audit across Payment, Request Detail, Offers,
Opportunities and Book Session was not performed.

## Awaiting Payment

**PASS.** Proven against real state, not fixtures:

* Request status **6 (AwaitingPayment)**, reservation issued server-side, **120
  minutes** exactly.
* Landing shows **ACTION REQUIRED** with Teacher, 48h delivery, **⃁180** via the
  canonical Riyal renderer, and *"Payment reservation ends in 120 min"*.
* Needs Attention shows **Payment due** / *"Reservation expires in 119 min"* —
  the same request, the same server deadline, from the one shared projection.
* The Teacher's own Offer reads **Selected** while payment is pending.

## Payment → Order

**PASS.** `convergence-e2e.mjs` completes the tail through the real endpoints —
initiate with `Idempotency-Key`, then the signed mock webhook, sent **twice**:

| Assertion | Result |
|---|---|
| Callback accepted / replay not an error | HTTP 204 / 204 |
| Request status | **7 (ConvertedToOrder)** |
| Payment reservation | **consumed (null)** |
| Orders for the request | **exactly 1** |
| Order price vs selected Offer | **180 = 180** |
| Order payment status | **Paid** |
| Winning Offer | **Accepted** |
| Student sees the Order | "Payment confirmed", ⃁194.4 incl. fee |

## Reservation Expiry

**PASS — controlled clock, no two-hour wait.** Certified in the canonical suites
rather than re-implemented:

* `Selection_timeout_reopens_offer_at_exactly_two_hours` — `ExpireOfferSelection`
  is **false at 2h minus one tick** and **true at exactly 2h**; the request
  returns to OpenForOffers and the Offer to Submitted.
* `Selection_is_exactly_two_hours_and_timeout_reopens_request` (domain).

## Selection Cancellation

**PASS — real state.** `convergence-cancel-gate.mjs` cancelled 3 live
reservations through the Student endpoint. For every one: request → **OpenForOffers**,
reservation **cleared**, selection **released**, Offer → **Submitted**, and
**no Order created**. It doubles as cleanup for reservations abandoned by
interrupted E2E runs.

## Idempotency

**PASS.**

* Duplicate genuine callback → **exactly one Order** (asserted in both the
  pre-existing integration test and the new race test).
* Payment initiation is keyed by `Idempotency-Key`.
* Replayed webhook returns 204, not an error path.

## Concurrency / Race Cases

**PASS** for the cases a deterministic test can prove. New integration test
`Selection_and_payment_reject_replays_stale_versions_and_tampered_amounts`:

| Case | Result |
|---|---|
| Select replayed with a now-stale request version (double-click) | rejected |
| Competing Offer selected using the stale version | rejected |
| Competing Offer selected using a **fresh** version while one is reserved | rejected |
| Reservation holder | still Offer A, status Selected |
| Losing Offer during reservation | remains **Submitted** (not prematurely lost) |
| Callback claiming a **tampered amount** | **no Order created** |
| Genuine callback, sent twice | **exactly one Order** |
| Post-settlement | request ConvertedToOrder, reservation null, winner Accepted, loser NotSelected |

**Price tampering is structurally impossible, not merely rejected:** the
initiation endpoint accepts only a request id and an optional coupon code — the
client never supplies an amount, which is derived server-side from the selected
Offer.

## Student / Teacher Final Journey

**PASS — 25/25** in one run: publish → Opportunity visible to the qualified
Teacher → **401 for anonymous** on both the opportunity and the request → Offer
submitted → live `offerCount` on the Student's list → select → AwaitingPayment
(120 min) → Landing and Needs Attention agree → payment → one Order → Teacher's
Offer Accepted.

## Attachment Security

**PASS.** Anonymous callers receive 401 on the opportunity and the request. The
canonical integration test additionally proves an unqualified Teacher gets 404 on
attachment content, and the **losing** Teacher loses attachment access after
settlement.

## Responsive / RTL / Accessibility

**BLOCKED — incomplete.** Captured and reviewed: 1440 EN light, 1440 AR dark,
390 AR light, 390 EN dark for Landing (guest/Student/Teacher), Student Overview,
and Post Request. RTL was inspected and is correct on those surfaces (module
mirrors, Arabic labels and dates, CTAs translated). The Subject combobox's
keyboard and ARIA behaviour is gate-asserted.

Not done: 768 / 1024 / 1280 widths, the per-surface matrix for Request Detail,
Offers, Opportunity Detail and Payment, and the full accessibility audit
(focus trap, 200% zoom, contrast, timer cadence).

## Visual Adversarial Review

Genuine findings only.

| Finding | Severity | Status |
|---|---|---|
| Admin Users table renders 8 loaded users as **one blank row** (API returns all 8) | **Severe** | **BLOCKER** — pre-existing, file untouched by this pass |
| Admin "Open disputes" panel is an empty card with no empty-state text | Medium | **BLOCKER (minor)** — same file, same scope |
| Privileged Admin account appears in the customer Users table | Medium | **ACCEPTED** — empirically confirms the Part 18 business blocker |
| Leftover "Payment due" rows in Needs Attention across runs | — | **FIXED** — abandoned reservations were my own E2E residue; cleared via the real cancellation endpoint, which is correct product behaviour |
| Evidence screenshot captured the **guest** Landing after a rate-limited login | — | **FIXED** — the harness now asserts a real session before capturing |
| Post-payment assertion expected Offer=Selected | — | **FIXED** — Accepted is correct after settlement; Selected is now asserted before payment |

## Regression, Build and Release

| Gate | Result |
|---|---|
| Architecture / Domain / Application / Integration | **1 / 120 / 14 / 288 = 423 passed, 0 failed** |
| Frontend canonical gates | **17 / 17** |
| Convergence gates (promo, open-request, role-profile, cancel) | **4 / 4** |
| `dotnet format --verify-no-changes` | **PASS (exit 0)** |
| EF `has-pending-model-changes` | **PASS** — no model changes since last migration |
| `dotnet build -c Release` | **PASS** — 0 errors, 0 warnings |
| Isolated publish | **PASS** |
| `/health/live` (Staging, :5124) | **200 — Healthy** |
| `/health/ready` (Staging, :5124) | **200 — Healthy** |

Host filtering behaved correctly: a disallowed `Host` returns **400** by design
(`AllowedHosts = tafseel.runasp.net`); health was certified with the allowed host.
This is security behaviour, not a publish failure.

### Auth rate-limit handling

The Development `auth` policy is 10 req/min. Rather than weakening it, the gates
now **detect** exhaustion: `convergence-role-profile-gate` exits **2** with a
"re-run alone" message when no session is present, and `convergence-e2e` reuses
authenticated contexts, paces logins ≥9s apart, and **refuses to screenshot a
page that is not authenticated**. Retries are only applied to the explicit
rate-limit exit code, so a genuine UI failure can never be retried away.

## Files Changed (this pass)

| File | Change | Attribution |
|---|---|---|
| 8 `.cs` files (Governance, AuthenticationService, MarketplaceService, OpenMarketplaceService, 3 integration tests) | whitespace only, proven by hash | pre-existing dirty, formatted with ownership released |
| `tests/Tafseel.IntegrationTests/OpenMarketplaceTests.cs` | new race/tampering/idempotency test | current pass |
| `tests/browser/convergence-e2e.mjs` | payment tail, session assertions, login pacing | current pass |
| `tests/browser/convergence-cancel-gate.mjs` | new cancellation gate | current pass |
| `tests/browser/convergence-role-profile-gate.mjs` | rate-limit exit code 2 | current pass |
| `.claude/launch.json` | reverted to default output path | current pass |

## Final Traceability

| Final Gate | Status | Evidence | Test / Screenshot |
|---|---|---|---|
| Format | **PASS** | hash proof, whitespace-only | `--verify-no-changes` exit 0 |
| Landing composition | **BLOCKED** | not audited | — |
| Dynamic background | **NOT APPLICABLE** | static composition not closed | rationale above |
| Global Light Mode | **BLOCKED** | dashboard tier only | `closure/final-visual/light/` |
| Payment tail | **PASS** | one Order, price 180, Paid | `convergence-e2e` |
| Reservation expiry | **PASS** | exact 2h boundary, controlled clock | `Selection_timeout_reopens_offer_at_exactly_two_hours` |
| Selection cancellation | **PASS** | 3 live reservations released | `convergence-cancel-gate` |
| Idempotency | **PASS** | duplicate callback → 1 Order | integration + race test |
| Race conditions | **PASS** | stale/fresh double-select rejected | race test |
| Student E2E | **PASS** | 25/25 | `closure/e2e/` |
| Teacher E2E | **PASS** | Selected → Accepted | `convergence-e2e` |
| Responsive | **BLOCKED** | 1440/390 only | `after/`, `closure/` |
| RTL | **BLOCKED** | changed surfaces only | `after/landing/*-ar-*` |
| Accessibility | **BLOCKED** | combobox only | `convergence-open-request-gate` |
| Backend regression | **PASS** | 423/423 | `dotnet test` |
| Frontend regression | **PASS** | 17/17 + 4 | gate sweep |
| EF | **PASS** | no pending model changes | `dotnet ef` |
| Release build | **PASS** | 0 errors, 0 warnings | `dotnet build -c Release` |
| Publish | **PASS** | changes present in output | `closure/release/publish-health.txt` |
| health/live | **PASS** | 200 Healthy | same |
| health/ready | **PASS** | 200 Healthy | same |

## Evidence Paths

* `docs/features/evidence/student-journey-convergence/closure/e2e/` — full journey, payment tail
* `.../closure/awaiting-payment/` — Needs Attention, Teacher dashboard
* `.../closure/open-request/`, `.../closure/profile/` — form, self-view
* `.../closure/final-visual/light/` — Quality, Admin light mode
* `.../closure/release/publish-health.txt` — publish + health

## Remaining Business Decisions

Unchanged and safely hidden — neither exposes an unsafe path, so neither blocks
the shipped journey: unmatched-Subject mapping workflow, and privileged
Admin/Staff role-management policy (now empirically confirmed by the Admin
account appearing in the customer Users table).

## Remaining Repository Blockers

1. **Admin Users table renders 8 users as one blank row** —
   `Tafseel-Admin-Dashboard.dc.html`. API verified correct; rendering defect.
   Severe, and untouched by this pass.
2. **Admin "Open disputes" panel has no empty state** — same file.
3. **Landing dead-space composition**, **global Light Mode audit**, and the full
   **responsive / RTL / accessibility** matrices remain incomplete.

## Final Verdict

**STUDENT JOURNEY & UI CONVERGENCE BLOCKED.**
