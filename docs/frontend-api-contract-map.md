# Frontend/API Contract Map

Date: 2026-07-26

The browser uses `js/api.js`. API base defaults to same-origin `/api/v1` and can be overridden by `window.TAFSEEL_API_BASE`. Successful `204` responses return `null`; errors use RFC 7807 fields plus `code`, validation `errors`, and correlation identifiers.

## Authentication contract

- Access tokens are held only in the JavaScript closure and sent as `Authorization: Bearer`.
- Refresh tokens remain in the API-issued `Secure`, `HttpOnly`, `SameSite=Strict`, `__Host-` cookie.
- A page reload recovers the session through `POST /auth/refresh`.
- A single refresh is attempted after `401`; the original request is retried once. There is no infinite refresh loop.
- The frontend never stores access or refresh tokens in `localStorage`.

## Page mapping

| Page | Action/data | API | Authorization |
|---|---|---|---|
| Landing | Subject/teacher discovery entry | `GET /subjects`, navigation to teacher search | Public |
| Browse Teachers | Search/filter cards | `GET /teachers` | Public |
| Browse Teachers | Favorite/unfavorite | `PUT/DELETE /favorite-teachers/{teacherId}` | Student |
| Teacher Profile | Profile, services, samples | `GET /teachers/{teacherId}` | Public |
| Teacher Profile | Public reviews | `GET /teachers/{teacherId}/reviews` | Public |
| Teacher Profile | Start inquiry | `POST /conversations` via Chat page | Authenticated participant |
| Request | Create request | `POST /learning-requests` | Student |
| Request | Upload private attachments | `POST /learning-requests/{id}/attachments`, `If-Match` | Owning Student |
| Student Dashboard | Requests/orders | `GET /learning-requests/mine`, `GET /orders/mine` | Student |
| Student Dashboard | Favorites | `GET /favorite-teachers` | Student |
| Student Dashboard | Notifications | `GET /notifications`, `POST /notifications/read` | Authenticated |
| Teacher Dashboard | Incoming requests/orders | `GET /learning-requests/assigned`, `GET /orders/assigned` | Teacher |
| Teacher Dashboard | Clarify/decline/accept | request transition endpoints with `If-Match`; accept also requires `Idempotency-Key` | Assigned Teacher |
| Teacher Dashboard | Start/deliver | `POST /orders/{id}/start`, `POST /orders/{id}/deliver` with `If-Match` | Assigned Teacher |
| Teacher Apply | Catalog and application status | `GET /subjects`, `GET /topics`, `GET /teacher-applications/mine` | Teacher where applicable |
| Teacher Apply | Create/update/demo/submit | teacher-application endpoints with private upload and `If-Match` | Owning Teacher |
| Quality Dashboard | Queue/start/decision | teacher-application queue and transition endpoints with `If-Match` | Quality Reviewer |
| Admin Dashboard | Users/suspension | `GET /admin/users`, `PUT /admin/users/{id}/suspension` | Admin permissions |
| Admin Dashboard | Metrics/catalog/disputes | Admin report, catalog, and dispute endpoints | Admin permissions |
| Admin Dashboard | Pending withdrawals/process | `GET /admin/withdrawals`, `POST /withdrawals/{id}/process` with `If-Match` and `Idempotency-Key` | Withdrawal reviewer |
| Chat | Conversations/messages/read | conversation endpoints; message history polling every five seconds | Participant only |
| Auth | Register/login/refresh/logout | `/auth/*` | Public/session |
| Auth | Confirmation/reset | `/auth/confirm-email`, `/auth/forgot-password`, `/auth/reset-password` | Public, token-bound |

## Concurrency and financial controls

- Frontend mutations forward the latest DTO `version` in `If-Match`.
- Acceptance, payment, withdrawal, refund, and dispute financial actions require stable idempotency keys.
- Payment success is never inferred from a browser response; only a verified provider webhook can confirm it.
- Private file downloads and uploads remain server-authorized by resource ownership.

## Intentional boundaries

- The original `.dc.html` visual system is preserved.
- The Chat UI uses five-second REST polling; the authenticated SignalR hub remains available for a future zero-latency browser transport.
- Coupons and runtime platform-setting mutation are not represented as working controls because no approved backend business rules exist for them.
