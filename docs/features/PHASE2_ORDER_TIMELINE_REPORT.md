# Owned Order Lifecycle Timeline Report

Date: 2026-07-29  
Status: Completed locally

## Findings

The Order lifecycle already has sufficient persisted evidence for a participant-facing timeline without a migration:

| Timeline Event | Persisted Source | Actor Available | Safe Metadata | Student Visible | Teacher Visible | Include/Exclude |
|---|---|---|---|---|---|---|
| `awaiting_payment` | `OrderStatusHistory` | Actor ID | None | Yes | Yes | Include |
| `payment_confirmed` | `Payment.ConfirmedAt` | No | None | Yes | Yes | Include as System |
| `work_started` | `OrderStatusHistory` | Actor ID | None | Yes | Yes | Include |
| `delivery_uploaded` | `OrderDelivery` | Writer invariant | Original filename | Yes | Yes | Include each immutable row |
| `revision_requested` | `RevisionRequest` | Writer invariant | Revision sequence | Yes | Yes | Include each row |
| `completed` | `OrderStatusHistory` | Actor ID | None | Yes | Yes | Include |
| `cancelled` | `OrderStatusHistory` | Actor ID | None | Yes | Yes | Include |
| `payment_refunded` | `Payment.RefundedAt` | No | None | Yes | Yes | Include as System |
| Delivered/revision status duplicates | `OrderStatusHistory` | Actor ID | None | Yes | Yes | Exclude because stronger delivery/revision records exist |
| Learning Request history | `LearningRequestStatusHistory` | Actor ID | Request-level data | No | No | Exclude; pre-Order and duplicative |
| Payment attempts/provider records | Payment integration records | Internal/provider actor | Provider-private data | No | No | Exclude |
| Disputes/moderation | Dispute records | Mixed/private | Private evidence | No | No | Exclude from this participant slice |

The current revision schema does not link a revision request to a delivery. The timeline therefore presents revisions honestly at Order level and does not invent that relationship. Delivery rows do not persist a public version number, so no version number is manufactured.

The lifecycle is bounded by the existing revision allowance and legal transitions. The complete timeline is returned without introducing a new pagination contract. The projection uses five fixed, no-tracking queries and has no N+1 path.

## Root Cause

The necessary lifecycle evidence existed, but there was no owned API projection or shared Student/Teacher presentation. Reconstructing from the current Order status would have been inaccurate, especially for repeated deliveries, revisions and refunds.

## Fix

- Added `GET /api/v1/orders/{orderId}/timeline` under the existing Orders surface.
- Reused the existing ownership anti-enumeration convention: only the owning Student or assigned Teacher resolves the Order; anonymous access is `401`, and unrelated/wrong-role callers receive the existing not-found response.
- Added a focused Application DTO containing stable ID, event code, UTC occurrence time, safe actor role and allowlisted metadata.
- Projected only persisted status, payment timestamp, delivery and revision evidence.
- Ordered by `occurredAt`, then source priority, then ordinal stable ID. Source priorities are status `10`, payment `20`, delivery `30`, revision `40`.
- Exposed only role labels (`student`, `teacher`, `system`), original delivery filename and revision sequence. Storage keys, provider data, reasons and private evidence remain hidden.
- Added the same localized modal timeline to Student and Teacher Order surfaces, with loading, empty, error/retry and success states.
- Centralized event localization and keyboard dialog handling in the existing shared frontend utility. The dialog restores focus, closes on Escape and traps Tab focus.
- Added integration coverage for ownership, role boundaries, deterministic evidence, safe metadata and refund visibility.

No lifecycle rule, payment semantic, revision schema or database model was changed.

## Validation

| Check | Result |
|---|---|
| `dotnet restore Tafseel.sln --locked-mode` | Passed |
| `dotnet format Tafseel.sln --verify-no-changes --no-restore` | Passed |
| Release build | Passed, 0 warnings and 0 errors after stopping the controlled local API process |
| Phase 5 Order integration suite | Passed, 4/4 |
| Refund timeline integration test | Passed, 1/1 |
| Frontend syntax/localization/integrity | Passed for 12 entry points and 1,873 paired keys |
| Focused timeline frontend contract/accessibility check | Passed |
| Impeccable detector | No timeline defect; two pre-existing single-font warnings |
| EF pending model changes | None |
| Migration safety tests | Passed, 9/9 |
| Publish smoke | Passed |
| `git diff --check` | Passed; line-ending conversion warnings only |
| Full solution tests | Domain 57/57, Application 5/5 and Architecture 1/1 passed; Integration 133/135 passed |

The two full-suite failures are the already-known Marketplace isolation/time-out behavior: `Favorites_are_unique_and_idempotent` and `Public_search_has_fixed_sort_pagination_filters_and_two_queries` each timed out with a 500 after 30 seconds. Both focused timeline tests passed and no timeline code participates in those Marketplace queries.

Browser rendering with a real owned Order was not claimed: the safe Development host had no legitimate authenticated owned-Order fixture, and this pass explicitly prohibited mock data and direct record insertion. The controlled API and static-server processes were stopped after investigation.

## Files Changed

Feature implementation:

- `src/Tafseel.Application/Orders/OrderContracts.cs`
- `src/Tafseel.Infrastructure/Orders/OrderService.cs`
- `src/Tafseel.Api/Controllers/OrdersController.cs`
- `tests/Tafseel.IntegrationTests/Phase5OrderTests.cs`
- `tests/Tafseel.IntegrationTests/Phase7FinancialTests.cs`
- `Tafseel-Student-Dashboard.dc.html`
- `Tafseel-Teacher-Dashboard.dc.html`
- `js/tafseel.js`
- `js/locales.js`
- `scripts/ci/check-frontend-integrity.mjs`

Documentation:

- `docs/features/PHASE2_ORDER_TIMELINE_REPORT.md`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

The shared workspace advanced externally through commits `0c4cf88` and `a0c82a4` while this pass was running. This pass did not create a commit, push or deployment and did not rewrite that history.

## Risks

- Revision requests still cannot identify a target delivery version; solving that belongs to F-005 and requires an explicit schema/business decision.
- Safe actor display is role-only because personal display names were not required by the persisted timeline contract and the supplied request ended mid-sentence after “Use only safe values such as”.
- Real browser evidence for populated Student/Teacher timelines remains pending a legitimate safe owned Order.
- The unrelated Marketplace full-suite isolation/time-out issue remains open.

## Next Step

Perform the focused F-005 evidence and schema decision for revision-to-delivery version linkage. Do not retrofit inferred links into this timeline.
