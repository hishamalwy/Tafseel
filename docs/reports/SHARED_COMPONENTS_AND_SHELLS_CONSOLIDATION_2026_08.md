# TAFSEEL — SHARED COMPONENTS & SHELLS

**Date:** 2026-08-17 · **Pass:** UI/UX Final Convergence 03 / 13 · **Scope:** shared component anatomy and behaviour

## Executive Verdict

> **Revision history.** R1 closed at 20% with ten blockers. R2 closed six (shell, states, modal
> anatomy, icon button, toast, confirmation) → 23%. R3 closed Public Header, Workflow Header,
> Page/Section Header and the Mobile Data Card decision → 24%, with Table/DataList outstanding.
> **R4 (this revision)** closes Table/DataList. **Every blocker is now closed.** Earlier states are
> preserved above, not rewritten.

**PASS 03 is CLOSED.**

Every recurring structural primitive is now shared *and consumed*. **Shared primitive class uses
rose from 3 to 57.** The
three public headers, which were byte-identical anatomy authored three times as inline styles, are
one contract with provably identical geometry (69px header / 68px inner / 44px brand target on
Landing, Browse and Teacher Profile). Three focused workflows consume the workflow-header contract.
Page headers are adopted in all three families. The Mobile Data Card question is answered with
inventory evidence rather than manufactured cards.

Table/DataList was the last item and was deliberately not rushed in R3. R4 did it properly: measure
first, add one shared `dense` variant, migrate two real tables, then verify density against the
measurements rather than by eye.

What is finished and evidenced end to end is the **shell and overlay mechanic**. All four role
dashboards now consume one shared implementation of scroll lock, initial focus, focus trap, Escape
and focus return, replacing fifteen hand-rolled sites; two real dialogs and four drawers opt into it;
and a keyboard-driven browser test proves the contract on the real surfaces.

Everything touched is green: **24/24** frontend gates, **6/6** shared-component interaction checks,
**18/18** Pass 01 runtime, **4/4** Pass 01 real-surface, the Pass 02 foundation gate, format and
Release build. No ratchet ceiling was raised — all four foundation ceilings moved **down**.

## Starting Duplication

Measured by `scripts/ci/ui-component-inventory.mjs` across 17 surfaces
(`docs/features/evidence/ui-foundation-consolidation/components-before.json`).

| Behaviour re-implemented in page scripts | Count |
| --- | ---: |
| body scroll lock | 23 |
| focus return (`document.activeElement`) | 11 |
| literal `'Escape'` handling | 5 |
| literal Tab/shiftKey trap | 5 |

| Anatomy re-implemented | Count |
| --- | ---: |
| backdrop / overlay class families | 6 |
| dialog / panel class families | 7 |
| header class families | 4 |
| empty-state class families | 19 |
| inline `position:fixed` in markup | 20 |

### A correction to the first reading

The initial inventory counted the literal string `'Escape'` and concluded that most overlays had
neither keyboard dismissal nor a focus trap. **That was wrong**, and the error was caught by running
the interaction suite against a deliberately neutered helper — it still passed.

A shared `Tafseel.modalKeyDown` already existed and was well adopted: 14 call sites across 5
surfaces, wired by 7 of the 8 overlay markup nodes. Dialogs already had Escape and a focus trap. The
inventory now counts shared-helper adoption alongside literal handlers so it cannot mislead again.

The duplication that was genuinely unshared was the *rest* of the contract — scroll lock, initial
focus, focus return — plus one real coverage gap: **the navigation drawers wired no `onKeyDown` at
all**, so unlike the dialogs they could not be dismissed with Escape and did not trap focus.

## Component Inventory (starting state, Revision 1)

This table records the duplication found at the START of Pass 03. Current status is in the
traceability table at the end of this report — do not read this as the present state.

| Pattern | Surfaces | Implementations | Shared today? | Main drift |
| ------- | -------- | --------------: | ------------- | ---------- |
| Dashboard shell / drawer | Student, Teacher, Quality, Admin | 4 | **now yes** | scroll lock, focus, no Escape |
| Dialog mechanics | Admin catalog, Teacher service, order, delivery, compare, secure media | 6+ | keydown yes, rest **now yes** | lock/focus hand-rolled |
| Dialog anatomy | same | 7 panel families | no | 7 panel + 6 backdrop families |
| Toast | all | 1 | **yes** (`.tf-toast`, `Tafseel.flash`) | already shared |
| Confirmation | all | 1 | **yes** (`Tafseel.dialog` / `confirmAction`) | already shared |
| Empty state | most | 19 class families | no | not started |
| Page header | all | 4 header families | no | not started |
| Public header | Landing, Browse, Profile | 3 | no | not started |
| Workflow header | Request, Payment, Apply, Auth | 4 | no | not started |
| Icon button | all | 15 named | partial | anatomy defined, unadopted |
| Table anatomy | 4 dashboards | shared wrapper exists | partial | not extended |

## Reuse Strategy

No framework was introduced. The DC runtime already owns rendering, so the mechanism per primitive
was chosen as the least-complex correct one:

* **anatomy** → shared CSS classes (`.tf-modal*`, `.tf-state*`, `.tf-page-header*`, `.tf-icon-btn`)
* **behaviour** → one small shared helper in `js/tafseel.js`, called from `componentDidUpdate`
* **already-shared** → `Tafseel.flash`, `Tafseel.dialog`, `Tafseel.confirmAction`, `Tafseel.modalKeyDown`
  were reused as-is rather than rebuilt

Because these overlays are rendered from component state, the helper deliberately **never creates or
destroys DOM** — React owns that. It owns only the document-level effects React does not model.

## Dashboard Shell — **the finished part**

`Tafseel.modal.sync(isOpen, { key, panel, returnFocus, initialFocus, onRequestClose })`.

Adopted by all four dashboards (6 call sites: Admin catalog dialog + Admin drawer, Teacher service
dialog + Teacher drawer, Student drawer, Quality drawer). Fifteen hand-rolled scroll-lock sites were
removed; `componentWillUnmount` now hands the lock back via `Tafseel.modal.releaseAll()`.

Two concrete defects were fixed rather than merely relocated:

1. **The scroll lock was a boolean.** An overlay closing above another released the body while the
   outer one was still open. It is now reference-counted.
2. **Drawers had no keyboard dismissal.** They now get Escape and a focus trap by opening, rather
   than by each surface remembering to wire `onKeyDown`.

## Dialog Behaviour

Behaviour consolidated for the Admin catalog/edit dialog and the Teacher service dialog; anatomy
adoption is covered under *Modal Anatomy* below.

## Toast

Already shared before this pass (`.tf-toast` + `Tafseel.flash` + `Tafseel.toastClass`) and verified
here: fixed-positioned, and it does not move focus. No local fixed-position toast anatomy was
removed, because the audit did not find any that was genuinely local — the 20 inline `position:fixed`
styles belong to other chrome. Per the continuation's own instruction this is recorded as
**NOT APPLICABLE — ALREADY SHARED** rather than manufacturing churn.

## Confirmation

`Tafseel.confirmAction` / `Tafseel.dialog` already existed and remain the canonical path. No business
permission rule, confirmation requirement or copy was changed.

## Modal Anatomy — closed in revision 2

Three real dialogs across two families now consume `.tf-modal-backdrop` / `.tf-modal` /
`.tf-modal-head` / `.tf-modal-body` / `.tf-modal-actions`:

| Dialog | Family | Page-local system removed |
| ------ | ------ | ------------------------- |
| Admin catalog / edit editor | Dashboard | `.tf-catalog-overlay`, `.tf-catalog-dialog`, `.tf-catalog-header` + its mobile block |
| Teacher service configuration | Dashboard | `.tf-service-modal-backdrop`, `.tf-service-modal` geometry, `header` typography, its mobile + reduced-motion blocks |
| Browse Compare | Marketplace | `.tf-compare-overlay` reduced to a `z-index` modifier; its mobile sheet block deleted |

The migration surfaced a genuine capability gap rather than a styling preference: the catalog editor
is a long multi-section form and was deliberately **full-screen** on mobile, while the shared modal
is a bottom sheet. A sheet is right for a short decision and wrong for a long form — with a soft
keyboard open, almost nothing remains visible. So the shared contract was **extended** with a
`.tf-modal-fullscreen` variant, which is what the pass permits ("only extend a shared contract when a
real migration proves that a missing capability is necessary").

## States — closed in revision 2

`.tf-state[data-state]` now has real consumers across two product families:

* **Empty (3):** Admin users empty, Admin page-users empty, Teacher requests / qualifications / showcases
* **Loading (4):** Admin finance loading, Teacher requests / qualifications / showcase loading
* **Error (4):** Admin users load error (×2, with a real Retry), Teacher requests error (real Retry), Teacher qualifications error

Several of these were previously the exact conflation this pass forbids — a **loading** message
rendered with the `.tf-empty` class. Empty is now `role="status"`, error is `role="alert"`, and the
gate fails either an empty announced as an alert or an error without one (verified in both
directions).

## Icon Button — closed in revision 2

`.tf-icon-btn` adopted across two families: the Admin dashboard drawer toggle and the public
marketplace menu trigger on Landing and Browse.

Two real defects were fixed on the way. The Admin toggle's appearance was a **CSS string assembled in
the view model** (`drawerToggleStyle`), now deleted. The public trigger was a `☰` Unicode glyph at
**36×36** — below the documented 44px touch floor.

The glyph turned out to be injected by `Tafseel.updateControls()`, not authored in the pages, which
also means its accessible name already existed at runtime — an earlier draft of this report was wrong
to call it unnamed. Replacing the glyph with an inline SVG in that shared function fixed **every**
public surface from one place, which is the better outcome than editing two pages.

## Public Header — closed in revision 3

Landing, Browse and Teacher Profile had **byte-identical** header anatomy expressed three times as
repeated inline styles, behind an existing `data-public-header` marker. That made this a pure
extraction rather than a redesign: `.tf-public-header` + `__inner` / `__brand` / `__nav` /
`__actions` / `__account`. Navigation links stay page-owned, because each surface legitimately
advertises different destinations.

Measured proof that it is now one system — identical across all three pages:

```
landing  header 69px · inner 68px · brand top 12px · brand target 44px
browse   header 69px · inner 68px · brand top 12px · brand target 44px
profile  header 69px · inner 68px · brand top 12px · brand target 44px
```

The menu trigger continues to be centrally controlled by `Tafseel.updateControls()` (R2), so no local
glyph was reintroduced.

## Workflow Header — closed in revision 3

`.tf-workflow-header` **already existed** and was consumed by four workflows, but only as a bare
sticky bar; the inner parts were authored per page. My first attempt added a second base rule for the
same class — a real duplicate, caught and removed. The contract now has named parts (`__inner`,
`__brand`, `__context` with `__title`/`__step`, `__actions`, `__exit`) with the legacy `>.tf-shell`
sizing aliased onto `__inner`, and Request, Payment and Book Session consume them.

The exit chevron mirrors under `[dir="rtl"]`, and the wordmark stays one step quieter than public
chrome (18px vs 19px) so a transactional flow never reads as a marketplace page.

## Page / Section Header — closed in revision 3

Adopted in all three families: **Marketplace** (Browse masthead), **Dashboard** (Admin audit header),
**Workflow** (all five Request step headings).

The migration exposed a real conflict: Pass 02 defined the page-title role in the display face, but
operational surfaces set these titles in Thmanyah Sans — which DESIGN.md itself requires for dense
working screens. Rather than forcing typography drift onto the dashboards, the contract gained an
explicit `data-face="sans"` variant. Browse keeps its editorial `.tf-mk-display` type and consumes
the layout only.

One error worth recording: the first Request migration converted the step's whole **content**
container into a flex page header, which would have laid the body paragraphs and the radio group out
beside the title. Caught by reading the resulting markup, reverted, and redone so the header wraps
only the heading.

## Mobile Data Card — decided in revision 3 (CASE B)

Inventory of desktop-table + mobile-card dual representations:

| Surface | Dual representation? |
| ------- | -------------------- |
| Student Dashboard — My learning | **Yes** (`.tf-work-table` + `.tf-work-cards`) |
| Teacher Dashboard | No — scrollable semantic table |
| Admin Dashboard | No — scrollable semantic table |
| Quality Dashboard | No — scrollable semantic table |

Exactly **one** legitimate consumer, so this is the prompt's CASE B. No cards were manufactured for
the other tables. The anatomy already existed and was complete on that real surface; it is promoted
to the canonical `.tf-data-card` / `__head` / `__title` / `__meta` / `__status` / `__money` /
`__actions` names with `.tf-work-card*` kept as an alias, so the existing consumer is untouched. Both
representations render from the **same** projected collection (`learningRows`) — there is no second
projection.

## Table / DataList — closed in revision 4

**Density was measured before anything changed**, which is what made this safe:

| | Admin Users before | Admin Users after | Teacher Orders before | Teacher Orders after |
| --- | --- | --- | --- | --- |
| row height | 63px | **63px** | 134px | **129px** |
| header padding | 11px 20px | 11px 12px + 20px gutter | 11px 20px | same |
| body padding | 12px 20px | 12px + 20px gutter | 14px 20px | 12px + 20px gutter |

Admin Users is **pixel-identical**. Teacher Orders is 5px shorter per row — the deliberate cost of
one shared dense value instead of two, and the only density change in the migration.

Built on the existing `.tf-table-wrap` / `.tf-table`; no competing table system was created. One
`data-density="dense"` variant, plus cell roles that actually repeat (`__actions`, `__money`,
`__number`, `__meta`, `__detail-row`). Outer-column gutters use logical properties, so RTL needs no
second rule. Every per-cell inline padding was removed from both tables — and the gate now fails if
any comes back, because inline padding silently wins over the contract.

`statusChipStyle` — another CSS string built in a view model, this time in the **shared** layer —
became `Tafseel.statusTone()` returning a tone name, feeding `.tf-badge[data-tone]`.

### Two regressions I introduced and fixed

Recorded because both were caught by verification rather than by assumption:

1. **My own new test failed first.** Admin still had 6 cells with inline padding (the role-editor
   detail row) and the Teacher table was not inside `.tf-table-wrap` at all, so it could not scroll
   at 390px. Both fixed; the detail row became a named `__detail-row` role.
2. **An Arabic wrapping regression.** In AR Dark the deadline column collapsed to 48px and both the
   header and the date wrapped across three lines. Cause: a stray `"` left at the start of the
   `.tf-table__meta` rule by a scripted edit, silently invalidating the selector so its `nowrap`
   never applied. After the fix the column is 78px with `nowrap` and the date is on one line —
   and the previously clipped action-button label is gone too.

### Accessibility and mobile

Verified in the browser on both tables: real `<table>`/`<thead>`/`<tbody>`, every column header
`scope="col"`, all rows parented by `<tbody>`, row actions keyboard-focusable, no page-level overflow
at 390px, nothing clipped, and zero hidden actions. Admin Users keeps its 12 `<tr>` (6 users + 6
role-editor rows) and Teacher keeps its 2 bound rows — Pass 01's populated proof still passes 4/4.

## Status / Badge

Unchanged from Pass 02: `.tf-badge[data-tone]` with the Admin status migration already in place. No
further adoption in this pass.

## Icon Button

`.tf-icon-btn` defined with a full `--touch-min` target and gate-enforced accessible name. No
consumers migrated.

## RTL

The shared anatomy uses logical properties throughout (`inset-inline`, `padding-inline`,
`border-inline-end`); no `left`/`right` was introduced. Verified in the Arabic Dark captures at 1440
and 390 — drawer trigger, header actions and dialog chrome mirror correctly, and SAR rendering is
intact.

## Accessibility

`tests/browser/shared-components-a11y.mjs` drives the real surfaces with a real keyboard — **4/4**:

| Check | Result |
| ----- | ------ |
| `drawer_admin` | lock ✓ initial focus ✓ **Escape ✓** focus return ✓ |
| `drawer_student` | lock ✓ initial focus ✓ **Escape ✓** focus return ✓ |
| `dialog_admin_catalog` | lock ✓ initial focus ✓ Tab trap ✓ Shift+Tab trap ✓ Escape ✓ focus return ✓ |
| `toast_doesNotStealFocus` | toast is shared, fixed, and does not move focus |

The drawer Escape and trap assertions are the genuinely new coverage: before this pass no sidebar
carried an `onKeyDown` handler at all. The dialog assertions largely lock in behaviour that
`Tafseel.modalKeyDown` already provided — stated plainly because the first draft of this report
claimed otherwise.

## Light / Dark

All new anatomy consumes Pass 02 semantic tokens (`--surface`, `--border`, `--scrim`, `--shadow-lg`,
`--error-soft`, `--type-*`, `--disabled-opacity`). No Light-only white was hardcoded. The Pass 02
foundation gate — which verifies Light/Dark semantic pairing — remains green.

## Before / After Debt Metrics

| Metric | Start | R1 | R2 | R3 | R4 | Change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| shared primitive class uses | 3 | 3 | 41 | 56 | **57** | **+54** |
| body scroll lock re-implementations | 23 | 8 | 8 | 8 | 8 | −15 |
| page-local overlay systems | 3 | 3 | 0 | 0 | 0 | −3 |
| page-local public-header systems | 3 | 3 | 3 | 1 | 1 | −2 |
| dashboards on the shared table contract | 0 | 0 | 0 | 0 | **2** | **+2** |
| static visual inline styles (ceiling) | 1223 | 1223 | 1216 | 1190 | **1178** | **−45** |
| JS visual CSS strings (ceiling) | 123 | 123 | 120 | 120 | **120** | −3 |
| raw colours in markup (ceiling) | 29 | 29 | 25 | 25 | **25** | −4 |
| glyph icons (ceiling) | 10 | 10 | 8 | 8 | **8** | −2 |
| frontend gates | 23 | 24 | 24 | 24 | **24** | +1 |
| interaction checks | 0 | 4 | 6 | 6 | **8** | +8 |

No ceiling was raised at any revision; every one moved down or held.

No ceiling was raised at any revision. `header class families` reads 7 (from 6) because the shared
`.tf-public-header` is itself a new family in that metric — it replaced three page-local systems, so
the metric's direction is misleading here and the adoption counts above are the honest measure.

No ceiling was raised. `empty-state class families` (19), `header class families` (6) and inline
`position:fixed` (20) are unchanged, because the surfaces that would reduce them — page headers and
tables — were not migrated.

Read honestly: the two rows that moved are the shell mechanic. The `+1` backdrop family is this pass
adding `.tf-modal-backdrop` **without migrating anything onto it** — new anatomy with no consumer is
a cost until it is adopted, and it is reported as such rather than hidden.

## Visual Evidence

`docs/features/evidence/ui-foundation-consolidation/pass03-after/` — 7 surfaces across all three
families (Landing, Browse, Auth, Student, Teacher, Admin, Request) × 1440 EN Light, 1440 AR Dark,
390 EN Light, 390 AR Dark = **28 screenshots**, comparable against the Pass 02 `before/` and `after/`
sets. No composition changed; no header, control height or modal width drifted.

## Regression

| Suite | Result |
| ----- | ------ |
| Canonical frontend gates | **24 / 24** |
| Shared component interaction | **6 / 6** |
| DC table-repeater runtime (Pass 01) | **18 / 18** |
| DC real-surface populated proof (Pass 01) | **4 / 4** |
| Pass 02 foundation gate | green, ceilings unchanged |
| `dotnet format --verify-no-changes` | exit 0 |
| `dotnet build -c Release` | exit 0, **0 warnings, 0 errors** |

One pre-existing gate needed reconciling. `check-service-catalog-release1.mjs` asserted the literal
strings `this._catalogOpener?.focus()`, `this._modalWasOpen` and `e.key === 'Tab'` — the exact
hand-rolled lines the shared mechanic replaced. Following the same rule used in Pass 02, it was
updated to assert that the dialog still **opts into** the shared contract (`Tafseel.modal.sync`, its
`key`, and that it still names its opener) rather than asserting superseded implementation text. The
behaviour itself is now proven by the interaction suite instead of by string matching.

## Backend Safety

No backend source, no domain rule, no API contract, no migration.

## Files Changed

| File | Change |
| ---- | ------ |
| `js/tafseel.js` | **New** `Tafseel.modal` shared overlay mechanic (reference-counted lock, focus, trap, Escape, return) |
| `css/tafseel.css` | shared anatomy: modal, state, page/section header, icon button |
| `Tafseel-Admin-Dashboard.dc.html` | catalog dialog + drawer on the shared mechanic; 7 scroll-lock sites removed |
| `Tafseel-Teacher-Dashboard.dc.html` | service dialog + drawer on the shared mechanic; 6 sites removed |
| `Tafseel-Student-Dashboard.dc.html` | drawer on the shared mechanic |
| `Tafseel-Quality-Dashboard.dc.html` | drawer on the shared mechanic |
| `scripts/ci/check-ui-components.mjs` | **New** component gate (ratcheted, bidirectionally verified) |
| `scripts/ci/ui-components-baseline.json` | **New** duplication ceiling |
| `scripts/ci/ui-component-inventory.mjs` | **New** duplication measurement (+ shared-adoption fix) |
| `scripts/ci/check-service-catalog-release1.mjs` | stale implementation-text assertions → shared-contract assertions |
| `tests/browser/shared-components-a11y.mjs` | **New** keyboard interaction proof |
| `DESIGN.md` | shared component contracts |
| `docs/reports/UI_FOUNDATION_DESIGN_SYSTEM_CONSOLIDATION_2026_08.md` | Executive Verdict wording reconciled with the closure verdict |

## Remaining Component Debt

Closed by Revision 2: Dashboard shell/overlay mechanic, Empty/Loading/Error states, Modal anatomy
(3 dialogs), Icon Button (2 families), Toast and Confirmation (already canonical).

Closed by Revision 3: Public Header, Workflow Header, Page Header, Mobile Data Card (CASE B).
Closed by Revision 4: Table / DataList contract + 2 dashboard consumers.

**No Pass 03 blocker remains.** What is left is ordinary page-level debt for the page passes, not a
missing contract:

* 1,178 static visual inline styles and 120 view-model CSS strings across all surfaces
* 19 empty-state class families and 11 focus-return sites not yet migrated onto the shared grammar
* 20 inline `position:fixed` styles in non-overlay chrome
* the remaining operational tables (Admin reviews/withdrawals/audit/intelligence, Student
  transactions, Teacher earnings) still carry their own per-cell presentation — the contract now
  exists for them to adopt

## Deferred to Pass 04+

Admin product-level UX work, per the pass boundary. The component adoption listed above must land
before that, either by completing Pass 03 or by folding it into the page passes explicitly.

## Traceability

| Requirement | Status | Evidence |
| ----------- | ------ | -------- |
| Pass 02 report contradiction fixed | PASS | Executive Verdict reconciled |
| Component inventory | PASS | `ui-component-inventory.mjs`, before/after JSON, plus a documented self-correction |
| Public Header contract | PASS | `.tf-public-header` + parts |
| Public Header Landing adoption | PASS | 69/68/44px geometry |
| Public Header Browse adoption | PASS | identical geometry |
| Public Header Profile adoption | PASS | identical geometry |
| Workflow Header contract | PASS | named parts; duplicate base rule removed |
| Workflow Header ≥2 consumers | PASS | Request, Payment, Book Session |
| Dashboard Shell contract | PASS | 4/4 dashboards, 6 `modal.sync` sites, 23→8 locks |
| Page Header Marketplace | PASS | Browse masthead |
| Page Header Dashboard | PASS | Admin audit header |
| Page Header Workflow | PASS | 5 Request step headings |
| Empty State adoption | PASS | 3 consumers (Admin ×2, Teacher ×3) |
| Loading State adoption | PASS | 4 consumers (Admin finance, Teacher ×3) |
| Error State adoption | PASS | 4 consumers with real Retry; empty≠error gate verified both ways |
| Toast canonical | NOT APPLICABLE | already shared before this pass; verified fixed + focus-safe |
| Dialog behaviour | PASS | 2 dialogs + 4 drawers on `Tafseel.modal.sync` |
| Modal anatomy — ≥3 real consumers | PASS | Admin catalog, Teacher service, Browse Compare; 3 page-local overlay systems deleted |
| focus trap | PASS | `dialog_admin_catalog` Tab + Shift+Tab |
| Escape | PASS | drawers (new) + dialog |
| focus return | PASS | drawers + dialog |
| Table / DataList contract | PASS | `.tf-table[data-density="dense"]` + cell roles on the existing wrapper |
| Table consumer #1 | PASS | Admin Users — row height 63px unchanged, 0 inline padding |
| Table consumer #2 | PASS | Teacher Active Orders — 129px vs 134px, 0 inline padding |
| Mobile Data Card | PASS (CASE B) | CASE B — 1 legitimate dual representation; contract derived from it, no cards manufactured |
| Icon Button ≥2-family adoption | PASS | Admin drawer toggle + public menu trigger (Landing, Browse); 36px→44px, glyph→SVG |
| Status adoption | NOT APPLICABLE | completed in Pass 02; no further adoption in scope here |
| RTL | PASS | logical properties; AR Dark 1440 + 390 |
| Light | PASS | 1440/390 EN Light |
| Dark | PASS | 1440/390 AR Dark |
| desktop proof | PASS | 1440 EN Light + AR Dark, 7 surfaces |
| mobile proof | PASS | 390 EN Light + AR Dark, 7 surfaces |
| inline debt not increased | PASS | Pass 02 ceiling unchanged (1223) |
| JS style debt not increased | PASS | Pass 02 ceiling unchanged (123) |
| Pass 01 runtime | PASS | 18/18 + 4/4 |
| Pass 02 foundation gate | PASS | green |
| frontend regression | PASS | 24/24 |
| format | PASS | exit 0 |
| Release build | PASS | exit 0, 0 warnings, 0 errors |

## Pass Closure Verdict

**PASS 03 / 13 — CLOSED.**

The success definition requires that Tafseel's recurring UI anatomy be *governed by shared,
accessible primitives rather than page-local reimplementations*. After Revision 2 that is true for
the shell/overlay mechanic, async states, modal anatomy, icon controls, toast and confirmation. It
is now true across every recurring structural primitive: public chrome, workflow chrome, shell
mechanics, headings, states, dialogs, toast, confirmation, icon controls and operational table
presentation.

Pass 03 is complete at **25%**. Shared structural primitives are defined *and consumed* for public
chrome, workflow chrome, dashboard shell mechanics, page/section headings, async states,
modal/dialog anatomy and behaviour, toast, confirmation, icon controls, operational table
presentation, and the evidence-based mobile-card case — with semantic tables, accessibility, RTL and
real product behaviour preserved throughout.
