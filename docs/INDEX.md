# Tafseel Documentation Index

This index is append-only for immutable historical reports. New reports belong in the appropriate subfolder. [PROJECT_STATUS.md](./PROJECT_STATUS.md) is the single living status document.

## Chronological Updates

| Report | Date | Status | Summary |
|---|---|---|---|
| [Phase 3 Release 3 — Final Consumer Marketplace Certification](./reports/PHASE_3_RELEASE_3_FINAL_CONSUMER_CERTIFICATION.md) | 2026-08-02 | Conditionally certified | First-ever full live-browser drive of the canonical Student lifecycle (Landing→Browse→Profile→Request→Payment→Delivery→**Revision→Approve→Rate**→public review) on fresh, legitimately-registered UAT accounts; found and precisely documented (not fixed, per audit-only scope) a duplicate `reviewModal`/`rateModal` rating-dialog implementation causing an unresolved `{{ reviewTeacherAvatar }}` template placeholder to leak as a 404 request. Regression-clean across Sprints 1–7 and the full 104-test SqlServer suite. No code changed. |
| [Phase 3 Release 3 Sprint 7 — Landing Experience & First Impression](./fixes/PHASE_3_RELEASE_3_SPRINT_7_LANDING_EXPERIENCE.md) | 2026-08-02 | Two real defects fixed; browser-verified | 11-part Landing Page audit against premium-marketplace benchmarks; removed a permanently-empty hero stat pair (unapproved metrics correctly never fabricated, but left as a dead "—" placeholder), replaced raw checkmark glyphs with the established SVG icon language on hero/featured-teacher badges. Page found largely sound otherwise — no fake testimonials, badges, or numbers found. |
| [Teacher Growth & Profile Curation](./features/TEACHER_GROWTH_AND_PROFILE_CURATION_REPORT.md) | 2026-08-02 | Conditionally verified | Additional-subject qualifications UX + revoked reactivation; Teacher profile video curation fields/API/Dashboard; migration generated not applied. |
| [Teacher Profile Curation Migration](./database/TEACHER_PROFILE_CURATION_MIGRATION.md) | 2026-08-02 | Generated; not applied | Additive IsProfileVisible/Order/Featured with legacy visibility preserved. |
| [ADR-012 Teacher Growth & Profile Curation](./decisions/ADR-012-TEACHER-GROWTH-AND-PROFILE-CURATION.md) | 2026-08-02 | Accepted | Multi-subject reuse + presentation-only curation rules; max visible = MaxPublicPerTeacher. |
| [Phase 3 Release 3 Sprint 6 — Reviews, Rating & Notification Deep Links](./fixes/PHASE_3_RELEASE_3_SPRINT_6_REVIEWS_RATING_NOTIFICATIONS.md) | 2026-08-02 | Conditionally verified | Order review state DTO, public review DTO without OrderId/StudentId, rating UX + completed clarity, canonical notificationRoute, Files unavailable honesty; Phase9 review/moderation tests extended. |
| [Phase 3 Release 3 Sprint 5 — Post-Purchase Experience](./fixes/PHASE_3_RELEASE_3_SPRINT_5_POST_PURCHASE_EXPERIENCE.md) | 2026-08-02 | Conditionally verified | Order timeline hero + honest progress steps, payment-return deep-link fix, delivery Latest/version clarity, waiting guidance; no lifecycle or settlement changes. |
| [Phase 3 Release 3 Sprint 4 — Payment Experience & Consumer Confidence](./fixes/PHASE_3_RELEASE_3_SPRINT_4_PAYMENT_EXPERIENCE.md) | 2026-08-02 | Conditionally verified | Payment + Mock Checkout commercial context rail, honest mock labeling, idempotent resume fix, success/failure next-steps, mobile sticky CTA; no payment math or settlement changes. |
| [Phase 3 Release 3 Sprint 3 — Request Wizard Consumer Experience](./fixes/PHASE_3_RELEASE_3_SPRINT_3_REQUEST_WIZARD.md) | 2026-08-02 | Conditionally verified | Persistent commercial context rail, honest pay-after-accept + success next-steps, service delivery/revisions on cards, mobile progress fix; no business-rule or payment changes. |
| [Phase 3 Release 3 Sprint 2.1 — Teacher Profile Mobile CTA Overlap Closure](./fixes/PHASE_3_RELEASE_3_SPRINT_2_1_MOBILE_CTA_OVERLAP.md) | 2026-08-02 | Conditionally verified | Closed the visual (not just click-through) overlap between the fixed mobile CTA bar and the identity card's Save/Share/Message row via live-measured dynamic clearance; found and fixed a Message/CTA-link misfire risk and a self-referential measurement oscillation bug; added a truthful mobile no-service state. Zero first-paint overlap proven at all 7 required viewports. |
| [Phase 3 Release 3 Sprint 2 — Teacher Profile Consumer Experience](./fixes/PHASE_3_RELEASE_3_SPRINT_2_TEACHER_PROFILE.md) | 2026-08-02 | Two real defects fixed; browser-verified | 10-part Teacher Profile audit; fixed a mobile dead-button (Save/Share/Message unreachable under the fixed CTA bar on first paint) and a false "link copied" success message. Dead/duplicated CSS from prior redesign generations investigated and documented, deliberately not removed (needs a dedicated regression pass). |
| [Phase 3 Release 3 — Consumer Marketplace Experience](./fixes/PHASE_3_RELEASE_3_CONSUMER_MARKETPLACE_EXPERIENCE.md) | 2026-08-02 | Partially complete; Browse Teachers fixes browser-verified | Full consumer-journey audit; Landing/Teacher Profile found sound; fixed Browse Teachers' fake toggle switch, emoji/SVG icon inconsistency, and ragged card heights. Request/Payment/Order/Review journey not yet re-audited. |
| [Marketplace Service Governance Decision](./reports/MARKETPLACE_SERVICE_GOVERNANCE_DECISION_REPORT.md) | 2026-08-01 | Decision complete | Approved canonical Admin-owned catalog identity, bounded Teacher configuration, deterministic migration, transaction snapshots, compatibility, analytics, and a four-release rollout. |
| [Marketplace Service Catalog Release 1](./features/MARKETPLACE_SERVICE_CATALOG_RELEASE_1_REPORT.md) | 2026-08-01 | Implemented locally | Catalog policy, Admin governance, centralized validation and historical snapshots; migration generated, not applied. |
| [Teacher Profile Premium Polish](./fixes/TEACHER_PROFILE_PREMIUM_POLISH_REPORT.md) | 2026-08-01 | Conditionally verified | Replaced temporary UI tells with an intentional avatar, consistent SVG iconography, stronger conversion hierarchy, and a premium zero-review state; real listing content remains the staging blocker. |
| [Teacher Profile Carousel Polish](./fixes/TEACHER_PROFILE_CAROUSEL_POLISH_REPORT.md) | 2026-08-01 | Conditionally verified | Removed duplicate player content, replaced prototype arrows with localized SVG controls, clarified RTL/LTR navigation, and passed the 20-case browser matrix. |
| [Teacher Profile Final Quality Recovery](./fixes/TEACHER_PROFILE_FINAL_QUALITY_REPORT.md) | 2026-08-01 | Fixed; conditionally verified | Corrected the Development teacher's bilingual fields and seed, removed hidden legacy DOM, polished the profile, and passed the 24-case browser matrix. |
| [Documentation Standardization](./reports/DOCUMENTATION_STANDARDIZATION_REPORT.md) | 2026-07-29 | Completed | Organized historical documentation and established the living status/index convention. |
| [F-001 Identity Initialization](./fixes/TAFSEEL_F001_IDENTITY_INITIALIZATION_FIX_REPORT.md) | 2026-07-29 | Fixed locally | Restricted normal identity initialization to Development. |
| [Teacher Qualification Application](./fixes/TEACHER_QUALIFICATION_APPLICATION_FIX_REPORT.md) | 2026-07-29 | Fixed locally | Stabilized the language API, initial form loading, validation and assignment material UX. |
| [Teacher Qualification Browser Validation](./fixes/TEACHER_QUALIFICATION_BROWSER_VALIDATION_REPORT.md) | 2026-07-29 | Validated locally | Browser-validated the qualification workflow and fixed lifecycle-message localization. |
| [F-002 Public Teacher Metrics Integrity](./fixes/F002_TEACHER_METRICS_INTEGRITY_REPORT.md) | 2026-07-29 | Fixed locally | Removed unsupported public teacher metrics and ranking while preserving verified review and qualification evidence. |
| [Owned Order Lifecycle Timeline](./features/PHASE2_ORDER_TIMELINE_REPORT.md) | 2026-07-29 | Completed locally | Added an owned, localized timeline using only persisted Order evidence. |
| [F-005 Revision-to-Delivery Linkage Investigation](./audits/F005_REVISION_DELIVERY_LINKAGE_INVESTIGATION.md) | 2026-07-29 | Investigated | Proved that revision targets are not persisted and schema change is required. |
| [Teacher Comparison](./features/TEACHER_COMPARISON_REPORT.md) | 2026-07-29 | Conditionally verified | Added bounded public comparison for two or three published Teachers without unsupported metrics. |
| [Teacher Availability and Capacity Decision](./reports/TEACHER_AVAILABILITY_CAPACITY_DECISION_REPORT.md) | 2026-07-29 | Decision complete | Approved a truthful session-availability-only design and deferred request capacity pending business rules. |
| [Live-Session Availability Summary](./features/LIVE_SESSION_AVAILABILITY_SUMMARY_REPORT.md) | 2026-07-29 | Conditionally verified | Added a bounded service-specific summary shared by Browse, Comparison and Profile while preserving authoritative booking revalidation. |
| [Teacher Portfolio Moderation Decision](./reports/TEACHER_PORTFOLIO_MODERATION_DECISION_REPORT.md) | 2026-07-29 | Decision complete | Defined a limited MP4 showcase MVP with immutable versions, Quality review and distinct qualification trust. |
| [Limited Teacher Showcase MVP](./features/TEACHER_SHOWCASE_MVP_REPORT.md) | 2026-07-29 | Conditionally verified | Implemented the Development/Staging MP4 Showcase lifecycle, Quality moderation and public trust separation with Production fail-closed gates. |
| [Teacher Showcase MVP Migration](./database/TEACHER_SHOWCASE_MVP_MIGRATION.md) | 2026-07-29 | Generated; not applied | Documents deterministic legacy mapping, schema constraints and rollback risk. |
| [Student Request Assistant Decision](./reports/STUDENT_REQUEST_ASSISTANT_DECISION_REPORT.md) | 2026-07-29 | Decision complete | Approved a Limited Guided Request MVP that enhances the existing wizard without AI, Draft status or a second request domain. |
| [Limited Guided Request UX](./features/LIMITED_GUIDED_REQUEST_UX_REPORT.md) | 2026-07-29 | Conditionally verified | Implemented guided prompts, checklist, browser draft, Teacher-required entry and attachment version chaining without schema change. |
| [Student Learning Preferences Decision](./reports/STUDENT_LEARNING_PREFERENCES_DECISION_REPORT.md) | 2026-07-30 | Decision complete | Approved limited global Student learning defaults with per-request override and Description composition as request truth. |
| [Limited Student Learning Preferences MVP](./features/STUDENT_LEARNING_PREFERENCES_MVP_REPORT.md) | 2026-07-30 | Conditionally verified | Implemented typed Student learning defaults, Student GET/PUT API, Dashboard settings and Guided Request prefill with draft precedence. |
| [Student Learning Preferences Migration](./database/STUDENT_LEARNING_PREFERENCES_MVP_MIGRATION.md) | 2026-07-30 | Generated; not applied | Additive `StudentLearningPreferences` table with Restrict FKs and style allowlist check. |
| [Teacher Reputation and Badges Decision](./reports/TEACHER_REPUTATION_BADGES_DECISION_REPORT.md) | 2026-07-30 | Decision complete | Trust-Only MVP: 20-badge inventory; only qualification-derived badge ready; performance/milestones blocked. |
| [Limited Teacher Trust Badge MVP](./features/TEACHER_TRUST_BADGE_MVP_REPORT.md) | 2026-07-30 | Conditionally verified | Projected `qualified_on_tafseel` on marketplace DTOs; removed Top rated invent; no migration. |
| [Teacher Showcase Production Hardening Plan](./reports/TEACHER_SHOWCASE_PRODUCTION_HARDENING_PLAN.md) | 2026-07-30 | Decision complete | Azure Blob + hybrid delivery, quarantine scan, isolated probe, retention/copyright/ops gates; Production Showcase remains disabled. |
| [Step 7 Teacher Public Profile Hardening Investigation](./audits/STEP7_TEACHER_PUBLIC_PROFILE_HARDENING_INVESTIGATION.md) | 2026-07-30 | Investigation complete | Evidence audit of public Teacher fields; F-002/ADR-010 sound; favorites/reviews/sample-count/DTO overshare gaps remain. |
| [Step 7 Public Profile Hardening](./fixes/STEP7_PUBLIC_PROFILE_HARDENING_REPORT.md) | 2026-07-30 | Completed | Canonical Browse eligibility for Favorites/Reviews; SampleCount parity; public DTO privacy; active catalog filters; unsupported copy cleaned. |
| [Final Production Readiness Audit](./audits/FINAL_PRODUCTION_READINESS_AUDIT.md) | 2026-07-30 | Completed | Full-system evidence audit; Staging validation ready; Production blocked by providers/storage/ops. |
| [Final Production Readiness Report](./reports/FINAL_PRODUCTION_READINESS_REPORT.md) | 2026-07-30 | Completed | Executive readiness verdict and required-before Staging/Production lists. |
| [Product UX Polish](./fixes/PRODUCT_UX_POLISH_REPORT.md) | 2026-07-30 | Completed locally | Pre-production UI/UX hardening: navigation honesty, busy states, a11y tokens, RTL/LTR/theme FOUC. |
| [Product Bug Fix Sprint 1](./fixes/PRODUCT_BUG_FIX_SPRINT_01_REPORT.md) | 2026-07-30 | Completed locally | GUID name projections, accept lifecycle lists, teacher attachment download, status/notification i18n. |
| [Product Bug Fix Sprint 2](./fixes/PRODUCT_BUG_FIX_SPRINT_02_REPORT.md) | 2026-07-30 | Completed locally | Seeded UAT, notification bodies, Pay/Start-work fixes, dashboard localization. |
| [BUG-001 Display Name Regression](./fixes/BUG001_DISPLAY_NAME_REGRESSION_FIX_REPORT.md) | 2026-07-30 | Verified | Removed `مشارك {guid}` / ID-as-name fallbacks; canonical party-name rule. |
| [Product Bug Fix Sprint 3](./fixes/PRODUCT_BUG_FIX_SPRINT_03_REPORT.md) | 2026-07-30 | Conditionally verified | Residual Admin/Quality localization, Quality rawStatus filters, Admin money/status, browser AR checks. |
| [Production Operational Readiness](./reports/PRODUCTION_OPERATIONAL_READINESS_REPORT.md) | 2026-07-30 | Conditionally ready | Azure Blob storage, config-driven providers, fail-closed Production, ops runbooks. |
| [Mock Payment End-to-End Simulator](./reports/MOCK_PAYMENT_SIMULATOR_REPORT.md) | 2026-07-30 | Completed locally | Dev/Staging Mock checkout simulator via canonical webhook path; Production forbidden. |
| [Order vs Request UX Separation](./fixes/ORDER_REQUEST_UX_SEPARATION_REPORT.md) | 2026-07-30 | Conditionally verified | Student work list separates Pending Requests from Orders; no Accepted+Pay duplicates. |
| [Order Journey Browser Certification](./fixes/ORDER_JOURNEY_BROWSER_CERTIFICATION.md) | 2026-07-30 | Blocked (superseded same day) | Full live-browser Student→Payment→Delivery UAT; blocked after payment confirmation — both dashboards derive stage from `Order.Status` alone, never `PaymentStatus`, so a paid Order shows no working Start-Work/next action. Payment itself is safe (no double-charge). |
| [Post-Payment Order Lifecycle Recovery](./fixes/POST_PAYMENT_ORDER_LIFECYCLE_RECOVERY_REPORT.md) | 2026-07-30 | **Recovered and verified** | Canonical presentation helper (`Order.Status` + `PaymentStatus`, never Status alone) fixes Start Work/Delivery/Revision wiring; adds Student delivery-review, revision, and rating UI (backend was already correct/unreachable); fixes Quality demo video black-screen (missing auth on `<video src>`), React error #185 infinite loop, a missing localization key plus a new usage-coverage CI check, and a stale RoleBootstrap test. Full canonical lifecycle proven end-to-end through real browser controls, including public rating projection. |
| [RoleBootstrap Fast-Path CI Fix](./fixes/ROLE_BOOTSTRAP_FAST_PATH_CI_FIX_REPORT.md) | 2026-07-30 | Fixed (Stale Test) | `Repeated_bootstrap_uses_the_bounded_fast_path` expected an incidental exact read count of 3; a legitimate localization-backfill read makes it 4. Test now asserts the real invariant (zero writes) plus a documented bounded range; no production code changed. |

## Architecture

## Final Staging Certification

| Report | Date | Status | Description |
|---|---|---|---|
| [Final Staging Certification](./reports/FINAL_STAGING_CERTIFICATION_REPORT.md) | 2026-08-01 | Browser certification blocked | Automated gates and runtime/media HTTP checks passed; normal-browser quality demo remained a black, non-playing rectangle. |
| [Teacher Profile Media & UX Recovery](./fixes/TEACHER_PROFILE_MEDIA_UX_RECOVERY_REPORT.md) | 2026-08-01 | Focused fix applied; browser rerun pending | CSP/blob playback recovery, shared media states, and responsive Profile media cards. |

- [System Architecture](./architecture/SYSTEM_ARCHITECTURE.md)
- [Domain Model](./architecture/DOMAIN_MODEL.md)
- [API Guidelines](./architecture/API_GUIDELINES.md)
- [Security](./architecture/SECURITY.md)
- [Deployment](./architecture/DEPLOYMENT.md)
- [Deployment runbook](./architecture/DEPLOYMENT_RUNBOOK.md)
- [Production checklist](./operations/PRODUCTION_CHECKLIST.md)
- [Operations runbook](./operations/RUNBOOK.md)
- [Backup and restore](./operations/BACKUP_AND_RESTORE.md)
- [Environment configuration](./operations/ENVIRONMENT_CONFIGURATION.md)
- [Legacy architecture overview](./architecture.md)
- [Proposed domain model](./proposed-domain-model.md) — historical proposal
- [Proposed API contracts](./proposed-api-contracts.md) — historical proposal
- [Dynamic service architecture](./dynamic-service-architecture.md)
- [Marketplace service governance decision](./decisions/ADR-005-MARKETPLACE-SERVICE-GOVERNANCE.md)
- [Marketplace service governance report](./reports/MARKETPLACE_SERVICE_GOVERNANCE_DECISION_REPORT.md)
- [Marketplace Service Catalog Release 1](./features/MARKETPLACE_SERVICE_CATALOG_RELEASE_1_REPORT.md)
- [Marketplace Service Catalog Release 1 migration](./database/MARKETPLACE_SERVICE_CATALOG_RELEASE_1_MIGRATION.md)
- [Frontend API contract map](./frontend-api-contract-map.md)
- [Frontend page and role map](./final-frontend-page-and-role-map.md)

## Audit Reports

| Report | Date | Status | Description |
|---|---|---|---|
| [CI/CD Audit Findings](./audits/cicd-audit-findings.md) | 2026-07-26 | Historical | CI/CD workflow and deployment audit |
| [Frontend Requirements Audit](./audits/frontend-requirements-audit.md) | 2026-07-26 | Historical | Initial frontend requirements inventory |
| [Phase 2–3 Audit Findings](./audits/phase-2-3-audit-findings.md) | 2026-07-26 | Historical | Foundation/security/domain audit baseline |
| [Phase 4 Audit Findings](./audits/phase-4-audit-findings.md) | 2026-07-26 | Historical | Teacher marketplace audit |
| [Phase 5 Audit Findings](./audits/phase-5-audit-findings.md) | 2026-07-26 | Historical | Learning request and order audit |
| [Phase 6 Audit Findings](./audits/phase-6-audit-findings.md) | 2026-07-26 | Historical | Live-session audit |
| [Phase 7 Audit Findings](./audits/phase-7-audit-findings.md) | 2026-07-26 | Historical | Finance audit |
| [Phase 8 Audit Findings](./audits/phase-8-audit-findings.md) | 2026-07-26 | Historical | Messaging and notification audit |
| [Phase 9 Audit Findings](./audits/phase-9-audit-findings.md) | 2026-07-26 | Historical | Governance and administration audit |
| [Phase 10 Audit Findings](./audits/phase-10-audit-findings.md) | 2026-07-26 | Historical | Frontend integration audit |
| [Phase 11 Audit Findings](./audits/phase-11-audit-findings.md) | 2026-07-26 | Historical | Full hardening audit |
| [Final UI/UX Audit](./audits/final-ui-ux-audit.md) | 2026-07-28 | Historical | Final UI/UX review |
| [Frontend Completeness Audit](./audits/frontend-completeness-audit.md) | 2026-07-28 | Historical | Frontend/API completeness review |
| [F-005 Revision-to-Delivery Linkage Investigation](./audits/F005_REVISION_DELIVERY_LINKAGE_INVESTIGATION.md) | 2026-07-29 | Investigated | Revision target relationship and downstream impact audit |
| [Step 7 Teacher Public Profile Hardening Investigation](./audits/STEP7_TEACHER_PUBLIC_PROFILE_HARDENING_INVESTIGATION.md) | 2026-07-30 | Investigation complete | Public Teacher field truthfulness, privacy, and cross-surface consistency audit |
| [Step 7 Public Profile Hardening](./fixes/STEP7_PUBLIC_PROFILE_HARDENING_REPORT.md) | 2026-07-30 | Completed | Favorites/Reviews eligibility, SampleCount parity, public DTO privacy, catalog filter parity |
| [Final Production Readiness Audit](./audits/FINAL_PRODUCTION_READINESS_AUDIT.md) | 2026-07-30 | Completed | Architecture through ops evidence audit with executable validation log |
| [Tafseel Phase 0–1 Audit](./audits/TAFSEEL_PHASE_0_1_AUDIT_REPORT.md) | 2026-07-29 | Completed | Current architecture and 24-capability gap audit |
| [Phase 3 Release 3 — Final Consumer Marketplace Certification](./reports/PHASE_3_RELEASE_3_FINAL_CONSUMER_CERTIFICATION.md) | 2026-08-02 | Conditionally certified | First full live-browser lifecycle drive (Request→Payment→Delivery→Revision→Approve→Rate→public review); regression audit of Sprints 1–7; one real Medium defect found (duplicate rating-modal implementation), not fixed (audit-only sprint) |

## Fix Reports

| Report | Date | Finding | Status |
|---|---|---|---|
| [Phase 3 Release 3 Sprint 7 — Landing Experience & First Impression](./fixes/PHASE_3_RELEASE_3_SPRINT_7_LANDING_EXPERIENCE.md) | 2026-08-02 | Permanently-empty hero stat placeholders ("—" for unapproved metrics, never removed); raw checkmark glyphs inconsistent with established SVG icon language | Fixed; browser-verified |
| [Phase 3 Release 3 Sprint 6 — Reviews, Rating & Notification Deep Links](./fixes/PHASE_3_RELEASE_3_SPRINT_6_REVIEWS_RATING_NOTIFICATIONS.md) | 2026-08-02 | Reviews/Files stubs; notification dead-ends; optimistic rate without hasReview; public ReviewDto leaked OrderId | Fixed; browser-verified (conditional — see report) |
| [Phase 3 Release 3 Sprint 5 — Post-Purchase Experience](./fixes/PHASE_3_RELEASE_3_SPRINT_5_POST_PURCHASE_EXPERIENCE.md) | 2026-08-02 | Payment `?section=orders` blank main; thin timeline; red paid chip; weak delivery versions | Fixed; browser-verified (conditional — see report) |
| [Phase 3 Release 3 Sprint 4 — Payment Experience & Consumer Confidence](./fixes/PHASE_3_RELEASE_3_SPRINT_4_PAYMENT_EXPERIENCE.md) | 2026-08-02 | Payment context loss; coupon ghost UI; idempotency stranding; thin mock success/failure | Fixed; browser-verified (conditional — see report) |
| [Phase 3 Release 3 Sprint 2.1 — Mobile CTA Overlap Closure](./fixes/PHASE_3_RELEASE_3_SPRINT_2_1_MOBILE_CTA_OVERLAP.md) | 2026-08-02 | Visual (not just click-through) overlap between fixed mobile CTA bar and identity card action row; Message/CTA-link misfire risk; measurement oscillation bug | Fixed; browser-verified (conditional — see report) |
| [Phase 3 Release 3 Sprint 2 — Teacher Profile Consumer Experience](./fixes/PHASE_3_RELEASE_3_SPRINT_2_TEACHER_PROFILE.md) | 2026-08-02 | Mobile dead-button under fixed CTA bar; false share-copy success message | Fixed; browser-verified |
| [Phase 3 Release 3 — Consumer Marketplace Experience](./fixes/PHASE_3_RELEASE_3_CONSUMER_MARKETPLACE_EXPERIENCE.md) | 2026-08-02 | Fake toggle switch, emoji/SVG icon inconsistency, ragged card heights on Browse Teachers | Fixed; browser-verified |
| [CI/CD Hardening](./fixes/cicd-hardening-report.md) | 2026-07-26 | Historical CI/CD findings | Historical |
| [Phase 2–3 Security Hardening](./fixes/phase-2-3-pass-2-security-report.md) | 2026-07-26 | Security baseline | Historical |
| [Phase 2–3 Domain Hardening](./fixes/phase-2-3-pass-3-domain-report.md) | 2026-07-26 | Domain baseline | Historical |
| [Phase 4 Hardening](./fixes/phase-4-hardening-report.md) | 2026-07-26 | Phase 4 findings | Historical |
| [Phase 5 Hardening](./fixes/phase-5-hardening-report.md) | 2026-07-26 | Phase 5 findings | Historical |
| [Phase 6 Hardening](./fixes/phase-6-hardening-report.md) | 2026-07-26 | Phase 6 findings | Historical |
| [Phase 7 Hardening](./fixes/phase-7-hardening-report.md) | 2026-07-26 | Phase 7 findings | Historical |
| [Phase 8 Hardening](./fixes/phase-8-hardening-report.md) | 2026-07-26 | Phase 8 findings | Historical |
| [Phase 9 Hardening](./fixes/phase-9-hardening-report.md) | 2026-07-26 | Phase 9 findings | Historical |
| [Phase 10 Hardening](./fixes/phase-10-hardening-report.md) | 2026-07-26 | Phase 10 findings | Historical |
| [Phase 11 Hardening Gate](./fixes/phase-11-hardening-report.md) | 2026-07-26 | Phase 11 findings | Historical |
| [Final Hardening and Readiness](./fixes/final-hardening-report.md) | 2026-07-26 | Final readiness findings | Historical |
| [F-001 Identity Initialization](./fixes/TAFSEEL_F001_IDENTITY_INITIALIZATION_FIX_REPORT.md) | 2026-07-29 | F-001 | Fixed locally |
| [Teacher Qualification Application](./fixes/TEACHER_QUALIFICATION_APPLICATION_FIX_REPORT.md) | 2026-07-29 | Teacher qualification API/form/task UX | Fixed locally |
| [Teacher Qualification Browser Validation](./fixes/TEACHER_QUALIFICATION_BROWSER_VALIDATION_REPORT.md) | 2026-07-29 | Runtime qualification workflow validation | Validated locally |
| [F-002 Public Teacher Metrics Integrity](./fixes/F002_TEACHER_METRICS_INTEGRITY_REPORT.md) | 2026-07-29 | F-002 | Fixed locally |
| [Step 7 Public Profile Hardening](./fixes/STEP7_PUBLIC_PROFILE_HARDENING_REPORT.md) | 2026-07-30 | Public Teacher privacy / eligibility | Completed |
| [Product UX Polish](./fixes/PRODUCT_UX_POLISH_REPORT.md) | 2026-07-30 | Pre-production UI/UX hardening | Completed locally |
| [Product Bug Fix Sprint 1](./fixes/PRODUCT_BUG_FIX_SPRINT_01_REPORT.md) | 2026-07-30 | GUID names / accept lists / attachments / i18n | Completed locally |
| [Product Bug Fix Sprint 2](./fixes/PRODUCT_BUG_FIX_SPRINT_02_REPORT.md) | 2026-07-30 | Seeded UAT / notif bodies / Pay+Start / dashboards i18n | Completed locally |
| [BUG-001 Display Name Regression](./fixes/BUG001_DISPLAY_NAME_REGRESSION_FIX_REPORT.md) | 2026-07-30 | `مشارك {guid}` / ID-as-name fallbacks removed | Verified |
| [Product Bug Fix Sprint 3](./fixes/PRODUCT_BUG_FIX_SPRINT_03_REPORT.md) | 2026-07-30 | Residual Admin/Quality i18n + Quality rawStatus filters | Conditionally verified |
| [Teacher Profile Conversion Redesign](./fixes/TEACHER_PROFILE_CONVERSION_REDESIGN_REPORT.md) | 2026-08-01 | Public profile hierarchy, featured media, conversion flow, localization and responsive UX | Conditionally verified |

## Feature Reports

| Feature | Status | Report |
|---|---|---|
| Foundation | Historical | [Phase 2](./features/phase-2-report.md) |
| Catalog and teacher qualification | Historical | [Phase 3](./features/phase-3-report.md) |
| Localization and frontend integration | Historical | [Phase 3 localization](./features/phase-3-localization-and-frontend-integration-report.md) |
| Teacher marketplace | Historical | [Phase 4](./features/phase-4-report.md) |
| Learning requests and orders | Historical | [Phase 5](./features/phase-5-report.md) |
| Live sessions and scheduling | Historical | [Phase 6](./features/phase-6-report.md) |
| Payments, ledger, refunds and withdrawals | Historical | [Phase 7](./features/phase-7-report.md) |
| Messaging and notifications | Historical | [Phase 8](./features/phase-8-report.md) |
| Governance, administration and audit | Historical | [Phase 9](./features/phase-9-report.md) |
| Frontend integration | Historical | [Phase 10](./features/phase-10-report.md) |
| Owned Order lifecycle timeline | Completed locally | [Owned Order Timeline](./features/PHASE2_ORDER_TIMELINE_REPORT.md) |
| Teacher comparison | Conditionally verified | [Teacher Comparison](./features/TEACHER_COMPARISON_REPORT.md) |
| Live-session availability summary | Conditionally verified | [Live-Session Availability](./features/LIVE_SESSION_AVAILABILITY_SUMMARY_REPORT.md) |
| Limited Teacher Showcase MVP | Conditionally verified | [Teacher Showcase MVP](./features/TEACHER_SHOWCASE_MVP_REPORT.md) |
| Limited Guided Request UX | Conditionally verified | [Guided Request UX](./features/LIMITED_GUIDED_REQUEST_UX_REPORT.md) |
| Limited Student Learning Preferences MVP | Conditionally verified | [Learning Preferences MVP](./features/STUDENT_LEARNING_PREFERENCES_MVP_REPORT.md) |
| Limited Teacher Trust Badge MVP | Conditionally verified | [Teacher Trust Badge MVP](./features/TEACHER_TRUST_BADGE_MVP_REPORT.md) |
| Teacher Showcase Production Hardening | Decision complete | [Showcase production hardening plan](./reports/TEACHER_SHOWCASE_PRODUCTION_HARDENING_PLAN.md) |
| Teacher Public Profile Hardening Investigation | Investigation complete | [Step 7 investigation](./audits/STEP7_TEACHER_PUBLIC_PROFILE_HARDENING_INVESTIGATION.md) |
| Teacher Public Profile Hardening | Completed | [Step 7 hardening report](./fixes/STEP7_PUBLIC_PROFILE_HARDENING_REPORT.md) |
| Final Production Readiness Audit | Completed — Staging validation ready; Production not ready | [Final readiness report](./reports/FINAL_PRODUCTION_READINESS_REPORT.md) |

Additional historical reports:

- [CI/CD Implementation Report](./reports/cicd-implementation-report.md)
- [Final Implementation Report](./reports/implementation-report.md)
- [Phase 11 Full Hardening Report](./reports/phase-11-report.md)
- [Documentation Standardization Report](./reports/DOCUMENTATION_STANDARDIZATION_REPORT.md)
- [Teacher Portfolio Moderation Decision Report](./reports/TEACHER_PORTFOLIO_MODERATION_DECISION_REPORT.md)
- [Student Request Assistant Decision Report](./reports/STUDENT_REQUEST_ASSISTANT_DECISION_REPORT.md)
- [Student Learning Preferences Decision Report](./reports/STUDENT_LEARNING_PREFERENCES_DECISION_REPORT.md)
- [Teacher Reputation and Badges Decision Report](./reports/TEACHER_REPUTATION_BADGES_DECISION_REPORT.md)
- [Teacher Showcase Production Hardening Plan](./reports/TEACHER_SHOWCASE_PRODUCTION_HARDENING_PLAN.md)
- [Final Production Readiness Report](./reports/FINAL_PRODUCTION_READINESS_REPORT.md)

## ADR (Architecture Decisions)

| ADR | Status | Summary |
|---|---|---|
| [ADR-001](./decisions/ADR-001-VERIFIED-TEACHER-DERIVATION.md) | Accepted | Verified Teacher derives from active qualifications |
| [ADR-002](./decisions/ADR-002-EMBEDDED-DASHBOARD-CHAT.md) | Accepted | Embedded dashboard chat replaces standalone chat |
| [ADR-003](./decisions/ADR-003-IMMUTABLE-QUALIFICATION-VERSIONS.md) | Accepted | Qualification submissions are immutable versions |
| [ADR-004](./decisions/ADR-004-DEVELOPMENT-ONLY-IDENTITY-INITIALIZATION.md) | Accepted | Normal identity initialization is Development-only |
| [ADR-005](./decisions/ADR-005-MARKETPLACE-SERVICE-GOVERNANCE.md) | Accepted / Release 1 implemented | Admin-owned canonical service catalog with bounded Teacher configuration and historical snapshots |
| [ADR-006](./decisions/ADR-006-TEACHER-AVAILABILITY-AND-CAPACITY.md) | Proposed | Bounded, service-specific live-session availability with request capacity deferred |
| [ADR-007](./decisions/ADR-007-TEACHER-PORTFOLIO-MODERATION.md) | Proposed | MP4-only Teacher showcase with immutable versions, Quality moderation and explicit trust labels |
| [ADR-008](./decisions/ADR-008-STUDENT-REQUEST-ASSISTANT.md) | Proposed | Guided Learning Request wizard enhancement without AI, Draft status or a second request domain |
| [ADR-009](./decisions/ADR-009-STUDENT-LEARNING-PREFERENCES.md) | Proposed | Limited global Student learning defaults with per-request override; no profiling or matching |
| [ADR-010](./decisions/ADR-010-TEACHER-REPUTATION-AND-BADGES.md) | Proposed | Trust-Only: 20-badge inventory; only `qualified_on_tafseel` ready from evidence |
| [ADR-011](./decisions/ADR-011-TEACHER-SHOWCASE-PRODUCTION-MEDIA.md) | Proposed | Azure Blob + hybrid SAS/proxy, quarantine scan, isolated probe, retention and Production gates for Showcase media |
