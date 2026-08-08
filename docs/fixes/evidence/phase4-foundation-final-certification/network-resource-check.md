# Resource-Safety / Cache / F-013 Retention — Foundation Final Certification

## F-013 10-cycle retention (Review Delivery modal)

Order `8f4745ef-e1b8-42fb-988a-fdc899af066a` (Student: `student.sprint02.uat@example.com`,
Teacher: `teacher.sprint02.uat@example.com`) driven through Accept -> Pay (mock,
browser-driven) -> Start work -> Deliver (API, multipart, real file) to reach
`Delivered`, then the Review Delivery deep link
(`Tafseel-Student-Dashboard.dc.html?orderId=...&focus=review`) was loaded **10 times**,
clearing `performance.getResourceTimings()` and re-checking for any resource URL
containing `%7B%7B` or `{{` after each load.

| Cycle | Literal-template leaks | Modal opened |
|---|---|---|
| 1 | 0 | yes |
| 2 | 0 | yes |
| 3 | 0 | yes |
| 4 | 0 | yes |
| 5 | 0 | yes |
| 6 | 0 | yes |
| 7 | 0 | yes |
| 8 | 0 | yes |
| 9 | 0 | yes |
| 10 | 0 | yes |

**Result: 0/10 leaks — F-013 fix confirmed stable under repeated open/close/reload.**

Rate modal spot-checked the same way for 2 cycles (`focus=rate`): 0/2 leaks.

## Negative-control gate test

The regression gate (`scripts/ci/check-template-placeholder-leak.mjs`) scans a fixed
list of filenames relative to `cwd`, so a copy at an arbitrary path is silently ignored
by the script (confirmed empirically — running it with a path argument still reported
the real repo files as passing). The correct way to negative-test it is to temporarily
swap the target file in place:

1. Backed up `Tafseel-Student-Dashboard.dc.html` to the scratchpad.
2. Copied it, replaced one `sc-camel-src="{{ reviewTeacherAvatar }}"` with a raw
   `src="{{ fakeBinding }}"`, and swapped that copy into the repo path.
3. Ran the gate: **FAILED**, correctly reporting both the missing-key check
   (`"fakeBinding" key found in the render script` — none exists) and the raw
   resource-attribute check (`raw "src="{{ ... }}"" on an <img>/<video>/<source>
   element`).
4. Restored the original file from backup; `diff` confirmed byte-identical to the
   pre-swap original.
5. Re-ran the gate against the restored real repo: **PASSED** (12 surfaces scanned).
6. Deleted all scratch copies.

## Cache-policy retention re-check

```
GET /app/Tafseel-Student-Dashboard.dc.html -> 200, Cache-Control: no-cache, Last-Modified: <ts>
GET (same, If-Modified-Since: <ts>)        -> 304 Not Modified
GET /app/support.js                        -> 200, Cache-Control: no-cache
GET /app/css/tafseel.css                   -> 200, Cache-Control: no-cache
```
Consistent with the Sprint 0.4 cache-policy implementation (`Program.cs`
`/app` middleware branch) — no regression.

## Publish smoke test

`dotnet publish src/Tafseel.Api -c Release -o <isolated scratchpad dir>` (not the repo,
not deployed) succeeded. Booted with `ASPNETCORE_ENVIRONMENT=Production` on an isolated
port first, to confirm production fail-closed startup validation still correctly rejects
placeholder JWT/payment/live-session/email secrets (it does — this is intended hardening,
not a bug). Re-booted the same published output with `ASPNETCORE_ENVIRONMENT=Development`
on an isolated port (5099, separate from the main dev server on 5090):
`/health/live` -> 200, `/app/Tafseel-Landing.dc.html` -> 200,
`/app/js/boot-prefs.js` -> 200 (confirms the fix is present in the published output, not
just the dev bin), `/app/support.js` -> 200, `Cache-Control: no-cache` present. Smoke
instance stopped afterward; main dev server on 5090 confirmed unaffected throughout.
