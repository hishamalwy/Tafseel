# LANDING-CRAFT-2026-10-05 — Landing discovery and interface corrections

| Field | Value |
| --- | --- |
| ID | LANDING-CRAFT-2026-10-05 |
| Release | V1 |
| Priority | P1 |
| Blocker | yes: misleading payment copy and uncontrolled motion |
| Size | M |
| Owner | Codex, at the user's request |
| Status | In Progress — implementation complete; Gate 5 environment validation pending |
| Gates | ☑ 1 Business ☑ 2 UX ☑ 3 Contract ☑ 4 Build ☐ 5 E2E/Release |

## Actor
Visitor, Student, Teacher and staff visiting the public Landing.

## Problem
The Landing audit of 2026-10-05 records L01–L10: payment wording omits automatic completion; hero motion lacks a stop mechanism; empty search rejects browsing; short desktop hides the explanation; mobile English words join; service fallback disregards an empty active catalogue; optional reads delay discovery; recruitment differs by entry point; clipboard failure reports success; Escape does not close mobile navigation.

## User goal
As a visitor, I want to understand a personalized explanation and find a suitable teacher or share my question, with truthful information and predictable controls.

## Business rule
Product Contract §3.1: “A platform-defined kind of work, owned by Admin.” Respect the published active service catalogue. §3.8 order lifecycle: “If the student does nothing, the order auto-completes” after the stated review/dispute windows, unless a dispute is open. The domain and existing authorization remain authoritative. No business rule changes.

## Business states
Public content: loading → ready / empty / unavailable. Search: blank → browse; query → filtered discovery. Clipboard: idle → copying → copied / manual copy. Navigation: closed → open → closed. Server orders, payments and campaign redemption do not change.

## Preconditions
Existing Angular app, brand assets, public GET contracts and session initializer. No production credentials or account creation needed for this correction.

## Happy path
1. Read the stable headline and supporting copy beside the original Kingdom map; platform counts remain beneath the hero actions.
2. Browse all teachers with an empty search, or submit a query for matching teachers.
3. Alternatively open the existing file/request path.
4. Read available teacher/subject data without waiting for platform statistics.
5. Follow role-appropriate actions. Read accurate payment-review terms before proceeding.

## Negative cases
Failed reads display retry; successful empty lists remain empty. Slow statistics do not block teachers. Clipboard refusal keeps a selectable code and honest manual-copy feedback. Reduced motion has a readable static variant. Escape closes navigation and restores focus. Stale responses after retry/unmount cannot reopen a promotion or replace the newer page state.

## Authorization
Public GETs remain anonymous. Teacher/staff actions use existing routes and guards. Recruitment is for guests; signed-in users retain their existing account roles. No new server path, participant access, secret, or permission.

## UX
- Entry point: `/`, public header, discovery search, final CTA and footer.
- Hierarchy: need → discovery with the original Kingdom map and platform counts → how it works → real catalogue/evidence → review protection → appropriate action.
- Primary CTA: “اعرض المعلمين / Find teachers”; Teacher “استعرض الفرص / View opportunities”; staff “افتح لوحة التحكم / Open dashboard”.
- Wording: final bilingual content in landing.copy.ts and both locale files; payment copy states review, revision/dispute, and automatic completion.
- Mobile: stacked readable hero, visible actions at 390px, no hidden product explanation; logical RTL properties; the original map follows the hero actions and counts.
- States: per-section loading, unavailable with retry, empty and ready. Recruitment hidden for authenticated roles.
- Confirmations: None; this change adds no money-moving or destructive action.
- Gate question: yes; the user explicitly requested restoring the original map and counts; all actions retain product language.

## API contracts
| UI action | Endpoint | Verb | Request | Headers / concurrency | Response | Resulting server state |
| --- | --- | --- | --- | --- | --- | --- |
| Featured subjects | /api/v1/subjects/featured | GET | existing take | existing | current subject DTOs | None |
| Featured teachers | /api/v1/teachers | GET | existing pageSize | existing | current teacher DTOs | None |
| Service formats | /api/v1/services | GET | None | existing | current active catalogue DTOs | None |
| Campaigns | /api/v1/promotions | GET | None | existing | current promotion DTOs | None |
| Community | /api/v1/platform/stats | GET | None | existing | current nullable counts | None |
| Browse/search | existing /teachers route | navigation | q only when provided | None | existing discovery screen | None |

Errors: existing HTTP error handling; no new domain code or response shape.

## Analytics / observability
None. No new analytics or rankings.

## Acceptance criteria
- [x] L01: AR/EN payment note and final escrow step match automatic completion.
- [x] L05: stable hero text and readable word boundaries.
- [x] User correction: original Kingdom map restored beside the hero; students, teachers and completed-session counts restored beneath actions, including pending state. The equation replacement and secondary community section were removed. Original map interaction and reduced-motion behavior restored.
- [ ] L02 continuous map motion: original behavior retained at the user's request; do not claim the former static-map fix remains implemented.
- [x] L03/L04: blank/query search routes correctly and supporting copy remains visible on short desktop.
- [x] L06/L07: active catalogue states stay distinct; independent reads publish as they settle. Optional statistics/campaigns are deferred to the browser so SSR does not wait for them.
- [x] L08: guest recruitment is consistent; final CTA, product story and footer respect roles.
- [x] L09/L10: truthful clipboard result and Escape with focus restoration.
- [x] Arabic/English, light/dark and Arabic 390px reviewed; required project checks recorded.

## Tests
| Level | Test | Proves |
| --- | --- | --- |
| Unit/component | landing content, landing page, promo wizard, public header/footer tests | partial response, errors/empty, role routing, copy refusal, dismissal |
| Integration/authorization | existing suites; no new server paths | backend authorization regression |
| Contract gate | node scripts/ci/check-api-contract.mjs --strict | existing shapes and paths preserved |
| Browser | local CUA review with labeled disposable public-read fixtures | discovery, retry, slow/empty state and Arabic phone layout |

## Out of scope
About as a creative reference, other page redesigns, backend business logic, finance/ledger/migrations, deployment, commits/pushes, new frameworks or paid-media assets.

## Dependencies
Existing PRODUCT.md, DESIGN.md, Product Contract, shared public layouts and custom token system. Superdesign context from the audit supports the current identity; no remote draft required to correct the agreed source implementation.

## Evidence
Implementation evidence, 2026-10-05:

- User-requested restoration verified at 1280×720 and 390×844: one map within the hero, three count labels beneath actions, no horizontal overflow. Three focused landing component tests passed, including API values and pending counts. Production build, locale/style and accessibility guards passed.

- Angular unit/component tests: 86 files, 651 tests passed. Added delivery/deadline, browser/server optional reads, role/search/catalogue tests; extended clipboard and header-dismissal checks.
- `dotnet build Tafseel.sln -c Release`: passed, including Angular production build. Final `npm run build`: passed; 14 prerendered routes. Landing CSS warning after restoration: 51.88 kB against a 50 kB warning budget, below the 60 kB error budget.
- `dotnet format Tafseel.sln --verify-no-changes`: passed.
- Strict API contract: 301 client shapes, 301 matching routes, zero violations.
- Dependency gate: zero vulnerabilities reported.
- `dotnet test Tafseel.sln -c Release --no-build`: Domain 154, Application 14, Architecture 1 passed. Integration reported 132 passed and 186 failed before abort. SQL LocalDB repeatedly failed to create its automatic instance (`0x89c50118`); the owned integration test host was stopped after repeated environment failures. This is not an all-green backend test result.
- CUA browser checks: AR/EN, light/dark; 1280×720, 390×844 and English 320×740, plus default desktop. No horizontal overflow at phone widths; supporting copy visible on short desktop. The earlier static-map result is superseded by the user-requested original hero map restoration.
- Browser search: blank → `/teachers/`; trimmed `algebra` → `/teachers/?q=algebra`. Fixture error → Retry → four returned service rows; empty → zero rows with explicit empty state.
- With a six-second fixture statistics delay, teachers and services were ready in approximately 797 ms while community counts were still pending. This is a local diagnostic, not a production latency claim.
- Disposable GET fixtures were stopped before handoff; the preview shows the real local backend availability state. No invented profiles or counts are installed in product code.
- Existing dirty work was retained. No backend rules, commits, pushes or deployment changed. Canonical CSS was edited; derived styles were regenerated by the existing script.

Gate 5 remains open: no fresh-database published-build business journey was verified. Local fixtures do not meet that release condition.

User-facing evidence: `C:/Users/asus/Documents/Codex/2026-10-05/new-chat/outputs/tafseel-landing-completion-2026-10-05.md`, `tafseel-landing-desktop-ar.jpg` and `tafseel-landing-mobile-ar.jpg` in the same output directory.
