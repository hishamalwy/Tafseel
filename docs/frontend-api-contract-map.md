# Frontend/API Contract Map

Date: 2026-07-27

The browser uses `js/api.js`. API base defaults to same-origin `/api/v1` and can be overridden by `window.TAFSEEL_API_BASE`. Successful `204` responses return `null`; errors use RFC 7807 fields plus `code`, validation `errors`, and correlation identifiers.

## Authentication contract

- Access tokens are held only in the JavaScript closure and sent as `Authorization: Bearer`.
- Refresh tokens remain in the API-issued `Secure`, `HttpOnly`, `SameSite=Strict`, `__Host-` cookie.
- A page reload recovers the session through `POST /auth/refresh`.
- A single refresh is attempted after `401`; the original request is retried once. There is no infinite refresh loop.
- The frontend never stores access or refresh tokens in `localStorage`.
- Helpers: `Tafseel.api.requireSession`, `Tafseel.api.requireRoles([...])`.

## Page mapping

| Page | Action/data | API | Authorization |
|---|---|---|---|
| Landing | Subjects, featured teachers, catalog services | `GET /subjects`, `GET /teachers?pageSize=4`, `GET /services` | Public |
| Browse Teachers | Search/filter cards | `GET /teachers` | Public |
| Browse Teachers | Favorite/unfavorite | `PUT/DELETE /favorite-teachers/{teacherId}` | Student |
| Teacher Profile | Profile, services, samples, availability, booking policy | `GET /teachers/{teacherId}` | Public |
| Teacher Profile | Public reviews | `GET /teachers/{teacherId}/reviews` | Public |
| Teacher Profile | Start inquiry | `POST /conversations` via Chat (`?otherUserId=`) | Authenticated participant |
| Book Session | Slots | `GET /live-sessions/teachers/{teacherId}/slots?teacherServiceId=` | Public |
| Book Session | Book | `POST /live-sessions` | Student (`Sessions.Book`) |
| Payment | Initiate order payment | `POST /payments/orders/{orderId}` + `Idempotency-Key` | Student |
| Payment | Initiate live-session payment | `POST /payments/live-sessions/{id}` + `Idempotency-Key` | Student |
| Request | Create request | `POST /learning-requests` | Student |
| Request | Upload private attachments | `POST /learning-requests/{id}/attachments`, `If-Match` | Owning Student |
| Student Dashboard | Requests/orders/sessions | `GET /learning-requests/mine`, `GET /orders/mine`, `GET /live-sessions/mine` | Student |
| Student Dashboard | Pay order | `POST /payments/orders/{id}` | Student |
| Student Dashboard | Favorites / conversations / notifications | favorites, conversations, notifications endpoints | Student/participant |
| Teacher Dashboard | Profile/services/availability | `GET/PUT /teachers/me`, service create/update/active, availability rules | Owning Teacher |
| Teacher Dashboard | Incoming requests/orders/sessions | assigned requests/orders, live-sessions/mine | Teacher |
| Teacher Dashboard | Withdrawals/balances | `GET /withdrawals/balances`, `POST /withdrawals` | Teacher |
| Teacher Apply | Catalog and application status | subjects/topics + teacher-application endpoints | Teacher |
| Quality Dashboard | Queue/start/decision | teacher-application queue and transitions | Quality Reviewer |
| Admin Dashboard | Users/catalog/metrics/withdrawals/disputes | admin endpoints | Admin permissions |
| Chat | Conversations/messages/read | conversation endpoints; 5s polling via `js/chat.js` | Participant |
| Auth | Register/login/refresh/logout | `/auth/*` | Public/session |

## Service catalog contract

- Admin global enable/disable is authoritative (`PATCH /admin/catalog/services/{id}/active`).
- Service catalog metadata is authoritative for canonical service behavior: `code`, `type`, `isPublic`, `teacherSelectable`, `requiresScheduling`, `allowedDurations`, `minPrice`, `maxPrice`, `displayOrder`.
- Teacher cannot re-enable a service whose catalog item is inactive.
- Public teacher profile and booking APIs filter inactive or non-public catalog items plus inactive teacher services.
- Frontend Book/Request CTAs must not invent availability; they use server-returned `canBook` / `canRequest` flags and disabled services still fail server-side with `teacher_service_not_found`.

`TeacherProfileDto.Services[*]` now carries:

- `serviceCatalogCode`
- `serviceCatalogType`
- `isCatalogActive`
- `isPublic`
- `teacherSelectable`
- `requiresScheduling`
- `allowedDurations`
- `minPrice`
- `maxPrice`
- `displayOrder`
- `canRequest`
- `canBook`

`TeacherProfileDto.LiveSessionBookingPolicy` now carries:

- `emergencyPremiumPercent`
- `cancellationWindowHours`

## Concurrency and financial controls

- Frontend mutations forward the latest DTO `version` in `If-Match`.
- Acceptance, payment, withdrawal, refund, and dispute financial actions require stable idempotency keys.
- Payment success is never inferred from a browser response; only a verified provider webhook can confirm it.
- Payments target exactly one payable: `OrderId` **or** `LiveSessionBookingId`.
- Private file downloads and uploads remain server-authorized by resource ownership.

## Intentional boundaries

- The original `.dc.html` visual system is preserved.
- Chat uses five-second REST polling; SignalR hub remains available for a future transport.
- Coupons and runtime platform-setting mutation are not working controls (no Coupon entity and no payment coupon endpoints). Payment page shows an honest unavailable notice instead of inventing apply/validate calls.
- Live-session escrow release / refund product rules are not configured; admin refund rejects live-session payments with `live_session_refund_unsupported`.
- Tap Payments (or any non-mock provider) is not integrated; `IPaymentProvider` is currently `MockPaymentProvider` only.
