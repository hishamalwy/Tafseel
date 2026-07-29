# Limited Guided Request UX Report

Date: 2026-07-29

Status: Implemented locally; browser conditionally verified.

Decision source: [ADR-008](../decisions/ADR-008-STUDENT-REQUEST-ASSISTANT.md)

## Findings

Phase A confirmed:

1. Teacher ID comes from `?teacherId=` (optional `teacherServiceId`).
2. Missing Teacher ID previously showed a thin unavailable message; Dashboard linked to the Request page without a Teacher.
3. Request-based services are `canRequest` (non-scheduling catalog items such as `recorded_explanation`, `assignment_guidance`, `exam_revision`).
4. Scheduling-based services (`RequiresScheduling` / `live_session`) use Book Session.
5. Topic is not a Learning Request field; Limited MVP uses an optional topic label in description composition.
6. Attachments upload after `POST /learning-requests`.
7. Attachment responses previously lacked the updated request version; multi-file uploads reused the create-time `If-Match`.
8. Save & Exit was an unwired dashboard link and persisted nothing.
9. Refresh lost all wizard state; no draft existed.

## Root Cause

The five-step wizard collected the Order lifecycle minimum without guided prompts, completeness feedback, draft persistence or honest multi-file upload chaining. Vague free text increased Teacher clarification load, and silent attachment failures hid partial success.

## Product Behavior

- Teacher-bound Learning Requests only; missing Teacher shows a localized unavailable state with Browse Teachers.
- Eligible `canRequest` services only; scheduling-only preferred services link to Book Session.
- Service-specific prompts for `recorded_explanation`, `assignment_guidance` and `exam_revision`, plus a generic fallback.
- Optional per-request explanation style chips.
- Completeness checklist (required vs recommended) on review.
- Browser `localStorage` draft (7-day TTL), Save & Exit, clear after success.
- Description composition into the canonical `Description` field (zero schema change).
- Sequential attachment uploads with refreshed `If-Match` / returned `version`.
- Honest partial upload result with retry without recreating the request.

## Guided Flow

Preserved five steps:

1. Service (+ subject context, optional topic label)
2. Details (title, goal, prompts, style, constraints)
3. Files
4. Deadline & budget
5. Review (composed preview, checklist, terms) → submit result

## Service-Specific Prompts

Fixed client config keyed by catalog code:

| Code | Required prompts |
|---|---|
| `recorded_explanation` | concept, stuck |
| `assignment_guidance` | assignment, attempted, help_type |
| `exam_revision` | exam_date, topics |
| other requestable | optional generic_detail |

`live_session` is never requestable in the wizard.

## Description Composition

Deterministic labeled sections (localized at submit): Goal, Service details, Topic, Explanation preference, Additional notes. Empty sections omitted. No HTML/JSON. Server still validates ≤ 5000 characters.

## Draft and Save Behavior

Versioned key `tafseel:guided-request:v1:{studentId}:{teacherId}`. Stores IDs, text, style, step, budget/deadline, file **names** only. Never tokens or file bytes. Save & Exit persists then navigates to Student Dashboard. Files must be reselected after refresh.

## Attachment Upload and Concurrency

Create once → upload sequentially → read `version` from each attachment response → never reuse a stale token. Parent `UpdatedAt` is force-marked modified so SQL Server advances `RowVersion`. Partial failures surface counts and retry against the existing request id.

## API Compatibility

- Preferred contract preserved: `CreateLearningRequest` unchanged.
- Additive nullable `AttachmentDto.Version` for request attachment responses.
- Create eligibility aligned with `CanRequest` (`IsPublic`, `TeacherSelectable`, `!RequiresScheduling`).
- No migration. No Draft status. No ExplanationStyle/TopicId columns.
- `Program.cs` allowlists `guided-request.js`.

## Security and Privacy

Draft excludes JWT/refresh/file bytes. Review uses escaped text. Submit disabled while active. Files stay on-platform. Scheduling services cannot create Learning Requests through the API.

## Frontend and Accessibility

- `js/guided-request.js` + enhanced `Tafseel-Request.dc.html`
- Progress `aria-current`, radiogroups, live region, focus to step heading
- EN/AR parity for guided keys; RTL verified for Teacher-required state
- Student Dashboard CTA routes to Browse Teachers

## Validation

| Command | Exit | Passed | Failed | Skipped |
|---|---|---|---|---|
| `dotnet restore Tafseel.sln --locked-mode` | 0 | up to date | 0 | 0 |
| `dotnet build Tafseel.sln -c Release --no-restore` | 0 | build | 0 (2 unrelated nullable warnings) | 0 |
| `dotnet test … --filter FullyQualifiedName~Phase5OrderTests` | 0 | 6 | 0 | 0 |
| `dotnet test tests/Tafseel.Domain.Tests -c Release --no-build` | 0 | 66 | 0 | 0 |
| `dotnet test tests/Tafseel.Application.Tests -c Release --no-build` | 0 | 5 | 0 | 0 |
| `dotnet test tests/Tafseel.ArchitectureTests -c Release --no-build` | 0 | 1 | 0 | 0 |
| `dotnet test … --filter Category!=SqlServer` | 1 | 80 | 1 unrelated RoleBootstrap 3-vs-4 | 0 |
| `node scripts/ci/check-js.mjs` (syntax, auth UI, localization, integrity, guided) | 0 | all gates | 0 | 0 |
| `node scripts/ci/check-guided-request.mjs` | 0 | composition/draft/wiring | 0 | 0 |
| `node scripts/ci/check-localization.mjs` | 0 | 12 pages / 2238 paired keys | 0 | 0 |
| `dotnet format Tafseel.sln --verify-no-changes --no-restore` | 0 | clean | 0 | 0 |
| `dotnet ef migrations has-pending-model-changes … --no-build` | 0 | no pending model changes | 0 | 0 |
| Migration safety | n/a | no migration generated this pass | — | — |
| `dotnet publish …` + `validate-publish.ps1` | 0 | smoke passed (includes guided-request.js) | 0 | 0 |
| `git diff --check` (touched files) | 0 | clean | 0 | 0 |
| Browser: missing Teacher EN/AR Teacher-required state | 0 | verified on `/app/Tafseel-Request.dc.html` | 0 | 0 |
| Browser: full authenticated Teacher→submit→multi-file matrix | — | — | — | conditional |

## Files Changed

- `Tafseel-Request.dc.html`
- `Tafseel-Student-Dashboard.dc.html`
- `js/guided-request.js` (new)
- `js/locales.js`
- `src/Tafseel.Application/Orders/OrderContracts.cs`
- `src/Tafseel.Infrastructure/Orders/OrderService.cs`
- `src/Tafseel.Api/Program.cs`
- `tests/Tafseel.IntegrationTests/Phase5OrderTests.cs`
- `scripts/ci/check-guided-request.mjs` (new)
- `scripts/ci/check-js.mjs`
- `scripts/ci/check-frontend-integrity.mjs`
- `scripts/ci/validate-publish.ps1`
- `docs/features/LIMITED_GUIDED_REQUEST_UX_REPORT.md`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

## Risks

1. Description composition is readable but not queryable until additive columns are approved.
2. Create-then-upload can still leave requests with fewer files than intended if the Student ignores partial failure.
3. Browser drafts do not restore file bytes.
4. Full authenticated browser lifecycle and multi-viewport matrix remain conditional without a guaranteed published Development Teacher.
5. Provider-neutral RoleBootstrap query-count flake remains unrelated and open.

## Unverified Scenarios

- Authenticated Profile → full guided submit with legitimate Teacher/service data
- Multi-file partial upload failure reproduced in browser
- 375 / 768 / 1024 / 1440 viewport matrix
- Keyboard-only full wizard traversal beyond static wiring checks
- SQL Server full suite beyond Phase5 focused filter

## Backward Compatibility

- Existing create payload unchanged
- Attachment DTO gains optional `version` (nullable; list mappings omit it)
- Create now rejects scheduling services consistently with `CanRequest`
- Learning Request / Order / clarification / payment lifecycles unchanged
- No migration

## Final Verdict

**LIMITED GUIDED REQUEST UX IMPLEMENTED BUT CONDITIONALLY VERIFIED**

## Next Step

Persistent Student Learning Preferences Investigation.
