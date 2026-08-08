# Phase 4 — Marketplace Scale — Sprint 0 — Marketplace Product Integrity Recovery

Original operator prompt, preserved verbatim for traceability.

---

=========================================
PHASE 4 — MARKETPLACE SCALE
SPRINT 0

MARKETPLACE PRODUCT INTEGRITY RECOVERY
=========================================

## Context

Phase 3 Release 3 is complete and conditionally certified.

The Release 3 retrospective is the current backlog source of truth.

Before beginning Analytics, Search, Discovery, Messaging, or other Marketplace Scale features, several proven product-integrity problems must be closed.

This is the first bounded sprint of Phase 4.

This sprint covers ONLY:

1. Teacher multi-subject qualification regression.
2. Teacher Dashboard access regression.
3. Teacher public/request availability regression.
4. Teacher approved-video profile curation.
5. Teaching-media stream-only protection.
6. Teacher Profile service-state contradiction.
7. Default service selection.
8. Teacher Profile price/CTA hierarchy.
9. Browse Teachers card UX recovery.
10. Known F-013 duplicate rating modal defect.

Do NOT begin Marketplace Analytics.
Do NOT add rankings.
Do NOT add badges.
Do NOT add AI.
Do NOT redesign payment.
Do NOT redesign Orders.
Do NOT redesign qualification approval rules.
Do NOT create parallel qualification, service, portfolio, media, or moderation domains.
Do NOT weaken existing moderation.
Do NOT fabricate data.
Do NOT commit.
Do NOT push.
Do NOT deploy.

=========================================
OFFICIAL DOCUMENTATION
=========================================

Before implementation: read and reconcile the existing relevant ADRs/reports for Marketplace Service Governance, Teacher Qualification, Teacher Showcase moderation, Teacher Trust Badges, Teacher Growth / additional-subject qualification if already documented, Teacher Profile Video Curation if already documented, Release 3 retrospective, F-013 rating-modal finding, PROJECT_STATUS.

Do NOT assume an ADR number from memory. Use the actual repository index.

If the Teacher Growth / Profile Curation slice is already partially implemented: continue it. Do NOT recreate it.

Save this official prompt as: docs/prompts/PHASE_4_SPRINT_0_MARKETPLACE_PRODUCT_INTEGRITY_RECOVERY.md

Create the final report: docs/fixes/PHASE_4_SPRINT_0_MARKETPLACE_PRODUCT_INTEGRITY_RECOVERY.md

Update: docs/INDEX.md, docs/PROJECT_STATUS.md

=========================================
ENVIRONMENT
=========================================

Use the current Development environment. Primary URL: http://127.0.0.1:5090. Use the current Tafseel Development LocalDB configuration already established by the repository/session. Do not invent a new database name from assumptions. Resolve the active configured Development connection string first.

Before building: find the currently controlled Tafseel API process; stop ONLY that Tafseel process if it locks build output; do not terminate unrelated processes; run a clean Release build; start ONE controlled API instance; verify GET /health/live -> 200 and GET /health/ready -> 200; ensure browser is using freshly-built frontend assets, not stale cached files.

If browser/dev-server caching is observed: classify it as Environment / Developer Experience; invalidate/restart safely; do NOT add another production-code build-marker workaround unless absolutely necessary.

=========================================
MANDATORY CLASSIFICATION
=========================================

Before fixing each problem, classify it as exactly one of: Production Bug, UI/View Issue, API Mismatch, Business Ambiguity, Legacy Compatibility, Dead Code, Test Issue, Missing Feature, Technical Debt, Deployment/Environment Issue.

Do not change a business rule just because the current implementation is inconvenient.

=========================================
TRACK A — TEACHER MULTI-SUBJECT QUALIFICATION REGRESSION
=========================================

Proven product expectation: a Teacher may be Qualified in Mathematics AND Pending qualification in Physics at the same time. The pending Physics application MUST NOT make the Teacher globally incomplete or unavailable. Dashboard accessible; Subject A public/available/requestable; Subject B not available until approved; additional subject application is an independent lifecycle.

A1 — Trace end-to-end (auth login landing, Teacher Dashboard routing, onboarding completion, application status, qualification applications, active approved qualifications, additional subject qualification, qualification demo page, profile publication, canRequest, public Teacher eligibility, TeacherService eligibility, Browse Teacher eligibility, profile service availability, request creation, Teacher public query predicates). Find exactly why a Teacher with one approved qualification plus another pending application is (1) redirected to the Demo/Qualification application on login and/or (2) treated as unavailable to Students. Do not patch the redirect symptom — find the canonical state conflation.

A2 — Required state separation: initial Teacher onboarding approval; active approved subject qualifications; additional subject qualification applications; Teacher public publication state; TeacherService availability per subject; Teacher account/dashboard access — all independent. Do not derive global Teacher eligibility from latest/any pending/any rejected/any qualification application regardless of subject.

A3 — Login/Dashboard rule: once the Teacher has completed initial onboarding and is an approved Teacher, normal login must open the Teacher Dashboard. Additional qualification actions live inside the Dashboard under My Qualifications / مؤهلاتي. Do not hijack normal Dashboard navigation merely because another application is pending. Exceptions only if the account itself is globally suspended/revoked per an existing canonical rule.

A4 — Subject-specific availability: active approved qualification for Subject A + active eligible TeacherService for Subject A continues to permit Subject A business while Subject B is draft/pending/changes-requested/rejected. Revoked Subject B must not affect Subject A and vice versa.

A5 — Concurrency/duplicates: no duplicate active same-subject applications; double-click does not create duplicates; Teacher can apply for multiple DIFFERENT subjects independently; approval/rejection affects only the target subject.

=========================================
TRACK B — TEACHER QUALIFICATION DASHBOARD UX
=========================================

Add or correct a Dashboard section: My Qualifications / مؤهلاتي, showing already-qualified subjects, pending additional subjects, changes requested, rejected, revoked, eligible subjects available to apply for. Primary action: Apply to teach another subject / التقديم لتدريس مادة أخرى. Do not send an already-approved Teacher through the initial onboarding flow. Reuse the existing application flow where safe. Do not create a second qualification domain or duplicated page logic.

=========================================
TRACK C — TEACHER APPROVED VIDEO PROFILE CURATION
=========================================

Goal: the Teacher controls which approved teaching videos appear on their public profile, from approved Qualification Samples and approved current Teacher Showcase versions. Moderation ownership remains with Quality; Teacher curation is presentation only.

C1 — Inspect existing implementation first (Qualification Sample entities/projections, Showcase version/moderation state, public profile projection, profile video curation fields, pending migration if one already exists, ADR/report for Teacher Profile Video Curation, Teacher Dashboard implementation). If this feature already exists partially: fix/finish it. Do NOT create another portfolio subsystem.

C2 — Teacher actions: show/hide approved video on profile; set one eligible visible video as Featured; reorder visible approved videos. Teacher may NOT publish pending/rejected/changes-requested/superseded media, alter Qualification trust labels, alter moderation decisions, alter immutable Qualification evidence, expose private storage details.

C3 — Profile Videos UX: Dashboard section Profile Videos / فيديوهات البروفايل; separate Qualification Samples and Reviewed Showcases; each item shows preview, localized title, subject, trust/source type, approval/moderation state, visible/hidden, featured state, ordering controls; approved/eligible-only publication actions; pending/rejected show no publication action with explanation; keyboard controls required, no drag-only interaction.

C4 — Public profile projection: Teacher selected for profile AND content remains approved/eligible AND Teacher remains publicly eligible AND qualification remains valid where required AND media is playable. Teacher selection can reduce visibility, never bypass moderation. Featured item first, then deterministic order. One visible video hides prev/next nav. Zero visible videos: honest no-video state. Browse/Profile/Comparison sample counts must use the same rule.

=========================================
TRACK D — TEACHING MEDIA — STREAM-ONLY EXPERIENCE
=========================================

Product requirement: Teaching Samples / Qualification Samples / Reviewed Showcases shown to Students must be watchable through Tafseel; the normal product must NOT offer a Download action for these teaching videos. This is authenticated/controlled stream-only delivery + no ordinary download UX + no permanent public media URL — NOT a claim of absolute anti-copy protection; do not claim DRM-level protection.

D1 — Scope: applies ONLY to public/profile teaching media (Qualification Samples, Reviewed Teacher Showcases). Do NOT remove download ability from Student Request attachments, Teacher Delivery files, Order files, or documents intended for the Student to keep.

D2 — Server-side media delivery: audit current media endpoint; ensure controlled endpoint, viewer authorization/eligibility check, Range requests supported, correct Content-Type, Content-Disposition: inline, no storage key/path exposed, no permanent public Blob/file-system URL, no predictable direct bypass route, playback/seeking functional. Preserve provider abstraction and fail-closed Production rules; do not weaken ADR-011.

D3 — Frontend media controls: no Download button; controlsList="nodownload" where supported; no `<a download>`; no visible direct media URL; no "open in new tab"; native controls remain for play/pause/seek/volume/fullscreen; optional context-menu suppression as UX deterrence only, never described as security. Do not break seeking/pause/resume/fullscreen/mobile/keyboard/Quality reviewer preview/Teacher owner preview.

D4 — Document security limit explicitly: stream-only UI reduces casual downloading/sharing; does NOT prevent screen recording, advanced extraction, or a compromised client. DRM is a separate future Production decision — do not introduce DRM this sprint.

=========================================
TRACK E — TEACHER PROFILE SERVICE STATE CONTRADICTION
=========================================

Proven browser defect: the Teacher Profile can simultaneously show a selected service card's full details AND "No services available" while the card below is visibly selected. Unacceptable.

E1 — Single source of truth: one canonical profile service collection and one canonical `selectedService`; selected card, sidebar, price, delivery, revisions, Request CTA, Book CTA, no-services state all derive from it. No parallel booleans producing contradictory state.

E2 — Service eligibility: profile-selectable services must be catalog-active, publicly visible as required, Teacher-offering-active, Teacher still qualified for the subject, policy-compliant, valid for new business. Pending qualification in a DIFFERENT subject must not remove them.

E3 — No-services state: render "No services available" ONLY when canonical selectable service count is zero; never when `selectedService != null` or any requestable/bookable service exists. Add a hard regression test.

=========================================
TRACK F — DEFAULT SELECTED SERVICE
=========================================

When a Student opens a Teacher Profile and the Teacher has at least one eligible public service, one service should already be selected — no extra click needed to establish commercial context.

F1 — Selection precedence: (1) valid explicit service supplied through an existing supported route/query state, if applicable; (2) otherwise first eligible service by canonical catalog/service display order; (3) deterministic fallback only if current ordering is absent. Never select inactive/unavailable/unqualified-subject/archived services.

F2 — Initial profile state: on first meaningful render, selected card + sidebar + price + delivery + revisions + primary CTA must all be ready and synchronized. Avoid empty sidebar flash, "select a service" flash, no-services flash, layout shift.

F3 — Multiple services: switching updates atomically — selected card, title, price, delivery, revisions, CTA route, workflow type, live/request behavior. No stale values from the previous service.

=========================================
TRACK G — TEACHER PROFILE PRICE & CONVERSION HIERARCHY
=========================================

Proven UI problem: selected service price is visually too weak for one of the Student's primary purchase decisions. Fix hierarchy without redesigning the whole profile.

G1 — Sidebar should visually prioritize: selected service name, PRICE, delivery, revisions, primary CTA.

G2 — Price: materially larger, higher contrast, properly localized, correct RTL/LTR formatting, consistent currency treatment, accessible, not dominated by secondary metadata. Do not exaggerate with giant marketing typography. Do not invent new price semantics — use the exact canonical current price/fee meaning.

G3 — CTA: direct localized action wording based on real workflow (Request this service / اطلب هذه الخدمة, or Book session / احجز الجلسة). Do not show both if only one is valid.

=========================================
TRACK H — BROWSE TEACHERS CARD UX RECOVERY
=========================================

Current card is functional but visually crowded: weak hierarchy, repeated language info, oversized negative live-session message, price buried, competing actions, detached Compare checkbox, card doesn't answer the purchase decision quickly. Do NOT redesign Browse from scratch — refine the existing card.

H1 — First-scan priority: who is this / what subject / why trust them / language context / short headline / "From X SAR" + delivery / primary CTA / secondary save-compare.

H2 — Remove visual noise: repeated language/subject labels, oversized "No live sessions" box, redundant Profile button if the whole card/name can navigate safely, disconnected compare checkbox. De-emphasize secondary negatives, don't hide useful info.

H3 — Price prominence using existing canonical Browse price semantics only — no invented lowest-price/discount/sale-price formula. If semantics ambiguous, classify Business Ambiguity and preserve the current factual value.

H4 — Card interaction: primary click → Teacher Profile; primary commercial CTA → Request/View per existing flow; secondary Save/Compare; no nested click conflicts, no dead areas, no accidental navigation toggling Compare/Save.

H5 — Responsive: at mobile widths, no compressed-desktop-table feel; price and CTA visible without excessive scroll; 44px touch targets; no clipped name/currency; no badge collision.

=========================================
TRACK I — F-013 DUPLICATE RATING MODAL
=========================================

Release 3 final certification proved `reviewModal` and `rateModal` are parallel implementations for the same rating action; one path produced a literal `{{ reviewTeacherAvatar }}` request and unresolved template bindings. This is the Release 3 P0 backlog item — fix before adding Phase 4 features.

I1 — Consolidation: trace both implementations; keep ONE canonical rating modal/state path; remove the duplicate safely. Do not change review eligibility, five criteria, average calculation, comment rule, recommends, moderation, one-review-per-order invariant.

I2 — Regression: Rate opens correctly; teacher avatar/name resolve; service resolves; existing Order row bindings stay intact; no literal `{{...}}` in rendered src/href/text; submit works; duplicate review remains prevented; review appears per existing moderation rules. Add a general static/browser regression check that fails when literal template placeholders remain in rendered src/href on production consumer surfaces.

=========================================
TRACK J — CROSS-SURFACE CONSISTENCY
=========================================

After fixes, verify the same Teacher/service facts across Browse → Profile → Request Wizard → Payment: display name, subject, service name, price, delivery, revisions, qualification/trust, selected service. No UI should invent or mutate these values independently.

=========================================
TRACK K — SECURITY / AUTHORIZATION
=========================================

Verify: Student cannot mutate Teacher qualification; Teacher cannot approve own qualification; Teacher cannot curate another Teacher's videos; Student cannot mutate video curation; rejected media cannot be selected publicly; hidden media cannot leak via public profile query; direct teaching-media requests respect current authorization/visibility rules; storage path/key never exposed; Order delivery downloads remain authorized and unchanged; additional-subject pending state does not weaken public Teacher checks. Do not broaden roles.

=========================================
TRACK L — DATABASE / MIGRATION
=========================================

Inspect existing pending migrations before generating anything, especially any existing migration related to Teacher Profile Video Curation. Do NOT generate a duplicate migration. If an existing migration is correct but unapplied: review it, test it against an isolated Development clone, apply to the active Development DB only if required for legitimate browser validation and consistent with the project's controlled migration workflow; never apply to Staging/Production this sprint. Any new migration must be additive, deterministic, no destructive qualification changes, no approval rewrite, no service-history rewrite, no unapproved media exposure. Run EF pending-model checks.

=========================================
REQUIRED TEST MATRIX / BROWSER VALIDATION / VISUAL QUALITY BAR / VALIDATION / DOCUMENTATION / RESPONSE FORMAT
=========================================

See the full original operator instruction for the 42-case test matrix, required browser widths (375/390/768/1024/1280/1440), locale/theme modes, live scenarios (Teacher qualification flow, Student browse-to-request flow, curation flow, media flow, rating flow), the visual quality bar (Browse card and Profile conversion card scored across hierarchy/commercial clarity/trust/conversion/responsive/accessibility, target ≥9.5/10, no fabricated 10/10), the 24-item validation run list, and the exact required response format (sections, per-track status lines, and Final Verdict enum). All of these were followed as closely as the actual local Development environment and session tooling allowed; deviations are called out explicitly in the sprint report rather than silently skipped.

Documentation requirements: create docs/fixes/PHASE_4_SPRINT_0_MARKETPLACE_PRODUCT_INTEGRITY_RECOVERY.md and docs/fixes/evidence/phase4-sprint0-product-integrity/; update docs/INDEX.md and docs/PROJECT_STATUS.md with per-track status and the Phase 4 Sprint 0 roadmap entry.
