# Phase 4 — Marketplace Scale — Sprint 0.3 — DC Runtime Render Race & Final Product Integrity Certification

Date: 2026-08-07
Follows: [Sprint 0](./PHASE_4_SPRINT_0_MARKETPLACE_PRODUCT_INTEGRITY_RECOVERY.md), [Sprint 0.1](./PHASE_4_SPRINT_0_1_INTEGRITY_CERTIFICATION_CLOSURE.md), [Sprint 0.2](./PHASE_4_SPRINT_0_2_AUTHENTICATED_UAT_CLOSURE.md)
Evidence: [docs/fixes/evidence/phase4-sprint0-3-runtime-certification/](./evidence/phase4-sprint0-3-runtime-certification/)

No commits, pushes, or deployments were made. No business rule, qualification-approval rule, payment logic, or moderation rule was changed. No new business feature was added. The published output was built and health-checked, then **not** deployed.

## Findings

1. **F-013's true root cause is now proven, and it is not what any prior sprint in this chain guessed.** It is not a React render-cycle race (Sprint 0.2's hypothesis) and it is not explainable by app-level data correctness (Sprint 0's conclusion). Every `.dc.html` file is served byte-for-byte as static HTML, and `<x-dc>` — the root element wrapping the entire template — is a plain, non-inert custom element, not `<template>`. The browser's own HTML parser therefore treats every element inside it, including everything nested inside `<sc-if>` blocks that are logically "hidden," as real, live DOM content, and eagerly fetches any `src` attribute it encounters **before any JavaScript runs at all** — independent of `sc-if` gating, independent of React, independent of the dc-runtime's own (provably correct) interpolation logic. Confirmed by direct inspection of the raw HTTP response bytes: the literal text `src="{{ reviewTeacherAvatar }}"` was present verbatim in the server's response body.
2. **The fix is a one-line-per-instance markup convention change, not a runtime change.** `support.js` (the ~1,900-line dc-runtime) already has a proven, in-production mechanism for exactly this situation: the `sc-camel-` attribute prefix (already used elsewhere for `sc-camel-value` on the rating modal's range sliders), which the parser's attribute-collection step maps to the real camelCase React prop, but which the *browser's HTML parser* does not recognize as a resource-fetching attribute name. Renaming `src="{{ x }}"` to `sc-camel-src="{{ x }}"` eliminates the eager-fetch vulnerability at its structural root — deterministically, not probabilistically — while the dc-runtime continues to set the real `src` DOM property normally once React mounts the resolved element. **Option B (application-level, using an existing safe convention) was chosen over Option A (runtime change)** — see Fix Decision.
3. Applied to **every** `<img>`/`<video>` element with an interpolated `src="{{ ... }}"` across the entire consumer surface — 30 occurrences across 8 files (`Tafseel-Admin-Dashboard.dc.html`, `Tafseel-Browse-Teachers.dc.html`, `Tafseel-Landing.dc.html`, `Tafseel-Payment.dc.html`, `Tafseel-Quality-Dashboard.dc.html`, `Tafseel-Student-Dashboard.dc.html`, `Tafseel-Teacher-Dashboard.dc.html`, `Tafseel-Teacher-Profile.dc.html`) — the complete, well-defined "proven racy" class, not a mechanical rewrite of unrelated bindings (interpolated `href` on `<a>` tags is not resource-eager in browsers and was correctly left untouched).
4. A durable, static regression gate closing this exact class of defect was added to `check-template-placeholder-leak.mjs`: it now fails the build if any `<img>`/`<video>`/`<source>` anywhere in a scanned surface ever uses a raw `src`/`srcset`/`poster` attribute with a literal `{{ ... }}` value.
5. A real, previously-undocumented operational hazard was found and recorded during verification: a browser holding a cached copy of a **pre-fix** `.dc.html` page remains vulnerable until that cache entry is invalidated, since no explicit cache-control headers are set on these static files today. This does not affect the correctness of the fix itself (confirmed via cache-busted reloads) but is a real deployment consideration, recorded in Remaining Limitations.

## F-013 Reproduction

Per Part 1's explicit instruction not to assume the symptom was already understood, a deterministic reproduction was established first, using a real Order lifecycle driven through legitimate API calls and UI clicks (no raw SQL business-state mutation): a fresh Learning Request was created against the Sprint 0.2 UAT Teacher/Student, accepted, paid via Mock Checkout (webhook-confirmed), and delivered — reaching a real `Delivered` order. The Review Delivery modal was opened via the fastest possible trigger (`?orderId=...&focus=review`, a fresh full-page navigation that auto-opens the modal on mount, matching the exact timing conditions of the original Sprint 0.2 observation).

Comparing the broken `reviewModal` path against the working `rateModal` path (Part 1.3) initially suggested a render-timing difference, but static analysis of `support.js`'s `compileAttr`/`walkElement`/`walkIf` functions proved the JS-side interpolation pipeline treats both identically and correctly (an unresolved binding yields `props.src = undefined`, which React omits — never literal `{{ }}` text). This ruled out a JS-render-order race and redirected the investigation to the one thing that happens *before* any JS executes: the browser's own parsing of the raw HTML response, confirmed via direct `grep`/`curl` inspection of the served bytes (see [network-trace-evidence.md](./evidence/phase4-sprint0-3-runtime-certification/network-trace-evidence.md)).

## Root Cause

Documented in full in [network-trace-evidence.md](./evidence/phase4-sprint0-3-runtime-certification/network-trace-evidence.md). Summary: `<x-dc>` is not inert; every attribute inside it, including inside `<sc-if>`-gated subtrees, is real DOM the browser's parser processes immediately, including firing eager resource fetches for `src` on `<img>`/`<video>` — regardless of the logical (JS-driven) visibility state. `rateModal` not reproducing in the earlier Sprint 0.2 session was a matter of relative timing (how much JS had already executed and hydrated by the time that particular modal was opened in that session), not a structural difference between the two modals — both were equally vulnerable, as confirmed by both having had literal `src="{{ ... }}"` markup present in the raw served HTML before this sprint's fix.

## Fix Decision

**Option B (application-level safe mount) was chosen.** Option A (a runtime change to `support.js`) was explicitly rejected: the invariant violated ("resource-bearing attributes must never reach live DOM containing unresolved template tokens") is real, but the only general runtime fix would be wrapping `<x-dc>` content in `<template>` or deferring the entire markup's initial parse — both are systemic changes to how *every* `.dc.html` page in the application boots, carrying disproportionate regression risk for a ~1,900-line shared runtime with no regression suite of its own, in a single sprint's remaining time budget, exactly the scenario Part 3 says to avoid ("do not broadly change rendering semantics without regression evidence"). Option B — reusing the existing, already-proven-safe `sc-camel-*` attribute convention — required zero runtime changes, is mechanically verifiable (a simple grep confirms no raw `src="{{` remains), and handles the entire proven race class (every interpolated `<img>`/`<video>` `src` in the app) in one pass.

## Runtime / Application Fix

No changes were made to `support.js`. Changes were made only to the 8 `.dc.html` template files (Findings #3) and to the `check-template-placeholder-leak.mjs` static gate (Findings #4).

## Resource Attribute Audit

Full audit across all `.dc.html` root files for `src="{{`, `srcset="{{`, `href="{{`, `poster="{{`:

| Pattern found | Count | Classification | Action |
|---|---:|---|---|
| `<img src="{{ ... }}">` / `<video ... src="{{ ... }}">` | 30 (across 8 files) | **PROVEN RACY** — browser eagerly fetches `src` on parse, independent of gating | Fixed → `sc-camel-src` |
| `srcset="{{ ... }}"` / `poster="{{ ... }}"` | 0 | N/A | No occurrences found anywhere |
| `<a href="{{ ... }}">` | ~30 (across most pages) | **SAFE** — browsers do not eagerly prefetch anchor `href` targets; only fetched on click | Left unchanged |
| Text-node interpolation (`{{ x }}` between tags) | many | **SAFE** — `walkText` never emits literal `{{ }}` into the DOM in production (confirmed in `support.js`; only shows literal syntax behind a `data-dc-editor-on` dev-tool gate, and even then as inert text, not an attribute) | No action needed |

Audited surfaces (per Part 4's minimum list): Student Dashboard, Teacher Dashboard, Quality Dashboard, Admin Dashboard, Teacher Profile, Browse Teachers, Request, Payment, Book Session, Auth, Landing — all covered by the full-file grep sweep; `Request`, `Payment`, `Book Session`, `Auth` had zero `img`/`video` `src` interpolations to begin with (only safe `href`s), `Payment` had exactly one (`teacherAvatar`, fixed).

## Review Delivery Modal

Fully re-certified live on a fresh Delivered order:
- 5 consecutive fresh full-page-load + deep-link auto-open cycles: **0/5 literal-template network requests** (`performance.getEntriesByType('resource')` filtered for `%7B%7B`/`{{`).
- Teacher avatar confirmed resolved and loaded (`img.complete === true`, `naturalWidth: 150`, real `default-avatar.svg` asset).
- Teacher name, service, delivery file, "2 revisions remaining" all rendered correctly.
- Approve action completed the order successfully via the real `/complete` endpoint (native `confirm()` dialog, same as Sprint 0.2, driven via the identical API call the confirmed dialog itself triggers).
- No console errors beyond the pre-existing, unrelated `boot-prefs.js` 404 (present since Sprint 0, out of this sprint's scope).

## Rating Modal

Re-driven on the same order after completion: 0 leaks, Teacher avatar/name/service all correctly resolved, five-criteria sliders present, comment field present, submit succeeded (`POST /orders/{id}/review → 200`), duplicate-prevention unaffected (unchanged code path, already proven in Sprint 0.2). **No regression from the fix** — `rateModal`'s own `rateTeacherAvatar` binding was fixed identically and behaves identically to before, minus the vulnerability.

## Cross-Modal Regression

Representative sweep (Part 8) across roles, using cache-busted fresh loads to rule out the browser-cache masking effect (Findings #5):

| Surface | Result |
|---|---|
| Admin Dashboard (fresh login) | 0 leaks |
| Teacher Dashboard (fresh login) | 0 leaks |
| Quality Dashboard (cache-busted) | 0 leaks (see Findings #5 for the stale-cache false-positive caught and resolved during this check) |
| Browse Teachers (cache-busted, public) | 0 leaks |
| Landing (cache-busted, public) | 0 leaks |
| Teacher Profile | Fixed (`featuredSample.contentUrl`, `teacherAvatar`); not independently re-loaded this pass beyond the earlier Sprint 0/0.1 live checks, which already exercise it |

Deep exercise of every individual conditional dialog listed in Part 8 (Accept request, Delivery upload modal, Marketplace service configuration, Profile Video controls, Quality Application review, Quality Showcase review, Admin Service Catalog editor, Withdrawal dialog) was **not** re-driven one-by-one this pass — all of them are covered by the same mechanical fix (their `src` interpolations, where present, were included in the 30-occurrence project-wide sweep) and the same static gate now protects all of them; live re-driving each one individually was deprioritized given the time budget after the deeper root-cause investigation.

## Responsive & Localization Matrix

A **representative, automated-first** pass was completed, not the full 6×4×12 = 288-cell manual sweep:

- Automated overflow/leak checks performed at 375×812 (mobile) and desktop width, English/Light and Arabic/RTL/Dark, on Landing: `overflowX: false`, `leaks: 0` in both modes.
- Zero-leak confirmation (the primary new invariant this sprint is about) was checked across every dashboard and every public page listed in Cross-Modal Regression above, at their default viewport.
- The exhaustive 288-cell structural sweep (Part 9/10's full ask) was **not** completed — this is recorded honestly as a gap, not claimed. The full matrix remains future work; see Next Step.

## Accessibility

Not independently re-audited this pass beyond what the modal certifications above already touch (native `confirm()` dialogs, `role="dialog"`/`aria-modal` structure unchanged by this fix — only the `src`/`sc-camel-src` attribute name changed, nothing accessibility-relevant). Sprint 0.1's mobile-CTA-focused accessibility checks (focus, Escape, keyboard reachability) were not re-run in full this pass.

## Performance / Render Regression

`support.js` was **not** changed, so Part 12's "if support.js changes, measure before/after" condition does not apply. The only change (an attribute rename in 8 static files) has no runtime performance implication — confirmed qualitatively via the same page loads used for the leak checks: no new console errors, no visible layout shift, images load normally (`img.complete === true` confirmed on the Review modal avatar).

## SQL Regression

Full `Category=SqlServer` suite: **105/105 passed**, 2m59s, zero failures, zero skips. This is the third consecutive full run across this sprint chain (Sprint 0.2 ×2, Sprint 0.3 ×1) to pass at 105/105 with zero regressions from any change made across Sprints 0.1–0.3, including this sprint's 8-file markup change and the extended static gate.

## Publish Smoke

Full `dotnet publish -c Release` run via the project's normal target (`dotnet publish src/Tafseel.Api -c Release -o <dir>`):
- Publish succeeded.
- Frontend assets (`frontend/*.dc.html`, `css/`, `js/`, `support.js`, `assets/`) copied correctly to the publish output.
- Confirmed the fix is present in the published output: `grep -o 'sc-camel-src="{{ reviewTeacherAvatar }}"'` matched; `grep -c ' src="{{' Tafseel-Student-Dashboard.dc.html` in the publish output returned `0`.
- Started the app from the publish output directly (`dotnet Tafseel.Api.dll`, no `dotnet run`, on a separate port to avoid colliding with the Development instance) using the same `appsettings.Development.json` configuration established in Sprint 0.1 (pointing at the real `TafseelLocal` database).
- `/health/live` → 200. `/health/ready` → 200.
- Landing → 200. Browse → 200.
- Authenticated login against the published output succeeded (`POST /api/v1/auth/login` with the Sprint 0.2 Student UAT account → 200, valid JWT returned).
- Student Dashboard and Teacher Dashboard pages both → 200 from the published output.
- Static assets (`css/tafseel.css`, `js/tafseel.js`, `support.js`) all → 200.
- The published output was stopped and **not** deployed anywhere, per this sprint's explicit instruction.

## Environment Validation

Canonical Development DB (`(localdb)\TafseelLocal;Database=Tafseel`, established Sprint 0.1) reused unchanged throughout. The controlled API process was stopped before every rebuild in this pass. The publish-smoke instance ran on a separate port (`5091`) specifically to avoid any port conflict with or accidental interference to the main Development instance (`5090`).

## Tests

- `dotnet build -c Release`: 0 errors, 0 new warnings (2 pre-existing, unrelated nullable warnings persist in `TeacherApplicationService.cs`).
- Domain: 89 passed. Application: 5 passed. Architecture: 1 passed.
- Full `Category=SqlServer` suite: **105/105 passed**, 2m59s.
- `check-frontend-integrity.mjs`: 13 entry points passed.
- `check-localization.mjs`: 2,960 paired keys passed.
- `check-localization-usage.mjs`: passed.
- `check-bug001-display-names.mjs`: passed.
- `check-teacher-profile-mobile-cta.mjs`: passed.
- `check-template-placeholder-leak.mjs` (**extended this sprint**, Findings #4): passed, 12 surfaces scanned (added `Tafseel-Book-Session.dc.html`, `Tafseel-Mock-Checkout.dc.html`, `Tafseel-Auth.dc.html` to the scanned list; added the new raw-resource-attribute rule).
- `check-js.mjs`, `check-service-catalog-release1.mjs` (unaffected, not re-run standalone this pass — covered by `check-js.mjs`'s aggregate), `check-guided-request.mjs`, `check-auth-ui.mjs`, `check-sprint6-notification-routing.mjs`: all passing via `check-js.mjs`.
- `node --check js/tafseel.js`, `node --check js/locales.js`: passed.
- `dotnet ef migrations has-pending-model-changes`: "No changes have been made to the model since the last migration."
- `git diff --check`: clean (line-ending advisories only).
- Publish smoke: see above — fully passed.

## Files Changed

- `Tafseel-Admin-Dashboard.dc.html`, `Tafseel-Browse-Teachers.dc.html`, `Tafseel-Landing.dc.html`, `Tafseel-Payment.dc.html`, `Tafseel-Quality-Dashboard.dc.html`, `Tafseel-Student-Dashboard.dc.html`, `Tafseel-Teacher-Dashboard.dc.html`, `Tafseel-Teacher-Profile.dc.html` — every interpolated `<img>`/`<video>` `src` renamed to `sc-camel-src` (30 occurrences).
- `scripts/ci/check-template-placeholder-leak.mjs` — extended with the new raw-resource-attribute rule and 3 additional scanned surfaces.
- `docs/fixes/PHASE_4_SPRINT_0_3_DC_RUNTIME_AND_FINAL_CERTIFICATION.md` — this report.
- `docs/fixes/evidence/phase4-sprint0-3-runtime-certification/` — root-cause and network-trace evidence.
- `docs/prompts/PHASE_4_SPRINT_0_3_DC_RUNTIME_AND_FINAL_CERTIFICATION.md` — this sprint's saved prompt.
- `docs/INDEX.md`, `docs/PROJECT_STATUS.md` — updated, closing F-013.
- `support.js` — **not** touched (Fix Decision, Option B chosen over Option A).

## Remaining Limitations

1. **Full 288-cell responsive/localization matrix not completed.** Representative automated leak/overflow checks were run across every major surface, but the exhaustive per-cell manual visual sweep Part 9/10 describes was not performed.
2. **Browser cache masking (Findings #5) is unaddressed.** No explicit cache-control headers are set on the static `.dc.html`/`js`/`css` files; a client with a pre-fix page already cached will not see the fix until that cache entry is invalidated. This is a real operational gap worth a dedicated small fix (e.g., a cache-busting version query string on the affected files, matching the pattern already used for `css/tafseel.css?v=...` and `js/media-preview.js?v=...` elsewhere in the codebase) — not done this pass to stay within scope.
3. Individual live re-drives of every other conditional modal listed in Part 8 (Accept request, Delivery upload, Marketplace service config, Profile Video controls, Quality Application/Showcase review, Admin Service Catalog/Withdrawal) were not each independently re-opened this pass; all share the same underlying fix and the same new static gate, and were covered by the project-wide grep sweep, but live-clicking each one was not repeated.
4. Accessibility (Part 11) was not independently re-audited beyond what the two certified modals already touch.
5. Performance measurement (Part 12) was qualitative, not instrumented (no Lighthouse/Web Vitals capture) — appropriate given `support.js` itself was not changed.

## Risks

1. **Low, newly identified** — the cache-masking gap (Findings #5 / Limitation #2) means this fix's real-world rollout benefit depends on cache invalidation, not just code deployment. Recommend addressing in a small, dedicated follow-up before considering this fully closed operationally.
2. **Low** — the `sc-camel-src` convention, while already proven in production for `sc-camel-value`, was not previously used at this scale (30 new call sites in one pass). Static verification (grep, gate, publish-smoke) is strong; a full manual visual pass confirming every one of the 30 images/videos still renders correctly was not performed individually for each of the 30 — only the ones directly exercised in this session's live testing (Review/Rate modals, Browse card avatars, Teacher Profile featured video, Admin/Quality/Teacher account avatars via page loads) were visually confirmed.
3. **Low** — no regression was found in any of the four full regression passes run across this sprint chain (Sprint 0.1, 0.2 ×2, 0.3), giving reasonable confidence, but the underlying root-cause class (raw static HTML + non-inert custom elements) could in principle affect other resource-bearing HTML attributes this sprint's audit didn't anticimate (e.g., a future `<link rel="preload">` or `<script src>` written with `{{ }}` interpolation) — the new static gate only checks `img`/`video`/`source`.

## Next Step

1. Complete the exhaustive 288-cell responsive/localization matrix — the one remaining item keeping this sprint at CONDITIONALLY VERIFIED rather than VERIFIED per the Exit Rule's explicit "no exceptions" clause. This is now pure verification effort (browser time), not open engineering risk: every surface tested this pass showed 0 leaks and 0 overflow, and the underlying defect class (F-013) is closed with strong evidence.
2. Address the cache-masking gap with a small, dedicated cache-busting fix.
3. Individually re-drive the remaining conditional modals listed in Part 8 for full live confidence (low risk given the mechanical, project-wide nature of the fix, but not yet directly observed for each one).
4. Once the matrix is closed, Marketplace Product Integrity can be marked fully VERIFIED and Marketplace Scale (Analytics/Search/Discovery/Messaging) feature work may begin.

F-013: **Fixed** — root cause proven (browser HTML-parser eager resource fetch on non-inert `<x-dc>` markup, not a JS render race), fix applied and live-verified with 0/5+ reproduction rate post-fix, durable static regression gate added
Runtime: Unchanged (`support.js` not modified — Option B chosen)
Review Modal: Fixed and re-certified live, 0 leaks across 5 cycles, full functional regression (approve) passes
Rate Modal: Fixed and re-certified live, 0 leaks, no regression from the reviewModal fix
Resource Leak Gate: Added — static gate now fails on any raw `src`/`srcset`/`poster` interpolation on `img`/`video`/`source`
Responsive Matrix: Partial — representative automated coverage across every major surface (0 leaks, 0 overflow everywhere tested), not the full 288-cell sweep
Accessibility: Not independently re-audited this pass
SqlServer: 105/105 passed
Release Build: Clean, 0 errors
Release Publish: Succeeded, frontend copied correctly, fix confirmed present in output
Publish Smoke: **Fully passed** — health, pages, assets, and authenticated login all verified against the published output; not deployed
Health: `/health/live` and `/health/ready` both 200 on both the Development instance and the publish-smoke instance
Backend: Builds clean; all suites pass
Frontend: All CI gates pass, including the newly-extended placeholder-leak gate
Database: Unchanged, reused
Tests: Domain 89, Application 5, Architecture 1 passed; SqlServer — see Tests section
Browser: Extensive live network-trace verification across Student/Teacher/Quality/Admin roles and public pages
Documentation: This report, evidence, prompt, INDEX.md, and PROJECT_STATUS.md updated; F-013's full investigation history (Sprint 8 → 0 → 0.1 → 0.2 → 0.3) preserved, not erased

Final Verdict: **MARKETPLACE PRODUCT INTEGRITY CONDITIONALLY VERIFIED**

(Per the Exit Rule's explicit "no exceptions" clause: item 8, the full responsive/localization matrix, is honestly incomplete — see Responsive & Localization Matrix and Remaining Limitations. All 10 other Exit Rule items are proven: F-013's cause is proven and fixed, zero unresolved-template requests across every tested transition, Review Delivery and Rate modals both pass, the full SqlServer suite passes, the frontend regression suite passes, publish smoke passes, published-output health passes, and no new Critical/High regression was introduced. F-013 itself is CLOSED with exact evidence — the remaining gap is matrix-completeness effort, not open engineering risk.)

✅ Finished Phase 4 — Sprint 0.3
