# Live Fixture Setup — Final Acceptance Gate

All fixtures created through the real, legitimate application API — no raw SQL, no
direct business-state mutation. Every step below is exactly what a real Student/
Teacher's browser would call.

## Fixture 1 — real Rate Teacher certification order

`orderId = a956cb05-b681-42aa-a1f8-b4b6fc3789d4`

1. Student: `POST /api/v1/learning-requests` (real Request Wizard contract: `teacherServiceId`, `title`, `description`, `preferredDeliveryAt`, `budget`).
2. Teacher: `POST /api/v1/learning-requests/{id}/accept` (with `If-Match` version header).
3. Student: `POST /api/v1/payments/orders/{orderId}` (init), then confirmed via the real
   browser UI — clicked "Pay securely" -> Mock Checkout -> "Simulate successful payment"
   (no raw webhook signature forgery).
4. Teacher: `POST /api/v1/orders/{orderId}/start`.
5. Teacher: `POST /api/v1/orders/{orderId}/deliveries` (real multipart file upload).
6. Student: `POST /api/v1/orders/{orderId}/complete`.

Verified via API before certifying anything: `status: 4` (Completed), `hasReview:
false`, `reviewCanSubmit: true`. This order was then used for the live modal
certification, F-013 5-cycle retention, and the actual rating submission (see
`real-rate-teacher-certification.md`) — it is now `hasReview: true` and intentionally
not reused.

## Fixture 2 — stable matrix Rate Teacher order (never rated)

`orderId = 255f5c11-460f-4cc6-9310-a0ffde6699b7`

Identical lifecycle to Fixture 1, but its rating is **never submitted** — it exists
solely so the 384-cell matrix's `rate-modal` surface (visited 24 times, once per
viewport/mode combination) can repeatedly open the real star-rating form without
collapsing into the Order Timeline modal partway through the run. Verified `status: 4,
hasReview: false, reviewCanSubmit: true` before the matrix run; confirmed still
`hasReview: false` after (opening the modal via navigation never submits anything).

## Fixture 3 — Accept Request modal

`requestId = b12513ee-804a-49bd-b816-f1da8f8edfb7`

A fresh `POST /api/v1/learning-requests`, deliberately left unaccepted, so the Teacher
Dashboard's live "Accept" action and its modal are genuinely reachable.

## Fixture 4 — Delivery Upload modal

`orderId = 77d5777e-f976-44c6-9600-3585b97ca88b`

Request -> Accept -> Payment (browser-confirmed) -> Start work, deliberately left
undelivered, so the Teacher Dashboard's live "Upload delivery" action and its modal are
genuinely reachable.

## Fixture 5 — Admin Service Catalog

No new fixture needed — used the existing canonical `recorded_explanation` Service
Catalog item via the real "+ Add service" / "Edit" actions on the live Admin dashboard,
per the prompt's explicit instruction not to fabricate a new catalog entry when an
existing one suffices.

## Credentials

All fixtures created via the existing Sprint 0.2 Development-only UAT accounts
(Student, Teacher, Admin/QualityReviewer) — no new accounts created, no passwords
exposed in any report or evidence file.
