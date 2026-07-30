# Limited Student Learning Preferences MVP Report

Date: 2026-07-30

Status: Implemented locally; browser verification conditional.

Decision source: [ADR-009](../decisions/ADR-009-STUDENT-LEARNING-PREFERENCES.md)

## Findings

Persistent Student learning preferences did not exist. Related surfaces were identity profile fields, notification channel toggles, and Guided Request per-request explanation style composed into `Description`. Teaching languages already exist as an active catalog with Teacher public `NamedItemDto` lists.

## Root Cause

Guided Request improved per-request clarity without a durable Student-controlled default. Inferring defaults from history would violate the non-profiling boundary.

## Product Behavior

- Students may optionally save one explanation style and one preferred teaching language.
- Values are defaults only; Guided Request may override them per request.
- Restored browser drafts always win over profile defaults, including intentional empty values.
- Changing globals never mutates existing Learning Requests.
- Copy states defaults are not diagnoses and do not guarantee Teacher language support.
- No matching, ranking, accessibility, or Teacher preference profile API.

## Domain Model

`StudentLearningPreference` (1:1 on `UserId`):

| Field | Rules |
|---|---|
| `UserId` | PK, FK AspNetUsers Restrict |
| `ExplanationStyle` | null or allowlisted stable code |
| `PreferredTeachingLanguageId` | null or TeachingLanguages FK Restrict |
| `CreatedAt` / `UpdatedAt` | UTC |

No JSON/key-value store. No Learning Request schema fields. No SQL `rowversion` (aligned with notification preferences so provider-neutral tests remain viable).

## API Contract

```text
GET  /api/v1/students/me/learning-preferences
PUT  /api/v1/students/me/learning-preferences
```

- Student role only
- Explicit DTOs; GET does not create a row
- Allowlisted style; active-language validation on write
- Inactive stored language omitted on GET (no fabricated replacement)
- Overposted user ids ignored (`/me` ownership)

## Authorization

| Actor | Access |
|---|---|
| Anonymous | Rejected |
| Student | Own GET/PUT only |
| Teacher / Quality | Forbidden |
| Public DTOs / Teacher request APIs | Preference entity not exposed; Teachers continue reading composed Description |

## Migration

`20260729220036_LimitedStudentLearningPreferences` — additive CreateTable only; not applied. See [migration doc](../database/STUDENT_LEARNING_PREFERENCES_MVP_MIGRATION.md).

## Student Dashboard

Settings section adds a Learning preferences card: style chips (including “No default”), language select from active catalog, save/clear, loading/success/error, EN/AR localized non-diagnostic copy.

## Guided Request Integration

Atomic init: session → teacher profile + preferences in parallel → draft restore → single resolve/render.

Prefill language only when the Teacher publicly lists that language; otherwise leave unselected and show an informational message. Preference load failure is non-blocking. Description composition includes optional style and language labels without schema changes.

## Preference Precedence

```text
restored draft (including intentional empty)
→ explicit current page choice
→ saved global default (language only if Teacher-supported)
→ none
```

## Privacy and Security

Voluntary stylistic defaults only. No medical/disability/psychological/grade/inferred fields. No public badge. No preference-edit notifications. Preference payloads are not written to high-volume logs by this service.

## Validation

| Command | Exit | Passed | Failed | Skipped |
|---|---|---|---|---|
| `dotnet restore Tafseel.sln --locked-mode` | 0 | restore | 0 | 0 |
| `dotnet format Tafseel.sln --verify-no-changes --no-restore` | 0 | format clean | 0 | 0 |
| Release build | 0 | build (2 pre-existing TeacherApplication warnings) | 0 | 0 |
| Domain StudentLearningPreference tests | 0 | 3 | 0 | 0 |
| Integration StudentLearningPreferencesTests (SQLite) | 0 | 4 | 0 | 0 |
| Guided-request CI (`check-guided-request.mjs`) | 0 | precedence + wiring | 0 | 0 |
| Phase5OrderTests | 0 | 6 | 0 | 0 |
| Architecture / Application / Domain suites | 0 | 1 / 5 / 69 | 0 | 0 |
| Provider-neutral integration (`Category!=SqlServer`) | 1 | 84 | 1 (RoleBootstrap 3-vs-4 query-count; pre-existing) | 0 |
| SQL Server suite | — | — | — | LocalDB failed to start |
| Frontend integrity | 0 | 12 entry points | 0 | 0 |
| Localization parity | 0 | 12 entry points, 2,261 paired keys | 0 | 0 |
| EF pending-model changes | 0 | none pending | 0 | 0 |
| Migration safety script | 0 | 2 allowed ops | 0 | 0 |
| Migration safety unit tests | 0 | 9 | 0 | 0 |
| `dotnet publish` + `validate-publish.ps1` | 0 | smoke | 0 | 0 |
| `git diff --check` | 0 | clean | 0 | 0 |
| Controlled browser matrix | — | — | — | Conditional (LocalDB unavailable; no legitimate requestable Teacher exercise in this pass) |

## Files Changed

- Domain/Application/Infrastructure Student preference stack + DbContext/DI
- `StudentLearningPreferencesController`
- Migration `20260729215447_LimitedStudentLearningPreferences` (+ snapshot)
- `Tafseel-Student-Dashboard.dc.html`, `Tafseel-Request.dc.html`, `js/guided-request.js`, `js/locales.js`
- `scripts/ci/check-guided-request.mjs`
- Tests: Domain + Integration
- Docs: this report, migration doc, INDEX, PROJECT_STATUS

## Risks

1. LocalDB was unavailable; SQL Server integration suite not re-run in this pass.
2. Language preference may still be misread as fluency/guarantee without careful UI copy.
3. Preference load or inactive language edge cases rely on honest GET + informational Guided Request messaging.
4. Optimistic concurrency via `RowVersion` / DTO `version`; SQLite tests use an app-managed concurrency token.

## Unverified Scenarios

- Full authenticated browser Settings → Guided Request draft precedence matrix across viewports
- SQL Server migration apply / fresh-schema integration against LocalDB
- Teacher-unsupported language informational UI in a live browser session

## Backward Compatibility

- Existing Students have no preference row until they save
- Historical requests unchanged
- Guided Request lifecycle, drafts, attachment chaining and Teacher-required entry preserved
- Learning Request API/schema unchanged

## Final Verdict

**LIMITED STUDENT LEARNING PREFERENCES IMPLEMENTED BUT CONDITIONALLY VERIFIED**

## Next Step

Teacher Reputation and Badge Rules Decision Pass.
