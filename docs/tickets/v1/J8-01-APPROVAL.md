# J8-01 — Teacher approval before live-session payment

| Field | Value |
|-------|-------|
| ID | J8-01-APPROVAL |
| Release | V1 |
| Priority / blocker / size | P1 / yes / M |
| Owner | Product Owner (DEC-14), engineering implementation |
| Status | In Progress until all Gate 5 checks |
| Gates | ☑ Business · ☑ UX · ☑ Contract · ☑ Build · ◐ E2E/Release |

## Actor, problem and goal

The student must not pay an absent teacher for a live-session time that the teacher never confirmed. The student requests a time; the selected teacher answers; the student pays only after acceptance. Product Contract §3.8 and DEC-14 govern this change.

## States, scope and preconditions

`AwaitingTeacherApproval` → teacher accepts → `AwaitingPayment` → successful payment → `Confirmed`. A teacher may decline to `Declined`; a student may cancel a pending request to `Cancelled`. Pending requests do not reserve a slot. Acceptance rechecks schedule and overlap under the teacher schedule lock. A passed start time or conflicting accepted booking blocks acceptance. Existing paid-session completion, no-show, reschedule and settlement rules remain in scope for regression checks. Production payment and meeting provider setup remains under PAY-01/MEET-01.

## Happy path and negative cases

1. Student selects a teacher, service and available time and sends a request without payment.
2. Teacher sees the request in Work/Home and accepts it. Student receives a notification.
3. Student opens checkout and pays. Both participants can then join inside the existing window.

Pending payment attempts fail with `payment_not_allowed`. Wrong role gets 403; unrelated teacher gets 404; stale `If-Match` gets a conflict. Two pending requests may share a time, but only one acceptance may reserve it. The student may attach files before approval, and both participants can read them through authorized content endpoints. On upload failure, the UI names the failure and offers the file picker on the session page.

## UX

Entry: `/sessions/book` and the teacher's Work/Home session card. The request form states in Arabic and English that payment follows acceptance. The pending session page leads with the teacher's answer for the teacher and the wait state for the student; its payment CTA appears only in `AwaitingPayment`. Both buttons have disabled/busy states. The existing workspace layout supports Arabic RTL at 390px. Loading, missing, stale, conflict and expired cases use the session page state and localized errors. Decline asks for confirmation and states the payment consequence. No analytics are required.

## API contracts

| UI action | Endpoint / verb | Request and headers | Response / state |
|-----------|-----------------|---------------------|------------------|
| Request time | `POST /api/v1/live-sessions` | existing booking draft | 201, `AwaitingTeacherApproval` |
| Teacher answers | `POST /api/v1/live-sessions/{id}/request/respond` | `{accept}` and `If-Match` | 204, `AwaitingPayment` or `Declined` |
| Student pays | `POST /api/v1/payments/live-sessions/{id}` | `Idempotency-Key` | existing payment response, only after acceptance |
| Participant uploads/reads | existing authorized attachment endpoints | multipart with `If-Match`; id lookup | file metadata / streamed content |

Customer errors: `payment_not_allowed`, `session_not_owned`, `invalid_session_transition`, `session_conflict`, `slot_unavailable`, `stale_version`. Both locales contain translations.

## Acceptance and tests

- [x] Domain test failed before protected changes, then passed for the new transition.
- [x] Integration tests cover role, outsider, payment refusal, acceptance and overlapping requests.
- [x] Frontend unit tests cover pending checkout refusal and home action placement.
- [x] Strict API contract (236/236 route matches, 0 violations); frontend 580/580 tests.
- [x] Published browser journey on a fresh database, including Arabic 390px: `j8-01-approval`, 3/3 steps.
- [x] All solution tests and formatting gate green (2026-09-27: 664 integration, 133 domain, 14 application, 1 architecture).
- [ ] JaaS sandbox room join passed with a configured private key.

Browser journey: `tests/browser/j8-01-approval.e2e.mjs` passed again on 2026-09-27 against a fresh published build and database (`TestResults/live-repro-fixed/browser-first-slot/`). It now selects the first available time, verifies that a student who has not entered a title/topic sees field errors and focus instead of a silent disabled button, then submits, uploads, accepts and pays. Rejected booking requests show the localized server reason; unavailable/conflicting slots refresh. The long timed `wave3b-live-session` and `ux06-arabic-phone` journeys were updated for approval and still require fresh-run regression evidence. Dependency: JaaS Key ID/private PEM are provided through server secrets, never committed.

## Out of scope and evidence

The other UI, admin and qualification requests from the same user report are separate backlog tickets. No commit was made. Gate 5 remains open until the named checks pass; test results and screenshots go under `docs/audits/J8-01-APPROVAL/`.
