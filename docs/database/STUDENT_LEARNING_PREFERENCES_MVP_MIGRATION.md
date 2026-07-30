# Limited Student Learning Preferences MVP

Date: 2026-07-30  
Migration: `20260729215447_LimitedStudentLearningPreferences`  
Status: Generated and validated; not applied by this pass.

## Findings

No Student learning-preference table existed. Notification preferences are a separate 1:1 channel settings row and were not overloaded.

## Root Cause

Guided Request stored explanation style only in browser draft / composed Description. Students had no durable global default.

## Fix

The migration:

- creates `StudentLearningPreferences` with `UserId` PK (FK → AspNetUsers, Restrict);
- adds nullable `ExplanationStyle` (max 32) with allowlist check constraint;
- adds nullable `PreferredTeachingLanguageId` (FK → TeachingLanguages, Restrict) plus index;
- adds `CreatedAt` / `UpdatedAt` UTC timestamps;
- adds SQL Server `RowVersion` (`rowversion`) for optimistic concurrency exposed as DTO `version`;
- does not backfill, fabricate defaults, or alter Learning Requests;
- rolls back by dropping only this table.

SQLite integration tests map `RowVersion` as an app-managed concurrency token (not `IsRowVersion()`), because store-generated rowversion inserts fail on EnsureCreated and surface as HTTP 409 `database_conflict`.

## Validation

- EF pending-model check: passed (no further pending changes) at generation time.
- Migration safety scanner: passed at generation time.
- Automatic migration application: not performed.
- Integration: `StudentLearningPreferencesTests` (4) passed after SQLite concurrency mapping fix.

## Files Changed

- `src/Tafseel.Infrastructure/Persistence/Migrations/20260729215447_LimitedStudentLearningPreferences.cs`
- `src/Tafseel.Infrastructure/Persistence/Migrations/20260729215447_LimitedStudentLearningPreferences.Designer.cs`
- `src/Tafseel.Infrastructure/Persistence/Migrations/TafseelDbContextModelSnapshot.cs`

## Risks

- Rollback drops Student learning defaults; no historical request data is affected.
- Inactive teaching languages remain as stored FK until the Student clears/replaces them; GET omits inactive languages without fabricating a replacement.
- Clients must round-trip `version` on update after the first create.

## Next Step

Apply only through the normal controlled migration workflow after review — not during this implementation pass.
