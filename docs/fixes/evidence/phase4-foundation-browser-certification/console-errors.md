# Console Errors — Browser Certification

Captured per-cell across all 384 matrix cells via Playwright's `console`/`pageerror`
listeners (see `run-matrix.mjs`). Final state: 0 new first-party console errors across
all 384 cells, after two reconciliations documented below (neither is a hidden defect —
both are explicitly scoped, narrow, and justified).

## Excluded as benign (not a defect)

`POST /api/v1/auth/refresh` returning `401` is an intentional, expected "is there a
session?" probe the frontend fires on every navigation regardless of auth state. For an
anonymous/public surface there is no session to refresh, so a 401 is correct behavior,
not an application defect. Scoped narrowly to this one endpoint+status combination in
`isBenignFirstPartyFailure` (`run-matrix.mjs`) — not a blanket allowance for 4xx/5xx.

## Fixed this pass (not excluded — genuinely resolved)

`<path d="{{ sv.iconPath }}" />` on Teacher Profile previously produced:
`Error: <path> attribute d: Expected moveto path command ('M' or 'm'), "{{ sv.iconPath..."`
on every load where the services list is non-empty, because `.dc.html` is served as
static HTML and the browser's SVG parser eagerly validates the literal template text
before JavaScript mounts. Fixed by changing the attribute to `sc-camel-d="{{
sv.iconPath }}"` — the same, already-established dc-runtime convention used for `src`
(see F-013's Sprint 0.3 fix). Verified: 0 occurrences of this error across the full
384-cell matrix post-fix, and 0 occurrences in the dedicated `svg-binding-audit.md`
negative-control test.
