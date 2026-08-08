# PHASE 4 — MARKETPLACE SCALE / RELEASE 5 — ORDER COMMUNICATION

## Findings

The gap was classified **Missing Feature / UX Gap**, plus bounded **Technical Debt** in the inbox projection. Messaging itself was not broken. Release 4 is still concurrent and its WIP integration test currently does not compile.

## Existing Messaging Architecture

Canonical entities are `Conversation`, `ConversationParticipant`, `Message`, and `MessageAttachment`. `LastReadAt` persists read state. `MessagingHub`, canonical notifications, and notification outbox already exist. Messages are immutable and safely participant-scoped.

## Domain Decision

Option A: `ConversationScope.Order` with `ResourceId = Order.Id`. No aggregate, schema, or migration was added. Serializable creation and SQL application locking preserve one scoped thread.

## Order Conversation Lifecycle

Available at teacher acceptance/Order creation. Completed/cancelled Orders preserve the existing send capability because no lock policy is defined; this remains a Business Ambiguity.

## Request → Order Continuity

Request clarifications remain request workflow history. The Order thread projects request submission and canonical request files without copying messages or binaries.

## Student Communication UX

Every projected Order row exposes Messages and opens/creates the exact scoped conversation.

## Teacher Communication UX

Teacher Orders expose the equivalent action with the correct Student and Order.

## Generic Messages Experience

Selecting a row now opens that conversation ID, shows unread badges, distinguishes Order threads, and supports notification query-string deep links.

## Message Sending

Text up to 4,000 characters uses the existing rate-limited endpoint. Empty text is rejected. Sending remains immutable.

## Attachments

Canonical upload/download, allowlist, MIME/signature, 50 MB limit, safe filenames, and participant authorization are reused. Attachment-only messages remain unsupported by the existing domain.

## Request Files in Order History

Original request attachments are separately labelled and opened through their existing authorized endpoint; binaries are not duplicated.

## Delivery / Revision Context

Deliveries remain distinct files. Revision events show only schema-proven sequence information; F-005 is unchanged.

## System Lifecycle Events

Persisted request, Order status, payment, delivery, and revision facts are projected as neutral system rows, never fake Message rows.

## Unread / Read State

SQL aggregates persisted `LastReadAt`; own messages are excluded. Read occurs only after the selected conversation renders.

## Notifications

Canonical notification writing remains. Sender and Order/service context are included without private message content.

## Deep Linking

`/conversations/{id}` routes through the shared notification helper to the correct dashboard and widget conversation.

## Realtime / SignalR

Existing hub groups are reused. Client-side message-ID de-duplication prevents duplicate rendering. Multi-instance scale-out is unverified.

## Authorization

Order pair validation plus repeated participant checks cover API, attachments, read state, and hub joins. Focused SQL denial tests pass.

## Privacy / Security

Admin/Quality receive no implicit access. Text is escaped; user payload cannot select system presentation. Malware scanning remains absent.

## Pagination / Performance

Conversation/message pages are bounded at 50/100. Older messages can be loaded. The inbox no longer includes complete message histories.

## Error / Empty States

Localized empty lists, send/upload error status, and resilient realtime fallback are present. Context-loading failures do not erase messages.

## Accessibility

Dialog/controls are labelled, timeline is visually distinct, live message updates use `aria-live`, keyboard Escape closes, and focusable native controls are used. Authenticated keyboard certification remains outstanding.

## Responsive UX

The thread becomes full-screen below 680px with reachable composer controls and safe-area padding. Unauthenticated 390/768/1440 browser overflow checks passed; authenticated 375px hit-testing remains outstanding.

## Localization

New copy exists in English and Arabic. Canonical localization and usage gates pass 3,048 paired keys.

## Student E2E

Focused API lifecycle passes; authenticated browser send/upload was not rerun.

## Teacher E2E

Focused API lifecycle passes; authenticated browser unread/reply was not rerun.

## Realtime E2E

SignalR authentication test passes. Two live authenticated contexts were unavailable.

## Authorization E2E

Order outsider creation, generic outsider reads, attachment denial, and participant success pass focused SQL tests.

## Completed Order History

Request files, deliveries, revisions, completion timeline, and messages remain available in the contextual thread. Browser certification is pending.

## Browser Certification

Harness 5/5; AR RTL and EN LTR responsive smoke passed without overflow. Authenticated Order/composer matrix was blocked by missing UAT credentials. Pre-existing redirect placeholder warnings remain.

## Release 4 Collision Check

Shared modified files were reread and preserved. Release 5 avoided Admin/Quality/Program changes. Release 4's WIP test source is excluded only for local focused execution and was not edited.

## Foundation Regression

Frontend integrity, localization, localization usage, template leak, auth, guided request, notification routing, JS syntax, browser self-test, and diff check passed.

## Backend Regression

Architecture 1/1, Domain 89/89, Application 5/5, focused SQL 4/4. Broader integration: 208/215 pass after excluding the Release 4 WIP source; seven unrelated migration-path/showcase failures.

## Frontend Regression

All canonical local gates pass. No new error-level browser logs were observed.

## Database / EF

No schema/model/migration changes. Existing scoped relationship is sufficient; EF reports no pending model changes.

## Release Build

Isolated Release build passed with 0 errors and two pre-existing nullable warnings in TeacherApplicationService. Shared output build was blocked by the concurrent API process.

## Publish Smoke

Isolated publish passed. Live/ready and Landing, Browse, Teacher Profile, Student Dashboard, Teacher Dashboard, and chat asset returned 200; static policy was `no-cache`. Smoke process stopped.

## Files Changed

Release 5 changes: both role dashboards, `js/chat-widget.js`, `js/locales.js`, `MessagingService.cs`, focused Phase 5 integration coverage, Release 5 gate, prompt, feature/evidence docs, retrospective, index, and status. Other dirty files belong to concurrent workstreams.

## Remaining Limitations

Authenticated Playwright matrix, two-context realtime, 375px composer hit-testing, full clean integration regression, and post-close communication policy remain unresolved.

## Production Readiness Dependencies

Malware scanning, Production durable storage, SignalR multi-instance infrastructure, real PSP, F-005, and platform privacy/legal work remain separate.

## Risks

The largest release risk is incomplete authenticated browser proof. Context lookup is bounded to 1,000 records per resource list; a direct single-Order endpoint can replace it if real accounts exceed that ceiling.

## Product Evaluation

Order Context 9; Student UX 8; Teacher UX 8; Unread/Notifications 8; Attachments 8; Lifecycle Trust 9; Privacy 9; Authorization 9; Accessibility 7; Responsive 7; Localization 9; Realtime 7; Architecture 9; Scalability 8. Scores below 9 reflect missing authenticated browser, multi-instance, malware-scan, and mobile hit-test proof.

## Release 5 Retrospective

The smallest viable architecture was already present. Most work belonged in projection/UI, not schema. The evidence-first audit prevented a duplicate chat aggregate and prevented request clarifications from being misrepresented as speech.

## Release 6 Handoff

Run the authenticated AR/EN × 390/768/1440 Playwright matrix after Release 4 merges and UAT credentials are available; add 375px composer hit-testing and simultaneous Student/Teacher SignalR proof. Decide completed/cancelled/refunded/disputed send policy before changing capability.

Final verdict: **RELEASE 5 — ORDER COMMUNICATION PARTIALLY COMPLETED**.

---

## Final Acceptance Closure (subsequent pass, 2026-08-08)

Historical Partial verdict above is preserved. This pass closed the certification gaps without expanding product scope.

- Worktree reconciled with concurrent Release 4 (no overwrite).
- Integration **222/222**, Architecture 1, Domain 89, Application 5; 0 exclusions.
- Targeted `GET /orders/{id}` + `GET /learning-requests/{id}`; `findPaged` 1,000-scan removed.
- Authenticated two-context SignalR both directions, `renderCount=1`, attachment live without duplicate rows.
- Outsider 404 + SignalR join denial.
- Closed-order policy documented as currently writable + Product Decision Required.
- Mobile composer 375×667 and 390×844 Student/Teacher PASS.
- Teacher notification inbox + deep link.
- Isolated publish smoke + health; EF no pending changes; Release build 0 errors (2 pre-existing CS8604).

Held at **CONDITIONALLY VERIFIED** because the dense Playwright matrix still records Development **429** console errors (rate limits not weakened), one Completed-Order widget remount composer wait timed out, and Refunded/Disputed live financial fixtures were not created.

Evidence: [final-acceptance](./evidence/phase4-release5-order-communication/final-acceptance/) · [fix report](../fixes/PHASE_4_RELEASE_5_ORDER_COMMUNICATION_FINAL_ACCEPTANCE.md)

Subsequent verdict: **RELEASE 5 — ORDER COMMUNICATION CONDITIONALLY VERIFIED**.

---

## Final Browser Certification Closure (subsequent pass, 2026-08-08)

Historical Partial and Conditional verdicts above are preserved.

This pass closed the two Conditional blockers without expanding messaging, weakening rate limits, or changing closed-order policy.

- 429 classified **Test Issue**: `auth` 10/min (login+refresh) plus global 300/min cascade on dense dashboard remounts. Reproduced; limits unchanged. Harness: login-once `storageState`, pacing, fail-on-429 retained.
- Completed remount classified **Test Issue + UI/View**; widget lifecycle fixed; **20/20** cycles.
- Functional browser **16/16** (four locale cells re-verified after global-limiter 429; disclosed in `matrix-retry.json`).
- Two-context realtime `renderCount=1`. Integration **222/222**. EF no pending model. Release build 0 errors. Isolated publish + health smoke.

Evidence: [final-browser-certification](./evidence/phase4-release5-order-communication/final-browser-certification/) · [fix report](../fixes/PHASE_4_RELEASE_5_FINAL_BROWSER_CERTIFICATION_CLOSURE.md)

This-pass verdict: **RELEASE 5 — ORDER COMMUNICATION VERIFIED**.

---

## Micro Final Acceptance Gate (subsequent pass, 2026-08-08)

Historical Partial, Conditional, and claimed-VERIFIED-with-disclosures verdicts above are preserved. This pass existed only to close those two disclosures.

- Published Student 401 classified **UAT Fixture Issue** (Identity lockout + password/stamp churn; HTTP reset does not clear lockout). Isolated `:5092` Student + Teacher login **200**; conversations/threads **200**; health 200; `/app/js/chat-widget.js` contains hub singleton.
- Remount `connectCount=0` classified **UI/View Issue** + diagnostic overwrite. Fixed with page-scoped hub singleton. Proven via `HubConnection.state === Connected`. Functional micro-cert **12/12**. Realtime remount **20/20**, `renderCount=1`.
- Architecture 1, Domain 89, Application 5, Integration 222 retained, EF no pending model, frontend gates PASS, Release build 0 errors (pre-existing CS8604).

Held at **CONDITIONALLY VERIFIED**: dense remount still trips global **300/min** 429 (safety assertions FAIL). Limits unchanged. No Release 5 Sprint 2.

Evidence: [micro-final-acceptance](./evidence/phase4-release5-order-communication/micro-final-acceptance/) · [fix report](../fixes/PHASE_4_RELEASE_5_MICRO_FINAL_ACCEPTANCE_GATE.md)

This-pass verdict: **RELEASE 5 — ORDER COMMUNICATION CONDITIONALLY VERIFIED**.

---

## Rate-Limit-Aware Final Certification (subsequent pass, 2026-08-08)

Historical Partial, Conditional, claimed-VERIFIED-with-disclosures, and Micro Conditional verdicts above are preserved.

This pass closed the last Micro blocker without increasing 10/min auth or 300/min global limits, without a Development bypass, and without retrying 429 cells to PASS.

- Measured one Student load **34**, Teacher load **39**, conversation open **7**, Student remount **42**, Teacher remount **46** first-party requests; negotiate **1** per remount. Classification: **Test Issue** (density + shared IP bucket because `UseRateLimiter` precedes authentication). No product fan-out fix.
- Deterministic rolling-60s scheduler; batch size **4**; safety 60 global / 2 auth. Accepted run **49/49**, remount **20/20**, `renderCount=1`, unexpected **429=0**, **401=0**, max rolling **246**/300, max auth **6**/10.
- Intermediate loc-AR-fail and session-collision JSON preserved under distinct names.
- Architecture 1, Domain 89, Application 5, Integration **224/224**, EF no pending model, Foundation gates PASS, isolated publish smoke Student+Teacher login 200, then stopped. Not deployed.

Evidence: [rate-limit-final-cert](./evidence/phase4-release5-order-communication/rate-limit-final-cert/) · [fix report](../fixes/PHASE_4_RELEASE_5_RATE_LIMIT_AWARE_FINAL_CERTIFICATION.md)

This-pass verdict: **RELEASE 5 — ORDER COMMUNICATION VERIFIED**.

