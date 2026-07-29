# Tafseel Project Status

Last updated: 2026-07-29.

## Current Version

No release tag is present. Current audited baseline is commit `6c42d7e` on `main`, plus uncommitted F-001, qualification and F-002 changes.

## Current Phase

F-002 public teacher metrics integrity fixed locally after the conditionally verified Teacher Qualification Application pass.

## Current Milestone

Production-correct startup and public teacher metric boundaries are completed locally; the owned order lifecycle timeline is pending.

## Current Architecture Status

The Domain/Application/Infrastructure/API layering is intact. Existing Identity/JWT, EF Core/SQL Server, SignalR messaging, Resend email, finance foundations and DC/React frontend conventions remain unchanged. Documentation now has canonical architecture summaries and accepted ADRs.

## Production Readiness

**Not Ready**

Real payment and live-session providers are not registered, Production file storage is not proven durable/shared, financial terminology/policy remains unresolved, and the current uncommitted state has not passed CI or Staging validation.

## Completed Phases

Historical implementation phases 2–11 are complete and indexed in [INDEX.md](./INDEX.md). Current production-correction passes F-001, Teacher Qualification and F-002 are completed locally and remain uncommitted.

## Completed Features

| Finding | Status | Report |
|---|---|---|
| F-001 Development-only identity initialization | Fixed locally | [F-001 report](./fixes/TAFSEEL_F001_IDENTITY_INITIALIZATION_FIX_REPORT.md) |
| Teacher qualification application contract and UX | Fixed locally | [Teacher qualification report](./fixes/TEACHER_QUALIFICATION_APPLICATION_FIX_REPORT.md) |
| Teacher qualification application browser validation | Conditionally Verified | [Browser validation report](./fixes/TEACHER_QUALIFICATION_BROWSER_VALIDATION_REPORT.md) |
| F-002 Public teacher metrics integrity | Fixed locally | [F-002 report](./fixes/F002_TEACHER_METRICS_INTEGRITY_REPORT.md) |

## Open Findings

| ID | Severity | Classification | Status |
|---|---|---|---|
| F-002 | High | Production Bug | Fixed locally |
| F-003 | Critical | Deployment | Open |
| F-004 | High | Deployment | Open |
| F-005 | High | API Bug | Open |
| F-006 | Medium | API Bug | Open |
| F-007 | High | API Bug | Open |
| F-008 | High | Business Rule | Blocked |
| F-009 | Medium | Technical Debt | Open |

Details are in the [Phase 0–1 audit](./audits/TAFSEEL_PHASE_0_1_AUDIT_REPORT.md).

## Completed Vertical Slices

| Slice | Status |
|---|---|
| Current roadmap vertical slices | None implemented |

Historical feature phases are indexed in [INDEX.md](./INDEX.md).

## Pending Vertical Slices

1. Owned order lifecycle timeline from existing persisted evidence.
2. Revision-to-delivery version linkage.
3. Favorites pagination.
4. Availability and teacher capacity after rule approval.
5. Teacher comparison after metric correction.
6. Student learning preferences.
7. Explainable deterministic matching.
8. Teacher/student analytics after event instrumentation.
9. Quality trends, trust extensions, learning timeline and portfolio moderation.

## Known Risks

1. **Critical:** Production payment and live-session workflows have no real registered providers.
2. **High:** Local file storage durability, multi-instance behavior and malware scanning are unproven.
3. **High:** Completed-work and response-time formulas remain unapproved; F-002 prevents them from being presented publicly until evidence rules exist.
4. **High:** Revision records do not identify their target delivery version.
5. **High:** Additional portfolio publication has no distinct moderation state.
6. **Medium:** SignalR multi-instance delivery is not verified.
7. **Medium:** The DC/Babel runtime requires broader CSP allowances.
8. **Medium:** One Marketplace query-count integration test remains order/isolation sensitive.

## Blocked By Business Rules

Unresolved decisions include:

- Teacher metric formulas, date windows, exclusions and privacy boundaries.
- Capacity workload statuses and reservation rules.
- Matching weights, ownership, versioning and tie-breaking.
- Complexity categories and override authority.
- Learning outcome/mastery vocabulary and evidence.
- Badge/achievement criteria and revocation.
- Portfolio moderation ownership.
- Quality trend formulas and enforcement separation.
- Payment hold/settlement terminology and policy.
- Extended verification providers/evidence/expiry.
- New service-type lifecycle rules.
- Content-feed moderation/storage scope.
- Referral eligibility, accounting, fraud and refund rules.
- Teacher qualification assignment/resource scenarios and multi-subject application behavior remain unverified; the application is therefore **Conditionally Verified**.

The evidence-based questions are recorded in the [Phase 0–1 audit](./audits/TAFSEEL_PHASE_0_1_AUDIT_REPORT.md).

## Test Coverage Summary

Latest F-002 validation:

- Locked restore, format verification and Release build: passed; 0 warnings and 0 errors.
- Provider-neutral solution tests: 142 passed, 0 failed.
- Focused Marketplace/favorites/review aggregate tests: 3 passed individually.
- Focused F002 frontend integrity: passed across six public consumers with English/Arabic key parity.
- EF pending model changes: none.
- Repository-wide frontend validation remains red on unrelated avatar-helper and Quality Dashboard localization changes.
- Browser sort/overflow checks passed at 375 px and 1440 px; live card rendering was blocked by the unrelated avatar-helper mismatch.

## Deployment Status

- Development: available; current changes are local and uncommitted.
- CI: not run for the current documentation/F-001 working tree.
- Staging: not deployed or validated during these passes.
- Production: manual deployment remains; no deployment performed.
- Database: no migration generated or applied.

## Next Recommended Pass

Owned Order Lifecycle Timeline using existing persisted evidence only.
