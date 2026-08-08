# Completed Order remount

## Historical failure

Final Acceptance: one Completed-Order remount timed out waiting for the composer. Mix of:

- **Test Issue:** Auth/refresh 429 left `Tafseel.api.ready()` null; `TafseelChat` never exported; Playwright waited on a missing global. Hidden DC placeholder `[data-r5-notification]` / first composer selector races.
- **UI/View Issue:** `select()` silent-return when the conversation was absent from the first inbox page; `boot()` gave up after failed `ready()` until `tafseel:auth`; `loadList` throw aborted boot before `TafseelChat` assignment.

Not classified as Test Issue merely because it was intermittent.

## Fix (smallest lifecycle)

- Fallback `active = { id }` when the conversation is not in the first 50.
- `tafseel:auth` retries boot if the widget is missing.
- Export `TafseelChat` before list/hub work; catch list/message fetch errors.
- Idempotent `inject()`; `selectSeq` for rapid A/B.

## 20-cycle

Same Completed Order conversation `934ce59e-179a-4351-8dde-1da5aa90efeb` (Order `255f5c11-460f-4cc6-9310-a0ffde6699b7`). Path: Student Dashboard → Completed filter → Messages / `openThread`. **20/20** composer visible (`completed-order-20-cycle.json`).

Hard reload + back/forward: no half-mounted widget. Product does not persist selected conversation in history unless `conversationId` is on the query string; documented, not invented.

Closed-order policy unchanged: Completed remains read+write+attachments+realtime+notify.
