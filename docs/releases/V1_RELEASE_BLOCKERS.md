# Tafseel V1 Release Blockers

**Status:** Release Control 1, 2026-09-15, from `bec03a8`. This is the concrete list of work between
the current product and V1 production readiness. Every ticket follows
[`SDLC.md`](../engineering/SDLC.md) and the [ticket template](../engineering/templates/FEATURE_TICKET.md).
Scope: [`V1_SCOPE.md`](../product/V1_SCOPE.md) · rules: [Product Contract](../product/TAFSEEL_PRODUCT_CONTRACT.md) ·
checklist: [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md).

No ticket here was started in Release Control 1.

**Batch B built (2026-09-16):** `FIN-01` is **Done** — see the [FIN-01 audit](../audits/fin01-2026-09-16/README.md).
The count below drops from 42 to 41.

**Batch A built (2026-09-16):** `UX-04` and `UX-05` are **Done** — see the
[batch audit](../audits/ux04-ux05-2026-09-16/README.md). The count below drops from 44 to 42.

**Release Control 3 (2026-09-15):** Gates 1–3 written for `FIN-01` and `UX-01`…`UX-09` as ticket files in
[`docs/tickets/v1/`](../tickets/v1/README.md); `DEC-13` raised by UX-09 and **decided the same day (Option A)**; UX-09 expanded into one vertical slice (M). Documentation only.

## Legend

**Gate status** — ✅ complete (recorded and sufficient to build) · ◐ partly known (rules or endpoints
exist in the contract/code, but the ticket's gate content is not yet written against the template) ·
❌ not started · ⛔ blocked by a decision · — not applicable (no user-facing UI or no API change).

**Ready** = every applicable gate is ✅ and no dependency is an unresolved decision.
**Size** — S ≤ 2 days · M ≤ 1 week · L > 1 week (for one developer, including tests and journey).

---

## DEC — Business decisions (owner)

Decisions are tickets: they block the work that depends on them. Each is closed by a written decision
recorded in the Product Contract and [`V1_OWNER_DECISIONS.md`](./V1_OWNER_DECISIONS.md).

### Open decisions

| ID | Decision | Pri | Blocker | Blocks | Size | Business | UX | Contract | Completion evidence |
|----|----------|-----|---------|--------|------|----------|----|----------|---------------------|
| DEC-08 | VAT and e-invoicing obligations for the launch entity — **qualified Saudi legal/tax advice required before the production payment-provider contract/sign-off and before final checkout/invoice wording** | P1 | yes | PAY-01 (contract sign-off), LEG-01; transitively PAY-02, PAY-03, PAY-04a, FIN-02…05 | S | ⛔ | — | — | Written legal/tax position; TAX tickets added if required |
| DEC-12 | Production provider and physical data region. Direction recorded (managed PaaS, single instance, managed SQL Server-compatible database, private durable object storage, managed secret store, observability); provider and region open pending data-residency/legal advice and service availability | P1 | yes | INF-03, INF-04, INF-07, SEC-04, OBS-01 (DATA-01, REL-01, OBS-02 transitively) | S | ⛔ | — | — | Named provider and region in `PRODUCTION_READINESS.md` |
| DEC-03 | Completion after the dispute window has passed credits *Available* directly (not Pending) | P2 | no | — | S | ⛔ | — | — | Contract §3.9 confirmed |
| DEC-07 | Emergency premium: define the server rule or disable for V1 | P3 | no | B11-17 | S | ⛔ | — | — | Contract §5 updated |
| DEC-09 | Coupons at launch? (no checkout field today) | P2 | no | B11-08 | S | ⛔ | — | — | V1_SCOPE §3 row confirmed |

### Decided (closed 2026-09-15 by the Product Owner)

| ID | Decision | Pri | Blocker | Result | Size | Business | UX | Contract | Completion evidence |
|----|----------|-----|---------|--------|------|----------|----|----------|---------------------|
| DEC-01 | Catalog Service price boundaries — Option B, V1 table in Contract §3.2 | P1 | closed | PROD-01 unblocked | S | ✅ | — | — | Contract §3.2 table |
| DEC-02 | Direct-request accepted price — Option B; budget is guidance | P1 | closed | UX-09 created | S | ✅ | — | — | Contract §3.2 |
| DEC-04 | Payout mechanism — Option C, `IPayoutProvider` + audited manual fallback | P1 | closed | PAY-04 split into PAY-04a (V1) / PAY-04b (V1.1); FIN-02, FIN-05 unblocked from the decision | S | ✅ | — | — | Contract §3.10 |
| DEC-05 | Refund policy — Option A, full refunds only; partial refunds V1.1 | P1 | closed | FIN-06 unblocked; LEG-01 waits only on DEC-08 | S | ✅ | — | — | Contract §3.11 |
| DEC-06 | Commercial fees — Option A (orders 8% + 15%; live sessions 15% only) | P1 | closed | QA-01 no longer waits on fees | S | ✅ | — | — | Contract §3.7, §5 |
| DEC-10 | Live sessions in V1 — Option A | P1 | closed | MEET-01 stays a blocker; reschedule is in QA-02 | S | ✅ | — | — | V1_SCOPE §6 |
| DEC-11 | Secure paid video — Option A, private authorized files; streaming/DRM V1.1+ | P1 | closed | no new blockers; SEC-04 and LEG-01 scope confirmed | S | ✅ | — | — | Contract §3.6; V1_SCOPE §11 |
| DEC-13 | Listed price reference for the agreed-price disclosure — Option A — immutable server-side snapshot of the Teacher Offering price (and currency) on every new Direct Request at creation; no backfill; UX-09 implements it (raised and decided in Release Control 3) | P1 | closed | UX-09 Gate 3 complete; no separate snapshot ticket | S | ✅ | — | — | Contract §3.2, §3.3; UX-09 |

## FIN — Money out and finance operations

| ID | Title | Pri | Blocker | Depends on | Size | Business | UX | Contract | Completion evidence |
|----|-------|-----|---------|------------|------|----------|----|----------|---------------------|
| FIN-01 | **Teacher earnings screen** — available to withdraw, clearing, next availability date, being transferred; product wording (J12-01). No movement list: no JSON API exists (statement/analytics are B11-09) — [FIN-01](../tickets/v1/FIN-01.md) | P1 | done 2026-09-16 | — | M | ✅ | ✅ | ✅ (no new contract: `GET /withdrawals/balances`, `/withdrawals/policy`) | Angular 369/369 (model + page specs), SQL Server 225/225 (`Balances_tell_the_teacher_…`: clearing with its date, available after maturity, 403/401), journey `fin01-teacher-earnings` 7/7 — [audit](../audits/fin01-2026-09-16/README.md) |
| FIN-02 | **Teacher payout profile** — submit, see verification state and rejection reason; destination information handled as PAY-04a defines (J12-02) | P1 | yes | PAY-04a | M | ◐ | ❌ | ◐ (`GET/PUT /withdrawals/profile`) | Auth tests (other teacher 404); journey submit → pending → verified (after FIN-04) |
| FIN-03 | **Withdrawal request and history** — minimum 50 SAR, from Available only, status, rejection returns funds (J12-03) | P1 | yes | FIN-01, FIN-02 | M | ◐ | ❌ | ◐ (`POST /withdrawals`, `GET /withdrawals/mine`, `/withdrawals/policy`) | Journey: available balance → request → Admin processes (FIN-05) → completed; below-minimum and unverified refusals |
| FIN-04 | **Admin payout-profile verification** — queue, approve/reject with reason (J12-04) | P1 | yes | FIN-02 | S | ◐ | ❌ | ◐ (`GET /admin/payout-profiles`, `POST …/{teacherId}/review`) | Auth tests (non-admin 403); journey approve and reject |
| FIN-05 | **Admin withdrawal processing** — pending queue, execute through `IPayoutProvider` (manual fallback: approve with transfer reference), reject with reason (J12-04) | P1 | yes | FIN-03, PAY-04a | M | ◐ | ❌ | ◐ (`GET /admin/withdrawals`, `POST /withdrawals/{id}/process`) | Ledger assertions (pending → completed / returned); double-submit safe; journey |
| FIN-06 | **Admin refund operation** — full refunds only (DEC-05); find payment, reason, confirmation stating amount, idempotent (J14-04) | P1 | yes | — | M | ✅ | ❌ | ◐ (`POST /payments/{id}/refund` + Idempotency-Key) | IT refund once under replay; reconciliation unchanged-balanced; journey |
| FIN-07 | **Admin dispute handling complete** — message both parties, see evidence, resolve with rationale (J10-02) | P1 | yes | — | M | ◐ | ❌ | ◐ (`POST /admin/disputes/{id}/messages`, start-review, resolve) | Journey: student opens non-delivery dispute → admin messages → resolves refund → balances correct |
| FIN-08 | Reconciliation view readable by finance (not the generic card list) | P2 | no | OBS-01 | S | ◐ | ❌ | ◐ | Screen shows the reconciliation DTO with zero-issue state |

## PROD — Product completeness

| ID | Title | Pri | Blocker | Depends on | Size | Business | UX | Contract | Completion evidence |
|----|-------|-----|---------|------------|------|----------|----|----------|---------------------|
| PROD-01 | **Admin Catalog Service policy editor** — price min/max, default/recommended price, delivery hours, revisions, durations, active; shows teachers made non-compliant (J13-03 subset) | P1 | yes | — | M | ✅ (V1 values: Contract §3.2) | ❌ | ◐ (`GET /admin/catalog/services`, `PUT /admin/catalog/services/{id}`) | IT: narrowing a range marks offerings non-compliant and refuses out-of-range acceptance; journey: Admin sets range → teacher cannot price outside |

## PAY / MEET — Providers

| ID | Title | Pri | Blocker | Depends on | Size | Business | UX | Contract | Completion evidence |
|----|-------|-----|---------|------------|------|----------|----|----------|---------------------|
| PAY-01 | Select the production payment provider **and evaluate marketplace/seller-payout capabilities** of suitable Saudi providers (at minimum Moyasar and Tap Payments); merchant onboarding; sandbox credentials. The evaluation can proceed now; contract/sign-off waits for DEC-08 | P1 | yes | DEC-08 (contract sign-off) | M | ◐ | — | — | Written provider and payout-capability comparison; signed agreement; sandbox keys in secret store |
| PAY-02 | Implement the production `IPaymentProvider` — hosted checkout/redirect, signed webhook verification, refunds; Production config | P1 | yes | PAY-01 | L | ◐ | ◐ (checkout redirect copy) | ◐ (`IPaymentProvider`, `POST /payments/webhooks/{provider}`) | Adapter tests; webhook signature and replay tests; startup validation accepts the provider in Production |
| PAY-03 | Provider sandbox financial scenarios — success, failure, duplicate webhook, refund, escrow release, dispute settlement, reconciliation clean | P1 | yes | PAY-02, FIN-06 | M | ✅ | — | ◐ | Scenario log with provider references; reconciliation zero issues |
| PAY-04a | **V1 payout port + execution adapter** — `IPayoutProvider`; automated seller-payout adapter if PAY-01 shows the selected provider safely supports it, and the audited manual bank-transfer adapter as fallback in every case; provider/transfer reference; reconciliation; destination information held by the provider/bank or encrypted with restricted, audited access — never casually in plaintext; ledger semantics unchanged | P1 | yes | PAY-01 | L | ✅ (Contract §3.10) | — | ◐ (port to design) | Adapter tests; ledger unchanged (existing finance tests green); payout reconciliation report; end-to-end payout in sandbox or manual drill |
| MEET-01 | Production meeting provider — select the provider, then implement the adapter preserving booking, join window, authorization, completion, no-show and settlement (DEC-10) | P1 | yes | — | L | ◐ | — | ◐ (`ILiveSessionLinkProvider`) | Adapter tests; Production startup accepts provider; journey joins a real sandbox meeting |

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
| UX-01 | **Student home — action first** (UX_PRINCIPLES §4): action required, current work, upcoming session, start something — [UX-01](../tickets/v1/UX-01.md) | P1 | done 2026-09-16 | — | M | ✅ | ✅ | ✅ (no new contract; no home endpoint) | Journey: new student sees two CTAs; student with a delivered order sees "review delivery" first; Arabic phone |
| UX-02 | **Teacher home — action first**: setup blocker, action required, opportunities preview, upcoming session, earnings summary — [UX-02](../tickets/v1/UX-02.md) | P1 | done 2026-09-16 | — | M | ✅ | ✅ | ✅ (no new contract) | Journey: unpublished teacher sees blocker; published teacher sees new request first |
| UX-03 | **V1 navigation** (Student 5, Teacher 6, Quality 2, Admin 6), header bell/account menu, merged lists, redirects — [UX-03](../tickets/v1/UX-03.md) | P1 | done 2026-09-17 | — | M | ✅ | ✅ | ✅ (no new contract) | Route tests; old links redirect; Wave 1–3B journeys green |
| UX-04 | **Product statuses and fields in every list** — no numeric statuses, ids or "Updated/Count"; notification-type copy (server titles are English-only) — [UX-04](../tickets/v1/UX-04.md) | P1 | done 2026-09-16 | — | S | ✅ | ✅ | ✅ (no new contract) | Spec per list; screenshot audit of each list in AR/EN |
| UX-05 | **Remove duplicate open-marketplace paths** — retire the Wave 2 inline choose/offer on `/requests` (role redirect); header "Post a request" → `/requests/new`; teachers go to Open requests; reservation reminder links to the request — [UX-05](../tickets/v1/UX-05.md) | P1 | done 2026-09-16 | — | S | ✅ | ✅ | ✅ (no new contract) | Wave 2 journey replaced by 3B coverage; no route to the inline forms |
| UX-06 | **Arabic phone verification** — 20-screen matrix (teacher setup, messages, requests, offers, opportunity, checkout, booking/session, disputes) × 7 assertions — [UX-06](../tickets/v1/UX-06.md) | P1 | yes | UX-01, UX-02, UX-03, UX-04, UX-05, UX-07, UX-08, UX-09 | M | ✅ | ✅ | — | Journey screenshots at 390px AR with overflow and card-containment checks |
| UX-07 | **Hide unredeemable promo codes** — no coupon code and no Discount promotion on the landing (DEC-09 default V1.1) — [UX-07](../tickets/v1/UX-07.md) | P1 | yes | — | S | ✅ | ✅ | ✅ (no new contract) | Landing shows no coupon code; spec |
| UX-08 | **Hide the brief assistant when AI is disabled** (today it is shown and answers "unavailable") — [UX-08](../tickets/v1/UX-08.md) | P2 | yes | — | S | ✅ | ✅ | ✅ (new read: `GET /api/v1/ai/capabilities`) | Spec: hidden when disabled; visible and working when enabled |
| UX-09 | **Agreed price disclosure** (DEC-02, DEC-13) — one vertical slice: immutable server-side listed-price snapshot on Direct Request creation, migration (nullable, no backfill), read fields on request/order DTOs, the same price panel on request detail, order detail and checkout, authorization/regression tests, browser proof — [UX-09](../tickets/v1/UX-09.md) | P1 | yes | UX-04 | M | ✅ (Contract §3.2, §3.3) | ✅ | ✅ (no new endpoint; `listedPriceAtRequest`/`listedCurrencyAtRequest` on `LearningRequestDto`, `OrderDto`) | Failing domain + integration tests first; migration reviewed on SQL Server and SQLite; journey: offering 100 → request → offering 120 → accepted at 150 → request/order/checkout show 100 and 150, fee and total from 150; offering 130 leaves 100; other user 404; historical request shows no comparison; Arabic phone |

## QA / LEG — Release verification and legal

| ID | Title | Pri | Blocker | Depends on | Size | Business | UX | Contract | Completion evidence |
|----|-------|-----|---------|------------|------|----------|----|----------|---------------------|
| QA-01 | **Final staging E2E** — every V1 MUST journey on a production-like environment with sandbox providers, fresh database, Arabic phone for customer journeys | P1 | yes | PAY-03, PAY-04a, MEET-01, FIN-*, UX-*, INF-02 | M | ✅ | — | ✅ | Journey logs and screenshots; no P0/P1 open |
| QA-02 | **Browser journeys for built-but-unproven V1 actions** — answer a clarification, cancel a request, cancel an unpaid order, open and resolve a dispute, propose and answer a live-session reschedule | P1 | yes | FIN-07 (dispute resolve step) | M | ✅ | — | ✅ | Journey logs; defects become new tickets |
| LEG-01 | Terms, privacy, refund (full refunds only — DEC-05), cancellation, dispute, safeguarding and delivery personal-use/copyright (DEC-11) policies reviewed for the launch jurisdiction and published in Arabic and English | P1 | yes | DEC-08 | M | ◐ | ◐ | — | Legal sign-off; policy pages updated |

---

## Launch count

Recalculated on 2026-09-15 after the Product Owner decisions, by the blocker-count validation over the
tables above (rows whose Blocker column is "yes").

| Measure | Count | Tickets |
|---------|-------|---------|
| **Total V1 blocker tickets** | **38** (50 at RC1 → 44 after RC2 → 45 with DEC-13 → 44 when it was decided → 42 with UX-04 and UX-05 done → 41 with FIN-01 done → 40 with UX-01 done → 39 with UX-02 done → 38 with UX-03 done) | DEC 2 · FIN 6 · PROD 1 · PAY 4 · MEET 1 · SEC 5 · INF 7 · OBS 2 · DATA 1 · REL 1 · ENG 1 · UX 4 · QA 2 · LEG 1 |
| Change from Release Control 1 | −7 decisions closed, +1 UX-09; PAY-04 replaced by PAY-04a (PAY-04b → V1.1); **DEC-13 raised and decided in Release Control 3 (net 0)**; UX-09 re-estimated S → M; **UX-04, UX-05, FIN-01, UX-01, UX-02 and UX-03 done (−6)** | |
| Ready for implementation now (gates complete, no open dependency) | **11**, plus QA-02 except its dispute-resolution step (waits for FIN-07) | SEC-01, SEC-02, SEC-03, SEC-05, INF-01, INF-02, INF-05, INF-06, ENG-01, UX-07, UX-08 |
| UX tickets Ready (gates complete) but waiting on other tickets (build order) | **2** | UX-09 (UX-04 ✅ — ready to build), UX-06 (waits for UX-07, UX-08, UX-09) |
| Open blocking decisions | **2** | DEC-08 (legal/tax advice), DEC-12 (provider and region) |
| Directly blocked by an open decision | **7** | PAY-01 (contract sign-off only), SEC-04, INF-03, INF-04, INF-07, OBS-01, LEG-01 |
| Transitively dependent on an open decision | **18** | FIN-02, FIN-03, FIN-04, FIN-05, PAY-01, PAY-02, PAY-03, PAY-04a, SEC-04, INF-03, INF-04, INF-07, OBS-01, OBS-02, DATA-01, REL-01, QA-01, LEG-01 |
| Independent of open decisions | **18** | FIN-06, FIN-07, PROD-01, MEET-01, SEC-01, SEC-02, SEC-03, SEC-05, INF-01, INF-02, INF-05, INF-06, ENG-01, UX-06, UX-07, UX-08, UX-09, QA-02 |
| Requiring external / provider work | **11** | PAY-01, PAY-02, PAY-03, PAY-04a, MEET-01, SEC-01, SEC-02, INF-02, INF-03, INF-06, LEG-01 |
| UX-only | **4** | UX-06, UX-07, UX-08, UX-09 (UX-01…UX-05 are done) |
| Security / infrastructure / operations | **17** | SEC-01…05, INF-01…07, OBS-01, OBS-02, DATA-01, REL-01, ENG-01 |
| Product engineering (money-out, catalog) | **7** | FIN-02…07, PROD-01 (FIN-01 done) |
| Verification | **2** | QA-01, QA-02 |
| Non-blocking tickets tracked here | 7 | DEC-03, DEC-07, DEC-09, FIN-08, OPS-01…03 (+ UX-10 to triage) |

The category rows overlap on purpose; the first row is the single authoritative total.

**Tafseel is 38 tickets away from V1 production readiness** (UX-04, UX-05, FIN-01, UX-01 and UX-02 were built and released on 2026-09-16; UX-03 on 2026-09-17). DEC-08 may add TAX tickets and DEC-12 may add
STOR-01 when they are decided; the count is recalculated then.

### Critical path after the decisions

The longest chain is now the **payout chain**:
**DEC-08 (contract sign-off) → PAY-01 provider + payout-capability evaluation (M; evaluation can start now)
→ PAY-04a payout port + adapter (L) → FIN-02 (M) → FIN-03 (M, also after FIN-01) → FIN-05 (M) → QA-01 (M) →
launch.**
Parallel near-critical chains: PAY-01 → PAY-02 (L) → PAY-03 (M, also after FIN-06) → QA-01; and DEC-12 →
INF-03 → DATA-01 / REL-01 → QA-01.

> The Release Control 2 analysis and the decision records are in [`V1_DECISION_PACK.md`](./V1_DECISION_PACK.md)
> and [`V1_OWNER_DECISIONS.md`](./V1_OWNER_DECISIONS.md).

### Non-blocking operations tickets (SHOULD)

| ID | Title | Pri | Depends on | Size |
|----|-------|-----|------------|------|
| OPS-01 | Admin attention list (disputes, withdrawals, payout profiles, stuck sessions) as the Admin home | P2 | FIN-04, FIN-05, FIN-07 | M |
| OPS-02 | Admin review moderation detail and hide/show (J7-02) | P2 | — | S |
| OPS-03 | Admin resolution of a stuck live session (J8-08; endpoints exist) | P2 | — | S |
| UX-10 | Order delivery form accepts the server's allowed types (DOCX, PPTX, ZIP are refused by the client check today) — found in RC2, to triage | P2 | — | S |

### Suggested order (not a plan commitment)

1. Obtain the DEC-08 legal/tax advice and the DEC-12 data-residency advice; start the PAY-01 provider and
   payout-capability evaluation (Moyasar and Tap Payments at minimum) and the MEET-01 provider selection now.
2. Ready tickets: SEC-01, SEC-02 first; then SEC-03, SEC-05, INF-01, INF-02, INF-05, INF-06, ENG-01, QA-02.
3. Gate writing (UX and contract) for PROD-01, FIN-06, FIN-07 (FIN-01 and UX-01…09 written in Release Control 3; DEC-13 decided).
4. After PAY-01: PAY-04a → FIN-02/FIN-04 → FIN-03 → FIN-05; PAY-02 → PAY-03.
5. After DEC-12: INF-03, INF-04, INF-07, SEC-04, OBS-01, OBS-02, DATA-01, REL-01; LEG-01 after DEC-08.
6. UX (Release Control 3 batches, [tickets](../tickets/v1/README.md#recommended-batches-wip-one-major-journey-or-two-small-independent-tickets)): ~~A UX-04 + UX-05~~ → ~~B FIN-01~~ → ~~C UX-01~~ → ~~D UX-02~~ (2026-09-16) → ~~E UX-03~~ (2026-09-17) → F UX-07 + UX-08 (can be pulled forward) → G UX-09 (DEC-13 decided; after UX-04) → H UX-06.
7. QA-01, then launch decision.
