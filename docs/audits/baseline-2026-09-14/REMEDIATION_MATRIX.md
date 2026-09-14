# Remediation matrix — 2026-09-14

Maps each user journey to its Angular surface, the API endpoint behind it, what the
[baseline](./README.md) found, the fix, and the test that proves the fix. Every status
comes from the endpoint table read off the running host, the contract match, the runtime
probe, a backend test result, or a cited source line.

**Backend rule.** No row changes financial or domain logic. The fixes live in the Angular
client, configuration, tests, `Program.cs` host routing, and the `AppRoutes` link constants.
Rows that touch server code are marked **server**. None touches `Tafseel.Domain` or
`FinancialService`.

## Legend

| Status | Meaning |
|---|---|
| **WORKS** | Angular calls a route and body the server accepts; the backend behaviour has a passing test |
| **BROKEN** | Angular calls a route, verb, or body the server rejects, or the failure was observed at runtime |
| **NO UI** | The endpoint exists and is tested, but no Angular surface calls it |
| **DEAD LINK** | A URL the server hands to users has no working destination |
| **PARTIAL** | Read works; the action the journey needs does not |
| **RED GATE** | A build, CI, or test gate fails for a reason that is not a product defect |
| **EXTERNAL** | Needs a real third-party provider |

**Priority.** P0 protects the work and gets CI green. P1 unblocks a money or supply journey.
P2 completes a journey step. P3 is cleanup.

**Test column.** *Existing* is the backend test that already covers the server side, with its
working-tree result. *Add* is the test that fails today and passes after the fix:

- **CT** — client/server contract test: fails the build when an Angular `/api/v1` literal or request body does not match the endpoint table (built from `scripts/baseline/match-contract.mjs` and `EndpointInventoryProbe.cs`)
- **NG** — Angular Vitest spec
- **IT** — .NET integration test
- **E2E** — browser test against the Angular route
- **PROBE** — HTTP status check (`scripts/baseline/probe-routes.sh`)

---

## 0. Platform and gates

| ID | Area | Surface | Endpoint / artifact | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| G-01 | Version control | whole repo | git | **RED GATE** — last commit 2026-08-09; 132 modified files and 1,301 untracked paths, including all of `frontend-angular/`, 22 migrations, 6 workers, the financial safety tests | Commit the working tree to a branch, in reviewable slices, before any remediation. Add `.impeccable/`, `.hallmark/`, `.godaudits/`, `design-lab/`, `tmp/`, `tests/browser/_*` to `.gitignore` first so tooling state stays out | `git status` is empty after commit; `git ls-files frontend-angular \| wc -l` > 0 | P0 |
| G-02 | Restore | CI step 1 | `tests/Tafseel.{IntegrationTests,ArchitectureTests}/packages.lock.json` | **RED GATE** — `restore --locked-mode` fails NU1004: `Serilog.Sinks.File` added to the API project, test lock files not regenerated | Run `dotnet restore Tafseel.sln` and commit the two lock files (one added line each) | `dotnet restore Tafseel.sln --locked-mode` exits 0 | P0 |
| G-03 | Clean checkout | build | `src/Tafseel.Api/Tafseel.Api.csproj` → `App_Data/logs/.keep` | **RED GATE** — `MSB3030` on a fresh clone; `.gitignore:41` (`**/App_Data/`) excludes the file the project copies | Add `!src/Tafseel.Api/App_Data/logs/.keep` to `.gitignore` and commit the file, or make the `Content` item conditional on `Exists` | Build from `git archive HEAD` succeeds | P0 |
| G-04 | Format | CI | `src/Tafseel.Api/Program.cs:339-343` | **RED GATE** — 5 `WHITESPACE` errors | `dotnet format Tafseel.sln` | `dotnet format --verify-no-changes` exits 0 | P0 |
| G-05 | Test compile | tests | 21 call sites of `TeacherProfile.Publish` | **RED GATE** — CS7036 | Apply [results/test-compile-fix.patch](./results/test-compile-fix.patch) (`Publish(new TeacherProfileReadiness(true), now)`) | Integration project builds | P0 |
| G-06 | Test compile | `LiveSessionTests` | `Payment_reschedule_cancel_and_terminal_rules_are_explicit`, `Completion_and_no_show_wait_until_session_end_and_enforce_actor` | **RED GATE** — CS1061; they assert the lifecycle before mutual settlement | Rewrite both against `RequestReschedule`/`RespondToReschedule`, `RequestCompletion`, `MarkStudentNoShow` with the 15-minute grace, `ConfirmSettlement`/`FinalizeSettlement`, asserting `*Pending` states | Domain tests 117/117 with nothing fenced | P0 |
| G-07 | Startup validation | `ConfigurationValidationTests` | `DependencyInjection.cs:460-461` `GetRequiredSection("Orders")` | **RED GATE** — 37/37 fail before any rule is checked, so validation coverage is blind | Add `["Orders:NonDeliveryGraceHours"] = "24"` to the test's config dictionary; add cases for `0` and `721` | 39 cases pass, including the two new ones | P0 |
| G-08 | Auth cookie contract | `EmailConfirmationSecurityTests` | `AuthController.cs:392-393` logout | **RED GATE** — logout emits two `Set-Cookie` headers: the `__Host-` refresh cookie and the non-Secure `tafseel-staging-refresh` | **Decision.** Recommended: expire the staging cookie only when `SecureRefreshCookie` is false, and keep the one-cookie assertion. Or: relax the test to require that the `__Host-` cookie meets the contract and any other header is an expiry | Test passes on HTTPS; add an IT for the HTTP staging path | P1 · server |
| G-09 | Financial test drift | `Phase7FinancialTests.Concurrent_callbacks…` | `GET /withdrawals/balances` | **RED GATE** — expects `available=85` right after completion; money is correctly in `PendingClearance` | After completion assert `pendingClearance=85, available=0`; advance the clock past the exposure window, run `EarningsMaturityWorker`, then assert `available=85` and run the concurrent withdrawals | Passes; no change to `FinancialService` | P0 |
| G-10 | Financial test drift | `Phase7FinancialTests.Invalid_signature…refund_replay` | `POST /payments/{id}/refund` | **RED GATE** — 415, refund now requires `{ reason }`; the replay assertions never run | Send `{ "reason": "…" }` in `RefundAsync` | Passes, and the replay-idempotency assertions execute | P0 |
| G-11 | Live-session test drift | `Phase6LiveSessionTests.Join_window…` | `POST /live-sessions/{id}/no-show` | **RED GATE** — 409 at end+1 min; grace is 15 min | Move the clock to end + 16 min; expect `StudentNoShowPending`, then settle | Passes | P0 |
| G-12 | Upload test drift | `TeacherShowcaseMvpTests.Upload_validation…` | `PrivateMediaRules.EnsureTeacherMedia` | **RED GATE** — octet-stream is now deliberately accepted when bytes and extension agree | Assert that the octet-stream case is accepted and stored as `video/mp4`; add a mismatched declared type (`image/png` on MP4 bytes) that must still throw | Passes | P0 |
| G-13 | Legacy host test | `Phase10FrontendIntegrationTests.Teacher_dashboard…` | `GET /app/Tafseel-Teacher-Dashboard.dc.html` | **BROKEN** — 500 observed | Delete with the legacy dashboard routes (R-03), or retarget to the Angular teacher route | Suite green | P1 |
| G-14 | CI JS gate | `scripts/ci/check-js.mjs` | `support.js` assertion | **RED GATE** — fails on its first assertion | Retire the legacy page checks with R-05; keep `node --check` for any remaining JS | CI step exits 0 | P1 |
| G-15 | Publish validation | `scripts/ci/validate-publish.ps1` | expected file list | **RED GATE** — expects 5 deleted dashboards and 2 never-tracked JS files | Expect `webclient/{ar,en}/index.csr.html` and the prerendered pages instead of legacy files | Script exits 0 against `dotnet publish` output | P1 |
| G-16 | Test hygiene | `SqlServerTafseelApiFactory` | LocalDB | **RED GATE** — 13 orphaned `TafseelTestApi_*` databases from earlier runs | Delete the database in `DisposeAsync`/`finally`, not only on the success path; drop the orphans once | Run the SQL suite twice; zero `TafseelTest%` databases remain | P3 |

## 1. Visitor discovery

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J1-01 | Open the site | `/` → `LandingPageComponent` | host `GET /` | **BROKEN** — observed 302 to `/app/Tafseel-Landing.dc.html`, which paints 0 characters and throws `Tafseel.campaignIsEligible is not a function` | Delete `Program.cs:432` so the fallback negotiates `/ar` or `/en` (as the README already states) | PROBE `GET /` → 302 `/ar/`; E2E: landing has visible text in both locales | **P1 · server** |
| J1-02 | See featured subjects, teachers, services, stats | `LandingPageComponent` | `GET /subjects/featured`, `/teachers`, `/services`, `/promotions`, `/platform/stats` | **WORKS** — `/en` renders | — | Existing: `FeaturedSubjectsTests` 1/1 · Add: E2E landing sections | — |
| J1-03 | Browse and filter teachers | `/teachers` → `BrowseTeachersPageComponent` | `GET /teachers`, `/subjects`, `/topics`, `/services`, `/education-levels`, `/languages` | **WORKS** | — | Existing: `UnifiedDiscoveryAvailabilityTests` 3/3, `CatalogTests` 1/1 | — |
| J1-04 | See who is available | browse cards, teacher profile | client `GET /teachers/availability` · server `GET /live-sessions/availability-summaries` | **BROKEN** — observed 404; `availability` binds `/teachers/{teacherId}` | Call `availability-summaries` and map its DTO in `HttpTeacherGateway` (`http-teacher.gateway.ts:210`) | Existing: `LiveSessionAvailabilitySummaryTests` 3/3 · Add: CT; NG gateway spec | P2 |
| J1-05 | Compare teachers | `/teachers` | `GET /teachers/compare` | **WORKS** | — | Existing: `TeacherComparisonTests` 5/5 | — |
| J1-06 | View a teacher profile, reviews, samples | `/teachers/:teacherId` | `GET /teachers/{id}`, `/teachers/{id}/reviews`, `/teachers/samples/{id}/content` | **WORKS** — build warning NG8107 at `teacher-profile-page.component.html:38` | Drop the redundant `?.` | Existing: `TeacherPublicProfileHardeningTests` 3/3, `TeacherProfileVideoCurationTests` 4/4 | P3 |
| J1-07 | Save a teacher | profile, browse | client `POST /favorite-teachers` · server `PUT /favorite-teachers/{teacherId}` | **BROKEN** — observed 404. Reading favourites also maps the wrong field: `f.teacherId` on `TeacherCardDto[]` (`http-teacher.gateway.ts:252`) | Use `PUT /favorite-teachers/{teacherId}`; map `id` from `TeacherCardDto` | Existing: `Phase4MarketplaceTests` 8/8 · Add: CT; NG gateway spec for add/list/remove | P2 |
| J1-08 | Product analytics | all public pages | `POST /marketplace-intelligence/events` | **NO UI** — no emitter in the Angular client | Emit the allow-listed events from discovery and conversion surfaces; transport failures must never block the page | Existing: `Release7MarketplaceIntelligenceTests` 2/2 · Add: NG emitter spec | P3 |

## 2. Account

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J2-01 | Register | `/auth` (`mode=register`) | `POST /auth/register` | **WORKS** | — | Existing: `AuthenticationTests` 6/6 | — |
| J2-02 | Confirm email from the email link | email → `/auth?mode=confirm&email&token` | `POST /auth/confirm-email`; config `Email:ConfirmationUrl` | **DEAD LINK** — every `appsettings*.json` points at `/app/Tafseel-Auth.dc.html`; staging at a real host. The Angular `/auth` page already handles `mode=confirm` (`auth-page.component.ts:115`) | Set `Email:ConfirmationUrl` to `https://<host>/auth` in `appsettings.json`, `.Staging.json`, `.Production.json`, and the staging host secrets | Existing: `EmailConfirmationSecurityTests` 2/4 (G-08) · Add: IT asserting the emitted link path is `/auth`; E2E following a dev-outbox link | **P1 · config** |
| J2-03 | Log in, stay signed in, log out | `/auth`; interceptor | `POST /auth/login`, `/auth/refresh`, `/auth/logout` | **WORKS** — logout cookie contract, see G-08 | — | Existing: `SqlServerAuthenticationSecurityTests` 5/5 | — |
| J2-04 | Reset password from the email link | `/auth` (`?email&token` → reset) | `POST /auth/forgot-password`, `/auth/reset-password`; config `Email:PasswordResetUrl` | **DEAD LINK** — same legacy URL as J2-02 | Set `Email:PasswordResetUrl` to `https://<host>/auth` | Add: IT for link path; E2E reset from the dev outbox | **P1 · config** |
| J2-05 | Resend confirmation | `/auth/confirm-email` | `POST /auth/request-email-confirmation` | **WORKS** | — | Existing: `ConfirmationRateLimitTests` 1/1 | — |
| J2-06 | Manage account settings | `/{role}/settings` dashboard tab | reads: `GET /auth/sessions`, `/notification-preferences`, `/students/me/learning-preferences`, `/languages` · writes: `PUT /auth/profile`, `GET /auth/privacy/export` | **PARTIAL** — name change and data export work. No UI for: `PUT /auth/password`, `DELETE /auth/sessions/{id}`, `POST/DELETE /auth/avatar`, MFA `setup/enable/disable`, `DELETE /auth/account`, `PUT /notification-preferences`, `PUT /students/me/learning-preferences`, `GET /auth/me` | Build a settings page with those forms | Existing: `AvatarTests` 4/4, `StudentLearningPreferencesTests` 4/4 · Add: NG form specs; E2E change password | P2 |

## 3. Student — request a specific teacher

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J3-01 | Start a request from a profile | `/requests/new?teacherId=` → `NewRequestPageComponent` | `GET /teachers/{id}`, `/students/me/learning-preferences` | **WORKS** | — | Add: E2E profile → wizard | — |
| J3-02 | Submit the request | `NewRequestPageComponent` → `SubmitLearningRequest` | `POST /learning-requests` | **BROKEN** — body mismatch: client sends `deliveryDate`, `teacherId`, `flexibleBudget`; `CreateLearningRequest` binds `TeacherServiceId, Title, Description, PreferredDeliveryAt, Budget`. The date falls back to `0001-01-01` and `Orders.cs:54-55` throws `invalid_request_deadline` | Send `preferredDeliveryAt`; send `budget: null` when flexible; stop sending `teacherId` and `flexibleBudget` (`http-request.gateway.ts:36-44`) | Existing: `Phase5OrderTests` 6/6 (server path) · Add: CT on request **bodies** (record parameters vs posted keys); NG gateway spec asserting exact keys; IT posting the client's JSON shape | **P1** |
| J3-03 | Attach files | wizard | `POST /learning-requests/{id}/attachments` | **WORKS** | — | Existing: `Phase5OrderTests` | — |
| J3-04 | Get help writing the brief | wizard | `POST /ai/request-assistant` | **WORKS** — gated by `Ai.Enabled` (off outside Development) | — | Existing: `Release9AiAssistedMarketplaceTests` 13/13 | — |
| J3-05 | Answer a teacher's clarifying question | — | `POST /learning-requests/{id}/request-clarification` (teacher), `/reply-clarification` (student), `GET /learning-requests/{id}` | **NO UI** | Request detail view with a clarification thread for both roles | Existing: `Phase5OrderTests` · Add: E2E ask/answer | P2 |
| J3-06 | Cancel a request | — | `POST /learning-requests/{id}/cancel`, `GET /learning-requests/attachments/{id}/content` | **NO UI** | Cancel action and attachment viewer on request detail | Add: NG; E2E | P2 |
| J3-07 | Teacher accepts with price and terms | `/teacher/requests` dashboard tab → "Accept" | `POST /learning-requests/{id}/accept` | **BROKEN** — body mismatch: posts `{}`; `AcceptLearningRequest` requires `FinalPrice` (≥0.01), `Currency`, `AgreedDeliveryAt`, `RevisionAllowance` → validation 400 | Accept dialog collecting price, currency, delivery date, revisions (`dashboard-page.component.ts:154`) | Existing: `Phase5OrderTests` · Add: CT body check; NG dialog spec; E2E accept → order in `AwaitingPayment` | **P1** |
| J3-08 | Teacher declines | same tab → "Decline" | `POST /learning-requests/{id}/decline` | **WORKS** | — | Existing: `Phase5OrderTests` | — |

## 4. Student — post an open request, teachers bid

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J4-01 | Post a need to all qualified teachers | none — `/requests/new` requires `teacherId` (`new-request-page.component.ts:88-89`) | `POST /open-marketplace/requests` | **NO UI** — the open-request flow cannot start in Angular | Add an open-request mode to the wizard: no teacher, service and subject picker, budget range, deadline | Existing: `OpenMarketplaceTests` 5/5 (IT) + domain · Add: E2E publish | **P1** |
| J4-02 | See my open requests | `/requests` (student) → `ListMarketplaceRequests.mine` | client `GET /open-marketplace/requests` | **BROKEN** — observed 404 (POST only) | Use `GET /learning-requests/mine` and filter `sourcingMode = OpenMarketplace`; the DTO already carries `OfferCount`, `SelectedOfferId`, `PaymentReservationExpiresAt` (`OrderContracts.cs:48-55`). No server change | Add: CT; NG spec for the filter | **P1** |
| J4-03 | Compare offers | `/requests` (student) | `GET /open-marketplace/requests/{id}`, `/requests/{id}/offers` | **WORKS** | — | Existing: `OpenMarketplaceTests` | — |
| J4-04 | Teacher sees opportunities | `/requests` (teacher), `/teacher/opportunities` | `GET /open-marketplace/opportunities`, `GET /open-marketplace/opportunities/{id}` | **PARTIAL** — list works; detail (`opportunities/{id}`) and `requests/{id}/my-offer` have no caller | Opportunity detail showing the teacher's own offer | Add: NG; E2E | P2 |
| J4-05 | Teacher submits an offer | `/requests` (teacher) → `SubmitOffer` | client `POST /open-marketplace/requests/{id}/offers` · server `POST /open-marketplace/opportunities/{id}/offers` | **BROKEN** — observed 404 | Post to `opportunities/{id}/offers` with the `SubmitOffer` contract (amount, included revisions, validity, scope) | Existing: `OpenMarketplaceTests` · Add: CT; NG gateway spec; E2E bid | **P1** |
| J4-06 | Teacher edits or withdraws an offer | — | `PUT /open-marketplace/offers/{id}`, `POST /open-marketplace/offers/{id}/withdraw` | **NO UI** | Edit and withdraw actions on the teacher's offer | Add: E2E | P2 |
| J4-07 | Student selects an offer | `/requests` → `AcceptOffer` | client `POST /open-marketplace/offers/{id}/accept` · server `POST /open-marketplace/requests/{rid}/offers/{oid}/select` (`If-Match` + `X-Offer-Version`) | **BROKEN** — observed 404. The client also expects an `orderId` back; selection reserves the request, and the order is created only when payment confirms | Call `select` with both version headers; navigate to checkout for the **request** (J4-08), not an order | Existing: `OpenMarketplaceTests` · Add: CT; NG use-case spec; E2E select → checkout | **P1** |
| J4-08 | Pay for the reserved request | `/checkout` → `Payable` | `POST /payments/open-requests/{learningRequestId}` | **NO UI** — `Payable.paymentPath` only knows `order` and `live-session` (`payable.ts:113-117`) | Add an `open-request` payable kind (`?learningRequestId=`); show the reservation countdown | Existing: `OpenMarketplaceTests`, `FinancialSafetyTests` 25/25 · Add: NG `payable.spec`; E2E pay → order `InProgress` | **P1** |
| J4-09 | Release a selection | — | `POST /open-marketplace/requests/{id}/cancel-selection` | **NO UI** | Cancel-selection on the reserved request | Add: E2E | P2 |

## 5. Checkout

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J5-01 | Pay for an accepted order | `/student/orders` → no Pay control; `/checkout?orderId=` works if reached | `POST /payments/orders/{id}` | **NO UI** — the only navigations to `/checkout` come from live-session booking and the broken marketplace accept | "Pay" on orders in `AwaitingPayment` → `/checkout?orderId=` | Existing: `FinancialSafetyTests` 25/25, `MockPaymentSimulatorTests` 3/3 · Add: E2E order → pay | **P1** |
| J5-02 | Pay for a live session | `/sessions/book` → `/checkout?liveSessionId=` | `POST /payments/live-sessions/{id}` | **WORKS** (mock provider) | — | Existing: `Phase6LiveSessionTests` 4/5 (G-11) | — |
| J5-03 | Apply a coupon | `/checkout` | coupon on payment initiation | **WORKS** | — | Existing: `FinancialSafetyTests` (coupon release never exceeds capture) | — |
| J5-04 | Complete the simulated payment | `/checkout/simulator` | `GET /payments/mock/capabilities`, `/payments/mock/simulator`, `POST /payments/mock/simulator/complete` | **WORKS** in Development/Staging. `Payments:Mock:DefaultReturnPath` still names the deleted student dashboard (`appsettings.json:54`, `.Development.json:15`, `.Staging.json:35`); the Angular page masks it by always sending its own return path | Set `DefaultReturnPath` to `/student/overview` (the code default already is) | Existing: `MockPaymentSimulatorTests` 3/3 — its `returnUrl` assertion pins `/app/`; update it · Add: PROBE | P2 · config |
| J5-05 | Pay with a real provider | — | `IPaymentProvider` (Mock only; `DependencyInjection.cs` fails closed in Production) | **EXTERNAL** | Register a real provider. Note that `IPaymentProvider` has no `RefundAsync` and withdrawals need a hand-typed provider reference — decide manual operations or provider adapters **before** integrating | Provider sandbox suite; `FinancialSafetyTests` stays green | after P1 |

## 6. Order fulfilment

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J6-01 | Teacher starts work | `/teacher/orders` → "Start" | `POST /orders/{id}/start` | **WORKS** | — | Existing: `Phase5OrderTests` 6/6 | — |
| J6-02 | Teacher delivers files | `/teacher/orders` → upload | `POST /orders/{id}/deliveries` | **WORKS** | — | Existing: `OrderDeliveryApiTests` 2/2, `OrderDeliveryStorageTests` 1/1 | — |
| J6-03 | Student opens the delivery | `/student/orders` → protected viewer | `GET /orders/deliveries/{id}/content` | **WORKS** | — | Existing: `OrderDeliveryApiTests` | — |
| J6-04 | Student requests a revision | — | `POST /orders/{id}/revision` | **NO UI** | Revision action with a note, respecting the remaining allowance | Existing: `Phase5OrderTests` · Add: E2E deliver → revise → redeliver | **P1** |
| J6-05 | Student approves the work | `/student/orders` → "Complete" | `POST /orders/{id}/complete` | **WORKS** — releases to `PendingClearance` | — | Existing: `FinancialSafetyTests` 25/25, `EarningsMaturityConcurrencyTests` 14/14 | — |
| J6-06 | See an order's detail and history | none; server links `/orders/{id}` ×20 | `GET /orders/{id}`, `/orders/{id}/timeline` | **DEAD LINK** — `/en/orders/{id}` observed: `NG04002`, blank page | Add `/orders/:id` (both roles, participant-guarded) with timeline, deliveries, and actions | Add: E2E open from a notification; PROBE | **P1** |
| J6-07 | Agree an extension | — | `POST /orders/{id}/extensions`, `/extensions/{extensionId}/respond` | **NO UI** | Extension request and response on order detail | Existing: **none** — `Order.RequestExtension`/`RespondToExtension` (`Orders.cs:418-429`) have no domain or integration test · Add: domain tests for both transitions; IT for the two endpoints; E2E | P2 |
| J6-08 | Cancel an unpaid order | — | `POST /orders/{id}/cancel` | **NO UI** | Cancel on order detail while `AwaitingPayment` | Add: E2E | P2 |
| J6-09 | Automatic release when the student is silent | `OrderAutoReleaseWorker` (5 min) | — | **WORKS** — fails at `Warning` with no metric | Log at `Error`; add success/failure counters and a last-success timestamp; alert on staleness | Existing: `FinancialSafetyTests` · Add: IT asserting the counter increments | P2 · server (observability only) |
| J6-10 | Dispute a non-delivery | `/disputes` | `GET /disputes/eligible` (includes `non_delivery`) | **WORKS** | — | Existing: `Phase9GovernanceTests` 5/5 | — |

## 7. Reviews

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J7-01 | Review a completed order or session | — | `POST /orders/{orderId}/review`, `POST /live-sessions/{bookingId}/review` | **NO UI** | Rating form on completed order and session detail, offered once | Existing: `Phase9GovernanceTests` 5/5 · Add: E2E review → public profile rating updates | **P1** |
| J7-02 | Admin moderates reviews | `/admin/reviews` | reads `GET /admin/reviews`, `/admin/reviews/summary` · actions `GET /admin/reviews/{id}`, `POST /admin/reviews/{id}/moderate` | **PARTIAL** — list only | Review detail with a moderate action | Add: E2E | P2 |
| J7-03 | Teacher sees a review from a notification | server link `/teacher/reviews/{id}` | — | **DEAD LINK** | Route to the teacher reviews view with the review selected | Add: E2E | P3 |

## 8. Live sessions

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J8-01 | Book a slot | `/sessions/book` | `GET /live-sessions/teachers/{id}/slots`, `POST /live-sessions`, `POST /live-sessions/{id}/attachments` | **WORKS** | — | Existing: `Phase6LiveSessionTests` 4/5 | — |
| J8-02 | Join a session | `/student/sessions` → "Join" | `GET /live-sessions/{id}/join` | **PARTIAL** — Student only (`dashboard-page.component.html:61`); the teacher has no Join button | Show Join to the teacher too, inside the join window | Existing: `Phase6LiveSessionTests` · Add: NG | **P1** |
| J8-03 | Reschedule | — | `POST /live-sessions/{id}/reschedule`, `/reschedule/respond` | **NO UI** | Propose and respond on session detail | Existing: `Phase6LiveSessionTests` · Add: E2E | P2 |
| J8-04 | Cancel | — | `POST /live-sessions/{id}/cancel` | **NO UI** | Cancel with the refund-window message | Add: E2E teacher cancel refunds | P2 |
| J8-05 | Mark complete or no-show, confirm settlement | — | `POST /live-sessions/{id}/complete`, `/no-show`, `/settlement/confirm` | **NO UI** — only `LiveSessionSettlementWorker` settles today | Completion and no-show actions for each role, then confirmation | Existing: `Phase6LiveSessionTests` (G-11), `FinancialSafetyTests` · Add: E2E mutual settlement | **P1** |
| J8-06 | Open a session from a notification | server links `/live-sessions/{id}` ×20 | `GET /live-sessions/mine` | **DEAD LINK** — `/en/live-sessions/{id}` returns the shell, and there is no route | Add `/live-sessions/:id` hosting J8-02 to J8-05 | Add: E2E; PROBE | **P1** |
| J8-07 | Real meeting link | — | `ILiveSessionLinkProvider` (Mock only) | **EXTERNAL** | Register a real provider | Provider sandbox | after P1 |
| J8-08 | Admin resolves a stuck session | `/admin/sessions` | `POST /admin/operations/sessions/{id}/{complete,student-no-show,teacher-no-show,dispute}` | **NO UI** — list only; server link `/admin/operations/sessions` is also dead | Row actions on the admin sessions tab; route the link to `/admin/sessions` | Existing: `AdminCommandCentreTests` 37/37 · Add: E2E | P2 |

## 9. Messaging and notifications

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J9-01 | See my conversations | `/{role}/messages` | `GET /conversations` | **PARTIAL** — list only | — (see J9-02) | Existing: `Phase8MessagingTests` 3/3 | — |
| J9-02 | Read and send messages | — | `GET/POST /conversations/{id}/messages`, `POST /conversations`, `/conversations/{id}/read`, `POST /messages/{id}/attachments`, `GET /message-attachments/{id}/content`; hub `/hubs/messages` | **NO UI** — and no SignalR client exists | Thread view with send, attachments, read receipts; SignalR with polling fallback | Existing: `Phase8MessagingTests`, `Release5OrderCommunicationAcceptanceTests` 3/3 · Add: E2E two-party thread | **P1** |
| J9-03 | Open a conversation from a notification | server link `/conversations/{id}`; `GET /app/Tafseel-Chat.dc.html` | — | **DEAD LINK** — `Chat.dc.html` is a **301 permanent** redirect to a 500 | Add `/conversations/:id`; change the chat redirect to the Angular messages route (browsers cache 301s, so ship it quickly) | PROBE; E2E | **P1 · server** |
| J9-04 | Act on a notification | `/{role}/overview` | `GET /notifications`, `POST /notifications/read` | **PARTIAL** — `actionUrl` is never rendered (0 references in Angular) | Render each notification as a link to its `actionUrl` | Add: NG; E2E click-through | **P1** |
| J9-05 | Server-minted links resolve | all notifications and emails | `AppRoutes.cs` (13 constants on deleted pages); Angular-shaped literals `/orders`, `/live-sessions`, `/requests/{id}`, `/requests/{id}/offers`, `/disputes/{id}`, `/conversations/{id}`, `/teacher/earnings`, `/teacher/reviews/{id}`, `/admin/operations/sessions` | **DEAD LINK** — 500 observed for the legacy constants; `NG04002` blank observed for `/orders/{id}` | Point `AppRoutes` at Angular routes, one place, and make the notification literals use it; add the detail routes (J6-06, J8-06, J9-03, J10-03) and a `**` route with a not-found page | Add: IT enumerating every `AppRoutes` value and every notification `actionUrl` against the Angular route table; PROBE | **P1 · server** |
| J9-06 | Notification preferences | settings | `PUT /notification-preferences` | **NO UI** | See J2-06 | — | P2 |

## 10. Disputes

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J10-01 | Open a dispute, add evidence and messages | `/disputes` | `GET /disputes/eligible`, `/disputes/mine`, `/disputes/{id}`, `POST /disputes`, `/disputes/{id}/evidence`, `/disputes/{id}/messages`, `GET /dispute-evidence/{id}/content` | **WORKS** | — | Existing: `Phase9GovernanceTests` 5/5; NG `dispute.use-cases.spec` | — |
| J10-02 | Admin reviews and resolves | `/disputes` (admin) | `GET /admin/disputes`, `/admin/disputes/{id}`, `POST …/start-review`, `…/resolve` | **PARTIAL** — `POST /admin/disputes/{id}/messages` has no UI, so the admin cannot write to the parties | Admin message box on the dispute | Existing: `Phase9GovernanceTests` · Add: E2E | P2 |
| J10-03 | Open a dispute from a notification | server links `/disputes/{id}` ×10 | — | **DEAD LINK** — only `/disputes` exists | Add `/disputes/:id`, or read `?id=` on `/disputes` and remap the links | PROBE; E2E | P2 |

## 11. Teacher onboarding and supply

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J11-01 | Land in the right place after login | `AuthPageComponent` → `ResolveLandingRoute` | `GET /teachers/onboarding-status` → `nextUrl` | **BROKEN** — `nextUrl` is `AppRoutes.TeacherApply` / `TeacherProfileArea` / `TeacherHome` (`TeacherApplicationService.cs:674-682`), all deleted pages (500 observed). The client's own fallback `/teacher-apply` does not exist either (`resolve-landing-route.use-case.ts:34`) | Fixed by J9-05 for `nextUrl`; change the client fallback to `/teach/apply` | Add: NG `resolve-landing-route` spec; IT on `nextUrl` values | **P1** |
| J11-02 | Apply for a subject, record a demo, submit | `/teach/apply` | `GET /subjects`, `/topics?qualificationOnly`, `/teachers/me`, `/teacher-applications/mine`, `PUT /teachers/me/languages`, `POST /teacher-applications`, `PUT /teacher-applications/{id}`, `POST …/demo`, `…/submit`, `GET /qualification-resources/{id}/content` | **WORKS** | — | Existing: `TeacherApplicationFlowTests` 1/1, `TeacherAdditionalSubjectQualificationTests` 6/6; NG `teach.spec` | — |
| J11-03 | Withdraw an application | `/teach/apply` | `POST /teacher-applications/{id}/withdraw` | **NO UI** | Withdraw action while pending | Add: E2E | P3 |
| J11-04 | Reviewer starts a review | `/quality/applications` → "Review" | `GET /teacher-applications/queue`, `/queue/summary`, `POST …/start-review` | **WORKS** | — | Existing: `TeacherApplicationAuthorizationTests` 3/3 | — |
| J11-05 | Reviewer decides | — | `GET /teacher-applications/{id}`, `GET …/demo/content`, `POST …/decision`, `POST /teacher-qualifications/{id}/revoke` | **NO UI** — **no teacher can be approved through Angular** | Application detail with demo playback, rubric scoring, approve / request changes / reject; revoke on qualifications | Existing: `Pass3ConcurrencyAndReapplicationTests` 6/6, `TeacherApplicationAuthorizationTests` · Add: E2E apply → review → approve | **P1** |
| J11-06 | Complete the teacher profile | — | `PUT /teachers/me`, `PUT /teachers/me/topics`, `PUT /teachers/me/education-levels`, `POST/DELETE /teachers/me/{certifications,experience}` | **NO UI** — `GET /teachers/me/languages` is also uncalled | Profile editor | Existing: `Phase4MarketplaceTests` 8/8, `TeacherPublicProfileHardeningTests` 3/3 · Add: E2E | **P1** |
| J11-07 | Publish services and prices | `/teacher/catalog` — read only | `GET /teachers/me/marketplace-services`, `/teachers/me/eligible-subjects` · `POST /teachers/me/services`, `PUT …/{id}`, `PUT …/{id}/active` | **NO UI** — publication blocker `active_service_required` (`TeacherApplicationService.cs:690`) | Service editor limited to approved subjects | Existing: `MarketplaceTeacherServicesRelease2Tests` 4/4, `CanonicalServiceGovernanceTests` 4/4 · Add: E2E | **P1** |
| J11-08 | Set availability | `/teacher/availability` — read only | `POST/PUT/DELETE /teachers/me/availability/rules`, `POST/DELETE …/exceptions` | **NO UI** — publication blocker `availability_required` (`:691`) | Weekly rules and exceptions editor, time-zone aware | Existing: `LiveSessionAvailabilitySummaryTests` 3/3 · Add: E2E | **P1** |
| J11-09 | Publish the profile | — | `PUT /teachers/me/publication` | **NO UI** | Readiness checklist with a Publish action once blockers clear | Existing: `TeacherEligibleSubjectsAndPublicationTests` · Add: E2E full supply path J11-02 → J11-09 → appears in `/teachers` | **P1** |
| J11-10 | Samples, profile videos, showcases | `/teacher/videos` — read only | `POST /teachers/me/samples`, `PUT …/samples/{id}/publication`, `PUT /teachers/me/profile-videos/{order,{id}/featured,{id}/visibility}`, `POST/PUT /teachers/me/showcases…` (9 endpoints) | **NO UI** | Media manager | Existing: `TeacherShowcaseMvpTests` 4/5 (G-12), `TeacherProfileVideoCurationTests` 4/4 · Add: E2E | P2 |
| J11-11 | Reviewer moderates showcases | `/quality/showcases` — list only | `GET /teachers/showcase-moderation/{id}`, `POST …/versions/{versionId}/start-review`, `…/decision` | **NO UI** | Moderation detail with a decision | Existing: `TeacherShowcaseMvpTests` · Add: E2E | P2 |
| J11-12 | Teacher business exports | `/teacher/summary` | `GET /teachers/me/business/calendar.ics`, `/statement.csv` | **NO UI** — analytics and home summary work | Download links | Add: NG | P3 |

## 12. Earnings and withdrawals

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J12-01 | See my balance | `/teacher/home`, `/teacher/withdrawals` | `GET /withdrawals/balances`, `/withdrawals/policy`, `/withdrawals/mine` | **PARTIAL** — rendered by the generic row renderer; `pendingClearance` and `nextClearanceAt` are not presented, so a teacher sees 0 available after a completed order with no explanation | Balance card: available, pending clearance with its date, pending withdrawal | Existing: `EarningsMaturityConcurrencyTests` 14/14 · Add: NG | **P1** |
| J12-02 | Set up a payout profile | `/teacher/withdrawals` | `GET /withdrawals/profile` · `PUT /withdrawals/profile` | **NO UI** | Payout profile form (masked destination) | Existing: `FinancialSafetyTests` 25/25, `EarningsMaturityConcurrencyTests` 14/14 · Add: E2E | **P1** |
| J12-03 | Request a withdrawal | — | `POST /withdrawals` (Idempotency-Key) | **NO UI** | Withdrawal form with minimum and available checks | Existing: `Phase7FinancialTests` (G-09), `FinancialSafetyTests` · Add: E2E | **P1** |
| J12-04 | Admin verifies payout profiles and pays out | `/admin/payoutProfiles`, `/admin/withdrawals` — lists only | `POST /admin/payout-profiles/{teacherId}/review`, `POST /withdrawals/{id}/process` | **NO UI** | Review and process actions (provider reference entry, per H-3) | Existing: `AdminCommandCentreTests` 37/37, `FinancialSafetyTests` · Add: E2E | **P1** |
| J12-05 | Earnings mature after the dispute window | `EarningsMaturityWorker` (5 min) | — | **WORKS** — `Warning` only, no metric | As J6-09 | Existing: `EarningsMaturityConcurrencyTests` 14/14 | P2 · server (observability only) |
| J12-06 | Earnings link from a notification | server link `/teacher/earnings` ×2; `AppRoutes.TeacherEarnings` | — | **DEAD LINK** | Map to `/teacher/withdrawals` via J9-05 | PROBE | P2 |

## 13. Admin — catalog and marketing

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J13-01 | List catalog items | `/admin/{subjects,topics,services,educationLevels,assignments}` | `GET /admin/catalog/{type}` | **WORKS** | — | Existing: `Pass3CatalogAndValidationTests` 7/7 | — |
| J13-02 | Enable or disable an item | same tabs → Enable/Disable | client `PUT /admin/catalog/{tab}/{id}/active` · server `PATCH /admin/catalog/{type}/{id}/active` | **BROKEN** — observed 404 on every tab. `educationLevels` and `assignments` also need the slugs `education-levels` and `qualification-topics` | Use `PATCH`; map tab keys to server types (`dashboard-page.component.ts:171-176`) | Add: CT; NG spec for the tab → type map | P2 |
| J13-03 | Create and edit catalog items | — | `POST /admin/{subjects,topics,services,education-levels,languages,qualification-topics}`, `PUT /admin/catalog/{type}/{id}`, `PUT /admin/catalog/services/{id}`, `POST …/qualification-topics/{id}/resources/{link,file}` | **NO UI** | Catalog editor | Existing: `MarketplaceServiceCatalogRelease1Tests` 5/5, `ServiceCatalogCodeMigrationContractTests` 1/1 · Add: E2E | P2 |
| J13-04 | Coupons | `/admin/coupons` — list only | `POST /admin/coupons`, `PUT /admin/coupons/{id}`, `PATCH …/active` | **BROKEN / NO UI** — toggle 404 (PUT); create and edit have no UI | Coupon editor; PATCH toggle | Existing: domain `CouponTests`, `FinancialSafetyTests` · Add: E2E | P2 |
| J13-05 | Promotions | `/admin/promotions` — list only | `POST /admin/promotions`, `PUT/DELETE /admin/promotions/{id}`, `PATCH …/active` | **BROKEN / NO UI** — toggle 404 (PUT); create, edit, delete have no UI | Promotion editor; PATCH toggle | Existing: `PromotionsTests` 5/5; NG `promotion.spec` · Add: E2E | P2 |

## 14. Admin — operations and finance

| ID | User journey | Angular surface | API endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| J14-01 | Command centre, metrics, operations lists, audit, intelligence, reconciliation | `/admin/{home,payments,orders,requests,sessions,audit,reports,reconciliation}` | `GET /admin/attention`, `/admin/metrics`, `/admin/operations/{orders,requests,sessions}`, `/admin/audit`, `/admin/marketplace-intelligence`, `/admin/finance/reconciliation` | **WORKS** (read) | — | Existing: `AdminCommandCentreTests` 37/37 | — |
| J14-02 | Suspend a user | `/admin/users` → Suspend | `PUT /admin/users/{id}/suspension` | **WORKS** | — | Existing: `Phase9GovernanceTests` 5/5 | — |
| J14-03 | Change a user's roles | — | `PUT /admin/users/{id}/roles` | **NO UI** | Role editor with a confirmation step | Existing: `Phase9GovernanceTests` · Add: E2E | P3 |
| J14-04 | Refund a payment | — | `POST /payments/{id}/refund` (`{ reason }` + Idempotency-Key), `GET /payments/{id}` | **NO UI** | Refund action on the admin payments view, reason required | Existing: `FinancialSafetyTests` 25/25, `Phase7FinancialTests` (G-10) · Add: E2E refund once, retry is idempotent | **P1** |
| J14-05 | Finance and demand reports | — | `GET /admin/finance/reconciliation/coupons`, `/admin/reports/popular-subjects` | **NO UI** | Add both to the reports area | Add: NG | P3 |
| J14-06 | Admin AI tools | — | `POST /ai/discovery`, `/ai/product-help` | **NO UI** — `Ai.Enabled` is off outside Development | Decide whether they ship; hide the endpoints if not | Existing: `Release9AiAssistedMarketplaceTests` | P3 |

## 15. Legacy front end retirement

| ID | Area | Surface | Endpoint | Current status | Required fix | Test | Pri |
|---|---|---|---|---|---|---|---|
| R-01 | Root | host | `Program.cs:432` | **BROKEN** — see J1-01 | Delete the redirect | PROBE | **P1 · server** |
| R-02 | Chat redirect | host | `Program.cs:433` | **DEAD LINK** — permanent to a 500 | See J9-03 | PROBE | **P1 · server** |
| R-03 | Deleted dashboards still allowlisted | host | `Program.cs:423-430`; `/app/{file}` handler | **BROKEN** — 500 ×5 observed | Remove the five names; make `/app/{file}` return 404 when the file is missing; then point surviving `/app/*` URLs at Angular with 301s | PROBE: every `/app/*` path returns 301 to Angular or 404, never 500 | **P1 · server** |
| R-04 | Never-tracked JS allowlisted | host | `Program.cs:440-444` | **BROKEN** — 500 ×2 observed | Remove `open-marketplace.js` and `open-marketplace-locales.js` from the allowlist | PROBE | P2 · server |
| R-05 | Remove the legacy runtime | host, csproj, repo | `Program.cs:417-500`, `Tafseel.Api.csproj:37-94`, `legacy-archive/`, `support.js`, `js/` | **RED GATE** — also keeps `'unsafe-eval'` in the CSP (`Program.cs:339`) for Babel standalone and `support.js` | Once J9-05 and R-03 are done and no inbound link needs `/app/*` pages: delete the routes, content items and files; drop `'unsafe-eval'`; retire `check-js.mjs` legacy checks (G-14) and `Phase10FrontendIntegrationTests` (G-13) | CSP header has no `unsafe-eval`; PROBE; publish validation (G-15) | P2 · server |
| R-06 | Browser evidence targets the deleted site | `tests/browser/` | 63 of 103 scripts reference `.dc.html`; 0 target `/ar` or `/en` | **RED GATE** | Rebuild the browser suite against Angular routes, starting with the P1 E2E rows above | E2E suite runs against `/ar/*` and `/en/*` | P2 |
| R-07 | Locale bundle residue | `public/locale/{en,ar}.json` | 399 `auto.*` keys, 0 references in Angular source | **RED GATE** — ~9.4% of each locale file is dead; includes a translated HTML tag (`auto.76af1d166177`) | Delete unreferenced `auto.*` keys; have `check:i18n` fail on keys with no reference | `check:i18n` passes with an unused-key rule | P3 |

---

## Execution order

**Wave 0 — protect and go green (P0).** G-01 to G-12 and G-16. This is test, lock-file,
format, and `.gitignore` work only. Exit: the CI build job is green on a committed tree, and
the refund-replay and startup-validation coverage runs again.

**Wave 1 — make the site and its links real (P1, host and config).** J1-01, J2-02, J2-04,
J9-03, J9-05, J11-01, R-01 to R-03, G-08, G-13. Add the CT contract test **before** changing
any gateway so every later wave is guarded. Exit: no `/app/*` path returns 500, `/` serves
Angular, every `AppRoutes` value and notification `actionUrl` resolves to an Angular route.

**Wave 2 — fix what Angular already calls (P1/P2, client only).** J3-02, J3-07, J4-02, J4-05,
J4-07, J1-04, J1-07, J13-02, J9-04, J8-02, J12-01. Exit: the contract match reports
0 mismatched call shapes and 0 mismatched bodies.

**Wave 3 — build the missing money and supply surfaces (P1).** Supply first: J11-05 → J11-06
→ J11-07 → J11-08 → J11-09. Then demand: J4-01, J4-08, J5-01, J6-04, J6-06, J7-01, J8-05,
J8-06, J9-02. Then money out: J12-02 → J12-04, J14-04. Exit: one E2E runs apply → approve →
publish → student request → accept → pay → deliver → revise → complete → review → mature →
withdraw → pay out, entirely through Angular.

**Wave 4 — complete and retire (P2/P3).** Remaining NO UI rows, R-04 to R-07, observability on
the workers.

**Then** J5-05 and J8-07: the real payment and meeting providers. Decide the refund and payout
model (H-3 in the 2026-09-13 audit) first, because it may change the provider interface.
