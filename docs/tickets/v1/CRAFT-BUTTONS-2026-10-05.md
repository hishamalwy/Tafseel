# CRAFT-BUTTONS-2026-10-05 — Button hierarchy and spacing follow-up

Release V1 · P2 · Owner Codex, authorized by the user in the active UX/UI refinement · Size two small sequential scopes · Status Complete.

## Gates 1–3

Actors: Student and any user of the shared confirmation dialog. Goal: identify the intended action and read feedback without buttons colliding with text or adjacent sections. Evidence: four user screenshots in the chat, covering cancellation, work filters, offer comparison and draft-save failure.

Business: Product Contract §§3.3, 3.8 and 7a remain unchanged. Cancellation/selection/payment/save permissions, prices, resource access and server state transitions stay as currently implemented. No decision or backend change is required. Buttons issue exactly the current use-case calls with the current headers; local comparison and filter toggles remain local state.

Scope A: use the shared current button variants in native confirmations; calm selected filter surface with visible keyboard focus inside its target. Scope B follows A: comparison action inside a clearly spaced section header, and draft feedback with a separated retry action. Out of scope: redesign, domain/payment/provider/API changes, deployment and unrelated findings.

Happy path: visitor/user reads and cancels a confirmation; selects a work filter; student opens/closes factual offer comparison; student retries failed draft saving. Negative paths: Escape/cancel never commits the action; a failed retry preserves input; disclosure remains keyboard usable; long Arabic/English text wraps without overlapping controls. Current 404/403, concurrency and participant/role authorization remain authoritative; no new server paths.

UX: Arabic/English final labels use existing cancellation/retry strings, plus “عرض المقارنة / Show comparison” and “إخفاء المقارنة / Hide comparison”. One comparison heading; related heading/body grouped, then 16–24px to the action/content boundary. Dialog Cancel remains initial focus for destructive actions, with a visually distinct confirm action. All phone targets ≥44px; logical properties preserve RTL. Retry wraps below its complete message on a 390px phone. Loading, success and input persistence behavior are unchanged.

## Acceptance / Gates 4–5

- [x] Shared confirmation uses rendered primary/secondary/danger variants, correct contrast, Escape and focus restoration.
- [x] Work selection has a quiet surface; keyboard focus stays visible and inside the control boundary.
- [x] Comparison has one title and a labeled disclosure, with separation from the offers below, in AR/EN at 390px and desktop.
- [x] Draft failure text and Retry do not overlap or interrupt each other's line; real retry succeeds without lost text.
- [x] Angular tests/build/guards and strict API gate pass; existing published-browser journeys exercise changed paths and retain before/after screenshots.
- [x] Completion evidence and gallery linked here; no backend changes made.

Backend Release build/format and 940-test suite were green immediately before this presentation-only follow-up. Revalidate changed frontend rendering and source/client checks; do not imply a second backend execution when citing retained evidence.

## Completion

[Before / After / Why](../../engineering/BUTTON_SPACING_COMPLETION_2026_10_05.md) · [4 user screenshots + 11 new screenshots](../../../TestResults/opportunities-gallery/button-spacing-2026-10-05/index.html).

Current checks: Angular 645/645 (83 files), published frontend build successful (initial 714.64 kB, budget 720 kB); .NET Release build and format verify passed; client-focused .NET checks 233/233 with 0 skipped; API strict 301 matches and 0 violations; dependency check 0 vulnerabilities. Published fresh-database browser groups: navigation 7/7, UX/UI craft 11/11 and open marketplace 9/9 (27/27 total).

Evidence is under `TestResults/ux-ui-implementation/`: `buttons-angular-tests.log`, `buttons-publish.log`, `buttons-dotnet-build.log`, `buttons-dotnet-format.log`, `buttons-client-integration.log`, `buttons-api-contract.log`, `buttons-dependencies.log`, and `buttons-browser/*.log`. The initial craft test used a retired styling class as its Cancel locator; it was replaced with the existing semantic button value and the complete 11-group suite rerun successfully (`buttons-craft-rerun.log`). The initial run remains recorded; no test was disabled.

Actual browser assertions cover distinct rendered confirmation fills, destructive-label contrast ≥4.5:1 in both themes, ≥20px before confirmation actions, visible 2px inset keyboard focus and ≥44px filter targets, separated phone Retry, one comparison heading, ≥24px before offers, AR/EN phone overflow, real retries/selection/stale-offer refusal/payment, Escape and focus return. PNGs were reviewed visually and retained without edits. Full role/state/device permutations were not claimed.
