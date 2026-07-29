# Tafseel Phase 0–1 Audit Report

Audit baseline: repository `Tafseel`, branch `main`, commit `6c42d7e`, inspected on 2026-07-29.

Scope: Phase 0 repository/runtime inventory and Phase 1 capability gap analysis only. No production code, workflow, database schema, migration, or environment was changed.

## 1. Executive Summary

Tafseel already contains a substantial, layered educational-marketplace implementation. The teacher qualification lifecycle, marketplace publication rules, request/order lifecycle, live-session booking, financial ledger foundations, embedded messaging, notifications, reviews/disputes, and role-based administration are not greenfield work and must be reused.

The roadmap is not ready for broad implementation. Of the 24 capabilities:

- 1 is **Already Complete**: persistent notification center.
- 10 are **Partially Implemented**.
- 3 are **Missing** where the existing model provides a safe starting point.
- 7 are **Blocked by Business Rule**.
- 2 are **Blocked by Missing Data**.
- 1 is **Unsafe to Implement Yet** because production payment/settlement semantics and providers are unresolved.

Two current-state issues precede optional product work:

1. Identity initialization is invoked in every non-Testing environment, including Staging and Production, despite the explicit contract that it is Development-only.
2. Public teacher cards expose `CompletedOrders` and `ResponseTimeMinutes`; the former has no production writer and the latter is teacher-entered rather than event-derived. They cannot support confidence or performance claims.

Overall verdict for this pass: **READY FOR TARGETED DEVELOPMENT**, after a focused production-correctness fix for environment-gated identity initialization. Production readiness was not proven.

## 2. Architecture Map

### 2.1 Solution and dependency direction

| Project | Responsibility | Depends on |
|---|---|---|
| `Tafseel.Domain` | Entities, value/state rules, lifecycle transitions, domain exceptions | None |
| `Tafseel.Application` | DTOs, service contracts, authorization constants, options contracts | `Tafseel.Domain` |
| `Tafseel.Infrastructure` | EF Core/SQL Server, Identity, application service implementations, email, files, payment/session providers | `Tafseel.Application`, `Tafseel.Domain` |
| `Tafseel.Api` | HTTP controllers, middleware, JWT/CORS/rate-limit/security configuration, SignalR and static DC frontend hosting | `Tafseel.Application`, `Tafseel.Infrastructure` |

Test projects:

- `Tafseel.Domain.Tests`
- `Tafseel.Application.Tests`
- `Tafseel.ArchitectureTests`
- `Tafseel.IntegrationTests`

The observed dependency direction is consistent with the existing layered design. Business transitions live in Domain; orchestration and persistence live in Infrastructure; controllers remain thin.

### 2.2 Runtime components

| Concern | Current implementation |
|---|---|
| Authentication | ASP.NET Core Identity plus JWT access tokens and hashed, rotating refresh tokens |
| Authorization | Roles `Student`, `Teacher`, `QualityReviewer`, `Admin`; policy checks plus resource ownership in services |
| Database | EF Core 8, SQL Server, migrations under `Tafseel.Infrastructure/Persistence/Migrations` |
| Email | Resend outside Development; local Development sender; validated sender and frontend URLs |
| Realtime | Authorized SignalR `MessagingHub` at `/hubs/messages`; persisted messages; polling fallback in embedded chat |
| Payments | Payment attempts, signed/idempotent webhook records, ledger/escrow records, refunds and withdrawals; only mock provider registered |
| Files | Signature/type/size validation and generated storage keys; local filesystem storage implementation |
| Background processing | Notification email outbox worker |
| Health | `/health/live` process liveness and `/health/ready` database readiness |
| Frontend | Twelve `.dc.html` pages, shared `support.js`, embedded React/Babel runtime, `api.js`, `locales.js`, `tafseel.js`, `chat-widget.js`, shared CSS |
| Deployment | GitHub Actions for CI/security/database/docker/staging gate and deployment; Production remains manual |

### 2.3 Database aggregate map

- Identity: users, roles, claims and refresh tokens.
- Catalog: subjects, topics, qualification topics/resources, levels, languages and service catalog.
- Qualification: teacher applications, subject qualifications and immutable demo submissions.
- Marketplace: profiles, qualified subjects/topics, languages, levels, services, samples, availability, credentials and favorites.
- Work: learning requests, attachments, clarifications, orders, immutable deliveries and revisions.
- Sessions: bookings, attachments, weekly availability and exceptions.
- Finance: payments, attempts, webhook records, coupons, ledger accounts/entries, hold records, refunds, withdrawals and financial audits.
- Communication: conversations, messages, attachments, notifications, preferences and notification outbox.
- Governance: reviews, disputes/evidence and audit logs.

## 3. Domain Lifecycle Map

### 3.1 Teacher qualification

```text
Email confirmed
  -> Draft application
  -> Qualification assignment + official resources
  -> Immutable demo submission version
  -> Submitted
  -> UnderReview
  -> Approved | ChangesRequested | Rejected
  -> Active subject qualification (approval only)
  -> Auto-generated published teaching sample
  -> Qualified-subject service creation
  -> Publishable teacher profile
```

Evidence and invariants:

- Each demo upload creates a new `TeacherDemoSubmission`; earlier uploads are retained.
- Assignment title, instructions and resource manifest are snapshotted into the submission.
- Quality decisions require assigned-reviewer ownership, all score inputs and concurrency version.
- Approval creates the active subject qualification transactionally and generates a sample.
- Revocation deactivates affected services and removes sample publication.
- “Verified teacher” is derived from active qualifications, not a writable profile flag.

### 3.2 Learning request and order

```text
PendingTeacherReview
  <-> ClarificationRequested
  -> Accepted | Declined | Cancelled

Accepted request
  -> AwaitingPayment
  -> InProgress
  -> Delivered
  -> RevisionRequested -> Delivered (repeat within allowance)
  -> Completed

AwaitingPayment/InProgress/Delivered/RevisionRequested
  -> Cancelled only through the allowed cancellation/refund/dispute rules
```

Evidence and invariants:

- Request and order status transitions create persisted status-history rows with actor and timestamp.
- Request acceptance is idempotent and uses a serializable transaction plus database uniqueness.
- Financial terms are snapshotted on the order.
- Deliveries are additive immutable versions.
- Revision requests are additive and sequenced, but do not reference the specific delivery version they revise.
- Payment confirmation is required before work starts.

### 3.3 Live session

```text
Availability rule/exception
  -> UTC slot calculation
  -> AwaitingPayment booking
  -> Confirmed
  -> Completed | Cancelled | StudentNoShow | TeacherNoShow
```

Rescheduling retains the booking and writes history. Booking and rescheduling use transaction/locking checks to prevent overlaps. Teacher timezone drives schedule interpretation; persistence is UTC.

### 3.4 Payment and settlement

```text
Payment attempt
  -> provider callback
  -> signature + provider/event idempotency validation
  -> Pending | Confirmed | Failed
  -> ledger/hold entries
  -> refund, dispute resolution or manual settlement path
```

The code is transaction- and audit-oriented, but only mock payment and live-session-link providers are registered, and automatic release is explicitly disabled pending product policy.

### 3.5 Messaging and notifications

```text
Authorized participant
  -> persisted conversation/message
  -> SignalR delivery
  -> polling fallback if disconnected

Domain action
  -> persisted user-owned notification
  -> optional outbox email
  -> retry/status tracking
```

The standalone chat page has been removed. Student and teacher dashboards are the canonical chat surfaces.

## 4. API and Frontend Surface Map

### 4.1 API surface

| Area | Main routes | Access model |
|---|---|---|
| Authentication | `/api/v1/auth/*` | Anonymous for register/login/confirm/reset; authenticated for profile/password/logout |
| Catalog | `/api/v1/subjects`, `topics`, `languages`, `education-levels`, `services`; admin catalog/resource routes | Public reads; Admin/Quality policy for managed data |
| Teacher applications | `/api/v1/teacher-applications/*` | Teacher ownership; Quality review policy |
| Marketplace | `/api/v1/teachers/*` | Public published profiles/search; Teacher ownership for profile/services/samples/availability |
| Favorites | `/api/v1/favorite-teachers/*` | Student-only and owned |
| Requests | `/api/v1/learning-requests/*` | Student/Teacher role plus request ownership |
| Orders | `/api/v1/orders/*` | Student/Teacher role plus order ownership |
| Sessions | `/api/v1/live-sessions/*` | Public slot lookup; owned Student/Teacher actions |
| Payments | `/api/v1/payments/*`, refunds, balances, withdrawals, reconciliation | Owner/policy checks; webhook is server-validated |
| Messaging | conversations, messages, attachments, notifications and preferences | Participant/user ownership |
| Governance | teacher reviews, disputes, evidence, moderation and resolution | Public approved reviews; owner/policy checks |
| Admin | users, roles/suspension, metrics, audit, coupons | Admin policies |

All potentially sensitive actions inspected are backed by server authorization; hidden frontend controls are not the sole protection.

### 4.2 Frontend pages

| Page | Current responsibility |
|---|---|
| `Tafseel-Landing.dc.html` | Public landing/navigation |
| `Tafseel-Auth.dc.html` | Login, registration, confirmation and password recovery flows |
| `Tafseel-Browse-Teachers.dc.html` | Published-teacher search and filters |
| `Tafseel-Teacher-Profile.dc.html` | Public profile, services, samples and availability |
| `Tafseel-Request.dc.html` | Learning-request creation |
| `Tafseel-Book-Session.dc.html` | Slot selection and booking |
| `Tafseel-Payment.dc.html` | Payment initiation/status UI |
| `Tafseel-Student-Dashboard.dc.html` | Requests, sessions, favorites, payments, reviews, notifications, messages and settings |
| `Tafseel-Teacher-Apply.dc.html` | Onboarding, qualification assignment/resources and versioned demo upload |
| `Tafseel-Teacher-Dashboard.dc.html` | Services, samples, availability, messages, reviews, earnings, withdrawals, profile/settings |
| `Tafseel-Quality-Dashboard.dc.html` | Qualification queue, review and decisions |
| `Tafseel-Admin-Dashboard.dc.html` | Users, catalog, resources, disputes, withdrawals, coupons and metrics |

Shared runtime that must be preserved:

- `support.js` DC host integration.
- `js/api.js` authenticated API/session behavior.
- `js/locales.js` Arabic/English keys.
- `js/tafseel.js` shared shell/navigation/runtime.
- `js/chat-widget.js` embedded SignalR-first messenger.
- `css/tafseel.css` shared visual and responsive system.

## 5. Capability Gap Matrix

Status values are restricted to the required capability vocabulary. Each row uses exactly one required finding classification.

| # | Capability | Status | Current evidence and reusable components | Missing backend | Missing frontend | Missing database/data | Missing tests | Business-rule ambiguity | Security implications | Risk | Priority | Classification / Next action |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Teacher Performance and Student Confidence | Partially Implemented | Persisted reviews and rating aggregate; active subject qualifications; orders, sessions, revisions, refunds | Canonical formulas/query service; event-derived response, completion, timing and rate metrics; global/subject split | Honest null/insufficient-data states and metric explanations | `CompletedOrders` has no writer; response time is self-entered; no response-event timestamp definition | Formula, zero-denominator, privacy and subject-attribution tests | Eligible statuses, date windows, exclusions and public fields | Must not leak revenue, moderation or dispute detail | High | 6 | **Production Bug** — stop presenting unsupported fields as performance evidence, then define real projections |
| 2 | Teacher Availability and Capacity | Partially Implemented | Weekly rules, exceptions, timezone conversion, slot calculation and transactional double-booking prevention | Capacity configuration, workload calculation and atomic last-capacity acceptance | Now/today/next/busy/vacation states | No request capacity fields or workload projection | Capacity race, timezone boundary and status-count tests | Active workload statuses, daily/concurrent limits, vacation semantics | Do not infer presence from login/activity | High | 5 | **Missing Feature** — extend existing availability, do not create a parallel scheduler |
| 3 | Teacher Matching | Missing | Deterministic marketplace filters/sorts and real qualification/language/service/price/availability data | Explainable weighted scorer and versioned configuration after rules are approved | Match reasons and honest missing-factor display | Capacity, preferences and approved metric inputs are absent | Score determinism, tie, authorization and explanation tests | Weights, ownership, versioning, tie-breaks and threshold meaning | Explanations must exclude private metrics | High | 9 | **Business Rule** — approve transparent scoring rules before implementation |
| 4 | Request Complexity Estimation | Blocked by Missing Data | Requests store subject/service, files, deadline and budget; attachment size/type retained | Deterministic suggestion model and confirmation/override path | Guided estimate review/confirmation | No page count, requested duration, teacher/admin estimate or complexity record | File-metadata, override, privacy and deterministic estimate tests | Category definitions, formula, authority and price relationship | Private files cannot leave platform without approved provider/privacy terms | High | Later | **Missing Feature** — collect objective metadata before estimating |
| 5 | Learning Timeline | Blocked by Business Rule | Completed orders/sessions and associated subjects/services are persisted | Safe projection once outcome semantics are defined | Student timeline and semantic labels | No explicit covered/practiced/understood/proficiency/mastery outcome records | Ownership, source-event and no-false-mastery tests | Who records each outcome and what evidence each label means | Learning history is private student data | High | 13 | **Business Rule** — define outcome vocabulary and authority first |
| 6 | Student Learning Preferences | Missing | Authenticated student profile/settings surface and accepted request/session ownership | Preference vocabulary/storage and scoped teacher-access query | Editable preferences and accepted-work context display | No preference entity/fields | Edit, validation, ownership and unrelated-teacher denial tests | Whether preferences are global, per subject or per request; visibility duration | Prevent psychological inference and unrelated-teacher access | Medium | 8 | **Missing Feature** — add explicit user-selected preferences only |
| 7 | Teacher Reputation and Badges | Blocked by Business Rule | Real active qualification and rating data can support future rules | Rule/version/award/recalculation model | Badge criteria/explanation and honest absence | No badge definitions or awards | Eligibility, version, revoke/recalculate and privacy tests | Criteria, windows, revocation, historical retention, administrative badges | Avoid misleading quality or mastery claims | High | Later | **Business Rule** — approve auditable badge rules before schema |
| 8 | Teacher Portfolio | Partially Implemented | Approved qualification auto-generates a protected sample; teacher samples have subject and visibility | Moderation, ordering and archive rules; prevent unapproved public content | Manage order/archive/moderation state | No moderation/order/archive fields for samples | Public leakage, moderation, ordering, archive and immutable-evidence tests | Who approves additional showcase content and whether links/files differ | Unreviewed teacher content can currently be published | High | 14 | **API Bug** — public sample publication lacks an approval workflow |
| 9 | Quality Trends and Risk Signals | Partially Implemented | Qualification outcomes and detailed score inputs; disputes/reviews/audit records | Transparent trend queries and separate non-enforcement flags | Quality trend filters, formula drill-down and flags | No approved derived trend/flag model; complaint/policy attribution incomplete | Formula, time-window, authorization and no-auto-suspension tests | Windows, denominators, thresholds, confirmed violation definition | Quality/moderation data is restricted | High | 11 | **Business Rule** — define inspectable signals and keep enforcement separate |
| 10 | Request and Session Timeline | Partially Implemented | Persisted request/order/session histories; immutable deliveries/revisions; payment and dispute records | Owned timeline projection with safe event DTOs; include only persisted evidence | Timeline in student/teacher dashboards | Existing records can support a first slice; some events lack unified actor/metadata shape | Ordering, ownership, cross-user, safe metadata and source-event tests | Which internal notes are public; event labels by audience | Must redact internal review/payment payload data | Medium | 1 | **Missing Feature** — first product slice should expose existing immutable events |
| 11 | Payment and Escrow Transparency | Unsafe to Implement Yet | Decimal money, idempotent signed callbacks, attempts, ledger, hold entries, refunds, withdrawals, audit and reconciliation | Real provider; approved settlement/refund state contract; accurate terminology | Real provider-backed state UI | Mock provider only; auto-release intentionally disabled | Real-provider contract/sandbox, callback and settlement tests | Whether funds are legally escrow, hold/restricted balance, settlement eligibility and currency scope | Forged/duplicate callback protections exist; provider secrets and payload privacy remain critical | Critical | 3 prerequisite | **Deployment** — do not market or deploy payment transparency until provider and terminology are approved |
| 12 | Teacher Analytics | Blocked by Missing Data | Orders, sessions, reviews and finance transactions can support some owned aggregates | Date-filtered owned aggregates; view/conversion event capture only if approved | Teacher analytics filters and insufficient-data states | No profile/service view events; completed-order projection stale; response event undefined | Date, ownership, aggregation and zero-denominator tests | Date windows, conversion funnel, subject revenue attribution and privacy | Never expose platform comparisons or other teachers’ financial data | High | 10 | **Missing Feature** — instrument only approved real events before analytics |
| 13 | Student Analytics | Blocked by Missing Data | Completed requests/sessions, teachers and revision counts exist | Owned activity aggregation and objective duration query | Student filters/activity views | No explicit learning outcome; non-session learning duration unavailable | Ownership, date, distinct counts and no-false-outcome tests | Topic attribution, activity month boundary and outcome definition | Private learning data must remain owner-only | Medium | 10 | **Missing Feature** — limit initial analytics to objective persisted activity |
| 14 | Trust and Verification | Partially Implemented | Confirmed email, active subject qualification, qualification revocation; credentials are self-entered | Phone/identity/degree workflows, evidence access/expiry if approved | Clearly distinguish verified from self-declared credentials | No phone/identity/degree verification/evidence lifecycle | Badge truth, evidence privacy, expiry and revocation tests | Providers, acceptable evidence, reviewers, expiry and appeal | Identity documents require strict private storage and audit | Critical | 12 | **Business Rule** — never label self-entered credentials verified |
| 15 | Service Types | Partially Implemented | Catalog supports recorded explanation, assignment guidance, exam revision and live session; scheduling metadata and separate request/session lifecycles | Rules for any additional service codes | Service-specific inputs and lifecycle copy | Catalog can hold more types, but new lifecycle data may differ | Per-type validation, transition, payment/cancellation tests | Inputs, pricing, scheduling, cancellation, completion per new type | Service constraints must be enforced server-side | Medium | Later | **Business Rule** — approve each new service lifecycle before adding it |
| 16 | Saved Teachers | Partially Implemented | Idempotent add/remove, unique student-teacher relation, ownership, published-profile check and dashboard empty state | Paginated query/contract | Pagination controls for large collections | Existing table/index sufficient | Pagination ordering/boundaries plus current ownership/idempotency regression | None material | Public profile visibility must be rechecked on read | Low | 4 | **API Bug** — current favorites list is potentially unbounded |
| 17 | Teacher Comparison | Missing | Public normalized teacher card/profile data and search filters are reusable | Bounded comparison query or reuse of public profile reads | Compare selection/table, missing-value handling and mobile layout | No new schema required for a basic public comparison | Limit, unpublished teacher, missing values, authorization-free public data tests | Maximum count, comparable fields and whether any ordering is allowed | Public fields only; no hidden ranking | Medium | 7 | **Missing Feature** — build only after public metrics are made honest |
| 18 | Teacher Educational Content Feed | Blocked by Business Rule | Teaching samples are not a social feed and must not be repurposed silently | Entire publishing/moderation/reporting lifecycle unresolved | Feed, creation, moderation/reporting UX unresolved | Content, moderation, report and storage model absent | Abuse, authorization, upload, moderation and pagination tests | Publisher eligibility, moderation, upload/link, comments, reports, MVP and costs | High abuse, XSS, copyright, storage and moderation exposure | Critical | Later | **Business Rule** — no implementation before product/moderation approval |
| 19 | Student Request Assistant | Partially Implemented | Existing deterministic request form, catalog, file upload, deadline and budget fields | Guided-question orchestration and optional preference/output fields | Progressive guided UI with normal form fallback | Difficulty/style/expected-output fields not persisted | Form fallback, validation, upload privacy and no-fake-AI tests | Exact difficulty vocabulary and whether new answers affect routing/pricing | Documents must not be sent externally without approval | Medium | Later | **UI Bug** — improve the canonical form; do not create a second request workflow |
| 20 | Referral and Credit System | Blocked by Business Rule | Coupon infrastructure exists, but promotional coupons are not referral credit or cash | Eligibility, fraud, accounting and refund-safe credit ledger unresolved | Referral/credit UX unresolved | Referral attribution and non-withdrawable credit model absent | Self-referral, concurrency, refund reversal, expiry and accounting tests | All ten specified commercial/legal rules remain undecided | High fraud, money-laundering, accounting and regional legal exposure | Critical | Later | **Business Rule** — do not reinterpret coupons as credit |
| 21 | Revision Requests | Partially Implemented | Immutable delivery versions, revision sequence/reason, allowance, status history and teacher notification | Explicit revision-to-delivery link; requested-change structure and actor exposure | Version-linked delivery/revision history | `RevisionRequest` has no `DeliveryId`; actor is only implicit in order history | Link integrity, immutable versions, allowance, post-settlement and notification tests | Whether reason and requested changes are separate; dispute exception after settlement | Files remain private and ownership-gated | High | 2 | **API Bug** — canonical revision lacks an explicit target delivery version |
| 22 | Notification Center | Already Complete | Persisted owned notifications, read/unread, pagination, type, timestamp, link, dedupe key, preferences and optional email outbox status; dashboard surfaces exist | No roadmap-required backend gap proven | No roadmap-required frontend gap proven | Existing unique dedupe/indexed persistence | Existing messaging/notification ownership, pagination and isolation coverage | Deep-link allowlist should remain constrained to internal routes | Cross-user isolation is enforced; links must remain non-user-controlled | Low | Preserve | **Technical Debt** — capability is complete; preserve and regression-test it instead of building a duplicate |
| 23 | Teacher Capacity | Blocked by Business Rule | Active orders/sessions and transactional acceptance/booking paths are reusable | Persisted capacity settings, active-workload query and atomic capacity guard | Teacher configuration and student capacity state | No max daily/concurrent request settings | Last-slot concurrency, status counting and rollback tests | Which statuses consume capacity, payment holds, daily boundary and overrides | Capacity state must not expose private workload details | High | 5 | **Business Rule** — define workload semantics before persistence |
| 24 | Achievement System | Blocked by Business Rule | Real platform activity can eventually support participation milestones | Rule/version/award/recalculation model absent | Achievement explanations and category separation absent | No achievement definitions/awards | Eligibility, version, revocation and no-mastery-claim tests | Criteria for participation, activity and verified outcome categories | Avoid deceptive educational/mastery claims | High | Later | **Business Rule** — defer until criteria and evidence are approved |

## 6. Existing Features That Must Not Be Duplicated

1. Teacher application and qualification state machine.
2. Immutable qualification submission versions and assignment/resource snapshots.
3. Active-qualification-derived teacher verification.
4. Automatic teaching sample generation after qualification approval.
5. Qualified-subject restriction for teacher services.
6. Marketplace search, public teacher DTOs and publication gating.
7. Availability rules, exceptions, UTC conversion and booking-conflict protection.
8. Learning request, order, delivery and revision lifecycle.
9. Request/order/session status-history entities.
10. Payment attempts, callback idempotency, ledger, refund, withdrawal and financial audit.
11. Favorite-teacher relation and dashboard surface.
12. Reviews, rating aggregate, disputes and governance audit.
13. Persistent notification/outbox system.
14. Persisted embedded chat with SignalR primary and polling fallback.
15. Catalog and qualification reference-resource storage.
16. Existing DC/React runtime and shared localization/CSS modules.

## 7. Findings

### F-001 — Identity initialization environment breach

- Classification: **Production Bug**
- Severity: Critical
- Evidence: `Program.cs` calls `InitializeIdentityAsync(app.Environment.IsDevelopment())` for every environment except `Testing`. The argument controls migration behavior; it does not prevent role/catalog/demo seed execution. `InitializeIdentityCoreAsync` explicitly detects Staging and creates staging demo users.
- Root Cause: Development gating was applied to the method argument rather than the method invocation.
- User Impact: Staging data can be created or modified during app startup; Production executes seed repair despite the stated no-seed contract.
- Architecture Impact: Startup mutates persistent state outside the authorized deployment/migration process.
- Security Impact: Staging demo identities are provisioned by application startup.
- Financial Impact: None direct; startup mutation can block or destabilize deployment.
- Fix: In a separate production-correctness pass, invoke identity initialization only inside an explicit Development environment guard. Preserve fail-fast configuration validation.
- Validation: Development fresh/initialized database tests; Staging/Production startup test proving no initializer invocation; build and integration regression.
- Status: Open; intentionally not changed in Phase 0–1.

### F-002 — Unsupported public teacher metrics

- Classification: **Production Bug**
- Severity: High
- Evidence: `TeacherProfile.CompletedOrders` is returned and used for sorting but repository search found no production writer. `ResponseTimeMinutes` is accepted in `UpdateTeacherProfileRequest` and written by the teacher.
- Root Cause: Profile presentation fields were introduced without event-derived projections.
- User Impact: Students can see or sort by values that do not prove actual performance.
- Architecture Impact: Mutable profile data is mixed with computed marketplace reputation data.
- Security Impact: No direct privilege escalation; creates integrity/trust risk.
- Financial Impact: Misleading indicators can influence purchase decisions.
- Fix: Do not label or rank these fields as measured performance. Define persisted-event formulas before adding public metrics.
- Validation: Contract tests for absent/insufficient data; formula tests; query tests proving values derive from completed records.
- Status: Open; no code change in this pass.

### F-003 — Production providers are intentionally unavailable

- Classification: **Deployment**
- Severity: Critical
- Evidence: DI registers `MockPaymentProvider` and `MockLiveSessionLinkProvider`; Production validation rejects both. Automatic financial release is also rejected by options validation.
- Root Cause: Real external providers and approved settlement policy have not been integrated.
- User Impact: Production payment and live-session completion cannot operate.
- Architecture Impact: Correct fail-closed behavior prevents unsafe startup.
- Security Impact: A real provider must preserve callback verification, secret handling and idempotency.
- Financial Impact: Production financial processing is unavailable; bypassing validation would be unsafe.
- Fix: Keep fail-closed validation. Integrate approved providers in a separate scoped pass.
- Validation: Provider sandbox contract, forged/duplicate callback, concurrency, refund and settlement tests.
- Status: Open prerequisite; do not weaken validation.

### F-004 — Local file storage is not an App Service production storage design

- Classification: **Deployment**
- Severity: High
- Evidence: `LocalFileStorageService` is registered for every environment; the product stores private qualification, request, delivery, session and governance files.
- Root Cause: No durable shared/object storage provider is registered for hosted environments.
- User Impact: Files may be unavailable after instance replacement or across scaled instances.
- Architecture Impact: File metadata can outlive physical content.
- Security Impact: Private-file access, encryption, malware scanning and retention are not proven for Production.
- Financial Impact: Lost delivery evidence can affect refunds and disputes.
- Fix: Select and validate a durable private storage provider before Production; retain existing storage abstraction and controller ownership checks.
- Validation: Cross-instance read, restart durability, authorization, traversal, signature, size, content-disposition and retention tests.
- Status: Open.

### F-005 — Revision is not tied to its delivery version

- Classification: **API Bug**
- Severity: High
- Evidence: `RevisionRequest` stores `OrderId`, reason, sequence and timestamp but no `DeliveryId`; deliveries are immutable and independently versioned by creation order.
- Root Cause: Revision sequencing was modeled at order level only.
- User Impact: With multiple deliveries, the exact artifact being revised is ambiguous.
- Architecture Impact: Timeline and dispute evidence cannot establish a direct revision-to-delivery relation.
- Security Impact: Ownership remains enforced; evidentiary ambiguity remains.
- Financial Impact: Ambiguity can affect settlement and dispute decisions.
- Fix: Address in the second vertical slice after the audit timeline, with an explicit migration and backward-data strategy approved first.
- Validation: FK integrity, immutable version, concurrency, settlement guard and dispute regression tests.
- Status: Open.

### F-006 — Favorites list is unbounded

- Classification: **API Bug**
- Severity: Medium
- Evidence: favorite add/remove is idempotent and uniquely constrained, but the list contract returns the owned collection without pagination.
- Root Cause: Initial saved-teacher scope omitted list growth.
- User Impact: Large favorite lists can increase response and render cost.
- Architecture Impact: Violates the repository rule that potentially unbounded lists are paginated.
- Security Impact: Ownership/publication checks remain required on every page.
- Financial Impact: None direct.
- Fix: Add deterministic cursor/page pagination to the existing endpoint; do not create another favorites API.
- Validation: boundaries, stable ordering, removed/unpublished teacher behavior and ownership tests.
- Status: Open.

### F-007 — Additional portfolio content has no moderation state

- Classification: **API Bug**
- Severity: High
- Evidence: qualification-generated samples are approval-derived, but additional teacher samples can be published without a distinct moderation workflow/status.
- Root Cause: Sample visibility and content approval are represented as the same decision.
- User Impact: Unreviewed showcase content may be publicly visible.
- Architecture Impact: Approved qualification evidence and teacher-authored portfolio content have different trust levels but share the public surface.
- Security Impact: Uploaded/linked content moderation and abuse handling are unproven.
- Financial Impact: Reputation and purchase decisions may be affected.
- Fix: Resolve moderation ownership/rules before extending the sample model.
- Validation: public leakage, ownership, archive/order and rejected-content tests.
- Status: Open.

### F-008 — Broad roadmap requires unresolved product rules

- Classification: **Business Rule**
- Severity: High
- Evidence: matching weights, metric formulas, capacity statuses, learning outcomes, badges, referral accounting, achievements, verification providers and content moderation are not encoded in current behavior.
- Root Cause: Product semantics are requested as examples rather than approved rules.
- User Impact: Guessing would produce inconsistent or misleading behavior.
- Architecture Impact: Premature entities and parallel workflows would become durable debt.
- Security Impact: Privacy and authorization boundaries differ by decision.
- Financial Impact: Matching, payments, referrals, capacity and settlement can affect transactions.
- Fix: Answer only the decision questions in Section 8 before implementing affected capabilities.
- Validation: Rule-specific acceptance criteria before code.
- Status: Blocked by decision.

### F-009 — SignalR scaling and frontend security posture are not production-proven

- Classification: **Technical Debt**
- Severity: Medium
- Evidence: embedded chat is correctly authorized and persisted, but no scale-out backplane/sticky-session proof was found. The DC/Babel runtime requires CSP allowances for inline/evaluated scripts.
- Root Cause: Current runtime favors embedded buildless pages and single-instance simplicity.
- User Impact: Multi-instance realtime delivery may be inconsistent; broader CSP allowances reduce browser defense depth.
- Architecture Impact: Scaling and CSP hardening are constrained by the current frontend runtime.
- Security Impact: `unsafe-inline`/`unsafe-eval` increase XSS impact if another sanitization boundary fails.
- Financial Impact: None direct.
- Fix: Do not redesign now. Validate hosting topology and reconnect/fallback behavior; separately inventory hardcoded/script injection boundaries.
- Validation: multi-instance SignalR test, reconnect/fallback stop test, stored/reflected XSS and CSP review.
- Status: Open, not a Phase 0–1 change.

## 8. Business Rule Decisions Required

Only decisions not safely derivable from code are listed.

| ID | Exact decision question | Why it matters / affected scope | Financial / authorization impact | Safest deferred default |
|---|---|---|---|---|
| BR-01 | What exact numerator, denominator, eligible statuses, exclusion rules, subject attribution and UTC date window defines each public/teacher metric? | Teacher cards, search, analytics, badges | Can influence purchase; public/private field split required | Show no metric rather than zero or a profile-entered substitute |
| BR-02 | Which order/request statuses consume daily and concurrent capacity, and do unpaid accepted orders reserve capacity? | Acceptance transaction, teacher settings, matching | Can reject/accept paid work; atomic authorization-owned update required | Keep current no-capacity claim; retain existing conflict checks |
| BR-03 | Who owns matching weights, how are versions audited, and what deterministic tie-break is used? | Search/matching service and explanations | Ranking can materially affect teacher revenue | Keep current transparent filters/sorts |
| BR-04 | What are the complexity categories, inputs, override authority and relationship to price? | Requests, teacher/admin estimate, uploads | Must not auto-price from an unverified estimate | Collect current request facts only |
| BR-05 | Who may record Covered, Practiced, Reviewed, Understanding, Proficiency and Mastery, and what evidence is required? | Student learning timeline/analytics | Private education record; misleading mastery risk | Report only objective completed activities |
| BR-06 | What are badge/achievement criteria, rule versions, award time, recalculation and revocation rules? | Reputation and motivational systems | Can influence purchases and falsely imply mastery | Display only existing active qualification verification |
| BR-07 | Who moderates additional portfolio content, before or after publication, and what archive/order rules apply? | Samples, public teacher profile, file/link storage | Public abuse/reputation risk | Publish approval-derived qualification samples only |
| BR-08 | What quality trend windows, denominators and thresholds are approved, and what constitutes a confirmed violation? | Quality dashboard, disputes, enforcement | Restricted moderation data; must not auto-suspend | Keep raw review decisions and manual enforcement separate |
| BR-09 | Is the current money state legally an escrow, internal hold or delayed settlement, and when is settlement/refund eligibility reached? | Payments, ledger, UI terminology, disputes | Direct legal/accounting/financial impact | Keep automatic release disabled and avoid escrow claims |
| BR-10 | Which verification providers/evidence/reviewers/expiry/revocation/appeal rules are approved? | Phone, identity, degree and qualification trust | Identity-document privacy and fraud risk | Expose only confirmed email and active qualification |
| BR-11 | What distinct input, pricing, scheduling, cancellation, payment and completion rules apply to each proposed service type? | Catalog, request/session lifecycle | Transaction and refund behavior differs | Retain the four existing service types |
| BR-12 | What is the maximum comparison set and approved public fields? | Teacher comparison | Hidden/private metrics must not leak | Defer comparison until public metrics are corrected |
| BR-13 | Is a content feed in MVP, who publishes/moderates, upload vs link, comments/reports, retention and storage budget? | New content/moderation domain | Abuse, copyright and storage cost | Do not implement a feed |
| BR-14 | What are referral eligibility, trigger, value, expiry, cap, anti-fraud, refund, accounting and regional legal rules? | Referral/credit ledger and checkout | Direct financial/legal/fraud impact | Do not implement or repurpose coupons |
| BR-15 | Are revision reason and requested changes separate, and when may a dispute permit revision after settlement? | Delivery/revision/dispute lifecycle | Settlement evidence and policy | Preserve current allowance and prohibit post-completion revision |

## 9. Security and Financial High-Risk Areas

### Confirmed protections

- JWT issuer, audience, signature and lifetime validation.
- Suspended-user and security-stamp recheck during token validation.
- Hashed refresh tokens, rotation, replay-family containment and session revocation on password reset/change.
- Email confirmation/password-reset non-enumeration and rate limits.
- Role policies plus resource ownership in service methods.
- SignalR hub authentication and conversation membership.
- File extension, MIME, signature, size and path-key validation.
- Signed/idempotent payment callbacks and transactional ledger operations.
- Decimal money and snapshotted order terms.
- Production configuration fail-fast for mock providers, insecure keys, invalid email sender and non-HTTPS/local URLs.

### Unresolved high risks

| Risk | Classification | Severity | Required action before Production |
|---|---|---:|---|
| Startup identity/seed mutation outside Development | Production Bug | Critical | Environment-gate the initializer invocation and prove with startup tests |
| No real payment provider or approved settlement semantics | Deployment | Critical | Integrate provider and approve terminology/policy; retain fail-closed behavior |
| No real live-session link provider | Deployment | Critical | Integrate and security-test provider |
| Local file storage for private evidence/deliveries | Deployment | High | Durable private shared/object storage, retention and access validation |
| No malware scanning evidence for uploaded documents | Technical Debt | High | Approve scanning/quarantine strategy before broad public uploads |
| Unsupported public performance fields | Production Bug | High | Remove performance claim or compute from real persisted events |
| Unmoderated additional portfolio publication | API Bug | High | Resolve moderation workflow before expansion |
| CSP requires inline/eval allowances | Technical Debt | Medium | XSS audit and incremental CSP hardening without frontend rewrite |
| SignalR multi-instance behavior not proven | Technical Debt | Medium | Validate App Service topology/backplane/stickiness and fallback recovery |

## 10. Recommended First Vertical Slice

### Prerequisite production-correctness pass

Before roadmap implementation, fix F-001 only: Development-only identity initialization. This is not a product redesign or roadmap slice; it restores the stated deployment contract.

### First product slice: owned order lifecycle timeline from existing evidence

Goal: show students and teachers a chronological, localized timeline for one owned order, using only already-persisted status history, immutable deliveries and revision records. Do not infer missing payment, refund or dispute events from current state.

Why first:

- It is the highest recommended priority supported by repository evidence.
- It reuses existing immutable records and ownership rules.
- It creates visible user value without inventing scoring, money or learning semantics.
- A first version can avoid a database migration.
- It exposes the exact evidence gap that the later revision-to-delivery slice must solve.

Proposed minimal contract:

- An explicit timeline response DTO with `eventType`, `occurredAt`, safe actor role/display label and allowlisted metadata.
- Deterministic ordering by timestamp then stable identifier.
- An owned order timeline endpoint under the existing Orders surface.
- Student/Teacher dashboard rendering with loading, empty, error, RTL and mobile states.
- No internal notes, storage keys, payment payloads, reviewer data or financial audit internals.

Explicit non-goals:

- No new event bus or generic event-sourcing framework.
- No new timeline table in the first slice.
- No reconstruction of events from current status.
- No learning timeline.
- No admin/quality timeline.
- No payment/escrow terminology change.
- No revision schema change; the missing delivery link remains the next slice.

## 11. Exact Files Likely Involved in the First Slice

No files below were changed in this pass.

| File | Expected focused change |
|---|---|
| `src/Tafseel.Application/Orders/OrderContracts.cs` | Add explicit timeline DTO and service contract method |
| `src/Tafseel.Infrastructure/Orders/OrderService.cs` | Owned, no-tracking projection from existing histories/deliveries/revisions with safe metadata |
| `src/Tafseel.Api/Controllers/OrdersController.cs` | Add the owned timeline endpoint using existing policy/identity conventions |
| `Tafseel-Student-Dashboard.dc.html` | Render order timeline in the existing request/order detail surface |
| `Tafseel-Teacher-Dashboard.dc.html` | Render the same contract for the owned teacher view |
| `js/locales.js` | Arabic/English event labels, empty/error/loading text |
| `css/tafseel.css` | Only if existing timeline/list primitives cannot cover responsive/RTL presentation |
| `tests/Tafseel.IntegrationTests/Phase5OrderTests.cs` | API persistence, ordering, authorization and immutable-event coverage |
| `tests/Tafseel.IntegrationTests/FrontendPhaseTests.cs` or the existing dashboard frontend test file | Contract use, localization keys and no-fake-fallback assertions |

Expected migration impact: none for the first slice. If inspection during implementation proves an event cannot be represented without manufacturing it, omit that event rather than adding speculative schema.

## 12. Targeted Tests Required for the First Slice

### Integration

1. Student owner sees only persisted events for their order.
2. Teacher owner sees the same safe event stream.
3. Unauthenticated request returns 401.
4. Unrelated Student and unrelated Teacher cannot discover the order/timeline.
5. Wrong role cannot bypass ownership.
6. Events are ordered deterministically when timestamps match.
7. Each delivery version remains separately represented.
8. Each revision remains separately represented.
9. Internal notes, storage keys, callback payloads and moderation data are absent.
10. Pagination is added if the endpoint can become unbounded; otherwise an explicit bounded lifecycle invariant is proven.
11. Existing order acceptance, payment, delivery, revision and completion tests remain green.

### Frontend

1. Loading, empty, API error and success states.
2. Arabic RTL and English labels.
3. Localized date/time formatting.
4. Mobile wrapping and keyboard/screen-reader semantics.
5. No placeholder or inferred events when the API returns none.
6. Student and teacher dashboards call the same canonical endpoint rather than duplicating state logic.

### Narrow validation sequence for the later implementation pass

```text
dotnet build src/Tafseel.Api/Tafseel.Api.csproj -c Release --no-restore
dotnet test tests/Tafseel.Domain.Tests/Tafseel.Domain.Tests.csproj -c Release --no-build
dotnet test tests/Tafseel.IntegrationTests/Tafseel.IntegrationTests.csproj -c Release --filter Phase5Order
targeted frontend allowlist/syntax tests
git diff --check
```

Wider SQL Server and regression suites should run only after the narrow checks pass.

## 13. Validation Evidence for This Audit Pass

This was a read-only architecture/capability pass. No claim is made that runtime tests pass.

Inspection performed:

- Solution/project and test inventory.
- DbContext entity/configuration and migration inventory.
- Controller/routes, service contracts and policy inventory.
- Teacher qualification, marketplace, order, live-session, finance, messaging, governance and authentication flows.
- Frontend page/module/localization/runtime inventory.
- GitHub Actions and production configuration contract inventory.
- Repository searches for metric writers, lifecycle histories, provider registrations and startup initialization.

Not performed:

- No build or test execution was required to validate a Markdown-only report.
- No application startup.
- No external provider call.
- No database connection.
- No migration generation or application.
- No Staging or Production validation.

## 14. Files Changed

| File | Reason | Compatibility |
|---|---|---|
| `TAFSEEL_PHASE_0_1_AUDIT_REPORT.md` | Phase 0 architecture inventory and Phase 1 capability gap report | Documentation-only; no runtime impact |

No source, test, workflow, configuration, migration or lock file was modified by this pass.

## 15. Risks

### Critical

- Production payment and live-session providers are absent and correctly fail closed.
- Identity initialization currently violates the Development-only contract.
- Referral, feed, identity verification and achievement features are unsafe to invent without product/security rules.

### High

- Public performance data integrity is not sufficient for the requested confidence metrics.
- App Service file durability/privacy is not proven.
- Revision evidence does not directly identify the delivery being revised.
- Capacity/matching/quality formulas are unresolved.
- Additional portfolio publication lacks a moderation state.

### Medium

- Favorites list is unbounded.
- SignalR multi-instance behavior is unverified.
- Current buildless frontend constrains CSP hardening.
- Analytics event coverage is incomplete.

### Low

- Existing persistent notification capability should be preserved rather than rebuilt.

## 16. Final Verdict

**READY FOR TARGETED DEVELOPMENT**

The core architecture is coherent and many lifecycle foundations are already implemented, but Production readiness is not proven. Critical deployment/provider gaps and the environment-gating bug remain. Roadmap work should proceed in small vertical slices after the Development-only initializer contract is restored.

## 17. Next Focused Pass

Goal: fix and validate Development-only identity initialization, then stop.

Scope:

- Guard the `InitializeIdentityAsync` invocation so it cannot execute in Staging or Production.
- Preserve Development first-deployment behavior, configuration validation and fail-fast behavior.
- Add focused tests proving initializer behavior by environment.

Likely files:

- `src/Tafseel.Api/Program.cs`
- existing startup/identity integration test file, likely `tests/Tafseel.IntegrationTests/RoleBootstrapTests.cs`

Tests:

- Development initialized/fresh behavior.
- Staging and Production no-initializer behavior.
- Release build and relevant integration regression.

Explicit non-goals:

- No seed redesign.
- No background service.
- No migration.
- No provider integration.
- No roadmap feature implementation.
- No deployment, commit or push.
