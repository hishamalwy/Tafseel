============================================================
PHASE 4 — MARKETPLACE SCALE
RELEASE 6 — DISCOVERY & CONVERSION

FINAL ACCEPTANCE CLOSURE
============================================================

## Previous Context

Release 6 — Discovery & Conversion is currently:

RELEASE 6 — DISCOVERY & CONVERSION CONDITIONALLY VERIFIED

The core Discovery architecture and implementation are already substantially complete.

Current proven state:

- Discovery remains query/projection/navigation.
- No Discovery domain was created.
- No ranking engine.
- No Recommendation engine.
- No AI.
- Public Teacher eligibility remains canonical.
- Subject discovery works.
- Service discovery uses canonical Service Catalog.
- Subject + Service intersection is truthful.
- Search is server-side.
- Filters are server-backed.
- Sort governance is deterministic.
- No Best / Popular / Trending ranking exists.
- Contextual TeacherService pricing works.
- Teacher cards use contextual offers.
- F-002 trust integrity remains intact.
- Zero-result recovery works.
- Compare works for 2–3 eligible Teachers.
- Teacher Profile contextual conversion works.
- Async Request conversion works.
- Browse pagination is server-side.
- Query work is bounded.
- No 100-row client-side filtering remains.
- No meaningful N+1 remains.
- AR / RTL passes.
- EN / LTR passes.
- Responsive Browse/Profile/Compare passes.
- Integration 224/224 passed in the previous Release 6 pass.
- No migration.
- Release build passed.
- Publish passed.
- Health passed.

Release 5 is NOW canonically:

RELEASE 5 — ORDER COMMUNICATION VERIFIED & CLOSED

Its final rate-limit-aware certification passed with:

- 0 unexpected 429
- rate limits unchanged
- 20/20 remount certification
- 224/224 Integration
- messaging closed

Some Release 6 documentation was written before that final Release 5 closure and still reports a Release 5 canonical status conflict.

That is now stale documentation and must be reconciled WITHOUT rewriting history.

============================================================
ONLY REMAINING RELEASE 6 GAPS
============================================================

The current Release 6 report disclosed these unproven acceptance areas:

1. Authenticated Favorites browser E2E.
2. Guest protected-action → Auth → return-to-intended-context continuation.
3. Populated eligible Live Session conversion E2E.
4. Full Browse/Profile/Compare Back/Forward state continuity.
5. Canonical documentation still contains stale Release 5 status conflict.
6. External screen-reader session was not performed.

The external screen-reader session is NOT automatically a Release blocker if:

- semantic accessibility is correct;
- keyboard behavior is correct;
- ARIA structure is correct;
- focus behavior is correct;
- no blocker is found.

Do not fabricate external screen-reader evidence.

============================================================
GOAL
============================================================

Close ONLY the remaining Release 6 acceptance gaps.

Required final target:

RELEASE 6 — DISCOVERY & CONVERSION VERIFIED

Then:

✅ Release 6 — Discovery & Conversion Verified & Closed

Then:

🚀 Release 7 — Marketplace Intelligence Unblocked

============================================================
THIS IS NOT
============================================================

Do NOT:

- redesign Browse again;
- create a second Discovery implementation;
- add AI;
- add ranking;
- add recommendations;
- add analytics;
- build Release 7;
- redesign Teacher Profile;
- modify messaging;
- reopen Release 5;
- reopen Foundation;
- add fake metrics;
- change Service Catalog business rules;
- change qualification rules;
- weaken rate limits;
- use raw SQL to manufacture UAT business state;
- commit;
- push;
- deploy.

============================================================
PART 1 — RECONCILE CANONICAL DOCUMENTATION
============================================================

Read current:

docs/PROJECT_STATUS.md
docs/INDEX.md

Release 5 reports
Release 5 final rate-limit certification
Release 6 report
Release 6 retrospective

Establish the latest canonical state.

Required truth:

Release 5:
VERIFIED & CLOSED

Release 6:
currently CONDITIONALLY VERIFIED

Preserve historical Release 5 outcomes:

PARTIALLY COMPLETED
→ CONDITIONALLY VERIFIED
→ later certification attempts
→ final VERIFIED & CLOSED

Do NOT erase history.

Fix only stale "Release 5 status conflict" / "Release 6 not chain-unblocked because of R5" statements.

============================================================
PART 2 — WORKTREE COLLISION SAFETY
============================================================

Another agent may begin Release 7 concurrently.

Before changing:

- Browse Teachers
- Teacher Profile
- Compare
- locales
- shared CSS
- Playwright session helpers
- analytics/shared runtime helpers

inspect the latest worktree.

Do not revert unfamiliar concurrent changes.

If Release 7 has added instrumentation:

preserve it unless it causes a proven Release 6 regression.

Do not change analytics semantics in this pass.

============================================================
PART 3 — AUTHENTICATED STUDENT UAT
============================================================

Release 5 established a safe UAT/session strategy.

Reuse it.

Create/reuse a legitimate authenticated Student using:

- existing Development UAT account
- normal registration/confirmation
- supported forgot/reset flow if required

No raw SQL.

No credentials in docs.

No repeated password-reset churn.

Use:

login-once
storageState
one live context per role where possible.

Respect:

auth 10/min/IP
global 300/min effective limit

Reuse the rate-limit-aware browser scheduler.

Accepted final run must have:

0 unexpected 429.

============================================================
PART 4 — AUTHENTICATED FAVORITES E2E
============================================================

This is mandatory.

Use a publicly eligible Teacher appearing in Browse.

Student:

login
→ Browse
→ identify Teacher
→ click Favorite

Verify:

- canonical Favorite endpoint succeeds;
- UI becomes favorited;
- refresh persists;
- Teacher Profile shows same favorite state where applicable.

Then:

unfavorite.

Verify:

- canonical state removed;
- Browse reflects it;
- Profile reflects it;
- refresh persists.

No optimistic UI may remain incorrect after API failure.

============================================================
PART 5 — FAVORITE RACE RETENTION
============================================================

Rapidly toggle once in a controlled test.

Verify:

final UI state
=
final canonical API state.

Do not build a new Favorites subsystem.

If existing implementation already guards the race:

certify it.

============================================================
PART 6 — GUEST PROTECTED-ACTION CONTINUATION
============================================================

Use a Guest.

Start from a real discovery context:

Subject
+
Service
+
Teacher

Test protected action, preferably:

Start Request

and separately Favorite if current auth-return mechanism supports it.

Expected:

Guest clicks protected action
→ canonical Auth flow
→ Student authenticates
→ returns to intended destination/context

Required preserved context where applicable:

teacherId
TeacherServiceId/serviceId
Subject
return URL

Do not create a second Auth flow.

============================================================
PART 7 — AUTH RETURN SECURITY
============================================================

Audit existing return URL handling.

Do not allow open redirect.

Return target must remain same-origin / approved application route according to current auth architecture.

Add/retain security tests if return URL code changes.

============================================================
PART 8 — ASYNC GUEST CONTINUATION
============================================================

Drive:

Guest Browse
→ Subject X
→ Service Async Y
→ Teacher A
→ Profile
→ Start Request
→ Auth
→ Login
→ canonical Guided Request

Required:

Teacher A retained
Service Y retained

No accidental default Teacher/service.

============================================================
PART 9 — LIVE FIXTURE CREATION
============================================================

Release 6 previously lacked a legitimate populated live booking fixture.

Create/reuse one through supported application flows only.

Required legitimate state:

Teacher Live A

- public marketplace eligible;
- approved active qualification for Subject X;
- active non-superseded TeacherService for a canonical live-session catalog service;
- service enabled;
- catalog service active/public;
- live availability configured;
- at least one canonical bookable slot inside the supported scheduling horizon.

Do NOT:

- direct insert raw SQL;
- fake availability in frontend;
- bypass qualification;
- bypass TeacherService;
- manually toggle unsupported internal flags.

If existing UAT Teacher can legitimately be configured through supported API:

reuse it.

============================================================
PART 10 — LIVE AVAILABILITY TRUTH
============================================================

Before browser test, prove via canonical API:

Teacher
+
exact TeacherService
+
availability summary

returns a bookable state.

The selected Service on Browse/Profile must be the SAME service used by availability.

No cross-service availability fallback.

============================================================
PART 11 — POPULATED LIVE CONVERSION E2E
============================================================

Guest or Student:

Browse
→ Subject X
→ canonical Live Service
→ Teacher Live A
→ Profile

Verify:

- correct contextual service selected;
- correct live price;
- correct availability context;
- Book Session CTA visible;
- CTA refers to exact TeacherService.

Click:

Book Session

Expected:

canonical scheduling experience.

Verify:

Teacher retained
TeacherService retained
Subject/context correct
bookable slot present

Do NOT complete payment if unnecessary.

The purpose is conversion routing + eligible populated scheduler proof.

============================================================
PART 12 — LIVE NEGATIVE SAFETY RETENTION
============================================================

Retain existing negative safety:

If Service A has availability but selected Service B does not:

Profile must NOT use Service A's availability to make Service B bookable.

No cross-service fallback.

============================================================
PART 13 — NO-AVAILABILITY STATE
============================================================

Use a legitimate Teacher/service without currently bookable slot where available.

Verify truthful state.

Do not show:

Book Now

when canonical exact-service availability says not bookable.

Possible recovery:

- other service
- change Teacher
- return Browse

only if existing UX supports it.

============================================================
PART 14 — BROWSE BACK/FORWARD JOURNEY
============================================================

This was previously incomplete.

Create non-default discovery state:

Subject X
Service Y
Language L
Price filter
Search term where compatible
Sort
Page if enough data exists

Capture URL.

Navigate:

Browse
→ Teacher Profile
→ Back

Required:

- same Subject;
- same Service;
- same filters;
- same search;
- same sort;
- same page where current URL model promises it.

============================================================
PART 15 — PROFILE → BROWSE CONTINUITY
============================================================

Verify:

Profile breadcrumb/back link

preserves relevant Browse discovery context.

Do not rely only on browser history if the current explicit Browse link already carries state.

Both should behave coherently.

============================================================
PART 16 — BROWSE → COMPARE → BACK
============================================================

Set:

Subject
Service
filters

Select:

Teacher A
Teacher B

Open Compare.

Verify Compare retains:

Subject
Service
correct Teacher contextual offers.

Back to Browse.

Expected:

filter/search/sort context restored.

============================================================
PART 17 — COMPARE → PROFILE → BACK
============================================================

From Compare:

open Teacher B Profile.

Profile must preserve:

selected TeacherService/context.

Back.

Compare state remains coherent.

Then Back again.

Browse discovery state remains coherent.

============================================================
PART 18 — POPSTATE / STALE RESPONSE SAFETY
============================================================

During Back/Forward:

ensure an older Browse API response cannot overwrite a newer restored URL state.

Test rapid:

filter
→ Profile
→ Back

and:

Sort
→ Compare
→ Back

Use existing sequence/abort guard.

Do not add large state framework.

============================================================
PART 19 — URL CANONICALIZATION
============================================================

Inspect URL behavior for invalid/stale IDs.

If Subject/Service no longer exists or is no longer public:

handle gracefully.

Do not crash.

Do not expose hidden service.

Fallback must be deterministic and documented.

============================================================
PART 20 — AUTHENTICATED FAVORITE + NAVIGATION
============================================================

After Favorite state exists:

Browse
→ Profile
→ Back

Favorite state must remain correct.

Do not force unnecessary Favorite re-fetch per render if current architecture already maintains coherent state.

============================================================
PART 21 — ACCESSIBILITY FINAL RETENTION
============================================================

Keyboard-drive:

Browse search
Subject
Service
filters
sort
Favorite
Compare select
Profile
service selection
Request CTA
Live CTA

Verify:

- labels;
- focus;
- selected states;
- status announcements where existing design uses them;
- no keyboard trap;
- RTL ordering does not break logical keyboard operation.

============================================================
PART 22 — SCREEN-READER LIMITATION HANDLING
============================================================

Do not claim a real external screen-reader session if not performed.

Instead perform DOM/accessibility-tree inspection where available.

Verify:

- one meaningful H1;
- heading order;
- accessible control names;
- Compare semantics;
- Favorite state via aria-pressed or equivalent;
- dialog/drawer semantics if used;
- zero-result status semantics;
- CTA accessible names.

If this passes and no external session is explicitly required by current product release policy:

record:

External screen-reader manual session not performed; not considered a blocking defect.

Do NOT fabricate it as PASS.

============================================================
PART 23 — RESPONSIVE RETENTION
============================================================

Recheck changed/relevant surfaces only:

390 × 844
768 × 1024
1440 × 1000

And:

375 mobile Profile CTA geometry.

Surfaces:

Browse
Favorite
Compare
Profile
Live conversion
Guest auth return

No full-page overflow.

============================================================
PART 24 — RATE-LIMIT-AWARE PLAYWRIGHT
============================================================

Reuse Release 5's final certified browser strategy.

Do not repeat login per cell.

Use measured request budget.

No arbitrary dense matrix.

Any unexpected:

429

fails the accepted run.

Do not retry the same failed run into PASS without preserving evidence.

============================================================
PART 25 — FINAL RELEASE 6 BROWSER CERTIFICATION
============================================================

Required live scenarios:

1. Authenticated Favorite add.
2. Favorite persistence after refresh.
3. Favorite remove.
4. Guest async protected action.
5. Auth login return to exact Guided Request context.
6. Populated Live Teacher on Browse.
7. Live Teacher Profile exact service.
8. Live Book Session routing.
9. Exact-service availability proof.
10. Browse → Profile → Back.
11. Browse → Compare → Back.
12. Compare → Profile → Back.
13. Browser Back/Forward discovery state.
14. AR/RTL targeted discovery.
15. EN/LTR targeted discovery.
16. 375 mobile Profile CTA.

Required:

16 / 16 PASS
0 FAIL
0 SKIP

unless one scenario is structurally impossible because current canonical product explicitly does not support that behavior.

If impossible:

classify and explain.

Do not silently skip.

============================================================
PART 26 — BROWSER SAFETY
============================================================

Accepted run requires:

0 unexpected 401
0 unexpected 403
0 unexpected 429
0 500
0 console.error
0 pageerror
0 failed first-party resources
0 unresolved template requests
0 GUID-as-name
0 raw enum
0 page-level horizontal overflow

Expected Guest `/auth/me` behavior must be handled by the app without noisy actionable errors.

============================================================
PART 27 — RELEASE 6 CORE RETENTION
============================================================

Re-run focused assertions proving:

Subject filter
Service filter
Subject + Service intersection
contextual pricing
rating trust
qualified-only
hidden service exclusion
disabled TeacherService exclusion
pending Subject exclusion
approved Subject independence
zero-result recovery
Compare 2–3

Do not rebuild features.

============================================================
PART 28 — QUERY PERFORMANCE RETENTION
============================================================

Re-run bounded Browse query tests.

Expected:

pageSize remains bounded.

No 100-row client filtering.

No per-card N+1.

One visible-page availability batch where required.

Do not optimize without evidence.

============================================================
PART 29 — RELEASE 5 COLLISION RETENTION
============================================================

Release 5 is CLOSED.

Do not reopen messaging.

Run:

Release 5 integrity gate

and a lightweight:

Student Dashboard
Teacher Dashboard
Messages entry

smoke.

Do not recertify Release 5.

============================================================
PART 30 — RELEASE 4 COLLISION RETENTION
============================================================

Smoke only:

Admin Dashboard
Quality Dashboard

Do not alter Release 4 verdict/business logic.

============================================================
PART 31 — FOUNDATION RETENTION
============================================================

Foundation remains CLOSED.

Run:

F-002/public metrics gate
public eligibility
Teacher Profile privacy
Compare integrity
Guided Request
availability
localization
template/resource safety
mobile Profile CTA
browser harness self-test

No Foundation reopening.

============================================================
PART 32 — BACKEND REGRESSION
============================================================

Run current full:

Architecture
Domain
Application
Integration

Previous known baseline:

Architecture 1
Domain 89
Application 5
Integration 224

Counts may legitimately increase.

Require:

0 failures
0 skipped
0 exclusions.

============================================================
PART 33 — FRONTEND REGRESSION
============================================================

Run all current canonical gates.

Require:

PASS.

============================================================
PART 34 — DATABASE / EF
============================================================

Expected:

no migration.

Run:

has-pending-model-changes

Expected:

none.

Do not add schema merely for UAT fixture convenience.

============================================================
PART 35 — RELEASE BUILD
============================================================

Run:

dotnet build -c Release

Required:

0 errors.

No Release 6 new warnings.

============================================================
PART 36 — PUBLISH SMOKE
============================================================

Isolated publish only.

Do NOT deploy.

Verify:

/health/live = 200
/health/ready = 200

Public:

Landing
Browse
Teacher Profile
Compare

Authenticated Student:

login
Browse
Favorite endpoint/state
protected Request route

Live:

Profile/scheduler route loads with legitimate context

Static assets:

200

Cache policy:

correct

0 unexpected 429/500.

Stop isolated instance.

============================================================
PART 37 — PRODUCT SCORE RETENTION
============================================================

Update prior score honestly only if evidence changed.

Do NOT inflate to 10/10 because exit tests passed.

Score:

Discovery Clarity
Subject Discovery
Service Discovery
Search
Filters
Teacher Cards
Zero-Result Recovery
Compare
Teacher Profile Conversion
Live Conversion
Guest Conversion
Mobile
Accessibility
Localization
Trust Integrity
Performance
Architecture

============================================================
PART 38 — DOCUMENTATION
============================================================

Save prompt:

docs/prompts/
PHASE_4_RELEASE_6_FINAL_ACCEPTANCE_CLOSURE.md

Create:

docs/fixes/
PHASE_4_RELEASE_6_FINAL_ACCEPTANCE_CLOSURE.md

Evidence:

docs/features/evidence/
phase4-release6-discovery-conversion/final-acceptance/

Required:

canonical-status-reconciliation.md
authenticated-student-uat.md
favorites-e2e.md
guest-auth-continuation.md
live-fixture.md
live-conversion-e2e.md
exact-service-availability.md
navigation-back-forward.md
compare-navigation.md
accessibility-retention.md
responsive-retention.md
rate-limit-browser-cert.md
backend-regression.md
publish-smoke.md
final-summary.md

Update:

docs/features/
PHASE_4_RELEASE_6_DISCOVERY_AND_CONVERSION.md

Preserve historical:

CONDITIONALLY VERIFIED

and append final certification.

Update:

docs/reports/
PHASE_4_RELEASE_6_DISCOVERY_AND_CONVERSION_RETROSPECTIVE.md

Update:

docs/INDEX.md
docs/PROJECT_STATUS.md

============================================================
FINAL EXIT RULE
============================================================

Return:

RELEASE 6 — DISCOVERY & CONVERSION VERIFIED

ONLY IF ALL are true:

1. Release 5 latest canonical status is reconciled as VERIFIED & CLOSED.
2. Historical R5 outcomes remain preserved.
3. Legit authenticated Student UAT is available.
4. Favorite add browser E2E passes.
5. Favorite refresh persistence passes.
6. Favorite remove passes.
7. Favorite race/state remains safe.
8. Guest protected action routes to canonical Auth.
9. Auth return is same-origin safe.
10. Guest async Request returns to correct Teacher.
11. Guest async Request returns to correct TeacherService.
12. Legit live Teacher fixture exists through supported flows.
13. Live Teacher is publicly eligible.
14. Live TeacherService is canonical/enabled.
15. Exact-service availability is bookable.
16. Browse exposes the live offer correctly.
17. Profile selects exact live TeacherService.
18. Live CTA routes to canonical scheduler.
19. Scheduler retains Teacher/service context.
20. No cross-service availability fallback exists.
21. No-availability safety remains truthful.
22. Browse → Profile → Back retains discovery state.
23. Browse → Compare → Back retains discovery state.
24. Compare → Profile → Back remains coherent.
25. Browser Back/Forward remains coherent.
26. Stale API responses do not overwrite restored state.
27. URL invalid-state handling is safe.
28. Accessibility keyboard retention passes.
29. Accessibility semantics pass.
30. No fabricated external screen-reader claim exists.
31. Responsive targeted coverage passes.
32. 375 Profile CTA geometry passes.
33. AR/RTL passes.
34. EN/LTR passes.
35. Final browser acceptance = all required scenarios PASS.
36. Final accepted browser run has 0 unexpected 429.
37. 0 console.error.
38. 0 pageerror.
39. 0 failed first-party resources.
40. Core Subject filter remains correct.
41. Core Service filter remains correct.
42. Subject+Service intersection remains correct.
43. Contextual price remains correct.
44. F-002 remains correct.
45. Hidden/disabled/ineligible offers remain excluded.
46. Zero-result recovery remains correct.
47. Compare remains 2–3 eligible Teachers.
48. Browse query remains bounded.
49. No client-side 100-row filtering returns.
50. No meaningful N+1 regression.
51. Release 5 integrity smoke passes.
52. Release 4 collision smoke passes.
53. Foundation targeted gates pass.
54. Architecture tests pass.
55. Domain tests pass.
56. Application tests pass.
57. Integration tests pass with 0 failures.
58. Frontend gates pass.
59. EF state clean.
60. Release build passes.
61. Publish succeeds.
62. Publish smoke passes.
63. Health passes.
64. No new Critical/High defect remains.
65. Documentation complete.
66. Historical Conditional verdict preserved.

NO EXCEPTIONS.

If all pass:

RELEASE 6 — DISCOVERY & CONVERSION VERIFIED

Do NOT create Release 6 Sprint 2.

============================================================
FINAL RESPONSE FORMAT
============================================================

Return exactly:

============================================================
PHASE 4 — MARKETPLACE SCALE
RELEASE 6 — DISCOVERY & CONVERSION
FINAL ACCEPTANCE CLOSURE
============================================================

## Findings

## Canonical Status Reconciliation

## Authenticated Student UAT

## Favorites E2E

## Guest Auth Continuation

## Live Fixture

## Exact-Service Availability

## Live Conversion E2E

## Back / Forward Discovery State

## Compare Navigation

## Accessibility Retention

## Responsive Retention

## Rate-Limit-Aware Browser Certification

## Core Discovery Retention

## Query Performance Retention

## Release 5 Collision Retention

## Release 4 Collision Retention

## Foundation Retention

## Backend Regression

## Frontend Regression

## Database / EF

## Release Build

## Publish Smoke

## Files Changed

## Remaining Limitations

## Production Readiness Dependencies

## Risks

## Product Evaluation

## Release 6 Closure

## Release 7 Handoff

Then:

R5 Canonical Status:
Student UAT:
Favorites:
Guest Continuation:
Live Fixture:
Live Availability:
Live Conversion:
Back/Forward:
Compare Navigation:
Accessibility:
Responsive:
Arabic:
English:
429:
Core Discovery:
Performance:
Release 5:
Release 4:
Foundation:
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

- RELEASE 6 — DISCOVERY & CONVERSION VERIFIED
- RELEASE 6 — DISCOVERY & CONVERSION CONDITIONALLY VERIFIED
- RELEASE 6 — DISCOVERY & CONVERSION PARTIALLY COMPLETED
- RELEASE 6 — DISCOVERY & CONVERSION BLOCKED

If and ONLY if VERIFIED write:

✅ Release 6 — Discovery & Conversion Verified & Closed

Then:

🚀 Release 7 — Marketplace Intelligence Unblocked

Then:

✅ Finished Phase 4 — Release 6 Final Acceptance Closure
