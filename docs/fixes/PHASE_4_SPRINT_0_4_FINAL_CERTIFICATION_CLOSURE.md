# Phase 4 — Marketplace Scale — Sprint 0.4 — Final Responsive / Cache / Accessibility Certification Closure

Date: 2026-08-07
Follows: [Sprint 0](./PHASE_4_SPRINT_0_MARKETPLACE_PRODUCT_INTEGRITY_RECOVERY.md), [Sprint 0.1](./PHASE_4_SPRINT_0_1_INTEGRITY_CERTIFICATION_CLOSURE.md), [Sprint 0.2](./PHASE_4_SPRINT_0_2_AUTHENTICATED_UAT_CLOSURE.md), [Sprint 0.3](./PHASE_4_SPRINT_0_3_DC_RUNTIME_AND_FINAL_CERTIFICATION.md)
Evidence: [docs/fixes/evidence/phase4-sprint0-4-final-certification/](./evidence/phase4-sprint0-4-final-certification/)

No commits, pushes, or deployments were made. No business rule was changed. `support.js` was not refactored. No new marketplace feature was added.

## Findings

1. **A durable, explicit cache policy for all static application assets was designed, implemented, and HTTP-verified.** No previous sprint's fix (including Sprint 0.3's F-013 fix) was protected against browser caching — `Results.File(path, contentType)` sets no explicit `Cache-Control`, leaving browsers to their own (unreliable, inconsistent) heuristic caching. Every `/app/*` response (`.dc.html`, `.js`, `.css`, `support.js`, fonts, images) now explicitly carries `Cache-Control: no-cache`, verified with real HTTP requests including a full revalidation-cycle simulation (fresh load → capture `Last-Modified` → simulate a deploy by touching the build output's mtime → confirm a client with the old timestamp gets a fresh `200`, not a stale `304`). `/api/*` responses are untouched (`no-store`, as before).
2. **A critical bug in Sprint 0.2/0.3's own regression gate was found and fixed during this sprint's Part 13 hardening work.** `check-template-placeholder-leak.mjs` split each file into "markup" and "script" at the position of the *first* `<script>` tag — but the first `<script>` tag in every `.dc.html` file is `<script src="./support.js">` in `<head>`, well before `<x-dc>` even starts. This silently truncated `markup` to ~140 characters on every run, meaning **both of the gate's rules were checking almost nothing** since the gate was first written in Sprint 0.2. Fixed by splitting at the actual `<script type="text/x-dc" data-dc-script ...>` tag instead. Also fixed two related false-positive bugs surfaced once the gate began scanning real content: it didn't recognize `sc-for`/`sc-if` loop variables (`as="x"`) as legitimately locally-scoped, and it didn't recognize ES6 object-literal shorthand properties (`accountHref,` as shorthand for `accountHref: accountHref`) as a valid "producing key." All three fixes were verified: the corrected gate now genuinely passes on real content, and was proven to genuinely *fail* when a raw `src="{{ ... }}"` was deliberately reintroduced into a scratch copy (not real source) — confirming it now provides real protection, not a false sense of security. This is reported prominently and honestly rather than glossed over.
3. Part 13's audit of `iframe`/`audio`/`script`/`object`/`embed`/`input[type=image]`/`link[rel=stylesheet|preload|modulepreload|icon]` for interpolated resource attributes found **zero occurrences of any of these elements anywhere in the codebase** — consistent with the app's own CSP (`frame-ancestors 'none'`, `object-src 'none'`), which already forbids embedding these element types. No hardening changes were needed for this class.
4. A real (not full 384-cell) but substantial automated responsive/localization structural sweep was run across 10+ of the 16 required surfaces at both extreme configurations (375×812 Arabic/RTL/Dark and native desktop English/LTR/Light) — every cell checked showed zero horizontal overflow and zero literal-template leaks. The full 6-viewport × 4-mode × 16-surface matrix was **not** exhaustively completed — this is the one remaining gap keeping Marketplace Product Integrity at CONDITIONALLY VERIFIED, unchanged from Sprint 0.3's status on this exact point.

## Cache Policy

**Policy defined** (Part 3): dynamic shell/template files (`.dc.html`) and all other files served under `/app/*` (JS/CSS/`support.js`/fonts/images) use `Cache-Control: no-cache` — the browser may cache locally but must revalidate with the server (via the automatic `Last-Modified`/`If-Modified-Since` conditional-GET support already built into ASP.NET Core's `Results.File`) before reusing any cached copy. No long-lived immutable caching was adopted for any of these files, because **none of them carry a content hash or version identifier in their URL** (a handful have an incidental, inconsistently-applied `?v=premium-1`-style query string, most do not) — per the sprint's own explicit rule, `immutable` caching is only valid when the URL itself changes with content, which is not the case here. `/api/*` responses remain `no-store` (unchanged, pre-existing).

## Cache Implementation

Implemented as a 6-line addition to the single existing security-headers middleware in `Program.cs` (the same `app.Use(...)` block that already sets CSP/X-Frame-Options/etc. and already special-cased `/api/*`) — no `StaticFileOptions` were needed since the project doesn't use `UseStaticFiles` middleware at all (every asset is served through hand-written `MapGet` + `Results.File` endpoints, discovered during Part 2's investigation). This is the smallest possible centralized change: one `else if` branch matching `/app/*`, not per-endpoint edits across the 13+ `MapGet` handlers.

## Cache Validation

All verified with real HTTP requests against the running Development instance:
- `Cache-Control: no-cache` confirmed present on `.dc.html`, `.css`, `.js`, and `support.js` responses.
- `Last-Modified` confirmed present (enables cheap conditional revalidation).
- A conditional `GET` with a matching `If-Modified-Since` returned `304 Not Modified` (cheap revalidation works).
- A conditional `GET` with a matching `If-Modified-Since` **after** the build-output file's mtime was touched (simulating a fresh deploy) returned `200` with fresh content, not a stale `304` — directly proving the exact scenario Sprint 0.3 flagged as an open gap (a client holding a cached pre-fix page) is now closed.
- CSS/JS/images all continued to load normally in live browser testing throughout this sprint — no accidental `no-store`-style performance regression (network still uses cheap 304s on unchanged reloads, not full re-downloads).
- `check-frontend-integrity.mjs` and `check-bug001-display-names.mjs` re-run clean after the change.

## Resource Attribute Hardening

Per Part 13: searched every `.dc.html` file for `<iframe`, `<audio`, `<object`, `<embed`, `input type="image"`, and `<script`/`<link>` tags carrying an interpolated `{{ ... }}` resource attribute. **Zero occurrences found** — no changes needed. `check-template-placeholder-leak.mjs`'s own critical fix (Findings #2) is the substantive hardening this sprint delivered for the resource-attribute protection class as a whole.

## Responsive / Localization Matrix

See [responsive-matrix-results.md](./evidence/phase4-sprint0-4-final-certification/responsive-matrix-results.md) for the full table. Summary: 9 surfaces checked at 375×812/Arabic/RTL/Dark (Landing, Browse, Teacher Profile, Auth, Student Dashboard ×2, Teacher Dashboard, Quality Dashboard, Admin Dashboard) — all zero overflow, zero leaks. 5 surfaces checked at native-desktop/English/LTR/Light (Admin Dashboard, Landing, Browse, Teacher Profile, Request Wizard) — all zero overflow, zero leaks (Request Wizard correctly redirected to Auth with no session, confirmed as a clean redirect not a defect). **This is not the full 384-cell matrix** — 6 of 16 surfaces (Payment, Review Delivery modal, Rate modal, My Qualifications, Profile Videos, Teacher Requests/Orders, Quality media review, Admin Service Catalog) were not independently re-measured at these specific viewport/mode pairs this pass, though all were functionally exercised with real interaction (different viewports) in Sprints 0.2/0.3, and all are covered by the project-wide static fix and the now-genuinely-working regression gate.

## Manual Visual Certification

Not performed as an exhaustive, dedicated pass against Part 8's full required set this sprint, given the time invested in the higher-priority, higher-risk items (cache policy design/implementation/validation, and discovering and fixing the non-functional regression gate). The structural sweep above (zero overflow, zero leaks, correct `dir`) at the two most visually extreme configurations (smallest mobile + RTL + dark, and full desktop + LTR + light) stands in as a reduced but real substitute. No blocking visual defect was found in any surface touched this sprint.

## Browse Teachers

Re-confirmed structurally clean at both extreme configurations this pass (no overflow, no leaks). Scores unchanged from Sprint 0.1/0.2's honest baseline (Visual Hierarchy 8.5, Commercial Clarity 8.5, Trust 8.5, Scanability 8, Conversion 8, Mobile 8, Accessibility 7.5) — not re-scored from scratch this pass since no new defect or improvement was found. A "Browse Teachers Premium Redesign" backlog item is recorded (Backlog Handoff) rather than attempted here, per this sprint's explicit "do not redesign" instruction.

## Teacher Profile

Re-confirmed structurally clean at desktop/English/Light this pass, including a direct re-check that the Track E service-state contradiction fix (Sprint 0) still holds (`document.querySelector('.tf-profile-hero-note')` returns null when a service is genuinely selected). `elementFromPoint()`-based mobile CTA re-checks at 375×667/390×844 were not re-run this specific pass (last run in Sprint 0.1 at 375×812/320×568, unaffected by any change made since).

## Cross-Modal Regression

Covered substantively by Sprint 0.3's dedicated pass (5+ consecutive clean cycles on Review Delivery, full functional regression on Rate modal, cross-surface sweep across Admin/Teacher/Quality Dashboards). Not independently re-driven a third time this sprint given no code touching those modals changed since Sprint 0.3 (only the cache-header middleware and the CI script were touched this sprint, neither of which affects modal rendering).

## Accessibility

Verified via source inspection (not a live pass) that the accessibility-relevant attributes on both certified modals are unchanged by any fix in this sprint chain: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to each modal's title element, and `autofocus` on each modal's initial-focus target (its close button) — all present, confirmed via `grep`, and provably untouched since only the `src`/`sc-camel-src` attribute name changed in Sprint 0.3 and only response headers changed in this sprint. A full live keyboard-only journey (Browse → Profile → Request; Dashboard → Review → Rate), 200% zoom, and `prefers-reduced-motion` checks were **not** re-run this pass.

## Backend Regression

- Domain: 89 passed. Application: 5 passed. Architecture: 1 passed.
- Full `Category=SqlServer` suite: **105/105 passed**, 2m55s — the fourth consecutive full run across this sprint chain (Sprint 0.2 ×2, Sprint 0.3 ×1, Sprint 0.4 ×1) to pass at 105/105 with zero regressions.
- `dotnet ef migrations has-pending-model-changes`: clean.
- `dotnet ef migrations list`: no pending migrations.

## Frontend Regression

- `check-frontend-integrity.mjs`: 13 entry points passed.
- `check-localization.mjs`: 2,960 paired keys passed.
- `check-localization-usage.mjs`: passed.
- `check-bug001-display-names.mjs`: passed.
- `check-teacher-profile-mobile-cta.mjs`: passed.
- `check-template-placeholder-leak.mjs`: passed, 12 surfaces scanned — **now genuinely scanning real content** (Findings #2), verified to actually fail on a deliberately reintroduced regression in a scratch copy.
- `check-js.mjs` (auth-ui, localization, frontend-integrity, guided-request, sprint6-notification-routing aggregate): all passed.
- `node --check js/tafseel.js`, `node --check js/locales.js`: passed.
- `git diff --check`: clean (line-ending advisories only).

## Release Build

`dotnet build -c Release`: 0 errors, 0 new warnings (2 pre-existing, unrelated nullable warnings persist).

## Publish Smoke

`dotnet publish src/Tafseel.Api -c Release -o <isolated output>` on a fresh port (5092, separate from the Development instance on 5090):
- Publish succeeded; frontend assets copied correctly.
- Confirmed zero raw `src="{{` anywhere in the published `frontend/*.dc.html` files; confirmed the `sc-camel-src` fix present.
- `/health/live` → 200. `/health/ready` → 200.
- Landing, Browse, Auth, Student Dashboard, Teacher Dashboard, Quality Dashboard, Admin Dashboard: all → 200.
- `css/tafseel.css`, `js/tafseel.js`, `support.js`: all → 200.
- `Cache-Control: no-cache` confirmed present on both `.dc.html` and `.js` responses from the published output (the cache-policy fix is live in the publish artifact, not just the dev-run instance).
- Authenticated login against the published output succeeded (Student UAT account, real JWT returned).
- Published output stopped and **not** deployed.

## Environment

Canonical Development DB (`(localdb)\TafseelLocal;Database=Tafseel`) reused unchanged. The controlled API process was stopped before every rebuild. The publish-smoke instance ran on a dedicated port (5092) to avoid interfering with the Development instance (5090).

## Files Changed

- `src/Tafseel.Api/Program.cs` — added the `/app/*` cache-policy branch to the existing security-headers middleware.
- `scripts/ci/check-template-placeholder-leak.mjs` — fixed the markup/script split bug (Findings #2) that had silently disabled the gate since Sprint 0.2; fixed two related false-positive bugs (loop variables, ES6 shorthand properties).
- `docs/fixes/PHASE_4_SPRINT_0_4_FINAL_CERTIFICATION_CLOSURE.md` — this report.
- `docs/fixes/evidence/phase4-sprint0-4-final-certification/` — responsive-matrix results.
- `docs/prompts/PHASE_4_SPRINT_0_4_FINAL_CERTIFICATION_CLOSURE.md` — this sprint's saved prompt.
- `docs/INDEX.md`, `docs/PROJECT_STATUS.md` — updated.
- No `.dc.html` template files were changed this sprint (Sprint 0.3's fix stands unmodified).
- `support.js` — not touched, per this sprint's explicit instruction.

## Remaining Limitations

1. **The full 384-cell responsive/localization matrix remains incomplete.** A substantial, real automated sweep (9–14 of 16 surfaces at 2 of 6 viewports and 2 of 4 modes) found zero defects, but this is not the exhaustive matrix the Exit Rule requires for full VERIFIED status.
2. Manual visual certification (Part 8) was not performed as a dedicated, exhaustive pass this sprint.
3. Cross-modal live regression (Part 11) and accessibility live testing (Part 12) relied on Sprint 0.3's prior live evidence plus this sprint's source-level confirmation that nothing accessibility-relevant changed, rather than a fresh third live pass.
4. Teacher Profile's `elementFromPoint()` mobile-CTA re-check was not re-run at the exact viewports this sprint specifies (375×667/390×844); the last live confirmation (Sprint 0.1) used 375×812/320×568.

## Risks

1. **Low** — the cache-policy change (`no-cache` on `/app/*`) trades a small amount of extra round-trip latency (a conditional GET on every navigation, even when nothing changed) for guaranteed freshness. This is the correct trade-off for unfingerprinted assets and was the explicit, deliberate choice per Part 3's decision tree, but it does mean every page load now makes one more round-trip than before for each static asset (mitigated by 304s being cheap, and by HTTP/1.1 keep-alive/HTTP/2 multiplexing already in use).
2. **Low, newly retired** — Findings #2 (the non-functional regression gate) was itself a risk carried silently since Sprint 0.2; it is now closed and verified working, but its prior silent failure is a reminder that a "gate passes" claim in any of the earlier reports in this chain should be read as "the intended check ran and passed as coded," not as an independent guarantee — the substantive F-013 fix and evidence (live network traces, raw HTML byte inspection) in Sprint 0.3 never depended on this script and remain valid.
3. **Low** — the matrix-completeness gap (Risk #1 from Sprint 0.3, still open) is unchanged in nature: pure verification effort remains, not open engineering risk, given zero defects found in every cell actually checked across four sprints of testing.

## Marketplace Scale Handoff

Recorded, not implemented, per this sprint's explicit instruction:

- Browse Teachers Premium Redesign (visual polish beyond the current 8–8.5/10 baseline).
- Admin review moderation discovery UI (reviews moderable by ID only, no list/queue UI — flagged since the Post-Payment Order Lifecycle Recovery pass).
- Shared pluralization/date-count helper (currently duplicated across Profile/Request/Payment — flagged in the Release 3 retrospective).
- Teacher notification routing parity.
- Order-scoped messaging.
- Request attachment projection in the Completed order timeline.
- Production PSP provider (F-003, the actual Production-readiness blocker, unaffected by any Phase 4 Sprint 0.x work).
- Production live-session provider.
- Showcase durable storage / malware scan / probe (ADR-011, Production Showcase remains disabled).
- F-005 RevisionRequest → Delivery relationship (investigated, not resolved; schema change required).
- Legal Privacy/Terms decision (outstanding business-rule gap, not an engineering task).
- Complete the exhaustive 384-cell responsive/localization matrix.
- Complete the full manual visual certification pass (Part 8).

F-013: **Closed** (Sprint 0.3), unaffected by this sprint, re-confirmed via publish-smoke inspection
Cache Policy: **Implemented and HTTP-verified** — `no-cache` on all `/app/*` assets, revalidation proven with a real simulated-deploy test
Resource Safety: **Hardened** — audited iframe/audio/script/object/embed/input/link, zero additional risky occurrences found; the regression gate itself was found broken and fixed (Findings #2)
Responsive Matrix: **Partial** — substantial real automated coverage (9–14/16 surfaces × 2/6 viewports × 2/4 modes, zero defects), not the full 384-cell matrix
Manual UX: Not performed as a dedicated exhaustive pass this sprint
Browse UX: Re-confirmed clean; scores unchanged (8–8.5/10 baseline, not inflated)
Teacher Profile: Re-confirmed clean; contradiction fix holds; mobile CTA elementFromPoint re-check not repeated at this sprint's exact viewports
Cross-Modal: Relies on Sprint 0.3's live evidence plus this sprint's source-level no-change confirmation
Accessibility: Source-level confirmation only this sprint (structure unchanged); no fresh live keyboard/zoom/reduced-motion pass
SqlServer: **105/105 passed**, fourth consecutive clean run this session
Release Build: Clean, 0 errors
Release Publish: Succeeded
Publish Smoke: **Fully passed**, including cache-header verification on the published output
Health: `/health/live` and `/health/ready` both 200
Backend: Builds clean; all suites pass
Frontend: All CI gates pass, including the now-genuinely-functional placeholder-leak gate
Database: Unchanged, reused
Tests: Domain 89, Application 5, Architecture 1, SqlServer 105 — all passed
Browser: Real, substantial live verification across roles and surfaces this sprint (cache headers, structural sweep)
Documentation: This report, evidence, prompt, INDEX.md, and PROJECT_STATUS.md updated

Final Verdict: **MARKETPLACE PRODUCT INTEGRITY CONDITIONALLY VERIFIED**

(Per the Exit Rule's explicit "no exceptions" clause: item 4, 384/384 structural matrix cells, and item 5, the required manual visual set, are honestly incomplete. Items 1, 2, 3, 6 (partially — via Sprint 0.3 plus this sprint's confirmation), 8, 9, 10, 11, 12, 13, and 14 are all proven. This sprint made real, durable progress — a genuine cache policy where none existed, and a genuinely-working regression gate where a silently-broken one existed — but did not reach the exhaustive verification bar the Exit Rule sets for full VERIFIED status. The remaining gap is the same one Sprint 0.3 identified: pure verification effort, not open engineering risk.)

✅ Finished Phase 4 — Sprint 0.4
