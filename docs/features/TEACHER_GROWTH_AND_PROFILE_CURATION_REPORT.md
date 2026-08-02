# Teacher Growth & Profile Curation

Date: 2026-08-02  
Status: Implemented locally; conditionally verified  
Prompt: [TEACHER_GROWTH_AND_PROFILE_CURATION.md](../prompts/TEACHER_GROWTH_AND_PROFILE_CURATION.md)  
Decision: [ADR-012](../decisions/ADR-012-TEACHER-GROWTH-AND-PROFILE-CURATION.md)

## Completion status

| Slice | Status |
|---|---|
| Additional Subject Qualification | Implemented |
| Approved Video Profile Curation | Implemented |

## Findings

1. Multi-subject qualification already existed at API/DB (`TeacherId + SubjectId`). Approved Teachers could create applications for a different subject; Dashboard lacked a productized qualifications matrix and Apply subject filtering.
2. Revoked-subject reapplication was blocked: create treated any qualification row as blocking, and approve skipped insert when any row existed.
3. Public profile videos were auto-visible from approval/`PublishedAt`. Qualification Samples and Showcases share `TeacherTeachingSample`. No soft hide, featured, or cross-source profile order existed.

## Root cause

Product gaps were primarily presentation and Teacher preference layers on top of ready domain models, plus one lifecycle hole for revoked reapplication.

## Architecture

- Reused existing Teacher Application / Quality Review / Showcase moderation domains.
- Added presentation fields on `TeacherTeachingSample`: `IsProfileVisible`, `ProfileDisplayOrder`, `IsProfileFeatured`.
- Public visibility = Teacher selection **AND** approval eligibility **AND** playable media (fail-closed).

## Domain and API

### Additional subject

- `GET /api/v1/teachers/me/qualifications` — subject cards with lifecycle state and CTAs.
- `CreateAsync` blocks only active (non-revoked) qualifications for the same subject.
- Approve reactivates an existing revoked `TeacherSubjectQualification` row when present.

### Profile curation

- `GET /api/v1/teachers/me/profile-videos`
- `PUT .../profile-videos/{id}/visibility`
- `PUT .../profile-videos/{id}/featured`
- `PUT .../profile-videos/order`
- Public `VisibleSamples` requires `IsProfileVisible`.
- Public list / SampleCount bound by `TeacherShowcases:MaxPublicPerTeacher` (default 6) — Product Decision in ADR-012.

## Teacher Dashboard UX

- New nav section **My Qualifications / مؤهلاتي** with per-subject cards and **Apply for another subject**.
- Apply page supports `?mode=additional` and disables already-qualified / in-flight subjects.
- **Profile Videos / فيديوهات البروفايل** on the Samples section with show/hide/feature/reorder (button controls, not drag-only).

## Public Profile Behavior

- Shows only Teacher-selected eligible videos.
- Featured first, then `ProfileDisplayOrder`.
- SampleCount uses the same VisibleSamples + playable + max bound rule.
- Hidden is not rejection; moderation details stay out of public DTOs.

## Migration

`20260802083847_TeacherProfileVideoCuration` — generated, **not applied**.

Compatibility **A**: preserve currently public eligible visibility; derive order; feature first visible item.

See [migration report](../database/TEACHER_PROFILE_CURATION_MIGRATION.md).

## Tests

- Domain: reactivation, soft-hide without unpublish, rejected showcase blocked, featured cleared on hide.
- Integration: additional-subject create/isolation/duplicate/rejection isolation/student deny; hide-show public projection; rejected showcase blocked; cross-teacher deny; one featured.

## Remaining limitations

- Full prompt test matrix (concurrency, inactive subject, no-task unavailable, N+1, full browser viewport matrix) not exhaustively automated in this pass.
- Browser validation against a live Development stack was not completed in this agent session.
- Migration not applied.

## Risks

- Teachers with many legacy published qualification samples may exceed the public max-6 bound until they curate; extras remain stored and restorable.
- Featured unique filtered index requires careful concurrent feature updates (serialized via applock).

## Next step

Apply the migration through the reviewed Staging workflow, then run the browser matrix on Teacher Dashboard qualifications + profile videos + public profile carousel.
