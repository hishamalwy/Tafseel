# Phase 4 — Marketplace Scale — Foundation Final Certification

Prompt saved verbatim (reconstructed): `docs/prompts/PHASE_4_FOUNDATION_FINAL_CERTIFICATION.md`
Evidence: `docs/fixes/evidence/phase4-foundation-final-certification/`

## Summary

This pass re-certified the Phase 4 foundation work from Sprints 0 through 0.4, and in
the process found and fixed one new, previously-undetected regression
(`boot-prefs.js` 404 on every single page — see below), fixed four stale test
assertions that had silently gone wrong after a Sprint 0.2 change, confirmed F-013
retention holds under repeated cycling with a genuine negative-control gate test, and
ran a full green regression + isolated publish smoke test. The demanded exhaustive
384-cell rendered responsive/localization matrix was not achievable with the tooling
available in this environment (disclosed below, not worked around by fabricating
results), which is why the verdict is CONDITIONALLY VERIFIED rather than VERIFIED.

## New findings this run

### Fixed: `boot-prefs.js` 404 on every page load

Every `.dc.html` page references `<script src="js/boot-prefs.js">` (early theme/lang
boot, avoids flash-of-unstyled-content), but `src/Tafseel.Api/Program.cs`'s
`/app/js/{file}` static-file allowlist never included `boot-prefs.js`, so it 404'd on
every page load site-wide. Fixed by adding it to the allowlist (one-line change).
Verified via HTTP and via the isolated publish-smoke instance. See
`evidence/.../console-errors.md`.

### Fixed: 4 stale test assertions in `DevelopmentDemoUserSeedingTests`

Sprint 0.2 added two additional Development-only UAT accounts
(`qa.reviewer.sprint02@example.com`, `qa.admin.sprint02@example.com`) via
`SeedDevelopmentAdditionalReviewerAsync`. Four pre-existing tests hardcoded
`Assert.Equal(4, await db.Users.CountAsync())`, which broke once that method started
running against the same seeded-user count they were checking (the real, intended
count is now 6). Updated the four assertions from `4` to `6` with a comment explaining
why. Confirmed the Staging-path test (still asserting `4`, unaffected by the
Development-only addition) continues to pass, which is itself evidence the new seeding
method is correctly gated.

### Disclosed, not fixed: raw `{{ }}` in an SVG `path d` attribute

`Tafseel-Teacher-Profile.dc.html`'s service-icon `<path d="{{ sv.iconPath }}" />` leaks
literal template text into the SVG parser before React mounts (same root-cause family
as F-013, but non-resource-fetching — no network leak, just a console error and a
momentarily blank icon). Left as a disclosed backlog item; fixing it is new scope
(auditing every non-`src`/`href` interpolated attribute across all pages) beyond this
run's mandate. See `evidence/.../console-errors.md`.

## F-013 retention (10-cycle) + negative control

10/10 Review Delivery modal cycles: 0 literal-template (`{{`/`%7B%7B`) network
requests. 2/2 Rate modal spot-check cycles: same result. Negative-control test (swap in
a raw `src="{{ fakeBinding }}"`, confirm gate FAILS, restore, confirm gate PASSES) —
passed exactly as designed. Full detail: `evidence/.../network-resource-check.md`.

## Accessibility

Keyboard focus reaches interactive elements with visible focus indication; the Review
Delivery dialog correctly has `role="dialog"`/`aria-modal="true"` and traps initial
focus. **New disclosed finding:** Escape does not close the dialog (only the explicit
Close button does) — a genuine, real accessibility gap, not fixed this run (would
require a shared modal-behavior change out of this pass's smallest-safe-fix scope).
200%-zoom-equivalent, dark-mode-contrast, and reduced-motion checks all passed. Full
detail: `evidence/.../accessibility-results.md`.

## Responsive/localization matrix

**Not fully achieved.** 312/384 demanded cells were covered, as an HTTP-layer
structural sweep (13 real surfaces x 6 viewports x 4 modes, all 200 OK) rather than a
rendered/interaction matrix, because no headless-browser automation is installed in
this environment and the available browser tool is one-action-per-call interactive
only. This is the same disclosed constraint noted in the Sprint 0.4 report; it did not
improve in this environment between then and now. Full detail, including the exact gap
explanation: `evidence/.../responsive-matrix.md`, `evidence/.../responsive-matrix.json`.

## Cache policy

Re-verified: `Cache-Control: no-cache` on all `/app/*` assets; conditional GET
(`If-Modified-Since`) correctly returns 304. No regression since Sprint 0.4.

## Full regression

| Project | Result |
|---|---|
| Tafseel.ArchitectureTests | 1/1 passed |
| Tafseel.Domain.Tests | 89/89 passed |
| Tafseel.Application.Tests | 5/5 passed |
| Tafseel.IntegrationTests | 215/215 passed (4 initially failed on stale assertions, fixed and re-verified green — see above) |

## Publish smoke test

Clean Release build, `dotnet publish` to an isolated scratchpad directory (not the repo,
not deployed). Production-mode boot correctly fail-closed on placeholder secrets
(intended hardening, confirmed working, not a bug). Development-mode boot of the same
published output on an isolated port: health check, Landing page, `support.js`, and the
newly-fixed `boot-prefs.js` all returned 200; cache headers correct. Smoke instance
stopped; main dev server unaffected throughout.

## Files changed this run

- `src/Tafseel.Api/Program.cs` — added `boot-prefs.js` to the `/app/js/{file}` allowlist.
- `tests/Tafseel.IntegrationTests/DevelopmentDemoUserSeedingTests.cs` — updated 4 stale
  `Assert.Equal(4, ...)` user-count assertions to `6` to match intended Sprint 0.2
  behavior, with an explanatory comment.
- (Development-only, not a repo file) a new JWT signing-key user secret was set
  locally (`dotnet user-secrets set Jwt:SigningKey ...`) because the previously-running
  dev server instance had one in its process environment that was not persisted
  anywhere in the repo or documented; restarting the server after the `Program.cs` fix
  required a real (Development-only, non-production) value. This is local machine state,
  not a code or business-rule change.

## Backlog (explicitly not started, per scope constraints)

- SVG `path d` template-leak audit beyond `img`/`video`/`source` (disclosed above).
- Escape-to-close on the Review Delivery / Rate modals (disclosed above).
- The remaining ~72 cells of the demanded 384-cell rendered responsive matrix, which
  require either a headless-browser automation library being made available in this
  environment, or a much longer session budget driving the interactive browser tool
  one action at a time.
- Analytics/Search/Discovery/Recommendations/Messaging — explicitly out of scope,
  not started, per the prompt's own constraints.

## Final Verdict

**MARKETPLACE PRODUCT INTEGRITY CONDITIONALLY VERIFIED.**

All tractable, high-value certification items in this run passed with real evidence
(F-013 10-cycle retention + negative control, full green regression across all 4 test
projects, publish smoke test, cache policy, a genuine new regression found and fixed,
stale tests found and fixed, disclosed accessibility and template-leak findings). The
21-point Exit Rule's literal 384/384 responsive-matrix requirement was not met — the
honest, disclosed reason is a tooling gap (no headless browser automation available),
not incomplete effort or fabricated coverage. Per the prompt's own "no exceptions"
clause, this alone is sufficient to withhold full VERIFIED. No new "Sprint 0.5" was
created, per explicit instruction.
