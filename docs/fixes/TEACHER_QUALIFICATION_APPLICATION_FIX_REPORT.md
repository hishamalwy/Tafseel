# Teacher Qualification Application Fix Report

Date: 2026-07-29  
Status: Fixed locally; not committed or deployed

## Findings

| Area | Classification | Evidence |
|---|---|---|
| `GET /api/v1/teachers/me/languages` | API Contract Mismatch | The repository exposed only `PUT me/languages`; no GET action or service contract existed. |
| Progressive initial rendering | UI/UX Issue | The page rendered languages and subjects, then awaited topics, applications and onboarding sequentially. One rejection aborted the whole chain. |
| Google Fonts CSP failure | Dead Code / stale deployed behavior | The current page has no Google Fonts reference. Shared CSS uses self-hosted Thmanyah Sans for Arabic and English, and CSP remains `font-src 'self'`. |
| Subject/topic labels | Data Integrity Issue plus UI/UX Issue | Select values were canonical IDs, but labels ignored `nameAr`/`titleAr`. Values such as `uh` or `Hisham` originate in catalog content; the page did not manufacture them. |
| Degree value `100` | Validation Gap | Required/string-length validation accepted numeric-only city and qualification values. |
| Generic save failure | UI/UX Issue | The page passed server text through the generic API helper and did not map known codes to localized actions. |
| Assignment card | UI/UX Issue plus API Contract Mismatch | The API omitted original filename/content type and the card omitted evaluation guidance, bilingual title, complete resource metadata and the material-only warning. |

## Root Cause

The exact defect present in this revision is a missing GET contract, not a null navigation or missing-profile exception: ASP.NET routing had a `PUT /api/v1/teachers/me/languages` action but no GET action. A GET against this source would therefore not reach `MarketplaceService`; depending on the host/router it resolves as method-not-allowed or a host fallback. The reported deployed 500 stack trace is not present in repository evidence and cannot be reconstructed safely without that deployment's server log. The corrected endpoint now has a deterministic tested behavior for missing profiles and rows.

Initial rendering was sequential because the original initializer used one `Promise.all` for three requests and then awaited three additional loads that each mutated the DOM. The form also trusted catalog display values without selecting localized fields, and the domain accepted any non-whitespace city/degree text.

## Fix

- Added authorized `GET /api/v1/teachers/me/languages`, reusing the existing selected-language `NamedItemDto` shape.
- The query does not require a `TeacherProfile`; a valid teacher with no rows returns `[]`.
- Replaced sequential initialization with one `Promise.allSettled` group, one dependent topics request after the subject is known, one state assignment and one initial render.
- Added explicit `initialLoading`, `topicsLoading`, `submitLoading`, `languagesError`, `topicsError` and `submitError` states.
- Added a full-form skeleton and accessible named status/error regions.
- Kept GUIDs as select values; labels now use localized subject names and localized qualification titles.
- Added client, DTO and domain validation requiring Unicode letters in city and degree/qualification, while retaining the existing 0–80 integer experience constraint and server-side subject/topic ownership check.
- Expanded assignment resources with filename and content type and rendered bilingual title, instructions, durations, evaluation guidance, official resources/actions and a localized material-only warning.
- Mapped known backend codes to safe localized messages. SQL details and stack traces remain server-only; the existing exception handler logs TraceId, CorrelationId and endpoint path.
- Preserved CSP. No external font/CDN source was added.

Before:

`session → subjects/languages/profile → partial render → topics → render → applications → render → onboarding`

After:

`session → subjects/languages/profile/applications/onboarding concurrently → selected subject → dependent topics → atomic state/render`

## Validation

- `dotnet restore Tafseel.sln --locked-mode`: passed.
- Release solution build: passed, 0 warnings and 0 errors.
- Focused domain tests: 15 passed.
- Focused authorization/integration tests: 3 passed.
- Added endpoint coverage for anonymous/forbidden access, a new teacher without a profile, saved languages and a partial profile without language rows.
- Added domain coverage for numeric-only city/degree rejection and catalog coverage for assignment filename/content-type exposure.
- Provider-neutral solution tests: 138 passed (`57` domain, `5` application, `1` architecture, `75` integration).
- JavaScript syntax and frontend integrity: passed for 12 entry points.
- Localization parity: 1,811 keys in both English and Arabic.
- `dotnet format --verify-no-changes`: passed.
- EF pending model changes: none.
- Publish smoke: passed.
- Impeccable UI detector: no findings.
- CSP/font scan: no `fonts.googleapis.com`, `fonts.gstatic.com` or external font/CDN references in the page, its script or shared CSS.
- Static responsive audit: 375px collapses two-column fields and resource actions; 768/1024/1440 retain the existing grid; task metadata wraps; logical direction and tokenized light/dark colors are preserved.
- Authenticated dynamic browser verification could not run because the existing local servers on ports 4173/8765/8766 returned empty responses. Those user-owned processes were not stopped or replaced.
- `git diff --check`: passed after product and documentation changes.

## Files Changed

- `Tafseel-Teacher-Apply.dc.html`
- `js/api.js`
- `js/locales.js`
- `js/teacher-apply.js`
- `src/Tafseel.Api/Controllers/MarketplaceController.cs`
- `src/Tafseel.Application/Catalog/CatalogContracts.cs`
- `src/Tafseel.Application/Marketplace/MarketplaceContracts.cs`
- `src/Tafseel.Application/TeacherApplications/TeacherApplicationContracts.cs`
- `src/Tafseel.Domain/TeacherApplications/TeacherApplication.cs`
- `src/Tafseel.Infrastructure/Catalog/CatalogService.cs`
- `src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs`
- `tests/Tafseel.Domain.Tests/TeacherApplicationTests.cs`
- `tests/Tafseel.IntegrationTests/CatalogTests.cs`
- `tests/Tafseel.IntegrationTests/TeacherApplicationAuthorizationTests.cs`
- `docs/fixes/TEACHER_QUALIFICATION_APPLICATION_FIX_REPORT.md`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

## Risks

- Existing catalog records named `uh` or `Hisham` remain unchanged because their intended replacements are business data, not inferable code fixes.
- Saving languages and the application still uses two existing endpoints, so it is not a cross-endpoint database transaction. Languages are saved first to prevent an application from appearing saved when the language request fails; redesigning this lifecycle was out of scope.
- Dynamic authenticated viewport verification remains pending until one working local/staging app host is available.
- The deployed 500's historical exception remains unknown without its corresponding server log/TraceId.

## Next Step

Run one authenticated browser pass against a working app host at 375, 768, 1024 and 1440 pixels in Arabic/English and light/dark, then correlate any prior deployed 500 with its TraceId/CorrelationId log before release. Catalog owners should separately correct any placeholder subject or assignment names through the existing admin catalog workflow.
