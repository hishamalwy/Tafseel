# Console Error Sweep — Foundation Final Certification

## New defect found and fixed this run: `boot-prefs.js` 404 on every page

**Symptom:** every `.dc.html` page unconditionally references
`<script src="js/boot-prefs.js">` in `<head>` (early theme/lang boot, avoids FOUC), but
`Program.cs`'s `/app/js/{file}` allowlist route did not include `boot-prefs.js`, so every
single page load 404'd on it, and the browser logged
`Refused to execute script ... because its MIME type ('') is not executable`.

**Root cause:** the file was added to `js/boot-prefs.js` and wired into every page's
`<head>` at some point, but the corresponding entry was never added to the static-file
allowlist in `src/Tafseel.Api/Program.cs`'s `/app/js/{file}` route.

**Fix (src/Tafseel.Api/Program.cs):** added `boot-prefs.js` to the allowlist:
```csharp
file is "locales.js" or "tafseel.js" or "api.js" or "teacher-apply.js" or "chat-widget.js" or "media-preview.js"
    or "guided-request.js" or "boot-prefs.js"
```
Verified post-fix: `curl -I http://127.0.0.1:5090/app/js/boot-prefs.js` -> `200 OK`, and a
fresh page load's `performance.getEntriesByType('resource')` shows `boot-prefs.js` as
`200`/`304`, not `404`. Confirmed via the isolated publish-smoke instance too.

**Severity assessment:** low-impact (the script's own logic is defensively wrapped in
`try/catch` and its absence only meant the early dark/RTL flash-of-unstyled-content
guard silently no-op'd — not a functional break, not a data leak, not F-013-related).
Still a genuine, previously-undetected regression affecting literally every page load,
so it was fixed under this run's "restore existing intended behavior" scope rather than
left for a future sprint.

## New (separate, NOT fixed this run) finding: raw `{{ }}` in an SVG `path d` attribute

`Tafseel-Teacher-Profile.dc.html` line 98 has:
```html
<path d="{{ sv.iconPath }}" />
```
inside the `services` `sc-for` loop. Because `.dc.html` is served as static HTML and
`<x-dc>`/`<sc-for>` are non-inert custom elements (same root cause class as F-013), the
browser's SVG-path parser sees the literal `{{ sv.iconPath }}` string before React
mounts and logs: `Error: <path> attribute d: Expected moveto path command ('M' or 'm')...`

**Why not fixed this run:** unlike `src`/`href` on `<img>`/`<video>`/`<source>`, a `d`
attribute is not resource-fetching — no network request, no cache-poisoning, no security
exposure. The visible effect is a momentarily blank/malformed icon glyph until React
mounts (sub-frame in practice) plus a console error. This is a real defect in the same
family as F-013 but strictly lower severity, and the prompt's explicit scope is
"no redesign, no new domains" plus a specific, already-large list of parts — expanding
the resource-attribute hardening pass to cover every SVG `d`/`points`/`viewBox`-style
attribute across all pages is new scope, not part of this pass's mandate. Recorded here
as a disclosed, unresolved finding for a future pass, not silently ignored.

## Steady-state console errors after the boot-prefs fix

With a fresh server process and a fresh page load (Landing, Browse, Teacher/Student
Dashboards, Teacher Profile with a service list present), the only remaining console
error observed is the `path d` one above, isolated to Teacher Profile when
`services.length > 0`. No other unexpected errors were observed on Landing,
Browse-Teachers, Auth, Payment, or Mock-Checkout.
