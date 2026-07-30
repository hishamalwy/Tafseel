# Product Bug Fix Sprint 3 Report

**Date:** 2026-07-30  
**Scope:** Residual localization + Admin/Quality audits + buttons/tables + browser certification  
**Constraints:** No redesign, no new features, no invented APIs, no business-rule changes, no commit/push/deploy; BUG-001 remains closed

## Verdict

**SPRINT 3 FIXED BUT CONDITIONALLY VERIFIED**

Quality queue filtering/priority/chrome and Admin nav/metrics/money/status/toasts are fixed and browser-validated in Arabic RTL on Development. Full 375–1440 × light/dark keyboard matrix and email recipient-language outbox remain open. Release rebuild required stopping the running API (file locks); Phase5 was re-run after unlock.

## Findings

| Area | Finding | Status |
|---|---|---|
| Quality filters | Counts/tabs compared English literals to already-localized `apply_status_*` labels → badges stayed 0; filters never matched | **Fixed** (`rawStatus` + `TAB_RAW_STATUS`) |
| Quality priority | `Low`/`Medium`/`High` hardcoded; tone keyed off English text | **Fixed** (`priority_*` + numeric `PRIORITY_TONE`) |
| Quality chrome | Nav, tabs, queue/review pane, decision buttons, flashes still English | **Fixed** |
| Admin nav/metrics | Hardcoded English nav + metric labels | **Fixed** |
| Admin money | Payment rows used `'SAR ' + toLocaleString()` | **Fixed** (`Tafseel.money`) |
| Admin status | Active/Suspended display + Suspend/Activate + toasts English | **Fixed** |
| Admin settings Save | Flash-only (deployment-managed) — honest behavior, now localized | **Documented / localized** |
| Admin Requests/Sessions/Reviews | Nav works; list APIs never populate → always empty | **Documented** (no invented APIs) |
| Email outbox lang | Notification emails still hardcoded Arabic CTA/kicker | **Business Rule Required** (unchanged) |
| BUG-001 | No regression | **Still closed** |

## Root Cause

1. Quality status filters and badge counts keyed off display strings instead of `rawStatus`.  
2. Admin/Quality chrome and priorities bypassed `locales.js` / `Tafseel.t` despite existing or adjacent keys.  
3. Admin money rows still concatenated `SAR` instead of `Tafseel.money`.  
4. Runtime API serves `AppContext.BaseDirectory/frontend` copies — local verification must sync or rebuild after HTML/JS edits.

## Fix

### Locales (`js/locales.js`)
- Added EN/AR keys for Quality priority/nav/queue/review/decision/rubric and Admin nav/status/actions/metrics/toasts/validation (~110 paired keys; parity **2544**).

### Quality Dashboard
- `TAB_RAW_STATUS` + counts on `rawStatus`
- Priority via `priority_low|medium|high` + `rawPriority` tones
- Decision API uses numeric codes `0/1/2` (not English labels)
- Rubric criteria via `quality_rubric_0..8`
- Localized nav, tabs, table headers, review pane, flashes

### Admin Dashboard
- Localized NAV, metrics, overview chrome, Approve/Reject, status badges, suspend/activate, flashes, coupon money
- Dispute open count via `statusKey`
- Platform-settings flash uses `admin_settings_locked`
- Null-safe user initials

### CI
- `scripts/ci/check-sprint3-localization.mjs`
- Frontend integrity smoke stubs include `money` / `partyName` / `date`

## Browser Validation

| Check | Result |
|---|---|
| Quality AR: nav Arabic, tabs `الكل`/`مُرسل`/…, priority `متوسط`, status `مقبول`, no Low/Medium/High | **Pass** |
| Quality Approved tab filter shows approved row; badge `معلمون معتمدون 1` | **Pass** |
| Quality RTL `dir=rtl` | **Pass** |
| Admin AR: nav/overview/charts/withdrawals Arabic; Suspend=`إيقاف`; status=`نشط` | **Pass** |
| Admin no `SAR `+ broken money; no Active/Suspended English; no undefined/null | **Pass** |
| Full 375/768/1024/1440 × dark matrix | **Not fully re-run** |
| Admin residual EN placeholders (`Search name or email`) | **Remaining (Low)** |

## Localization Coverage

| Surface | Coverage |
|---|---|
| Quality apps queue + review + priority + decisions | Complete for audited chrome |
| Quality showcase (prior sprint `data-i18n`) | Unchanged / still keyed |
| Admin nav, metrics, money, status, withdrawal actions | Complete for audited chrome |
| Admin catalog modal leftovers / search placeholders | Partial residual |
| Notification email outbox recipient language | Blocked (ADR) |

## Admin Audit

- Wired buttons for withdrawals Approve/Reject, user suspend/activate, catalog toggles remain functional.  
- Platform Settings Save correctly refuses persistence (localized).  
- Charts remain empty with localized unavailable copy (no invented series).  
- Requests/Sessions/Reviews remain honest empties without backing list loads.

## Quality Audit

- Qualification queue filters/counts/actions localized and rawStatus-correct.  
- Showcase queue prior wiring retained.  
- Approve / Request changes / Reject wired to numeric decision codes with busy guard.

## Buttons Audit

- Quality decision + Review + nav + tabs verified.  
- Admin Approve/Reject/Suspend localized and handlers intact.  
- No dead visible primary actions introduced; settings Save intentionally non-mutating.

## Tables Audit

- Quality apps table: localized headers/values; filter by raw status; no GUID names.  
- Admin users table: localized status + actions; null-safe initials.

## Files Changed

- `js/locales.js`
- `Tafseel-Quality-Dashboard.dc.html`
- `Tafseel-Admin-Dashboard.dc.html`
- `scripts/ci/check-sprint3-localization.mjs` (new)
- `scripts/ci/check-frontend-integrity.mjs`
- `docs/fixes/PRODUCT_BUG_FIX_SPRINT_03_REPORT.md` (this file)
- `docs/INDEX.md`, `docs/PROJECT_STATUS.md`

## Remaining Bugs

| ID | Severity | Notes |
|---|---|---|
| Email outbox language | Medium / Blocked | Needs recipient-lang ADR |
| Admin search placeholders / some catalog modal labels | Low | Auto-hash may cover some; not all bound |
| Admin Requests/Sessions/Reviews always empty | Low | No list API wired — do not invent |
| Full viewport certification matrix | Low | Partial this sprint |
| Static frontend cache during local `--no-build` runs | Ops note | Rebuild or sync `bin/.../frontend` |

## Risks

- Serving stale `bin/.../frontend` copies during `dotnet run --no-build` can show pre-fix UI until rebuild/sync.  
- Platform settings UI still looks editable until Save — intentional honesty flash only.

## Next Step

Production Infrastructure (providers, durable storage, ops) — or a short cleanup pass for Admin search/catalog residual strings and email ADR if product prioritizes i18n closure over infra.

## BUG DASHBOARD

| Bucket | Count / Notes |
|---|---|
| Critical | 0 open (BUG-001 closed; no regression) |
| High | 0 open end-user blocking in Sprint 3 scope |
| Medium | Email outbox language (Business Rule Required) |
| Low | Admin residual placeholders; empty list pages without APIs; full viewport matrix |
| Resolved this Sprint | Quality filter/priority/chrome; Admin nav/metrics/money/status/toasts |
| Remaining | Email ADR; residual Admin placeholders; viewport matrix |
| Regression | None observed for BUG-001 / Sprint 1–2 Pay/Start-work |
| Blocked | Notification email recipient language |
