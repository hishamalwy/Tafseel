# ADR-010: Teacher Reputation and Badge Rules

## Status

Proposed.

## Context

Phase 0–1 and F-002 established that public Teacher confidence must rest only on persisted production evidence. Active subject qualifications and moderated review aggregates are already safe public signals. Frontend “Top rated” invent (`rating >= 4.8 && ratingCount >= 20`) is not an approved product rule. Stale `CompletedOrders` and self-reported `ResponseTimeMinutes` must not return as performance claims.

This decision defines a small, truthful Teacher Reputation MVP: which badges may exist, which remain blocked, how rules are versioned, and how trust differs from content labels and dynamic availability.

Repository evidence:

- [ADR-001](./ADR-001-VERIFIED-TEACHER-DERIVATION.md)
- [ADR-007](./ADR-007-TEACHER-PORTFOLIO-MODERATION.md)
- [F-002 report](../fixes/F002_TEACHER_METRICS_INTEGRITY_REPORT.md)
- [TeacherSubjectQualification](../../src/Tafseel.Domain/TeacherApplications/TeacherApplication.cs)
- [TeacherReview / Governance](../../src/Tafseel.Domain/Governance/Governance.cs)
- [Orders and deliveries](../../src/Tafseel.Domain/Orders/Orders.cs)
- [Marketplace contracts](../../src/Tafseel.Application/Marketplace/MarketplaceContracts.cs)
- [MarketplaceService](../../src/Tafseel.Infrastructure/Marketplace/MarketplaceService.cs)
- [Browse Teachers](../../Tafseel-Browse-Teachers.dc.html)
- [Teacher Profile](../../Tafseel-Teacher-Profile.dc.html)
- [Phase 0–1 audit](../audits/TAFSEEL_PHASE_0_1_AUDIT_REPORT.md)
- [PROJECT_STATUS](../PROJECT_STATUS.md)

## Existing Reputation Evidence

| Signal | Source | Public today | Trust |
|---|---|---|---|
| Active subject qualification | `TeacherSubjectQualification` (`Approved` and `RevokedAt` null) | `Verified` + subject lists | High — formal workflow |
| Moderated visible rating | `TeacherReview` where `IsVisible`; profile `AverageRating` / `RatingCount` | Nullable rating + count | High — moderated aggregate |
| Content trust labels | Showcase/qualification sample `TrustCode` | Per-sample only | High — content-scoped |
| Availability summary | Live-session rules + bookings | Dynamic state enum | Medium — not durable reputation |
| `CompletedOrders` column | Profile integer | Returned `null` (F-002) | Unsafe — no production writer |
| `ResponseTimeMinutes` | Teacher profile update | Public `null`; owner may see self-reported | Unsafe as measured performance |
| Frontend “Top rated” | Local invent ≥4.8 / ≥20 | Shown on Browse/Profile | Unsafe — unapproved threshold |
| Favorites | `FavoriteTeacher` | Favorite toggle only | Not a quality proof |
| Order timing | `AgreedDeliveryAt`, `OrderDelivery.CreatedAt` | Not a badge | Partial — formula unresolved |
| Request/chat timestamps | Request history, messages | Not a badge | Incomplete without first-response definition |

No `TeacherBadge`, award table, Admin grant API, or code-defined badge catalog exists yet.

## Badge Categories

Keep categories separate. Never collapse them under one generic “Verified” label that mixes performance and formal verification.

### Verification badges

Derived from formal platform workflows (qualifications, and later identity/degree workflows only if they exist).

### Performance badges

Derived from measured marketplace activity with approved formulas (ratings, on-time delivery, response, repeats).

### Participation milestones

Factual counts of completed engagements under approved completion semantics.

### Content trust labels (not Teacher reputation)

`qualification_sample` and `reviewed_showcase` remain attached to media items (ADR-007).

### Dynamic state (not badges)

Availability summaries remain scheduling state, not durable reputation.

## Candidate Evaluation

| Badge | Classification | Notes |
|---|---|---|
| Qualified Teacher / active qualification trust | **Ready From Existing Evidence** | ADR-001 derivation already production |
| Highly Rated | **Requires Formula Decision** | Evidence exists; thresholds not product-approved |
| On-Time Delivery | **Requires Formula Decision** / **Requires Missing Data** for delay attribution | Timing fields exist; extensions/delay attribution/exclusions unresolved |
| Fast Responder | **Unsafe Public Claim** (self-reported); measured form **Requires Formula Decision** | No approved first-response event |
| Repeat Students | **Requires Formula Decision** | Queryable pairs exist; completion/refund rules unresolved |
| Favorites as quality | **Out of MVP** | Favorites prove preference, not teaching quality |
| Experience milestones | **Requires Formula Decision** | Must not use stale `CompletedOrders` |
| Showcase / Qualification Sample | **Ready From Existing Evidence** as content labels only | Not Teacher performance badges |
| Availability badges | **Out of MVP** | Dynamic state |
| Manual Admin “Top Teacher” | **Out of MVP** / **Administrative Badge** rejected for performance | No grant path; would diverge from evidence |

## Approved MVP Scope

**Select Option A — Trust-Only MVP.**

Approved in this MVP:

1. Formalize qualification-derived Teacher trust as an explicit, explainable badge projection (not a writable boolean).
2. Keep subject-qualified lists as subject-scoped trust evidence.
3. Keep content trust labels on samples only.
4. Continue showing honest nullable moderated rating/count as metrics — **not** as a Highly Rated badge until thresholds are approved.
5. Remove frontend-invented “Top rated” presentation during the implementation pass.

Rejected for this MVP:

- Option B (Trust + Highly Rated) — thresholds require explicit product approval.
- Option C (Full Reputation) — multiple performance formulas incomplete.

## Rule Definitions

### Badge `qualified_on_tafseel` (Verification)

| Rule element | Definition |
|---|---|
| Code | `qualified_on_tafseel` |
| Category | Verification |
| Rule version | `v1` |
| Evidence | Count of `TeacherSubjectQualification` where `Status == Approved` and `RevokedAt is null` ≥ 1 |
| Numerator / denominator | Not rate-based; boolean eligibility |
| Eligible statuses | Active approved qualifications only |
| Exclusions | Revoked qualifications; email confirmation alone; unpublished profile does **not** invent eligibility (badge may still be true but public card visibility follows publication rules) |
| Time window | Current state (not historical award) |
| Minimum sample | One active qualification |
| Recalculation | On read from live qualifications (and immediately after approve/revoke side effects) |
| Revocation | Lost immediately when zero active qualifications remain |
| Public wording | EN: “Qualified on Tafseel” — “Has an active approved subject qualification on Tafseel.” AR: localized equivalent. |
| Subject scope | Global card chip when ≥1 active qualification; profile also lists each qualified subject (existing subject evidence) |

Canonical constraint preserved: verification remains **derived**. Do not add a writable `IsVerified` / badge grant flag.

### Subject evidence (not a separate award row in MVP)

Public profile/card continue to expose active qualification subjects. Wording: “Qualified in {Subject}” as subject-scoped verification evidence, driven by the same active qualification rows.

### Content labels (unchanged)

- `qualification_sample`
- `reviewed_showcase`

Remain on sample DTOs only. Do not promote to Teacher-level performance badges.

### Highly Rated — blocked (options for a future BR)

Do not ship a Highly Rated badge until product owners approve one option:

| Option | Min average | Min visible reviews | Window | Notes |
|---|---|---|---|---|
| A | 4.5 | 10 | Lifetime visible | Conservative mid bar |
| B | 4.8 | 20 | Lifetime visible | Matches current frontend invent — **not approved by coincidence** |
| C | 4.5 | 20 | Rolling 12 months | Needs dated review population rules |

Until approved: show nullable rating + count only; remove invent chips.

### Performance / milestone badges — blocked

On-time, fast responder, repeats, and milestones remain deferred until formulas, eligible statuses, exclusions and windows are approved. Do not use self-reported response minutes or stale `CompletedOrders`.

## Rule Versioning

**Select Option A — Code-Defined Rules.**

- Stable badge codes and `ruleVersion` constants in strongly typed application code.
- Criteria documented in this ADR and implementation tests.
- Changing thresholds requires a code change, review and deployment.
- Reject Admin-editable threshold UI in MVP (silent reputation manipulation risk).

## Calculation and Persistence

**Select hybrid limited to Trust-Only needs:**

| Badge class | Persistence |
|---|---|
| Qualification trust | **Calculate on read** from active qualifications (Option A). No award table required. |
| Performance awards | Persist awards/revocations only after formulas are approved (future Option C). |
| Content labels | Already persisted on sample versions. |

Rationale: MVP badge count is one verification projection plus existing subject lists; on-read cost is already paid by marketplace joins. No migration for awards in the first implementation.

## Revocation

For `qualified_on_tafseel`:

- Immediate loss when active qualification count becomes zero (including after subject revocation cascades).
- No historical public badge retained after evidence is invalid.
- No Teacher celebration/loss notification required in Trust-Only MVP (state is derived and already visible via Verified).
- No appeal process beyond existing qualification/review workflows.

## API Architecture

Reuse marketplace projection; avoid N+1 per-card calls.

Recommended approach for the implementation pass:

1. Add a small reusable trust projection (e.g. `TeacherTrustBadgeDto` list or structured trust block) built inside existing card/profile/comparison queries.
2. Backend returns **stable codes** + `category` + `ruleVersion` + optional `subjectId`; frontend localizes via keys.
3. Do not invent a separate public reputation round-trip for MVP.

Illustrative shape (implementation must follow project naming):

```text
TeacherTrustBadgeDto
  code            // e.g. qualified_on_tafseel
  category        // verification
  ruleVersion     // v1
  subjectId?      // null for global qualification badge
```

Continue exposing:

- `verified` / active subjects (may remain for compatibility while badges are introduced),
- nullable `rating` / `ratingCount`,
- sample `trustCode`s.

Do not restore `CompletedOrders` or measured `ResponseTimeMinutes` publicly.

## Public UX

| Surface | MVP behavior |
|---|---|
| Browse card | One concise trust chip: Qualified on Tafseel when eligible; honest rating/count; **no** Top rated invent |
| Comparison | Same neutral trust codes; no ranking or winner |
| Public profile | Trust section: global qualification badge + subject list + explanations; content labels stay on samples |
| Teacher Dashboard | Current qualification trust state + plain-language criteria; no progress bars toward performance badges |
| Admin/Quality | No manual performance badge grant UI |

Maximum decorative badges: avoid filling cards. Prefer one trust chip on cards; detail on profile.

## Security, Fairness and Gaming

- Teachers cannot write calculated badges.
- Qualification revoke removes related trust.
- Review moderation continues to drive rating aggregates; no Highly Rated badge until rules exist.
- No hidden reputation score or ranking.
- No public dispute/refund leakage through badges.
- No protected-class or sensitive-data inputs.
- Gaming note: qualification workflow remains the gate for Trust-Only MVP; performance gaming (self-booking, reciprocal reviews, micro-priced engagements) is deferred with future performance badges and is **not** claimed solved here.

## Notifications

Defer badge earned/lost notifications for Trust-Only MVP. Qualification approve/revoke already has existing workflow communications where applicable. Do not create celebratory spam.

## Migration Impact

First implementation: **no schema change required** if trust is projected on read from existing qualifications.

Deferred later (only when performance badges are approved):

- optional `TeacherBadgeAward` + rule-version metadata,
- or hybrid persistence for audit.

This decision pass generates **no** migration.

## Deferred Badges

- Highly Rated (await threshold BR)
- On-Time Delivery
- Fast Responder (measured)
- Repeat Students
- Experience milestones
- Availability badges
- Manual Admin performance badges
- Student achievements / referral rewards
- Degree/identity verification badges until real workflows exist

## Consequences

Positive:

- Public trust stays auditable and ADR-001-aligned.
- Frontend invent can be removed without inventing new metrics.
- Performance claims remain blocked until formulas exist (F-002 preserved).

Accepted costs:

- No Highly Rated / on-time / response badges yet.
- Product owners must still approve rating thresholds before Option B.

## Rejected Alternatives

- Writable verification / manual Top Teacher grants
- Shipping frontend ≥4.8/≥20 as product policy by silence
- Restoring CompletedOrders or measured ResponseTimeMinutes
- Mixing content Showcase labels into Teacher performance badges
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
8. Add tests: revoke clears trust; unpublished eligibility; no Teacher write path; comparison remains neutral.
9. No migration unless a later approved performance-badge pass requires persistence.
10. No commit/push/deploy assumptions beyond the implementation charter.
