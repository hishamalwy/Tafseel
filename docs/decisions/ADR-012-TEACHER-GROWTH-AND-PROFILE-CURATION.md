# ADR-012 — Teacher Growth & Profile Curation

Date: 2026-08-02  
Status: Accepted for this product slice

## Context

Evidence shows:

1. Multi-subject qualification already exists at API/DB (`TeacherId+SubjectId`). An approved Teacher can create an application for a **different** subject. Dashboard lacks a productized "My Qualifications" / "Apply for another subject" path; subject pickers do not exclude ineligible subjects.
2. Revoked-subject reapplication is blocked: `CreateAsync` treats any qualification row as blocking, and `DecideAsync` skips insert when any row exists. The unique index is unfiltered on `(TeacherId, SubjectId)`.
3. Public profile videos are auto-visible from approval/`PublishedAt`. Qualification Samples and Showcases share `TeacherTeachingSample`. No soft hide, featured, or cross-source profile order exists. Showcase `DisplayOrder` is inventory-only.

## Decisions

### Additional subject qualification

- Reuse the existing application lifecycle and Apply page (`?mode=additional`).
- Exclude subjects with an active approved qualification or a non-terminal application (Draft…ChangesRequested).
- Rejected/Withdrawn subjects remain re-applicable via a new application row (existing behavior).
- **Revoked subjects:** allow create when the only blocking row is a revoked qualification. On approve, **reactivate** the existing `TeacherSubjectQualification` row (clear revoke fields, refresh approval metadata). Do not insert a second qualification row.

### Video profile curation

- Add presentation fields on `TeacherTeachingSample` only:
  - `IsProfileVisible`
  - `ProfileDisplayOrder`
  - `IsProfileFeatured`
- Teacher selection **AND**s with existing eligibility; never bypasses approval.
- **Legacy compatibility (A):** preserve current eligible public visibility (`IsProfileVisible = 1` where `PublishedAt IS NOT NULL` and not archived).
- **Featured fallback:** hiding the featured item clears featured; public profile falls back to first eligible visible by `ProfileDisplayOrder`.
- **Max visible curated videos:** reuse existing product config `TeacherShowcases:MaxPublicPerTeacher` (default **6**) as the bound on simultaneously profile-visible curated items. Documented as Product Decision — not a silent invention. Qualification Samples count toward this visible bound when shown.
- Keep showcase `DisplayOrder` for existing showcase-reorder API; public projection prefers `ProfileDisplayOrder` (featured first).

## Consequences

- Migration required for curation columns + filtered unique featured index.
- Public `VisibleSamples` / `SampleCount` must require `IsProfileVisible`.
- Qualification Samples remain immutable evidence; curation cannot edit media or trust labels.
