# STEP 7 / 8 — Teacher Public Profile Hardening Report

Date: 2026-07-30  
Status: Implemented and verified against LocalDB SQL Server suites.  
Decision source: [Step 7 investigation](../audits/STEP7_TEACHER_PUBLIC_PROFILE_HARDENING_INVESTIGATION.md)

## Findings

Public Teacher surfaces reused one card/profile shape but applied inconsistent eligibility and catalog filters. Favorites and Reviews could expose Teachers that Browse/Profile hide. Comparison `SampleCount` counted published samples without the public-profile approval/media gates. Public profile DTO shipped owner diagnostics (city, timezone, completeness, blockers). Inactive languages/topics could appear on Profile/Browse. Pre-F-002 marketing copy still implied measured response time / invented completed-order counts.

## Root Cause

Eligibility and public sample rules lived inline in multiple methods instead of one canonical projection. Owner and anonymous consumers shared `TeacherProfileDto` without stripping owner-only fields for `publicOnly`.

## Fix

1. Added `TeacherPublicQueries` with canonical `BrowsableTeachers` / `IsBrowsableAsync` and `VisibleSamples`.
2. Browse `SearchAsync`, Comparison, Favorites (add + list), and Public Profile reuse that eligibility.
3. Public Reviews (`GetTeacherReviewsAsync`) fail closed with `teacher_not_found` when the Teacher is not browsable.
4. Comparison `SampleCount` uses the same visible-sample + playable-media counting as public profile samples.
5. Public profile blanks City/TimeZoneId, clears completeness/eligibility/blockers; owner `/teachers/me` unchanged.
6. Public languages/topics/education levels filter active catalog (+ topic qualification); Browse/Favorites language cards filter `IsActive`.
7. Removed unsupported public wording from locales (fake completed-order counts, “under 2 hours”, “Top rated”, public response-time marketing); kept honest owner self-reported labels and truthful rating display.

No migrations, no new badges/metrics, no Marketplace redesign.

## Validation

- Release build: succeeded
- Focused tests: `TeacherPublicProfileHardeningTests` + `TeacherComparisonTests` + `TeacherTrustBadgeTests` + `Phase4MarketplaceTests` → **17/17 passed** (LocalDB `TafseelLocal`)
- EF pending model changes: none
- Frontend integrity / localization / JS / publish smoke: passed
- Migration safety: exercised (no new migration)
- `git diff --check`: clean on changed sources

## Files Changed

- `src/Tafseel.Infrastructure/Marketplace/TeacherPublicQueries.cs` (new)
- `src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs`
- `src/Tafseel.Infrastructure/Governance/GovernanceService.cs`
- `tests/Tafseel.IntegrationTests/TeacherPublicProfileHardeningTests.cs` (new)
- `js/locales.js`
- `docs/fixes/STEP7_PUBLIC_PROFILE_HARDENING_REPORT.md`
- `docs/INDEX.md`, `docs/PROJECT_STATUS.md`

## Risks

1. Existing Favorite rows for Teachers who later become non-browsable are omitted from list (not auto-deleted).
2. Public profile no longer shows City; Country remains.
3. Orphan locale keys may still exist historically in docs; runtime public copy was cleaned.
4. Post-review refund review visibility remains an open Business Rule (unchanged).

## Final Verdict

**PUBLIC PROFILE HARDENING COMPLETED**

## Next Step

Continue roadmap Step 8 / 8, or ADR-011 Phase 1 Azure Blob Provider for Showcase media, without reopening inventable performance badges.
