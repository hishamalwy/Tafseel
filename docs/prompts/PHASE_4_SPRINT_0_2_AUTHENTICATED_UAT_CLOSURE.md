# Phase 4 — Marketplace Scale — Sprint 0.2 — Authenticated UAT Closure

Original operator prompt, preserved verbatim for traceability.

---

=========================================
PHASE 4 — MARKETPLACE SCALE
SPRINT 0.2

AUTHENTICATED UAT CLOSURE
=========================================

## Context

Phase 4 Sprint 0 implemented the Marketplace Product Integrity recovery. Sprint 0.1 then closed canonical Development database configuration, full SqlServer regression (105/105), multi-subject onboarding/dashboard behavior through real HTTP integration, the Browse duplicate-subject defect, teaching-media stream-only behavior, and Development health/migration consistency. Sprint 0.1 remained CONDITIONALLY VERIFIED only because several authenticated browser scenarios could not be driven with legitimate known credentials / eligible fixture state. This pass exists ONLY to close those remaining authenticated UAT gaps.

Do NOT start Analytics/Search/Discovery/Messaging redesign. Do NOT redesign Browse or Teacher Profile. Do NOT change qualification, Review, Payment, or Order-lifecycle rules. Do NOT broaden registration roles. Do NOT reset passwords of existing Development users unless explicitly authorized. Do NOT manually mutate business state using SQL. Do NOT commit, push, or deploy.

## Goal

Obtain a fully legitimate known-credential Development UAT path and use it to prove: (1) Teacher multi-subject UI flow, (2) Teacher Profile Video Curation, (3) complete Student Rating UI flow, (4) authenticated responsive/localization behavior. The final goal is MARKETPLACE PRODUCT INTEGRITY VERIFIED, not another conditional report.

## Part 1 — Controlled Development UAT Accounts

Do not reuse unknown-password historical accounts if legitimate access is unavailable. Prefer fresh Development-only UAT identities with known credentials, created only through existing supported mechanisms: Student and Teacher via the real public registration API/UI + Development email-confirmation/outbox; QualityReviewer via the repository's existing Development-only seed/config mechanism (`SeedUsers:Enabled=true` + known password + a NEW reviewer identity), never resetting `quality@gmail.com`; Admin only if a workflow genuinely needs it rather than QualityReviewer. If no safe existing Development seed mechanism exists: stop and document the exact blocker rather than adding public QualityReviewer registration. Label all created UAT accounts clearly; never fabricate production-like data; record identities without passwords.

## Part 2 — Initial Teacher Qualification

Teacher logs in → completes Teacher application for Subject A → uploads qualification demo/sample → submits → QualityReviewer logs in → opens the existing Quality queue → reviews the real application → confirms video playback → approves Subject A → Teacher logs back in. Expected: Teacher Dashboard opens normally; My Qualifications shows Subject A — Qualified; no redirect back to the initial Teacher Apply/Demo flow.

## Part 3 — Enable Marketplace Service

Using the existing governed Service Catalog architecture, Teacher opens Marketplace Services, selects a canonical Admin-owned service available for Subject A, enables/configures it with policy-compliant price/delivery/revisions. Teacher must not edit canonical service identity. Verify service active, requestable/bookable per the real order type, and Teacher becomes public once all canonical publication conditions are satisfied — completed through legitimate UI/API, never bypassed.

## Part 4 — Live Multi-Subject UI Certification

Drive the exact previously-reported regression through real browser clicks: Teacher Dashboard → My Qualifications → Apply to teach another subject → Subject B → complete and submit. Immediately after: Subject A remains Qualified, Subject B shows Pending/Submitted, Dashboard remains usable, Subject A's marketplace service remains active. Then logout/login: Dashboard must open, never redirect to the initial Apply/Demo page. Also prove Student-side Subject A availability while Subject B is pending (Browse visibility, Profile service selected by default, price/delivery/revisions render, Request CTA works, Subject B not yet requestable) and the negative decision case (reviewer rejects or requests changes on Subject B; Subject A qualification/service/availability/Dashboard access all remain unaffected; if practical, resubmit/approve Subject B and prove independent qualification).

## Part 5 — Profile Video Curation Live UAT

Using the fresh Teacher's legitimate approved Qualification Sample (and a Reviewed Showcase if the fixture allows, uploaded and approved through the existing Teacher Showcase workflow — never created manually), drive: Teacher Dashboard → Profile Videos → hide an approved sample → reload public profile (video absent, qualification/moderation state unaffected, no deletion) → show it again (video returns) → if 2+ eligible videos exist, set one Featured (exactly one featured, displayed first, reload preserves state) → reorder (move earlier/later, keyboard-accessible, persists on reload). Where fixture allows, prove a Pending/Rejected/Changes-requested Showcase has no public visibility control. Verify SampleCount consistency across Browse/Profile/Compare using the Teacher-selected + eligible + approved + playable rule.

## Part 6 — Teaching Media Protection

Re-certify on the fresh UAT Teacher: video plays, pause/resume, seek, Range 206, fullscreen where supported, `Content-Disposition: inline`, no Download action, `controlsList` includes `nodownload`, no `<a download>`, no storage path/permanent Blob/file-system URL exposed. Document explicitly that this prevents ordinary platform download UX and casual permanent-link sharing, not screen recording or advanced extraction without DRM.

## Part 7 — Create a Real Student Order

Fresh Student: Browse → Teacher Profile → default Subject A service selected automatically (verify teacher/service/price/delivery/revisions) → Request this service → complete the Request Wizard → upload at least one legitimate small test document if supported → submit → Teacher Dashboard sees the request and can open the Student attachment → Teacher accepts → exactly one Order appears → Student pays via Development Mock Checkout → webhook-confirmed payment → Teacher sees payment confirmed → Teacher Start Work → Teacher submits Delivery with at least one legitimate test file → Student can preview/download the delivery → Student Approves → Order becomes Completed. No SQL shortcuts, no direct business-state mutation.

## Part 8 — Live Rating / F-013 Final Certification

On the newly Completed + Paid Order, Student clicks Rate Teacher. Before submit, verify: only one rating modal, Teacher avatar/name/service resolve, no literal `{{ ... }}`, no request URL containing a template placeholder, five canonical criteria, recommendation field, comment behavior matches the domain contract, focus/Escape/mobile-safe/submit-busy-guard all correct. Submit a legitimate UAT rating. Expected: success state, Rate action disappears, refresh preserves review, duplicate review prevented, Completed Order shows owned review state, public projection updates only per existing visibility/moderation rules. If the old Sprint 8 literal-placeholder defect reproduces: stop classification as a documentation issue and investigate the runtime root cause — do not patch blindly.

### 8.1 — Moderation

QualityReviewer opens the existing supported moderation path (by known Review ID if no discoverable Admin queue UI exists — document that discoverability limitation separately, do not invent a new queue this sprint). Hide the UAT review: it must disappear publicly, the rating aggregate must recompute, and the Student owner's Order must still retain truthful review state. Restore if supported: public projection returns, aggregate recomputes consistently.

## Part 9 — Request Attachment & Delivery File Check

During the same lifecycle, prove: the Teacher can open the Student's request attachment; the Student can download the Teacher's delivery file. Teaching-video no-download restrictions must never bleed into Order/document files. Verify authorization: unrelated Student denied, unrelated Teacher denied where canonical rules require, owner/assigned parties allowed.

## Part 10 — Authenticated Responsive Matrix

Now that known credentials exist, complete the previously-missing matrix at 375/390/768/1024/1280/1440 × Arabic-RTL-Dark/Arabic-RTL-Light/English-LTR-Dark/English-LTR-Light, prioritizing Teacher Dashboard (My Qualifications, Profile Videos, Requests/Orders), Student Dashboard Completed Order, Rating modal, Quality Dashboard qualification/media review, plus public regression on Browse Teachers and Teacher Profile. Verify no horizontal overflow, no clipped names/price, no GUIDs, no badge collisions, no fixed-CTA overlap, no inaccessible actions, no untranslated residue, no console errors, no unresolved template bindings. Do not claim cells that were not actually inspected.

## Part 11 — Browse Card Final Observation

Do not redesign Browse this sprint. Capture clean evidence once the fresh Teacher appears and score honestly (Visual hierarchy, Commercial clarity, Trust, Scanability, Conversion, Mobile, Accessibility) against the Sprint 0.1 baseline of ~8/8.5 out of 10 — do not inflate. Record any remaining clear visual problems as a future dedicated Browse Redesign backlog item rather than expanding this pass's scope.

## Part 12 — Environment / Build Hygiene

Use the canonical Development DB `(localdb)\TafseelLocal;Database=Tafseel` through `appsettings.Development.json`. Before browser certification: stop only the controlled Tafseel API, run a clean Release build, start one controlled instance, verify freshly copied frontend assets, `/health/live` = 200, `/health/ready` = 200. Never validate root `.dc.html` edits against a stale `bin/Release/net8.0/frontend/` copy — rebuild first if source changed.

## Part 13 — Regression Tests

Domain, Application, Architecture, full `Category=SqlServer`, teacher additional-subject tests, teacher service eligibility tests, video curation tests, Showcase moderation tests, media authorization tests, Order lifecycle tests, rating/review tests, notification tests if touched, frontend integrity, localization parity, localization usage, JS syntax, BUG-001 display-name gate, template-placeholder leak gate, Teacher Profile mobile CTA gate, EF pending model, migration status, Release build, publish smoke, health/live, health/ready, `git diff --check`. No weakening assertions; no production change made merely to satisfy an environment-only test issue.

## Part 14 — Documentation

Create `docs/fixes/PHASE_4_SPRINT_0_2_AUTHENTICATED_UAT_CLOSURE.md` and `docs/fixes/evidence/phase4-sprint0-2-authenticated-uat/`. Save this prompt as `docs/prompts/PHASE_4_SPRINT_0_2_AUTHENTICATED_UAT_CLOSURE.md`. Update `docs/INDEX.md` and `docs/PROJECT_STATUS.md`, correcting Sprint 0/0.1 status using this new evidence. Document UAT identities without passwords. Document separately: Teacher initial qualification, additional-subject flow, Subject A availability while Subject B pending, video hide/show, featured/order, teaching-video protection, request attachment access, delivery download, payment, completion, rating, moderation, responsive matrix.

## Important Exit Rule

Do NOT mark Marketplace Product Integrity VERIFIED unless ALL of the following are proven: Teacher approved in Subject A; Teacher applies for Subject B; login still opens Dashboard; Subject A remains purchasable; Profile Video hide/show works live; Featured/order works if fixture has ≥2 eligible videos; teaching video has no ordinary download path; Student Request→Payment→Delivery→Approve lifecycle completes; Rating modal submits live with no placeholder bug; duplicate rating remains prevented; public review/rating behaves correctly; required authenticated responsive matrix is actually exercised; full SqlServer suite passes; Release build/publish smoke/health pass. If one is blocked, use CONDITIONALLY VERIFIED — do not overclaim.
