# PHASE 4 — MARKETPLACE SCALE — FOUNDATION BROWSER CERTIFICATION & ACCESSIBILITY CLOSURE

(Verbatim intent, reconstructed from the user's prompt in this session — see the
session transcript for the exact original 22-part wording.)

Context: Phase 4 Foundation engineering was substantially complete per the prior
`PHASE_4_FOUNDATION_FINAL_CERTIFICATION.md` report, held at CONDITIONALLY VERIFIED for
three concrete reasons: (1) no real rendered 384-cell responsive/localization matrix had
been executed (no headless-browser automation was available in that environment), (2)
fresh browser-level accessibility certification was incomplete, (3) one remaining
parser-sensitive template issue existed (`<path d="{{ sv.iconPath }}" />` on Teacher
Profile). A real accessibility issue also remained: the Review Delivery modal did not
close on Escape.

Primary goal: reach `MARKETPLACE PRODUCT INTEGRITY VERIFIED` and `PHASE 4 FOUNDATION
CLOSED` by: (1) building a proper Playwright browser-automation harness under
`tests/browser/` as Development/test-only tooling, (2) executing the true rendered
384-cell matrix (16 surfaces x 6 viewports x 4 modes), (3) manual visual certification
of a required screenshot subset, (4) fresh accessibility certification, (5) safely
closing the SVG parser-sensitive binding defect via the existing `sc-camel-*`
mechanism, (6) safely closing modal Escape/focus behavior on the Review/Rate modals if
proven, (7) full regression + publish smoke.

Non-negotiable scope: do NOT start Analytics/Search/Discovery/Recommendations/
Messaging; do NOT redesign Browse Teachers, Teacher Profile, or dashboards; do NOT
change Service Catalog governance, qualification, payment, Order lifecycle, or Review
eligibility/moderation business rules; do NOT refactor `support.js` broadly; do NOT
change the database schema unless a genuinely unavoidable certification bug proves it
necessary; do NOT fabricate test data; do NOT weaken authorization or validation; do NOT
commit, push, or deploy. Application code may change only to fix a real defect proven
during this certification pass.

A 26-point Final Exit Rule governs the verdict — "NO EXCEPTIONS": full
`MARKETPLACE PRODUCT INTEGRITY VERIFIED` only if all 26 conditions are literally true
(including exactly 384/384 matrix cells, a harness that provably fails on negative
controls, both modals' Escape behavior passing, zero new Critical/High defects), else
`MARKETPLACE PRODUCT INTEGRITY CONDITIONALLY VERIFIED`. The user explicitly instructed:
do not invent another Foundation closure sprint automatically if the exit rule is not
fully met.
