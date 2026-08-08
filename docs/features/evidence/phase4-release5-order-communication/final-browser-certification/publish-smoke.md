# Publish smoke

Isolated `dotnet publish -c Release -o artifacts/phase4-release5-final-browser-cert-publish` (not deployed). Hosted Development `http://127.0.0.1:5092`, then stopped.

| Check | Result |
|---|---|
| `/health/live` | 200 `no-store, no-cache` |
| `/health/ready` | 200 `no-store, no-cache` |
| Landing, Browse, Teacher Profile | 200 `no-cache` |
| `css/tafseel.css`, `js/chat-widget.js` (contains `selectSeq`/`disconnectHub`), `locales.js`, favicon | 200 `no-cache` |
| GET `/api/v1/orders/{id}` unauthenticated | 401 |
| GET message-attachment content unauthenticated | 401 |
| Teacher login + `GET /conversations` | 200 |
| Student / Teacher dashboard HTML + messages/completed/notification query strings | 200 |
| Student API login on this host after repeated reset churn | 401 `invalid_credentials` (UAT identity lockout/reset noise on the shared Student account; same Student authenticated throughout the 5090 browser cert) |

Instance stopped. No deploy.
