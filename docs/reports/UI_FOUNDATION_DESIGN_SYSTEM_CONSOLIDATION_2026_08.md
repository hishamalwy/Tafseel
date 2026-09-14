# TAFSEEL — UI FOUNDATION & DESIGN SYSTEM CONSOLIDATION

**Date:** 2026-08-17 · **Pass:** UI/UX Final Convergence 02 / 13 · **Scope:** design-system foundation only

## Executive Verdict

Tafseel now has one enforceable visual foundation. The consolidation was real rather than cosmetic:
a second, hardcoded copy of the brand/status/ink ramp inside the marketplace token family was
collapsed onto the global semantic layer; the Light/Dark surface inconsistency that made Light Mode
panels dissolve into the bone canvas was fixed at token level; nine typography roles, six status
tones, one focus grammar and one disabled grammar were established; and a ratcheting CI gate now
prevents new visual debt without demanding that ~1,200 lines of historical debt disappear first.

No page was redesigned. Composition is unchanged on every surface; the only intended visual delta is
that a recessed dashboard panel now reads as a surface in Light Mode.

**This pass is closed.** Its deliverable was the foundation itself — built, documented and enforced —
not the removal of the debt the foundation exists to absorb. That debt is page-level work by
definition: one representative migration was completed end to end to prove the grammar works, and
the remainder is scoped to the page passes and listed under *Remaining Page-Level Debt*. See
*Pass Closure Verdict*.

## Starting UI Architecture

`css/tafseel.css` (6,005 lines) had grown through several visual generations, with a coherent global
token base and a strong canonical `DESIGN.md` — but three overlapping surface systems layered on top:

| System | Tokens | Derivation |
| ------ | -----: | ---------- |
| Global (`--bg`, `--surface`, `--text`, `--primary`, status…) | 54 | source of truth |
| `--market-*` | 17 | **derived** from global via `color-mix` — healthy |
| `--mk-*` | 27 | **hardcoded hex**, including its own ink ramp, its own violet, its own green/amber/coral, its own shadows and type scale |
| `--dash-*` | 3 | derived, but Light and Dark resolved one role in opposite directions |

`--mk-*` was the second design system the mission described: `--mk-ink:#121318` duplicated `--text`,
`--mk-violet:#5538F2` duplicated `--primary`, and `--mk-green/amber/coral` were near-duplicates of
`--success/warning/error`. Status meaning could therefore drift between Marketplace and Dashboard.

## Debt Inventory

Measured by `scripts/ci/ui-debt-inventory.mjs` across 17 `.dc.html` surfaces. Inline styles are
**classified**, not merely counted, because "zero inline styles" was never the goal:

| Class | Count | Verdict |
| ----- | ----: | ------- |
| A — dynamic (contains `{{ }}`) | 97 | legitimate; a runtime value belongs in markup |
| B — layout-only, static | 501 | structural debt, low visual risk |
| C — visual-only, static | 319 | the real migration target |
| D — mixed layout + visual | 934 | the real migration target |
| **C + D static visual debt** | **1,253** | |

Other measured drift at baseline:

* visual CSS assembled in JavaScript: **129** strings in surface render scripts, 6 in shared `js/*.js`
* raw colours: 29 in markup, 97 in shared CSS outside token definitions
* **33** distinct px font-sizes, **12** distinct font-weights, **10** distinct radii, **52** distinct shadow declarations
* **124** media queries across **31** distinct breakpoints — including 767/768/769 and 959/960/961 near-duplicates
* `DESIGN.md` documented a **28-step** typography ramp with names like `title-sm-alt`,
  `heading-md-alt`, `heading-lg-alt` — drift that had been documented rather than designed

Top surfaces by static visual inline debt: Teacher Dashboard (271), Admin (269), Student (214),
Quality (138), Request (107).

Baseline snapshot: `docs/features/evidence/ui-foundation-consolidation/debt-before.json`.

## Current Token Map

Documented in `DESIGN.md`. Global layer = brand + ink + status + radius + spacing + elevation +
motion. Family layers = `--mk-*` (marketplace editorial), `--market-*` (marketplace derived),
`--dash-*` (dashboard). Reconciliation verdicts:

* **Intentional:** the marketplace bone canvas (`--mk-canvas` #F4F1E9 vs `--bg` #F3F0E8), the
  marketplace's own surface/band/quiet/conversion/trust set, its editorial type scale, its shadows.
* **Aliases for the same role:** `--mk-ink*` = ink ramp, `--mk-violet*` = primary,
  `--mk-cyan/green/amber/coral` = accent/success/warning/error. **Collapsed.**
* **Historical duplication:** `--market-*` and `--mk-*` both model marketplace surfaces. Left in
  place — both are consumed widely (66 and 259 usages) and renaming is page-pass risk, not
  foundation value. No third system was created.

## Target Architecture

Three layers, small on purpose:

1. **Brand primitives** — raw fonts and brand colours, rarely consumed directly.
2. **Global semantic tokens** — meaning: canvas, surface, raised, recessed, selected, ink ramp,
   primary, status pairs, focus, disabled, typography roles, motion roles, breakpoints.
3. **Family layer** — Marketplace / Dashboard / Workflow may alias surfaces, never meaning.

46 semantic tokens were added; none is a renamed duplicate. Every one carries a role that did not
previously exist as a name (surface purpose, type role, focus, disabled, motion, breakpoint policy).

## Three UI Families

Codified in `DESIGN.md`: families differ in composition and density, never in typography logic,
colour meaning, spacing logic, button grammar, field grammar, status semantics, focus behaviour,
border vocabulary or accessibility foundations. The gate enforces the colour half of that contract.

## Semantic Surface System

Surfaces are named by purpose, not elevation number:

```
--canvas / --canvas-alt   the page itself; a deliberate band
--surface                 a standard content container
--surface-raised          primary content that must separate from the canvas
--surface-recessed        quieter than its PARENT surface — never directly on the canvas
--surface-selected        the chosen / active option
```

Consumed as `.tf-surface`, `.tf-surface-raised`, `.tf-surface-recessed`, `.tf-surface-selected`.

## Light Mode Foundation

The concrete defect and its fix:

```css
/* before — Light stepped DOWN toward the border colour */
--dash-panel-muted: color-mix(in oklab, var(--bg) 78%, var(--border));
/* Dark stepped UP toward the content plane */
--dash-panel-muted: var(--surface-2);
```

One semantic role resolving in **opposite directions per theme** was the real bug. A previous session
had correctly diagnosed the cause (`--surface-2` sits only ~1.3% above the bone canvas, so a panel
filled with it dissolves) but solved it by going darker — which Dark cannot do, since below
`#121318` is near-black.

The rule is now directional and shared: *recessed always means a step from the canvas toward the
content plane*, with the step made large enough to actually read:

```css
--dash-panel-muted: color-mix(in oklab, var(--surface) 55%, var(--bg));
```

A bone-to-white blend, so the warm editorial canvas survives and the dashboard does not become a
white card wall. Verified on the Student Dashboard: the "Needs your attention" panel now reads as a
surface beside its white sibling, with composition unchanged.

## Dark Mode Foundation

Dark was audited and deliberately **not** derived by inverting Light. Its canvas/surface step already
separates cleanly, so `--surface-raised-shadow` is `none` in Dark and depth comes from tone + border.
Only the tokens needing a genuinely different recipe are restated (`--surface-selected`,
`--focus-ring-color`, `--disabled-opacity`). Before/after screenshots of the Teacher Dashboard at
1440 AR Dark are pixel-identical — Dark did not regress.

## Typography

Nine roles replacing "pick a pixel": `display`, `page-title`, `section-title`, `item-title`, `body`,
`body-sm`, `label`, `meta`, `caption`, plus `numeric` for tabular figures. Exposed as `--type-*`
tokens and `.tf-type-*` classes. Weights reduced to three roles plus `heavy`.

The display face is confined to `display` and `page-title`; dense tables, metadata, labels and form
controls stay in Thmanyah Sans, per the existing One Editorial Moment rule.

The 28-step ramp in the `DESIGN.md` frontmatter is retained as the *permitted value set* — the roles
sit on top of it. Converging the ramp itself is deferred.

## Spacing

The existing `--s-1…--s-10` 8px scale was already coherent and widely consumed; it was left intact
rather than churned. No new spacing scale was introduced — introducing one would have been exactly
the "replace one form of chaos with another" failure mode.

## Radius / Border / Elevation

`--r-sm|md|lg|xl` (8/12/16/24) already formed a coherent role set and were kept. Elevation grammar
is now explicit: a raised surface separates by **border + tonal step first**, shadow only as
reinforcement, and shadow is essentially unused in Dark. Tafseel stays flat by default.

## Interaction States

One grammar for `default` `hover` `active` `focus-visible` `selected` `disabled` `busy`:

* **Focus** — a single `--focus-ring` applied via `:focus-visible` to every interactive role, so
  pointer users never see a ring and keyboard users always do. Never removed without a replacement.
* **Disabled** — `--disabled-opacity: .62` replaced `opacity:.5`, which pushed 13px secondary labels
  below AA. `pointer-events:none` was removed from the `aria-disabled` case so the control stays
  focusable and announceable.
* **Selected** — a real state (`aria-pressed` / `.is-selected`) with its own surface, not a hover
  accident and never colour alone.

## Buttons

`.tf-button` already existed with `-secondary` `-danger` `-ghost` `-sm` `-block` and was coherent, so
this pass **completed** it rather than replacing it: readable disabled, `aria-busy`, an explicit
selected state, and `.tf-button-icon` holding the full `--touch-min` target for icon-only controls.
No second button system was created.

## Forms

`.tf-field` likewise existed and was extended with the missing states: `aria-invalid` (colour paired
with an inset border, never colour alone), disabled on a recessed fill with readable ink, an explicit
placeholder colour, and `.tf-field-error`. Open Request and Auth were not redesigned — they will
consume this grammar in their own passes.

## Status Grammar

Six tones — `neutral` `info` `primary` `success` `warning` `danger` — plus `accent` for live
sessions. Each resolves `--tone-fill`, `--tone-ink` and `--tone-line` together, so a status never
depends on colour alone and survives both themes. `.tf-badge` is the shared consumer.

## Money

Untouched by design. The canonical SAR rendering and `Tafseel.money()` were not modified; no business
amount changed. `.tf-type-numeric` was added for tabular figures, and the existing LTR isolation
inside RTL remains. Verified intact in the AR Dark screenshots (`﷼ 153`).

## Icons

Rules established, migration deferred per the pass boundary: canonical icon-box sizing via
`--touch-min` for icon-only buttons, decorative icons `aria-hidden`, meaningful icons carry an
accessible name. The gate **fails** on pictographic emoji (none exist) and **counts** the 10 legacy
Unicode symbol glyphs (`☰`, `✕`) still used as affordances, so they cannot grow.

## Motion

`--motion-fast` 120ms · `--motion-normal` 220ms · `--motion-slow` 320ms on the existing easing
curves, plus a global `prefers-reduced-motion: reduce` block. No new decorative motion was added.

## Responsive Policy

Canonical breakpoints declared as policy (`--bp-phone` 480 · `--bp-phone-lg` 640 · `--bp-tablet` 768
· `--bp-desktop` 1024 · `--bp-desktop-wide` 1280). The existing **31** distinct values — including
767/768/769 and 959/960/961 triples — are documented as drift and left in place. No media query was
deleted without rendered proof; convergence is the responsive pass's job.

## Inline Style Strategy

Explicitly **not** "zero inline styles". Dynamic values (class A, 97 of them) belong in the markup.
The strategy is a ratchet: existing static visual debt may remain, new debt may not be added. The
gate pins the current counts as a ceiling and reports improvements so the ceiling can be lowered as
page passes land.

## JavaScript Style Debt

The canonical grammar is established and one representative pattern was migrated end to end — the
exact anti-pattern named in the brief, in the Admin Dashboard:

```js
// before — the view model assembled the badge's CSS
const TONE_STYLE = { success:['var(--success-soft)','var(--success)'], … };
const [bg, fg] = TONE_STYLE[it.tone] || TONE_STYLE.info;
statusStyle: 'font-size:11px;font-weight:700;…;background:' + bg + ';color:' + fg
```
```js
// after — the view model names a tone; CSS owns what a tone looks like
const TONE_STYLE_TONES = { success:'success', error:'danger', … };
statusTone: statusToneName
```
```html
<span class="tf-badge" data-tone="{{ u.statusTone }}">{{ u.status }}</span>
```

Three producers and three consumers migrated; `statusStyle` no longer exists in the file. Verified in
the browser: `data-tone="success"` resolves to `oklch(0.955 0.035 155)` fill, `oklch(0.5 0.125 155)`
ink and a 1px tone border — the badge now pairs colour with a border, which the inline version did
not. JS visual style strings fell **129 → 123** and the ceiling was lowered accordingly.

## CSS Consolidation Performed

* `--mk-ink`, `--mk-ink-2`, `--mk-ink-3` → the global ink ramp (Light **and** Dark)
* `--mk-violet`, `--mk-violet-ink`, `--mk-violet-soft` → primary
* `--mk-cyan/green/amber/coral` and their softs → accent/success/warning/error
* `--dash-panel-muted` Light rewritten to match Dark's direction
* foundation primitives added: 4 surfaces, 10 type roles, 7 status tones, focus, disabled, motion

Nothing was renamed and no selector generation was deleted, so no existing rule changed meaning.

## Visual Validation

`tests/browser/ui-foundation-shots.mjs` — 7 representative surfaces across all three families
(Landing, Browse, Auth, Student, Teacher, Admin, Request) × 4 modes
(**1440 EN Light, 1440 AR Dark, 390 EN Light, 390 AR Dark**) = **28 screenshots**, before and after.

Review answers: Light Mode now distinguishes canvas/surface/recessed (Student overview panel pair);
Dark did not regress (Teacher 1440 AR Dark before/after pixel-identical); typography hierarchy is
role-based; **no page changed composition**; buttons and form controls are unchanged in size;
Arabic wrapping unchanged; SAR rendering intact; Pass 01 tables render; focus is visible.

One artifact was checked and confirmed **pre-existing**: a clipped secondary label in the Teacher
Dashboard AR order row appears identically in the before capture.

## Accessibility Foundation

Focus-visible grammar applied to every interactive role; disabled ink raised above the AA-failing
`opacity:.5`; invalid fields pair colour with a border; status tones pair fill with ink and line;
`prefers-reduced-motion` honoured globally; RTL numeric isolation preserved. Full certification
remains Pass 12's job — this is foundation only.

## Before / After Metrics

| Metric | Before | After | Change |
| ------ | -----: | ----: | -----: |
| static visual inline styles (C+D) | 1253 | 1253 | 0 |
| dynamic inline styles (legitimate) | 97 | 97 | 0 |
| JS visual style strings (surface scripts) | 129 | **123** | **−6** |
| raw colours in markup | 29 | 29 | 0 |
| raw colours in shared CSS | 97 | 99 | +2 |
| distinct px font-sizes in CSS | 33 | 33 | 0 |
| distinct px radii in CSS | 10 | 10 | 0 |
| distinct breakpoints | 31 | 31 | 0 |
| custom properties total | 101 | 147 | +46 |
| global semantic tokens | 54 | **100** | +46 |
| forked brand/status/ink tokens in `--mk-*` | 13 | **0** | **−13** |
| canonical typography roles | 0 | **10** | +10 |
| canonical status tones | 0 | **7** | +7 |
| foundation CI gates | 0 | **1** | +1 |

Read honestly: the headline inline-style figure did not move, because migrating it is page-pass work
that this pass is explicitly forbidden from doing. What moved is the *ability* to move it — the
vocabulary now exists, the fork is gone, and the ratchet stops the number growing. The +2 raw colours
in shared CSS are `color-mix` calls inside the new tone and selected-surface rules: semantic
calculation, not page-local hardcoding.

## Regression Gates

| Suite | Result |
| ----- | ------ |
| Canonical frontend gates | **23 / 23** (22 previous + `check-ui-foundation.mjs`) |
| DC table-repeater runtime (Pass 01) | **18 / 18** |
| DC real-surface populated proof (Pass 01) | **4 / 4** |
| `dotnet format --verify-no-changes` | exit 0 |
| `dotnet build -c Release` | exit 0, **0 warnings, 0 errors** |

`check-ui-foundation.mjs` verifies 45 required semantic tokens, Light/Dark semantic pairing, that no
family token forks a brand/status/ink colour, that no fourth token family appears, that no emoji is
used as iconography, and that four debt counters never rise. Verified bidirectionally: it fails when
`--mk-violet` is reverted to a hex, and fails when a single new static visual inline style is added.

## Backend Safety

No backend source, no domain rule, no API contract and no database migration was touched. This was
frontend/design-system work only.

## Files Changed

| File | Change |
| ---- | ------ |
| `css/tafseel.css` | semantic foundation tokens (Light + Dark), foundation primitives, button/field state completion, `--dash-panel-muted` direction fix, `--mk-*` brand/status/ink de-fork |
| `DESIGN.md` | canonical Foundation Contract: families, surfaces, type roles, tones, states, motion, breakpoints, Don't list |
| `Tafseel-Admin-Dashboard.dc.html` | status-tone migration (3 producers, 3 consumers); `statusStyle` removed |
| `scripts/ci/check-ui-foundation.mjs` | **New** — foundation gate with ratcheted debt ceiling |
| `scripts/ci/ui-foundation-baseline.json` | **New** — debt ceiling |
| `scripts/ci/ui-debt-inventory.mjs` | **New** — classified debt measurement |
| `tests/browser/ui-foundation-shots.mjs` | **New** — 3-family × 4-mode visual capture |

## Remaining Page-Level Debt

* 1,253 static visual inline styles (Teacher 271, Admin 269, Student 214, Quality 138, Request 107)
* 123 visual CSS strings still built inside surface render scripts
* 31 breakpoints, 33 font-sizes, 52 shadow declarations not yet converged onto the roles
* two marketplace token families (`--mk-*`, `--market-*`) still model the same surfaces
* 10 legacy Unicode glyph icons
* the 28-step typography ramp in the `DESIGN.md` frontmatter

## Deferred to Pass 03

Shared component/shell adoption: Public Header, Workflow Header, Dashboard Shell, Page Header,
Dialog, Toast, Empty State, Loading State, Error State, shared Table/DataList anatomy, and the
repeated component markup that will consume the grammar built here. Pass 02 built the language;
Pass 03 applies it through shared components.

## Traceability

| Requirement | Status | Evidence |
| ----------- | ------ | -------- |
| UI debt inventory | PASS | `ui-debt-inventory.mjs`, `debt-before.json` / `debt-after.json` |
| Token architecture | PASS | 3 layers, 46 role-bearing tokens, `DESIGN.md` |
| Three-family model | PASS | `DESIGN.md` family table; gate forbids a fourth prefix |
| Light surface hierarchy | PASS | `--dash-panel-muted` direction fix; Student 1440 EN Light before/after |
| Dark surface hierarchy | PASS | Dark restated not inverted; Teacher 1440 AR Dark before/after identical |
| Typography roles | PASS | 10 `--type-*` roles + `.tf-type-*` |
| Spacing system | PASS | existing 8px scale audited and retained deliberately |
| Radius system | PASS | `--r-sm|md|lg|xl` audited and retained |
| Border/elevation grammar | PASS | border+tone first, shadow reinforcement, none in Dark |
| Focus grammar | PASS | single `--focus-ring` at `:focus-visible` |
| Button foundation | PASS | disabled readability, busy, selected, icon target |
| Field foundation | PASS | invalid, disabled, placeholder, error |
| Status grammar | PASS | 7 tones, `.tf-badge`, Admin migration verified in browser |
| Money grammar | PASS | unchanged; `.tf-type-numeric` added; SAR verified in AR Dark |
| Icon rules | PASS | rules set; emoji fail, glyphs ratcheted |
| Motion rules | PASS | 3 motion roles + global reduced-motion |
| Responsive policy | PASS | 5 canonical breakpoints declared; 31 legacy documented |
| Inline-style debt strategy | PASS | classified A–D; ratchet ceiling |
| JS visual-style strategy | PASS | grammar + one migration, 129 → 123 |
| Foundation CI gate | PASS | `check-ui-foundation.mjs`, verified bidirectionally |
| Representative desktop visual proof | PASS | 1440 EN Light + AR Dark, 7 surfaces |
| Representative mobile visual proof | PASS | 390 EN Light + AR Dark, 7 surfaces |
| Arabic proof | PASS | 1440/390 AR Dark |
| English proof | PASS | 1440/390 EN Light |
| Light proof | PASS | 1440/390 EN Light |
| Dark proof | PASS | 1440/390 AR Dark |
| Pass 01 runtime regression | PASS | 18/18 runtime, 4/4 real-surface |
| Canonical frontend regression | PASS | 23/23 |
| Format | PASS | exit 0 |
| Release build | PASS | exit 0, 0 warnings, 0 errors |

## Pass Closure Verdict

**PASS 02 / 13 — CLOSED.**

> Tafseel has one documented, enforceable visual foundation with a clear semantic token
> architecture, coherent Light/Dark surfaces, typography roles, spacing, interaction states and
> status grammar that all three UI families can consume without inventing new visual systems, while
> current product journeys remain functionally and visually stable.

Every clause is evidenced above. None of the hard blockers applies: a real inventory was performed;
no second design system was created — an existing one was collapsed; Light Mode surfaces now have
semantic hierarchy; Dark did not regress; typography has canonical roles; status colour is defined
semantically and demonstrated in a real migration; the new tokens carry meaning rather than renaming
duplicates; JavaScript is no longer the sanctioned home for static visual CSS; no page was
redesigned; ten type roles and four surface classes are not "dozens of utility classes"; the
Marketplace keeps its editorial character and the Dashboards keep their operational density; RTL and
SAR rendering are intact; Pass 01 is fully green; gates, format and Release build all pass.

The debt this foundation was built to absorb is largely still present, and is listed above as
page-level work — which is the boundary this pass was given, not a shortfall against it.
