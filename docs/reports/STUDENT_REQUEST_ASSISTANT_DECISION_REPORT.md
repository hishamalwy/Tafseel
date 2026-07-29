# Student Request Assistant Decision Report

Date: 2026-07-29

Status: Decision complete; implementation not started.

## Findings

The Learning Request vertical slice already exists end-to-end. The gap is guided completeness, not a missing request domain.

| Field | Current Source | Needed By | Classification | Decision |
|---|---|---|---|---|
| Teacher | `TeacherService.TeacherId` after create eligibility | Matching is Teacher-direct today; Teacher review | Existing relationship | Required; preselect from Profile |
| Subject | `TeacherService.SubjectId` + active Subject | Teacher context; qualification gate | Existing catalog relationship | Display/constrain; no free text |
| Topic | Not on `LearningRequest`; Topics exist under Subjects | Teacher clarity | Safe new optional / guided text | Limited MVP: prompt → Description; optional `TopicId` later |
| Service type | `TeacherServiceId` + catalog code/`CanRequest` | Eligibility; service-specific UX | Existing relationship | Required; hide live-session services |
| Title | `LearningRequest.Title` | Teacher list/scan | Existing field | Required ≤ 200 |
| Problem / learning goal | `LearningRequest.Description` | Teacher delivery | Existing field | Required ≤ 5000; guided sections compose into it |
| Files | `LearningRequestAttachment` after create | Homework/exam evidence | Existing attachments | Optional; fix upload versioning UX |
| Deadline | `PreferredDeliveryAt` | Teacher scheduling of work | Existing field | Required; future only |
| Budget | Optional `Budget` | Teacher pricing on accept | Existing field | Optional; flexible = null |
| Explanation style | Absent | Teacher delivery approach | Safe new optional | Per-request vocabulary; embed in Description for Limited MVP |
| Expected output | Implied by service title/code | Student expectation | Unnecessary | Derive from service; do not duplicate |
| Estimated duration | `TeacherService.DeliveryHours` only | — | Not suitable | Omit Student estimate |
| Difficulty | Topic catalog difficulty unrelated to requests | Pricing/complexity (BR-04) | Not suitable | Omit; never auto-price |
| Urgency | — | — | Not suitable | Use deadline |
| Exam date | — | Exam-prep Teachers | Not suitable as column | Prompt inside Description |
| Page count | — | Complexity estimation | Not suitable | Deferred |
| Preferred language | UI locale only | — | Not suitable | Omit per-request column |
| Response format | — | — | Unnecessary | Covered by style + service |
| Teacher notes | Clarification messages | Clarification loop | Existing | Unchanged |
| Constraints | Free text only | Teacher scope | Existing Description | Guided constraints prompt |
| Draft state | None in status enum | Accidental-loss UX | Browser-only | No server Draft entity |
| General pool request | Not supported | Matching (unapproved) | Out of MVP | Require Teacher; route to Browse |

Additional evidence:

- `Tafseel-Request.dc.html` already implements service → details → files → deadline/budget → review with EN/AR `req_*` keys.
- Create API: `POST /api/v1/learning-requests` with `CreateLearningRequest`; attachments via `POST .../attachments` and private content GET.
- Statuses: PendingTeacherReview, ClarificationRequested, Accepted, Declined, Cancelled — no Draft.
- `CanRequest` excludes `RequiresScheduling`; live sessions use Book Session.
- Student Dashboard “New request” opens the Request page without `teacherId`, which the page treats as an error.
- Attachment uploads after create use the create-time `If-Match`; later files can fail concurrency while the UI swallows errors.
- UI copy says 25 MB; server allows 50 MB for request attachments (`pdf/png/jpeg/docx/pptx/zip`).
- Phase 5 tests cover create, attachments, clarification, accept/decline/cancel and privacy.
- Phase 0–1 item 19: improve the canonical form; do not create a second workflow or fake AI.

## Root Cause

The request form collects the minimum fields the Order lifecycle needs, but does not systematically help the Student express subject-relevant detail, explanation preference or service-specific facts. Vague free text then shifts the cost onto Teacher clarification. Separately, entry points and file-upload UX leave completeness gaps (Teacher-less CTA, silent attachment failures, draft/save not wired) without any second domain to blame.

## Decisions

1. **UX:** Option A — enhance the existing multi-step wizard. Reject progressive single-page redesign and conversational assistant for MVP.
2. **Domain:** Reuse `LearningRequest` only. No second request aggregate. No Draft status. No lifecycle redesign.
3. **Data:** Keep Title, Description, PreferredDeliveryAt, Budget, TeacherServiceId and attachments as the submission contract. Compose guided answers into Description for Limited MVP. Approve optional later `ExplanationStyle` + `TopicId` as the smallest additive schema.
4. **Explanation style:** Controlled per-request vocabulary only; optional; no global preference; no profiling.
5. **Expected output:** Derived from selected service; no duplicate enum.
6. **Difficulty:** Omitted; no auto-pricing; no file-based inference.
7. **Files:** Post-create private uploads retained; client align to 50 MB allowlist; max 5 files client-side; refresh concurrency token; no external egress; no file-description field.
8. **Drafts:** Browser-only temporary state; files not reliably restored.
9. **Teacher context:** Preselect Teacher and eligible services; fail closed on publication/qualification loss.
10. **General requests:** Out of MVP; architecture requires a Teacher service.
11. **Review:** Keep explicit review + Submit; show missing-info checklist; allow back/edit.
12. **API:** Limited MVP may ship with zero API change; additive nullable fields optional follow-on.
13. **Analytics:** Not implemented now; future events may measure step abandonment, validation errors and completion rate without free-text payloads.
14. **AI:** Fully deferred; do not brand the feature as AI.

Full decision record: [ADR-008](../decisions/ADR-008-STUDENT-REQUEST-ASSISTANT.md).

## Guided Flow

```text
Entry (Teacher Profile / Browse → Request?teacherId=&teacherServiceId=)
  → Step 1 Service (canRequest only)
  → Step 2 Details (goal + service-specific prompts + optional style/topic)
  → Step 3 Files (optional, validated locally)
  → Step 4 Deadline & budget
  → Step 5 Review checklist (edit via Back)
  → Submit CreateLearningRequest
  → Upload attachments with refreshed If-Match
  → Success → Student Dashboard
```

Fallback: if guided prompt config fails, Steps 2+ still collect title and description like today.

## Data Contract

Limited MVP submit body remains:

```json
{
  "teacherServiceId": "...",
  "title": "...",
  "description": "...",
  "preferredDeliveryAt": "...",
  "budget": null
}
```

Description composition convention (Teacher-readable labels, localized at compose time):

- Goal / problem
- Service-specific answers
- Constraints
- Explanation style (if chosen)
- Topic name (if chosen without `TopicId`)

Optional follow-on DTO fields: `explanationStyle`, `topicId`.

## Validation Rules

- Student auth + create permission.
- Service active, catalog active, subject active, qualification present, profile published.
- Recommended hardening: reject `RequiresScheduling` services on create (match `CanRequest`).
- Title/Description required within length bounds.
- Deadline > now.
- Budget null or (0.01–1_000_000].
- Future `TopicId`: active topic under service subject.
- Future `ExplanationStyle`: allowlisted code or null.
- Files: existing type/size/signature; client pre-checks; per-upload version refresh.

## Service-Specific Behavior

| Family | Extra prompts | Notes |
|---|---|---|
| Recorded/async explanation | Coverage scope, references | Default template if code unknown |
| Homework review | Instructions, feedback need, assignment due vs delivery | Encourage files |
| Exam preparation | Exam timing, syllabus scope, question types | Timing in Description |
| Study plan | Horizon, weekly constraints, target outcome | No live booking UI |
| Quick question | Concise question | Light file prompt |
| Live session | — | Book Session only |

## Draft Strategy

- Persist non-file wizard answers in `sessionStorage` keyed by Teacher/service.
- Wire Save & exit to dashboard with restore on return.
- Do not add server Draft status or staging entity in Limited MVP.

## File Strategy

- Select in browser → create request → upload sequentially with updated `If-Match`.
- Show partial-failure honesty.
- Remove supported before submit only.
- Align copy to 50 MB and server extensions.
- Client cap 5 files for MVP.
- No external scanning providers required beyond existing local signature checks for this UX pass.

## Frontend Plan

1. Enhance `Tafseel-Request.dc.html` steps, checklist, service-specific prompts and style chips.
2. Fix Student Dashboard New request → Browse Teachers (or Teacher-required chooser).
3. Keep Profile `requestHref` as primary deep link.
4. Fix multi-file upload version handling and error surfacing.
5. Align file validation copy and client gates.
6. Add session draft + Save & exit.
7. Extend `js/locales.js` EN/AR keys; pass integrity/localization checks.
8. Preserve fallback plain title/description path.

## API Plan

- Limited MVP: **no API change**.
- Optional hardening: create rejects scheduling services.
- Optional additive pass: nullable `ExplanationStyle`, `TopicId` on entity/DTO/migration — only when explicitly scoped.
- No draft endpoints. No guided-metadata microservice.

## Security and Privacy

- Private attachments; participant-only download; no storage keys in DTOs.
- No Student file/text egress to AI or third parties.
- No free-text analytics payloads.
- Do not bypass Teacher publication or qualification gates.

## Risks

1. Description composition is readable but not structured for reporting until additive columns exist.
2. Create-then-upload can still yield requests with missing files if the Student ignores upload errors.
3. Browser drafts lose files and can stale after service changes.
4. Teacher-less demand remains unmet until matching is designed.
5. Raw API could still target scheduling services until create eligibility is hardened.
6. Concurrent Catalog/Showcase worktree changes are unrelated but increase merge risk around docs and shared frontend files.

## Deferred Scope

- AI/LLM assistant and any “AI” product naming.
- Server Draft lifecycle.
- General marketplace request pool and matching.
- Difficulty/complexity estimation and auto-pricing.
- Global Student learning preferences entity.
- Attachment delete API and file description fields.
- Analytics implementation.
- Additive `ExplanationStyle` / `TopicId` migration unless separately scheduled.

## Final Verdict

**READY FOR LIMITED GUIDED MVP**

The architecture already supports Teacher-targeted Learning Requests. The approved path is to deepen the existing wizard without a second domain, without AI and without Draft status. Schema additions are optional and not required to start.

## Next Step

One focused implementation pass:

**Limited Guided Request UX on `Tafseel-Request.dc.html`** — service-specific prompts, explanation-style chips, completeness checklist, draft/save, Teacher-required entry fix, file validation/upload-version fixes and EN/AR localization — with zero migration unless the pass is explicitly expanded to additive fields.
