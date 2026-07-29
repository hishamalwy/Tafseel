# Phase 4 — Teacher Marketplace Report

Date: 2026-07-26  
Status: Passed

## Scope implemented

- Teacher profiles with explicit publication.
- Approved-subject projection, teacher topics, languages, and education levels.
- Teacher services with precise money values, active state, and SQL rowversion concurrency.
- Private teaching-sample storage, explicit publication, and authorized ranged streaming.
- Weekly time-of-day availability rules with time zone, optional slot length, dated unavailable periods, overlap protection, and ownership checks.
- Certifications, experience, and idempotent student favorites.
- Anonymous paginated public search and public profile endpoints.
- Teacher-owned profile, service, sample, availability, and credential endpoints.

## Business rules enforced

- A profile cannot publish without at least one approved Subject qualification.
- A service or sample cannot be created or published outside an active approved Subject.
- New topics, languages, education levels, and service types must be active.
- Deactivated catalog data stays readable to its owner; inactive Subjects or service types do not remain marketable publicly.
- Draft samples are visible only to their teacher; storage keys, application demos, and reviewer notes never appear in marketplace DTOs.
- Favorites have a composite primary key and PUT/DELETE are idempotent.
- Public search is anonymous, uses `AsNoTracking`, SQL projection, fixed sorting, page size 1–50, and two SQL reads (count plus page).
- `onlineOnly=true` returns the explicit `online_status_unavailable` error because no reliable presence source exists.
- Teacher level is the reversible `Verified` state derived from approved qualifications. No unconfirmed badge thresholds were invented.
- “Available this week” requires a recurring rule and conservatively excludes teachers with any unavailable period overlapping the next seven days.

## API groups

- `GET /api/v1/teachers`
- `GET /api/v1/teachers/{teacherId}`
- `GET /api/v1/teachers/samples/{id}/content`
- `/api/v1/teachers/me/*` for teacher-owned management
- `/api/v1/favorite-teachers/*` for Student favorites

## Database changes

Migration: `Phase4TeacherMarketplace`

Added profile, topic/language/education-level joins, services, samples, availability rules and exceptions, credential hierarchy, and favorite tables. Important constraints include money/terms ranges, rating/count ranges, valid availability ranges, credential date order, rowversion on services, composite favorite uniqueness, and marketplace query indexes.

## Security and privacy

- Server-side permission and role policies protect every mutation.
- Ownership is part of each resource query, returning not-found for cross-teacher access.
- Unpublished samples are indistinguishable from absent samples to non-owners.
- Private storage paths never enter API contracts.
- Sorting is whitelisted; no client value becomes SQL syntax.
- File type, size, signature, generated name, and safe-root rules reuse the existing private video storage boundary.

## Tests

Phase 4 SQL Server integration coverage verifies approval scope, cross-teacher denial, stale rowversion conflicts, concurrent creation, private/public DTO separation, favorites uniqueness/idempotency, every supported sort, all frontend filter categories, pagination clamping, explicit unavailable online status, time-zone validation, sequential and concurrent availability conflicts, unavailable periods, indexes, constraints, and the two-query list behavior.

The final gate command and exact totals are recorded in `phase-4-hardening-report.md`.

## Remaining product decisions

- Teacher badge tiers remain deferred until thresholds are approved.
- Live online presence remains unavailable until a reliable presence/session source exists.
- External calendar synchronization is not implemented because no provider is configured.

PHASE 4 PASSED — CONTINUING TO PHASE 5
