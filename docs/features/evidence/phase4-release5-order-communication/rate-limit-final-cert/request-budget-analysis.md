# Request-budget analysis

## Normal user baseline

- Student Dashboard initial load: **34** first-party (12 API-family + 22 static), **1** auth refresh, **1** negotiate.
- Teacher Dashboard initial load: **39** first-party (18 API-family + 21 static), **1** auth refresh, **1** negotiate.
- Open one Order conversation (incremental): **7** first-party (messages + targeted order/timeline/learning-request + read + list refresh).

## Remount baseline

- Student remount + reopen completed/active thread: **42** first-party, **1** refresh, **1** negotiate.
- Teacher remount + reopen: **46** first-party, **1** refresh, **1** negotiate.

## Limits vs certification target

| Knob | Configured | Certification target |
|---|---|---|
| Global | 300 / min / effective IP | stay ≤ 240 used (safety **60**) |
| Auth | 10 / min / IP | stay ≤ 8 used (safety **2**) |

No server headers to drive wait (`limiterHeadersSeen: []`). Scheduler uses harness timestamps in a conservative **rolling 60s** window (stricter than the server's fixed window).

## Batch derivation

`batchSize = min(floor(240 / perCycle), floor(8 / authPerCycle), 5)`.

Measured max remount = 46; cert uses 1.2× headroom → Student 51 / Teacher **56**.  
`floor(240/56)=4` → **batch size 4** (not the example 5, not a blind `sleep(20000)`).

Dense historical 20-cycle at 15s gaps: 4 remounts/min × 46 ≈ 184 plus prior functional churn on the same IP bucket exceeded 300. That matches Student 17 + Teacher 2 unexpected 429 in `micro-final-acceptance/remount-20-cycle.json` (preserved).
