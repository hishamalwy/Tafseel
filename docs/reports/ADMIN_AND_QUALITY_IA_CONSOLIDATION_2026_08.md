# TAFSEEL — ADMIN & QUALITY REVIEWER IA CONSOLIDATION (PASS 05)

**Date:** 2026-08-20 · **Scope:** information architecture, routing, state presentation, performance,
role boundaries · **Status:** delivered, uncommitted, undeployed.

Financial accounting, Request/Offer/Order lifecycles, dispute financial semantics, teacher
qualification rules and suspension semantics are **unchanged**. Nothing in this pass required
touching them, and nothing did.

---

## 1. Admin — before / after

**Before:** 20 destinations across 8 sidebar groups, one per database entity.

```
Overview │ People: Users, Teachers, Students, Reviewers │ Marketplace: Services, Subjects,
Topics, Education Levels, Assignments │ Operations: Requests, Orders, Sessions, Reviews, Disputes
│ Finance: Payments, Withdrawals, Coupons │ Marketing: Promotions │ Intelligence: Reports
│ System: Audit, Settings
```

**After:** 7 areas, named for Admin jobs. Every former destination survives as a tab.

| Area | Answers | Tabs |
| ---- | ------- | ---- |
| Home | What needs attention now? | — |
| People | Who has access? | All users · Teachers · Students · Quality reviewers |
| Marketplace | What do we sell? | Catalogue · Subjects · Topics · Education levels · Qualification assignments · Promotions |
| Operations | What is happening? | Requests · Orders · Sessions · Cases · Review moderation |
| Finance | Is money healthy? | Payments · Withdrawals · **Payout profiles** · Coupons · **Reconciliation** |
| Insights | What is happening over time? | Reports |
| System | Platform administration | Audit log · Settings |

Two capabilities were **promoted** to first-class destinations: reconciliation (previously a strip
below the payments table) and payout profiles (previously a block that only appeared above the
withdrawals table). Both now have their own tab, deep link and attention card.

## 2. Quality Reviewer — before / after

**Before:** 5 destinations in 3 groups — Applications, Additional, Showcases, Reports, Settings.

**After:** 2 areas.

| Area | Tabs |
| ---- | ---- |
| Review workspace | Applications · Additional subjects · Teaching samples *(only when the feature is enabled)* |
| My account | Settings |

**Removed as dead UI:** the Reports destination. It rendered three "analytics unavailable" tiles and
an empty chart; there was no backend capability behind it. Its links resolve to the queue rather
than 404-ing a bookmark. No backend capability was removed.

## 3. Capability mapping

Every tab key is the **same string** as its pre-Pass-05 destination key, so the mapping is an
identity for in-app links and bookmarks; only the grouping changed.

| Old | New | Disposition |
| --- | --- | --- |
| overview | Home | MOVE (renamed) |
| users / teachers / students / reviewers | People → same tabs | MOVE |
| services / subjects / topics / educationLevels / assignments | Marketplace → same tabs | MOVE |
| promotions | Marketplace → Promotions | MOVE (merchandising is marketplace configuration) |
| requests / orders / sessions / disputes / reviews | Operations → same tabs | MOVE |
| payments / withdrawals / coupons | Finance → same tabs | MOVE |
| *(reconciliation, nested under Payments)* | Finance → Reconciliation | **PROMOTE** |
| *(payout profiles, nested under Withdrawals)* | Finance → Payout profiles | **PROMOTE** |
| reports / intelligence | Insights → Reports | MOVE |
| audit / settings | System → same tabs | MOVE |
| Quality: applications / additional / showcases | Review workspace tabs | MOVE |
| Quality: showcases | tab present only when the feature flag is on | FEATURE-FLAGGED |
| Quality: reports | — | **REMOVE AS DEAD UI** (no backend capability existed) |
| Quality: settings | My account → Settings | MOVE |

No backend capability was removed anywhere.

## 4. Admin attention model

One read-only endpoint, `GET /api/v1/admin/attention` (`Reports.View`, Admin-only). Each count uses
the **same predicate** as the destination its card opens, so a card can never disagree with the list
behind it.

| Card | Backend source | Deep link |
| ---- | -------------- | --------- |
| Open disputes | `Disputes.Status != Resolved` | `?section=operations&tab=disputes&filter=open` |
| Live sessions awaiting your outcome | Confirmed + settlement window elapsed + escrow still Held + no open dispute — the `reviewRequired` rule from `GetSessionsAsync` | `?section=operations&tab=sessions&filter=admin-review` |
| Orders past agreed delivery | `Order.IsOverdue(now)` as a server predicate | `?section=operations&tab=orders&filter=overdue` |
| Withdrawals awaiting a decision | `WithdrawalStatus.Pending` | `?section=finance&tab=withdrawals` |
| Payout profiles awaiting verification | `PayoutVerificationStatus.Pending` | `?section=finance&tab=payoutProfiles` |
| Payments stuck at capture | `PaymentStatus.Pending` older than 6h | `?section=finance&tab=payments` |
| Suspended accounts with live transactions | suspended party on a paid, in-flight Order | `?section=people&tab=users` |
| Reconciliation anomalies | `ReconciliationDto.IsBalanced` / anomaly counts — copied, never recomputed | `?section=finance&tab=reconciliation` |

A queue at zero is **omitted**, not rendered as a reassuring zero. There is no urgency score, risk
score or SLA — a queue is either non-empty or it is not.

**Deliberate exclusion — teacher applications.** The count is real and is shown as platform context
in the metrics strip, but it is *not* a card. The review queue belongs to the QualityReviewer
dashboard, whose role gate an Admin does not necessarily satisfy; an "open" button that can land on
a role bounce is a dead end, not an action. This matches the existing frontend-integrity rule that
Admin must not link Teacher Applications into its own navigation.

**No marketplace configuration-blocker card** was added. Nothing in the catalogue model expresses
"this configuration blocks selling" unambiguously, and inventing a signal would be worse than
omitting it. Recorded as a follow-up, not shipped as a guess.

## 5. Operations model

One investigation hub over the existing entities — **no new transaction entity, no backend
aggregate**. Each tab carries the operational states an Admin actually looks for, applied
**server-side** via `&filter=`, so a filtered list paginates over the real matching set:

- **Requests** — Direct · Marketplace · Awaiting teacher · Open for offers · Payment reservation · Expired · Converted
- **Orders** — Awaiting payment · In progress · Overdue · Delivered · Revision requested · Completed · Cancelled · Refunded · Disputed
- **Sessions** — Upcoming · Awaiting outcome · Needs Admin review · No-show pending · Completed · Cancelled · Disputed
- **Cases** — Open · Under review · Resolved

An unknown or stale filter degrades to the unfiltered list rather than erroring a bookmark.

**Not invented:** the brief's "Funded not started" order state. The domain has no state that
distinguishes funded-but-unstarted from in-progress, so no filter claims to. Relationship context
(Request → Offer → Order → Payment → Dispute; Session → Payment → outcome → Dispute) continues to
come from the existing `AdminOperationItemDto`, which already carries `PaymentId`, `DisputeId`,
`DisputeStatus`, `EscrowState`, `PassiveOutcomeDeadline` and `EvidenceCount`.

## 6. Finance model

Five tabs: Payments · Withdrawals · Payout profiles · Coupons · Reconciliation. Reconciliation is
prominent — its own destination, its own deep link, and a tab badge when anomalies exist.

**Financial truth is never computed in the browser.** `homeMetrics` prefers the attention projection
and falls back to `/admin/metrics`; reconciliation health is copied from `ReconciliationDto`, never
recalculated. Refund behaviour is untouched: the existing guarded `/payments/{id}/refund` endpoint,
its `CanRefund` / `RefundUnavailableReason` gating and the dispute-settlement path are exactly as
they were. **No ledger edit, force-balance, arbitrary credit/debit or refund-guard bypass exists.**

## 7. Quality workflow

Queue → Review → Decision, in one workspace. The queue answers teacher, subject, submission type,
submitted time, review state, priority and age. Inside a review: applicant context, qualification
topic, demo/evidence, evaluation criteria, comments, decision. Claiming (`start-review`) and the
decision endpoint are unchanged, including their optimistic-concurrency `If-Match`.

## 8. Draft safety

**There is still no server draft API.** `/teacher-applications/{id}` exposes read, start-review and
decision — nothing that stores an in-progress score sheet. This pass therefore did *not* fake server
persistence. What it does:

- a **local draft** keyed by reviewer **and** application (`tafseel.quality.review-draft.<reviewerId>.<applicationId>`), so drafts cannot cross-read between reviewers on one machine or bleed between applications;
- written on every edit, not on a timer — an accidental tab close has no warning window;
- **offered**, never applied silently: opening an application shows a restore/start-fresh choice, so a stale draft cannot overwrite what the reviewer is looking at;
- carries scores, comment and notes only — no decision, no application state, so it can never be mistaken for a submitted review;
- cleared on a successful decision;
- an explicit unsaved indicator whose copy states plainly that the work is **on this device only**;
- the existing `beforeunload` warning and navigate-away confirmation are retained.

**Outstanding backend requirement:** a reviewer-owned server draft endpoint. Local storage does not
survive a different device, a cleared browser or a lost machine. A server draft must be
reviewer-owned, must not change application state, must not count as a submitted decision, and must
not weaken final-review concurrency. Implementing it needs a new entity plus a migration, which is
outside a presentation-consolidation pass.

## 9. Routing compatibility

Legacy links are **resolved at the routing layer** (`resolveAdminRoute` / `resolveQualityRoute`),
not served by a second navigation system. A bare destination key in either the `section` or `tab`
slot resolves, case-insensitively.

`?section=users` · `teachers` · `students` · `reviewers` → People tabs
`?section=services` · `subjects` · `topics` · `educationLevels` · `assignments` → Marketplace tabs
`?section=requests` · `orders` · `sessions` · `reviews` · `disputes` → Operations tabs
`?section=payments` · `withdrawals` · `coupons` · `payoutProfiles` → Finance tabs
`?section=overview` · `dashboard` → Home · `?section=reports` · `intelligence` → Insights
`?section=audit` · `settings` → System · `?section=promotions` → Marketplace/Promotions
Quality: `?section=media` · `samples` → Teaching samples · `pending` · `overview` · `reports` → Applications

An unrecognised route falls back to Home (Admin) / the queue (Quality) rather than rendering a blank
shell. The review-moderation deep link keeps its `search` / `visibility` / `page` / `selectedId`
parameters. Refresh and browser back/forward both work: the canonical URL is written with
`pushState` on navigation and `replaceState` when resolving the address bar, and a `popstate`
listener re-resolves.

## 10. Performance

| | Before | After |
| --- | --- | --- |
| Admin mount API calls | **14** (13 collections in one `Promise.allSettled` + the review summary) | **1** (`/admin/attention`) |
| Opening Coupons | already loaded | 1 call (`/admin/coupons`) — measured, and asserted not to pull subjects/services/users/withdrawals/audit |
| Returning to a visited tab | n/a | 0 calls — measured |
| Quality mount | 6 calls regardless of tab | applications + taxonomy; showcases only on that tab, notification preferences only for the account area |

Measured by recording real requests in the headless smoke, not by reading source. Large lists page
against the server (`page` / `pageSize` asserted on the users list), and a filter change re-queries
the server rather than filtering the page already in the browser.

## 11. Authorization

`Reports.View` is Admin-only, so `/admin/attention` returns **403** to QualityReviewer, Teacher and
Student — proven directly, alongside reconciliation, withdrawals, payout profiles, audit and
operations. `Permissions.ForRole(QualityReviewer)` is asserted to equal exactly
`[Teachers.ReviewApplications, Teachers.ReviewShowcases]`, so a silent widening fails the build.
The Quality dashboard's entire endpoint surface is gated in CI to teaching-quality paths only —
**UI hiding is not treated as the control.**

## 12. Localization / responsive / accessibility

92 new keys, complete in English and Arabic (2,825 paired keys pass the parity gate; every
referenced key is proven to exist). No new inline `lang === 'ar'` copy.

Tabs are a `<nav>` with `aria-current="page"` rather than an ARIA tablist, because they are real
destinations that change the URL — a tablist would misdescribe the interaction. Filters are a
labelled `role="group"` of `aria-pressed` buttons. Tab targets are 44px, filter chips 36px.

Responsive verified in-browser at **360 / 390 / 430 / 768 / 1024 / 1440**, LTR **and** RTL:
**0px page-level overflow at every width in both directions**, with no strip leaking outside its own
scroll container. Both themes resolve every token (`--primary` → `#5538F2` light / `#A69AF9` dark).

## 13. Tests

**Backend — 536 passing, 0 failing** (Domain 131 · Application 25 · Architecture 1 · Integration 379).
Added: 36 integration tests (`AdminCommandCentreTests`) covering the attention contract, its
role boundary, all 27 operations/case filters, filter-scoped pagination, and unknown-filter
degradation; plus 10 authorization assertions in `PermissionTests`.

**Frontend — 33/34 gates passing.** Added `check-quality-ux.mjs` (executes the Quality route
resolver, including with the showcase flag off). Extended `check-admin-ux.mjs` to the 7-area IA,
single nav definition, legacy aliases, safe fallback, attention deep links and mount-fan-out ban.
Extended the frontend-integrity smoke to execute all 23 legacy destination keys, 14 route-resolution
cases, deep links with filters, and the lazy-loading/pagination behaviour above. The per-role IA
gates (admin/quality/teacher/nav-unification) were standalone and never invoked — they are now wired
into the frontend suite.

## 14. Business regression check

No financial or lifecycle change. The ledger/escrow model, TeacherPending, payment and refund
semantics, Order lifecycle, Session claim/review lifecycle, non-delivery policy, Request sourcing
model, qualification rules, suspension semantics and the QualityReviewer backend scope are all
untouched. Backend changes are strictly additive: one read-only endpoint and an optional `filter`
parameter that narrows a query and expresses no rule. All 379 integration tests, including the
financial and governance suites, pass unchanged.

## 15. Known pre-existing failures

1. **`check-release5-order-communication.mjs` fails** — `MessagingService.cs` in the working tree no
   longer contains the `sp_getapplock` duplicate-conversation guard that `HEAD` has. Introduced by
   an earlier session, unrelated to this pass, and deliberately **not** fixed here: it is a
   concurrency semantic in a hardened area.
2. **`check-frontend-integrity.mjs` was failing before this pass** — it asserted the legacy
   `tf-dashboard-logout` class that the shared-header consolidation removed and that
   `check-dashboard-nav-unification.mjs` explicitly *forbids*. The two gates contradicted each
   other, so the suite could never pass. Corrected to the shared header control that actually
   renders logout; the intent (every dashboard exposes a working logout) is unchanged.
3. **Live cross-width certification of the full Admin/Quality pages was not run.** It requires
   seeded UAT credentials (`SeedUsers:Password` / `TAFSEEL_UAT_ADMIN_PASSWORD`) that are not
   configured in this environment. The new components were verified in a real browser against the
   real stylesheet (§12); full-page certification remains outstanding.
