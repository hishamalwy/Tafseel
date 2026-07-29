# Student Learning Preferences Decision Report

Date: 2026-07-30

Status: Decision complete; implementation not started.

## Findings

Persistent Student learning preferences do not exist. The only related behaviors are notification channel toggles, identity profile fields and per-request Guided Request style composition.

| Preference | Existing Source | Persistence Need | Privacy Risk | Decision |
|---|---|---|---|---|
| Explanation style | Guided Request browser state → composed into `Description` | Global default to prefill future requests | Low if voluntary and non-diagnostic | Persist optional primary style |
| Preferred teaching language | UI locale only; Teacher languages via catalog | Optional default for request composition | Low if catalog-backed and not fluency claim | Persist optional active language id |
| Notification email/in-app | `UserNotificationPreference` | Already persisted | Low | Keep separate; do not overload |
| Display names / avatar | `ApplicationUser` + auth profile | Identity only | Medium if misused | Do not mix with learning prefs |
| Pace / examples-first / more exercises | None | Unclear Teacher consumer for MVP | Low–medium if over-interpreted | Defer |
| Accessibility (captions, larger text, slower pace) | None | Needs stronger guarantees | Higher / sensitive if medicalized | Separate accessibility feature |
| Learning diagnosis / style scoring | None | Forbidden | High | Reject |
| Inferred prefs from history/files/chat | None | Forbidden | High | Reject |
| Per-subject preference map | None | High complexity | Medium | Defer |
| Request schema snapshot columns | Description already carries style | Not required for MVP | Low | Defer; keep Description composition |

Additional evidence:

- No Student Profile aggregate; Student Settings edits names/avatar/notifications through auth + messaging APIs.
- `LearningRequestDto` exposes `Description` to the assigned Teacher, including pending review, so composed preferences are already visible in-request.
- `TeachingLanguage` is a real catalog with Teacher joins; suitable FK target for an optional Student preferred teaching language.
- ADR-008 deferred global learning preferences and kept per-request style in Description for the Guided MVP.

## Root Cause

Guided Request solved per-request clarity but left no durable Student-controlled default. Without an explicit preference store, Students re-enter style every time, while any attempt to infer defaults from history would create profiling risk the audit forbids.

## Decisions

1. **Scope:** Global defaults with per-request override (Option A).
2. **Vocabulary:** One optional primary explanation style from the Guided Request allowlist; one optional preferred teaching language id.
3. **Data model:** Typed 1:1 `StudentLearningPreference` entity (notification-preference pattern), not Identity columns, JSON or key/value store.
4. **API:** Focused `GET/PUT /api/v1/students/me/learning-preferences`.
5. **Request integration:** Prefill Guided Request; restored draft wins; continue composing into Description (Option C). No Learning Request schema change.
6. **Teacher visibility:** No Teacher profile preference API. Teachers read request Description on assigned requests only.
7. **Accessibility / pedagogy micro-options / matching / analytics:** Deferred or rejected as specified in ADR-009.
8. **Notifications:** None on preference edit.
9. **Migration:** Additive later; null/no row for existing Students; no Description backfill.

Full decision: [ADR-009](../decisions/ADR-009-STUDENT-LEARNING-PREFERENCES.md).

## Proposed Data Model

```text
StudentLearningPreference
  UserId (PK, FK AspNetUsers Restrict)
  ExplanationStyle string?   // allowlisted or null
  PreferredLanguageId Guid?  // active TeachingLanguages or null
  UpdatedAt DateTimeOffset
```

## API Plan

```text
GET  /api/v1/students/me/learning-preferences
PUT  /api/v1/students/me/learning-preferences
```

- Student auth only
- Allowlist + active language validation
- Null clears fields
- Upsert semantics
- No EF exposure; no public/Teacher read of another Student’s preference row

## Student UX

- Dashboard Settings card: style chips, language select, defaults disclaimer, save/reset, localized EN/AR.
- Guided Request: prefill from GET when no restored draft; allow override; keep existing composition and checklist.

## Request Integration

```text
Open wizard
  → if draft restored: use draft style/language answers
  → else if profile preference exists: prefill
  → else: empty optional fields
Submit
  → compose selected values into Description
  → LearningRequest unchanged structurally
```

Global edits never rewrite historical requests.

## Teacher Visibility

| Context | Sees structured preference profile? | Sees request Description? |
|---|---|---|
| Public browse / search | No | No |
| Pending assigned request | No | Yes (existing DTO) |
| Accepted request / order | No | Yes |
| Confirmed live session | No | Only via linked request/session materials already authorized |
| Unrelated Student | No | No |

## Privacy and Security

Voluntary stylistic defaults only. No medical, disability, psychological, grade or inferred fields. Ownership-enforced Student endpoints. No public badges. No preference-edit notifications. Prefer operational audit metadata over preference payload logging.

## Migration Impact

Implementation pass will need one additive migration for the preference table/FK. Existing Students get no fabricated defaults. No historical request rewrite. **No migration in this decision pass.**

## Risks

1. Students may assume language preference guarantees a bilingual Teacher; copy must avoid fluency/guarantee claims.
2. Teachers may overlook style guidance buried in Description; acceptable for MVP, structured snapshot deferred.
3. Prefill vs draft precedence bugs could overwrite restored wizard answers if integration is careless.
4. Inactive Teaching Language rows need fail-closed update validation and safe GET handling.
5. Future matching must not silently consume these fields before BR-03 is approved.

## Deferred Scope

Accessibility preferences; per-subject maps; multi-style ranking; pace/pedagogy extras; LearningRequest snapshot columns; Teacher preference API; matching; analytics; Learning Timeline; AI inference.

## Final Verdict

**READY FOR LIMITED PREFERENCES MVP**

## Next Step

One focused implementation pass:

**Limited Student Learning Preferences** — typed preference entity, Student GET/PUT API, Dashboard Settings UI, Guided Request prefill with draft precedence, additive migration, ownership/validation tests and EN/AR localization — without matching, accessibility expansion or Learning Request schema changes.
