# Teacher Profile Curation Migration

Date: 2026-08-02  
Migration: `20260802083847_TeacherProfileVideoCuration`  
Status: Generated and validated; **not applied** by this pass.

## Purpose

Add Teacher-controlled profile presentation fields on `TeacherTeachingSamples` without changing approval or moderation ownership.

## Schema

Additive columns on `TeacherTeachingSamples`:

| Column | Type | Default |
|---|---|---|
| `IsProfileVisible` | bit | false (then backfilled) |
| `ProfileDisplayOrder` | int | 0 |
| `IsProfileFeatured` | bit | false (then backfilled) |

Constraints / indexes:

- `CK_TeacherTeachingSamples_ProfileDisplayOrder` — order ≥ 0
- `CK_TeacherTeachingSamples_FeaturedRequiresVisible` — featured ⇒ visible
- Filtered unique `IX_TeacherTeachingSamples_OneFeaturedPerTeacher` where `IsProfileFeatured = 1`
- Composite index on `(TeacherId, IsProfileVisible, ProfileDisplayOrder)`

## Legacy compatibility (Decision A)

Preserve current eligible public visibility:

1. Set `IsProfileVisible = 1` where `PublishedAt IS NOT NULL`, not archived, and (qualification sample **or** approved showcase with approved version).
2. Assign deterministic `ProfileDisplayOrder` by `SourceType`, existing `DisplayOrder`, `CreatedAt`, `Id`.
3. Mark the first visible item per Teacher as featured.

No approval-state rewrite. No media deletion. No previously private content becomes public.

## Rollback

Safe additive rollback: drop indexes/checks/columns. Presentation preferences are lost; public projection returns to approval-inferred visibility only after code rollback as well. Prefer deploying code + migration together and rolling both back as a pair.

## Validation expectations

- EF pending-model clean after generation.
- Migration not applied automatically.
- Fresh schema exercised by SQL Server integration fixture when tests run against migrated DB.

## Next step

Apply only through the canonical reviewed Staging migration workflow after backup.
