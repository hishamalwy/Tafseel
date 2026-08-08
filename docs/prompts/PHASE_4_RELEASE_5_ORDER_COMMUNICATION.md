============================================================
PHASE 4 — MARKETPLACE SCALE
RELEASE 5 — ORDER COMMUNICATION

FULL RELEASE EXECUTION
============================================================

## Previous Context

Tafseel is an educational marketplace connecting:

- Students
- Teachers
- Quality Reviewers
- Admins

The Marketplace Foundation has already been:

MARKETPLACE PRODUCT INTEGRITY VERIFIED
PHASE 4 FOUNDATION VERIFIED & CLOSED

The canonical learning-commerce lifecycle already exists:

Student
→ Browse Teacher
→ Select Service
→ Submit Learning Request
→ Teacher Accept
→ Payment
→ Start Work
→ Delivery
→ Revision where applicable
→ Approval
→ Completed
→ Rating / Review

Release 4 — Marketplace Operations may be executing concurrently in another workstream/agent.

DO NOT assume Release 4 is complete unless:

docs/PROJECT_STATUS.md

and the canonical Release 4 report explicitly say so.

Release 5 must avoid modifying/rebuilding Release 4 Admin/Quality Operations unless a direct dependency is proven.

============================================================
KNOWN PRODUCT GAP
============================================================

Tafseel already has messaging / notification infrastructure from earlier architecture work.

However, the marketplace still lacks a mature:

ORDER-SCOPED COMMUNICATION EXPERIENCE

Students and Teachers need communication that is naturally attached to the commercial context they are working on.

A Student should NOT have to think:

"Which generic chat is related to this order?"

A Teacher should NOT have to reconstruct context manually.

Communication should make clear:

- Which Order is being discussed?
- Which Teacher/Student is involved?
- Which Service is involved?
- What stage is the Order currently in?
- What files were originally submitted?
- What has been delivered?
- What revisions were requested?
- Which messages are unread?
- Which important lifecycle events happened?

This release must improve communication WITHOUT creating another messaging domain.

============================================================
RELEASE GOAL
============================================================

Deliver a complete, trustworthy Order Communication experience.

By the end of Release 5:

Students and Teachers should be able to communicate naturally inside the context of an Order, exchange supported attachments safely, understand important lifecycle events in the conversation, receive correct unread/notification behavior, and recover the full commercial communication context from the Order itself.

Release 5 should deliver:

1. Order-scoped messaging UX.
2. Correct Order/message authorization.
3. Thread discovery from Student and Teacher dashboards.
4. Unread/read state.
5. Message notifications and deep links.
6. Supported message attachments.
7. System lifecycle messages/events.
8. Request attachments visible from completed Order context.
9. Delivery/revision context integrated coherently.
10. Responsive + localized + accessible communication UX.
11. Full E2E certification.
12. Release retrospective.

============================================================
CRITICAL ARCHITECTURE RULE
============================================================

DO NOT CREATE A SECOND CHAT DOMAIN.

Before implementation, trace the existing messaging architecture completely.

If the repository already contains concepts such as:

Conversation
Message
Participant
Attachment
ReadReceipt
Notification
SignalR
Outbox

or equivalent canonical names:

REUSE THEM.

Do NOT create:

OrderChat
OrderMessageV2
MarketplaceConversation2
LearningRequestChat
TeacherStudentChat
CommunicationThreadV2

unless evidence proves no canonical aggregate exists.

An Order-scoped UX does NOT automatically require a new messaging aggregate.

Prefer relating/projecting the existing messaging system to the canonical Order.

============================================================
MANDATORY FINDING CLASSIFICATION
============================================================

Before accepting any discovered issue classify it as exactly one of:

- Production Bug
- UI/View Issue
- API Mismatch
- Business Ambiguity
- Legacy Compatibility
- Dead Code
- Test Issue
- Missing Feature
- Technical Debt

Do not call "generic inbox is inconvenient" a Production Bug if existing messaging works.

Likely classification:

Missing Feature / UX Gap

============================================================
PART 1 — EVIDENCE-FIRST MESSAGING AUDIT
============================================================

Before changing code trace:

Domain
Application
Infrastructure
API
Frontend
Notifications
SignalR
Attachments
Authorization
Tests

Find the actual canonical messaging models.

Answer with evidence:

1. What entity represents a conversation/thread?
2. What entity represents a message?
3. How are participants stored?
4. How are unread/read states represented?
5. Are messages immutable?
6. Can messages have attachments?
7. How are attachments authorized?
8. Does SignalR exist?
9. Is an Outbox used?
10. How are message notifications produced?
11. Can conversations already reference:
   - LearningRequest?
   - Order?
   - LiveBooking?
12. Is there already an Order/message relationship hidden in the backend but not exposed properly in UI?
13. How does the current generic Messages inbox work?
14. Are messages already scoped to participants securely?
15. What persistence/indexes already exist?

Do NOT design before answering these.

============================================================
PART 2 — DOMAIN DECISION
============================================================

Based on Part 1 choose the smallest architecture-consistent design.

Preferred hierarchy:

OPTION A — Existing Conversation already supports Order context
→ reuse directly.

OPTION B — Existing Conversation has generic reference/context support
→ use it.

OPTION C — Existing Conversation requires a minimal nullable Order relationship
→ extend canonical model carefully.

Only choose schema change if genuinely required.

Do NOT create a separate OrderChat aggregate merely for UX convenience.

============================================================
PART 3 — CONVERSATION OWNERSHIP RULE
============================================================

For a standard Learning Order:

One commercial Order should have one canonical Student↔Teacher communication context.

Prevent accidental duplicate threads for the same:

Order + participants + communication purpose

unless current architecture explicitly supports another invariant.

If a generic conversation already existed before the Order was created:

investigate whether it should be linked/reused rather than duplicated.

Document the decision.

============================================================
PART 4 — THREAD CREATION LIFECYCLE
============================================================

Determine the correct point at which Order communication becomes available.

Evaluate existing lifecycle.

Possible valid points:

- Request submission
- Teacher acceptance
- Order creation
- Payment confirmation

Do NOT choose arbitrarily.

Product preference:

The Student and Teacher should be able to communicate once a legitimate commercial relationship exists, but messaging must not bypass marketplace lifecycle/security.

If communication exists before Order creation through a Request context:

preserve it coherently.

Do not create a split UX where:

Request Chat

and later:

Order Chat

become disconnected histories unless current architecture requires it.

============================================================
PART 5 — ORDER COMMUNICATION ENTRY POINTS
============================================================

Student Dashboard:

Every eligible active Order should expose a clear:

Messages / Conversation

entry point.

Teacher Dashboard:

Every eligible Order should expose the equivalent action.

Do NOT make users navigate to a generic inbox first.

The generic Messages area may remain.

Order-specific entry should open:

the correct canonical conversation

with the correct Order context.

============================================================
PART 6 — ORDER COMMUNICATION HEADER
============================================================

The conversation must make commercial context obvious.

Display only truthful existing data:

- Teacher/Student display name
- avatar if safely available
- Service
- Order reference
- current Order status
- agreed price where appropriate
- delivery deadline where appropriate

Do NOT show sensitive financial/internal fields.

Do NOT show payment credentials/details.

Status must be presentation-mapped/localized.

No raw enum.

============================================================
PART 7 — CONVERSATION TIMELINE
============================================================

The timeline should combine communication context coherently.

At minimum distinguish visually:

USER MESSAGE

SYSTEM / LIFECYCLE EVENT

ATTACHMENT

Do not fake historical events.

System events must derive from actual persisted Order history / lifecycle facts.

============================================================
PART 8 — SYSTEM LIFECYCLE MESSAGES
============================================================

Investigate existing Order status history.

Reuse persisted events.

Potential timeline events:

Request submitted
Teacher accepted
Payment confirmed
Teacher started work
Delivery submitted
Revision requested
Revised delivery submitted
Student approved
Order completed

Only show events supported by actual persisted truth.

Do NOT generate historical events retroactively from assumptions.

Do NOT duplicate business state in Message rows merely to show it.

Preferred:

project/order timeline event into communication timeline

OR

use an existing system-message mechanism if already canonical.

Document the architectural choice.

============================================================
PART 9 — SYSTEM MESSAGE PRESENTATION
============================================================

System events must not look like Student/Teacher speech.

Use a distinct presentation.

Examples:

"Payment confirmed."

"Teacher started working on this order."

"A new delivery was submitted."

"A revision was requested."

No fake sender avatar.

No fake "Admin" author.

============================================================
PART 10 — MESSAGE SENDING
============================================================

Students and Teachers can send legitimate text messages.

Validate:

- membership
- Order relationship
- suspension/authorization rules
- message length
- empty content
- attachment-only behavior where supported

Do not permit unrelated users to message into an Order.

============================================================
PART 11 — MESSAGE IMMUTABILITY
============================================================

Trace current behavior.

Do NOT casually add:

Edit Message
Delete Message

If messaging is already immutable:

preserve it.

Commercial communication benefits from auditability.

If delete/edit already exists:

trace exact semantics before changing anything.

============================================================
PART 12 — ATTACHMENTS
============================================================

Trace existing message attachment infrastructure.

Reuse it.

Supported attachments should follow canonical existing limits.

Do not invent:

- unlimited size
- arbitrary executable files
- unsafe inline rendering

Validate:

file type
file size
authorization
ownership

If malware scanning is not Production-ready:

do NOT pretend it is.

Document provider/security dependency honestly.

============================================================
PART 13 — ATTACHMENT AUTHORIZATION
============================================================

Prove:

Student participant:
can access legitimate conversation attachments.

Teacher participant:
can access legitimate conversation attachments.

Unrelated Student:
DENIED.

Unrelated Teacher:
DENIED.

QualityReviewer:
not automatically allowed.

Admin:
only if current existing policy explicitly allows it.

Do not infer that Admin must read every conversation.

Privacy first.

============================================================
PART 14 — REQUEST ATTACHMENTS IN ORDER CONTEXT
============================================================

Known product asymmetry:

Delivery files can appear in Order history, but original Request files may be difficult or impossible to recover from the Completed Order experience.

Fix this WITHOUT copying files.

The Completed Order should allow Student/Teacher to understand:

"These are the files originally submitted with this request."

Reuse canonical LearningRequestAttachment records.

Do NOT duplicate binary content into Order attachments.

Preferred:

projection/reference.

============================================================
PART 15 — DELIVERY CONTEXT
============================================================

Communication should integrate naturally with delivery context.

When a Delivery exists:

show a truthful lifecycle entry.

Allow navigation to legitimate delivery files using existing delivery authorization.

Do NOT turn message attachments and Order Delivery files into one domain.

They have different semantics.

============================================================
PART 16 — REVISION CONTEXT
============================================================

If a RevisionRequest exists:

show relevant communication context.

But preserve the known architectural limitation:

F-005

RevisionRequest currently does not have a canonical DeliveryId relationship if that remains true in the current repository.

DO NOT fix F-005 inside Release 5.

Do not invent a Delivery linkage.

Display only information current schema can prove safely.

Leave F-005 in Production/architecture backlog.

============================================================
PART 17 — UNREAD STATE
============================================================

Trace canonical read receipt model.

Implement accurate unread counts.

Student should know:

how many unread messages need attention.

Teacher should know the same.

Counts must be derived from persisted read/unread state.

Do NOT derive unread from:

notification count
browser localStorage
last page visit only

if proper receipts already exist.

============================================================
PART 18 — MARK AS READ
============================================================

Define exactly when a message becomes read.

Preferred product behavior:

Opening/rendering the active conversation and actually receiving/displaying messages may mark them read according to existing architecture.

Do NOT mark all messages globally read simply because:

Dashboard loaded.

Avoid race conditions.

Ensure sender's own message is not counted as unread for sender.

============================================================
PART 19 — UNREAD BADGES
============================================================

Expose truthful badges at useful entry points:

Student Dashboard Orders
Teacher Dashboard Orders
Messages navigation where already present

Possibly conversation list.

Do NOT flood the interface with duplicate unread counters.

Use one consistent pattern.

============================================================
PART 20 — NOTIFICATIONS
============================================================

Reuse existing Notification domain.

For a new message:

recipient receives existing appropriate notification.

Do NOT create:

OrderMessageNotification domain.

Use canonical routing.

Notification should identify enough context:

sender
Order / Service context

without leaking private content unnecessarily.

Avoid putting full sensitive message body into push/email notification if current privacy model does not already do so.

============================================================
PART 21 — NOTIFICATION DEEP LINK
============================================================

Clicking a message notification should land on:

the correct Order conversation

not:

generic dashboard
wrong conversation
404

Use canonical routing helper:

Tafseel.notificationRoute

where appropriate.

If Release 4 agent changes notification routing concurrently:

do not overwrite blindly.

Reconcile latest worktree/docs before editing shared notification helpers.

============================================================
PART 22 — REAL-TIME DELIVERY
============================================================

Trace SignalR.

If existing real-time messaging works:

preserve and integrate Order-scoped UX with it.

Verify:

sender sends
recipient sees without manual reload where current architecture promises real-time delivery.

Do NOT create another WebSocket stack.

If SignalR is currently only Development/single-instance-safe:

document Production multi-instance limitation.

Do NOT solve distributed SignalR infrastructure in this Release unless already part of current architecture.

============================================================
PART 23 — OUTBOX / DELIVERY RELIABILITY
============================================================

If message notifications use Outbox:

preserve it.

Message persistence should not depend on notification delivery succeeding synchronously.

Do not create transaction coupling where:

notification failure
=
message failure

unless canonical existing architecture intentionally behaves that way.

============================================================
PART 24 — ORDER CLOSED / COMPLETED BEHAVIOR
============================================================

Define communication behavior after:

Completed
Cancelled
Refunded
Disputed

based on current business rules.

Do NOT invent new policy silently.

Investigate current messaging behavior first.

Potential options:

- remain readable + send allowed
- remain readable + locked
- limited time window

If current product/business rules do not define it:

classify:

Business Ambiguity

Do NOT fabricate permanent locking policy.

For this Release:

preserve existing capability unless unsafe.

============================================================
PART 25 — SYSTEM VS USER MESSAGE TRUST
============================================================

Never allow client payload to impersonate:

System
Admin
Order event

Only trusted backend logic can emit system-event presentation.

Users must not control:

message type = system

if that would affect trust presentation.

Add authorization/domain tests.

============================================================
PART 26 — PAGINATION
============================================================

Long conversations must paginate.

Do not fetch unlimited message history.

Prefer:

cursor/keyset pagination

if existing messaging architecture uses it.

Otherwise reuse current canonical pagination style.

Newest/oldest loading direction must be UX-consistent.

============================================================
PART 27 — MESSAGE ORDERING
============================================================

Ordering must be deterministic.

Use persisted server timestamps / sequence.

Do not rely on client device clock.

Handle same-time messages deterministically.

============================================================
PART 28 — IDEMPOTENCY / DUPLICATE SEND
============================================================

Investigate existing protection.

Rapid double-click / retry should not accidentally duplicate a message if the canonical architecture supports request idempotency/client message IDs.

Do not invent a complex new idempotency subsystem without evidence.

At minimum:

disable repeated submit while request active

and prove actual behavior.

============================================================
PART 29 — ERROR STATES
============================================================

Handle truthfully:

message send failed
attachment upload failed
attachment partially failed
conversation unavailable
authorization lost
network interruption

Do NOT show a message as sent until backend confirms it unless existing architecture has an explicit pending/retry state.

============================================================
PART 30 — EMPTY STATE
============================================================

New Order conversation:

clear empty state.

Example intent:

"No messages yet. Use this conversation for questions about this order."

Do not imply support/admin monitors the conversation unless true.

============================================================
PART 31 — COMMUNICATION SAFETY / PRIVACY
============================================================

Audit DTOs.

Do not expose:

email
phone
address
JWT identifiers
payment information
internal moderation data
private Quality/Admin notes

unless current canonical business requirement explicitly needs them.

Student/Teacher commercial chat should expose least necessary identity.

============================================================
PART 32 — EXTERNAL CONTACT INFORMATION
============================================================

Do NOT automatically add phone/email sharing.

If users type external contact details inside normal free-text:

do not introduce new censorship/business policy in this Release unless existing rules already govern it.

Classify policy questions instead of inventing them.

============================================================
PART 33 — BLOCKED / SUSPENDED USERS
============================================================

Trace existing account suspension controls.

A suspended user must not bypass suspension via messaging APIs.

Preserve canonical authorization.

Add tests.

============================================================
PART 34 — REQUEST → ORDER CONTINUITY
============================================================

This is one of the most important UX questions.

If messaging can begin at Request stage:

ensure accepted Request → Order does NOT create confusing disconnected context.

Investigate whether the canonical conversation can maintain:

Request context
then Order context

after acceptance.

Preferred user experience:

continuous commercial conversation.

But do NOT force it if current architecture intentionally separates them.

Document evidence and decision.

============================================================
PART 35 — STUDENT UX
============================================================

Student Dashboard Order card/detail should make communication easy.

Potential hierarchy:

Order status
Teacher
Service
next action
Messages

Unread indicator should be visible but not visually overpower payment/delivery/review primary actions.

Do not damage lifecycle CTA hierarchy.

============================================================
PART 36 — TEACHER UX
============================================================

Teacher Dashboard should provide equivalent communication access.

Teacher must not need to leave the active Order context just to answer the Student.

Keep:

Start Work
Deliver
Request handling

as correct business-primary actions.

Messages should support them, not replace them.

============================================================
PART 37 — GENERIC MESSAGES AREA
============================================================

Do NOT remove the existing generic Messages page unless proven obsolete.

Update it to show Order context where appropriate.

Each conversation row should help distinguish:

Student/Teacher
Service
Order

without clutter.

If non-Order conversations also exist:

preserve them.

============================================================
PART 38 — SEARCH
============================================================

Do not build a huge chat search engine.

Evaluate whether existing conversation search exists.

At minimum conversation list may search:

participant display name
service
Order reference

only where backend can support safely.

Full message-body search is NOT required for Release 5 unless already implemented.

============================================================
PART 39 — LOCALIZATION
============================================================

Everything user-visible:

AR / RTL
EN / LTR

No raw status.

No raw enum.

No untranslated key.

No GUID-as-name.

System-event text must localize correctly.

Use the certified shared translation runtime.

No page-specific hacks.

============================================================
PART 40 — RESPONSIVE UX
============================================================

Certify:

375
390
768
1024
1440

Important surfaces:

Student Order conversation
Teacher Order conversation
Conversation list
Attachment viewer/download state

Mobile must support:

reading
typing
attachments
scroll
send
back navigation

Avoid composer being hidden behind viewport/browser controls.

No full-page horizontal overflow.

============================================================
PART 41 — ACCESSIBILITY
============================================================

Keyboard:

conversation list
open conversation
composer
send
attachment button
message attachment
Order context link

Screen reader:

conversation title
message sender
timestamp
system event
unread state
attachment name

Composer must have an accessible label.

Do not communicate state by color only.

Focus after send should remain sensible.

============================================================
PART 42 — SCROLL BEHAVIOR
============================================================

Implement sane message scroll behavior.

Opening conversation:

go to appropriate recent/unread context.

Receiving new message while user is at bottom:

may follow new content.

If user is reading older history:

do NOT forcibly jump them to bottom.

Provide:

"New messages"

indicator where needed.

Do not over-engineer if existing chat already solves this.

============================================================
PART 43 — TIME / DATE PRESENTATION
============================================================

Use canonical date/time formatting.

Avoid duplicated ad-hoc:

"N minutes ago"
"2 days"

helpers if shared helper exists.

Known backlog included pluralization/date-count duplication.

If Release 5 naturally touches this:

first inspect whether it has already been solved by another release/agent.

If still duplicated and a small shared helper safely resolves it:

classify Technical Debt and reuse centrally.

Do not broaden into unrelated refactor.

============================================================
PART 44 — STUDENT E2E
============================================================

Use legitimate Development fixture.

Student:

login
→ open active Order
→ Messages
→ verify correct Teacher/Service/Order
→ send text message
→ upload allowed attachment

Verify:

message persisted
attachment persisted
conversation remains correct after reload

============================================================
PART 45 — TEACHER E2E
============================================================

Teacher:

login
→ see unread indicator
→ open same Order
→ see Student message
→ attachment accessible
→ reply

Verify Student receives:

message
unread state
notification

============================================================
PART 46 — REAL-TIME E2E
============================================================

Use two authenticated browser contexts if supported.

Student and Teacher conversation open simultaneously.

Student sends.

Verify Teacher receives according to existing real-time contract.

Teacher replies.

Verify Student receives.

No duplicate message.

No cross-thread leak.

============================================================
PART 47 — AUTHORIZATION E2E
============================================================

Create/use:

Student A
Teacher A
Student B
Teacher B

Order belongs:

Student A ↔ Teacher A

Prove:

Student A: allowed
Teacher A: allowed
Student B: denied
Teacher B: denied

Test:

conversation
messages
attachments
read state

Not just UI.

============================================================
PART 48 — SYSTEM EVENT E2E
============================================================

Drive a legitimate lifecycle:

Request
→ Accept
→ Payment
→ Start Work
→ Delivery
→ Revision/Approval where practical

Verify communication timeline reflects only actual lifecycle events.

No duplicate event.

No event before state exists.

No fake history.

============================================================
PART 49 — COMPLETED ORDER HISTORY E2E
============================================================

After Completed:

Student opens Order.

Verify historical context includes:

original Request details/files
communication
deliveries
revision context supported by schema
completion
review status

Do not make the Completed Order a dead card with lost history.

============================================================
PART 50 — ATTACHMENT E2E
============================================================

Test:

valid PDF/image/document according to canonical limits.

Verify:

upload
display
download/view
refresh
authorization denial

Test unsupported/oversized input.

Backend must reject safely.

No UI-only validation dependency.

============================================================
PART 51 — NOTIFICATION E2E
============================================================

Teacher offline/not viewing conversation.

Student sends.

Teacher notification appears.

Click.

Expected:

correct conversation + correct Order context.

Repeat reverse direction.

No generic wrong landing.

============================================================
PART 52 — UNREAD E2E
============================================================

Student sends 2 messages.

Teacher has:

2 unread

Teacher opens thread.

Read state updates according to canonical rule.

Student's own messages are not unread for Student.

Teacher replies.

Student unread increments correctly.

Refresh persists.

============================================================
PART 53 — CONCURRENCY
============================================================

Test:

two tabs same user
rapid send
rapid open/read
two participants sending near-simultaneously

Ensure:

deterministic ordering
no duplicate read receipt corruption
no duplicated message caused by UI race
no lost message

Use existing concurrency strategy.

============================================================
PART 54 — PLAYWRIGHT CERTIFICATION
============================================================

Reuse:

tests/browser/

Do NOT introduce Cypress/Selenium/another framework.

Add Release 5 browser suite.

Required surfaces:

1. Student Order conversation
2. Teacher Order conversation
3. Generic Messages list
4. Conversation with attachment
5. Conversation with lifecycle events
6. Completed Order communication/history
7. Notification → conversation deep link
8. Unread badge/read flow

Modes:

AR RTL Dark
EN LTR Light

Viewports:

390
768
1440

Also targeted:

375 mobile composer geometry.

Assert:

- no console errors
- no page errors
- no failed first-party resource
- no unresolved template
- no GUID names
- no raw enum
- correct dir/lang/theme
- composer reachable
- send reachable
- attachment reachable
- no horizontal page overflow

============================================================
PART 55 — MOBILE COMPOSER GEOMETRY
============================================================

At:

375×667
390×844

Use:

getBoundingClientRect()
elementFromPoint()

Verify:

composer visible
text field reachable
Send reachable
attachment control reachable
nothing covered by sticky navigation
messages can scroll behind/above composer correctly

============================================================
PART 56 — FOUNDATION REGRESSION
============================================================

Do NOT rerun the entire Foundation blindly unless shared infrastructure changes.

Target at minimum:

Browse
Teacher Profile
Student Dashboard
Teacher Dashboard
Review Delivery
Real Rate Teacher

Run:

F-013/resource gate
localization gates
CTA gate
browser harness self-test

If changing:

tafseel.js
support.js
global CSS
auth
notificationRoute
shared modal helpers

increase regression coverage accordingly.

============================================================
PART 57 — RELEASE 4 COLLISION SAFETY
============================================================

Another agent may be working on Release 4 Marketplace Operations.

Before modifying shared files, inspect current worktree/docs.

Potential collision areas:

notificationRoute
Notifications UI
Admin Dashboard
Quality Dashboard
shared localization
global CSS
shared API helpers
Program.cs

Do NOT overwrite concurrent changes.

Do NOT revert files because they differ from your initial read.

Re-read before editing.

If a direct conflict exists:

isolate Release 5 implementation or document the blocker.

============================================================
PART 58 — BACKEND TESTS
============================================================

Add focused tests for:

conversation authorization
Order relationship
duplicate conversation prevention
message send
message ordering
pagination
attachments
attachment authorization
read receipts
unread counts
notification creation
notification routing metadata
system-message trust
suspended-user denial
participant privacy

Request→Order continuity tests where applicable.

============================================================
PART 59 — FULL REGRESSION
============================================================

Run:

Architecture
Domain
Application
Integration

Use current repository counts as baseline, not stale hardcoded counts from this prompt.

Require:

0 failures.

Do not weaken unrelated tests to turn suite green.

============================================================
PART 60 — FRONTEND GATES
============================================================

Run all current canonical gates, including:

frontend integrity
localization
localization usage
display names
template/resource leak
auth
guided request
notifications
browser self-test
JS syntax
git diff --check

plus Release 5 browser certification.

============================================================
PART 61 — DATABASE / MIGRATION DISCIPLINE
============================================================

First attempt to implement Release 5 using existing messaging schema.

If schema change is required:

prove it.

Potential legitimate example:

Conversation needs OrderId and no generic context relationship exists.

Before migration document:

- current schema
- missing invariant
- why projection alone cannot solve it
- uniqueness/index requirements
- legacy row migration behavior
- nullability
- delete behavior

Do not create migration merely for UI state.

============================================================
PART 62 — LEGACY CONVERSATIONS
============================================================

If schema gains Order relation:

define behavior for historical conversations.

Do NOT incorrectly attach old conversations to Orders based only on participant match.

Leave relationship null unless deterministic evidence exists.

No heuristic data corruption.

============================================================
PART 63 — PERFORMANCE
============================================================

Check for:

N+1 participants
N+1 unread counts
N+1 Order lookups
unbounded message history

Conversation lists should use efficient projections.

Messages paginate.

Do not prematurely cache dynamic unread counts without evidence.

============================================================
PART 64 — SECURITY
============================================================

Audit:

IDOR
attachment access
conversation enumeration
message sender spoofing
Order ID spoofing
system-message spoofing
unsafe filenames
content type
XSS/message HTML rendering

Render user messages safely.

Do not trust user HTML.

If Markdown is unsupported:

do not add it casually.

============================================================
PART 65 — PRODUCTION READINESS BOUNDARY
============================================================

Do NOT attempt to solve unrelated Production blockers.

Keep separate:

Real PSP
Live Session provider
Azure/durable Showcase storage
Malware scanning
F-005
SignalR multi-instance infrastructure if still unresolved
DataProtection multi-instance
Privacy/Terms
backup/restore

If message attachment production safety depends on malware scanning not yet available:

document the exact risk.

Do not fake provider readiness.

============================================================
PART 66 — PRODUCT REVIEW
============================================================

Score honestly:

Order Context Clarity
Student Communication UX
Teacher Communication UX
Unread/Notification UX
Attachment UX
Lifecycle Trust
Privacy
Authorization
Accessibility
Responsive UX
Localization
Realtime Experience
Architecture
Operational Scalability

Do not give 10/10 automatically.

Explain every score below 9.

============================================================
PART 67 — RELEASE RETROSPECTIVE
============================================================

Complete retrospective in this same Release.

Answer:

- What was implemented?
- What existing messaging architecture was reused?
- Was schema changed?
- What was intentionally not implemented?
- What business ambiguity remains?
- What Production risk remains?
- What should Release 6 inherit?
- What technical debt was discovered?

No separate retrospective Sprint.

============================================================
OUT OF SCOPE
============================================================

Do NOT implement:

Marketplace Analytics
AI Search
AI assistant
Teacher ranking
Recommendation engine
Browse Premium Redesign
Production PSP
Production meeting provider
F-005 schema fix
Privacy/Terms legal decisions
generic social messaging
Student groups
Teacher community chat
voice calls
video calls
message reactions
typing indicators unless already existing
message edit/delete unless already canonical
full-text message search unless already supported

Release 5 is:

ORDER COMMUNICATION

not:

BUILD SLACK.

============================================================
DOCUMENTATION
============================================================

Save prompt:

docs/prompts/
PHASE_4_RELEASE_5_ORDER_COMMUNICATION.md

Create release report:

docs/features/
PHASE_4_RELEASE_5_ORDER_COMMUNICATION.md

Evidence:

docs/features/evidence/
phase4-release5-order-communication/

At minimum:

architecture-audit.md
domain-decision.md
authorization.md
attachments.md
unread-read.md
notifications.md
realtime.md
request-order-continuity.md
system-events.md
browser-certification.md
performance.md
security.md
release-summary.md

Create retrospective:

docs/reports/
PHASE_4_RELEASE_5_ORDER_COMMUNICATION_RETROSPECTIVE.md

Update:

docs/INDEX.md
docs/PROJECT_STATUS.md

Preserve historical reports.

Do not silently rewrite old conclusions.

============================================================
RELEASE 5 EXIT RULE
============================================================

Return:

RELEASE 5 — ORDER COMMUNICATION VERIFIED

ONLY IF ALL are true:

1. Existing messaging architecture was traced before implementation.
2. No duplicate messaging domain was created.
3. Canonical Order↔conversation relationship is defined.
4. Duplicate Order threads are prevented according to the chosen invariant.
5. Student can open correct conversation from Order.
6. Teacher can open correct conversation from Order.
7. Correct Order/Service context is visible.
8. Text messaging works both directions.
9. Messages persist correctly.
10. Message ordering is deterministic.
11. Message pagination is bounded.
12. Order participant authorization passes.
13. Unrelated Student denial passes.
14. Unrelated Teacher denial passes.
15. Suspended-user behavior is correct.
16. Message attachments work using canonical infrastructure.
17. Attachment authorization passes.
18. Unsupported file validation passes.
19. Unread counts are persisted/truthful.
20. Mark-read behavior is correct.
21. Student unread UX works.
22. Teacher unread UX works.
23. Message notifications work.
24. Notification deep links open correct conversation.
25. Real-time behavior matches current SignalR contract.
26. No duplicate real-time messages occur.
27. System lifecycle events derive from persisted truth.
28. Users cannot spoof system messages.
29. Request attachments are recoverable from completed Order context.
30. Delivery context remains distinct and correct.
31. Revision context does not fabricate F-005 linkage.
32. Request→Order communication continuity is explicitly resolved.
33. Generic Messages area remains coherent.
34. AR/EN passes.
35. RTL/LTR passes.
36. Mobile composer passes.
37. Accessibility passes.
38. Release 5 Playwright E2E passes.
39. Foundation regression passes.
40. Release 4 concurrent changes were not overwritten.
41. Backend regression passes.
42. Frontend regression passes.
43. EF state is clean/explained.
44. Release build passes.
45. Publish succeeds.
46. Publish smoke succeeds.
47. Health succeeds.
48. No new Critical/High defect remains.
49. Security/privacy review passes.
50. Documentation updated.
51. Release retrospective completed.

If any critical acceptance criterion cannot be proven:

do NOT fabricate completion.

============================================================
RELEASE BUILD / PUBLISH SMOKE
============================================================

Run:

dotnet build -c Release

Then isolated:

dotnet publish src/Tafseel.Api -c Release -o <isolated-output>

Do NOT deploy.

Boot isolated output.

Verify:

/health/live
/health/ready

Student login
Teacher login

Student Dashboard
Teacher Dashboard
Messages
Order conversation
attachment access
notification deep link

Also smoke:

Landing
Browse
Teacher Profile

Static assets:

200

Cache policy:

correct

Stop isolated instance afterward.

============================================================
FINAL RESPONSE FORMAT
============================================================

Return exactly:

============================================================
PHASE 4 — MARKETPLACE SCALE
RELEASE 5 — ORDER COMMUNICATION
============================================================

## Findings

## Existing Messaging Architecture

## Domain Decision

## Order Conversation Lifecycle

## Request → Order Continuity

## Student Communication UX

## Teacher Communication UX

## Generic Messages Experience

## Message Sending

## Attachments

## Request Files in Order History

## Delivery / Revision Context

## System Lifecycle Events

## Unread / Read State

## Notifications

## Deep Linking

## Realtime / SignalR

## Authorization

## Privacy / Security

## Pagination / Performance

## Error / Empty States

## Accessibility

## Responsive UX

## Localization

## Student E2E

## Teacher E2E

## Realtime E2E

## Authorization E2E

## Completed Order History

## Browser Certification

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

## Release 5 Retrospective

## Release 6 Handoff

Then:

Messaging Architecture:
Order Context:
Request→Order Continuity:
Student Messaging:
Teacher Messaging:
Generic Inbox:
Attachments:
Request Files:
System Events:
Unread:
Notifications:
Deep Links:
Realtime:
Authorization:
Privacy:
Security:
Pagination:
Accessibility:
Responsive:
Localization:
Browser:
Foundation Regression:
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
- RELEASE 5 — ORDER COMMUNICATION PARTIALLY COMPLETED
- RELEASE 5 — ORDER COMMUNICATION BLOCKED

If and ONLY if VERIFIED write:

✅ Release 5 — Order Communication Complete

Then:

🚀 Release 6 — Discovery & Conversion Unblocked

Then exactly:

✅ Finished Phase 4 — Release 5