# Request fan-out analysis

Measured 2026-08-08 against Development `http://127.0.0.1:5090`. Artifact: `request-budget-baseline.json`, `single-remount-trace.json`.

## One legitimate remount

| Action | First-party | Auth refresh | Negotiate | Conversations list | Status |
|---|---|---|---|---|---|
| Student dashboard load | 34 | 1 | 1 | 2 | 0 429 / 0 401 |
| Teacher dashboard load | 39 | 1 | 1 | 2 | 0 429 / 0 401 |
| Conversation open (incremental) | 7 | 0 | 0 | bounded | 0 429 |
| Student remount + reopen | 42 | 1 | 1 | 4 | 0 429 / 0 401 |
| Teacher remount + reopen | 46 | 1 | 1 | 4–5 | 0 429 / 0 401 |

Hub after each remount: `Connected`, `widgets=1`, `connectCount=1`.

## Repeated calls — expected vs unnecessary

| Call | Count on remount | Judgment |
|---|---|---|
| Static JS/CSS/fonts | 1 each | Expected full navigation |
| `POST /auth/refresh` | 1 | Expected: in-memory JWT empty after reload |
| `POST /hubs/messages/negotiate` | 1 | Expected: `pagehide` stops hub; remount reconnects once |
| `GET /conversations?pageSize=50` | 2 on load / 4 on remount+open | Expected widget lifecycle: boot `loadList`, `open()` list, `select()` list refresh after read. Not a reconnect storm. |
| `GET /orders/{id}` + timeline + `GET /learning-requests/{id}` | 1 each on select | Expected targeted context lookup (1,000-scan remains closed) |
| Dashboard list endpoints (`orders/mine`, notifications, favorites, …) | 1 each | Expected Student/Teacher dashboard boot |

No evidence of negotiate-per-message, duplicate widget injection, or unbounded Order/request scans.

## Could a normal interactive user hit 300/min?

**No.** A human remounting an Order conversation even aggressively (one full dashboard reload every few seconds) would need ~7 remounts/minute × ~46 requests ≈ 322 to approach the global cap — far above ordinary messaging (open thread, send, stay connected). Interactive send traffic is also bounded by messaging 30/min. The previous 17+2 429s were synthetic Playwright density (many remounts + both roles sharing the IP global bucket because `UseRateLimiter` runs before authentication).

## Classification

**Test Issue.** Harness scheduling only. No product fan-out fix. No new exact-count regression gate (counts include incidental font/dashboard reads that may vary).
