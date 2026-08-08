# Back / Forward discovery state

Browse non-default Subject + Service + sort is written into the URL via `pushState`. Profile and Compare preserve those query params (compare overlay also serializes compare IDs).

Accepted:

- `10-browse-profile-back` — Back restores discovery query
- `13-back-forward-discovery` — further history change remains coherent
- Invalid `subjectId` UUID: empty/recovery main renders, no `{{` leak (`invalid-url-graceful`)

Stale-response safety: `loadTeachers` increments `_teacherRequest` and ignores responses whose token no longer matches, so a slower previous filter cannot overwrite a popstate-restored query.
