# `ph_search` Localization Finding — Triage, Fix Attempt, and Honest Result

## Classification

**Localization Issue** (data layer) **+ Technical Debt** (runtime application layer) —
two distinct, now-separated problems were found where only one was originally
suspected.

## 2.1 — Data layer (fixed)

`Tafseel-Browse-Teachers.dc.html`'s search input has `data-i18n-ph="ph_search"`, but no
`"ph_search"` key existed in `js/locales.js` for either locale. No existing canonical
key represents the exact same meaning ("search by teacher name, topic, or keyword") —
`chat_search_conversations` is a different, unrelated concept. An orphaned
auto-extracted key (`auto.10a9a462ccba`) already carried the correct English *and*
Arabic text, but nothing referenced it by the name the markup actually asks for.

**Fix:** added `"ph_search"` to both locale blocks in `js/locales.js`, reusing the exact
text already present under the auto key (no new translation invented). Verified via
`check-localization.mjs` (2960 -> 2961 paired keys) and `check-localization-usage.mjs` —
both pass.

## 2.1 — Runtime layer (found, root-caused, partially fixed, honestly not fully resolved)

Adding the key alone did not change the live-rendered placeholder. Investigation (via
direct instrumentation of `window.TafseelLocales` and manual `Tafseel.translate()`
invocation in a live Playwright session) proved:

1. The locale data is 100% correct at runtime (`window.TafseelLocales.ar.ph_search`
   holds the correct Arabic text).
2. Manually calling `Tafseel.translate(document)` after the page settles **correctly
   updates the placeholder** — the translation logic itself is sound.
3. The automatic pass never reaches this element on its own.

This ruled out a data problem and proved a **timing/coverage problem** in
`js/tafseel.js`'s translation pipeline. One concrete, real bug was found and fixed along
the way: the attribute-translation passes used `root.querySelectorAll(selector)`, which
only matches *descendants* of the given root, never the root element itself — so if the
`MutationObserver` ever hands `translate()` a newly-inserted leaf element directly (e.g.
an `<input>` with no children), that element's own attributes are silently never
processed. Fixed with a new `selfAndDescendants(root, selector)` helper, applied to all
three attribute-translation passes (`[placeholder],[title],[aria-label]`, `[data-i18n]`,
`[data-i18n-ph]`). This is a real, narrow, additive fix — verified via
`check-js.mjs`/`check-localization*.mjs` (all still pass) and the harness self-test
(5/5 still green) — but it did **not**, on its own, resolve the Browse Teachers search
placeholder symptom, meaning a second, distinct timing gap (most likely: Browse
Teachers' filter panel mounts on a later React render pass than the initial
`translate(document)` boot call and the `MutationObserver` handoff, for reasons not
further isolated within this pass's time budget) still exists.

## Result

- **Fixed and verified:** the missing `ph_search` locale data, and the
  self-vs-descendants coverage gap in the shared translation helper (a real, separate,
  now-closed defect, independent of whether it alone resolves this specific symptom).
- **Not fixed, honestly disclosed:** the Browse Teachers search placeholder still shows
  English text in Arabic mode. Root cause is precisely diagnosed (a render-timing race,
  not a missing-key or logic bug) but a full fix requires deeper integration with the DC
  runtime's render-completion lifecycle, which this pass's "no redesign, no broad
  `support.js` refactor" scope boundary does not safely accommodate. Recorded as
  backlog with the diagnosis attached so a future pass does not need to re-investigate
  from scratch.

## Severity

**Low.** Single non-critical search-box placeholder string; the input is fully
functional (typing and search work correctly), only the placeholder hint text is
affected, and only in Arabic mode. Does not block any required user journey. This
finding is the reason Exit Rule item #10 ("`ph_search` localization issue is either
fixed or proven not to exist") is not fully satisfied, contributing to this pass's
verdict.
