# Phase 3 Report — Catalog and Teacher Qualification

## Implemented

- Admin-managed Subjects, Topics, Qualification Topics, Education Levels, Teaching Languages, and Service Catalog Items with create, edit, read, and soft-deactivate APIs.
- Teacher application draft/update, private demo upload, submission, withdrawal, reviewer queue/assignment, nine-criterion review, changes request, rejection, approval, and complete status history.
- Subject-specific qualification on approval; no teacher becomes approved for unrelated subjects.
- Resend adapter plus forgot/reset-password flows. Password reset revokes all refresh tokens and changes the security stamp.
- Private local video storage with extension, MIME, MP4 signature, duration, size, generated-path, and ownership checks.

## Business rules chosen

- All rubric criteria are mandatory.
- There is no automatic minimum-score approval gate.
- Both Admin and QualityReviewer can review applications through the centralized permission.
- Catalog records are deactivated rather than deleted when historical references may exist.
- Pass 3 hardening adds exact enum/rubric validation, explicit transition tests, parent-aware public catalog visibility, persisted normalized-name uniqueness, active-qualification reapplication protection, RFC 7807 field errors, SQL check constraints, restrictive historical foreign keys, and an opaque rowversion concurrency contract.
- Uploaded duration remains client-provided metadata. Secure media parsing and production file storage remain open and are not claimed here.

## Database

`CatalogAndTeacherApplications` adds the original model. `Pass3DomainIntegrity` stages normalized-name columns, backfills them, aborts on normalized duplicates, replaces indexes with confirmed scopes, adds stable check constraints, and changes review/history/score foreign keys to restrictive deletion.

## Tests

- Domain state-transition, comment, complete-rubric, and no-magic-threshold tests.
- Relational SQLite integration tests for catalog lifecycle, password reset, authentication, refresh-token replay, and the full teacher submit → review → approve flow.

## Remaining risks

- Local file storage has no malware scanner and is not production storage.
- Resend needs a newly rotated API key and a verified sender domain.
- Supporting teacher documents and email confirmation wait for the missing onboarding/auth frontend contract.

## Next

Phase 4: teacher marketplace profiles, services, samples, availability, search, filters, and favorites.
