# Batch A — UX-04 (product statuses and fields) and UX-05 (canonical marketplace paths)

Branch `feat/ux04-ux05-status-and-paths`, from `0870a63` (Release Control 3 + DEC-13). Gate 4 (Build) and
Gate 5 (E2E/Release) for the two tickets the board's first batch names
([UX-04](../../tickets/v1/UX-04.md), [UX-05](../../tickets/v1/UX-05.md)). No other ticket was started.

## What changed, and why

### UX-04 — the lists stopped showing the machine's version of the truth

The API serializes every status as an integer and no DTO carries a status name, so the generic dashboard
printed `0`, `1`, `2` as badges, fell back to an id or an email for a card title, and labelled fields
"Currency", "Updated", "Total" and "Count" — with a search box and a Refresh button over mixed record types.

- **One vocabulary** (`frontend-angular/src/app/shared/vocabulary/status-vocabulary.ts`) names every status a
  student or teacher can meet — learning request, order (× payment state), live session, teacher offer,
  dispute, withdrawal, payout details, teacher offering, qualification, conversation scope — in Arabic and
  English, with a tone and the verb that belongs to **this** viewer. The same order reads
  «بانتظار الدفع» + «ادفع الآن» to its student and "Waiting for the student's payment" to its teacher; a
  pending session outcome names whoever is being waited on.
- **One card per source** (`features/dashboards/models/dashboard-card.ts`): a title that is never an id or an
  email, at most a few labelled facts (amount, agreed delivery, deadline, budget, when, duration…), one call
  to action, and nothing for reference rows such as the languages list. Unknown sources get a safe title and
  no raw fields.
- **Item screens read from the same vocabulary**, so a list and the screen it opens agree: request detail,
  offers, opportunity, order detail, live session.
- **Notifications**: the server writes `title`/`body` in English only. The client now renders copy by
  notification `type` (41 types) and falls back to a localized generic line for a type it does not know;
  Arabic never shows the English server title, and the body is shown only in English.
- **Checkout** no longer prints truncated order and request ids; **disputes** use the approved status and
  resolution wording; `FormatService.relative` gives "2 hours ago" / «قبل ساعتين».
- Admin and Quality lists are unchanged (out of scope; their wording is acceptable per UX_PRINCIPLES §6.6).

### UX-05 — one path per marketplace goal

`/requests` (the Wave 2 inline marketplace) duplicated the Wave 3B screens: choosing an offer, sending an
offer, and "Post a request" all had two places. It is no longer a page:

| Who opens `/requests` | Lands on |
|-----------------------|----------|
| Student | `/requests/new` (the request-mode choice) |
| Teacher | `/teacher/opportunities` |
| Admin / Quality Reviewer | their own home |
| any role, with `?requestId=` | that request's own screen for the role (`/requests/:id` or `/teacher/opportunities/:id`) |
| `?requestId=` that is not a request id | as if there were no id |

The public header offers a signed-in teacher «طلبات مفتوحة» / "Open requests"; the landing page, both
footers, the about page and the product story link to `/requests/new`. `MarketplacePageComponent` is
unrouted, not deleted (`B11-16` removes it once nothing references it). No endpoint, DTO or authorization
changed.

**One server defect fixed:** the reservation reminder ("Complete payment to keep your Offer") linked to the
bare list, so a student who followed it had to find their own request. It now links to the request
(`OpenMarketplaceService.cs:349`). The test was written first and failed with
`Expected: "/requests/{id}"  Actual: "/requests"`. The Development demo promotion points at `/requests/new`.

## Verification

| Gate | Result |
|------|--------|
| `dotnet restore --locked-mode` · `dotnet format --verify-no-changes` | exit 0 · exit 0 |
| Release build (incl. Angular) | **0 warnings, 0 errors** |
| Architecture / Domain / Application | 1/1 · 117/117 · 14/14 |
| Integration, provider-neutral | **374/374** (was 375: the header's two hard-coded `/requests` links became one runtime-chosen link, so that scan-driven theory case is gone) |
| Integration, SQL Server | **224/224** (was 223: + the reminder-link test) |
| Angular unit tests | **353/353 in 39 files** (was 331 in 37) |
| Contract gate / `--strict` | 217/217/0 · exit 0 (no API change) |
| `check-js` · `check:i18n` | pass · **1,054 keys** in en/ar |
| EF pending model changes | none |
| publish + `validate-publish.ps1` · `deploy-gates.tests.ps1` | pass · 57/57 |
| Route probe (asserting) | **63/63** (adds `/en/requests`, `/ar/requests?requestId=`, both legacy `.dc.html` redirects) |
| **UX-04 journey** `ux04-product-words` | **7/7** |
| **UX-05 journey** `ux05-canonical-paths` | **6/6** |
| Wave 1 regression | **8/8** (fresh database) |
| Wave 2 regression | **5/5** (fresh database; the forwarding step replaces the two inline-marketplace steps) |
| Wave 3A regression | **18/18** (fresh database) |
| Wave 3B direct / open marketplace / messaging / live session | **15/15 · 9/9 · 8/8 · 9/9** (fresh database) |

[Verification summary](./evidence/verification.txt) · [route probe](./evidence/runtime-route-probe.txt) ·
[journey logs and screenshots](./evidence/e2e/).

Every journey ran against the verified publish output in Development on throwaway `TafseelE2E*` databases
seeded by `scripts/dev/E2ESeed`; the journeys only read the database. The UX-05 host ran with
`OpenMarketplace__OfferReservationMinutes=20` so the reminder falls due inside the worker's next one-minute
scan rather than 90 minutes later; every other host used the default 120.

## What the journeys prove

**UX-04** (`ux04-product-words`, Arabic at 390px and English on desktop) walks nine student and nine teacher
dashboard sections with real work in several states and asserts on the rendered cards: no numeric or
enum-looking badge, no GUID or email in a title, no `null`, no "Currency"/"Updated"/"Count", no search box or
Refresh button, and — in Arabic — every badge and field label in Arabic. It also checks the role-aware
reading of one order (student «بانتظار الدفع» + «ادفع الآن» vs teacher "Waiting for the student's payment"
with "Your net earnings"), the open request's «يستقبل العروض» + «قارن العروض», the withdrawal policy in
words, and a notification that reads «طلبك مقبول — أكمل الدفع» in Arabic and "Your request was accepted —
complete payment" in English.

**UX-05** (`ux05-canonical-paths`) proves the forwarding for both roles, the stored `?requestId=` deep link,
that no inline marketplace control is reachable, that the API still answers 403 to the wrong role and 404 to
the wrong participant, and that the Arabic payment reminder opens the reserved request and its checkout.

## Findings (not fixed here)

| # | Finding | Where it belongs |
|---|---------|------------------|
| 1 | The UX-04 ticket's notification table missed the server's `NewMessage` type. Copy was added and the ticket table corrected. | closed in this batch |
| 2 | The generic dashboard's own shell is still the Wave 2 one: at 390px the sidebar leaves a narrow content column, and the definition list wraps tightly. The words are right; the shell is not. | `UX-03` replaces it; `UX-06` verifies the result |
| 3 | `TeacherProfilePageComponent` emits an `NG8107` template warning (`?.` on a non-nullable value) in `ng build`. Pre-existing, unrelated to this batch; the Release build is still 0 warnings. | Backlog (hygiene, with `B11-16`) |
| 4 | Retired sections (`/student/payments`, `/student/saved`, …) still exist as dashboard sections; UX-04 only fixed their words. | `UX-03` |
| 5 | The Wave 2 journey's deep-link assertions compared paths without the app's trailing slash. Fixed in the journey (test only). | closed in this batch |

## Commits

| Commit | What |
|--------|------|
| `e9747bb` | UX-04: vocabulary, card presenter, dashboard wiring, item screens, dispute copy, checkout ids, locales, specs |
| `aa8bc0c` | UX-05: forwarding route and guard, header/footer/landing/about links, server reminder link and demo promotion, route probe, integration test |
| `6abff6a` | Browser journeys for both tickets; Wave 2 and Wave 1 updated for the retired page and the Arabic notification copy |
| `DOCS_COMMIT` | This report and the ticket/board/blocker/readiness updates |

## Blocker count

**44 → 42.** `UX-04` and `UX-05` are Done; no ticket was added. Recalculated by the blocker-count validation
over [`V1_RELEASE_BLOCKERS.md`](../../releases/V1_RELEASE_BLOCKERS.md): open blocking decisions stay at 2
(DEC-08, DEC-12); tickets that can start immediately are 12 (FIN-01, UX-07, UX-08 and the nine security,
infrastructure and engineering tickets).

## Not done here

Everything else in Release Control 3: `UX-01`, `UX-02`, `UX-03`, `UX-06`, `UX-07`, `UX-08`, `UX-09` and
`FIN-01` were not started. No provider, infrastructure, tax or hosting work was touched.
