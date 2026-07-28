# Final frontend page and role map

Date: 2026-07-27  
Published allowlist: `Program.cs` `frontendPages` (13 `.dc.html` pages).

## Pages

| Page | Roles | Primary APIs | Notes |
|---|---|---|---|
| Landing | Public | `GET /subjects`, `/teachers`, `/services` | No fake teacher/service counts; empty sections stay honest |
| Browse Teachers | Public (+ Student favorites) | `GET /teachers`, favorites | |
| Teacher Profile | Public | `GET /teachers/{id}`, reviews | Book/Request CTAs use server-returned service flags |
| Book Session | Student | `GET /live-sessions/teachers/{id}/slots?teacherServiceId=` + `POST /live-sessions` | Exact selected service gates slots and booking |
| Payment | Student | `POST /payments/orders\|live-sessions/{id}` | Real initiation; coupon UI honest-unavailable (no API) |
| Request | Student | `POST /learning-requests` | No payment until teacher accepts → order |
| Student Dashboard | Student | requests, orders, sessions, payments, favorites, notifications | Sections cover payments/files/reviews UX |
| Teacher Dashboard | Teacher | profile, services CRUD/active, availability, orders, sessions, withdrawals | |
| Teacher Apply | Teacher | applications | |
| Quality Dashboard | QualityReviewer | application queue | |
| Admin Dashboard | Admin | users, catalog, metrics, withdrawals, disputes | Coupons/settings = honest disabled |
| Embedded chat | Student / Teacher dashboards | conversations via `js/chat-widget.js` | Standalone route redirects for compatibility |
| Auth | Public | `/auth/*` | |

## Book Live Session visibility (exact)

Show active CTA only when:

1. Public profile includes at least one service where `service.canBook === true` **and** `service.serviceCatalogCode === 'live_session'`
2. That service is a canonical `live_session` teacher service whose catalog item is active, public, teacher-selectable, scheduling-capable, and duration-allowed
3. The teacher service itself is active and still backed by an active subject qualification on a published profile
4. The teacher has availability rules; the Book page still requires a free slot and student authorization
5. Viewer is Student or anonymous on the public profile (staff roles never see the live-session CTA; the booking page itself requires Student)

Never select the first non-live teacher service as a Book Live Session fallback.

## Missing standalone pages — intentionally not added

| Apparent need | Satisfied by |
|---|---|
| Payments history | Student Dashboard `payments` |
| Live sessions list/join | Student/Teacher Dashboard `sessions` |
| Earnings/withdrawals | Teacher Dashboard sections |
| Catalog admin | Admin Dashboard catalog |
| Applications review | Quality Dashboard |
| Platform settings mutation | Deployment-managed (honest stub) |
| Coupons | Not enabled (honest flash) |

## Role gating

Dashboards use `Tafseel.api.requireRoles([...])`. Wrong-role users are redirected; API policies remain authoritative.
