# Tafseel Project Status

Last updated: 2026-07-30.

## Current Version

No release tag is present. Current audited baseline is commit `79be4cf` on `main`, plus uncommitted Live-Session Availability and concurrent Catalog/Teacher Application working-tree changes.

## Current Phase

The Final Production Readiness Audit (Step 8 / 8) is complete: **READY FOR STAGING VALIDATION**, not Production. Critical blockers remain Mock-only payment/live-session providers (F-003), local file storage (F-004), ADR-011 Showcase media gates, and unproven backup/observability. Steps 5–7 trust badge / public-profile work remain as previously recorded.

## Current Milestone

Roadmap Steps 1–9 are recorded. **Product Bug Fix Sprints 1–3** closed end-user integrity/i18n gaps. **Step 9 Production Infrastructure** added Azure Blob storage, configuration-driven provider selection, fail-closed Production gates, opt-in Application Insights, and ops runbooks. **Mock Payment Simulator** enables full Student→Payment→Delivery lifecycle in Development (and explicitly enabled Staging) through the canonical webhook path. **Order/Request UX separation** ensures Accepted Learning Requests never appear beside their Orders on the Student dashboard. **Remaining Production cutover blockers:** real PSP adapter, real meeting provider, provisioned Azure Blob/Insights secrets, backup drill evidence.

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

Historical feature phases are indexed in [INDEX.md](./INDEX.md).

## Pending Vertical Slices

1. F-003 — real `IPaymentProvider` sandbox + Production fail-closed (highest Critical blocker).
2. F-003 companion — real `ILiveSessionLinkProvider`.
3. Phase 1 — Azure Blob Provider (ADR-011 / F-004); Production Showcase stays disabled.
4. Fix or waive `RoleBootstrapTests` provider-neutral failure observed in Step 8 audit.
5. Seed published qualified Teachers for deferred trust-badge browser smoke.
6. F-005 revision-to-delivery relationship decision.
7. Favorites pagination (F-006).
8. Highly Rated and other performance badges only after formula business rules.

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
