# Browser Certification Harness

A Playwright-based test harness for rendered, live-browser certification of the Tafseel
marketplace frontend — responsive/localization matrix, F-013 retention, and modal
accessibility. Lives entirely under `tests/browser/`, is Development/test-only tooling,
and is never referenced from production runtime code.

## Identifying the real Rate Teacher surface (read this before touching `rate-modal`)

The Student Dashboard's `?focus=rate` deep link does not always mount the star-rating
form. If the target order is Delivered but not yet Completed, or is Completed but
already reviewed, the app correctly falls back to the **Order Timeline** modal instead
(a real `role="dialog"` surface in its own right, but not a rating form). Prior
certification passes in this codebase's history mistakenly captured the Timeline modal
under the "Rate Teacher" label — that history is preserved, not erased, in
`docs/fixes/PHASE_4_FOUNDATION_QA_COVERAGE_CLOSURE.md` and closed in
`docs/fixes/PHASE_4_FOUNDATION_FINAL_ACCEPTANCE_GATE.md`.

**Required fixture state:** a genuine `status: Completed` (4), `paymentStatus: Paid`,
`hasReview: false` order, driven through the real API (Request -> Accept -> Payment
(browser-confirmed via Mock Checkout) -> Start -> Deliver -> Complete) — never via raw
SQL. `tests/browser/lib/surfaces.mjs`'s `RATE_READY_ORDER_ID` points `rate-modal` at
one such dedicated, stable order that is intentionally never rated, so the matrix can
open it repeatedly across all 24 viewport/mode cells without collapsing into the
Timeline modal partway through a run. If you need a fresh one, see
`tests/browser/fixture-matrix-rate.mjs` for the exact, reusable API sequence.

**Positive identification, not assumption:** `run-matrix.mjs`'s `rate-modal` cell
asserts exactly 5 rating-criteria score markers (`.../5`) are present in the dialog,
failing the cell with an explicit "likely the Order Timeline modal" message if they
aren't — this is enforced on every run, not just checked once manually.

## Rebuild before testing a frontend change

The Development server serves `.dc.html`/`js/`/`css/` from
`bin/Release/net8.0/frontend/`, a build-time copy of the repo root — **not** the repo
root directly. Editing `js/tafseel.js` or any `.dc.html` file and re-running the
harness against an already-running server will silently test the *old* code. Always
`dotnet build -c Release` (after stopping the running instance, since it holds the
output DLLs locked) and restart before certifying a frontend change.

## What it is / is not

- It is a **standalone Node project** (`tests/browser/package.json`) with its own
  `@playwright/test` dev dependency. It does not touch the .NET solution's dependency
  graph, `Tafseel.sln`, or any `.csproj`.
- It drives the **real application** over HTTP via a real Chromium instance — no DOM
  simulation, no mocked rendering.
- It authenticates via the **real Auth page and real login flow** for each of the four
  application roles (Student, Teacher, QualityReviewer, Admin) — it never forges a JWT
  or bypasses authorization. Release 5 Order Communication certification logs in **once
  per role**, persists Playwright `storageState` under `tests/browser/.auth/` (gitignored,
  never published), and reuses that cookie session. Refresh tokens rotate: only one live
  context per role; state is re-saved after navigations that call `/auth/refresh`.
  Theme/lang use `addInitScript` on `tafseel-theme` / `tafseel-lang`, not extra logins.
  Release 5 rate-limit-aware cert additionally traces first-party request timestamps
  (`tests/browser/lib/request-budget.mjs`) and waits until the rolling 60s global
  (300) and auth (10) windows have measured headroom before remounts — never a blind
  `sleep(20000)`, never a 429 retry marked PASS. Keep **one live context per role**;
  a second Student context rotates the refresh cookie and breaks remounts.
  Passwords stay in environment variables; storage-state files must not be committed.
- It is not part of `dotnet test` / the CI regression suite described in
  `docs/PROJECT_STATUS.md`; it is a separate, manually-invoked certification pass.

## Prerequisites

1. Node.js (v18+) and npm.
2. `cd tests/browser && npm install` (installs `@playwright/test`).
3. `npx playwright install chromium` (downloads the Chromium browser binary once;
   cached under `%LOCALAPPDATA%\ms-playwright` on Windows).
4. A running, controlled Tafseel API instance in `Development` (see below) pointed at
   the canonical Development database `(localdb)\TafseelLocal;Database=Tafseel`.
5. The Sprint 0.2 UAT identities already seeded into that database (Student, Teacher,
   QualityReviewer, Admin — see `src/Tafseel.Infrastructure/DependencyInjection.cs`
   `SeedDevelopmentAdditionalReviewerAsync` and the Sprint 0.2 report for provenance).

## Credentials

Never hardcoded in the harness or in any report. Passed via environment variables at
invocation time:

```
TAFSEEL_UAT_STUDENT_PASSWORD=...
TAFSEEL_UAT_TEACHER_PASSWORD=...
TAFSEEL_UAT_ADMIN_PASSWORD=...   # also used for the QualityReviewer UAT account
```

`tests/browser/lib/auth.mjs` reads these; it throws immediately if a required password
is unset for a role the run needs, rather than falling back to a hardcoded default.

## Running the controlled instance

```bash
dotnet build -c Release
cd src/Tafseel.Api
ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://127.0.0.1:5090 \
  dotnet bin/Release/net8.0/Tafseel.Api.dll
```

Confirm before running the harness:
```
curl http://127.0.0.1:5090/health/live    # expect 200
curl http://127.0.0.1:5090/health/ready   # expect 200
```

**Do not run the harness against Staging or Production.**

## Running the matrix

```bash
cd tests/browser
TAFSEEL_UAT_STUDENT_PASSWORD=... TAFSEEL_UAT_TEACHER_PASSWORD=... TAFSEEL_UAT_ADMIN_PASSWORD=... \
  node run-matrix.mjs <output-directory>
```

Writes `matrix.json` (one row per cell) and `summary.json` (`totalCells`/`passedCells`/
`failedCells`/`skippedCells`) to `<output-directory>`.

### Rate-limit pacing

The app's real `Development` rate limits (see `Program.cs`) include a strict `"auth"`
policy: 10 requests/minute, covering `POST /api/v1/auth/login` and — critically — the
opportunistic `POST /api/v1/auth/refresh` call the frontend fires on *every* page
navigation regardless of auth state. The global limiter is 300/minute per user/IP and
will 429 a chatty dashboard remount loop even when auth pacing is correct. The harness
therefore paces auth-sensitive navigations (~8s), Completed-Order remounts (~15s plus a
fresh limiter window), and locale-matrix retries (~20s). Unexpected HTTP 429 still
**fails** the cell — pacing is not a whitelist. This is a deliberate design choice to
respect the app's real, unmodified rate limits rather than weaken or bypass them for
testing convenience — a full 384-cell run takes on the order of 45–60 minutes as a
result. Do not reduce the pacing without also confirming the "auth" / global
`PermitLimit`/`Window` haven't changed.

Release 5 Completed-Order remount: Student Dashboard → Completed → Messages → navigate
away → reopen the same conversation. Composer must appear; `TafseelChat` missing after
`ready()` failure is an app boot defect, not a reason to skip the cell. Distinguish
flake (wrong selector, DC placeholder click, unpaced refresh 429) from app failure
(half-mounted widget, duplicate hubs, stale conversationId).

A `POST /api/v1/auth/refresh` `401` on an anonymous/public surface is expected (a
logged-out visitor has no session to refresh) and is explicitly excluded from the
matrix's failure criteria (`isBenignFirstPartyFailure` in `run-matrix.mjs`) — it is not
weakening the assertions, it is scoping "application-caused 4xx/5xx" to genuine defects
rather than an intentional, harmless background probe.

## Matrix definition

- **16 surfaces** — `tests/browser/lib/surfaces.mjs` (`SURFACES`), each with a role
  (`null` for public) and a real URL, including fixed live UAT fixture IDs (a teacher,
  a service, and orders in specific lifecycle states) that must exist in the canonical
  Development database for the full matrix to be reachable.
- **6 viewports** — 375×667, 390×844, 768×1024, 1024×768, 1280×800, 1440×900.
- **4 modes** — Arabic/RTL/Dark, Arabic/RTL/Light, English/LTR/Dark, English/LTR/Light,
  applied via the same `localStorage` keys (`tafseel-theme`, `tafseel-lang`) the app's
  own `boot-prefs.js` reads, followed by a reload so hydration picks them up exactly as
  a real user's persisted preference would.
- 16 × 6 × 4 = **384 cells**.

Per cell the harness checks: page load success, `html`/`body` horizontal overflow,
`lang`/`dir`/`data-theme` correctness for the requested mode, absence of a rendered
`{{ }}` template leak in the DOM, absence of a `{{`/`%7B%7B` leak in any first-party
network request, absence of new first-party console errors / page errors / failed
first-party requests (excluding the one documented benign case above), presence of a
reachable primary action, and — for the two modal surfaces — that the dialog renders
with `role="dialog"` and stays fully within the viewport.

## Harness self-test

`tests/browser/self-test.mjs` proves the assertion logic can genuinely fail before
trusting a green matrix. It runs entirely against local `file://` scratch HTML (never
the real app) and checks five negative controls: horizontal overflow detection,
`console.error` detection, a `%7B%7B` network-URL template-leak detection, a wrong-`dir`
detection, and a missing-required-modal detection. Run with `node self-test.mjs
<output-directory>`.

## Screenshot evidence

`run-matrix.mjs` does not capture a screenshot per cell (384 screenshots would be noise,
not signal). Representative and failure screenshots are captured separately — see
`docs/fixes/evidence/phase4-foundation-browser-certification/screenshots/` and the
Foundation Browser Certification report for the exact required set.

## Cleaning up

The harness never mutates the real application source or the canonical database beyond
the read/navigate/click actions a real user session would perform. `tests/browser/`
itself (including its `node_modules` and Playwright browser cache) is test
infrastructure only — it is not referenced by the published API output and is excluded
from any `dotnet publish`.
