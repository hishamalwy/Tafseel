# Tafseel Phase 2–3 Hardening — Pass 3 Domain Report

Date: 2026-07-26  
Scope: implemented Phase 3 catalog and teacher-qualification only

## 1. Findings Addressed

| Finding | Result |
|---|---|
| AUD-008 | Closed: exact enum and nine-criterion rubric validation at API/Application and Domain boundaries |
| AUD-019 | Closed: stable Phase 3 ranges/enums/status consistency enforced by named SQL constraints |
| AUD-020 | Closed: public child visibility and child creation/reactivation require an active parent |
| AUD-021 | Closed: Topic and Qualification Topic names are subject-scoped |
| AUD-022 | Closed: persisted product-normalized keys replace collation-only uniqueness |
| AUD-023 | Phase 3 state portion closed: opaque rowversion contract and synchronized stale-write proof; broader future-domain/API work remains |
| AUD-024 | Closed for current Phase 3 contracts: field validation and RFC 7807 field errors |
| AUD-030 | Phase 3 documentation corrected; unrelated documentation remains future-scope |
| AUD-032 | Closed: active-application and active-qualification reapplication rules aligned |
| AUD-012 | Closed for the implemented application aggregate by restrictive historical foreign keys |

AUD-001 was subsequently closed on 2026-07-26; the safe post-Pass-3 verification is recorded in section 13.

## 2. Confirmed Business Decisions

- Subject deactivation hides its Topics and Qualification Topics from public/new selection without changing child `IsActive`.
- Reactivating a Subject restores only independently active children.
- Subject, Education Level, Teaching Language, and Service Catalog Item names are globally unique.
- Topic and Qualification Topic names are unique per Subject.
- Rejected and Withdrawn applications permit reapplication.
- ChangesRequested is the same active application and is resubmitted.
- An existing subject qualification blocks reapplication.
- Approved application history is immutable. Qualification revocation/expiry was not implemented.
- Approval remains a human decision with no average-score threshold.

## 3. Domain Invariants

- Undefined `ReviewDecision`, `ApplicationPriority`, and `EvaluationCriterion` values are rejected.
- A decision contains exactly the nine defined criteria, once each, with scores from 1–5.
- Reject and RequestChanges require a public comment; Approve may omit it.
- Only the assigned reviewer can decide.
- Draft and ChangesRequested are the only editable applicant states.
- Submission requires complete profile data, a demo reference, an active Subject, and an active Qualification Topic belonging to that Subject.
- Approved, Rejected, and Withdrawn applications are terminal.
- One decision adds one immutable review and one status transition.
- Approval adds one unique subject qualification transactionally.
- Repeated terminal decisions are conflicts, not idempotent success, and add no duplicate records.

## 4. State Transition Matrix

| From | Allowed next states |
|---|---|
| Draft | Submitted, Withdrawn |
| Submitted | UnderReview, Withdrawn |
| UnderReview | ChangesRequested, Approved, Rejected |
| ChangesRequested | Submitted, Withdrawn |
| Approved | None |
| Rejected | None |
| Withdrawn | None |

The executable command matrix covers every state against edit, submit, start-review, decide, and withdraw operations.

## 5. Catalog Normalization Rules

One Domain component, `CatalogNameNormalizer`, computes both display and unique values:

1. Unicode Normalization Form C.
2. Split on Unicode whitespace.
3. Remove leading/trailing whitespace and collapse internal whitespace to one ASCII space.
4. Preserve the resulting display `Name`.
5. Persist `NormalizedName` as invariant uppercase.

Accents and Arabic diacritics are retained; they are meaningful for uniqueness. The strategy is culture-invariant at runtime. Migration backfill uses a fixed SQL collation rather than the deployment database default and aborts if the normalized result conflicts.

API callers cannot set `NormalizedName`. Creation and rename both route through `Rename`.

## 6. Database Constraints and Indexes

Migration `20260726145628_Pass3DomainIntegrity` adds:

- Global unique normalized indexes for Subjects, Education Levels, Teaching Languages, and Service Catalog Items.
- `(SubjectId, NormalizedName)` unique indexes for Topics and Qualification Topics.
- Non-empty normalized-name checks on all six catalog tables.
- Experience-years range 0–80.
- Demo-duration range 1–600 when present.
- Qualification Topic max-video range 30–600.
- Evaluation score range 1–5.
- Supported stored values for application status, priority, review decision, and evaluation criterion.
- Previous/next status ranges and non-self-transition history consistency.
- Restrictive application-to-review, application-to-history, and review-to-score foreign keys.

The existing filtered unique active-application index remains scoped to Draft, Submitted, UnderReview, and ChangesRequested. The existing unique `(TeacherId, SubjectId)` qualification index remains the final qualification duplicate guard.

## 7. Concurrency Contract

Teacher application responses expose `version` as opaque Base64 text. Current workflow mutations require `If-Match`:

- Applicant update and demo replacement.
- Submit/resubmit.
- Withdraw.
- Start review/assignment.
- Approve, RequestChanges, and Reject.

The service applies the supplied value as the SQL Server rowversion original value. Stale writes return `409` and `code=concurrency_conflict`. Missing/invalid tokens return field validation or `invalid_concurrency_token`.

Concurrent creation relies on application checks plus the filtered unique SQL index. Qualification blocking is checked in the same create transaction. Approval changes state and inserts the unique qualification in one transaction. Synchronized concurrent decisions use the same version; exactly one commits.

## 8. Files Changed

Implementation:

- `src/Tafseel.Domain/Catalog/Catalog.cs`
- `src/Tafseel.Domain/TeacherApplications/TeacherApplication.cs`
- `src/Tafseel.Application/Common/NotWhiteSpaceAttribute.cs`
- `src/Tafseel.Application/Catalog/CatalogContracts.cs`
- `src/Tafseel.Application/TeacherApplications/TeacherApplicationContracts.cs`
- `src/Tafseel.Infrastructure/Catalog/CatalogService.cs`
- `src/Tafseel.Infrastructure/TeacherApplications/TeacherApplicationService.cs`
- `src/Tafseel.Infrastructure/Persistence/TafseelDbContext.cs`
- `src/Tafseel.Api/Controllers/TeacherApplicationsController.cs`
- `src/Tafseel.Api/Middleware/ApiExceptionHandler.cs`
- `src/Tafseel.Api/Program.cs`
- `src/Tafseel.Api/appsettings.json`
- `src/Tafseel.Api/Tafseel.Api.csproj`

Migration:

- `src/Tafseel.Infrastructure/Persistence/Migrations/20260726145628_Pass3DomainIntegrity.cs`
- `src/Tafseel.Infrastructure/Persistence/Migrations/20260726145628_Pass3DomainIntegrity.Designer.cs`
- `src/Tafseel.Infrastructure/Persistence/Migrations/TafseelDbContextModelSnapshot.cs`

Tests:

- `tests/Tafseel.Domain.Tests/CatalogNameTests.cs`
- `tests/Tafseel.Domain.Tests/TeacherApplicationTests.cs`
- `tests/Tafseel.IntegrationTests/Pass3TestData.cs`
- `tests/Tafseel.IntegrationTests/Pass3CatalogAndValidationTests.cs`
- `tests/Tafseel.IntegrationTests/Pass3ConcurrencyAndReapplicationTests.cs`
- `tests/Tafseel.IntegrationTests/Pass3SqlIntegrityTests.cs`
- `tests/Tafseel.IntegrationTests/TeacherApplicationFlowTests.cs`
- `tests/Tafseel.IntegrationTests/TeacherApplicationAuthorizationTests.cs`

Documentation:

- `docs/teacher-application-state-machine.md`
- `docs/proposed-domain-model.md`
- `docs/proposed-api-contracts.md`
- `docs/business-ambiguities.md`
- `docs/phase-3-report.md`
- `docs/phase-2-3-audit-findings.md`
- `docs/phase-2-3-pass-3-domain-report.md`

## 9. Migration Details

The migration is deliberately staged:

1. Drop obsolete name indexes.
2. Add nullable `NormalizedName` columns.
3. Backfill display names using fixed Unicode whitespace/case rules.
4. Detect global or subject-scoped normalized duplicates and `THROW 51000`; no row is silently discarded.
5. Make columns required.
6. Add scoped unique indexes and named checks.
7. Replace cascade historical foreign keys with restrictive foreign keys.

Tests prove:

- Migration from an empty SQL Server database.
- Upgrade from `20260726123640_Pass2EmailConfirmation`.
- Deterministic `Data   Science` → `DATA SCIENCE` backfill.
- Explicit migration abort when existing rows normalize to a duplicate.

## 10. Tests Added

Domain:

- Full command/state matrix.
- All three valid decisions.
- Undefined decision and priority.
- Unknown/missing criterion.
- Score 0 and 6.
- Required comments.
- Complete rubric with no threshold.
- Terminal repeated-decision protection.
- English/Arabic normalization and retained diacritics.

SQL Server integration:

- Fresh and upgrade migrations plus duplicate abort.
- Named range/enum checks and accepted boundaries.
- Restrictive application-history deletion.
- Global and subject-scoped normalized uniqueness.
- Case, outer/internal whitespace, accents, and Arabic diacritics.
- Rename and concurrent name collisions.
- Parent visibility/deactivation/reactivation behavior.
- Submission after parent deactivation.
- Reapplication matrix and active-qualification blocking.
- Concurrent application creation.
- Synchronized rowversion decisions and repeated terminal behavior.
- One qualification, review, and history result.
- Public/internal DTO separation.
- RFC 7807 field-validation contract.

SQLite remains only for fast provider-neutral tests and is not cited as SQL Server proof.

## 11. Exact Commands and Results

```text
dotnet restore Tafseel.sln
Passed — all projects up to date.

dotnet build Tafseel.sln -c Release --no-restore
Passed — 0 warnings, 0 errors.

dotnet test Tafseel.sln -c Release --no-build --logger "console;verbosity=minimal"
Passed — 73/73, 0 failed, 0 skipped.

dotnet ef migrations has-pending-model-changes --project src/Tafseel.Infrastructure --startup-project src/Tafseel.Api --configuration Release --no-build
Passed — no pending model changes.

dotnet test tests/Tafseel.IntegrationTests/Tafseel.IntegrationTests.csproj -c Release --no-build --filter "FullyQualifiedName~Pass3|FullyQualifiedName~TeacherApplicationFlowTests" --logger "console;verbosity=minimal"
Passed — 16/16 SQL Server Pass 3 tests, 0 failed, 0 skipped.

dotnet ef database update --project src/Tafseel.Infrastructure --startup-project src/Tafseel.Api --configuration Release --no-build --connection <temporary LocalDB connection>
Passed — fresh database updated and deleted afterward.
```

Suite totals:

- Domain: 16 passed, 0 failed, 0 skipped.
- Application: 5 passed, 0 failed, 0 skipped.
- Architecture: 1 passed, 0 failed, 0 skipped.
- Integration: 51 passed, 0 failed, 0 skipped.
- Total: 73 passed, 0 failed, 0 skipped.

## 12. SQL Server Results

SQL Server LocalDB was used with unique temporary databases and real EF migrations. No EF InMemory provider proved relational behavior. SQL Server verified migrations, upgrade/backfill/abort, constraints, indexes, restrictive deletes, active application/qualification rules, concurrent creation, concurrent decisions, and rowversion conflicts. No SQL Server Pass 3 test was skipped.

AUD-013 is partially closed because current security and Phase 3 persistence behavior now have provider-specific proof; future domains will still require SQL Server tests.

## 13. Finding Status

Closed:

- AUD-008, AUD-012 for current aggregate, AUD-019, AUD-020, AUD-021, AUD-022, AUD-024 for current contracts, AUD-032.

Partially closed:

- AUD-013, AUD-023, AUD-030.

Still open:

- AUD-001. The originally disclosed key is recorded as manually revoked by the user. During verification, the first replacement was found in repository configuration content and appeared in diagnostic output, so it was replaced again with a send-only key stored only in User Secrets. The repository now contains no Resend credential. The new send-only key successfully sent message `3aa97afa-637c-4f7a-bc11-86077cd162a5`, and Gmail search verified it in the intended recipient's inbox.
- The user subsequently confirmed dashboard revocation of the exposed replacement. A controlled application registration returned `202 confirmationRequired=true`, and Gmail independently verified the corresponding confirmation message in the intended inbox. Repository and temporary runtime-log scans contained no Resend-shaped credential; the current send-only key remains only in User Secrets.
- File-storage, deployment, pagination/performance, generic audit, and future marketplace findings remain outside Pass 3.

## 14. Remaining Limits

- Uploaded duration is still client-supplied metadata, not secure server-side media parsing.
- Local file storage is not production-ready.
- No qualification revocation/expiry workflow exists.
- No Pass 4 or marketplace feature was implemented.

## 15. Pass 4 Decision

The Pass 3 domain/catalog implementation is technically verified, and the former Resend credential blocker is closed by the documented post-Pass-3 verification.

```text
NOT SAFE TO PROCEED TO PASS 4
```
