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

## Architecture

- [System Architecture](./architecture/SYSTEM_ARCHITECTURE.md)
- [Domain Model](./architecture/DOMAIN_MODEL.md)
- [API Guidelines](./architecture/API_GUIDELINES.md)
- [Security](./architecture/SECURITY.md)
- [Deployment](./architecture/DEPLOYMENT.md)
- [Deployment runbook](./architecture/DEPLOYMENT_RUNBOOK.md)
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

Additional historical reports:

- [CI/CD Implementation Report](./reports/cicd-implementation-report.md)
- [Final Implementation Report](./reports/implementation-report.md)
- [Phase 11 Full Hardening Report](./reports/phase-11-report.md)
- [Documentation Standardization Report](./reports/DOCUMENTATION_STANDARDIZATION_REPORT.md)

## ADR (Architecture Decisions)

| ADR | Status | Summary |
|---|---|---|
| [ADR-001](./decisions/ADR-001-VERIFIED-TEACHER-DERIVATION.md) | Accepted | Verified Teacher derives from active qualifications |
| [ADR-002](./decisions/ADR-002-EMBEDDED-DASHBOARD-CHAT.md) | Accepted | Embedded dashboard chat replaces standalone chat |
| [ADR-003](./decisions/ADR-003-IMMUTABLE-QUALIFICATION-VERSIONS.md) | Accepted | Qualification submissions are immutable versions |
| [ADR-004](./decisions/ADR-004-DEVELOPMENT-ONLY-IDENTITY-INITIALIZATION.md) | Accepted | Normal identity initialization is Development-only |
| [ADR-006](./decisions/ADR-006-TEACHER-AVAILABILITY-AND-CAPACITY.md) | Proposed | Bounded, service-specific live-session availability with request capacity deferred |
