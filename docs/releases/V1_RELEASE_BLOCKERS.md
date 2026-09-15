# Tafseel V1 Release Blockers

**Status:** Release Control 1, 2026-09-15, from `bec03a8`. This is the concrete list of work between
the current product and V1 production readiness. Every ticket follows
[`SDLC.md`](../engineering/SDLC.md) and the [ticket template](../engineering/templates/FEATURE_TICKET.md).
Scope: [`V1_SCOPE.md`](../product/V1_SCOPE.md) · rules: [Product Contract](../product/TAFSEEL_PRODUCT_CONTRACT.md) ·
checklist: [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md).

No ticket here was started in Release Control 1.

## Legend

**Gate status** — ✅ complete (recorded and sufficient to build) · ◐ partly known (rules or endpoints
exist in the contract/code, but the ticket's gate content is not yet written against the template) ·
❌ not started · ⛔ blocked by a decision · — not applicable (no user-facing UI or no API change).

**Ready** = every applicable gate is ✅ and no dependency is an unresolved decision.
**Size** — S ≤ 2 days · M ≤ 1 week · L > 1 week (for one developer, including tests and journey).

---

## DEC — Business decisions (owner)

Decisions are tickets: they block the work that depends on them. Each is closed by a written decision
recorded in the Product Contract.

| ID | Decision | Pri | Blocker | Blocks | Size | Business | UX | Contract | Completion evidence |
|----|----------|-----|---------|--------|------|----------|----|----------|---------------------|
| DEC-01 | V1 price boundaries (min/max SAR) per Catalog Service; today 0.01–1,000,000 async, 30–1,000,000 live | P1 | yes | PROD-01 | S | ⛔ | — | — | Table of approved ranges in Contract §3.2 |
| DEC-02 | May a teacher accept a direct request at a price different from their offering price, and above the student's budget? | P1 | yes | (rule confirmation; may create a ticket) | S | ⛔ | — | — | Contract §3.2 updated |
| DEC-04 | Payout mechanism: manual bank transfer (secure full bank details) or payout provider; compliance | P1 | yes | FIN-02, FIN-05, PAY-04 | S | ⛔ | — | — | Contract §3.10 updated; provider/process named |
| DEC-05 | Refund policy: full only or partial; customer-facing refund and cancellation terms | P1 | yes | FIN-06, LEG-01 | S | ⛔ | — | — | Contract §3.11 updated |
| DEC-06 | Confirm commercial fees: 8% student fee + 15% teacher commission | P1 | yes | QA-01 | S | ⛔ | — | — | Contract §5 confirmed; config values signed off |
| DEC-08 | VAT and e-invoicing obligations for the launch entity | P1 | yes | LEG-01, PAY-02 | S | ⛔ | — | — | Written legal/tax position; follow-up tickets if required |
| DEC-10 | Are live sessions enabled at launch? | P1 | yes | MEET-01, scope of QA-01 | S | ⛔ | — | — | V1_SCOPE §6 marked in or out |
| DEC-11 | Is protected paid **video streaming** (beyond authorized file download) required at launch? | P1 | yes | possible new SEC/MEDIA tickets | S | ⛔ | — | — | V1_SCOPE §11 row confirmed |
| DEC-12 | Production hosting target and data location (host, region, database, storage account) | P1 | yes | INF-03, INF-04, INF-07, DATA-01, REL-01 | S | ⛔ | — | — | Named environment and region in `PRODUCTION_READINESS.md` |
| DEC-03 | Completion after the dispute window has passed credits *Available* directly (not Pending) | P2 | no | — | S | ⛔ | — | — | Contract §3.9 confirmed |
| DEC-07 | Emergency premium: define the server rule or disable for V1 | P3 | no | B11-17 | S | ⛔ | — | — | Contract §5 updated |
| DEC-09 | Coupons at launch? (no checkout field today) | P2 | no | B11-08 | S | ⛔ | — | — | V1_SCOPE §3 row confirmed |

## FIN — Money out and finance operations

| ID | Title | Pri | Blocker | Depends on | Size | Business | UX | Contract | Completion evidence |
|----|-------|-----|---------|------------|------|----------|----|----------|---------------------|
| FIN-01 | **Teacher earnings screen** — available, pending clearance, next clearance date, recent credits; product wording (J12-01) | P1 | yes | — | M | ◐ | ❌ | ◐ (`GET /withdrawals/balances`, `/teachers/me/business/analytics`) | Page spec; IT balance after completion shows pending then available (existing FinancialSafety tests); journey: complete order → teacher sees pending clearance amount, Arabic phone |
| FIN-02 | **Teacher payout profile** — submit, see verification state and rejection reason (J12-02) | P1 | yes | DEC-04 | M | ⛔ | ❌ | ◐ (`GET/PUT /withdrawals/profile`) | Auth tests (other teacher 404); journey submit → pending → verified (after FIN-04) |
| FIN-03 | **Withdrawal request and history** — minimum 50 SAR, from Available only, status, rejection returns funds (J12-03) | P1 | yes | FIN-01, FIN-02 | M | ◐ | ❌ | ◐ (`POST /withdrawals`, `GET /withdrawals/mine`, `/withdrawals/policy`) | Journey: available balance → request → Admin processes (FIN-05) → completed; below-minimum and unverified refusals |
| FIN-04 | **Admin payout-profile verification** — queue, approve/reject with reason (J12-04) | P1 | yes | FIN-02 | S | ◐ | ❌ | ◐ (`GET /admin/payout-profiles`, `POST …/{teacherId}/review`) | Auth tests (non-admin 403); journey approve and reject |
| FIN-05 | **Admin withdrawal processing** — pending queue, approve with transfer reference, reject with reason (J12-04) | P1 | yes | FIN-03, DEC-04 | M | ⛔ | ❌ | ◐ (`GET /admin/withdrawals`, `POST /withdrawals/{id}/process`) | Ledger assertions (pending → completed / returned); double-submit safe; journey |
| FIN-06 | **Admin refund operation** — find payment, reason, confirmation stating amount, idempotent (J14-04) | P1 | yes | DEC-05 | M | ⛔ | ❌ | ◐ (`POST /payments/{id}/refund` + Idempotency-Key) | IT refund once under replay; reconciliation unchanged-balanced; journey |
| FIN-07 | **Admin dispute handling complete** — message both parties, see evidence, resolve with rationale (J10-02) | P1 | yes | — | M | ◐ | ❌ | ◐ (`POST /admin/disputes/{id}/messages`, start-review, resolve) | Journey: student opens non-delivery dispute → admin messages → resolves refund → balances correct |
| FIN-08 | Reconciliation view readable by finance (not the generic card list) | P2 | no | OBS-01 | S | ◐ | ❌ | ◐ | Screen shows the reconciliation DTO with zero-issue state |

## PROD — Product completeness

| ID | Title | Pri | Blocker | Depends on | Size | Business | UX | Contract | Completion evidence |
|----|-------|-----|---------|------------|------|----------|----|----------|---------------------|
| PROD-01 | **Admin Catalog Service policy editor** — price min/max, default/recommended price, delivery hours, revisions, durations, active; shows teachers made non-compliant (J13-03 subset) | P1 | yes | DEC-01 | M | ⛔ | ❌ | ◐ (`GET /admin/catalog/services`, `PUT /admin/catalog/services/{id}`) | IT: narrowing a range marks offerings non-compliant and refuses out-of-range acceptance; journey: Admin sets range → teacher cannot price outside |

## PAY / MEET — Providers

| ID | Title | Pri | Blocker | Depends on | Size | Business | UX | Contract | Completion evidence |
|----|-------|-----|---------|------------|------|----------|----|----------|---------------------|
| PAY-01 | Select the production payment provider; merchant onboarding; sandbox credentials | P1 | yes | DEC-08 | M | ◐ | — | — | Signed provider agreement; sandbox keys in secret store |
| PAY-02 | Implement the production `IPaymentProvider` — hosted checkout/redirect, signed webhook verification, refunds; Production config | P1 | yes | PAY-01 | L | ◐ | ◐ (checkout redirect copy) | ◐ (`IPaymentProvider`, `POST /payments/webhooks/{provider}`) | Adapter tests; webhook signature and replay tests; startup validation accepts the provider in Production |
| PAY-03 | Provider sandbox financial scenarios — success, failure, duplicate webhook, refund, escrow release, dispute settlement, reconciliation clean | P1 | yes | PAY-02, FIN-06 | M | ✅ | — | ◐ | Scenario log with provider references; reconciliation zero issues |
| PAY-04 | Payout execution — provider integration or documented manual transfer procedure with controls | P1 | yes | DEC-04 | L | ⛔ | — | ⛔ | Procedure or adapter; test payout end to end |
| MEET-01 | Production meeting provider adapter (Zoom / Google Meet / Microsoft Teams) — per-participant links, join window | P1 | yes (if DEC-10 = in) | DEC-10 | L | ◐ | — | ◐ (`ILiveSessionLinkProvider`) | Adapter tests; Production startup accepts provider; journey joins a real sandbox meeting |

## SEC — Security

| ID | Title | Pri | Blocker | Depends on | Size | Business | UX | Contract | Completion evidence |
|----|-------|-----|---------|------------|------|----------|----|----------|---------------------|
| SEC-01 | **Rotate exposed credentials** — seed/UAT password in pushed history: new secret, reset every account that used it in every database, revoke sessions, delete local copies (Wave 1 report, Step 10) | P0 | yes | — | S | ✅ | — | — | Owner confirmation per database; old password fails sign-in |
| SEC-02 | Rotate the four staging host secrets (H-S1) and redeploy staging | P0 | yes | — | S | ✅ | — | — | Staging starts with new secrets; old values invalid |
| SEC-03 | Production secrets only in the secret store / GitHub protected environment (JWT, DB, storage, email, payment, webhook, meeting) | P1 | yes | — | S | ✅ | — | — | Environment secret inventory; startup validation refuses placeholders |
| SEC-04 | **Malware scanning** for every user upload (request attachments, deliveries, message and session files, demos) before download is allowed | P1 | yes | DEC-12 | M | ◐ | ◐ (pending-scan state) | ◐ | IT: infected test file quarantined and never served; clean file served |
| SEC-05 | Authorization sweep of V1 endpoints with Student, Teacher, Quality, Admin, **suspended** and anonymous accounts | P1 | yes | — | M | ✅ | — | ✅ | Integration test matrix green; suspended user refused everywhere |

## INF / OBS / DATA / REL / ENG — Infrastructure and operations

| ID | Title | Pri | Blocker | Depends on | Size | Business | UX | Contract | Completion evidence |
|----|-------|-----|---------|------------|------|----------|----|----------|---------------------|
| INF-01 | **G-20** — build and probe the Docker image in CI | P1 | yes | push authorization | S | ✅ | — | — | Green `docker.yml` run URL; image probes the Angular client |
| INF-02 | GitHub `staging`/`production` environments, required reviewers, protected `main`, all workflows green on GitHub | P1 | yes | — | M | ✅ | — | — | Branch protection screenshot; green CI, Security, Database, Docker, Release runs |
| INF-03 | Production SQL Server — encryption, least-privilege login, automated backups, monitoring | P1 | yes | DEC-12 | M | ⛔ | — | — | Provisioning record; backup job evidence |
| INF-04 | Durable, encrypted Data Protection key ring shared by all instances | P1 | yes | DEC-12 | M | ⛔ | — | — | Keys survive restart/scale-out; auth cookies valid across instances |
| INF-05 | Production Azure Blob private container, no anonymous access, connection string in secret store | P1 | yes | — | S | ✅ | — | — | Startup validation passes; anonymous access test fails |
| INF-06 | Email — verified sending domain (replace `onboarding@resend.dev`), trusted HTTPS confirmation/reset URLs, exact CORS origins | P1 | yes | brand domain | S | ✅ | — | — | Confirmation and reset emails delivered from the domain in staging |
| INF-07 | Deployment adapter with least-privilege / OIDC credentials | P1 | yes | DEC-12, INF-02 | M | ⛔ | — | — | Staging and production deploy runs using OIDC |
| OBS-01 | Central logs, metrics, alerts, uptime checks and a named on-call owner (incl. disputes and payouts) | P1 | yes | DEC-12 | M | ◐ | — | — | Alert list with thresholds; test alert received; on-call rota |
| OBS-02 | Metrics and alerts for background jobs — order auto-release, earnings maturity, live-session settlement, reservation expiry (J6-09, J12-05) | P1 | yes | OBS-01 | S | ✅ | — | — | Failing job raises an alert in staging |
| DATA-01 | Production migration — review and apply the idempotent script with backup evidence (`deploy-production.yml` approval) | P1 | yes | INF-03 | M | ◐ | — | — | Applied script hash; backup id; `has-pending-model-changes` none |
| REL-01 | Recovery drills — database restore, application rollback, secret rotation, key persistence | P1 | yes | INF-03, INF-04 | M | ◐ | — | — | Drill log with timings and outcome |
| ENG-01 | **Initial bundle headroom** — 696.7 kB of a 700 kB warning; target ≤ 600 kB initial with warning at 650 kB (see note) | P1 | yes | — | M | ✅ | — | — | Production build ≤ 600 kB initial; budget lowered; Lighthouse mobile score recorded |

**ENG-01 note — where the weight is.** Initial chunks: global `styles.css` **355.95 kB** (51%), a shared
vendor chunk 182.95 kB, `main` 144.64 kB. Likely candidates (not implemented): split the generated
design-system stylesheet so landing/marketing and workspace/dashboard styles load with their lazy
routes; move landing-only and dashboard-only component CSS out of the global bundle; check what the
182.95 kB shared chunk pulls into the initial load (router providers, locale data, forms) and defer
anything used only after sign-in; keep `@microsoft/signalr` lazy (it already is). Target: ≥ 100 kB
headroom so ordinary V1 work cannot hit the warning.

## UX — Usability

| ID | Title | Pri | Blocker | Depends on | Size | Business | UX | Contract | Completion evidence |
|----|-------|-----|---------|------------|------|----------|----|----------|---------------------|
| UX-01 | **Student home — action first** (UX_PRINCIPLES §4): action required, current work, upcoming session, start something | P1 | yes | — | M | ◐ | ❌ | ◐ (existing list endpoints) | Journey: new student sees two CTAs; student with a delivered order sees "review delivery" first; Arabic phone |
| UX-02 | **Teacher home — action first**: setup blocker, action required, opportunities preview, upcoming session, earnings summary | P1 | yes | FIN-01 | M | ◐ | ❌ | ◐ | Journey: unpublished teacher sees blocker; published teacher sees new request first |
| UX-03 | **V1 navigation** per UX_PRINCIPLES §7 (Student 5, Teacher 6, Quality 2, Admin 6); old section links redirect | P1 | yes | UX-01, UX-02 | M | ◐ | ◐ (proposal in §7) | — | Route tests; old links redirect; Wave 1–3B journeys green |
| UX-04 | **Product statuses and fields in every list** — no numeric statuses, ids or "Updated/Count" | P1 | yes | — | S | ✅ | ◐ (terms in Contract §3) | — | Spec per list; screenshot audit of each list in AR/EN |
| UX-05 | **Remove duplicate open-marketplace paths** — retire the Wave 2 inline choose/offer on `/requests`; header "Post a request" → request-mode choice; teachers go to Open requests | P1 | yes | — | S | ✅ | ◐ | ✅ | Wave 2 journey replaced by 3B coverage; no route to the inline forms |
| UX-06 | **Arabic phone verification** of customer screens not yet phone-proven: teacher setup (profile, offerings, availability, publication), booking, checkout for sessions, disputes, messages, request/offers/opportunity | P1 | yes | — | M | ✅ | ◐ | — | Journey screenshots at 390px AR with overflow and card-containment checks |
| UX-07 | **Hide unredeemable promo codes** on the landing page until DEC-09 | P1 | yes | — | S | ✅ | ◐ | — | Landing shows no coupon code; spec |
| UX-08 | **Hide the brief assistant when AI is disabled** (today it is shown and answers "unavailable") | P2 | yes | — | S | ✅ | ◐ | ◐ (capability source to confirm) | Spec: hidden when disabled; visible and working when enabled |

## QA / LEG — Release verification and legal

| ID | Title | Pri | Blocker | Depends on | Size | Business | UX | Contract | Completion evidence |
|----|-------|-----|---------|------------|------|----------|----|----------|---------------------|
| QA-01 | **Final staging E2E** — every V1 MUST journey on a production-like environment with sandbox providers, fresh database, Arabic phone for customer journeys | P1 | yes | PAY-03, (MEET-01), FIN-*, UX-*, INF-02, DEC-06 | M | ✅ | — | ✅ | Journey logs and screenshots; no P0/P1 open |
| QA-02 | **Browser journeys for built-but-unproven V1 actions** — answer a clarification, cancel a request, cancel an unpaid order, open and resolve a dispute (and reschedule if DEC-10 = in) | P1 | yes | FIN-07 (dispute resolve step) | M | ✅ | — | ✅ | Journey logs; defects become new tickets |
| LEG-01 | Terms, privacy, refund, cancellation, dispute and safeguarding policies reviewed for the launch jurisdiction and published in Arabic and English | P1 | yes | DEC-05, DEC-08 | M | ◐ | ◐ | — | Legal sign-off; policy pages updated |

---

## Launch count

| Measure | Count | Tickets |
|---------|-------|---------|
| **Total V1 blocker tickets** | **50** | DEC 9 · FIN 7 · PROD 1 · PAY 4 · MEET 1 · SEC 5 · INF 7 · OBS 2 · DATA 1 · REL 1 · ENG 1 · UX 8 · QA 2 · LEG 1 |
| Ready for implementation now | **10** (OBS-02 has its gates but waits for OBS-01) | SEC-01, SEC-02, SEC-03, SEC-05, INF-01, INF-02, INF-05, INF-06, ENG-01, QA-02 (QA-02 except its dispute-resolution step, which waits for FIN-07) |
| Needing a business decision | **9 decisions**, directly blocking **14** further tickets | Decisions: DEC-01, 02, 04, 05, 06, 08, 10, 11, 12 · Directly blocked: PROD-01, FIN-02, FIN-05, FIN-06, PAY-01, PAY-04, MEET-01, SEC-04, INF-03, INF-04, INF-07, OBS-01, QA-01, LEG-01 |
| Requiring external / provider work | **11** | PAY-01, PAY-02, PAY-03, PAY-04, MEET-01, SEC-01, SEC-02, INF-02, INF-03, INF-06, LEG-01 |
| UX-only | **8** | UX-01 … UX-08 |
| Security / infrastructure / operations | **17** | SEC-01…05, INF-01…07, OBS-01, OBS-02, DATA-01, REL-01, ENG-01 |
| Product engineering (money-out, catalog) | **8** | FIN-01…07, PROD-01 |
| Verification | **2** | QA-01, QA-02 |
| Non-blocking tickets tracked here | 7 | DEC-03, DEC-07, DEC-09, FIN-08 and OPS-01…03 below |

The category rows overlap on purpose (an external ticket can also be security); the first row is the
single authoritative total.

**Tafseel is 50 tickets away from V1 production readiness** — 49 if the owner decides live sessions do
not launch in V1 (DEC-10 = out removes MEET-01; DEC-10 itself still has to be decided).

### Non-blocking operations tickets (SHOULD)

| ID | Title | Pri | Depends on | Size |
|----|-------|-----|------------|------|
| OPS-01 | Admin attention list (disputes, withdrawals, payout profiles, stuck sessions) as the Admin home | P2 | FIN-04, FIN-05, FIN-07 | M |
| OPS-02 | Admin review moderation detail and hide/show (J7-02) | P2 | — | S |
| OPS-03 | Admin resolution of a stuck live session (J8-08; endpoints exist) | P2 | DEC-10 | S |

### Suggested order (not a plan commitment)

1. Owner decisions DEC-01, 04, 05, 06, 08, 10, 11, 12 (all S) and the ready security items SEC-01, SEC-02.
2. In parallel: INF-01, INF-02, INF-05, INF-06, SEC-03, SEC-05, ENG-01, QA-02.
3. Money out: FIN-01 → FIN-02/FIN-04 → FIN-03/FIN-05; FIN-06, FIN-07; PROD-01.
4. UX: UX-04, UX-05, UX-07, UX-08 → UX-01, UX-02 → UX-03 → UX-06.
5. Providers: PAY-01 → PAY-02 → PAY-03; PAY-04; MEET-01 if in scope.
6. Production environment: INF-03, INF-04, INF-07, SEC-04, OBS-01, OBS-02, DATA-01, REL-01, LEG-01.
7. QA-01, then launch decision.
