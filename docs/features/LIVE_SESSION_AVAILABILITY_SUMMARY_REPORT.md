# Live-Session Availability Summary Report

Date: 2026-07-29  
Baseline: `79be4cf` on `main`  
Status: Implemented locally; browser verification conditional  
Decision source: [ADR-006](../decisions/ADR-006-TEACHER-AVAILABILITY-AND-CAPACITY.md)

## Findings

- The existing scheduler already had the required source data: weekly rules, absolute UTC exceptions, service duration allowlists, reserving bookings, timezone conversion, transactional booking revalidation and schedule locking.
- `AwaitingPayment` and `Confirmed` reserve a slot. `Cancelled` does not. There is no expiry policy for `AwaitingPayment`.
- Every overlapping `TeacherAvailabilityException` blocks a candidate slot; exception reasons are private.
- The encoded lead-time rule is only `startsAt > current UTC time`; no additional minimum-notice window exists.
- DST-invalid and DST-ambiguous local times are skipped. A focused US Eastern DST-gap test proves that the next valid recurrence is selected.
- Duration comes from the selected live-session catalog type. The public general summary uses the minimum allowed duration and returns the exact associated service ID.
- Existing Browse `availableThisWeek` logic proved only that a rule existed and that no broad exception overlapped the week. It did not account for duration, bookings, current time, DST or partial exceptions and was therefore not truthful.
- Public Teacher profiles exposed raw weekly rules and exceptions. Those collections are now owner-only.

### Availability Evidence

| State | Persisted Evidence | Formula | Public Meaning | Included |
|---|---|---|---|---|
| `available_today` | Eligible live service, active rule, no blocking exception, no reserving booking | Earliest bookable UTC slot converts to the viewer's current local date | At least one slot can currently be booked today | Yes |
| `next_available` | Same evidence as above | Earliest bookable slot is inside 30 days but not viewer-today | Earliest future live-session slot | Yes |
| `no_upcoming_availability` | Eligible service and rules | No raw candidate fits the service duration in the bounded horizon | No qualifying slot in 30 days | Yes |
| `no_schedule_configured` | Eligible scheduled service | No weekly rule exists | The Teacher has not configured a weekly schedule | Yes |
| `temporarily_unavailable` | Rules plus persisted exceptions | Raw candidates exist, but every candidate is exception-blocked | Persisted exception data blocks the horizon | Yes |
| `fully_booked` | Rules plus reserving bookings | Candidates remain after exceptions, but every candidate overlaps `AwaitingPayment` or `Confirmed` | All valid candidates in the horizon are occupied | Yes |
| `not_applicable` | Public eligible services contain no requested live-session service | No scheduled service applies | Live sessions are not offered for this scope | Yes |

## Root Cause

Marketplace surfaces had no canonical compact availability contract. Browse used a rule-presence approximation, public profiles rendered raw schedule data, comparison had no availability row, and each surface would otherwise need to call the detailed slot endpoint independently. This made availability incomplete, privacy-sensitive and vulnerable to N+1 behavior.

## Fix

Added one bounded batch summary method and endpoint backed by the existing slot calculator, then reused it from Browse, Comparison and Public Profile. The same refactor keeps the detailed Book Session endpoint authoritative. Public raw schedule collections were removed, unsupported online/weekly-presence UI was deleted, and the two schedule mutations proven capable of invalidating reserved sessions now coordinate through the existing schedule lock and fail safely.

## Product Behavior

- Search is bounded to 30 viewer-local calendar days.
- General Teacher summaries choose the earliest slot across eligible active `live_session` services and return the associated service ID.
- A service-specific request is allowed only for one Teacher.
- Asynchronous services return `not_applicable`.
- A summary is informational and never reserves a slot.
- Exact selection remains on Book Session, and booking/rescheduling still revalidate transactionally.
- `availableThisWeek` is explicitly rejected with `availability_filter_unavailable`; Browse no longer displays that unsupported filter or online-presence UI.

## Architecture

`ILiveSessionService.GetAvailabilitySummariesAsync` is the single application boundary. `LiveSessionService.CalculateSlots` is shared by both compact summaries and the existing detailed slot endpoint. No parallel scheduler, cache, new entity or migration was introduced.

The bounded batch endpoint performs four set-based, `AsNoTracking` reads:

1. public eligible services;
2. weekly rules;
3. intersecting exceptions;
4. reserving bookings.

It then calculates candidates in memory with deterministic UTC ordering. The endpoint accepts at most 12 distinct valid Teacher IDs and propagates the cancellation token.

## API Contract

`GET /api/v1/live-sessions/availability-summaries`

Query:

- repeated `teacherIds` (1–12 distinct valid GUIDs);
- optional `teacherServiceId`, valid only with one Teacher;
- optional `viewerTimeZoneId`.

Response:

- `requestedCount`;
- `unavailableCount`;
- `summaries[]` containing Teacher ID, associated service ID, fixed allowlisted state, optional UTC start/end, optional duration, horizon end, resolved viewer timezone and fallback flag.

The response excludes booking IDs, occupied-event details, Student data, exception reasons, storage data and login presence. Unpublished, suspended, unqualified, revoked, inactive or missing Teachers are omitted and counted unavailable.

## Availability Formula

For each distinct required duration:

1. Expand matching weekly rules inside `[viewer-day-start UTC, viewer-day-start + 30 local days)`.
2. Skip invalid or ambiguous DST local times.
3. Exclude candidates at or before current UTC.
4. Require the complete service duration to fit the rule.
5. Remove candidates overlapping any persisted exception.
6. Remove candidates overlapping `AwaitingPayment` or `Confirmed`.
7. Sort by UTC start, UTC end and then service ID.

`fully_booked` is used only when raw candidates survive exception filtering and every remaining candidate is occupied.

## Timezone Handling

- Rule expansion uses each rule's persisted timezone.
- UTC remains the stored and API timestamp.
- `available_today` uses the validated viewer timezone.
- Missing browser timezone falls back to UTC and returns `timeZoneFallbackUsed: true`.
- Explicit invalid timezone identifiers return a safe 400 response.
- Frontend display uses `Intl.DateTimeFormat` with the returned viewer timezone.
- The DST test skips `2027-03-14 02:00` in US Eastern and returns `2027-03-21 06:00Z`.

## Service-Specific Rules

- Only active, public, Teacher-selectable `live_session` catalog services whose subject is active and whose qualification is approved and not revoked are scheduled.
- Multiple services are evaluated deterministically; the earliest slot's exact service ID is returned.
- Book Session continues to request detailed slots with that same service ID and duration.
- Current persistence stores allowed durations on the catalog type, not per `TeacherService`. A policy for changing catalog durations while future bookings exist remains a business-rule decision.

## Query and Performance Evidence

- Batch size: maximum 12 Teacher IDs.
- Test matrix: 12 requested IDs, 10 returned public Teachers, 11 eligible public services including two services for one Teacher.
- SQL reads: exactly 4 for the summary matrix, independent of Teacher count.
- Matrix candidate expansion: 50 raw candidates across the 30-day fixture horizon; repeated services with the same duration reuse one calculation per Teacher/duration.
- Observed summary requests in the local SQL integration logs were approximately 5–122 ms after fixture setup.
- No cache was added because no measured need was demonstrated.

## Concurrency and Booking Safety

- Booking and rescheduling retain Serializable transactions, `session-schedule:{teacherId}` SQL application locks, conflict queries and row-version handling.
- The summary performs reads only and creates no reservation.
- Focused tests prove that a stale summary cannot permit a second booking and the existing safe conflict response is preserved.
- `AwaitingPayment` and `Confirmed` remove slots; `Cancelled` does not.
- Detailed slots contain the summary's next slot when service, duration, timezone and horizon match.

## Schedule Mutation Findings

| Mutation | Classification | Result |
|---|---|---|
| Delete a weekly rule containing a future reserving booking | Production Bug | Blocked under the same schedule lock with `availability_booking_conflict` |
| Add a blocking exception over a future reserving booking | Production Bug | Blocked under the same schedule lock with `availability_booking_conflict` |
| Change profile timezone with future bookings | Already Guarded | Rules retain their own timezone and bookings retain immutable UTC instants; profile timezone does not reinterpret them |
| Edit allowed service durations with future bookings | Business Rule Required | Duration is catalog-level; no policy was invented in this pass |

## Security and Privacy

- Anonymous access is intentional and limited to published eligible Teachers.
- Invalid IDs, invalid timezones and oversized batches fail safely.
- Public profiles no longer return raw rules or exceptions.
- Tests assert no booking, exception or Student fields are present.
- The endpoint follows the existing public Marketplace exposure policy; no private ownership endpoint was broadened.
- Existing exception middleware keeps SQL details and stack traces out of HTTP responses.

## Frontend and Accessibility

- Browse requests one summary batch for the visible six-card page and never one request per card.
- Comparison uses the same batch and adds a neutral availability row without ranking.
- Public profile uses the same summary and links to Book Session when a live service exists.
- Fixed-height/min-height status regions prevent layout jumps.
- Loading and request failure are distinct from every persisted empty state.
- English/Arabic keys cover every state, error/loading, UTC fallback and booking action.
- Status regions have accessible labels; the booking action is a keyboard-native link; no state relies on color alone.
- The online dot, `Online now` and the legacy weekly filter were removed.

## Validation

| Command or check | Exit | Passed | Failed | Skipped / Notes |
|---|---:|---:|---:|---|
| `dotnet restore Tafseel.sln --locked-mode` | 0 | 8 projects restored/up-to-date | 0 | Locked mode preserved |
| `dotnet format Tafseel.sln --verify-no-changes --no-restore` | 0 | 1 gate | 0 | Re-run after concurrent edits |
| `dotnet build Tafseel.sln -c Release --no-restore` | 0 | 8 projects | 0 | 0 warnings, 0 errors |
| `dotnet test tests/Tafseel.IntegrationTests/Tafseel.IntegrationTests.csproj -c Release --no-build --filter FullyQualifiedName~LiveSessionAvailabilitySummaryTests --logger "console;verbosity=minimal"` | 0 | 3 | 0 | Availability matrix, mutation/concurrency guard and DST |
| `dotnet test tests/Tafseel.IntegrationTests/Tafseel.IntegrationTests.csproj -c Release --no-build --filter "FullyQualifiedName~LiveSessionAvailabilitySummaryTests\|FullyQualifiedName~Phase4MarketplaceTests\|FullyQualifiedName~TeacherComparisonTests\|FullyQualifiedName~Phase6LiveSessionTests" --logger "console;verbosity=minimal"` | 0 | 19 | 0 | Marketplace, comparison, booking/rescheduling regression |
| `dotnet test tests/Tafseel.ArchitectureTests -c Release --no-build --logger "console;verbosity=minimal"` | 0 | 1 | 0 | None |
| `dotnet test tests/Tafseel.Domain.Tests -c Release --no-build --logger "console;verbosity=minimal"` | 0 | 63 | 0 | None |
| `dotnet test tests/Tafseel.Application.Tests -c Release --no-build --logger "console;verbosity=minimal"` | 0 | 5 | 0 | None |
| `dotnet test tests/Tafseel.IntegrationTests -c Release --no-build --filter "Category!=SqlServer" --logger "console;verbosity=minimal"` | 1 | 78 | 1 | Unrelated concurrent Catalog initialization changed expected query count from 3 to 4 |
| `dotnet test tests/Tafseel.IntegrationTests -c Release --no-build --filter "Category=SqlServer" --logger "console;verbosity=minimal"` | 1 | 68 | 1 | Unrelated `Phase10FrontendIntegrationTests.Teacher_dashboard_edit_modal_keeps_service_fields_available` expects markup changed by concurrent Teacher Dashboard work; focused availability tests remain green |
| `node scripts/ci/check-frontend-integrity.mjs` | 0 | 12 entry points | 0 | Availability batching, fixed states and shared `Intl` presentation included |
| `node scripts/ci/check-localization.mjs` | 0 | 12 entry points / 2,026 paired keys | 0 | None |
| `./scripts/ci/tests/check-migration-safety.tests.ps1` | 0 | 9 | 0 | None |
| `./scripts/ci/tests/staging-migration.tests.ps1` | 0 | 34 | 0 | None |
| `./scripts/ci/tests/deploy-gates.tests.ps1` | 0 | 46 | 0 | None |
| `dotnet ef migrations has-pending-model-changes --project src/Tafseel.Infrastructure --startup-project src/Tafseel.Api --configuration Release --no-build` | 0 | 1 | 0 | No pending model changes |
| `./scripts/ci/check-migration-safety.ps1 -Script src/Tafseel.Infrastructure/Persistence/Migrations/20260729161500_AddServiceDescriptionAr.cs` | 0 | 2 operations allowed | 0 | The availability slice generated no migration |
| `dotnet publish src/Tafseel.Api/Tafseel.Api.csproj -c Release --no-restore -o <isolated-temp-directory>` | 0 | Publish | 0 | Framework-dependent output |
| `./scripts/ci/validate-publish.ps1 -PublishDirectory <isolated-temp-directory>` | 0 | Publish smoke | 0 | Published frontend and API artifacts validated |
| `git diff --check` | 0 | Whitespace gate | 0 | Line-ending warnings only |

Browser validation used `http://localhost:5089` in `Development` from a controlled `dotnet run --project src/Tafseel.Api -c Release --no-build --launch-profile http` process. English/Dark and Arabic/RTL/Light rendered at the available 1280px browser viewport with `scrollWidth == clientWidth`, no console errors, and no online/weekly-filter UI. The controlled process was stopped after validation; unrelated listeners on ports 8765 and 8766 were not touched.

## Files Changed

Availability implementation:

- `src/Tafseel.Application/LiveSessions/LiveSessionContracts.cs`
- `src/Tafseel.Api/Controllers/LiveSessionsController.cs`
- `src/Tafseel.Infrastructure/LiveSessions/LiveSessionService.cs`
- `src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs`
- `Tafseel-Browse-Teachers.dc.html`
- `Tafseel-Teacher-Profile.dc.html`
- `js/tafseel.js`
- `js/locales.js`
- `scripts/ci/check-frontend-integrity.mjs`
- `tests/Tafseel.IntegrationTests/LiveSessionAvailabilitySummaryTests.cs`
- `tests/Tafseel.IntegrationTests/Phase4MarketplaceTests.cs`

Documentation:

- `docs/features/LIVE_SESSION_AVAILABILITY_SUMMARY_REPORT.md`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

Several listed files also contain preserved concurrent user-owned Catalog/Teacher Application changes. This pass did not revert or claim those changes.

## Risks

- `AwaitingPayment` reserves indefinitely because no expiry product rule exists.
- Catalog-level duration edits with future bookings require an explicit business decision.
- The worktree contains unrelated concurrent changes and two failing validation areas (Catalog bootstrap query-count expectation and one Teacher Dashboard markup assertion); the safe availability diff should be reviewed or isolated before merge.
- The public calculation is intentionally on-demand. Add caching only after production measurement proves it necessary.

## Unverified Scenarios

- Development had zero legitimately published scheduled Teachers. Populated Browse cards, Comparison, Profile and Book Session could not be browser-validated without prohibited mock/direct database data.
- The available browser viewport was fixed at 1280px. The 375/768/1024/1440 matrix was not honestly claimed as dynamic browser evidence.
- Staging and Production were not accessed.

## Backward Compatibility

- Existing detailed slot, booking and rescheduling API contracts remain intact.
- Booking statuses, conflict behavior, prices, lifecycle rules and persistence schema are unchanged.
- Public profile schedule collections now intentionally return empty arrays; owner profile behavior is unchanged.
- The unsupported `availableThisWeek` approximation now fails explicitly rather than returning misleading results.

## Final Verdict

LIVE SESSION AVAILABILITY IMPLEMENTED BUT CONDITIONALLY VERIFIED

## Next Step

Teacher Portfolio Moderation and Showcase Workflow Investigation
