# `ph_search` Runtime Localization — Deterministic Root Cause and Fix

## Reproduction

20 fresh page-load cycles against Browse Teachers in Arabic mode, plus dedicated
English, dark-mode, and mobile-viewport checks, plus 3 live `Tafseel.setLang()`
toggles without a full reload — all executed via Playwright, paced to respect the
app's real Development rate limits.

**Before the fix:** intermittent failure (placeholder stayed in English despite
correct locale data), with the visible symptom timing-dependent.

**After the fix: 20/20 clean PASS**, plus EN check PASS, AR mobile-dark PASS, AR
desktop-dark PASS, and all 3 live EN↔AR toggles PASS. 0 console errors across all
cycles.

## Root cause (proven, not assumed)

Instrumented `Element.prototype.setAttribute` to timestamp every write to the search
input's `placeholder` attribute across the full page lifecycle:

```
t=43-125ms  -> tafseel.js:382 (translate pass) sets the correct Arabic text (multiple times)
t=87ms      -> react-dom.production.min.js ($d) also sets the correct Arabic text
t=200ms     -> react-dom.production.min.js (Fi, a LATER commit) resets it back to
               "Teacher, topic or keyword" (the raw JSX/template default)
```

This is **Class B** exactly ("translation succeeds, then DC rendering replaces the
translated attribute with original markup") — a genuine, later React re-render (the
`Fi` commit, distinct from the earlier `xk`/`$d` calls, consistent with an async
data-load triggering a re-render of the filter bar) overwrites the already-correct
translation.

**Why nothing caught the overwrite:** `js/tafseel.js`'s `MutationObserver` was
configured with `attributeFilter: ['src']` — it only ever generated a mutation record
for `src` attribute changes (used solely for dark/light brand-mark swapping). A
`placeholder` attribute change produced no `MutationRecord` at all, so the translation
pass was never re-invoked after the React overwrite. This is **not** a missing-key
problem, **not** a mount-timing problem (Class A was ruled out — the element exists and
is correctly translated multiple times before the overwrite), and **not** a duplicate/
stale-node problem (Class E was ruled out — the same DOM node receives all the writes,
confirmed by the consistent `id="f-q"` targeting in the instrumentation).

## Fix (shared mechanism, no polling, no delays)

`js/tafseel.js`:

1. `observe()`'s `attributeFilter` extended from `['src']` to
   `['src', 'placeholder', 'title', 'aria-label']`.
2. The `MutationObserver` callback now calls `self.translate(change.target)` whenever
   one of those three attributes changes — re-running the exact same translation logic
   that already runs at boot, scoped to just the changed element.
3. **Loop-prevention guard**: all three attribute-translation passes now check
   `next !== current` before calling `setAttribute`/assigning `.placeholder` — since a
   write to `placeholder` is itself observed, an unconditional write-with-same-value
   would otherwise retrigger itself indefinitely. This is the "no infinite loop"
   requirement satisfied structurally, not by rate-limiting or debouncing.
4. Earlier in this session (superseded by the above, but retained since it is a
   correct, separate fix): `selfAndDescendants(root, selector)` — `querySelectorAll`
   never matches the root element itself, only descendants, so a translatable leaf
   node handed directly to `translate()` by the observer would otherwise never have its
   own matching attributes checked.

No new localization framework, no duplicate locale key, no Browse-specific code, no
`setTimeout`/polling. The fix is generic: any future attribute-based translation
anywhere in the app that a later render overwrites is now self-healing through the same
mechanism.
