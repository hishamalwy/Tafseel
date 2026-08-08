# Phase 4 — Marketplace Scale — Sprint 0.4 — Final Responsive / Cache / Accessibility Certification Closure

Original operator prompt, preserved verbatim for traceability.

---

=========================================
PHASE 4 — MARKETPLACE SCALE
SPRINT 0.4

FINAL RESPONSIVE / CACHE / ACCESSIBILITY
CERTIFICATION CLOSURE
=========================================

## Context

Phase 4 Sprint 0.3 closed the core engineering defect F-013. Marketplace Product Integrity remained CONDITIONALLY VERIFIED only because: (1) the full responsive/localization certification matrix was not completed; (2) static asset/`.dc.html` cache rollout behavior was not yet explicitly governed; (3) several representative conditional dialogs/accessibility states were not individually re-driven after the resource-binding fix. This sprint exists only to close those remaining certification gaps.

Do NOT start Analytics/Search/Discovery/Messaging. Do NOT redesign Browse Teachers, Teacher Profile, or dashboards. Do NOT change qualification/payment/order/review business rules. Do NOT refactor `support.js`. Do NOT add new marketplace features. Do NOT commit, push, or deploy.

## Goal

Reach MARKETPLACE PRODUCT INTEGRITY VERIFIED by completing: (1) the full structural responsive/localization matrix; (2) representative manual visual certification; (3) cross-modal live regression; (4) accessibility regression; (5) an explicit cache-control/cache-busting strategy; (6) a final Release build + publish + smoke + regression. If these pass, close the Marketplace Product Integrity track permanently — do not create Sprint 0.5.

## Part 1 — Reconcile Current Baseline

Read all prior sprint reports, PROJECT_STATUS.md, INDEX.md, current cache/static-file configuration, and current frontend versioning/cache-busting conventions before doing anything. Confirm: F-013 CLOSED, SqlServer 105/105 baseline, Development DB `(localdb)\TafseelLocal;Database=Tafseel`, publish smoke PASS. Do not re-open already-proven business bugs unless live evidence contradicts them.

## Part 2 — Cache Strategy Investigation

Sprint 0.3 found a client holding a cached pre-fix `.dc.html` file may continue running vulnerable markup until invalidated, and static assets have no single explicit, documented caching contract. Do not fix this by adding random query strings page-by-page — first trace ASP.NET Core static-file middleware, response headers for `.dc.html`/`.html`/`.js`/`.css`/images/fonts, current explicit `?v=` conventions, publish output structure, service worker usage if any, and any documented reverse-proxy/CDN config.

## Part 3 — Define Cache Policy

Adopt the smallest Production-safe policy. For dynamic shell/template files (`.dc.html`, `.html`): prefer `Cache-Control: no-cache` or an equivalent revalidation strategy — the browser may cache locally but must revalidate before reusing stale application markup; never use long immutable caching for application HTML/templates. For versioned/fingerprinted static assets (JS/CSS/images/fonts): longer caching is acceptable, but only `immutable` when the URL itself changes with content — never declare an unversioned URL immutable.

## Part 4 — Cache Implementation

Implement the smallest centralized solution (`StaticFileOptions.OnPrepareResponse`, endpoint-specific headers, or an existing static-file helper) rather than editing dozens of pages. At minimum establish explicit cache behavior for `.dc.html`, `.html`, `.js`, `.css`. If JS/CSS is not reliably fingerprinted, do not blindly assign one-year immutable caching — use a conservative revalidation policy. No CDN redesign, no service worker, no bundler migration.

## Part 5 — Cache Validation

Prove with real HTTP responses: the expected `Cache-Control` header is present on `.dc.html`; a browser reload revalidates/receives current markup; pre-fix markup cannot remain indefinitely after deployment. Simulate load → capture headers → modify a harmless marker if necessary → rebuild → reload → prove the current asset is retrieved/revalidated per policy. Do not leave test markers in final source. Also verify CSS/JS/images still load and no accidental no-store performance regression occurs across every asset class.

## Part 6 — Full Responsive / Localization Matrix

Mandatory — every cell must receive automated structural validation. Viewports: 375×667, 390×844, 768×1024, 1024×768, 1280×800, 1440×900. Modes: Arabic/RTL/Dark, Arabic/RTL/Light, English/LTR/Dark, English/LTR/Light. Surfaces (16): Landing, Browse Teachers, Teacher Profile, Request Wizard, Payment, Student Dashboard (active Order), Student Dashboard (Completed Order), Review Delivery modal, Rate Teacher modal, Teacher Dashboard My Qualifications, Teacher Dashboard Profile Videos, Teacher Dashboard Requests/Orders, Quality Dashboard Applications, Quality Dashboard media review, Admin Dashboard Service Catalog, Auth. Total: 6×4×16 = 384 automated matrix cells. Do not claim the matrix complete unless all 384 structural checks ran.

## Part 7 — Automated Matrix Assertions

For every cell verify: document width ≤ viewport width (1px tolerance); no horizontal scrollbar from app content; no fixed/sticky CTA outside viewport; no modal outside viewport; no clipped actionable control; no unresolved `{{ ... }}`; no `%7B%7B` resource request; no missing localization key; no `undefined`/`NaN`/raw null rendering; no GUID-like party name where a display name is expected; correct document `dir`; expected language active; no runtime console error; no failed first-party resource from application markup; primary CTA visible when business state requires it; modal action buttons reachable; body not permanently scroll-locked after closing a modal. Record per-cell status; save machine-readable (JSON) plus human-readable (Markdown) evidence.

## Part 8 — Manual Visual Certification

Automated geometry is not enough. Manually inspect a required minimum set spanning mobile (375 AR/RTL/Dark: Browse, Teacher Profile, Student Dashboard, Review modal, Teacher Dashboard, Quality Dashboard; 390 EN/Light: Browse, Teacher Profile, Rating modal, Teacher Profile Videos), tablet (768 AR/Light: Request, Payment, Teacher Dashboard, Admin Service Catalog), desktop (1440 EN/Light: Landing, Browse, Teacher Profile, Student Dashboard, Teacher Dashboard, Quality Dashboard, Admin Dashboard), and dark desktop (1280 EN/Dark: Profile, Payment, Student Dashboard). Judge visual hierarchy, spacing, typography, commercial clarity, RTL composition, card balance, button hierarchy, sticky/fixed elements, modal proportions, media sizing, empty/loading states. Do not redesign unless a real blocking visual defect is found — cosmetic opportunities go to backlog.

## Part 9 — Browse Teachers Final Certification

Do not redesign. Re-check the current card at 375/390/768/1440, AR+EN, verifying identity scans immediately, no duplicate primary Subject, additional Subjects render once, language not unnecessarily duplicated, price readable, CTA clear, negative availability de-emphasized, Save/Compare do not navigate, profile/card navigation works, no text clipping, no badge collision. Provide final honest scores (Visual Hierarchy, Commercial Clarity, Trust, Scanability, Conversion, Mobile, Accessibility) — if still ~8–8.5, keep it that way, do not inflate; record a future "Browse Teachers Premium Redesign" backlog item if warranted.

## Part 10 — Teacher Profile Final Certification

Verify default service selected; selected card/sidebar/CTA synchronized; price prominent; service switching updates all facts; no "No services available" contradiction; media carousel correct; teaching-video no-download UI; no mobile CTA overlap; Save/Share/Message reachable; Arabic RTL layout clean. Re-run `elementFromPoint()` checks at 375×667 and 390×844.

## Part 11 — Cross-Modal Live Regression

Sprint 0.3 mechanically fixed the full raw-src class; now live-open the representative dialogs individually (Student: Review Delivery, Rate Teacher; Teacher: Accept Request, Delivery Upload, Marketplace Service configuration; Quality: Teacher Application review, Showcase/media review where fixture permits; Admin: Service Catalog editor, review moderation or another resource-bearing modal where applicable). For every dialog: open, inspect resource requests, interact, close, reopen. Expected: 0 unresolved-template resource requests.

## Part 12 — Accessibility Certification

For every representative dialog verify `role="dialog"` where expected, `aria-modal`, accessible name, initial focus, Tab stays within the modal where trapping is designed, Shift+Tab, Escape closes where the business action allows, focus returns to the triggering control, no hidden modal element remains focusable, visible focus indicator. For critical consumer surfaces verify a keyboard-only journey (Browse → Profile → Request; Student Dashboard → Review Delivery → Rate). Also verify 200% browser zoom usability, no critical horizontal scroll, and that `prefers-reduced-motion` does not make controls unusable. Do not introduce an accessibility framework — fix only proven defects.

## Part 13 — Resource-Attribute Policy Hardening

Sprint 0.3's gate currently protects `img`/`video`/`source`. Audit other eager-resource-capable markup patterns: `iframe src`, `audio src`, `script src`, `object data`, `embed src`, `input type=image src`, `link href` when `rel` is stylesheet/preload/modulepreload/icon. Do not rewrite safe static attributes — detect only interpolated `{{ ... }}` resource attributes that can trigger a browser fetch before DC hydration. If any exist, convert using the existing safe DC convention or another already-supported inert mechanism, and extend the static gate to cover the verified resource-bearing element/attribute combinations. Do not treat ordinary `<a href="{{ ... }}">` as the same problem.

## Part 14 — Cache + Resource Regression Gates

Add/extend CI checks so future work catches: raw interpolated eager-resource attributes; missing cache policy for `.dc.html` if practical at integration level; literal-template network URLs in browser regression. Do not build a large custom test framework — use existing scripts/integration infrastructure.

## Part 15 — Full Backend / Frontend Regression

Run Domain, Application, Architecture, full `Category=SqlServer` (current expected minimum baselines: 89/5/1/105). Run `check-frontend-integrity`, localization parity, localization usage, BUG-001 display-name gate, Teacher Profile mobile CTA gate, template/resource-placeholder gate, guided request checks, auth UI checks, notification routing checks, JS syntax, EF pending-model, migrations list, `git diff --check`. 0 failures required.

## Part 16 — Release Build / Publish Smoke

Run clean `dotnet build -c Release`, then `dotnet publish src/Tafseel.Api -c Release -o <isolated-output>`, run the app from the published output, and verify `/health/live` 200, `/health/ready` 200, Landing 200, Browse 200, Auth 200, Student Dashboard 200, Teacher Dashboard 200, Quality Dashboard 200 with auth, Admin Dashboard 200 with auth, CSS/JS/support.js 200, correct cache headers in the published output, the `sc-camel-src` fix present, and no raw interpolated eager-resource attribute in the published frontend. Do NOT deploy.

## Part 17 — Documentation / Roadmap Closure

Create `docs/fixes/PHASE_4_SPRINT_0_4_FINAL_CERTIFICATION_CLOSURE.md` and `docs/fixes/evidence/phase4-sprint0-4-final-certification/`. Save this prompt as `docs/prompts/PHASE_4_SPRINT_0_4_FINAL_CERTIFICATION_CLOSURE.md`. Update `docs/INDEX.md` and `docs/PROJECT_STATUS.md`, recording Sprint 0/0.1/0.2 COMPLETE, Sprint 0.3 F-013 CLOSED, and Sprint 0.4 FINAL CERTIFICATION. If all exit rules pass, record Marketplace Product Integrity: VERIFIED / CLOSED.

## Backlog Handoff

Do not implement future backlog items now — only record them: Browse Teachers Premium Redesign; Admin review moderation discovery UI; shared pluralization/date-count helper; Teacher notification routing parity; order-scoped messaging; request attachment projection in completed timeline; Production PSP provider; Production live-session provider; Showcase durable storage/malware scan/probe; F-005 RevisionRequest→Delivery relationship; legal Privacy/Terms decision. No Analytics/Search/Discovery implementation yet.

## Exit Rule

Mark MARKETPLACE PRODUCT INTEGRITY VERIFIED only if all are true: (1) F-013 remains closed; (2) resource attribute audit passes; (3) runtime/resource regression gate passes; (4) 384/384 structural matrix cells pass, or every failed cell is fixed and re-run; (5) required manual visual set passes; (6) representative cross-modal live regression passes; (7) accessibility checks pass with no Critical/High issue; (8) cache strategy implemented and HTTP-verified; (9) full SqlServer suite passes; (10) frontend regression passes; (11) Release build passes; (12) publish passes; (13) published-output smoke passes; (14) health passes; (15) no Critical/High Product Integrity defect remains. If any item is not completed: CONDITIONALLY VERIFIED. No exceptions.
