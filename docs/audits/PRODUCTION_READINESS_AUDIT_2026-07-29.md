# Tafseel — Full Production-Readiness Audit
Date: 2026-07-29
Method: Evidence-first static audit across 5 parallel deep-dive passes (Business Logic, Security, Backend/Database, Frontend, Architecture/Code Quality/Scalability). Every finding below is cited to an exact file, line range, and (where feasible) a direct code quote. No claim in this report is speculative unless explicitly marked **Needs Investigation**.

No code was changed as part of this audit. Nothing was committed.

---

## 1. Executive Summary

Tafseel's backend is architecturally sound — clean dependency direction (verified by an existing architecture-fitness test), a rich, invariant-enforcing domain model, consistent optimistic-concurrency handling on most write paths, and a payment-webhook/security posture that is genuinely well engineered (timing-safe HMAC verification, replay protection via a unique event-id constraint, JWT re-validation of suspension/security-stamp on every request, no SQL injection, no CSRF exposure, no IDOR in any resource-ownership check traced).

However, the audit surfaced **6 Critical-severity defects**, several of which are launch-blocking:
- A page crash on the "Request an explanation" flow (Tafseel-Request.dc.html) — the primary paid-work-commissioning flow is completely broken for every visitor.
- A one-line bug in the shared error-formatting helper (`js/api.js`) that shows raw `⟦missing:api_error_*⟧` placeholder strings instead of readable errors for **92% of all backend validation error codes** — this affects nearly every write path in the app (bookings, payments, coupons, applications, disputes).
- The "Education level" and "Service type" filters on Browse Teachers are wired to client-side fields that are never populated — choosing either filter **always returns zero results**, silently telling students the marketplace has no matching teachers when it does.
- Live-session payments are captured into escrow on webhook confirmation, but **no code path anywhere releases that money to the teacher, refunds the student, or allows a dispute to be opened** for a live session — money is captured and then permanently stranded.
- A revoked teacher qualification is enforced in Marketplace search/comparison but **not** in the order-creation/acceptance path — a teacher revoked for a policy/quality violation can still receive and accept paid work in the exact subject they were revoked for.
- A failed payment webhook is recorded but the domain's own `Payment.Fail()` method is never called — the payment silently gets stuck "Pending" forever with no retry path, and is incorrectly counted as real captured revenue in the reconciliation report.

Beyond these, the audit found a consistent *pattern*: several business rules (qualification eligibility, catalog price bounds, teacher-eligibility filtering) are implemented independently in 2–3 different services with different strictness, and the copies silently drift out of sync. This is the single most important architectural risk in the codebase — not any one bug, but the *absence of a shared source of truth* for a handful of rules that recur across Marketplace, Orders, and Live Sessions.

The frontend has good bones (a real skeleton/atomic-render pattern exists and is used correctly on several pages) but is inconsistently applied, and contains multiple race conditions where rapid user interaction can display stale data with no visual sign anything is wrong.

**Bottom line: this system is not production-ready as-is**, but the defects are concentrated and fixable — most Critical items are small, surgical fixes (a missing null check, an unwired domain method call, a missing query filter), not architectural rewrites.

---

## 2. Critical Issues

### C1. Live-session escrow has no release, refund, or dispute path
**Severity:** Critical · **Category:** Business Logic
**Evidence:**
- `src/Tafseel.Application/Finance/FinanceContracts.cs:66-68` — `IFinancialService` exposes only `ReleaseOrderEscrowAsync(Order, ...)` and `SettleDisputeAsync(Order, ...)`, both typed to `Order`. No `LiveSessionBooking` equivalent exists anywhere.
- `src/Tafseel.Infrastructure/LiveSessions/LiveSessionService.cs:310-342` (`CancelAsync`, `CompleteAsync`, `MarkNoShowAsync`) — none call `IFinancialService` or touch `EscrowEntries`/ledger tables; they only mutate `LiveSessionBooking.Status`.
- `src/Tafseel.Infrastructure/Finance/FinancialService.cs:218-220` — `RefundAsync` explicitly throws `"live_session_refund_unsupported"` whenever `payment.LiveSessionBookingId is not null`.
- `src/Tafseel.Domain/Governance/Governance.cs:65-95` + `GovernanceContracts.cs:25-26` — `Dispute`/`OpenDispute` only accept `OrderId`; disputes cannot be opened for a live session at all.
- `FinancialService.cs:138-152` confirms live-session payments *are* captured into `EscrowEntryType.Held` on webhook confirmation.
**Root Cause:** The escrow-hold side of live-session payment was implemented; the release/refund/dispute-settlement side was never built for that payable type.
**Business Impact:** Every paid live session's money is captured and then permanently stranded regardless of outcome — a completed session never pays the teacher, a no-show compensates no one, a cancelled paid session cannot be refunded or disputed.
**Technical Impact:** `EscrowHeld` ledger balances grow monotonically with no offsetting entries; `ReconcileAsync` will misreport reconciliation for this payable type.
**Recommendation:** Add a live-session-aware release path (triggered from Complete/no-show/cancel outcomes) and extend disputes to support live-session payables — or explicitly disable real payments for live sessions until this exists.
**Affected Files:** `FinancialService.cs`, `LiveSessionService.cs`, `Governance.cs`, `GovernanceContracts.cs`, `FinanceContracts.cs`
**Confidence:** Confirmed

### C2. Revoked teacher qualification is not enforced on the order-creation path
**Severity:** Critical · **Category:** Business Logic / Architecture
**Evidence:**
- `src/Tafseel.Infrastructure/Orders/OrderService.cs:28-36,147-153` — the qualification-eligibility filter is `db.TeacherSubjectQualifications.Any(q => q.TeacherId == x.TeacherId && q.SubjectId == x.SubjectId)` — **no** `Status`/`RevokedAt` check.
- Compare `src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs:55-56,189-190`, which correctly require `q.Status == Approved && q.RevokedAt == null`.
**Root Cause:** The "is this teacher qualified" rule is implemented independently in 3 places (Search, Compare, Orders); Orders' copy was never updated to match the domain's revocation support.
**Business Impact:** A teacher revoked for a quality/policy violation disappears from search/comparison but can still receive Learning Requests and `Accept` them into paid Orders in the revoked subject — this defeats the purpose of revocation and is a trust/safety issue.
**Recommendation:** Extract one shared eligibility predicate/expression used by `SearchAsync`, `CompareAsync`, and `OrderService.CreateRequestAsync`/`AcceptAsync`.
**Affected Files:** `OrderService.cs`, `MarketplaceService.cs`
**Confidence:** Confirmed

### C3. Failed payment webhook never transitions Payment to Failed — no retry path, corrupts reconciliation
**Severity:** Critical · **Category:** Business Logic / Product
**Evidence:**
- `src/Tafseel.Infrastructure/Finance/FinancialService.cs:106-112` — on `!message.Succeeded`, records a `PaymentAttempt(..., Failed, ...)` and commits, but never calls `payment.Fail(now)`.
- `Payment.Fail(DateTimeOffset now)` exists (`src/Tafseel.Domain/Finance/Finance.cs:79-84`) but a repo-wide grep confirms it is **never called anywhere** in production code.
- `InitiateOrderPaymentAsync` (lines 24-30) treats any existing Payment row as terminal — same idempotency key replays the stale reference, a different key throws `payment_already_initiated`.
- `ReconcileAsync` (line 364) sums `Payments.Where(x => x.Status != Failed)` — a payment that failed at the provider but was never marked Failed is counted as real captured revenue.
**Business Impact:** A customer whose card is declined has no way to retry — their only way out is cancelling the entire order and restarting the whole request→accept cycle. Financial reconciliation reports overstate real captured revenue.
**Recommendation:** Call `payment.Fail(now)` in the webhook-failure branch; add a re-initiation path for orders whose existing Payment is `Failed`.
**Affected Files:** `FinancialService.cs`, `Finance.cs`, `PaymentsController.cs`
**Confidence:** Confirmed (also confirmed via test-absence — `FinanceTests.cs` never exercises `Payment.Fail`)

### C4. `replyHours` is undefined — Tafseel-Request.dc.html crashes on every render
**Severity:** Critical · **Category:** Frontend
**Evidence:** `Tafseel-Request.dc.html:546` — `hours: String(replyHours)` inside the unconditionally-evaluated `renderVals()` return object. `replyHours` is never declared anywhere in the file (confirmed via repo-wide search — this is the only occurrence).
**Root Cause:** A variable was renamed/removed elsewhere but this one reference was missed.
**Business Impact:** The entire "Request an explanation" flow — the primary way students commission paid custom work — is broken for every visitor; the page cannot render past the error boundary.
**Technical Impact:** Reproduced directly: a Node harness that boots every page's `Component` and calls `renderVals()` throws `ReferenceError: replyHours is not defined` only for this page (11/12 pages pass).
**Recommendation:** Define `replyHours` from real data (e.g. the teacher's response-time field) or remove the `hours` interpolation.
**Affected Files:** `Tafseel-Request.dc.html`
**Confidence:** Confirmed (directly reproduced)

### C5. Shared error-formatting helper shows raw `⟦missing:...⟧` strings for 92% of backend error codes
**Severity:** Critical · **Category:** Frontend
**Evidence:** `js/api.js:185-190`:
```js
var key = 'api_error_' + error.code;
var translated = Tafseel.t(key);
if (translated !== key) return translated;
```
`js/tafseel.js:326-328` — `t()` returns `'⟦missing:' + keyOrEnglish + '⟧'` for a missing key, not the key itself, so `translated !== key` is true even when the key is missing. Confirmed by direct execution: calling this against a real backend code (e.g. `coupon_percent_invalid`) returns the literal string `⟦missing:api_error_coupon_percent_invalid⟧`. Cross-referencing all 190 distinct `DomainException` codes thrown across the backend against the 18 `api_error_*` keys defined in `locales.js`: **175 of 190 codes (92%) have no translation** and hit this bug.
**Business Impact:** Nearly every business-rule rejection (invalid coupon, unavailable slot, duplicate application, invalid session time, payment not allowed, etc.) surfaces as unreadable garbage instead of a clear message, across booking, payment, coupons, applications, and disputes.
**Recommendation:** Fix the sentinel check to `if (!translated.startsWith('⟦missing:'))`, then triage which of the 175 uncovered codes need real translations vs. can rely on the English fallback message.
**Affected Files:** `js/api.js`, `js/tafseel.js`, `js/locales.js`
**Confidence:** Confirmed (directly reproduced, exact count computed)

### C6. Browse Teachers' "Education level" and "Service type" filters always return zero results
**Severity:** Critical · **Category:** Frontend / Product
**Evidence:** `Tafseel-Browse-Teachers.dc.html:427-438` maps every teacher with `levels: [], services: []` hard-coded — never populated from the API response. The filter predicate (`:600-601`) is `if (s.level !== 'All levels' && !t.levels.includes(s.level)) return false;` — always false since `levels` is always empty. `src/Tafseel.Application/Marketplace/MarketplaceContracts.cs:23-38` confirms `TeacherCardDto` (the actual response shape) has no such field, while the server-side `TeacherSearch` contract (lines 7-21) already supports `EducationLevelId`/`ServiceTypeId`/etc. — but the frontend's fetch (`:419-423`) only ever sends `search`, `subjectId`, `pageSize`.
**Business Impact:** A student who filters by education level or service type silently sees "No teachers match these filters" every single time — a core discovery feature is completely non-functional and actively misleads users into believing the marketplace is empty.
**Recommendation:** Populate the filter fields from real data and send the already-supported server-side query parameters instead of filtering client-side over an empty array.
**Affected Files:** `Tafseel-Browse-Teachers.dc.html`, `MarketplaceContracts.cs`
**Confidence:** Confirmed

---

## 3. High Priority Issues

| # | Title | Category | One-line impact | Confidence |
|---|---|---|---|---|
| H1 | `CancellationWindowHours` stored/validated but never checked in `LiveSessionBooking.Cancel()` | Business Logic | Either party can cancel a paid, confirmed session seconds before it starts with zero penalty; compounds C1 (money then stuck) | Confirmed |
| H2 | Catalog `MinPrice`/`MaxPrice` enforced only at live-session booking time, not at `TeacherService` creation/update or custom-order acceptance | Business Logic / Backend | Teachers can price outside admin-configured bounds; listing looks normal, booking fails with a confusing "not found" error instead of a pricing message. Cross-confirmed by two independent audit passes. | Confirmed |
| H3 | `UnauthorizedAccessException` from every controller's `UserId()` helper surfaces as HTTP 500, not 401 | Backend | A client with a missing/invalid `sub` claim gets an opaque 500 "unexpected_error" instead of 401 — looks like a server bug, triggers false alarms | Confirmed |
| H4 | Learning-request creation has no idempotency key or DB uniqueness guard | Backend | A double-click/network-retry creates two independent requests, potentially two accepted Orders and two Payments for what the student meant as one | Confirmed |
| H5 | Hardcoded Staging Admin password (`admin@gmail.com` / `@Admin123`) committed to source and documented in the deployment runbook | Security | If the seeding path is reachable on the public host referenced in the docs, this is a full Admin takeover of a live, internet-facing environment with a trivially guessable password. **Recommend treating as Critical and rotating immediately regardless of current reachability.** | Confirmed (credential); reachability today is Needs Investigation |
| H6 | Browse Teachers filters (rating/price/language/verified) all run client-side over a single capped 100-teacher fetch | Frontend | Beyond 100 teachers, filter results silently under-report with no indication of truncation | Confirmed |
| H7 | `loadTeachers()` on Browse Teachers has no race guard | Frontend | Rapidly switching the Subject dropdown can display teachers for a subject no longer selected — the guarded pattern exists elsewhere in the same file but wasn't applied here | Confirmed |
| H8 | Payment page's coupon "Apply" never calls the backend — any non-empty string shows a fake "Coupon applied" success state | Frontend | Students get false-positive confirmation on invalid/expired codes and never see a real discount preview before paying; the backend's `CouponQuoteDto`/`QuoteAsync` exists but is never exposed via any endpoint | Confirmed |
| H9 | Book-Session slot loading has no race guard on duration/timezone changes; timezone is a free-text input with no debounce | Frontend | Rapid duration clicks or per-keystroke timezone typing can display slots for a selection the user no longer has active | Confirmed |
| H10 | Ambiguous i18n reverse-lookup: 147 pairs of locale keys share identical English text but different Arabic translations, and later-defined keys silently win | Frontend | Some Arabic-mode buttons/labels show a translation written for a different feature (e.g. "Edit" resolving to the wrong Arabic word depending on definition order) | Confirmed |
| H11 | Teacher-application review queue (`GET /teacher-applications/queue`) has no pagination | Architecture / Scalability | The one list endpoint in the moderation surface not built against `PagedResult<T>`; it is precisely the growth point named in this audit's own scalability question | Confirmed |

---

## 4. Medium Issues

| # | Title | Category | Confidence |
|---|---|---|---|
| M1 | Duplicate-dispute guard blocks any second dispute on an order forever, even after the first was fully resolved (unconditional `AnyAsync`, no `Status != Resolved` filter) | Business Logic | Confirmed |
| M2 | Coupons have no per-student or total redemption-count limit — a valid code can be reused unboundedly | Business Logic | Likely |
| M3 | Custom-order `FinalPrice` at `AcceptAsync` is never compared against the service's advertised price or the student's stated `Budget` (which is otherwise unused) | Business Logic | Needs Investigation |
| M4 | Inconsistent 201/Location semantics — 12 `Created("", ...)` calls with an empty Location header, and 2 Governance create-actions return bare 200 DTOs instead of 201 | Backend | Confirmed |
| M5 | Catalog admin entities (Subjects/Topics/EducationLevels/Languages/ServiceCatalogItems) have no concurrency token — mutate endpoints accept no `If-Match`, unlike every other domain in the app | Backend | Confirmed |
| M6 | `SetCouponActive` (PATCH) skips the optimistic-concurrency check that `Coupon.Update` (PUT) enforces on the same aggregate | Backend | Confirmed |
| M7 | Notification-outbox dispatcher performs ~4 DB round-trips per item inside a `foreach` (up to 80 calls per 10s poll cycle) | Database / Performance | Confirmed |
| M8 | Chat `SendAsync` eagerly loads the entire message history of a conversation just to append one message — unbounded growth over the conversation's life | Database / Performance | Confirmed |
| M9 | "Exam Night Emergency Session" toggle only adds a price premium — never actually forces a 90-minute same-day slot as advertised | Frontend / Product | Confirmed |
| M10 | Attachment upload failures on Book-Session and Request are silently swallowed after the booking/request itself succeeds | Frontend | Confirmed |
| M11 | "Save & exit" on the Request wizard is a plain navigation with no save and no warning — all progress is silently discarded | UX | Confirmed |
| M12 | "Continue with Google" on both Auth screens is a non-functional decoy that only shows a "coming soon" toast | UX | Confirmed |
| M13 | Footer "Privacy"/"Terms" and the registration consent checkbox reference policies that don't exist as pages anywhere in the app — a real legal-exposure issue, not just a dead link | UX / Legal | Confirmed |
| M14 | Admin coupon creation has far weaker client validation than the domain's own invariants, and any rejection would show the raw `⟦missing:...⟧` string (compounds C5) | Frontend | Confirmed |
| M15 | Four different, inconsistent money-formatting implementations across the app, one with reversed `(currency, amount)` parameter order vs. the others | Frontend | Confirmed |
| M16 | Teacher-Apply's subject-change topic reload has no race guard, even though the same file's video-duration probe correctly guards the identical class of race | Frontend | Confirmed |
| M17 | Teacher-eligibility predicate (published + confirmed + not suspended + qualification checks) duplicated verbatim between Marketplace `SearchAsync` and `CompareAsync` | Architecture | Confirmed |
| M18 | `NotificationOutboxWorker` has no row-claim locking across instances — safe today (single instance, optimistic-concurrency catches conflicts) but will do N-way duplicate work per poll cycle at N horizontal instances, and the second-conflict exception is silently swallowed with no logging | Scalability | Confirmed (design-for-scale gap, not a live bug) |

---

## 5. Low Issues

| # | Title | Category |
|---|---|---|
| L1 | `RevokeQualificationAsync` is the only mutating teacher-application action with no `If-Match`/expected-version parameter (mitigated by a serializable app-lock, but breaks the platform's otherwise-consistent contract) | Business Logic |
| L2 | `TeacherApplication.AttachDemo(string,int,int)` weaker overload skips the minimum-duration check the production overload enforces — not reachable in prod today, but a live trap for future callers | Business Logic |
| L3 | `DomainException` codes that describe "not found" states but don't contain the literal substring `not_found`/`not_owned` (e.g. `payment_not_confirmed`, `demo_required`) silently mis-map to 400 instead of 404 | Backend |
| L4 | Public teacher-profile view does a synchronous per-sample file-existence disk check on every anonymous page view | Backend / Performance |
| L5 | Every dispute mutation (including "add one message") eagerly loads the dispute's full Messages+Evidence+History+Decisions collections | Database |
| L6 | Free-text `Contains()` search on user/profile fields has no full-text index — guaranteed table scan as data grows (impact needs load-testing to confirm) | Database |
| L7 | `RefreshToken → ApplicationUser` FK has no explicit `OnDelete`, defaulting to Cascade — inconsistent with the `Restrict`-everywhere convention used by every other user-owned relationship (currently dormant — no user-delete feature exists) | Database |
| L8 | `sp_getapplock`-based locks silently no-op on any non-SQL-Server EF provider (by design, for test portability) — a real risk only if the DB provider is ever changed | Database |
| L9 | `CatalogController`'s generic PUT has inconsistent partial-vs-full-replace semantics depending on the `{type}` route parameter (qualification-topics merges omitted fields; every other type nulls them out) | Backend |
| L10 | `ServiceCatalogItem` write DTOs omit several fields (`Type`, `IsPublic`, `MinPrice`, `MaxPrice`, etc.) that the read DTO exposes — may be intentional fixed-config, flagged for confirmation | Backend |
| L11 | Admin/Favorites coupon & favorite-teacher list endpoints have no pagination (low real-world volume today) | Scalability |
| L12 | `SearchAsync`/`CompareAsync` in `MarketplaceService` exceed ~120-150 lines each, mixing filter/sort/projection concerns | Code Quality |
| L13 | Unexplained `new List<TimelineRow>(87)` capacity hint in `OrderService.cs` — looks like a copy-paste leftover | Code Quality |
| L14 | CSP includes `script-src 'self' 'unsafe-eval'` (required today by the runtime Babel/JSX transpiler); compensating control verified — all `{{ }}` interpolation renders via React text nodes, never raw HTML | Security |
| L15 | `Refund`/`RequestWithdrawal`/`ProcessWithdrawal` endpoints lack endpoint-level rate limiting (already gated by permission-based authorization, so abuse surface is limited to authenticated privileged accounts) | Security |
| L16 | Anonymous avatar endpoint permits low-value user-existence enumeration (has-avatar vs. not) | Security |
| L17 | Teacher demo-upload endpoint returns the raw internal `StorageKey` in its response instead of a client-safe DTO, unlike every other upload endpoint in the codebase | Security |
| L18 | Landing footer "Messages" link points to the login page instead of any messaging surface | UX |
| L19 | Featured Teachers/Services sections on Landing have no loading skeleton (Subjects does) — Services visibly swaps placeholder marketing copy for real data after load | UX |
| L20 | `css/tafseel.css` contains ~35 dead classes from a removed `Tafseel-Chat.dc.html` page and an unused dashboard-shell/table/pagination system | Code Quality |
| L21 | Duplicate/conflicting `@keyframes`/rule blocks for `tf-blob-drift`, `tf-float`, `tf-glow-cta` in the same stylesheet | Code Quality |
| L22 | Mobile responsive overrides in `tafseel.css` depend on fragile `[style*="..."]` substring selectors matching exact inline-style text, which will silently stop matching if that inline style is ever edited | Frontend |
| L23 | Teacher-Apply's custom `errorText()` ignores field-level validation errors that the shared `Tafseel.api.errorMessage()` already knows how to surface | Frontend |
| L24 | Chat widget mixes hard-coded English strings ("No conversations yet", "No messages yet") with properly-localized ones in the same file | Accessibility |
| L25 | Chat compose form has no duplicate-submission guard, no in-flight disabling, and no error surfacing on a failed send | Frontend |
| L26 | Teacher-Apply status badges carry hard-coded hex fallback colors that bypass the design-token system (currently unreachable dead code, latent risk if load order ever changes) | Frontend |
| L27 | "Verified teacher" checkmark badge relies on a `title` tooltip only, with no `aria-label` — invisible to screen readers and touch users | Accessibility |
| L28 | Misleading "Searching…" toast on Landing shows for a whitespace-only search query (truthiness check doesn't use the trimmed value) | Frontend |

---

## 6. Architectural Risks

1. **No single source of truth for recurring business rules.** The same eligibility/pricing rules are implemented independently in Marketplace, Orders, and Live Sessions, and have already drifted (C2, H2, M17). This is the audit's single biggest structural risk — it will keep producing this exact class of bug every time one service is updated and its siblings aren't.
2. **Financial state machine has a gap on the failure path.** `Payment.Fail()` exists in the domain model but is architecturally disconnected from the one place that should call it (C3) — the domain is well-designed, but the wiring is incomplete.
3. **Positive finding:** dependency direction is clean and *enforced by an existing automated architecture-fitness test* (`tests/Tafseel.ArchitectureTests`) — Domain has zero references to Application/Infrastructure, Application has zero references to Infrastructure. This is a genuinely strong foundation to build the above fixes on top of.
4. **Positive finding:** the domain model is rich, not anemic — status transitions, invariants, and concurrency tokens are enforced inside entity methods almost everywhere (the two gaps found — Catalog entities missing `RowVersion`, `RevokeQualificationAsync` missing `If-Match` — are the exceptions, not the rule).
5. **Scalability posture is currently adequate for a single instance but has real gaps for horizontal scale-out**: the notification outbox worker (M18) would do duplicate work across instances (safe, but wasteful and silent), and the one truly unbounded-growth list endpoint (teacher-application review queue, H11) is exactly where a real "thousands of teachers" scenario would first break.

## 7. Business Risks

- **Trust & safety:** revoked teachers can still transact (C2) — a direct contradiction of the platform's own moderation intent.
- **Revenue integrity:** failed payments are miscounted as captured revenue (C3); live-session money has no exit path at all (C1).
- **Core-flow availability:** the Request-an-explanation flow is completely broken (C4); Browse Teachers' filters silently return nothing (C6) — both are primary conversion paths.
- **Legal exposure:** users agree to Privacy/Terms policies that don't exist anywhere in the product (M13).
- **Support burden:** the `⟦missing:...⟧` bug (C5) will generate a steady stream of confused support tickets quoting literal placeholder text as if it were the actual error.

## 8. Security Risks

- Highest-impact item: the hardcoded Staging Admin credential (H5) — treat as urgent regardless of the "Needs Investigation" reachability caveat; rotating a password costs nothing and the downside of leaving it is total admin takeover of a real environment.
- Everything else in this category is genuinely minor (CSP `unsafe-eval` with a verified compensating control; missing rate limits on already-permission-gated financial endpoints; low-value enumeration; one internal storage key exposed in a response with no exploitable read path today). No SQL injection, no XSS, no CSRF, no IDOR, no privilege-escalation path, no plaintext-secret-in-code was found across a full pass of every controller and the file-upload/payment-webhook subsystems.

## 9. Performance Risks

- Notification-outbox N+1 (M7) and unbounded chat-history load on every message send (M8) are the two concrete, confirmed performance defects.
- Per-request synchronous file-existence checks on the public teacher-profile page (L4) and full eager-loads on every dispute mutation (L5) are lower-severity versions of the same "load more than you need" pattern.
- Free-text `Contains()` search with no full-text index (L6) is a real future bottleneck but requires data-volume testing to size the actual impact today.

## 10. Recommended Fix Order

**Before any real users or real payments:**
1. C4 — fix `replyHours` crash (trivial, unblocks an entire page)
2. C5 — fix the `errorMessage()` sentinel check (one line, unblocks readable errors app-wide)
3. C6 — wire Browse Teachers filters to real data/server params
4. C2 — extract and reuse one teacher-eligibility predicate across Search/Compare/Orders
5. C3 — call `payment.Fail()` on webhook failure; add a re-initiation path
6. C1 — implement live-session escrow release/refund/dispute, or explicitly gate live-session payments off until it exists
7. H5 — rotate the Staging admin password immediately; move seeding credentials to a secrets manager
8. H1 — enforce `CancellationWindowHours` in `LiveSessionBooking.Cancel()`

**High-value, near-term:**
9. H11 — paginate the teacher-application review queue
10. H7, H9 — add race guards to Browse Teachers' `loadTeachers()` and Book-Session's slot loading
11. H8 — wire the Payment page's coupon Apply to a real quote endpoint
12. H2 — enforce catalog price bounds at service creation, not just at booking
13. M1 — fix the duplicate-dispute guard to allow reopening after resolution
14. H4 — add an idempotency key to learning-request creation
15. H3 — map `UnauthorizedAccessException` to 401

**Backlog (Medium/Low):** everything else in sections 4–5, roughly in the order listed.

## 11. Quick Wins (high impact, low effort)

- C4 (`replyHours`) — one-line fix, unblocks an entire page.
- C5 (`errorMessage()` sentinel) — one-line fix, fixes error readability across the whole app.
- C3's webhook wiring — a single missing method call.
- H5 — rotating a password costs nothing.
- L28 — use the trimmed value in the Landing search toast.
- L27 — add `aria-label` to the verified-teacher badge.
- L20/L21 — delete ~35 dead CSS classes and duplicate keyframe blocks; zero behavioral risk.
- M9's naming — at minimum, stop advertising "same-day 90-minute" until the toggle actually does that.

## 12–18. Scores

| Dimension | Score | Rationale |
|---|---|---|
| **Production Readiness** | **4 / 10** | Six Critical, launch-blocking defects (a full page crash, an app-wide unreadable-error bug, a completely non-functional discovery filter, a revenue/trust-integrity gap, an escrow dead-end, and a hardcoded admin credential) must be fixed before real users or real money touch this system. |
| **Overall Architecture** | **7 / 10** | Clean, enforced layering; rich domain model; consistent concurrency handling almost everywhere. Docked for the recurring "same rule implemented 2-3 times, drifting" pattern (C2, H2, M17) and the payment-failure wiring gap (C3). |
| **Business Logic** | **5 / 10** | The lifecycle/state-machine design itself is careful (no impossible transitions found; rejection→resubmission works correctly; fee/duration bounds are correctly single-sourced in most places). Scored down hard for confirmed, real-money-affecting gaps: stranded live-session escrow, unenforceable revocation, dead-end failed payments, an unbounded coupon, an unenforced cancellation window. |
| **Security** | **7 / 10** | Core mechanisms (JWT validation + stamp/suspension re-check, CSRF posture, IDOR, SQL injection, XSS, payment-webhook signature+replay protection, file-upload validation, secrets-fail-closed startup checks) are all genuinely solid and were positively verified, not assumed. Docked for the hardcoded admin credential, one info-disclosure response, and a few missing rate limits. |
| **UX** | **5 / 10** | Real, working atomic-loading and skeleton patterns exist and are well done where applied. Scored down for user-facing dead ends and deceptions found across multiple core flows: a fake coupon-apply success state, filters that silently return nothing, a decoy SSO button, a "save" that doesn't save, an advertised feature (emergency 90-min session) that doesn't do what it says, and several race conditions that can display stale state with no indication anything is wrong. |
| **Maintainability** | **6.5 / 10** | Domain-driven structure, an existing architecture-fitness test suite, and mostly-consistent patterns make this a codebase that's genuinely easy to extend correctly. Docked for the rule-duplication pattern, a handful of overlong methods, some dead CSS/code, and a couple of magic numbers. |
| **Scalability** | **5.5 / 10** | Pagination is the norm across most list endpoints (a deliberate, consistent convention), and the background-job/locking design is *correct* for a single instance today. Docked specifically for the one unbounded endpoint that matters most for growth (the teacher review queue), N+1 patterns in the notification worker and chat send path, and the outbox worker's lack of claim-locking for horizontal scale-out. |

---

## Coverage note
This audit is static and evidence-based; nothing was run against a live database or under load. Items explicitly marked **Needs Investigation** above require either a running instance, a populated database at realistic scale, or a product-intent conversation to resolve definitively. The five sub-audits' own stated coverage: Business Logic traced the full lifecycle of TeacherApplications, Marketplace, Orders, LiveSessions, Finance, and Governance end-to-end (Controller→Service→Domain→EF Core); Security read every controller and the full Program.cs/DI wiring; Backend/Database read every controller+DTO pair and the full 22-migration history; Frontend did a full-depth read of 7 of 12 pages plus all shared JS/CSS (with a lighter grep-driven pass on the remaining 5 dashboard pages — flagged as the main coverage gap, likely to contain additional findings on a deeper pass); Architecture read every Domain/Application/Infrastructure file plus the existing architecture-fitness tests.
