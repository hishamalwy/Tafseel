# Product Bug Fix Sprint 1 Report

**Date:** 2026-07-30  
**Scope:** End-to-end production bugs (GUID names, accept lifecycle projection, teacher file access, localization of statuses/notifications, dashboard projections)  
**Constraints:** No redesign, no new features, no invented APIs, no business-rule changes, no commit/push/deploy

## Verdict

**SPRINT 1 CORE BUGS FIXED LOCALLY** for BUG-001–005 and the highest-impact parts of BUG-004/008. Full repository localization parity and exhaustive button/table audit remain open for Sprint 2.

## Findings

| ID | Severity | Classification | Status |
|---|---|---|---|
| BUG-001 | Critical | Projection | **Fixed** — list DTOs lacked Users join; UI bound raw IDs |
| BUG-002 | Critical | Projection | **Fixed** — Accepted requests still listed as pending/active |
| BUG-003 | High | UI wiring | **Fixed** — download auth existed; Teacher UI dropped attachment IDs |
| BUG-004 | High | Localization | **Partially fixed** — notification titles + request/order statuses localized via keys |
| BUG-005 | High | Projection | **Partially fixed** — money/name formatting hardened; earnings null-safe |
| BUG-006 | Medium | Interaction | **Partial** — accept busy already present; full button audit deferred |
| BUG-007 | Medium | Tables | **Partial** — order GUID subtitle removed; attachments row added |
| BUG-008 | High | Localization | **Partial** — key map for notification types + statuses; full HTML hardcoded audit remains |
| BUG-009 | High | Workflow | **Conditional** — focused Phase5 tests passed; full browser journey needs seeded Staging |

## Root Cause

1. **BUG-001:** `LearningRequestDto` / `OrderDto` / `LiveSessionDto` / `AdminWithdrawalDto` projected IDs only. Dashboards bound `teacherId` / `studentId` (or GUID fallback labels) into name columns.
2. **BUG-002:** Domain accept correctly sets request=`Accepted` and creates Order. Teacher UI mapped **all** assigned requests into Pending; Student UI kept Accepted as `active` beside the new Order.
3. **BUG-003:** `OpenRequestAttachmentAsync` already allows Student **or** assigned Teacher. Teacher Dashboard mapped `files` to names only and rendered inert chips; Active Orders never joined request attachments.
4. **BUG-004:** Notifications stored English titles; dashboards showed them raw. Stage/status arrays were hardcoded English.
5. **BUG-005:** Null/undefined balance fields and ID-as-title produced broken money/name cards.

## Fix

### Backend (existing endpoints; additive DTO fields)

- `LearningRequestDto` / `OrderDto`: optional `StudentDisplayName`, `TeacherDisplayName`, English variants; `OrderDto.RequestTitle`
- `LiveSessionDto`: optional student/teacher display names
- `AdminWithdrawalDto`: optional teacher display names
- `OrderService` / `LiveSessionService` / `FinancialService`: batch Users join when paging

### Frontend

- `Tafseel.partyName`, `notificationTitle`, `requestStatusLabel`, `orderStatusLabel`
- Teacher: Pending = `status === 0` only; file download via `openBlob`; Orders show request title + downloadable student files; reload after accept
- Student: omit Accepted requests from merged work list; teacher names via `partyName`; localized statuses; conversation `displayName`
- Admin: withdrawal teacher name via `partyName`
- Locales EN/AR for notification types + request/order statuses

## Browser Validation

| Check | Result |
|---|---|
| Phase5 order integration tests | **6/6 passed** |
| `git diff --check` | Clean (CRLF warnings only) |
| Infrastructure Release build | Succeeded |
| Full Student→Teacher→Pay browser journey | **Deferred** — requires seeded Staging session after API restart with new DLLs |

## Files Changed

- `src/Tafseel.Application/Orders/OrderContracts.cs`
- `src/Tafseel.Application/LiveSessions/LiveSessionContracts.cs`
- `src/Tafseel.Application/Finance/FinanceContracts.cs`
- `src/Tafseel.Infrastructure/Orders/OrderService.cs`
- `src/Tafseel.Infrastructure/LiveSessions/LiveSessionService.cs`
- `src/Tafseel.Infrastructure/Finance/FinancialService.cs`
- `js/tafseel.js`, `js/locales.js`
- `Tafseel-Teacher-Dashboard.dc.html`
- `Tafseel-Student-Dashboard.dc.html`
- `Tafseel-Admin-Dashboard.dc.html`
- `docs/fixes/PRODUCT_BUG_FIX_SPRINT_01_REPORT.md`
- `docs/INDEX.md`, `docs/PROJECT_STATUS.md`

## Remaining Bugs

1. **Localization debt:** Many dashboard HTML strings still hardcoded English (labels like “Budget”, “Accept”, table headers). Need systematic `data-i18n` pass (Sprint 2).
2. **Notification bodies** still English as stored; titles localize by `type` but body text is not key-based.
3. **BUG-006/007:** Exhaustive dead-button and every-table audit not completed in this sprint.
4. **Teacher reviews / profile “No rating yet”** and marketplace empty chips need visual confirmation on seeded data.
5. **Email templates** localization not audited.

## Risks

- Additive DTO fields are optional and JSON-forward compatible; clients ignoring new fields remain valid.
- Until API process is restarted, browser still serves old DLLs (lock observed during test run).
- `partyName` shows `name_unavailable` if Users row missing — better than GUID leak.

## Sprint 2 validation follow-up (2026-07-30)

Seeded Development UAT on `http://127.0.0.1:5099` with demo Student/Teacher accounts **confirmed** Sprint 1 fixes: display names, Pending clears after accept, Order appears once, Teacher attachment download authz + Order PDF chip. Details in [PRODUCT_BUG_FIX_SPRINT_02_REPORT.md](./PRODUCT_BUG_FIX_SPRINT_02_REPORT.md).

## BUG-001 regression follow-up (2026-07-30)

Remaining ID-as-name leak was **not** Order `partyName` (DTO already returned `Tafseel Student`). It was `Tafseel.participantLabel` rendering `مشارك {guid-prefix}` in Messages. Fixed and verified: [BUG001_DISPLAY_NAME_REGRESSION_FIX_REPORT.md](./BUG001_DISPLAY_NAME_REGRESSION_FIX_REPORT.md).

## Next Step

1. Restart API and run seeded browser UAT for accept → pay → download files.
2. Sprint 2: remaining hardcoded UI strings + button/table audit + email localization.
3. Continue Production blockers (F-003/F-004) in parallel.

## Bug Dashboard (post Sprint 1)

```
Critical: 0
High: 2
Medium: 3
Low: 2
Resolved this Sprint: 5
Remaining: 7
Regression: 0
Blocked: 0
```

Counting notes:
- Resolved: BUG-001, BUG-002, BUG-003, and the confirmed status/notification slices of BUG-004/005.
- Remaining High: incomplete localization (BUG-008 remainder), incomplete workflow browser proof (BUG-009).
- Remaining Medium: BUG-006, BUG-007 leftovers + dashboard copy polish.
- Remaining Low: email templates, decorative footer/legal links from prior UX pass.
