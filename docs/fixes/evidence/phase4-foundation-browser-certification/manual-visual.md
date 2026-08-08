# Manual Visual Certification — Browser Certification

Senior-Product-Designer-lens review of the required screenshot subset (all captured live
this pass; see `screenshots/`). Judged for blocking Product Integrity defects only, not
subjective polish.

## 1440x900, English/Light — Landing, Browse, Teacher Profile

Clean, uncluttered, correct information hierarchy. Browse Teachers: 3 teacher cards,
each showing name, "Qualified on Tafseel" badge, primary subject once, star rating,
starting price, service description, live-session availability note, Profile/Request
buttons, Save (heart) and "Add to comparison" controls. The multi-subject teacher
("Sprint 0.2 UAT Teacher") correctly shows its primary subject once (as label text) and
its additional qualified subject once (as a single chip, "Physics") — no duplication,
consistent with the Sprint 0 Track H fix. **No blocking defect.**

## 375x667, Arabic/Dark — Browse, Landing, Teacher Profile, Student Dashboard, Review Delivery Modal

Full RTL mirroring correct (filters, breadcrumbs, nav all flip correctly), dark theme
legible throughout, hamburger nav collapses correctly at this width. **One minor,
non-blocking finding:** the Browse Teachers search input's placeholder text ("Teacher,
topic or keyword") remains in English even in Arabic mode — the markup already has
`data-i18n-ph="ph_search"` wired to the translation system, but no `ph_search` key
exists in `js/locales.js` for either locale (pre-existing gap, not introduced this pass,
not caught by the automated matrix since it checks `lang`/`dir` attributes rather than
scanning every individual visible string). Disclosed as backlog, not fixed — a single
missing i18n key on a non-critical placeholder is not a Product Integrity blocker and
fixing it is new scope (adding translation entries) beyond this pass's certification
mandate. **No blocking defect.**

## 390x844, English/Light — Auth

Login form renders cleanly, correctly sized touch targets, no clipping. **No blocking
defect.**

## Verdict

No blocking Product Integrity defect found across the reviewed subset. One disclosed,
non-blocking localization gap (search placeholder) recorded above.
