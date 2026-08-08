# PHASE 4 — MARKETPLACE SCALE — FOUNDATION QA COVERAGE CLOSURE — FINAL ACCESSIBILITY + MANUAL UX CERTIFICATION

(Verbatim intent, reconstructed — see session transcript for exact wording.)

Context: Phase 4 Foundation engineering and browser automation were complete per the
prior Foundation Browser Certification report (384/384 matrix, F-013 closed, SVG
parser fix closed, Teacher Profile CTA pass, backend/integration/build/publish/health
all pass). That report returned `BROWSER CERTIFICATION PARTIALLY COMPLETED` solely
because several deep QA coverage items were not exhaustively executed. This pass exists
only to close those remaining gaps: keyboard-only journeys, deep modal accessibility
certification, remaining 200% zoom checks, the remaining reduced-motion check, the
required manual screenshot/visual set, the two previously-disclosed small findings
(`ph_search` localization key, modal Escape inconsistency), and final regression +
publish smoke.

Non-negotiable scope: no Marketplace Operations/Analytics/Search/Discovery/Messaging/
Recommendations; no redesign of Browse or Teacher Profile; no change to Service Catalog
governance, qualification rules, payment logic, Order lifecycle, or review business
rules; no `support.js` refactor; no second browser automation framework (reuse
`tests/browser/`); no database schema change; no commit/push/deploy. Application code
may change only for a real defect reproduced in this pass.

A 23-point Exit Rule governs the verdict, "NO EXCEPTIONS": `MARKETPLACE PRODUCT
INTEGRITY VERIFIED` only if all 23 are literally true, otherwise `CONDITIONALLY
VERIFIED`. Additional allowed verdicts named: `QA COVERAGE PARTIALLY COMPLETED`, `QA
COVERAGE BLOCKED`. The user explicitly instructed not to automatically create another
Foundation closure task regardless of outcome.
