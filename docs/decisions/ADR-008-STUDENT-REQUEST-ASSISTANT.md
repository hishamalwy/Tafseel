# ADR-008: Student Request Assistant and Guided Request UX

## Status

Proposed.

## Context

Students already create Learning Requests through a dedicated page and the existing Order/request lifecycle. The page is a five-step wizard, but the guidance is thin: free-text title and description, optional local files, deadline and budget, then review. Incomplete or vague requests still reach Teachers and often need clarification.

The Phase 0–1 audit classified **Student Request Assistant** as partially implemented: improve the canonical form; do not create a second request workflow or invent an AI chatbot. This decision designs a guided creation experience that helps Students submit complete, actionable requests while preserving the existing Learning Request domain, API and Teacher review path.

Repository evidence:

- [Learning Request entity](../../src/Tafseel.Domain/Orders/Orders.cs)
- [Order contracts](../../src/Tafseel.Application/Orders/OrderContracts.cs)
- [Order service](../../src/Tafseel.Infrastructure/Orders/OrderService.cs)
- [Learning Requests controller](../../src/Tafseel.Api/Controllers/OrdersController.cs)
- [Request page](../../Tafseel-Request.dc.html)
- [Student Dashboard](../../Tafseel-Student-Dashboard.dc.html)
- [Teacher Profile](../../Tafseel-Teacher-Profile.dc.html)
- [Teacher Dashboard](../../Tafseel-Teacher-Dashboard.dc.html)
- [Marketplace service mapping](../../src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs)
- [Private file storage](../../src/Tafseel.Infrastructure/Files/LocalFileStorageService.cs)
- [Localization keys](../../js/locales.js)
- [Phase 5 report](../features/phase-5-report.md)
- [Phase 5 order tests](../../tests/Tafseel.IntegrationTests/Phase5OrderTests.cs)
- [Phase 0–1 audit](../audits/TAFSEEL_PHASE_0_1_AUDIT_REPORT.md)

## Existing Request Flow

### Surfaces that must be reused

| Surface | Current behavior | Reuse rule |
|---|---|---|
| `Tafseel-Request.dc.html` | Five-step wizard: service → details → files → deadline/budget → review; submits `POST /learning-requests` then optional attachments | Canonical guided surface; enhance in place |
| Student Dashboard | Lists `/learning-requests/mine`; “New request” links to Request page without `teacherId` | Keep list/clarification/cancel; fix entry to require Teacher selection |
| Teacher Profile | `requestHref` with `teacherId` and `teacherServiceId` for `canRequest` services | Primary entry with Teacher and preferred service preselected |
| Book Session page | Separate live-session booking for `RequiresScheduling` / `live_session` | Remain separate; never fold live booking into Learning Request |
| Teacher Dashboard | Assigned requests, accept/decline/clarification | Unchanged consumer of clearer requests |
| Notifications | `NewRequest`, clarification, accept/decline paths | Unchanged |
| Localization | Full `req_*` EN/AR key set for the wizard | Extend keys; do not replace with untranslated literals |

### Canonical create contract today

`CreateLearningRequest`:

- `TeacherServiceId` (required)
- `Title` (required, ≤ 200)
- `Description` (required, ≤ 5000)
- `PreferredDeliveryAt` (required, must be future)
- `Budget` (optional, 0.01–1_000_000)

Server create eligibility already requires an active Teacher service, active subject, active catalog item, active subject qualification and published Teacher profile. The public DTO flag `CanRequest` further excludes scheduling services (`RequiresScheduling`), so live sessions are booked, not requested.

### Lifecycle that must not change

Statuses remain: `PendingTeacherReview` → `ClarificationRequested` / `Accepted` / `Declined` / `Cancelled`.

There is **no** Draft status. Attachments are added only after create, while the request is `PendingTeacherReview` or `ClarificationRequested`. Storage keys never enter DTOs. Mutations use `If-Match` row versions.

### Known product gaps in the current wizard

- No subject/topic picker beyond what the selected Teacher service already implies.
- No explanation-style or service-specific prompts.
- No completeness checklist before submit.
- Files stay in browser memory until after create; multi-file upload reuses the create-time row version and silently ignores later failures.
- UI copy says 25 MB; storage allows 50 MB; no client file-count or type gate matching the server allowlist.
- `req_save_exit` exists in locales but is not wired; no draft persistence.
- Opening the Request page without `teacherId` fails closed with “teacher required” instead of guiding Browse Teachers.
- Expected output, difficulty and preferences are not first-class fields.

## UX Decision

**Select Option A — Multi-Step Wizard (enhance the existing wizard).**

| Option | Verdict |
|---|---|
| A. Multi-step wizard | **Approved MVP.** Already shipped on `Tafseel-Request.dc.html` with progress steps, back/next, review and localization. Best clarity, mobile pacing and per-step validation. |
| B. Single form with progressive sections | Rejected for MVP. Would flatten a working wizard and risk progressive-render accessibility regressions without reducing API complexity. |
| C. Conversational assistant | Rejected. Even if mapped to the same DTO, it reads as a second workflow, invites “AI” expectations and is harder to make accessible than an explicit wizard. |

### Wizard shape for the Limited Guided MVP

Keep five steps, rename/clarify labels where needed:

1. **Service** — Teacher context + eligible `canRequest` services only.
2. **Details** — Title, learning goal/problem, service-specific prompts, optional topic, optional explanation style.
3. **Files** — Optional attachments with client validation aligned to the server allowlist.
4. **Deadline & budget** — Preferred delivery and flexible/explicit budget.
5. **Review** — Read-only summary, missing-field checklist, terms, explicit Submit (never auto-submit).

Rules:

- The normal form path remains usable if guided prompts fail to load: fall back to title + description + existing fields.
- Back/next preserve in-memory state.
- Progress is semantic (`aria-current`, step labels), not color-only.
- Do not call the feature AI.

## Canonical Data

| Input | Classification | Decision |
|---|---|---|
| Teacher | Existing relationship via `TeacherService.TeacherId` | Required; resolved from selected service |
| Subject | Existing catalog relationship via `TeacherService.SubjectId` | Display and constrain; not a free-text Student field |
| Topic | Safe new optional field **or** guided text in description for Limited MVP | Limited MVP: optional topic **prompt** composed into Description; full MVP may add nullable `TopicId` with subject ownership validation |
| Service type | Existing via `TeacherServiceId` / catalog code | Required; drives service-specific questions |
| Title | Existing field | Required |
| Exact problem / learning goal | Existing field (`Description`) | Required; guided prompts compose labeled sections into Description |
| Files | Existing attachments | Optional; post-create upload retained |
| Deadline | Existing `PreferredDeliveryAt` | Required |
| Budget | Existing optional `Budget` | Optional; flexible remains null |
| Explanation style | Safe new optional field | Per-request controlled vocabulary; Limited MVP may embed a labeled line in Description; additive nullable column approved for a follow-on schema pass |
| Expected output | Unnecessary as separate field | Derived from selected service catalog semantics |
| Estimated duration | Not suitable for MVP | Service already has `DeliveryHours`; do not collect Student duration estimates |
| Difficulty / complexity | Not suitable for MVP | Blocked by BR-04; omit; never auto-price |
| Urgency | Not suitable for MVP | Deadline expresses urgency |
| Exam date | Not suitable as schema for MVP | Exam-prep prompt asks for exam timing inside Description when relevant |
| Page count | Not suitable for MVP | Deferred with complexity estimation |
| Preferred language | Not suitable for MVP | UI locale already exists; no per-request language column without a clear Teacher multi-language consumer |
| Preferred response format | Unnecessary | Overlaps explanation style + service type |
| Teacher notes | Existing clarification messages | Teacher-owned after submit |
| Student notes / constraints | Existing Description | Guided “constraints” prompt folds into Description |
| Global Student learning preferences | Out of scope | Separate pending slice; do not invent profiling |

### Explanation style vocabulary (per-request only)

Controlled codes for UI and future persistence:

- `step_by_step`
- `short_direct`
- `detailed`
- `visual`
- `exam_focused`
- `practice_focused`

Default: no selection required. Persistence: **per-request explicit preference only**. No global preference and no psychological profiling in this feature.

### Expected output

**Derived from the selected service.** Do not add a parallel “expected output” enum that duplicates `ServiceCatalogCode` / service title. Service-specific prompts ask only for facts the service type still needs (for example homework files, exam scope, study-plan horizon).

### Difficulty

**Omitted from MVP.** Student self-selected difficulty must not set price. Automated scoring and inference from files are forbidden.

## Service-Specific Questions

Questions key off `ServiceCatalogCode` when recognized; otherwise use a generic request template. Live-session services (`RequiresScheduling` / `canBook`) stay on the Book Session flow and never appear as requestable services.

| Service family | Shared fields | Extra guided prompts | Not shown |
|---|---|---|---|
| Recorded / async explanation | Title, goal, style, deadline, budget, files | What must be covered; chapter/problem references | Live slot picker |
| Homework review | Same | Assignment instructions; what feedback is needed; due date vs preferred delivery | Live slot picker |
| Exam preparation | Same | Exam date/timing (in Description); syllabus scope; question types | Live slot picker |
| Study plan | Same | Time horizon; weekly availability constraints; target outcome | Session booking UI |
| Quick question (if catalogued and `canRequest`) | Title, goal, style, deadline, budget | Concise question; optional one attachment | Long homework checklists |
| Live session | N/A | N/A — use Book Session | Entire Learning Request wizard |

Irrelevant fields must hide when the selected service changes. Changing service clears only service-specific answers, not shared title/deadline/budget unless those become invalid.

## Validation

Backend remains authoritative.

| Rule | Server | Guided UI |
|---|---|---|
| Authenticated Student with create permission | Existing | `requireRoles(['Student'])` |
| `TeacherServiceId` exists and is active | Existing | Filter `canRequest` |
| Subject active + Teacher qualification + published profile | Existing | Reload profile; fail closed |
| Align create with non-scheduling services | **Hardening recommended** | Already filters `canRequest` |
| Title / Description length | Existing 200 / 5000 | Per-step checks + review checklist |
| Deadline in the future | Existing | Date picker minimum = tomorrow (or local next day) |
| Budget null or within range | Existing | Flexible checkbox or range |
| Topic ownership (if `TopicId` added later) | Must belong to service subject and be active | Topic select limited to that subject |
| Explanation style (if column added) | Allowlist of codes or null | Controlled chips/radio |
| Files type/size/signature | Existing allowlist, 50 MB, magic bytes | Match allowlist; show errors before submit |
| Attachment concurrency | Existing `If-Match` | Must refresh version after each successful upload |
| Required-by-service text | Description still required | Service prompts mark which answers are required before Continue |

Frontend guidance never replaces server checks. Do not convert validation failures into empty catalogs or silent success.

## Files and Drafts

### Files

Reuse `request-attachments` storage:

- Types: `.pdf`, `.png`, `.jpg`/`.jpeg`, `.docx`, `.pptx`, `.zip` with matching MIME and signatures.
- Size: max **50 MB** per file (align UI copy with `FileStorageOptions.MaxAttachmentBytes` and `RequestSizeLimit`).
- Count: no server cap today; Limited MVP client cap **5 files** unless product later raises it with a server check.
- Sequence: select locally → create request → upload each file with updated `If-Match` → surface per-file success/failure without claiming full success if any upload fails.
- Access: private content endpoint for Student and assigned Teacher only; no storage-key exposure.
- Removal: supported in the browser before submit; no delete-attachment API in MVP (post-submit removal stays out of scope).
- Descriptions: not required for MVP.
- Never send files to external services or AI providers.

Orphan policy: create-then-upload can leave a valid request with fewer attachments than intended. MVP must warn the Student when uploads fail and link to the dashboard request; do not invent pre-submit server drafts solely to hold files.

### Drafts

**Browser-only temporary state for Limited MVP.**

| Approach | Decision |
|---|---|
| `sessionStorage` / in-memory wizard state | Approved; keyed by Teacher + service; exclude File blobs from durable storage or re-prompt for files after restore |
| Server draft entity / Draft status | Rejected for MVP — status enum has no Draft; adding one redesigns the lifecycle |
| Both | Deferred |

“Save & exit” may persist non-file answers locally and return to the Student Dashboard. Accidental loss remains possible for files; copy must say files are not restored from draft.

## Teacher Context

When the flow starts from a Teacher Profile:

- Teacher is fixed from `teacherId` query.
- Services are limited to that Teacher’s `canRequest` services.
- Preferred service comes from `teacherServiceId` when still eligible.
- Subject is implied by each service; display Teacher subjects for context.
- Language may be suggested from UI locale only; not a hard constraint.
- If the Teacher becomes unpublished, loses qualification, or loses eligible services on reload: fail closed with Browse Teachers / profile retry — never bypass publication or qualification checks.

## General Request Context

**Out of MVP.** Current architecture requires `TeacherServiceId`; there is no Teacher-less marketplace request pool and no matching engine. Student Dashboard “New request” without a Teacher must route to Browse Teachers (or favorites), not open an empty general request form.

## Error Recovery

| Failure | Behavior |
|---|---|
| Catalog/profile load failure | Show error; keep query params; Retry; do not show empty services as “no services” unless the API succeeded with zero `canRequest` items |
| Teacher unavailable / unpublished | Fail closed; link to Browse Teachers |
| Service removed or no longer `canRequest` | Clear invalid selection; force re-pick; preserve title/description/deadline when safe |
| Topic invalidated (future field) | Clear topic; keep other answers |
| Upload failure | Keep request id; list failed files; allow dashboard follow-up; do not pretend attachments succeeded |
| Auth expiry | Preserve local draft answers; prompt re-login; resume wizard |
| Duplicate submit | Disable submit while in flight; rely on existing create (non-idempotent) — avoid double-click; do not invent client-side duplicate keys that bypass Teacher review |
| Network / backend validation | Flash server message; stay on review/step; preserve state |

## Accessibility and Localization

- Maintain paired EN/AR `req_*` keys; no placeholder-only labels.
- Respect `dir` RTL/LTR from existing Tafseel locale handling.
- Progress: named steps + `aria-current="step"`; announce step changes to a live region.
- Keyboard: focus primary heading or first invalid field on step change; trap focus only in true modals (none required for MVP).
- Validation summary on Continue/Submit failure.
- File input: visible label, keyboard-operable control, selected file names announced.
- Mobile: one column; sticky back/continue; avoid horizontal step overflow by abbreviating labels.
- Honor `prefers-reduced-motion` for progress transitions.

## API Impact

**Limited Guided MVP preference: no API change required** if guided answers are composed into existing `Title` / `Description` with stable labeled sections the Teacher can read.

Approved smallest additive follow-on (optional second pass, migration then):

- Nullable `ExplanationStyle` (string code, allowlisted).
- Nullable `TopicId` (FK to Topic; must belong to the service subject).

Rejected for this feature:

- Separate draft endpoint or Draft status.
- Separate guided-metadata aggregate that bypasses `CreateLearningRequest`.
- Exposing EF entities.
- Weakening create eligibility or attachment privacy.

Teacher and Student DTOs may later surface the additive fields; existing clients ignore unknown JSON only if additive and nullable.

## Security and Privacy

- Keep private attachment storage and participant-only download.
- Do not send Student files or request text to external AI/providers.
- Do not log free-text Description into analytics events.
- Do not weaken authorization, row-version checks or storage-key secrecy.
- Align create validation with `canRequest` semantics so scheduling services cannot be requested through a raw API call.

## Deferred AI Scope

Explicitly deferred until a separate approved decision:

- Any LLM or external AI provider.
- Auto-fill from uploaded documents.
- Complexity/price inference from files or text.
- Chat UI that replaces the form.
- Calling the feature “AI” in product copy.

A future AI pass must still submit through `CreateLearningRequest` and keep files on-platform unless privacy and provider terms are separately approved.

## Consequences

Positive:

- Clearer Student requests using the surface that already exists.
- Fewer unnecessary clarifications without a parallel domain.
- Safe fallback to the plain form fields.
- Compatible with current Teacher acceptance and Order creation.

Negative / accepted costs:

- Description composition is less queryable than typed columns until an additive schema pass.
- Browser drafts do not restore files.
- Create-then-upload remains eventually consistent for attachments.
- Teacher-less general requests remain unavailable.

## Rejected Alternatives

- Conversational chatbot assistant as MVP.
- Second request domain or Draft status lifecycle.
- General Teacher-less request marketplace without matching rules.
- Student difficulty that auto-sets price.
- Expected-output enum duplicating service type.
- Pre-submit server file staging entity without Draft design.
- External document analysis.
- Global psychological/learning profiling under this feature name.

## Implementation Preconditions

1. Treat `Tafseel-Request.dc.html` as the only creation UX to enhance.
2. Keep Learning Request statuses and Order acceptance unchanged.
3. Require `teacherId` entry from Profile/Browse; fix Dashboard CTA accordingly.
4. Align client file rules with server allowlist and 50 MB limit; fix multi-attachment `If-Match` refresh.
5. Ship completeness checklist + service-specific prompts + review summary before any schema change.
6. Extend `req_*` localization pairs; pass frontend integrity and localization gates.
7. Do not generate or apply a migration in the Limited Guided MVP unless the additive `ExplanationStyle` / `TopicId` pass is explicitly scoped.
8. Do not implement analytics events in the first implementation pass; only leave extension points that avoid free-text payloads.
9. Add focused tests for create validation alignment, guided composition (or additive fields), upload version refresh and Teacher-required entry.
10. No AI provider, no external file egress, no commit/push/deploy assumptions beyond the implementation pass charter.
