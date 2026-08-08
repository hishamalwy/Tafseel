# Isolated publish smoke

`dotnet publish src/Tafseel.Api -c Release -o artifacts/phase4-release6-final-acceptance-publish`  
Hosted Development `http://127.0.0.1:5092`, then **stopped**. Not deployed.

Machine-readable: `publish-smoke-final.json`.

| Check | Result |
|---|---|
| health-live | 200 `no-store, no-cache` |
| health-ready | 200 `no-store, no-cache` |
| public Landing / Browse / Profile / Compare overlay URL | 200 `no-cache` |
| Student login | 200 |
| Favorite PUT + GET state | 204 / 200 |
| Guided Request route | 200 `no-cache` |
| Book Session scheduler context | 200 `no-cache` |
| availability-summaries API | 200 |
| static css/js | 200 `no-cache` |
| unexpected 429/500 | none |
