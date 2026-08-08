# F-013 Final Retention — Final Acceptance Gate

## Review Delivery

10 fresh cycles (carried over from the QA Coverage Closure pass, unaffected by this
pass's localization/modal changes which don't touch Review Delivery's markup): 0/10
leaks. Re-confirmed as a regression control this pass: role=dialog, aria-modal, focus
inside, Escape closes, body scroll restored — zero change.

## Real Rate Teacher (the actual star-rating form)

5 fresh open/reload cycles against the dedicated, never-submitted matrix fixture order,
each explicitly confirmed to be the real form (`isRateModal: true`, 5 rating criteria
present) before checking for leaks: **0/5 unresolved-template network requests.** Full
detail: `real-rate-teacher-certification.md`.

## Static gate

`node scripts/ci/check-template-placeholder-leak.mjs` against the real, unmodified
repo: **PASS** (12 surfaces, 3 rules).

## Negative control

Swapped a raw `src="{{ fakeBinding }}"` into `Tafseel-Student-Dashboard.dc.html` in
place (scratch-backed, restored immediately after): gate **FAILED** exactly as
expected, both the missing-key and raw-resource checks fired. Restored, `diff`
confirmed byte-identical to original, gate re-run: **PASSED**.

## Full 384-cell matrix

Every cell's assertions include a zero-template-leak check (DOM and network) — the
final matrix run (384/384 PASS) is itself additional F-013 retention evidence across
every surface, viewport, and locale/theme combination, not just the two modals checked
in dedicated cycles above.
