# Harness scheduling strategy

## Why not `sleep(20000)`

A fixed sleep ignores (a) how many requests the last action actually used, (b) auth 10/min vs global 300/min, (c) the shared IP bucket while Student and Teacher pages are both live.

## Mechanism

`tests/browser/lib/request-budget.mjs`:

1. Attach Playwright request/response listeners on every first-party URL (no JWT/cookie/body capture).
2. Record timestamps into rolling 60s global and auth deques.
3. Before each expensive navigation/remount, `waitForHeadroom({ global, auth })` sleeps only until `used + estimate + safety ≤ limit`.
4. Estimates come from `request-budget-baseline.json` × 1.2.
5. 20-cycle remounts run in measured batches (`batchSize` derived; this pass **4**). After each batch the next wait requires headroom for the full next batch.
6. Login once per role via `storageState`. Auth-sensitive navigations still call `paceAuthSensitive()` (8s floor) **in addition to** budget waits — never instead of them.
7. Any HTTP 429 fails the run. That JSON is written to `rate-limit-final-cert-FAILED-429-*.json`. The cell is not retried to PASS. A fresh run is the only accepted artifact (`rate-limit-final-cert.json`).

## Safety headroom

Global safety **60** (target ≤ 240/300). Auth safety **2** (target ≤ 8/10). Chosen after measuring 42–46 first-party per remount so four remounts (224 at 1.2×56) still leave room for the idle counterparty page and incidental fonts.

## Unchanged product limits

No Development bypass, no Playwright whitelist, no permit-limit change.
