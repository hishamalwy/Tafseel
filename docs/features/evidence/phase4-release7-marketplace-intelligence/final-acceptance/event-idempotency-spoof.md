# Idempotency, spoof, invalid IDs

- Same `ClientEventId` `browse_viewed` posted twice → both HTTP 202; Admin browse count **+1** not +2.
- `payment_confirmed`, `order_completed`, `review_submitted` → **400**.
- Invalid teacher/service context → **400**.
- Publish smoke repeated spoof 400 + ingest 202.
