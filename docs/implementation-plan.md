# Implementation Plan

Phase 1 (this audit) is complete. This plan sequences Phases 2–11 per the master spec, adjusted for what the audit actually found. Each phase ends with the report format mandated by the spec (files changed, functionality, business rules, security, DB changes, tests run/results, risks, ambiguities, next phase) — not repeated here, just the scope per phase.

## Phase 2 — Foundation
- Solution/project layout: `Tafseel.sln`, `src/{Domain,Application,Infrastructure,Api}`, `tests/{Domain,Application,IntegrationTests,ArchitectureTests}.Tests`.
- Base abstractions: `Result<T>`/error model, pagination envelope, `IDateTimeProvider`, `ICurrentUserContext`.
- Serilog + correlation-ID middleware + centralized exception handling → ProblemDetails.
- `TafseelDbContext` (empty), ASP.NET Core Identity wired to `ApplicationUser`, JWT + refresh-token issuance/rotation/reuse-detection, permission-based authorization policies (the permission list from the master spec, centralized in one constants class — not scattered magic strings).
- Health checks, Swagger, API versioning, CORS from config, rate-limiting scaffolding (policies attached per-endpoint in later phases).
- Architecture tests asserting the dependency rules (Domain → nothing, Application → Domain only, etc.) from day one so later phases can't violate them silently.
- **No business entities yet.** This phase is pure plumbing.

## Phase 3 — Catalog & Teacher Qualification
- `Subject`, `Topic`, `EducationLevel`, `Language`, `ServiceCatalogItem` + Admin CRUD/soft-deactivate endpoints.
- `TeacherApplication` full lifecycle (Draft→Submitted→UnderReview→ChangesRequested→Approved/Rejected/Withdrawn), `TeacherDemoSubmission`, `TeacherApplicationReview`, `TeacherEvaluationScore` (9 fixed criteria from [Quality-Dashboard.dc.html:268](../Tafseel-Quality-Dashboard.dc.html#L268)), `TeacherApplicationStatusHistory`.
- Resolve [business-ambiguities.md](business-ambiguities.md) §4 (approval gating) and §11 (Admin vs Reviewer scope) before finalizing the decision endpoint's authorization.
- File storage abstraction (`IFileStorageService`) introduced here since demo-video upload is this phase's first real upload use case; local dev implementation only.
- Tests: application state-transition invariants (Domain), rubric scoring + decision authorization (Application), full submit→review→decide flow against a real test DB (Integration).

## Phase 4 — Teacher Marketplace
- `TeacherProfile`, `TeacherService`, `TeacherTeachingSample`, `TeacherAvailabilityRule`/`Exception`, `FavoriteTeacher`, `TeacherCertification`/`Experience`.
- `/teachers` search endpoint matching the exact filter/sort whitelist from [audit §10](frontend-requirements-audit.md#10-filters-and-sorting-whitelist-source-of-truth) — this is the highest-traffic anonymous endpoint, so indexing and `AsNoTracking`/projection-to-DTO matter most here.
- Resolve [business-ambiguities.md](business-ambiguities.md) §5 (teacher level badge rule) and §6 (availability model) before exposing the profile/availability endpoints as final.
- Rating/response-time/completed-count as cached, recomputed-on-write fields, not query-time aggregates on every list request.

## Phase 5 — Requests & Orders
- `LearningRequest` (+ attachments, status history), `Order` (+ financial snapshot, delivery, revisions), the accept-with-final-price-and-date flow exactly as shown in the [Accept modal](../Tafseel-Teacher-Dashboard.dc.html#L400-L434).
- Resolve [business-ambiguities.md](business-ambiguities.md) §2 (fee model) before the price-summary/order-snapshot logic is finalized — this is the first phase where the number actually gets persisted.
- Build the delivery-upload endpoint+authorization (§8) and dispute-creation stub isn't needed yet (Phase 9), but the Order entity must anticipate `DisputeId` linkage.
- Concurrency token on `Order.Status`; explicit, validated state-transition methods on the aggregate (no open setters).
- Tests: full lifecycle integration test (submit → clarify → accept → pay(mocked) → deliver → revise → approve → complete), ownership-check tests (student A cannot act on student B's request), idempotency test on `approve`.

## Phase 6 — Live Sessions
- Resolve [business-ambiguities.md](business-ambiguities.md) §7 (booking flow shape) first — this determines whether the booking endpoint hangs off `TeacherAvailabilitySlot` directly or off an accepted `LearningRequest`.
- `LiveSessionBooking`, slot materialization, DB-level overlap prevention (exclusion constraint or unique index on teacher+time-range), reschedule/cancel/complete/no-show transitions, UTC storage with separate per-participant timezone fields.
- Joining-link abstraction (`ILiveSessionLinkProvider`) with a mock implementation — explicitly documented as needing a real vendor (Zoom/Twilio/etc.) swap before production, matching how the frontend has no real video integration either.

## Phase 7 — Payments
- Resolve [business-ambiguities.md](business-ambiguities.md) §2 (fee snapshot design, already partially settled in Phase 5) and §10 (auto-completion window) before webhook/escrow-release logic is finalized.
- `IPaymentProvider` interface + mock implementation, `Payment`, `EscrowEntry`, `TeacherBalance`, append-only `LedgerEntry`, `WithdrawalRequest`, `Refund`, `PlatformFee` (versioned).
- All money as `decimal` with explicit SQL precision/scale and explicit `Currency` column; all mutating financial endpoints idempotent and transactional; background job for auto-completion if §10 confirms it's in scope.
- Admin withdrawal-processing and refund-initiation controls (§12) built here even though no current UI wires them — Phase 10 adds the missing Admin controls.
- Heaviest test phase: reconciliation invariants (sum of ledger entries = balance), idempotent webhook replay, idempotent refund replay, negative-balance prevention, concurrent-withdrawal-request handling.

## Phase 8 — Messaging & Notifications
- Resolve [business-ambiguities.md](business-ambiguities.md) §1 scope for Chat UI design ownership before building the SignalR hub contract, so the eventual frontend page has a stable target.
- `Conversation`/`ConversationParticipant`/`Message`/`MessageAttachment`, SignalR hub, persist-before-broadcast.
- `Notification`/`UserNotificationPreference`, in-app + email abstraction (`IEmailSender` with a safe dev implementation), outbox pattern only if the reliability need justifies it (likely yes, since payment/delivery notifications must not silently drop if email fails mid-transaction) — decide concretely at this phase, don't default to "yes" without checking actual failure-mode risk first.

## Phase 9 — Reviews, Disputes, Administration
- `TeacherReview`/`ReviewScore` (5-category, [Teacher-Profile.dc.html:411-417](../Tafseel-Teacher-Profile.dc.html#L411-L417)) distinct from the Phase 3 application-rubric entities; one-review-per-order uniqueness constraint.
- `Dispute` family + the missing creation UI's backend (§9), transactional decision→ledger integration reusing Phase 7's refund/escrow primitives.
- `AuditLogEntry` writes threaded through every sensitive action from earlier phases (this phase adds the write-calls retroactively where phases 3–8 didn't already include them — better to add audit calls per-phase as each action is built, and use Phase 9 only to verify coverage, not to bolt it on all at once).
- Admin metrics/reports endpoints (8 KPI tiles, charts) — projection queries, not full-table loads.

## Phase 10 — Frontend Integration
- Centralized API client, JWT-attach + refresh handling (HttpOnly cookie for refresh token per spec — document the access-token storage tradeoff explicitly, since the current frontend has zero auth today and there's no existing convention to preserve).
- Wire every `.dc.html` page's mock arrays/`flash()` stubs to real endpoints per [frontend-api-contract-map.md](frontend-api-contract-map.md) (produced at the start of this phase, after the API is stable).
- Build the genuinely-missing pages/controls identified in this audit: `Tafseel-Auth.dc.html`, `Tafseel-Teacher-Apply.dc.html`, `Tafseel-Chat.dc.html`, delivery-upload modal, dispute-creation entry point, coupon redemption UI (only if §3 confirms it's in scope), Admin withdrawal/refund action controls, and — coordinate on design before building — a corrected time-of-day availability editor (§6).
- Preserve all existing visual design; these additions should visually match the existing `.dc.html`/CSS-token conventions rather than introducing a new component system.

## Phase 11 — Hardening
- Full integration + architecture test pass, security review (authZ-on-every-endpoint audit, especially resource-ownership checks per spec's "never trust client-supplied IDs"), concurrency audit (Order status, availability booking, ledger writes), financial-correctness audit (§2/§10 decisions actually enforced, idempotency keys actually checked), query-performance audit (N+1 sweep on the list endpoints built in Phases 3–9), documentation review against actually-implemented behavior.

## Cross-phase notes

- **Every phase that touches money, state transitions, or authorization must re-read the relevant section of [business-ambiguities.md](business-ambiguities.md) before finalizing that phase's persisted schema** — several of those ambiguities (fee model, auto-completion, approval gating) become hard to change once real orders/ledger entries exist against the old assumption.
- Work strictly phase-by-phase per the master instructions: implement, test, report, then proceed — no jumping ahead to Phase 7 payments logic while Phase 5 order state machine is still unstable, even though they're related.
- [frontend-api-contract-map.md](frontend-api-contract-map.md) is intentionally **not** produced in Phase 1 — it requires final, implemented endpoint contracts (exact request/response DTOs) to be accurate, which don't exist until each phase actually ships. Producing it now would mean documenting functionality that doesn't exist yet, which the spec explicitly prohibits.
