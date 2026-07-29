# ADR-009: Persistent Student Learning Preferences

## Status

Proposed.

## Context

The Limited Guided Request UX lets a Student pick an optional per-request explanation style and composes it into `LearningRequest.Description`. That choice is not persisted as a Student default: every new request starts empty unless a browser draft restores a prior wizard session.

Phase 0–1 classified **Student Learning Preferences** as a missing feature that must remain explicit, user-selected and non-inferential. This decision defines a small persistent default so future request creation can prefill safely, without psychological profiling, matching, analytics or Learning Request lifecycle changes.

Repository evidence:

- [ApplicationUser](../../src/Tafseel.Infrastructure/Identity/ApplicationUser.cs)
- [Authentication contracts](../../src/Tafseel.Application/Authentication/Authentication.cs)
- [Authentication service](../../src/Tafseel.Infrastructure/Identity/AuthenticationService.cs)
- [UserNotificationPreference](../../src/Tafseel.Domain/Messaging/Messaging.cs)
- [Notification preferences API](../../src/Tafseel.Api/Controllers/MessagingController.cs)
- [Learning Request contracts](../../src/Tafseel.Application/Orders/OrderContracts.cs)
- [Learning Request entity](../../src/Tafseel.Domain/Orders/Orders.cs)
- [TeachingLanguage catalog](../../src/Tafseel.Domain/Catalog/Catalog.cs)
- [Guided request helpers](../../js/guided-request.js)
- [Request page](../../Tafseel-Request.dc.html)
- [Student Dashboard](../../Tafseel-Student-Dashboard.dc.html)
- [Teacher Dashboard](../../Tafseel-Teacher-Dashboard.dc.html)
- [ADR-008](./ADR-008-STUDENT-REQUEST-ASSISTANT.md)
- [Guided Request UX report](../features/LIMITED_GUIDED_REQUEST_UX_REPORT.md)
- [Phase 0–1 audit](../audits/TAFSEEL_PHASE_0_1_AUDIT_REPORT.md)

## Existing Preference Behavior

| Surface | What exists today | Learning relevance |
|---|---|---|
| `ApplicationUser` | `FullName`, `FullNameEnglish`, avatar metadata, suspension | Identity only; no learning fields |
| `PUT /api/v1/auth/me` profile update | Names only | Do not overload with learning prefs |
| `UserNotificationPreference` | `InAppEnabled`, `EmailEnabled` | Channel prefs only; reuse pattern, not fields |
| Student Dashboard Settings | Names, avatar, notification toggles, password | Natural home for learning defaults UI |
| Guided Request wizard | Per-request `explanationStyle` in browser state | Composed into Description; not a Student profile |
| Browser draft | Temporary wizard state keyed by Student/Teacher | Must win over profile prefill when restored |
| `LearningRequest` / DTO | Title, Description, deadline, budget, attachments | Teacher already reads Description on assigned requests |
| `TeachingLanguage` catalog | Active languages used by Teachers | Valid reference for an optional Student preferred teaching language |
| Teacher ↔ language | `TeacherLanguage` join | Teacher capability; not a Student preference store |
| UI locale (`Tafseel.lang`) | Presentation language | Must not be treated as teaching-language fluency |

Nothing currently stores a persistent Student explanation style, pace, accessibility need or teaching-language preference.

## Product Scope

### Approved MVP vocabulary

1. **One primary preferred explanation style** (optional, nullable):
   - `step_by_step`
   - `short_direct`
   - `detailed`
   - `visual`
   - `exam_focused`
   - `practice_focused`
2. **One preferred teaching language** (optional, nullable): active `TeachingLanguage.Id`.

### Explicitly deferred

- Per-subject preference maps
- Multiple/ranked styles
- Pace, examples-before-theory, theory-before-examples, more exercises, summary-at-end
- Accessibility options (captions, larger text, slower speaking) — separate accessibility feature
- Matching, analytics, Learning Timeline, AI inference
- Disabilities, medical/psychological traits, grades, behavioral inference

## Scope Decision

**Select Option A — Global Student Defaults with per-request override.**

| Option | Verdict |
|---|---|
| A. Global defaults | **Approved.** Defaults prefill new requests; Student may override per request. |
| B. Per-subject preferences | Rejected for MVP. High complexity, weak evidence of immediate value, larger migration/UI surface. |
| C. Per-request only | Rejected as the persistent feature. Already delivered by Guided Request; does not satisfy the preferences slice. |

Rules:

- An explicit per-request choice is never overwritten by a later global edit.
- Clearing the global preference returns to “no default.”
- No preference is fabricated for existing Students.

## Controlled Vocabulary

Explanation style allowlist matches Guided Request (`js/guided-request.js`):

```text
step_by_step | short_direct | detailed | visual | exam_focused | practice_focused
```

Cardinality: **exactly one primary style or null.** No multi-select and no ranking in MVP.

Preferred teaching language: **exactly one active catalog language id or null.** Do not claim fluency. Do not infer from browser locale.

Teacher-facing copy must use:

- “Student preference”
- “Preferred explanation style”
- “Preferred teaching language”

Forbidden copy:

- “Learning diagnosis”
- “Best learning style”
- “Scientifically proven style”
- “Required teaching method”

## Data Model

**Select a typed 1:1 preference entity** following the existing `UserNotificationPreference` pattern.

Not chosen:

| Option | Why rejected |
|---|---|
| Columns on a non-existent Student Profile aggregate | No Student Profile entity exists; inventing one is out of scope |
| Columns on `ApplicationUser` | Couples Identity to learning product fields and overloads auth DTOs |
| Generic key/value preference store | Over-engineered; weak validation; poor queryability |
| JSON settings blob | Weak validation and against current strongly typed EF conventions |

### Proposed entity

`StudentLearningPreference`

| Field | Type | Rules |
|---|---|---|
| `UserId` | string (PK, FK → AspNetUsers, Restrict) | Owning Student |
| `ExplanationStyle` | string? (max 32) | Null or allowlisted code |
| `PreferredLanguageId` | Guid? | Null or active `TeachingLanguages.Id` |
| `UpdatedAt` | DateTimeOffset | Last Student save |

Invariants:

- At most one row per Student (create-on-first-save or upsert).
- Null fields mean “no preference,” not a system default.
- Language FK Restrict; inactive language rejected on write and cleared or rejected on read depending on implementation (fail closed for inactive language on update; treat inactive stored language as null on GET).

No Learning Request columns in this MVP.

## API Architecture

**Select a focused settings endpoint**, mirroring notification preferences rather than extending `CurrentUser`.

```text
GET  /api/v1/students/me/learning-preferences
PUT  /api/v1/students/me/learning-preferences
```

Illustrative DTO (implementation must follow project naming/validation conventions):

```json
{
  "explanationStyle": "step_by_step",
  "preferredLanguageId": "00000000-0000-0000-0000-000000000000"
}
```

Requirements:

- Authenticated Student only.
- Explicit Application DTOs; no EF entity exposure.
- Allowlisted `explanationStyle`; null clears.
- `preferredLanguageId` must reference an active Teaching Language when provided; null clears.
- Idempotent upsert; cancellation tokens; safe problem details.
- No Teacher/public GET of another Student’s preference profile.
- No preference-change notifications.

Rejected: stuffing fields into `PUT /api/v1/auth/me` or public Teacher profile payloads.

## Request Override and Snapshot Behavior

**Select Option C — Description composition remains the request truth.**

| Option | Verdict |
|---|---|
| A. Dynamic current profile preference | Rejected. Historical request meaning would change after edits. |
| B. Snapshot columns on LearningRequest | Deferred. Useful later; not required while Description already carries the explicit choice. |
| C. Prefill + compose into Description | **Approved MVP.** |

Behavior:

1. New Guided Request loads global defaults when no restored draft supplies a style/language.
2. Restored browser draft **wins** over profile defaults (never overwrite restored draft values).
3. Student may clear or change the per-request selection.
4. On submit, the wizard continues to compose the chosen style (and language, when present) into `Description`.
5. Changing global preferences never mutates existing Learning Requests or Orders.
6. No Learning Request schema change in this MVP.

## Teacher Visibility

### What Teachers already see

Assigned Teachers receive `LearningRequestDto.Description` for requests in their queue, including `PendingTeacherReview`. Guided composition already surfaces the per-request explanation preference there. That remains the Teacher-facing request context for MVP.

### Global preference profile

Teachers **must not** read `StudentLearningPreference` through:

- public Teacher/Student browse APIs;
- search/matching endpoints;
- unrelated Student lookups;
- declined/cancelled ownership leaks;
- any public badge.

Teachers **do not** need a separate preference profile API when Description composition is the request snapshot.

Pending-request review: Teachers rely on the request Description (and attachments), not on a live profile preference feed. This avoids exposing current global defaults that the Student may have changed after submitting.

Optional later (out of MVP): structured request snapshot fields visible only to the assigned Teacher for that request id.

Confirmed live-session Teachers likewise use session notes/request context; no separate preference profile exposure in MVP.

## Privacy and Security

Allowed content: voluntary stylistic defaults and optional catalog language id only.

Forbidden content:

- disabilities, medical conditions, psychological traits;
- academic diagnoses, grades, behavioral inference;
- free-text profiling fields;
- hidden ranking signals.

Controls:

- Student ownership on GET/PUT.
- No public exposure.
- Admin access only under existing audited support policies if any support tooling is later extended; not a new Admin product surface in MVP.
- Prefer logging only operational metadata (user id, success/failure codes), not preference payloads, unless existing audit conventions require a safe settings-update event without sensitive free text.
- Reset = set fields to null; do not delete AspNetUsers.
- Account deletion/retention follows existing Identity rules; preference row Restrict/cascade policy must keep referential integrity without orphaning secrets.

## Frontend Surfaces

### Student Dashboard Settings

Add a Learning preferences card:

- current explanation style chips (single-select + clear);
- optional preferred teaching language select from active catalog languages;
- copy stating these are **defaults for future requests**, not diagnoses;
- save / reset / loading / success / error states;
- EN/AR localization and RTL.

### Guided Request Wizard

- Prefill style (and language composition input) from GET preferences when opening a fresh wizard.
- Do not overwrite a restored draft.
- Keep per-request override and Description composition unchanged otherwise.
- Do not reopen Guided Request architecture beyond this prefill integration.

### Teacher surfaces

- Continue showing the composed Description on assigned requests.
- Do not add a public preference badge.
- Do not add a separate Teacher preference panel in MVP.

## Migration Strategy

If implementation proceeds:

1. Additive migration creating `StudentLearningPreferences` (name per EF conventions).
2. Nullable columns only; no backfill from Description text, drafts or locale.
3. Existing Students remain without a row or with null fields until they save.
4. No historical Learning Request mutation.
5. Indexes: PK on `UserId`; optional FK index on `PreferredLanguageId`.
6. Check constraint or application allowlist for `ExplanationStyle` (application allowlist is sufficient if consistent with project style).

This decision pass generates **no** migration.

## Future Matching Boundary

Preferences may become a matching input only after:

- matching weights, ownership, versioning and tie-breaks are approved;
- explainable scoring is implemented;
- Students are informed how preferences affect ranking;
- preference remains one non-exclusionary factor.

Do not implement matching, hidden boosts or deterministic exclusions now.

## Deferred Scope

- Accessibility preferences feature
- Per-subject maps and multi-style ranking
- Pace / pedagogy micro-options beyond the six styles
- LearningRequest structured snapshot columns
- Teacher preference profile API
- Analytics and Learning Timeline
- AI inference from history/files/messages

## Consequences

Positive:

- Students can set reusable defaults without retyping style every request.
- Guided Request remains the request source of truth via Description.
- Privacy boundary stays narrow and explicit.
- Pattern reuses notification-preference architecture conventions.

Negative / accepted costs:

- Requires an additive migration in the implementation pass.
- Teachers do not see live global defaults outside the submitted Description.
- Language preference is aspirational guidance, not verified fluency.

## Rejected Alternatives

- Psychological or diagnostic preference models
- Inferring preferences from history, grades, files or chat
- Per-subject MVP complexity
- JSON blobs or generic key/value preference stores
- Overloading `ApplicationUser` / `CurrentUser` auth contracts
- Dynamic profile reads that rewrite historical request meaning
- Public preference badges
- Preference-edit notifications
- Accessibility options mixed into stylistic defaults

## Implementation Preconditions

1. Do not reopen Guided Request except for default prefill + draft-precedence rules.
2. Implement typed `StudentLearningPreference` + focused Student-only GET/PUT.
3. Validate style allowlist and active Teaching Language FK.
4. Wire Student Dashboard Settings UI with localized copy and clear/reset.
5. Prefill Guided Request only when no restored draft supplies values.
6. Keep Description composition as the request snapshot; no Learning Request migration.
7. Add ownership, validation, inactive-language and unrelated-Teacher denial tests.
8. Generate an additive migration only in the implementation pass after this ADR is followed.
9. No AI, matching, analytics, profiling or accessibility scope expansion.
10. No commit/push/deploy assumptions beyond the implementation pass charter.
