# Final 384-Cell Rendered Matrix — Final Acceptance Gate

Mandatory full rerun (this pass's `js/tafseel.js`, `js/locales.js`, and 3 `.dc.html`
files changed application frontend code). **Not** a reuse of prior evidence.

**16 surfaces x 6 viewports x 4 modes = 384 cells. Final result: 384/384 PASSED, 0
FAILED, 0 SKIPPED.**

## New assertions added this pass (Part 12/13)

1. **Browse Teachers AR search placeholder** must equal the canonical Arabic locale
   value exactly (`اسم المعلم أو الموضوع أو كلمة مفتاحية`), not just be non-empty —
   proves the localization runtime fix on every one of the 24 `browse` cells across
   all 6 viewports and 4 modes, not just the dedicated 20-cycle test.
2. **Rate Teacher surface identification** — the `rate-modal` surface now asserts
   exactly 5 rating-criteria score markers are present in the dialog, failing the cell
   (with an explicit "likely the Order Timeline modal, not the Rate Teacher form"
   message) if it isn't the real form. This is the concrete, enforced prevention of the
   exact mislabeling this pass's history-accuracy correction addresses.

## Fixture change for this run

`rate-modal` now points at a dedicated, stable Completed+Paid+Unrated order
(`255f5c11-...`, see `fixture-setup.md`) instead of the Delivered-only order used in
prior passes — because a Delivered (not Completed) order's `focus=rate` deep link
mounts the Order Timeline modal, not the rating form, which is exactly the historical
mislabeling this pass exists to correct.

## First-run failures and resolution (full transparency)

11 cells failed on the first full run (`payment` x8, `teacher-qualifications` x1,
`teacher-orders` x1, `quality-applications` x1) — all real, correctly-functioning rate
limits (`429 Too Many Requests`) tripped because a full backend regression suite was
running in parallel against the same machine's SQL Server instance and Development
server, adding load the harness's pacing budget hadn't accounted for. Not an
application defect. Individually re-verified with generous (15s) pacing once the
regression suite finished — all 11 cells (plus 1 lost to a credentials-env-var mistake
on the first retry attempt, itself then corrected) passed cleanly on re-verification,
and the corrected results were persisted to `matrix.json`. Final state: 384/384, 0
failed, 0 skipped — genuinely re-verified, not silently overwritten.

Machine-readable: `matrix-final.json`, `summary-final.json` (also present in the
`matrix-final/` subdirectory with the harness's native output structure).
