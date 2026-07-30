# Order vs Request UX Separation

**Date:** 2026-07-30  
**Type:** Critical product bug fix  
**Constraints:** No business-rule redesign, no Order lifecycle change, no invented APIs, no commit/push/deploy

## Verdict

**ORDER/REQUEST UX CONDITIONALLY VERIFIED**

Canonical Student projection now separates Learning Requests from Orders. Browser UAT of the full accept→pay→deliver path remains conditional on a live Development API session.

## Findings

| Surface | Problem |
|---|---|
| Student Dashboard | Merged `/learning-requests/mine` + `/orders/mine` into one `REQUESTS` list |
| After Teacher accept | Backend correctly creates Order and leaves Request `Accepted` |
| UI | Showed **Accepted request** and **Payment-required Order** as two rows |
| Teacher Dashboard | Already filtered pending to `status === 0`; hardened with `learningRequestId` de-dupe |
| Names | Partial GUID leakage risk on toast `requestCreated={id}` |

## Root Cause

Domain truth is 1 LearningRequest → 1 Order after accept. Student list APIs correctly return both entities. The dashboard **projection** treated them as interchangeable work items and rendered both without using `Order.learningRequestId` as the hard link.

## Fix

1. Added `Tafseel.projectStudentWorkList` / `filterStudentWorkList` in `js/tafseel.js`
2. Pending Requests = status `0|1` **and** id not present in any Order’s `learningRequestId`
3. Orders = Order rows only; Completed filter = completed Orders only
4. Student Dashboard bootstrap/reload use the helper (no Accepted + Order pairs)
5. Pay remains navigation to `Tafseel-Payment.dc.html?orderId=` → initiate → Mock Checkout when simulator enabled
6. Teacher pending also excludes request ids that already have Orders
7. Toast after create no longer shows GUID fragments
8. Work-list UI labels/filters/empty states clarified (Pending / Orders / Completed)

## Browser Validation

API smoke against LocalDB demo student (`student@gmail.com`):

- `learning-requests/mine`: 2 items, both `Accepted` (status 2)
- `orders/mine`: 2 items, both linked via `learningRequestId`
- Overlap (Accepted request that already has an Order): **2** — these duplicated in the old UI
- Canonical projection: pending requests = **0**, orders = **2** → **no duplicate rows**

Automated: Release build, Phase5/Phase7/MockPayment tests (12), frontend integrity (13), localization, `git diff --check` (CRLF warnings only).

Full Student→Teacher→Pay→Mock→Deliver browser click-path remains conditional (requires interactive session).

## Files Changed

- `js/tafseel.js`
- `js/locales.js`
- `Tafseel-Student-Dashboard.dc.html`
- `Tafseel-Teacher-Dashboard.dc.html`
- `docs/fixes/ORDER_REQUEST_UX_SEPARATION_REPORT.md`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

## Remaining Bugs

- Declined/cancelled Learning Requests are intentionally omitted from the Student work list (not shown under Completed)
- Full viewport matrix / live browser E2E not re-proven in this pass
- Backend still returns Accepted requests on `/learning-requests/mine` (correct domain; UI filters them)

## Risks

- If `learningRequestId` were ever missing from Order DTOs, de-dupe would fall back to status filters only
- Clients on stale published frontend may still show the old merge until rebuild/sync

## Next Step

Run live browser UAT: Student request → Teacher accept → assert one Order row → Pay → Mock success → Teacher start/deliver → Student complete.
