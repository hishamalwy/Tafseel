# Dynamic service architecture

Date: 2026-07-27  
Source of truth: current domain, API, and frontend code.

## Canonical model (chosen)

Extend the existing catalog stack. **Do not** introduce a parallel service domain.

```
ServiceCatalogItem
  - `Code` (required, unique, lowercase snake_case, immutable after create)
  - `Type`
  - `IsActive` (global enable)
  - `IsPublic`
  - `TeacherSelectable`
  - `RequiresScheduling`
  - `AllowedDurations`
  - `MinPrice` / `MaxPrice`
  - `DisplayOrder`
        ↑
TeacherService
  - teacher-level `IsActive`
  - title / description / price / currency / deliveryHours / revisions
        ↑
Public profile / slots / book / learning-request
  - all gate on active catalog + active teacher service + subject + qualification + published profile
```

Availability remains **teacher-level** (`TeacherAvailabilityRule` / exceptions), not per-service. Concurrent capacity is implicit: one overlapping `AwaitingPayment|Confirmed` booking blocks the slot (serializable tx + applock).

Live duration is chosen at booking time from the selected catalog item `AllowedDurations` (canonical `live_session` defaults to `30|60|90|120`). Price = `TeacherService.Price * duration/60` (+ optional emergency premium from config).

**Capability inference:** runtime booking and CTAs use only `ServiceCatalogItem.Code` and catalog flags. Display/translated names are never used to decide live-session capability.

## Migrations (additive)

1. `ServiceCatalogItemCode` — adds `Code`, deterministic backfill for exact `NormalizedName` keys (`LIVE SESSION` → `live_session`, etc.), unique `legacy_*` codes for unknown rows, unique index `IX_ServiceCatalogItems_Code`.
2. `ServiceCatalogItemMetadata` — adds scheduling/public/price/display metadata + check constraints (including `CK_ServiceCatalogItems_Code`).
3. `ServiceCatalogItemCodeConstraints` — aligns unique index filter with EF model (`[Code] IS NOT NULL`).

Historical `TeacherService`, `Request`, `Order`, `Payment`, and `LiveSession` rows are preserved (no deletes).

## Service visibility gates (student)

A student may book/request a service only when **all** gates pass:

1. Catalog item `IsActive`
2. Catalog item `IsPublic`
3. Catalog item `TeacherSelectable`
4. Teacher service `IsActive`
5. Teacher subject qualification exists for the service subject
6. Subject `IsActive` and teacher profile `IsPublished`
7. For live booking: catalog item `RequiresScheduling`, `Code == live_session`, requested duration is allowed, availability rules exist, and the chosen slot is free
8. Caller is authorized (`Sessions.Book` / learning-request Student policies)

Stable live-booking business errors include: `service_not_live_session`, `catalog_service_inactive`, `teacher_service_inactive`, `catalog_service_unavailable`, `teacher_not_approved`, `slot_unavailable`, `session_conflict`.

Backend enforces these rules on `BookAsync`, slots lookup, and learning-request create. Frontend mirrors them using server-returned `canBook` / `canRequest` flags plus explicit `serviceCatalogCode === 'live_session'`; API remains authoritative.

## Admin controls

| Action | Endpoint |
|---|---|
| List/create/edit/activate services | `GET/POST /api/v1/admin/catalog/services` (list/active), `POST /api/v1/admin/services`, `PUT`, `PATCH .../active` |
| Public catalog (active only) | `GET /api/v1/services` |

## Teacher controls

| Action | Endpoint |
|---|---|
| CRUD own services | `POST/PUT /api/v1/teachers/me/services`, `PUT .../active` |
| Availability | `POST/DELETE .../me/availability/rules|exceptions` |
| Own profile (all services) | `GET /api/v1/teachers/me` |
| Public profile (active + public + selectable only) | `GET /api/v1/teachers/{id}` |

## Live session payment

Additive migration `LiveSessionPayments`:

- `Payment.OrderId` nullable
- `Payment.LiveSessionBookingId` nullable (XOR check)
- `EscrowEntry` similarly targets order **or** live session

| Action | Endpoint |
|---|---|
| Initiate | `POST /api/v1/payments/live-sessions/{bookingId}` + `Idempotency-Key` |
| Confirm | Mock/provider webhook → `LiveSessionBooking.ConfirmPayment` |

Live-session **refund/release** rules are intentionally deferred (business ambiguity).

## Intentionally not modeled

- Per-service capacity / multi-seat
- Per-service duration stored on `TeacherService` (durations belong to the catalog item)
- Runtime `PlatformSettings` entity (permission exists; config is deployment-managed)
- Coupons (no entity, no payment coupon endpoints)
