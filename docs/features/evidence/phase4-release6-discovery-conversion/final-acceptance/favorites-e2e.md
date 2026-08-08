# Favorites E2E

Accepted cert (`release6-final-acceptance-cert-accepted.json`):

| Step | Result |
|---|---|
| Add | PASS `01-favorite-add` — `aria-pressed=true` matches API |
| Persist refresh | PASS `02-favorite-persist-refresh` |
| Browse + Profile coherent | PASS `favorite-profile-coherent` |
| Race / final UI = API | PASS `favorite-race-final-matches-api` |
| Remove | PASS `03-favorite-remove` — pressed=false, API absent |

Profile favorite uses `_favBusy` so overlapping toggles cannot diverge from the last settled API state.
