# Final publish smoke

Isolated `dotnet publish -c Release -o artifacts/phase4-release5-micro-final-publish` (not deployed). Development `http://127.0.0.1:5092`, then stopped.

Machine-readable: `publish-smoke-final.json`.

| Check | Result |
|---|---|
| `/health/live` | 200 `no-store, no-cache` |
| `/health/ready` | 200 `no-store, no-cache` |
| published-student-login | **200** |
| published-teacher-login | **200** |
| published-student-conversations | **200** |
| published-teacher-conversations | **200** |
| Student Dashboard | 200 `no-cache` |
| Teacher Dashboard | 200 `no-cache` |
| `/app/js/chat-widget.js` | 200 `no-cache`, contains `__tafseelMessageHub` |
| `/app/css/tafseel.css` | 200 `no-cache` |
| published-student-thread | **200** |
| published-teacher-thread | **200** |
| published-auth-retention | **200** |

Bare `/js/chat-widget.js` is 404 by design; canonical static prefix is `/app/`. Smoke script updated to `/app/js` and `/app/css`.

Instance stopped. No deploy.
