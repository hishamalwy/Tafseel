---
name: Tafseel
description: A calm, evidence-led educational marketplace built around real study needs.
colors:
  primary: "#5036D8"
  primary-hover: "color-mix(in oklab, #5036D8 85%, black)"
  canvas: "#F7F4EC"
  canvas-alt: "#F0EBDE"
  surface: "#FFFFFF"
  ink: "#17151C"
  border: "#E5DED2"
  live: "#116A88"
  success: "oklch(0.50 0.125 155)"
  error: "oklch(0.54 0.175 25)"
  warning: "oklch(0.52 0.135 72)"
  primary-dark: "#A698EB"
  live-dark: "#73AEC1"
  surface-dark: "#1C1E26"
  media-canvas: "#0B0D13"
  media-stage: "#0A0B10"
  media-stage-deep: "#05060A"
  media-stage-black: "#030407"
  scrim: "oklch(0.2 0.02 265 / .42)"
  scrim-strong: "oklch(0.12 0.02 265 / .62)"
  shadow-ink: "rgba(0,0,0,.14)"
  shadow-ink-strong: "rgba(10,12,18,.58)"
  shadow-ink-dialog: "oklch(0.18 0.03 265/.28)"
  border-strong: "#D4CCBE"
  surface-2: "#FAF8F2"
  text-2: "#706B70"
  muted: "#706B70"
  ink-2: "#706B70"
  ink-3: "#706B70"
  primary-soft: "#F0EEFF"
  accent-soft: "#DFE9EE"
  success-soft: "#DFF8E6"
  warning-soft: "#FFEED2"
  error-soft: "#FFEAE7"
  info-soft: "#DFF3FF"
  stage-rating: "#E8B44B"
  stage-qualified: "#CDC3FF"
  stage-saved: "#FF9A90"
typography:
  display:
    fontFamily: "Thmanyah Serif Display, Thmanyah Sans, serif"
    fontSize: "clamp(2.25rem, 5vw, 4.75rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Thmanyah Serif Display, Thmanyah Sans, serif"
    fontSize: "clamp(1.75rem, 3vw, 2.75rem)"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Thmanyah Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Thmanyah Sans, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.35
  currency:
    fontFamily: "saudi_riyal"
    fontSize: "1em"
    fontWeight: 400
    lineHeight: 1
  scale:
    caption: "11px"
    meta: "12px"
    label: "13px"
    body-sm: "14px"
    body: "15px"
    body-lg: "16px"
    lead: "17px"
    subtitle: "18px"
    title-3xs: "19px"
    title-2xs: "20px"
    title-xs: "21px"
    title-sm: "22px"
    title-sm-alt: "23px"
    title: "24px"
    title-lg: "25px"
    heading-xs: "26px"
    heading-sm: "27px"
    heading-sm-alt: "28px"
    heading-md-alt: "29px"
    heading-md: "30px"
    heading-lg-alt: "31px"
    heading-lg: "32px"
    heading-xl: "34px"
    display-2xs: "36px"
    display-xs: "38px"
    display-sm: "40px"
    display-md: "46px"
    display-lg: "52px"
    display-xl: "60px"
rounded:
  xs: "4px"
  sm-tight: "6px"
  sm: "8px"
  sm-loose: "10px"
  md: "12px"
  md-loose: "14px"
  lg: "16px"
  lg-loose: "20px"
  xl: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "0 18px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "0 18px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "48px"
    padding: "0 12px"
---

# Design System: Tafseel

## The Foundation Contract

Everything below the frontmatter is the canonical visual language. A page consumes it; a page does
not extend it locally. If a page needs a visual decision that does not exist here, the answer is to
add it here — not to invent it in an inline style or a CSS string built inside a view model.

These rules were enforced by guards that parsed the legacy `.dc.html` pages; those pages and
their guards are gone, and the rules now live in `css/tafseel.css` and the Angular components.

### The Three UI Families

Tafseel has three product families. They differ in **composition and density**, never in language.

| Family | Surfaces | Character |
| ------ | -------- | --------- |
| **Marketplace** — Landing, Browse, Teacher Profile | `--mk-*` editorial bone canvas | Editorial, spacious, trust-first, lower density |
| **Dashboard** — Student, Teacher, Quality, Admin | `--dash-*` over the global layer | Task-oriented, higher density, strong state hierarchy |
| **Focused Workflow** — Request, Payment, Book Session, Apply, Auth, Disputes | global layer, narrow measure | One progression, minimal distraction |

A family may own its **surfaces**. A family may never own its own meaning of *text*, *primary*,
*success*, *warning* or *error* — those alias the one semantic layer, so a status reads identically
everywhere. The gate fails a family token that hardcodes a brand/status/ink colour.

### Semantic Surfaces

Surfaces are named by **purpose**, never by elevation number.

| Token | Meaning |
| ----- | ------- |
| `--canvas` / `--canvas-alt` | the page itself; a deliberate band |
| `--surface` | a standard content container on the canvas |
| `--surface-raised` | primary content that must separate from the canvas |
| `--surface-recessed` | content quieter than its **parent surface** — never placed directly on the canvas |
| `--surface-selected` | the chosen / active option |

**The Recessed Direction Rule.** "Recessed" always means a step *from the canvas toward the content
plane* — lighter in Light, lighter in Dark. Stepping the other way in one theme only is what made
Light Mode panels dissolve into the bone canvas while Dark read correctly.

**Light** separates by tonal step + border first, shadow only as reinforcement. **Dark** is not
derived by inverting Light: its canvas/surface step already separates, so shadow is essentially
unused there — a dark shadow on a dark canvas reads as mud.

### Typography Roles

A page picks a **role**, never a pixel size. Nine roles, all drawn from the `typography.scale` ramp.

`display` · `page-title` · `section-title` · `item-title` · `body` · `body-sm` · `label` · `meta` ·
`caption` — plus `numeric` for tabular figures.

Consumed as `.tf-type-*` classes or the `--type-*` tokens. The display face is confined to `display`
and `page-title`; dense tables, metadata, labels and form controls stay in Thmanyah Sans. Weights
are three roles (`--weight-regular|medium|strong`, plus `heavy` for section titles), not twelve.

### Status Tones

Six tones: `neutral` `info` `primary` `success` `warning` `danger` (+ `accent` for live sessions).

A view model returns a **tone name**; CSS owns what a tone looks like:

```js
statusTone: 'warning'          // not ['var(--warning-soft)', 'var(--warning)']
```
```html
<span class="tf-badge" data-tone="{{ statusTone }}">{{ status }}</span>
```

Each tone resolves `--tone-fill`, `--tone-ink` and `--tone-line` together, so a status never depends
on colour alone and survives both themes.

### Interaction States

`default` `hover` `active` `focus-visible` `selected` `disabled` `busy`.

Focus is one grammar for every control: `--focus-ring` at `:focus-visible` only, so pointer users
never see a ring and keyboard users always do. It is never removed without a replacement.

Disabled uses `--disabled-opacity` (0.62), not `opacity:.5` — a 13px secondary label at .5 falls
below AA. Selected is a real state (`aria-pressed` / `.is-selected`), never a hover accident.

### Buttons and Fields

Buttons: `.tf-button` with `-secondary` `-danger` `-ghost` `-sm` `-block` `-icon`. Icon-only keeps
the full `--touch-min` target. Fields: `.tf-field` owns label, control, help, error, invalid
(`aria-invalid`), disabled and placeholder in one grammar.

Checkboxes: `.tf-check` (`--start` for a consent that wraps to more than one line). A checkbox and
the words beside it are **one** target, and the words are the part a thumb aims at — so the control
stays 16px, the size it reads at, and the *row* carries `--touch-min`. Auth's "remember me" and
"I agree to the terms" were 22px tall, half the floor, on the two consents in the most-used form in
the product.

### Motion

`--motion-fast` (120ms) · `--motion-normal` (220ms) · `--motion-slow` (320ms), `--ease-out` by
default. `prefers-reduced-motion: reduce` collapses all of it globally.

### Breakpoints

`--bp-phone` 480 · `--bp-phone-lg` 640 · `--bp-tablet` 768 · `--bp-desktop` 1024 ·
`--bp-desktop-wide` 1280. New arbitrary thresholds are debt; the existing 31 distinct values are
documented drift to be converged in the responsive pass.

### Shared Component Contracts

Recurring anatomy is shared; **content and composition stay page-owned**. A family may compose these
differently — the Marketplace header and the Dashboard header are different components — but neither
invents its own scrim, focus behaviour, or state language.

| Component | Anatomy | Notes |
| --------- | ------- | ----- |
| **Modal** | `.tf-modal-backdrop` > `.tf-modal` > `.tf-modal-head` / `.tf-modal-body` / `.tf-modal-actions` | `-sm` / `-lg` widths; becomes a bottom sheet under 600px |
| **State** | `.tf-state[data-state]` > `.tf-state-title` / `.tf-state-body` / `.tf-state-actions` | `empty` \| `loading` \| `error`; `-compact` variant |
| **Page header** | `.tf-page-header` > `.tf-page-header-text` (+ `-eyebrow`, `h1`, `-desc`) + `.tf-page-header-actions` | display face, page-title role |
| **Section header** | `.tf-section-header` > `h2` + actions | section-title role |
| **Icon button** | `.tf-icon-btn` (+ `-quiet`) | full `--touch-min` target; accessible name **required** |
| **Badge** | `.tf-badge[data-tone]` | tone owns fill + ink + line |
| **Toast** | `.tf-toast` via `Tafseel.flash` | shared fixed position; never takes focus |
| **Public header** | `.tf-public-header` > `__inner` > `__brand` / `__nav` / `__actions` / `__account` | Landing, Browse, Teacher Profile — 68px row, identical geometry; the LINKS stay page-owned |
| **Workflow header** | `.tf-workflow-header` > `__inner` > `__brand` / `__context` (`__title`, `__step`) / `__actions` / `__exit` | Request, Payment, Book Session — deliberately quieter; never a marketplace nav bar. `__exit` mirrors in RTL |
| **Mobile data card** | `.tf-data-card` > `__head` / `__title` / `__meta` / `__status` / `__money` / `__actions` (alias `.tf-work-card*`) | only where a desktop table genuinely has a card alternative; both render from the SAME projection |
| **Table / DataList** | `.tf-table-wrap` > `.tf-table[data-density]` > caption, `thead th[scope=col]`, `tbody tr`, cell roles | Admin Users, Teacher Active Orders |

**Overlay behaviour is one mechanic, not per-page code.** `Tafseel.modal.sync(isOpen, {…})` is called
from `componentDidUpdate` and owns the document-level effects the DC runtime does not model:
reference-counted body scroll lock, initial focus, focus trap, Escape, and focus return. React still
owns the DOM; the helper never creates or destroys it.

```js
Tafseel.modal.sync(!!this.state.serviceModal, {
  key: 'teacher-service-dialog',
  panel: '[data-teacher-service-dialog]',
  returnFocus: this._serviceOpener,
  onRequestClose: () => this.closeServiceModal()
});
```

### Table / DataList

Operational tables stay **real semantic tables** — `<table>`, `<thead>`, `<tbody>`, `<th scope>`,
`<caption>` (usually `.tf-sr-only`). Never a div grid: the semantics are the accessibility.

`.tf-table` is the compact listing default. `data-density="dense"` is the **single** operational
density shared by every dashboard — 11px header / 12px body block padding, with a 20px panel gutter
on the outer columns via logical properties so RTL mirrors for free. There is no per-dashboard
density; if a table needs different spacing, that is a signal to question the table, not to add a
third value.

Cell roles exist only where presentation actually repeats — a plain data cell needs no class:

| Role | Purpose |
| ---- | ------- |
| `.tf-table__actions` | end-aligned row actions, wrapping cluster |
| `.tf-table__money` | tabular figures, `nowrap`, `unicode-bidi:isolate` so amounts never re-order inside an RTL run |
| `.tf-table__number` | tabular figures |
| `.tf-table__meta` | dates and identifiers — mono, `nowrap` so a date never breaks mid-token |
| `.tf-table__detail-row` | a full-width expanded row that spans every column and keeps the panel gutter |

A cell that opts into the dense contract must **not** also set inline padding — inline wins over the
class and silently re-forks the density. Previously enforced by a guard over the legacy pages, now a review rule.

States reuse the shared grammar (`.tf-state[data-state]`); status cells use `.tf-badge[data-tone]`,
fed by `Tafseel.statusTone(kind, rawStatus, paymentStatus)` — a tone **name**, never a colour pair.

**Mobile.** The default policy is a horizontally scrollable semantic table inside `.tf-table-wrap`.
Build a `.tf-data-card` alternative only where the product genuinely already has one (today: exactly
one surface, Student "My learning"), and only rendering from the **same** projected collection as the
table. Never invent a card representation to avoid horizontal scroll, and never give the card its own
business projection.

**EMPTY IS NOT ERROR.** They are separate states with separate live-region semantics: an empty result
is `role="status"`, a failure is `role="alert"` and offers Retry only when retrying is real. Never
show "no results" when a request failed. Previously enforced by a guard over the legacy pages, now a review rule.

### Don't

- Don't write a raw page-local status colour — use `data-tone`.
- Don't hand-roll a scroll lock, focus trap, Escape handler or focus return — call `Tafseel.modal.sync`.
- Don't add a new `*-backdrop` / `*-overlay` class family — compose `.tf-modal-backdrop`.
- Don't ship an icon button without an accessible name.
- Don't conflate empty and error states.
- Don't author a new page-local header — compose `.tf-public-header` or `.tf-workflow-header`.
- Don't put marketplace navigation inside a focused workflow's header.
- Don't build a mobile card for a table that is intentionally a scrollable semantic table, and never
  give the card its own business projection.
- Don't build visual CSS inside a business projection — return a tone/variant/state name.
- Don't add a fourth family token prefix.
- Don't use emoji or Unicode glyphs as iconography.
- Don't introduce a new arbitrary radius, breakpoint, or font-size outside the ramp.
- Don't fix specificity debt with more specificity, or with `!important`.

## Overview

**Creative North Star: "The Working Study Desk"**

Tafseel should feel like a well-used, well-organized study desk: warm paper, precise tools, clear annotations, and only the information needed for the next decision. The interface is human and editorial on public discovery surfaces, then calm and operational inside role dashboards. Product truth, qualification, price, availability, and recovery actions always outrank decoration.

The visual system rejects generic AI-SaaS staging: no decorative glow fields, constellation grids, gradient text, floating “smart” badges, fabricated social proof, or walls of interchangeable cards. Personality comes from Tafseel's bilingual typography, warm bone canvas, restrained violet authority color, and specific educational content.

**Key Characteristics:**

- Warm paper canvas with crisp white working surfaces.
- Distinctive bilingual typography with restrained display use.
- One primary action per decision region.
- Evidence and recovery states are visible and plain-spoken.
- Flat by default; elevation appears only for overlays, sticky commerce, or interaction.

## Brand Identity

The identity ships as three colours, one mark, and one pattern. They live in
`css/tafseel.css` as `--brand-violet` / `--brand-lime` / `--brand-ink`, and every
semantic token in the system is derived from them — re-skinning the product is an
edit to that one block, not a search across 7,800 lines.

| Primitive | Value | What it is |
| --- | --- | --- |
| `--brand-violet` | `#5036D8` | The mark's wing. Primary action and selected state. |
| `--brand-lime` | `#DDFA64` | The mark's wing on dark. The one highlight accent. |
| `--brand-ink` | `#020200` | The mark's cup and dots. Brand-surface black. |

**The Mark.** A geometric ت: a wing, a cup, two diamond dots. It is 322 × 438, so
it is taller than it is wide — never declare it square. `assets/brand/` carries the
light cut (violet wing, ink body), the dark cut (lime wing, white body), a
`currentColor` mono cut, the favicon, the isolated wing (fill and stroke) for
watermarks, and the official lockups from the brand kit.

**The Lockup — The Mark Leads.** Arabic and Latin are two cuts of one logotype,
never shown together in chrome. The mark leads the word in both scripts: to the
**right** of it in Arabic, to the **left** of it in English. Chrome ships the
mark first in the DOM, so ordinary flow produces both readings and nothing
reverses. English previously flipped to `row-reverse`, which put the mark after
the word — the lockup then read in opposite orders in the two languages, which
is not a mirror, it is a different lockup. Full Illustrator lockups live in
`tafseel-lockup*.svg` for large brand surfaces; chrome keeps a CSS wordmark so
the name stays selectable and a single language is announced.

**The Pattern.** The same wing, tessellated: an upright copy dropped exactly half
an arm-bar below an inverted one, so each stem lands in the notch of the shape
beside it. The tile is 2W × (H + armBar/2). It is painted through a CSS mask, not
as a background image, so one asset serves violet on bone, lime on ink, and white
on violet.

**The Boot.** First paint covers the unstyled flash with the page's own canvas
(bone in light, dark canvas in dark) and the bilingual lockup: Arabic over the
Latin cut, then the mark. Violet is not a loading field — a full-screen violet
between routes is a shock. `js/boot-prefs.js` holds `data-tf-booting` until
`#dc-root` has mounted. The first visit in a session may wait a few hundred
milliseconds so the lockup is readable; later routes dismiss as soon as the page
has mounted. Reduced motion skips the construction.

**The One Loud Moment Rule.** A page gets at most one surface where the pattern is
allowed to be seen — on the Landing that is the footer crown, on About it is the
hero band. Everywhere else it sits at 5–9% and reads as paper texture. This is
the Rare Violet Rule applied to texture: the pattern identifies a brand surface,
it is not page atmosphere. Two loud pattern fields on one page cancel each other
and the page reads as wallpaper. (The About origin band originally carried both
the tessellation and an oversized wing; it had to lose one.)

**The Ownership Rule — where the pattern is allowed at all.** The pattern marks a
surface *Tafseel* owns and speaks on. It never appears behind a surface the
*user* owns. In practice that is four carriers, each hung off a shared component
so a page inherits the treatment instead of asking for it:

| Carrier | Volume | Hook |
| --- | --- | --- |
| Ink bands | loud | `.tf-ink-band` — Landing footer, auth aside, About hero |
| Empty states | quiet | `.tf-state`, `.tf-mk-empty` — the wing, bottom-anchored |
| Workflow canvas | faint | `.tf-workflow-header ~ main` — the six task flows |
| Public mastheads | faint | `.tf-mkb-mast`, `.tf-market-intro`, `.tf-policy-mast` — the title band |
| Promo panel | loud | `.tf-promo-lead` — the campaign dialog's lead panel |

Never a table, a card carrying user data, a form field, or a dashboard working
region. And never behind `[role="alert"]`: the same component renders both "no
results yet" and "we could not load teachers", and decorating a failure the
reader has to act on undercuts the message. The role attribute already draws that
line, so the stylesheet follows it rather than inventing a second one.

**The canvas yields to a close.** The workflow canvas pattern exists because a
task flow has no footer — it is the brand claiming the dead space at the bottom
of the page. A page that ends with `.tf-mini-footer` already has its close, and
a faint tessellation stacked directly above an ink band carrying the same tile
is two fields of one pattern touching, which is the failure the One Loud Moment
Rule names. So `main:has(~ .tf-mini-footer)` drops the canvas layer rather than
competing with the footer. Policies is the page that made this necessary.

**The pattern has two treatments, and they are not interchangeable.** The kit
ships a solid fill (`--pattern-src`) and a hairline outline
(`--pattern-stroke-src`). The fill carries ink bands and empty states, where it
sits at 5–9% and reads as texture. The outline carries **brand panels** — a lime
hairline field on a violet ground, which is the composition the brand's own key
visual is built from. Because the outline is already mostly negative space it
can run at 30% and still read, which is what lets type sit on top of it.

**The promo dialog is the loudest thing Tafseel says.** It interrupts a visitor,
so it is the one surface allowed a full brand panel rather than a texture. One
panel serves all three campaign kinds — a discount figure, an event date, an
announcement mark — so a campaign changes its content without changing the
dialog's identity. Before this the three had drifted into three different
containers: a bordered bone box, an ink box, and bare display type.

Because the dialog only appears when an eligible campaign is published, it
cannot be reached from a local build with no API. `design-lab/promo-wizard-harness.html`
mirrors its markup exactly against the real stylesheet so the design stays
reviewable; keep the two in step when the dialog's markup changes.

**Watermarks sit whole, below the content, and size in pixels.** Two of those
three were already true. A centred mark lands behind the headline and reads as a
smudge, so it goes *below* the last control; and a percentage-sized mark grows
with its container, so one rule looks right in a tall placeholder and like a slab
in a short one — size it absolutely, in pixels.

The third was wrong. The rule used to be "anchor to the bottom edge and push most
of it past that edge", showing only the wing's top arc. What that produced was
the two arm-tips with the notch between them, **sliced flat by the container** —
a pale blob that read as an open book, or as a rendering fault, overlapping the
button it sat behind. The system's own principle about the pattern (*a hard edge
reads as a rendering bug, a fade reads as intent*) had never been applied to it.

A watermark has to be recognisable as the mark, or it is not a watermark. So the
empty state now carries the **whole mark** — `--mark-src`, the mono cut, masked
like everything else — at 56px, centred, clear of the last control, wholly inside
a reserved band (`--empty-mark-room`, 96px). Nothing is cropped.

**And only the two states that should carry it do.** The watermark is on empty
surfaces the brand may fill. It is off for `[role="alert"]` (a failure the reader
must act on is not decorated), off for `.tf-state-compact` (at that size a mark is
a smudge), and off for `[data-state="loading"]` — a spinner that lives for a
second does not need a brand signature behind it, and reserving 96px under one
would push the layout around on every load. Those three keep their original
padding, so excluding them changes nothing about how they sit.

`design-lab/empty-state-wing-harness.html` renders the treatments side by side
against the real stylesheet; it is how the above was chosen rather than guessed.

**Lime Is A Fill, Not A Colour.** `--brand-lime` has the relative luminance of a
highlighter. It carries `--brand-ink` on top (17.7:1) and it is never text on a
light surface and never a background for white text. Its jobs: the highlighted
word, the live/featured marker, the mark's wing on ink, and interactive colour
inside an ink band, where violet would fall to 2.1:1 and lime holds 17.7:1.

**Announcements.** Admin-published slots are Tafseel speaking, not a product-update
toast. The overlay sits on the bone canvas; the title is display type; the scarce
marker is the lime diamond; ordinary kinds lead with the mark on ink (taller than
wide); the action is violet. Cyan, success, warning and error never paint this
chrome — cyan is live-session information, and status colours are for escrow and
recovery. The landing footer already holds the page's loud pattern moment, so the
overlay carries no tessellation.

**Ink Bands.** `.tf-ink-band` is the brand's black surface. It re-scopes
`--text` / `--text-2` / `--border` / `--surface` / `--primary` rather than restating a
colour on every rule inside it, so one class inverts a whole region and the
component rules underneath stay unchanged. Used by the Landing footer, the auth
aside, the About hero, and `.tf-mini-footer`.

**The Wordmark Ships In Two Cuts.** "تفصيــل" and "Tafseel" are not translations of
each other, they are two halves of one logotype, drawn differently: the Arabic in
the mursala display form, the Latin in a tracked geometric sans. Both cuts ship in
the markup and CSS picks one on `html[lang]`. Do not swap this text at runtime —
`boot-prefs.js` stamps the language before first paint, so the CSS approach paints
the right cut every time, survives JS failing, and `display:none` keeps the unused
cut out of the accessibility tree so the name is never read twice.

**And Both Cuts Are The Same Length.** One logotype means one measure, and the
kit says so outright: in `tafseel-lockup-stacked.svg` the designer draws the
Arabic 975.4 units wide and the Latin 955.0 — a ratio of 0.979 — with the Latin
set to 0.632 of the Arabic's height. Equal length, shorter Latin.

The chrome cuts are tuned to that, from measurement rather than by eye. At one em
the live faces run: Arabic in Thmanyah Serif Display 900 = 3.006em wide; Latin in
Thmanyah Sans 800 at zero tracking = 3.400em. Seven glyphs give six internal
letter-spaces, so the Latin measures `size x (3.400 + 6 x tracking)`, and
`.812em` at `.05em` tracking lands on 3.004em — the Arabic's width to within a
tenth of a per cent. The previous `.92em` at `.085em` came to 3.910em, thirty per
cent longer, so every header, footer crown and mini-footer visibly resized when
the reader changed language. All of them now measure identically in both.

If either face is replaced, re-measure the two per-em widths and solve the same
equation. Do not nudge these constants by eye.

A corollary for anyone styling a lockup: size the **`.tf-wordmark` element**, never
its two cut spans. The cuts size themselves in em off that value, and a flat pixel
size on a descendant selector flattens the ratio and brings the mismatch back.

**Nothing In The Lockup Ever Moves Off Its Line.** The splash wordmark used to
enter on `translateY(12px)`, sliding up into place while the mark — revealed by a
`clip-path`, which does not move — was already sitting still. For the length of
that entrance the word was visibly below the mark it is set against: the reader
met the two halves of the logotype out of level before they met the logotype. The
names now fade in and do not travel. An entrance may change what is visible; it
may not change where the lockup sits.

**The Splash Does Not Measure Itself.** The boot lockup used to match its two
lines with a fourteen-step binary search on the Latin's letter-spacing, run once
at first paint and again on `document.fonts.ready`. Two answers half a second
apart meant the Latin line visibly resized and slid under the Arabic on every
cold load — a flicker staged on the brand's own name, by the very screen that
exists to prevent flicker. The ratio above is stated in CSS instead, so the two
lines come out equal by construction and nothing measures anything. On top of
that, `boot-prefs.js` preloads the two faces the lockup is drawn in, and the
names are held unpainted behind `.has-type` until `document.fonts.ready` (with a
1.2s grace period, so a font failure degrades to "shown late", never to "not
shown"). Geometry CSS can state is not computed in JavaScript.

**Every Public Page Ends With The Brand.** Pages carrying the marketing footer get
the full crown; catalogue pages (Browse, Teacher Profile, Post a Request) and the
policy document (Terms, Privacy and the four operating policies — the most-linked
public pages after the Landing, and the last ones still ending in nothing) get
`.tf-mini-footer` — the same ink, pattern and mark in one 76px row. Before it,
three of the most-visited public pages simply stopped, with no route to About,
Terms or Privacy.

**One Composition, One Component.** Auth and Confirm-Email are the same two-up
split — form column on the canvas, brand panel on ink — and were drawn twice: as
CSS on one page and as inline styles on the other. That is how the two asides
drifted apart, and how one of them ended up declaring the mark square. The split,
the toolbar, the brand lockup and the ink panel are now `.tf-auth-layout` /
`.tf-auth-toolbar` / `.tf-auth-brand` / `.tf-auth-aside`, and both pages measure
identically. The same reasoning collapsed six hand-written workflow breadcrumbs
into `.tf-workflow-header__crumb` and three ad-hoc header rows into
`.tf-workflow-header__inner`.

**The Scrim Is A Token.** `--scrim` and `--scrim-strong` are declared in this
document's frontmatter and were never defined in the stylesheet, so
`.tf-modal-backdrop` ran on an inline fallback and six dialogs across the
dashboards each wrote their own value — three different darknesses for the same
interaction. Likewise `--shadow-sticky-top`, the one shadow that casts upward:
a bar pinned to the bottom of the viewport is the elevation this system allows
for sticky commerce, and three surfaces had each written their own, one of them
a light-mode value left unchanged in dark, where a dark shadow on a dark canvas
is mud. No surface writes a colour any more: `rawColorsInMarkup` is zero across
all eighteen.

Measured, not assumed: white on violet 7.34:1, violet on the ivory canvas 6.68:1,
ink on lime 17.73:1, lime on the dark canvas 15.84:1. Dark mode lifts the brand
violet to L=76% at its own hue (`#A698EB`), which lands at 7.34:1 on the dark
canvas — the same ratio white-on-violet gives in light, so "primary" carries
identical weight in both themes.

## Colors

Violet signals authority and action; neutrals carry most of the interface; cyan is reserved for live-session information.

**The Rare Violet Rule.** Violet identifies the next action or selected state, not page atmosphere.

**The Evidence Contrast Rule.** Secondary text must remain readable at WCAG AA on the exact surface where it appears.

**The Semantic Lightness Rule.** Success, warning, and error are status colors before they are brand colors, so their lightness is decided by contrast, not by taste. Each must clear 4.5:1 as text on white, canvas, canvas-alt, surface-2, and its own soft fill, and must carry white ink when used as a fill. A status colour that reads as a pleasant tint has failed at the only job it has: escrow, refunds, and delivery states are the moments a student most needs to read the sentence. Verify with measurement, never by eye.

## Typography

**Display Font:** Thmanyah Serif Display, with Thmanyah Sans fallback  
**Body Font:** Thmanyah Sans, with system UI fallback  
**Label/Mono Font:** Thmanyah Sans for labels; monospace only for filenames, identifiers, and measurements

Display type gives public pages a recognizably Tafseel voice. Operational screens use it only for page-level headings; body, labels, controls, and data remain stable in Thmanyah Sans.

- **Display:** Public hero only; responsive, bold, maximum 4.75rem.
- **Headline:** Page and section titles with an obvious step above body copy.
- **Body:** 1rem ordinary floor, 1.6 line-height, and a 45–75ch reading measure.
- **Label:** 0.8125rem, strong weight, sentence case unless the content is a true identifier.

**The One Editorial Moment Rule.** A page earns at most one dominant display-type moment.

**The 11px Floor.** Nothing functional ships below 11px. Badge counts, price units, and status pills are not decoration — they carry the number the reader came for. If a label only fits at 10px, the container is too small, not the type.

**The Whole-Pixel Rule.** Every size comes from the enumerated `typography.scale` ramp above, and every step on it is a whole pixel. Half-pixel steps (12.5px, 13.5px) are not a finer scale, they are the absence of one: they read as identical to their neighbours while doubling the number of values the system has to carry. A size that is not on the ramp is either a mistake or a deliberate new step that belongs in this file.

## Layout

Public pages follow a direct reading path: need, discovery action, evidence, then conversion. Dashboards favor predictable navigation and compact working regions. Use the 4/8px spacing family, tight gaps inside a group, and generous 48–64px separation between distinct sections.

At 1024px and above, use multi-column layouts only when the columns support one decision. Below 768px, preserve the same information order in one column. Touch targets are at least 44px; narrow layouts prioritize identity and recovery before media or secondary evidence.

## Elevation & Depth

The system is flat by default. Borders and tonal shifts define ordinary regions. Small shadows respond to interaction; medium shadows identify raised menus; large shadows are restricted to dialogs and sticky commerce surfaces.

**The No Ambient Glow Rule.** Colored radial glows and zero-offset halos never stand in for hierarchy.

## Shapes

Controls use 8–12px corners, content containers 12–16px, and large page-level or modal surfaces up to 24px. Pills are reserved for short statuses, filters, and compact facts. Basic content grouping uses spacing before another rounded rectangle.

## Components

### Buttons

- Primary buttons are violet, at least 44px high, and name a concrete action.
- Secondary buttons use a neutral surface and one border.
- Focus uses a visible outline; hover never carries essential meaning.

### Chips

- Use only for filters, statuses, or short factual metadata.
- Selected state combines color with border, icon, or text—not color alone.

### Cards / Containers

- Use cards for a discrete selectable object or bounded workflow, not ordinary page sections.
- Cards have one border or one shadow, never both at rest.
- Avoid nested cards and uniform icon-heading-copy grids.

### Inputs / Fields

- Inputs are 48px high with persistent labels.
- Focus changes border and adds a visible ring.
- Errors state the problem and the next recovery action near the field.

### Navigation

Desktop navigation is stable and textual. Mobile navigation uses a clear drawer trigger with a 44px target. Active state uses shape or an inset marker in addition to color.

### Teacher Evidence

Qualification, service, availability, real reviews, and moderated samples are evidence. Broken media must not dominate identity or block conversion; show a compact recovery state and keep teacher facts visible first on narrow screens.

## Do's and Don'ts

### Do:

- **Do** lead with the user's next decision and the factual evidence needed to make it.
- **Do** use real teachers, real availability, and clearly labeled empty or illustrative states.
- **Do** preserve complete Arabic/RTL and English/LTR behavior at 320–1440px.
- **Do** keep body and placeholder contrast at or above 4.5:1.

### Don't:

- **Don't** use decorative radial glows, dot grids, glass effects, gradient text, or “AI sparkle” iconography as atmosphere.
- **Don't** present named fictional people and quotes in a testimonial visual language.
- **Don't** expose UAT, sprint, debug, placeholder, or synthetic production data on public surfaces.
- **Don't** animate layout properties or hide primary content behind entrance animation.
- **Don't** create a new local visual system with inline styles when a shared token or component already exists.
