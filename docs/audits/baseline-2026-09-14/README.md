# Baseline — 2026-09-14

A reproducible record of what builds, what passes, and what is wired, taken before any
functional change. The remediation plan built on it is in
[REMEDIATION_MATRIX.md](./REMEDIATION_MATRIX.md).

- **Branch:** `frontend/phase-00-hardening`
- **Last commit:** `2681767` (2026-08-09)
- **Toolchain:** .NET SDK 9.0.100 building `net8.0` (runtime 8.0.21) · Node 24.19.0 · npm 11.12.1 · Angular 22.1.5 · LocalDB `MSSQLLocalDB`

## Reproduce

```bash
bash scripts/baseline/run-baseline.sh /path/outside/the/repo
```

The script builds and tests three things: the working tree as found, a disposable copy of it
patched only enough to compile, and the last commit extracted with `git archive`. It then
dumps the live endpoint table and matches it against every API call in the Angular source.
Inside the repository it only writes gitignored build output; anything that needs a change to
compile happens in the copy. The runtime route probe needs a running host and is a separate
step: `BASE=http://localhost:<port> bash scripts/baseline/probe-routes.sh`.

The numbers below were produced piecemeal during the audit, then reproduced by one unattended
run of the script. Every count matched, including the same 44 failing test cases.

| File | What it is |
|---|---|
| `inventory/endpoints.json` | Every endpoint the host resolves (237 controller actions, 18 minimal routes), with verbs, roles, policies, rate limits |
| `inventory/hosted-services.json` | Hosted services registered in the container |
| `inventory/angular-routes.json` | The Angular route table |
| `inventory/angular-api-calls.json` | Every API call in the Angular source, with file and line |
| `inventory/contract-match.json` | Each client call shape matched to its server endpoint, or the reason it does not match |
| `inventory/endpoints-without-client.json` | API endpoints the Angular client never calls |
| `inventory/runtime-route-probe.txt` | HTTP status of legacy, fallback, and mismatched routes on a published build |
| `results/test-compile-fix.patch` | The only test changes applied in the copy |

---

## 1. The repository is not under version control for a month of work

The last commit is 2026-08-09. Since then, **132 tracked files were modified (+17,362 / −13,246
lines) and 1,301 paths were added that git does not track.** Untracked, among others:

- the entire Angular client — `frontend-angular/` has **0 tracked files**
- 22 EF migrations (`20260811084136_OpenRequestMarketplace` onward)
- six of the seven background workers, including `EarningsMaturityWorker` (the withdraw-before-dispute-window fix)
- `OpenMarketplaceService`, `TeacherOffer`, `EarningsExposurePolicy`, `EarningsMaturity`, `ApplicationLock`, `AppRoutes`
- the new financial tests: `FinancialSafetyTests`, `EarningsMaturityConcurrencyTests`, `OpenMarketplaceTests` (domain and integration), `PromotionsTests`

Nothing below is recoverable from git if this working copy is lost. That is the first item in
the matrix.

## 2. Results

**Working tree as found:** only the Angular suite and two small .NET test projects can run.
The Domain and Integration test projects do not compile.

**Disposable copy:** the same tree with one mechanical signature fix applied to 21 call sites,
and 2 stale domain test methods fenced out
([patch](./results/test-compile-fix.patch)). No production code was changed.

| Gate | Last commit `2681767` | Working tree as found | Working tree, copy with compile fix |
|---|---|---|---|
| `dotnet restore --locked-mode` | pass | **fail** — NU1004 in 2 test lock files | pass (unlocked restore) |
| `dotnet format --verify-no-changes` | not run | **fail** — 5 whitespace errors, `Program.cs:339-343` | — |
| Build `src/` projects | pass | pass, 0 warnings | pass |
| Build test projects | pass | **fail** — 24 errors (Domain 3, Integration 21) | pass |
| Build from a clean checkout | pass | **fail** — `MSB3030`, `App_Data/logs/.keep` is gitignored | pass (file created in copy) |
| Architecture tests | 1/1 | 1/1 | 1/1 |
| Domain tests | 89/89 | does not compile | **115/115** (+2 fenced, stale) |
| Application tests | 14/14 | 14/14 | 14/14 |
| Integration, provider-neutral | 125/125 | does not compile | **102/141** |
| Integration, SQL Server (LocalDB) | 132/132 | does not compile | **210/215** |
| Angular build + locale/style gates | n/a (untracked) | pass, 1 template warning (NG8107) | — |
| Angular unit tests (Vitest) | n/a | **117/117** | — |
| `scripts/ci/check-js.mjs` | not run | **fail** — first assertion on `support.js` | fail |
| `scripts/ci/tests/*.tests.ps1` | not run | — | pass (57 + 34 + 9) |
| `ef migrations has-pending-model-changes` | not run | — | pass — no pending changes |
| `dotnet publish` | not run | — | pass |
| `scripts/ci/validate-publish.ps1` | not run | — | **fail** — 5 dashboards and 2 JS files missing |

CI's `build-and-provider-neutral` job would stop at its first step (locked restore) on this tree.

## 3. Every test failure, classified

The rule for this baseline: backend financial and domain logic is protected unless a defect is
demonstrated. All 68 problems below were traced to a root cause. **None is a defect in
financial or domain logic.** One is a real routing defect that the tests caught. The rest are
tests or gates that still assert behaviour the code deliberately changed.

| Where | Count | Root cause | Kind |
|---|---:|---|---|
| Integration — compile | 21 | `TeacherProfile.Publish(now)` became `Publish(TeacherProfileReadiness, now)` (`Marketplace.cs:43`) | Test drift — mechanical |
| Domain — compile | 3 | `LiveSessionBooking.Reschedule`/`Complete` replaced by `RequestReschedule`/`RespondToReschedule`/`RequestCompletion`/`ConfirmSettlement` (`LiveSessions.cs:123-204`) | Test drift — 2 methods need rewriting for mutual settlement |
| `ConfigurationValidationTests` | 37 | `DependencyInjection.cs:460-461` now calls `GetRequiredSection("Orders")`; the test's in-memory config has no `Orders` section, so the container throws before any validation runs | Test drift — **startup-validation coverage is currently blind** |
| `EmailConfirmationSecurityTests` | 2 | Logout now expires two cookies: `__Host-tafseel-refresh` and the non-Secure `tafseel-staging-refresh` (`AuthController.cs:392-393`); the test requires exactly one `Set-Cookie`. Login still meets the full contract | Contract change — **needs a security decision** |
| `Phase7FinancialTests` concurrent release | 1 | Expects `available = 85` immediately after completion. Released money now goes to `PendingClearance` until the dispute window closes (`FinancialService.cs:311-315`, `BalanceDto.PendingClearance`) | Test drift from the earnings-maturity fix |
| `Phase7FinancialTests` refund replay | 1 | Refund now requires a body with a reason (`PaymentsController.cs:72-75`, `AdminRefundRequest`); the test posts none → 415 | Test drift — **the replay assertions after it never run** |
| `Phase6LiveSessionTests` no-show | 1 | No-show now has a 15-minute grace period after session end (`LiveSessions.cs:177`) and resolves to `StudentNoShowPending` | Test drift |
| `TeacherShowcaseMvpTests` upload validation | 1 | An MP4 declared as `application/octet-stream` is now accepted when extension and magic bytes agree; the stored type comes from the sniff, not the browser (`PrivateMediaRules.cs`, `TeacherMediaTypes.IsUnknownDeclared`) | Deliberate relaxation — sound; test drift |
| `Phase10FrontendIntegrationTests` | 1 | `GET /app/Tafseel-Teacher-Dashboard.dc.html` → **500**; the page is deleted but still allowlisted | **Real defect** (route) |

The protected financial suites pass in full on the working tree: `FinancialSafetyTests` 25/25,
`EarningsMaturityConcurrencyTests` 14/14, `AdminCommandCentreTests` 37/37, `OpenMarketplaceTests`
5/5, `PromotionsTests` 5/5, `MockPaymentSimulatorTests` 3/3, `Phase5OrderTests` 6/6,
`Phase9GovernanceTests` 5/5, plus 115/115 domain tests including `EarningsMaturityTests`,
`FinanceTests`, `OrderTests`, `CouponTests`.

Two coverage gaps the failures hide: refund-replay idempotency (`Phase7FinancialTests:100`) and
every startup validation rule in `ConfigurationValidationTests`. Both stay unverified until
their tests are repaired.

## 4. Runtime probe (observed, not inferred)

The published build ran against a throwaway LocalDB database (`TafseelBaselineSmoke20260914`,
dropped afterwards). Full output: [runtime-route-probe.txt](./inventory/runtime-route-probe.txt).

| Request | Result | Meaning |
|---|---|---|
| `GET /` | 302 → `/app/Tafseel-Landing.dc.html` | `Program.cs:432` sends the root to the legacy site, not the Angular client |
| that legacy landing, in a browser | **0 characters rendered**; uncaught `TypeError: Tafseel.campaignIsEligible is not a function` and `Tafseel.projectStudentJourney is not a function` | **The site root is a blank page** |
| `GET /ar`, `/en`, `/en/teachers` | 200; `/en` renders the Angular landing (984 characters) | The Angular client works where it is reached |
| `GET /en/student/overview` (signed out) | Angular redirects to `/en/auth/?return=/student/overview/` | Role guards work |
| `GET /app/Tafseel-{Student,Teacher,Quality,Admin}-Dashboard.dc.html`, `Teacher-Apply` | **500** ×5 | Deleted files still allowlisted; `Results.File` throws |
| `GET /app/js/open-marketplace.js`, `open-marketplace-locales.js` | **500** ×2 | Allowlisted, never tracked, not on disk |
| `GET /app/Tafseel-Chat.dc.html` | **301 permanent** → a 500 page | Browsers cache the redirect to a broken page |
| `GET /en/orders/{id}` in a browser | Angular `NG04002` (no matching route) → `/en/`, **blank** | Server-minted order links land on nothing |
| `POST /api/v1/favorite-teachers`, `GET /api/v1/open-marketplace/requests`, `POST …/offers/{id}/accept`, `PUT /api/v1/admin/{coupons,promotions,catalog/*}/{id}/active` | 404 | Calls the Angular client makes that the server does not accept |
| `PATCH /api/v1/admin/coupons/{id}/active` (control) | 401 | The real route exists; the client uses the wrong verb |
| `GET /health/live`, `/health/ready` | 200, 200 | — |

---

## 5. Inventories

### 5.1 Angular routes — `frontend-angular/src/app/app.routes.ts`

18 routes plus 5 redirects. **No `**` wildcard route**, so any unknown path fails with
`NG04002`. Prerendered: `about` and six `policies/*` pages in both locales. Everything else
renders client-side from `index.csr.html`.

| Path | Component | Guards |
|---|---|---|
| `/` | `LandingPageComponent` | — |
| `/about` | `AboutPageComponent` | — |
| `/teachers` | `BrowseTeachersPageComponent` | — |
| `/teachers/:teacherId` | `TeacherProfilePageComponent` | — |
| `/requests/new` | `NewRequestPageComponent` — **direct requests only**; requires `?teacherId` | authenticated |
| `/requests` | `MarketplacePageComponent` — student: my open requests; teacher: opportunities | authenticated |
| `/policies/:policy` (`/policies` → `terms`) | `PoliciesPageComponent` | — |
| `/auth` | `AuthPageComponent` — log in, register, reset, `?mode=confirm` | guest only |
| `/auth/confirm-email` | `ConfirmEmailPageComponent` | — |
| `/teach/apply` | `TeacherApplyPageComponent` | authenticated, Teacher |
| `/disputes` | `DisputesPageComponent` | authenticated |
| `/sessions/book` | `BookSessionPageComponent` | authenticated |
| `/checkout` | `PaymentPageComponent` — `?orderId` or `?liveSessionId` | authenticated |
| `/checkout/simulator` | `PaymentSimulatorPageComponent` | authenticated |
| `/student/:section` (`/student` → `overview`) | `DashboardPageComponent` | authenticated, Student |
| `/teacher/:section` (`/teacher` → `home`) | `DashboardPageComponent` | authenticated, Teacher |
| `/quality/:section` (`/quality` → `review`) | `DashboardPageComponent` | authenticated, QualityReviewer |
| `/admin/:section` (`/admin` → `admin/home`) | `DashboardPageComponent` | authenticated, Admin |

Not present, though the server links to them: `/orders/:id`, `/live-sessions/:id`,
`/requests/:id`, `/requests/:id/offers`, `/conversations/:id`, `/disputes/:id`,
`/teacher/reviews/:id`, `/teacher/earnings`, `/admin/operations/sessions`.

### 5.2 API endpoints — resolved from the running host

237 controller actions across 20 controllers, plus 18 minimal routes. Rate-limit policies in
use: `auth`, `confirmation`, `payment`, `upload`, `messaging`, `ai`.

| Controller | Endpoints | Called by Angular |
|---|---:|---:|
| Marketplace (teachers, profile, services, availability, showcases, samples) | 44 | 12 |
| Auth | 21 | 12 |
| Catalog | 19 | 12 |
| Governance (disputes, reviews) | 19 | 14 |
| Payments (payments, refunds, withdrawals, payout profiles, webhooks) | 19 | 9 |
| Admin | 18 | 9 |
| TeacherApplications | 15 | 10 |
| LiveSessions | 13 | 6 |
| Orders | 12 | 6 |
| Messaging (conversations, notifications) | 11 | 4 |
| LearningRequests | 11 | 6 |
| OpenMarketplace | 11 | 3 |
| Promotions | 7 | 3 |
| TeacherBusiness | 4 | 2 |
| AiMarketplace | 3 | 1 |
| FavoriteTeachers | 3 | 2 |
| MockPaymentSimulator | 3 | 3 |
| StudentLearningPreferences | 2 | 1 |
| AdminMarketplaceIntelligence | 1 | 1 |
| MarketplaceIntelligence (analytics events) | 1 | 0 |
| **Total** | **237** | **112** |

Two uncalled endpoints are correct to leave uncalled: the payment webhooks, which are server to
server. The ICS and CSV exports only need a download link. The other 121 are product capability
with no user interface.

### 5.3 Client ↔ server contract — `inventory/contract-match.json`

129 distinct call shapes in the Angular source. **116 match. 13 do not:**

| Client call | Site | Server reality |
|---|---|---|
| `POST /learning-requests` with `deliveryDate` | `http-request.gateway.ts:36-44` | Route matches; **body does not** — the record binds `PreferredDeliveryAt` (`OrderContracts.cs:7-12`), so the date falls back to `0001-01-01` and `Orders.cs:54-55` rejects it |
| `POST /learning-requests/{id}/accept` with `{}` | `dashboard-page.component.ts:154` | Route matches; **body does not** — `AcceptLearningRequest` requires `FinalPrice`, `Currency`, `AgreedDeliveryAt`, `RevisionAllowance` |
| `GET /open-marketplace/requests` | `http-request.gateway.ts:68` | POST only (publish) |
| `POST /open-marketplace/requests/{id}/offers` | `http-request.gateway.ts:94` | GET only; teachers submit at `POST /open-marketplace/opportunities/{id}/offers` |
| `POST /open-marketplace/offers/{id}/accept` | `http-request.gateway.ts:100` | No route; selection is `POST /open-marketplace/requests/{rid}/offers/{oid}/select` |
| `POST /learning-requests/{id}/publish` | `http-request.gateway.ts:105` | No route (use case never injected — latent) |
| `GET /teachers/availability` | `http-teacher.gateway.ts:210` | Binds `/teachers/{teacherId}` with `teacherId="availability"`; real route `GET /live-sessions/availability-summaries` |
| `POST /favorite-teachers` | `http-teacher.gateway.ts:258` | Add is `PUT /favorite-teachers/{teacherId}` |
| `PUT /admin/promotions/{id}/active`, `PUT /admin/coupons/{id}/active` | `dashboard-page.component.ts:173` | PATCH only |
| `PUT /admin/catalog/{services,subjects,topics}/{id}/active` | `dashboard-page.component.ts:175` | PATCH only |
| `PUT /admin/catalog/{educationLevels,assignments}/{id}/active` | `dashboard-page.component.ts:175` | PATCH only, **and** the type slugs are `education-levels` and `qualification-topics` |

The first two are body mismatches the route matcher cannot see; they were confirmed by reading
the bound records. Also: `GET /favorite-teachers` returns `TeacherCardDto[]`, but the client
reads `teacherId` from each item (`http-teacher.gateway.ts:252`).

### 5.4 Legacy routes — `src/Tafseel.Api/Program.cs:417-510`

| Route | Behaviour |
|---|---|
| `GET /` | Redirects to `/app/Tafseel-Landing.dc.html` — takes precedence over the locale-negotiating fallback |
| `GET /app/{file}` | Allowlist of 18 `.dc.html` names. 13 are published from `legacy-archive/` (200); 5 dashboards are deleted from disk (500) |
| `GET /app/Tafseel-Chat.dc.html` | Permanent redirect to the deleted student dashboard |
| `GET /app/js/{file}` | 10 allowlisted names; `open-marketplace.js` and `open-marketplace-locales.js` do not exist (500) |
| `GET /app/js/vendor/{file}` | React, ReactDOM, Babel standalone, SignalR — Babel is why CSP keeps `'unsafe-eval'` |
| `GET /app/support.js`, `/app/css/tafseel.css` | Legacy runtime and unminified stylesheet |
| `GET /app/assets/brand/{file}`, `/app/assets/fonts/{family}/{file}` | Brand assets and fonts (includes unreferenced Inter) |
| `GET /favicon.ico` | Served from the legacy `frontend/` folder |
| fallback `/{*path}` | 404 for `/api`, `/hubs`, `/health`; otherwise redirects to `/{ar|en}{path}{query}` and serves a prerendered page or `index.csr.html` |

### 5.5 Background workers

All seven are registered in production (`hosted-services.json`) and scan on a `PeriodicTimer`.
On failure, all seven log at `Warning` and keep running. None emits a metric.

| Worker | Interval | Does | Gate | Covered by |
|---|---|---|---|---|
| `OrderAutoReleaseWorker` | 5 min | Releases escrow for delivered orders after max(72 h, dispute window) | `Payments:AutoReleaseEnabled` | `FinancialSafetyTests` |
| `EarningsMaturityWorker` | 5 min | Moves `TeacherPending` to `TeacherAvailable` once the dispute exposure ends | — | `EarningsMaturityConcurrencyTests`, `EarningsMaturityTests` |
| `LiveSessionSettlementWorker` | 5 min | Finalizes `*Pending` live sessions and settles escrow | — | `Phase6LiveSessionTests` (1 drift) |
| `OpenMarketplaceReservationWorker` | 1 min | Expires two-hour offer reservations back to `OpenForOffers` | — | `OpenMarketplaceTests` |
| `DisputeSlaWorker` | 15 min | Escalates overdue disputes to admins | — | `Phase9GovernanceTests` |
| `NotificationOutboxWorker` | 10 s | Drains the notification outbox | — | `Phase8MessagingTests` |
| `DataRetentionWorker` | 24 h | Deletes expired read notifications, auth records, analytics events | `Privacy:*` | — |

### 5.6 Links the server hands to users

Two schemes, both broken today.

**`AppRoutes` constants** (`src/Tafseel.Application/Common/AppRoutes.cs`) all point at
`/app/Tafseel-*.dc.html`. Used: `TeacherApply` ×8, `TeacherProfileArea` ×3,
`TeacherApplyForSubject` ×3, `TeacherHome` ×2, `OpenRequests` ×2, `BrowseTeachers` ×2, and one
each of `TeacherVideos`, `TeacherServices`, `TeacherProfile`, `TeacherEarnings`, `StudentHome`,
`QualityShowcase`, `QualityApplication`, `CheckoutSimulator`. Thirteen constants resolve to the
five deleted pages. `TeacherApplicationService.cs:674-682` returns them as the teacher's
`nextUrl` after login.

**Angular-shaped literals** in notifications: `/orders/{id}` ×20, `/live-sessions/{id}` ×20,
`/disputes/{id}` ×10, `/requests/{id}` ×7, `/requests/{id}/offers` ×2, `/teacher/earnings` ×2,
`/conversations/{id}`, `/teacher/reviews/{id}`, `/admin/operations/sessions`. None exists in
the Angular route table. The dashboard also never renders a notification's `actionUrl` (0
references in the Angular source).

**Email URLs** in all four `appsettings*.json` point at `/app/Tafseel-Auth.dc.html`. The Angular
`/auth` page already handles both `?mode=confirm&email&token` and reset tokens
(`auth-page.component.ts:108-121`), and the fallback preserves the query string, so the fix is
configuration only.

---

## 6. What this baseline changed on disk

- **Added (untracked):** this folder and `scripts/baseline/`.
- **Rebuilt (gitignored):** `frontend-angular/dist`, `frontend-angular/src/generated`, `bin/`, `obj/`.
- **Temporarily changed, then restored byte for byte:** `tests/Tafseel.IntegrationTests/packages.lock.json` and `tests/Tafseel.ArchitectureTests/packages.lock.json`. An unlocked restore was needed to build; the originals were backed up and copied back. `git status` shows the same 302 entries as before the run, plus the two new folders.
- **LocalDB:** every database the runs created was dropped. Thirteen `TafseelTestApi_*` databases created between 2026-08-01 and 2026-09-07 by earlier runs were already there and were left alone. The SQL Server test fixture leaks databases on some failure path.
- **`.claude/launch.json`:** a temporary smoke-test entry was added and removed.

## 7. Limitations

- Docker was not built or run; the `Dockerfile` finding from the 2026-09-13 audit is still a static read.
- The runtime probe was anonymous. Authenticated journeys were not driven end to end in a browser; their status comes from the contract match, source reads, and backend tests.
- The two body mismatches in §5.3 are confirmed from source; they were not reproduced with a request.
- The SQL Server suite ran on LocalDB, not the SQL Server 2022 container CI uses.
- The last commit's CI script gates (`check-js`, publish validation, EF drift) were not run; only its build and test suites were.
