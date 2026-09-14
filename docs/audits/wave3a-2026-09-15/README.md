# Wave 3A — teacher supply through the Angular product

Branch `feat/wave3a-teacher-supply`, from `a55c80f` (Wave 2). Scope: J11-05 reviewer decides,
J11-06 profile, J11-07 services and prices, J11-08 availability, J11-09 publication. Wave 3B
(demand and order fulfilment) and Wave 3C (withdrawals, admin finance) were not started.

## The path, end to end

No Postman call, SQL edit or seeded business state. The seed (`scripts/dev/E2ESeed`,
`TAFSEEL_E2E_SCENARIO=supply`) creates a quality reviewer identity and catalog data only
(two subjects with a qualification topic each, a topic, an asynchronous and a live service type).

| # | Step | Screen | E2E step |
|---|------|--------|----------|
| 1 | Register, confirm from the email, sign in | `/auth` → `/auth/confirm-email` → `/auth` | J2 |
| 2–4 | Apply for a subject, upload the demo, submit | `/teach/apply` | J11-01 |
| 5 | Reviewer finds and opens the application | `/quality/applications` → `/quality/applications/:id` | J11-05 |
| 6 | Watch the demo, start review, request changes → teacher sees the feedback and resubmits → approve; a second subject is rejected | same | J11-05 ×4 |
| 7 | Complete the profile | `/teacher/profile` | J11-06 |
| 8 | Create services at valid prices; switch off/on | `/teacher/services` | J11-07 |
| 9 | Weekly windows and time off | `/teacher/availability` | J11-08 |
| 10–11 | Readiness turns green; publish | `/teacher/publication` | J11-09 |
| 12 | Visitor finds the teacher in `/teachers`, opens the profile | `/teachers`, `/teachers/:id` | Visitor |

`tests/browser/wave3a-teacher-supply.e2e.mjs`: **18/18** on a fresh throwaway database against
the verified publish output ([log](./evidence/e2e/wave3a-teacher-supply.log),
[screenshots](./evidence/e2e/screenshots/)). It also proves the negatives through the real API:
nothing sellable before approval and a rejected subject refused (`teacher_not_approved`), the demo
endpoint refusing an anonymous request (401), the server's own overlap check
(`availability_conflict`), no request sent for an incomplete decision, an empty profile or an
out-of-range price, and the Arabic publication screen at 390px without horizontal scroll.

## Commits

| Capability | Commit |
|------------|--------|
| Quality application queue, review and decision (J11-05); workspace shell; problem messages; ar/en strings | `e1bc8d7` |
| Teacher profile, services, availability, publication screens (J11-06..09) | `2f8d3d5` |
| Routing: the supply sections as their own screens; moved links keep working | `80ac671` |
| Server: no self-review; supply authorization tests; onboarding `nextUrl` | `b80db50` |
| Apply wizard shows the reviewer's feedback (J11-02) | `bd794dc` |
| Registration and policies links named no route; client navigation guard | `f0f8340` |
| Wave 3A E2E, supply seed scenario, route probe checks | `9f249dc` |
| This report, evidence and the matrix | the commit after `9f249dc` |

## Matrix rows

| Row | Before | Now |
|-----|--------|-----|
| J11-05 reviewer decides | NO UI | **DONE** — revoke **PARTIAL** (below) |
| J11-06 teacher profile | NO UI | **DONE** |
| J11-07 services and prices | NO UI | **DONE** |
| J11-08 availability | NO UI | **DONE** |
| J11-09 profile publication | NO UI | **DONE** |
| J11-04 reviewer starts review | WORKS (row renderer, fixed priority) | **DONE** on the queue and review screens |
| J11-02 apply | WORKS | **DONE** — corrected: feedback on changes-requested was never shown |
| J2-01 register | DONE (Wave 1) | corrected: sign-up landed on the not-found page |
| J11-03 withdraw | NO UI | unchanged — not needed by the path |
| J11-10 / J11-11 media, showcases | NO UI | unchanged — not a blocker |
| J12-01 balance | PARTIAL | unchanged — no balance row touched |

**Revoke** needs a qualification id (`POST /teacher-qualifications/{id}/revoke`) and no read
endpoint returns one: `OperationalQualifiedSubjectDto` and `TeacherQualificationCardDto` carry the
subject id only. No endpoint or field was added; revocation stays unreachable from the UI until a
read contract exposes the id.

## Screens and routes

| Route | Screen | Role |
|-------|--------|------|
| `/quality/applications` | queue: scope, kind, status, order, counts, paging | QualityReviewer |
| `/quality/applications/:applicationId` | review: facts, assignment, demo, history, reviews, start review, decision | QualityReviewer |
| `/teacher/profile` | about you; languages, education levels, topics; certifications, experience | Teacher |
| `/teacher/services` | service types with policy; offerings; create, edit, on/off | Teacher |
| `/teacher/availability` | weekly windows; time off | Teacher |
| `/teacher/publication` | state, blockers with links, checklist, publish/unpublish | Teacher |

The screens are feature folders (`features/quality`, `features/teacher-setup`) with ports, HTTP
gateways, use cases and models; bindings load with their routes, so none of it is in the initial
bundle (693.6 kB of 700 kB). They share `WorkspaceShellComponent`, which is the design system's
dashboard shell (`tf-dashboard-shell`, `tf-dash-*`, the mobile drawer) with the same sidebar
entries as `DASHBOARDS`. Nothing was added to `DashboardPageComponent`; its fixed-priority
"Start review" row action was removed.

Moved: the teacher's qualifications, videos and reviews tabs are `/teacher/qualifications`; the
reviewer's showcases are `/quality/showcases`. `?tab=` links of the old sections and
`/quality/review` redirect in the client; `AppRoutes` and the legacy redirect table name the new
places.

## API calls added

Quality: `GET /teacher-applications/queue`, `GET …/queue/summary`, `GET /teacher-applications/{id}`,
`POST …/{id}/start-review` (If-Match), `POST …/{id}/decision` (If-Match),
`GET …/{id}/demo/content` (declared in `dynamic-client-calls.json`, fetched by `ProtectedFile`).

Teacher: `GET/PUT /teachers/me`, `GET /languages`, `GET /topics`, `GET /education-levels`,
`PUT /teachers/me/{languages,topics,education-levels}`, `POST/DELETE /teachers/me/{certifications,experience}`,
`GET /teachers/me/eligible-subjects`, `GET /teachers/me/marketplace-services`,
`POST /teachers/me/services`, `PUT …/services/{id}` (If-Match), `PUT …/services/{id}/active` (If-Match),
`PUT/DELETE /teachers/me/availability/rules`, `POST/DELETE /teachers/me/availability/exceptions`,
`GET /teachers/onboarding-status`, `PUT /teachers/me/publication`.

Contract gate: 175 call shapes, 175 matches, **0 violations**; `--strict` exit 0. No allow-list,
no wildcard.

## Publication blockers handled

Rendered from `GET /teachers/onboarding-status` `blockingReasons`, in Arabic and English, each
linked to its screen: `email_unconfirmed` (`/auth/confirm-email`), `account_suspended` (no link),
`qualification_required` (`/teach/apply`), `profile_incomplete` (`/teacher/profile`),
`active_service_required` (`/teacher/services`), `availability_required` (`/teacher/availability`).
Also translated for `GET /teachers/me` and publish refusals: `teacher_not_approved`,
`eligible_active_service_required`. `profile_not_published` is the publish action itself. An
unknown code is shown as-is. Publish is enabled only when `readyForPublication`; the E2E sees
`profile_incomplete` + `active_service_required`, then `availability_required` alone once a live
service exists, then none.

## Authorization

The client guards are convenience; the tests are on the API.

- `Wave3ASupplyAuthorizationTests` (provider-neutral): each of 23 supply actions carries its
  central permission; students and quality reviewers get 403 on the teacher editors (profile,
  publication, topics, credentials, services, availability, onboarding); students and teachers get
  403 on the queue, detail, start-review and decision — the teacher for their own application.
- `Wave3AReviewAndOwnershipTests` (SQL Server): a user holding Teacher **and** QualityReviewer
  cannot start or decide their own application; another teacher cannot switch or edit a service,
  delete time off or delete a credential that is not theirs, and the owner's data is unchanged.

## Backend production files changed, and why

| File | Change | Why |
|------|--------|-----|
| `Infrastructure/TeacherApplications/TeacherApplicationService.cs` | `EnsureNotOwnApplication` in start-review and decision (`self_review_forbidden`); approved-but-unpublished `nextUrl` → `/teacher/publication` | Demonstrated defect: roles are additive and a teacher-reviewer could approve themselves. The domain is unchanged; readiness logic is unchanged |
| `Application/Common/AppRoutes.cs` | `QualityApplications`, `QualityApplication(id)`, `QualityShowcases`, `QualityShowcase(id)`, `TeacherVideos` point at the new routes; `TeacherPublication` added | Server links name the screens that now exist |
| `Api/Routing/LegacyLinks.cs` | old Quality and Teacher dashboard sections redirect to the new routes | Same |

`Tafseel.Domain`, `FinancialService`, escrow, earnings maturity, disputes, payment idempotency,
reconciliation and migrations: unchanged (`git diff a55c80f -- src/Tafseel.Domain src/Tafseel.Infrastructure/Persistence/Migrations`
is empty; `FinancialService.cs` untouched). No DTO, field or endpoint added.

## Defects found on the way

1. **Self-review** (server) — above.
2. **Sign-up landed on the not-found page** — the auth page navigated to `/confirm-email`. Since
   the client was added. Guard: `AppRoutesTests.Client_navigation_names_an_angular_route`.
3. **Policies page linked to `/browse`** — found by that guard.
4. **Apply wizard hid the reviewer's feedback** on a changes-requested application; step labels
   printed "1. 1.".
5. **Review screen kept the previous application** when navigating from one review to another.

Observations, not changed: approval turns the qualification demo into a public profile sample
(`TeacherTeachingSample.FromQualificationDemo`), so the checklist's "public sample" is ticked and
the public profile plays the demo; the public profile labels a live service "Recorded" with
"1 days" delivery; `GET /teachers/me` returns an empty profile (no lists) until the core profile is
saved, so the editor asks for "About you" first.

## Verification

| Gate | Result |
|------|--------|
| `dotnet restore --locked-mode` | exit 0 |
| `dotnet format --verify-no-changes` | exit 0 (after `dotnet format whitespace` on two new test files) |
| Release build (incl. Angular) | 0 warnings, 0 errors |
| Architecture / Domain / Application | 1/1 · 117/117 · 14/14 |
| Integration, provider-neutral | **357/357** (Wave 2: 267) |
| Integration, SQL Server | **218/218** (Wave 2: 216) |
| Angular unit tests | **270/270** in 29 files (Wave 2: 199) |
| Contract gate / `--strict` | 175/175/0 · exit 0 |
| `check-js` | pass |
| EF pending model changes | none |
| publish + `validate-publish.ps1` | pass |
| `deploy-gates.tests.ps1` | 57/57 |
| Wave 3A E2E | **18/18** |
| Wave 2 E2E regression | **6/6** |
| Wave 1 E2E regression | **8/8** |
| route probe (asserting) | **48/48** ([probe](./evidence/runtime-route-probe.txt)) |
| clean checkout (`git archive 9f249dc`) | locked restore, `npm ci`, build 0 warnings; 1/1 · 117/117 · 14/14 · neutral 357/357 · SQL Server 218/218; Angular 270/270; `--strict` exit 0 ([summary](./evidence/clean-checkout.txt)) |
| baseline reproduction (`run-baseline.sh`) | working tree, disposable copy and `git archive HEAD` all green; Angular 270; every .NET suite; `check-js`, deploy and migration script tests; no pending model changes; publish and validation; baseline matcher 144/144 with 0 wrong verbs, gate 175/175/0 ([summary](./evidence/baseline-reproduction.txt)) |

[Verification summary](./evidence/verification.txt).

## Not verified here

- **G-20** (container image): Docker is not installed on this machine and nothing was pushed, so
  the **Docker / image** CI job has not run for this branch. Still pending external CI.
- **Credential rotation** remains an external action before staging security approval.
