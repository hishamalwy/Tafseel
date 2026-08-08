============================================================
PHASE 4 — MARKETPLACE SCALE
RELEASE 5 — ORDER COMMUNICATION

RATE-LIMIT-AWARE FINAL CERTIFICATION GATE
============================================================

## Previous Context

Release 5 — Order Communication is currently:

RELEASE 5 — ORDER COMMUNICATION CONDITIONALLY VERIFIED

The actual Order Communication product behavior is already proven.

Current verified functional baseline:

- Canonical messaging architecture reused.
- No second Chat domain.
- Order-scoped conversations work.
- Student messaging PASS.
- Teacher messaging PASS.
- Attachments PASS.
- Unread / Read PASS.
- Notifications PASS.
- Deep Links PASS.
- Realtime Student → Teacher PASS.
- Realtime Teacher → Student PASS.
- SignalR after remount PASS.
- Student remount PASS.
- Teacher remount PASS.
- Both-side remount PASS.
- Completed Order realtime remount PASS.
- Hard reload PASS.
- Back / Forward PASS.
- Realtime deduplication PASS.
- renderCount = 1.
- Context lookup scalability bug fixed.
- No 1,000-order/request scan.
- Authorization / outsider denial retained.
- Mobile composer PASS.
- AR / RTL PASS.
- EN / LTR PASS.
- Published Student auth PASS.
- Published Teacher auth PASS.
- Integration 222/222 PASS.
- Backend regression PASS.
- Frontend gates PASS.
- EF clean.
- Release build PASS.
- Publish PASS.
- Health PASS.

Historical verdict sequence must remain:

PARTIALLY COMPLETED
→ CONDITIONALLY VERIFIED
→ current final gate result

============================================================
ONLY REMAINING BLOCKER
============================================================

The dense synthetic remount certification still exceeded the real global rate limit.

Current configured limits remain:

Auth:
10 requests/min/IP
for relevant login / refresh / forgot / reset paths.

Global:
300 requests/min
for general API traffic.

Previous dense remount run produced:

Student:
17 unexpected 429

Teacher:
2 unexpected 429

Functional behavior itself still passed:

20/20 remount cycles
HubConnection Connected
renderCount = 1
status401 = 0

However the Release Exit Rule requires:

ZERO unexpected 429

Therefore Release 5 cannot be marked VERIFIED until an accepted browser certification run completes within the real rate limits.

============================================================
GOAL
============================================================

Prove one of two things:

A)

The product generates a reasonable request volume during normal/remount behavior, and previous 429 responses were caused only by an unrealistically dense certification pattern.

Then:

fix the HARNESS scheduling/session strategy only.

OR:

B)

A single legitimate dashboard/widget remount causes abnormal request fan-out.

Then:

classify and fix the smallest actual application issue.

Final required outcome:

Functional certification:
PASS

Safety certification:
PASS

Unexpected 429:
ZERO

Rate-limit configuration:
UNCHANGED

============================================================
THIS IS NOT
============================================================

This is NOT:

- Release 5 Sprint 2
- another Messaging pass
- another SignalR redesign
- new UX work
- new attachment work
- Release 6
- Foundation recertification
- Load Testing
- Performance benchmarking
- Production infrastructure work

Do not expand scope.

============================================================
NON-NEGOTIABLE RULES
============================================================

Do NOT:

- increase the 10/min auth limit;
- increase the 300/min global limit;
- disable rate limiting;
- exempt browser tests from rate limiting;
- create Development-only limiter bypass;
- whitelist Playwright;
- suppress 429;
- ignore console errors;
- ignore failed network requests;
- retry-until-green;
- classify a failed scenario as PASS after retry;
- add giant arbitrary sleeps without measurement;
- redesign chat;
- change messaging domain;
- change closed-order policy;
- modify Release 4;
- commit;
- push;
- deploy.

The accepted final run must execute against the SAME effective limiter policies as the product.

============================================================
PART 1 — BASELINE RECONCILIATION
============================================================

Read:

- docs/PROJECT_STATUS.md
- Release 5 implementation report
- Final Acceptance report
- Final Browser Certification report
- Micro Final Acceptance report
- Release 5 retrospective
- browser certification documentation

Inspect current worktree.

Confirm no concurrent Release 4/5 work has been overwritten.

Before browser experimentation run:

Architecture
Domain
Application
Integration

Expected baseline:

Architecture 1/1
Domain 89/89
Application 5/5
Integration 222/222

Require:

0 failures.

============================================================
PART 2 — IDENTIFY EXACT LIMITER POLICIES
============================================================

Trace actual current rate-limit configuration.

Document:

Auth policy:
- permit limit
- window
- queue behavior
- endpoints using it
- partitioning key

Global limiter:
- permit limit
- window
- queue behavior
- partitioning key

Do not infer from previous reports only.

Prove from current code/runtime.

============================================================
PART 3 — BUILD REQUEST-BUDGET INSTRUMENTATION
============================================================

Before changing harness pacing, instrument the browser test.

For every certification action capture:

timestamp
role
test/scenario
cycle
HTTP method
route family
status
request count in current rolling window
SignalR negotiate count
conversation-list requests
order requests
learning-request requests
notification requests
message requests
static-resource requests where relevant

Do NOT record:

password
JWT
refresh token
cookie values
private message bodies

============================================================
PART 4 — REQUEST-BUDGET TRACE
============================================================

Produce a machine-readable trace similar to:

cycle
role
startedAt
finishedAt
apiRequests
authRequests
conversationRequests
orderRequests
notificationRequests
messageRequests
signalRNegotiateRequests
rolling60sRequests
status2xx
status401
status429
consoleErrors
failedFirstPartyRequests

Required artifact:

request-budget-trace.json

============================================================
PART 5 — MEASURE ONE NORMAL PAGE LOAD
============================================================

Start with a clean authenticated Student session.

Measure:

Student Dashboard initial load.

Record total relevant API requests.

Then measure:

Teacher Dashboard initial load.

Do not remount repeatedly yet.

This establishes normal user baseline.

============================================================
PART 6 — MEASURE ONE CONVERSATION OPEN
============================================================

Using existing authenticated contexts:

Dashboard
→ open one Order conversation

Measure incremental requests.

Separate:

conversation list
conversation detail/messages
Order context
LearningRequest context
notifications
SignalR negotiate/join

Expected:

bounded behavior.

============================================================
PART 7 — MEASURE ONE REMOUNT CYCLE
============================================================

Drive exactly ONE historical remount sequence.

Measure:

requests before
requests during
requests after

Count:

- conversations calls;
- Order context calls;
- request context calls;
- SignalR negotiate;
- notification calls;
- repeated bootstrap calls.

Then repeat once for Teacher.

Do not perform 20 cycles before understanding one.

============================================================
PART 8 — DETECT ABNORMAL REQUEST FAN-OUT
============================================================

Inspect whether a single normal/remount operation triggers duplicated calls.

Examples to investigate:

GET /conversations repeated unnecessarily
GET /orders/{id} repeated unnecessarily
GET /learning-requests/{id} repeated unnecessarily
duplicate notification loads
multiple SignalR negotiate requests
multiple dashboard boot sequences
duplicate widget injections
multiple event listeners firing the same loader

Do NOT assume duplicates are bugs.

For each repeated call determine:

expected
or
unnecessary.

============================================================
PART 9 — FAN-OUT CLASSIFICATION
============================================================

If one legitimate remount generates abnormal duplicate traffic:

classify as:

UI/View Issue
or
Technical Debt
or
Production Bug

depending on user impact.

Fix only the proven duplication.

Examples of acceptable narrow fixes:

- idempotent data loading;
- avoid duplicate initialization;
- reuse an in-flight promise;
- prevent duplicate listener registration;
- avoid reconnect when hub already Connected/Connecting;
- prevent same conversation context loading twice during one selection.

Do NOT add broad client caching just to hide traffic.

============================================================
PART 10 — IF REQUEST VOLUME IS NORMAL
============================================================

If one page load/open/remount produces reasonable bounded traffic and only the synthetic test density pushes the rolling minute above 300:

classify:

Test Issue

Then:

DO NOT modify product behavior unnecessarily.

Fix certification scheduling instead.

============================================================
PART 11 — AUTH SESSION RETENTION
============================================================

Reuse the proven login-once approach.

One authenticated live context per role:

Student A
Teacher A

Use Playwright storageState safely.

Do not repeatedly login.

Do not repeatedly refresh intentionally.

Do not reset UAT users during this certification.

Student B / Teacher B are not required for this rate-limit gate unless authorization code changes.

============================================================
PART 12 — RATE-LIMIT-AWARE SCHEDULER
============================================================

Implement a deterministic browser-test request-budget scheduler.

It must understand the measured request volume.

Do NOT simply add:

sleep(20000)

without reasoning.

Instead derive a safe execution cadence from:

global limit
window duration
measured requests per scenario/cycle
current rolling request budget
safety headroom

============================================================
PART 13 — SAFETY HEADROOM
============================================================

Do not design the certification to run at exactly 299/300.

Use reasonable test headroom.

Example concept:

Global budget:
300/min

Certification target:
remain comfortably below the maximum rolling window.

Choose the exact budget based on measured traffic.

Document the decision.

Do not change server configuration.

============================================================
PART 14 — BATCHED REMOUNT CERTIFICATION
============================================================

The 20-cycle remount proof must remain.

But it does NOT need to simulate:

20 humans remounting continuously within seconds.

Execute in measured safe batches.

Example conceptual structure:

5 cycles
→ wait only until rolling request budget is safely available
→ next 5
→ budget recovery
→ next 5
→ budget recovery
→ final 5

The actual batch size must come from request-budget evidence.

Do not hardcode this example blindly.

============================================================
PART 15 — BUDGET-AWARE WAITING
============================================================

Preferred:

track request timestamps generated by the test harness and calculate when enough requests have aged out of the rolling limiter window.

Wait until:

available request budget >= estimated next batch + safety margin.

This is better than arbitrary sleep.

If the limiter implementation exposes headers such as:

Retry-After
RateLimit-Remaining
RateLimit-Reset

use them only if actually present and reliable.

Do not invent them.

============================================================
PART 16 — FAIL ON ANY 429
============================================================

Critical:

The accepted final certification run must still FAIL immediately or mark the run failed if any unexpected:

HTTP 429

occurs.

Do NOT:

catch
wait
retry
then call the original cell PASS.

A run containing 429 is not the accepted final run.

============================================================
PART 17 — AUTH LIMIT SAFETY
============================================================

Because auth limit is 10/min/IP:

Final accepted certification should ideally use:

one Student login
one Teacher login

Do not consume auth budget unnecessarily.

Track auth requests separately.

Expected:

0 auth 429.

============================================================
PART 18 — SIGNALR NEGOTIATE BUDGET
============================================================

Count SignalR negotiate calls explicitly.

Expected behavior:

initial connection
+
legitimate reconnection after deliberate teardown/remount where needed

Not:

negotiate on every message
negotiate on every render
multiple negotiate calls while already Connected.

If negotiate count is abnormally high:

investigate app lifecycle.

============================================================
PART 19 — SIGNALR LIFECYCLE RETENTION
============================================================

Retain all proven lifecycle behavior:

shared:

window.__tafseelMessageHub

and:

window.__tafseelEnsureHub

or current canonical equivalent.

Verify:

Connected remains reused.

No concurrent start().

pagehide handling correct.

pageshow/reinject reconnect correct.

No duplicate handlers.

No reconnect storm.

============================================================
PART 20 — FUNCTIONAL 20-CYCLE REMOUNT
============================================================

Retain the same functional invariant.

At least:

10 Student remount cycles
10 Teacher remount cycles

Each cycle:

1. Open/reopen conversation.
2. Hub Connected when realtime expected.
3. Counterparty sends unique token.
4. Target receives without reload.
5. renderCount = 1.

Required:

20/20 PASS.

============================================================
PART 21 — SAFETY 20-CYCLE ASSERTIONS
============================================================

Across the entire accepted 20-cycle run:

status401 = 0 unexpected
status429 = 0
console.error = 0
pageerror = 0
failed first-party resource = 0

No unresolved template request.

============================================================
PART 22 — BOTH-DIRECTION REALTIME RETENTION
============================================================

Final accepted run must include:

Student → Teacher

and:

Teacher → Student

after remount.

No reload.

renderCount = 1.

============================================================
PART 23 — COMPLETED ORDER RETENTION
============================================================

Retain one Completed Order remount realtime proof.

Verify:

read
write
realtime
attachments/history context

according to current documented policy.

Do NOT revisit product policy.

============================================================
PART 24 — UNREAD RETENTION
============================================================

Spot-check after final harness changes:

recipient away:
unread increases.

open conversation:
unread becomes zero.

No business logic changes expected.

============================================================
PART 25 — ATTACHMENT RETENTION
============================================================

One browser attachment flow is enough for this gate.

Verify:

attachment send
counterparty display
no duplicate bubble
no 429

Attachment-only messages remain backlog.

============================================================
PART 26 — NOTIFICATION DEEP LINK RETENTION
============================================================

Student and Teacher deep links were already proven.

Spot-check at least one role in accepted rate-safe run.

Do not trigger large notification churn.

============================================================
PART 27 — AUTHENTICATED LOCALIZATION RETENTION
============================================================

Do not rerun unnecessary dense permutations.

Retain targeted cells:

390:
AR / RTL / Dark

1440:
EN / LTR / Light

And preserve existing 375/768 evidence unless code affecting responsive/localization changed.

If shared UI changed:

increase appropriately.

============================================================
PART 28 — NO GIANT MATRIX
============================================================

Do NOT create another huge combinatorial matrix solely for closure.

The only open acceptance issue is unexpected 429 under certification traffic.

Use the smallest sufficient browser set preserving Release 5 confidence.

============================================================
PART 29 — ACCEPTED FINAL BROWSER RUN
============================================================

Create one canonical:

release5-rate-limit-final-cert

runner.

It must include:

1. Student login once.
2. Teacher login once.
3. Student active Order conversation.
4. Teacher active Order conversation.
5. Student→Teacher realtime.
6. Teacher→Student realtime.
7. Student remount cycles.
8. Teacher remount cycles.
9. Completed Order remount.
10. Deduplication.
11. Unread.
12. Attachment.
13. Notification/deep-link spot-check.
14. AR/RTL targeted state.
15. EN/LTR targeted state.

============================================================
PART 30 — FINAL CERTIFICATION CONDITIONS
============================================================

Final accepted browser run:

Functional scenarios:
ALL PASS

20-cycle:
20/20 PASS

Unexpected 401:
0

Unexpected 429:
0

console.error:
0

pageerror:
0

failed first-party requests:
0

unresolved templates:
0

duplicate message render:
0

duplicate widgets:
0

Hub reconnect storms:
0

============================================================
PART 31 — DO NOT HIDE PRIOR FAILED RUNS
============================================================

Preserve evidence of:

previous dense run with 17 Student + 2 Teacher 429.

If an intermediate attempt in this pass gets 429:

preserve it too.

Then fix harness/product cause and perform a fresh run.

Do not overwrite failed JSON with final successful JSON.

Historical evidence must remain auditable.

============================================================
PART 32 — REQUEST-BUDGET FINAL REPORT
============================================================

Final evidence must explain:

- requests per Student Dashboard load;
- requests per Teacher Dashboard load;
- requests per conversation open;
- requests per remount;
- negotiate calls per remount;
- maximum rolling 60-second request count during accepted run;
- configured global limit;
- chosen safety headroom;
- why the accepted run represents realistic product behavior.

============================================================
PART 33 — REALISTIC-USE JUSTIFICATION
============================================================

Answer explicitly:

Could a normal interactive Student/Teacher hit 300/min using ordinary Order communication?

If NO:

show evidence.

If YES:

this is no longer merely Test Issue.

Classify and fix the underlying product traffic before closing.

============================================================
PART 34 — OPTIONAL REQUEST-FANOUT REGRESSION GATE
============================================================

If this pass discovers/fixes duplicate request fan-out:

add a narrow regression gate.

Example invariant:

one conversation selection must not trigger more than the proven intended number of:

Order context loads
LearningRequest context loads
hub connect/join operations

Do not create brittle exact-count tests if incidental implementation reads may legitimately vary.

Test meaningful upper bounds/invariants.

============================================================
PART 35 — FOUNDATION RETENTION
============================================================

Run canonical lightweight gates:

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

No full Foundation reopening.

============================================================
PART 36 — RELEASE 4 COLLISION SMOKE
============================================================

Do not change R4.

Smoke:

Admin Dashboard
Quality Dashboard

and any shared-runtime routes touched.

Current Release 4 verdict remains separate.

============================================================
PART 37 — BACKEND REGRESSION
============================================================

Run final:

Architecture
Domain
Application
Integration

Current expected baseline:

1
89
5
222

Counts may increase legitimately.

Require:

0 failures
0 skipped
0 source exclusions.

============================================================
PART 38 — FRONTEND REGRESSION
============================================================

All canonical frontend gates:

PASS.

Final rate-limit-aware browser certification:

PASS.

============================================================
PART 39 — DATABASE / EF
============================================================

Expected:

no migration.

Run:

has-pending-model-changes

Expected:

none.

Migration list unchanged.

============================================================
PART 40 — RELEASE BUILD
============================================================

Run:

dotnet build -c Release

Required:

0 errors.

No newly introduced warnings.

============================================================
PART 41 — FINAL PUBLISH SMOKE
============================================================

Use isolated published output.

Do NOT deploy.

Required:

/health/live = 200
/health/ready = 200

Student login = 200
Teacher login = 200

Authenticated conversations:

200

Active Order thread:

accessible

Completed Order thread:

accessible

Static assets:

200

Cache headers:

correct

No unexpected:

401
429

Stop instance after smoke.

No need to rerun dense browser matrix against publish.

============================================================
PART 42 — DOCUMENTATION
============================================================

Create:

docs/fixes/
PHASE_4_RELEASE_5_RATE_LIMIT_AWARE_FINAL_CERTIFICATION.md

Evidence:

docs/features/evidence/
phase4-release5-order-communication/rate-limit-final-cert/

Required:

limiter-configuration.md
request-budget-baseline.json
request-budget-analysis.md
single-remount-trace.json
fanout-analysis.md
harness-scheduling-strategy.md
rate-limit-final-cert.json
rate-limit-final-cert.md
remount-20-cycle-rate-safe.json
realtime-retention.json
request-budget-final.json
foundation-retention.md
release4-smoke.md
backend-regression.md
publish-smoke.md
final-summary.md

Update:

docs/features/
PHASE_4_RELEASE_5_ORDER_COMMUNICATION.md

Preserve:

PARTIALLY COMPLETED
CONDITIONALLY VERIFIED
all previous failed/conditional gates

Append this pass as a new certification stage.

Update:

docs/reports/
PHASE_4_RELEASE_5_ORDER_COMMUNICATION_RETROSPECTIVE.md

Update:

docs/INDEX.md
docs/PROJECT_STATUS.md

Save this prompt:

docs/prompts/
PHASE_4_RELEASE_5_RATE_LIMIT_AWARE_FINAL_CERTIFICATION.md

============================================================
PART 43 — RELEASE 5 HISTORY
============================================================

Do NOT rewrite history.

Canonical sequence before this gate:

Implementation:
PARTIALLY COMPLETED

Final Acceptance:
CONDITIONALLY VERIFIED

Final Browser Closure attempt:
conditional because 429 remained

Micro Acceptance:
conditional because dense remount still generated 429

This pass decides the final canonical Release 5 state.

============================================================
FINAL EXIT RULE
============================================================

Return:

RELEASE 5 — ORDER COMMUNICATION VERIFIED

ONLY IF ALL are true:

1. Current limiter configuration is documented from code/runtime.
2. Rate limits remain unchanged.
3. No test bypass exists.
4. Request-budget instrumentation exists.
5. Normal Student Dashboard request volume measured.
6. Normal Teacher Dashboard request volume measured.
7. Conversation-open request volume measured.
8. Single remount request volume measured.
9. SignalR negotiate volume measured.
10. Abnormal app request fan-out is either absent or fixed.
11. Any app fan-out fix has regression protection.
12. Final harness uses login-once role sessions.
13. Auth limit remains respected.
14. Global limit remains respected.
15. Harness scheduling is derived from request budget, not arbitrary sleeps.
16. Failed intermediate 429 runs remain preserved as evidence.
17. Final accepted browser run contains 0 unexpected 429.
18. Final accepted browser run contains 0 unexpected 401.
19. Final accepted browser run contains 0 console.error.
20. Final accepted browser run contains 0 pageerror.
21. Final accepted browser run contains 0 failed first-party resources.
22. No unresolved-template request exists.
23. Student messaging passes.
24. Teacher messaging passes.
25. Student→Teacher realtime passes.
26. Teacher→Student realtime passes.
27. Student remount realtime passes.
28. Teacher remount realtime passes.
29. Completed Order remount realtime passes.
30. Remount certification = 20/20.
31. renderCount = 1.
32. No duplicate widgets.
33. No reconnect storm.
34. Unread retention passes.
35. Attachment retention passes.
36. Deep-link spot-check passes.
37. AR/RTL targeted certification passes.
38. EN/LTR targeted certification passes.
39. Context lookup scalability fix remains closed.
40. Authorization/security remain intact.
41. Foundation lightweight gates pass.
42. Release 4 collision smoke passes.
43. Architecture tests pass.
44. Domain tests pass.
45. Application tests pass.
46. Integration tests pass with 0 failures.
47. Frontend gates pass.
48. EF has no pending model changes.
49. Release build passes.
50. Publish succeeds.
51. Publish smoke passes.
52. Health passes.
53. No Critical/High defect remains.
54. Documentation/evidence is complete.
55. Historical verdicts are preserved.

NO EXCEPTIONS.

If ANY unexpected 429 occurs in the accepted final run:

DO NOT mark VERIFIED.

If all 55 conditions pass:

RELEASE 5 — ORDER COMMUNICATION VERIFIED

and Release 5 is CLOSED.

Do NOT create another Release 5 Sprint.

============================================================
FINAL RESPONSE FORMAT
============================================================

Return exactly:

============================================================
PHASE 4 — MARKETPLACE SCALE
RELEASE 5 — ORDER COMMUNICATION
RATE-LIMIT-AWARE FINAL CERTIFICATION
============================================================

## Findings

## Limiter Configuration

## Request Budget Instrumentation

## Normal Dashboard Request Budget

## Conversation Request Budget

## Remount Request Budget

## SignalR Negotiate Budget

## Request Fan-Out Analysis

## Product vs Harness Classification

## Harness Scheduling Strategy

## Authentication Session Retention

## 20-Cycle Rate-Safe Remount Certification

## Student Messaging Retention

## Teacher Messaging Retention

## Two-Direction Realtime Retention

## Completed Order Retention

## Realtime De-duplication

## Unread Retention

## Attachment Retention

## Notification / Deep-Link Retention

## Authenticated Localization Retention

## Context Lookup Retention

## Authorization / Security Retention

## Final Browser Safety Certification

## Foundation Retention

## Release 4 Collision Smoke

## Backend Regression

## Frontend Regression

## Database / EF

## Release Build

## Publish Smoke

## Files Changed

## Remaining Limitations

## Production Readiness Dependencies

## Risks

## Release 5 Closure

## Release 6 Handoff

Then:

Auth Limit:
Global Limit:
Limits Changed:
Normal Student Requests:
Normal Teacher Requests:
Conversation Open Requests:
Remount Requests:
Max Rolling 60s:
Safety Headroom:
Fan-Out:
Harness Scheduling:
429:
401:
Student Messaging:
Teacher Messaging:
Realtime:
Remount:
20-Cycle:
Deduplication:
Unread:
Attachments:
Deep Links:
Arabic:
English:
Context Lookup:
Authorization:
Security:
Browser:
Foundation:
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

✅ Finished Phase 4 — Release 5 Rate-Limit-Aware Final Certification
