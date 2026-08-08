# F-013 Retention — Browser Certification

Re-run after this pass's markup/modal changes (SVG `path d` fix, Review modal Escape
wiring), per Part 17's explicit requirement.

## Review Delivery modal — 10 cycles

Automated via Playwright (`certification-pass.mjs`): navigated to the Review Delivery
deep link 10 times, checking `performance.getEntriesByType('resource')` for any URL
containing `%7B%7B` or `{{` after each load.

**Result: 0/10 literal-template leaks.** (`f013ReviewLeaks: 0` in
`certification-pass-report.json`, aggregated across the 10 cycles.)

## Rate Teacher modal — 3 cycles

Same method, `focus=rate` deep link, 3 cycles (minimum required by Part 17).

**Result: 0/3 literal-template leaks.**

## Static gate

`node scripts/ci/check-template-placeholder-leak.mjs` against the real, unmodified repo:
**PASS** (12 surfaces scanned, 3 rules: missing-key, raw `img`/`video`/`source`
resource attributes, raw SVG geometry attributes).

## Negative-control tests (both rules)

**Rule 2 (raw resource `src`):** temporarily swapped a raw `src="{{ fakeBinding }}"`
into a scratch-backed copy of `Tafseel-Student-Dashboard.dc.html` in place of the repo
file, ran the gate -> **FAILED** as expected (both the missing-key and raw-resource
checks fired). Restored the original from backup, `diff` confirmed byte-identical, gate
re-run -> **PASSED**.

**Rule 3 (raw SVG geometry, added this pass):** same swap-in-place method on
`Tafseel-Teacher-Profile.dc.html`'s `sc-camel-d` back to a raw `d="{{ sv.iconPath }}"` ->
gate **FAILED** with the new Rule 3 message. Restored, gate re-run -> **PASSED**.

All scratch copies were deleted immediately after each test; no negative-control content
was left in the repository at any point after verification.
