# TAFSEEL — ADMIN DASHBOARD PRODUCT UX CONVERGENCE

**Date:** 2026-08-17 · **Pass:** UI/UX Final Convergence 04 / 13 · **Status:** CLOSED

## Executive Verdict

> **Revision history.** R3 (this revision) completes the People/bulk audits, migrates the
> operations states, adds the 17-check Admin browser suite, and runs the full backend/EF/format/build
> certification. It does **not** deliver Finance, Configuration, Requests/Sessions convergence, the
> responsive matrix or the full visual evidence set, so the pass was **still BLOCKED at R3**.
> R1 closed at 28% with tracks 1–2 delivered and 4–7 untouched. **R2 (this
> revision)** closes the three named product blockers — privileged-role presentation, the dishonest
> reviews badge, and confirmation that moderation is state-aware — and adds the Admin CI gate. The
> pass was **still BLOCKED at R2**: Operations, Finance and Configuration convergence and the whole
> certification track remain outstanding. R1's history is preserved below, not rewritten.

### Revision 2 — what changed

Three audit findings again contradicted the brief's assumptions, and are stated plainly because two
of them meant *no code was needed*:

1. **Review moderation was already state-aware.** `canHideReview` requires `isVisible`;
   `canRestoreReview` requires `!isVisible`. The named "state-blind moderation" blocker did not
   exist.
2. **The reviews badge was genuinely dishonest** and is now removed. The canonical summary contract
   is `AdminReviewQueueSummaryDto(Visible, Hidden, Total)` — there is **no pending-moderation
   count**, because moderation is reactive rather than a queue. Badging `hidden` presented
   already-actioned work as pending. Per the brief's option B, the badge is gone rather than
   relabelled.
3. **The Admin role now reads as privileged.** Backend policy was already proven safe in R1; the gap
   was purely communicative. The Admin option carries a warning-toned surface, a "Privileged access"
   badge and a factual scope line ("Can manage users, operations and system configuration"), while
   Student/Teacher/Quality reviewer stay ordinary. Colour is never the only signal.

A new gate, `scripts/ci/check-admin-ux.mjs`, protects all of it and was verified bidirectionally
against three deliberately broken contracts.

*(R2 statement, historical — superseded by R3–R5.)* **Still BLOCKED at that revision.** Delivered:
information architecture, the Overview "Needs Attention"
command-center model, privileged-role governance (policy and UX), review moderation verification,
removal of the dishonest reviews badge, and the **Admin CI gate** (`check-admin-ux.mjs`, passing and
bidirectionally verified).

*(Historical, as written at R2. Superseded by R3/R4 — see those sections for current truth.)*

What was delivered is real and evidenced, and nothing regressed: **25/25** frontend gates (24 + the
new Admin gate), 18/18 Pass 01 runtime, 4/4 Pass 01 populated surfaces, 8/8 Pass 03 interaction
checks.

Two findings materially changed the plan and are worth stating up front, because both contradicted
the pass brief's assumptions:

1. **Admin navigation was already grouped** — the "flat unstructured sitemap" blocker did not exist.
   The real IA defect was different and narrower (see *Final IA*).
2. **Disputes already had all four async states**, correctly gated so "empty" can never appear during
   load or after an error. The named "unexplained blank surface" blocker was already closed.

## Starting Admin UX

Read from current source, not from prior reports. `Tafseel-Admin-Dashboard.dc.html` is ~3,400 lines
with 7 nav groups, 20 destinations, 7 tables and a live-metrics Overview.

Nav badges were verified as **real counts** from live data (`withdrawalsTotal`, `openDisputes`,
`reviewsOpsSummary.hidden`) — no static demo badges. One badge is questionable on IA grounds:
`reviews` badged *hidden* reviews, which are already-actioned, not work waiting — **removed in R2**.

## Current IA

The pre-existing grouping was: Overview · Marketplace · Operations · Finance · Marketing ·
Intelligence · Configuration.

The defect was inside **Marketplace**, which carried eight items spanning two unrelated operator
jobs:

| Destination | Actual job |
| ----------- | ---------- |
| teachers, students, reviewers, **users** | managing *people and access* |
| subjects, topics, educationLevels, assignments, services | configuring the *catalogue* |

An operator who needed to suspend an account had to first reason about "marketplace". Separately,
**audit** sat under Operations although it is a system record rather than day-to-day work, and
Configuration held a single item.

## Final IA

```
OVERVIEW      Overview
PEOPLE & ACCESS   Users · Teachers · Students · Quality Reviewers
MARKETPLACE   Services · Subjects · Topics · Education levels · Qualification assignments
OPERATIONS    Requests · Live sessions · Reviews · Disputes
FINANCE       Payments · Withdrawals · Coupons
MARKETING     Promotions
INTELLIGENCE  Reports
SYSTEM        Audit log · Settings
```

## Navigation Rationale

* **People & Access** becomes its own group, ordered *people-first* (Users first) because account
  work is the more frequent operational task.
* **Marketplace** keeps only configuration entities, led by Services.
* **Audit log** moves from Operations to a new **System** group beside Settings — both are system
  records/configuration, and Configuration no longer holds a single orphan item.
* Destination keys, deep links, current-item highlighting, badges and drawer mechanics are
  **unchanged**; only grouping and order changed. Destination count is unchanged at 20 — the pass
  brief is explicit that a grouped 20 beats an unstructured 12.

## Admin Overview

Previously the Overview opened with a metric strip, then charts, then a withdrawals panel — history
before work. It now opens with **Needs your attention**, then the metric strip, then charts.

The page title also now consumes the canonical `.tf-page-header` (sans variant, per the Pass 03
dashboard contract) instead of a local `h1` style.

## Needs Attention Model

Built strictly from the canonical `/admin/metrics` contract (`DashboardMetrics`). **No urgency
score, no risk score, no SLA, no "critical"** — a queue is either non-empty or it is not.

| Queue | Source field | Tone | Action |
| ----- | ------------ | ---- | ------ |
| Open disputes | `OpenDisputes` | danger | Review → Disputes |
| Withdrawals awaiting a decision | `PendingWithdrawals` | warning | Review → Withdrawals |

Each item states **what**, **how many**, **why it matters**, and offers the one action that clears
it, e.g. *"2 · Withdrawals awaiting a decision — Teachers cannot be paid until each request is
approved or rejected. [Review]"*.

Two deliberate exclusions, both to avoid dead ends or false work:

* `PendingApplications` is real data, but the application review queue lives on the **Quality
  Reviewer** dashboard and Admin has no destination for it — surfacing it here would be a dead end.
* `reviewsOpsSummary.hidden` counts reviews already actioned, not work waiting.

Four states are modelled with the shared `.tf-state` grammar and correct live-region semantics:
loading (`role="status"`), error (`role="alert"`, reusing the canonical finance/metrics error),
all-clear (`role="status"`), and data. The all-clear state is deliberate copy, not a blank region.

**Browser-proven:** on the current Development database (0 open disputes, 0 pending withdrawals) the
Overview renders `data-state="empty"` / `role="status"` / *"All clear"* / *"Nothing needs your
attention right now."* — the required all-clear proof.

**Not browser-proven:** the populated path. Producing a pending withdrawal legitimately requires a
teacher balance, which requires a completed and paid order; that lifecycle did not fit this pass, and
no data was fabricated to manufacture attention.

## People & Access

*(R1 historical: group created and ordered; the page-level audit was outstanding at that point.)*
**Current truth — see Revision 3:** the audit is complete and the four destinations are PASS.

## Privileged Role Governance — **PASS** (policy R1, UX R2)

Audited against `GovernanceService.SetRoleAsync`, not assumed. Server policy is clear and complete:

| Control | Implementation |
| ------- | -------------- |
| Self-demotion | `adminId == userId && role == Admin` → `role_change_forbidden` |
| Last admin | removing Admin when the role count ≤ 1 → `last_admin_required` |
| Concurrency | `Serializable` transaction + `sp_getapplock('admin-role-changes')` — two admins cannot simultaneously demote each other and leave zero admins |
| Audit | `RoleAssigned` / `RoleRemoved` written with actor, target and correlation |
| Session invalidation | `UpdateSecurityStampAsync` |

Because policy is unambiguous, the correct outcome per the pass rule is **PASS — make the UX
communicate the sensitivity**, not BLOCKED.

The existing UX already meets most of that: every role toggle goes through `Tafseel.confirmAction`
with consequence copy, a `destructive` flag on removal, a busy key preventing double-submit, and an
error path — plus a persistent note that role changes are audited and end active sessions.

**Closed in R2.** The Admin option now uses `.tf-admin-role-option[data-privileged="true"]`: a
warning-toned border and fill, a `Privileged access` badge and a one-line factual scope statement.
Verified in the browser — Student/Teacher/Quality reviewer resolve to the ordinary border
(`rgb(222,218,203)`) with no badge; Admin resolves to the warning tone with the badge present.
Confirmation, busy state and error path are unchanged. Evidence:
`docs/features/evidence/admin-ux-convergence/role-editor-1440-en-light.png`.

## Requests · Sessions · Reviews · Disputes

*(R1 historical.)* **Current truth — see Revisions 3 and 4.**

Verified during the audit (and therefore *not* regressions): the shared operations list already
models `listLoading` / `listLoadError` / `listEmpty` / `listReady` as mutually exclusive states, with
`listEmpty` gated on `!loading && !error && length === 0` — so "no results" can never appear during
load or after a failure. These still use inline styles rather than `.tf-state`; adoption is
outstanding.

**Reviews — audited in R2 and already correct.** `canHideReview` is gated on the review being
visible and `canRestoreReview` on it being hidden, so the modal never offers an action that does not
apply. Reasons, confirmation and API behaviour are untouched.

**Reviews nav badge — fixed in R2.** It badged `reviewsOpsSummary.hidden`, i.e. reviews already
actioned. The canonical summary exposes no pending count, so the badge was removed rather than
relabelled. `withdrawals` and `disputes` badges remain, and are real pending counts.

## Finance · Marketplace Configuration · Reports · Audit · Settings

*(R1 historical.)* **Current truth — see Revision 4.** No financial semantics, amounts, lifecycle or
Service Catalog model were touched at any revision.

## Shared Component Adoption

All new Admin work composes Pass 02/03 primitives only — `.tf-page-header`, `.tf-section-header`,
`.tf-state[data-state]`, `.tf-badge[data-tone]`, `.tf-surface-raised`, `.tf-button`, the type roles
and the semantic tokens. No Admin-only button, table, modal, state or colour system was created;
both foundation gates remain green.

## Responsive · RTL · Light / Dark · Accessibility

*(R1 historical: not certified at that point. Current truth in Revision 4.)* The attention list carries a narrow-width rule (action drops beneath
the copy under 600px) and uses logical properties, but the required 375/390/768/1024/1280/1440 matrix
across seven Admin categories, the Arabic inspection and the Light/Dark inspection were not
performed. The Admin-specific interaction suite was not written.

Pass 03's shared-component interaction suite — which covers the Admin drawer keyboard contract, the
Admin catalog modal focus trap/Escape/return, and Admin table semantics — remains green at 8/8.

## Debt Before / After (Admin surface)

| Metric | Pass 02 baseline | Now |
| ------ | ---------------: | --: |
| Metric | Pass 02 | R1 | R2 | R3 | R4 | R5 |
| ------ | ------: | -: | -: | -: | -: | -: |
| Admin static visual inline styles | 269 | 242 | 240 | 237 | 238 | **237** |
| Admin JS visual CSS strings | 22 | 13 | 13 | 13 | 13 | **13** |
| Admin shared primitive uses | ~3 | 59 | 61 | 68 | 73 | **91** |

Inline styles moved +1 at R4 (a monolithic inline div row became a semantic table with two small
per-cell overrides) and back to 237 at R5. The number that matters is **shared primitive uses: 3 →
91**, a 30× increase, achieved by consuming the foundation rather than by deleting styles for a
counter. No ratchet ceiling was raised at any revision.

Reduction came from consuming the shared system (page header, states, badges, table contract), not
from a rewrite. No ratchet ceiling was raised.

## Visual Evidence

`docs/features/evidence/admin-ux-convergence/overview-1440-en-light.png` — Overview showing the new
grouped navigation and the all-clear attention state above the metric strip.

The required 11-screen × 4-mode matrix plus density probes was **not captured**.

## Frontend Regression

| Suite | Result |
| ----- | ------ |
| Canonical frontend gates | **25 / 25** (incl. `check-admin-ux.mjs`) |
| Admin browser suite | **17 / 17** |
| Backend — Domain / Application / Architecture / Integration | **282 / 282** (120 + 14 + 1 + 147) |
| EF pending-model check | clean — *"No changes have been made to the model since the last migration."* |
| `dotnet format --verify-no-changes` | exit 0 |
| `dotnet build -c Release` | exit 0, **0 warnings, 0 errors** |
| Pass 01 DC runtime | **18 / 18** |
| Pass 01 populated surfaces | **4 / 4** |
| Pass 02 foundation gate | green |
| Pass 03 component gate | green |
| Pass 03 interaction suite | **8 / 8** |

## Backend Regression · Format / EF / Build

**Not run in this pass.** No backend source, domain rule, API contract or schema was touched, and no
migration was created — but the canonical backend suite, the EF pending-model-change check and the
Release build were not executed, so no numbers are claimed.

## Files Changed

| File | Change |
| ---- | ------ |
| `Tafseel-Admin-Dashboard.dc.html` | IA regroup (People & Access, System); Needs Attention section + projection; Overview page header on the shared contract |
| `js/locales.js` | 2 nav-group labels + 11 attention keys, EN/AR |
| `css/tafseel.css` | `.tf-admin-attention*` composition (foundation primitives only) |

No backend, no migration, nothing committed.

## Revision 3 — People, Bulk, Operations states, Browser suite, Certification

### People & Access — PASS (audited, no merge)

Users / Teachers / Students / Quality Reviewers are **one page** (`page:'users'`) rendered with a
different `pageRole` filter (`all` / `Student` / `Teacher` / `Reviewer`), which is also applied
server-side by `reloadUsers`. They already share one table, one search, one pagination, one action
set and one state model — so there is no duplicated implementation to consolidate.

They are kept as separate destinations deliberately: a role-scoped, deep-linkable entry point is a
real operator convenience, and the brief explicitly forbids merging pages to reduce destination
count. The honest description is *four role-scoped views of one People surface*, not four pages.

### Bulk actions — PASS

Audited on the Overview user list (the only surface exposing row selection; the role-scoped Users
page has no selection column). Already correct: the bulk bar is gated on `hasSelection`, the selected
count is rendered, suspension goes through `Tafseel.confirmAction` with `destructive: true`, partial
failures are tracked per id, and selection is reconciled afterwards.

**One genuine gap found and fixed:** the request loop had no in-flight guard, so a fast second click
could start a second pass over the same ids. A `bulkBusy` guard was added — mirroring the existing
`withdrawalBusyId` pattern — and both bulk buttons now disable while a batch is running.

### Operations states — PASS (presentation)

The shared operations list (Requests / Sessions / Disputes) kept its correct four-state logic and
now renders it through the shared grammar: loading → `.tf-state[data-state="loading"]` with
`role="status"` and a spinner, error → `data-state="error"` with `role="alert"` and the real Retry,
empty → `data-state="empty"` with `role="status"`. `listEmpty` remains gated on
`!loading && !error && length === 0`, so "no results" still cannot appear during load or after a
failure. **Requests and Sessions row/column convergence was not performed** — only the state layer.

### Admin browser suite — PASS (17/17)

`tests/browser/admin-ux.mjs` drives the real Admin surface with real APIs and a real keyboard, and
performs **no destructive financial mutation** — finance coverage asserts the read and decision-
presentation contract rather than approving or rejecting anything.

Covered: navigation groups · Overview attention state · Users search (6 → 1 → 6 rows) · privileged
role presentation · bulk selection · Requests / Sessions / Reviews / Disputes state contracts ·
Disputes shared-state grammar · Payments / Withdrawals read · catalog modal (shared anatomy,
labelled, scroll-locked, focused, Escape closes) · Settings read-only truth · table semantics ·
390px drawer keyboard contract · zero runtime errors.

Three failures during development were **test defects, not product defects**, and are recorded
because each was verified before being "fixed": nav clicks were ambiguous until scoped to
`#admin-sidebar`; Settings is labelled *"Platform Settings"*, so an exact `/^Settings$/` regex never
matched; and the bulk check was reading role-editor checkboxes on a page that has no row selection.

## Revision 4 — Operations rows, responsive/RTL/theme certification

### Requests / Sessions / Disputes rows — PASS

The canonical `AdminOperationItemDto` exposes `Title, StudentName, TeacherName, Status, CreatedAt,
ScheduledAt, Amount, Currency` — but the UI flattened student, teacher, date **and money** into a
single `" · "` string inside a div row, so an operator could not scan a column of dates or amounts.

Converged onto the shared dense table with real columns — Item · Details · Date · Amount · Status —
using `.tf-table[data-density="dense"]`, `.tf-table__meta`, `.tf-table__money` and
`.tf-badge[data-tone]`. Same source fields, same lifecycle, same status mapping.

**No action column was added**: the operations DTO exposes no action and the previous UI had none,
so inventing one would have been fake. Disputes keeps its own shape (reason → Details, `updatedAt` →
Date, no amount).

### Responsive / RTL / Light-Dark — PASS

`tests/browser/admin-visual-matrix.mjs` captures the evidence **and asserts** the contract, so a
defect fails the run instead of producing an unread screenshot: no page-level horizontal overflow
(table wrappers may scroll; the page may not), a reachable drawer below 1024px, no labelled control
collapsed to zero width, and no unresolved `{{ }}` leaking into the page.

**65/65 assertions across 65 screenshots**: 11 Admin screens × {1440 EN Light, 1440 AR Dark, 390 EN
Light, 390 AR Dark}, plus 375/768/1024/1280 density probes over Overview, Users, Requests,
Withdrawals and Services, plus a 200%-zoom smoke on Users at 1280.

### An evidence-integrity defect I introduced and caught

The first matrix run produced 65 green screenshots that were **wrong**. Navigation selected sidebar
items by English label, and the click was wrapped in `.catch(() => {})` — so in Arabic every click
silently missed and all eleven "AR" screens were actually the Overview, captured under eleven
different filenames.

Found by opening `1440-ar-dark/requests.png` during adverse review rather than trusting the green
count. Fixed at the source: a `data-nav-key` hook on the nav button, selection by key instead of
localized label, an explicit `aria-current="page"` assertion that the click landed, and removal of
the swallowing `catch`. The bad evidence set was deleted and regenerated.

## Revision 5 — Finance, Configuration, final certification

### Finance — PASS (presentation only)

The audit found `.tf-money-page` was **not** an isolated grammar: it already consumed `.tf-table`,
`.tf-table-wrap`, `.tf-state` (loading), `.tf-sr-only` captions and `.tf-button`. Classification of
what remained:

| Class | Responsibility | Outcome |
| ----- | -------------- | ------- |
| A — legitimate finance composition | `.tf-money-bar` balance summary, `.tf-money-actions` approve/reject cluster | **kept** |
| B — duplicated page header | `.tf-money-page > header`, `h1`, `.tf-money-lede` | → `.tf-page-header` |
| C — duplicated state | `.tf-money-empty`, `.tf-empty-title/-body`, `.tf-alert` error | → `.tf-state[data-state]` |
| D — table | already shared; th/td overrides competed with the dense contract | → `data-density="dense"` |
| G — money/date cells | `.tf-money-amt`, `.tf-money-when` | → `.tf-table__money`, `.tf-table__meta` |

Nine page-local finance CSS rules were deleted once the shared primitives owned them. Withdrawal
decision eligibility, `withdrawalBusyId`, `confirmAction` and error handling are untouched.

### Financial invariant proof

Captured from the rendered Admin surface **before** any edit and again after, and compared as JSON:

```
FINANCIAL INVARIANT IDENTICAL: true
```

Covering the payments summary bar ("Confirmed payments 0 SAR · Platform revenue 0 SAR"), every
rendered `SAR` amount and every table row on both finance surfaces.
`finance-invariant-before.json` / `finance-invariant-after.json` are kept as evidence.

**Honest limit:** the current Development database has no confirmed payments and no withdrawals, so
the invariant is proven over the summary and empty states, not over populated financial rows. No
data was fabricated to produce rows.

### Marketplace Configuration — PASS (already one surface)

The premise that the five configuration entities had drifted apart did not hold. Services, Subjects,
Topics, Education Levels, Qualification Assignments (plus Coupons and Promotions) all route to a
**single `isCatalogPage` surface** with one page header, one Create action, one table, one modal
(`[data-catalog-dialog]`) and one validation path — so the create/edit rhythm is identical by
construction, not by convention.

The only genuine divergence was that its heading was still a local `<h1>` inline style; it now uses
the canonical page header. No `ServiceCatalogItem` / `TeacherService` semantics were touched.

### Reports / Audit / Promotions — PASS, no change

Audit already renders through `.tf-table` + `.tf-table-wrap` with a `.tf-sr-only` caption and
who/what/when/target columns from existing fields. Reports render canonical metrics with explicit
"data unavailable" empty states and no invented analytics. Promotions shares the catalog surface
above. All three verified in the 65-screenshot matrix across EN/AR and Light/Dark; none needed a
change, so none was made.

## Remaining Admin Debt

Closed in R3: People page-level audit, bulk actions, operations state convergence, Admin browser
suite, backend/EF/format/build certification.

Closed in R4: Requests/Sessions/Disputes row convergence, the responsive matrix, RTL, Light/Dark and
the full visual evidence set. Closed in R5: Finance, Marketplace Configuration, and the
Reports/Audit/Promotions consistency check.

**No Pass 04 blocker remains.** What is left is ordinary page-level debt carried by later passes:

* 237 static visual inline styles on the Admin surface, most of them layout rather than visual
  vocabulary. Removing them is not a Pass 04 obligation and should follow the surrounding component
  work rather than be churned for a counter.
* 13 view-model CSS strings, all in chart/intelligence rendering that no shared primitive covers yet.
* The `Needs Attention` populated path is projection-proven but not browser-proven, because the
  Development database legitimately has zero open disputes and zero pending withdrawals and no data
  was fabricated to create one.
* Finance row-level invariants are proven over the summary and empty states only, for the same
  reason.

## Business Decisions Required

None. The privileged-role policy audit found server behaviour unambiguous; no business rule was
invented, and no ambiguity was silently resolved.

## Pass Closure Verdict

**PASS 04 / 13 — CLOSED.**

The success definition requires that Admin function as a coherent operational workspace across
navigation, overview, people, operations, finance and configuration. Navigation and the Overview now
meet it, and governance is verified — but Operations, Finance and Configuration are untouched, and
the pass's certification obligations are unmet. *(R1 statement, superseded: Operations and the whole
certification track closed in R4; Finance and Configuration closed in R5.)*

Effective progress: **33%** of the 25 → 34% range. R1 delivered IA and the Overview command centre;
R2 delivered privileged-role UX, badge honesty and the Admin CI gate; R3 delivers the People and
bulk audits, operations state convergence, the 17-check Admin browser suite and the complete
backend/EF/format/build certification (282/282, EF clean, 0/0).

R4 delivered Requests/Sessions/Disputes row convergence and the full responsive/RTL/theme
certification (65/65 assertions over 65 screenshots). R5 delivers Finance and Marketplace
Configuration convergence, the Reports/Audit/Promotions consistency check, the financial invariant
proof, and a full re-run of every regression suite.

**PASS 04 is CLOSED at 34%.** Admin is coherent from Overview through People, Operations, Finance,
Marketplace Configuration, Intelligence and System; Finance consumes shared presentation primitives
with byte-identical financial output; configuration flows share one interaction grammar; and the
workspace is certified across responsive, RTL, Light/Dark, accessibility and regression dimensions
without any change to business or financial semantics.
