# Release 8 — Regression evidence

## Backend (Release configuration)

| Suite | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Architecture | 1 | 0 | 0 |
| Domain | 89 | 0 | 0 |
| Application | 14 | 0 | 0 |
| Integration | 257 | 0 | 0 |
| **Total** | **361** | **0** | **0** |

## Frontend CI gates

All PASS: integrity, localization, localization-usage, template-placeholder-leak, BUG-001 display names, auth-ui, auth-return, guided-request, notification routing, teacher-profile mobile CTA, R5, R6, R7, R9, unified discovery, check-js aggregate, `git diff --check`.

## Format / EF / Build / Publish

- `dotnet format Tafseel.sln --verify-no-changes --no-restore` PASS
- `dotnet ef migrations has-pending-model-changes --context TafseelDbContext` — no pending
- `dotnet build -c Release` — 0 errors, 0 warnings (after releasing DLL file locks)
- Isolated publish smoke `:5092` — see `publish-smoke.json` — PASS, instance stopped

## Browser matrix

See `matrix/summary.json` — 384/384 PASS.
