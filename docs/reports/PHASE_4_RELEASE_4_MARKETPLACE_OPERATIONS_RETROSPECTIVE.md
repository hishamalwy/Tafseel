# Release 4 retrospective — Marketplace Operations

Date: 2026-08-08

## What was completed

- Admin Review Discovery reconciled and extended only for consistency (localized headers, summary counts, selectedId deep links, Escape/focus).
- Quality actionable Application queue with server-side filter/search/sort/pagination.
- Initial vs Additional subject context as a projection, not a second workflow.
- Showcase/media operational queue (search, summary, item lookup) without merging qualification-sample semantics.
- Shared operational UX patterns (loading / empty / filtered-empty / error).
- Truthful counts from persisted statuses.
- Notification routing via existing `Tafseel.notificationRoute` (Quality/Admin/Teacher).
- Authorization/privacy/concurrency coverage in integration tests.
- Isolated Release publish smoke + health.
- Full backend regression 314/314 (1+89+5+219).

## What was deliberately not completed

- Order-scoped Messaging (Release 5).
- Marketplace analytics, AI search/recommendations, Browse premium redesign.
- Production PSP, live-session provider, durable Showcase storage, malware scanning.
- F-005 RevisionRequest → Delivery schema.
- Privacy/Terms legal content, ranking algorithms, fake metrics.
- Review RowVersion migration (no missing business fact that existing model cannot represent for a dashboard).
- Invented SLA / reviewer-productivity scores.

## Architecture decisions that held

- Operational UI is a projection over canonical domains.
- No second notification system, no OperationsTask aggregate, no parallel state machine.
- Qualification samples ≠ Teacher Showcases.
- FIFO for Quality; Newest for Admin Reviews.
- Prefer no migration.

## Debt that remains

- TeacherReview has no optimistic concurrency token.
- Auth login rate limit (10/min) makes dense Playwright role-matrix fragile.
- Quality application review is a full-page detail, not a dialog (keyboard trap less relevant; Escape-to-close N/A).
- Live Dev may have an empty actionable Quality queue after Foundation UAT drained it.
- Showcase Production remains disabled by design.

## Belongs in Release 5

- Order Communication / order-scoped Messaging (canonical next epic).
- Any notification deep links that depend on conversation threads.

## Belongs in Production Readiness instead

- Durable Showcase storage + malware scanning.
- Production PSP and live-session provider.
- Legal Privacy/Terms content.
- Review RowVersion if multi-admin hide/restore races become a real ops incident.
- Raising or isolating auth rate limits for automated UAT (ops concern, not a product feature).
