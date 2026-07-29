# Teacher Availability and Capacity Decision Report

Date: 2026-07-29
Status: Decision complete; implementation not started.

## Findings

- Tafseel already has one production-oriented live-session scheduling path: weekly rules, exceptions, timezone conversion, service-duration checks, detailed slot lookup, booking, rescheduling and cancellation.
- `AwaitingPayment` and `Confirmed` bookings reserve time. Booking/rescheduling use Serializable transactions, a per-Teacher SQL Server application lock, conflict revalidation and row versions.
- The current marketplace `AvailableThisWeek` filter does not calculate real slots. It ignores rule occurrence, service duration, past time, booking conflicts and viewer timezone, and treats any broad-range exception as disqualifying.
- Public Teacher profiles currently carry raw availability rules and exception reasons, which is more scheduling data than a public summary needs.
- The Teacher Dashboard writes fixed 17:00–21:00, 60-minute rules instead of providing a complete editor.
- Browse exposes nonfunctional online/availability controls. Online/login status is not persisted availability evidence.
- Book Session already uses the detailed slot endpoint and is the correct authoritative UI for service/duration selection.
- No request/order capacity limit or status consumption formula exists.
- The detailed live-session eligibility query does not currently apply the complete active-approved-non-revoked qualification predicate used by marketplace publication. That must be aligned before a public summary reuses it.

## Root Cause

The scheduling lifecycle was implemented for explicit slot discovery and safe booking, but no shared public-summary contract was defined. Marketplace UI and filtering therefore used weaker profile/rule presence signals. Request capacity is absent because its limits and consuming statuses have never been approved as business rules.

## Decisions

- Approve a **session-availability-only** first release.
- Availability is service-specific and applies only to eligible `live_session` services.
- Use a 30-day horizon starting on the viewer's local date.
- Calculate each eligible service using its minimum allowed duration; select the earliest result and disclose the selected service and duration.
- Use normalized states: `no_scheduled_service`, `no_schedule_configured`, `available_today`, `next_available`, `temporarily_unavailable`, `fully_booked`, and `no_upcoming_availability`.
- Do not approve `available_now`, online presence, global calendar availability or request-capacity claims.
- Keep Book Session as the detailed source of truth.

The complete decision is [ADR-006](../decisions/ADR-006-TEACHER-AVAILABILITY-AND-CAPACITY.md).

## Availability Formula

For each eligible live-session service at its minimum supported duration:

```text
candidate =
  occurrence of a persisted weekly rule in that rule's timezone
  AND fits wholly inside the rule
  AND duration is supported by the service
  AND start > current UTC time
  AND local wall time is neither invalid nor ambiguous under DST

bookable =
  candidate
  AND no persisted exception overlaps it
  AND no AwaitingPayment or Confirmed booking overlaps it
```

`available_today` requires a bookable start on the viewer's current local date. `next_available` is the earliest later bookable start. Both are bounded to 30 days.

If no slot remains, classification distinguishes missing service, missing schedule, explicit exceptions, exhausted session slots and no compatible occurrence. “No schedule configured” is never treated as vacation.

## Capacity Formula

Session capacity is one non-overlapping reserving booking per Teacher:

```text
sessionCapacityAvailable(interval) =
  NOT EXISTS overlapping LiveSessionBooking
  WHERE Status IN (AwaitingPayment, Confirmed)
```

Terminal and cancelled bookings do not reserve. Group sessions and multi-participant slots are not supported.

No request-capacity formula is approved. `Accepted`, order `AwaitingPayment`, `InProgress`, `Delivered` and `RevisionRequested` are not counted until maximums, reservation timing and release rules are decided.

## Architecture

Reuse the existing live-session scheduler and introduce one bounded batch summary query in the next pass. Do not create another calendar, mutate the booking lifecycle or generate a migration.

The summary calculation must share candidate-generation logic with [LiveSessionService](../../src/Tafseel.Infrastructure/LiveSessions/LiveSessionService.cs), while existing slot lookup remains the detailed contract.

## Public UX

- Teacher Dashboard: complete the existing rule/exception editor.
- Browse cards: one compact normalized session summary.
- Teacher Comparison: the same normalized summary.
- Public profile: next bookable session and Book Session action, without raw schedule/exception data.
- Book Session: unchanged detailed service/duration slot picker.
- Student Dashboard: unchanged for the first release.

The UI distinguishes schedule not configured, live sessions not offered, temporarily unavailable, fully booked and no upcoming slot. API failure has a retry state and is not presented as unavailability.

## API Plan

Select a dedicated bounded batch endpoint:

```http
GET /api/v1/live-sessions/availability-summaries
    ?teacherIds={teacherId}&teacherIds={teacherId}
    &viewerTimeZoneId={timeZoneId}
```

- 1–12 unique IDs.
- One call per visible Browse page, comparison selection or profile.
- Four bounded set-based reads at most: eligible services, rules, relevant exceptions and reserving bookings.
- Minimal response: Teacher ID, state, viewer timezone, horizon end and optional service/duration-specific next slot.
- Missing, unpublished and ineligible Teachers are indistinguishable publicly.
- Existing detailed slot endpoint remains the booking-page API.

## Security

- Return bookable slots only.
- Do not expose occupied intervals, Student identity, participant data, exception reasons, private calendar data, login presence, request/order workload or titles.
- Separate public summary contracts from Teacher-owned schedule-editing contracts.
- Booking remains authoritative and locked; frontend availability is never a reservation.

## Performance

- Horizon is capped at 30 days, within the existing endpoint's 31-day clamp.
- Batch size is capped at the existing marketplace default page size of 12.
- Calculation is set-based and in memory after at most four bounded reads; no per-Teacher query is allowed.
- On-demand calculation is approved.
- Caching is not approved without measurements because correct invalidation spans rules, exceptions, bookings, cancellations, services, qualifications and profile publication.

## Risks

1. Public and detailed results can drift unless they share candidate-generation logic.
2. A displayed slot can be taken before booking; locked server revalidation must remain authoritative.
3. Rule/exception mutation is not yet coordinated with the booking schedule lock.
4. `AwaitingPayment` reservations have no approved expiry/release policy and can reduce apparent capacity.
5. Current public profile DTOs expose raw exception details until the implementation pass separates contracts.
6. Current live-session eligibility must be aligned with canonical active qualification rules.
7. “Earliest slot” is duration-specific; omitting the duration would mislead users offering several durations.

## Deferred Scope

- Request/order capacity and workload states.
- Minimum booking notice.
- `AwaitingPayment` expiry policy.
- Group/multi-participant sessions.
- Online presence and “available now.”
- Availability caching.
- Analytics, AI matching and badges.
- F-005 revision schema changes.

## Fix

No source fix was made. This pass replaced ambiguity with an implementation-ready decision and explicitly rejected the existing weak marketplace predicate as a public availability formula.

## Validation

- Audited Domain, Application, Infrastructure, API, frontend and integration-test evidence.
- Confirmed the decision reuses the existing scheduler and booking lifecycle.
- Confirmed request capacity is not encoded and was not guessed.
- Confirmed no entity/model or migration change is required or permitted in this pass.
- Documentation links and whitespace were validated.
- Existing unrelated working-tree source changes were left untouched.

## Files Changed

- `docs/decisions/ADR-006-TEACHER-AVAILABILITY-AND-CAPACITY.md`
- `docs/reports/TEACHER_AVAILABILITY_CAPACITY_DECISION_REPORT.md`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

## Final Verdict

READY FOR SESSION-AVAILABILITY ONLY

## Next Step

Focused live-session availability implementation without request capacity
