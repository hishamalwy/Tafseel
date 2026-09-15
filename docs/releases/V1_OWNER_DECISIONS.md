# Tafseel V1 — Owner Decisions

**Status document · Release Control 2 · 2026-09-15.** One entry per V1-blocking owner decision. Analysis,
options and recommendations: [`V1_DECISION_PACK.md`](./V1_DECISION_PACK.md). A decision moves to **DECIDED**
only when the owner states it explicitly; the entry then records the decision, the date and who decided, and
the listed documents are updated in the same change.

**All nine decisions are OPEN.** The "Recommendation" line is the pack's recommendation, not a decision.

| ID | Topic | Status | Recommendation (not decision) |
|----|-------|--------|-------------------------------|
| DEC-01 | Catalog Service price boundaries | OPEN | B — one validated range per service |
| DEC-02 | Direct-request accepted price | OPEN | B — negotiable inside Admin range; budget is guidance; disclose changed price |
| DEC-04 | Teacher payout mechanism | OPEN | C — `IPayoutProvider` with an audited manual adapter in V1 |
| DEC-05 | Refund policy | OPEN | A — full refunds only, by the existing lifecycle rules |
| DEC-06 | Commercial fees | OPEN | A — confirm 8% student fee on orders + 15% commission; no student fee on live sessions |
| DEC-08 | VAT and e-invoicing | OPEN | Obtain qualified Saudi legal/tax advice before provider contract and checkout copy |
| DEC-10 | Live sessions in V1 | OPEN | A — ship, unless the meeting provider is disproportionate |
| DEC-11 | Secure paid video at launch | OPEN | A — authorized protected files; streaming/DRM later |
| DEC-12 | Production hosting and data location | OPEN | S1 — managed PaaS, single instance, region per data-location advice |

---

## DEC-01 — Catalog Service price boundaries
- **Status:** OPEN
- **Decision:** —
- **Rationale:** —
- **Effective V1 rule:** — (today: 0.01–1,000,000 SAR async; 30–1,000,000 SAR per hour live)
- **Tickets unblocked:** PROD-01
- **Documents affected:** Product Contract §3.2; V1_SCOPE §10; V1_RELEASE_BLOCKERS (DEC-01, PROD-01)

## DEC-02 — Direct-request accepted price
- **Status:** OPEN
- **Decision:** —
- **Rationale:** —
- **Effective V1 rule:** — (today: any price inside the Catalog Service range; budget not enforced)
- **Tickets unblocked:** none directly; creates UX-09 (option B) or ACC-01 (options A/C)
- **Documents affected:** Product Contract §3.2; V1_RELEASE_BLOCKERS

## DEC-04 — Teacher payout mechanism
- **Status:** OPEN
- **Decision:** —
- **Rationale:** —
- **Effective V1 rule:** — (today: masked payout profile, Admin approval with provider reference, no transfer mechanism)
- **Tickets unblocked:** FIN-02, FIN-05, PAY-04 (then FIN-03, FIN-04); option C splits PAY-04 into PAY-04a/PAY-04b
- **Documents affected:** Product Contract §3.10; V1_SCOPE §11; V1_RELEASE_BLOCKERS; V1_1_BACKLOG (automated payouts if C)

## DEC-05 — Refund policy
- **Status:** OPEN
- **Decision:** —
- **Rationale:** —
- **Effective V1 rule:** — (today: full refunds only, lifecycle rules in Decision Pack DEC-05 §1)
- **Tickets unblocked:** FIN-06, LEG-01 (with DEC-08); then PAY-03
- **Documents affected:** Product Contract §3.8, §3.11; V1_1_BACKLOG (partial refunds); policies content via LEG-01

## DEC-06 — Commercial fees
- **Status:** OPEN
- **Decision:** —
- **Rationale:** —
- **Effective V1 rule:** — (today: orders 8% student fee + 15% commission; live sessions 15% commission only)
- **Tickets unblocked:** QA-01 (decision dependency only)
- **Documents affected:** Product Contract §3.7, §5

## DEC-08 — VAT and e-invoicing
- **Status:** OPEN — **requires qualified Saudi legal/tax advice**
- **Decision:** —
- **Rationale:** —
- **Effective V1 rule:** — (today: no tax handling in the product)
- **Tickets unblocked:** PAY-01, LEG-01 (with DEC-05); adds TAX tickets under outcomes T1/T2
- **Documents affected:** Product Contract §5 (+ new Tax section); V1_SCOPE §11; V1_RELEASE_BLOCKERS

## DEC-10 — Live sessions in V1
- **Status:** OPEN
- **Decision:** —
- **Rationale:** —
- **Effective V1 rule:** — (today: built and browser-proven with the mock provider; Production refuses the mock)
- **Tickets unblocked:** MEET-01 (option A) or removes it and adds LIVE-OFF-01 (option B)
- **Documents affected:** V1_SCOPE §6; Product Contract §3.8, §8; V1_RELEASE_BLOCKERS count

## DEC-11 — Secure paid video at launch
- **Status:** OPEN
- **Decision:** —
- **Rationale:** —
- **Effective V1 rule:** — (today: deliveries are authorized protected files ≤ 50 MB each, watermarked viewer)
- **Tickets unblocked:** none new under option A; MEDIA tickets under B/C
- **Documents affected:** V1_SCOPE §11; Product Contract §3.6

## DEC-12 — Production hosting and data location
- **Status:** OPEN
- **Decision:** —
- **Rationale:** —
- **Effective V1 rule:** — (today: host-agnostic deploy hook; code expects SQL Server, Azure Blob, file-path Data Protection keys, single-instance SignalR)
- **Tickets unblocked:** INF-03, INF-04, INF-07, SEC-04, OBS-01 (then DATA-01, REL-01, OBS-02); adds STOR-01 under shape S2
- **Documents affected:** PRODUCTION_READINESS (I6); Product Contract §8; V1_RELEASE_BLOCKERS; V1_1_BACKLOG (scale-out items)
