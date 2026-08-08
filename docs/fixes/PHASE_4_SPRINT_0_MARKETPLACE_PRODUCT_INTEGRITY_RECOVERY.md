# Phase 4 — Marketplace Scale — Sprint 0 — Marketplace Product Integrity Recovery

Date: 2026-08-07
Prompt: [PHASE_4_SPRINT_0_MARKETPLACE_PRODUCT_INTEGRITY_RECOVERY.md](../prompts/PHASE_4_SPRINT_0_MARKETPLACE_PRODUCT_INTEGRITY_RECOVERY.md)
Reconciled against: [Release 3 Retrospective & Backlog](../reports/RELEASE_3_RETROSPECTIVE_AND_BACKLOG.md), [ADR-012 Teacher Growth & Profile Curation](../decisions/ADR-012-TEACHER-GROWTH-AND-PROFILE-CURATION.md), [Teacher Growth & Profile Curation report](../features/TEACHER_GROWTH_AND_PROFILE_CURATION_REPORT.md), [ADR-011 Showcase Production Media](../decisions/ADR-011-TEACHER-SHOWCASE-PRODUCTION-MEDIA.md), [Teacher Profile Curation Migration](../database/TEACHER_PROFILE_CURATION_MIGRATION.md), [PROJECT_STATUS.md](../PROJECT_STATUS.md).

No commits, pushes, or deployments were made. No business rule, qualification-approval rule, payment logic, or moderation rule was weakened or redesigned. No parallel qualification/service/portfolio/media/moderation domain was created.

## Findings

1. Docs said the ADR-012 "Teacher Growth" slice (multi-subject qualification precedence, My Qualifications dashboard, Profile Video Curation) was already implemented but only "conditionally verified," with its migration "generated, not applied." Ground truth in the real Development database (see Environment finding below) shows the migration **is already applied** and the code-level fix is already committed and correct — the doc status was stale, not the code.
2. **Environment drift (real finding, not part of the original 10 tracks):** the committed `src/Tafseel.Api/appsettings.json` connection string (`Server=(localdb)\mssqllocaldb;Database=Tafseel`) points at a database that has never been created on this machine. The actual, populated Development database (71 tables, real UAT users/orders/reviews, `__EFMigrationsHistory` already at `20260802083847_TeacherProfileVideoCuration`) lives on a separate, unregistered named LocalDB instance, `(localdb)\TafseelLocal`, matching the "explicit `TafseelLocalDb` connection" mentioned in the Final Staging Certification report. Classification: **Deployment/Environment Issue**, pre-existing, not introduced by this sprint. Not fixed in this sprint (out of the 10 in-scope tracks and risky to change unilaterally); flagged here for a dedicated follow-up decision (either repoint `appsettings.json` at `TafseelLocal`, or migrate the real data onto the default instance).
3. A real, previously undocumented defect was found live in the browser and fixed: the Teacher Profile sidebar service selector let a Student select **any** listed service card (`onSelect: () => this.setState({ serviceId: sv.id })`), including one that supports neither "Request" nor "Book" — and the "No services available" note was gated on `!canRequest && !canBook` (`heroCtaHidden`) rather than on the service list actually being empty. This is exactly Track E's described contradiction.
4. F-013, as literally described (two parallel implementations of the *same* rating action, one leaking an unresolved `{{ reviewTeacherAvatar }}` binding), is **not reproducible in the current committed source**. `reviewModal` (approve/request-revision on a delivery) and `rateModal` (5-criteria star rating submission) are two legitimately different actions on two different order states, both dispatched from one canonical `orderActionRender()`/`applyPendingDeepLink()` path, and both avatar bindings have had an unconditional `Tafseel.defaultAvatar` fallback since the same original commit (confirmed via `git log -p --follow`, no history of a missing-fallback version). Classification: **Test/Documentation Issue** — `PROJECT_STATUS.md` still lists F-013 "Open"; the code does not show the described defect.
5. During live verification, a transient, pre-existing, out-of-scope console warning was observed on Teacher Profile: `<path> attribute d: Expected moveto path command, "{{ sv.iconPath }…"`. This is the DC framework's `hint-placeholder-count="5"` skeleton-loading mechanism briefly rendering an unresolved binding into a decorative SVG icon before data loads, self-corrects once `services` populates, and was not introduced by this sprint (the code path is untouched). Recorded as a **Known Risk**, not fixed (not one of the 10 in-scope tracks, and the new `check-template-placeholder-leak.mjs` gate deliberately scopes to `src`/`href` — the class of binding that actually reaches the network — not every decorative attribute).

## Classification

| Track | Classification |
|---|---|
| A — Multi-subject qualification / dashboard routing | Already fixed in committed code (ADR-012); doc status stale |
| B — My Qualifications dashboard UX | Already implemented (ADR-012); verified present, not rebuilt |
| C — Approved video profile curation | Already implemented (ADR-012); migration confirmed applied to the real dev DB |
| D — Teaching media stream-only | UI/View Issue + API Mismatch (missing `Content-Disposition`, missing `controlsList`) — Fixed |
| E — Profile service-state contradiction | Production Bug — Fixed |
| F — Default selected service | Already correct (existing precedence logic); verified |
| G — Price/CTA hierarchy | UI/View Issue — Fixed (light touch) |
| H — Browse Teachers card UX | UI/View Issue — Fixed (light touch, no redesign) |
| I — F-013 duplicate rating modal | Test/Documentation Issue — not reproducible in current source; regression gate added |

## Multi-Subject Qualification

Traced end-to-end per the prompt's required path (login → onboarding-status → dashboard → qualifications matrix → marketplace eligibility → Browse). Root-cause guard already exists and is committed, unmodified by this sprint:

- `src/Tafseel.Infrastructure/TeacherApplications/TeacherApplicationService.cs:500-554` — `GetOnboardingStatusAsync` computes `approvedSubjectIds` from `TeacherSubjectQualifications` (Status == Approved && RevokedAt == null) **independently** of the single latest `TeacherApplication` row, and returns the Dashboard as `nextUrl` whenever `approvedSubjectIds.Length > 0`, regardless of a newer pending/draft application for a different subject. The application-status branch only runs when there are zero approved qualifications.
- `src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs` and `TeacherPublicQueries.cs` scope all Browse/public/request eligibility to `TeacherSubjectQualifications` filtered by the specific `SubjectId` of the service in question — never to "latest application" or "any pending application." Subject B pending never touches Subject A's eligibility.
- `GET /api/v1/teachers/me/qualifications` (`TeacherApplicationsController.cs:35-37`) is live and actively consumed by the Teacher Dashboard's My Qualifications section — not dead/duplicate logic.

No code change was needed or made for Track A. Live browser re-verification of the exact two-subject (one approved, one pending) scenario was **not performed** — the Development database currently has no teacher fixture with two subject-qualification rows to exercise this live (see Test Matrix below).

## Teacher Dashboard Routing

Covered by Track A above — routing decision is centralized in the single `onboarding-status` endpoint; no separate ad hoc frontend gate found.

## Teacher Marketplace Availability

Per-subject/per-service eligibility confirmed scoped correctly (Track A). No change made.

## Profile Video Curation

Confirmed already implemented per ADR-012: `IsProfileVisible` / `ProfileDisplayOrder` / `IsProfileFeatured` on `TeacherTeachingSample`; Teacher Dashboard **Profile Videos / فيديوهات البروفايل** section with show/hide/feature/reorder; public projection AND-gated on Teacher selection + approval eligibility + max-visible bound (`TeacherShowcases:MaxPublicPerTeacher`). The migration `20260802083847_TeacherProfileVideoCuration` is confirmed **applied** to the real Development database (see Migration section). No new portfolio subsystem was created. No code change was needed for this track.

## Teaching Media Protection

Scope: Qualification Samples and Reviewed Showcases only (`/api/v1/teachers/samples/{id}/content`, `/api/v1/teachers/me/showcases/{id}/versions/{versionId}/content`). Order delivery (`/api/v1/orders/deliveries/{id}/content`) and Learning Request attachments remain on separate controllers/routes and were not touched.

Fixed:
- `src/Tafseel.Api/Controllers/MarketplaceController.cs` — both content endpoints now explicitly set `Response.Headers.ContentDisposition = "inline"` (previously omitted `fileDownloadName`, which is implicit-inline but not explicit; now explicit per the prompt's D2 requirement). Range requests were already supported (`enableRangeProcessing: true`) and remain so — confirmed live via `206 Partial Content` + `Content-Range` header.
- `Tafseel-Teacher-Profile.dc.html` — the public featured-sample `<video>` element: removed `data-download-allowed="true"` (set to `false`), added `controlsList="nodownload noremoteplayback"`, `disablePictureInPicture`, and `oncontextmenu="return false"` (UX deterrence only). Native play/pause/seek/volume/fullscreen controls preserved.
- The Quality Dashboard's showcase/qualification preview videos (`Tafseel-Quality-Dashboard.dc.html`) were deliberately **not** touched — that is Quality Reviewer moderation tooling, not the public/profile Student-facing surface this track scopes to.

Explicitly documented per D4: this is authenticated/controlled stream-only delivery with no ordinary download UX and no permanent public media URL. It does **not** prevent screen recording, browser DevTools network extraction, or a compromised client, and no DRM was introduced.

## Teacher Profile Service State

Root cause found and fixed in `Tafseel-Teacher-Profile.dc.html`: `heroCtaHidden` (which gates both the mobile identity-card note and the sidebar "No services available" note) was computed as `!canRequest && !canBook` — true whenever the **selected** service had no actionable CTA, even while that service was fully populated and visibly selected in the card list below. Changed to `heroCtaHidden: services.length === 0` (Track E3's exact requirement: render the no-services note only when the canonical selectable service count is zero). `selectedService` (`selected`), the price/delivery/revisions facts, and the CTA button all continue to derive from the single `selected` object computed once per render (`services.find(x => x.id === s.serviceId)`) — already a single source of truth; no parallel booleans were introduced.

Live-verified on a real published teacher with one service (`uat.teacher.20260802@example.com`): selected card, sidebar price (`SAR 100.00`), delivery, revisions, and "Request this service" CTA all rendered synchronized with no contradictory "No services available" text.

## Default Service Selection

Existing precedence (`Tafseel-Teacher-Profile.dc.html:334-336`) was already correct and was not changed: first `canRequest`-eligible service, else first live-bookable service, else none selected. No explicit-service query-param route exists on this page today (not previously supported), so tier 1 of the prompt's precedence (F1) does not apply here; documented rather than invented. Initial render is synchronous from `renderVals()` (no separate loading flash for the sidebar once `status: 'ready'`).

## Teacher Profile Conversion UX

Light-touch price emphasis: Browse Teachers card price bumped from `font-weight:700;font-size:16px` to `font-weight:800;font-size:18px` (Track G/H2). Teacher Profile sidebar price was already large or larger (34px bold via `css/tafseel.css:2100`, confirmed via prior Sprint 2 polish) — not touched further, since it was not actually visually weak; the real defect there was the contradictory empty-state text now fixed under Track E. CTA wording was already conditional single-choice (`Request this service` vs `Book session`, never both) — no change needed.

## Browse Teachers UX

Refined, not redesigned, per H1/H2/H3:
- The "No live sessions" availability block is no longer a fixed 42px filled box regardless of content — it now renders as a full `background:var(--surface-2)` box **only** when a teacher has real availability data (`hasAvailability`), and as compact, muted inline text with no background/border when there is none, de-emphasizing the negative case without hiding it.
- Price bumped from 16px/700 to 18px/800 for stronger commercial prominence.
- The Compare checkbox now sits directly under a `border-top` divider immediately below the price/CTA footer row with tighter spacing, reading as an attached secondary row instead of a floating, detached label.
- Card click targets (Profile link, Request link, Compare checkbox, Favorite button) were not restructured — no new nested-click risk introduced.

Full skeleton-loading, footer-restructure, and mobile-touch-target re-audit (H5) were **not** independently re-verified this sprint (out of the time available); the existing card already used 38–40px tap targets from prior sprints.

## F-013 Rating Modal

See Findings #4. No code change to `Tafseel-Student-Dashboard.dc.html` was made because no duplicate-implementation defect was found in current source to consolidate. Instead:

- Added `scripts/ci/check-template-placeholder-leak.mjs`, a permanent static regression gate (per I2's explicit requirement) that scans every production consumer-facing `.dc.html` surface for `src="{{ x }}"` / `href="{{ x }}"` bindings that have no producing key anywhere in that file's render script — the exact structural class of defect that let `{{ reviewTeacherAvatar }}` leak as a literal 404'd request. It passes today (9 surfaces scanned) and will fail CI if this class of regression is ever reintroduced.
- Recommend `PROJECT_STATUS.md`'s F-013 entry be updated from "Open" to "Not reproducible in current source; regression gate added" rather than left silently stale (done in this pass — see Documentation).

## Security

Spot-checked, not exhaustively re-audited this sprint:
- Sample/Showcase content endpoints unchanged in authorization shape (`OpenSampleAsync`/`OpenShowcaseVersionAsync` still gate visibility server-side); only response headers were added.
- Profile video curation mutation endpoints (`PUT .../profile-videos/{id}/visibility|featured`, `PUT .../profile-videos/order`) were not modified and were already scoped to `Permissions.TeachersManageOwnProfile`-style owner-only policies per the existing ADR-012 implementation — not re-verified line-by-line this session.
- No role was broadened; no new endpoint was added.

## Migration

No new migration was generated. The only relevant pending migration (`20260802083847_TeacherProfileVideoCuration`) was found **already applied** to the real Development database (`(localdb)\TafseelLocal;Database=Tafseel`) — confirmed via `__EFMigrationsHistory` and by querying `TeacherTeachingSamples` for the three curation columns, all present. The 19-migration "Pending" list `dotnet ef migrations list` initially reported was against the connection string actually committed in `appsettings.json`, which points at a database that has never been created on this machine (see Findings #2) — not a real pending-migration backlog against the database this project has actually been using. No migration was applied or generated in this session; nothing was applied to Staging or Production.

## Browser Validation

Performed, at a single viewport/theme (desktop, light, English) against the real Development database via a session-scoped connection override (`(localdb)\TafseelLocal`, not committed to any file):

- Teacher Profile (published teacher, one service): selected card/sidebar/price/CTA synchronized, no "No services available" contradiction — Track E confirmed fixed live.
- Teacher Profile (published teacher with a visible teaching sample): video element confirmed `controlsList="nodownload noremoteplayback"`, `download` attribute absent, network trace confirmed `206 Partial Content` + `Content-Disposition: inline` + working Range seek — Track D confirmed fixed live.
- `/health/live` and `/health/ready` both returned `200`.

**Not performed** in this session (explicitly recorded, not silently skipped): the full 375–1440px × Arabic/English × light/dark matrix; the Teacher login → My Qualifications → Apply-for-another-subject → Dashboard-return flow (no two-subject fixture exists in Development to exercise it); the Rate flow end-to-end submit; Browse Teachers card visual re-screenshot; mobile viewport re-check of the Sprint 2.1 CTA-clearance invariant against this sprint's `heroCtaHidden` semantics change (static regression check updated and passing, but not re-confirmed with live `elementFromPoint()` measurement).

## Tests

- `dotnet build -c Release`: succeeded, 0 errors, 2 pre-existing known-good nullable warnings (unrelated to this sprint).
- Domain: 89 passed. Application: 5 passed. Architecture: 1 passed.
- `check-frontend-integrity.mjs`: 13 entry points passed.
- `check-localization.mjs`: 12 entry points, 2,960 paired keys passed.
- `check-localization-usage.mjs`: passed.
- `check-bug001-display-names.mjs`: passed.
- `check-teacher-profile-mobile-cta.mjs`: updated (Track E changed `heroCtaHidden`'s semantics on purpose; the old assertion encoded the pre-fix contradiction as a false "invariant") and passing.
- `check-js.mjs`, `check-service-catalog-release1.mjs`, `check-guided-request.mjs`, `check-auth-ui.mjs`, `check-sprint6-notification-routing.mjs`: all passing (unchanged).
- New `check-template-placeholder-leak.mjs`: passing (9 surfaces).
- `node --check js/tafseel.js`, `node --check js/locales.js`: passed.
- `git diff --check`: clean (only line-ending advisory warnings, no conflict markers/trailing whitespace errors).
- **Not run this sprint** (time budget): the full SqlServer provider-neutral integration suite (104+ tests), EF `has-pending-model-changes` check, publish smoke.

## Files Changed

- `Tafseel-Teacher-Profile.dc.html` — Track E fix (`heroCtaHidden`), Track D video hardening.
- `Tafseel-Browse-Teachers.dc.html` — Track H card refinement (availability box, price weight, compare-checkbox attachment).
- `src/Tafseel.Api/Controllers/MarketplaceController.cs` — Track D explicit `Content-Disposition: inline` on the two teaching-media content endpoints.
- `scripts/ci/check-teacher-profile-mobile-cta.mjs` — updated assertion to match the intentional Track E semantics change.
- `scripts/ci/check-template-placeholder-leak.mjs` — new, Track I regression gate.
- `docs/prompts/PHASE_4_SPRINT_0_MARKETPLACE_PRODUCT_INTEGRITY_RECOVERY.md` — new, this sprint's saved prompt.
- `docs/fixes/PHASE_4_SPRINT_0_MARKETPLACE_PRODUCT_INTEGRITY_RECOVERY.md` — new, this report.
- `docs/INDEX.md`, `docs/PROJECT_STATUS.md` — updated.

## Remaining Limitations

1. Full responsive/locale browser matrix (375–1440px × AR/EN × light/dark) not run this sprint.
2. No two-subject (one approved, one pending) Teacher fixture exists in Development to live-verify Track A's login/dashboard behavior end-to-end; verification rests on code-path tracing plus existing integration tests, not a fresh live drive.
3. Rating flow (`rateModal` submit, duplicate-review prevention) not re-driven live this sprint.
4. Full SqlServer integration suite (104+ tests) not run this sprint.
5. The `appsettings.json` vs. real-`TafseelLocal`-instance connection-string drift (Findings #2) is unresolved — flagged, not fixed, since fixing it was outside this sprint's 10 tracks and risks affecting other in-flight local work.
6. The pre-existing `{{ sv.iconPath }}` skeleton-placeholder console warning (Findings #5) is unresolved — out of scope, cosmetic, self-corrects.
7. Track K (Security) was spot-checked, not exhaustively re-audited.

## Risks

1. **Medium** — the `appsettings.json` connection-string drift means any contributor who runs `dotnet ef database update` or a fresh `dotnet run` against the *committed* configuration will silently create and operate against an empty, different database from the one containing real Development/UAT data, unless they know to override it. Recommend a dedicated follow-up to resolve which instance is canonical and fix the committed config to match.
2. **Low** — `heroCtaHidden`'s new semantics (zero services, not zero-CTA) means a teacher with a service that is neither requestable nor bookable now shows no bottom bar and no note on mobile, rather than a (previously misleading) "No services available" note. This is more honest but was not re-verified against Sprint 2.1's live geometry measurement.
3. **Low** — F-013 being closed as "not reproducible" rather than "fixed" relies on static source inspection plus `git log`; it does not rule out a runtime-only race condition that static analysis cannot see. The new placeholder-leak gate mitigates future recurrence but does not retroactively prove Sprint 8's exact live observation was this same code path.

## Next Step

1. Decide and fix the `appsettings.json`/`TafseelLocal` connection-string drift (Findings #2) as its own small Environment/DevEx pass.
2. Seed (or construct via domain constructors, as prior sprints have done with explicit approval) a two-subject Teacher fixture in Development to close Track A's live-verification gap.
3. Run the full responsive/locale matrix and the SqlServer integration suite in a follow-up pass before calling Sprint 0 fully closed.
4. Proceed to Phase 4 Marketplace Scale feature work only after items 1–3 above are closed, consistent with this sprint's own "product integrity before feature work" mandate.

Multi-Subject Qualification: Already correct in code; live two-subject re-verification pending
Dashboard Routing: Already correct in code
Teacher Availability: Already correct in code
Video Curation: Already implemented; migration confirmed applied
Media Protection: Fixed and browser-verified
Default Service: Already correct
Teacher Profile UX: Fixed (Track E contradiction) and browser-verified; Track G light-touch
Browse UX: Refined (light touch); not re-screenshotted
F-013: Not reproducible in current source; regression gate added
Backend: Builds clean; Domain/Application/Architecture suites pass; SqlServer suite not run
Frontend: All frontend/localization/regression CI gates pass, including new placeholder-leak gate
Database: Migration already applied to real dev DB; connection-string drift flagged, not fixed
Tests: Domain 89, Application 5, Architecture 1 passed; SqlServer suite deferred
Browser: Partial — Track D and Track E confirmed live; full matrix deferred
Documentation: This report, prompt, INDEX.md, and PROJECT_STATUS.md updated

Final Verdict: **MARKETPLACE PRODUCT INTEGRITY CONDITIONALLY VERIFIED**

✅ Finished Phase 4 — Sprint 0
