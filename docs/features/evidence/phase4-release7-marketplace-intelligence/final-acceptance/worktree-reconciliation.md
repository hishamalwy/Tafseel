# Release 7 Final Acceptance — worktree reconciliation

Date: 2026-08-08. Inspected via `git status` / `git diff --stat` before shared-file edits.

## Canonical status (living docs)

| Release | Latest living status | Historical preserved |
|---|---|---|
| R5 Order Communication | **VERIFIED & CLOSED** | Partial → Conditional → claimed VERIFIED-with-disclosures → Micro Conditional → rate-limit-aware CLOSED |
| R6 Discovery & Conversion | **VERIFIED & CLOSED** | Historical CONDITIONALLY VERIFIED preserved in R6 report + INDEX |
| R7 Marketplace Intelligence | **CONDITIONALLY VERIFIED** until this gate closes | Must remain in the feature report after any later VERIFIED |
| R9 AI-Assisted Marketplace | Concurrent WIP in this worktree | **Not declared** by this pass |

Stale “R6 remains open / R7 not chain-unblocked because of R6” wording in living R7 docs is corrected without rewriting history.

## R7-owned (this pass may edit)

- `src/Tafseel.Application/MarketplaceIntelligence/`
- `src/Tafseel.Infrastructure/Marketplace/MarketplaceIntelligenceService.cs`
- `src/Tafseel.Api/Controllers/MarketplaceIntelligenceController.cs`
- `src/Tafseel.Domain/Marketplace/MarketplaceInteractionEvent.cs`
- `src/Tafseel.Infrastructure/Persistence/Migrations/20260808162922_Release7MarketplaceIntelligence*.cs`
- `tests/Tafseel.IntegrationTests/Release7MarketplaceIntelligenceTests.cs`
- `tests/browser/release7-marketplace-intelligence-cert.mjs` and new `release7-final-acceptance-*.mjs`
- `scripts/ci/check-release7-marketplace-intelligence.mjs`
- Admin Intelligence section, `Tafseel.analytics` helper, Browse/Profile/Request R7 event calls
- `docs/features/PHASE_4_RELEASE_7_MARKETPLACE_INTELLIGENCE.md`, schema, retrospective, R7 evidence

## R6-owned (preserve; smoke only)

- Deterministic Browse query/URL state, Compare, Profile conversion + 375 CTA, Guided Request (non-analytics)
- `scripts/ci/check-release6-discovery.mjs`, R6 evidence under `phase4-release6-discovery-conversion/`

## R9-owned (do not revert, overwrite, or status-declare)

- `src/Tafseel.Application/Ai/`, `src/Tafseel.Infrastructure/Ai/`, `src/Tafseel.Api/Controllers/AiMarketplaceController.cs`
- DI `AiOptions` / `IAiProvider` / `IAiMarketplaceAssistant` registration
- `Program.cs` `"ai"` rate-limit policy (10/min/user; auth 10 + global 300 unchanged)
- `appsettings.json` / `appsettings.Development.json` `Ai:` section
- Browse `/ai/discovery` and `/ai/product-help` UI (and any Request assistant R9 adds)
- R9 locales / frontend-gate additions if present

## Shared collision files (inspect before every edit)

Browse, Teacher Profile, Guided Request, `js/locales.js`, `js/tafseel.js`, `js/api.js`, Admin/Student/Teacher dashboards, `Program.cs`, `DependencyInjection.cs`, rate limiting, browser `lib/session.mjs` + `auth.mjs` + `request-budget.mjs`, frontend CI gates, `docs/PROJECT_STATUS.md`, `docs/INDEX.md`, `TafseelDbContext` + snapshot.

## R9 telemetry vs R7 store

R9 AI controllers persist nothing into `MarketplaceInteractionEvents`. R7 allowlist remains the six discovery events. This pass does **not** absorb AI prompts, clarification text, or product-help questions into R7 metrics.
