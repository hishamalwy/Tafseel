# ADR-005: Marketplace Service Governance

## Status

Accepted on 2026-08-01. Ready for the four-release implementation below.

## Context and Evidence

The repository already has the correct ownership chain:

```text
ServiceCatalogItem (marketplace definition)
  -> TeacherService (Teacher + subject configuration)
  -> LearningRequest or LiveSessionBooking
  -> Order and Payment
```

The gap is governance, not a missing domain. Teachers select a catalog row but still provide public titles and required descriptions; catalog limits are inconsistently enforced; Admin cannot configure all existing behavior; and transactions lack rename-safe catalog identity snapshots.

Evidence: [Catalog domain](../../src/Tafseel.Domain/Catalog/Catalog.cs), [Marketplace domain](../../src/Tafseel.Domain/Marketplace/Marketplace.cs), [Orders](../../src/Tafseel.Domain/Orders/Orders.cs), [Live sessions](../../src/Tafseel.Domain/LiveSessions/LiveSessions.cs), [Marketplace service](../../src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs), [Order service](../../src/Tafseel.Infrastructure/Orders/OrderService.cs), [Live-session service](../../src/Tafseel.Infrastructure/LiveSessions/LiveSessionService.cs), [persistence](../../src/Tafseel.Infrastructure/Persistence/TafseelDbContext.cs), and [current dynamic-service architecture](../dynamic-service-architecture.md).

## Decision

Preserve `ServiceCatalogItem` and `TeacherService`. Do not add another template, catalog, translation aggregate, JSON policy, scheduler, pricing system, or service-version aggregate.

## 1. Service Categories

Categories are a fixed code list with labels in Tafseel's existing English/Arabic localization contracts.

| Code | English | Arabic | Order |
|---|---|---|---:|
| `recorded_explanation` | Recorded Explanation | شرح مسجل | 10 |
| `academic_support` | Academic Support | دعم أكاديمي | 20 |
| `live_learning` | Live Learning | تعلم مباشر | 30 |
| `revision_exam_preparation` | Revision and Exam Preparation | المراجعة والاستعداد للاختبارات | 40 |
| `study_materials` | Study Materials | مواد دراسية | 50 |
| `project_guidance` | Project Guidance | إرشاد المشاريع | 60 |

Codes are immutable lowercase snake case, maximum 50 characters. Categories have no table, Admin CRUD, activation, or deletion. Exactly one category is required per service. A service may move category for future presentation; transactions retain their category snapshot. Services retain `DisplayOrder` within the fixed category order. Initial mapping is `recorded_explanation` -> `recorded_explanation`, `assignment_guidance` -> `academic_support`, `exam_revision` -> `revision_exam_preparation`, and `live_session` -> `live_learning`.

## 2. Supported Order Types

The complete set is `async_request` and `live_session`. Recorded explanations, assignment guidance, exam revision, study notes, homework support, summary notes, and project guidance are `async_request`; scheduled one-to-one learning is `live_session`.

Order type is required at creation and may change only before any TeacherService, Request, Order, or booking reference exists. After first reference it is immutable. `RequiresScheduling` becomes derived: true only for `live_session`. Existing code `live_session` plus scheduling backfills `live_session`; other current canonical rows backfill `async_request`; contradictory rows fail the migration audit. Runtime routing moves to order type. `Code` remains immutable identity, not workflow inference. The old scheduling flag and code checks remain compatibility assertions until consumers migrate.

## 3. Qualification Policy

The only valid initial code is `subject_qualification_required`. `no_qualification_required` is rejected for this release because every current service and marketplace predicate is subject-scoped and qualification-gated.

A Teacher may enable or re-enable only when the catalog item is active, public, Teacher-selectable, policy-complete, has a supported order type, and—when live—has an allowed duration; the subject is active; the Teacher has an approved active non-revoked qualification for it; and configuration is policy-compliant. Qualification policy is immutable after first offering reference. Qualification revocation stops new business through the existing lifecycle but does not cancel existing work.

## 4. Pricing Policy

Catalog owns `CurrencyCode`, `MinimumPrice`, `DefaultPrice`, `RecommendedPrice`, and `MaximumPrice`, using decimal money with two fractional digits:

```text
0 < MinimumPrice <= DefaultPrice <= MaximumPrice
0 < MinimumPrice <= RecommendedPrice <= MaximumPrice
```

Initial currency is catalog-owned `SAR`; no Teacher currency choice or per-currency limits exist. Teachers may select any inclusive in-range value. Live price is the one-hour base; existing duration proration and approved emergency premium remain.

Final async acceptance price must be within limits current at acceptance. Validation runs on enable/re-enable, Teacher update, new Request submission, Request acceptance, and live booking. Payment creation validates the immutable transaction amount/currency and payable state; it does not apply later catalog changes to an existing Order/booking. Admin changes affect new business only.

If limits narrow around an offering, compliance is derived immediately. New discovery, Requests/bookings, reactivation, and non-corrective edits are blocked until correction; correction and disable remain allowed. Values are never silently clamped and existing transactions continue.

Backfill keeps existing catalog bounds. Missing bounds use current safety limits `0.01` and `1,000,000.00`; default/recommended use the current first-enable value `120.00`, clamped inside bounds. `live_session` preserves its existing `30.00` minimum. Non-SAR offerings become noncompliant, not rewritten. Admin review of bootstrap values is a Production catalog-content gate.

## 5. Delivery Policy

Every `async_request` service owns integer `MinimumDeliveryHours`, `DefaultDeliveryHours`, `RecommendedDeliveryHours`, and `MaximumDeliveryHours`:

```text
1 <= Minimum <= Default <= Maximum <= 8760
1 <= Minimum <= Recommended <= Maximum
```

Teacher delivery is inclusive in-range. Student preferred deadline is advisory and may be outside the range. At acceptance, `AgreedDeliveryAt - acceptedAt` must be within current limits; urgent labels/free text never bypass this. Live services have no async delivery policy. Historical commitments do not change. Initial async backfill is 1/48/48/8760 hours, matching current domain and dashboard defaults.

## 6. Revision Policy

Catalog owns `DefaultRevisions` and `MaximumRevisions`, with `0 <= Default <= Maximum <= 20`. Teachers and acceptance negotiation may choose zero through maximum, never above it. Orders retain immutable `RevisionAllowance`. Live services use default and maximum zero; follow-up deliverables require an async service. Initial async backfill is default 2, maximum 20.

## 7. Teacher Configuration

Teachers own only enabled state, compliant price, compliant async delivery, compliant revisions, qualified subject on first enable, optional approach notes, and existing live availability.

`ApproachEn` and `ApproachAr` are independently optional plain text, maximum 1,000 characters. Current locale is preferred with fallback to the other. Public UI labels it “Teacher's approach.” It may explain method/scope but cannot replace canonical name/description or override terms, and is excluded from initial search.

Teachers cannot control catalog identity/copy, category, icon, order type, qualification policy, currency/limits, visibility, selectability, or ordering. Subject and catalog item are immutable after offering creation.

## 8. Availability and Disable Semantics

`TeacherService.IsActive` means offered for new business. Existing weekly rules/exceptions remain the only live scheduler; no per-service weekly schedule is added. Multiple live offerings reuse the same Teacher schedule while retaining service-specific durations and policy.

Teacher/Admin disable blocks discovery and new Requests/bookings only. Submitted Requests may finish their lifecycle; Orders remain payable/deliverable/reviewable; future bookings remain scheduled; nothing is destructively cancelled. Existing Request acceptance still validates current commercial limits, but inactive state alone does not invalidate it. UI must distinguish “Unavailable for new business” from active work, and disable confirmation states this impact.

## 9. Uniqueness

The logical key is `TeacherId + SubjectId + ServiceCatalogItemId`. One current row exists per key. Disabled rows occupy it and re-enable in place. The same service across separately qualified subjects is allowed. Price-tier variants are not.

Legacy duplicates remain historical rows marked superseded. The database uniqueness constraint covers non-superseded rows. Superseded rows cannot be edited, enabled, discovered, requested, or booked.

## 10. Existing Data Policy

For each duplicate key, select canonical row by: highest non-terminal Request/Order/booking references; highest total references; active state; latest `UpdatedAt`; then lexicographically smallest `Id`. Mark all others inactive and superseded by it. Keep existing foreign keys on original rows. Emit a repair report with groups, choices, reference counts, and compliance. Abort before unique-index creation on broken references or an unclassifiable row.

Out-of-policy handling is policy D: preserve existing work; show the offering as noncompliant; block new business, reactivation, and non-corrective edits; allow correction/disable; never clamp. Compliance is derived, not a second persisted truth. Copy legacy `TeacherService.Description` to `ApproachEn`; leave Arabic empty rather than guessing language.

## 11. Versioning

No catalog-version aggregate is added. Catalog ID/code are stable. Current copy/icon/category/order/visibility/policy may change under Admin governance. Code is always immutable; order type and qualification policy are immutable after first reference. Policy changes affect new business. Public discovery uses current presentation; transactions use snapshots.

## 12. Historical Snapshots

Today, Requests store TeacherServiceId, Student title/description, preferred deadline and budget; Orders store TeacherServiceId, price/currency, fees, delivery and revisions; bookings store TeacherServiceId, Student title/notes, schedule, price/currency/premium; Payments store target and amount/currency. None stores canonical catalog identity/category/order type/name.

Request submission, Order acceptance, and booking creation will snapshot only:

- `ServiceCatalogItemId`
- `CatalogCode`
- `CategoryCode`
- `OrderType`
- `ServiceNameEn`
- `ServiceNameAr`

Existing commercial snapshots remain authoritative. Student Request/session titles remain work titles, not service identity. Payment resolves catalog context through its immutable target. Old rows are backfilled once from retained TeacherService/catalog relationships and never rewritten afterward.

## 13. Admin Governance

Admin may create; edit localized copy; set category/icon; set initial order type/qualification policy; configure price/delivery/revision/duration policy; activate/deactivate/archive; control visibility/selectability/order; and view enabled Teachers, references, and noncompliance.

Code is immutable immediately. Order type and qualification policy are immutable after first offering reference. Catalog items are never physically deleted in any environment; Development mistakes are archived. Referenced work is never removed. Activation/selectability requires complete valid policy. Existing `SubjectsManage` may protect Release 1; a dedicated permission is deferred unless real role separation requires it.

## 14. Teacher Dashboard UX

The page is `Marketplace Services`. Cards are grouped by fixed category and qualified subject, with Active, Inactive, Not eligible, Catalog unavailable, and Policy correction required states. “Coming soon” is excluded because no persisted state proves it.

Actions are Enable, Configure, Disable, Re-enable. Fields are price, async delivery, revisions, and approach notes. Cards show canonical localized identity, icon/category, ranges/defaults/recommendations, qualification subject, and state. There is no Create Service, editable title, catalog CRUD, duplicate offering, or price tier. Disable confirmation explains that new business stops while existing work continues.

## 15. Student-Facing Presentation

Primary content everywhere is localized catalog name, icon, localized category, and canonical description. Supporting content is Teacher approach, price, async delivery/revisions, or live duration/availability. This applies to Browse, Favorites, Profile, Comparison, Request, Booking, Checkout, Payment, and dashboards. New-business surfaces use current catalog content; transaction/dispute/receipt/audit pages use snapshots.

## 16. Search and Filtering

Initial discovery uses catalog ID/code/name, category, subject/topic, approved qualification, active compliant offering, price range, order type, and authoritative live availability. Arbitrary Teacher title is removed. Approach notes are initially excluded; weighted note search requires later evidence and moderation support. Disabled services disappear from new-business discovery while historical and active-work pages remain readable.

## 17. Analytics

Dimensions are catalog ID/code, category, subject, order type, Teacher, and UTC period. Only persisted evidence is used.

- Enabled offerings: active compliant non-superseded count as of report time; no historical trend without state history.
- New Requests: Requests by `CreatedAt` cohort.
- Accepted Requests: Orders created from those Requests.
- Paid Orders/bookings: transactions with confirmed Payments.
- Completed/cancelled: persisted terminal status counts.
- GTV: sum confirmed `Payment.Amount` through Order/booking snapshot.
- Platform fees: persisted Student fee plus Teacher commission for confirmed Orders. Live fee is unavailable until persisted.
- Rating: average/count of real visible Reviews joined through Order snapshot.
- Acceptance rate: accepted Requests / new Requests in the same Request cohort.
- Request-to-paid: paid Orders / accepted Requests in the same accepted-Order cohort.
- Paid-to-completed: completed Orders / paid Orders in the same paid cohort, as of report time.
- Cancellation rate: terminal cancellations / created transactions of the same order type/cohort.

A zero denominator returns unavailable, not zero. Popularity badges, response-speed claims, satisfaction percentages, and mixed-cohort formulas are not approved.

## 18. Startup Seed Versus Admin Catalog

Hybrid governance is approved. Baseline system codes may be inserted once; Admin owns copy/policy afterward; startup never overwrites Admin changes; new Production services are Admin-created.

- Development: explicit Development initialization may idempotently insert missing baseline identity/demo content without updating existing rows.
- Staging/Production: deployment/migration provisions baseline rows; normal startup is read-only validation and fails closed when required identity/policy is missing.

Current `CanonicalServices` can insert in every environment. Release 1 must move Staging/Production writes to explicit provisioning. This is an implementation gap, not an open decision.

## 19. Backward Compatibility

Existing TeacherServiceId routes and all transactions remain valid. Existing Teacher endpoints may remain through Releases 1-3 but become enable/configure operations. Subject/catalog remain immutable. DTO additions are additive where possible.

During Release 2, legacy `description` maps to approach; legacy `title` is accepted only if it exactly equals current canonical English/Arabic name, otherwise `teacher_service_title_catalog_owned`. From Release 3, any supplied title returns that error. Legacy response `title` temporarily returns localized canonical name. Commercial values are never ignored; invalid values return stable errors with bounds. Release 4 removes title ownership from supported UI/docs; the response alias remains one additional supported-client release and is removed only after usage evidence permits.

## 20. Rollout Plan

### Release 1: Catalog Policy Foundation

- Schema: additive policy/category/icon/order/qualification and transaction snapshot fields.
- Behavior: complete Admin governance, central validation, compatibility routing, read-only Staging/Production startup.
- Compatibility: Teacher behavior and existing DTO fields remain.
- Tests: invariants, immutability, environment seed behavior, backfill, authorization, boundary validation.
- Rollback: previous app with additive columns retained; no destructive down migration.
- Prerequisites: backup, duplicate/noncompliance dry-run, Admin bootstrap-policy review, baseline provisioning.

### Release 2: Teacher Offering Enforcement

- Schema: superseded marker/reference, optional approach fields, filtered unique index.
- Behavior: enable/configure, idempotent re-enable, policy gates, deterministic duplicate repair.
- Compatibility: old paths and section 19 title/description bridge.
- Tests: uniqueness/concurrency, repair, qualification, all validation points, disable-active-work, correction-only flow.
- Rollback: leave superseded rows inactive and additive schema intact.
- Prerequisites: Release 1 stable, accepted repair report, zero broken references.

### Release 3: Consumer Surface Migration

- Schema: none expected.
- Behavior: canonical bilingual presentation across every consumer.
- Compatibility: additive DTOs; response title alias remains; title input rejected.
- Tests: EN/AR, RTL/LTR, filters, disabled historical access, rename-safe snapshots, async/live E2E.
- Rollback: restore prior app/client; additive snapshots remain harmless.
- Prerequisites: supported clients consume canonical fields and surface contract tests pass.

### Release 4: Analytics and Enforcement Completion

- Schema: reporting indexes only; no event/warehouse domain.
- Behavior: approved analytics, Production gates, supported-client title cleanup.
- Compatibility: retain response alias one final client release.
- Tests: numerator/denominator cohorts, confirmed-payment totals, review joins, query plans, migration audit.
- Rollback: disable reports/restore compatibility; never roll back snapshots or repaired data.
- Prerequisites: Production-like rehearsal, metric reconciliation, zero supported title senders, operational sign-off.

## Consequences

Marketplace identity becomes canonical and reportable while Teacher flexibility remains commercial and delivery-specific. Existing work survives policy/availability changes. Historical pages remain understandable after catalog edits. The implementation is additive and introduces no parallel domain.

## Rejected Alternatives

Admin-managed categories, multi-category services, Teacher currencies, per-service calendars, full catalog versions, silent clamping, indefinite grandfathering, price tiers, and physical catalog deletion are rejected for the initial release.

## Implementation Status — Release 1

Implemented locally on 2026-08-01 by migration `20260801135831_MarketplaceServiceCatalogRelease1`. Release 1 adds the approved catalog policy fields, centralized validation, Admin contracts/UI, rename-safe Request/Order/booking snapshots, deterministic backfill audits and read-only normal Staging/Production startup behavior. The migration was generated and validated but not applied. Teacher offering ownership/UX, uniqueness and duplicate repair, approach fields, consumer presentation migration and analytics remain explicitly deferred to Releases 2–4. See the [Release 1 feature report](../features/MARKETPLACE_SERVICE_CATALOG_RELEASE_1_REPORT.md) and [migration report](../database/MARKETPLACE_SERVICE_CATALOG_RELEASE_1_MIGRATION.md).
