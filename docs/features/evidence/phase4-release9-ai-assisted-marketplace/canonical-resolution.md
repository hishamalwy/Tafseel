# Canonical Resolution

The server loads active Subjects, public/active/Teacher-selectable Service Catalog items, Languages, and Education Levels through `ICatalogService`. Normalized exact matches are preferred; bounded containment is permitted only when it resolves to one row. Unknown or multiple rows create clarification, never data.

Resolved canonical GUIDs are returned to the browser. Browse applies them to its existing filter state and calls the Release 6 `/teachers` search. The model cannot provide or override a Teacher GUID.
