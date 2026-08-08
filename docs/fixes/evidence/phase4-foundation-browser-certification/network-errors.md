# Network Errors — Browser Certification

First-party (same-origin) response monitoring across all 384 matrix cells
(`run-matrix.mjs` `onResponse`). Final state: 0 unexplained first-party 4xx/5xx and 0
`{{`/`%7B%7B` network-URL template leaks across all 384 cells.

## Rate-limit collisions found and resolved during this pass (not defects)

9 cells (`payment` x8, `teacher-qualifications` x1) hit real, correctly-functioning
Development rate limits (`"payment"` policy, 10 req/min) because of harness pacing that
didn't fully account for pages issuing multiple API calls per load. This is the rate
limiter working as designed against certification traffic, not an application bug.
Re-verified all 9 cells individually with more generous (15s) pacing — all passed
cleanly. See `matrix.md` for the full narrative.

## F-013 (the historical P0 for this codebase)

0 `{{`/`%7B%7B` network requests across all 384 matrix cells, 10 dedicated Review
Delivery retention cycles, and 3 dedicated Rate Teacher retention cycles. Full detail:
`f013-retention.md`.

## Publish smoke test

Isolated, non-deployed `dotnet publish` output smoke-tested on a separate port:
`/health/live`, `/health/ready`, all 7 core `.dc.html` pages, and all 4 static asset
routes (`css/tafseel.css`, `js/tafseel.js`, `js/boot-prefs.js`, `support.js`) returned
`200`; `Cache-Control: no-cache` confirmed present. 0 errors.
