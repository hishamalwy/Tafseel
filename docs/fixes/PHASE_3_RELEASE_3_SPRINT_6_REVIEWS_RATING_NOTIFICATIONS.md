# Phase 3 Release 3 Sprint 6 — Reviews, Rating, Notification Deep Links & Completed-Order Clarity

Date: 2026-08-02  
Scope: Student rating/review UX, public review presentation hygiene, notification deep links, completed/history clarity, Files honesty. No payment math, settlement, pricing, refund-rule, or lifecycle redesign. No commit / push / deploy.

Evidence: [phase3-r3-sprint6-reviews-rating](./evidence/phase3-r3-sprint6-reviews-rating/)  
Prompt: [PHASE_3_RELEASE_3_SPRINT_6_REVIEWS_RATING_NOTIFICATIONS.md](../prompts/PHASE_3_RELEASE_3_SPRINT_6_REVIEWS_RATING_NOTIFICATIONS.md)

## Summary

Sprint 5 left Reviews/Files stubbed and notifications non-navigating. This sprint wires review state onto Order DTOs, strips private identifiers from public review listings, adds a canonical `Tafseel.notificationRoute` helper, upgrades the Student rating modal and completed-order timeline review state, and labels account-wide Files as unavailable (order-scoped files remain in timeline/delivery UI).

## Review domain audit (evidence)

| Question | Answer |
|---|---|
| Eligible status | `OrderStatus.Completed` **and** `OrderPaymentStatus.Paid` (`GovernanceService.CreateReviewAsync`) |
| One review / Order | Unique index on `TeacherReviews.OrderId` + app `duplicate_review` under serializable lock |
| Edit / delete | **Not supported** |
| Resubmit after hide | **No** — unique OrderId still blocks; hide only flips `IsVisible` |
| Anonymity | Public list uses verified-student copy; `StudentId` never in public DTO |
| Teacher responses | **Do not exist** |
| Aggregates | `RefreshRatingAsync` averages visible reviews only; hide → null rating + count 0; restore recomputes |
| Criteria | ExplanationClarity, SubjectKnowledge, Communication, OnTimeDelivery, ValueForMoney (1–5); overall = average / 5 |
| Recommendation | `Recommends` bool persisted |
| Comment | Required, trimmed, max 2000 |

## Notification deep-link matrix (Student)

| Type | Persisted link | Route |
|---|---|---|
| PaymentRequired | `/orders/{id}` | Payment page `?orderId=` |
| PaymentConfirmed / WorkStarted | `/orders/{id}` | My Work → Orders + timeline |
| DeliveryUploaded | `/orders/{id}` | Action filter + delivery/review focus |
| OrderCompleted (student now notified) | `/orders/{id}` | Completed filter + rate focus |
| ReviewSubmitted / ReviewModeration | `/orders/{id}` | Completed + review focus |
| NewMessage | `/conversations/{id}` | Messages |
| Unknown / no target | — | Overview (safe) |

## Files decision

**Label honestly unavailable.** No account-wide Files API. Copy directs Students to order timeline for request/delivery downloads. Fake stub downloads removed.

## Completed / history

Existing `Completed` filter (`sd_filter_done`) now includes completed **and** cancelled Orders (presentation grouping only). Rate action suppressed when `hasReview` / `!reviewCanSubmit`. Owner review score/comment/visibility shown on timeline when present.

## Validation

- Release build succeeded (clean, after stopping controlled API).
- Domain Governance tests: 3 passed.
- Phase9Governance integration: 5 passed (duplicate, moderate hide/restore, aggregates, eligibility, Order review state, public DTO no orderId/studentId).
- Localization parity + usage coverage passed (2960 paired keys).
- Frontend integrity + BUG-001 passed.
- `check-sprint6-notification-routing.mjs` passed.
- Browser: Files unavailable, Reviews empty/intro, Notifications list; student fixture had no completed Orders for live rate UI (API lifecycle covered by Phase9).
- Full Deliver→Revision→Approve→Rate browser matrix and full viewport×locale matrix: **not fully re-driven** this sprint → conditional verdict.

## Remaining limitations

1. Live browser end-to-end Deliver→Revision→Approve→Rate on local fixtures incomplete (fixture student had no completed rows).
2. Request-attachment group inside completed timeline not yet projected (deliveries yes; request files still via learning-request ownership APIs only).
3. Teacher dashboard notification clicks not fully mirrored to the new helper.
4. Full 375–1440 × EN/AR × light/dark screenshot matrix incomplete.
5. No dedicated Review-reminder notification type beyond OrderCompleted (student).

## Next step

Release 3 close-out: drive one live completed Order through rate + moderation hide on the Student dashboard, mirror Teacher notification routing, and finish the responsive evidence matrix.
