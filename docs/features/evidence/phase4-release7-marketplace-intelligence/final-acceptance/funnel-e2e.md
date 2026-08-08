# Funnel E2E

Isolated window starting ~2026-08-08T17:40Z (see `lifecycle-funnel-snapshots.json`).

Drop-off: Browse → Profile → Guided Request (draft restore) → **no submit**. `request_submitted` stayed at baseline 0. Accepted/paid/completed stayed 0.

Full async lifecycle via supported APIs + mock payment simulator only (no raw SQL):

| Stage | Source | Isolated delta |
|---|---|---|
| request_submitted | LearningRequest.CreatedAt | +1 |
| request_accepted | Order.CreatedAt | +1 after accept, not earlier |
| payment_started | Payment.CreatedAt | +1 after initiate, not earlier |
| payment_confirmed | Payment.ConfirmedAt | +1 after mock simulator complete |
| delivery_submitted | OrderDelivery.CreatedAt | +1 |
| order_completed | OrderStatusHistory Completed | +1 |
| review_submitted | TeacherReview.CreatedAt | +1 |

Exact reconciliation: `transaction-reconciliation.json`. Client events were not used as transactional truth.
