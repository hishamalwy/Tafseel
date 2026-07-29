# Teacher Qualification Browser Validation Report

Date: 2026-07-29  
Status: Validated locally; one runtime localization defect fixed

## Findings

- Validation used the controlled local host `http://localhost:5089` in `Development`, started with:
  `dotnet run --project src/Tafseel.Api -c Release --no-build --launch-profile http`.
- The controlled host was stopped after validation. No process listening on port `5089` remained.
- Three accounts were created through the public registration and Development email-confirmation workflows:
  - a new Teacher with no profile or teaching-language rows;
  - a Teacher with a partial profile and saved teaching languages;
  - a Student used to verify role authorization.
- The initial page showed one skeleton and hid the form until the required initial requests completed. The form then appeared atomically. No page-specific uncaught JavaScript error was observed.
- Browser coverage exercised:

  | Viewport | Language/direction | Theme | Result |
  |---|---|---|---|
  | 375px | English/LTR | Light | Passed; single-column layout and no horizontal overflow |
  | 768px | Arabic/RTL | Dark | Passed; localized language labels, two-column form and no overflow |
  | 1024px | English/LTR | Dark | Passed; saved languages remained selected and no overflow |
  | 1440px | Arabic/RTL | Light | Passed; saved languages remained selected and no overflow |

- `GET /api/v1/teachers/me/languages` returned `[]` for the new Teacher, returned both saved languages for the partial Teacher, rejected anonymous access with `401`, and rejected the Student with `403`.
- Saving teaching languages used the existing canonical `PUT /api/v1/teachers/me/languages` endpoint and returned `204`.
- Server validation rejected numeric-only city, numeric-only qualification, experience below `0`, experience above `80`, no selected language, missing subject, and missing qualification topic.
- Valid English and UTF-8 Arabic city/qualification values passed text validation and proceeded to catalog validation. The initial Arabic request failure was traced to the PowerShell request encoding, not the product.
- Resource authorization rejected anonymous access with `401` and Student access with `403`; an authenticated Teacher received `404` for an unknown resource without exposure of a storage key or private path.
- One browser-proven defect was found: after changing the page from English to Arabic, the lifecycle next-action alert remained in English.
- The local Development catalog contained no active subjects, qualification topics, assignments, or reference resources. Therefore subject/topic race behavior, a valid application save, an existing assignment card, and authorized resource preview/download were not dynamically applicable without prohibited mock data or direct database insertion.
- Read-only Staging inspection found one genuine subject (`uh`) and qualification topics (`Hisham`, `Nawawy Enginner`), but no assignment resources. Staging served an older frontend bundle and was not changed.

## Root Cause

The lifecycle message was copied directly from the API response into the DOM during initial rendering. It did not pass through the existing localization helper and was not rendered again when `tafseel:change` fired.

## Fix

- Added a small `renderLifecycle()` path that localizes the API next-action text through `Tafseel.localizeText`.
- Re-rendered that lifecycle message on language change.
- Registered Arabic and English mappings for the four existing lifecycle next-action values.
- Kept the existing two-endpoint language/application workflow unchanged.

## Validation

- A fresh-origin browser session on the same controlled host showed `Start your subject application` in English and `ابدأ طلب التأهيل لمادتك` immediately after switching to Arabic.
- `node --check js/teacher-apply.js`: passed.
- `node --check js/locales.js`: passed.
- Release build after the code change: passed with 0 warnings and 0 errors.
- `git diff --check`: passed; only line-ending conversion notices were emitted.
- Controlled-host shutdown check: passed; zero listeners remained on port `5089`.
- Repository-wide `node scripts/ci/check-js.mjs`: blocked by the unrelated pre-existing visible string `Save notification settings` in `Tafseel-Quality-Dashboard.dc.html`.
- `dotnet ef migrations has-pending-model-changes`: failed because the shared worktree already contains unrelated user-profile/avatar model and migration changes. No migration was generated or applied in this pass.

## Files Changed

- `js/teacher-apply.js`
- `js/locales.js`
- `docs/fixes/TEACHER_QUALIFICATION_BROWSER_VALIDATION_REPORT.md`
- `docs/INDEX.md`

No commit, push, deployment, migration generation, or Staging/Production data change was performed.

## Risks

- Assignment-card content and resource actions remain dynamically unverified because no safe current assignment/resource data exists on the validated host.
- Subject/topic switching and stale-response suppression remain dynamically unverified because the local catalog has zero subjects and the inspected Staging catalog exposes only one subject.
- The public Development workflow created three local test accounts. They remain because no public deletion workflow was available and direct database cleanup was intentionally avoided.
- The repository-wide localization check and EF pending-model gate remain red for unrelated shared-worktree changes described above.

## Next Step

Run only the unexercised assignment/resource and multi-subject scenarios when a safe test catalog containing at least two subjects, valid topic assignments, and an official reference file is available through supported admin workflows. Do not fabricate UI options or rename catalog data.
