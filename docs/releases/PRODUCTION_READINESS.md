# Tafseel V1 Production Readiness

**Status:** the definitive launch checklist · Release Control 1, 2026-09-15, from `bec03a8`; updated in
Release Control 2 with the Product Owner decisions ([owner decisions](./V1_OWNER_DECISIONS.md)).
Supersedes the July checklist in [`docs/production-checklist.md`](../production-checklist.md) (its items
are carried into this file).

Rules: an item is ✅ only with evidence on the current branch. ❌ means not done. ⛔ means blocked by an
owner decision. **Nothing incomplete is marked green.** Each open item names its blocker ticket in
[`V1_RELEASE_BLOCKERS.md`](./V1_RELEASE_BLOCKERS.md). Percentages are `✅ items ÷ all items` in that
category — there is **no overall percentage**, because the categories are not comparable in weight.

| Category | ✅ | Total | Ready |
|----------|----|-------|-------|
| Product completeness | 11 | 17 | **65%** |
| UX readiness | 5 | 11 | **45%** |
| Financial readiness | 6 | 9 | **67%** |
| Security | 5 | 10 | **50%** |
| Providers | 1 | 7 | **14%** |
| Infrastructure | 3 | 11 | **27%** |
| Observability | 1 | 3 | **33%** |
| Data / migrations | 2 | 3 | **67%** |
| QA | 3 | 5 | **60%** |
| Legal / operations | 0 | 2 | **0%** |
| Rollback / recovery | 1 | 2 | **50%** |

**Launch decision:** not ready. Tafseel is **41 blocker tickets** from V1 production readiness (UX-04, UX-05 and FIN-01 were built and released on 2026-09-16; Release Control 3 raised and
decided DEC-13; UX tickets now have Gates 1–3 written in [`docs/tickets/v1/`](../tickets/v1/README.md)).

---

## 1. Product completeness

| # | Item | State | Evidence / ticket |
|---|------|-------|-------------------|
| P1 | Account: register, confirm, sign in, reset password | ✅ | Wave 1 E2E 8/8, Wave 3A/3B registration |
| P2 | Discovery: browse teachers, public profile with offerings and reviews | ✅ | Wave 3B direct journey (Arabic phone) |
| P3 | Direct request → accept → pay → start → deliver → revision → complete → review | ✅ (mock payment) | `wave3b-direct-order` 15/15 |
| P4 | Open request → offers → compare → select → reserve → pay → one order | ✅ (mock payment) | `wave3b-open-marketplace` 9/9 |
| P5 | Messaging with SignalR, fallback, protected attachments | ✅ | `wave3b-messaging` 8/8 |
| P6 | Live session book → pay → join → completion and no-show settlement | ✅ (mock meeting) | `wave3b-live-session` 9/9 |
| P7 | Teacher supply: apply → review → profile → offerings → availability → publish | ✅ | `wave3a-teacher-supply` 18/18 |
| P8 | Quality review queue and decisions | ✅ | `wave3a-teacher-supply` 18/18 |
| P9 | Teacher earnings, payout profile, withdrawals | ❌ | FIN-02, FIN-03 (FIN-01 earnings done 2026-09-16) |
| P10 | Admin payout verification and withdrawal processing | ❌ | FIN-04, FIN-05 |
| P11 | Admin refund | ❌ | FIN-06 |
| P12 | Admin dispute handling complete (message parties, resolve) | ❌ | FIN-07 |
| P13 | Catalog price boundaries governed by Admin (V1 values decided — DEC-01) | ❌ | PROD-01 |
| P14 | Accepted-price rule confirmed | ✅ | DEC-02 decided (Contract §3.2) |
| P15 | Live sessions in or out of V1 | ✅ | DEC-10 decided: in V1 |
| P16 | Protected video streaming requirement decided | ✅ | DEC-11 decided: private files in V1; streaming/DRM V1.1+ |
| P17 | Built-but-unproven V1 actions proven in the browser (clarification reply, cancel request, cancel unpaid order, dispute) | ❌ | QA-02 |

## 2. UX readiness

| # | Item | State | Evidence / ticket |
|---|------|-------|-------------------|
| U1 | Item screens use the "next step" pattern (request, offers, opportunity, order, session, messages) | ✅ | Wave 3B |
| U2 | Primary student order flow verified in Arabic at 390px (RTL, no overflow, no spill) | ✅ | `wave3b-direct-order` |
| U3 | Arabic/English string coverage gate | ✅ | `check:i18n` 1,067 keys |
| U4 | Student home is action-first | ❌ | UX-01 |
| U5 | Teacher home is action-first | ❌ | UX-02 |
| U6 | V1 navigation (5–7 destinations per role) | ❌ | UX-03 |
| U7 | No raw statuses, ids or technical field labels in lists | ✅ | UX-04 done 2026-09-16 (`ux04-product-words` 7/7) |
| U8 | No duplicate paths to the same goal | ✅ | UX-05 done 2026-09-16 (`ux05-canonical-paths` 6/6) |
| U9 | All customer-facing screens verified in Arabic at 390px | ❌ | UX-06 |
| U10 | No dead or misleading controls (unredeemable promo codes, disabled AI assistant) | ❌ | UX-07, UX-08 |
| U11 | Agreed price disclosed when it differs from the price at request time (DEC-02, DEC-13 snapshot) | ❌ | UX-09 (Ready) |

## 3. Financial readiness

| # | Item | State | Evidence / ticket |
|---|------|-------|-------------------|
| F1 | Escrow, double-entry ledger, idempotent payments, reconciliation implemented and tested | ✅ | `FinancialSafetyTests`, `EarningsMaturityConcurrencyTests`, `Phase7FinancialTests` (SQL Server 223/223) |
| F2 | Earnings pending clearance until the dispute window ends; maturity worker | ✅ | `EarningsMaturityConcurrencyTests`; 3B journeys show Pending (0) |
| F3 | Open-request order created exactly once on payment | ✅ | `OpenMarketplaceTests`, `wave3b-open-marketplace` |
| F4 | Commercial fees confirmed | ✅ | DEC-06 decided (Contract §3.7, §5) |
| F5 | Refund policy decided | ✅ | DEC-05 decided: full refunds only (Contract §3.11) |
| F6 | Payout mechanism decided | ✅ | DEC-04 decided: `IPayoutProvider` + audited manual fallback (Contract §3.10) |
| F7 | Money-out screens (teacher and admin) and payout execution | ❌ | FIN-01…FIN-05, PAY-04a |
| F8 | Refund operation available to Admin | ❌ | FIN-06 |
| F9 | Provider sandbox financial scenarios passed | ❌ | PAY-03 |

## 4. Security

| # | Item | State | Evidence / ticket |
|---|------|-------|-------------------|
| S1 | Server-side authorization per participant/role, proven by integration tests | ✅ | Wave 3A/3B authorization suites |
| S2 | CSP without `unsafe-eval` | ✅ | route probe "CSP has no 'unsafe-eval'" |
| S3 | Refresh-token rotation with its own rate limit | ✅ | Wave 2 (G-19) |
| S4 | Files only through authorized content endpoints; no public storage URLs | ✅ | Wave 3B messaging journey; `Phase5OrderTests` |
| S5 | Production startup fails closed (mock payment/meeting, local storage, development keys refused) | ✅ | `DependencyInjection.cs` validations; `ConfigurationValidationTests` |
| S6 | Exposed seed/UAT credentials rotated | ❌ | SEC-01 |
| S7 | Staging host secrets rotated | ❌ | SEC-02 |
| S8 | Production secrets only in the secret store | ❌ | SEC-03 |
| S9 | Malware scanning for uploads | ❌ | SEC-04 |
| S10 | Authorization sweep incl. suspended and anonymous accounts | ❌ | SEC-05 |

## 5. Providers

| # | Item | State | Evidence / ticket |
|---|------|-------|-------------------|
| V1 | Payment provider selected and onboarded | ❌ | PAY-01 |
| V2 | Production payment adapter | ❌ | PAY-02 |
| V3 | Payment sandbox verification | ❌ | PAY-03 |
| V4 | Payout execution (`IPayoutProvider`, manual fallback, provider payouts if safe) | ❌ | PAY-01, PAY-04a |
| V5 | Production meeting provider (live sessions are in V1) | ❌ | MEET-01 |
| V6 | Email from a verified domain | ❌ | INF-06 |
| V7 | Private object storage adapter (Azure Blob) implemented | ✅ | `AzureBlobFileStorageService`; Production requires it |

## 6. Infrastructure

| # | Item | State | Evidence / ticket |
|---|------|-------|-------------------|
| I1 | CI, Security, Database, Docker, Release and deploy workflows defined | ✅ | `.github/workflows/*` |
| I2 | Reproducible clean checkout (locked restore, `npm ci`, build) | ✅ | Wave 3B clean checkout and baseline reproduction |
| I3 | Publish, publish validation and deploy-gate tests | ✅ | `validate-publish.ps1`; deploy gates 57/57 |
| I4 | Docker image built and probed in CI (G-20) | ❌ | INF-01 |
| I5 | GitHub environments, protected `main`, workflows green on GitHub | ❌ | INF-02 |
| I6 | Production hosting provider and data region decided (direction recorded: managed PaaS, single instance, managed SQL Server-compatible database, private object storage, managed secrets, observability) | ⛔ | DEC-12 (open: data-residency/legal advice, service availability) |
| I7 | Production SQL Server provisioned (encryption, least privilege, backups) | ❌ | INF-03 |
| I8 | Shared durable Data Protection keys | ❌ | INF-04 |
| I9 | Production private blob container configured | ❌ | INF-05 |
| I10 | Least-privilege / OIDC deployment adapter | ❌ | INF-07 |
| I11 | Initial bundle with healthy headroom (≤ 600 kB; today 696.7 kB) | ❌ | ENG-01 |

## 7. Observability

| # | Item | State | Evidence / ticket |
|---|------|-------|-------------------|
| O1 | Structured logging, health endpoints (`/health/live`, `/health/ready`), correlation ids, Application Insights package | ✅ | `Program.cs`, route probe |
| O2 | Central logs, metrics, alerts, uptime, on-call owner | ❌ | OBS-01 |
| O3 | Background job metrics and alerts (auto-release, maturity, settlement, reservation expiry) | ❌ | OBS-02 |

## 8. Data / migrations

| # | Item | State | Evidence / ticket |
|---|------|-------|-------------------|
| D1 | EF migrations with no pending model changes; migration-safety script tests | ✅ | `has-pending-model-changes` none; `check-migration-safety.tests.ps1` |
| D2 | Staging migration script tests | ✅ | `staging-migration.tests.ps1` |
| D3 | Production migration applied from the reviewed idempotent script with backup evidence | ❌ | DATA-01 |

## 9. QA

| # | Item | State | Evidence / ticket |
|---|------|-------|-------------------|
| Q1 | All suites green (Architecture 1, Domain 117, Application 14, integration neutral 375 and SQL Server 223, Angular 331) | ✅ | Wave 3B report |
| Q2 | Strict API contract gate at 0 violations (217/217) | ✅ | Wave 3B report |
| Q3 | Wave 1, 2, 3A and 3B journeys green on fresh databases | ✅ | Wave 3B report |
| Q4 | Built-but-unproven V1 actions proven in the browser | ❌ | QA-02 |
| Q5 | Final staging E2E with sandbox providers | ❌ | QA-01 |

## 10. Legal / operations

| # | Item | State | Evidence / ticket |
|---|------|-------|-------------------|
| L1 | VAT / e-invoicing position — qualified Saudi legal/tax advice required before provider contract and checkout/invoice wording | ⛔ | DEC-08 (open) |
| L2 | Terms, privacy, refund, cancellation, dispute, safeguarding policies reviewed and published (AR/EN) | ❌ | LEG-01 |

## 11. Rollback / recovery

| # | Item | State | Evidence / ticket |
|---|------|-------|-------------------|
| R1 | Rollback strategy documented; immutable release artifacts and checksum verification in the production workflow | ✅ | [`rollback-strategy.md`](../rollback-strategy.md), `deploy-production.yml` |
| R2 | Restore, rollback, secret-rotation and key-persistence drills performed | ❌ | REL-01 |

---

## Known remaining items (checked against this list)

Wave 3C money-out/admin-finance surfaces (P9–P12, F7, F8) · real payment provider (V1–V3) · payout
approach (V4) · real meeting provider (V5) · credential rotation (S6, S7) · G-20 Docker CI (I4) ·
secure video/media if launch requires protected paid video (P16) · production observability and alerts
(O2, O3) · final staging E2E (Q5) — all present above, plus the items the repository and audits add:
pricing governance, malware scanning, hosting decision, email domain, data-protection keys, migrations,
drills, legal/tax, UX consolidation and bundle headroom.
