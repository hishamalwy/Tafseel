# Teacher Comparison Report

Date: 2026-07-29  
Status: Implemented locally; browser verification conditional  
Baseline: `7323c9e` on `main`  
Migration: None generated or applied

## Findings

The existing Browse Teachers page contained a comparison checkbox, a maximum-three guard and a tray, but its action only displayed a temporary message. It had no public comparison contract or truthful comparison presentation.

### Comparison-field evidence

| Field | Source | Classification | Public Safety | Decision |
|---|---|---|---|---|
| Display name | Existing public card/profile user projection | Safe Public Field | Already public for published profiles | Included; English name is used when available in English UI |
| Avatar | Existing public avatar endpoint and `hasAvatar` flag | Safe Public Field | Storage key remains private | Included through the existing safe avatar URL helper |
| Headline | Published `TeacherProfile` | Safe Public Field | Already returned publicly | Included |
| Biography | Published `TeacherProfile` | Safe Public Field | Already returned publicly | Included |
| Verified status | Active approved, non-revoked subject qualification | Derived Public Field | No writable verification flag | Included as qualification-derived evidence |
| Qualified subjects | Active qualifications joined to active subjects | Derived Public Field | Existing public qualification evidence | Included with English/Arabic catalog names |
| Qualified topics | Teacher-selected topics limited to active qualified subjects | Safe Self-Reported Field | Selection is teacher-entered, not verified topic expertise | Included without a verified-topic claim |
| Teaching languages | Teacher languages joined to active catalog rows | Safe Self-Reported Field | Existing public profile data | Included |
| Education levels | Teacher education-level selections joined to active catalog rows | Safe Self-Reported Field | Existing public profile data | Included |
| Active services | Active Teacher services with public/selectable active catalog types and active qualified subjects | Safe Public Field | Uses canonical service eligibility | Included |
| Service types | Public service catalog | Safe Public Field | Catalog-controlled | Included with English/Arabic type names |
| Starting price | Minimum eligible public service price | Derived Public Field | Does not imply total Teacher cost | Included as “Starting price” |
| Service-specific prices | Eligible public Teacher services | Safe Public Field | Currency preserved per service | Included beside each service/type |
| Average rating | Moderated aggregate on published profile, only when `RatingCount > 0` | Derived Public Field | Preserves F002 null semantics | Included; unrated remains `null` |
| Rating count | Moderated aggregate on published profile | Derived Public Field | Existing public evidence | Included |
| Experience timeline | `TeacherExperience` | Safe Self-Reported Field | Not independently verified | Included and explicitly labeled self-reported |
| Teaching samples | Count of published samples in active qualified subjects | Derived Public Field | No storage key or private media token returned | Included as a count |
| Next availability | Existing rule/slot data does not provide one normalized inexpensive comparison value | Business Rule Required | Inferring “available now” would be misleading | Omitted |
| Profile publication status | Canonical publication/qualification/service gate | Derived Public Field | Must gate the response, not be exposed as internal state | Used only for eligibility |
| Completed orders | No approved public formula/evidence | Unsupported Metric | F002 explicitly removed it | Omitted |
| Measured response time | No approved public measurement | Unsupported Metric | F002 explicitly removed it | Omitted |
| Acceptance/cancellation/refund/revision rates | No approved public formulas | Unsupported Metric | Would create unsupported performance claims | Omitted |
| Email, phone, identity documents, Quality notes, disputes and finance data | Private/internal records | Private Field | Not needed for comparison | Omitted |

## Root Cause

Teacher comparison had not previously been implemented. The Browse page’s existing controls stopped at local selection state and a placeholder toast. Reusing the complete public profile endpoint would have loaded a broad graph once per Teacher and made query count scale with the selection. A focused bounded public projection was therefore the smallest safe completion.

## Fix

Added one bounded anonymous Marketplace comparison endpoint, explicit allowlisted DTOs, fixed-query public projections, focused SQL integration coverage and a localized accessible Browse-page comparison dialog. Existing card selection state and shared modal keyboard behavior were reused. No persistence, schema, cache, framework or business-rule change was introduced.

## Product Behavior

- A public visitor or authenticated user can select two or three published Teachers on Browse Teachers.
- A fourth selection is rejected with a localized message; existing selections are not replaced.
- Selection remains temporary in the current Browse page state and survives filter changes on that page.
- Compare remains disabled below two selections.
- The comparison is neutral and contains no winner, recommendation, score, badge or hidden ordering.
- Unavailable or unpublished selections are omitted by the server, counted safely and removed from current browser selection.
- A Teacher can be removed from the open comparison.
- Missing values use localized “Not provided”; unrated Teachers use localized “No public reviews yet”.
- Cross-page/profile selection persistence was intentionally omitted because the current frontend has no shared temporary navigation-state mechanism. Browse comparison remains complete without server persistence.

Duplicate IDs are rejected with `409 comparison_duplicate_teacher`. Fewer than two, more than three and malformed IDs are rejected with safe `400` domain responses.

## Architecture

The existing Marketplace controller and service own the feature:

`GET /api/v1/teachers/compare?ids={id1}&ids={id2}&ids={id3}`

The endpoint is anonymous, accepts exactly two or three unique GUID-form public Teacher identifiers and returns an explicit allowlisted DTO. It does not expose EF entities. Requested Teacher ordering is restored after the database projection.

No controller, framework, client store, cache, database entity or migration was added.

## API Contract

The response contains:

- `requestedCount`
- `unavailableCount`
- `teachers`
  - public Teacher identity, avatar presence, headline and biography
  - qualification-derived status and subjects
  - selected topics, languages and education levels
  - eligible public services and prices
  - nullable rating and rating count
  - self-reported experience
  - published sample count

It does not contain `CompletedOrders`, `ResponseTimeMinutes`, storage keys, contact details, moderation state, disputes, earnings or financial data.

## Query and Performance Evidence

For any successful comparison containing at least one eligible Teacher, the service executes eight fixed `AsNoTracking` reads:

1. Publication-gated profile/user rows.
2. Active qualified subjects.
3. Active selected topics within active qualified subjects.
4. Active teaching languages.
5. Active education levels.
6. Eligible public services and prices.
7. Self-reported experience rows.
8. Published sample counts in active qualified subjects.

The integration test asserts exactly eight reads for both a two-Teacher and a three-Teacher comparison. The count does not scale per Teacher. If every requested Teacher is unavailable, the service returns after the first publication-gating query.

## Security and Privacy

- Eligibility matches the existing public search/profile rules: published profile, confirmed and unsuspended user, active approved qualification and an eligible active public service.
- Scheduled-only services require an existing availability rule, matching current publication behavior.
- Revoked qualifications remove the Teacher from comparison.
- Missing and unpublished identifiers share the same safe unavailable response; unpublished biography evidence is not returned.
- IDs are parsed and normalized before database access.
- `teacherId` remains the existing public profile routing identifier, not a newly exposed private key.
- Private storage keys and private media URLs are never projected.
- Avatar URLs are derived by the existing public helper; only `hasAvatar` is returned.
- Sample files are represented only by a published count.
- Domain validation is handled by the existing safe API exception contract; SQL details and stack traces are not returned.

## Frontend and Accessibility

- Existing card checkboxes now have localized state-aware labels.
- The sticky comparison tray announces the selected count through an `aria-live` status region.
- The dialog uses `role="dialog"`, `aria-modal`, Escape handling, focus trapping and focus restoration through the existing shared modal helper.
- Desktop uses a semantic table with column and row headers.
- Mobile switches to stacked comparison cards below 720px; the desktop table owns its internal horizontal scroll and does not overflow the page.
- Remove, retry, close and profile actions are keyboard accessible and text-labeled.
- English/LTR and Arabic/RTL keys are paired.
- Numbers, ratings and currencies use `Intl`.
- Experience is visibly labeled self-reported.
- Loading, error, unavailable, fewer-than-two, missing-value, unrated and success states are distinct.
- The Impeccable detector reported one pre-existing/advisory `single-font` warning because the page inherits its real font system from linked CSS while one inline price label names the mono token. No visual-system change was made for this false-positive detector limitation.

## Validation

| Command | Exit code | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| `dotnet restore Tafseel.sln --locked-mode` | 0 | 8 projects restored/up-to-date | 0 | 0 |
| `dotnet format Tafseel.sln --verify-no-changes --no-restore` | 0 | 1 solution | 0 | 0 |
| `dotnet build Tafseel.sln -c Release --no-restore` | 0 | 8 projects; 0 warnings | 0 | 0 |
| `dotnet test tests\Tafseel.IntegrationTests\Tafseel.IntegrationTests.csproj -c Release --no-build --no-restore --filter "FullyQualifiedName~TeacherComparisonTests" --logger "console;verbosity=minimal"` | 0 | 4 | 0 | 0 |
| `dotnet test tests\Tafseel.IntegrationTests\Tafseel.IntegrationTests.csproj -c Release --no-build --no-restore --filter "FullyQualifiedName~Phase4MarketplaceTests" --logger "console;verbosity=minimal"` | 1 | 5 | 2 timeout/500 | 0 |
| `dotnet test tests\Tafseel.IntegrationTests\Tafseel.IntegrationTests.csproj -c Release --no-build --no-restore --filter "FullyQualifiedName~Phase4MarketplaceTests.Favorites_are_unique_and_idempotent" --logger "console;verbosity=minimal"` | 0 | 1 | 0 | 0 |
| `dotnet test tests\Tafseel.IntegrationTests\Tafseel.IntegrationTests.csproj -c Release --no-build --no-restore --filter "FullyQualifiedName~Phase4MarketplaceTests.Public_search_has_fixed_sort_pagination_filters_and_two_queries" --logger "console;verbosity=minimal"` | 0 | 1 | 0 | 0 |
| `dotnet test tests\Tafseel.IntegrationTests\Tafseel.IntegrationTests.csproj -c Release --no-build --no-restore --filter "FullyQualifiedName~Phase9GovernanceTests.Completed_paid_order_review_is_unique_moderated_and_aggregated" --logger "console;verbosity=minimal"` | 0 | 1 | 0 | 0 |
| `dotnet test tests\Tafseel.IntegrationTests\Tafseel.IntegrationTests.csproj -c Release --no-build --no-restore --filter "FullyQualifiedName~TeacherApplicationFlowTests" --logger "console;verbosity=minimal"` | 0 | 1 | 0 | 0 |
| `dotnet test tests\Tafseel.ArchitectureTests -c Release --no-build --no-restore` | 0 | 1 | 0 | 0 |
| `dotnet test tests\Tafseel.Domain.Tests -c Release --no-build --no-restore` | 0 | 57 | 0 | 0 |
| `dotnet test tests\Tafseel.Application.Tests -c Release --no-build --no-restore` | 0 | 5 | 0 | 0 |
| `dotnet test tests\Tafseel.IntegrationTests -c Release --no-build --no-restore --filter "Category!=SqlServer"` | 0 | 79 | 0 | 0 |
| `dotnet test tests\Tafseel.IntegrationTests -c Release --no-build --no-restore --filter "Category=SqlServer"` | 0 | 60 | 0 | 0 |
| `node scripts\ci\check-js.mjs` | 0 | 12 entry points / 1,934 paired keys and delegated checks | 0 | 0 |
| `node scripts\ci\check-frontend-integrity.mjs` | 0 | 12 entry points | 0 | 0 |
| `node scripts\ci\check-localization.mjs` | 0 | 12 entry points / 1,934 paired keys | 0 | 0 |
| `node scripts\ci\check-auth-ui.mjs` | 0 | Auth mode isolation | 0 | 0 |
| `dotnet ef migrations has-pending-model-changes --project src\Tafseel.Infrastructure --startup-project src\Tafseel.Api --configuration Release --no-build` | 0 | No pending model changes | 0 | 0 |
| `.\scripts\ci\tests\check-migration-safety.tests.ps1` | 0 | 9 | 0 | 0 |
| `dotnet publish src\Tafseel.Api\Tafseel.Api.csproj -c Release --no-restore -o artifacts\publish` | 0 | Publish completed | 0 | 0 |
| `.\scripts\ci\validate-publish.ps1` | 0 | Publish smoke | 0 | 0 |
| `git diff --check` | 0 | No whitespace errors | 0 | 0 |

The broad Marketplace class reproduced the documented SQL isolation/timeout symptom in two tests. Both passed immediately in isolated fresh runs, and the complete SQL Server suite later passed 60/60 without assertion or timeout changes. No production change was made for that unrelated flake.

Publish completed with two nullable warnings in the concurrently modified Teacher Application service. They are outside this slice; the normal Release build completed with zero warnings.

## Browser Validation

A controlled host was started with:

`dotnet run --project src/Tafseel.Api -c Release --no-build --launch-profile http`

- Host: `http://localhost:5089/app/Tafseel-Browse-Teachers.dc.html`
- Environment: `Development`
- The controlled process was stopped after validation; port 5089 was released.
- Existing user-owned Python processes on ports 8765 and 8766 returned empty responses and were not stopped or replaced.
- Real runtime validation confirmed Arabic/RTL light mode and English/LTR dark mode, zero page horizontal overflow at the available 1280px browser viewport, localized empty state, authenticated public-header behavior and no browser console errors.
- The public API returned zero published Teachers. No fake cards, direct database rows or mock browser data were created.

## Unverified Scenarios

Dynamic browser interaction with two/three real published Teachers remains conditional:

- selecting two and three Teachers;
- blocking a fourth;
- opening the populated comparison;
- removing a Teacher;
- opening the compared public profile;
- populated unrated/missing-value rendering;
- populated layouts at 375px, 768px, 1024px and 1440px;
- keyboard traversal inside a populated dialog;
- populated comparison network request inspection.

The same behavior is covered by focused SQL integration tests, frontend behavior smoke tests, semantic/static responsive checks and localization checks, but it was not represented as completed browser evidence.

## Files Changed

Teacher Comparison files:

- `Tafseel-Browse-Teachers.dc.html`
- `js/locales.js`
- `scripts/ci/check-frontend-integrity.mjs`
- `src/Tafseel.Api/Controllers/MarketplaceController.cs`
- `src/Tafseel.Application/Marketplace/MarketplaceContracts.cs`
- `src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs`
- `tests/Tafseel.IntegrationTests/TeacherComparisonTests.cs`
- `docs/features/TEACHER_COMPARISON_REPORT.md`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

Concurrent Teacher Qualification Application changes visible in the shared worktree are not part of this slice.

## Risks

1. Populated browser behavior is not dynamically verified because Development has no legitimate published Teachers.
2. The current page-local comparison state does not persist across profile navigation; adding that later requires an explicit shared temporary-state decision.
3. Selected topics and experience are truthful Teacher-entered profile claims, not independently verified expertise.
4. Availability remains omitted until a normalized public business rule is approved.
5. The known SQL Marketplace order/isolation timeout remains observable even though isolated reruns and the full SQL suite pass.

## Backward Compatibility

- Existing search, profile, favorites, service, booking and request routes are unchanged.
- Existing public DTOs were not widened.
- The endpoint is additive.
- No business rule, entity, schema or migration changed.
- F002 null-rating and unsupported-metric protections remain intact.
- F-005 remains documented and deferred.

## Final Verdict

TEACHER COMPARISON IMPLEMENTED BUT CONDITIONALLY VERIFIED

## Next Step

Teacher Availability and Capacity Business-Rule Decision Pass
