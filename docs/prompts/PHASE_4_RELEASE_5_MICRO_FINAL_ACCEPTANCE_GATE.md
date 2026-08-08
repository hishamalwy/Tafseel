============================================================
PHASE 4 — MARKETPLACE SCALE
RELEASE 5 — ORDER COMMUNICATION

MICRO FINAL ACCEPTANCE GATE
PUBLISHED AUTH + SIGNALR REMOUNT RETENTION
============================================================

## Previous Context

Release 5 — Order Communication is currently:

RELEASE 5 — ORDER COMMUNICATION CONDITIONALLY VERIFIED

The feature implementation itself is complete.

Current proven baseline:

Messaging Architecture:
PASS

Student Messaging:
PASS

Teacher Messaging:
PASS

Attachments:
PASS

Unread / Read:
PASS

Notifications:
PASS

Deep Links:
PASS

Two-Context Realtime:
PASS on long-lived pages

Realtime Deduplication:
PASS

Authorization:
PASS

Security:
PASS

Context Lookup:
PASS
1,000-item scan removed

Completed Order Remount:
20 / 20 composer visibility PASS

Mobile Composer:
375 / 390 both roles PASS

Localization:
AR / EN PASS

Browser Functional:
16 / 16 PASS

Integration:
222 / 222 PASS

Backend:
317 tests PASS

Frontend Gates:
PASS

Database:
No pending model changes

Build:
PASS

Publish:
PASS

Health:
PASS

The only remaining acceptance concerns are:

1. On the isolated published runtime, Teacher login succeeded but Student API login returned 401 after UAT reset churn.

2. Remount diagnostics disclosed that after some DC script/widget reinjection paths:

   connectCount = 0

   even though REST messaging + composer still worked.

Long-lived two-context realtime is proven, but realtime continuity after a real widget/page remount is not yet proven.

This pass exists ONLY to close those two proofs.

============================================================
GOAL
============================================================

Reach:

RELEASE 5 — ORDER COMMUNICATION VERIFIED

Then:

RELEASE 5 — ORDER COMMUNICATION VERIFIED & CLOSED

Then:

RELEASE 6 — DISCOVERY & CONVERSION UNBLOCKED

============================================================
NON-NEGOTIABLE SCOPE
============================================================

Do NOT:

- add messaging features;
- redesign chat;
- change messaging domain;
- change unread logic;
- change notification domain;
- change closed-order policy;
- add attachment-only messages;
- modify Release 4;
- weaken authentication;
- weaken rate limits;
- disable SignalR authorization;
- create Development auth bypass;
- hardcode credentials;
- suppress errors;
- skip failing scenarios;
- change business state through raw SQL;
- commit;
- push;
- deploy.

============================================================
PART 1 — RECONCILE CURRENT STATE
============================================================

Read:

- current Release 5 implementation report
- Final Acceptance report
- Final Browser Certification report
- Release 5 retrospective
- docs/PROJECT_STATUS.md
- docs/testing/BROWSER_CERTIFICATION.md

Inspect the current worktree.

Do not overwrite any concurrent Release 4/5 changes.

Before changing code run:

Architecture
Domain
Application
Integration

Expected current baseline:

Architecture 1/1
Domain 89/89
Application 5/5
Integration 222/222

Require:

0 failures.

============================================================
PART 2 — PUBLISHED STUDENT AUTH ROOT CAUSE
============================================================

Previous published smoke result:

Teacher login:
PASS

Student login:
401

The same Student identity authenticated successfully during the main :5090 certification, but failed on isolated published :5092 after repeated reset/login activity.

Do NOT immediately modify authentication.

Determine exact reason for the 401.

Trace:

- email/account state
- password/reset state
- email confirmation
- suspension
- lockout
- failed access count
- refresh cookie state
- Development environment config
- published instance DB connection
- auth rate limit
- user-secrets/config availability

Classify the result as:

- Test Issue
- UAT Fixture Issue
- Production Bug
- Configuration Issue

based on evidence.

============================================================
PART 3 — CREATE CLEAN PUBLISHED UAT CREDENTIAL
============================================================

Preferred:

Use an already-valid UAT Student with known Development-safe credential.

If unavailable:

create/reset a clean Student through supported Development flow:

forgot password
→ Development outbox
→ reset
→ login

or:

normal registration
→ email confirmation
→ login

No raw SQL.

Do not expose password/token in docs/evidence.

Do not continuously reset the same identity during repeated tests.

============================================================
PART 4 — ISOLATED PUBLISHED AUTH CERTIFICATION
============================================================

Publish clean Release artifact:

dotnet publish src/Tafseel.Api -c Release -o <isolated-output>

Boot:

Development configuration
separate port

Do NOT deploy.

Verify:

/health/live = 200
/health/ready = 200

Then real API/browser authentication:

Student:
POST /api/v1/auth/login
→ 200

Teacher:
POST /api/v1/auth/login
→ 200

Then verify authenticated:

Student Dashboard
Teacher Dashboard
GET conversations
Order conversation access

The Student proof must be real authenticated state.

HTML page 200 while unauthenticated is NOT sufficient.

============================================================
PART 5 — AUTHENTICATION RETENTION
============================================================

For the same Student:

login
→ authenticated API request
→ refresh if naturally required
→ authenticated API request

No unexpected:

401
429
logout loop

Do not stress/reset account repeatedly.

This is a smoke proof, not a load test.

============================================================
PART 6 — SIGNALR REMOUNT ROOT CAUSE
============================================================

Current concerning observation:

after some DC/widget script re-inject paths:

connectCount = 0

while:

REST
composer
send

continue to work.

Determine whether this is:

A. Diagnostic counter reset only, while actual HubConnection remains alive.

B. Test instrumentation limitation.

C. UI/View Issue where widget remount does not reconnect SignalR.

D. Production Bug where conversation silently loses realtime after navigation.

Do not infer.

Prove actual runtime state.

============================================================
PART 7 — TRACE CHAT WIDGET LIFECYCLE
============================================================

Inspect:

chat-widget.js

and all relevant:

inject()
ready()
loadList()
select()
connectHub()
disconnectHub()
destroy/rebuild logic
pagehide
popstate
dashboard rerender
DC script reinjection

Build an explicit lifecycle diagram:

Initial page
→ widget inject
→ hub create
→ conversation select
→ group join
→ navigation away
→ pagehide/destroy
→ navigation back
→ reinject
→ reconnect
→ rejoin conversation

Identify the exact expected state transitions.

============================================================
PART 8 — NO DUPLICATE CONNECTION RULE
============================================================

The fix must preserve:

one intended HubConnection per active widget/page context

not:

zero
and not:
multiple duplicate connections.

Repeated:

inject()
rebuild
navigate
back
forward

must not cause:

- reconnect storm;
- duplicate handlers;
- duplicate group joins;
- duplicate messages;
- orphaned connection.

============================================================
PART 9 — REMOUNT REALTIME CERTIFICATION
============================================================

Use two authenticated Playwright contexts:

Student A
Teacher A

Both initially open the SAME Order conversation.

First prove baseline realtime.

Student sends:

PRE_REMOUNT_STUDENT_TOKEN

Teacher receives without reload.

Teacher sends:

PRE_REMOUNT_TEACHER_TOKEN

Student receives without reload.

Required:

renderCount = 1 each.

============================================================
PART 10 — STUDENT REMOUNT
============================================================

On Student context:

navigate away from conversation / dashboard section using the exact historical remount path.

Then:

Back / reopen / reinject
→ same Order conversation

Verify:

composer works.

More importantly verify:

SignalR state is actually connected/rejoined.

Do not use connectCount alone.

Inspect actual:

HubConnection.state
or equivalent canonical runtime state.

Teacher sends:

POST_REMOUNT_TEACHER_TOKEN

Student MUST receive:

without reload.

Required:

one rendered copy.

============================================================
PART 11 — TEACHER REMOUNT
============================================================

Repeat reverse.

Teacher:

navigate away
→ return/reopen same conversation

Student sends:

POST_REMOUNT_STUDENT_TOKEN

Teacher receives:

without reload.

Required:

renderCount = 1.

============================================================
PART 12 — BOTH SIDES REMOUNT
============================================================

Remount both contexts.

Reopen same Order conversation.

Verify both are realtime-capable again.

Student sends.

Teacher receives.

Teacher sends.

Student receives.

No reload.

No duplicates.

============================================================
PART 13 — HARD RELOAD
============================================================

With conversation deep-linked where supported:

hard reload Student page.

Restore/open conversation.

Verify realtime reconnect.

Teacher sends.

Student receives without further reload.

Repeat Teacher where practical.

============================================================
PART 14 — BACK / FORWARD
============================================================

Drive:

conversation
→ another section
→ Back
→ Forward
→ conversation

Verify:

widget state coherent.

If selected conversation is only restored when:

conversationId

exists in query string, respect current canonical behavior.

But when the conversation is visibly open:

realtime must work.

============================================================
PART 15 — 20-CYCLE REALTIME REMOUNT RETENTION
============================================================

The previous 20/20 only proved composer presence.

Now perform focused realtime retention.

At minimum:

10 Student remount cycles
10 Teacher remount cycles

Each cycle:

1. Open/reopen conversation.
2. Confirm realtime connection/group ready.
3. Counterparty sends unique token.
4. Target receives without reload.
5. Assert one rendered instance.

Required:

20 / 20 PASS

No silent REST-only mode.

============================================================
PART 16 — CONNECTION INSTRUMENTATION
============================================================

Create test-only diagnostics if necessary.

Capture per cycle:

role
cycle
conversationId
connection state before remount
connection state after remount
negotiate count
join count
messageId
SignalR receive timestamp
render count
console errors
429
401

Do not expose secrets.

Remove temporary invasive debug code from production runtime if not appropriate to keep.

============================================================
PART 17 — IF REMOUNT BUG IS REAL
============================================================

If actual HubConnection does not reconnect:

classify:

Production Bug

or:

UI/View Issue

depending on impact/root cause.

Fix narrowly.

Potential valid class of fix:

after widget reinjection, ensure hub connection is established before/when active conversation is selected.

Do NOT:

- create second SignalR implementation;
- reconnect on every render;
- create a timer loop;
- poll connection state continuously;
- reconnect blindly while already Connected/Connecting.

Use existing HubConnection lifecycle.

============================================================
PART 18 — CONNECTION STATE MACHINE
============================================================

Ensure logic handles:

Disconnected
Connecting
Connected
Reconnecting

correctly.

Avoid concurrent:

start()

calls.

Where SignalR automatic reconnect exists:

respect it.

Manual reconnect should only occur where the lifecycle truly needs a fresh connection after deliberate disconnect/rebuild.

============================================================
PART 19 — DEDUPLICATION RETENTION
============================================================

After any lifecycle fix:

rerun:

HTTP send
+
SignalR echo/broadcast

Expected:

one bubble only.

Test before and after remount.

No duplicate event handlers.

============================================================
PART 20 — UNREAD RETENTION AFTER REMOUNT
============================================================

While Student is away/remounted:

Teacher sends.

Verify:

unread increments appropriately if conversation was not actively read.

After Student reopens:

unread returns to zero according to existing rule.

Do the equivalent Teacher-side spot check.

No change to unread business logic.

============================================================
PART 21 — ATTACHMENT REALTIME AFTER REMOUNT
============================================================

One side remounted.

Counterparty sends/uploads message with attachment.

Verify target receives:

same message
attachment update
no second message bubble

without reload where current implementation promises realtime attachment refresh.

============================================================
PART 22 — RATE-LIMIT RETENTION
============================================================

Use existing:

login-once storageState strategy.

Do not change limits.

Final micro-cert must have:

0 unexpected 429.

If repeated cycles approach global 300/min:

pace the harness deterministically.

Do not swallow/retry a failed scenario into PASS.

============================================================
PART 23 — PUBLISHED REALTIME SMOKE
============================================================

If feasible without creating unstable environment coupling, use the isolated published Release artifact for one two-context realtime smoke.

At minimum:

Student login on publish
Teacher login on publish
both open same Order conversation
Student → Teacher realtime
Teacher → Student realtime

If SignalR browser connection to isolated publish is impractical due test harness routing/config:

state exact reason.

But Student + Teacher authenticated publish smoke remains mandatory.

============================================================
PART 24 — SECURITY RETENTION
============================================================

Any lifecycle fix must not weaken:

conversation authorization
SignalR group authorization
outsider denial
attachment authorization

Re-run focused:

Student B join denial
Teacher B join denial

if hub code changes.

============================================================
PART 25 — CONTEXT LOOKUP RETENTION
============================================================

Do not reopen scalability work.

Run existing CI/regression guard proving:

no 1,000-scan
targeted Order lookup remains.

============================================================
PART 26 — CLOSED-ORDER RETENTION
============================================================

Do not change policy.

Completed conversation must remain:

read
write
attachments
realtime
notifications

according to current documented behavior.

Use Completed Order as one of the remount realtime scenarios.

This is valuable because it directly closes the historical composer/remount concern.

============================================================
PART 27 — FINAL RELEASE 5 BROWSER MICRO-CERT
============================================================

Required scenarios:

1. Published Student login
2. Published Teacher login
3. Student active conversation
4. Teacher active conversation
5. Student remount realtime receive
6. Teacher remount realtime receive
7. Both-side remount realtime
8. Completed Order remount realtime
9. Hard-reload realtime
10. Deduplication after remount
11. Unread after remount
12. Attachment realtime after remount

Required:

12 / 12 PASS
0 FAIL
0 SKIP

============================================================
PART 28 — FINAL BROWSER SAFETY ASSERTIONS
============================================================

For every relevant scenario:

- no unexpected 401;
- no unexpected 429;
- no console.error;
- no pageerror;
- no failed first-party resource;
- no unresolved template URL;
- correct conversation;
- correct role;
- correct Order context;
- HubConnection healthy when realtime expected;
- renderCount = 1.

============================================================
PART 29 — FOUNDATION / RELEASE 4 SMOKE
============================================================

Do not recertify.

Run targeted smoke only:

Landing
Browse
Teacher Profile
Student Dashboard
Teacher Dashboard
Admin Dashboard
Quality Dashboard

Run canonical frontend gates.

Ensure no shared runtime regression.

============================================================
PART 30 — FULL BACKEND REGRESSION
============================================================

Run after browser work sequentially.

Required:

Architecture 1/1
Domain 89/89
Application 5/5
Integration 222/222 or higher legitimate count

0 failures
0 skipped
0 source exclusions.

============================================================
PART 31 — FRONTEND REGRESSION
============================================================

Run:

frontend integrity
localization
localization usage
BUG-001
template/resource leak
JS syntax
auth UI
guided request
notification routing
mobile CTA
browser harness self-test
Release 5 integrity gate
git diff --check

All PASS.

============================================================
PART 32 — DATABASE / EF
============================================================

Expected:

no schema change.

Run:

has-pending-model-changes

Expected:

none.

Migration list unchanged.

No migration for SignalR/widget lifecycle.

============================================================
PART 33 — RELEASE BUILD
============================================================

Run:

dotnet build -c Release

Required:

0 errors.

Do not introduce warnings.

============================================================
PART 34 — FINAL PUBLISH SMOKE
============================================================

Use clean isolated publish.

Required:

/health/live = 200
/health/ready = 200

Student login = 200
Teacher login = 200

Authenticated:

Student conversations = 200
Teacher conversations = 200

Student Dashboard = usable authenticated
Teacher Dashboard = usable authenticated

Active conversation accessible.

Completed conversation accessible.

Static assets 200.

Cache policy correct.

Stop isolated process.

============================================================
PART 35 — DOCUMENTATION
============================================================

Create:

docs/fixes/
PHASE_4_RELEASE_5_MICRO_FINAL_ACCEPTANCE_GATE.md

Evidence:

docs/features/evidence/
phase4-release5-order-communication/micro-final-acceptance/

Required:

published-student-auth-root-cause.md
published-auth-certification.md
signalr-remount-root-cause.md
signalr-lifecycle.md
student-remount.json
teacher-remount.json
both-remount.json
completed-order-remount-realtime.json
remount-20-cycle.json
dedup-after-remount.md
unread-after-remount.md
attachment-after-remount.md
micro-browser-cert.json
backend-regression.md
publish-smoke-final.md
final-summary.md

Update:

docs/features/
PHASE_4_RELEASE_5_ORDER_COMMUNICATION.md

Preserve historical sequence:

PARTIALLY COMPLETED
→ CONDITIONALLY VERIFIED
→ final result

Update:

docs/reports/
PHASE_4_RELEASE_5_ORDER_COMMUNICATION_RETROSPECTIVE.md

Update:

docs/INDEX.md
docs/PROJECT_STATUS.md

Save this prompt:

docs/prompts/
PHASE_4_RELEASE_5_MICRO_FINAL_ACCEPTANCE_GATE.md

============================================================
PART 36 — HISTORY ACCURACY
============================================================

Do NOT rewrite earlier reports.

Historical truth:

Pass 1:
PARTIALLY COMPLETED

Pass 2:
CONDITIONALLY VERIFIED

Pass 3 claimed VERIFIED but disclosed:

- published Student login 401;
- possible `connectCount=0` after remount.

This micro gate exists to resolve those disclosures before canonical final closure.

============================================================
PART 37 — RELEASE 6 HANDOFF
============================================================

Do NOT implement Release 6.

If VERIFIED:

next official Release:

RELEASE 6 — DISCOVERY & CONVERSION

============================================================
FINAL EXIT RULE
============================================================

Return:

RELEASE 5 — ORDER COMMUNICATION VERIFIED

ONLY IF ALL are true:

1. Published Student 401 root cause identified.
2. Clean published Student login = 200.
3. Published Teacher login = 200.
4. Both can access authenticated conversation APIs on publish.
5. SignalR remount behavior is proven, not inferred.
6. Student remount restores realtime.
7. Teacher remount restores realtime.
8. Both-side remount restores realtime.
9. Completed Order remount restores realtime.
10. Hard reload restores realtime where conversation is reopened.
11. No unbounded HubConnection growth.
12. No duplicate HubConnection handlers.
13. No reconnect storm.
14. No duplicate group behavior.
15. Student→Teacher after remount works without reload.
16. Teacher→Student after remount works without reload.
17. 20-cycle remount realtime test = 20/20.
18. renderCount = 1 throughout.
19. Unread behavior remains correct after remount.
20. Attachment realtime remains correct after remount.
21. No unexpected 401 in final micro-cert.
22. No unexpected 429 in final micro-cert.
23. No console.error.
24. No pageerror.
25. No failed first-party resource.
26. Authorization remains correct.
27. 1,000-scan remains closed.
28. Closed-Order policy unchanged.
29. Micro browser certification = 12/12.
30. Foundation/Release 4 smoke clean.
31. Architecture pass.
32. Domain pass.
33. Application pass.
34. Integration pass 0 failures.
35. Frontend gates pass.
36. EF clean.
37. Release build passes.
38. Publish passes.
39. Final publish smoke passes.
40. Health passes.
41. No new Critical/High defect.
42. Documentation complete.
43. Historical verdicts preserved.

NO EXCEPTIONS.

If all pass:

RELEASE 5 — ORDER COMMUNICATION VERIFIED

Otherwise:

RELEASE 5 — ORDER COMMUNICATION CONDITIONALLY VERIFIED

Do NOT create another Release 5 Sprint automatically.

============================================================
FINAL RESPONSE FORMAT
============================================================

Return exactly:

============================================================
PHASE 4 — MARKETPLACE SCALE
RELEASE 5 — ORDER COMMUNICATION
MICRO FINAL ACCEPTANCE GATE
============================================================

## Findings

## Published Student Auth Root Cause

## Published Authentication Certification

## SignalR Remount Root Cause

## SignalR Lifecycle

## Student Remount Realtime

## Teacher Remount Realtime

## Both-Side Remount

## Completed Order Remount Realtime

## Hard Reload / Back-Forward

## 20-Cycle Remount Certification

## Realtime De-duplication

## Unread Retention

## Attachment Realtime Retention

## Rate-Limit Retention

## Authorization / Security Retention

## Context Lookup Retention

## Closed-Order Retention

## Micro Browser Certification

## Foundation / Release 4 Smoke

## Backend Regression

## Frontend Regression

## Database / EF

## Release Build

## Final Publish Smoke

## Files Changed

## Remaining Limitations

## Production Readiness Dependencies

## Risks

## Release 5 Closure

## Release 6 Handoff

Then:

Published Student Auth:
Published Teacher Auth:
SignalR Remount:
Student Remount:
Teacher Remount:
Both-Side Remount:
Completed Remount:
Hard Reload:
20-Cycle:
Deduplication:
Unread:
Attachment Realtime:
429:
Authorization:
Context Lookup:
Closed Orders:
Browser:
Foundation Smoke:
Release 4 Smoke:
Integration:
Release Build:
Release Publish:
Publish Smoke:
Health:
Backend:
Frontend:
Database:
Tests:
Documentation:

Final Verdict — choose exactly one:

- RELEASE 5 — ORDER COMMUNICATION VERIFIED
- RELEASE 5 — ORDER COMMUNICATION CONDITIONALLY VERIFIED
- RELEASE 5 — ORDER COMMUNICATION BLOCKED

If and ONLY if VERIFIED write exactly:

✅ Release 5 — Order Communication Verified & Closed

Then:

🚀 Release 6 — Discovery & Conversion Unblocked

Then exactly:

✅ Finished Phase 4 — Release 5 Micro Final Acceptance Gate
</user_query>