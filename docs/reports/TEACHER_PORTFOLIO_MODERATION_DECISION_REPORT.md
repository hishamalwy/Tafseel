# Teacher Portfolio Moderation and Showcase Workflow Decision Report

Date: 2026-07-29

Status: Decision complete; implementation not started.

## Findings

| Content Path | Source | Current Trust | Current Visibility | Risk | Decision |
|---|---|---|---|---|---|
| Qualification demo submission and assignment evidence | Immutable `TeacherDemoSubmission` and qualification resources | Private Qualification Evidence | Owner and authorized qualification reviewers only | Public reuse would expose private verification material and blur provenance | Keep private and unchanged |
| Qualification-generated teaching sample | `TeacherTeachingSample.FromQualificationDemo` created on approval | Trusted Qualification Sample | Auto-published when profile and active qualification gates pass | Generic public copy does not distinguish provenance | Preserve lifecycle; label **Qualification Sample** |
| Teacher-created teaching sample | `TeacherTeachingSample` created by qualified Teacher | Unmoderated Public Content | Private initially; owner can self-publish | No moderation, versioning, review decision or archive history | Stop direct self-publication; import legacy rows fail-closed into review |
| Proposed showcase | No current entity/path | Teacher-Submitted Showcase only after review | Not currently available | Mixing it into trusted samples would overstate trust | Add a focused, versioned moderation aggregate |
| Qualification assignment file/link | Qualification administration resource | Private Qualification Evidence | Authorized qualification participants only | Reference links/files could be mistaken for Teacher-owned portfolio content | Exclude from showcase |

Additional evidence:

- `TeacherTeachingSample` stores media and publication data but no source enum, moderation status, reviewer decision, description, immutable version, archive state or ordering.
- Qualification-generated rows retain application/demo/assignment provenance, reuse the approved private demo storage key and cannot be unpublished by the Teacher.
- Qualification revocation currently unpublishes all affected subject samples and deactivates services.
- Public profile queries already require publication and an active approved non-revoked subject qualification.
- Private sample media is owner-only until publication, but a published item is anonymously streamable through an API URL without exposing its storage key.
- The Teacher Dashboard only lists samples; it does not expose a complete create/edit/submit lifecycle.
- The Quality Dashboard already provides the closest operational pattern: an authenticated queue, assignment, preview, explicit decisions, Teacher-visible feedback and private internal notes.
- The Admin Dashboard is a broad governance surface, not the operational qualification-review owner.
- Existing storage validates `.mp4`, `video/mp4`, maximum size and an `ftyp` signature and uses generated private keys, but it has no malware scanner, robust media probe or proven durable shared Production storage.
- No current sample endpoint accepts an external link; qualification reference links belong only to the private assignment workflow.
- Existing tests prove private samples do not leak, generated-sample provenance is retained, qualification submissions are immutable and a Teacher cannot unpublish a generated qualification sample.

## Root Cause

The marketplace sample model was created for two different purposes: projecting an approved qualification demo and allowing a qualified Teacher to upload a sample. Publication is represented by one timestamp, so the second path has no persisted trust decision, reviewer, reason, immutable version or moderation history. The public profile then projects both paths as one collection and uses quality-review wording that is only defensible for the qualification path.

## Decisions

- Support **uploaded MP4 video only** for the MVP. Preserve the current 250 MB and 3,600-second bounds; add a server-side media probe before Production.
- Choose **Quality Reviewer** as the single operational moderation owner, under a new showcase-specific permission and queue. Admin keeps only the existing superuser/emergency override.
- Treat public visibility as an approved-version pointer plus fail-closed profile, account, qualification, subject and media gates. Do not add a separate `Published` status.
- Keep qualification submissions and qualification-generated samples unchanged.
- Make submitted showcase versions immutable. Every resubmission or approved metadata/media change creates a new version.
- Keep the previously approved version public while a replacement is reviewed.
- Link each showcase root to one immutable active qualified subject; topic is optional but must belong to that subject.
- Automatically archive and hide subject showcase roots on qualification revocation; do not automatically restore them on later requalification.
- Label generated items **Qualification Sample** and approved Teacher content **Teacher Showcase — Reviewed by Tafseel**.
- Propose a maximum of 6 active public showcase roots per Teacher and 3 per subject. Qualification samples appear first and do not count against the cap. Teacher-controlled ordering applies only to approved showcase roots.
- Reuse the existing Profile sample area, Teacher Dashboard, Quality Dashboard, notification writer and audit writer.
- Do not grandfather legacy Teacher-created samples as approved. Import them fail-closed as submitted items only after data inventory.

The full decision is [ADR-007](../decisions/ADR-007-TEACHER-PORTFOLIO-MODERATION.md).

## Proposed Lifecycle

```text
Draft
  -> Submitted
  -> UnderReview
       -> Approved
       -> ChangesRequested
       -> Rejected

Approved root -> Archived
```

- `Draft`: owned Teacher may edit metadata and replace upload.
- `Submitted`: immutable; active qualification, valid subject/topic, complete metadata, validated MP4 and limits are required.
- `UnderReview`: claimed by an authorized Quality Reviewer with optimistic concurrency.
- `Approved`: atomically becomes the root's published version; previous approved version becomes private history.
- `ChangesRequested`: reason code and Teacher-visible note required; Teacher creates a new immutable version.
- `Rejected`: reason code and Teacher-visible note required; content remains private and retained.
- `Archived`: immediate public removal while versions remain retained.

Review-start is audited but does not notify the Teacher. Submission queues work for Quality. Approval, rejection, changes request, moderation removal and qualification-driven hiding notify the Teacher through the existing notification system.

## Proposed Data Model Impact

Add a focused aggregate in the implementation pass:

- `TeacherShowcase`: owner, immutable subject, current version pointer, published version pointer, display order, archive metadata, timestamps and row version.
- `TeacherShowcaseVersion`: monotonically numbered version, optional topic, title, description, private media metadata/key, status, assignment/decision metadata, separate Teacher-visible/internal notes, timestamps and row version.

Required invariants:

- unique version number within a root;
- current/published version belongs to its root;
- published version is approved;
- root subject cannot change;
- status-specific timestamps and decision fields are consistent;
- foreign keys restrict deletion of retained evidence;
- review/root mutation uses optimistic concurrency.

Use existing audit records for transition history; a third speculative history table is unnecessary.

Expected migration impact is additive plus a controlled legacy import. Before generating a migration, count every non-qualification `TeacherTeachingSample`. Safely reconstructable records should be unpublished and imported as `Submitted` versions with a unique legacy reference and the same private media key. Unreconstructable records remain private and require resubmission. Rows with qualification provenance are not modified.

No entity or migration was changed in this pass.

## API Plan

Use a focused `/api/v1/teacher-showcases` surface:

- Teacher: list own roots/versions, create Draft, edit/upload Draft, submit, create next version, archive and reorder approved roots.
- Quality: bounded review queue, start review and record one approve/reject/changes-requested decision.
- Private media: stream one immutable version only to its owner, an authorized showcase reviewer or Admin override.
- Public media: resolve only the current approved pointer and recheck every public eligibility gate.

Use new permissions equivalent to `TeacherShowcasesManageOwn` and `TeacherShowcasesReview`. Do not broaden the qualification-review permission.

Public response is limited to ID, title, description, localized subject/topic, source type, trust label, safe preview URL, server-derived duration and display order. Thumbnail is omitted until supported. Storage key, private path, original qualification resources, rejected versions, reviewer identity, notes and private upload metadata are never public.

The current direct self-publication endpoint for non-qualification samples must be closed or redirected as part of the focused implementation. Qualification-generated sample behavior remains unchanged.

## Frontend Plan

- **Teacher Dashboard:** extend the existing sample area with create Draft, MP4 upload, edit Draft, submit, status, visible review reason, archive and approved-item reorder.
- **Quality Dashboard:** add a separate showcase queue with authorized preview, approve, reject, changes requested and separate public/internal notes. Do not mix it with the qualification application queue.
- **Public Teacher Profile:** retain the existing sample section, show qualification-generated samples first, then approved showcase items, and display accurate trust labels and an honest empty state.
- **Admin Dashboard:** no operational queue; retain only audited superuser removal/override behavior.
- No standalone portfolio page, feed or placeholder UI.

## Security and Privacy

- Owner checks apply to every Teacher mutation and private-version read.
- Cross-Teacher denial must not disclose private object existence.
- Public streaming is approved-version-only and fail-closed.
- Profile publication, account status, subject status, active qualification and media availability are checked at read time.
- Storage keys, private paths and internal moderation notes never appear in DTOs, URLs, notifications or audit summaries.
- Submitted versions and decisions are immutable.
- Reason codes are bounded; rejection/changes require a Teacher-visible note. Internal notes are stored separately.
- Rejected media remains downloadable to the Teacher owner and authorized reviewers but never publicly visible.
- Reviewer identity is persisted for accountability but not exposed publicly.
- Admin removal requires a reason, audit and Teacher notification.

## Storage and Production Readiness

| Classification | Items |
|---|---|
| Required for MVP | MP4-only validation; current extension/MIME/signature/size checks; generated private keys; authorized range preview; server media duration/decodability probe; lifecycle/permissions/concurrency; fail-closed legacy handling; notifications/audit |
| Required before Production | Durable encrypted shared object storage; malware scan/quarantine; cleanup/orphan reconciliation; multi-instance/restart validation; backup/restore; media-failure observability; retention policy; copyright/reporting/takedown process; moderation owner, staffing, service target and escalation |
| Optional Later | Transcoding/adaptive bitrate; thumbnails; CDN/optimized authorized delivery; allowlisted external providers; other media types; cache after measurement |
| Business Rule Required | Retention/legal-hold period; takedown appeals; moderator service target; final acceptance of the proposed 6-per-Teacher and 3-per-subject caps |

Local upload success is not Production media readiness. The workflow can be implemented and tested in Development/Staging through the existing storage abstraction, but Production publication remains gated by the required-before-Production items.

## Risks

1. Quality moderation workload and service target are not yet staffed or approved.
2. Current local storage is not durable/shared and has no malware quarantine.
3. Current `ftyp` validation and client duration do not prove a decodable safe video.
4. Legacy self-published rows need a measured, fail-closed import strategy.
5. A reviewer and qualification revocation may race without explicit transactions and row-version checks.
6. Retention, copyright reporting and takedown appeals are unresolved Production rules.
7. Public copy currently overstates review for all samples and must change with the implementation.
8. Display limits are safe proposed defaults, not yet approved product policy.

## Deferred Scope

- qualification lifecycle, qualification evidence and generated-sample changes;
- external links, documents, images, audio, embeds and arbitrary HTML;
- AI moderation;
- feed, public posting, comments, likes, followers and reactions;
- standalone public portfolio page;
- public reviewer identity or moderation history;
- analytics, recommendations, ranking and outcome claims;
- transcoding, thumbnails and CDN;
- permanent deletion before retention policy;
- storage-provider implementation.

## Final Verdict

READY FOR LIMITED SHOWCASE MVP

## Next Step

One focused Teacher Showcase aggregate, moderation API and dashboard/profile implementation pass, limited to Development/Staging and preserving qualification-generated samples unchanged.
