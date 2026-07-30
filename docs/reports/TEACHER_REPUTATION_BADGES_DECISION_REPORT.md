# Teacher Reputation and Trust Badges Decision Report

Date: 2026-07-30

Status: Decision complete; implementation not started.

Decision source: [ADR-010](../decisions/ADR-010-TEACHER-REPUTATION-AND-BADGES.md)

Related: [ADR-001](../decisions/ADR-001-VERIFIED-TEACHER-DERIVATION.md), [ADR-006](../decisions/ADR-006-TEACHER-AVAILABILITY-AND-CAPACITY.md), [ADR-007](../decisions/ADR-007-TEACHER-PORTFOLIO-MODERATION.md), [F-002](../fixes/F002_TEACHER_METRICS_INTEGRITY_REPORT.md)

## Findings

Teacher reputation infrastructure does not exist as a badge/award domain. Safe public evidence today is limited to:

1. **Active subject qualifications** (ADR-001) — Quality-written, revokeable, already projected as `Verified` + subjects.
2. **Moderated visible rating aggregates** (F-002) — safe as nullable metrics, not as an approved Highly/Top Rated badge.
3. **Content-scoped sample trust labels** (ADR-007) — `qualification_sample` / `reviewed_showcase` on media only.
4. **Availability summaries** (ADR-006) — dynamic scheduling state, not durable reputation.

Unsafe or incomplete:

- Frontend “Top rated” invent (`≥4.8` and `≥20`) on Browse and Profile.
- `CompletedOrders` with no production writer (public `null`).
- Self-reported `ResponseTimeMinutes`.
- No identity/degree verification workflows or flags.
- No approved formulas for on-time, response, repeats, session milestones, popularity, or “New Teacher”.

## Root Cause

The product needs explainable Teacher trust, but most candidate badges lack either persisted writers, approved formulas, sample/window/revocation rules, or would restore F-002 integrity failures. Shipping invent thresholds or stale columns would recreate unsupported public claims.

## Candidate Classification Summary

| Badge | Category | Classification | Action |
|---|---|---|---|
| Qualified on Tafseel | Verification | Ready From Existing Evidence | **Approve** Trust-Only MVP |
| Qualified Subject | Verification | Ready From Existing Evidence | Keep as subject evidence |
| Highly Rated | Performance | Requires Formula Decision | Block; offer threshold options |
| Top Rated | Performance | Unsafe Public Claim | Remove invent |
| Trusted Teacher | Verification/Marketing | Unsafe Public Claim | Reject (ambiguous) |
| Fast Responder | Performance | Unsafe / Requires Formula Decision | Defer; never self-report |
| On-Time Delivery | Performance | Requires Formula Decision / Missing Data | Defer |
| Repeat Students | Performance | Requires Formula Decision | Defer |
| Popular Teacher | Marketing | Unsafe / Out of MVP | Reject |
| Completed 10 Sessions | Milestones | Requires Formula Decision | Defer |
| Completed 50 Sessions | Milestones | Requires Formula Decision | Defer |
| Qualification Sample | Content Trust | Ready (content only) | Keep sample-scoped |
| Reviewed Showcase | Content Trust | Ready (content only) | Keep sample-scoped |
| Available Today | Availability | Out of MVP as badge | Keep summary state |
| Available This Week | Availability | Out of MVP / rejected | Reject |
| Identity Verified | Verification | Requires Missing Data | Block |
| Degree Verified | Verification | Requires Missing Data | Block |
| Top Mentor | Administrative | Administrative Only | Reject public grant |
| New Teacher | Milestones/Marketing | Requires Formula Decision | Defer |
| Community Favorite | Marketing | Out of MVP | Reject |

Full per-badge analysis tables live in [ADR-010](../decisions/ADR-010-TEACHER-REPUTATION-AND-BADGES.md).

## Decision

1. **MVP scope:** Trust-Only — qualification-derived `qualified_on_tafseel` + subject evidence + content labels.
2. **Not full reputation:** Performance, milestones, identity/degree, availability-as-badge, and Admin titles remain blocked.
3. **Highly Rated:** Not approved; threshold options A/B/C documented for a future business rule without silent selection of invent thresholds.
4. **Rule versioning:** Code-defined rules with stable codes and `ruleVersion` constants.
5. **Persistence:** Calculate qualification trust on read; **no award table / migration**.
6. **Revocation:** Immediate when active qualifications drop to zero.
7. **API:** Embed trust projection in existing marketplace card/profile/comparison DTOs; stable codes only; avoid N+1 separate endpoint.
8. **UX maxima:** Browse **1** trust chip; Comparison same codes, no ranking; Profile trust section + subjects; Dashboard criteria text only.
9. **Security:** Teachers cannot self-award; Admins cannot grant performance badges; no hidden score; F-002 null metrics stay null.
10. **Notifications:** Deferred for Trust-Only MVP.

## Badge Categories (kept separate)

| Category | MVP |
|---|---|
| Verification | `qualified_on_tafseel` + subject lists |
| Performance | Blocked |
| Milestones | Blocked |
| Content Trust | Sample labels only |
| Availability | Summary state only — not badges |
| Administrative | No public performance grants |

## Approved Badge Rules

### `qualified_on_tafseel` v1

- **Eligibility:** ≥1 active approved non-revoked subject qualification.
- **Public meaning:** Teacher has formal qualification evidence on Tafseel.
- **Not claimed:** Teaching quality, speed, on-time delivery, popularity, or ranking.
- **Recalc / revoke:** Live derivation; lost when no active qualifications remain.

### Subject-scoped evidence

List each actively qualified subject. Not a separate persisted award row in MVP.

### Content trust (unchanged)

`qualification_sample` / `reviewed_showcase` remain on samples only.

## Blocked Badge Rules

| Badge | Blocker |
|---|---|
| Highly Rated | Need approved min average, min reviews, window, rounding, revocation |
| Top Rated | Unapproved invent; remove |
| Trusted Teacher / Top Mentor / Popular / Community Favorite | Ambiguous or non-quality evidence |
| On-Time Delivery | Eligible set, extensions, delay attribution missing |
| Fast Responder | First-response event missing; self-report forbidden |
| Repeat Students | Completion/refund exclusions missing |
| Completed 10/50 Sessions | Public completion formula missing; forbid stale `CompletedOrders` |
| Available Today / This Week | Dynamic state / rejected filter — not reputation |
| Identity / Degree Verified | Workflows and flags missing |
| New Teacher | Definition / stigma rules missing |

### Highly Rated options (for product owners — not selected)

| Option | Average | Min reviews | Window |
|---|---|---|---|
| A | ≥ 4.5 | ≥ 10 | Lifetime visible |
| B | ≥ 4.8 | ≥ 20 | Lifetime visible |
| C | ≥ 4.5 | ≥ 20 | Rolling 12 months |

## Architecture

- Embed trust badges in marketplace projections (cards, profile, comparison).
- Code-defined rule constants; no Admin threshold editor.
- On-read from qualifications already joined for `Verified`.
- No separate reputation service or endpoint in Trust-Only MVP.

## Migration Impact

**No migration** for Trust-Only MVP. Future performance awards may need an award table after formulas are approved. **No migration in this decision pass.**

## Validation

- Documentation only — no runtime, entity, API, DTO, frontend, or migration changes in this pass.
- ADR-010 status: Proposed.
- Indexed in [INDEX.md](../INDEX.md); reflected in [PROJECT_STATUS.md](../PROJECT_STATUS.md).
- Markdown links to ADR-001/006/007, F-002, and marketplace evidence paths verified.

## Risks

1. Product pressure to ship Highly/Top Rated using invent thresholds without a BR.
2. Confusing “Qualified” with content “Reviewed Showcase” if copy is unclear.
3. Unpublished Teachers may remain qualification-eligible while not publicly listed — card visibility must follow publication rules.
4. Leaving Top rated invent in place until implementation continues to mislead Students.

## Deferred Scope

Highly Rated; Top Rated; Trusted Teacher; Fast Responder; On-Time; Repeat Students; Popular; session milestones; New Teacher; Community Favorite; Identity/Degree Verified; Availability badges; Admin grants; award persistence; badge notifications; matching consumption of badges; hidden scores.

## Final Verdict

**READY FOR TRUST BADGE IMPLEMENTATION**

## Next Step

One focused implementation pass:

**Limited Teacher Trust Badge** — project `qualified_on_tafseel` into marketplace DTOs, localize explanations, remove frontend Top rated invent, keep content trust labels separate, add revoke/visibility tests — without performance badges, migrations, ranking, or restored F-002 metrics.
