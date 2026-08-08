# F-013 Root Cause & Fix Evidence (Phase 4 Sprint 0.3)

## Root cause proof

`.dc.html` files are served byte-for-byte as static HTML (`Results.File(path, "text/html; charset=utf-8")` in `Program.cs`), and `<x-dc>` is a plain, non-inert custom element (not `<template>`). Confirmed via direct source inspection:

```
$ grep -n '^<x-dc\|<x-dc>' Tafseel-Student-Dashboard.dc.html
9:<x-dc>
```

The raw markup therefore contained, byte-for-byte in the HTTP response body:

```
730: <img class="tf-img-avatar" src="{{ reviewTeacherAvatar }}" ... />
805: <img class="tf-img-avatar" src="{{ rateTeacherAvatar }}" ... />
```

Since the browser's HTML parser eagerly fetches `src` on `<img>` as soon as it parses the tag — regardless of any `sc-if` gating, since `sc-if` is just another unrecognized custom element whose children are still live, parsed DOM — this produces a real network request to the literal, URL-encoded template text before any JavaScript (including the `dc-runtime`/React hydration that would normally resolve the binding) has run.

Confirmed via `support.js` source trace: the JS-side interpolation pipeline (`compileAttr` → `walkElement` → `h(realTag, props, ...)`, all going through real React `createElement`) is provably safe — an unresolved binding yields `props.src = undefined`, which React omits from the DOM entirely, never emitting literal `{{ }}` text. The leak happens exclusively at the browser's raw-HTML-parse stage, before any of this JS runs.

## Fix

Renamed the two vulnerable attributes from `src` to `sc-camel-src` (an existing, already-proven dc-runtime convention used elsewhere for `sc-camel-value` on controlled inputs). `sc-camel-src` is not a browser-recognized resource attribute, so the parser never fetches it; `collectProps`/`kebabToCamel` in `support.js` (unmodified) map it to the real `src` prop once React resolves and mounts the element.

Applied project-wide to every `<img>`/`<video>` element with an interpolated `src="{{ ... }}"` (30 occurrences across 8 files) — the full, well-defined "proven racy" class per the sprint's own resource-attribute audit — not a mechanical rewrite of unrelated bindings (`href` on `<a>` is not resource-eager and was left untouched).

## Live verification (post-fix)

- Raw HTTP response for `Tafseel-Student-Dashboard.dc.html` confirmed to contain `sc-camel-src="{{ reviewTeacherAvatar }}"` and `sc-camel-src="{{ rateTeacherAvatar }}"` — zero occurrences of ` src="{{` anywhere in any of the 8 fixed files (`grep -n ' src="{{' *.dc.html` → empty).
- 5 consecutive fresh full-page-reload + deep-link auto-open cycles of the Review Delivery modal (`?orderId=...&focus=review`, the fastest possible trigger — matches the exact condition that reproduced the original leak): `performance.getEntriesByType('resource')` filtered for `%7B%7B`/`{{` → **0 matches, every time**.
- Rate modal (`?orderId=...&focus=rate`) on the same order after completion: 0 leaks, avatar/name/service resolved correctly, submit succeeded (`POST /orders/{id}/review → 200`).
- Cross-surface sweep (cache-busted fresh loads): Admin Dashboard, Teacher Dashboard, Quality Dashboard, Browse Teachers, Landing — **0 leaks on every page**.
- Publish-output verification: `grep -c ' src="{{' Tafseel-Student-Dashboard.dc.html` in the `dotnet publish` output directory → `0`.

## Notable side-finding: browser cache masking

An initial check against Quality Dashboard using a plain `force: true` navigate (no cache-busting query string) reported 4 stale leaks — these were traced to the browser's HTTP cache still serving byte-for-byte pre-fix HTML from earlier in this session, not a live defect. A cache-busted reload (`?cachebust=...`) immediately showed 0 leaks. This confirms the fix is effective but also that **any client with a cached copy of a pre-fix `.dc.html` page will remain vulnerable until that cache entry expires or is busted** — a real deployment consideration, not addressed by this pass (no explicit cache-control headers are set on these static files today), recorded in Remaining Limitations.
