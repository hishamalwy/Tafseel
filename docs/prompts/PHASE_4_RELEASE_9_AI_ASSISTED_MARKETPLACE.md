============================================================
PHASE 4 â€” MARKETPLACE SCALE
RELEASE 9 â€” AI-ASSISTED MARKETPLACE

FULL RELEASE EXECUTION
============================================================

## Previous Context

Tafseel is an educational marketplace with canonical domains for:

- Students
- Teachers
- Quality Reviewers
- Admins
- Subjects
- Teacher Qualifications
- Service Catalog
- TeacherServices
- Teacher Public Eligibility
- Browse / Discovery
- Teacher Profile
- Compare
- Guided Learning Requests
- Live Session Booking
- Orders
- Payments
- Deliveries
- Revisions
- Reviews
- Favorites
- Notifications
- Order Communication
- Marketplace Intelligence

Marketplace Foundation is formally:

VERIFIED & CLOSED

Release 5 â€” Order Communication is canonically:

VERIFIED & CLOSED

Release 6 â€” Discovery & Conversion has implemented the deterministic
canonical discovery architecture but may still be running its
Final Acceptance Closure concurrently.

Release 7 â€” Marketplace Intelligence has implemented its core
intelligence architecture but may still be CONDITIONALLY VERIFIED
pending final browser/UAT closure.

Release 8 â€” Product Experience & Responsive Hardening may be executed
concurrently by another agent and owns:

- Student Dashboard simplification/redesign;
- full product responsive hardening;
- typography;
- pricing prominence;
- card visual quality;
- product-wide UX consistency.

Release 9 MUST NOT duplicate Release 8 UX work.

============================================================
CHAIN SAFETY
============================================================

You MAY implement Release 9 engineering concurrently.

However:

DO NOT declare Release 9 canonically VERIFIED & CLOSED unless the
current docs/PROJECT_STATUS.md supports the required preceding
release chain.

At minimum, before final closure, re-read:

docs/PROJECT_STATUS.md
docs/INDEX.md

and latest canonical reports for:

Release 6
Release 7
Release 8

Do not rewrite their historical verdicts.

============================================================
RELEASE 9 PRODUCT PROBLEM
============================================================

Tafseel already supports deterministic marketplace discovery.

A Student can currently use explicit:

- Subject
- Service
- filters
- Teacher cards
- Compare
- Teacher Profile
- Guided Request
- Live Booking

But many Students do not naturally think in database/filter terms.

Examples:

"I have a calculus exam next week and I don't understand integration."

"I need someone to explain this PowerPoint before Thursday."

"Ø¹Ø§ÙŠØ² Ù…Ø¯Ø±Ø³ ÙŠØ³Ø§Ø¹Ø¯Ù†ÙŠ Ø£Ø±Ø§Ø¬Ø¹ organic chemistry Ù‚Ø¨Ù„ Ø§Ù„Ø§Ù…ØªØ­Ø§Ù†"

"Ù…Ø´ Ø¹Ø§Ø±Ù Ø£Ø®ØªØ§Ø± Recorded Explanation ÙˆÙ„Ø§ Live Session"

The system should understand the Student's intent and help them use
the existing marketplace more naturally.

AI must help the Student EXPRESS and CLARIFY intent.

AI must NEVER become the source of marketplace truth.

============================================================
RELEASE 9 GOAL
============================================================

Build an AI-assisted marketplace layer that:

1. Understands natural-language Student learning intent.
2. Converts intent into strict structured Tafseel discovery criteria.
3. Uses canonical deterministic R6 discovery to retrieve real results.
4. Helps Students clarify incomplete requests.
5. Helps Students draft/improve Learning Request descriptions.
6. Provides safe product-help assistance.
7. Works in Arabic and English.
8. Never fabricates Teachers/services/prices/availability.
9. Never ranks Teachers using LLM judgment.
10. Never qualifies or moderates Teachers.
11. Never makes financial/business decisions.
12. Fails safely back to normal Tafseel discovery.
13. Keeps provider implementation replaceable.
14. Keeps secrets server-side.
15. Has explicit privacy/minimization rules.
16. Has deterministic validation around all LLM output.
17. Has measurable evaluation datasets and acceptance thresholds.
18. Preserves Release 6/7/8 concurrent work.
19. Passes backend/frontend/browser/security certification.
20. Completes its retrospective in the same Release.

============================================================
CORE AI PRINCIPLE
============================================================

The architecture MUST remain:

Student Natural Language
        â†“
AI Intent Interpretation
        â†“
STRICT STRUCTURED OUTPUT
        â†“
SERVER VALIDATION
        â†“
Canonical Subject / Service Resolution
        â†“
Canonical R6 Discovery Query
        â†“
REAL eligible Teachers / TeacherServices
        â†“
Existing deterministic sort/filter behavior
        â†“
Student

NOT:

Student
        â†“
AI
        â†“
"Teacher Ahmed is the best for you"

============================================================
AI MAY
============================================================

AI MAY:

- interpret Student language;
- identify likely learning goal;
- identify requested help type;
- identify topics mentioned;
- identify timing/deadline clues;
- identify preference clues;
- identify missing information;
- ask clarification questions;
- help draft a Learning Request;
- explain Tafseel service types;
- explain how to use Tafseel;
- map natural language onto canonical candidate filters;
- summarize Student-provided request information.

============================================================
AI MUST NOT
============================================================

AI MUST NOT:

- decide Teacher eligibility;
- approve qualifications;
- rank Teachers;
- calculate Best Match;
- label Teacher as Top/Best/Popular;
- invent popularity;
- infer unsupported Teacher quality;
- generate public metrics;
- moderate Teacher applications;
- moderate Teacher media;
- approve/reject Quality tasks;
- set Teacher price;
- negotiate price automatically;
- alter Service Catalog;
- alter TeacherService terms;
- decide refunds;
- confirm payments;
- approve deliveries;
- decide disputes;
- assign ratings;
- submit Reviews automatically;
- make booking availability facts;
- fabricate availability;
- fabricate Subjects/Services;
- create financial transactions;
- make Admin decisions.

============================================================
F-002 REMAINS BINDING
============================================================

AI must not reintroduce unsupported marketplace claims such as:

- Completed Orders
- Completion Rate
- Response Time
- Fast Responder
- Experience Score
- Popularity
- Success Rate
- Students Taught
- Trending
- Recommended Teacher
- Top Rated
- Best Teacher

unless a separately governed canonical fact explicitly supports it.

Internal Release 7 intelligence does NOT grant permission to expose
internal Teacher performance metrics publicly.

============================================================
NO LLM TEACHER RANKING
============================================================

Critical rule:

An LLM may determine:

"Student appears to want Calculus + Live Learning"

It may NOT determine:

"Teacher A is better than Teacher B."

After structured interpretation, use canonical R6 query/filter/sort.

If multiple Teachers are returned:

present them using existing deterministic marketplace behavior.

Do NOT send Teacher candidates to the LLM and ask it to choose a winner.

============================================================
PROVIDER TARGET
============================================================

Initial provider target:

Groq

using its OpenAI-compatible API.

Preferred initial production-capable model family should be
configuration-driven, not hardcoded into business logic.

Candidate current model:

openai/gpt-oss-120b

Potential lower-cost/faster model:

openai/gpt-oss-20b

BUT:

At implementation time, verify current model availability,
capabilities, deprecations, permissions and Structured Output support
against official Groq documentation.

Do not trust this prompt as a permanent model registry.

============================================================
.NET INTEGRATION STRATEGY
============================================================

Investigate the official current OpenAI .NET SDK first.

Preferred dependency:

OpenAI

only if current SDK + Groq custom endpoint works correctly for the
required Tafseel operations.

Do NOT blindly paste an old sample.

Prove with a focused Development integration test:

- custom endpoint;
- Groq API key;
- configured model;
- simple completion;
- strict structured output if supported through that SDK path;
- timeout/cancellation;
- 401 handling;
- 403/model permission handling;
- 429 handling.

If an SDK incompatibility exists for a required Groq feature:

document exact incompatibility.

Then use the smallest appropriate adapter/HTTP path rather than
warping business architecture around SDK limitations.

============================================================
BASE PROVIDER ARCHITECTURE
============================================================

Do NOT instantiate provider clients throughout Controllers.

Create/reuse a small abstraction such as:

IAiProvider

or a more repository-consistent name.

Potential responsibilities:

InterpretIntentAsync
ClarifyIntentAsync
AssistRequestAsync
AnswerProductHelpAsync

Do not expose Groq-specific DTOs above Infrastructure.

Preferred layering:

Application
    â†“ interface
Infrastructure
    â†“
Groq/OpenAI-compatible implementation

============================================================
NO GIANT GENERIC AI FRAMEWORK
============================================================

Do not build:

GenericAgentKernel
PromptOrchestratorPlatform
AIWorkflowEngine
MultiAgentRuntime

for four bounded features.

Keep it narrow.

============================================================
CONFIGURATION
============================================================

Use typed configuration.

Potential concept:

AiOptions

with:

Enabled
Provider
Endpoint
Model
TimeoutSeconds
MaxInputCharacters
MaxOutputTokens
ReasoningEffort if supported/needed

Do not blindly add options with no use.

Secrets MUST NOT be in normal committed configuration.

API key:

GROQ_API_KEY

or repository-consistent secret binding.

============================================================
SECRET SAFETY
============================================================

Absolutely no Groq API key in:

- source code;
- appsettings committed values;
- JS;
- HTML;
- URLs;
- localStorage;
- browser network calls;
- documentation;
- screenshots;
- Playwright traces;
- Git history.

All LLM calls are server-side.

Browser MUST NOT call Groq directly.

============================================================
PROVIDER FAIL-CLOSED / FAIL-SAFE DISTINCTION
============================================================

Provider selection must be explicit.

Unknown configured provider:

fail configuration/startup appropriately.

But runtime Groq outage must NOT make Tafseel marketplace unusable.

Example:

AI intent interpretation unavailable
â†’ normal Browse/filter experience remains available.

AI request assistant unavailable
â†’ normal Guided Request remains usable.

AI help unavailable
â†’ product pages still work.

============================================================
WORKSTREAM A
NATURAL-LANGUAGE DISCOVERY
============================================================

Build a Student-facing natural-language discovery entry.

Example:

"What do you need help with?"

Student can enter:

"Ø¹Ù†Ø¯ÙŠ Ø§Ù…ØªØ­Ø§Ù† calculus Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ Ø§Ù„Ø¬Ø§ÙŠ ÙˆÙ…Ø­ØªØ§Ø¬ Ø­Ø¯ ÙŠØ´Ø±Ø­Ù„ÙŠ integration live"

AI should return STRUCTURED INTENT only.

============================================================
INTENT CONTRACT
============================================================

Design the smallest strict contract.

Example concept:

AiDiscoveryIntent

Fields may include:

IntentType
SubjectText
ServiceIntent
TopicKeywords
PreferredLanguage
TimingText
PricePreference
NeedsClarification
ClarificationQuestions

BUT inspect actual R6 discovery contract before finalizing.

Do NOT create fields R6 cannot use.

============================================================
CANONICAL RESOLUTION
============================================================

AI-produced:

SubjectText = "calculus"

is NOT a SubjectId.

Server must resolve against canonical Subjects.

AI-produced:

ServiceIntent = "live"

is NOT automatically a ServiceCatalogItemId.

Server must resolve against canonical Service Catalog.

If resolution is ambiguous:

clarify or present deterministic choices.

Do not invent IDs.

============================================================
STRICT STRUCTURED OUTPUT
============================================================

Use JSON Schema Structured Outputs where the selected provider/model
supports a sufficiently strict mode.

The goal is:

LLM output
â†’ schema-constrained DTO
â†’ deterministic validation

not:

LLM free prose
â†’ regex parser.

All structured output must still undergo application validation.

============================================================
SCHEMA RULES
============================================================

Schema should:

- have explicit enums where possible;
- bound arrays;
- bound strings;
- reject unknown properties;
- avoid arbitrary metadata dictionaries;
- distinguish unknown from absent;
- not include Teacher IDs suggested by model;
- not include price facts not supplied by Student/canonical system.

============================================================
NO STREAMING FOR STRUCTURED INTENT IF UNSUPPORTED
============================================================

If strict structured output and streaming cannot be combined in the
current provider capability:

prefer correctness for intent interpretation.

Do NOT downgrade to freeform streaming just for animation.

UI can show a bounded loading state.

============================================================
DISCOVERY INTENT TYPES
============================================================

Inspect product needs.

Potential intent types:

find_teacher
understand_service
start_request
book_live_session
needs_clarification

Do not over-model dozens of intents.

============================================================
CLARIFICATION
============================================================

Example incomplete input:

"Ø¹Ø§ÙŠØ² Ø­Ø¯ ÙŠØ³Ø§Ø¹Ø¯Ù†ÙŠ ÙÙŠ Ø§Ù„Ù…Ø´Ø±ÙˆØ¹"

AI may identify:

Subject missing
Help type ambiguous

Then ask:

- What Subject is the project for?
- Do you want live guidance or an asynchronous explanation/review?

Do NOT guess.

============================================================
CLARIFICATION LIMIT
============================================================

Do not turn discovery into endless chat.

Keep clarification bounded.

Prefer:

maximum 1â€“2 clarification rounds

unless evidence shows another design is needed.

Student can always switch to normal filters.

============================================================
AI â†’ R6 QUERY HANDOFF
============================================================

After validated/resolved intent:

build the SAME canonical discovery query used by R6.

Do not create:

/ai/teachers/search

that bypasses normal eligibility.

Preferred:

AI endpoint returns resolved filter proposal

then canonical MarketplaceService/Search executes it.

Or the backend composes the existing query service internally.

============================================================
PUBLIC ELIGIBILITY
============================================================

AI discovery must NEVER make hidden/ineligible Teachers visible.

Eligibility happens in canonical query before results.

Exact-name prompt must not bypass it.

============================================================
SERVICE INTERSECTION
============================================================

Subject + Service must preserve R6 truth:

active
non-superseded
enabled TeacherService

+
approved non-revoked qualification
for same Subject

+
public Catalog service.

============================================================
AI RESULT EXPLANATION
============================================================

Avoid:

"We recommend Teacher X."

Safe language:

"These teachers match the filters from your request."

or localized equivalent.

If explaining why a card appears:

use deterministic facts only:

- teaches Subject X;
- offers Service Y;
- within selected price;
- has current bookable availability.

Do not use AI-generated subjective reasoning.

============================================================
AI RESULT ORDER
============================================================

Use existing supported deterministic sort.

Do not let LLM reorder results.

============================================================
ZERO RESULT
============================================================

If canonical query returns zero:

reuse R6 deterministic zero-result recovery.

AI MAY explain selected constraints in natural language.

AI MUST NOT silently remove constraints.

Student must choose relaxation.

============================================================
WORKSTREAM B
AI REQUEST ASSISTANT
============================================================

Guided Request already exists.

DO NOT create a second Request flow.

Add optional AI assistance inside/alongside existing Guided Request.

============================================================
REQUEST ASSISTANT GOAL
============================================================

Help Student turn messy notes into a clearer request.

Example input:

"chapter 4 Ù…Ø´ ÙØ§Ù‡Ù… Ù…Ù†Ù‡ Ø­Ø§Ø¬Ù‡ ÙˆØ¹Ù†Ø¯ÙŠ Ø§Ù…ØªØ­Ø§Ù† ÙŠÙˆÙ… Ø§Ù„Ø®Ù…ÙŠØ³
ÙˆØ®ØµÙˆØµØ§ integration by parts"

Possible output:

- Goal
- Difficult topics
- Desired outcome
- Deadline mentioned
- Suggested clear description

The Student remains in control.

============================================================
NO AUTO SUBMISSION
============================================================

AI must NEVER automatically:

- submit LearningRequest;
- upload files;
- choose Teacher;
- choose Service;
- change price/budget;
- accept terms;
- make payment.

Student must review and submit.

============================================================
PRESERVE STUDENT FACTS
============================================================

AI must not add facts Student did not provide.

For example:

Student says exam Thursday.

AI may preserve Thursday.

AI may NOT invent:

"Exam is at 9 AM."

Student says "chapter 4".

AI may not invent book/course contents.

============================================================
DRAFT ASSISTANT CONTRACT
======…7546 tokens truncated…nal metrics:

feature
provider
model
success/error category
latency
structured-output validation failure
provider status
token usage if safely available

No raw Student text by default.

============================================================
ADMIN AI CONFIG
============================================================

Do NOT build an Admin UI for API keys.

Secrets remain deployment configuration.

If an Admin feature flag already exists:

AI enablement may use current configuration patterns.

No secret editing via browser.

============================================================
PRODUCT DECISION: AI BETA LABEL
============================================================

Audit current product language.

If feature is early/UAT:

consider an "AI-assisted" / Beta label.

Do not imply guaranteed accuracy.

Do not add alarming disclaimers everywhere.

============================================================
SECURITY THREAT MODEL
============================================================

Document threats:

prompt injection
system prompt extraction
secret leakage
generic proxy abuse
hidden Teacher exposure
PII leakage
cost abuse
oversized prompts
provider outage
structured-output manipulation
XSS via model output.

============================================================
MODEL OUTPUT XSS
============================================================

Treat model text as untrusted.

Render as text/escaped content.

Do not inject raw model HTML.

No unsafe Markdown renderer unless already secured.

============================================================
NO TOOL EXECUTION
============================================================

Release 9 AI should not be given arbitrary tools such as:

database mutation
payment API
email sending
filesystem
web search
Admin actions

without a separate approved architecture.

Intent interpretation does not need autonomous agency.

============================================================
NO GROQ BUILT-IN WEB/CODE TOOLS
============================================================

Even if current provider/model supports tools/web/code:

do not enable them for Release 9 unless a specific approved product
requirement exists.

Tafseel marketplace truth comes from Tafseel backend.

============================================================
SDK COMPATIBILITY GATE
============================================================

Before full implementation document:

- NuGet package/version actually used;
- custom endpoint configuration;
- chat vs responses API choice;
- Structured Output path;
- strict JSON schema behavior;
- cancellation;
- provider error mapping;
- DI registration;
- HttpClient/resilience behavior.

Do not say "OpenAI compatible, therefore everything works."

Prove each required capability.

============================================================
CHAT VS RESPONSES API
============================================================

Evaluate the smallest stable API path.

Do not use Responses API merely because it is newer.

For Release 9 structured intent extraction, Chat Completions may be
sufficient.

Choose based on:

current Groq support
current .NET SDK compatibility
Structured Output reliability
streaming needs
testability.

Document ADR/decision.

============================================================
STREAMING
============================================================

Streaming is optional.

Natural-language product help may benefit from it.

Intent extraction does not require streaming.

Do not make streaming an acceptance blocker unless implemented.

============================================================
TEST ARCHITECTURE
============================================================

Unit:

schema validation
canonical resolution
prompt construction boundaries
provider error mapping
fallback logic
privacy filtering

Integration:

AI endpoint auth
rate limits
canonical discovery handoff
eligibility
unknown Subject
ambiguous Subject
provider fake
provider failures
request assistant
no auto-submit
security boundaries

Real-provider smoke:

separate and clearly labeled.

============================================================
AI PROVIDER CONTRACT TESTS
============================================================

Create provider contract tests proving:

valid structured output
invalid response handling
timeout
429
401
403 model permission
5xx
cancellation

Do not weaken tests around vendor behavior.

============================================================
CANONICAL DISCOVERY TEST
============================================================

Prove:

AI outputs candidate Subject/service

but canonical result set equals the normal R6 query using same resolved
filters.

This is one of the most important R9 tests.

============================================================
HIDDEN TEACHER TEST
============================================================

Have:

Teacher A eligible
Teacher B hidden/ineligible

Prompt explicitly asks for Teacher B.

Expected:

Teacher B remains absent.

============================================================
PENDING QUALIFICATION TEST
============================================================

Teacher approved Subject A
pending Subject B.

AI asks for Subject B.

Teacher must not appear under B.

R6 eligibility remains authority.

============================================================
PRICE TEST
============================================================

Student asks:

"under 150 SAR"

AI may extract price preference.

Canonical R6 query applies contextual price.

AI does not inspect/alter unrelated service prices.

============================================================
AVAILABILITY TEST
============================================================

Student asks:

"I need live today"

AI may extract live/timing intent.

Actual bookable availability remains scheduler truth.

Do not say Teacher available until canonical availability confirms it.

============================================================
NO RESULT RELAXATION TEST
============================================================

Student requests:

Subject X
Live
Max 100 SAR

0 results.

System may propose:

"Remove price limit"
"Show other services"

but must NOT automatically remove 100 SAR.

============================================================
REQUEST FACT PRESERVATION TEST
============================================================

Input:

"My exam is Thursday."

Output must not become:

"My exam is Thursday at 9 AM."

Use evaluation assertion against unsupported added facts.

============================================================
HELP POLICY TEST
============================================================

Ask a policy not documented in canonical help context.

Expected:

safe unavailable answer

not model improvisation.

============================================================
FULL BACKEND REGRESSION
============================================================

Run current canonical:

Architecture
Domain
Application
Integration

Use CURRENT counts.

Do not hardcode old 226 count.

Require:

0 failures
0 skips
0 source exclusions.

============================================================
FRONTEND GATES
============================================================

Run all current canonical gates, including:

frontend integrity
localization
usage
BUG-001/display names
template/resource leak
auth
guided request
notifications
mobile CTA
Release 5
Release 6
Release 7
Release 8 if present
Release 9 integrity
browser harness self-test
git diff --check

============================================================
DATABASE / EF
============================================================

Expected:

no AI schema migration.

Run:

has-pending-model-changes

If model changes exist:

justify them.

Do not accidentally modify R7 migration.

============================================================
RELEASE BUILD
============================================================

Run:

dotnet build -c Release

Required:

0 errors.

No new warnings.

============================================================
PUBLISH SMOKE
============================================================

Isolated publish only.

NO deploy.

Verify:

/health/live = 200
/health/ready = 200

Public:

Landing
Browse
Teacher Profile

Student:

login
AI discovery entry
normal Browse fallback
Guided Request

If GROQ_API_KEY available in isolated Development smoke:

perform one safe provider call.

If key intentionally unavailable:

prove AI unavailable state does not break product.

Static assets 200.

Correct cache headers.

Stop process.

============================================================
NO COMMIT / PUSH / DEPLOY
============================================================

Do not:

commit
push
deploy

unless explicitly requested later.

============================================================
DOCUMENTATION
============================================================

Save prompt:

docs/prompts/
PHASE_4_RELEASE_9_AI_ASSISTED_MARKETPLACE.md

Create:

docs/features/
PHASE_4_RELEASE_9_AI_ASSISTED_MARKETPLACE.md

Create architecture decision:

docs/decisions/
ADR-XXX-AI-PROVIDER-AND-BOUNDARIES.md

Determine actual next ADR number from repository.
Do not assume XXX.

Create evidence:

docs/features/evidence/
phase4-release9-ai-assisted-marketplace/

Required evidence:

current-state-audit.md
provider-capability-verification.md
sdk-compatibility.md
architecture-decision.md
ai-boundaries.md
privacy-model.md
threat-model.md
structured-intent-schema.md
canonical-resolution.md
prompt-design.md
discovery-evaluation-dataset.json
discovery-evaluation-results.md
request-assistant-evaluation.json
request-assistant-results.md
product-help-evaluation.json
product-help-results.md
prompt-injection-evaluation.md
provider-contract-tests.md
real-provider-smoke.md
canonical-discovery-equivalence.md
failure-fallback.md
rate-limit-cost-evidence.md
browser-certification.md
security-certification.md
release-regression.md
publish-smoke.md
final-summary.md

Create retrospective:

docs/reports/
PHASE_4_RELEASE_9_AI_ASSISTED_MARKETPLACE_RETROSPECTIVE.md

Update:

docs/INDEX.md
docs/PROJECT_STATUS.md

Preserve all prior historical verdicts.

============================================================
OUT OF SCOPE
============================================================

Do NOT implement:

- AI Teacher ranking
- Best Match score
- Recommendation score
- popularity score
- Teacher leaderboard
- AI qualification decisions
- AI Quality moderation
- AI Review moderation
- AI pricing decisions
- AI refund/payment decisions
- AI dispute decisions
- autonomous marketplace agent
- arbitrary tool execution
- web search for marketplace truth
- code execution
- AI memory platform
- vector database unless separately proven necessary
- file-content AI analysis by default
- public R7 intelligence metrics
- product-wide responsive redesign
- Student Dashboard redesign
- real PSP
- Production live provider
- SignalR scale-out
- malware scanning
- F-005
- production legal/privacy policy invention.

============================================================
RELEASE 9 EXIT RULE
============================================================

Return:

RELEASE 9 â€” AI-ASSISTED MARKETPLACE VERIFIED

ONLY IF ALL are true:

1. Current R6/R7/R8 worktree was reconciled.
2. No concurrent release work was overwritten.
3. AI provider architecture is isolated behind an application interface.
4. Browser never receives provider API key.
5. API key is absent from repo/docs/traces.
6. Current provider capabilities were verified against official docs.
7. Actual .NET SDK compatibility was proven.
8. Provider/model configuration is typed.
9. Model is configuration-driven.
10. Unknown provider/config fails safely.
11. Groq outage does not break normal Browse.
12. Groq outage does not break Guided Request.
13. AI discovery uses strict structured output where supported.
14. Structured output is application-validated.
15. AI cannot produce trusted Teacher IDs.
16. Subject resolution uses canonical Subjects.
17. Service resolution uses canonical Service Catalog.
18. Ambiguous resolution asks for clarification.
19. Unknown Subject does not create data.
20. Canonical R6 discovery is used after AI interpretation.
21. Public eligibility remains canonical.
22. Hidden Teacher cannot be exposed via prompt.
23. Pending qualification cannot be bypassed.
24. Disabled TeacherService cannot be bypassed.
25. AI does not reorder Teachers subjectively.
26. No Best/Top/Recommended ranking exists.
27. Contextual price remains canonical.
28. Availability remains scheduler truth.
29. AI does not silently relax zero-result filters.
30. Normal deterministic Browse remains available.
31. Arabic natural-language discovery passes.
32. English natural-language discovery passes.
33. Mixed Arabic/English passes.
34. Clarification flow passes.
35. Clarification is bounded.
36. Request assistant uses canonical Guided Request.
37. AI cannot submit Request automatically.
38. Student can edit/discard AI draft.
39. Student facts are preserved.
40. Unsupported facts are not invented.
41. Product Help uses approved Tafseel context.
42. Unsupported policy question does not hallucinate policy.
43. No raw search/query or unnecessary PII is persisted.
44. No private Teacher/Admin/Quality data is sent unnecessarily.
45. Provider-bound data model is documented.
46. Raw prompt/response is not logged by default.
47. Model output is escaped against XSS.
48. Prompt injection tests pass.
49. Generic model proxy endpoint does not exist.
50. AI endpoints have bounded input.
51. AI endpoints have application-side rate limits.
52. Provider 429 is handled safely.
53. Provider timeout is handled safely.
54. Provider 401 is classified safely.
55. Provider 403/model permission failure is classified safely.
56. Provider 5xx is handled safely.
57. Cancellation works.
58. No retry storm exists.
59. Token/context usage is bounded.
60. AI does not receive full marketplace datasets.
61. Discovery evaluation dataset has at least 50 meaningful cases.
62. Discovery acceptance threshold was defined before final scoring.
63. Accepted discovery evaluation meets threshold.
64. Forbidden business hallucinations = 0 in accepted evaluation.
65. Request-assistant dataset has at least 20 cases.
66. Request-assistant evaluation passes.
67. Product-help dataset has at least 20 cases.
68. Product-help evaluation passes.
69. Prompt-injection/adversarial set passes.
70. Provider contract tests pass.
71. Real provider smoke passes if key is available.
72. If key is unavailable, verdict explicitly reflects missing live-provider proof.
73. AI â†’ canonical discovery equivalence test passes.
74. Zero-result AI E2E passes.
75. Request-assistant E2E passes.
76. Product-help E2E passes.
77. Failure/fallback E2E passes.
78. AI UI accessibility passes.
79. AR/RTL AI UI passes.
80. EN/LTR AI UI passes.
81. AI responsive surfaces pass at targeted viewports.
82. Accepted browser run has 0 unexpected Tafseel 429.
83. Accepted browser run has 0 unexpected 500.
84. 0 actionable console.error.
85. 0 pageerror.
86. 0 failed first-party resources.
87. R6 integrity remains intact.
88. R7 integrity remains intact where available.
89. R8 concurrent changes are preserved.
90. R5 messaging remains intact.
91. Foundation trust/F-002 remains intact.
92. Architecture tests pass.
93. Domain tests pass.
94. Application tests pass.
95. Integration tests pass with 0 failures.
96. Frontend gates pass.
97. EF state is clean or migration rigorously justified.
98. Release build passes.
99. Publish succeeds.
100. Publish smoke passes.
101. Health passes.
102. No Critical/High Release 9 defect remains.
103. Documentation/evidence is complete.
104. Retrospective is complete.
105. Required preceding release chain permits canonical closure.

NO EXCEPTIONS.

If engineering is complete but R6/R7/R8 canonical prerequisites remain open:

DO NOT lie.

Use:

RELEASE 9 â€” AI-ASSISTED MARKETPLACE CONDITIONALLY VERIFIED

with the exact chain dependency documented.

Do not create Release 9 Sprint 2 automatically.

============================================================
FINAL RESPONSE FORMAT
============================================================

Return exactly:

============================================================
PHASE 4 â€” MARKETPLACE SCALE
RELEASE 9 â€” AI-ASSISTED MARKETPLACE
============================================================

## Findings

## Current AI / Provider Audit

## Provider Capability Verification

## .NET SDK Compatibility

## Architecture Decision

## Provider Abstraction

## Configuration / Secrets

## AI Safety Boundaries

## Structured Intent Contract

## Canonical Subject Resolution

## Canonical Service Resolution

## Natural-Language Discovery

## Clarification

## Canonical Discovery Handoff

## Eligibility / Ranking Safety

## Zero-Result Behavior

## AI Request Assistant

## Product Help Assistant

## Arabic / English

## Privacy

## Prompt Injection / Security

## Provider Failure Handling

## Rate Limits

## Cost / Token Controls

## Observability

## Discovery Evaluation

## Request Assistant Evaluation

## Product Help Evaluation

## Adversarial Evaluation

## Real Provider UAT

## AI Discovery E2E

## Clarification E2E

## Zero-Result AI E2E

## Request Assistant E2E

## Product Help E2E

## Failure / Fallback E2E

## Accessibility

## Responsive AI UX

## Release 8 Collision Check

## Release 7 Collision Check

## Release 6 Retention

## Release 5 / Foundation Retention

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

## Release 9 Retrospective

## Production Readiness Handoff

Then:

Provider:
Model:
SDK:
Structured Output:
Secrets:
Intent Interpretation:
Subject Resolution:
Service Resolution:
Canonical Discovery:
Eligibility:
Ranking Safety:
Clarification:
Zero Results:
Request Assistant:
Product Help:
Arabic:
English:
Privacy:
Prompt Injection:
Provider 429:
Provider Timeout:
Fallback:
Cost Controls:
Discovery Evaluation:
Forbidden Hallucinations:
Request Evaluation:
Help Evaluation:
Real Provider:
Browser:
Accessibility:
Responsive:
Release 8:
Release 7:
Release 6:
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

Final Verdict â€” choose exactly one:

- RELEASE 9 â€” AI-ASSISTED MARKETPLACE VERIFIED
- RELEASE 9 â€” AI-ASSISTED MARKETPLACE CONDITIONALLY VERIFIED
- RELEASE 9 â€” AI-ASSISTED MARKETPLACE PARTIALLY COMPLETED
- RELEASE 9 â€” AI-ASSISTED MARKETPLACE BLOCKED

If and ONLY if VERIFIED write exactly:

âœ… Release 9 â€” AI-Assisted Marketplace Verified & Closed

Then:

ðŸš€ Phase 5 â€” Production Readiness Unblocked

Then exactly:

âœ… Finished Phase 4 â€” Release 9
