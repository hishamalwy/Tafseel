# F-002 Public Teacher Metrics Integrity Report

Date: 2026-07-29  
Status: Fixed locally; not committed or deployed.

## Findings

| Metric | Current Source | Writer | Public Usage | Classification | Decision |
|---|---|---|---|---|---|
| `CompletedOrders` | Persisted `TeacherProfile.CompletedOrders` integer, defaulting to zero | No production writer was found | Teacher search/card, favorites, public profile and the former default ranking | Stale Projection | Retain the column for compatibility, return `null` publicly and privately, and remove it from display and sorting. A direct order count is not safe until refund, dispute, reopen and cancelled-after-completion rules are approved. |
| `CompletedSessions` | Persisted live-session rows and statuses | Live-session lifecycle services | Teacher Dashboard only; it was mislabeled by counting every session as upcoming | Derived Production Metric | Keep private. Count only `AwaitingPayment` and `Confirmed` rows for the upcoming-session summary. Do not expose a public performance claim. |
| `StudentsTaught` | No field or deterministic approved projection | None | No public API or active UI usage found | Unsupported Metric | Do not add or display it. |
| `ResponseTimeMinutes` | Persisted `TeacherProfile.ResponseTimeMinutes` | Teacher profile update | Former teacher cards/profile, request/booking pages, landing copy, default ranking and fastest-response sort | Manual Profile Attribute | Hide from all public responses and performance UI/sorts. Retain only on the owner profile and label it self-reported. No request-received/first-response evidence or approved event definition exists. |
| `AverageRating` | Persisted `TeacherProfile.AverageRating`, recalculated from visible eligible reviews | `GovernanceService.RefreshRatingAsync` after review creation and moderation | Search/card/profile/favorites and highest-rated sort | Verified Production Metric | Keep. Return `null` when `RatingCount == 0`; use only the same visible-review population for the average and count. |
| `ReviewCount` / `RatingCount` | Persisted `TeacherProfile.RatingCount`, recalculated with the rating | `GovernanceService.RefreshRatingAsync` | Search/card/profile/favorites and zero-data handling | Verified Production Metric | Keep. Zero reviews means count `0` and rating `null`, not rating `0`. Hidden reviews are removed from both values. |
| `YearsOfExperience` | Teacher-entered `TeacherExperience` timeline; no numeric verified field | Teacher profile experience endpoints | Former most-experienced sort and “Verified experience” card copy | Manual Profile Attribute | Keep the descriptive timeline, remove the verified claim and public performance sort. |
| `ActiveQualificationCount` | Count/existence of approved, non-revoked `TeacherSubjectQualification` rows | Qualification approval/revocation workflow | Internal eligibility and subject list; no public numeric metric | Derived Production Metric | Keep as an internal derivation. Do not introduce a public count. |
| Verified / Qualified status | Existence of an approved, non-revoked subject qualification | Qualification workflow | Public verified flag, subject list and publication gating | Derived Production Metric | Preserve the canonical derivation. No writable boolean was introduced. |
| Acceptance metric | No approved numerator, denominator, exclusions or date window | None | No active public field found | Business Rule Required | Do not expose, calculate or sort by it. |
| Cancellation metric | Order/request statuses exist, but attribution and exclusions are undefined | Lifecycle services | No active public field found | Business Rule Required | Do not expose, calculate or sort by it. |
| Revision metric | Revision records exist, but target-delivery linkage and public formula are unresolved | Order lifecycle services | No active public teacher metric found | Business Rule Required | Do not expose, calculate or sort by it. |
| Completion rate | Order statuses exist, but refund, dispute, reopen and late-cancellation semantics are unresolved | Order lifecycle services | No active public rate found | Business Rule Required | Do not infer a rate or replace the stale counter in this pass. |
| Refund metric | Payment/refund records exist but are private financial data with no public rule | Finance services | No active public teacher metric found | Business Rule Required | Keep private and do not reuse for public ranking. |
| Starting price | Minimum active `TeacherService.Price` for active catalog/subject rows | Teacher service workflow | Cards and ascending/descending price sorts | Display Metadata | Keep; add deterministic name and teacher-ID tie-breaks. |
| Name | `ApplicationUser.FullName` | Account profile workflow | Default public sort | Display Metadata | Use as the neutral default sort with teacher ID as the deterministic tie-break. |

The Admin Dashboard uses direct operational user, application, order, payment, ledger, dispute and withdrawal queries. It does not reuse the unsupported public teacher fields, so no Admin metric was changed.

## Root Cause

The public marketplace contract exposed legacy profile columns as non-null performance numbers even though `CompletedOrders` had no production writer and `ResponseTimeMinutes` was teacher-editable. Database defaults and frontend `0`/fallback conversions then turned absent evidence into apparently measured performance. The same fields also influenced ranking, making the misleading values affect discovery.

Rating aggregation is different: eligible reviews require a completed paid order, review uniqueness is enforced, and review creation/moderation transactionally recalculates both average and count from the same visible-review population. Its defect was only zero-review serialization and presentation.

## Fix

- Made public rating nullable while keeping `RatingCount`.
- Kept `CompletedOrders` and `ResponseTimeMinutes` JSON properties for compatibility but return `null` on public cards, favorites and profiles.
- Kept the teacher-entered response estimate only on the owner profile and labeled it self-reported.
- Replaced the unsupported default ranking with deterministic name then teacher-ID ordering.
- Removed fastest-response, most-experienced and recommended ranking from the backend allowlist and public UI.
- Required a positive minimum-rating filter to select only teachers with at least one visible review.
- Kept highest-rated and price sorts, adding deterministic name and teacher-ID tie-breaks.
- Corrected the private Teacher Dashboard upcoming-session count to include only reserving statuses.
- Added focused integration and frontend integrity checks.
- Generated no migration and changed no business lifecycle.

## API Compatibility

The existing property names remain in the public JSON contract. `rating`, `completedOrders` and `responseTimeMinutes` are now nullable, which is an honest but potentially source-breaking change for clients that assumed numbers. Returning fabricated zero values was rejected.

The supported sort set is now `name`, `highest-rated`, `lowest-price` and `highest-price`. Legacy `recommended`, `fastest-response` and `most-experienced` values return the existing `400 invalid_sort` validation response; they are not silently remapped. The default request sort is `name`.

No dedicated OpenAPI snapshot or repository contract-generation command exists, so no standalone OpenAPI artifact was generated. Release compilation and integration serialization tests cover the changed contract.

## Sorting and Filtering Changes

| User-facing option | Backend expression | Tie-break | Evidence decision |
|---|---|---|---|
| Name | `ApplicationUser.FullName` ascending | Teacher ID | Supported display metadata; neutral default |
| Highest rated | Rated population first, then `AverageRating` descending | Full name, then teacher ID | Supported verified metric |
| Lowest price | Minimum active service price ascending | Full name, then teacher ID | Supported display metadata |
| Highest price | Minimum active service price descending | Full name, then teacher ID | Supported display metadata |
| Recommended | Removed | N/A | No approved ranking rule |
| Fastest response | Removed | N/A | Source is self-reported, not measured |
| Most experienced | Removed | N/A | Source is self-declared and not a verified numeric metric |

`minimumRating=0` now means no rating threshold. A positive threshold excludes unrated teachers and filters only the verified rating population.

## Frontend Changes

- Browse, landing, teacher profile, booking, request and saved-teacher cards no longer convert missing ratings into zero or display unsupported completion/response claims.
- Browse exposes only name, rating and price sorts.
- Empty review state uses an em dash and localized no-review copy.
- The former “Verified experience” copy and unsupported landing response claims were removed.
- English/Arabic parity was added for the neutral name sort and self-reported response label.
- API errors keep the existing error/empty-result path and do not create numeric statistics.
- At 375 px and 1440 px, browser inspection found no horizontal overflow and confirmed the Arabic sort set. Full card rendering was blocked by the unrelated current-worktree `Tafseel.avatarUrl` asset mismatch described under Risks.

## Validation

| Command / check | Exit code | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| `dotnet restore Tafseel.sln --locked-mode` | 0 | 8 projects restored/up-to-date | 0 | 0 |
| `dotnet format Tafseel.sln --verify-no-changes --no-restore` | 0 | 1 solution | 0 | 0 |
| `dotnet build Tafseel.sln -c Release --no-restore` | 0 | 8 projects; 0 warnings | 0 | 0 |
| `dotnet test tests\Tafseel.IntegrationTests\Tafseel.IntegrationTests.csproj -c Release --no-build --no-restore --filter "FullyQualifiedName~Phase4MarketplaceTests.Public_search_has_fixed_sort_pagination_filters_and_two_queries" --logger "console;verbosity=minimal"` | 0 on clean rerun | 1 | 0 | 0 |
| `dotnet test tests\Tafseel.IntegrationTests\Tafseel.IntegrationTests.csproj -c Release --no-build --no-restore --filter "FullyQualifiedName~Phase4MarketplaceTests.Favorites_are_unique_and_idempotent" --logger "console;verbosity=minimal"` | 0 | 1 | 0 | 0 |
| `dotnet test tests\Tafseel.IntegrationTests\Tafseel.IntegrationTests.csproj -c Release --no-build --no-restore --filter "FullyQualifiedName~Phase9GovernanceTests.Completed_paid_order_review_is_unique_moderated_and_aggregated" --logger "console;verbosity=minimal"` | 0 | 1 | 0 | 0 |
| `dotnet test tests\Tafseel.ArchitectureTests -c Release --no-build --no-restore` | 0 | 1 | 0 | 0 |
| `dotnet test tests\Tafseel.Domain.Tests -c Release --no-build --no-restore` | 0 | 57 | 0 | 0 |
| `dotnet test tests\Tafseel.Application.Tests -c Release --no-build --no-restore` | 0 | 5 | 0 | 0 |
| `dotnet test tests\Tafseel.IntegrationTests -c Release --no-build --no-restore --filter "Category!=SqlServer"` | 0 | 79 | 0 | 0 |
| Focused Node F002 assertions over six public consumers and locale parity | 0 | 6 pages + 1 paired key | 0 | 0 |
| `node scripts\ci\check-frontend-integrity.mjs` | 1 | F002 checks not reached | 1 unrelated avatar-helper smoke failure | 0 |
| `node scripts\ci\check-js.mjs` | 1 | Auth UI isolation and syntax stage | 1 unrelated Quality Dashboard localization string | 0 |
| `dotnet ef migrations has-pending-model-changes --project src\Tafseel.Infrastructure --startup-project src\Tafseel.Api --no-build` | 0 | No pending model changes | 0 | 0 |
| `git diff --check` | 0 | No whitespace errors | 0 | 0 |
| `.\scripts\ci\tests\check-migration-safety.tests.ps1` | 0 | 9 | 0 | 0 |
| `.\scripts\ci\tests\deploy-gates.tests.ps1` | 0 | 46 | 0 | 0 |
| `.\scripts\ci\tests\staging-migration.tests.ps1` | 0 | 34 | 0 | 0 |
| Impeccable detector on seven affected pages | 1 | 0 functional F002 errors | 8 pre-existing typography warnings | 0 |
| In-app Browser at 375 px and 1440 px, Arabic RTL | N/A | Sort options and no-overflow checks | Card render blocked by unrelated cached `avatarUrl` helper mismatch | English/card-data inspection |

Diagnostic runs also reproduced the existing SQL Server isolation flake: the public-search test once observed four commands instead of its isolated 1–2 range, and combined Marketplace runs timed out in either public search or favorites. Each affected test passed alone without production changes. Background outbox activity shares the fixture command counter and can continue while a test database is being torn down. Classification: **Test Issue**. Assertions and timeout were not weakened.

The existing red gates were rechecked. The Quality Dashboard still contains the unrelated visible string `Save notification settings`. The previously reported EF pending-model gate is no longer blocked: the current avatar migration and snapshot match and EF reports no pending model changes.

## Files Changed

F002 changes are contained in:

- `src/Tafseel.Application/Marketplace/MarketplaceContracts.cs`
- `src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs`
- `tests/Tafseel.IntegrationTests/Phase4MarketplaceTests.cs`
- `tests/Tafseel.IntegrationTests/Phase9GovernanceTests.cs`
- `Tafseel-Browse-Teachers.dc.html`
- `Tafseel-Landing.dc.html`
- `Tafseel-Teacher-Profile.dc.html`
- `Tafseel-Book-Session.dc.html`
- `Tafseel-Request.dc.html`
- `Tafseel-Student-Dashboard.dc.html`
- `Tafseel-Teacher-Dashboard.dc.html`
- `js/locales.js`
- `scripts/ci/check-frontend-integrity.mjs`
- `docs/fixes/F002_TEACHER_METRICS_INTEGRITY_REPORT.md`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

Several listed files already contained unrelated uncommitted avatar/profile or qualification changes. Those changes were preserved.

## Risks

- Nullable public numeric fields may require generated-client updates even though JSON property names remain stable.
- The legacy `CompletedOrders` column remains in the schema and could be mistaken for a valid projection by future code; this report records that it has no production writer.
- The full frontend gate and live card render remain blocked by unrelated shared-worktree avatar/localization issues, so F002 frontend validation is focused rather than repository-wide.
- SQL Server fixture background activity can contaminate a global query counter or database teardown. This test isolation defect was not expanded into F002 production code.

## Unresolved Business Rules

- Which order states count as completed public work after refunds, disputes, reopen, revision and cancellation-after-completion?
- What event is the first teacher response: clarification, acceptance, decline or chat?
- Should response time exclude unavailable hours, and over what window?
- What are the numerator, denominator, exclusions and date windows for acceptance, cancellation, revision, completion and refund metrics?
- Can experience ever become verified, and if so through which evidence and revocation workflow?

Until these rules are approved and encoded, the corresponding values remain absent from public performance claims.

## Backward Compatibility

No route, property name, database column or lifecycle was removed. Unsupported fields serialize as `null`; unsupported legacy sorts receive explicit validation failure. The owner can still maintain a self-reported response estimate. Existing qualification, service, favorite, publication and review moderation behavior remains intact.

## Final Verdict

F002 CONFIRMED AND FIXED

## Next Step

Owned Order Lifecycle Timeline using existing persisted evidence only.
