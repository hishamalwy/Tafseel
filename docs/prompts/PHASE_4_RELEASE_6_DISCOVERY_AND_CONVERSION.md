============================================================
PHASE 4 — MARKETPLACE SCALE
RELEASE 6 — DISCOVERY & CONVERSION

FULL RELEASE EXECUTION
============================================================

## Previous Context

Tafseel is an educational marketplace connecting:

- Students
- Teachers
- Quality Reviewers
- Admins

Marketplace Foundation is already:

MARKETPLACE PRODUCT INTEGRITY VERIFIED
PHASE 4 FOUNDATION VERIFIED & CLOSED

Release 4 — Marketplace Operations exists in the current worktree and may still carry a conditional certification status.

Release 5 — Order Communication has implemented the canonical Order-scoped communication experience and may be running a final certification gate concurrently in another agent/workstream.

DO NOT assume Release 5 is officially CLOSED unless:

docs/PROJECT_STATUS.md

and the latest canonical Release 5 report explicitly say:

RELEASE 5 — ORDER COMMUNICATION VERIFIED & CLOSED

You MAY execute Release 6 engineering work in parallel, but:

- do not alter Release 5 messaging business behavior;
- do not overwrite concurrent shared-runtime changes;
- do not declare Release 6 officially release-chain-unblocked unless canonical docs allow it.

============================================================
RELEASE 6 PRODUCT PROBLEM
============================================================

Tafseel already has:

- teacher browsing;
- subject filtering;
- service/catalog concepts;
- Teacher Profile;
- Teacher Comparison;
- qualification/trust data;
- pricing;
- availability summaries;
- ratings based only on eligible visible reviews;
- request/session conversion paths.

But marketplace discovery is still more functional than premium.

The Student should not need to understand the internal data model to answer:

"What teacher fits what I need?"

The marketplace must help a Student move naturally through:

Need
→ Subject
→ Service
→ Teacher
→ Compare
→ Profile
→ Request / Live Session

without:

- fake rankings;
- unsupported metrics;
- fake popularity;
- AI-generated recommendations;
- fabricated urgency;
- misleading "best teacher" claims.

============================================================
RELEASE 6 GOAL
============================================================

Deliver a premium, trustworthy, conversion-oriented discovery experience.

By the end of Release 6:

1. Browse Teachers is substantially more usable and polished.
2. Search works around real Student intent.
3. Filters use canonical marketplace data.
4. Subject and Service discovery are coherent.
5. Zero-result states actively help Students recover.
6. Teacher cards communicate truthful differentiation.
7. Compare becomes a useful decision tool, not just a table.
8. Teacher Profile becomes the strongest conversion surface.
9. Request / Live Session CTAs route correctly from discovery.
10. Mobile discovery is first-class.
11. AR/EN discovery UX is polished.
12. No fake ranking or unsupported metrics are introduced.
13. Full browser certification and regression are completed.
14. Release retrospective is completed in the same Release.

============================================================
NON-NEGOTIABLE PRODUCT INTEGRITY
============================================================

F-002 / marketplace trust rules remain binding.

DO NOT introduce or display unsupported public metrics such as:

- Completed Orders
- Completion Rate
- Response Time
- Fastest Response
- Most Experienced
- Popularity Score
- Success Rate
- Top Seller
- Trending Teacher
- AI Score
- Conversion Score
- Number of Students taught

unless the current repository has a canonical persisted formula and governance decision explicitly approving the metric.

Do NOT infer:

"Best"
"Top"
"Most Popular"
"Recommended"

from arbitrary data.

Ratings remain based only on eligible visible reviews.

Qualification trust remains evidence-based.

============================================================
NO AI IN RELEASE 6
============================================================

Do NOT implement:

- Groq search
- LLM query interpretation
- semantic embeddings
- AI ranking
- AI recommendations
- AI teacher matching
- AI-generated teacher labels

Those belong to:

Release 8 — AI-Assisted Marketplace

Release 6 is deterministic marketplace discovery.

============================================================
MANDATORY FINDING CLASSIFICATION
============================================================

Before changing any discovered issue classify it as exactly one of:

- Production Bug
- UI/View Issue
- API Mismatch
- Business Ambiguity
- Legacy Compatibility
- Dead Code
- Test Issue
- Missing Feature
- Technical Debt

Do not classify normal product-improvement opportunities as Production Bugs.

============================================================
PART 1 — EVIDENCE-FIRST CURRENT-STATE AUDIT
============================================================

Before implementation trace the actual current state of:

- Browse Teachers page
- Browse API
- Teacher marketplace projections
- Teacher Profile
- Teacher Comparison
- Service Catalog
- TeacherService
- Subjects
- Languages
- Availability summary
- ratings/reviews
- qualification/public eligibility
- favorites
- Guided Request entry
- Live Session booking entry
- localization
- responsive CSS
- current browser tests

Read:

docs/PROJECT_STATUS.md
docs/INDEX.md

and all relevant reports for:

- Teacher Comparison
- Teacher Profile
- Public Profile Hardening
- Live Session Availability
- Marketplace Service Catalog
- Guided Request
- F-002
- Foundation Final Acceptance

Do NOT design from stale assumptions.

============================================================
PART 2 — DISCOVERY DOMAIN DECISION
============================================================

Determine what already represents:

Teacher marketplace availability
Teacher subjects
Teacher services
Service catalog categories
pricing
qualifications
ratings
availability

Release 6 should primarily be:

projection
query
navigation
presentation

not a new domain.

Do NOT create:

DiscoveryProfile
TeacherSearchEntity
MarketplaceRanking
Recommendation
DiscoveryIndex

unless an actual missing persistence invariant is proven.

Prefer:

existing entities
+
query DTOs
+
server-side filtering/sorting.

============================================================
PART 3 — BROWSE INFORMATION ARCHITECTURE
============================================================

Redesign/refine Browse Teachers around Student decision-making.

Preferred hierarchy:

1. What are you studying?
2. What kind of help do you need?
3. Optional preference filters
4. Matching Teachers
5. Compare / Profile / Request

The page should not feel like a generic database filter screen.

At the same time:

do NOT hide useful advanced filters.

============================================================
PART 4 — SUBJECT-FIRST DISCOVERY
============================================================

Subject must remain a canonical discovery axis.

Students should be able to:

- choose Subject clearly;
- understand active selected Subject;
- change Subject easily;
- see only eligible Teachers for that Subject.

Use canonical public eligibility rules.

Do not surface a Teacher for a Subject solely because:

Teacher historically applied

or:

a stale subject record exists.

Teacher must satisfy current public marketplace eligibility.

============================================================
PART 5 — SERVICE-FIRST DISCOVERY
============================================================

The canonical marketplace Service Catalog already exists.

Use it.

Student should be able to discover by help type such as actual active catalog services.

Examples may include current canonical categories like:

- Recorded Explanation
- Academic Support
- Live Learning
- Revision / Exam Preparation
- Study Materials
- Project Guidance

Use actual DB/catalog values.

Do not hardcode a parallel service taxonomy if the catalog already provides one.

============================================================
PART 6 — SUBJECT + SERVICE INTERSECTION
============================================================

A Teacher shown for:

Subject X
+
Service Y

must actually have an enabled TeacherService representing that legitimate intersection where current domain requires it.

Do NOT display a Teacher because:

they teach Subject X

while Service Y is not actually enabled/offered by that Teacher.

Respect:

TeacherService
Subject qualification
Catalog visibility
Teacher service enabled state

============================================================
PART 7 — DISCOVERY ENTRY MODES
============================================================

Browse should support legitimate entry paths:

Generic Browse:
no preselected Subject/Service

Subject-first:
?subjectId=...

Service-first:
?service=...

Teacher/Profile back-navigation

Comparison return

Potential Guided Request handoff

Use query parameters where useful.

Do not create separate pages for every discovery combination.

============================================================
PART 8 — SEARCH EXPERIENCE
============================================================

Audit current search.

Implement/refine deterministic server-side search.

Useful search may include:

- Teacher display name
- Subject name
- Service/catalog name where relevant

Potential bilingual matching:

Arabic
English

based on actual persisted names.

Do not pretend transliteration/semantic matching exists unless implemented properly.

============================================================
PART 9 — SEARCH NORMALIZATION
============================================================

Implement reasonable normalization only where architecture supports it.

Examples:

trim
case-insensitive matching
safe whitespace normalization

For Arabic, evaluate existing database/search behavior.

Do not introduce a fragile custom NLP pipeline.

Do not silently transform meaning.

============================================================
PART 10 — FILTER SET
============================================================

Audit which filters are genuinely useful and truthful.

Potential canonical filters:

Subject
Service
Teaching language
Price range
Availability
Verified/qualified eligibility
Rating threshold
Live-session availability
Delivery time where TeacherService legitimately stores it

Do NOT add a filter for a metric that does not have canonical data.

============================================================
PART 11 — FILTER SEMANTICS
============================================================

Each filter must have a precise business meaning.

Examples:

"Available for live sessions"

must derive from actual live availability summary, not:

Teacher has ever configured schedule.

"Price"

must be scoped correctly to selected service.

Do not compare unrelated service prices.

============================================================
PART 12 — FILTER DEPENDENCIES
============================================================

Filters should respond coherently to selected context.

Example:

Student selects:

Subject = Mathematics
Service = Recorded Explanation

Price filter should relate to:

the relevant TeacherService offer.

Not:

a random minimum from a different service.

============================================================
PART 13 — SERVER-SIDE FILTERING
============================================================

Growing result sets must filter/search/sort server-side.

Do NOT:

fetch all Teachers
→ filter in JavaScript.

Use bounded pagination.

Inspect query shape for:

N+1
unbounded includes
client evaluation.

============================================================
PART 14 — SORTING
============================================================

Audit current sorting options.

Allowed sorting must be truthful.

Potential valid sorts:

Name
Rating
Price ascending
Price descending

Potentially availability if there is a deterministic canonical value.

Do NOT introduce:

Best Match
Recommended
Popular
Trending
Top Teacher

without a defined ranking model.

If "Best Match" currently exists without a formula:

remove/rename it.

============================================================
PART 15 — DEFAULT SORT
============================================================

Choose a neutral default.

Do NOT use undocumented algorithmic preference.

Possible safe defaults:

Name
or
Rating with explicit stable fallback

only if product behavior supports it.

Document the chosen default and reason.

============================================================
PART 16 — TEACHER CARD INFORMATION HIERARCHY
============================================================

Teacher cards should let a Student decide whether to open Profile.

Prioritize:

- Teacher display name
- relevant Subject
- relevant Service
- truthful rating + count if eligible
- relevant price
- trust/qualification cue
- relevant availability summary
- concise bio
- Compare
- Favorite
- View Profile

Avoid overload.

============================================================
PART 17 — CONTEXTUAL TEACHER CARD
============================================================

If Student entered Browse with:

Subject X
Service Y

the card should focus on:

that Subject
that Service
that price
that delivery/live context

not unrelated Teacher offerings.

============================================================
PART 18 — MULTI-SUBJECT TEACHERS
============================================================

Do not duplicate a Teacher card unnecessarily for each subject unless the UX explicitly requires separate offerings.

If selected Subject exists:

show it as primary context.

Other qualified subjects may appear subtly.

Avoid the previous duplicate-subject-chip class of problem.

============================================================
PART 19 — RATINGS
============================================================

Preserve F-002 rules.

Rating shown must come from:

eligible visible reviews only.

If ratingCount = 0:

do not render misleading:

0.0 stars

as if negatively rated.

Use a neutral:

No reviews yet

presentation.

============================================================
PART 20 — TRUST BADGES
============================================================

Every trust badge must be evidence-backed.

Allowed examples only if canonical data supports them:

Qualified on Tafseel
Approved teaching sample
Reviewed showcase

Do NOT create badges like:

Expert
Top Teacher
Fast Responder
Student Favorite

without canonical governance.

============================================================
PART 21 — AVAILABILITY PRESENTATION
============================================================

Use current canonical availability summary.

Do NOT display:

Online now
Usually available
Available all week

unless actually supported.

For live-session Teachers, show useful factual context such as:

Next available slot
or
availability window

only if canonical availability endpoint/projection supports it.

Respect bounded scheduling horizon.

============================================================
PART 22 — PRICE PRESENTATION
============================================================

Display price in context.

For selected Service:

show that TeacherService price.

Do not display ambiguous:

"From 100 SAR"

unless the Student can understand what the 100 belongs to.

If multiple services are shown:

clearly label.

SAR remains canonical currency where current marketplace catalog requires it.

============================================================
PART 23 — DELIVERY / REVISION CONTEXT
============================================================

For async services:

if TeacherService has canonical:

delivery estimate
revisions

show them where useful.

Do not invent:

Average delivery
Usually responds in...

Use configured commercial terms only.

============================================================
PART 24 — FAVORITES
============================================================

Favorites should continue working from Browse/Profile.

Guest behavior:

audit current design.

Do not silently lose click intent.

If unauthenticated favorite requires login:

preserve/recover navigation intent if existing auth flow supports it.

Do not redesign auth.

============================================================
PART 25 — COMPARE ENTRY
============================================================

Teacher Compare already exists.

Improve discovery integration.

Students should be able to:

select 2–3 eligible Teachers

and open Compare naturally.

Do not allow:

0 teacher compare
1 teacher "comparison"
unbounded teacher count.

============================================================
PART 26 — COMPARE CONTEXT
============================================================

Compare must preserve selected:

Subject
and preferably Service

so comparison is meaningful.

Comparing:

Teacher A's recorded explanation

against:

Teacher B's unrelated live session price

without context is misleading.

============================================================
PART 27 — COMPARE DATA
============================================================

Audit current Compare projection.

Use truthful data only:

- name
- qualification/trust
- rating
- relevant service
- price
- delivery/revisions where relevant
- availability where relevant
- approved media/sample
- bio/approach where useful

No fake score.

No winner badge.

============================================================
PART 28 — COMPARE UX
============================================================

Comparison should help decision-making.

Improve:

column/card readability
difference scanning
sticky Teacher identity where useful
mobile behavior
CTA hierarchy

Potential actions:

View Profile
Choose Teacher
Start Request
Book Session

depending on selected service type.

============================================================
PART 29 — COMPARE MOBILE
============================================================

At narrow widths:

do not force an unreadable three-column spreadsheet.

Choose a responsive pattern:

horizontal comparison cards
or
stacked attribute sections

based on actual existing frontend architecture.

No full-page horizontal overflow.

============================================================
PART 30 — ZERO-RESULT RECOVERY
============================================================

This is a major Release 6 requirement.

When filters produce zero Teachers:

do NOT show only:

"No teachers found."

Help Student recover.

============================================================
PART 31 — ZERO-RESULT EXPLANATION
============================================================

State active constraints clearly.

Example intent:

"No teachers match Mathematics + Live Learning + your selected price range."

Do not imply there are no Teachers on Tafseel generally.

============================================================
PART 32 — SAFE RECOVERY ACTIONS
============================================================

Offer deterministic actions based on selected filters:

- Clear price range
- Remove language filter
- Show all services for this Subject
- Change service
- Change subject
- Reset filters

Do NOT auto-relax filters silently.

Student must choose.

============================================================
PART 33 — NEARBY ALTERNATIVES
============================================================

If real canonical data supports alternatives, you may show:

"Teachers are available for this Subject in other services."

or:

"This Service is available in related Subjects."

Only if derived from real marketplace data.

No AI recommendation language.

No fabricated "You may like".

============================================================
PART 34 — FILTER CHIPS
============================================================

Active filters should be visible as removable chips/tokens.

Student should understand why result count changed.

Support:

remove individual filter
clear all

Keep mobile usable.

============================================================
PART 35 — URL STATE
============================================================

Discovery state should be shareable/restorable where appropriate.

Use query params for:

subject
service
search
sort
selected filters
page

Do not put private data in URL.

Back/Forward should behave sensibly.

============================================================
PART 36 — PAGINATION
============================================================

Use canonical server-side pagination.

Preserve filters/search/sort during:

Next
Previous
Back
Forward
Compare return
Profile return

Do not reset Student intent unnecessarily.

============================================================
PART 37 — LOADING EXPERIENCE
============================================================

Browse previously had plain loading behavior.

Use a polished loading pattern consistent with Tafseel.

Prefer:

Teacher-card skeletons

if existing shared skeleton language exists.

Do not create fake data cards.

Skeletons are visual placeholders only.

============================================================
PART 38 — EMPTY VS ERROR
============================================================

Distinguish:

No marketplace Teachers exist
No result matches filters
Search returned no matches
API failed

Never convert failed API request into:

0 teachers.

Error state should allow retry.

============================================================
PART 39 — TEACHER PROFILE CONVERSION ROLE
============================================================

Teacher Profile should become the deepest conversion surface.

It already includes:

trust
media
services
profile content
availability
CTA

Audit the current profile before changing.

Do NOT perform a broad rewrite merely because this Release includes Conversion.

============================================================
PART 40 — PROFILE ABOVE-THE-FOLD
============================================================

At first viewport, Student should understand:

- who this Teacher is;
- what they teach;
- what service they can provide;
- why they are trustworthy;
- what next action is available.

Reduce nonessential cognitive load.

============================================================
PART 41 — PROFILE TRUST
============================================================

Preserve current video-first/trust design.

Qualification Sample and Showcase semantics remain distinct.

Trust language must remain truthful.

Do not turn approved media into:

"Top video"
"Best lesson"

etc.

============================================================
PART 42 — PROFILE SERVICE SELECTION
============================================================

If Teacher offers multiple services:

Student should clearly select/understand the service before conversion.

Each service should show canonical:

- service name
- price
- async/live type
- delivery/revisions if applicable
- availability if live
- approach notes if current domain exposes them

============================================================
PART 43 — PROFILE CTA ROUTING
============================================================

CTA depends on service type.

For async_request:

Start / Send Request

should route to canonical Guided Request with:

teacherId
serviceId

For live_session:

Book Session

should route to canonical scheduler/booking experience.

Do not route both into the same request flow if domain distinguishes them.

============================================================
PART 44 — CTA STATE SAFETY
============================================================

Do not show a CTA that cannot succeed.

Examples:

Service disabled:
do not offer request.

Live service with no valid availability:
show truthful unavailable state / alternate service path.

Teacher not publicly eligible:
should not be on public profile/discovery in first place.

============================================================
PART 45 — MOBILE PROFILE CTA
============================================================

The existing mobile CTA overlap issue was previously fixed.

Do NOT regress it.

At:

375
390

verify sticky CTA geometry.

Use:

getBoundingClientRect()
elementFromPoint()

Ensure:

CTA reachable
content not hidden
no overlap with mobile nav.

============================================================
PART 46 — PROFILE → COMPARE
============================================================

If Student arrived from Compare/Browse:

preserve useful return context.

Do not force them to rebuild filters.

============================================================
PART 47 — PROFILE → REQUEST CONTINUITY
============================================================

Guided Request already supports:

teacherId
preferred service
preferences
draft precedence

Do not duplicate request wizard.

Release 6 only ensures discovery handoff is correct.

============================================================
PART 48 — PROFILE → LIVE CONTINUITY
============================================================

For live services:

preserve Teacher/service context into scheduling.

Do not create another scheduler.

============================================================
PART 49 — GUEST CONVERSION
============================================================

Audit guest behavior.

Guest may browse public marketplace/profile.

When attempting:

Favorite
Request
Book
possibly Compare persistence

auth should intervene where necessary.

Preserve intended destination/context after login where existing auth supports return URL.

Do not create a new authentication flow.

============================================================
PART 50 — NAVIGATION CONTINUITY
============================================================

Test:

Browse
→ Profile
→ Back

Filters should remain.

Browse
→ Compare
→ Profile
→ Back

Context should remain coherent.

Do not surprise Student with reset search.

============================================================
PART 51 — RESPONSIVE DISCOVERY
============================================================

Certify:

375
390
768
1024
1440

Core surfaces:

Browse
Filters
Teacher cards
Compare
Teacher Profile
Zero-result state

Mobile must not feel like compressed desktop.

============================================================
PART 52 — MOBILE FILTER UX
============================================================

If current desktop filters become too dense:

use an accessible mobile filter panel/drawer only if needed.

Do NOT create a second filter state model.

Same canonical filter state must power desktop/mobile.

If modal/drawer used:

reuse existing modal accessibility mechanism.

============================================================
PART 53 — ACCESSIBILITY
============================================================

Keyboard-drive:

Search
Subject
Service
Filters
Sort
Favorite
Compare selection
Pagination
Teacher card
Profile
Service selection
CTA

Filter controls need:

labels
state
focus
keyboard operation.

Comparison must have accessible structure.

Do not communicate selected filters only by color.

============================================================
PART 54 — ARABIC / ENGLISH
============================================================

Full:

AR / RTL
EN / LTR

No static English leakage.

Search/filter placeholders localized.

Sort labels localized.

Zero-result recovery localized.

Compare labels localized.

Profile conversion copy localized.

No raw enum/status.

============================================================
PART 55 — BILINGUAL TEACHER NAMES
============================================================

Preserve canonical name behavior:

FullName:
Arabic/primary

FullNameEnglish:
English

Arabic UI:
primary → English fallback

English UI:
English → primary fallback

Do NOT auto-translate names.

============================================================
PART 56 — PERFORMANCE
============================================================

Measure Browse API/query behavior.

Inspect:

query count
result projection
pagination
filters
sorting
service/subject joins
rating aggregation
availability lookup

Do not introduce N+1 per Teacher.

============================================================
PART 57 — BROWSE QUERY BOUND
============================================================

One Browse result page should not perform per-card server queries.

Prefer query projection/batched data.

If availability requires a separate bounded batch call:

document.

Avoid speculative micro-optimization.

============================================================
PART 58 — CLIENT REQUEST FAN-OUT
============================================================

Release 5 uncovered the importance of browser request budget.

Audit Browse/Profile for duplicate client loads.

Do not repeatedly fetch:

Subjects
Services
Teacher profile
Favorites

due to rerenders unnecessarily.

If duplicate calls are real:

classify and fix narrowly.

============================================================
PART 59 — URL / STATE RACE SAFETY
============================================================

Rapid:

filter
search
sort
pagination

must not allow stale slower response to overwrite the latest state.

Use existing request generation/abort pattern if available.

No giant state-management library.

============================================================
PART 60 — SEARCH DEBOUNCE
============================================================

If search fires on typing:

use a reasonable debounce.

Do not send one API call per keystroke if avoidable.

Search submit behavior may be retained if current UX prefers it.

Document choice.

============================================================
PART 61 — FAVORITE RACE
============================================================

Rapid Favorite click should not create inconsistent UI state.

Preserve existing canonical favorite API.

Do not redesign favorites domain.

============================================================
PART 62 — COMPARE STATE
============================================================

Compare selection should be deterministic.

Rules:

minimum 2
maximum 3

When Teacher becomes ineligible while selected:

handle gracefully.

Do not compare stale/ineligible public Teacher projection.

============================================================
PART 63 — PUBLIC AUTHORIZATION / PRIVACY
============================================================

Browse/Profile are public surfaces where intended.

Audit DTOs again.

Do not leak:

email
phone
private address
internal IDs unnecessarily
internal quality notes
application status history
payment information
private media storage keys

Teacher ID may exist as operational public identifier only where current API needs it.

============================================================
PART 64 — SEARCH PRIVACY
============================================================

Search must not expose unpublished/ineligible Teachers by direct search term.

Public filters/query must apply eligibility first.

No:

hidden Teacher appears because exact name search bypassed normal projection.

Add tests.

============================================================
PART 65 — SERVICE VISIBILITY
============================================================

Hidden/inactive ServiceCatalogItem:

must not appear as public discovery option.

Disabled TeacherService:

must not appear as purchasable offering.

Historical Order snapshots remain unaffected.

============================================================
PART 66 — QUALIFICATION INDEPENDENCE
============================================================

Multi-subject Teacher:

Subject A approved
Subject B pending

Browse Subject A:
Teacher remains eligible where canonical rules say so.

Browse Subject B:
must not show Teacher as qualified until approved.

Preserve Additional Subject independence.

============================================================
PART 67 — MEDIA VISIBILITY
============================================================

Teacher Profile/Browse counts must respect current media curation rules:

Teacher selection
AND
moderation approval
AND
eligibility

No pending/rejected/superseded media public.

============================================================
PART 68 — BROWSE E2E
============================================================

Use legitimate Development/UAT data.

Student/Guest:

open Browse.

Test:

Subject filter
Service filter
Search
Price filter where supported
Language filter
Sort
Pagination

Verify result set matches canonical backend truth.

No client-only fake filtering.

============================================================
PART 69 — ZERO RESULT E2E
============================================================

Choose legitimate filter combination yielding zero.

Verify:

correct active filter explanation
recovery actions
remove one filter
results return

No page reload required unless current architecture intentionally does it.

============================================================
PART 70 — SUBJECT + SERVICE E2E
============================================================

Use Teacher A:

Qualified Subject A
Enabled Service X

Use Teacher B:

Qualified Subject A
Service X disabled/not offered

Browse:

Subject A + Service X

Expected:

A eligible
B excluded where domain requires offering availability.

Prove API + browser.

============================================================
PART 71 — MULTI-SUBJECT E2E
============================================================

Teacher:

Subject A approved
Subject B pending

Browser/API:

Subject A search:
Teacher present

Subject B:
Teacher absent

No regression.

============================================================
PART 72 — PRICE CONTEXT E2E
============================================================

If Teacher has:

Service X = 100 SAR
Service Y = 250 SAR

Browse selected Service X:

card/filters/sort use 100.

Do not accidentally sort/filter using Y.

============================================================
PART 73 — COMPARE E2E
============================================================

From Browse:

select Teacher A
Teacher B

optionally C.

Open Compare.

Verify:

same Subject
same selected Service context
truthful prices
ratings
availability/trust
no fake winner.

Then:

Choose Teacher B
→ Profile or conversion path

context preserved.

============================================================
PART 74 — PROFILE CONVERSION E2E
============================================================

Browse
→ Teacher Profile

Select async service.

Click Request.

Expected:

canonical Guided Request

with correct:

teacherId
serviceId

No duplicate Request domain.

============================================================
PART 75 — LIVE CONVERSION E2E
============================================================

Browse/Profile:

select live service.

Click Book Session.

Expected:

canonical live scheduling flow.

Correct Teacher/service context.

If no available slots:

truthful no-availability state.

============================================================
PART 76 — FAVORITE E2E
============================================================

Authenticated Student:

favorite from Browse
→ profile reflects favorite
→ unfavorite

Refresh persists.

Guest:

click favorite

verify canonical auth behavior.

============================================================
PART 77 — BACK-NAVIGATION E2E
============================================================

Set non-default:

Subject
Service
Search
Sort

Browse
→ Profile
→ Back

Expected discovery state retained/restored.

Repeat:

Browse
→ Compare
→ Back.

============================================================
PART 78 — RESPONSIVE E2E
============================================================

At minimum:

390
768
1440

Modes:

AR RTL Dark
EN LTR Light

Surfaces:

Browse
Zero Results
Compare
Profile

Additional exact:

375 mobile Profile CTA geometry.

============================================================
PART 79 — PLAYWRIGHT
============================================================

Reuse:

tests/browser/

Do NOT introduce another E2E framework.

Create Release 6 browser suite.

Use session reuse strategy learned from Release 5.

Respect existing rate limits.

Do not create artificial auth churn.

============================================================
PART 80 — RATE-LIMIT-AWARE BROWSER EXECUTION
============================================================

Release 5 established that dense automation can trip real limiters.

Reuse the certified rate-limit-aware harness strategy if available.

Do not weaken limits.

Final Release 6 browser run must contain:

0 unexpected 429.

============================================================
PART 81 — BROWSER SAFETY ASSERTIONS
============================================================

For final accepted scenarios:

0 console.error
0 pageerror
0 unexpected 401
0 unexpected 403
0 unexpected 429
0 failed first-party resources
0 unresolved template requests
0 GUID-as-name
0 raw enum
0 page-level horizontal overflow

============================================================
PART 82 — VISUAL QUALITY
============================================================

This is a premium UX Release.

Do real visual review, not DOM-only assertions.

Capture representative screenshots for:

Browse populated
Browse zero-result
Browse filters
Compare
Profile
Mobile Browse
Mobile Profile CTA
Arabic RTL
Dark mode

Evaluate:

spacing
hierarchy
density
contrast
alignment
responsive behavior
CTA clarity
card consistency

Do not claim visual perfection from automated tests only.

============================================================
PART 83 — PRODUCT SCORECARD
============================================================

Score honestly:

Discovery Clarity
Subject Discovery
Service Discovery
Search
Filters
Teacher Cards
Zero-Result Recovery
Compare
Teacher Profile Conversion
Mobile UX
Accessibility
Localization
Trust Integrity
Performance
Architecture
Overall Marketplace Conversion UX

No automatic 10/10.

For score < 9.5:

state concrete reason.

============================================================
PART 84 — NO ANALYTICS YET
============================================================

Do NOT create:

conversion_events
funnel_events
discovery analytics
tracking dashboards
drop-off instrumentation architecture

unless an existing lightweight event system already exists and the implementation is required for a current function.

Formal Marketplace Intelligence belongs to:

Release 7.

Release 6 should improve experience first.

============================================================
PART 85 — NO RECOMMENDATION ENGINE
============================================================

Do not create recommendation scoring as a shortcut for zero-result recovery.

Zero-result recovery must be based on:

explicit filters
real catalog availability
real Teacher eligibility

not hidden scoring.

============================================================
PART 86 — RELEASE 5 COLLISION SAFETY
============================================================

Another agent may still be closing Release 5.

Before editing shared files, inspect latest worktree.

Potential collision files:

js/tafseel.js
js/locales.js
shared CSS
Student Dashboard
Teacher Dashboard
auth/session helpers
notificationRoute
browser harness/session utilities

Do NOT overwrite:

chat-widget.js
messaging behavior
SignalR lifecycle

unless Release 6 exposes a direct regression requiring shared-runtime fix.

If modifying shared browser harness:

preserve Release 5 rate-limit/session guarantees.

============================================================
PART 87 — RELEASE 4 COLLISION SAFETY
============================================================

Do not alter Admin/Quality Operations.

Release 6 is public/Student discovery.

Admin/Quality only relevant where their decisions affect public eligibility.

No ops redesign.

============================================================
PART 88 — FOUNDATION REGRESSION
============================================================

Foundation is CLOSED.

Do not reopen it.

Target regression:

Landing
Browse
Teacher Profile
Student Dashboard
Teacher Dashboard
Guided Request
Live booking entry
Compare
Real Rating public aggregate

Run:

F-013/resource gate
localization gates
mobile CTA gate
browser harness self-test

Increase scope only if shared runtime changed.

============================================================
PART 89 — BACKEND TESTS
============================================================

Add focused tests for:

public eligibility + search
subject filter
service filter
subject+service intersection
price context
language filter
rating sort/filter
pagination
hidden service exclusion
disabled TeacherService exclusion
pending additional subject exclusion
approved Subject A independence
privacy projection
search cannot bypass eligibility
Compare context/projection
zero-result query behavior

============================================================
PART 90 — QUERY PERFORMANCE TESTS
============================================================

Where repository has query-count/bounded-query testing patterns:

add meaningful bounded invariants.

Avoid brittle:

exactly 17 reads

unless architecture truly requires exact count.

Prefer:

no per-row N+1
bounded query count for page size.

============================================================
PART 91 — FULL REGRESSION
============================================================

Run current complete:

Architecture
Domain
Application
Integration

Use CURRENT canonical counts.

Release 5 may increase Integration count.

Do not hardcode stale baseline.

Require:

0 failures
0 skips
0 source exclusions.

============================================================
PART 92 — FRONTEND GATES
============================================================

Run all canonical current gates:

frontend integrity
localization
localization usage
BUG-001 display names
template/resource leak
auth UI
guided request
notification routing
mobile CTA
JS syntax
browser harness self-test
Release 5 integrity gate
Release 6 integrity gate
git diff --check

============================================================
PART 93 — DATABASE / MIGRATION DISCIPLINE
============================================================

Expected:

NO migration.

Discovery should use existing:

Subjects
Catalog
TeacherServices
Qualifications
Ratings
Availability

If migration seems necessary:

STOP and prove:

- missing business fact;
- why query/projection cannot solve it;
- why persistence is required.

Do not add search-index tables casually.

============================================================
PART 94 — SEARCH INDEXING
============================================================

If performance evidence proves database indexes are missing for canonical search/filter fields:

evaluate a focused index migration.

Do not create one preemptively.

If needed:

document query plan/evidence.

============================================================
PART 95 — RELEASE BUILD
============================================================

Run:

dotnet build -c Release

Required:

0 errors.

No new warnings.

============================================================
PART 96 — PUBLISH SMOKE
============================================================

Isolated publish only.

Do NOT deploy.

Verify:

/health/live
/health/ready

Public:

Landing
Browse
Teacher Profile
Compare

Authenticated Student:

login
Browse
Favorite
conversion CTA route

Static assets 200.

Cache policy correct.

No unexpected:

401
403
429
500

Stop isolated instance.

============================================================
PART 97 — RELEASE RETROSPECTIVE
============================================================

Complete in same Release.

Answer:

- What discovery problems were actually solved?
- What existing marketplace architecture was reused?
- Was any schema change required?
- Which filters/sorts were deliberately rejected and why?
- What trust rules prevented misleading UX?
- What remains for Release 7?
- What remains for Release 8?
- What remains Production Readiness?
- What UX/technical debt remains?

No separate retrospective sprint.

============================================================
OUT OF SCOPE
============================================================

Do NOT implement:

- Order Communication features
- Admin/Quality Operations redesign
- Marketplace Analytics
- funnel dashboards
- event architecture for analytics
- AI search
- Groq
- embeddings
- AI recommendations
- teacher ranking score
- "Best Match" black-box ranking
- real PSP
- Production live-session provider
- SignalR scale-out
- malware scanning
- durable Showcase Production storage
- F-005 RevisionRequest → Delivery fix
- Privacy/Terms legal content
- review concurrency migration unless independently required
- social/community features

============================================================
DOCUMENTATION
============================================================

Save prompt:

docs/prompts/
PHASE_4_RELEASE_6_DISCOVERY_AND_CONVERSION.md

Create main Release report:

docs/features/
PHASE_4_RELEASE_6_DISCOVERY_AND_CONVERSION.md

Evidence:

docs/features/evidence/
phase4-release6-discovery-conversion/

Required evidence:

current-state-audit.md
discovery-domain-decision.md
browse-query-contract.md
subject-service-intersection.md
filter-semantics.md
sort-governance.md
teacher-card-trust.md
zero-result-recovery.md
compare-certification.md
profile-conversion.md
navigation-continuity.md
responsive-visual-review.md
accessibility.md
query-performance.md
browser-certification.md
security-privacy.md
release-regression.md
publish-smoke.md
final-summary.md

Create retrospective:

docs/reports/
PHASE_4_RELEASE_6_DISCOVERY_AND_CONVERSION_RETROSPECTIVE.md

Update:

docs/INDEX.md
docs/PROJECT_STATUS.md

Preserve historical reports.

Do not silently rewrite older conclusions.

============================================================
RELEASE 6 EXIT RULE
============================================================

Return:

RELEASE 6 — DISCOVERY & CONVERSION VERIFIED

ONLY IF ALL are true:

1. Current discovery architecture was audited first.
2. No duplicate Discovery/Search domain was created.
3. No AI/recommendation engine was added.
4. Public Teacher eligibility remains canonical.
5. Search cannot bypass eligibility.
6. Subject filtering works server-side.
7. Service filtering works server-side.
8. Subject + Service intersection is truthful.
9. Hidden catalog services are excluded.
10. Disabled TeacherServices are excluded.
11. Pending Subject qualification is excluded for that Subject.
12. Existing approved Subject remains independent.
13. Search works with canonical bilingual data.
14. Filters have documented semantics.
15. Price filtering is service-contextual.
16. Sorting uses only truthful supported fields.
17. No unsupported "Best/Popular/Trending" ranking exists.
18. Browse pagination is server-side.
19. No unbounded Teacher fetch exists.
20. Browse query has no meaningful N+1 regression.
21. Teacher cards show relevant contextual data.
22. Rating presentation preserves F-002.
23. Trust badges are evidence-backed.
24. Availability presentation is truthful.
25. Price presentation is contextual.
26. Favorites remain correct.
27. Compare supports 2–3 eligible Teachers.
28. Compare preserves Subject/Service context.
29. Compare shows no fake winner/ranking.
30. Compare mobile UX passes.
31. Zero-result state explains active constraints.
32. Zero-result recovery actions work.
33. Filters can be individually cleared.
34. URL discovery state works where intended.
35. Back/Forward behavior is coherent.
36. Browse → Profile → Back preserves context.
37. Browse → Compare → Back preserves context.
38. Teacher Profile above-the-fold clarity passes.
39. Teacher service selection is clear.
40. Async CTA routes to canonical Guided Request.
41. Live CTA routes to canonical scheduler.
42. CTA never points to impossible/ineligible action.
43. Mobile Profile CTA remains non-overlapping.
44. Guest conversion behavior is correct.
45. AR/RTL passes.
46. EN/LTR passes.
47. Accessibility passes.
48. 375/390 mobile discovery passes.
49. 768 tablet passes.
50. 1440 desktop passes.
51. Zero-result browser E2E passes.
52. Subject+Service browser E2E passes.
53. Multi-subject browser/API E2E passes.
54. Price-context E2E passes.
55. Compare E2E passes.
56. Profile async conversion E2E passes.
57. Live conversion E2E passes.
58. Favorite E2E passes.
59. Navigation continuity E2E passes.
60. Final Playwright certification passes.
61. Final accepted browser run has 0 unexpected 429.
62. Final accepted browser run has 0 console.error.
63. Final accepted browser run has 0 pageerror.
64. Final accepted browser run has 0 failed first-party resources.
65. No unresolved template resource exists.
66. Privacy projection passes.
67. Authorization/public boundary passes.
68. Release 5 concurrent work was not overwritten.
69. Release 4 operations were not regressed.
70. Foundation targeted regression passes.
71. Architecture tests pass.
72. Domain tests pass.
73. Application tests pass.
74. Integration tests pass with 0 failures.
75. Frontend gates pass.
76. EF state is clean or migration rigorously justified.
77. Release build passes.
78. Publish succeeds.
79. Publish smoke passes.
80. Health passes.
81. No Critical/High Release 6 defect remains.
82. No fake marketplace metric/ranking introduced.
83. Documentation is complete.
84. Release retrospective completed.

NO EXCEPTIONS.

If any major discovery/conversion path is not browser-proven:

do NOT mark VERIFIED.

============================================================
FINAL RESPONSE FORMAT
============================================================

Return exactly:

============================================================
PHASE 4 — MARKETPLACE SCALE
RELEASE 6 — DISCOVERY & CONVERSION
============================================================

## Findings

## Current Discovery Architecture

## Domain Decision

## Browse Information Architecture

## Subject Discovery

## Service Discovery

## Subject + Service Intersection

## Search

## Filters

## Sort Governance

## Teacher Cards

## Ratings / Trust Integrity

## Availability

## Pricing Context

## Favorites

## Compare Experience

## Zero-Result Recovery

## URL / Navigation State

## Teacher Profile Conversion

## Async Request Conversion

## Live Session Conversion

## Guest Conversion

## Responsive UX

## Accessibility

## Localization

## Query Performance

## Client Request Fan-Out

## Browse E2E

## Zero-Result E2E

## Subject + Service E2E

## Multi-Subject E2E

## Price Context E2E

## Compare E2E

## Profile Conversion E2E

## Live Conversion E2E

## Favorites E2E

## Navigation Continuity E2E

## Browser Certification

## Release 5 Collision Check

## Release 4 Collision Check

## Foundation Regression

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

## Release 6 Retrospective

## Release 7 Handoff

Then:

Discovery Architecture:
Subject Discovery:
Service Discovery:
Subject+Service:
Search:
Filters:
Sort:
Teacher Cards:
Trust:
Availability:
Pricing:
Favorites:
Compare:
Zero Results:
Navigation:
Teacher Profile:
Async Conversion:
Live Conversion:
Guest:
Responsive:
Accessibility:
Arabic:
English:
Performance:
Browse E2E:
Zero Result E2E:
Compare E2E:
Profile E2E:
Live E2E:
Browser:
Release 5 Collision:
Release 4 Collision:
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

If and ONLY if VERIFIED write exactly:

✅ Release 6 — Discovery & Conversion Complete

Then:

🚀 Release 7 — Marketplace Intelligence Unblocked

Then exactly:

✅ Finished Phase 4 — Release 6
