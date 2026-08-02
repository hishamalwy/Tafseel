=========================================
TEACHER GROWTH & PROFILE CURATION
EVIDENCE-FIRST INVESTIGATION AND IMPLEMENTATION
=========================================

Continue the existing Tafseel repository.

Two confirmed Teacher-product gaps exist:

1. An approved Teacher has no clear Teacher Dashboard action to apply for qualification in an additional subject.

2. A Teacher cannot control which approved teaching videos appear publicly on their profile.

This is a focused Teacher-side product slice.

Do NOT mix this work with:

- Student post-purchase experience;
- payment;
- Orders;
- service catalog governance;
- rating rules;
- production media infrastructure;
- qualification approval rules.

Do NOT create parallel qualification, showcase, portfolio, media, or moderation domains.

Do NOT allow Teachers to publish unapproved media.

Do NOT commit.

Do NOT push.

Do NOT deploy.

==================================================
GOAL
==================================================

Deliver two coherent Teacher Dashboard capabilities:

A. Apply to teach an additional subject through the existing qualification lifecycle.

B. Curate the public teaching videos shown on the Teacher Profile, using only content already approved through canonical trust/moderation workflows.

The Teacher must clearly understand:

- which subjects they are already qualified for;
- which applications are pending, rejected, revoked, or available;
- how to apply for another subject;
- which approved videos are public;
- which approved videos are hidden;
- why an item cannot be shown;
- how profile ordering works.

==================================================
PART A
ADDITIONAL SUBJECT QUALIFICATION
==================================================

## Phase A1 — Evidence Investigation

Trace the existing qualification architecture end-to-end:

- Teacher registration;
- initial Teacher qualification application;
- Teacher profile;
- Teacher qualifications;
- subjects;
- qualification topics;
- qualification assignments;
- uploaded qualification samples;
- Quality review;
- approval;
- rejection;
- changes requested;
- revocation;
- publication eligibility;
- Teacher services qualification gating;
- Teacher Dashboard UI;
- existing controllers, DTOs, services, entities and migrations.

Determine:

1. Whether the current qualification application supports multiple subject applications per Teacher.
2. Whether uniqueness is:
   - per Teacher;
   - per Teacher + Subject;
   - per Teacher + Topic;
   - or incorrectly global.
3. Whether an approved Teacher can already call the create endpoint for another subject.
4. Whether the missing behavior is:
   - UI-only;
   - API contract gap;
   - domain validation gap;
   - lifecycle gap;
   - data-model gap.
5. How pending/rejected/approved/revoked applications coexist.
6. Whether one active application per Teacher + Subject is enforced.
7. Whether a rejected application may be resubmitted or requires a new version.
8. Whether qualification resources and tasks are selected by subject correctly.
9. Whether additional approval automatically updates:
   - active qualifications;
   - public subject list;
   - service eligibility;
   - trust projections.

Do not change code until this evidence matrix is complete.

## Canonical Product Rule

Unless repository evidence disproves it:

- A Teacher may hold qualifications for multiple subjects.
- Each subject has its own independent qualification lifecycle.
- Qualification in Subject A must not imply qualification in Subject B.
- A Teacher cannot create two simultaneous active applications for the same subject.
- Existing approved qualification must remain unaffected when applying for another subject.
- Rejection of the new subject must not suspend existing approved subjects.
- Revocation remains subject-specific.
- Marketplace services remain gated by active qualification for the relevant subject.
- Quality Reviewer uses the existing queue and permissions.
- No Admin shortcut silently grants qualification.

## Teacher Dashboard UX

Add a dedicated section:

`My Qualifications`
`مؤهلاتي`

Show one card per relevant subject/application state:

- Qualified
- Application in progress
- Changes requested
- Rejected
- Revoked
- Available to apply

Each card should show:

- localized subject name;
- lifecycle status;
- submitted date where persisted;
- decision date where persisted;
- next required action;
- qualification sample status;
- relevant CTA.

Primary action:

`Apply for another subject`
`التقديم لتدريس مادة أخرى`

The action opens the existing qualification application experience in additional-subject mode.

Do not create a second application page if the current page can be reused safely.

## Subject Selection Rules

When starting an additional application:

Exclude subjects where the Teacher already has:

- active approved qualification;
- a non-terminal qualification application.

Handle rejected/revoked subjects according to the proven canonical lifecycle.

Only show:

- active subjects;
- Teacher-selectable subjects;
- subjects with valid qualification topics/tasks;
- subjects supported by current qualification workflow.

If a subject has no valid active qualification task:

- show it as unavailable;
- explain why safely;
- do not allow a broken application.

## Isolation Requirements

Prove:

- applying to Subject B does not overwrite Subject A profile/application data;
- uploaded evidence remains subject-specific;
- Quality decisions affect only the targeted application;
- approved public subjects are derived independently;
- Teacher services for Subject A remain enabled while Subject B is pending/rejected;
- no duplicate applications arise from double-click/concurrency.

==================================================
PART B
APPROVED VIDEO PROFILE CURATION
==================================================

## Phase B1 — Evidence Investigation

Trace all Teacher video sources:

### Qualification Samples

- qualification-created samples;
- trust/source marker;
- approval state;
- subject/topic association;
- immutability;
- public visibility rules.

### Teacher Showcases

- draft/version lifecycle;
- Quality moderation;
- approved version;
- rejected/changes-requested state;
- public visibility;
- legacy row behavior;
- production readiness gates.

### Public Teacher Profile

- current sample query;
- ordering;
- source distinction;
- visible/playable checks;
- sample count;
- media authorization;
- public DTO;
- carousel behavior.

Determine:

1. Whether public visibility is currently inferred automatically.
2. Whether Teachers already have a publication flag.
3. Whether publication is tied directly to approval.
4. Whether ordering exists.
5. Whether qualification samples and Showcases share one entity or separate projections.
6. Whether a Teacher can safely hide an approved item without changing its approval.
7. Whether a hidden approved item remains available for later reactivation.
8. Whether a Teacher can accidentally expose rejected/private versions.
9. Whether profile media limits already exist.
10. Whether adding curation requires schema changes.

Do not conflate:

- Approved
- Publicly selected
- Featured
- Profile order

These are separate concepts.

## Canonical Curation Rule

The Teacher may curate only content that is already eligible and approved.

A Teacher may:

- show or hide an eligible approved Qualification Sample;
- show or hide an approved current Showcase version;
- choose one featured video;
- reorder visible profile videos within approved limits.

A Teacher may NOT:

- publish an unapproved video;
- publish a rejected version;
- publish a changes-requested version;
- publish a superseded Showcase version;
- alter the trust/source label;
- convert a Showcase into a Qualification Sample;
- remove moderation history;
- expose storage keys or permanent public URLs;
- edit immutable qualification evidence through curation.

Approval and moderation remain owned by Quality.

Profile curation is a presentation preference only.

## Recommended Persistence Model

Before adding schema, inspect current entities.

Prefer the smallest typed persistence.

Possible approved shape:

- `IsProfileVisible`
- `ProfileDisplayOrder`
- `IsProfileFeatured`

Add them to the correct existing aggregate only if semantically valid.

If Qualification Samples and Showcases use different entities:

- preserve each domain;
- add equivalent presentation fields to each only if necessary;
- do not create a generic duplicated media table solely for UI ordering.

If a unified cross-source order cannot be represented safely without a small Teacher-profile curation entity, document the exact need before creating it.

Do not use JSON.

Do not encode order in filenames or timestamps.

## Visibility Invariants

A public video is visible only when:

`Teacher selected it for profile`
AND
`content remains approved/eligible`
AND
`Teacher remains publicly eligible`
AND
`subject/qualification remains valid where required`
AND
`media is playable under current environment gates`

Teacher selection can only reduce visibility.

It must never bypass approval eligibility.

If approval is revoked or the qualification becomes invalid:

- the video disappears automatically;
- the Teacher preference may remain stored for possible future restoration only if safe;
- public projection remains fail-closed.

## Featured Video Rules

- At most one featured public video per Teacher.
- Featured must also be visible and eligible.
- Selecting a new featured item atomically replaces the old one.
- Hiding the featured item clears featured state or deterministically promotes the next visible item according to an approved rule.
- If no featured item exists, public Profile uses the first eligible visible item by display order.
- Do not invent ranking based on views or engagement.
- Qualification trust does not automatically force an item to be featured.

## Ordering Rules

Use deterministic integer ordering.

Requirements:

- no duplicate active order positions after save;
- normalize order atomically;
- stable ordering across Qualification Samples and Showcases;
- fallback order deterministic for legacy rows;
- no N+1 public queries;
- bounded maximum visible item count.

Decide the maximum visible videos from current product evidence.

If no rule exists, use a conservative configurable limit such as 6 only after documenting it as a Product Decision.

Do not invent an arbitrary limit silently.

==================================================
TEACHER DASHBOARD UX
==================================================

Add or improve a section:

`Profile Videos`
`فيديوهات البروفايل`

The Teacher sees only their own video assets, grouped clearly:

## Qualification Samples

- Approved
- Hidden from profile
- Visible on profile
- Ineligible/revoked where relevant

## Reviewed Showcases

- Approved
- Hidden from profile
- Visible on profile
- Pending review
- Changes requested
- Rejected

Only approved/eligible items have visibility controls.

Each item should show:

- authenticated preview;
- localized title;
- subject/topic;
- source/trust type;
- moderation/qualification status;
- visible/hidden state;
- featured state;
- order handle or move controls;
- reason when public selection is unavailable.

Teacher actions:

- Show on profile
- Hide from profile
- Set as featured
- Move earlier
- Move later
- Preview

Do not show:

- Publish for rejected content;
- editable trust labels;
- raw storage information;
- Quality-only decisions.

## Interaction Requirements

- optimistic-looking fake success is forbidden;
- save through real API;
- busy guards;
- concurrency handling;
- stable errors;
- keyboard-accessible ordering controls;
- touch-friendly mobile controls;
- no drag-only interaction;
- Arabic/English;
- RTL/LTR;
- light/dark;
- loading/error/empty/success states.

==================================================
PUBLIC PROFILE BEHAVIOR
==================================================

Update public media projection only after Teacher curation persistence is valid.

Public Profile should:

- show only Teacher-selected and currently eligible videos;
- show featured first;
- preserve Qualification vs Reviewed Showcase labels;
- use deterministic order;
- mount one player only;
- preserve authenticated media delivery;
- show an honest no-video state when none are selected;
- not interpret hidden as rejected;
- not leak moderation details publicly.

Browse/Profile `SampleCount` must count only visible, eligible, playable, Teacher-selected items.

Comparison must use the same count rule.

Do not create projection drift.

==================================================
AUTHORIZATION AND SECURITY
==================================================

Verify:

- Teacher may curate only their own media;
- Quality can review but does not impersonate Teacher curation unless an existing Admin override is explicitly approved;
- Student/public cannot mutate curation;
- overposted TeacherId/UserId ignored;
- rejected/private media cannot be selected;
- stale concurrency token rejected;
- storage keys never returned;
- public media remains authorization-safe;
- all mutations are audited using existing audit infrastructure where appropriate.

==================================================
CONCURRENCY
==================================================

For additional qualification:

- prevent duplicate same-subject application under concurrent clicks;
- use existing RowVersion/concurrency conventions;
- return stable conflict errors.

For video curation:

- reorder/feature/show-hide must be atomic;
- stale updates must not silently overwrite newer curation;
- one-featured invariant enforced at database/domain level where practical;
- retries must be idempotent where the same final state is requested.

==================================================
MIGRATION
==================================================

Generate a migration only if persistence changes are genuinely required.

Requirements:

- additive;
- no destructive video changes;
- no approval-state rewrite;
- deterministic legacy visibility mapping;
- no existing public video should disappear accidentally without an explicit compatibility decision;
- no unapproved media becomes public;
- safe rollback documented;
- migration not applied automatically;
- EF pending-model clean after generation.

If legacy approved videos are currently public automatically, decide explicitly whether initial curation backfill is:

A. Preserve current public visibility.
B. Hide until Teacher opts in.

Recommended compatibility:

- preserve current eligible public visibility;
- derive deterministic ordering from existing trusted order/date;
- choose current first eligible video as featured only if a featured field is required;
- do not expose previously private content.

Document this decision.

==================================================
TESTS — ADDITIONAL SUBJECT
==================================================

Add focused tests proving:

1. Approved Teacher may start an application for another eligible subject.
2. Existing approved qualification remains unchanged.
3. Same-subject duplicate non-terminal application rejected.
4. Concurrent duplicate creation produces one application.
5. Already-qualified subject excluded.
6. Pending subject excluded.
7. Inactive subject excluded.
8. Subject without valid task unavailable.
9. Quality decision targets only the new application.
10. Approval adds subject qualification correctly.
11. Rejection does not affect other subjects.
12. Revocation remains subject-specific.
13. Service eligibility updates only for the approved subject.
14. Unauthorized Student denied.
15. Another Teacher cannot access/mutate the application.

==================================================
TESTS — VIDEO CURATION
==================================================

Add focused tests proving:

1. Teacher can show approved Qualification Sample.
2. Teacher can hide approved Qualification Sample.
3. Teacher can show approved current Showcase.
4. Rejected Showcase cannot be selected.
5. Pending Showcase cannot be selected.
6. Superseded version cannot be selected.
7. Revoked qualification sample disappears publicly.
8. Teacher cannot curate another Teacher’s media.
9. At most one featured item.
10. Setting featured item is atomic.
11. Hiding featured item follows approved fallback.
12. Ordering is deterministic.
13. Stale version rejected.
14. Public Profile returns selected eligible media only.
15. Browse/Profile/Comparison sample counts match.
16. No storage key/private moderation fields leak.
17. Legacy eligible media remains visible after migration according to compatibility rule.
18. Empty selected set produces honest public empty state.
19. One-player carousel remains intact.
20. No N+1 query growth with multiple items.

==================================================
BROWSER VALIDATION
==================================================

Use legitimate supported Development workflows.

## Additional Subject Application

Prove:

- Teacher opens My Qualifications;
- existing approved subject visible;
- clicks Apply for another subject;
- selects a different eligible subject;
- receives correct task/topic;
- submits without overwriting current qualification;
- sees independent pending status;
- Quality sees it in the existing queue;
- existing services/profile remain unchanged.

## Video Curation

Prove:

- Teacher sees approved Qualification and Showcase videos;
- pending/rejected items have no visibility action;
- hide removes video from public Profile;
- show restores it;
- set featured moves it first;
- reorder persists after reload;
- public Profile carousel reflects exact selected order;
- Arabic/English labels correct;
- one video state hides navigation;
- zero selected state is honest;
- no console errors.

Viewports:

- 375
- 390
- 768
- 1024
- 1440

Modes:

- Arabic / RTL / Dark
- English / LTR / Light

Also verify keyboard-only controls.

==================================================
DOCUMENTATION
==================================================

Before implementation, create a decision report only if evidence reveals unresolved architecture or business rules.

Implementation report:

`docs/features/TEACHER_GROWTH_AND_PROFILE_CURATION_REPORT.md`

If migration generated:

`docs/database/TEACHER_PROFILE_CURATION_MIGRATION.md`

Update:

- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

Save this official prompt under:

`docs/prompts/TEACHER_GROWTH_AND_PROFILE_CURATION.md`

Document separate completion statuses for:

- Additional Subject Qualification
- Approved Video Profile Curation

Do not claim both complete if only one is implemented.

==================================================
VALIDATION
==================================================

Run:

1. locked restore;
2. focused qualification tests;
3. focused Showcase/qualification-sample tests;
4. marketplace/profile projection tests;
5. authorization tests;
6. concurrency tests;
7. frontend integrity;
8. localization parity;
9. localization usage;
10. JavaScript syntax;
11. Release build;
12. EF pending-model;
13. migration safety if applicable;
14. publish smoke;
15. browser validation;
16. `git diff --check`.

Do not hide unrelated failures.

==================================================
RESPONSE FORMAT
==================================================

Return exactly:

=========================================
TEACHER GROWTH & PROFILE CURATION
=========================================

## Findings

## Additional Subject Qualification

## Video Curation

## Root Cause

## Architecture

## Domain and API

## Teacher Dashboard UX

## Public Profile Behavior

## Authorization and Security

## Migration

## Browser Validation

## Tests

## Files Changed

## Remaining Limitations

## Risks

## Next Step

Then include:

Additional Subject Application:
Video Profile Curation:
Backend:
Frontend:
Database:
Tests:
Browser:
Documentation:

Final Verdict — choose exactly one:

- TEACHER GROWTH AND PROFILE CURATION IMPLEMENTED AND VERIFIED
- TEACHER GROWTH AND PROFILE CURATION IMPLEMENTED BUT CONDITIONALLY VERIFIED
- ADDITIONAL SUBJECT IMPLEMENTED — VIDEO CURATION DEFERRED
- VIDEO CURATION IMPLEMENTED — ADDITIONAL SUBJECT DEFERRED
- TEACHER GROWTH AND PROFILE CURATION PARTIALLY IMPLEMENTED
- TEACHER GROWTH AND PROFILE CURATION BLOCKED

Do not change canonical qualification approval or media moderation rules merely to make the UI easier.
