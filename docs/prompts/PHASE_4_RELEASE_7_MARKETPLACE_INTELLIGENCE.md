============================================================
PHASE 4 — MARKETPLACE SCALE
RELEASE 7 — MARKETPLACE INTELLIGENCE

FULL RELEASE EXECUTION
============================================================

## Previous Context

Tafseel now has a mature marketplace architecture covering:

- public Teacher discovery;
- canonical public eligibility;
- Subjects;
- marketplace Service Catalog;
- TeacherServices;
- contextual pricing;
- Teacher Profile;
- Compare;
- Learning Requests;
- Orders;
- Payments;
- Deliveries;
- Revisions;
- Reviews;
- Live Sessions;
- Favorites;
- Notifications;
- Order Communication.

Release 5 — Order Communication is canonically:

VERIFIED & CLOSED

Release 6 — Discovery & Conversion has already implemented the core deterministic discovery experience.

Release 6 may still be running its final acceptance closure concurrently in another agent.

You may implement Release 7 engineering in parallel.

However:

DO NOT claim Release 7 is officially chain-verified unless:

docs/PROJECT_STATUS.md

shows:

RELEASE 6 — DISCOVERY & CONVERSION VERIFIED & CLOSED

At the start of this pass:

read current canonical docs and reconcile the current worktree.

============================================================
RELEASE 7 PRODUCT PROBLEM
============================================================

Tafseel can now operate the marketplace and move Students through discovery and conversion.

But the product still lacks a trustworthy intelligence layer answering questions such as:

- Where does marketplace demand exist?
- Which Subjects receive the most legitimate interest?
- Which Services receive demand?
- Where do Students drop out of the conversion journey?
- Are Students finding eligible Teachers?
- How often do discovery sessions reach a Teacher Profile?
- How often does a Service selection become a Request?
- How often do Requests become Orders?
- How often do accepted Requests become paid Orders?
- How often do paid Orders reach Delivery / Completion / Review?
- Which Subject/Service combinations have demand but weak supply?
- How often do searches/filters produce zero results?
- Are Teachers receiving demand for Services they actually offer?
- What is the health of the marketplace funnel over time?

Release 7 exists to build:

MARKETPLACE INTELLIGENCE

not fake analytics.

============================================================
RELEASE 7 GOAL
============================================================

Create a trustworthy first-party marketplace intelligence system built from real product/domain truth.

By the end of Release 7:

1. Marketplace funnel definitions are explicit and documented.
2. User-interaction events exist only where canonical domain persistence cannot answer the question.
3. Transactional marketplace stages remain derived from canonical persisted business state/history whenever possible.
4. Analytics data is append-only/idempotent where events are necessary.
5. Admin has a useful Marketplace Intelligence dashboard.
6. Funnel conversion/drop-off can be measured by time period.
7. Subject and Service demand can be measured.
8. Supply vs demand can be measured using canonical public eligibility/offers.
9. Zero-result discovery can be measured.
10. Cohort/trend analysis exists where data truthfully supports it.
11. No fake public Teacher metrics are introduced.
12. No ranking/recommendation engine is created.
13. No AI is introduced.
14. Privacy and event-data minimization are explicit.
15. Analytics queries are bounded/scalable.
16. AR/EN operational UX works.
17. Browser and backend certification passes.
18. Release retrospective is completed.

============================================================
CRITICAL DISTINCTION
============================================================

Release 7 is INTERNAL MARKETPLACE INTELLIGENCE.

It is NOT a public Teacher ranking system.

Do NOT expose internal analytics publicly unless explicitly justified.

F-002 remains fully binding.

Do NOT reintroduce public:

- Completed Orders
- Completion Rate
- Response Time
- Popularity
- Conversion Rate
- Success Rate
- Students Taught
- Top Teacher
- Trending Teacher
- Best Teacher
- Marketplace Score

on Browse/Profile/Compare.

Internal analytics may calculate legitimate business metrics if:

- formula is explicit;
- inputs are persisted truth;
- scope is clear;
- time window is clear;
- privacy is respected.

============================================================
NO AI
============================================================

Do NOT implement:

- Groq
- LLM analysis
- AI summaries
- AI recommendations
- semantic ranking
- embeddings
- anomaly detection via AI
- AI teacher matching

Those belong to:

Release 8 — AI-Assisted Marketplace

============================================================
NO BLACK-BOX RANKING
============================================================

Do NOT create:

TeacherScore
RankingScore
QualityScore
MarketplaceScore
PopularityScore
ConversionScore

for ordering Teachers.

Release 7 measures the marketplace.

It does NOT secretly control discovery.

============================================================
MANDATORY FINDING CLASSIFICATION
============================================================

Classify every issue before implementation as:

- Production Bug
- UI/View Issue
- API Mismatch
- Business Ambiguity
- Legacy Compatibility
- Dead Code
- Test Issue
- Missing Feature
- Technical Debt

Analytics not existing yet is primarily:

Missing Feature

not Production Bug.

============================================================
PART 1 — EVIDENCE-FIRST INTELLIGENCE AUDIT
============================================================

Before designing analytics, trace all existing sources of truth.

Inspect:

Domain
Application
Infrastructure
API
Frontend
Database
Outbox
Audit trails
Status histories
Notifications
Logging
existing reporting
existing telemetry

Specifically trace:

Teacher browsing
Teacher Profile
Compare
Favorites
Guided Request
LearningRequest
Teacher acceptance
Order
Payment
Delivery
Revision
Completion
Review
LiveBooking
Service Catalog
TeacherService
Qualifications
Availability

Determine which funnel stages already exist as persisted business facts.

============================================================
PART 2 — EXISTING EVENT INFRASTRUCTURE
============================================================

Search for existing concepts such as:

DomainEvent
IntegrationEvent
Outbox
AuditEvent
ActivityLog
Telemetry
AnalyticsEvent
ProductEvent
ApplicationInsights
structured logs

Do NOT create another event architecture if one already satisfies the need.

Document:

what can be reused
what cannot.

============================================================
PART 3 — INTELLIGENCE ARCHITECTURE DECISION
============================================================

Choose the smallest architecture.

Preferred hierarchy:

OPTION A

Existing event/audit infrastructure can represent product analytics safely.

→ reuse it.

OPTION B

Transactional lifecycle can be derived from canonical state/history,
but discovery interactions need new append-only first-party analytics events.

→ add only a minimal ProductAnalyticsEvent-style mechanism.

OPTION C

No safe event persistence exists and analytics questions cannot be answered from current data.

→ justify focused analytics persistence.

Do NOT create:

AnalyticsDomain
MarketplaceIntelligenceAggregate
EventSourcing system
Data warehouse
Kafka
Redis analytics platform

without proven need.

============================================================
PART 4 — CANONICAL FUNNEL DEFINITION
============================================================

Define the marketplace funnel before dashboards.

Target conceptual funnel:

browse_viewed
→ teacher_opened
→ service_selected
→ request_started
→ request_submitted
→ request_accepted
→ payment_started
→ payment_confirmed
→ delivery_submitted
→ order_completed
→ review_submitted

Use actual repository terminology.

If canonical names differ:

document mapping.

Do not rename business state merely to match this list.

============================================================
PART 5 — FUNNEL STAGE SEMANTICS
============================================================

Every funnel stage must have an exact definition.

Example:

browse_viewed

A real Browse marketplace page/result experience loaded successfully.

teacher_opened

A public Teacher Profile was opened from a legitimate public/discovery context.

service_selected

A specific canonical TeacherService became the selected commercial context.

request_started

The canonical Guided Request began with a legitimate Teacher/service context.

request_submitted

A LearningRequest was successfully persisted/submitted.

request_accepted

Teacher accepted and canonical Order/business relationship was created.

payment_started

Canonical payment attempt/checkout started.

payment_confirmed

Canonical payment truth confirms success.

delivery_submitted

Canonical Delivery persisted.

order_completed

Canonical Order reached Completed.

review_submitted

Canonical eligible Review persisted.

Define exact meanings from code.

============================================================
PART 6 — DO NOT DUPLICATE TRANSACTIONAL TRUTH
============================================================

For stages already represented by durable canonical state/history:

prefer deriving analytics from:

LearningRequest
Order status history
Payment
Delivery
Review
LiveBooking

rather than inserting duplicate mutable analytics facts.

Analytics events must not become the source of truth for:

payment
completion
delivery
qualification
reviews.

============================================================
PART 7 — INTERACTION EVENTS
============================================================

Some discovery behavior is not represented by business persistence.

Potential legitimate interaction events:

browse_viewed
teacher_opened
service_selected
compare_opened
request_started
zero_result_viewed

Instrument only events necessary to answer a defined product question.

Do NOT track every click.

============================================================
PART 8 — EVENT MINIMIZATION
============================================================

For every proposed event answer:

What product question does this event answer?

If there is no concrete question:

do not record it.

Avoid telemetry bloat.

============================================================
PART 9 — EVENT CONTRACT
============================================================

If new analytics event persistence is required, define a strict append-only contract.

Potential fields:

Id
EventName
OccurredAtUtc
ActorRole
AuthenticatedUserId nullable
AnonymousSessionId nullable
SubjectId nullable
TeacherId nullable
TeacherServiceId nullable
ServiceCatalogItemId nullable
LearningRequestId nullable
OrderId nullable
LiveBookingId nullable
CorrelationId nullable
ClientEventId / IdempotencyKey
SourceSurface
MetadataJson minimal

Use only fields proven necessary.

Do not blindly create all fields.

============================================================
PART 10 — EVENT PRIVACY
============================================================

Do NOT persist in analytics events:

email
phone
address
JWT
refresh token
message content
request free-text body
delivery notes
private Quality notes
payment credentials
attachment content
raw search text by default

IDs may be stored internally only when required to join canonical product data.

============================================================
PART 11 — SEARCH ANALYTICS PRIVACY
============================================================

Be especially careful with free-text search.

A Student may type PII or sensitive content.

Default rule:

DO NOT persist raw free-text search query.

Safer analytics may capture:

- selected Subject;
- selected Service;
- result count;
- zero-result boolean;
- query-present boolean;
- normalized query length/category if useful.

If storing raw/normalized search query is proposed:

classify:

Business / Privacy Decision Required

and do not silently implement.

============================================================
PART 12 — ANONYMOUS SESSION
============================================================

For public Browse intelligence, investigate existing session/correlation mechanisms.

If anonymous session correlation is required:

use a first-party pseudonymous session identifier.

Do not fingerprint users.

Do not use invasive cross-session tracking.

Do not create advertising identifiers.

============================================================
PART 13 — AUTHENTICATED IDENTITY
============================================================

Authenticated event data should use internal IDs only where necessary.

Analytics UI should not surface raw user IDs unnecessarily.

No advertiser access.

No external data sale/sharing logic.

============================================================
PART 14 — EVENT IDEMPOTENCY
============================================================

Client events may retry.

Prevent obvious duplicates using:

clientEventId
or
canonical idempotency mechanism

if new event persistence exists.

Do not rely solely on timestamp equality.

============================================================
PART 15 — BUSINESS EVENT IDEMPOTENCY
============================================================

Transactional metrics must not double-count because:

webhook retried
page refreshed
order reopened
status projection re-rendered.

Use canonical business records/state transitions.

============================================================
PART 16 — EVENT TIME
============================================================

Store event time in UTC.

Reporting may render localized dates.

Do not use browser clock as authoritative for transactional stages.

============================================================
PART 17 — SOURCE SURFACES
============================================================

Where useful, classify origin:

Landing
Browse
TeacherProfile
Compare
GuidedRequest
StudentDashboard
TeacherDashboard
LiveScheduler

Use a controlled enum/value set.

Do not persist arbitrary URLs containing sensitive query data.

============================================================
PART 18 — RELEASE 6 INSTRUMENTATION COLLISION
============================================================

Release 6 agent may still be editing:

Browse
Teacher Profile
Compare
auth continuation
browser harness

Before modifying them:

re-read latest files.

Prefer minimal analytics hooks that do not alter UX behavior.

Do NOT overwrite Release 6 fixes.

============================================================
PART 19 — SHARED ANALYTICS CLIENT
============================================================

If frontend events are required:

create/reuse one small shared helper.

Example responsibility:

Tafseel.analytics.track(...)

or repository-consistent equivalent.

Do not scatter raw fetch calls across pages.

But do NOT create a giant SDK.

============================================================
PART 20 — ANALYTICS FAILURE BEHAVIOR
============================================================

Analytics must never break the user journey.

If event submission fails:

Browse
Profile
Request
Payment

must continue.

Do not throw blocking UI errors for analytics.

Use:

best-effort client delivery
or
existing Outbox/backend pattern

as architecture dictates.

============================================================
PART 21 — DO NOT HIDE BUSINESS FAILURES
============================================================

The previous rule applies only to analytics transport.

Do not mistake:

Payment failure
Request failure
Order failure

for analytics failure.

Business operations remain truthful.

============================================================
PART 22 — ZERO-RESULT INTELLIGENCE
============================================================

Release 6 introduced deterministic zero-result recovery.

Measure:

zero-result occurrences

using safe dimensions such as:

Subject
Service
language filter presence
price filter presence
result count = 0

Do not persist sensitive query text.

============================================================
PART 23 — DEMAND METRICS
============================================================

Define legitimate marketplace demand.

Potential measures:

Browse sessions by Subject
Teacher Profile opens by Subject/Service
Service selections
Request starts
Request submissions
Live booking starts
Paid Orders

Each must have explicit formulas.

Do NOT create one vague:

DemandScore.

============================================================
PART 24 — SUPPLY METRICS
============================================================

Define canonical supply using real marketplace eligibility.

Potential supply:

Eligible public Teachers by Subject
Enabled TeacherServices by Subject + Service
Teachers with bookable live availability
Active qualified offerings

Do NOT count:

pending qualifications
disabled TeacherServices
hidden catalog services
revoked qualifications
ineligible Teachers.

============================================================
PART 25 — SUPPLY VS DEMAND
============================================================

Provide useful internal comparisons such as:

Subject
Service
Eligible Teachers
Active Offers
Browse interest
Request submissions
Paid Orders
Zero-result rate

Do not produce a hidden ranking score.

Let users interpret explicit measures.

============================================================
PART 26 — FUNNEL METRICS
============================================================

For a selected period show legitimate stage counts.

Example:

Browse Sessions
Teacher Opens
Service Selections
Request Starts
Request Submissions
Accepted Requests
Payment Starts
Paid
Delivered
Completed
Reviewed

Use exact real formulas.

============================================================
PART 27 — CONVERSION RATE FORMULAS
============================================================

Conversion rates must state denominator.

Examples:

Profile Open Rate
=
Teacher Opens / Browse Sessions

Request Start Rate
=
Request Starts / Teacher Opens

Request Submit Rate
=
Request Submissions / Request Starts

Acceptance Rate
=
Accepted Requests / Submitted Requests

Payment Conversion
=
Paid / Payment Starts

Completion Rate INTERNAL
=
Completed Orders / Paid Orders

Review Rate INTERNAL
=
Reviewed / Completed Orders

These are examples only.

Audit actual feasible formulas.

Do not expose internal Completion Rate publicly.

============================================================
PART 28 — ZERO DENOMINATOR
============================================================

For zero denominator:

return null / N/A.

Do not display:

0%

as if performance failure when denominator is absent.

============================================================
PART 29 — DROP-OFF
============================================================

Show drop-off transparently:

stage N count
stage N+1 count
difference
conversion percentage

No emotionally loaded labels like:

"Bad Teachers"
"Poor marketplace"

============================================================
PART 30 — TIME WINDOWS
============================================================

Support useful bounded periods, e.g. based on actual product needs:

7 days
30 days
90 days
custom bounded range

Do not assume exact presets if repository has established reporting conventions.

Use server-side validation for max range.

============================================================
PART 31 — COMPARISON PERIOD
============================================================

If period-over-period comparison is implemented:

define exact comparison.

Example:

selected 30 days
vs previous 30 days

Do not fabricate trend arrows from partial/incomparable periods.

============================================================
PART 32 — COHORTS
============================================================

Implement cohort analysis only where meaningfully supported.

Potential cohort:

first Request submission week/month
or
first paid Order period

Then measure later progression.

Do not create a large data-science subsystem.

If data volume is insufficient:

classify as deferred, not fake.

============================================================
PART 33 — SUBJECT INTELLIGENCE
============================================================

Admin should be able to inspect by Subject:

public supply
active service offers
Browse interest
Profile opens
Request submissions
paid/completed outcomes
zero-result rate

where supported.

============================================================
PART 34 — SERVICE INTELLIGENCE
============================================================

Break down by canonical ServiceCatalogItem.

Do not use hardcoded Release 6 taxonomy.

Service reports must follow current canonical Catalog.

============================================================
PART 35 — SUBJECT + SERVICE MATRIX
============================================================

Useful view:

Subject
×
Service

with:

eligible Teacher count
active offer count
interest
requests
paid Orders
zero-result signals

Keep readable/paginated.

No giant unbounded matrix.

============================================================
PART 36 — TEACHER-SIDE PRIVATE INSIGHTS
============================================================

Audit whether Teacher private analytics are already in product scope.

If not documented:

do NOT automatically build a huge Teacher analytics dashboard.

At most consider a small private insight surface only if:

- data is truthful;
- it serves Teacher actions;
- it does not expose comparison/ranking against other Teachers.

Potential own-only metrics:

Profile views
Request submissions received
Accepted Orders
Completed Orders

But classify as optional unless roadmap/docs support it.

Primary Release 7 scope is Admin Marketplace Intelligence.

============================================================
PART 37 — NO TEACHER LEADERBOARD
============================================================

Absolutely no:

Top Teachers
Bottom Teachers
Teacher leaderboard
conversion ranking
rating ranking dashboard presented as performance score

unless a later explicit governance decision authorizes it.

============================================================
PART 38 — ADMIN MARKETPLACE INTELLIGENCE IA
============================================================

Add a coherent Admin surface.

Potential:

Admin
→ Marketplace Intelligence

Tabs/sections:

Overview
Funnel
Demand & Supply
Subjects
Services
Zero Results

Use existing Admin navigation patterns.

Do NOT replace Release 4 operations.

============================================================
PART 39 — OVERVIEW
============================================================

Overview should show a small set of load-bearing truthful KPIs.

Examples where supported:

Browse Sessions
Request Submissions
Paid Orders
Completed Orders
Zero-result rate

Every KPI must have:

formula
time window
empty-state behavior.

Do not display irrelevant vanity metrics.

============================================================
PART 40 — FUNNEL VISUALIZATION
============================================================

Use an accessible funnel/table visualization.

Do not make users infer exact values from chart geometry only.

Provide:

stage name
count
conversion/drop-off

No misleading area proportions.

============================================================
PART 41 — CHARTS
============================================================

Use existing charting infrastructure if available.

Do NOT introduce a large chart dependency unless necessary.

Charts need accessible text/table equivalents.

============================================================
PART 42 — TRENDS
============================================================

Where useful show time-series:

requests
paid Orders
zero results
Browse interest

Use bounded date buckets:

day/week/month

based on selected range.

No client aggregation of huge raw event sets.

============================================================
PART 43 — FILTERS
============================================================

Analytics filters may include:

date range
Subject
Service
possibly order type (async/live)

Use server-side aggregation.

============================================================
PART 44 — ANALYTICS QUERY API
============================================================

Build focused analytics endpoints.

Do not expose raw event dumps to frontend if aggregates suffice.

Potential intent:

GET /api/v1/admin/marketplace-intelligence/overview
GET /api/v1/admin/marketplace-intelligence/funnel
GET /api/v1/admin/marketplace-intelligence/demand-supply
GET /api/v1/admin/marketplace-intelligence/subjects
GET /api/v1/admin/marketplace-intelligence/services
GET /api/v1/admin/marketplace-intelligence/zero-results

Follow repository route conventions.

Do not blindly use these exact paths if existing Admin reporting conventions differ.

============================================================
PART 45 — AUTHORIZATION
============================================================

Admin Marketplace Intelligence is internal.

Student:
DENIED

Teacher:
DENIED unless own-private insight endpoint explicitly exists.

QualityReviewer:
DENIED unless current policy says otherwise.

Admin:
ALLOWED.

Do not rely on hidden navigation.

Test endpoint authorization.

============================================================
PART 46 — PRIVACY PROJECTION
============================================================

Admin aggregate DTOs should avoid user-level PII.

Default analytics should be aggregated.

Drill-down into individual users is OUT OF SCOPE unless a concrete operational reason exists.

No email/phone in analytics.

============================================================
PART 47 — MINIMUM GROUP SIZE
============================================================

Evaluate privacy when breaking down sparse data.

Do not expose sensitive tiny cohorts with user-identifiable context.

If repository has no privacy threshold policy:

avoid user-identifying drilldowns rather than inventing a magic threshold.

============================================================
PART 48 — DATA RETENTION
============================================================

Audit existing retention policy.

If none exists for analytics events:

classify:

Business/Privacy Decision Required.

Do not invent a permanent retention period silently.

Document recommended decision separately.

============================================================
PART 49 — BACKFILL
============================================================

Separate:

transactional historical metrics

from:

new interaction events.

Historical:

Requests
Orders
Payments
Deliveries
Reviews

may be derivable from canonical DB.

Do not fabricate historical:

browse_viewed
teacher_opened
service_selected

before instrumentation existed.

Dashboard must clearly understand the data start date.

============================================================
PART 50 — ANALYTICS START DATE
============================================================

If interaction tracking starts with Release 7:

persist/document:

analytics coverage starts at <deployment/migration activation point>

Do not show pre-instrumentation zeros as if real zero usage.

============================================================
PART 51 — MIGRATION DECISION
============================================================

Unlike Release 6, a migration MAY legitimately be required if interaction-event persistence does not already exist.

Before creating migration document:

- existing infrastructure;
- why canonical domain cannot answer interaction questions;
- chosen event table/structure;
- indexes;
- uniqueness/idempotency;
- nullability;
- retention implications;
- no PII policy.

One focused migration only if justified.

============================================================
PART 52 — EVENT INDEXES
============================================================

If new event table exists, likely query patterns include:

OccurredAtUtc
EventName
SubjectId
ServiceCatalogItemId
TeacherServiceId

Design indexes from actual aggregation queries.

Do not add every possible composite index.

============================================================
PART 53 — QUERY SCALABILITY
============================================================

Analytics endpoints must aggregate in DB/server.

Do not:

load all events
→ group in JavaScript.

Use:

GROUP BY
bounded date ranges
indexed filters
server aggregation.

============================================================
PART 54 — QUERY PLAN / BOUNDS
============================================================

Inspect representative analytics queries.

Ensure:

no per-subject N+1
no per-service N+1
no unbounded raw event return
no loading every Order into memory.

============================================================
PART 55 — CACHING
============================================================

Do not introduce Redis.

If expensive aggregates need short caching:

first inspect existing cache infrastructure.

Use only if evidence shows need.

Freshness semantics must be clear.

============================================================
PART 56 — ANALYTICS CONSISTENCY
============================================================

For transactional metrics:

cross-check aggregate output against canonical DB records.

Example:

Paid Orders analytics count

must reconcile with canonical paid Order/payment truth for same filters/time range.

============================================================
PART 57 — METRIC CATALOG
============================================================

Create a durable metric-definition document.

For every metric:

Name
Purpose
Numerator
Denominator
Source tables/events
Filters
Time semantics
Null behavior
Public/Internal classification

This is mandatory.

============================================================
PART 58 — NO AMBIGUOUS METRICS
============================================================

Do not expose vague cards like:

Engagement
Success
Marketplace Health

without explicit formula.

Use concrete names.

============================================================
PART 59 — DATA QUALITY
============================================================

Detect/handle:

missing Subject
deleted/hidden Service
legacy Order snapshot
revoked qualification
unknown historical source

Do not silently discard records.

Document historical attribution rules.

============================================================
PART 60 — SERVICE SNAPSHOTS
============================================================

Historical Orders may contain Service snapshots.

Do not rewrite historical analytics using today's TeacherService configuration if canonical Order snapshot exists.

Transactional reports should respect historical commercial context.

============================================================
PART 61 — SUBJECT HISTORY
============================================================

If Subject names change:

report using stable Subject ID and current localized display name where appropriate.

Do not duplicate historical counts.

============================================================
PART 62 — LIVE VS ASYNC
============================================================

Support clear separation where useful:

async_request
live_session

Use canonical Order/service type.

Do not infer from service name text.

============================================================
PART 63 — LIVE FUNNEL
============================================================

Audit LiveBooking lifecycle.

If structurally different from async Request funnel:

do not force false equivalence.

Define live-specific funnel where appropriate, e.g.:

live_service_selected
booking_started
booking_created/confirmed
payment_confirmed
session_completed

only from canonical domain truth.

============================================================
PART 64 — RELEASE 6 EVENT HOOKS
============================================================

Instrument discovery minimally:

Browse loaded
Teacher opened
Service selected
Request started
Zero-result viewed

only after ensuring Release 6 behavior is stable.

Do not alter sorting/filtering semantics.

============================================================
PART 65 — REQUEST START IDEMPOTENCY
============================================================

Avoid counting:

page rerender
Back/Forward
same Guided Request restoration

as multiple legitimate starts without a defined rule.

Define session/event semantics.

============================================================
PART 66 — BROWSE SESSION SEMANTICS
============================================================

Define what counts as a Browse session/view.

Do not count every filter rerender as a new Browse session unless metric explicitly says so.

Potential distinction:

browse_viewed
filter_changed

Only track the latter if needed.

============================================================
PART 67 — ZERO-RESULT DEDUPLICATION
============================================================

If Student changes filters rapidly:

avoid producing dozens of identical zero-result events for the same stable state.

Use a deterministic event key/state signature if needed.

============================================================
PART 68 — EVENT TRANSPORT
============================================================

Analytics event transport should be lightweight.

If client event endpoint exists:

validate:

event name allowlist
payload schema
authorization where relevant
size
idempotency

Do not accept arbitrary event names/metadata from clients.

============================================================
PART 69 — TRUSTED VS CLIENT EVENTS
============================================================

Client may emit discovery interaction events.

Client must NOT be trusted to emit:

payment_confirmed
order_completed
review_submitted

as authoritative analytics facts.

Transactional stages come from server/canonical state.

============================================================
PART 70 — SPOOFING SAFETY
============================================================

Prevent user from sending:

eventName = payment_confirmed
orderId = someone else's order

and affecting trusted business analytics.

Separate trusted server-derived metrics from untrusted interaction signals.

============================================================
PART 71 — DASHBOARD EMPTY STATES
============================================================

If no data exists:

show:

No data for this period

not fake zero trends.

If analytics tracking only started recently:

show coverage/start-date context.

============================================================
PART 72 — PARTIAL COVERAGE
============================================================

Dashboard must not compare:

new interaction events

against pre-release periods

as if tracking existed.

Clearly label incomplete historical coverage.

============================================================
PART 73 — LOCALIZATION
============================================================

Admin Intelligence:

EN / LTR
AR / RTL

Metric labels localized.

Subject/Service names use canonical bilingual behavior.

No raw enums.

No raw event names in UI.

============================================================
PART 74 — ACCESSIBILITY
============================================================

Keyboard:

date filters
Subject
Service
tabs
charts/table switch if any
pagination

Charts require textual equivalent.

Do not use color alone for trend direction.

============================================================
PART 75 — RESPONSIVE
============================================================

Admin analytics should work at:

390
768
1024
1440

Desktop may be primary, but mobile must remain readable.

Tables may use contained horizontal scroll where genuinely necessary.

No page-level overflow.

============================================================
PART 76 — VISUAL QUALITY
============================================================

Keep visual language consistent with existing Tafseel.

Do not produce a generic BI dashboard disconnected from product design.

Use:

clear hierarchy
few important cards
readable charts/tables
meaningful empty states
visible date/filter context

============================================================
PART 77 — EXPORT
============================================================

Do NOT automatically build CSV/Excel export.

Audit whether existing Admin reporting conventions require it.

If clearly valuable and low-risk:

may be included.

Otherwise backlog.

============================================================
PART 78 — OVERVIEW E2E
============================================================

Use legitimate Development data.

Admin:

login
→ Marketplace Intelligence
→ select period

Verify:

overview counts reconcile with canonical records/events.

============================================================
PART 79 — FUNNEL E2E
============================================================

Drive or reuse a legitimate lifecycle:

Browse
→ Teacher
→ Service
→ Request
→ Accept
→ Payment
→ Delivery
→ Complete
→ Review

Verify funnel stages reflect only actual completed steps.

No stage before its truth exists.

============================================================
PART 80 — DROP-OFF E2E
============================================================

Create/use a second legitimate journey that stops earlier.

Example:

Browse
→ Teacher Profile
→ Request Start
but no submission

Verify:

appropriate upper stages increment
later stages do not.

============================================================
PART 81 — ZERO-RESULT E2E
============================================================

Use Release 6 Browse.

Create a legitimate filter state producing zero results.

Verify:

zero-result interaction is represented according to chosen analytics semantics.

No raw search text stored.

============================================================
PART 82 — SUBJECT/SERVICE E2E
============================================================

Use at least two Subjects / Services.

Verify:

aggregation attributes events/business records to correct canonical IDs.

No cross-service attribution.

============================================================
PART 83 — TRANSACTION RECONCILIATION TEST
============================================================

For a fixed test time range:

query canonical Orders/Payments.

Query analytics endpoint.

Expected:

same count according to documented metric formula.

Do not accept approximate mismatch.

============================================================
PART 84 — HISTORICAL BACKFILL TEST
============================================================

Verify transactional historical analytics include appropriate pre-R7 Orders where canonical history supports them.

Verify discovery interaction metrics do NOT claim pre-instrumentation history.

============================================================
PART 85 — AUTHORIZATION E2E
============================================================

Student:
analytics Admin API denied.

Teacher:
denied.

Quality:
denied unless policy explicitly grants.

Admin:
allowed.

============================================================
PART 86 — PRIVACY E2E
============================================================

Inspect Admin analytics responses.

Assert absence of:

email
phone
private message text
request body
payment secrets
attachment data
private notes.

============================================================
PART 87 — EVENT SPOOF TEST
============================================================

If client analytics endpoint exists:

attempt unsupported/trusted event names.

Expected:

reject or ignore according to contract.

Client cannot manufacture:

payment_confirmed
order_completed
review_submitted

business truth.

============================================================
PART 88 — DUPLICATE EVENT TEST
============================================================

Send same allowed interaction:

same clientEventId

twice.

Expected:

one logical analytics event.

============================================================
PART 89 — BROWSER CERTIFICATION
============================================================

Reuse:

tests/browser/

and Release 5 rate-limit-aware session/request-budget strategy.

Do not introduce another framework.

Required surfaces:

Admin Intelligence Overview
Funnel
Demand/Supply
Subjects
Services
Zero Results

And Release 6 instrumentation spot-check:

Browse
Teacher Profile

============================================================
PART 90 — RATE LIMIT SAFETY
============================================================

Accepted browser run:

0 unexpected 429.

Do not weaken limiters.

Analytics instrumentation must not create noisy request storms.

============================================================
PART 91 — EVENT BATCHING
============================================================

Do not add batching unless needed.

If one event per meaningful interaction is within request budget:

keep simple.

If instrumentation materially increases request fan-out:

evaluate lightweight batching using current architecture.

No complexity without evidence.

============================================================
PART 92 — FRONTEND FAILURE SAFETY
============================================================

Simulate analytics endpoint failure.

Browse/Profile must remain usable.

No console-error storm.

Analytics failure may be logged appropriately without blocking product.

============================================================
PART 93 — OBSERVABILITY
============================================================

Use existing structured logging for analytics ingestion errors.

Do not log sensitive payloads.

============================================================
PART 94 — MIGRATION TESTING
============================================================

If a migration is introduced:

generate only after model decision.

Do not apply to Production.

Validate:

up
model snapshot
pending model changes
idempotent deployment path
existing data unaffected.

============================================================
PART 95 — FULL BACKEND REGRESSION
============================================================

Run current:

Architecture
Domain
Application
Integration

Use current counts.

Require:

0 failures
0 skips
0 source exclusions.

============================================================
PART 96 — FRONTEND REGRESSION
============================================================

Run all canonical current gates:

frontend integrity
localization
usage
BUG-001
template/resource leak
auth
guided request
notification
mobile CTA
Release 5 integrity
Release 6 integrity
Release 7 integrity
browser self-test
git diff --check

============================================================
PART 97 — RELEASE 6 COLLISION
============================================================

If Release 6 closes while this agent is working:

re-read:

PROJECT_STATUS
Release 6 report
Browse/Profile/Compare

before finalizing.

Do not overwrite its acceptance fixes.

Run Release 6 integrity gate.

============================================================
PART 98 — FOUNDATION / R4 / R5 RETENTION
============================================================

Do not recertify old releases.

Target smoke:

Foundation public eligibility/trust
R4 Admin/Quality pages
R5 messaging entry
R6 Browse/Profile/Compare

All must remain intact.

============================================================
PART 99 — DATABASE / EF
============================================================

If no migration:

EF clean.

If focused analytics migration exists:

no pending changes after generation.

Document explicitly.

============================================================
PART 100 — RELEASE BUILD
============================================================

Run:

dotnet build -c Release

Required:

0 errors.

No new warnings.

============================================================
PART 101 — PUBLISH SMOKE
============================================================

Isolated publish only.

No deploy.

Verify:

/health/live
/health/ready

Admin login

Marketplace Intelligence pages/API

Public:

Landing
Browse
Teacher Profile

Authenticated:

Student Dashboard
Teacher Dashboard

Static assets:

200

Cache policy:

correct.

No unexpected:

401
403
429
500.

============================================================
PART 102 — PRODUCT EVALUATION
============================================================

Score honestly:

Metric Integrity
Funnel Clarity
Demand Intelligence
Supply Intelligence
Zero-Result Intelligence
Historical Accuracy
Privacy
Security
Scalability
Admin UX
Accessibility
Localization
Architecture
Overall Marketplace Intelligence

No automatic 10/10.

============================================================
PART 103 — RELEASE RETROSPECTIVE
============================================================

Answer:

- Which metrics are now trustworthy?
- Which stages came from canonical domain state?
- Which required interaction events?
- Was schema added?
- What privacy decisions remain?
- What analytics start-date limitation exists?
- What was deliberately NOT instrumented?
- What should Release 8 consume?
- What must Release 8 NOT interpret as ranking permission?
- What Production Readiness dependencies remain?

No separate retrospective Sprint.

============================================================
OUT OF SCOPE
============================================================

Do NOT implement:

- AI
- Groq
- embeddings
- semantic search
- recommendations
- Teacher ranking
- Best Match
- automated business decisions
- Quality scoring
- public Teacher conversion metrics
- public completion metrics
- experimentation/A-B platform
- attribution/ads tracking
- third-party advertising analytics
- CRM
- order messaging changes
- Release 6 UX redesign
- real PSP
- Production live provider
- SignalR scale-out
- malware scanning
- F-005
- legal/privacy policy content beyond engineering-safe minimization

============================================================
DOCUMENTATION
============================================================

Save prompt:

docs/prompts/
PHASE_4_RELEASE_7_MARKETPLACE_INTELLIGENCE.md

Create feature report:

docs/features/
PHASE_4_RELEASE_7_MARKETPLACE_INTELLIGENCE.md

Evidence:

docs/features/evidence/
phase4-release7-marketplace-intelligence/

Required:

current-state-audit.md
event-infrastructure-audit.md
architecture-decision.md
metric-catalog.md
funnel-definitions.md
event-contract.md
privacy-model.md
analytics-coverage-start.md
demand-supply-definitions.md
query-performance.md
transaction-reconciliation.md
event-idempotency.md
event-spoofing.md
admin-dashboard-e2e.md
funnel-e2e.md
zero-result-e2e.md
browser-certification.md
security-authorization.md
release-regression.md
publish-smoke.md
final-summary.md

If schema migration:

docs/database/
RELEASE_7_MARKETPLACE_INTELLIGENCE_SCHEMA.md

Create retrospective:

docs/reports/
PHASE_4_RELEASE_7_MARKETPLACE_INTELLIGENCE_RETROSPECTIVE.md

Update:

docs/INDEX.md
docs/PROJECT_STATUS.md

Preserve all prior release history.

============================================================
RELEASE 7 EXIT RULE
============================================================

Return:

RELEASE 7 — MARKETPLACE INTELLIGENCE VERIFIED

ONLY IF ALL are true:

1. Existing event/audit infrastructure audited before design.
2. Analytics architecture decision documented.
3. No duplicate unnecessary event architecture created.
4. Funnel definitions documented.
5. Every metric has explicit formula/source.
6. Transactional stages use canonical business truth.
7. Client cannot spoof transactional analytics truth.
8. Only necessary interaction events are instrumented.
9. Raw free-text search is not silently persisted.
10. Event payload contains no sensitive PII.
11. Event idempotency works where needed.
12. Analytics failures do not block product journeys.
13. Browse instrumentation is bounded.
14. Profile instrumentation is bounded.
15. No analytics request storm exists.
16. Browse view semantics are documented.
17. Teacher open semantics documented.
18. Service selection semantics documented.
19. Request start semantics documented.
20. Zero-result semantics documented.
21. Analytics coverage start date is explicit.
22. Historical transactional analytics are truthful.
23. Historical discovery interactions are not fabricated.
24. Demand metrics are explicit.
25. Supply metrics use canonical eligible Teachers/offers.
26. Supply excludes pending/revoked/disabled/hidden records.
27. Subject intelligence works.
28. Service intelligence works.
29. Subject+Service intelligence works.
30. Funnel counts work.
31. Conversion denominators are explicit.
32. Zero denominator returns N/A/null appropriately.
33. Drop-off values are correct.
34. Zero-result analytics works.
35. Date filters work server-side.
36. No unbounded analytics query exists.
37. No per-subject/service N+1 exists.
38. Transactional analytics reconcile with canonical records.
39. Admin Intelligence authorization passes.
40. Student analytics API denial passes.
41. Teacher denial passes where appropriate.
42. Quality denial passes where appropriate.
43. Admin DTOs contain no unnecessary PII.
44. Client trusted-event spoof test passes.
45. Duplicate-event test passes.
46. Admin Overview works.
47. Funnel UX works.
48. Demand/Supply UX works.
49. Subject view works.
50. Service view works.
51. Zero-results view works.
52. AR/RTL works.
53. EN/LTR works.
54. Accessibility works.
55. Responsive operational UX works.
56. Browser certification passes.
57. Accepted browser run has 0 unexpected 429.
58. Accepted browser run has 0 console.error.
59. No failed first-party resources.
60. Release 6 concurrent changes are preserved.
61. Release 6 integrity passes.
62. Release 5 integrity passes.
63. Release 4 smoke passes.
64. Foundation trust rules remain intact.
65. F-002 public metrics remain intact.
66. No Teacher ranking/recommendation introduced.
67. No AI introduced.
68. Architecture tests pass.
69. Domain tests pass.
70. Application tests pass.
71. Integration tests pass with 0 failures.
72. Frontend gates pass.
73. EF state is clean / focused migration justified.
74. Release build passes.
75. Publish succeeds.
76. Publish smoke passes.
77. Health passes.
78. No Critical/High Release 7 defect remains.
79. Metric catalog is complete.
80. Documentation complete.
81. Release retrospective completed.

NO EXCEPTIONS.

If interaction-event persistence is unnecessary:

do not create it merely because the prompt mentions it.

If interaction-event persistence is necessary:

one focused append-only mechanism is preferred.

============================================================
FINAL RESPONSE FORMAT
============================================================

Return exactly:

============================================================
PHASE 4 — MARKETPLACE SCALE
RELEASE 7 — MARKETPLACE INTELLIGENCE
============================================================

## Findings

## Existing Intelligence / Event Architecture

## Architecture Decision

## Funnel Definitions

## Metric Catalog

## Transactional Truth Sources

## Interaction Event Model

## Event Privacy

## Event Idempotency

## Analytics Coverage Start

## Discovery Instrumentation

## Browse Intelligence

## Teacher Profile Intelligence

## Zero-Result Intelligence

## Demand Definitions

## Supply Definitions

## Supply vs Demand

## Subject Intelligence

## Service Intelligence

## Subject + Service Intelligence

## Funnel Analytics

## Conversion / Drop-Off

## Historical Accuracy

## Admin Marketplace Intelligence UX

## Authorization

## Privacy / Security

## Query Performance

## Analytics Failure Safety

## Admin Dashboard E2E

## Funnel E2E

## Zero-Result E2E

## Transaction Reconciliation

## Browser Certification

## Release 6 Collision Check

## Release 5 Retention

## Release 4 / Foundation Retention

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

## Release 7 Retrospective

## Release 8 Handoff

Then:

Architecture:
Metric Catalog:
Funnel:
Transactional Truth:
Interaction Events:
Privacy:
Idempotency:
Coverage Start:
Browse Intelligence:
Zero Results:
Demand:
Supply:
Subject:
Service:
Subject+Service:
Conversion:
Drop-Off:
Historical Accuracy:
Admin UX:
Authorization:
Security:
Performance:
Browser:
Release 6:
Release 5:
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

- RELEASE 7 — MARKETPLACE INTELLIGENCE VERIFIED
- RELEASE 7 — MARKETPLACE INTELLIGENCE CONDITIONALLY VERIFIED
- RELEASE 7 — MARKETPLACE INTELLIGENCE PARTIALLY COMPLETED
- RELEASE 7 — MARKETPLACE INTELLIGENCE BLOCKED

If and ONLY if VERIFIED write exactly:

✅ Release 7 — Marketplace Intelligence Verified & Closed

Then:

🚀 Release 8 — AI-Assisted Marketplace Unblocked

Then exactly:

✅ Finished Phase 4 — Release 7
