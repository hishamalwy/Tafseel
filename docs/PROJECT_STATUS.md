# Tafseel Project Status

Last updated: 2026-08-02.

## Teacher Growth & Profile Curation

Two Teacher-side product gaps were closed locally:

1. **Additional Subject Qualification** — Dashboard **My Qualifications / مؤهلاتي**, Apply `?mode=additional` subject filtering, qualifications matrix API, and revoked-subject reactivation on approve. Existing multi-subject application model reused.
2. **Approved Video Profile Curation** — `IsProfileVisible` / `ProfileDisplayOrder` / `IsProfileFeatured` on `TeacherTeachingSample`, Teacher Dashboard **Profile Videos / فيديوهات البروفايل**, and public projection gated by Teacher selection AND eligibility. Migration `20260802083847_TeacherProfileVideoCuration` generated, not applied (legacy visibility preserved).

Status **conditionally verified**: domain tests pass; focused integration coverage added; full browser matrix and migration apply remain Staging follow-ups. See [feature report](./features/TEACHER_GROWTH_AND_PROFILE_CURATION_REPORT.md), [ADR-012](./decisions/ADR-012-TEACHER-GROWTH-AND-PROFILE-CURATION.md), [migration](./database/TEACHER_PROFILE_CURATION_MIGRATION.md).

## Consumer Marketplace Experience (Phase 3 Release 3)

A full Student-journey audit (Landing → Browse → Profile → Samples → Services → Request → Payment → Order lifecycle → Reviews) was run against the rendered code. Landing and Teacher Profile were reviewed and found structurally sound — no changes required. Browse Teachers had three real, fixed issues: a "Verified only" filter that rendered as a broken stretched checkbox instead of a toggle switch, emoji glyphs (⌕/♥/♡) inconsistent with the SVG icon language already established on Teacher Profile, and ragged card heights from unclamped bio text. All three were fixed and browser-verified across English/Arabic, light/dark, and 1440/375px with zero console errors; frontend integrity, localization parity, localization usage-coverage, and the BUG-001 display-name checks all passed. The Request Wizard through Rating portion of the journey was **not** re-audited or changed in this pass. See [Phase 3 Release 3 report](./fixes/PHASE_3_RELEASE_3_CONSUMER_MARKETPLACE_EXPERIENCE.md).

### Sprint 2 — Teacher Profile

A dedicated 10-part audit of Teacher Profile (Student's "sales page") found the page already mature from prior polish passes, but caught two real, live-browser-proven defects: on mobile (375×812 and similar short-content cases), the Save/Share/Message row was unreachable on first paint because it sat directly under the fixed bottom CTA bar (`document.elementFromPoint()` resolved to the bar, not the button) — fixed via a scoped `pointer-events` split that keeps the real CTA link clickable while letting taps pass through the bar's non-interactive padding to whatever is genuinely underneath. Separately, the "Share" action showed a false "link copied" success toast even when `navigator.clipboard.writeText()` failed — fixed to only flash on confirmed success (with a legacy-copy fallback). Both fixes were verified across English/Arabic, RTL/LTR, light/dark, and 375–1440px with zero console errors. A significant but higher-risk finding — three superimposed generations of Teacher Profile CSS left over from earlier redesigns, confirmed via `grep` to be scoped only to this one page but too entangled (shared class names, partial cascade overrides) to safely bulk-delete — was investigated, precisely documented, and deliberately deferred to its own dedicated cleanup pass rather than risked in this sprint. See [Sprint 2 report](./fixes/PHASE_3_RELEASE_3_SPRINT_2_TEACHER_PROFILE.md).

### Sprint 2.1 — Mobile CTA Visual Overlap Closure

Sprint 2's `pointer-events` fix restored click-through but not the visual overlap itself; this pass closed it properly with a live-measured (not guessed) dynamic clearance that pulls the identity card up by exactly the overlap detected via real `getBoundingClientRect()`/`elementFromPoint()` measurement — **zero first-paint overlap confirmed at all 7 required viewports** (320×568 through 768×1024) across English/Arabic × light/dark, zero console errors. Along the way this found a more serious issue than the original ask: at short viewports, the "Message" link could sit exactly under the bar's real "Request this service" link, so a tap could misfire onto the wrong action — now fixed. Two implementation bugs were found and fixed during the work itself: a dev-server/browser caching trap that served stale code during verification, and a self-referential measurement oscillation where the fix's own effect on layout fooled the next measurement into undoing itself. Also added a truthful mobile no-service state (no fake fixed CTA bar, no fabricated copy, reuses the existing localized "No services available" string) verified via DOM simulation since Development has no zero-service teacher fixture. Status is **conditionally verified**: the bookable/live-session CTA path wasn't independently re-tested, and the inherent (not first-paint) mid-scroll transit case still relies on the `pointer-events` backstop rather than being geometrically eliminated. See [Sprint 2.1 report](./fixes/PHASE_3_RELEASE_3_SPRINT_2_1_MOBILE_CTA_OVERLAP.md).

### Sprint 3 — Request Wizard

The Guided Request wizard was audited as a marketplace purchase continuation of Teacher Profile. Critical conversion defects: Students lost teacher/price/delivery/revisions after step 1; success copy misused catalog delivery hours as a fabricated reply SLA; review pricing looked payable immediately; mobile progress labels overlapped. Fixed with a persistent commercial context rail, honest pay-after-accept messaging, corrected success next-steps + dual CTAs, service-card delivery/revisions, goal guidance, and mobile progress truncation — frontend only, ADR-008 preserved. Browser-verified EN/AR, light/dark, 375–1440, including a live submit success dialog. Status **conditionally verified** (multi-file upload matrix and Payment surface deferred). See [Sprint 3 report](./fixes/PHASE_3_RELEASE_3_SPRINT_3_REQUEST_WIZARD.md).

### Sprint 4 — Payment Experience & Consumer Confidence

Student Payment + Mock Checkout were audited as the conversion close of Accept → Order → Pay. Critical defects: commercial context dropped after the Request Wizard; coupon ghost UI; mock/idempotency stranding (`payment-order-*` vs existing `payment-*` keys) left Students with “Payment has already been initiated” and no resume; thin success/failure paths. Fixed with a Request-parity commercial rail, honest Staging mock labeling, aligned idempotency + gated mock resume, mobile sticky CTA, and webhook-honest next steps — frontend only; fee lines remain Order DTO totals unchanged. Browser-proven pay → mock fail → succeed, cancel return, EN/AR light/dark samples at 375–1440. Status **conditionally verified** (remaining viewport×locale screenshot pairs and live-session payment re-drive). See [Sprint 4 report](./fixes/PHASE_3_RELEASE_3_SPRINT_4_PAYMENT_EXPERIENCE.md).

### Sprint 6 — Reviews, Rating & Notification Deep Links

Student rating / completed-order clarity / notification deep links audited against the Governance review domain. Backend: Order DTO review state (`hasReview`, owner-safe score/comment/visibility, `reviewCanSubmit`); public `PublicTeacherReviewDto` without OrderId/StudentId; student OrderCompleted + ReviewSubmitted/ReviewModeration notifications; NewMessage link → conversation. Frontend: `Tafseel.notificationRoute`, rate modal privacy/service copy, completed filter includes cancelled, Files labeled unavailable, Reviews list from owned completed reviews. Phase9 tests extended for eligibility, restore aggregates, and DTO leakage. Status **conditionally verified** (full browser Deliver→Rate re-drive + responsive matrix remain). See [Sprint 6 report](./fixes/PHASE_3_RELEASE_3_SPRINT_6_REVIEWS_RATING_NOTIFICATIONS.md).

### Sprint 5 — Post-Purchase Experience

Student Order Timeline / delivery review were audited as the anxiety reducer after payment. Critical defects: `?section=orders` blanked the dashboard main pane; paid-but-unstarted chips rendered error-red; timeline was history-only with no current-step map; delivery cards lacked Latest / version clarity; waiting states had no guidance. Fixed with safe deep-link mapping, order hero + honest five-step progress (no %), stage guides, delivery newest-first labeling, and rating after-note — frontend only; lifecycle and revision rules unchanged. Browser-proven on payment-confirmed fixtures. Status **conditionally verified** (Delivered/Revision/Completed live re-drive and full responsive screenshot matrix remain). See [Sprint 5 report](./fixes/PHASE_3_RELEASE_3_SPRINT_5_POST_PURCHASE_EXPERIENCE.md).

## Marketplace Service Governance

Phase 3 Release 1 is **implemented locally and conditionally verified**. The existing `ServiceCatalogItem` now owns finite category/order/qualification/icon and complete commercial policy; Admin governance, centralized validation and rename-safe Request/Order/booking snapshots are present. Migration `20260801135831_MarketplaceServiceCatalogRelease1` is generated but not applied. Releases 2–4 remain deferred. See the [governance ADR](./decisions/ADR-005-MARKETPLACE-SERVICE-GOVERNANCE.md), [Release 1 report](./features/MARKETPLACE_SERVICE_CATALOG_RELEASE_1_REPORT.md) and [migration report](./database/MARKETPLACE_SERVICE_CATALOG_RELEASE_1_MIGRATION.md).

## Teacher Profile Premium Polish

The approved Teacher Profile architecture now uses an intentional educational fallback avatar, coherent inline-SVG actions and service facts, stronger qualification/price/CTA hierarchy, and a localized post-purchase review empty state. Release build and frontend gates pass, authenticated media playback remains healthy, and the 24-case browser matrix passed without overflow, duplicate IDs, or console errors. Status is **conditionally verified** because the real Development sample is unrelated to its mathematics title and the listing data remains too sparse to meet a Preply-level content bar; those are source-content defects that this UI-only pass did not fabricate around. See [Teacher Profile Premium Polish](./fixes/TEACHER_PROFILE_PREMIUM_POLISH_REPORT.md).

## Teacher Profile Carousel Polish

The approved video-first carousel now renders one trust badge, one visible title, a compact numeric position, localized SVG Previous/Next controls, direction-aware RTL/LTR keyboard behavior, and the existing one-video/no-navigation state. Release build and frontend gates pass, and the 20-case normal-browser matrix passed without overflow or console errors. Status is **conditionally verified** because Development has no legitimate one-video browser fixture and the in-app browser does not synthesize touch events; the production swipe and one/multiple-video helpers are covered by focused executable checks. See [Teacher Profile Carousel Polish](./fixes/TEACHER_PROFILE_CAROUSEL_POLISH_REPORT.md).

## Teacher Profile Final Quality Recovery

The actual Development teacher now renders `معلم تفصيل` in Arabic and `Tafseel Teacher` in English after an authenticated data correction and Development seed fix. Hidden legacy profile DOM was deleted, the compact zero-review state remains honest, and the responsive Arabic/English light/dark matrix passed at six widths. Status is **fixed but conditionally verified** only because Development has no legitimate populated-review browser fixture. See [Teacher Profile Final Quality Recovery](./fixes/TEACHER_PROFILE_FINAL_QUALITY_REPORT.md).

## Final Staging Certification

Automated final regression gates passed on 2026-08-01. The startup blocker was classified as **Port/Process Conflict** and was restored with the explicit `TafseelLocalDb` connection. The focused recovery classified the browser defect as **CSP / media-src Issue** and applied the smallest shared CSP/renderer/media-state fix; the rebuilt normal-browser rerun is still required before staging readiness. See [Final Staging Certification report](./reports/FINAL_STAGING_CERTIFICATION_REPORT.md) and [Teacher Profile Media & UX Recovery](./fixes/TEACHER_PROFILE_MEDIA_UX_RECOVERY_REPORT.md).

## Current Version

No release tag is present. Current audited baseline is commit `79be4cf` on `main`, plus uncommitted Live-Session Availability and concurrent Catalog/Teacher Application working-tree changes.

## Current Phase

The Final Production Readiness Audit (Step 8 / 8) is complete: **READY FOR STAGING VALIDATION**, not Production. The public Teacher Profile conversion redesign is conditionally verified in a normal browser: its rendered structure now has a featured media experience, integrated conversion panel, localized naming, and responsive layouts. Critical blockers remain Mock-only payment/live-session providers (F-003), local file storage (F-004), ADR-011 Showcase media gates, and unproven backup/observability. Steps 5–7 trust badge / public-profile work remain as previously recorded.

## Current Milestone

Roadmap Steps 1–9 are recorded. **Product Bug Fix Sprints 1–3** closed end-user integrity/i18n gaps. **Step 9 Production Infrastructure** added Azure Blob storage, configuration-driven provider selection, fail-closed Production gates, opt-in Application Insights, and ops runbooks. **Mock Payment Simulator** enables full Student→Payment→Delivery lifecycle in Development (and explicitly enabled Staging) through the canonical webhook path. **Order/Request UX separation** ensures Accepted Learning Requests never appear beside their Orders on the Student dashboard. **Post-Payment Order Lifecycle Recovery** fixed the payment-state projection bug that blocked the canonical lifecycle past payment confirmation, and browser-proved Start Work → Delivery → Revision → Completion → Review → Rating end-to-end for the first time. **Remaining Production cutover blockers:** real PSP adapter, real meeting provider, provisioned Azure Blob/Insights secrets, backup drill evidence.

## Current Architecture Status

The Domain/Application/Infrastructure/API layering is intact. Existing Identity/JWT, EF Core/SQL Server, SignalR messaging, Resend email, finance foundations and DC/React frontend conventions remain unchanged. Documentation now has canonical architecture summaries and accepted ADRs.

## Production Readiness

**Not Ready for Production** — **READY FOR STAGING VALIDATION** (Mock/single-instance Staging only)

Real payment and live-session providers are not registered, Production file storage is not durable/shared, Showcase Production media gates are incomplete (feature correctly disabled), backup/restore and centralized observability are unproven, and browser E2E remains conditional. See [Final readiness report](./reports/FINAL_PRODUCTION_READINESS_REPORT.md).

## Completed Phases

Historical implementation phases 2–11 and completed production-correction passes are indexed in [INDEX.md](./INDEX.md). The F-005 investigation is documentation-only and remains uncommitted.

## Completed Features

| Finding | Status | Report |
|---|---|---|
| Consumer Marketplace Experience — Sprint 6 (Reviews / Notifications) | Conditionally verified — review state + deep links + Files honesty; Phase9 passed | [Sprint 6 report](./fixes/PHASE_3_RELEASE_3_SPRINT_6_REVIEWS_RATING_NOTIFICATIONS.md) |
| Consumer Marketplace Experience — Sprint 5 (Post-Purchase) | Conditionally verified — timeline hero/progress + payment-return deep-link browser-proven | [Sprint 5 report](./fixes/PHASE_3_RELEASE_3_SPRINT_5_POST_PURCHASE_EXPERIENCE.md) |
| Consumer Marketplace Experience — Sprint 4 (Payment Experience) | Conditionally verified — commercial context, mock resume, success/failure next-steps browser-proven | [Sprint 4 report](./fixes/PHASE_3_RELEASE_3_SPRINT_4_PAYMENT_EXPERIENCE.md) |
| Consumer Marketplace Experience — Sprint 3 (Request Wizard) | Conditionally verified — commercial context rail + honest success path | [Sprint 3 report](./fixes/PHASE_3_RELEASE_3_SPRINT_3_REQUEST_WIZARD.md) |
| Consumer Marketplace Experience — Sprint 2.1 (Mobile CTA overlap closure) | Conditionally verified — zero first-paint overlap at all 7 required viewports | [Sprint 2.1 report](./fixes/PHASE_3_RELEASE_3_SPRINT_2_1_MOBILE_CTA_OVERLAP.md) |
| Consumer Marketplace Experience — Sprint 2 (Teacher Profile) | Two real defects fixed and browser-verified; CSS-cleanup deliberately deferred | [Sprint 2 report](./fixes/PHASE_3_RELEASE_3_SPRINT_2_TEACHER_PROFILE.md) |
| Consumer Marketplace Experience (Phase 3 Release 3) | Conditionally closing — Browse→Profile→Request→Payment→Timeline→Reviews/deep-links done; live rate E2E + responsive matrix remain | [Phase 3 Release 3 report](./fixes/PHASE_3_RELEASE_3_CONSUMER_MARKETPLACE_EXPERIENCE.md) |
| Marketplace Service Governance | Decision complete; ready for implementation | [Governance decision report](./reports/MARKETPLACE_SERVICE_GOVERNANCE_DECISION_REPORT.md) |
| Marketplace Service Catalog Release 1 | Implemented locally; migration not applied | [Release 1 report](./features/MARKETPLACE_SERVICE_CATALOG_RELEASE_1_REPORT.md) |
| F-001 Development-only identity initialization | Fixed locally | [F-001 report](./fixes/TAFSEEL_F001_IDENTITY_INITIALIZATION_FIX_REPORT.md) |
| Teacher qualification application contract and UX | Fixed locally | [Teacher qualification report](./fixes/TEACHER_QUALIFICATION_APPLICATION_FIX_REPORT.md) |
| Teacher qualification application browser validation | Conditionally Verified | [Browser validation report](./fixes/TEACHER_QUALIFICATION_BROWSER_VALIDATION_REPORT.md) |
| F-002 Public teacher metrics integrity | Fixed locally | [F-002 report](./fixes/F002_TEACHER_METRICS_INTEGRITY_REPORT.md) |
| Owned Order lifecycle timeline | Completed locally | [Timeline report](./features/PHASE2_ORDER_TIMELINE_REPORT.md) |
| Teacher comparison | Conditionally Verified | [Teacher comparison report](./features/TEACHER_COMPARISON_REPORT.md) |
| Teacher availability and capacity product decision | Decision complete | [Decision report](./reports/TEACHER_AVAILABILITY_CAPACITY_DECISION_REPORT.md) |
| Live-session availability summary | Conditionally Verified | [Availability report](./features/LIVE_SESSION_AVAILABILITY_SUMMARY_REPORT.md) |
| Teacher Portfolio Moderation and Showcase Workflow | Decision complete | [Portfolio moderation decision](./reports/TEACHER_PORTFOLIO_MODERATION_DECISION_REPORT.md) |
| Limited Teacher Showcase MVP | Conditionally verified | [Showcase MVP report](./features/TEACHER_SHOWCASE_MVP_REPORT.md) |
| Student Request Assistant and Guided Request UX | Decision complete | [Request assistant decision](./reports/STUDENT_REQUEST_ASSISTANT_DECISION_REPORT.md) |
| Limited Guided Request UX | Conditionally verified | [Guided Request UX report](./features/LIMITED_GUIDED_REQUEST_UX_REPORT.md) |
| Student Learning Preferences | Decision complete | [Preferences decision](./reports/STUDENT_LEARNING_PREFERENCES_DECISION_REPORT.md) |
| Limited Student Learning Preferences MVP | Conditionally verified | [Preferences MVP report](./features/STUDENT_LEARNING_PREFERENCES_MVP_REPORT.md) |
| Teacher Reputation and Badge Rules | Decision complete | [Reputation badges decision](./reports/TEACHER_REPUTATION_BADGES_DECISION_REPORT.md) |
| Limited Teacher Trust Badge MVP | Conditionally verified | [Trust badge MVP report](./features/TEACHER_TRUST_BADGE_MVP_REPORT.md) |
| Teacher Showcase Production Media Hardening | Decision complete | [Showcase production hardening plan](./reports/TEACHER_SHOWCASE_PRODUCTION_HARDENING_PLAN.md) |
| Teacher Public Profile Hardening Investigation | Investigation complete | [Step 7 investigation](./audits/STEP7_TEACHER_PUBLIC_PROFILE_HARDENING_INVESTIGATION.md) |
| Teacher Public Profile Hardening | Completed | [Step 7 hardening report](./fixes/STEP7_PUBLIC_PROFILE_HARDENING_REPORT.md) |
| Final Production Readiness Audit | Completed | [Final readiness report](./reports/FINAL_PRODUCTION_READINESS_REPORT.md) |
| Product UX Polish (pre-production) | Completed locally | [UX polish report](./fixes/PRODUCT_UX_POLISH_REPORT.md) |
| Product Bug Fix Sprint 1 | Completed locally | [Sprint 1 bug fix report](./fixes/PRODUCT_BUG_FIX_SPRINT_01_REPORT.md) |
| Product Bug Fix Sprint 2 | Completed locally | [Sprint 2 bug fix report](./fixes/PRODUCT_BUG_FIX_SPRINT_02_REPORT.md) |
| BUG-001 display-name regression | Verified | [BUG-001 report](./fixes/BUG001_DISPLAY_NAME_REGRESSION_FIX_REPORT.md) |
| Product Bug Fix Sprint 3 | Conditionally verified | [Sprint 3 bug fix report](./fixes/PRODUCT_BUG_FIX_SPRINT_03_REPORT.md) |
| Production Operational Readiness (Step 9) | Conditionally ready | [Operational readiness report](./reports/PRODUCTION_OPERATIONAL_READINESS_REPORT.md) |
| Mock Payment End-to-End Simulator | Completed locally | [Mock payment simulator report](./reports/MOCK_PAYMENT_SIMULATOR_REPORT.md) |
| Order vs Request UX Separation | Conditionally verified | [Order/Request UX separation report](./fixes/ORDER_REQUEST_UX_SEPARATION_REPORT.md) |
| Order Journey Browser Certification | Blocked (superseded same day) | [Order journey browser certification report](./fixes/ORDER_JOURNEY_BROWSER_CERTIFICATION.md) |
| Post-Payment Order Lifecycle Recovery | **Recovered and verified** | [Recovery report](./fixes/POST_PAYMENT_ORDER_LIFECYCLE_RECOVERY_REPORT.md) |
| RoleBootstrap Fast-Path CI Fix | Fixed | [RoleBootstrap fix report](./fixes/ROLE_BOOTSTRAP_FAST_PATH_CI_FIX_REPORT.md) |
| Teacher Profile Conversion Redesign | Conditionally verified | [Conversion redesign report](./fixes/TEACHER_PROFILE_CONVERSION_REDESIGN_REPORT.md) |
| Teacher Profile Final Quality Recovery | **Fixed; conditionally verified** | [Final quality report](./fixes/TEACHER_PROFILE_FINAL_QUALITY_REPORT.md) |

## Open Findings

| ID | Severity | Classification | Status |
|---|---|---|---|
| F-002 | High | Production Bug | Fixed locally |
| F-003 | Critical | Deployment | Open |
| F-004 | High | Deployment | Open |
| F-005 | High | Missing Relationship | Investigated; not fixed |
| F-006 | Medium | API Bug | Open |
| F-007 | High | API Bug | Open |
| F-008 | High | Business Rule | Blocked |
| F-009 | Medium | Technical Debt | Open |
| F-010 | Critical | UI Bug | **Fixed** — canonical `Tafseel.orderPresentation()` helper now derives stage/action from `Order.Status` **and** `Order.PaymentStatus` together on both dashboards. See [recovery report](./fixes/POST_PAYMENT_ORDER_LIFECYCLE_RECOVERY_REPORT.md). |
| F-011 | High | UI Bug | **Fixed** — `componentDidUpdate` was comparing against a `prevState` argument the DC runtime never provides (only `prevProps`); now tracks step via an instance field. Live-verified zero console errors across the Request/Dashboard/Payment/Checkout pages. |
| F-012 | Medium | Localization Bug | **Fixed** — key added; a new `check-localization-usage.mjs` CI check now catches referenced-but-undefined keys generally (paired-key parity alone could not). |

Details are in the [Phase 0–1 audit](./audits/TAFSEEL_PHASE_0_1_AUDIT_REPORT.md).

## Completed Vertical Slices

| Slice | Status |
|---|---|
| Owned Order Lifecycle Timeline | Completed locally |
| Teacher Comparison | Implemented locally; browser conditional |
| Teacher Availability and Capacity | Session-availability slice implemented locally; request capacity deferred |
| Teacher Portfolio Moderation and Showcase Workflow | Limited MVP implemented locally; browser conditional |
| Student Request Assistant and Guided Request UX | Decision complete; Limited Guided UX implemented locally; browser conditional |
| Student Learning Preferences | Decision complete; Limited MVP implemented locally; browser/SQL conditional |
| Limited Teacher Trust Badge | Conditionally verified; SQL passed on TafseelLocal; browser chips pending seed |
| Teacher Showcase Production Hardening | Decision complete; Phase 1 Blob provider next |
| Teacher Public Profile Hardening | Completed |
| Final Production Readiness Audit | Completed — Staging validation ready; Production blocked |
| Product UX Polish | Completed locally — navigation/honesty/busy/a11y; residual modal Escape/toast adoption remain |
| Product Bug Fix Sprint 1 | Completed locally — GUID names, accept lists, teacher file download; localization/button audit remain |
| Product Bug Fix Sprint 2 | Completed locally — seeded UAT, notif bodies, Pay/Start-work, dashboard i18n; email lang BR + residual Admin chrome remain |
| BUG-001 display-name regression | Verified — `participantLabel` no longer renders GUID prefixes; Order/Messages show real names |
| Product Bug Fix Sprint 3 | Conditionally verified — Quality rawStatus/priority/chrome + Admin nav/money/status; email ADR + full viewport matrix remain |
| Production Operational Readiness | Conditionally ready — Azure Blob + config-driven providers + ops docs; real PSP/meeting adapters still required for Production boot |
| Post-Payment Order Lifecycle Recovery | Completed and browser-verified — F-010/F-011/F-012 fixed; full canonical lifecycle (Start Work → Delivery → Revision → Approve → Completed → Review → Rating) proven end-to-end through real UI controls |

Historical feature phases are indexed in [INDEX.md](./INDEX.md).

## Pending Vertical Slices

1. F-003 — real `IPaymentProvider` sandbox + Production fail-closed (highest Critical blocker).
2. F-003 companion — real `ILiveSessionLinkProvider`.
3. Phase 1 — Azure Blob Provider (ADR-011 / F-004); Production Showcase stays disabled.
4. Seed published qualified Teachers for deferred trust-badge browser smoke.
5. F-005 revision-to-delivery relationship decision.
6. Favorites pagination (F-006).
7. Highly Rated and other performance badges only after formula business rules.
8. Admin review-moderation queue list endpoint (`GET /admin/reviews`) — reviews can be moderated by ID but not discovered through the UI; identified during the lifecycle recovery pass, not built (out of that pass's explicit scope).
9. Student account-level Files tab (`STUDENT_FILES`) is a hardcoded-empty stub outside the Order Review modal's (now-fixed) delivery download.
10. Manually confirm Quality demo-video playback outside this session's sandboxed browser test tool — the auth fix is confirmed (200 OK, real bytes via the authenticated blob path); full frame playback couldn't be confirmed inside the sandbox itself.

## Known Risks

1. **Critical:** Production payment and live-session workflows have no real registered providers.
2. **High:** Local file storage durability, multi-instance behavior and malware scanning are unproven.
3. **High:** Completed-work and response-time formulas remain unapproved; F-002 prevents them from being presented publicly until evidence rules exist.
4. **High:** Revision records do not identify their target delivery version.
5. **High:** Teacher Showcase Production media readiness remains blocked by storage, scanning, probing, retention, reporting, moderation operations and secure delivery.
6. **Medium:** SignalR multi-instance delivery is not verified.
7. **Medium:** The DC/Babel runtime requires broader CSP allowances.
8. **Medium:** One Marketplace query-count integration test remains order/isolation sensitive.
9. **Medium:** Populated Teacher Comparison browser behavior remains conditional until Development contains at least two legitimately published Teachers.
10. **Medium:** Populated availability surfaces remain conditionally browser-verified because Development has no legitimately published scheduled Teacher.
11. **Medium:** Awaiting-payment live sessions reserve slots without an approved expiry policy.

## Blocked By Business Rules

Unresolved decisions include:

- Teacher metric formulas, date windows, exclusions and privacy boundaries.
- Capacity workload statuses and reservation rules.
- Minimum live-session booking notice and awaiting-payment reservation expiry.
- Matching weights, ownership, versioning and tie-breaking.
- Complexity categories and override authority.
- Learning outcome/mastery vocabulary and evidence.
- Badge/achievement criteria and revocation for performance badges (Trust-Only qualification badge approved in ADR-010; Highly Rated and other performance rules remain open).
- Portfolio retention/legal-hold, takedown appeals, Quality moderation service target and final display limits.
- Quality trend formulas and enforcement separation.
- Payment hold/settlement terminology and policy.
- Extended verification providers/evidence/expiry.
- New service-type lifecycle rules.
- Content-feed moderation/storage scope.
- Referral eligibility, accounting, fraud and refund rules.
- Teacher qualification assignment/resource scenarios and multi-subject application behavior remain unverified; the application is therefore **Conditionally Verified**.

The evidence-based questions are recorded in the [Phase 0–1 audit](./audits/TAFSEEL_PHASE_0_1_AUDIT_REPORT.md).

## Test Coverage Summary

Latest Post-Payment Order Lifecycle Recovery (full canonical lifecycle, live browser):

- Release build, Domain (69), Application (5), Architecture (1), provider-neutral Integration (195) suites all passed unchanged — no backend code was touched.
- Frontend integrity (13 entry points), localization (2,630 paired keys), new usage-coverage check (13 pages + 5 scripts, catches referenced-but-undefined keys that pairing alone misses), `git diff --check` all passed.
- F-010/F-011/F-012 fixed and live-verified: Start Work → Upload Delivery → Student Review → Request Revision → Teacher resubmits → Student Approves → Order Completed → Student rates Teacher → rating shows correctly on public Browse Teachers ("★ 5 (1)"), all through real browser clicks, zero console errors observed throughout.
- RoleBootstrap 3-vs-4 CI failure fixed (Stale Test, not a production bug) — all 10 RoleBootstrapTests and the full 195-test provider-neutral suite pass.
- Quality demo-video black-screen root cause (missing auth on `<video src>`) fixed and confirmed via network trace (200 OK, real bytes); full visual playback blocked from confirmation by this session's browser-test sandbox, not the app.
- Arabic/RTL/Dark at 375px and English/LTR/Light at 1440px spot-checked on the Teacher Dashboard — correct alignment, no horizontal scroll.
- See [Post-Payment Order Lifecycle Recovery](./fixes/POST_PAYMENT_ORDER_LIFECYCLE_RECOVERY_REPORT.md) for full detail, including deliberate scope decisions and remaining gaps (Admin review-moderation list endpoint, Student general Files tab).

Latest Order Journey Browser Certification (full live-browser Student→Payment→Delivery UAT):

- Release build, frontend integrity (13 entry points), localization (2,586 paired keys), `git diff --check` passed.
- Fresh non-seeded accounts driven through registration, teacher qualification/approval, profile publish, service creation, Learning Request, Teacher Accept, Order creation, Payment, and Mock Checkout webhook confirmation — all correct, single-row, no GUID leakage.
- **Blocked** immediately after payment confirmation: F-010 (Order.Status-only stage derivation ignores PaymentStatus) leaves no working Start-Work/next-step control on either dashboard. Start Work, Upload Delivery, Approve, Completed unverified.
- Payment retry after already-paid confirmed safe (idempotent, no double charge) — UI-only defect, not financial.
- Also found: F-011 (React error #185 infinite loop from Request wizard load onward) and F-012 (missing `td_stat_pending_withdrawal` locale key).
- See [Order Journey Browser Certification](./fixes/ORDER_JOURNEY_BROWSER_CERTIFICATION.md) for full detail.

Latest Limited Guided Request UX validation:

- Locked restore, Release build, format, frontend integrity, guided-request checks, localization (2,238 paired keys), EF pending-model (no changes), publish smoke and `git diff --check` passed.
- Focused Phase5 request tests: 6/6 passed (including multi-attachment version chaining and scheduling-service rejection).
- Architecture, Domain and Application suites: 1, 66 and 5 passed.
- Provider-neutral integration: 80 passed, 1 unrelated RoleBootstrap 3-vs-4 query-count failure.
- No migration generated.
- Controlled browser verified English and Arabic Teacher-required unavailable state on `/app/Tafseel-Request.dc.html`; authenticated full lifecycle and multi-viewport matrix remain conditional.

Latest Limited Teacher Showcase MVP validation:

- Locked restore, Release build, format, frontend, localization, EF pending-model, migration safety, idempotent script and publish smoke passed.
- Focused Showcase tests: 3 Domain and 5 SQL Server integration tests passed.
- Architecture, Domain and Application suites passed 1, 66 and 5 tests.
- Four affected Teacher Comparison SQL tests passed after their fixture adopted the approved Showcase lifecycle.
- Provider-neutral passed 80 and remains red only on the pre-existing RoleBootstrap 3-vs-4 query-count assertion.
- The final SQL run passed 72 and had two unrelated failures: a stale Teacher Dashboard English-literal assertion and the previously documented suite-order-sensitive Marketplace query counter; that query test passed alone.
- Controlled Testing browser validated English/LTR/light and Arabic/RTL/dark at 1280×720; the authenticated lifecycle and requested multi-viewport matrix remain conditional.
- One focused migration was generated and not applied.

Latest Live-Session Availability validation:

- Locked restore, format and Release build passed; build had 0 warnings and 0 errors.
- Focused availability tests: 3 passed, including the state matrix, stale-summary booking safety, schedule mutation guards and DST.
- Related Marketplace/Comparison/Live Session tests: 19 passed.
- Architecture, Domain and Application suites: 69 passed.
- Provider-neutral integration: 78 passed, 1 unrelated concurrent Catalog query-count failure.
- Full SQL Server suite: 68 passed, 1 unrelated concurrent Teacher Dashboard markup assertion failure.
- Frontend integrity: 12 entry points passed.
- Localization: 12 entry points and 2,026 paired keys passed.
- EF pending-model check, migration safety, deployment-script tests and publish smoke passed.
- The availability slice changed no schema and generated no migration.
- Browser rendering passed English/Dark and Arabic/RTL/Light at the available 1280px viewport; populated and multi-viewport behavior remains conditional.

## Deployment Status

- Development/Testing: controlled local Browser/Runtime validation completed; Limited Teacher Showcase is local and uncommitted.
- CI: not run remotely; equivalent local gates were exercised.
- Staging: not deployed or validated during these passes.
- Production: manual deployment remains; no deployment performed.
- Database: Showcase migration generated and validated but not applied; the worktree also contains separate concurrent Catalog migrations.

## Next Recommended Pass

Implement a real payment provider for F-003 (sandbox webhooks, idempotency, Production Mock forbidden). See the [Final Production Readiness Report](./reports/FINAL_PRODUCTION_READINESS_REPORT.md) and [audit](./audits/FINAL_PRODUCTION_READINESS_AUDIT.md).
