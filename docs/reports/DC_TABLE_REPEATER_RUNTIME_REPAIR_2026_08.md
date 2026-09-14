# TAFSEEL — DC TABLE REPEATER RUNTIME REPAIR

**Date:** 2026-08-17 · **Pass:** UI/UX Final Convergence 01 / 13 · **Scope:** frontend rendering correctness only

## Executive Verdict

The defect is real, systemic, and now repaired at the mechanism level rather than per page.

The root cause is HTML **foster parenting**, not a runtime bug in `sc-for` itself: `<sc-for>` and
`<sc-if>` written directly inside `<table>`/`<thead>`/`<tbody>`/`<tfoot>`/`<tr>` are unknown
elements in the parser's table insertion modes, so the parser relocates them out of the table and
strips their children *before any JavaScript runs*. Because `parseDcDocument()` reads the root
template out of the already-parsed document (`x-dc.innerHTML`), the repeater/row relationship no
longer exists by the time the DC runtime sees the markup.

The repair is a parser-safe directive host: `<template sc-for …>` / `<template sc-if …>`.
`<template>` is the one container the HTML parser accepts inside a table section untouched. The
runtime learned to recognise it in **one place** (`walk()` in `support.js`), 15 directives across
4 surfaces were mechanically migrated, and a CI gate now prevents the unsafe shape from returning.

**All four affected product surfaces are browser-proven fixed against real, populated API data**
(Admin Users, Student requests, Teacher active orders, Browse comparison), and the full canonical
frontend gate set is green.

## Starting Defect

Reported symptom on Admin Users: the API returned records, the view model contained them, the UI
itself said "Showing N of M users", but `<tbody>` contained a single `<tr>` whose cells were all
blank. The lead was "13 tables across 4 pages" — treated as a lead, re-derived from source.

## Minimal Browser Reproduction

`tests/browser/dc-table-parser-evidence.mjs` (Chromium, no application code involved).

Input:

```html
<table><tbody><sc-for list="x" as="item"><tr><td>Value</td></tr></sc-for></tbody></table>
```

Parsed document (`x-dc.innerHTML`):

```html
<sc-for list="x" as="item"></sc-for><table><tbody><tr><td>Value</td></tr></tbody></table>
```

* `sc-for.parentElement` → `x-dc` (hoisted out of the table)
* `sc-for.childElementCount` → `0` (children stripped)
* `tbody.children` → `[tr]` (the row stayed behind, now unowned)

## HTML Parser Evidence

| Shape | Directive parent after parse | Directive children | Verdict |
| ----- | ---------------------------- | ------------------ | ------- |
| `<tbody><sc-for><tr>…` | `x-dc` (foster-parented) | 0 | BROKEN |
| `<tbody><sc-if><tr>…` | `x-dc` (foster-parented) | 0 | BROKEN |
| `<table><sc-for><tr>…` (no tbody) | `x-dc` (foster-parented) | 0 | BROKEN |
| `<tr><sc-for><td>…` (cell repeat) | `x-dc` (foster-parented) | 0 | BROKEN |
| `<tbody><template><tr>…` | `tbody` | 1 | **SAFE** |
| `<div><sc-for><p>…` (control) | `div` | 1 | SAFE |
| `sc-raw-*` aliased tags | `sc-raw-tbody` | 1 | SAFE (second parse only) |

Both parse levels behave identically, so `<sc-if>` is affected exactly like `<sc-for>`, and the
existing `RAW_WRAP` aliasing protects only the *second* parse.

## Current Affected Table Inventory

Re-scanned from current source. **15 unsafe directives across 14 tables in 4 surfaces** — the
previous "13" is superseded. Full listing: `node scripts/ci/check-dc-table-repeaters.mjs --inventory`.

| File | Surface | Collection | Current Shape | Parser Risk | Symptom | Mobile Alternative |
| ---- | ------- | ---------- | ------------- | ----------- | ------- | ------------------ |
| Tafseel-Admin-Dashboard | Users (overview) | `users` | `tbody > sc-for` | Foster-parented | BROKEN | — |
| Tafseel-Admin-Dashboard | Users (page) | `pageUsers` | `tbody > sc-for` | Foster-parented | BROKEN | — |
| Tafseel-Admin-Dashboard | Reviews ops | `reviewsOpsItems` | `tbody > sc-for` | Foster-parented | BROKEN | — |
| Tafseel-Admin-Dashboard | Audit log | `auditRows` | `tbody > sc-for` | Foster-parented | BROKEN | — |
| Tafseel-Admin-Dashboard | Withdrawals | `withdrawals` | `tbody > sc-for` | Foster-parented | BROKEN | — |
| Tafseel-Admin-Dashboard | Intelligence funnel | `intelligenceFunnel` | `tbody > sc-for` | Foster-parented | BROKEN | — |
| Tafseel-Admin-Dashboard | Intelligence dimensions | `intelligenceRows` | `tbody > sc-for` | Foster-parented | BROKEN | — |
| Tafseel-Browse-Teachers | Comparison header | `comparisonTeachers` | `tr > sc-for` | Foster-parented | BROKEN | `.tf-compare-mobile` |
| Tafseel-Browse-Teachers | Comparison rows | `comparisonRows` | `tbody > sc-for` | Foster-parented | BROKEN | `.tf-compare-mobile` |
| Tafseel-Browse-Teachers | Comparison cells (nested) | `row.values` | `tr > sc-for` | Foster-parented | BROKEN | `.tf-compare-mobile` |
| Tafseel-Student-Dashboard | Learning history | `learningRows` | `tbody > sc-for` | Foster-parented | BROKEN | card list |
| Tafseel-Student-Dashboard | All requests | `allRequests` | `tbody > sc-for` | Foster-parented | BROKEN | card list |
| Tafseel-Student-Dashboard | Transactions | `transactions` | `tbody > sc-for` | Foster-parented | BROKEN | card list |
| Tafseel-Teacher-Dashboard | Orders | `orders` | `tbody > sc-for` | Foster-parented | BROKEN | card list |
| Tafseel-Teacher-Dashboard | Earnings | `earningRows` | `tbody > sc-for` | Foster-parented | BROKEN | card list |
| Tafseel-Teacher-Dashboard | Withdrawal history | `withdrawals` | `sc-for > table` (one table per item) | None | **SAFE** (pre-existing) | — |

`sc-if` inside a `<td>`/`<th>` (in-cell insertion mode) is **NOT APPLICABLE** — it is never
foster-parented and was left untouched. Every other `.dc.html` surface has no table repeaters.

## DC Runtime Analysis

Read end-to-end through `support.js`.

1. **Locating `sc-for`** — `walk()` dispatches on `el.tagName.toLowerCase()` during `compileTemplate()`.
2. **Parse completeness** — the document is fully parsed before the runtime runs; `boot()` is called
   on `DOMContentLoaded`.
3. **Template storage** — `compileTemplate()` sets `tpl.innerHTML = encodeCase(html)` on a detached
   `<template>` and compiles it into builder closures. There is no live DOM template node.
4. **`data-dc-tpl`** — stamped by a recursive walk over the compiled fragment, purely for the editor bridge.
5. **Scopes/aliases** — `walkFor` builds `sub = { ...vals, [asName]: item, $index: i }` per item.
6. **Interpolation** — `compileAttr`/`walkText` resolve against that merged object at render time.
7. **Cloned nodes** — there is no cloning; React re-invokes builders per item, so scope is closure-captured.
8. **Events** — handler values come from `renderVals()` and are passed straight to React props.
9. **Rerender** — React reconciliation; `walkFor` keys each item by index inside a Fragment.
10. **Nested `sc-for`** — plain recursion via `walkChildren`.
11–12. **`sc-if` inside/around repeaters** — same recursion, no special casing.
13. **`hint-placeholder-count`** — streaming-only; synthesizes `Array(n).fill(undefined)` for skeletons.
14. **Physical-parent assumption** — none at render time, but there is a hard assumption at *compile*
    time: the directive must still contain its children in the source string.
15. **Metadata surviving foster-parenting** — none. The relationship is destroyed at parse time and
    is not recoverable from the serialization.
16. **Mutation observers** — not involved.
17. **Source text after parse** — *not available* for the root document: `parseDcDocument()` uses
    `x-dc.innerHTML`. Raw text is only re-fetched for the embedded editor (`boot()` gates on
    `window.parent !== window`), deliberately, to avoid downloading and parsing the page twice.
18. **Deterministic re-association** — not possible; see Option A below.

### Root-cause note

* **PARSE-TIME CAUSE** — table insertion modes foster-parent unknown elements; `<sc-for>`/`<sc-if>`
  are relocated before the table and emptied, their `<tr>` children left behind in the section.
* **RUNTIME ASSUMPTION** — `compileTemplate()` assumes the template source string still nests
  directive children inside the directive.
* **WHY CURRENT RENDER FAILS** — `x-dc.innerHTML` serializes the damaged DOM, so the runtime compiles
  an empty `sc-for` plus one static `<tr>` whose `{{ … }}` holes resolve to nothing → one blank row.
* **SAFE INTERCEPTION POINT** — the markup shape itself, because it is the only point *before* the
  damage occurs. Everything downstream operates on already-lossy data.

## Options Considered

**A — Runtime re-association.** Rejected. The parser destroys the mapping; the runtime would have to
guess which hoisted directive owns which rows in which section. Ambiguous with multiple repeaters per
table, interleaved `sc-if`, and nested repeaters — precisely the Browse comparison table's shape.

**B — Table-safe runtime directive (new syntax).** Rejected as a *new* invention, but its good idea
survives inside Option D: rather than inventing a tag, reuse the one element the standard already
guarantees is safe there.

**C — Pre-parse source transformation.** Architecturally tempting: `encodeCase()` already rewrites
tags before the second parse, and `boot()` already contains a raw-source re-fetch path. Rejected: the
raw text is unavailable at boot without a second network round-trip of the whole page, which the code
deliberately avoids, and it would make correct rendering depend on a fetch, with a visible flash and a
race on every page load.

**D — Markup restructure to a parser-legal shape.** **Selected.**

## Architecture Decision

**Host the directive on a `<template>` element**, recognised once by the runtime:

```html
<tbody>
  <template sc-for list="{{ rows }}" as="r">
    <tr>…</tr>
  </template>
</tbody>
```

| Criterion | Outcome |
| --------- | ------- |
| HTML standards correctness | `<template>` is explicitly handled by the "in table" insertion mode; never foster-parented |
| Runtime complexity | +3 call sites, one 3-line helper, one 3-line predicate |
| Backwards compatibility | Bare `<sc-for>`/`<sc-if>` continue to work everywhere; the attribute form is additive |
| Affected file count | 4 surfaces, 15 directives — mechanical rename, no logic change |
| Risk to non-table repeaters | None; covered by an explicit control group in the regression suite |
| Event binding / nested rendering | Unchanged — same `walkFor`/`walkIf` code path |
| Accessibility semantics | Semantic `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th scope>` fully preserved |
| Performance | No extra parse, fetch, or observer |
| Testability | Deterministic and statically checkable |

The attribute form is legal anywhere; the CI gate *requires* it only inside table sections.

## Implementation

`support.js` — three call sites plus two helpers:

```js
function directiveScope(node) {
  return node.localName === "template" ? node.content : node;
}
function isDirectiveTemplate(el, name) {
  return el.localName === "template" && el.hasAttribute(name);
}
```

* `walk()` — `if (tag === "sc-for" || isDirectiveTemplate(el, "sc-for")) return walkFor(el, host);` (same for `sc-if`)
* `walkChildren()` — reads through `directiveScope(node)`
* `compileTemplate()`'s `stamp()` — recurses through `directiveScope(node)` so `data-dc-tpl` still
  reaches nodes inside a template's `.content`

`walkFor`/`walkIf` themselves are unchanged: they already delegate to `walkChildren`.

One subtlety worth recording: `directiveScope` must test `localName`, **not** the truthiness of
`.content`. `HTMLMetaElement` reflects its `content` attribute as a *string* property of that name, so
a `node.content || node` shortcut walks straight off any `<helmet>` `<meta>` tag and breaks every
page. This was caught in the browser and is now locked in by a `<meta>` in the test fixture's helmet.

Markup migration: 15 directives rewritten mechanically (`<sc-for …>` → `<template sc-for …>`,
matching `</sc-for>` → `</template>`), nesting-aware. No classes, styles, attributes, bindings, or
script logic were touched.

## Runtime Behaviour Before

`tests/browser/dc-table-repeater-before-after.mjs`, legacy markup shape, 8-item collection:

```
parser  : directiveTag=sc-for  parent=main  childRows=0  tbodyChildren=[tr]
rendered: dataRows=1  blankRows=1  firstRowCells=["","","","",""]
```

One row, five blank cells — the reported Admin Users symptom, reproduced exactly.

## Runtime Behaviour After

Same script, repaired markup shape, same 8-item collection:

```
parser  : directiveTag=template  parent=tbody  childRows=1  tbodyChildren=[template]
rendered: dataRows=8  blankRows=0
          firstRowCells=["Ahmed Salah","ahmed@example.com","Teacher","Active","Suspend"]
```

The legacy shape stays broken even on the fixed runtime — it *cannot* be fixed at runtime, which is
why the CI gate is mandatory rather than advisory.

## Admin Users Proof

`tests/browser/dc-table-repeater-surfaces.mjs`, real login through the Auth page, real API:

```
GET /api/v1/admin/users?page=1&pageSize=8  →  6 records
rendered: 6 data rows (12 <tr> total — each user row is followed by its role-editor row)
          0 blank rows, 0 inert <template>, every row parented by <tbody>
first row: ["Sprint 0.2 UAT Admin qa.admin.sprint02@example.com","Admin","Aug 17, 2026","Active","RolesSuspend"]
```

Display name, email, role, joined date, status and action controls are all non-blank on every row.
Screenshot: `docs/features/evidence/dc-table-repeater-runtime-repair/admin-users-after.png`.

## Development Data Provenance

These three surfaces were initially reported BLOCKED: the reseeded Development database had no
orders, transactions, or published teachers, and nothing was fabricated to work around that. The
gap was closed by driving the real product lifecycle through the same canonical endpoints a user's
browser calls (`tests/browser/fixture-pass01-surfaces.mjs`) — no raw SQL, no direct row inserts, no
authorization bypass:

1. Teacher application created against a seeded qualification topic, teaching demo uploaded,
   application submitted.
2. **Quality Reviewer** (`quality@gmail.com`) started the review and approved it with all nine
   evaluation criteria scored — the real decision endpoint, not a shortcut.
3. Teacher profile completed, education levels set, service offering created and activated,
   profile published.
4. Student created a learning request against that offering; the Teacher accepted it, producing a
   real Order; payment was initialized through the real payments endpoint.

Two business rules were hit and respected rather than circumvented:

* Service *title* and *description* are catalog-owned and cannot be set by a Teacher
  (`teacher_service_title_catalog_owned`) — the fixture sets only price, delivery, revisions and
  the Teacher's own approach text.
* `TeacherPublicQueries.BrowsableTeachers` deliberately excludes any account whose display name
  contains "UAT" or "Sprint", so fixture accounts can never leak into the public marketplace. The
  second Teacher is therefore a seeded demo account (`admin@gmail.com`) granted the Teacher role
  through the real Admin roles endpoint — the same call the Admin Users "Roles" checkboxes make,
  and a role combination Tafseel's multi-role model explicitly supports.

## Student Table Proof

Student Dashboard → **My Requests** (`allRequests`, migrated at `Tafseel-Student-Dashboard.dc.html:346`):

```
GET /api/v1/learning-requests/mine  →  2 records
rendered: 2 data rows, 0 blank, 0 unresolved {{ }}, 0 inert <template>, all rows parented by <tbody>
row 1: ["Quadratic equations — exam preparation walkthrough  Order · Custom recorded explanation",
        "Tafseel Teacher", "Payment required", "Aug 20, 2026", "194.4", "View timeline  Messages  Pay"]
```

Title, sourcing label, service, teacher, status, deadline, amount and the row actions are all bound
and non-blank. Screenshot: `student-populated.png`.

Note on the mobile projection: this surface has no separate mobile card list — the table itself is
the single responsive representation inside a horizontally scrollable wrapper — so there is no
desktop/mobile divergence to reconcile here.

## Teacher Table Proof

Teacher Dashboard → **Active Orders** (`orders`, migrated at `Tafseel-Teacher-Dashboard.dc.html:254`):

```
GET /api/v1/learning-requests/assigned  →  2 records
rendered: 2 data rows, 0 blank, 0 unresolved {{ }}, 0 inert <template>, all rows parented by <tbody>
row 1: ["Quadratic equations — exam preparation walkthrough", "Tafseel Student",
        "Aug 20, 2026", "153", "Payment required  View timeline  Messages"]
```

Order title, student display name, deadline, teacher-net price and the per-row actions are all
bound. Screenshot: `teacher-populated.png`.

The Earnings table is **not** proven populated: no order has reached a state that legitimately
creates earnings, and inventing one would have violated the financial lifecycle. It shares the
identical repaired shape and is covered by the runtime suite and the CI gate.

## Browse Table Proof

Browse Teachers → two real published Teachers selected → **Compare** (the hardest shape in the
inventory: repeated `<th>` in `<thead><tr>`, repeated `<tr>` in `<tbody>`, and a repeated `<td>`
nested inside each repeated row — all three were foster-parented before the fix):

```
3 header cells  = 1 field-label column + one repeated <th> per compared teacher
12 comparison rows, 0 blank, 0 inert <template>, all rows parented by <tbody>
2 nested <td> per row (exactly one per compared teacher), row header scope="row" preserved
row 1: ["Physics tutor — mechanics and problem solving",
        "Mathematics tutor — algebra and exam technique"]
```

Values map to the correct teacher and the correct field row (Physics / 220 SAR under Tafseel Admin,
Mathematics / 180 SAR under Tafseel Teacher). Removing one teacher re-rendered the table to 2 header
cells and exactly 1 nested cell per row, with no orphan column; reopening did not duplicate cells.
Screenshot: `browse-comparison-populated.png`.

## Non-Table `sc-for` Regression

Explicit control group, all passing: `div`/`article` repeat, `li` repeat, `select`/`option` repeat,
button-group repeat, empty repeat, two sibling repeaters, `sc-if` nested in a non-table repeat, and
event scope inside a non-table repeat. Bare `<sc-for>`/`<sc-if>` behave exactly as before.

## Nested Directive Regression

`sc-for` → `sc-if` (per-row branch selection), `sc-if` → `sc-for` (a gated `<tbody>` section that
toggles cleanly), nested `sc-for` (repeated cells inside repeated rows), and a repeated `<th>` in
`<thead>` — all covered and passing.

## Accessibility / Semantic Table Check

Asserted by DOM inspection in `tableRepeat_semanticStructure`:

* `<table>` remains a real table; `<caption>` renders and is bound
* `<tbody>` contains only `<tr>`; every row's `parentElement` is `TBODY`
* `<th scope="col">` and `<th scope="row">` associations preserved
* row action controls remain focusable
* `#dc-root` contains **zero** `<template>` elements — the directive hosts are compiled away, so
  nothing inert is exposed to the accessibility tree

## CI Regression Gate

`scripts/ci/check-dc-table-repeaters.mjs` — a stack-tracking tokenizer (not a broad regex) that
reports any control-flow directive whose nearest open ancestor is a table section, with the exact
replacement text in the failure message. Documented allowed/forbidden shapes are in the file header.
Verified in both directions: it failed on all 15 pre-migration sites and passes now.

```
DC table-repeater parser-safety check passed (17 surfaces scanned, 15 table-hosted directives, all parser-safe).
```

## Localization Gate Resolution

`check-sprint3-localization.mjs` was red at first report. It was **not** caused by this pass — the
identical failure reproduces on the pre-migration file — and the investigation found a deliberate
product change rather than a regression:

* At `HEAD` the Admin Settings page carried a "Platform settings" form (commission rate,
  quality-review toggle, maintenance mode) whose Save button **never persisted anything**; it only
  flashed `admin_settings_locked` — "Production settings are deployment-managed and cannot be
  changed here." Its labels were hardcoded English.
* In the current tree that form was replaced by an honest read-only note bound through
  `platformSettingsHeading` (`Tafseel.t('admin_platform_settings')`), `platformSettingsManagedTitle`,
  `platformSettingsManagedBody` and `platformSettingsSnapshotHint`, bilingual EN/AR, explaining that
  fees, quality policy and maintenance mode are deployment-managed and that financial terms are
  snapshotted per Order. All eight handlers and state keys of the old form were removed together.

So the gate was asserting obsolete implementation text (`admin_settings_locked`), not behaviour. Per
the decision rule it was updated to test the new canonical behaviour, without weakening localization:
the settings surface must keep a platform-settings heading, must render the deployment-managed note
through **bound** strings rather than literal markup text, must localize the heading via
`Tafseel.t('admin_platform_settings')`, and must **not** reintroduce non-persisting platform-settings
controls (`onSavePlatformSettings` / `onCommissionRate` / `onRequireReview` / `onMaintenanceMode`).

Verified in both directions: the updated gate fails on the old `HEAD` shape ("must keep a
platform-settings heading") and fails when a bound string is replaced by literal English text, and
passes on the current implementation. No dummy source line was added.

One piece of dead code remains from that removal — a `savePlatformSettings: Tafseel.t(...)` key in
`renderVals()` with no template consumer. It is harmless and out of scope for this pass.

## Frontend Regression

All `scripts/ci/check-*.mjs` gates: **22 passed, 0 failed.**

auth-return, auth-ui, bug001-display-names, **dc-table-repeaters (new)**, frontend-integrity
(17 entry points), guided-request, js, localization-usage, localization (14 entry points / 2617 paired
keys), open-marketplace (70 localized keys), production-infrastructure, release5-order-communication,
release6-discovery, release7-marketplace-intelligence, release9-ai-assisted-marketplace,
service-catalog-release1, sprint2-localization, **sprint3-localization (updated)**,
sprint6-notification-routing, teacher-profile-mobile-cta, template-placeholder-leak (12 surfaces),
unified-discovery-search.

Runtime browser suite: `tests/browser/dc-table-repeater-runtime.mjs` — **18/18 checks passed**.
Real-surface suite: `tests/browser/dc-table-repeater-surfaces.mjs` — **4/4 checks passed, all with
populated data**.

## Backend Safety

No backend source was modified in this pass. No migration was required or created. The Admin Users
API contract is unchanged and was exercised live (`GET /api/v1/admin/users?page=1&pageSize=8` → 200,
6 items). Auth login verified for all four seeded Development accounts (200).

## Format / Build

```
dotnet format Tafseel.sln --verify-no-changes --no-restore   →  exit 0
dotnet build Tafseel.sln -c Release --no-restore             →  exit 0
```

## Files Changed

| File | Change |
| ---- | ------ |
| `support.js` | Recognise `<template sc-for>` / `<template sc-if>`; scope child traversal through `directiveScope` |
| `Tafseel-Admin-Dashboard.dc.html` | 7 table directives migrated |
| `Tafseel-Browse-Teachers.dc.html` | 3 table directives migrated (incl. nested) |
| `Tafseel-Student-Dashboard.dc.html` | 3 table directives migrated |
| `Tafseel-Teacher-Dashboard.dc.html` | 2 table directives migrated |
| `scripts/ci/check-dc-table-repeaters.mjs` | **New** — parser-safety CI gate |
| `tests/browser/dc-table-parser-evidence.mjs` | **New** — minimal parser reproduction |
| `tests/browser/dc-table-repeater-runtime.mjs` | **New** — 18-check runtime regression suite |
| `tests/browser/dc-table-repeater-before-after.mjs` | **New** — before/after evidence capture |
| `tests/browser/dc-table-repeater-surfaces.mjs` | **New** — real-surface validation |
| `tests/browser/fixtures/dc-table-repeater.dc.html` | **New** — regression fixture |
| `tests/browser/fixture-pass01-surfaces.mjs` | **New** — canonical lifecycle driver for populated Development data |
| `scripts/ci/check-sprint3-localization.mjs` | Stale Admin-settings assertion replaced with the current canonical behaviour |

The working tree also carries substantial unrelated uncommitted changes from earlier sessions; none
were modified by this pass.

## Evidence Paths

* `docs/features/evidence/dc-table-repeater-runtime-repair/admin-users-after.png`
* `docs/features/evidence/dc-table-repeater-runtime-repair/student-populated.png`
* `docs/features/evidence/dc-table-repeater-runtime-repair/teacher-populated.png`
* `docs/features/evidence/dc-table-repeater-runtime-repair/browse-comparison-populated.png`
* `node tests/browser/dc-table-parser-evidence.mjs`
* `node tests/browser/dc-table-repeater-before-after.mjs`
* `node tests/browser/dc-table-repeater-runtime.mjs`
* `node tests/browser/dc-table-repeater-surfaces.mjs`
* `node tests/browser/fixture-pass01-surfaces.mjs`
* `node scripts/ci/check-dc-table-repeaters.mjs --inventory`

The earlier `student-after.png` / `teacher-after.png` / `browse-after.png` captures documented the
empty-state assertions from the first report and were superseded by the populated captures above.

## Remaining Known Limitations

1. **The Teacher Earnings table is not proven populated.** No order has legitimately reached a state
   that creates earnings, and fabricating one would have violated the financial lifecycle. It shares
   the identical repaired shape as the proven Active Orders table and is covered by the runtime suite
   and the CI gate.
2. **The Development database was dropped and reseeded** at the operator's explicit instruction,
   because every seeded account rejected the configured `SeedUsers:Password` (the seeder never resets
   passwords on pre-existing accounts). Prior local Development data was lost. The current data was
   then rebuilt through canonical API flows only.
3. **Legacy markup cannot be repaired at runtime.** A bare `<sc-for>` inside a table section still
   renders one blank row by design — the data is destroyed before JavaScript runs. The CI gate is the
   only defence and must stay in the pipeline.
4. **The second published Teacher is a demo account granted the Teacher role** (`admin@gmail.com`),
   because registration always requires an email confirmation Development cannot deliver, and the
   `*.sprint02` UAT accounts are deliberately excluded from public browse. This is a supported
   multi-role state, but it means the Browse evidence shows an Admin-named teacher card.
5. The runtime and surface suites are not yet wired into `.github/workflows/ci.yml`; only the static
   gate is a plain `node` invocation ready to drop in.
6. A dead `savePlatformSettings` key remains in the Admin `renderVals()` with no template consumer.

## Traceability

| Requirement | Status | Evidence | Test |
| ----------- | ------ | -------- | ---- |
| Parser reproduction | PASS | Foster-parenting table above | `dc-table-parser-evidence.mjs` |
| Current inventory complete | PASS | 15 directives / 14 tables / 4 surfaces | `check-dc-table-repeaters.mjs --inventory` |
| Root cause confirmed | PASS | Root-cause note | `dc-table-repeater-before-after.mjs` |
| Repair architecture selected | PASS | Architecture Decision | — |
| Runtime repair implemented | PASS | `support.js` diff | 18/18 runtime suite |
| Zero items | PASS | 0 rows, no phantom row | `tableRepeat_0Items` |
| One item | PASS | exact row name | `tableRepeat_1Item` |
| Many items | PASS | 8 rows, first row bound | `tableRepeat_8Items` |
| Bindings | PASS | text, class, data-attr, href, aria-label, button label | `tableRepeat_bindingsResolve` |
| Events | PASS | row B → B, row E → E | `tableRepeat_eventScope` |
| Rerender | PASS | 3→2→1→0→2, no orphans | `tableRepeat_rerender` |
| Filter | PASS | 8→3→8 | `tableRepeat_filter` |
| Pagination | PASS | page 1→2→1 | `tableRepeat_pagination` |
| Multiple tables | PASS | independent tables | `tableRepeat_multipleTables` |
| Nested `sc-if` | PASS | per-row branch | `tableRepeat_nestedIf` |
| Nested `sc-for` | PASS | repeated cells + repeated `<th>` | `tableRepeat_nestedFor` |
| Non-table repeaters | PASS | div/li/option/button/empty/siblings | `nonTableRepeat_unchanged` |
| Admin Users | PASS | API 6 → 6 bound rows, 0 blank | `adminUsers_apiCountMatchesRenderedRows` |
| Student table | PASS | API 2 → 2 bound rows, 0 blank, 0 unresolved bindings (previously BLOCKED) | `studentTable_populatedRowsBound` |
| Teacher table | PASS | API 2 → 2 bound rows, 0 blank, 0 unresolved bindings (previously BLOCKED) | `teacherTable_populatedRowsBound` |
| Browse table | PASS | 3 repeated `<th>`, 12 repeated `<tr>`, 2 nested `<td>`/row, correct owner per cell (previously BLOCKED) | `browseComparison_populatedNestedTable` |
| Semantic table accessibility | PASS | tbody/tr/th-scope/caption, 0 inert templates | `tableRepeat_semanticStructure` |
| CI regression gate | PASS | fails on all 15 old sites, passes now | `check-dc-table-repeaters.mjs` |
| Admin settings localization gate | PASS | updated to canonical behaviour; fails on old shape and on de-localized text | `check-sprint3-localization.mjs` |
| Frontend regression | PASS | 22 pass / 0 fail | `scripts/ci/check-*.mjs` |
| Format | PASS | exit 0 | `dotnet format --verify-no-changes` |
| Release build | PASS | exit 0 | `dotnet build -c Release` |

## Pass Closure Verdict

**PASS 01 / 13 — CLOSED.**

> Tafseel's DC runtime can safely render repeated semantic table rows from canonical collections,
> with correct bindings, events and rerenders, without breaking existing non-table repeaters, and the
> previously broken real tables are protected by regression tests.

Every clause of that statement is evidenced above. The mechanism is repaired once at the runtime
level, the 15 unsafe directives are migrated, the defect is protected by a CI gate and an 18-check
runtime suite that provably fail against the old behaviour, and all four previously broken product
surfaces render correct, fully bound rows from real populated Development data. The full canonical
frontend gate set is green (22/22), format and Release build are clean, and no backend source or
database schema changed.

The three surfaces reported BLOCKED in the first issue of this report are now PASS; the historical
blocked state and how it was closed are recorded under *Development Data Provenance*.
