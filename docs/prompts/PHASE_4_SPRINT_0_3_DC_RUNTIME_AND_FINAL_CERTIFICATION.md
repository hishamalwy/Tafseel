# Phase 4 — Marketplace Scale — Sprint 0.3 — DC Runtime Render Race & Final Product Integrity Certification

Original operator prompt, preserved verbatim for traceability.

---

=========================================
PHASE 4 — MARKETPLACE SCALE
SPRINT 0.3

DC RUNTIME RENDER RACE
& FINAL PRODUCT INTEGRITY CERTIFICATION
=========================================

## Context

Phase 4 Sprint 0.2 completed extensive authenticated UAT. Proven live: initial Teacher qualification; multi-subject qualification isolation; Dashboard routing after second-subject application; Subject A marketplace availability while Subject B is pending/changes-requested; Profile Video Curation hide/show/featured/reorder; teaching-media stream-only behavior; full Student Request→Accept→Payment→Start Work→Delivery→Approve→Rating lifecycle; review moderation hide/restore; full SqlServer suite 105/105. Marketplace Product Integrity remained CONDITIONALLY VERIFIED for three reasons: (1) F-013 reproduced live; (2) full responsive/localization matrix was not completed; (3) publish smoke was not run. This sprint exists only to close those three items.

Do NOT start Analytics/Search/Discovery/Messaging. Do NOT redesign Browse Teachers, Teacher Profile, or Orders. Do NOT change qualification, Review, or payment rules. Do NOT create new business features. Do NOT commit, push, or deploy.

## Goal

Convert CONDITIONALLY VERIFIED into VERIFIED by: (1) deterministically reproducing F-013; (2) proving its exact render-order root cause; (3) applying the smallest safe systemic or page-level fix; (4) auditing the same race class across all consumer/authenticated pages; (5) completing the full responsive/localization certification matrix; (6) running Release publish smoke; (7) re-running full regression.

## Part 1 — F-013 Deterministic Reproduction

Create a deterministic reproduction first — do not assume the symptom is already understood enough to patch. Use existing UAT data where possible; if the existing Order is Completed, create the smallest legitimate new Order lifecycle via supported APIs/UI (no raw SQL business-state mutation, no fake frontend-only modal invocation as the primary proof). For each modal open, capture timestamp, first DOM mutation, first attribute value, `renderVals` output, `sc-if` mount timing, network request timing, final corrected DOM, and the number of literal-template requests — repeat enough cycles (minimum 20 if automation permits) to establish whether the race is deterministic, intermittent, first-open-only, cache-sensitive, or state-transition-sensitive, and record the exact reproduction rate. Compare the reproduced-broken `reviewModal` path against the working `rateModal` path and any other working `<img src="{{ ... }}">` inside an `sc-if`, looking at subtree mount order, render-state initialization, fallback values, DOM insertion, property vs. attribute setting, lifecycle sequencing, `sc-if` implementation, interpolation timing, image element creation, and conditional-rendering strategy. Do not conclude "support.js race" until this comparison supports it.

## Part 2 — support.js Runtime Investigation

Trace the actual runtime code responsible for `sc-if`, template subtree cloning/insertion, `{{ ... }}` attribute interpolation, render scheduling, DOM updates, first mount, and state-transition updates. Read only the relevant runtime path — do not refactor the ~1,900-line runtime. Determine the exact sequence from state change through render scheduling, `sc-if` becoming true, subtree insertion, attribute existence, interpolation resolution, to the point the browser gets a chance to fetch a raw resource attribute.

## Part 3 — Fix Decision

Evaluate Option A (runtime fix — preferred only if the runtime itself violates the general invariant "resource-bearing attributes must never reach live DOM containing unresolved template tokens"; do not broadly change rendering semantics without regression evidence) versus Option B (application-level safe mount — preferred if the race is limited to specific modal/media patterns or a runtime change carries disproportionate regression risk; e.g. render `<img>` only after the resolved value exists, use a non-resource placeholder first, or reuse an already-existing safe media/avatar helper — do not invent a new framework or duplicate the same workaround across dozens of pages if a shared helper exists). Choose the smallest fix that prevents raw template resource requests, preserves current runtime behavior elsewhere, handles the whole proven race class (not one literal line), and is testable. Document why the rejected option was not chosen.

## Part 4 — Security / Resource-Attribute Audit

Search all production `.dc.html` surfaces for interpolated resource-bearing attributes (`src`, `srcset`, `href`, `poster` on elements bearing `{{ ... }}`), focusing particularly on elements inside `sc-if` or newly-mounted conditional subtrees. Classify each occurrence SAFE / POTENTIALLY RACY / PROVEN RACY / NOT RESOURCE-BEARING, auditing at minimum Student Dashboard, Teacher Dashboard, Quality Dashboard, Admin Dashboard, Teacher Profile, Browse Teachers, Request, Payment, Book Session, Auth, and Landing. Do not mechanically rewrite all bindings — only fix instances sharing the proven dangerous lifecycle.

## Part 5 — Regression Gate For Runtime Leaks

`check-template-placeholder-leak.mjs` only detects missing producing render keys, which Sprint 0.2 proved insufficient for runtime races. Add a regression gate that can detect network requests containing `%7B%7B`/`{{` or unresolved-template values in resource-bearing attributes after interactive modal/state transitions, covering at minimum `reviewModal`, `rateModal`, Teacher Profile media, Teacher Dashboard media, and Quality media preview. Do not create a brittle test tied to one exact avatar filename.

## Part 6 — Review Modal Certification

After the fix: drive a real Order lifecycle to Delivered, open Review delivery, repeat modal open/close multiple times, and verify zero literal-template requests, correct Teacher avatar/name/service, visible delivery file, unchanged review/approve/revision actions, no missing bindings, no console errors, working Escape, and working focus return. Then approve or request revision per the existing lifecycle — no business-rule change.

## Part 7 — Rate Modal Regression

Re-drive Completed Order → Rate Teacher and verify the five criteria, comment, recommends, Teacher avatar/name/service, no literal placeholder, successful submit, prevented duplicate review, and updated public aggregate. The reviewModal fix must not regress rateModal.

## Part 8 — Other Conditional Modals

Exercise representative `sc-if`-mounted dialogs across roles (Student: Review delivery, Rate teacher, notifications panel if conditional; Teacher: Accept request, Delivery upload, Marketplace service configuration, Profile Video controls; Quality: Application review, Showcase/video review; Admin: Service Catalog editor, Withdrawal/moderation dialog if applicable) and verify no unresolved resource attributes, no first-frame 404s, no new render flicker, no console errors.

## Part 9 — Full Responsive / Localization Matrix

Mandatory. Complete the matrix Sprint 0.2 did not finish: viewports 375/390/768/1024/1280/1440 × modes Arabic-RTL-Dark/Arabic-RTL-Light/English-LTR-Dark/English-LTR-Light × 12 surfaces (Browse Teachers, Teacher Profile, Student Dashboard active/completed Order, Review Delivery modal, Rating modal, Teacher Dashboard My Qualifications/Profile Videos/Requests-Orders, Quality Dashboard Applications/media review, Admin Dashboard Service Catalog). Do not claim all 288 cells unless actually inspected. If the full sweep is too large for manual screenshot capture, perform automated geometry/overflow/localization checks for every cell plus manual visual inspection for a representative subset (smallest mobile, tablet, desktop, AR/RTL, EN/LTR, dark, light) — every cell must at least receive automated structural checks.

## Part 10 — Matrix Checks

For every automated cell verify: `scrollWidth <= viewport width`; no clipped fixed/sticky controls; no unresolved localization keys; no literal template placeholders; no missing name; no GUID displayed as a person name; no NaN/undefined/null leakage; no console error; no resource 404 from an unresolved binding; no CTA overlap; dialogs stay inside the viewport; focusable controls reachable. For manually inspected cells additionally verify visual hierarchy, spacing, readable prices, badges, media, table/card layout, and RTL composition.

## Part 11 — Accessibility Regression

Especially after any render/runtime change, verify keyboard-only navigation, modal initial focus, focus trapping where expected, focus restoration, Escape, `aria-modal`, `aria-labelledby`, visible focus, 200% zoom, reduced motion, and no hidden focus target mounted under `sc-if`.

## Part 12 — Performance / Render Regression

If support.js changes, measure before/after on Landing, Browse, Teacher Profile, Student Dashboard, Teacher Dashboard for render loops, excessive repeated state updates, duplicate network calls, layout-shift increase, first-frame flash from delayed resources, and broken media readiness. Do not claim a performance improvement unless measured — the goal is no regression.

## Part 13 — Publish Smoke

Sprint 0.2 did not run this. Run `dotnet publish -c Release` via the project's normal publish target/workflow and verify: publish succeeds; frontend copied correctly; the app starts from publish output; `/health/live`/`/health/ready` = 200; Landing = 200; Browse = 200; authenticated login works against the published output; representative Student/Teacher page loads; static assets resolve; no missing JS/CSS/media-preview assets. Do NOT deploy the published output.

## Part 14 — Full Regression

Run Domain, Application, Architecture, `Category=SqlServer` (expected baseline: 89/5/1/105, counts may legitimately increase) — require 0 failures. Also run `check-frontend-integrity.mjs`, `check-localization.mjs`, `check-localization-usage.mjs`, `check-bug001-display-names.mjs`, `check-teacher-profile-mobile-cta.mjs`, `check-template-placeholder-leak.mjs`, the new runtime-resource-placeholder regression, `node --check`, EF pending-model check, migration list, `git diff --check`. Do not weaken tests.

## Part 15 — Documentation Corrections

Correct the F-013 history precisely, preserving the investigation history rather than erasing earlier contradictory findings: Sprint 8 first observed live; Sprint 0 not reproduced in static/current-source investigation; Sprint 0.1 still not reproduced live; Sprint 0.2 reproduced live, root cause narrowed to runtime render ordering; Sprint 0.3 records final root cause and fix.

## Documentation

Create `docs/fixes/PHASE_4_SPRINT_0_3_DC_RUNTIME_AND_FINAL_CERTIFICATION.md` and `docs/fixes/evidence/phase4-sprint0-3-runtime-certification/`. Save this prompt as `docs/prompts/PHASE_4_SPRINT_0_3_DC_RUNTIME_AND_FINAL_CERTIFICATION.md`. Update `docs/INDEX.md` and `docs/PROJECT_STATUS.md`. If F-013 is fixed, mark it CLOSED with exact evidence; if not, do not close Marketplace Product Integrity.

## Exit Rule

Marketplace Product Integrity may be marked VERIFIED only when: (1) F-013's reproducible cause is proven; (2) a fix is implemented; (3) zero unresolved-template network requests occur across tested modal/resource transitions; (4) Review Delivery modal passes; (5) Rate modal passes; (6) full SqlServer suite passes; (7) frontend regression suite passes; (8) responsive/localization matrix passes; (9) publish smoke passes; (10) published-output health passes; (11) no new Critical/High regression is introduced. If any are incomplete: CONDITIONALLY VERIFIED. No exceptions.
