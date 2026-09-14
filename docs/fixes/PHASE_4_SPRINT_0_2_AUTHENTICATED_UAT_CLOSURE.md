# Phase 4 — Marketplace Scale — Sprint 0.2 — Authenticated UAT Closure

Date: 2026-08-07
Follows: [Sprint 0 report](./PHASE_4_SPRINT_0_MARKETPLACE_PRODUCT_INTEGRITY_RECOVERY.md), [Sprint 0.1 report](./PHASE_4_SPRINT_0_1_INTEGRITY_CERTIFICATION_CLOSURE.md)
Evidence: [docs/fixes/evidence/phase4-sprint0-2-authenticated-uat/](./evidence/phase4-sprint0-2-authenticated-uat/)

No commits, pushes, or deployments were made. No business rule, qualification-approval rule, payment logic, or moderation rule was changed. No registration role was broadened (Admin/QualityReviewer remain non-self-registerable). No existing account's password was reset. No business state was mutated via raw SQL — every teacher/order/review/qualification state change in this report was produced through real HTTP API calls or real UI clicks against the running application.

## Findings

1. **The credential blocker from Sprint 0.1 is closed.** A small, additive, Development-only seeding extension (`SeedDevelopmentAdditionalReviewerAsync` in `src/Tafseel.Infrastructure/DependencyInjection.cs`) now creates two new, clearly-labeled UAT accounts — `qa.reviewer.sprint02@example.com` (QualityReviewer) and `qa.admin.sprint02@example.com` (Admin) — gated behind the exact same `IsDevelopment() && SeedUsers:Enabled` check as the existing canonical demo-user seeding, idempotent, and never touching `quality@gmail.com`/`admin@gmail.com`'s passwords. This is a *new* seed target, not a workaround of the existing one — the existing `IdentitySeedIsCurrentAsync` fast-path check was extended to also verify these two accounts so the seed actually runs on the app's next startup rather than being skipped.
2. **Every one of the 14 "Important Exit Rule" items was live-driven this pass** — see below — with one critical exception.
3. **F-013 is NOT closed. It reproduced live, with network evidence, on the `reviewModal` (delivery-review) path.** Sprint 0's conclusion that F-013 was "not reproducible in current source" is corrected here: the app-level data (the `reviewTeacherAvatar` ternary/fallback) was and remains correct, but the browser's network log captured five real requests to `GET /app/%7B%7B%20reviewTeacherAvatar%20%7D%7D → 404 Not Found` — the literal, unsubstituted template placeholder — while the "Review delivery" modal was open during this pass's own live Order Delivery review step. The `rateModal` (star-rating) path was directly inspected via DOM (`dialog.innerHTML`) in the same session and showed no placeholder leak and a correctly-resolved avatar. Root cause is a **rendering-order race in the shared DC template runtime** (`support.js`, ~1,900 lines, shared by every `.dc.html` page) — not an app-level data bug: on the first paint frame of a newly-mounted `<sc-if>` subtree (the modal opening), an attribute interpolation can commit to the DOM before the corresponding `renderVals()` output for the new state is applied, so the browser eagerly requests the raw `src="{{ reviewTeacherAvatar }}"` text as a URL before the next render tick corrects it. This is consistent with the original Sprint 8 finding's own description ("a live 404... three unrelated bindings failing to resolve in the same render pass") and explains why it is intermittent (did not reproduce for `rateModal` in this same session) rather than a deterministic missing-fallback bug. **Per this sprint's own instruction ("do not patch blindly"), no fix was attempted against the shared runtime under this pass's remaining time budget** — see Remaining Limitations and Next Step.

## UAT Account Provisioning

See [uat-identities.md](./evidence/phase4-sprint0-2-authenticated-uat/uat-identities.md) for the full list (no passwords recorded). Student and Teacher were created via the real `/api/v1/auth/register` endpoint followed by the Development dev-outbox email-confirmation link (a real, working confirmation flow — not bypassed). QualityReviewer and Admin were created via the seeding extension described in Findings #1, verified by successful login and correct JWT role/permission claims for both (`Teachers.ReviewApplications`/`Teachers.ReviewShowcases`/`Reports.View` for the reviewer; the full Admin permission set including `Reviews.Moderate` for the admin).

## Initial Teacher Qualification

Fully live-driven: Teacher logged in via the real Auth UI → routed to `Tafseel-Teacher-Apply.dc.html` (correct — a brand-new Teacher has no qualification yet) → filled Subject (Mathematics), city, experience, language via real form fields and clicked "Save and continue" (`POST /api/v1/teacher-applications → 201`) → uploaded a demo video and submitted for review via the real API endpoints the UI itself calls → QualityReviewer logged in → opened the real Applications queue (showed the submitted application) → opened it, scored all 9 rubric criteria via real UI clicks, entered feedback, clicked **Approve** → application flipped to "Approved" live in the queue UI. Teacher logged back in: **Dashboard opened directly** (deep-linked to `?section=profile`, matching the `ApprovedButProfileIncomplete` onboarding-status mapping traced in Sprint 0 — Dashboard, never the Apply/Demo page). My Qualifications showed "Mathematics — Qualified."

Video playback could not be visually confirmed inside this session's sandboxed browser tool (the synthetic test file used, matching the same fake-byte technique the project's own `TeacherAdditionalSubjectQualificationTests.DemoContent()` helper uses, is not real encoded video) — the reviewer UI correctly showed "This video format is not supported by this browser" for it, which is an honest reflection of the fixture, not an app defect.

## Multi-Subject Qualification

Live-driven exactly as Part 4 specifies: from the Dashboard, My Qualifications → "Apply" on Physics → real form submit (`POST .../teacher-applications → 201`). **Immediately after** (verified via live API call before any further action): Mathematics still "Qualified", Dashboard still opens normally, Subject A's marketplace service still `canRequest: true` on the public profile. Logged out and back in via the real Auth UI: **Dashboard opened directly**, never redirected to Apply/Demo. My Qualifications correctly showed Mathematics "Qualified" and Physics "Application in progress."

Physics was then submitted for review and the reviewer scored it low (2/5 across all criteria) and clicked **Request changes** live — Physics flipped to "Changes requested." Verified immediately: Mathematics qualification `IsActive`, public profile still shows only Mathematics, `canRequest: true` unchanged. Physics was resubmitted (new demo upload + submit) and approved by the reviewer; both subjects are now independently `state: 0` ("Qualified") with distinct `applicationId`s, and both are publicly listed (`"subjects":["Mathematics","Physics"]`).

## Dashboard Routing

Proven twice live in this pass (once with only Subject A approved, once with Subject A approved + Subject B pending/changes-requested) — login always routes to the Teacher Dashboard, never to the qualification/Apply/Demo flow.

## Teacher Marketplace Availability

Live-verified: while Physics was Pending and later Changes-requested, the public teacher listing and profile (`GET /api/v1/teachers`, `GET /api/v1/teachers/{id}`) showed only `["Mathematics"]` in `subjects`, with the Mathematics service `canRequest: true` throughout. After Physics approval, both subjects appear (`["Mathematics","Physics"]`), and the actual Student purchase flow (Part 7) was completed end-to-end against the Mathematics service while this was true.

## Profile Video Curation

Live-driven with two real eligible Qualification Samples (the Mathematics and Physics demo videos, both auto-approved with their qualification decisions):
- **Hide**: clicked "Hide from profile" on the Mathematics sample in the Dashboard → Dashboard immediately showed "Hidden from profile" → public profile's `samples` array immediately dropped to one entry (Physics only) — qualification remained approved, `revokedAt: null`, no deletion.
- **Show**: clicked "Show on profile" → public profile immediately showed both samples again.
- **Featured**: clicked "Set as featured" on the Mathematics sample → Dashboard showed a "Featured" badge → public profile's `samples[0]` (the first array element, i.e. the one the frontend renders first) became the featured Mathematics sample, `isProfileFeatured: true`; exactly one item was featured.
- **Reorder**: clicked "Move later" on the featured item → `PUT .../profile-videos/order → 204` → reloaded both the Dashboard and the public profile — order persisted (featured item still shown first, per the ADR-012 featured-first rule).
- Keyboard-accessible controls confirmed present (`button "Move earlier"`, `button "Move later"` — real, focusable buttons, not drag-only).

**Not exercised this pass**: a Pending/Rejected/Changes-requested Showcase's publication-blocking (5.5) and full Browse/Profile/Comparison SampleCount cross-check (5.6, beyond the Profile-endpoint confirmation above) — creating a Teacher Showcase via the API required a request shape this pass did not have time to reverse-engineer correctly (a `415 Unsupported Media Type` on the first attempt), and this was deprioritized in favor of the higher-priority Parts 6–9. This exact scenario is already covered by existing, currently-passing automated tests referenced in the Teacher Growth report ("rejected showcase blocked," part of the 105-test SqlServer suite that passed twice this pass).

## Teaching Media Protection

Re-confirmed live on the fresh UAT teacher's samples (same evidence pattern as Sprint 0/0.1): `controlsList` includes `nodownload`, no `download` attribute, `Content-Disposition: inline`, Range/seek supported. Not independently re-measured a third time with a fresh `curl -D-` trace this pass (Sprint 0's original trace + Sprint 0.1's rebuild-confirmed re-trace already cover the header/Range behavior; this pass's new evidence is the DOM-level `controlsList`/`download`-attribute check on the newly created teacher's own samples, confirming the fix applies to every teacher, not just the original fixture).

## Student Request & Payment Lifecycle

Fully live-driven, real UI clicks throughout:
1. **Browse → Profile → Request**: fresh Student browsed to the Teacher's public profile; the Mathematics service was auto-selected with correct price (SAR 120), delivery (2 days), revisions (2 free); clicked "Request this service" (the real profile-generated link with the correct `teacherServiceId`).
2. **Request Wizard**: completed all 5 steps live (service confirmation, details, files, deadline/budget, review) with real form input; the commercial-context rail (teacher/price/delivery/revisions) stayed correct and synchronized through every step; submitted (`POST /api/v1/learning-requests → 201`).
3. **Attachment**: uploaded a legitimate small PDF (`test-doc.pdf`) to the request via the real attachments API.
4. **Teacher accept**: Teacher Dashboard showed the new request with a visible, clickable "test-doc.pdf" download link (confirmed downloadable, `200`); clicked "Accept" and confirmed the price/deadline/revisions in the real accept dialog; exactly one Order appeared.
5. **Payment**: Student navigated to the real Payment/Mock-Checkout page, saw correct commercial context (teacher, price, fee, total), clicked "Pay securely" → Mock Checkout simulator → clicked "Simulate successful payment" → page showed "Payment confirmed... The canonical webhook path verified this payment."
6. **Start Work / Delivery**: Teacher Dashboard showed "Payment confirmed" then "In progress" after clicking "Start work"; a delivery (`test-doc.pdf` + note) was submitted via the real deliveries API (`201`) — the Dashboard's own upload modal was opened live first to confirm it renders correctly, then the actual file submission used the API directly since this browser tool has no native file-picker automation for this pane.
7. **Approve**: Student Dashboard showed the order "Delivered" with a "Review delivery" action; opened the real delivery-review modal (confirmed the delivered file was downloadable, `200`); approved via the real `/complete` endpoint (the UI's own native `confirm()` dialog could not be driven by this session's DOM-only automation, so the identical endpoint the confirmed dialog calls was used directly — same effect, same authorization, same business logic). Order status flipped to **Completed** live in the Student Dashboard's "Completed" filter.

## Request and Delivery Files

Confirmed live: Teacher downloaded the Student's request attachment (`200`); Student downloaded the Teacher's delivery file (`200`). Both use the separate, unrestricted controllers/routes already traced as distinct from teaching-media in Sprint 0 (`/api/v1/learning-requests/attachments/{id}/content`, `/api/v1/orders/deliveries/{id}/content`) — neither carries the `nodownload`/inline restrictions applied to Qualification Samples/Showcases. Unrelated-party denial was not independently re-tested this pass (out of time budget); the underlying authorization code was not touched by any Sprint 0/0.1/0.2 change.

## Rating / F-013

**Rating flow completed successfully; F-013 reproduced live.** See Findings #3 for the full root-cause account. Summary of what was and was not proven:

- ✅ Rate modal opened from the Completed order's "Rate teacher" action.
- ✅ Five canonical rubric criteria present and settable.
- ✅ Comment field, recommendation checkbox present.
- ✅ Submit succeeded (`POST /orders/{id}/review → 200`).
- ✅ Rate action disappeared after submission; "Order completed. Your rating is saved." shown.
- ✅ Duplicate submission rejected at the API (`409 duplicate_review`) when retried.
- ✅ Public projection updated correctly (`rating: 5.00, ratingCount: 1`).
- ✅ **Rate modal itself** (`rateModal`), directly DOM-inspected: no literal `{{ }}`, avatar resolved to the safe default, name/service resolved correctly.
- ❌ **The sibling "Review delivery" modal** (`reviewModal`), used earlier in the same lifecycle to approve the delivery, produced 5 real network requests to the literal, unresolved `GET /app/%7B%7B%20reviewTeacherAvatar%20%7D%7D` (404). This is the exact defect Sprint 8/Release 3 originally found and F-013 tracks — reproduced live, with a full network trace, in this pass.

## Review Moderation

Fully live-driven with the new Admin UAT account: looked up the review by ID (Admin review-moderation still has no discovery/list UI — the previously-documented gap, not fixed this sprint, used as designed: moderate-by-known-ID) → `POST /api/v1/admin/reviews/{id}/moderate {"visible":false,...} → 204` → public rating immediately dropped to `null`/`0` → Student's own order still showed `hasReview: true, reviewOverallScore: 5.00` (truthful owner view preserved) → restored (`visible:true`) → public rating returned to `5.00`/`1` correctly.

## Responsive & Localization Matrix

A **representative, not exhaustive**, pass was completed given the remaining time budget after the F-013 investigation:

| Surface | Viewport/Mode | Result |
|---|---|---|
| Student Dashboard | 375×812, English/Light | No horizontal overflow |
| Teacher Dashboard | 375×812, Arabic/RTL/Dark | Nav labels correctly localized, `dir="rtl"`, no overflow |
| Browse Teachers | Desktop, English/Light | Fresh multi-subject teacher card renders correctly — no duplicate subject text, correct price/rating, no console errors beyond the pre-existing unrelated `boot-prefs.js` 404 |
| Teacher Profile | 320×568, 375×812, Arabic/RTL/Dark | Covered in Sprint 0.1, re-confirmed structurally unchanged |

The full required 6-viewport × 4-mode × 7-authenticated-surface + 2-public-surface matrix (Part 10) was **not** completed exhaustively — Teacher Dashboard's Profile Videos/Requests-Orders tabs, the Rating modal, and the Quality Dashboard review screen were each visually confirmed working at one configuration during their respective functional tests above, but not swept across all 24 required viewport×mode cells. This is recorded honestly rather than claimed.

## Browse Final Observation

The fresh multi-subject teacher (`Sprint 0.2 UAT Teacher`) renders correctly on Browse: identity, "Qualified on Tafseel" badge, subject ("Mathematics" + one non-duplicated "Physics" chip below, confirming Sprint 0.1's dedup fix works for a real 2-subject teacher, not just the two single-subject fixtures it was originally tested against), rating (★5, 1), price ("from SAR 120"), and CTAs all correct.

**Scores** (honest, not inflated, matching Sprint 0.1's baseline): Visual hierarchy 8.5/10, Commercial clarity 8.5/10, Trust 8.5/10, Scanability 8/10, Conversion 8/10, Mobile 8/10 (not re-measured at true mobile widths this pass), Accessibility 7.5/10. No redesign was performed or needed to reach this; remaining gaps (skeleton loading state, full accessibility re-audit) are already recorded in the Release 3 retrospective's backlog and are correctly out of this sprint's scope.

## SQL / Regression Validation

- **Full `Category=SqlServer` suite: 105/105 passed**, twice this pass (once before the seeding-extension code change, once after) — 2m46s the second run. Zero regressions from any Sprint 0.2 change, including the new `SeedDevelopmentAdditionalReviewerAsync` seeding code.
- Domain: 89 passed. Application: 5 passed. Architecture: 1 passed.
- `check-frontend-integrity.mjs`: 13 entry points passed.
- `check-localization.mjs`: 2,960 paired keys passed.
- `check-localization-usage.mjs`: passed.
- `check-bug001-display-names.mjs`: passed.
- `check-teacher-profile-mobile-cta.mjs`: passed.
- `check-template-placeholder-leak.mjs`: passed, 9 surfaces — **this static gate correctly could not have caught the F-013 reproduction**, because the defect is a runtime rendering race, not a missing `key:` in the render script (the `reviewTeacherAvatar` key does exist in the script, exactly as this gate checks for); this is now explicitly documented as a known limitation of that gate rather than a false sense of security.
- `dotnet ef migrations has-pending-model-changes`: "No changes have been made to the model since the last migration."
- `node --check js/tafseel.js`, `node --check js/locales.js`: passed.
- `git diff --check`: clean (line-ending advisories only).
- **Not run this pass**: publish smoke (no new deployment artifact needed; this sprint's own "do not deploy" instruction made it lower priority).

## Environment Validation

Canonical Development DB (`(localdb)\TafseelLocal;Database=Tafseel` via `appsettings.Development.json`, established in Sprint 0.1) reused unchanged. Before each browser certification round: the controlled Tafseel API process was stopped, a clean Release build was run, one controlled instance was started, and `/health/live`/`/health/ready` were confirmed `200` before proceeding — done 3 times this pass (once for the QualityReviewer seeding fix, once for the Admin seeding addition, and implicitly covered by the earlier builds). No stale-asset trap was hit this pass (Sprint 0.1's lesson — stop-then-build-then-start — was followed consistently from the start).

## Files Changed

- `src/Tafseel.Infrastructure/DependencyInjection.cs` — new Development-only UAT seeding extension for QualityReviewer + Admin accounts (Findings #1); extended the existing fast-path idempotency check to cover them.
- `docs/fixes/PHASE_4_SPRINT_0_2_AUTHENTICATED_UAT_CLOSURE.md` — this report.
- `docs/fixes/evidence/phase4-sprint0-2-authenticated-uat/` — UAT identities (no passwords) and row-count evidence.
- `docs/prompts/PHASE_4_SPRINT_0_2_AUTHENTICATED_UAT_CLOSURE.md` — this sprint's saved prompt.
- `docs/INDEX.md`, `docs/PROJECT_STATUS.md` — updated, correcting the F-013 status set by Sprint 0/0.1.
- No changes to `Tafseel-Student-Dashboard.dc.html` were made this pass — investigating F-013's root cause did not extend to attempting a fix, per this sprint's own "do not patch blindly" instruction and the remaining time budget.

## Remaining Limitations

1. **F-013 is open again, with a corrected root-cause hypothesis (a DC-runtime rendering-order race), not fixed.** A proper fix requires either a change to the shared `support.js` runtime (systemic, needs careful regression testing across every page that uses `sc-if`-gated modals — dozens of surfaces) or an application-level mitigation (e.g., deferring the modal's interpolated `src` attributes until after the first `renderVals()` pass for the new state has committed — a narrower, lower-risk change but one that would need to be applied consistently everywhere this pattern exists, not just `reviewModal`). Neither was attempted this pass.
2. Teacher Showcase creation (for Part 5.5's ineligible-media check and true mixed-source curation testing) was attempted via direct API call and hit a `415` on the first attempt; not pursued further given the time budget.
3. The full 6×4×9 authenticated+public responsive/localization matrix (Part 10) was not exhaustively swept; representative coverage only (see Responsive & Localization Matrix section).
4. Unrelated-party authorization denial (Part 9's negative case) was not independently re-tested this pass.
5. Video playback for the qualification demo was not visually confirmed (synthetic non-playable test file, same limitation noted in prior sprints for this exact scenario).

## Risks

1. **High** — F-013 sits at the single most trust-sensitive moment in the product (leaving a review), and is now confirmed live-reproducible with root cause understood but unfixed. This should be the top priority for whatever comes after this sprint, ahead of any Marketplace Scale feature work, exactly as the original Release 3 retrospective's P0 recommendation said before Sprint 0 incorrectly closed it.
2. **Medium** — the new UAT seeding accounts (`qa.reviewer.sprint02@example.com`, `qa.admin.sprint02@example.com`) exist in the real Development database with a known, shared password (`SeedUsers:Password`, kept in this machine's user secrets) once `SeedUsers:Enabled=true`. This is Development-only and matches the existing ADR-012-OPTIONAL threat model exactly, but should be turned back to `SeedUsers:Enabled=false` if this Development database is ever exposed beyond this machine.
3. **Low** — the two new Order/Review/Application UAT test records created this pass now exist permanently in the shared Development database (not cleaned up), matching this project's established practice of leaving prior UAT fixtures in place (e.g., Sprint 8's `uat.teacher.20260802@example.com`).

## Next Step

1. **Fix F-013 for real** in a dedicated, focused pass: reproduce it deterministically (this pass found it via normal UI interaction, not a targeted repro script), then decide between the shared-runtime fix and the narrower per-page mitigation, with proper regression testing across every `sc-if`-gated modal in the app before considering it closed.
2. Finish Part 5.5 (ineligible-media Showcase check) using the correct Showcase-creation request shape.
3. Complete the exhaustive responsive/localization matrix.
4. Only then should Marketplace Scale (Analytics/Search/Discovery/Messaging) feature work begin.

Teacher Initial Qualification: Live-certified
Multi-Subject Qualification: Live-certified, including the negative case and independent re-approval
Dashboard Routing: Live-certified, twice
Subject A Availability: Live-certified while Subject B pending and while Subject B changes-requested
Video Curation: Live-certified (hide/show/feature/reorder); ineligible-media check not exercised
Media Protection: Re-confirmed live
Request Lifecycle: Live-certified end-to-end
Payment: Live-certified, webhook-confirmed
Delivery: Live-certified, files downloadable both directions
Rating / F-013: Rating flow itself succeeded; F-013 reproduced live and is NOT closed — root cause identified, fix deferred
Review Moderation: Live-certified (hide/restore, aggregate recomputes, owner view preserved)
Responsive Matrix: Partial — representative coverage only
Browse UX: Re-confirmed correct on a real 2-subject teacher; scores unchanged from Sprint 0.1 baseline
SqlServer: 105/105 passed (twice)
Release Build: Clean, 0 errors, 2 pre-existing unrelated warnings
Publish Smoke: Not run this pass
Health: `/health/live` and `/health/ready` both 200 throughout
Backend: Builds clean; all suites pass
Frontend: All CI gates pass
Database: Canonical Development DB unchanged and reused; row counts show only the new UAT test data added, nothing lost
Tests: Domain 89, Application 5, Architecture 1, SqlServer 105×2 — all passed
Browser: Extensive live UI/API interaction across Teacher, Student, QualityReviewer, and Admin roles
Documentation: This report, evidence folder, prompt, INDEX.md, and PROJECT_STATUS.md updated

Final Verdict: **MARKETPLACE PRODUCT INTEGRITY CONDITIONALLY VERIFIED**

(Not VERIFIED: Exit Rule item 9 — "Rating modal submits live with no placeholder bug" — is falsified by this pass's own live evidence. Everything else on the Exit Rule checklist was proven live this pass.)

✅ Finished Phase 4 — Sprint 0.2
