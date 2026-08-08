# Accepted rate-limit-aware final browser certification

Runner: `tests/browser/release5-rate-limit-final-cert.mjs`  
Host: Development `http://127.0.0.1:5090`  
Accepted artifact: `rate-limit-final-cert.json` (`accepted: true`)  
**49/49 PASS. Unexpected 429 = 0. Unexpected 401 = 0.**

Preserved non-accepted runs (not overwritten):

- `rate-limit-final-cert-loc-ar-fail.json` — 20/20 remount + 0 429; AR cell used in-page localStorage after a budget wait and the live English app restored `en`/`ltr` before navigation (48/49).
- `rate-limit-final-cert-session-collision.json` — second Student context for AR rotated the refresh cookie and the long-lived Student remount landed on Auth.

## Functional retention

| Scenario | Result |
|---|---|
| Student inbox CTA + active conversation | PASS Hub Connected |
| Student send | PASS |
| Teacher active conversation | PASS Hub Connected |
| Student→Teacher + Teacher→Student | PASS `renderCount=1` |
| Student remount realtime | PASS |
| Teacher remount realtime | PASS |
| Completed Order remount realtime | PASS both directions |
| Dedup after remount | PASS `renderCount=1` |
| Unread away→open | PASS unread 1→0 |
| Attachment after remount | PASS `renderCount=1` |
| Student notification/deep-link spot | PASS |
| 1440 EN/LTR/light | PASS |
| 390 AR/RTL/dark | PASS (`dir=rtl`, `theme=dark`) |

## 20-cycle remount

10 Student + 10 Teacher on completed Order conversation `934ce59e-179a-4351-8dde-1da5aa90efeb`.  
**20/20** Hub Connected, `renderCount=1`, `status429=0`, `status401=0`, `widgets=1`, `connectCount=1`.  
Batch size **4** from measured 46 first-party/remount × 1.2 with global safety 60.

## Safety (accepted run)

| Check | Student | Teacher | AR cell |
|---|---|---|---|
| 401 | 0 | 0 | 0 |
| 429 | 0 | 0 | 0 |
| console.error / pageerror | 0 | 0 | 0 |
| template leak | 0 | 0 | 0 |
| failed first-party (non-aborted `/read`) | 0 | 0 | 0 |

Max rolling 60s first-party: **246** / 300. Max auth rolling: **6** / 10.
