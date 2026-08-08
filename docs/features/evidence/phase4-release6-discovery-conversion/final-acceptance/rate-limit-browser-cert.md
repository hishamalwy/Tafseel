# Rate-limit-aware browser certification

Runner: `tests/browser/release6-final-acceptance-cert.mjs`  
Scheduler: `tests/browser/lib/request-budget.mjs` + `session.mjs`  
Limits unchanged in `Program.cs`: auth **10/min/IP**, global **300/min** effective IP. Testing env still uses the higher test partition only.

Failed runs preserved (not overwritten):

- `release6-final-acceptance-cert-attempt1-fail.json`
- `release6-final-acceptance-cert-attempt2-fail.json`
- `release6-final-acceptance-cert-attempt3-fail.json`
- `release6-final-acceptance-cert-attempt4-fail.json`
- `release6-final-acceptance-cert-attempt5-fail.json`

Accepted run: `release6-final-acceptance-cert-accepted.json` / `release6-final-acceptance-cert.json`

- Required scenarios **16/16**
- unexpected 429 **0**
- max rolling 60s first-party **224** (under 300)
- max auth rolling **7** (under 10)
- 0 pageerror / actionable console.error / failed first-party / template leak on accepted scenarios

No retry-until-green of a failed JSON.
