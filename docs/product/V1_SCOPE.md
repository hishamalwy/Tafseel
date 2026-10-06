# Tafseel V1 Scope

**Status:** frozen · Release Control 1, 2026-09-15; updated in Release Control 2 with the Product Owner
decisions ([Owner decisions](../releases/V1_OWNER_DECISIONS.md)). Changes only through a ticket that passes Gate 1 of
[`SDLC.md`](../engineering/SDLC.md). Terms: [Product Contract](./TAFSEEL_PRODUCT_CONTRACT.md).

**Implementation note (2026-10-05):** the existing V1 interface received the accepted system-wide UX/UI presentation refinement under [CRAFT-2026-10-05](../engineering/UX_UI_CRAFT_2026_10_05.md): 13 UX scopes verified before 10 UI scopes. [Completion and screenshots](../engineering/UX_UI_CRAFT_COMPLETION_2026_10_05.md). Capability/business scope is unchanged.

## What V1 is

**Tafseel V1 is a commercially usable, Saudi-first learning-help marketplace in which a student can
find a qualified teacher (or let qualified teachers compete), pay safely, receive and revise the
work or attend a live session, communicate, complete and review — and in which a teacher can
qualify, publish, earn and get paid — operated by Quality and Admin with only the controls needed to
run real money safely.**

V1 is not a demonstration of every backend endpoint. **No UI is required solely because an API
capability exists.**

## Success

> **DRAFT — owner to confirm.** Added by the 2026-09-23 audit (F-PRD-1). Every number below is a
> *proposal* marked `PROPOSED`; nothing here is decided until the Product Owner confirms it in
> [`V1_OWNER_DECISIONS.md`](../releases/V1_OWNER_DECISIONS.md) the way DEC-01…DEC-13 were.

**The problem, as students solve it today.** A secondary or university student in Saudi Arabia who
is stuck on a specific part of their own material (a past exam, a lecture slide, a problem set)
asks classmates, searches YouTube, or pays a tutor found through WhatsApp groups and word of mouth.
The tutor is unverified, the price is negotiated in chat, payment goes up front by bank transfer
with no recourse, and a full lesson is bought when one part needed explaining. *(Research gap:
no interviews or survey are recorded in the repository; this paragraph is the owner's working
assumption and should be validated before launch spend.)*

**Primary user.**
- **Role:** a student paying for help with their own material.
- **Context:** before an exam or a deadline, usually on a phone, usually in Arabic.
- **Constraint:** wants the one hard part explained, not a course; will not pay up front to a stranger.
- **Current workaround:** WhatsApp-sourced tutors paid by transfer (above).
- **Evidence:** research gap, as above.

**Metrics.** One leading and several lagging, each computable from data V1 already persists.

| # | Metric | Kind | Target | Source |
|---|--------|------|--------|--------|
| M1 | Paid orders per week | lagging | `PROPOSED` ≥ 20 by launch + 90 days | Source: `GET /api/v1/admin/marketplace-intelligence` → `overview.paidOrders` over a 7-day window |
| M2 | Median time from open request to first offer | leading | `PROPOSED` ≤ 6 hours | Source: `LearningRequests.CreatedAt` → first `TeacherOffers.CreatedAt` per request (query to add to the intelligence report) |
| M3 | Orders completed without a dispute | lagging | `PROPOSED` ≥ 95 % | Source: `overview.completedOrders` against `Disputes` opened on those orders |
| M4 | Search with zero results | leading | `PROPOSED` ≤ 15 % | Source: `overview.zeroResultRatePercent` (first-party interaction events) |

"Active student" = a student with a confirmed payment in the period (from `Payments`, not events).

**Launch window and cut rule.** `PROPOSED`: launch in a window chosen once DEC-08 (tax) and PAY-01
(provider) are closed, because they gate the critical path (see the launch plan in
[`V1_RELEASE_BLOCKERS.md`](../releases/V1_RELEASE_BLOCKERS.md#launch-plan)). If the window slips,
cut in this order before moving the date: live-session reschedule, Admin reconciliation view,
SHOULD rows, then the open-marketplace path (direct requests alone still make V1 usable). Money
safety, payouts, refunds, disputes and authorization are never cut.

## Categories

| Category | Meaning |
|----------|---------|
| **MUST SHIP V1** | Without it the marketplace cannot be used commercially or operated safely. Launch is blocked. |
| **SHOULD SHIP V1** | Expected by users; launch is possible without it but with visible friction. Decided per ticket; not launch-blocking by default. |
| **V1.1** | Deliberately deferred; listed in [`V1_1_BACKLOG.md`](./V1_1_BACKLOG.md) with reason and risk. |
| **LATER / OPTIONAL** | No V1 or V1.1 commitment. |
| **EXTERNAL / PROVIDER** | Depends on a third party, a contract or an operational action outside the code. |

"State" is the verified state on `bec03a8`: **Proven** = passed a browser business journey;
Rows marked *(2026-09-30)* were closed by the completeness pass — see `docs/audits/product-completeness-final/`.

**Built** = UI exists with unit/integration tests but no browser journey; **API only**; **Partial**;
**Missing**. Matrix IDs refer to the
remediation matrix.

---

## 1. Visitor and account

| Capability | Matrix | State | Category |
|------------|--------|-------|----------|
| Landing page (featured subjects, teachers, services, stats) | J1-02 | Built | MUST |
| Browse and filter published teachers | J1-03 | Proven (3B) | MUST |
| Public teacher profile with offerings and public reviews | J1-06 | Proven (3B) | MUST |
| Availability indicator on cards and profile | J1-04 | Built | SHOULD |
| Compare teachers | J1-05 | Built | LATER |
| Save a teacher (favourites) | J1-07 | Proven (W2) | SHOULD |
| Register, confirm email, sign in, stay signed in, sign out | J2-01..03 | Proven (W1, 3A, 3B) | MUST |
| Reset password | J2-04 | Proven (W1) | MUST |
| Resend confirmation | J2-05 | Built | MUST |
| Account settings: name, data export | J2-06 | Built (generic page) | SHOULD |
| Change password / revoke other sessions UI | J2-06 | Built — `/account` (2026-09-30) | V1 |
| Policies pages (terms, privacy, refund) | — | Built (static content) | MUST (content via `LEG-01`) |
| Arabic/English switch, RTL | — | Proven | MUST |
| Product analytics | J1-08 | Missing | V1.1 |

## 2. Student demand

| Capability | Matrix | State | Category |
|------------|--------|-------|----------|
| Direct request from a teacher's offering (wizard, attachments) | J3-01..03 | Proven (3B, Arabic phone) | MUST |
| AI help writing the brief | J3-04 | Built; hidden whenever the provider is unavailable (`UX-08`, done 2026-09-17) | LATER |
| Answer a teacher's clarifying question | J3-05 | Built on `/requests/:id` (3B), no browser journey | MUST (`QA-02`) |
| Cancel a request | J3-06 | Built on `/requests/:id` (3B), no browser journey | MUST (`QA-02`) |
| Choose "direct teacher" vs "open request" | J4-01 | Proven (3B) | MUST |
| Publish an open request | J4-01 | Proven (3B) | MUST |
| See my requests and their state | J4-02 | Proven (3B screens; generic list on the dashboard) | MUST |
| Compare offers | J4-03/J4-06 | Proven (3B) | MUST |
| Select an offer; reservation; release | J4-07, J4-09 | Proven (3B) | MUST |
| Duplicate open-marketplace list page `/requests` (Wave 2 inline offer/choose) | J4-02..07 | Proven (W2) | MUST remove duplication (`UX-05`) |

## 3. Checkout

| Capability | Matrix | State | Category |
|------------|--------|-------|----------|
| Pay an accepted order | J5-01 | Proven (3B, mock) | MUST |
| Pay a reserved open request → order created once | J4-08 | Proven (3B, mock) | MUST |
| Pay a live-session booking | J5-02 | Proven (3B, mock) | MUST |
| Real payment provider | J5-05 | Missing | EXTERNAL (`PAY-01..03`) — MUST |
| Coupons at checkout | J5-03 | Server quote and coupon entry built for direct orders, approved live sessions and selected open offers; direct-order browser proof passed | MUST (`DEC-15`) |
| Mock simulator | J5-04 | Built; forbidden in Production | not shipped |

## 4. Order fulfilment

| Capability | Matrix | State | Category |
|------------|--------|-------|----------|
| Participant order screen (summary, timeline, actions) | J6-06 | Proven (3B) | MUST |
| Agreed-price disclosure when the accepted price differs from the listed price (DEC-02, DEC-13) | — | Proven (`UX-09`, 2026-09-17) | MUST |
| Teacher starts a paid order | J6-01 | Proven (3B) | MUST |
| Teacher delivers files with a note, upload progress | J6-02 | Proven (3B) | MUST |
| Student opens protected delivery files | J6-03 | Proven (3B) | MUST |
| Revision within allowance; redelivery | J6-04 | Proven (3B) | MUST |
| Complete; automatic completion after the window | J6-05, J6-09 | Proven (complete); worker tested (IT) | MUST |
| Cancel an unpaid order | J6-08 | Built on `/orders/:id` (3B), no browser journey | MUST (`QA-02`) |
| Order conversation | — | Proven (3B) | MUST |
| Extensions | J6-07 | API only | V1.1 |
| Dispute: open, evidence, messages (participants) | J6-10, J10-01, J10-03 | Built (`/disputes`) | MUST |

## 5. Reviews

| Capability | Matrix | State | Category |
|------------|--------|-------|----------|
| Review a completed order once; public rating updates | J7-01 | Proven (3B) | MUST |
| Review a completed live session | J7-01 | Built — session page (2026-09-30) | V1 |
| Admin hides a review (moderation) | J7-02 | Partial (list only) | SHOULD (`OPS-02`) |
| Teacher opens a review from a notification | J7-03 | Recorded DEAD LINK (Wave 3A added a teacher-review link route; not re-verified) | V1.1 (verify) |

## 6. Live sessions

| Capability | Matrix | State | Category |
|------------|--------|-------|----------|
| Request a slot (duration, time zone), teacher accepts, then student pays (DEC-14) | J8-01 | Built; new approval journey awaiting browser proof | MUST (`QA-02`) |
| Session screen for both participants | J8-06 | Proven (3B) | MUST |
| Join inside the window (both roles) | J8-02 | Proven (3B, mock room) | MUST |
| Completion and no-show settlement | J8-05 | Proven (3B) | MUST |
| Cancel with refund rule | J8-04 | Proven (3B) | MUST |
| Reschedule propose/answer | J8-03 | Built on `/live-sessions/:id` (3B), no browser journey | MUST (`QA-02`) — shown in the V1 session screen, so it must work |
| Session files | — | Built (3B) | SHOULD |
| Real meeting provider | J8-07 | JaaS adapter built; sandbox join pending credentials | EXTERNAL (`MEET-01`) — MUST |
| Emergency premium | — | API flag only | DECISION (`DEC-07`) — default LATER (disabled) |
| Admin resolves a stuck session | J8-08 | Partial (list; complete/no-show admin endpoints exist) | SHOULD (`OPS-03`) |

**Live sessions are part of V1 — DECIDED (DEC-10, 2026-09-15).** `MEET-01` remains a launch blocker; the
mock provider stays forbidden in Production.

## 7. Messaging and notifications

| Capability | Matrix | State | Category |
|------------|--------|-------|----------|
| Inbox, thread, send, unread, attachments; SignalR + polling | J9-01, J9-02 | Proven (3B) | MUST |
| Open a conversation / item from a notification; server links resolve | J9-03..05 | Proven (W1, 3B) | MUST |
| Notification preferences | J9-06 | Built — `/account`; transactional notices always sent (2026-09-30) | V1 |
| Email notifications (confirmation, reset, activity) | — | Built (Resend) | MUST (domain via `INF-06`) |

## 8. Teacher supply

| Capability | Matrix | State | Category |
|------------|--------|-------|----------|
| Land in the right place after sign-in | J11-01 | Proven | MUST |
| Apply per subject with a demo; see reviewer feedback; resubmit | J11-02 | Proven (3A) | MUST |
| Withdraw an application | J11-03 | API only | LATER |
| Profile | J11-06 | Proven (3A) | MUST |
| Offerings within Admin range | J11-07 | Proven (3A) | MUST |
| Availability and time off | J11-08 | Proven (3A) | MUST |
| Publication with server blockers | J11-09 | Proven (3A) | MUST |
| Direct request handling (question, accept, decline) | J3-07/J3-08 | Proven (3B accept) | MUST |
| Opportunities and offers (send, change, withdraw) | J4-04..06 | Proven (3B) | MUST |
| Orders, sessions, messages | — | Proven (3B) | MUST |
| Qualifications list | — | Built (generic) | SHOULD |
| Samples, profile videos, showcases | J11-10 | API only; Production requires validated media capabilities | V1.1 |
| Business analytics / exports | J11-12 | API only | LATER |
| **Earnings: available, pending clearance, next clearance** | J12-01 | Proven (`FIN-01`, done 2026-09-16) | MUST |
| **Payout profile** (destination handled per DEC-04) | J12-02 | Missing | MUST (`FIN-02`, `PAY-04a`) |
| **Withdrawal request and history** | J12-03 | Missing | MUST (`FIN-03`) |
| Maturity worker metrics | J12-05 | Warning log only | MUST (`OBS-02`) |

## 9. Quality

| Capability | Matrix | State | Category |
|------------|--------|-------|----------|
| Application queue with filters and counts | J11-04 | Proven (3A) | MUST |
| Review screen, demo access, decision | J11-05 | Proven (3A) | MUST |
| Qualification revoke | J11-05 | Built — review page, with reason and audit (2026-09-30) | V1 |
| Quality Trust and Safety queue and case-scoped investigation | TRUST-01 | Proposed — Gate 1 blocked by DEC-16 (2026-10-06); not implemented | Phase 1 production hardening |
| Showcase moderation | J11-11 | Missing | V1.1 (with showcases) |

## 10. Admin

| Capability | Matrix | State | Category |
|------------|--------|-------|----------|
| Attention list / command centre, metrics | J14-01 | Built (generic) | SHOULD (`OPS-01`) |
| Users: list, suspend | J14-02 | Built (generic) | MUST |
| Change a user's roles | J14-03 | Built — People row actions; the person is notified | V1 |
| Catalog: list, enable/disable | J13-01/02 | Built (generic) | MUST |
| **Catalog Service policy (price range, delivery, revisions) editing** — V1 values decided (DEC-01) | J13-03 | Built — `/admin/marketplace` | MUST (`PROD-01`) |
| Subjects/topics/qualification topics create and edit | J13-03 | Built — `/admin/marketplace` | SHOULD (`OPS-04`) |
| Coupons, promotions | J13-04/05 | Admin create/list/toggle UI built; published browser proof passed | MUST (`DEC-15`) |
| Operations lists (requests, orders, sessions) | J14-01 | Built (generic) | SHOULD |
| **Disputes: review, message the parties, resolve** | J10-02 | Built — reviewer questions (2026-09-30) | MUST (`FIN-07`) |
| **Refund a payment** (full refunds only, DEC-05) | J14-04 | Built — Finance → payment detail | MUST (`FIN-06`) |
| Partial refunds | — | Missing | V1.1 (`B11-21`, DEC-05) |
| **Verify payout profiles** | J12-04 | Built — Finance → Payout details (full IBAN, sealed) | MUST (`FIN-04`) |
| **Process withdrawals** | J12-04 | Built — Finance → Withdrawals (DEC-04 manual adapter, evidence) | MUST (`FIN-05`) |
| Reconciliation view | — | Built (generic) | SHOULD (`FIN-08`) |
| Audit log | J14-01 | Built (generic) | SHOULD |
| Finance and demand reports | J14-05 | API only | LATER |
| Admin AI tools | J14-06 | API only, disabled | LATER |
| Marketplace intelligence reports | — | Built (generic) | LATER |

## 11. Platform, providers, operations

| Capability | State | Category |
|------------|-------|----------|
| Payment provider (charge, webhook, refund) | Mock only | EXTERNAL — MUST (`PAY-01..03`) |
| Meeting provider | Mock only | EXTERNAL — MUST (`MEET-01`, DEC-10) |
| Payout execution — `IPayoutProvider`, audited manual fallback, provider payouts if safely supported (DEC-04) | Missing | EXTERNAL — MUST (`PAY-01`, `PAY-04a`) |
| Alternative/automated payout adapter not used in V1 | Missing | V1.1 (`PAY-04b`) |
| Private file storage (Azure Blob) | Built; Production-enforced | MUST (`INF-05`) |
| Malware scanning of uploads | Missing | MUST (`SEC-04`) |
| Private authorized delivery files with V1 hardening (DEC-11) | Built (headers, watermark); scanning missing | MUST (`SEC-04`, `LEG-01`) |
| HLS/DASH streaming and DRM | Missing | V1.1 (`B11-22`, DEC-11) |
| Email sending domain | onboarding sender | EXTERNAL — MUST (`INF-06`) |
| Container image CI (G-20) | Unverified | MUST (`INF-01`) |
| Credential rotation | Pending | MUST (`SEC-01`, `SEC-02`) |
| Observability, alerts, on-call | App Insights package only | MUST (`OBS-01`, `OBS-02`) |
| VAT / e-invoicing | Missing | DECISION — OPEN; legal/tax advice required (`DEC-08`) |
| Initial bundle headroom | 696.7 / 700 kB warning | MUST (`ENG-01`) |

---

## Summary

| Category | Count of capability rows |
|----------|--------------------------|
| MUST SHIP V1 | 69 |
| SHOULD SHIP V1 | 12 |
| V1.1 | 12 |
| LATER / OPTIONAL | 8 |
| EXTERNAL / PROVIDER (all also required for launch) | 6 |
| DECISION pending classification (Emergency premium; VAT / e-invoicing) | 2 |
| Not shipped (mock payment simulator) | 1 |

Counts are of the rows above and exist to make scope drift visible; the launch count is the ticket
count in [`V1_RELEASE_BLOCKERS.md`](../releases/V1_RELEASE_BLOCKERS.md).
