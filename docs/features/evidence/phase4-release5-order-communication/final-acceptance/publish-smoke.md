# Publish smoke

Isolated publish: `artifacts/phase4-release5-final-publish` (not deployed).

Hosted Development `http://127.0.0.1:5091` then stopped.

| Check | Result |
|---|---|
| `/health/live` | 200 `no-store, no-cache` |
| `/health/ready` | 200 `no-store, no-cache` |
| Landing, Browse, css/js/chat-widget/locales, favicon | 200 `no-cache` |
| Student + Teacher login | 200 |
| GET `/api/v1/orders/{id}` unauthenticated | 401 (route exists) |

Instance stopped after smoke + browser jobs.
