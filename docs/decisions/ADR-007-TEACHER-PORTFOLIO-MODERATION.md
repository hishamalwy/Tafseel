# ADR-007: Teacher Portfolio Moderation and Showcase Workflow

## Status

Proposed.

## Context

Tafseel currently has three materially different content paths:

1. private, immutable qualification evidence;
2. a public teaching sample generated automatically from approved qualification evidence;
3. a Teacher-created sample that the owner can publish without moderation.

The third path is not entitled to the trust of the first two. The public profile, however, renders published samples as one collection and currently describes them as quality-scored. That statement is not supported for Teacher-created samples.

The minimum safe design must preserve qualification immutability and subject-specific verification, keep qualification evidence private, and add an explicit moderation boundary for optional Teacher showcase content. It must reuse the existing profile, dashboards, notification writer, audit writer and private file-storage abstraction rather than create a feed, a second qualification system or a new notification system.

Repository evidence:

- [Marketplace entities](../../src/Tafseel.Domain/Marketplace/Marketplace.cs)
- [Marketplace contracts](../../src/Tafseel.Application/Marketplace/MarketplaceContracts.cs)
- [Marketplace service](../../src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs)
- [Marketplace controller](../../src/Tafseel.Api/Controllers/MarketplaceController.cs)
- [Teacher application domain](../../src/Tafseel.Domain/TeacherApplications/TeacherApplication.cs)
- [Teacher application service](../../src/Tafseel.Infrastructure/TeacherApplications/TeacherApplicationService.cs)
- [Local file storage](../../src/Tafseel.Infrastructure/Files/LocalFileStorageService.cs)
- [Teacher Dashboard](../../Tafseel-Teacher-Dashboard.dc.html)
- [Quality Dashboard](../../Tafseel-Quality-Dashboard.dc.html)
- [Admin Dashboard](../../Tafseel-Admin-Dashboard.dc.html)
- [Public Teacher Profile](../../Tafseel-Teacher-Profile.dc.html)
- [Marketplace integration tests](../../tests/Tafseel.IntegrationTests/Phase4MarketplaceTests.cs)
- [Teacher application flow tests](../../tests/Tafseel.IntegrationTests/TeacherApplicationFlowTests.cs)

## Existing Content Paths

| Content path | Entity | Creator / source | Subject | Media | Publication | Edit / archive | Publish / view | Moderation | Qualification-derived | Revocation |
|---|---|---|---|---|---|---|---|---|---|---|
| Qualification submission | `TeacherDemoSubmission` | Teacher uploads against an assigned qualification task | Required application subject and assignment | Private MP4 plus immutable original-name, type, size, duration and assignment snapshots | Never public | Submitted versions are immutable; lifecycle retention belongs to qualification | Teacher owner and authorized qualification reviewers through protected content endpoint | Qualification review | Yes: direct evidence | Retained as private evidence |
| Qualification-generated sample | `TeacherTeachingSample` created by `FromQualificationDemo` | System on application approval | Approved qualification subject; optional selected topic | Reuses the approved demo storage key | Auto-published | Teacher cannot unpublish it; no edit workflow | Public when profile and active qualification gates pass; protected private access otherwise | Inherits the completed qualification decision | Yes | Qualification revocation unpublishes it |
| Teacher-created sample | `TeacherTeachingSample` created through `POST /teachers/me/samples` | Qualified Teacher | One active qualified subject; optional valid topic | Private MP4 | Starts private; owner can publish directly | Owner controls publication; no version, review, archive or safe-delete lifecycle | Public after self-publication and profile/qualification gates | None | No | Qualification revocation unpublishes all subject samples |
| Qualification assignment resource | Qualification assignment file/link resource | Admin/qualification workflow | Qualification assignment subject | Protected file or configured reference link | Never a portfolio item | Managed by qualification administration | Assigned Teacher/reviewer/admin according to qualification authorization | Qualification workflow access control | Yes | Remains private qualification evidence, never promoted to portfolio |

There is no current `Teacher-Submitted Showcase` path because no current entity records a showcase moderation decision. The Teacher-created sample path is reachable backend behavior even though the Teacher Dashboard has no complete management UI, so it is not dead code.

## Content Types

The MVP supports exactly one content set:

**Uploaded MP4 video only.**

This reuses the only current sample media path with extension, MIME, signature, size, generated-key and range-preview handling. The existing bounds remain the starting contract: at most 250 MB and at most 3,600 seconds. A server-side media probe must replace trust in client-reported duration before Production.

The MVP excludes:

- external video links;
- documents;
- images;
- audio;
- arbitrary HTML, scripts or iframe embeds.

Those types do not currently share a complete validation, preview, moderation and privacy-safe delivery path. External providers also require an allowlist, URL canonicalization, embed policy, tracking/privacy review and removal handling.

## Trust Levels

Each public item has one immutable source type:

| Source | Classification | Public label | Meaning |
|---|---|---|---|
| Approved qualification demo projected as a sample | Trusted Qualification Sample | **Qualification Sample** | Generated from evidence that passed Tafseel's subject qualification workflow |
| Approved showcase version | Teacher-Submitted Showcase | **Teacher Showcase** and **Reviewed by Tafseel** | Teacher-submitted media reviewed for showcase policy; not qualification evidence |
| Existing Teacher-created, self-published sample | Unmoderated Public Content | No approved public label | Must not remain publicly grandfathered without showcase review |
| Application demo or assignment resource | Private Qualification Evidence | None | Never exposed through the public portfolio |

“Reviewed by Tafseel” means only that the submitted showcase passed the defined moderation checks. It does not claim learning outcomes, endorsement, ranking or Teacher superiority. Reviewer identity and qualification evidence remain private.

## Moderation Owner

Select **Option A: Quality Reviewer Moderation**.

The Quality role already owns an authenticated evidence-review queue, preview, rubric/decision workflow and separation of public feedback from internal notes. The showcase queue must be separate from the qualification queue and use a dedicated permission such as `TeacherShowcasesReview`; qualification-review permission must not silently broaden.

Admin remains the existing superuser/emergency removal authority through the platform's all-permissions model, not a second operational moderation owner.

Option A adds workload to Quality, so Production requires an owner, staffing level, service target and escalation policy. This operational dependency does not justify auto-publication.

## Lifecycle

`Approved` and `Published` are not separate version statuses. An approved version becomes the root's published version atomically. Actual public visibility is derived from that pointer plus profile, account, qualification, subject and media gates.

| Transition | Actor | Required fields / checks | Editability after transition | Notification | Audit | Public visibility |
|---|---|---|---|---|---|---|
| Create `Draft` | Owning Teacher | Active qualified subject | Editable | None | `ShowcaseCreated`, `ShowcaseVersionCreated` | No |
| Draft upload/edit | Owning Teacher | Title, optional description/topic, valid owned root, private MP4; topic must belong to subject | Editable until submit | None | Material upload/replacement audit without storage key | No |
| `Draft` → `Submitted` | Owning Teacher | Title, video, active qualification, valid topic, server-verified media metadata, limits satisfied | Immutable | Queue notification for Quality | `ShowcaseSubmitted` | No |
| `Submitted` → `UnderReview` | Quality Reviewer | Dedicated permission, reviewer assignment and concurrency token | Immutable | None; review-start notification is unnecessary noise | `ShowcaseReviewStarted` | No |
| `UnderReview` → `Approved` | Assigned/authorized Quality Reviewer | Successful preview and moderation checks | Immutable | Teacher approved notification | `ShowcaseApproved`, `ShowcasePublishedVersionChanged` | Yes if every public gate passes |
| `UnderReview` → `ChangesRequested` | Assigned/authorized Quality Reviewer | Reason code and Teacher-visible note | Immutable; Teacher creates a new version | Teacher changes-requested notification | `ShowcaseChangesRequested` | Previous approved version, if any, remains public |
| `UnderReview` → `Rejected` | Assigned/authorized Quality Reviewer | Reason code and Teacher-visible note | Immutable; Teacher may create a new version | Teacher rejected notification | `ShowcaseRejected` | Previous approved version, if any, remains public |
| Any owned active root → `Archived` | Owning Teacher | Ownership and concurrency token | Versions remain immutable | None | `ShowcaseArchived` | No |
| Approved root → `Archived` by moderation | Authorized moderator/Admin override | Reason code and note | Versions remain retained | Teacher removal notification | `ShowcaseRemovedByModeration` | No |

The following moderation reason codes are sufficient for the MVP:

- `copyright_or_ownership`;
- `unsafe_or_inappropriate`;
- `unrelated_to_subject`;
- `misleading_claim`;
- `privacy_or_personal_data`;
- `unplayable_or_low_media_quality`;
- `policy_other` with a required explanatory note.

## Versioning and Immutability

- A Draft is editable and its upload may be replaced.
- Submission freezes that version's media, title, description, topic and derived media metadata.
- Changes or resubmission create a new monotonically numbered immutable version.
- Approved media cannot be replaced in place.
- Title, description or topic changes after approval require a new version and review.
- One root has at most one published approved version.
- The currently approved version remains public while a replacement is reviewed.
- Rejection or changes requested do not displace the previous approved version.
- Rejected and superseded versions remain private for audit and can be downloaded by their Teacher owner and authorized reviewers.
- Internal notes, reviewer identity and rejected versions never enter public projections.
- Qualification submissions are never reused as showcase version records and are never mutated.

## Qualification and Subject Rules

- A showcase root belongs to exactly one immutable subject for which the Teacher has an active approved, non-revoked qualification.
- Topic is optional. When present, it must be active and belong to the root subject.
- Submission and approval both revalidate qualification and catalog eligibility.
- A subject change requires a new showcase root; content cannot be moved under an unrelated qualification.
- Qualification revocation archives affected showcase roots and hides them in the same operation. Requalification does not republish them automatically.
- Qualification-generated samples keep their existing approval, provenance, immutability and revocation behavior.
- Public queries retain active qualification checks as defense in depth.

## Storage and Media Safety

Current protections for private video include:

- `.mp4` extension allowlisting;
- `video/mp4` MIME requirement;
- an `ftyp` signature check;
- a 250 MB size limit;
- generated private storage keys;
- traversal-safe local paths;
- protected direct access for private media;
- range-capable preview delivery.

Current limitations are material:

- the `ftyp` check is not a full media parser;
- duration is client supplied;
- there is no malware scanner/quarantine;
- local storage is not proven durable, shared or multi-instance safe;
- there is no transcoding, thumbnail generation or CDN;
- orphan cleanup and media-unavailable reconciliation are incomplete.

Development/Staging can exercise the workflow through the existing `IFileStorageService` abstraction. Production publication is blocked until durable encrypted private object storage, malware scanning/quarantine, constrained server-side media probing, cleanup/reconciliation and operational monitoring are proven. No storage-provider change is part of this decision pass.

## API Architecture

Add a focused showcase aggregate and API surface. Do not extend the current `TeacherTeachingSample` record with mixed qualification and moderation states: that would couple trusted generated samples to a mutable user-content lifecycle.

Proposed minimal model:

```text
TeacherShowcase
- Id
- TeacherId
- SubjectId                 // immutable
- CurrentVersionId?
- PublishedVersionId?
- DisplayOrder?
- ArchivedAt?
- ArchivedByUserId?
- ArchiveReasonCode?
- RowVersion
- CreatedAt

TeacherShowcaseVersion
- Id
- TeacherShowcaseId
- VersionNumber
- TopicId?
- Title
- Description?
- StorageKey
- OriginalFileName
- ContentType
- SizeBytes
- DurationSeconds
- Status
- AssignedReviewerId?
- SubmittedAt?
- ReviewStartedAt?
- DecidedAt?
- DecisionReasonCode?
- TeacherVisibleNote?
- InternalNote?
- RowVersion
- CreatedAt
```

Database invariants in the implementation pass:

- unique `(TeacherShowcaseId, VersionNumber)`;
- restrictive foreign keys for retained evidence;
- root subject cannot change;
- `PublishedVersionId` must belong to the root and reference an approved version;
- only one current and one published pointer per root;
- statuses require their corresponding timestamps/decision fields;
- optimistic concurrency on roots and reviewable versions.

Use existing `AuditLogEntry` for transition history rather than introduce a speculative third history table.

Focused endpoints:

```http
GET    /api/v1/teacher-showcases/me
POST   /api/v1/teacher-showcases
PUT    /api/v1/teacher-showcases/{id}/draft
POST   /api/v1/teacher-showcases/{id}/draft/video
POST   /api/v1/teacher-showcases/{id}/submit
POST   /api/v1/teacher-showcases/{id}/versions
POST   /api/v1/teacher-showcases/{id}/archive
PUT    /api/v1/teacher-showcases/reorder

GET    /api/v1/teacher-showcases/review-queue
POST   /api/v1/teacher-showcases/{id}/versions/{versionId}/review/start
POST   /api/v1/teacher-showcases/{id}/versions/{versionId}/review/decision

GET    /api/v1/teacher-showcases/{id}/versions/{versionId}/content
GET    /api/v1/teachers/showcases/{id}/content
```

Teacher mutation endpoints require ownership and `If-Match`/row-version concurrency. Reviewer endpoints require the dedicated moderation permission. Private content resolves an authorized immutable version; public content resolves only the root's current `PublishedVersionId` and rechecks every visibility gate.

Existing non-qualification `TeacherTeachingSample` records must not be trusted or grandfathered. Before implementation, count and classify them. A focused data migration should unpublish and import them as `Submitted` legacy showcase versions using the existing storage key, marked with a unique legacy source reference for review. If safe metadata cannot be reconstructed, retain them privately and require resubmission. Qualification-generated rows remain untouched.

## Authorization

- Teachers can create, edit and submit only their own showcase roots.
- Cross-Teacher reads and mutations are denied without revealing private existence.
- `TeacherShowcasesManageOwn` is separate from service/profile permissions.
- `TeacherShowcasesReview` is separate from qualification review permission and is assigned to Quality Reviewer.
- Admin receives only the existing superuser override, with mandatory audit and removal reason.
- Private version content is available only to the owning Teacher, assigned/authorized showcase reviewer and Admin override.
- Public content is approved-version-only and revalidates published profile, active account, active subject, active qualification and available media.
- Direct media URLs never contain storage keys or filesystem paths.
- Suspended accounts, missing media and authorization failures fail closed.

## Public Presentation

Reuse the existing Public Teacher Profile sample area; do not create a standalone portfolio page.

Qualification-generated samples appear first and carry the **Qualification Sample** label. Approved Teacher submissions follow and carry **Teacher Showcase** plus **Reviewed by Tafseel**. The UI must not use one generic quality-scored statement for both sources.

Public projection fields are limited to:

- public sample/showcase ID;
- title and optional description;
- localized subject and optional topic;
- stable source type;
- localized trust label;
- authorization-safe preview URL;
- server-derived duration;
- display order.

Thumbnail is omitted because no supported thumbnail pipeline exists. Storage keys, original private qualification resources, private upload metadata, rejected versions, reviewer identity and notes are excluded.

## Notifications and Audit

Reuse the existing persistent notification writer and optional email/outbox path:

- submission queues work for Quality;
- approval, rejection and changes requested notify the Teacher;
- moderation archive/removal notifies the Teacher;
- qualification-driven hiding notifies the Teacher through the qualification event or a deduplicated showcase-specific notification;
- review start is audited but does not notify the Teacher.

Audit actions:

- `ShowcaseCreated`;
- `ShowcaseVersionCreated`;
- `ShowcaseSubmitted`;
- `ShowcaseReviewStarted`;
- `ShowcaseApproved`;
- `ShowcaseChangesRequested`;
- `ShowcaseRejected`;
- `ShowcasePublishedVersionChanged`;
- `ShowcaseArchived`;
- `ShowcaseRemovedByModeration`;
- `ShowcaseHiddenByQualificationRevocation`;
- `ShowcaseReordered`.

Audit summaries must not contain storage keys, private paths or internal reviewer notes. Correlation IDs and actors follow the existing audit writer.

## Limits and Ordering

Proposed safe MVP limits:

- maximum 6 active public showcase roots per Teacher;
- maximum 3 active public showcase roots per subject;
- qualification-generated samples are always first and do not consume the showcase limit;
- Teachers may reorder approved showcase roots only;
- order is contiguous and unique per Teacher, with approval timestamp and ID as a stable fallback.

Approval enforces the limit. The system does not silently unpublish an existing item; the Teacher archives one before another can become public. These defaults require explicit product-owner acceptance in the implementation pass but do not justify an unbounded design.

## Revocation and Removal

- Teacher archive immediately removes the root from public projection but retains versions.
- Moderator/Admin removal requires a reason and note, hides immediately, notifies the Teacher and retains evidence.
- Qualification revocation archives every showcase in the affected subject and unpublishes existing qualification samples under the current rule.
- Profile unpublication hides content without mutating approved versions; republishing the profile restores only otherwise eligible non-archived content.
- Inactive subject, suspended account or unavailable media hides content fail-closed.
- Future requalification never automatically restores a qualification-revoked showcase.
- Permanent deletion is deferred until retention, legal hold and copyright/takedown rules exist.

## Production Dependencies

| Classification | Dependency |
|---|---|
| Required for MVP | Explicit lifecycle and immutable versions; dedicated permissions; ownership and direct-media authorization; existing MP4 extension/MIME/signature/size checks; server media probe; row-version concurrency; audit/notifications; fail-closed legacy migration; focused dashboards/profile integration |
| Required before Production | Durable encrypted shared object storage; malware scanning/quarantine; multi-instance/restart validation; cleanup and orphan reconciliation; media-failure monitoring; backup/restore; copyright/reporting/takedown procedure; retention policy; moderation staffing, service target and escalation |
| Optional Later | Transcoding/adaptive bitrate; thumbnails; CDN/authorized streaming optimization; external provider links; documents/images/audio; caching after measurement |
| Business Rule Required | Exact retention/legal-hold periods; takedown appeals; moderator service target/escalation; final acceptance of 6-per-Teacher and 3-per-subject limits |

## Deferred Scope

- social feed, comments, reactions, likes, followers and public posting;
- AI moderation;
- external embeds and provider integrations;
- non-video showcase types;
- public reviewer identity;
- public moderation history;
- analytics, ranking, recommendations or outcome claims;
- CDN, transcoding and thumbnails;
- hard deletion before retention policy;
- qualification lifecycle or evidence changes;
- standalone portfolio page.

## Consequences

- Trusted qualification samples and reviewed Teacher showcase content remain visibly and structurally distinct.
- A small new aggregate and eventual migration are required; no schema change occurs in this decision pass.
- The current direct self-publication route for non-qualification samples must be closed or redirected during implementation.
- Quality receives one separate bounded queue and an operational workload.
- Teachers can improve content without replacing the currently approved public version.
- Public visibility remains a derived, fail-closed decision rather than a mutable `Published` flag.
- Limited Development/Staging implementation can proceed, but Production media readiness is not claimed.

## Rejected Alternatives

- **Auto-publish:** rejected because the current Teacher-created sample path proves content can become public without review.
- **Admin as the operational moderator:** rejected because Admin is a broad governance role and a poorer scalable queue owner than Quality.
- **Both Admin and Quality as queue owners:** rejected because one accountable owner is sufficient; Admin retains only existing override authority.
- **Reuse qualification applications/submissions:** rejected because showcase review is not verification and qualification evidence is immutable.
- **Add moderation fields directly to `TeacherTeachingSample`:** rejected because qualification-generated samples and optional user content have different provenance, mutability and lifecycle.
- **Separate `Approved` and `Published` statuses:** rejected because one approved pointer plus existing public gates expresses visibility without another transition.
- **Replace an approved version during review:** rejected because it creates unnecessary public gaps and rollback ambiguity.
- **Broad files or arbitrary links/embeds:** rejected because current validation, preview and privacy evidence is insufficient.
- **Hard delete:** rejected until retention and legal-hold rules exist.
- **Standalone public portfolio/feed:** rejected because the existing profile sample area is sufficient.

## Implementation Preconditions

1. Product owner accepts or changes the bounded limits and moderation service target.
2. Count and classify all non-qualification `TeacherTeachingSample` rows; define a fail-closed import plan before migration generation.
3. Add the focused root/version model and one reviewed migration without altering qualification-generated records.
4. Add dedicated Teacher-owner and Quality-review permissions; preserve existing qualification permissions.
5. Add constrained server-side duration/decodability probing and retain all current upload checks.
6. Implement immutable submission, atomic approved-pointer changes, row-version concurrency and subject/qualification revalidation.
7. Implement authorized private version streaming and approved-only public streaming without exposing storage keys.
8. Reuse existing notifications and audit writers with safe summaries.
9. Add Teacher Dashboard and separate Quality Dashboard surfaces; update the existing Profile sample area and trust copy.
10. Test ownership, cross-Teacher denial, reviewer authorization, direct media access, every transition, concurrent decisions, limits, revocation, profile/account/catalog gates, legacy data and public DTO privacy.
11. Limit initial release to Development/Staging until Production storage, scanning, retention and moderation operations are ready.
