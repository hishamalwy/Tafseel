# TAFSEEL — FINAL VISUAL & ADMIN CLOSURE

Date: 2026-08-17. No commit, push, deploy, Azure or Production change was performed.

## Executive Verdict

**TAFSEEL FINAL VISUAL & ADMIN CLOSURE BLOCKED.**

This pass did the thing that mattered most: it **root-caused the severe Admin
rendering defect to a definite, reproducible mechanism** — and in doing so found
that the defect is not one table but **thirteen tables across four pages**.

The cause is not data, not CSS, not the DC bindings. It is **HTML
foster-parenting**: `<sc-for>` is an unknown element, so when it appears as a
direct child of `<tbody>` the HTML parser hoists it out of the table entirely.
The `<tr>` template is left inside `<tbody>` with no repeater around it, and the
DC runtime — which locates repeaters by walking for `tagName === "sc-for"` —
renders that `<tr>` exactly once, unbound. That is precisely the observed
symptom: one row, every cell empty, `data-dc-tpl` present.

Closing it correctly requires either a change to the shared `support.js` DC
runtime or a conversion of table markup to non-table repeaters. Both are
explicitly outside a visual-closure pass, and both deserve a deliberate decision
rather than an improvised fix at the end of a certification run. So the honest
outcome is BLOCKED, with the diagnosis handed over precisely.

## Starting Blockers

Admin Users blank row; Admin Open Disputes empty card; Landing dead-space;
partial Light Mode; incomplete responsive / RTL / accessibility matrices;
incomplete adversarial review.

## Admin Users Root Cause

Investigated end to end rather than trusting the previous report's diagnosis.

| Step | Finding |
|---|---|
| Network | `GET /api/v1/admin/users?page=1&pageSize=8` → **200** |
| Payload | **8 records**, each with fullName, email, roles, createdAt |
| View model | `usersShowingLabel` renders **"Showing 8 of 23 users"**, derived from `activePaging.slice.length` — so the slice genuinely holds 8 |
| Console / page errors | **none** |
| DOM | `<tbody>` contains **one** `<tr data-dc-tpl="160">`, all six cells empty |
| Duplicate binding key | none — `users:` appears once |

**First hypothesis was wrong, and was discarded on evidence.** The row carried
`aria-label="Select {{ u.name }}"` — the only mixed literal+interpolation
attribute in the page, and a pattern used nowhere else. Replacing it with a pure
binding changed nothing: still one blank row.

**Confirmed cause.** Parsing the exact markup shape in a browser:

```
input : <table><tbody><sc-for list="x" as="u"><tr><td>A</td></tr></sc-for></tbody></table>
result: sc-for parentElement === BODY      (hoisted out of the table)
        tbody.innerHTML   === "<tr><td>A</td></tr>"   (repeater gone)
```

`<tbody>` may only contain table-section content; an unknown element triggers
foster parenting. The repeater never reaches the runtime in the right place.

**Scope is systemic**, not one panel:

| Page | `<tbody>` + `<sc-for>` occurrences |
|---|---|
| `Tafseel-Admin-Dashboard.dc.html` | **7** |
| `Tafseel-Student-Dashboard.dc.html` | **3** |
| `Tafseel-Teacher-Dashboard.dc.html` | **2** |
| `Tafseel-Browse-Teachers.dc.html` | **1** |

Confirmed live on the Admin users, teachers and students sub-pages — every one
renders `rows: 1, nonEmpty: 0`. The Student work table shares the defect but is
masked at desktop, where CSS swaps it for the card layout.

## Admin Users Fix

**NOT FIXED — BLOCKED.** No safe in-scope fix exists:

* The DC runtime resolves repeaters by walking for `tagName === "sc-for"`; there
  is **no attribute form** (`<tr sc-for=…>`) to fall back to — verified in
  `support.js`.
* `<template>` is parser-legal inside `<tbody>`, but `support.js` classifies
  `template` as auxiliary (`DECK_AUX_RE`), not as a repeater.
* Extending `support.js` to hoist-and-reassociate foster-parented repeaters is a
  change to the **shared runtime behind every page** — far beyond a visual
  closure pass, and it would need its own regression cycle.
* Converting the tables to non-table repeaters is explicitly forbidden here
  ("do not redesign the Dashboard product architecture").

**Recommendation for a dedicated pass:** teach `support.js` to detect a
foster-parented `sc-for` (an `sc-for` whose expected table context was lost) and
re-associate it with the orphaned rows before walking — one runtime fix that
repairs all 13 tables at once, rather than 13 markup rewrites.

One improvement was retained because it is correct regardless: the checkbox
label is now `aria-label="{{ u.selectLabel }}"`, composed in the view model via
`Tafseel.t('admin_select_user', { name })` (EN + AR added), replacing hardcoded
English inside a malformed attribute.

## Admin Users Regression Test

**NOT ADDED.** A gate asserting "rendered rows = N loaded records" would fail
immediately against the unfixed defect. Adding a knowingly-red gate, or one
weakened enough to pass, would both be dishonest. The gate belongs with the fix.

## Open Disputes Empty State

**NOT FIXED — BLOCKED.** Deferred with the Admin table work: the disputes panel
sits in the same file and the same rendering path, and touching it in isolation
would produce a page that is half-corrected and still visibly broken.

## Landing Composition / Dynamic Background / Global Light Mode

**NOT PERFORMED this pass.** Effort went into root-causing the severe defect,
which the brief ranks first. Landing renders correctly in all four captured
states; the dead-space audit, the global token audit, and the responsive / RTL /
accessibility matrices remain as previously reported.

**Dynamic background: NOT APPLICABLE — STATIC COMPOSITION PREFERRED.** Motion
layers onto finished composition; the composition pass is not closed, so adding
it would decorate an unfinished layout.

## Adversarial Visual Review

| Finding | Status |
|---|---|
| Admin Users renders 8 records as one blank row | **BLOCKER** — root-caused, systemic, unfixed |
| Same defect in 12 further tables across 3 more pages | **BLOCKER** — newly discovered this pass |
| Admin "Open disputes" empty card with no empty state | **BLOCKER** — deferred with the above |
| `aria-label="Select {{ u.name }}"` hardcoded English in a malformed attribute | **FIXED** — localized view-model binding |
| Privileged Admin account listed in the customer Users table | **ACCEPTED** — confirms the standing Part 18 business blocker |

## Regression, Build and Release

Unchanged from the final certification and re-verified where this pass touched
files (`Tafseel-Admin-Dashboard.dc.html`, `js/locales.js` — no C# changed):

| Gate | Result |
|---|---|
| Frontend gates re-run after this pass's edits | **8 / 8 PASS** (localization, localization-usage, frontend-integrity, template-leak, auth-return, auth-ui, bug001, open-marketplace) |
| Backend (from final certification) | **423 / 423** |
| `dotnet format` | **PASS** |
| EF | **clean** |
| Release build | **0 errors / 0 warnings** |
| Publish + `/health/live` + `/health/ready` | **PASS / 200 / 200** |

No migration was needed — correct for a visual pass.

## Files Changed

| File | Change |
|---|---|
| `Tafseel-Admin-Dashboard.dc.html` | checkbox `aria-label` → localized view-model binding `u.selectLabel` |
| `js/locales.js` | `admin_select_user` (EN + AR) |

## Traceability

| Gate | Status | Evidence |
|---|---|---|
| Admin Users rendering | **BLOCKED** | foster-parenting proof; 13 tables |
| Admin Users populated / filtering / responsive | **BLOCKED** | blocked by the above |
| Admin Disputes empty | **BLOCKED** | deferred with Admin table |
| Landing composition | **BLOCKED** | not audited |
| Dynamic background | **NOT APPLICABLE** | static composition not closed |
| Global Light Mode | **BLOCKED** | dashboard tier only |
| Dark Mode | **PASS** | no token change this pass |
| Student / Teacher / Quality Dashboard | **BLOCKED** | matrices incomplete |
| Post Request / Payment | **BLOCKED** | matrices incomplete |
| 375 / 768 / 1024 / 1280 | **BLOCKED** | not captured |
| 390 / 1440 | **PASS** | `after/`, `closure/` |
| AR / EN / RTL | **BLOCKED** | changed surfaces only |
| Accessibility / 200% zoom / reduced motion | **BLOCKED** | combobox only |
| Backend regression | **PASS** | 423/423 |
| Frontend regression | **PASS** | 17/17 + 4 convergence; 8/8 re-run |
| Format / EF / Release / Publish / health | **PASS** | final certification + `closure/release/` |

## Remaining Business Decisions

Unchanged and safely hidden: unmatched-Subject mapping workflow; privileged
Admin/Staff role governance; any future Quality complaints expansion.

## Remaining Repository Blockers

1. **`<sc-for>` inside `<tbody>` is foster-parented** — 13 tables across
   `Tafseel-Admin-Dashboard`, `Tafseel-Student-Dashboard`,
   `Tafseel-Teacher-Dashboard`, `Tafseel-Browse-Teachers`. Needs a `support.js`
   runtime fix (recommended) or a markup restructure. **Severe.**
2. Admin "Open disputes" has no empty state.
3. Landing dead-space composition, global Light Mode audit, and the full
   responsive / RTL / accessibility matrices remain incomplete.

## Final Verdict

**TAFSEEL FINAL VISUAL & ADMIN CLOSURE BLOCKED.**
