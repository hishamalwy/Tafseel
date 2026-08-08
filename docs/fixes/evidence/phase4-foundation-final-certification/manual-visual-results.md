# Manual Visual Certification — Foundation Final Certification

## Teacher Profile mobile CTA geometry (375x667, 390x844)

Re-checked via `getBoundingClientRect()` / `elementFromPoint()` on the sticky mobile CTA
and the service list — zero overlap, zero interception, consistent with the Track E fix
(`heroCtaHidden: services.length === 0`) from the original Sprint 0.

## Browse Teachers at 640x515 (zoom-equivalent)

Hamburger nav, cards readable, no clipped or overlapping content (screenshot captured
during this run).

## Student Dashboard, dark mode, 1280x800

Legible high-contrast dark theme; "My work" order list, earnings summary, and stat
tiles all render correctly with the fixed `boot-prefs.js` early-theme script now
actually loading (previously 404ing on every page — see `console-errors.md`).

## Cross-modal live checks completed this run

- Teacher Dashboard: Start work -> Upload delivery flow driven live (Start work via UI
  click, delivery submitted via API with a real multipart PDF against a version-checked
  `If-Match`), order reached `Delivered`.
- Student Dashboard: Review Delivery modal (10 cycles) and Rate modal (2 cycles) — see
  `network-resource-check.md` for the full F-013 retention table.

## Not re-covered this run (already certified in prior sprints, no regression signal)

Marketplace Service config, Quality Application Review, Media/Showcase Review, Admin
Service Catalog Editor, and Review Moderation surfaces were not re-driven live in this
pass beyond the console-error sweep (`console-errors.md`) and the structural HTTP sweep
(`responsive-matrix.md`) — both passed for those routes. Given the disclosed tooling
constraint on time/action budget for a genuinely interactive one-action-per-call browser
tool, this run prioritized the items with the highest regression risk: F-013 retention
(the headline defect from Sprint 0.3), the newly-discovered `boot-prefs.js` regression
found while investigating cross-page console output, and the accessibility/cache/publish
checks explicitly named in the prompt. No known regression signal exists for the
surfaces not re-driven; they are not claimed as freshly re-certified either.
