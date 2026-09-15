# Tafseel V1.1 Backlog

**Status:** Release Control 1, 2026-09-15. Everything here was **evaluated and deliberately kept out
of V1**. An item comes back into V1 only through a new ticket that passes Gate 1 of
[`SDLC.md`](../engineering/SDLC.md) *and* changes [`V1_SCOPE.md`](./V1_SCOPE.md) — never as an
"while we're here" addition to another ticket.

Each item: why it waits, what it costs to wait, and what must exist first.

| ID | Capability | Reason for deferment | Risk of deferment | Prerequisite |
|----|------------|----------------------|-------------------|--------------|
| B11-01 | **Qualification revoke UI** (Quality/Admin) | `POST /teacher-qualifications/{id}/revoke` needs a qualification id that no read endpoint returns; building UI would need a new read contract. Revocations are rare at launch and can be handled operationally. | A teacher who must lose a subject keeps selling until an engineer revokes through the API; suspension (J14-02) is the V1 fallback for urgent cases. | Read endpoint exposing qualification ids (backend ticket), then Gates 1–3 |
| B11-02 | **Live-session review UI** | Order reviews already build public ratings; session reviews are a second entry point, not a new capability. | Live-session-only teachers accumulate no public reviews in V1. | `DEC-10` (live sessions at launch) |
| B11-03 | **Order extensions** (request/answer more time) | Intentionally not built in 3B; agreed delivery plus messaging and disputes cover late work. | Parties renegotiate in messages without a recorded agreed date; non-delivery disputes may rise. | Gate 1 on how an extension affects dispute timing |
| B11-04 | **Teacher setup first-save guidance** | `GET /teachers/me` is empty until "About you" is saved, so the profile lists appear only after the first save. Works; slightly surprising. | Minor confusion in onboarding; support questions. | UX copy ticket only |
| B11-05 | **Samples, profile videos, showcases** (teacher) and **showcase moderation** (Quality) | Production refuses showcases unless durable storage, malware scanning, media probing, retention, copyright reporting, moderation operations and secure media delivery are validated. None is required to buy or deliver work. | Profiles are less rich; teachers cannot show sample work. | `SEC-04`, secure media decision (`DEC-11`), moderation staffing |
| B11-06 | **Notification preferences** | Defaults are sensible; every notification links to an action. | Users cannot mute categories; possible unsubscribe complaints for email. | Email categories defined |
| B11-07 | **Change password / revoke sessions UI** | Reset-password flow covers the need. | A user who suspects compromise must use reset. | — |
| B11-08 | **Coupons at checkout** (redemption) and coupon/promotion editors | No checkout field exists; admin toggles are broken (J13-04/05). Launch pricing does not depend on discounts. | The landing promo currently shows codes that cannot be redeemed — must be hidden for V1 (`UX-07`). | `DEC-09` |
| B11-09 | **Teacher business analytics and exports** | Not needed to earn or get paid; balance and withdrawals (`FIN-*`) cover money. | Teachers track performance manually. | `FIN-01` |
| B11-10 | **Advanced admin reports** (finance, demand, marketplace intelligence) | Reconciliation and operations lists are enough to operate. | Weaker business insight at launch. | `OBS-01` data |
| B11-11 | **Admin AI tools** and **student AI brief assistant** | `Ai.Enabled` is off outside Development; provider cost and safety review not done. | None for launch (button hidden via `UX-08`). | AI provider decision, safety review |
| B11-12 | **Catalog editors for subjects, topics, education levels, qualification topics** | Catalog changes are rare and can be seeded or applied by an operations runbook at launch. Service price policy is **not** here — it is V1 (`PROD-01`). | Every catalog change needs an engineer. | Ops runbook for launch |
| B11-13 | **User role changes UI** | Roles change rarely; the API guards the last Admin. | Engineer-assisted role changes. | — |
| B11-14 | **Application withdrawal by teacher** | Reject/request-changes paths cover it. | Stale applications stay in the queue. | — |
| B11-15 | **Teacher compare page** (visitor) | Browse and profile are enough to choose. | None significant. | — |
| B11-16 | **Old browser evidence cleanup** (R-06, R-07: legacy scripts and ~9% dead locale keys) | Engineering hygiene; no user impact. | Confusion for future audits; larger locale files. | — |
| B11-17 | **Emergency (short-notice) premium** | No server rule defines "emergency"; the client never offers it. | No short-notice pricing. | `DEC-07` |
| B11-18 | **Product analytics** (J1-08) | No emitter; observability of the product funnel is not launch-critical. | Funnel decisions without data for the first weeks. | Analytics/privacy decision |
| B11-19 | **Live-session reschedule browser journey** | UI and domain exist and are unit-tested; not browser-proven. Launch can rely on cancel + rebook. | A reschedule defect found by users. | `DEC-10` |
| B11-20 | **Admin review moderation detail** (J7-02) | Hiding a review works via API; the list exists. | Moderation needs engineer help. | — |

## Rules for this backlog

1. Items leave this file only by a ticket with Gates 1–3 complete.
2. A defect found in a V1 path is not V1.1 material — it is a V1 ticket.
3. Re-evaluate the whole list at V1 launch retrospective; do not reorder it during V1 work.
