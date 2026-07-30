# Limited Teacher Trust Badge MVP

Date: 2026-07-30

Status: Implemented locally; SQL Server verified against `(localdb)\TafseelLocal`; live browser badge matrix still conditional (empty `TafseelLocalDb`).

Decision source: [ADR-010](../decisions/ADR-010-TEACHER-REPUTATION-AND-BADGES.md)

## Findings

Public Teacher surfaces still exposed a client-invented “Top rated” chip (`rating >= 4.8 && ratingCount >= 20`) while backend trust remained an opaque `verified` boolean. ADR-010 approved a Trust-Only MVP: one explainable badge derived from active qualifications, with performance badges blocked.

## Root Cause

Students needed a truthful, explainable trust signal. Performance and milestone badges lack approved formulas (F-002). The only production-ready evidence for a public verification badge is active approved non-revoked subject qualifications linked to active subjects.

## Fix

1. Added `TeacherTrustBadgeDto` (`code`, `category`, `ruleVersion`, optional `subjectId`) and `TeacherTrustBadgeCodes`.
2. Embedded `trustBadges` on `TeacherCardDto`, `TeacherProfileDto`, and `TeacherComparisonDto`.
3. `MarketplaceService` projects `qualified_on_tafseel` / `verification` / `v1` on read when the account is not suspended and ≥1 active approved non-revoked qualification exists for an active subject.
4. Subject lists used for verification now filter `Subject.IsActive`.
5. Frontend: Browse / Profile / Comparison / Teacher Dashboard use `trustBadges`; removed Top rated invent.
6. Locales EN/AR for badge name, detail, section, and not-qualified state.
7. Integration tests: project badge, ignore overposted badges, clear on revoke, clear when subject inactive (SQL Server category).
8. No migration, award table, hidden score, ranking change, or F-002 metric restoration.

## Validation

### SQL Validation

- Instance: `(localdb)\TafseelLocal` (via `TAFSEEL_SQLSERVER_TEST_CONNECTION`); `(localdb)\mssqllocaldb` remains broken (DataDirectory registry).
- App DB used for browser host: `TafseelLocalDb` on the same instance (user-provided `ConnectionStrings__Tafseel`).
- Release build of IntegrationTests: succeeded.
- `TeacherTrustBadgeTests` + `TeacherComparisonTests`: **7/7 passed**.
- Broader marketplace filter (`TeacherEligibleSubjectsAndPublicationTests` | TrustBadge | Phase4Marketplace | Comparison | CanonicalServiceGovernance): **24/24 passed**.
- Frontend integrity / localization / JS checks: passed.
- `git diff --check`: clean (CRLF warnings only).

### Browser Validation

- Hosted Browse against `http://127.0.0.1:5099` with Development + `TafseelLocalDb`.
- DB inventory: **0** users / profiles / qualifications / published services — no legitimate published qualified Teachers.
- Browse empty state: “0 teachers” / Arabic empty copy; **no Top rated invent** in DOM.
- AR + RTL + dark: OK; no horizontal overflow at **375** and **1440**.
- Live chip matrix (qualified / revoked / inactive subject / Comparison / Dashboard): **not executed** — blocked by empty seed data (no mock cards invented).

## Files Changed

- `src/Tafseel.Application/Marketplace/MarketplaceContracts.cs`
- `src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs`
- `Tafseel-Browse-Teachers.dc.html`, `Tafseel-Teacher-Profile.dc.html`, `Tafseel-Teacher-Dashboard.dc.html`
- `js/locales.js`
- `tests/Tafseel.IntegrationTests/TeacherTrustBadgeTests.cs`
- `tests/Tafseel.IntegrationTests/TeacherComparisonTests.cs`
- Docs: this report, INDEX, PROJECT_STATUS

## Risks

1. Live browser badge presentation still unproven until `TafseelLocalDb` has published qualified Teachers.
2. Own-profile SQLite paths still hit pre-existing DateTimeOffset ORDER BY limits; marketplace trust tests remain SqlServer-categorized.
3. Legacy `verified` boolean remains for compatibility alongside `trustBadges`.
4. `(localdb)\mssqllocaldb` still broken; tests require `TafseelLocal` / env override.

## Unverified Scenarios

- Authenticated Browse / Profile / Comparison / Dashboard chip rendering with real published qualified Teachers
- Live revoke → public card clears badge (covered by SQL integration tests; not browser-smoked)
- Visual EN/AR badge chip copy on populated cards

## Backward Compatibility

- Existing `verified` / subject lists retained
- Rating/count remain nullable metrics (not badges)
- Sample `trustCode` labels unchanged
- Public `completedOrders` / measured response time remain null (F-002)
- No schema change

## Final Verdict Update

**LIMITED TEACHER TRUST BADGE IMPLEMENTED BUT CONDITIONALLY VERIFIED**

SQL Server trust-badge behavior is verified against `(localdb)\TafseelLocal`. Remaining blocker: empty `TafseelLocalDb` prevents populated browser smoke of trust chips.

## Next Step

Seed or use real published qualified Teachers in `TafseelLocalDb`, then browser-smoke Browse / Profile / Comparison / Dashboard chips (EN/AR, light/dark, 375/1440). Product next: Step 6 / 8 — do not reopen blocked performance badges unless a Highly Rated formula BR is approved.
