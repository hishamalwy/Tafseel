# Phase 4 / Release 4 / Sprint 1 — Admin & Quality Operations Foundation

Date: 2026-08-08
Prompt: [PHASE_4_RELEASE_4_SPRINT_1_ADMIN_QUALITY_OPERATIONS_FOUNDATION.md](../prompts/PHASE_4_RELEASE_4_SPRINT_1_ADMIN_QUALITY_OPERATIONS_FOUNDATION.md)
Evidence: [phase4-release4-sprint1-operations/](./evidence/phase4-release4-sprint1-operations/)

## Verdict

**RELEASE 4 SPRINT 1 PARTIALLY COMPLETED**

One feature — Admin Review Moderation Discovery, the sprint's explicitly-named highest-priority item and
core acceptance criterion — was delivered completely, live-verified end to end, and regression-tested. The
remaining ~30 parts of the sprint specification (Quality Application queue, Additional-Subject-Qualification
clarity, Media/Showcase moderation queue, shared cross-queue filter conventions, deep-link live verification,
notification routing, Playwright harness extension, concurrency/stale-action proofs, accessibility/responsive/
localization sweeps beyond the CI gates, and the release publish smoke test) were **not attempted** this
pass. This was a deliberate scoping decision, communicated during the work: build one thing completely and
disclose the rest honestly, rather than deliver several things shallowly.

## What was built

### Problem addressed

Admin could already moderate an individual review via `POST /admin/reviews/{id}/moderate`, but only if the
Review ID was already known (e.g. from a support ticket or database query). There was no way to browse,
filter, or search reviews from within the Admin Dashboard to find one worth acting on.

### Solution

A read-only discovery layer added on top of the existing moderation write path — no new domain concepts, no
new state machine, no schema change.

**Backend** (`src/Tafseel.Application/Governance/GovernanceContracts.cs`,
`src/Tafseel.Infrastructure/Governance/GovernanceService.cs`,
`src/Tafseel.Api/Controllers/GovernanceController.cs`):

- `GET /api/v1/admin/reviews` — paginated, filterable (visibility: All/Visible/Hidden, rating: 1–5),
  searchable (teacher name / service name / order ID), sortable (Newest/Oldest/Highest/Lowest rating) list
  of reviews, reusing the existing `PagedResult<T>` convention. Deliberately excludes Student PII (no
  student name/email — only `OrderId`, matching what's already exposed elsewhere in Admin tooling).
- `GET /api/v1/admin/reviews/{id}` — full detail: all five rating criteria, overall score, original
  comment, current visibility, and complete moderation history (every prior Hide/Restore action with actor,
  reason, and timestamp).
- Both gated behind the existing `Permissions.ReviewsModerate` policy — no new permission was created, and
  QualityReviewer was deliberately **not** granted this policy (no business-policy instruction to do so was
  given in the Sprint 1 prompt).
- Zero database migration. Confirmed via `dotnet ef migrations has-pending-model-changes` → no pending
  changes.

**Frontend** (`Tafseel-Admin-Dashboard.dc.html`):

- New "Reviews" queue page in the Admin Dashboard sidebar (previously a stub list page) with search box,
  visibility/rating/sort filters, a paginated results table, and an "Open" action per row.
- A detail modal (role="dialog", aria-modal, Escape/Tab-trap via the existing shared
  `Tafseel.modalKeyDown` helper) showing full criteria, original comment, moderation history, and a
  reason-gated Hide/Restore action pair — reusing the existing moderation endpoint, not a new one.
- Deep-link handling in `componentDidMount()` for `?section=reviews&reviewId=...` (implemented, not
  live-verified this pass — see Evidence, Limitations).
- ~33 new localized strings (EN + AR) added to `js/locales.js`.

### Bug found and fixed during live verification

The first live click-through of the new detail modal showed only its header — no criteria, history, or
Hide/Restore controls, despite the API returning a full `200 OK` body. Root cause: a copy-paste error in the
`.dc.html` template — the "loaded content" `<sc-if>` block was gated on the same `reviewDetailLoading`
condition as its own loading-spinner sibling, so once loading finished (`reviewDetailLoading` → `false`),
*neither* branch's condition was true. Fixed by introducing a dedicated `reviewDetailReady` computed prop
and pointing the content block at it. Full detail (including a Hide → filter-by-Hidden → Restore round trip)
was then verified live via curl and the in-app browser — see the evidence log for the exact steps and
network/API confirmations.

## Acceptance criterion verification

The prompt's literal acceptance flow was executed live:
*"Admin: login → Operations → Reviews → find review without knowing ID beforehand → filter/search → open
review → Hide → reason → confirm... Admin → find hidden review through queue → Restore. Verify: public
projection returns... This flow MUST NOT require copying the Review ID manually into a URL/API request."*

Confirmed: at no point did the operator type, paste, or otherwise manually supply a Review ID. The queue
table's "Open" action carries the ID from already-loaded row data into the detail fetch. The Hidden-visibility
filter correctly re-surfaced the just-hidden review for the Restore step. See the evidence log for the full
step-by-step trace, including the one deliberate validation no-op (Restore blocked client-side when the
reason field was empty, matching the same reason-required rule as Hide).

The public teacher-profile aggregate recomputation on Hide/Restore was **not** re-verified visually against
the Teacher Profile page in this pass — that code path (`ModerateReviewAsync`'s existing aggregate-recompute
logic) is unchanged from what was already certified in the Phase 4 Foundation Final Acceptance Gate report,
so it was not considered part of this pass's new-code verification surface, but this is a disclosed gap, not
a confirmed pass.

## Regression evidence

- `node scripts/ci/check-js.mjs` — all 5 sub-checks pass (auth UI isolation, localization for 12 entry
  points / 2996 paired keys, frontend integrity for 13 entry points, guided-request checks, notification
  routing checks).
- `node scripts/ci/check-bug001-display-names.mjs` — pass.
- `node scripts/ci/check-teacher-profile-mobile-cta.mjs` — pass.
- `node scripts/ci/check-template-placeholder-leak.mjs` — pass (12 surfaces scanned; the new modal markup
  introduces no raw resource-attribute interpolation risk).
- Full `dotnet test -c Release`: Architecture 1/1, Domain 89/89, Application 5/5, Integration 215/215 — all
  passing, matching the established Phase 4 baseline, 0 failures.
- `dotnet ef migrations has-pending-model-changes` — no pending changes.

No shared runtime files (`js/tafseel.js`, `support.js`, global CSS, `check-localization.mjs`'s engine) were
touched this pass — only `Tafseel-Admin-Dashboard.dc.html`, `js/locales.js`, and the three new backend files
listed above — so the Foundation regression surfaces (Browse Teachers, Teacher Profile, Student/Teacher
Dashboards, Rate flow, F-013 gate) were exercised only via the shared CI gates above, not re-walked manually
in a live browser this pass. This is a narrower regression scope than Part 26 would ideally call for, and is
disclosed as such rather than claimed as a full manual re-certification.

## Explicitly not done this pass

- Quality Application queue discovery/clarity improvements (Part 3).
- Additional-Subject-Qualification operational clarity (Part 4).
- Media/Showcase moderation queue improvements (Part 5).
- Playwright harness extension covering the new Reviews queue (Part 15) — the live flow above was driven
  manually through the in-app browser tooling, not scripted into `tests/browser/`.
- Deep-link (`?section=reviews&reviewId=`) live click-through verification.
- Notification-routing-into-queue wiring (Part 8).
- Concurrency/stale-action proof for the moderation write path (Part 11) beyond what already existed.
- Dedicated accessibility/responsive/localization manual sweep beyond the automated CI gates (Parts 12–14).
- Automated integration tests for the two new endpoints (correctness was established via live curl + live
  UI only, not codified into `Tafseel.IntegrationTests`).
- Release publish smoke test (Part 19).
- `docs/PROJECT_STATUS.md` was not restructured beyond a status-line update — no new "Release 4" section
  was authored describing the full 31-part target state, since most of it remains undelivered.

## Honest product evaluation

The one feature delivered works, was independently discovered to have a real rendering bug during
verification (not assumed correct from code review alone), and that bug was root-caused and fixed before
being called done. The discovery UX genuinely satisfies the sprint's own stated acceptance bar — an admin
can find and act on a review without ever knowing its ID. That is a real, load-bearing product gap closed.

Against the full Sprint 1 specification as written, this is a small fraction of the requested scope. Calling
this "Release 4 Sprint 1 Verified" would be dishonest — four more operational queues, the E2E harness
extension, and the release-level regression/publish work remain. `PARTIALLY COMPLETED` is the accurate
verdict.
