# Proposed API Contracts

> Pass 3 implementation note (2026-07-26): current teacher-application mutation endpoints require `If-Match` with the opaque `version` returned by create, mine, and reviewer-queue responses. Missing or malformed input returns RFC 7807 with stable codes; stale SQL rowversion returns `409 concurrency_conflict`. The decision endpoint accepts all nine scores in one request. No score-draft endpoint or broad idempotency-key framework was added.

Phase 1 proposal, base path `/api/v1`. This is the endpoint inventory needed to replace every mock array and `flash()` stub identified in [frontend-requirements-audit.md](frontend-requirements-audit.md). Full request/response DTOs and error catalogs are finalized per-phase during implementation; this document fixes the **shape and authorization** of the surface so Phase 2 scaffolding and the later [frontend-api-contract-map.md](frontend-api-contract-map.md) (page-by-page wiring) have a stable target.

Conventions: all list endpoints paginated (`page`, `pageSize`, `sortBy` whitelisted per the enums in [audit §10](frontend-requirements-audit.md#10-filters-and-sorting-whitelist-source-of-truth)), all mutating endpoints accept an `Idempotency-Key` header where the audit's financial rules require it, errors as RFC 7807 ProblemDetails, all timestamps UTC ISO-8601.

## `/api/v1/auth`
*No frontend page exists for this group ([audit §1](frontend-requirements-audit.md#1-files-inspected)) — designed from the master spec's mandatory auth requirements.*

| Endpoint | Method | Auth | Notes |
|---|---|---|---|
| `/auth/register/student` | POST | Anonymous | email, password, full name |
| `/auth/register/teacher` | POST | Anonymous | Creates ApplicationUser + Teacher role; does **not** grant marketplace visibility until a TeacherApplication is approved |
| `/auth/login` | POST | Anonymous | Rate-limited; returns access token + sets refresh-token cookie |
| `/auth/refresh` | POST | Refresh cookie | Rotates refresh token, reuse detection |
| `/auth/logout` | POST | Authenticated | Revokes current refresh token |
| `/auth/logout-all` | POST | Authenticated | Revokes all refresh tokens for the user |
| `/auth/forgot-password` | POST | Anonymous | Rate-limited |
| `/auth/reset-password` | POST | Anonymous | Token-gated |
| `/auth/confirm-email` | POST | Anonymous | Token-gated |
| `/auth/change-password` | POST | Authenticated | |

## `/api/v1/profile`

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/profile/me` | GET | Authenticated | Header identity chip on every dashboard |
| `/profile/me` | PATCH | Authenticated | Student Settings ([:419-435](../Tafseel-Student-Dashboard.dc.html#L419-L435)), Teacher Profile ([:367-376](../Tafseel-Teacher-Dashboard.dc.html#L367-L376)) |
| `/profile/me/notification-preferences` | GET/PUT | Authenticated | Settings toggles on all 3 dashboard types |
| `/profile/me/avatar` | POST | Authenticated | `Files.Upload` — no UI control found but required by spec |

## `/api/v1/subjects`, `/api/v1/topics`, `/api/v1/education-levels`

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/subjects` | GET | Anonymous | `subjectOptions` filter, [Browse-Teachers:376](../Tafseel-Browse-Teachers.dc.html#L376) |
| `/subjects` | POST | `Subjects.Manage` | Admin catalog "+ Add subject" |
| `/subjects/{id}` | PUT | `Subjects.Manage` | Admin catalog Edit |
| `/subjects/{id}/activate`, `/deactivate` | POST | `Subjects.Manage` | Admin catalog Active toggle — soft deactivation, never hard-delete (spec: catalog data referenced by history) |
| `/topics` | GET/POST/PUT | Anonymous(GET) / `Topics.Manage` | Admin catalog Topics tab |
| `/education-levels` | GET | Anonymous | Fixed 4-value list observed everywhere; still modeled as a table per spec |

## `/api/v1/teacher-applications`

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/teacher-applications` | POST | `Teachers.Apply` | Missing Teacher-Apply page — designed from spec + Quality-Dashboard's `facts` fields |
| `/teacher-applications/{id}/documents` | POST | Owner | Degree cert upload (implied) |
| `/teacher-applications/{id}/demo` | POST | Owner | Demo video upload, ≤180s, MP4 — [Quality-Dashboard:187](../Tafseel-Quality-Dashboard.dc.html#L187) |
| `/teacher-applications/{id}/submit` | POST | Owner | Draft → Submitted transition |
| `/teacher-applications/{id}/withdraw` | POST | Owner | |
| `/teacher-applications` (queue) | GET | `Teachers.ReviewApplications` | [Quality-Dashboard:93](../Tafseel-Quality-Dashboard.dc.html#L93) table, filters: status tab |
| `/teacher-applications/{id}` | GET | `Teachers.ReviewApplications` or owner | Review detail, `facts[]`, demo, rubric, history |
| `/teacher-applications/{id}/scores` | PUT | `Teachers.ReviewApplications` | Rubric score-per-criterion, [:335](../Tafseel-Quality-Dashboard.dc.html#L335) |
| `/teacher-applications/{id}/decision` | POST | `Teachers.ReviewApplications` | body: `{decision: Approve\|RequestChanges\|Reject, comment, internalNotes}`; comment required unless Approve — [:345](../Tafseel-Quality-Dashboard.dc.html#L345) |
| `/teacher-applications/summary` | GET | `Teachers.ReviewApplications` | 4 KPI tiles, [Quality-Dashboard:392-395](../Tafseel-Quality-Dashboard.dc.html#L392-L395) |
| `/teacher-applications/reports` | GET | `Teachers.ReviewApplications` | reviewed-per-week chart |

## `/api/v1/teachers` (public marketplace)

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/teachers` | GET | Anonymous | [Browse-Teachers.dc.html:255](../Tafseel-Browse-Teachers.dc.html#L255) comment explicitly names this shape; query params: `q, subject, level, service, minRating, maxPrice, langs[], verifiedOnly, onlineOnly, availableThisWeek, sort, page` |
| `/teachers/{id}` | GET | Anonymous | Teacher-Profile header/about/stats |
| `/teachers/{id}/samples` | GET | Anonymous | Samples tab |
| `/teachers/{id}/services` | GET | Anonymous | Services tab |
| `/teachers/{id}/availability` | GET | Anonymous | 7-day slot grid, query `weekStart` |
| `/teachers/{id}/reviews` | GET | Anonymous | Reviews tab + breakdown |
| `/teachers/favorites` | GET/POST/DELETE | `Students.CreateRequests` role or general authenticated student | Heart-toggle on Browse and Profile |

## `/api/v1/teacher-services`, `/api/v1/teacher-availability`, `/api/v1/teacher-samples`

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/teacher-services` (mine) | GET/PATCH `{id}/toggle` | `Teachers.ManageOwnServices` | Teacher Dashboard "My Services" |
| `/teacher-availability/rules` | GET/PUT | `Teachers.ManageOwnProfile` | reconciles day-toggle editor with slot-grid display, see [domain model §6](proposed-domain-model.md#6-live-sessions) |
| `/teacher-samples` | GET/POST/DELETE | `Teachers.ManageOwnProfile` | Teaching Samples page (read-only in current frontend; upload endpoint still required) |

## `/api/v1/learning-requests`

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/learning-requests` | POST | `Students.CreateRequests` | Request wizard final submit — body assembles all 5 steps |
| `/learning-requests/{id}/attachments` | POST | Owner (student) | Step 3 uploader |
| `/learning-requests` (mine) | GET | `Requests.ViewOwn` | Student "My Requests", filter=`all\|action\|active\|done` |
| `/learning-requests/pending` (for teacher) | GET | Owner (teacher) | Teacher "New Requests" |
| `/learning-requests/{id}/accept` | POST | `Requests.Accept` + ownership | body: `{finalPrice, deliveryDate, revisions, notes}` — creates the Order — [Teacher-Dashboard accept modal](../Tafseel-Teacher-Dashboard.dc.html#L400-L434) |
| `/learning-requests/{id}/decline` | POST | `Requests.Decline` + ownership | |
| `/learning-requests/{id}/request-clarification` | POST | Owner (teacher) | "Request clarification" button |
| `/learning-requests/{id}` | GET | Owner (student or teacher) | |

## `/api/v1/orders`

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/orders` (mine) | GET | `Requests.ViewOwn` | Teacher "Active Orders" table, stage-tab filter |
| `/orders/{id}` | GET | Participant (student/teacher) or Admin | |
| `/orders/{id}/start` | POST | Owner (teacher) | stage `accepted → progress`, "Start work" action |
| `/orders/{id}/deliveries` | POST | `Requests.Deliver` + ownership | file(s) + notes — **no UI exists**, designed from spec ("Deliver" button is currently a stub) |
| `/orders/{id}/approve` | POST | Owner (student) | `Requests.Complete` — releases escrow; transactional + idempotent |
| `/orders/{id}/request-revision` | POST | Owner (student) | `Requests.RequestRevision`; body: reason |
| `/orders/{id}/cancel` | POST | Participant, rules depend on state | |
| `/orders/{id}` (status history) | GET | Participant/Admin | |

## `/api/v1/live-sessions`

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/live-sessions` (mine) | GET | `Sessions.ManageOwn` | Both dashboards' "Upcoming/Live Sessions" |
| `/live-sessions` | POST | `Sessions.Book` | **No booking form exists in the frontend** — designed from spec + the slot-hold interaction on Teacher-Profile Availability tab |
| `/live-sessions/{id}/reschedule` | POST | Participant | "Reschedule" button, [Student-Dashboard:637-640](../Tafseel-Student-Dashboard.dc.html#L637-L640) |
| `/live-sessions/{id}/cancel` | POST | Participant | |
| `/live-sessions/{id}/join` | GET | Participant | Returns joining-link abstraction; "Opening session room…" stub today |
| `/live-sessions/{id}/complete` / `/no-show` | POST | Owner (teacher) or system job | |

## `/api/v1/conversations`

*No dedicated Chat page exists; designed from the conversation-list UI on both dashboards plus the spec.*

| Endpoint | Method | Auth | Notes |
|---|---|---|---|
| `/conversations` (mine) | GET | Authenticated, participant-only | List with unread counts |
| `/conversations/{id}/messages` | GET | Participant | Paginated history |
| `/conversations/{id}/messages` | POST | Participant | Also broadcasts via SignalR after persisting |
| `/conversations/{id}/read` | POST | Participant | Marks read, updates unread badge |
| `/conversations` | POST | Authenticated | Start from a request/order/session context, or teacher-profile "Contact teacher" pre-request inquiry |

## `/api/v1/notifications`

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/notifications` | GET | Authenticated | Notifications page + slide-over panel |
| `/notifications/unread-count` | GET | Authenticated | Bell badge |
| `/notifications/{id}/read` | POST | Owner | Click-to-read |
| `/notifications/read-all` | POST | Owner | "Mark all read" |

## `/api/v1/reviews`

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/reviews` | POST | `Reviews.Create` + completed-paid-order ownership | Referenced by "My Reviews"/teacher "Reviews" but no visible write form — designed from spec (5-category rubric from Teacher-Profile breakdown) |
| `/teachers/{id}/reviews` | GET | Anonymous | see teachers group above |
| `/reviews/mine` | GET | Owner (student) | Student "Reviews" page |
| `/reviews/{id}/moderate` | POST | `Reviews.Moderate` | Admin Reviews list Flag/Unflag |

## `/api/v1/payments`

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/payments/orders/{orderId}/initiate` | POST | Owner (student), rate-limited | "Payment Required" status → pay action (no explicit pay button in mocks beyond status label; required by escrow narrative) |
| `/payments/webhook` | POST | Provider signature only, **not** end-user auth | Escrow-hold trigger; must be idempotent |
| `/payments/mine` | GET | `Payments.ViewOwn` | Student Payments tab, transaction list |
| `/payments/{id}/refund` | POST | `Payments.Manage` | Admin/dispute-driven, idempotent |

## `/api/v1/withdrawals`

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/withdrawals` (mine) | GET | `Withdrawals.Request` | Teacher Withdrawals history |
| `/withdrawals` | POST | `Withdrawals.Request` | "Withdraw to bank ****4821" button |
| `/withdrawals` (queue) | GET | `Withdrawals.Review` | Admin payments/withdrawals panel |
| `/withdrawals/{id}/process` | POST | `Withdrawals.Review` | Idempotent |

## `/api/v1/disputes`

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/disputes` | POST | `Disputes.Create` + order participant | **No creation UI exists** — designed from spec; Admin list proves the entity is expected |
| `/disputes/mine` | GET | Participant | |
| `/disputes` (queue) | GET | `Disputes.Resolve` | Admin "Open disputes" panel |
| `/disputes/{id}/messages` | GET/POST | Participant or `Disputes.Resolve` | |
| `/disputes/{id}/decision` | POST | `Disputes.Resolve` | Transactional; drives Refund/EscrowRelease |

## `/api/v1/admin`

| Endpoint | Method | Auth | Frontend evidence |
|---|---|---|---|
| `/admin/metrics` | GET | `Reports.View` | 8 KPI tiles, revenue/orders charts, subject share, approval-rate chart |
| `/admin/users` | GET | `Users.View` | Search + role filter + pagination |
| `/admin/users/{id}/suspend`, `/activate` | POST | `Users.Manage` | Per-row + bulk actions |
| `/admin/coupons` | GET/POST/PUT | `PlatformSettings.Manage` (or a dedicated `Coupons.Manage` permission) | Admin catalog Coupons tab |
| `/admin/settings` | GET/PUT | `PlatformSettings.Manage` | commissionRate, requireReview, maintenanceMode |
| `/admin/reports` | GET | `Reports.View` | Reports page |

## `/api/v1/quality`

Covered by the `teacher-applications` group above (Admin's "Teacher Applications" nav item redirects to the same Quality Dashboard UI — [audit §3.7](frontend-requirements-audit.md#37-admin-dashboard-tafseel-admin-dashboarddchtml)); no separate route group needed unless Admin later gets distinct queue semantics.

## Cross-cutting

- Every list endpoint above returns `{items, page, pageSize, totalCount}` plus `CancellationToken` support server-side.
- Every mutating financial endpoint (`payments/*`, `withdrawals/*/process`, `disputes/*/decision`, `orders/{id}/approve`) requires an idempotency key and runs inside a DB transaction per spec.
- Rate-limited per spec: login, register, forgot-password, refresh, file upload, message send, review submit, payment initiate.
