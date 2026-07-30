# Product Bug Fix Sprint 2 Report

**Date:** 2026-07-30  
**Scope:** Seeded UAT + localization + buttons/tables + notification body localization  
**Constraints:** No redesign, no new features, no invented APIs, no business-rule changes, no commit/push/deploy

## Verdict

**SPRINT 2 FIXED BUT CONDITIONALLY VERIFIED**

Core seeded workflow, notification body localization, Pay/status projection bugs, Teacher Start-work handler, and high-traffic dashboard i18n are fixed and browser-validated on Development. Full viewport matrix and remaining Admin/Quality English chrome are not 100% complete.

## Findings

| Area | Finding | Status |
|---|---|---|
| Seeded UAT | Student→Request→PDF→Accept→Order→localized PaymentRequired works with demo users | **Proven** |
| Attachments | Teacher 200, Anon 401, Quality 404; order row shows downloadable `sprint2-uat.pdf` | **Proven** |
| Student Pay | Compared localized status strings (`Payment Required`) so Pay never fired in AR/EN | **Fixed** |
| Teacher Start | `onAction` checked `stage === 'accepted'` but stages use `progress` | **Fixed** |
| Notifications | Titles keyed; bodies were stored English boilerplate | **Fixed at render** |
| Money | `'SAR ' +` / null risk on dashboards | **Hardened via `Tafseel.money`** |
| Email outbox | Notification emails hardcoded Arabic CTA/kicker | **Business Rule Required** (no approved recipient-lang source) |
| Quality/Admin | Partial leftover English labels (filters, some flashes) | **Partial** |

## Root Cause

1. UI actions keyed off localized labels instead of `rawStatus` / stage codes.  
2. Notification bodies treated as display English instead of type + `{detail}`.  
3. Teacher order action used a non-existent stage name (`accepted`).  
4. Hardcoded dashboard chrome bypassed `locales.js` despite existing/new keys.

## Fix

### Shared
- `Tafseel.notificationBody`, `statusToneStyle`, safer `money(value, currency)`
- ~117 new EN/AR keys (nav, actions, toasts, `notif_body_*`, columns, accept modal)

### Student Dashboard
- Pay/Manage via `rawStatus`
- Status tones via `statusToneStyle`
- Localized nav/filters/toasts/settings notification labels
- `reload()` after order mutations; pay busy guard

### Teacher Dashboard
- Localized Budget/Accept/Decline/table headers/accept modal
- Start work on `progress`; delivery upload localized
- Money + day names + withdrawal/toasts

### Quality / Admin
- Application + Showcase statuses via existing locale keys
- Admin payment/revenue/withdrawal money + withdrawal toasts

### Tests
- `scripts/ci/check-sprint2-localization.mjs`
- Existing `check-localization.mjs` still green (2430 keys)
- Phase5OrderTests 6/6

## Browser Validation

| Check | Result |
|---|---|
| API seeded journey (create/upload/accept/authz) | Pass |
| Student EN: Pay visible for payment-required orders | Pass |
| Student AR: nav/filters/`ادفع`; notif title Arabic + request title body | Pass |
| Teacher AR: no pending after accept; Active Orders 2; PDF download chip | Pass |
| Teacher attachment download API | 200 |
| Anonymous attachment | 401 |
| Unrelated Quality attachment | 404 |
| Phase5 integration | 6/6 |
| Localization parity | Pass |
| Frontend integrity | Pass |
| Full 375–1440 × light/dark keyboard matrix | **Not fully re-run this sprint** |

## Localization Coverage

| Surface | Coverage |
|---|---|
| Request/order statuses | Complete |
| Notification titles + bodies (by type) | Complete for known types |
| Student/Teacher primary chrome | High |
| Quality statuses | High |
| Admin metrics (key cards) | Partial |
| Admin catalog flashes | Remaining English |
| Auth/password emails | Already lang-aware |
| Notification email outbox | **Business Rule Required** |

## Buttons and Tables Audit

**Fixed**
- Student Pay (was dead in AR/localized EN)
- Teacher Start work (was dead due to wrong stage)
- Teacher attachment download chips on Orders
- Accept/Decline/Clarify labels localized
- Withdrawal toast localization

**Remaining**
- Student Manage still uses `prompt()` (works, UX not polished — out of redesign scope)
- Some Admin catalog save flashes still English
- Quality priority labels still English Low/Medium/High

## Files Changed

- `js/tafseel.js`, `js/locales.js`
- `Tafseel-Student-Dashboard.dc.html`
- `Tafseel-Teacher-Dashboard.dc.html`
- `Tafseel-Quality-Dashboard.dc.html`
- `Tafseel-Admin-Dashboard.dc.html`
- `scripts/ci/check-sprint2-localization.mjs`
- `docs/fixes/PRODUCT_BUG_FIX_SPRINT_02_REPORT.md`
- `docs/INDEX.md`, `docs/PROJECT_STATUS.md`
- Sprint 1 report follow-up note

## Remaining Bugs

1. Notification email outbox language — needs approved recipient preference rule.  
2. Residual Admin/Quality English chrome and priority labels.  
3. Full responsive/keyboard/dark matrix not exhaustively re-certified.  
4. Seed `teacherDisplayNameEnglish` contains Arabic for demo teacher (data, not projection code).  
5. Student Manage/dispute still prompt-based.

## Risks

- Frontend-only notification body localization does not rewrite historical DB rows (by design).  
- Email outbox still English/Arabic-hardcoded depending on template path until BR exists.  
- API process must serve latest static files under `/app` (no rebuild required for HTML/JS).

## BUG-001 regression note (same day)

After Sprint 2, Teacher Messages still showed `مشارك 31c315a9` via `participantLabel` GUID-prefix fallback (Order `partyName` path was already correct). Closed in [BUG001_DISPLAY_NAME_REGRESSION_FIX_REPORT.md](./BUG001_DISPLAY_NAME_REGRESSION_FIX_REPORT.md).

## Next Step

Sprint 3 candidate: Admin/Quality residual i18n, email recipient-language ADR, full viewport matrix, replace prompt-based Manage with modal.

## Bug Dashboard (post Sprint 2)

```
Critical: 0
High: 1
Medium: 3
Low: 2
Resolved this Sprint: 9
Remaining: 6
Regression: 0
Blocked: 0
```

Counting notes:
- Resolved: Pay action, Start-work, notif bodies, student/teacher chrome i18n, money hardening, Quality status arrays, seeded UAT proof, attachment authz re-proof, sprint2 loc check.
- Remaining High: email outbox language BR.
- Remaining Medium: Admin residual strings, prompt Manage UX, full matrix.
- Remaining Low: demo English-name data quality, decorative leftovers.
