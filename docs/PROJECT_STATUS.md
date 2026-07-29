# Tafseel Project Status

Last updated: 2026-07-29.

## Current Version

No release tag is present. The shared `main` workspace advanced externally to commit `a0c82a4`; the final timeline keyboard and documentation changes remain uncommitted.

## Current Phase

Owned Order Lifecycle Timeline completed locally after F-001 and F-002.

## Current Milestone

Production-correct startup, public teacher metric boundaries and the owned Order lifecycle timeline are completed locally.

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
| Owned Order lifecycle timeline | Completed locally | [Timeline report](./features/PHASE2_ORDER_TIMELINE_REPORT.md) |

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
| Owned Order Lifecycle Timeline | Completed locally |

Historical feature phases are indexed in [INDEX.md](./INDEX.md).

## Pending Vertical Slices

1. Revision-to-delivery version linkage.
2. Favorites pagination.
3. Availability and teacher capacity after rule approval.
4. Teacher comparison after metric correction.
5. Student learning preferences.
6. Explainable deterministic matching.
7. Teacher/student analytics after event instrumentation.
8. Quality trends, trust extensions, learning timeline and portfolio moderation.

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

Latest Owned Order Lifecycle Timeline validation:

- Locked restore, format verification and Release build: passed; 0 warnings and 0 errors.
- Phase 5 Order integration suite and focused refund timeline test: 5 passed, 0 failed.
- Domain, Application and Architecture tests: 63 passed, 0 failed.
- Integration tests: 133 passed, 2 unrelated Marketplace time-out failures.
- Frontend validation: passed across 12 entry points with 1,873 English/Arabic key pairs.
- EF pending model changes: none.
- Migration safety tests: 9 passed; publish smoke passed.
- Populated browser timeline rendering remains unclaimed because no legitimate safe owned-Order fixture was available.

## Deployment Status

- Development: available; final keyboard and documentation changes are local and uncommitted.
- CI: not run remotely; equivalent local gates were exercised.
- Staging: not deployed or validated during these passes.
- Production: manual deployment remains; no deployment performed.
- Database: no migration generated or applied.

## Next Recommended Pass

Focused F-005 revision-to-delivery version linkage evidence and schema decision.
