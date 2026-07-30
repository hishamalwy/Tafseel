# ADR-010: Teacher Reputation and Trust Badges

## Status

Proposed.

## Context

Steps 1–4 of the current MVP track delivered Teacher Metrics Integrity (F-002), Teacher Comparison, Live Session Availability, and Limited Student Learning Preferences. Step 5 asks which Teacher reputation badges can be supported **truthfully** from existing persisted production evidence.

Phase 0–1 and F-002 established that public Teacher confidence must rest only on persisted production evidence. Active subject qualifications and moderated review aggregates are already safe public signals. Frontend “Top rated” invent (`rating >= 4.8 && ratingCount >= 20`) is not an approved product rule. Stale `CompletedOrders` and self-reported `ResponseTimeMinutes` must not return as performance claims. No AI reputation, hidden composite score, or restored F-002 metric is allowed.

Repository evidence:

- [ADR-001](./ADR-001-VERIFIED-TEACHER-DERIVATION.md)
- [ADR-006](./ADR-006-TEACHER-AVAILABILITY-AND-CAPACITY.md)
- [ADR-007](./ADR-007-TEACHER-PORTFOLIO-MODERATION.md)
- [F-002 report](../fixes/F002_TEACHER_METRICS_INTEGRITY_REPORT.md)
- [TeacherSubjectQualification](../../src/Tafseel.Domain/TeacherApplications/TeacherApplication.cs)
- [TeacherReview / Governance](../../src/Tafseel.Domain/Governance/Governance.cs)
- [Orders and deliveries](../../src/Tafseel.Domain/Orders/Orders.cs)
- [Live sessions](../../src/Tafseel.Domain/LiveSessions/LiveSessions.cs)
- [Marketplace contracts](../../src/Tafseel.Application/Marketplace/MarketplaceContracts.cs)
- [MarketplaceService](../../src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs)
- [Browse Teachers](../../Tafseel-Browse-Teachers.dc.html)
- [Teacher Profile](../../Tafseel-Teacher-Profile.dc.html)
- [Phase 0–1 audit](../audits/TAFSEEL_PHASE_0_1_AUDIT_REPORT.md)
- [PROJECT_STATUS](../PROJECT_STATUS.md)

## Phase A — Evidence Inventory

| Signal | Persisted source | Writer | Public today | Trust | Completeness | Manipulability |
|---|---|---|---|---|---|---|
| Active subject qualification | `TeacherSubjectQualification` (`Approved`, `RevokedAt` null) | Quality approve / revoke (`TeacherApplicationService`) | `Verified` + subject lists | High | Complete | Teacher cannot self-approve |
| Qualification revocation | `Status=Revoked`, `RevokedAt`, reason | Quality revoke | Reflected as lost Verified/subjects | High | Complete | Admin/Quality only |
| Moderated ratings | `TeacherReview` where `IsVisible` → `TeacherProfile` aggregates | Student create; Admin moderate; `RefreshRatingAsync` | Nullable `rating` / `ratingCount` | High | Complete for metric display | Gaming possible later; moderation is gate |
| Completed orders (column) | `TeacherProfile.CompletedOrders` | **No production writer** | Returned `null` (F-002) | Unsafe | Incomplete | N/A — do not restore |
| Self-reported response | `ResponseTimeMinutes` via profile update | Teacher | Public `null`; owner may see self value | Unsafe as measured claim | Self-declared | Fully Teacher-writable |
| Order completion / delivery timing | `Order.Status`, `AgreedDeliveryAt`, `OrderDelivery.CreatedAt`, revisions, refunds | Order/finance services | Not projected as rates | Medium raw | Formula missing | Self-booking / micro-orders possible without rules |
| Live session completion | `LiveSession.Status` (`Completed`, no-shows, cancel) | Live session lifecycle | Private dashboard only (F-002) | Medium raw | Formula missing | Capacity/gaming rules open |
| Disputes / refunds | `Dispute`, `Refund` | Governance / finance | Not public teacher rates | High private | Present; public claim unsafe | Not for badges |
| Favorites | `FavoriteTeacher` | Student toggle | Favorite UX only | Low as quality | Complete | Student preference ≠ quality |
| Availability summary | Live rules + bookings → summary states | `LiveSessionService` | Browse/Profile/Comparison summaries | Medium dynamic | Complete as state | Scheduling state, not reputation |
| Showcase / qualification sample | `TeacherTeachingSample` + versions + `TrustCode` | Qualification approve; Teacher submit; Quality moderate | Per-sample labels | High content-scoped | Complete | Showcase cannot claim Teacher performance |
| Identity / degree verified | **None** | N/A | N/A | Missing | Missing workflows | — |
| Audit | `AuditLogEntry`, financial audit | Governance / finance / marketplace | Admin | High for forensics | Complete for existing actions | No badge award audit (none exist) |
| Frontend Top rated | Local invent ≥4.8 / ≥20 | Client only | Browse + Profile chips | Unsafe | Invented | Anyone viewing client logic |

No `TeacherBadge`, award table, Admin performance-grant API, or code-defined badge catalog exists yet.

## Badge Categories

Keep categories separate. Never collapse them under one generic “Verified” or “Top” label that mixes performance and formal verification.

| Category | Meaning | MVP treatment |
|---|---|---|
| **Verification** | Formal platform workflow outcomes | Trust-Only projection allowed |
| **Performance** | Measured marketplace quality/speed | Blocked until formulas approved |
| **Milestones** | Factual engagement counts | Blocked until completion semantics approved |
| **Content Trust** | Labels on media items (ADR-007) | Keep sample-scoped; not Teacher badges |
| **Availability** | Dynamic scheduling state (ADR-006) | Not badges |
| **Administrative** | Manual grants / marketing titles | Rejected for performance; no grant path |

## Candidate Classification (exact one each)

| # | Badge | Category | Classification |
|---|---|---|---|
| 1 | Qualified on Tafseel | Verification | **Ready From Existing Evidence** |
| 2 | Qualified Subject | Verification | **Ready From Existing Evidence** (subject-scoped evidence, not separate award row) |
| 3 | Highly Rated | Performance | **Requires Formula Decision** |
| 4 | Top Rated | Performance | **Unsafe Public Claim** (frontend invent; thresholds unapproved) |
| 5 | Trusted Teacher | Verification / Marketing | **Unsafe Public Claim** (ambiguous; duplicates qualification without new evidence) |
| 6 | Fast Responder | Performance | **Unsafe Public Claim** if self-reported; measured form **Requires Formula Decision** |
| 7 | On-Time Delivery | Performance | **Requires Formula Decision** / **Requires Missing Data** (delay attribution) |
| 8 | Repeat Students | Performance | **Requires Formula Decision** |
| 9 | Popular Teacher | Performance / Marketing | **Unsafe Public Claim** / **Out of MVP** (favorites ≠ quality; no popularity formula) |
| 10 | Completed 10 Sessions | Milestones | **Requires Formula Decision** |
| 11 | Completed 50 Sessions | Milestones | **Requires Formula Decision** |
| 12 | Qualification Sample | Content Trust | **Ready From Existing Evidence** (content label only) |
| 13 | Reviewed Showcase | Content Trust | **Ready From Existing Evidence** (content label only) |
| 14 | Available Today | Availability | **Out of MVP** as badge (dynamic state already exists) |
| 15 | Available This Week | Availability | **Out of MVP** / rejected filter (ADR-006) |
| 16 | Identity Verified | Verification | **Requires Missing Data** |
| 17 | Degree Verified | Verification | **Requires Missing Data** |
| 18 | Top Mentor | Administrative / Marketing | **Administrative Only** / rejected as public performance claim |
| 19 | New Teacher | Milestones / Marketing | **Requires Formula Decision** (definition of “new” unknown) |
| 20 | Community Favorite | Performance / Marketing | **Out of MVP** (favorites are preference, not proof) |

## Candidate Analysis

### 1. Qualified on Tafseel

| Field | Value |
|---|---|
| Current persisted evidence | ≥1 `TeacherSubjectQualification` with `Status == Approved` and `RevokedAt == null` |
| Who writes | Quality approval / revocation workflows |
| Can Teacher manipulate? | No (cannot self-approve) |
| Current data completeness | Complete |
| Missing rule? | No for boolean eligibility; public wording must not claim teaching superiority |
| Privacy issue? | No |
| Safe public? | Yes |
| Recommended action | **Approve** as `qualified_on_tafseel` v1 on-read projection |

### 2. Qualified Subject

| Field | Value |
|---|---|
| Current persisted evidence | Same active qualification rows → Subject catalog |
| Who writes | Same as above |
| Can Teacher manipulate? | No |
| Current data completeness | Complete |
| Missing rule? | No |
| Privacy issue? | No |
| Safe public? | Yes as subject list / “Qualified in {Subject}” |
| Recommended action | **Keep** as subject-scoped evidence on profile/cards; not a separate award table in MVP |

### 3. Highly Rated

| Field | Value |
|---|---|
| Current persisted evidence | Visible moderated `TeacherReview` → `AverageRating` / `RatingCount` |
| Who writes | Students (create); Admins (moderate); aggregate refresh |
| Can Teacher manipulate? | Indirectly (review solicitation); moderation is authoritative |
| Current data completeness | Complete for metric display |
| Missing rule? | **Yes** — min average, min sample, window, rounding, revocation |
| Privacy issue? | No for aggregates already public |
| Safe public? | Metric yes; badge **no** until formula BR |
| Recommended action | **Block badge**; keep nullable rating/count; present threshold options only |

### 4. Top Rated

| Field | Value |
|---|---|
| Current persisted evidence | None server-side; Browse/Profile invent `rating >= 4.8 && ratingCount >= 20` |
| Who writes | Client invent |
| Can Teacher manipulate? | Same as reviews |
| Current data completeness | Invented policy |
| Missing rule? | **Yes** — product never approved these thresholds |
| Privacy issue? | Misleading Students |
| Safe public? | **No** |
| Recommended action | **Remove invent** in implementation pass; do not silently adopt ≥4.8/≥20 |

### 5. Trusted Teacher

| Field | Value |
|---|---|
| Current persisted evidence | No distinct trust score; overlaps qualification + marketing |
| Who writes | N/A |
| Can Teacher manipulate? | N/A |
| Current data completeness | No unique evidence |
| Missing rule? | **Yes** — undefined vs Qualified |
| Privacy issue? | Confusion risk |
| Safe public? | **No** as separate badge |
| Recommended action | **Reject**; use `qualified_on_tafseel` wording only |

### 6. Fast Responder

| Field | Value |
|---|---|
| Current persisted evidence | Self-reported `ResponseTimeMinutes`; raw request/message timestamps exist but no first-response event |
| Who writes | Teacher (self-report); chat/request writers for raw events |
| Can Teacher manipulate? | **Yes** for self-reported |
| Current data completeness | Unsafe / incomplete for measured claim |
| Missing rule? | **Yes** — first-response definition, window, exclusions |
| Privacy issue? | Possible if chat internals exposed poorly |
| Safe public? | **No** using self-report |
| Recommended action | **Defer**; never badge from self-reported minutes |

### 7. On-Time Delivery

| Field | Value |
|---|---|
| Current persisted evidence | `AgreedDeliveryAt` vs delivery `CreatedAt`; revisions/extensions/disputes/refunds exist separately |
| Who writes | Order lifecycle |
| Can Teacher manipulate? | Partial (negotiate deadlines; exclusions unclear) |
| Current data completeness | Partial |
| Missing rule? | **Yes** — eligible statuses, extensions, delay attribution, sample size, window |
| Privacy issue? | No if aggregate only |
| Safe public? | Not yet |
| Recommended action | **Defer** |

### 8. Repeat Students

| Field | Value |
|---|---|
| Current persisted evidence | Order/session pairs by Student–Teacher |
| Who writes | Marketplace lifecycle |
| Can Teacher manipulate? | Possible via multi-account / micro-engagements without rules |
| Current data completeness | Queryable |
| Missing rule? | **Yes** — completed+paid definition, refund/dispute exclusions, minimum repeats |
| Privacy issue? | Must not expose Student identities |
| Safe public? | Not yet |
| Recommended action | **Defer** |

### 9. Popular Teacher

| Field | Value |
|---|---|
| Current persisted evidence | Favorites and traffic not a quality proof; no approved popularity formula |
| Who writes | Students (favorites) |
| Can Teacher manipulate? | Favorites farmable |
| Current data completeness | Wrong meaning for quality |
| Missing rule? | **Yes** |
| Privacy issue? | Low |
| Safe public? | **No** as trust badge |
| Recommended action | **Out of MVP** |

### 10–11. Completed 10 / 50 Sessions

| Field | Value |
|---|---|
| Current persisted evidence | `LiveSession` / `Order` rows; **not** `CompletedOrders` column |
| Who writes | Session/order lifecycle |
| Can Teacher manipulate? | Self-booking / low-value loops without anti-gaming rules |
| Current data completeness | Raw rows exist; public formula open |
| Missing rule? | **Yes** — what counts as completed; paid-only; no-shows; order vs session mix |
| Privacy issue? | Low for counts |
| Safe public? | Not yet; using stale `CompletedOrders` is **forbidden** |
| Recommended action | **Defer**; ban F-002 column restoration |

### 12. Qualification Sample

| Field | Value |
|---|---|
| Current persisted evidence | Sample `TrustCode` / `SourceCode` from qualification-generated media |
| Who writes | Qualification approve path |
| Can Teacher manipulate? | No for trust code |
| Current data completeness | Complete |
| Missing rule? | Covered by ADR-007 |
| Privacy issue? | No |
| Safe public? | Yes on sample |
| Recommended action | **Keep content-scoped**; do not promote to Teacher performance badge |

### 13. Reviewed Showcase

| Field | Value |
|---|---|
| Current persisted evidence | Approved showcase version + `reviewed_showcase` trust code |
| Who writes | Teacher submit; Quality moderate |
| Can Teacher manipulate? | Submit only; approval is Quality |
| Current data completeness | Complete |
| Missing rule? | Covered by ADR-007 |
| Privacy issue? | No |
| Safe public? | Yes on sample |
| Recommended action | **Keep content-scoped** |

### 14. Available Today

| Field | Value |
|---|---|
| Current persisted evidence | Availability summary state `available_today` |
| Who writes | `LiveSessionService` projection |
| Can Teacher manipulate? | By editing rules/slots (expected for scheduling) |
| Current data completeness | Complete as dynamic state |
| Missing rule? | N/A for badges — wrong category |
| Privacy issue? | No |
| Safe public? | As summary yes; as reputation badge **no** |
| Recommended action | **Out of MVP** as badge; keep availability summary |

### 15. Available This Week

| Field | Value |
|---|---|
| Current persisted evidence | Legacy filter rejected (`availability_filter_unavailable`); no summary state |
| Who writes | N/A |
| Can Teacher manipulate? | N/A |
| Current data completeness | Intentionally unavailable |
| Missing rule? | Rejected in ADR-006 |
| Privacy issue? | No |
| Safe public? | **No** |
| Recommended action | **Reject** as badge |

### 16. Identity Verified

| Field | Value |
|---|---|
| Current persisted evidence | None (`ApplicationUser` has no KYC/identity flag; email confirmation ≠ identity) |
| Who writes | N/A |
| Can Teacher manipulate? | N/A |
| Current data completeness | Missing |
| Missing rule? | Entire workflow missing |
| Privacy issue? | Future KYC sensitivity |
| Safe public? | Not until workflow exists |
| Recommended action | **Requires Missing Data** — block |

### 17. Degree Verified

| Field | Value |
|---|---|
| Current persisted evidence | `TeacherApplication.Degree` is self-declared free text; credentials are self-entered |
| Who writes | Teacher |
| Can Teacher manipulate? | **Yes** |
| Current data completeness | Missing verification workflow |
| Missing rule? | Entire verification workflow missing |
| Privacy issue? | Credential documents may be sensitive |
| Safe public? | **No** |
| Recommended action | **Requires Missing Data** — block |

### 18. Top Mentor

| Field | Value |
|---|---|
| Current persisted evidence | None |
| Who writes | Would require Admin grant |
| Can Teacher manipulate? | If grantable, politics/gaming |
| Current data completeness | N/A |
| Missing rule? | No evidence-based rule |
| Privacy issue? | No |
| Safe public? | **No** as performance claim |
| Recommended action | **Administrative Only** rejected for public MVP; no grant UI |

### 19. New Teacher

| Field | Value |
|---|---|
| Current persisted evidence | Account/qualification `ApprovedAt` could be used, but definition unknown |
| Who writes | Identity / qualification |
| Can Teacher manipulate? | Low |
| Current data completeness | Partial |
| Missing rule? | **Yes** — days since first qualification? first publish? stigma risk? |
| Privacy issue? | Possible stigma |
| Safe public? | Not without BR |
| Recommended action | **Defer** |

### 20. Community Favorite

| Field | Value |
|---|---|
| Current persisted evidence | `FavoriteTeacher` counts |
| Who writes | Students |
| Can Teacher manipulate? | Farmable |
| Current data completeness | Complete but wrong meaning |
| Missing rule? | Favorites ≠ teaching quality |
| Privacy issue? | Low |
| Safe public? | **No** as trust badge |
| Recommended action | **Out of MVP** |

## Rule Evaluation (approved / blocked)

| Badge | Formula? | Min sample? | Time window? | Revocation? | Subject-specific? | Global? | Historical? | Current? | Explainable? | Approve? |
|---|---|---|---|---|---|---|---|---|---|---|
| Qualified on Tafseel | Boolean ≥1 active qual | 1 | Current | Immediate on zero active | Global chip; subjects listed separately | Yes | No public historical award | Yes | Yes | **Yes** |
| Qualified Subject | Active qual for subject | 1 per subject | Current | On subject revoke | Yes | No | No | Yes | Yes | **Yes** (evidence list) |
| Highly Rated | Unknown | Unknown | Unknown | Unknown | No | Likely | Unknown | Unknown | Partial | **No** |
| All other performance / milestones / identity / marketing | Unknown or missing | — | — | — | — | — | — | — | — | **No** |

If any required answer is unknown → do not approve implementation for that badge.

## Approved MVP Scope

**Select Trust-Only MVP (not full reputation).**

Approved:

1. Formalize qualification-derived Teacher trust as explicit, explainable badge projection `qualified_on_tafseel` (not a writable boolean).
2. Keep subject-qualified lists as subject-scoped verification evidence.
3. Keep content trust labels on samples only (`qualification_sample`, `reviewed_showcase`).
4. Continue showing honest nullable moderated rating/count as **metrics**, not as Highly Rated / Top Rated badges.
5. Remove frontend-invented “Top rated” during the implementation pass.

Rejected for this MVP:

- Highly Rated / Top Rated / Trusted Teacher / Top Mentor / Popular / Community Favorite
- Fast Responder / On-Time / Repeat Students / session milestones / New Teacher
- Identity Verified / Degree Verified
- Availability as durable reputation badges
- Manual Admin performance grants
- Hidden composite reputation score or ranking
- Restoring F-002-removed public metrics

## Rule Definition — `qualified_on_tafseel` v1

| Rule element | Definition |
|---|---|
| Code | `qualified_on_tafseel` |
| Category | Verification |
| Rule version | `v1` |
| Evidence | Count of active approved non-revoked `TeacherSubjectQualification` ≥ 1 |
| Numerator / denominator | Not rate-based; boolean eligibility |
| Exclusions | Revoked qualifications; email confirmation alone does not invent eligibility |
| Time window | Current state (not historical award) |
| Minimum sample | One active qualification |
| Recalculation | On read from live qualifications |
| Revocation | Lost immediately when zero active qualifications remain |
| Public wording | EN: “Qualified on Tafseel” — “Has an active approved subject qualification on Tafseel.” AR: localized equivalent |
| Subject scope | Global card chip when ≥1; profile also lists each qualified subject |

Canonical constraint (ADR-001): verification remains **derived**. Do not add writable `IsVerified` / badge grant flags.

### Highly Rated — blocked options (future BR only)

| Option | Min average | Min visible reviews | Window |
|---|---|---|---|
| A | 4.5 | 10 | Lifetime visible |
| B | 4.8 | 20 | Lifetime visible (matches invent — **not approved by coincidence**) |
| C | 4.5 | 20 | Rolling 12 months |

## Rule Versioning

**Code-Defined Rules.**

- Stable badge codes and `ruleVersion` constants in application code.
- Criteria documented here and covered by tests.
- Threshold changes require code review and deployment.
- Reject Admin-editable threshold UI in MVP.

## Calculation and Persistence

| Badge class | Persistence |
|---|---|
| Qualification trust | **Calculate on read** from active qualifications. No award table. |
| Performance awards | Persist only after formulas approved (future). |
| Content labels | Already on sample versions. |

First implementation: **no migration**.

## Public Trust Surfaces (maximum)

Prefer minimal UI. Avoid decoration.

| Surface | MVP maximum |
|---|---|
| Browse card | **1** trust chip (`qualified_on_tafseel` when eligible) + honest rating/count; **no** Top rated invent |
| Comparison | Same neutral trust codes; **no** ranking or winner |
| Teacher Profile | Trust section: global badge + subject list + short explanation; content labels stay on samples |
| Teacher Dashboard | Current derived trust + plain-language criteria; **no** progress bars toward performance badges |

## Architecture

Evaluate options:

| Option | Verdict for Trust-Only MVP |
|---|---|
| Separate reputation service | Overkill |
| Separate public reputation endpoint | Avoid — adds N+1 risk on Browse |
| Award / badge tables | Not needed yet |
| **Embedded DTO projection in marketplace queries** | **Selected** |

Recommended shape (illustrative):

```text
TeacherTrustBadgeDto
  code            // qualified_on_tafseel
  category        // verification
  ruleVersion     // v1
  subjectId?      // null for global chip
```

Build inside existing card/profile/comparison queries already joining qualifications. Avoid per-card round-trips.

Continue exposing `verified` / subjects for compatibility while badges are introduced; nullable `rating` / `ratingCount`; sample `trustCode`s. Do not restore public `CompletedOrders` or measured `ResponseTimeMinutes`.

## Security

- Teachers cannot self-award badges.
- Admins cannot manually grant performance badges in MVP (no grant API/UI).
- Qualification badges remain derived from approve/revoke.
- Review moderation remains authoritative for rating aggregates.
- No hidden reputation score.
- No unsupported metric returns (F-002 preserved).
- No public dispute/refund leakage through badges.

## Migration Impact

Trust-Only MVP: **No migration**.

Deferred only after performance formulas are approved: optional `TeacherBadgeAward` + rule-version metadata.

This decision pass generates **no** migration and changes **no** runtime code.

## Notifications

Defer badge earned/lost notifications for Trust-Only MVP. Qualification approve/revoke already has existing workflow communications where applicable.

## Consequences

Positive:

- Public trust stays auditable and ADR-001-aligned.
- Frontend invent can be removed without inventing new metrics.
- Performance claims remain blocked until formulas exist (F-002 preserved).

Accepted costs:

- No Highly Rated / on-time / response / milestone badges yet.
- Product owners must still approve rating thresholds before any Highly Rated badge.

## Rejected Alternatives

- Writable verification / manual Top Mentor grants
- Shipping frontend ≥4.8/≥20 as product policy by silence
- Restoring CompletedOrders or measured ResponseTimeMinutes
- Mixing Showcase labels into Teacher performance badges
- Availability as durable reputation
- Admin-editable badge threshold editor in MVP
- Hidden composite reputation score
- Full multi-badge reputation before formulas are complete

## Implementation Preconditions

1. Project `qualified_on_tafseel` on read from active qualifications; preserve ADR-001 derivation.
2. Localize name + short explanation; keep subject lists as subject-scoped evidence.
3. Remove Browse/Profile “Top rated” invent; keep honest rating/count.
4. Keep Showcase/Qualification Sample trust codes content-scoped.
5. Do not add performance badge entities, award tables, or Admin grant UI.
6. Do not restore F-002-removed public metrics or ranking.
7. Embed trust projection in existing marketplace queries (no N+1).
8. Add tests: revoke clears trust; unpublished eligibility vs publication rules; no Teacher write path; comparison remains neutral.
9. No migration unless a later approved performance-badge pass requires persistence.
10. No commit/push/deploy assumptions beyond the implementation charter.

## Final Verdict

**READY FOR TRUST BADGE IMPLEMENTATION**
