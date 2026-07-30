# Order Journey Browser Certification

**Date:** 2026-07-30
**Type:** Critical UAT — full Student→Teacher→Payment→Delivery lifecycle, live browser only
**Constraints:** No commit/push/deploy; no business-rule redesign; no invented APIs

> **Update (same day):** the blocker documented below was traced and fixed in the
> [Post-Payment Order Lifecycle Recovery](./POST_PAYMENT_ORDER_LIFECYCLE_RECOVERY_REPORT.md) pass.
> The full canonical lifecycle (Start Work → Delivery → Revision → Approve → Completed → Review →
> Rating) is now reachable end-to-end through real browser controls. This report is kept as-written
> below for the historical record of the original finding.

## Verdict (original pass)

**ORDER JOURNEY BLOCKED**

The lifecycle was driven end-to-end through a real browser (Development environment, port 5090) using freshly registered, non-seeded accounts. Registration, teacher qualification (application → demo → Quality review → approval), profile publish, service creation, Learning Request creation, Teacher Accept, Order creation, Payment, and Mock Checkout webhook confirmation all completed correctly and are evidenced below. The journey is **blocked immediately after payment confirmation**: neither the Student nor the Teacher dashboard exposes a working control to move the (now fully paid) Order forward, because both dashboards derive the order's action/state from `Order.Status` alone and never consult `Order.PaymentStatus`. `Order.Status` is designed to remain `AwaitingPayment` until the Teacher calls `Start()` — so a paid order is structurally indistinguishable, in the UI, from an unpaid one. This is the **first Order in this Development database's history to ever reach `PaymentStatus = Paid`**, confirming the gap was never previously exercised with a live payment.

Start Work, Upload Delivery, Student Approve, and Order Completed could not be reached through the browser and are consequently unverified.

## Root Cause

Domain design (`src/Tafseel.Domain/Orders/Orders.cs`): `ConfirmPayment()` sets `PaymentStatus = Paid` but deliberately leaves `Status = AwaitingPayment`; `Start()` requires `Status == AwaitingPayment && PaymentStatus == Paid`. This is correct by design — `Status` is a workflow-stage field, not a payment flag.

Both frontends violate that contract by keying UI stage/action purely off `Status`:

| File | Line(s) | Code | Effect |
|---|---|---|---|
| `Tafseel-Student-Dashboard.dc.html` | 960, 1248 | `const pay = r.kind === 'order' && r.rawStatus === 0;` | Shows **Pay** / "Payment required" for an already-paid order (status stays `0`). Clicking Pay safely no-ops server-side (see Payment Safety below) but is misleading. |
| `Tafseel-Teacher-Dashboard.dc.html` | 887, 990 | `stage: ORDER_STAGES[x.status] \|\| 'awaiting_payment'` | Paid order never reaches `stage === 'progress'`, so the row keeps the `awaiting_payment` stage forever. |
| `Tafseel-Teacher-Dashboard.dc.html` | 764-771, 1756-1763 | `STAGE_ACTION.awaiting_payment` has **no `onAction` handler** (`onAction` is only wired for `stage === 'progress'`/`'ready'`) | The rendered "Waiting for payment" control is a live, non-disabled `<button>` that does nothing — confirmed via click: zero network requests fired. |
| `js/tafseel.js` | 889-899 | `orderStatusLabel(status)` maps `0` → `order_status_payment_required` unconditionally | Same root defect surfaces anywhere this shared helper is used. |

This is a **different, previously-unverified defect** from the "projection bug" fixed in [Order/Request UX Separation](./ORDER_REQUEST_UX_SEPARATION_REPORT.md) (duplicate Request/Order rows — confirmed fixed, see below) and from [Product Bug Fix Sprint 2](./PRODUCT_BUG_FIX_SPRINT_02_REPORT.md)'s "Teacher Start" fix (which corrected a wrong stage *name* string, `'accepted'` vs `'progress'`, not this missing-transition gap). Both prior reports validated with API-seeded/pre-existing order state or noted the full click-path as "conditional." This is the first pass to actually drive a fresh Mock payment through the browser and observe the dashboards fail to reflect it.

## Payment Safety (not a financial bug)

Re-clicking "Pay" on the already-paid order was tested deliberately to rule out a double-charge risk:
- `FinancialService.cs:35` guards checkout initiation: `if (order.Status != OrderStatus.AwaitingPayment || order.PaymentStatus != OrderPaymentStatus.Pending) throw ("payment_not_allowed")`.
- In practice the retry path (`FinancialService.cs:28-30`) returned the **existing** confirmed Mock Checkout session (same `mock_3c7f8d2ee...` reference, `Status: Confirmed`) rather than creating a new one or erroring.
- **No duplicate payment record, no double charge.** The defect is UI-only.

## Step-by-Step Results

| Step | Result | Evidence |
|---|---|---|
| Student registration + email confirmation | Pass | `student.uat.20260730@example.com`, dev-outbox confirm link, `EmailConfirmed=1` |
| Teacher registration + application (Mathematics, quadratic-equation topic, demo video) | Pass | Application `78ca25d7…`, real demo `IMG_0773.MP4` (120s) attached, `Submitted` |
| Quality Reviewer approval (9-criteria rubric, all 5/5) | Pass | Status → `Approved`; `TeacherSubjectQualifications` row created |
| Teacher profile publish + service creation | Pass | `TeacherProfiles.IsPublished=1`; service "Quadratic Equations Explained", SAR 120, Active |
| Browse Teachers shows qualified teacher | Pass | Correct name/subject/price, no console errors |
| Student creates Learning Request (5-step wizard) | Pass (with defect) | `201 Created`, exactly 1 row in `LearningRequests`; **React error #185 fires continuously from page load**, see below |
| Student Dashboard: request visible, correct display name | Pass | "Help solving quadratic equations" · Tariq Teacher UAT · Pending teacher review |
| Teacher accepts (Final price/Delivery/Revisions modal) | Pass | `200 OK`; Order created: Price 120.00, StudentFeePercent 8%→129.60 total, TeacherCommissionPercent 15%→102.00 net |
| Student Dashboard: exactly ONE Order, correct amount | Pass | No duplicates, no GUIDs, `SAR 129.60` |
| Student clicks Pay → Payment page | Pass | Correct order summary (120 + 9.60 fee = 129.60) |
| Payment page → Mock Checkout | Pass | Correct provider reference, amount, `Status: Pending` |
| Simulate successful payment | Pass | `Status: Confirmed`; DB `PaymentStatus=1 (Paid)` verified directly |
| Return to Student Dashboard | **Fail — no auto-redirect** (manual "Return to dashboard" click required) | Minor deviation from scenario, not a blocker |
| Student Dashboard reflects Paid | **FAIL (blocking)** | Still shows "Payment required" + live "Pay" button |
| Teacher Dashboard reflects Paid, Start Work available | **FAIL (blocking)** | Still shows "Waiting for payment"; button fires no request |
| Teacher: Start Work → Upload Delivery | **Unreachable** | No UI path to `/orders/{id}/start` |
| Student: open delivery, Approve, Order Completed | **Unreachable** | Blocked upstream |

## Other Findings

| Severity | Finding | Location |
|---|---|---|
| High | React error #185 ("Maximum update depth exceeded") fires repeatedly in console, starting on initial load of the Request wizard (before any interaction) and recurring on every subsequent page (Student Dashboard, Payment/Checkout) for the rest of the session. Functional data flow is unaffected (exactly 1 request/order created, no duplicates), but this fails the "no console errors / no JS exceptions" bar on every page after first hit. | `Tafseel-Request.dc.html:398-405`, `componentDidUpdate(prev)` — `this.setState({liveMessage: ...})` guarded by `prev.step !== this.state.step`; guard does not prevent the cascade in practice. Root cause needs a non-minified React build to fully confirm. |
| Medium | Missing localization key `td_stat_pending_withdrawal` renders literal `⟦missing:td_stat_pending_withdrawal⟧` to end users on the Teacher Dashboard Earnings panel. The `Tafseel.t(key) \|\| 'fallback'` pattern doesn't help because `Tafseel.t()` returns the non-empty missing-key marker, not a falsy value, so the fallback never triggers. Not caught by `check-localization.mjs` (which validates EN/AR key-pairing, not usage coverage). | `Tafseel-Teacher-Dashboard.dc.html:1805,1809`; key absent from `js/locales.js` |
| Low | Email-confirmation POST (`/api/v1/auth/confirm-email`) completes successfully server-side (`204`, `EmailConfirmed=1` in DB) but the client-side fetch reports `net::ERR_ABORTED` and shows no success message for the Teacher account (Student account confirmation showed the message correctly). | Client-side race between navigation and the confirm request. |
| Low (UX) | Mock Checkout success screen requires a manual "Return to dashboard" click; does not auto-return as the requested scenario describes. | `Tafseel-Mock-Checkout.dc.html` |

## Environment Notes

- Ran against an isolated Development-mode instance (port 5090, build output redirected to avoid file-lock conflict with an already-running Staging process on port 5089 found active at session start).
- Demo accounts (`admin@gmail.com`, `teacher@gmail.com`, etc.) exist in the shared `TafseelLocal` database from prior sessions with unknown passwords; a dedicated `admin.uat.20260730@example.com` / `quality.uat.20260730@example.com` pair was created directly in the database (Identity-compatible PBKDF2 hash, replicated to match `PasswordHasher<TUser>` V3 format) after explicit user approval, since the `SeedUsers` opt-in was disabled and the `Forgot password` flow for the existing `admin@gmail.com` was intentionally not used without confirmation.
- No commit, push, or deploy was performed. No production or staging data was touched.

## Validation

| Check | Result |
|---|---|
| Release build | Pass (0 errors, 2 pre-existing nullable warnings, unrelated to this scope) |
| Frontend integrity | Pass — 13 entry points |
| Localization | Pass — 12 entry points, 2586 paired keys (does not catch the usage-coverage gap noted above) |
| `git diff --check` | Pass — no whitespace errors |
| Browser UAT | **Blocked** — see verdict |

## Files Changed

- `docs/fixes/ORDER_JOURNEY_BROWSER_CERTIFICATION.md` (this report)
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

No application code was changed as part of this certification pass (diagnosis only, per instructions).
