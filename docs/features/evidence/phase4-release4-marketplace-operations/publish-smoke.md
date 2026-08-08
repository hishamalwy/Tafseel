# Release 4 publish smoke

Date: 2026-08-08

- `dotnet build -c Release` — pass (via test/publish graph)
- `dotnet publish src/Tafseel.Api -c Release -o artifacts/phase4-release4-publish` — pass
- Boot: `ASPNETCORE_ENVIRONMENT=Development` `ASPNETCORE_URLS=http://127.0.0.1:5090`
- Isolated instance stopped after smoke + Playwright

| Check | Result |
|---|---|
| GET /health/live | 200 |
| GET /health/ready | 200 |
| Admin login `qa.admin.sprint02@example.com` | 200 |
| QualityReviewer login `qa.reviewer.sprint02@example.com` | 200 |
| GET /api/v1/admin/reviews | 200 |
| GET /api/v1/admin/reviews/summary | 200 `{"visible":5,"hidden":0,"total":5}` |
| GET /api/v1/teacher-applications/queue | 200 |
| GET /api/v1/teacher-applications/queue/summary | 200 actionable=0 (live Dev DB currently empty) |
| GET /api/v1/teachers/showcase-moderation?pageSize=20 | 200 |
| Landing / Browse / Teacher Profile / Student / Teacher / Admin / Quality dashboards | 200 |
| `/app/js/tafseel.js`, `/app/css/tafseel.css` | 200 `Cache-Control: no-cache` |

No deployment.
