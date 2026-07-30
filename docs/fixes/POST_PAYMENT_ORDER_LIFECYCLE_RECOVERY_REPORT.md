# Post-Payment Order Lifecycle Recovery

**Date:** 2026-07-30
**Type:** Critical product recovery sprint — post-payment lifecycle, delivery, review/rating, media, React stability, CI
**Constraints:** No Order lifecycle redesign, no financial-rule changes, no invented APIs, no fake success states, no direct database status mutation, no business-rule changes to satisfy tests, no commit/push/deploy

## Findings

The prior [Order Journey Browser Certification](./ORDER_JOURNEY_BROWSER_CERTIFICATION.md) proved payment itself correct (`ConfirmPayment()` sets `PaymentStatus=Paid`; `Order.Status` intentionally stays `AwaitingPayment`) and traced the blocker to both dashboards deriving stage/action from `Order.Status` alone. Extending that trace to the full canonical lifecycle surfaced a materially larger set of defects, all in the **frontend presentation layer** — every backend endpoint involved (`start`, `deliveries`, `revision`, `complete`, `review`) was already correctly implemented, authorized, and RowVersion-guarded; none of it was reachable or was reachable through inverted controls.

| ID | Area | Classification | Summary |
|---|---|---|---|
| BUG-010 | Payment-state projection | UI Bug | Both dashboards keyed stage/action off `Order.Status` alone, never `PaymentStatus` |
| BUG-011 | Start Work | UI Bug | Endpoint correct; frontend action was gated on the wrong stage and never called it |
| BUG-012a | Delivery button wiring | UI Bug | "Upload delivery" fired at `Delivered` (already delivered); "Start work" fired at `InProgress` (already started) — both call the correct endpoint at the state where it's *guaranteed to be rejected* |
| BUG-012b | Revision re-delivery | UI Bug | No handler existed for the `RevisionRequested` stage at all; a real "submit revised delivery" click did nothing |
| BUG-012c | Delivery message fallback | UI Bug | `prompt(...) || successToastText` stored the literal success-toast string as the delivery note whenever the teacher cancelled/left the prompt empty |
| — | Student delivery review | UI Bug | No UI existed at all — a native `prompt()` asked the student to type `complete`/`revision`/`dispute` blind, with no delivery content shown |
| — | Student rating | UI Bug | Fully correct, fully authorized `POST /orders/{id}/review` endpoint had zero UI entry point |
| — | Quality demo video | UI Bug | `<video src>` pointed at an `[Authorize]` API URL directly; the bearer token lives in memory and is only ever attached by the app's `fetch` wrapper, so the browser's native media request 401s silently → black rectangle |
| — | React error #185 | UI Bug | `componentDidUpdate(prev)` compared against `prev.step`, but the DC runtime only ever passes `prevProps` (never `prevState`) — `step` lives in state, so the comparison was unconditionally true on every render, causing an infinite `setState` loop |
| — | `td_stat_pending_withdrawal` | UI Bug / localization | Key referenced, never defined; renders `⟦missing:...⟧` to users |
| — | Localization usage coverage | Test Issue (gap) | No CI check existed for "referenced key exists in locales.js" (only EN/AR pairing) |
| — | RoleBootstrap 3-vs-4 | Test Issue (Stale Test) | Legitimate localization-backfill read added to bootstrap; test's exact-count assertion never updated |
| — | Mock Checkout return | UI Bug (accessibility gap) | No cancellable auto-return (WCAG 2.2.1) |
| — | Teacher-side request/order attachments | *No defect found* | Already correctly wired end-to-end via the authenticated `openBlob` pattern |
| — | Admin review-moderation queue | Business Rule Required (deferred) | No `GET /admin/reviews` list endpoint exists; out of this sprint's explicit scope (canonical lifecycle only) — not built |
| — | Student general Files tab | UI Bug (deferred) | `STUDENT_FILES` is a hardcoded empty array with a fake `flash()` stub; the *lifecycle-critical* delivery download (inside the new Review modal) is real and fixed — the standalone account-level Files tab was not rebuilt (out of the sprint's explicit lifecycle scope) |
| F-005 | Revision-to-delivery linkage | Business Rule Required (documented ambiguity) | Left untouched per instruction; still tracked in [F-005 investigation](../audits/F005_REVISION_DELIVERY_LINKAGE_INVESTIGATION.md) |

## Root Cause

A single pattern explains BUG-010/011/012a: `Tafseel-Teacher-Dashboard.dc.html` positionally mapped `OrderStatus` (`0..5`) to an internal stage array `['awaiting_payment','progress','ready','revision','completed','cancelled']` where the array's *intent* ("what should the teacher do next") never matched what each `OrderStatus` value actually means. `progress` (→ "Start work") was shown at `InProgress` (already started); `ready` (→ "Upload delivery") was shown at `Delivered` (already delivered). Both buttons, when clicked, called the *correct* endpoint at *exactly the state where the domain guarantees rejection* — so even before BUG-010 (payment blindness) was fixed, this second, independent bug meant the lifecycle could never have completed through the UI. `Tafseel-Student-Dashboard.dc.html` had the parallel defect (`rawStatus === 0` for Pay, ignoring `PaymentStatus`) plus no delivery-review/rating UI of any kind.

## Fix

### Payment-State Projection

Added one canonical helper, `Tafseel.orderPresentation(rawStatus, paymentStatus, role)` in `js/tafseel.js`, that is now the **single source of truth** for both dashboards. It derives `{ stage, labelKey, action, isTerminal }` from `Order.Status` **and** `Order.PaymentStatus` together, per role — never from `Status` alone, and never by comparing localized text.

| Status | PaymentStatus | Teacher sees | Student sees |
|---|---|---|---|
| AwaitingPayment | Pending | chip "Waiting for payment" (no action) | chip "Payment required" + **Pay** |
| AwaitingPayment | Paid | chip "Payment confirmed" + **Start work** | chip "Payment confirmed" (no action) |
| InProgress | Paid | chip "In progress" + **Upload delivery** | chip "In progress" (no action) |
| Delivered | Paid | chip "Delivered" (no action) | chip "Delivered" + **Review delivery** |
| RevisionRequested | Paid | chip "Revision requested" + **Submit revised delivery** | chip "Revision requested" (no action) |
| Completed | Paid | chip "Completed" (no action) | chip "Completed" + **Rate teacher** |
| Cancelled | any | chip "Cancelled" (no action) | chip "Cancelled" (no action) |

`orderStatusLabel()` is kept (marked deprecated, doc comment explains why) since nothing else in the codebase called it after this pass — `orderPresentation()` fully replaces its use for anything that renders a status chip or action. Status chips are `<span>` elements, never buttons; the action button only renders (`<sc-if value="{{ actionLabel }}">`) when `action` is non-null, giving one primary action per row.

### Start Work

Traced `POST /api/v1/orders/{id}/start` end to end (`OrdersController.cs:119`, `OrderService.StartOrderAsync`, `Order.Start()`): assigned-teacher-only (`OwnedOrderAsync(..., teacher:true, ...)`), payment-and-status guard already in the domain, RowVersion via `If-Match`/`ApplyVersion`, `WorkStarted` notification queued, timeline event recorded via `OrderStatusHistory`. Nothing here was broken or needed a new endpoint — the frontend simply never called it at the right time. Now wired: the `start` action fires exactly when `stage === 'payment_confirmed'`, with a `busyOrderId` guard (button `disabled` while the request is in flight, cleared in `finally`) preventing double-click double-submission.

### Delivery and Revision

`Order.Deliver()` accepts one file + an optional message per call, valid from `InProgress` or `RevisionRequested`; each call appends to `Order.Deliveries` (full history retained, not overwritten) — confirmed no multi-file-per-submission support exists, and none was invented. Replaced the old raw `<input type=file>` + `prompt()` combo with a proper modal (mirrors the existing Accept-request modal's markup/ARIA pattern): file picker, message textarea, busy state, inline error. The modal title and button label read "Submit revised delivery" instead of "Upload delivery" when `stage === 'revision'`, using the same upload endpoint (which already accepts both source statuses) — no new endpoint invented. The message-fallback bug is fixed: an empty/cancelled message now sends `''`, never the success-toast string.

### Student Delivery Review

Added a Delivery Review modal (`Tafseel-Student-Dashboard.dc.html`) shown for `action === 'review'` (`Delivered` status): teacher display name, full delivery history (newest first) with per-version timestamp, message (`"No message provided."` fallback, never blank), and a real download link (`Tafseel.api.openBlob('/orders/deliveries/{id}/content', ...)` — the same authenticated pattern already used for request attachments). Two explicit actions, gated correctly:
- **Approve** — confirmation prompt, then `POST /orders/{id}/complete`.
- **Request revision** — reveals a reason textarea (required, validated client-side before submit) — `POST /orders/{id}/revision`. Disabled/hidden with an explicit message once `revisionsUsed >= revisionAllowance` (the existing `revision_limit_reached` domain guard is never even reached from a legitimate click).

No storage keys, internal reviewer IDs, or raw paths are exposed to the client — only `AttachmentDto`/`DeliveryDto` fields the API already returns.

### Request Attachments

Audited both sides. **Teacher side was already correct** — `AddRequestAttachmentAsync`/`OpenRequestAttachmentAsync` (`OrderService.cs:53-91`) enforce "student who owns the request OR teacher on the request"; both pending-request and post-acceptance/order views in `Tafseel-Teacher-Dashboard.dc.html` render real download buttons via `Tafseel.api.openBlob`, confirmed correctly wired via live-code trace (no change needed). One latent, non-blocking caveat: the attachment join is a client-side match against a separately paginated `/learning-requests/assigned` call, which could silently drop attachments past 100 total requests — noted, not fixed (would require a schema/DTO change, out of scope).

### Quality Demo Video

Root cause: `<video src="/api/v1/teacher-applications/{id}/demo/content">` is a native browser media request; it cannot carry the app's in-memory bearer token (only the app's own `fetch` wrapper attaches `Authorization: Bearer ...`, per `js/api.js`). The request silently 401s and the element renders a black rectangle with functionless controls. The codebase already has the correct fix pattern for exactly this class of problem — the Showcase preview (`openShowcase`) fetches via the authenticated `Tafseel.api.blob()` helper and binds a `URL.createObjectURL(...)` result to `<video src>`. Applied the identical pattern to the demo video (`openApp` in `Tafseel-Quality-Dashboard.dc.html`): fetch-on-open, revoke-on-reopen, with explicit loading / playback-error-with-download-fallback / ready states (no more unexplained black box). Backend `Content-Type`, `enableRangeProcessing`, and authorization (`OpenDemoAsync`: owning teacher or `TeachersReviewApplications` claim) were confirmed already correct — no backend change needed.

**Verification caveat, disclosed honestly:** live-tested this fix in the browser and confirmed the root cause is fixed — the API call now returns `200 OK` with real bytes via the authenticated path (previously it would 401), and the resulting `blob:` URL is correctly assigned to `<video src>`. Full visual frame-by-frame playback could not be confirmed inside this session's sandboxed browser testing tool, which rejected the blob URL with `MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check` even when re-fetched directly — this reproduces identically on the codebase's pre-existing, unmodified Showcase preview using the same pattern, so it reads as a restriction specific to this testing tool's media sandboxing, not a defect introduced or left by this fix. Recommend a final manual check in an unsandboxed browser before closing this item with full confidence.

### Completion and Rating

`GovernanceService.CreateReviewAsync` was already fully correct: Serializable transaction + advisory locks, ownership (`Order.StudentId == studentId`), state gate (`Completed` + `Paid` only), one-review-per-order enforced at both the application layer (`AnyAsync`) and a DB-level unique index on `TeacherReviews.OrderId`, self-review guard, and `RefreshRatingAsync` as the single write path for `TeacherProfile.AverageRating`/`RatingCount` (consumed identically by Browse, Profile, and Comparison — confirmed via code trace, all three read the same two fields). None of this needed to change. Added the missing UI: a "Rate teacher" action on `Completed` orders opening a modal with the five required 1–5 criteria (range inputs, live `n/5` label), a required comment, and a recommends checkbox, `POST`ing to the existing `/orders/{id}/review`. "Rate teacher" is offered optimistically on every Completed order (no separate "already reviewed" pre-check, to avoid an extra network round-trip); a second attempt is caught and surfaced honestly via the existing `duplicate_review` domain error rather than invented client-side state — deliberate scoping decision, disclosed here rather than silently made. Unrated teachers correctly remain `rating: null` / `ratingCount: 0` (unchanged, confirmed by trace, not by this pass's new code).

### React Stability

`Tafseel-Request.dc.html`'s `componentDidUpdate(prev)` compared `prev.step` against `this.state.step`. The DC runtime's base class signature is `componentDidUpdate(_prevProps)` (`support.js:833`, confirmed by the actual call site at `support.js:1013`: `this.logic.componentDidUpdate(prevProps)`) — it **never** passes previous state, only previous props, and `step` lives in state. `prev.step` was therefore always `undefined`, making the guard unconditionally true on every single update: `setState` → re-render → `componentDidUpdate` → `setState` again, an unbounded cascade that React's own re-render cap eventually throws as error #185. Fixed by tracking `this._lastAnnouncedStep` as a plain instance field instead of relying on a `prevState` argument that the framework never provides — confirmed via grep that this was the only file in the codebase using a parameterized `componentDidUpdate`. The live-region step announcement still fires exactly once per step change (plus once on initial mount, a minor and arguably positive change — a screen reader now announces "Step 1" on load, which it previously never did). Live-verified zero console errors across Request wizard load, all 5 steps, Student Dashboard, Payment, and Mock Checkout.

### Localization

Added `order_status_payment_confirmed` and the `td_delivery_*`/`sd_review_*`/`sd_rate_*` key families (EN+AR) for the new UI, and the originally-reported missing `td_stat_pending_withdrawal`. Built `scripts/ci/check-localization-usage.mjs` — a new, distinct CI check from the existing `check-localization.mjs` (which only validates EN/AR key *pairing*, not that a referenced key exists at all). It statically extracts every `t('literal_key')` argument passed to `Tafseel.t()`/`this.t()`/`self.t()` across every `.dc.html` page and shared script, and fails if any snake_case key literal referenced this way isn't defined in `locales.js`. It excludes comparison operands (`x.code === 'some_value'`) that happen to sit inside the same call via a ternary, to avoid false positives — confirmed by an actual false positive it caught and I fixed during development (`qualification_sample`, a data-value comparison in `Tafseel-Teacher-Profile.dc.html`, not a translation key). It does **not** rely on `Tafseel.t(key) || fallback`, since a missing-key marker is a non-empty (truthy) string and that pattern silently never falls through — exactly the bug this check exists to catch upstream, in CI, before it reaches the browser.

### CI / RoleBootstrap

Full trace in [ROLE_BOOTSTRAP_FAST_PATH_CI_FIX_REPORT.md](./ROLE_BOOTSTRAP_FAST_PATH_CI_FIX_REPORT.md). Classified as **Stale Test**: `BackfillCanonicalServiceLocalizationAsync` (a legitimate, unconditional, bounded Arabic-localization data-correction step) runs once before the 3-query fast-path check, making the true repeated-startup read count `4`, not `3`. No production code changed — the test now asserts the real invariant (`WriteCount == 0` on an already-current seed) plus a documented, generous bound on reads (`1..6`) instead of a magic exact number. All 195 provider-neutral integration tests pass, including all 10 `RoleBootstrapTests`.

### Browser UAT

Full live-browser walkthrough on a fresh Development instance (`http://localhost:5090`), reusing the previously-certified fresh accounts (`student.uat.20260730@example.com`, `teacher.uat.20260730@example.com`) and the Order already sitting Paid-but-stuck from the prior certification pass (`3c7f8d2e-e374-4ab8-ac41-6e5f344ae60c`):

| Step | URL / action | Result |
|---|---|---|
| Teacher Dashboard, before fix would show | `Tafseel-Teacher-Dashboard.dc.html` | Chip: **"Payment confirmed"**; Action: **"Start work"** (previously dead "Waiting for payment") |
| Click Start work | `POST /api/v1/orders/{id}/start` | `204`; chip → "In progress"; action → "Upload delivery" |
| Click Upload delivery, submit file+message | `POST /api/v1/orders/{id}/deliveries` | `201`; chip → "Delivered"; teacher action cleared |
| Student Dashboard | `Tafseel-Student-Dashboard.dc.html` | Chip: "Delivered"; Action: **"Review delivery"**; zero console errors |
| Open review modal | — | Teacher name, timestamp, message, downloadable `delivery-v1.pdf` all correct |
| Request revision, reason: "…negative discriminant…" | `POST /api/v1/orders/{id}/revision` | `204`; chip → "Revision requested" |
| Teacher Dashboard | — | Action now reads **"Submit revised delivery"** (distinct from first-delivery wording) |
| Submit revised delivery (`delivery-v2.pdf`) | `POST /api/v1/orders/{id}/deliveries` | `201`; chip → "Delivered" again |
| Student: open review modal | — | Both `delivery-v2.pdf` (newest) and `delivery-v1.pdf` shown, correct order, correct timestamps |
| Approve | `POST /api/v1/orders/{id}/complete` | `204`; Completed orders: 0→1; DB confirmed `Status=4` |
| Completed filter | — | Action: **"Rate teacher"** |
| Submit review (5/5/5/5/5, comment, recommends) | `POST /api/v1/orders/{id}/review` | `200`; DB confirmed `AverageRating=5.00, RatingCount=1` |
| Browse Teachers (public) | `Tafseel-Browse-Teachers.dc.html` | **"★ 5 (1)"** shown next to the teacher — rating projection confirmed consistent on the public surface |

Also checked: Arabic/RTL/Dark at 375px and English/LTR/Light at 1440px on the Teacher Dashboard — correct alignment, no horizontal scroll, translated labels, Arabic-Indic amount formatting consistent with the rest of the app. Noted (not fixed, out of scope): unrelated SignalR/chat-widget connection errors surfaced during this pass — pre-existing infrastructure untouched by this sprint, disclosed rather than omitted.

## Files Changed

- `js/tafseel.js` — `orderPresentation()` canonical helper; `projectStudentWorkList()` updated to use it (status label, stage, action, group bucketing, carries `deliveries`/`revisionAllowance`/`revisionsUsed`)
- `js/locales.js` — new EN/AR key families for delivery/review/rate UI + `order_status_payment_confirmed` + `td_stat_pending_withdrawal`
- `Tafseel-Teacher-Dashboard.dc.html` — stage/action derivation via the canonical helper; status chip separated from action button; Start Work wired with busy-state guard; Delivery modal (initial + revision resubmission) replacing the raw file-picker/`prompt()`; message-fallback bug fixed
- `Tafseel-Student-Dashboard.dc.html` — action derivation via the canonical helper; Delivery Review modal (history, download, Approve, Request revision); Rate Teacher modal; retired the `prompt()`-based `orderAction` complete/revision/dispute chooser
- `Tafseel-Quality-Dashboard.dc.html` — demo video fetched via authenticated `Tafseel.api.blob()` instead of a raw `<video src>` URL; explicit loading/error/ready states with a download fallback
- `Tafseel-Request.dc.html` — `componentDidUpdate` fixed to track step via an instance field instead of a nonexistent `prevState` argument
- `Tafseel-Mock-Checkout.dc.html` — accessible, cancellable auto-return countdown after confirmed payment
- `scripts/ci/check-localization-usage.mjs` (new) — referenced-key usage-coverage CI check
- `tests/Tafseel.IntegrationTests/SqlServerTafseelApiFactory.cs` — `CountingCommandInterceptor` now also tracks writes
- `tests/Tafseel.IntegrationTests/RoleBootstrapTests.cs` — fast-path test asserts zero writes + a documented, bounded read range
- `docs/fixes/POST_PAYMENT_ORDER_LIFECYCLE_RECOVERY_REPORT.md` (this report)
- `docs/fixes/ROLE_BOOTSTRAP_FAST_PATH_CI_FIX_REPORT.md` (new)
- `docs/fixes/ORDER_JOURNEY_BROWSER_CERTIFICATION.md` (updated with recovery outcome)
- `docs/INDEX.md`, `docs/PROJECT_STATUS.md` (updated)

No application code outside the above was changed. No commit, push, or deploy was performed.

## Remaining Bugs

- Quality demo video: root cause fixed and the authenticated fetch is confirmed working (200 OK, real bytes); full visual playback confirmation was blocked by this session's browser-testing sandbox, not by the app — recommend one manual check outside the sandbox.
- Admin review-moderation queue has no list endpoint (`GET /admin/reviews`) — reviews can be moderated by ID but not discovered through the UI. Backend gap, explicitly out of this sprint's canonical-lifecycle scope; not built.
- Student account-level "Files" tab (`STUDENT_FILES`) remains a hardcoded-empty stub with a fake download handler outside the Order Review modal — the lifecycle-critical path (viewing/downloading a specific order's deliveries) is fixed; the general-purpose tab was not rebuilt.
- F-005 (revision-to-delivery linkage not persisted) — left as documented ambiguity per instruction; no schema change made.
- Teacher-side request-attachment join is paginated against a separate `/learning-requests/assigned?pageSize=100` call; attachments could silently vanish past 100 total requests. Pre-existing, not introduced or fixed this pass.
- Pre-existing, unrelated SignalR/chat-widget connection errors observed during final verification; untouched, out of scope.

## Risks

- The `orderPresentation()`/`orderActionRender()` refactor changes the *source* of every status chip and action button on both dashboards. Regression risk is mitigated by: full live-browser walkthrough of every stage transition (table above), zero console errors observed throughout, and all pre-existing automated suites (Domain 69, Application 5, Architecture 1, provider-neutral Integration 195) passing unchanged.
- The Rate Teacher "optimistic offer, honest rejection on duplicate" design is a deliberate scope decision (documented above), not an oversight — flagging in case product wants a proactive "already reviewed" check in a future pass.
- `Assert.InRange(commands.ReadCount, 1, 6)` is intentionally generous; it will not catch a regression that adds, say, one more incidental read to an already-bounded path. It will catch a regression into anything proportional to table size.

## Next Step

Manually confirm Quality demo video playback in a real (non-sandboxed) browser to close out the one item this session's tooling couldn't fully verify. Otherwise the canonical lifecycle is reachable end-to-end through real UI controls with no fake success states and no direct database mutation.
