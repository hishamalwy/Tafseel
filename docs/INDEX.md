# Tafseel Documentation Index

This index is append-only for immutable historical reports. New reports belong in the appropriate subfolder. [PROJECT_STATUS.md](./PROJECT_STATUS.md) is the single living status document.

## Chronological Updates

| Report | Date | Status | Summary |
|---|---|---|---|
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

## Fix Reports

| Report | Date | Finding | Status |
|---|---|---|---|
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
| [ADR-006](./decisions/ADR-006-TEACHER-AVAILABILITY-AND-CAPACITY.md) | Proposed | Bounded, service-specific live-session availability with request capacity deferred |
| [ADR-007](./decisions/ADR-007-TEACHER-PORTFOLIO-MODERATION.md) | Proposed | MP4-only Teacher showcase with immutable versions, Quality moderation and explicit trust labels |
| [ADR-008](./decisions/ADR-008-STUDENT-REQUEST-ASSISTANT.md) | Proposed | Guided Learning Request wizard enhancement without AI, Draft status or a second request domain |
| [ADR-009](./decisions/ADR-009-STUDENT-LEARNING-PREFERENCES.md) | Proposed | Limited global Student learning defaults with per-request override; no profiling or matching |
| [ADR-010](./decisions/ADR-010-TEACHER-REPUTATION-AND-BADGES.md) | Proposed | Trust-Only: 20-badge inventory; only `qualified_on_tafseel` ready from evidence |
| [ADR-011](./decisions/ADR-011-TEACHER-SHOWCASE-PRODUCTION-MEDIA.md) | Proposed | Azure Blob + hybrid SAS/proxy, quarantine scan, isolated probe, retention and Production gates for Showcase media |
