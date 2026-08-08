# Responsive / Localization Matrix — Foundation Final Certification

**Disclosed limitation (unchanged since Sprint 0.4):** no headless-browser automation
library (Playwright/Puppeteer) is installed in this environment (`npm ls -g --depth=0`
confirms), and the only browser-driving tool available is the interactive Claude Browser
MCP tool, which executes one action per call. A genuine scripted, rendered 384-cell
(6 viewports x 4 modes x 16 surfaces) sweep is not achievable within this run. This is
disclosed rather than worked around by fabricating results.

## What was actually run

An HTTP-layer structural sweep (`structural-sweep.mjs`) requested every one of the
app's 13 routable `.dc.html` surfaces once per each of 6 viewport widths (320, 375,
390, 768, 1024, 1440) x 4 modes (en-light, en-dark, ar-light, ar-dark) = **312 cells**,
asserting HTTP 200 + `text/html` content-type. All 312/312 passed. Full machine-readable
result: `responsive-matrix.json`.

This is a necessary but not sufficient precondition — it proves the server correctly
serves every page regardless of the client-side viewport/theme/locale state (expected,
since this is a client-rendered SPA with no server-side branching on those dimensions),
but it does not by itself prove pixel-correct rendering at each cell.

## Genuine rendered spot checks (this run)

The following were actually loaded and interacted with in the real browser this run,
supplementing the structural sweep with true rendered evidence:

- Teacher Profile mobile CTA geometry at 375x667 and 390x844 — see prior task #45
  result (zero overlap / zero interception, `getBoundingClientRect`/`elementFromPoint`).
- Browse Teachers at 640x515 (200%-zoom-equivalent viewport) — layout collapses to
  hamburger nav, no overlap, content legible (see `manual-visual-results.md`).
- Student Dashboard at 1280x800 with `data-theme="dark"` forced — legible contrast,
  no unstyled/FOUC flash (see `manual-visual-results.md`).
- Student Dashboard Review Delivery and Rate modals — 10 and 2 cycles respectively,
  see `accessibility-results.md` / F-013 retention section of the main report.

## Verdict for this section

Partial. 312/312 structural cells pass; the demanded 384 rendered cells were not
achievable with available tooling. This gap is the primary reason the final verdict
for this run is CONDITIONALLY VERIFIED rather than VERIFIED.
