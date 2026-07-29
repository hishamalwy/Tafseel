# ADR-006: Teacher Availability and Capacity

## Status

Proposed.

## Context

Tafseel already has one live-session scheduler. Weekly rules, dated exceptions, service duration metadata, slot lookup, booking, rescheduling, cancellation, optimistic concurrency and a per-Teacher SQL Server scheduling lock are implemented. The public marketplace, however, has no normalized availability summary.

The current `AvailableThisWeek` search predicate is not a booking calculation: it checks for any weekly rule and excludes a Teacher when any exception overlaps a broad seven-day UTC range. It does not evaluate the rule's weekday or local time, service duration, elapsed slots, reserving bookings or the viewer's timezone. Public profiles also expose raw availability rules and exception reasons. Neither behavior is suitable as the public availability contract.

Order and learning-request lifecycles contain no persisted workload limit, daily acceptance limit or approved definition of which statuses consume Teacher capacity. This decision therefore separates live-session availability from request capacity.

Repository evidence:

- [Marketplace entities](../../src/Tafseel.Domain/Marketplace/Marketplace.cs)
- [Marketplace contracts](../../src/Tafseel.Application/Marketplace/MarketplaceContracts.cs)
- [Marketplace service](../../src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs)
- [Live-session contracts](../../src/Tafseel.Application/LiveSessions/LiveSessionContracts.cs)
- [Live-session service](../../src/Tafseel.Infrastructure/LiveSessions/LiveSessionService.cs)
- [Live-session entities](../../src/Tafseel.Domain/LiveSessions/LiveSessions.cs)
- [Order entities](../../src/Tafseel.Domain/Orders/Orders.cs)
- [Live-session integration tests](../../tests/Tafseel.IntegrationTests/Phase6LiveSessionTests.cs)
- [Marketplace integration tests](../../tests/Tafseel.IntegrationTests/Phase4MarketplaceTests.cs)

## Existing Capabilities

The implementation pass must reuse:

- `TeacherAvailabilityRule`: weekday, local start/end wall time, rule timezone and optional 15–240 minute slot step.
- `TeacherAvailabilityException`: absolute `DateTimeOffset` start/end and a private reason.
- `TeacherProfile.TimeZoneId`: Teacher display/default timezone.
- `ServiceCatalogItem.RequiresScheduling` and `AllowedDurations`.
- `GET /api/v1/teachers/{teacherId}/slots`: bounded detailed slot lookup; the service clamps the requested horizon to 1–31 days.
- The existing slot algorithm: valid rule window, supported duration, `startsAt > now`, DST-safe conversion, no exception overlap and no reserving booking overlap.
- `LiveSessionStatus.AwaitingPayment` and `Confirmed` as the only reserving statuses.
- Serializable booking/rescheduling transactions, the `session-schedule:{teacherId}` SQL Server application lock, conflict recheck and booking row version.
- The existing Teacher Dashboard availability area and Book Session page. No second scheduler is permitted.

The present dashboard only toggles days and writes fixed 17:00–21:00, 60-minute rules. It is a configuration UI limitation, not a second source of truth.

## Product Definitions

All calculations use a 30-calendar-day bounded horizon beginning on the viewer's local date.

### Eligible scheduled service

An eligible scheduled service is an active Teacher service whose canonical catalog item:

- has code `live_session`;
- is active, public and Teacher-selectable;
- has `RequiresScheduling = true`;
- has at least one supported duration;
- belongs to a published, otherwise publicly eligible Teacher with an active approved, non-revoked qualification for the service subject.

### Summary duration

Availability is calculated separately for every eligible live-session service using that catalog item's minimum supported duration. The Teacher summary selects the earliest result across those service-duration pairs. Any returned slot includes `teacherServiceId` and `durationMinutes`, and the UI labels it as the earliest slot for that duration. A summary for a shorter duration must never imply that a longer duration is available.

### Available today

`available_today` means at least one currently bookable summary-duration slot remains whose UTC start, converted to the viewer's display timezone, falls on the same local date as current UTC time converted to that timezone.

Past and current starts are excluded. Weekly rules, service duration, slot step, exceptions, reserving bookings and DST validity all participate.

### Next available slot

The next slot is the earliest bookable summary-duration slot within the 30-day horizon. It is returned as an absolute start/end plus viewer-local start, viewer timezone, service ID and duration. The Book Session page remains authoritative when the Student chooses a different service or duration.

### State classification

Classification is deterministic and ordered:

1. `no_scheduled_service`: no eligible live-session service exists.
2. `no_schedule_configured`: an eligible live-session service exists but no weekly rule exists.
3. `available_today`: at least one bookable slot is on the viewer's current local date.
4. `next_available`: a bookable slot exists later in the horizon.
5. `temporarily_unavailable`: rule-derived compatible candidates exist, but explicit persisted exceptions remove all of them.
6. `fully_booked`: candidates remain after exception filtering, but every candidate overlaps an `AwaitingPayment` or `Confirmed` booking.
7. `no_upcoming_availability`: rules exist but produce no duration-compatible, future, DST-valid candidate in the horizon.

When exceptions remove some candidates and reserving bookings remove every remaining candidate, the state is `fully_booked`. Missing rules never mean vacation. A generic `unavailable` state and `available_now` are not approved.

## Service-Type Rules

- Only `live_session` services use calendar availability.
- Non-scheduled services continue through learning-request acceptance and display `no_scheduled_service`, not a calendar state.
- Public cards and comparison show a session summary only when the Teacher has an eligible live-session service.
- Teachers offering different service types remain comparable, but the UI explicitly distinguishes “live sessions not offered” from “schedule not configured.”
- Recorded explanations and other request-based services do not require weekly availability.

## Timezone Rules

- Bookings and exceptions remain absolute `DateTimeOffset` values and are compared in UTC.
- Weekly rules remain local wall time plus the rule's persisted timezone. The rule timezone is authoritative for generating that rule's occurrences.
- `TeacherProfile.TimeZoneId` is a display/default value only; it must not reinterpret existing rules.
- The viewer display timezone comes from a valid browser timezone supplied to the API. If the browser cannot provide one, the client uses UTC and states that times are shown in UTC.
- An explicitly supplied unsupported timezone is rejected with the existing safe `invalid_time_zone` behavior; it is not silently replaced.
- “Today” uses the viewer's local date.
- Invalid and ambiguous daylight-saving wall times are omitted, matching the current slot engine.
- Changing the profile timezone does not mutate existing rules. Changing schedule timezone requires explicit rule replacement, preserving the wall-time intent and making the affected rules visible before confirmation. Mixed rule timezones remain valid because the current model supports them.

## Capacity Rules

### Session capacity

One Teacher can have one reserving live-session booking at a time. Group sessions, overlapping sessions and multiple participants in one slot are outside the current model.

For candidate interval `C`:

```text
bookable(C) =
  schedule_candidate(C)
  AND NOT exception_overlap(C)
  AND NOT EXISTS booking(
    Teacher = candidate Teacher
    AND Status IN (AwaitingPayment, Confirmed)
    AND booking overlaps C)
```

Cancellation and terminal statuses release the interval. `AwaitingPayment` continues to reserve it because that is the current lifecycle. No expiry period is invented in this decision.

### Request capacity

Request capacity is excluded from the first release. The repository has no approved maximum concurrent active orders, accepted requests per day, unpaid reservation rule or status-to-capacity formula. `Accepted`, order `AwaitingPayment`, `InProgress`, `Delivered` and `RevisionRequested` must not be counted until those business rules are approved.

Public session availability therefore makes no claim about the Teacher's request workload.

## API Architecture Decision

Select **Option C: a dedicated bounded batch summary endpoint**.

Proposed contract for the implementation pass:

```http
GET /api/v1/live-sessions/availability-summaries
    ?teacherIds={teacherId}&teacherIds={teacherId}
    &viewerTimeZoneId={timeZoneId}
```

Rules:

- Accept 1–12 unique Teacher IDs, matching the existing marketplace default page size.
- Return results in requested order.
- Apply the same public publication and qualification gates as marketplace search.
- Treat missing, unpublished and ineligible Teachers identically; do not disclose which gate failed.
- Discover eligible live-session services server-side.
- Calculate each service at its minimum allowed duration and choose the earliest bookable result.
- Return only:
  - `teacherId`;
  - normalized `state`;
  - `viewerTimeZoneId`;
  - horizon end;
  - optional next slot containing `teacherServiceId`, absolute start/end, viewer-local start and `durationMinutes`.
- Localize state labels in the frontend; API state codes remain stable.

Browse calls the batch endpoint once for the visible 12-card page. Comparison calls it once for its two or three Teachers. Profile calls it with one Teacher. Book Session continues using the detailed slot endpoint.

## Public Surface Decision

The first implementation covers:

- **Teacher Dashboard settings:** enhance the existing availability editor with actual start/end, slot step, rule timezone and dated exceptions.
- **Public Teacher Profile:** show one normalized summary and a Book Session action; stop rendering raw public rules and exceptions.
- **Browse Teacher card:** show the same compact normalized summary; remove/replace the nonfunctional “Online now” and crude `AvailableThisWeek` behavior.
- **Teacher Comparison:** show the same normalized summary without a calendar grid.
- **Book Session:** keep the existing detailed service/duration-specific slot picker as the booking source of truth.

Student Dashboard is unchanged in the first release. Cards and comparison do not duplicate the full booking calendar.

## Concurrency

Availability display is advisory and never guarantees a booking.

- Booking and rescheduling retain Serializable transactions, the same per-Teacher schedule application lock, conflict revalidation and row-version handling.
- Availability rule addition, rule removal, exception creation/removal and schedule-timezone replacement must use the same per-Teacher schedule lock in the implementation pass.
- A schedule mutation that would invalidate an overlapping `AwaitingPayment` or `Confirmed` booking must be rejected, not silently strand the booking.
- Domain validation retains timezone/range/slot/status checks.
- Service transactions enforce ownership, publication eligibility, schedule overlap and booking conflict invariants.
- Database constraints/indexes and the application lock remain the final concurrency boundary.
- Integration tests must cover booking versus booking, reschedule versus booking, and schedule mutation versus booking.

## Security and Privacy

Public responses expose only bookable next-slot evidence. They do not expose:

- Student identity or participant count;
- occupied intervals;
- exception reason;
- private calendar details;
- Teacher login/presence;
- internal request/order workload;
- request or session titles.

Unavailable slots are omitted. Public profile contracts must stop returning raw availability rules, exception ranges and reasons. Teacher-owned `/me` contracts may retain the data required to edit the schedule.

## Performance

- Maximum horizon: 30 calendar days.
- Maximum batch: 12 Teachers.
- Maximum data reads per batch calculation: four bounded set-based reads—eligible services, rules, intersecting exceptions and intersecting reserving bookings.
- Candidate generation is bounded and performed in memory with no per-Teacher query.
- On-demand calculation is approved for the first release.
- No cache is approved now. Correct invalidation would need every rule, exception, booking, reschedule, cancellation, service, qualification and publication mutation; evidence does not yet justify that complexity.
- The existing detailed endpoint retains its 31-day server clamp.

## Empty and Error States

| API state/condition | Public message |
|---|---|
| `no_scheduled_service` | Live sessions not offered |
| `no_schedule_configured` | Schedule not configured |
| `available_today` | Available today; show earliest duration and time |
| `next_available` | Next available; show earliest duration and time |
| `temporarily_unavailable` | Temporarily unavailable |
| `fully_booked` | Fully booked for the next 30 days |
| `no_upcoming_availability` | No upcoming availability in the next 30 days |
| API failure | Availability could not be loaded; offer Retry |
| Browser timezone unavailable | Times shown in UTC |

An API failure is never converted into an unavailable state. Missing/ineligible public Teachers receive the same safe unavailable/not-found treatment already used by marketplace projections.

## Deferred Decisions

- Maximum concurrent request/order workload.
- Daily request acceptance limit.
- Which request/order statuses reserve capacity.
- Whether unpaid accepted work reserves request capacity.
- Minimum booking notice. The present enforced rule is `startsAt > now`; a number requires a business decision.
- Expiry/release policy for `AwaitingPayment` session reservations.
- Group sessions or multi-participant capacity.
- Online presence and “available now.”
- Caching, until measured batch performance requires it.

## Consequences

- The first availability release is truthful but covers live-session capacity only.
- One normalized API feeds Browse, Comparison and Profile while Book Session remains detailed.
- No schema change is expected for the summary because existing rules, exceptions, services and bookings contain the required evidence.
- Public profile DTOs require a privacy-safe separation from Teacher-owned schedule editing.
- Request-service workload remains deliberately undisclosed rather than guessed.
- A slot can disappear between summary display and booking; existing locked booking revalidation handles that correctly.

## Rejected Alternatives

- **Option A—call the detailed slot endpoint per Teacher:** rejected due to N+1 network/database work and duplicated frontend classification.
- **Option B—embed calculation in marketplace projections:** rejected because viewer timezone, duration expansion and booking data would couple expensive scheduling work to every search query.
- **Global availability:** rejected because duration and scheduling requirements are service-specific.
- **Current `AvailableThisWeek`:** rejected because it does not prove a bookable slot.
- **Online/login inference:** rejected because presence is neither persisted scheduling intent nor capacity.
- **Request-capacity approximation:** rejected because no approved limit or status formula exists.
- **A second calendar:** rejected because the live-session scheduler already owns the lifecycle.

## Implementation Preconditions

1. Extract/reuse one slot-candidate calculation so detailed slots and summaries cannot drift.
2. Align live-session service eligibility with the canonical marketplace predicate, including active approved, non-revoked qualification checks.
3. Separate public summary DTOs from Teacher-owned raw schedule DTOs; remove public exception reasons and raw occupied-calendar inference.
4. Apply the existing per-Teacher schedule lock to rule/exception mutation and reject mutations conflicting with reserving bookings.
5. Replace the current `AvailableThisWeek` and “Online now” surfaces with normalized states; do not preserve misleading filters.
6. Add bounded integration tests for formulas, timezones/DST, privacy, eligibility, query count and all concurrency races.
7. Keep the existing booking/rescheduling lifecycle, status semantics and detailed slots endpoint unchanged.
