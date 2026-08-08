# Rate-limit-aware browser certification

Harness: R5/R6 `login-once` `storageState` + `tests/browser/lib/request-budget.mjs`. Limits unchanged: auth **10/min/IP**, global **300/min**.

Failed runs preserved:

- `release7-final-acceptance-cert-attempt1-fail.json` — AR heading wait (Test Issue)
- `release7-final-acceptance-cert-attempt2-fail.json` — Request page + live_session TeacherService (Test Issue)

Accepted: `release7-final-acceptance-cert-accepted.json` — **21/21**, **unexpected429: []**, pageErrors 0, console 0, failed first-party 0.

Responsive 390/768/1024/1440 × EN+AR screenshots under `screenshots/`. Keyboard: tab focus reached Intelligence controls (`focus=BUTTON`). External screen-reader not performed.
