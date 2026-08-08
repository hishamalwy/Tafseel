# Backend regression

Sequential after accepted browser run (Dev `:5090` stopped first to avoid DLL lock). Isolated publish used `:5092` later, then stopped.

| Suite | Result |
|---|---|
| Architecture | 1/1 |
| Domain | 89/89 |
| Application | 5/5 |
| Integration | **248/248**, 0 skipped, 0 fail |

Baseline cited 1/89/5/226. Count rose because concurrent R9 added Integration tests (`Release9AiAssistedMarketplaceTests`, `GroqAiProviderContractTests`, and related). Ownership: R9. Not deleted. All passed.

EF: `dotnet ef migrations has-pending-model-changes` → **No changes have been made to the model since the last migration.** Focused R7 migration `20260808162922_Release7MarketplaceIntelligence` remains the intelligence schema change.

Release build: 0 errors. Two pre-existing nullable warnings in `TeacherApplicationService` only.
