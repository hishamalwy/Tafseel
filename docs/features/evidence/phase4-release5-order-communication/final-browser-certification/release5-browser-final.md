# Release 5 final browser certification

Runner: `tests/browser/release5-final-cert.mjs` with session reuse. Fail-on-429 retained (no whitelist).

## Functional 16/16

| # | Scenario | Result |
|---|---|---|
| 1 | Student Inbox | PASS |
| 2 | Student Active Order Conversation | PASS |
| 3 | Student Send | PASS |
| 4 | Student Attachment | PASS |
| 5 | Teacher Inbox | PASS |
| 6 | Teacher Unread | PASS (`unread=2` before open) |
| 7 | Teacher Conversation | PASS |
| 8 | Teacher Reply | PASS |
| 9 | Student Notification Deep Link | PASS |
| 10 | Teacher Notification Deep Link | PASS |
| 11 | Two-Context Realtime | PASS both directions `renderCount=1` |
| 12 | Read/Unread + dedup | PASS unread→0 |
| 13 | Completed Order Conversation | PASS |
| 14 | Completed Order History | PASS |
| 15 | Mobile Composer 375×667 + 390×844 both roles | PASS |
| 16 | Authenticated Localization AR-dark + EN-light at 375/390/768/1440 | PASS |

Four locale/viewport cells hit **global 300/min** 429 on the first dense matrix pass (disclosed, not overwritten silently). They were re-run with 20s pacing: `matrix-retry.json` **20/20**, 0 429, 0 console.error. Merged `release5-browser-final.json` functional id 16 = true.

Primary long-lived Student/Teacher pages: **0 unexpected 429**, 0 pageerror, 0 template leak. `ERR_ABORTED` on superseded `/read` is navigation abort, not a failed first-party resource assertion.

Conversation id (live): `bd26011f-5672-4ce1-b127-76afba29b3d3`.
