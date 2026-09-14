# Wave 1 — the Angular client is the site

Phase 1 / Wave 1 of the [remediation matrix](../baseline-2026-09-14/REMEDIATION_MATRIX.md), on
branch `chore/phase-0b-preserve-and-green`, starting from Phase 0B `b4b7d81`. Nothing was
pushed or deployed. `Tafseel.Domain`, `FinancialService`, escrow, earnings maturity, the
exposure/dispute window, idempotency, reconciliation and the financial migrations were not
touched. Wave 2 was not started.

## Commits

| Commit | Purpose |
|---|---|
| `2ad40df` | **test** — G-17 and G-18: database initialisation runs before any hosted service; request query budgets count only request commands |
| `1c9c5ca` | **web** — routes for every server link, the order page, the not-found page, onboarding fallback |
| `e8b8fd9` | **web** — forms submit through Angular (`FormsModule`) instead of reloading the page |
| `de7c927` | **web** — notification actions; linked dashboard items are focused |
| `5f47780` | **links** — `AppRoutes` names Angular routes; 48 notification literals use it; email and config URLs name `/auth` and the site root |
| `d373698` | **auth** — reset sends `password`; both known contract violations removed in the same commit |
| `abc81e0` | **host** — root negotiation, `/app` redirect table, legacy runtime removed, `'unsafe-eval'` dropped, Dockerfile |
| `9919a1b` | **ci** — `check-js`, publish validation and the route probe describe the shipping client |
| `1da1a4b` | **e2e** — browser journeys against the published build |
| `60c786e`, `b9ea0f3`, `4268b36` | **test/ci** — three SQL tests asserted legacy file names; `check-js` runs in an exported tree; `AppRoutesTests` parses CRLF checkouts |
| docs commit | matrix, this report, evidence |

## G-17 root cause and evidence

`WebApplicationFactory` under minimal hosting does not start the host from `CreateHost`: it runs
`Program`, and `app.Run()` starts the hosted services on the entry-point thread. The factory's
`CreateHost` override ran `EnsureCreated` and seeded identity on another thread at the same
time, so the background workers (outbox, reminders, settlement, auto-release …) issued queries
on the shared in-memory SQLite connection while the schema was still being created. SQLite's
connection keeps a command list that is not thread-safe; a concurrent add/remove produced the
observed `ArgumentOutOfRangeException` in `SqliteConnection.RemoveCommand`.

A scratch probe held initialisation open for 1.5 s: before the fix, hosted services started at
+260 to +627 ms and one foreign database command ran during initialisation in each of three
runs; after it, hosted services started after initialisation ended, on the same thread, with
zero foreign commands. The fix makes initialisation the first registered `IHostedService`
(hosted services start sequentially in registration order). No retry, skip, ordering attribute
or collection change.

- 20 consecutive complete provider-neutral runs on the fix commit, 149/149 each:
  [evidence/g17-provider-neutral-20-runs.txt](./evidence/g17-provider-neutral-20-runs.txt)
- 20 consecutive complete runs on the final Wave 1 code, 258/258 each:
  [evidence/final-provider-neutral-20-runs.txt](./evidence/final-provider-neutral-20-runs.txt)

G-18 (found in the Phase 0B clean-checkout run): `TeacherComparisonTests` counts SQL commands
for one request, and the counting interceptor also counted a background worker's tick when it
landed inside the measurement. The request-budget counter now counts only commands issued
within an HTTP request; the bootstrap counter still counts everything.

## Routes, before and after

Observed on a published build (`dotnet Tafseel.Api.dll`, Development, throwaway LocalDB).
Before: [baseline probe](../baseline-2026-09-14/inventory/runtime-route-probe.txt). After:
[evidence/runtime-route-probe.txt](./evidence/runtime-route-probe.txt) — 37 asserted checks, 0 failed.

| Request | Before | After |
|---|---|---|
| `GET /` | 302 → `/app/Tafseel-Landing.dc.html` (paints nothing) | 302 → `/ar/` or `/en/` by `Accept-Language`, query kept |
| `GET /ar/`, `/en/` | 200 shell | 200 shell, landing renders (E2E) |
| `/en/orders/{id}` | 200 shell, `NG04002`, blank | 200, order page or explicit "unavailable" |
| `/en/live-sessions/{id}` | 200 shell, blank | forwards to the role's sessions list, card focused |
| `/en/conversations/{id}`, `/en/messages` | 200 shell, blank | forwards to the role's messages |
| `/ar/requests/{id}`, `/ar/requests/{id}/offers` | 200 shell, blank | forwards to marketplace / requests / opportunities / work by role and sourcing |
| `/en/disputes/{id}` | blank | `/disputes?selectedId=` |
| `/ar/teacher/reviews/{id}` | blank | `/teacher/profile?tab=reviews&reviewId=` |
| `/en/admin/operations/sessions` | blank | `/admin/operations?tab=sessions` |
| `/ar/no/such/page` | blank shell | not-found page |
| `/api/…`, `/hubs/…`, `/health/…` unknown | 404 | 404, never the client |
| `/app/Tafseel-{Landing,Auth,…}.dc.html` (13) | 200 legacy page | 302 → Angular route, locale negotiated, ids moved into the path |
| `/app/Tafseel-{Student,Teacher,Quality,Admin}-Dashboard.dc.html`, `Teacher-Apply` | **500** | 302 → `/student/overview`, `/teacher/home`, `/quality/review`, `/admin/home`, `/teach/apply` |
| `/app/Tafseel-Chat.dc.html` | **301** → Student dashboard → 500 | 302 → `/messages` (role-neutral) |
| `…Student-Dashboard.dc.html?section=messages` (the cached 301 target) | 500 | 302 → `/messages`, so a teacher holding the cached 301 reaches their own inbox |
| `/{locale}/app/…` | client shell | 302, locale kept |
| `/app/js/open-marketplace*.js` | **500** | 404 |
| `/app/support.js`, `/app/js/*`, `/app/css/tafseel.css`, `/app/assets/fonts/*` | 200 | 404 |
| `/app/assets/brand/*` | 200 (legacy copy) | 200 (client's copy; delivered emails link here) |
| CSP `script-src` | `'self' 'unsafe-eval'` + hash | `'self'` + hash |

### `/app/*` classification (Step 9)

| Old address | Now | Why |
|---|---|---|
| 18 known `.dc.html` pages | 302 to the Angular route | links live on in emails, stored notifications, bookmarks |
| `Tafseel-Chat.dc.html` | 302 to `/messages` | cached permanent redirect |
| `assets/brand/{file}` | served | logo in delivered emails; mail clients may not follow image redirects |
| everything else (`support.js`, `js/*`, `js/vendor/*`, `css/*`, `assets/fonts/*`, unknown names, nested paths) | 404 | no inbound link needs them; the runtime is deleted |

Remaining legacy routes: only the redirect table and the brand-file route above, and they stay
because addresses already sent to people cannot be recalled. `favicon.ico` is served from the client.

## R-05: complete

Removed: every `.dc.html` route, the csproj `frontend/` content, `legacy-archive/` (13 pages),
`support.js`, React, ReactDOM, Babel standalone, the SignalR browser bundle, six page scripts,
18 CI scripts that only read page source, and `'unsafe-eval'`. Kept deliberately:
`css/tafseel.css` and `assets/` (the design-system sources the Angular build copies in) and
`js/locales.js`, `js/boot-prefs.js` (read by design-lab, not published or served). No surviving
dependency needs `'unsafe-eval'`: `check-js` finds no `eval`/`new Function` in the emitted
bundles, and the E2E records no CSP violation on any page it opens.

## API contract, before and after

| | Phase 0B | Wave 1 |
|---|---|---|
| client call shapes | 155 | 157 (order page, per-item read) |
| route matches | 142 | 144 |
| known violations | 20 | **18** |
| normal gate | pass | pass |
| `--strict` | exit 1 | exit 1 (expected until Wave 2) |

Removed: J2-04 `BODY_MISSING_REQUIRED` and `BODY_UNKNOWN_FIELD` on `POST /auth/reset-password`.
No violation was added. Remaining, all pre-existing and tracked: J13-02 ×7 (PUT vs PATCH), J3-04 ×2,
J3-02 ×2, J3-07, J4-01, J4-07, J1-04, J4-02, J1-07, J4-05.

## Found during Wave 1

- **Forms reloaded the page (J2-01, J2-03).** Sign-in, sign-up, reset, dispute create/reply/resolve,
  the offer form and the teacher search bound `(ngSubmit)` without `FormsModule`, so submitting
  performed a native GET and no request was sent. The baseline had these as WORKS from API tests
  alone; the E2E reset journey exposed it. Fixed, with a CI guard.
- **G-19, open:** `/auth/refresh` shares the sign-in rate limit (10 a minute per IP outside
  Testing) and the client calls it on every full page load, so ten link opens or reloads in a
  minute sign a reader out. The E2E paces around it. A security-policy decision, not changed here.
- A review-moderation notice for a live-session review linked to `/orders/` with no id; it now
  links to the session.
- The favicon link pointed at a file the build never emitted.
- The Dockerfile copied deleted files and never built the client (G-20). Rewritten; not built here
  because Docker is not installed on this machine.

## Credentials (Step 10)

The Development `SeedUsers:Password` value (kept in user secrets) was searched for without
printing it:

- **current source (HEAD):** 0 files
- **build output and publish directories:** none
- **git history:** present in 5 commits, 3 of them on `origin/main` since 2026-08-08 (in a UAT
  closure document and four release-8 browser scripts); removed from tracked files by `c57864a`
  and `6858fa7`. History is not rewritten in this phase.
- **local untracked copies:** `tests/browser/.auth/r8-session.env` and
  `tests/browser/_blocker-visual-2.mjs` (both gitignored), and copies inside earlier baseline
  scratch trees outside the repository. `.godaudits/EVIDENCE.json` (gitignored audit output) held
  it and was redacted.

**External blocker — rotation required.** The value is public in the pushed history, so it must
be treated as disclosed:

1. Set a new `SeedUsers:Password` in user secrets for `src/Tafseel.Api`.
2. Change the password of every account that ever used it (`admin@gmail.com`, `student@gmail.com`,
   `teacher@gmail.com`, `quality@gmail.com` and any UAT identity) in every database that has them —
   development and any shared or staging database. Seeding never resets an existing password, so
   this is a manual reset.
3. Revoke those accounts' sessions and refresh tokens.
4. Delete or re-secret the two local files above.

Separately, the four staging secrets in the ignored `deploy/iis-runasp/appsettings.Staging.Host.json`
(H-S1 in the audit) still need rotation. That file's email URLs were updated locally to `/auth`
and the site root; upload the file with the next deploy (see `deploy/RUNASP-STAGING.md`).

## Test totals (final code)

| Suite | Result |
|---|---|
| locked restore | exit 0 |
| `dotnet format --verify-no-changes` | exit 0 |
| build (Release, incl. Angular) | 0 warnings, 0 errors |
| Architecture | 1/1 |
| Domain | 117/117 |
| Application | 14/14 |
| Integration, provider-neutral | 258/258 in each of 20 consecutive runs (Phase 0B: 149) |
| Integration, SQL Server | 214/214 (Phase 0B: 213/215; one legacy-page test removed, G-13) |
| Angular unit (Vitest) | 136/136 in 20 files |
| Angular build | budgets met (initial 699.8 kB of 700 kB) |
| contract gate | pass (18 known); `--strict` exit 1 |
| route probe (asserting) | 37/37 |
| `check-js` | pass |
| `dotnet publish` + `validate-publish.ps1` | pass |
| E2E `wave1-canonical-site.e2e.mjs` | 8/8 ([log and screenshots](./evidence/e2e)) |
| clean checkout (`git archive 4268b36`) | locked restore, `npm ci`, build 0 warnings 0 errors; Architecture 1/1, Domain 117/117, Application 14/14, provider-neutral 258/258, SQL Server 214/214, `check-js` pass ([log](./evidence/clean-checkout.txt)) |
| baseline reproduction (`run-baseline.sh`, on `b9ea0f3`) | working tree and disposable copy: restore, format, Angular build and 136 tests, Architecture 1, Domain 117, Application 14, provider-neutral 258/258, SQL Server 214/214, `check-js`, deploy/migration script tests, no pending model changes, publish and validation all pass; contract 157/144/18. Its clean-checkout half found 14 `AppRoutesTests` failures from CRLF checkout, fixed in `4268b36` ([summary](./evidence/baseline-reproduction.txt)) |

New tests: `WebClientRoutingTests`, `AppRoutesTests` (reads the Angular route table; mutation-checked),
`EmailLinkJourneyTests`, Angular specs for destinations, link guards, not-found, order page,
account gateway, dashboard link rules.

## Remaining red or open gates

- `check-api-contract.mjs --strict` — 18 violations, Wave 2 by design.
- G-19 refresh rate limit — needs a decision.
- G-20 Docker image — unverified locally.
- R-06 — 91 older browser scripts still target the deleted pages; no gate runs them.
- Credential rotation — external.

## Recommendation

**Phase 1 / Wave 1 can close.** Every Wave 1 exit criterion is met and proven on a clean
checkout: `/` serves the Angular client in both locales, no `/app/*` address answers 500,
every `AppRoutes` value, notification link and configured email URL resolves to an Angular
route (checked against the route table itself), reset and confirmation work end to end in a
browser, notification actions work by keyboard and on a phone, the legacy runtime and
`'unsafe-eval'` are gone, and CI's JS and publish gates describe what ships. G-17 held for
40 consecutive complete runs across two code states (the final 20 on `b9ea0f3`; the only later
code change, `4268b36`, touches one test's parser and was verified on the clean checkout).

Close it with three things tracked outside the code, none of which blocks Wave 2:

1. **Credential rotation** (external) — the seed password in pushed history and the four staging
   secrets.
2. **G-19** — decide the refresh rate limit before real traffic; signed-in readers who reload
   often will be logged out.
3. **G-20** — build the Docker image once in CI.

Wave 2 has not been started.
