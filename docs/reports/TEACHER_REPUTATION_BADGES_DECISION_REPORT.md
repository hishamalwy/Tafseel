# Teacher Reputation and Badges Decision Report

Date: 2026-07-30

Status: Decision complete; implementation not started.

## Findings

Teacher reputation infrastructure does not exist as a badge domain. Safe public evidence today is limited to active qualification derivation (ADR-001), moderated visible rating aggregates (F-002), and content-scoped Showcase/Qualification Sample trust labels (ADR-007). Frontend “Top rated” (`≥4.8` and `≥20` reviews) is an unapproved local invent. `CompletedOrders` has no production writer; `ResponseTimeMinutes` is self-reported.

| Badge | Evidence | Data Completeness | Rule Status | Decision |
|---|---|---|---|---|
| Qualified on Tafseel | Active `TeacherSubjectQualification` | Complete | Ready From Existing Evidence | Approve Trust-Only MVP |
| Subject-qualified list | Same qualification rows → subjects | Complete | Ready From Existing Evidence | Keep as subject-scoped evidence |
| Highly Rated | Visible moderated reviews → rating/count | Complete data; incomplete policy | Requires Formula Decision | Block; propose threshold options |
| On-Time Delivery | `AgreedDeliveryAt` vs delivery `CreatedAt` | Partial; no extensions/delay attribution | Requires Formula Decision / Missing Data | Defer |
| Fast Responder | Self-reported minutes; raw timestamps exist | Unsafe as measured claim | Unsafe / Requires Formula Decision | Defer; never use self-reported as badge |
| Repeat Students | Order/session pairs by Student–Teacher | Queryable; completion rules open | Requires Formula Decision | Defer |
| Favorites as quality | `FavoriteTeacher` | Complete but wrong meaning | Out of MVP | Reject as quality badge |
| Experience milestones | Orders/sessions statuses | Present; public completion formula open | Requires Formula Decision | Defer; ban stale `CompletedOrders` |
| Qualification Sample / Reviewed Showcase | Sample `TrustCode` | Complete | Ready (content only) | Keep content-scoped |
| Availability badges | Availability summary states | Complete as state | Out of MVP | Reject as reputation |
| Manual Admin Top Teacher | None | N/A | Administrative / Out of MVP | Reject for performance |

## Root Cause

The product needs explainable Teacher trust, but performance badge formulas, completion semantics and response-event definitions remain unresolved business rules. Shipping invent thresholds or stale columns would recreate F-002 integrity failures.

## Decisions

1. **MVP scope:** Option A — Trust-Only MVP (qualification-derived trust + existing subject evidence + content labels).
2. **Highly Rated:** Not approved; present threshold options A/B/C for a future BR without silent selection.
3. **Rule versioning:** Code-defined rules with stable codes and `ruleVersion` constants.
4. **Persistence:** Calculate qualification trust on read; no award table / migration in first implementation.
5. **Revocation:** Immediate when active qualifications drop to zero.
6. **API:** Embed trust projection in existing marketplace card/profile/comparison DTOs; stable codes only.
7. **UX:** One trust chip on cards; explanations on profile; remove Top rated invent; no Admin grant UI.
8. **Notifications:** Deferred for Trust-Only MVP.
9. **Performance badges / ranking / hidden score:** Rejected for this pass.

Full decision: [ADR-010](../decisions/ADR-010-TEACHER-REPUTATION-AND-BADGES.md).

## Approved Badge Rules

### `qualified_on_tafseel` v1

- **Eligibility:** ≥1 active approved non-revoked subject qualification.
- **Public meaning:** Teacher has formal qualification evidence on Tafseel.
- **Not claimed:** Teaching quality, response speed, on-time delivery, or superiority ranking.
- **Recalc / revoke:** Live derivation; lost when no active qualifications remain.

### Subject-scoped evidence

List each actively qualified subject on profile (and names on cards as today). Not a separate persisted award.

### Content trust (unchanged)

`qualification_sample` / `reviewed_showcase` remain on samples only.

## Blocked Badge Rules

| Badge | Blocker |
|---|---|
| Highly Rated | Need approved min average, min reviews, window, rounding, revocation |
| On-Time Delivery | Need eligible order set, revision/extension/dispute/refund rules; delay attribution missing |
| Fast Responder | Need first-response event definition; self-reported minutes forbidden |
| Repeat Students | Need completed engagement + payment/refund exclusions |
| Experience milestones | Need public completion formula; forbid stale `CompletedOrders` |
| Availability / manual Top Teacher | Out of MVP / rejected |

### Highly Rated options (for product owners — not selected)

| Option | Average | Min reviews | Window |
|---|---|---|---|
| A | ≥ 4.5 | ≥ 10 | Lifetime visible |
| B | ≥ 4.8 | ≥ 20 | Lifetime visible |
| C | ≥ 4.5 | ≥ 20 | Rolling 12 months |

## Architecture

- Categories: Verification / Performance / Milestones / Content labels / Dynamic state.
- Trust-Only MVP uses Verification + content labels only.
- Code-defined rule constants; no Admin threshold editor.
- On-read projection from qualifications inside marketplace queries.

## API Plan

- Extend existing public Teacher card/profile/comparison projections with stable trust badge codes (`qualified_on_tafseel`, `ruleVersion`, category).
- Frontend localizes labels/descriptions.
- Preserve nullable rating/count; keep sample trust codes.
- Do not add Teacher-writable badge endpoints.
- Do not restore F-002-null public metrics.

## Frontend Plan

- Cards: one Qualified chip when eligible; remove Top rated invent.
- Profile: trust section with explanation + qualified subjects.
- Comparison: same codes; no ranking.
- Teacher Dashboard: show current derived trust + criteria text.
- No reputation progress bars in MVP.

## Security and Fairness

Ownership: platform-derived only. Revocation follows qualification revoke. No hidden score. Gaming for performance badges deferred; Trust-Only MVP inherits qualification workflow controls. Fraud prevention for reviews/self-booking is **not** claimed complete.

## Migration Impact

No migration for Trust-Only MVP. Future performance awards may need an award table after formulas are approved. **No migration in this decision pass.**

## Risks

1. Product pressure to ship Highly Rated using the frontend invent thresholds without a BR.
2. Confusing “Qualified” naming with content “Reviewed Showcase” if copy is unclear.
3. Unpublished Teachers may still be qualification-eligible while not publicly listed — card visibility must follow existing publication rules.
4. Leaving Top rated invent in place until implementation continues to mislead Students.

## Deferred Scope

Highly Rated; on-time; fast responder; repeats; milestones; availability badges; Admin grants; Student achievements; referral rewards; award persistence; badge notifications; matching consumption of badges.

## Final Verdict

**READY FOR TRUST BADGE IMPLEMENTATION**

## Next Step

One focused implementation pass:

**Limited Teacher Trust Badge** — project `qualified_on_tafseel` into marketplace DTOs, localize explanations, remove frontend Top rated invent, keep content trust labels separate, add revoke/visibility tests — without performance badges, migrations, ranking or restored F-002 metrics.
