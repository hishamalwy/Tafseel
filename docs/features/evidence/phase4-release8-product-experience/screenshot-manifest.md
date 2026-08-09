# Release 8 — Screenshot Manifest

Accepted matrix screenshots under `matrix/screenshots/`.

## Required combos (high-risk surfaces)

Widths × locales/themes:

| Combo | Surfaces (10) |
|---|---|
| 375 AR dark | landing, browse, teacher-profile, compare, guided-request, student-dashboard, teacher-dashboard, messages, live-booking, admin-intelligence |
| 390 EN light | same |
| 768 AR light | same |
| 1024 EN dark | same |
| 1280 AR dark | same |
| 1440 EN light | same |

Total: **60** PNGs.

## Manual visual review notes (2026-08-09)

| Surface | Verdict | Notes |
|---|---|---|
| Landing | PASS | Hero search obvious; brand strong; no fake metrics; AR RTL correct |
| Browse | PASS | Unified search integrated; no AI panel; filters stack on mobile |
| Teacher Profile | PASS | Sticky CTA + prominent price; Qualified badge; no CTA/video overlap at 375/390 |
| Compare | PASS | Mobile compare tray; not a squeezed table |
| Student Dashboard | PASS | Attention-first; single primary CTA per item; Learning tabs; AR/EN polished |
| Teacher Dashboard | PASS | Actionable workload readable |
| Guided Request | PASS | Step flow intact; optional AI draft retained |
| Messages | PASS | R5 composer usable on mobile |
| Live Booking | PASS | Service context + slots shell |
| Admin Intelligence | PASS | Filters usable; tablist horizontally scrollable on 375 (intentional, not clipped labels) |

Post-polish targeted retest (Student Dashboard + Admin Intelligence): **48/48 PASS** (`matrix/targeted-retest/summary.json`).
