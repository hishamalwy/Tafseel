# Limited Teacher Showcase MVP Report

Date: 2026-07-29  
Status: Implemented locally; conditionally browser-verified; not committed, pushed, deployed, or migrated.

## Findings

- Teacher-created and qualification-generated samples shared `TeacherTeachingSample`.
- Existing rows were distinguishable only indirectly through qualification provenance.
- The old Teacher API could create a sample and publish it directly.
- Qualification evidence already had private storage and authorization that must remain unchanged.
- The shared worktree materially differed from ADR-007 because concurrent Catalog, Live Session, dashboard and migration work was already present.
- ADR-007 proposed a separate portfolio aggregate, while the implementation brief preferred a focused extension. The existing aggregate was extended to avoid a duplicate portfolio domain.

## Root Cause

The existing model had no explicit source enum, immutable Showcase version, Quality moderation lifecycle, approved-version pointer, or public trust code. A Teacher-created row could therefore be self-published without review.

## Product Behavior

A qualified Teacher can create and edit a private MP4 draft, upload/replace its file, submit an immutable version, see status/feedback, create a later version after rejection/changes/approval, reorder approved Showcases, and archive approved content. Public profiles show Qualification Samples before approved Teacher Showcases.

No feed, comments, reactions, arbitrary embeds, external video links, non-MP4 media, AI moderation, or qualification lifecycle redesign was added.

## Architecture

The existing Domain/Application/Infrastructure/API/frontend layering and `TeacherTeachingSample` root were retained. `TeacherTeachingSampleVersion` carries draft/submission/moderation data. Marketplace endpoints and the existing storage, notification and audit services are reused.

## Domain Model

- Source: `QualificationGenerated` or `TeacherShowcase`.
- Status: `Draft`, `Submitted`, `UnderReview`, `ChangesRequested`, `Approved`, `Rejected`, `Archived`.
- Root: owner, subject, source, status, current/approved pointers, archive/publication/order timestamps, row version.
- Version: topic, title, description, private media metadata, submission/reviewer/decision fields, safe feedback, internal note and row version.

Qualification Samples cannot enter Showcase moderation. Showcase direct publication is forbidden.

## Lifecycle

`Draft -> Submitted -> UnderReview -> Approved | ChangesRequested | Rejected`.

Changes-requested, rejected and approved rows may create a new Draft version. Approval selects one approved current version. Archive removes visibility and is not reversible in this MVP.

## Versioning and Immutability

Submission freezes version metadata and media. Later work creates a monotonically increasing version and retains previous versions. SQL uniqueness prevents duplicate version numbers and duplicate non-null current/approved pointers. Serializable transactions, row versions and SQL application locks protect submit/review/approval/version creation/revocation races.

## Migration and Legacy Data

One focused migration was generated and not applied. Qualification-provenance rows retain qualification source. Other legacy rows become unreviewed Showcases with one deterministic version; prior publication never implies approval and is cleared. See [migration documentation](../database/TEACHER_SHOWCASE_MVP_MIGRATION.md).

## API Contract

Teacher endpoints under `/api/v1/teachers/me/showcases` cover paginated list/detail, draft create/update, MP4 upload, submit, new version, private version stream, archive and ordering.

Quality endpoints under `/api/v1/teachers/showcase-moderation` cover the paginated Submitted/UnderReview queue, review start and decision.

The existing public profile/sample content endpoints return only currently visible media. Public DTOs expose fixed `qualification_sample` or `reviewed_showcase` source/trust codes.

## Authorization Matrix

| Actor | Draft/media | Submit/status | Moderate | Public approved media |
|---|---|---|---|---|
| Owner Teacher | Own only | Own only | No | Yes |
| Other Teacher | No | No | No | Yes |
| Student | No | No | No | Yes |
| Quality Reviewer | Preview queued version only | Queue only | Dedicated permission | Yes |
| Admin | Existing intentional permission inheritance gives oversight | Existing inheritance | Yes | Yes |
| Anonymous | No | No | No | Yes |

## File Security

Uploads require a non-empty `.mp4`, `video/mp4`, MP4 `ftyp` signature, configured maximum size, generated private key and sanitized filename. Storage keys and internal notes are absent from API DTOs. Public/private streams re-check authorization and file existence. Duration remains nullable because no approved media probe exists.

## Production Gate

Development and Testing enable the capability locally. Staging requires `TeacherShowcases:Enabled=true`. Production additionally requires every explicit readiness switch: durable object storage, malware scanning, reliable media probing, retention policy, copyright/reporting policy, moderation operations and secure media delivery. Defaults are false.

This report does not claim Production media readiness.

## Teacher Dashboard

Qualification Samples remain a separate view-only section. Teacher Showcases have create/edit/upload/status/version/feedback/submit/new-version/reorder/archive states with MP4 guidance and no direct publish control.

## Quality Dashboard

A separate navigation item provides a bounded moderation queue, authenticated MP4 preview, metadata, reviewer claim, safe reason/feedback, internal note, approve/request-changes/reject actions and loading/error/empty states.

## Public Profile and Trust Labels

The profile renders separate Qualification Samples and Teacher Showcases sections from fixed trust codes. Both use native video controls with metadata preload, no autoplay and no iframe. Subject/topic names derive from canonical localized profile catalogs. Showcase copy states that review does not verify every educational claim.

## Notifications and Audit

Existing writers record draft creation, upload, submission, review start, decision, archive and qualification-driven hiding. Existing notifications cover submission to Quality and Teacher decisions; revocation uses the existing user-facing notification convention. No parallel subsystem was created.

## Validation

| Exact command | Exit | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| `dotnet restore Tafseel.sln --locked-mode` | 0 | 8 projects restored/up-to-date | 0 | 0 |
| `dotnet build Tafseel.sln -c Release --no-restore` | 0 | Build (2 unrelated nullable warnings) | 0 | 0 |
| `dotnet format Tafseel.sln --verify-no-changes --no-restore` | 0 | Format gate | 0 | 0 |
| `dotnet test tests/Tafseel.Domain.Tests/Tafseel.Domain.Tests.csproj -c Release --no-build --filter "FullyQualifiedName~TeacherShowcaseTests"` | 0 | 3 | 0 | 0 |
| `dotnet test tests/Tafseel.IntegrationTests/Tafseel.IntegrationTests.csproj -c Release --no-build --filter "FullyQualifiedName~TeacherShowcaseMvpTests"` | 0 | 5 | 0 | 0 |
| `dotnet test tests/Tafseel.ArchitectureTests -c Release --no-build` | 0 | 1 | 0 | 0 |
| `dotnet test tests/Tafseel.Domain.Tests -c Release --no-build` | 0 | 66 | 0 | 0 |
| `dotnet test tests/Tafseel.Application.Tests -c Release --no-build` | 0 | 5 | 0 | 0 |
| `dotnet test tests/Tafseel.IntegrationTests -c Release --no-build --filter "Category!=SqlServer"` | 1 | 80 | 1 | 0 |
| `dotnet test tests/Tafseel.IntegrationTests -c Release --no-build --filter "FullyQualifiedName~RoleBootstrapTests.Repeated_bootstrap_uses_the_bounded_fast_path"` | 1 | 0 | 1 | 0 |
| `dotnet test tests/Tafseel.IntegrationTests -c Release --no-build --filter "Category=SqlServer"` | 1 | 72 | 2 | 0 |
| `dotnet test tests/Tafseel.IntegrationTests -c Release --no-restore --filter "FullyQualifiedName~TeacherComparisonTests"` | 0 | 4 | 0 | 0 |
| `dotnet test tests/Tafseel.IntegrationTests -c Release --no-build --filter "FullyQualifiedName~Phase4MarketplaceTests.Public_search_has_fixed_sort_pagination_filters_and_two_queries"` | 0 | 1 | 0 | 0 |
| `node scripts/ci/check-frontend-integrity.mjs` | 0 | 12 entry points | 0 | 0 |
| `node scripts/ci/check-localization.mjs` | 0 | 12 entry points / 2144 paired keys | 0 | 0 |
| `node scripts/ci/check-js.mjs` | 0 | JS/auth/localization/frontend gates | 0 | 0 |
| `dotnet ef migrations has-pending-model-changes --project src/Tafseel.Infrastructure --startup-project src/Tafseel.Api --configuration Release --no-build` | 0 | No pending model changes | 0 | 0 |
| `./scripts/ci/check-migration-safety.ps1 -Script src/Tafseel.Infrastructure/Persistence/Migrations/20260729175230_LimitedTeacherShowcaseMvp.cs` | 0 | 41 operations | 0 | 0 |
| `dotnet ef migrations script --idempotent --project src/Tafseel.Infrastructure --startup-project src/Tafseel.Api --configuration Release --no-build --output <temporary-file>` | 0 | Script generated/inspected | 0 | 0 |
| `./scripts/ci/tests/deploy-gates.tests.ps1` | 0 | 46 | 0 | 0 |
| `./scripts/ci/tests/staging-migration.tests.ps1` | 0 | 34 | 0 | 0 |
| `dotnet publish src/Tafseel.Api/Tafseel.Api.csproj -c Release --no-build --no-restore -o <temporary-directory>` + `./scripts/ci/validate-publish.ps1` | 0 | Publish smoke | 0 | 0 |

The first full SQL run found four Teacher Comparison fixture failures caused by the new no-self-publish rule; the fixture was corrected to create a stored, Quality-approved Showcase and all four then passed. The final full run had two unrelated failures: one stale frontend assertion expects English literal service labels that the existing dashboard now localizes, and the previously documented Marketplace query-counter test remains suite-order sensitive. The latter passed immediately when rerun alone.

The provider-neutral failure is also unrelated: `RoleBootstrapTests.Repeated_bootstrap_uses_the_bounded_fast_path` expects three reads while the current pre-existing startup implementation performs four; it fails alone.

Browser validation used `http://127.0.0.1:5091` with `ASPNETCORE_ENVIRONMENT=Testing`, a separately controlled host, and no migration application. English/LTR/light and Arabic/RTL/dark public profile states rendered without horizontal overflow or console errors at the available 1280×720 browser viewport. Protected Quality access redirected a Teacher session to authentication. The existing Teacher session had no approved qualification and correctly routed to onboarding. Full authenticated lifecycle and 375/768/1024/1440 resizing were therefore conditional and remain covered by SQL/static tests rather than claimed as dynamically verified.

## Files Changed

- `Tafseel-Teacher-Dashboard.dc.html`
- `Tafseel-Quality-Dashboard.dc.html`
- `Tafseel-Teacher-Profile.dc.html`
- `css/tafseel.css`
- `js/api.js`
- `js/locales.js`
- `scripts/ci/check-frontend-integrity.mjs`
- `src/Tafseel.Domain/Marketplace/Marketplace.cs`
- `src/Tafseel.Application/Authorization/Authorization.cs`
- `src/Tafseel.Application/Marketplace/MarketplaceContracts.cs`
- `src/Tafseel.Application/TeacherApplications/TeacherApplicationContracts.cs`
- `src/Tafseel.Infrastructure/DependencyInjection.cs`
- `src/Tafseel.Infrastructure/Files/LocalFileStorageService.cs`
- `src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs`
- `src/Tafseel.Infrastructure/Persistence/TafseelDbContext.cs`
- `src/Tafseel.Infrastructure/Persistence/Migrations/20260729175230_LimitedTeacherShowcaseMvp.cs`
- `src/Tafseel.Infrastructure/Persistence/Migrations/20260729175230_LimitedTeacherShowcaseMvp.Designer.cs`
- `src/Tafseel.Infrastructure/Persistence/Migrations/TafseelDbContextModelSnapshot.cs`
- `src/Tafseel.Infrastructure/TeacherApplications/TeacherApplicationService.cs`
- `src/Tafseel.Api/Controllers/MarketplaceController.cs`
- `src/Tafseel.Api/appsettings.json`
- `tests/Tafseel.Domain.Tests/TeacherShowcaseTests.cs`
- `tests/Tafseel.IntegrationTests/ConfigurationValidationTests.cs`
- `tests/Tafseel.IntegrationTests/TeacherComparisonTests.cs`
- `tests/Tafseel.IntegrationTests/TeacherShowcaseMvpTests.cs`
- `docs/database/TEACHER_SHOWCASE_MVP_MIGRATION.md`
- `docs/features/TEACHER_SHOWCASE_MVP_REPORT.md`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

Some listed frontend, snapshot and test files already contained unrelated concurrent edits; this pass preserved them and changed only the Showcase-relevant portions.

## Risks

- Reliable duration probing is unresolved.
- Local media is not durable, scanned, quarantined or scalable.
- Archived Showcase media and historical versions need a formal retention/deletion policy.
- Moderation staffing, SLA and copyright/reporting operations are unresolved.
- Admin access follows existing broad permission inheritance.
- One provider-neutral bootstrap test and one stale frontend literal assertion remain red outside the slice.

## Production Blockers

Durable object storage, malware scanning/quarantine, reliable MP4 probing, retention/deletion, copyright/reporting policy, moderation operations/SLA and secure scalable delivery.

## Unverified Scenarios

- Full browser lifecycle with separate qualified Teacher and Quality credentials.
- Browser viewport matrix at 375, 768, 1024 and 1440 due the controlled browser surface exposing one fixed 1280×720 viewport.
- Staging runtime and real object storage.
- Migration upgrade/rollback against a retained production-like legacy dataset.

## Backward Compatibility

Qualification approval/revocation and private evidence authorization remain intact. Legacy self-published Teacher rows fail closed. Existing public sample contracts gain explicit source/trust/description/order fields without exposing private metadata. Old direct Teacher publication now returns a safe domain error.

## Final Verdict

LIMITED TEACHER SHOWCASE MVP IMPLEMENTED BUT CONDITIONALLY VERIFIED

## Next Step

Student Request Assistant Investigation and Guided UX Design
