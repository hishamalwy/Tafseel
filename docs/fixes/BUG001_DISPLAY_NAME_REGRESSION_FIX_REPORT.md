# BUG-001 Display Name Regression Fix Report

**Date:** 2026-07-30  
**Classification:** Production Bug — Incomplete Display-Name Projection/Fallback  
**Constraints:** No Sprint 3 localization, no redesign, no business-rule changes, no commit/push/deploy

## Verdict

**DISPLAY NAME REGRESSION FIXED AND VERIFIED**

## Findings

| Probe | Result |
|---|---|
| Seeded Order `3f011f19-…` API | `studentDisplayName = "Tafseel Student"` (projection OK) |
| Seeded Student ID | `31c315a9-e08e-44eb-9401-93504bedd633` |
| Broken UI string | `مشارك 31c315a9` |
| Introduction point | `Tafseel.participantLabel(id)` → `chat_participant` + `id.slice(0, 8)` |
| Call site | Teacher Dashboard conversations: `peer?.displayName \|\| Tafseel.participantLabel(peerId)` |
| Order table (`partyName`) | Already correct for seeded row (`Tafseel Student`) |
| Secondary leaks | Payment subtitle full Order GUID; Admin disputes `Order {guid}`; Teacher reviews overwritten with `"Verified student"` |

## Root Cause

Sprint 1 fixed Order/Request DTO display-name joins and `partyName`, but left a chat fallback that intentionally rendered **GUID prefixes** as person labels when `displayName` was missing/empty.

Path:

1. Conversation row missing usable `displayName` (or empty string treated as falsy)
2. UI fell back to `participantLabel(peerId)`
3. Helper sliced the Student user ID to 8 chars
4. Locale `chat_participant` = `مشارك {id}` / `Participant {id}`

Order titles/subtitles also still exposed full GUIDs on Payment and Admin dispute lists.

## Fix

### Canonical client rule (`js/tafseel.js`)

1. Language-specific name when non-empty  
2. Primary name when non-empty  
3. Alternate name when non-empty  
4. Localized `name_unavailable`  

Helpers: `partyDisplayName`, `partyName`, `participantLabel`, `participantInitials`, `orderTitle`, `requestTitle`, `looksLikeInternalId`  
**Never** render GUID / 8-char prefix / `مشارك {id}`.

### Surfaces

- Teacher/Student conversation lists → `participantLabel(peer)`
- Chat widget → same rule; no `"Tafseel member"` ID substitute
- Order/request titles → `orderTitle` / `requestTitle`
- Payment → no Order GUID subtitle
- Admin disputes → generic localized Order label
- Messaging API → empty FullName no longer becomes hardcoded English filler; optional `displayNameEnglish`

## Validation

| Check | Result |
|---|---|
| API Order JSON display names | Pass |
| Teacher browser AR: Order Student column = `Tafseel Student` | Pass |
| Teacher browser AR: Messages peer = `Tafseel Student` | Pass |
| Page text contains `مشارك` / `31c315a9` | **Absent** |
| `check-bug001-display-names.mjs` | Pass |
| Localization parity | Pass |
| Phase5 + Phase8 messaging tests | **9/9 Pass** |
| Release build | Pass |
| `git diff --check` | Clean (CRLF warnings only) |

## Files Changed

- `js/tafseel.js`
- `js/chat-widget.js`
- `Tafseel-Teacher-Dashboard.dc.html`
- `Tafseel-Student-Dashboard.dc.html`
- `Tafseel-Payment.dc.html`
- `Tafseel-Admin-Dashboard.dc.html`
- `src/Tafseel.Application/Messaging/MessagingContracts.cs`
- `src/Tafseel.Infrastructure/Messaging/MessagingService.cs`
- `scripts/ci/check-bug001-display-names.mjs`
- Docs: this report + Sprint 1/2 notes + INDEX + PROJECT_STATUS

## Risks

- Conversations with truly missing Users still show `name_unavailable` (intentional; never IDs).
- Additive optional `DisplayNameEnglish` on participant DTO is forward-compatible.

## Next Step

Resume Sprint 3 residual Admin/Quality i18n + email recipient-language ADR only after this regression stays green on refresh.
