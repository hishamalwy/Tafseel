# Teacher Showcase MVP Migration

Date: 2026-07-29  
Migration: `20260729175230_LimitedTeacherShowcaseMvp`  
Status: Generated and validated; not applied by this pass.

## Findings

`TeacherTeachingSamples` previously stored qualification-generated and Teacher-created media in one shape without an explicit source or moderation/version relationship.

## Root Cause

Publication state and nullable qualification provenance were the only practical distinctions. That cannot safely prove Quality approval of Teacher-created media.

## Fix

The migration:

- adds explicit source, moderation, current/approved version, archive, display order, update timestamp and row-version columns;
- makes legacy root storage and duration nullable for media-less drafts;
- creates `TeacherTeachingSampleVersions` with immutable submission/review metadata;
- adds restricted foreign keys, unique `(TeacherTeachingSampleId, VersionNumber)`, unique non-null current/approved pointers, bounded checks and queue/ownership indexes;
- keeps qualification-generated rows as `QualificationGenerated`;
- maps rows without qualification demo provenance to `TeacherShowcase`;
- creates one deterministic legacy version using the existing sample ID;
- maps legacy unpublished rows to `Draft`;
- maps legacy self-published rows to `Submitted`, clears `PublishedAt`, and therefore fails closed;
- preserves existing storage key, title, topic, duration, owner and timestamps;
- deletes no historical row or media.

## Validation

- EF pending-model check: passed.
- Migration safety scanner: passed, 41 allowed operations, 0 warnings, 0 exceptions.
- Idempotent SQL generation and inspection: passed.
- Fresh-schema behavior: exercised by the SQL Server integration fixture.
- Automatic migration application: not performed.

## Files Changed

- `src/Tafseel.Infrastructure/Persistence/Migrations/20260729175230_LimitedTeacherShowcaseMvp.cs`
- `src/Tafseel.Infrastructure/Persistence/Migrations/20260729175230_LimitedTeacherShowcaseMvp.Designer.cs`
- `src/Tafseel.Infrastructure/Persistence/Migrations/TafseelDbContextModelSnapshot.cs`

## Risks

- Rollback is intentionally fail-closed when any `TeacherShowcase` row exists because the old schema cannot represent immutable versions. Export/retention planning is required before rollback.
- Legacy file size was never stored and remains null until a new upload; such a legacy version cannot be resubmitted without a validated MP4 upload.
- Local Development/Staging storage is not durable Production object storage.

## Next Step

Apply the migration only through the canonical reviewed Staging migration workflow after backing up the target database.
