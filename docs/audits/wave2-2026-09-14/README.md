# Wave 2 — every Angular call matches the API

Phase 2 / Wave 2 of the [remediation matrix](../baseline-2026-09-14/REMEDIATION_MATRIX.md), on
branch `feat/wave2-contract-zero`, from the Wave 1 close (`c8c667d`). Nothing was pushed or
deployed. Wave 3 was not started.

**Result:** the contract gate went from 18 known violations to **0**, and
`check-api-contract.mjs --strict` **passes**. The journeys behind those calls were exercised
end to end — through the API with the exact client JSON, and in a browser against a published
build. G-19 is resolved. G-20 is waiting on the CI Docker job.

## Commits

| Commit | Purpose |
|---|---|
| `8cdbb06` | **auth / G-19** — refresh gets its own rate limit; a throttled refresh keeps the session; single-flight refresh |
| `7b76eb8` | **admin / J13-02** — PATCH and canonical catalog slugs through one tested mapping (18 → 11) |
| `6c16274` | **perf** — policy copy moves out of the initial bundle (700.8 kB → 685.0 kB) |
| `3ad16a0` | **requests / J3-02, J3-04** — create-request and assistant bodies (11 → 7) |
| `597ed06` | **marketplace / J4-02, J4-05, J4-07, J4-01** — list, offer, select; dead publish call removed (7 → 3) |
| `67a5a92` | **teachers / J1-04, J1-07** — availability summaries; favourite add via PUT (3 → 1) |
| `fba8d32` | **requests / J3-07** — accept dialog with complete terms (1 → 0) |
| `30061e5` | **test** — SQL Server journeys with the exact client bodies and headers |
| `466c2d8` | **e2e** — Wave 2 browser journeys and the `TafseelE2E*` seeder |
| `1ef2540` | **ci / G-20** — Docker job probes the Angular client instead of deleted pages |
| `58eab40` | **ci / deploy** — RunASP deploy, staging and production smoke no longer require the deleted landing page |
| `ed97b3c` | **tools** — the baseline matcher reads the gate's computed-call declarations |
| docs commit | matrix, this report, evidence |

## The 18 violations, before and after

Before: [evidence/known-violations-before.json](./evidence/known-violations-before.json).
After: [evidence/known-violations-after.json](./evidence/known-violations-after.json) — `"violations": []`.

| Row | Kind | Client call before | Now |
|---|---|---|---|
| J13-02 ×7 | WRONG_VERB | `PUT /admin/catalog/{assignments,educationLevels,services,subjects,topics}/{id}/active`, `PUT /admin/{coupons,promotions}/{id}/active` | `PATCH`, with `qualification-topics` and `education-levels` slugs, via `ADMIN_ACTIVE_TOGGLES` |
| J3-02 ×2 | BODY_MISSING_REQUIRED, BODY_UNKNOWN_FIELD | `POST /learning-requests` with `teacherId`, `deliveryDate`, `flexibleBudget`, no `preferredDeliveryAt` | `teacherServiceId, title, description, preferredDeliveryAt, budget` |
| J3-04 ×2 | BODY_MISSING_REQUIRED, BODY_UNKNOWN_FIELD | `POST /ai/request-assistant { prompt }` | `{ notes }`; response `draft.suggestedDescription` |
| J3-07 | BODY_MISSING_REQUIRED | `POST /learning-requests/{id}/accept {}` | `finalPrice, currency, agreedDeliveryAt, revisionAllowance` + If-Match + Idempotency-Key |
| J4-01 | NO_ROUTE | `POST /learning-requests/{id}/publish` | removed (dead code, see below) |
| J4-02 | WRONG_VERB | `GET /open-marketplace/requests` | `GET /learning-requests/mine`, filtered to sourcing mode 1 |
| J4-05 | WRONG_VERB | `POST /open-marketplace/requests/{id}/offers` | `POST /open-marketplace/opportunities/{id}/offers` |
| J4-07 | NO_ROUTE | `POST /open-marketplace/offers/{id}/accept` | `POST /open-marketplace/requests/{rid}/offers/{oid}/select` + If-Match + X-Offer-Version |
| J1-04 | SHADOWED | `GET /teachers/availability` (bound `/teachers/{teacherId}`) | `GET /live-sessions/availability-summaries` |
| J1-07 | WRONG_VERB | `POST /favorite-teachers` | `PUT /favorite-teachers/{teacherId}` |

No entry was added to the known-violations file. The only change to `dynamic-client-calls.json`
replaces the seven PUT declarations with the seven PATCH routes the mapping now sends.

| | Wave 1 close | Wave 2 |
|---|---|---|
| client call shapes | 157 | 156 |
| route matches | 144 | **156** |
| known violations | 18 | **0** |
| normal gate | pass | pass |
| `--strict` | exit 1 | **exit 0** |

## Dead client code removed

- **`MarketplaceGateway.publish(requestId)`** and the **`PublishRequest`** use case. They called
  `POST /learning-requests/{id}/publish`, which does not exist, and nothing called the use case.
  The server has no "publish an existing request" operation: it publishes by creating an open
  request (`POST /open-marketplace/requests`, `CreateOpenLearningRequest`). The Wave 3 open-request
  form (J4-01) will call that; adding an unused gateway method for it now would be untested
  speculation.
- **`MarketplaceGateway.request(requestId)`** — unused.
- **`AcceptOffer`** — replaced by `SelectOffer`, because selection reserves the request and does
  not create an order.

## G-19 — refresh rate limit

**Server** (`Middleware/RefreshRateLimit.cs`, `Program.cs`, `AuthController.cs`):
- `/auth/refresh` uses a separate `refresh` policy: a fixed window of 60 requests a minute per IP.
  Login, register, forgot password and reset keep the `auth` policy unchanged: 10 a minute
  outside Testing, 100 in Testing.
- A refresh rejection sets `Retry-After` and logs a warning with the correlation id, without IP
  or cookie material. It also increments the `tafseel.auth.refresh.throttled` counter on the
  `Tafseel.Api.Auth` meter.
- Token validation, rotation, the security-stamp check, session revocation and cookie attributes
  are unchanged. A 429 neither rotates nor clears the cookie.

**Client:**
- The session gateway turns a 429 into `RefreshThrottled` instead of "no session".
- `RestoreSession` keeps the session it holds on a throttle; only the request that needed a new
  token fails.
- A 401 or invalid refresh still signs the reader out.
- Refresh stays single-flight.

| Requirement | Test |
|---|---|
| login rate limit unchanged | `RefreshRateLimitPolicyTests`: login, register, forgot and reset are still bound to `auth`; `SignInThrottleUnchangedTests`: the 101st sign-in in Testing is 429 |
| refresh exceeds ten without sign-out | `RefreshBeyondSignInBudgetTests`: 15 rotating refreshes all 200; `/auth/me` still 200 |
| refresh throttles at its own limit | `RefreshThrottleTests`: the 61st is 429 with Retry-After and no Set-Cookie, the counter is incremented once, and sign-in is still served |
| concurrent refreshes collapse to one call | `auth-refresh.spec`: three concurrent 401s → one `/auth/refresh` → three replays with the new token |
| 401 / invalid refresh signs out | `auth-refresh.spec`, `use-cases.spec` |
| 429 does not | `auth-refresh.spec`, `use-cases.spec` (store unchanged, retry rejects with `RefreshThrottled`) |

## G-20 — Docker

**Externally pending.** Docker is not installed on this machine, so the image was not built.
The CI job that verifies it is **Docker / image** in `.github/workflows/docker.yml`, which runs
on pull requests to main and on main. It still asserted the deleted `.dc.html` pages; it now
builds the image and starts the hardened container with safe test configuration. It then checks:
- `/health/live` and `/health/ready`;
- `/` redirects to `/ar/`;
- the `/ar/` and `/en/` shells;
- the prerendered `/en/about/`;
- the main bundle;
- an old `/app` page redirects;
- 404 for `/app/appsettings.json`, an unknown `/app` script and an unknown API path.

The rewritten Dockerfile is unchanged.

## Found and fixed along the way

- **Deploy would have failed.** `scripts/ops/Deploy-TafseelRunAsp.ps1` required
  `frontend/Tafseel-Landing.dc.html` in the publish output. The staging and production smoke
  checks fetched the deleted landing page, and got a 302, which `curl -f` still passed. All now
  check the Angular shells (Wave 1 miss).
- **Initial bundle over budget.** Wave 2's auth code pushed the initial bundle past 700 kB. The
  cause was 13.7 kB of policy copy bound app-wide; it now loads with the policies page.
- **Offer list was always empty.** The client read `GET .../offers` as a page, but the API
  returns an array.
- **Actions offered where the domain refuses them.** Accept is now shown only while a request is
  pending review, and Decline only while pending or awaiting clarification.
- **Matrix correction (J1-07).** The favourites list already read the right field:
  `TeacherCardDto` serializes `teacherId`, as `Phase4MarketplaceTests` pins. Only add was broken.
- **Out of scope, reported only.** Browse cards do not render availability, so there was no
  browse-page availability to test; the profile carries it and is tested.

## Backend production files changed

Only G-19: `src/Tafseel.Api/Middleware/RefreshRateLimit.cs` (new),
`src/Tafseel.Api/Program.cs` (policy registration and rejection hook) and
`src/Tafseel.Api/Controllers/AuthController.cs` (refresh uses the new policy). No backend change
was needed for any of the 18 violations; every one was fixed on the client.

`git diff c8c667d..HEAD` is empty for:
- `src/Tafseel.Domain`
- `src/Tafseel.Application`
- `src/Tafseel.Infrastructure/Finance` (including `FinancialService`)
- `src/Tafseel.Infrastructure/Orders`
- the migrations

Escrow, earnings maturity, dispute/exposure, payment idempotency, financial concurrency and
reconciliation are untouched.

## Tests

| Suite | Result |
|---|---|
| locked restore | exit 0 |
| `dotnet format --verify-no-changes` | exit 0 (see verification note) |
| Release build (incl. Angular) | 0 warnings, 0 errors |
| Architecture / Domain / Application | 1/1 · 117/117 · 14/14 |
| Integration, provider-neutral | **267/267** (Wave 1: 258) |
| Integration, SQL Server | **216/216** (Wave 1: 214) |
| Angular unit | **199/199** in 26 files (Wave 1: 136 in 20) |
| Angular build | budgets met, initial 687 kB |
| contract gate / `--strict` | pass / **pass**, 0 violations |
| `check-js` | pass |
| EF pending model changes | none |
| `dotnet publish` + `validate-publish.ps1` | pass |
| `deploy-gates.tests.ps1` | 57/57 |
| route probe (asserting) | 37/37 |
| Wave 2 E2E | **6/6** |
| Wave 1 E2E regression | **8/8** |
| clean checkout (`git archive 58eab40`) | locked restore, `npm ci`, build; Architecture 1/1, Domain 117/117, Application 14/14, provider-neutral 267/267, SQL Server 216/216 |
| baseline reproduction (`run-baseline.sh`) | working tree and disposable copy all green (restore, format, Angular build and 199 tests, every .NET suite, `check-js`, deploy and migration script tests, no pending model changes, publish, validation); gate 156/156/0, `--strict` exit 0. Its separate matcher had a stale hand-copied call list reporting 7 wrong verbs; fixed in `ed97b3c`, now 128/128 ([summary](./evidence/baseline-reproduction.txt)) |

Evidence:
- [verification.txt](./evidence/verification.txt)
- [runtime-route-probe.txt](./evidence/runtime-route-probe.txt)
- [e2e/](./evidence/e2e)

### New E2E journeys (`tests/browser/wave2-contract-journeys.e2e.mjs`)

1. **J1-07** — profile favourite toggle sends PUT then DELETE, and never POST.
2. **J3-02** — teacher profile → request wizard: a past day blocks Next; submitting sends exactly the five keys and gets 201.
3. **J3-07** — the accept dialog:
   - is prefilled from the offering;
   - Cancel sends nothing;
   - an out-of-range price is marked and not sent;
   - Accept sends the four terms with If-Match and an Idempotency-Key;
   - the order exists awaiting payment, at the accepted price.
4. **J4-05** — opportunity → offer form sends the exact `SubmitTeacherOffer` body to the opportunity route and gets 201.
5. **J4-02 / J4-07** — the student list comes from `/learning-requests/mine`. Choosing an offer:
   - sends both version headers and gets 204;
   - shows the reservation;
   - stays on the page and creates no order.

Data comes from `scripts/dev/E2ESeed`, a dev tool outside `Tafseel.sln` that refuses any database
not named `TafseelE2E*`. The throwaway database was dropped after the run.

## Credentials

Unchanged by this wave, and no secret is reproduced here. Rotation remains an external
requirement before staging can be considered secure:

| Credential | Where it was exposed | Required action |
|---|---|---|
| historical seed/UAT password | pushed git history since 2026-08-08 | new `SeedUsers:Password`; reset and revoke the demo and UAT accounts in every database |
| staging database credential | ignored `deploy/iis-runasp/appsettings.Staging.Host.json` | rotate at the host, update the file |
| JWT signing secret | same file | rotate (invalidates all tokens) |
| email provider token | same file | rotate at Resend |
| payment webhook HMAC secret | same file | rotate at the provider and in the file |

## Remaining open

- **G-20** — needs the Docker / image CI run.
- **Credential rotation** — external.
- **Wave 3 surfaces.** J4-01 open-request form; J4-08 payment for a reserved open request.
  J8-02 and J12-01 (listed under Wave 2 in the original matrix) were not in this wave's scope.
- **R-06** — 91 older browser scripts still target the deleted pages; no gate runs them.

## Recommendation

**Wave 2 can formally close.** All 17 definition-of-done items hold:
- the known violations went from 18 to 0, and `--strict` passes;
- each fixed call is exercised through the API with the exact client body and headers, and in a browser;
- G-19 has its own policy and a throttle no longer signs readers out;
- the Wave 1 E2E suite is still green;
- protected financial and domain code is untouched;
- the clean checkout reproduces the result;
- no violation was replaced or allow-listed.

Two items stay open and are not code in this repository: **G-20** closes when the Docker / image
CI job runs green, and **credential rotation** remains required before staging or production can
receive security approval. Wave 3 has not been started.
