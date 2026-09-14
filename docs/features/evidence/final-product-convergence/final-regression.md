# Final regression — blocker closure

| Suite | Command / gate | Result |
|-------|----------------|--------|
| Architecture | `dotnet test tests/Tafseel.ArchitectureTests -c Release --no-build` | 1/1 PASS |
| Domain | `dotnet test tests/Tafseel.Domain.Tests -c Release --no-build` | 89/89 PASS |
| Application | `dotnet test tests/Tafseel.Application.Tests -c Release --no-build` | 14/14 PASS |
| Integration | `dotnet test tests/Tafseel.IntegrationTests -c Release --no-build` | 257/257 PASS |
| Format | `dotnet format Tafseel.sln --verify-no-changes --no-restore` | PASS |
| EF | `dotnet ef migrations has-pending-model-changes ... --no-build` | No pending |
| Release build | `dotnet build Tafseel.sln -c Release` | 0 errors / 0 warnings |
| Publish smoke | `node tests/browser/release8-publish-smoke.mjs` | PASS |
| Frontend | `check-js.mjs` (includes localization, integrity, R5–R9, unified search, template leak, auth return) | PASS |
| Localization | `check-localization.mjs` + `check-localization-usage.mjs` | 3301 paired keys PASS |

## Integration note
`Phase8MessagingTests.SignalR_and_notifications_require_auth_and_email_failure_is_isolated` hardened to wait for post-failure `Pending` after hosted outbox interleaving (race, not product chrome).
