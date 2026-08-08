# Rate-limit-aware final certification — summary

Historical sequence (preserved):

1. Implementation: **PARTIALLY COMPLETED**
2. Final Acceptance: **CONDITIONALLY VERIFIED**
3. Final Browser Certification Closure: claimed **VERIFIED** with two disclosures (published Student 401; remount `connectCount=0`)
4. Micro Final Acceptance: those disclosures **closed**; dense remount **429** kept the gate conditional
5. This pass: dense 429 classified **Test Issue**; harness request-budget scheduler; accepted run **0 unexpected 429**

## Closed this pass

- Global 300/min 429 under dense remount = **Test Issue**. One remount is 42–46 first-party requests (1 refresh, 1 negotiate). Interactive users do not hit 300/min. Limits unchanged.
- Effective global partition is **IP** because `UseRateLimiter` runs before `UseAuthentication` (coded `sub` fallback never applies). Student+Teacher Playwright share one bucket. Documented; not weakened.
- Deterministic scheduler (`lib/request-budget.mjs`) waits on rolling 60s headroom. Batch size **4**. Accepted cert **49/49**, remount **20/20**, `renderCount=1`.
- Published `:5092` Student+Teacher login **200**, conversations/threads **200**, health **200**, static `no-cache`. Instance stopped. Not deployed.

## Intermediate failed evidence kept

Loc-AR-fail JSON (0 429, AR cell wrong) and session-collision JSON (second Student context stole refresh cookie) remain under distinct filenames.

## Verdict

**RELEASE 5 — ORDER COMMUNICATION VERIFIED**

Release 5 is **CLOSED**. Release 6 — Discovery & Conversion is unblocked. No Release 5 Sprint 2.
