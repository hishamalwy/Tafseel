# Final publish smoke

Isolated `dotnet publish src/Tafseel.Api -c Release -o artifacts/phase4-release5-rate-limit-final-publish` (not deployed). Development `http://127.0.0.1:5092`, then **stopped**.

Machine-readable: `publish-smoke-final.json`.

| Check | Result |
|---|---|
| health-live | **200** `no-store, no-cache` |
| health-ready | **200** `no-store, no-cache` |
| published-student-login | **200** |
| published-teacher-login | **200** |
| published-student-conversations | **200** |
| published-teacher-conversations | **200** |
| published-student-dashboard | **200** `no-cache` |
| published-teacher-dashboard | **200** `no-cache` |
| static-chat-widget | **200** `no-cache`, contains `__tafseelMessageHub` |
| static-css | **200** `no-cache` |
| published-student-thread | **200** |
| published-teacher-thread | **200** |
| published-auth-retention | **200** |

No unexpected 401/429. Dense browser matrix was not rerun against publish.
