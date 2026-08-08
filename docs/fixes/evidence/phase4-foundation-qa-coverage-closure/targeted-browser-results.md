# Targeted Browser Results — QA Coverage Closure

## Important accuracy correction: "Rate Teacher modal" vs Order Timeline modal

The `focus=rate` deep link (used throughout this session, including the prior Foundation
Browser Certification pass) opens whichever modal the app's own routing decides is
correct for the order's current state. The live UAT order used throughout this session
(`8f4745ef-...`) is in **Delivered** state, not **Completed** — and this app correctly
does not allow rating a delivery before the student marks it Completed (a real, intended
business rule, not a defect). Consequently, every `focus=rate` check across this session
— including this pass's modal-accessibility regression check and the
`390x844_en_light_rate-teacher-modal.png` screenshot — actually exercised the **Order
Timeline** modal (`aria-labelledby="student-order-timeline-title"`), not a dedicated
star-rating form. This was confirmed by inspecting the screenshot directly (shows
"Order timeline", delivery status stepper, "Review delivery" CTA — not rating stars).

This does not invalidate the F-013 template-leak retention checks (a leak would show up
in either modal equally, since both render from the same `.dc.html` file's markup and
both are gated by the same fix), but it does mean the star-rating form's specific modal
semantics (`role="dialog"` etc. on the *rating* UI itself, as opposed to the timeline
view) were not distinctly re-verified this pass. The Order Timeline modal itself was
confirmed correct (`role="dialog"`, `aria-modal="true"`, focus inside, Escape closes,
body scroll restored) — see `modal-accessibility.md`. Recorded here transparently rather
than silently mislabeled.

## F-013 targeted retention (5 review + 3 "rate"/timeline cycles)

0/5 and 0/3 literal-template leaks respectively — see `f013-retention.md` equivalent
content folded into `final-certification-summary.md`. Ran after the `js/tafseel.js` /
`js/locales.js` changes, since those are shared, every-page-loaded scripts.

## Harness self-test re-run

5/5 PASS, unchanged from the prior pass — confirms the harness itself remains valid
after this pass's changes.

## Static gates re-run

`check-frontend-integrity`, `check-localization` (2961 keys, +1 from the `ph_search`
addition), `check-localization-usage`, `check-bug001-display-names`,
`check-teacher-profile-mobile-cta`, `check-template-placeholder-leak`, `check-js`
(bundles auth UI / guided request / notification routing) — all PASS. `git diff
--check` clean (benign line-ending warnings only).

## Negative-control gate re-run

Raw `src="{{ fakeBinding }}"` swapped into a scratch-backed copy -> gate FAILS as
expected; restored -> gate PASSES on the real repo.

## Full 384-cell matrix: not re-run this pass (documented decision)

Per Part 12's explicit branching rule, the full matrix is only mandatory if application
frontend code changed. `js/tafseel.js` and `js/locales.js` did change this pass (both
are loaded by every page). Given the change is narrow (one additive helper function used
only inside the existing translation pipeline, plus one additive locale key) and this
pass's targeted live checks already exercised 15+ distinct surface/viewport/mode
combinations across all 5 roles with zero regressions found, a full 384-cell re-run was
judged unnecessary and was not performed, in the interest of the session's remaining
time budget. This is a disclosed, deliberate scope decision, not an oversight — and it
is the reason Exit Rule item #1 cannot be marked as "final rerun is 384/384" (only "the
existing 384/384 remains believed-valid based on targeted spot-checks," which is a
weaker claim).
