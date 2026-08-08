# Release 4 regression evidence

Date: 2026-08-08

## Backend

| Project | Passed | Failed |
|---|---:|---:|
| Tafseel.ArchitectureTests | 1 | 0 |
| Tafseel.Domain.Tests | 89 | 0 |
| Tafseel.Application.Tests | 5 | 0 |
| Tafseel.IntegrationTests | 219 | 0 |

Pre-Release-4 baseline Integration 215. Delta: +4 `Release4MarketplaceOperationsTests` (queue/auth/search/additional/admin privacy/showcase). Total 314/314.

## Frontend CI

All named gates pass:

- `check-js.mjs` (includes auth-ui, localization, integrity, sprint6 routing)
- `check-localization.mjs` / `check-localization-usage.mjs` — 3048 paired keys
- `check-sprint3-localization.mjs`
- `check-sprint6-notification-routing.mjs`
- `check-frontend-integrity.mjs`
- `check-bug001-display-names.mjs`
- `check-teacher-profile-mobile-cta.mjs`
- `check-template-placeholder-leak.mjs` (F-013 static gate)

## EF

`dotnet ef migrations has-pending-model-changes` — **No changes have been made to the model since the last migration.**

## git diff --check

Pass (CRLF warnings only).

## Browser harness self-test

`tests/browser/self-test.mjs` — 5/5 PASS.

## Live F-013 cycles

Not re-driven this pass: Student UAT password was not present in the shell. Static template-leak gate passed. Foundation F-013 remains CLOSED from Final Acceptance.

## Release 4 Playwright

`tests/browser/release4-operations-cert.mjs` against published Development instance.

- Escape on Admin Review detail: **PASS** after wiring `Tafseel.modalKeyDown` onto the dialog + initial focus.
- AR 390 / 1440 and EN 390 / 1440 Admin + Quality surfaces: overflow/i18n PASS when authenticated.
- 2 FAIL: Quality 1440 AR/EN landed on Auth after login rate-limit (10 req/min). Classified **Test Issue**, not a product defect.
- Live Quality actionable queue was empty (`actionable: 0`); browser could not discover a pending application without fabricating data.
