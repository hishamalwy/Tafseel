# PHASE 4 — MARKETPLACE SCALE — FOUNDATION FINAL ACCEPTANCE GATE — RUNTIME LOCALIZATION + MODAL ACCESSIBILITY + REAL RATING CERTIFICATION + FINAL MATRIX

(Verbatim intent, reconstructed — see session transcript for exact wording.)

Context: Phase 4 Foundation engineering is effectively complete per the QA Coverage
Closure pass (browser harness, 384/384 matrix, 5/5 keyboard journeys, 9/9 zoom, 5/5
reduced motion, 30/30 screenshots, F-013 closed, SVG binding closed, 310/310 backend,
publish smoke pass). That pass returned `QA COVERAGE PARTIALLY COMPLETED` because four
acceptance items remained: (1) the `ph_search` locale key existed but the live
placeholder still failed to translate due to a diagnosed but unfixed runtime timing
problem; (2) Accept Request/Delivery Upload/Admin Service Catalog still lacked
Escape-to-close; (3) prior "Rate Teacher" evidence had actually certified the Order
Timeline modal, not the real star-rating form, for a Delivered (not Completed) order;
(4) shared frontend code (`js/tafseel.js`, `js/locales.js`) had changed, requiring a
final full 384-cell matrix rerun.

Goal: reach `MARKETPLACE PRODUCT INTEGRITY VERIFIED`, then `PHASE 4 FOUNDATION VERIFIED
& CLOSED`, then unblock `RELEASE 4 — MARKETPLACE OPERATIONS`, by closing exactly those
four items — deterministically reproducing and root-causing the localization defect
(not just re-describing it as "a timing race"), live-certifying all three modals
against genuine fixture state created through the real application API (no raw SQL),
distinctly certifying the actual Rate Teacher star-rating form via a legitimately
driven Completed+Paid+Unrated order, and rerunning the full rendered matrix once with
new assertions that would catch a regression of any of the above.

Non-negotiable scope: identical to all prior passes in this chain — no Marketplace
Operations/Analytics/Search/Discovery/Messaging/Recommendations; no redesign; no
business-rule changes; no `support.js` refactor; no second localization or modal
framework; no schema change; no raw SQL business-state mutation; no weakened
authorization/rate-limiting/tests; no commit/push/deploy. Reuse `tests/browser/`
unchanged in architecture.

A 27-point Exit Rule governs the verdict, "NO EXCEPTIONS": `MARKETPLACE PRODUCT
INTEGRITY VERIFIED` only if all 27 are literally true, otherwise `CONDITIONALLY
VERIFIED`. Additional allowed verdicts: `FINAL ACCEPTANCE PARTIALLY COMPLETED`, `FINAL
ACCEPTANCE BLOCKED`. Explicit instruction: preserve, do not erase, the history that
prior "Rate Teacher" evidence actually certified the Order Timeline modal; do not
automatically create another Foundation closure task regardless of outcome.
