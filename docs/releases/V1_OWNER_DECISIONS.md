# Tafseel V1 — Owner Decisions

**Status document · Release Control 2 · recorded 2026-09-15.** One entry per V1-blocking owner decision.
Analysis and options: [`V1_DECISION_PACK.md`](./V1_DECISION_PACK.md). A decision is **DECIDED** only when the
Product Owner has stated it explicitly; the documents listed for it are updated in the same change.

| ID | Topic | Status | Decision |
|----|-------|--------|----------|
| DEC-01 | Catalog Service price boundaries | **DECIDED** | Option B — V1 policy table below |
| DEC-02 | Direct-request accepted price | **DECIDED** | Option B — negotiable inside Admin policy; budget is guidance; UX-09 |
| DEC-04 | Teacher payout mechanism | **DECIDED** | Option C — `IPayoutProvider` permanent architecture, audited manual fallback; PAY-04a / PAY-04b |
| DEC-05 | Refund policy | **DECIDED** | Option A — full monetary refunds only; partial refunds V1.1 |
| DEC-06 | Commercial fees | **DECIDED** | Option A — orders 8% + 15%; live sessions 15% only |
| DEC-08 | VAT and e-invoicing | **OPEN** | Qualified Saudi legal/tax advice required |
| DEC-10 | Live sessions in V1 | **DECIDED** | Option A — live sessions ship in V1 |
| DEC-11 | Secure paid video at launch | **DECIDED** | Option A — private authorized files; HLS/DASH/DRM V1.1+ |
| DEC-12 | Production hosting and data location | **OPEN** | Direction recorded; provider and region open |

All decisions were recorded as documentation and planning only; no code, configuration, database value or
historical record was changed.

---

## DEC-01 — Catalog Service price boundaries
- **Status:** DECIDED (Product Owner, 2026-09-15) — Option B
- **Decision:** V1 Catalog Service policy:

  | Catalog Service | Minimum | Maximum | Default | Recommended | Delivery hours (min / default / recommended / max) | Revisions (default / max) |
  |-----------------|--------:|--------:|--------:|------------:|-----------------------------------------------------|---------------------------|
  | `recorded_explanation` | 50 SAR | 800 SAR | 120 SAR | 120 SAR | 12 / 48 / 48 / 336 | 2 / 5 |
  | `assignment_guidance` | 60 SAR | 1,000 SAR | 150 SAR | 150 SAR | 24 / 72 / 72 / 336 | 2 / 3 |
  | `exam_revision` | 80 SAR | 1,500 SAR | 200 SAR | 200 SAR | 24 / 72 / 72 / 240 | 1 / 3 |
  | `live_session` | 60 SAR/hour | 600 SAR/hour | 150 SAR/hour | 150 SAR/hour | — (30/60/90/120 min) | 0 / 0 |

  The delivery and revision policy is the Decision Pack proposal; it does not conflict with any hard domain
  constraint. Recommended delivery hours equal the default because no separate value was proposed.
- **Rationale:** V1 platform guardrails; Admin owns the Catalog Service policy; teachers price only their
  Teacher Offerings inside it.
- **Effective V1 rule:** as above, validated by the backend. Not yet applied to any database (today's defaults
  remain until Admin applies them).
- **Tickets unblocked:** PROD-01 (still required to give Admin a proper policy editor)
- **Documents affected:** Product Contract §3.2 · V1_SCOPE §10 · V1_RELEASE_BLOCKERS · PRODUCTION_READINESS P13

## DEC-02 — Direct-request accepted price
- **Status:** DECIDED (Product Owner, 2026-09-15) — Option B
- **Decision:** a teacher may accept a Direct Request at a final price different from the listed Teacher
  Offering price, provided it remains inside the Admin Catalog Service policy, the student sees the final
  amount before paying, and the student is not charged until they explicitly proceed with payment. The
  student's optional budget remains guidance, not a hard server cap.
- **Rationale:** allows fair adjustment after the brief is read while the student keeps the decisive control
  (payment).
- **Effective V1 rule:** current server behaviour, plus disclosure: when the accepted price differs from the
  listed price, request, order and checkout show the listed price, the agreed price and the final amount
  payable.
- **Tickets unblocked / created:** **UX-09 — Agreed price disclosure** (V1 blocker, S; not implemented)
- **Documents affected:** Product Contract §3.2 · V1_SCOPE §4 · V1_RELEASE_BLOCKERS · PRODUCTION_READINESS U11

## DEC-04 — Teacher payout mechanism
- **Status:** DECIDED (Product Owner, 2026-09-15) — Option C
- **Decision:** `IPayoutProvider` is the permanent payout architecture. V1 must support a provider-independent
  payout interface; an audited manual bank-transfer adapter/fallback; a provider reference; reconciliation;
  secure handling of payout destination information; no plaintext full bank destination stored casually in
  the application database. An automated payout integration may replace or use another adapter without
  altering ledger semantics. Before implementing the manual adapter, PAY-01 evaluates the marketplace/payout
  capabilities of suitable Saudi providers, at minimum Moyasar and Tap Payments. If the selected payment
  provider can safely support marketplace seller payouts at V1, the automated adapter is preferred and the
  audited manual fallback is retained.
- **Rationale:** smallest safe V1 architecture without a dead end.
- **Effective V1 rule:** as above; ledger semantics unchanged.
- **Tickets unblocked / changed:** PAY-04 split into **PAY-04a** (V1 payout port + execution adapter, blocker)
  and **PAY-04b** (automated/alternative adapter not used in V1 → V1.1, `B11-23`); FIN-02 and FIN-05 no longer
  wait on a decision (they wait on PAY-04a); PAY-01 scope extended with the payout-capability evaluation.
- **Documents affected:** Product Contract §3.10, §8 · V1_SCOPE §8, §11 · V1_RELEASE_BLOCKERS · V1_1_BACKLOG ·
  PRODUCTION_READINESS F6, V4

## DEC-05 — Refund policy
- **Status:** DECIDED (Product Owner, 2026-09-15) — Option A
- **Decision:** V1 supports full monetary refunds only, preserving the existing lifecycle rules: unpaid
  cancellation moves no money; teacher cancellation refunds in full where currently implemented; teacher
  no-show refunds in full; student live-session cancellation ≥ 24 h before start refunds in full; late student
  cancellation or student no-show gives no refund under the current domain rules; contested delivered work is
  resolved financially only through a dispute; dispute outcomes remain full refund / release teacher / no
  financial action. Partial refunds are V1.1.
- **Rationale:** matches the implemented domain; minimum financial complexity.
- **Effective V1 rule:** as above (Contract §3.11 table). No financial or domain code was changed.
- **Tickets unblocked:** FIN-06; LEG-01 now waits only on DEC-08
- **Documents affected:** Product Contract §3.11, §9 · V1_SCOPE §10 · V1_1_BACKLOG `B11-21` · V1_RELEASE_BLOCKERS ·
  PRODUCTION_READINESS F5

## DEC-06 — Commercial fees
- **Status:** DECIDED (Product Owner, 2026-09-15) — Option A
- **Decision:** Orders — student fee 8% of the base/agreed price; teacher commission 15% of the base/agreed
  price. Live sessions — no additional student fee in V1; teacher commission 15%. Existing transaction
  snapshots remain authoritative; historical and current financial records are not altered. Provider fees and
  VAT are separate costs, not included in these percentages.
- **Rationale:** already implemented, snapshotted, tested and journey-proven.
- **Effective V1 rule:** current configuration (`Fees:StudentFeePercent = 8`, `Fees:TeacherCommissionPercent = 15`),
  unchanged.
- **Tickets unblocked:** QA-01 no longer waits on a fee decision
- **Documents affected:** Product Contract §3.7, §5 · PRODUCTION_READINESS F4

## DEC-08 — VAT and e-invoicing
- **Status:** **OPEN**
- **Decision:** — not decided.
- **Required before deciding:** **Qualified Saudi legal/tax advice is required before the production
  payment-provider contract/sign-off and before final checkout/invoice wording.** No tax behaviour is
  implemented until the tax position is decided.
- **Effective V1 rule:** — (today: no tax handling in the product)
- **Tickets blocked:** PAY-01 (contract sign-off; the provider evaluation may proceed), LEG-01; transitively
  PAY-02, PAY-03, PAY-04a, FIN-02…05, QA-01. May add TAX tickets (see Decision Pack DEC-08).
- **Documents affected when decided:** Product Contract §5 (+ Tax section) · V1_SCOPE §11 · V1_RELEASE_BLOCKERS ·
  PRODUCTION_READINESS L1

## DEC-10 — Live sessions in V1
- **Status:** DECIDED (Product Owner, 2026-09-15) — Option A
- **Decision:** Live Sessions are part of Tafseel V1. MEET-01 remains a launch blocker. The mock provider
  remains forbidden in Production. The real meeting provider must preserve the existing booking, join-window,
  authorization, completion, no-show and settlement lifecycle.
- **Rationale:** already built and browser-proven; removing it would save one provider ticket, not the product.
- **Effective V1 rule:** live-session rows in V1_SCOPE are MUST (no longer conditional); the reschedule control
  on the V1 session screen must work, so its browser journey joins QA-02.
- **Tickets unblocked:** MEET-01 (no longer conditional; provider selection is its first step)
- **Documents affected:** Product Contract §3.8, §8 · V1_SCOPE §3, §6, §11 · V1_1_BACKLOG (B11-19 moved to V1) ·
  V1_RELEASE_BLOCKERS · PRODUCTION_READINESS P15, V5

## DEC-11 — Secure paid video at launch
- **Status:** DECIDED (Product Owner, 2026-09-15) — Option A
- **Decision:** V1 paid asynchronous deliveries remain private, authorized order files rather than a reusable
  streaming-video product. Required V1 hardening: private storage; authorized content endpoints; no public
  permanent storage URLs; viewer watermark where applicable; malware scanning through SEC-04; appropriate
  cache/content security; personal-use/copyright terms. HLS/DASH and DRM are deferred to V1.1+ unless the
  business later introduces reusable multi-buyer video content. Tafseel does not claim screen-recording
  prevention.
- **Rationale:** matches the one-buyer delivery product; streaming/DRM cost is not justified for V1.
- **Effective V1 rule:** as above. Verified in RC2 (read-only): the content endpoints already send
  `private, no-store`, `nosniff`, a same-origin resource policy and inline disposition, and every `/api`
  response is `no-store` — no new ticket needed for cache/content headers.
- **Tickets unblocked:** none new; SEC-04 (scanning) and LEG-01 (personal-use/copyright terms) scope confirmed
- **Documents affected:** Product Contract §3.6 · V1_SCOPE §11 · V1_1_BACKLOG `B11-22` · PRODUCTION_READINESS P16

## DEC-12 — Production hosting and data location
- **Status:** **OPEN**
- **Decision:** — not decided.
- **Product Owner's preferred direction (recorded, not a decision):** managed PaaS; single application instance
  for V1 initially; managed SQL Server-compatible database; private durable object storage; managed secret store;
  production observability.
- **Still open:** the provider and the physical data region, pending Saudi data-residency/legal advice and
  confirmed service availability. No assumption is made that any particular cloud offers a Saudi region for
  these services. Nothing is provisioned.
- **Tickets blocked:** INF-03, INF-04, INF-07, SEC-04, OBS-01; transitively DATA-01, REL-01, OBS-02, QA-01. May add
  STOR-01 if the chosen object storage is not Azure Blob.
- **Documents affected when decided:** PRODUCTION_READINESS I6 · Product Contract §8 · V1_RELEASE_BLOCKERS
