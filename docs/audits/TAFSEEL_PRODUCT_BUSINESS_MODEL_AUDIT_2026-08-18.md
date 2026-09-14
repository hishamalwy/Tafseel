# Tafseel — Product & Business Model Audit

**Date:** 2026-08-18
**Scope:** Evidence-first reconstruction of the implemented business model. Not a visual redesign and not an implementation task.
**Method:** UI → frontend state → API route → controller → service → domain → persistence → status transitions → side effects, traced in code. Every conclusion cites the code that proves it. Where the code does not settle a question it is marked **BUSINESS AMBIGUITY** rather than answered by inference.
**Constraints honoured:** no commit, no deploy, no refactor, no business-logic change, no mock data, no replacement flows. No source file was modified to produce this report.

---

## 1. Executive Summary

Tafseel is a .NET 8 clean-architecture marketplace (`Tafseel.Domain` / `Application` / `Infrastructure` / `Api`) with a static multi-page bilingual frontend (17 `*.dc.html` pages plus `js/tafseel.js`). It is substantially built: 55 persisted entities, 33 EF migrations, a double-entry ledger, escrow, disputes, moderation, and a per-subject teacher qualification pipeline.

The business model is **not incoherent, but it is accumulated rather than designed**. Its core commerce spine — Request → Offer → Order → Payment → Delivery → Completion → Review — is real and mostly sound. The problems sit at the edges, where the spine was extended three separate times.

1. **Three parallel commerce flows** exist for what a student experiences as one need: Direct Request, Open Marketplace Request, and Live Session Booking. The first two share `LearningRequest` and genuinely converge on `Order`. The third (`LiveSessionBooking`) is a wholly independent commerce object with its own status enum, its own payment target, its own escrow, its own dispute link and its own review link — duplicating Order's responsibilities without reusing them.
2. **`Order` carries three parallel status fields** (`Status`, `PaymentStatus`, `DeliveryState`). One of them (`DeliveryState`) is written and never read. The combination of the other two forces the frontend to invent a state the backend does not have (`payment_confirmed`).
3. **Several accepted commercial terms are discarded at the moment they become binding.** The most serious: a Marketplace Offer's `IncludedRevisions` — displayed to the student on the offer card they select — is thrown away and replaced by the teacher's generic service setting when the Order is created.
4. **Two confirmed financial-correctness risks:** coupon-discounted Orders over-release escrow, and teachers can withdraw released earnings before the dispute window closes with no clearance account. The intended clearance account, `LedgerAccountKind.TeacherPending`, is declared and never used.
5. **Non-delivery — the single most likely real-world dispute — cannot be disputed.** Dispute eligibility requires that a delivery already happened.

None of this requires redesigning Tafseel. Most fixes are removing a duplicate, honouring a term that is already captured, or closing a lifecycle hole.

**Production reality check (context, not a finding):** the only registered `IPaymentProvider` is `MockPaymentProvider`, the only `ILiveSessionLinkProvider` is `MockLiveSessionLinkProvider`, and `DependencyInjection.cs:420-425` forbids Mock in Production while `appsettings.Production.json` still carries `REPLACE_WITH_REGISTERED_REAL_PROVIDER`. Tafseel cannot currently start in Production. `TeacherShowcases.Enabled=false` and `Ai.Enabled=false` mean two large feature areas are dark outside Development and Testing.

---

## 2. Current Product Model

### 2.1 Actors

`Roles` (`src/Tafseel.Application/Authorization/Authorization.cs:3-12`): `Admin`, `QualityReviewer`, `Teacher`, `Student`. Public self-registration is restricted to `Student` and `Teacher`. Guests are unauthenticated visitors with access to the `AllowAnonymous` discovery surface.

### 2.2 The commerce spine as implemented

```
                          ┌──────────────── Student need ────────────────┐
                          │                                              │
          A. knows the teacher                          B. does not know the teacher
                          │                                              │
              Tafseel-Request.dc.html                     Tafseel-Open-Marketplace.dc.html
                          │                                              │
        LearningRequest (SourcingMode=Direct)          LearningRequest (SourcingMode=OpenMarketplace)
        Status = PendingTeacherReview                  Status = OpenForOffers
                          │                                              │
              teacher accepts and names price                 teachers submit TeacherOffer
              → Order(AwaitingPayment) created                          │
                          │                                     student selects one offer
                          │                                     → Status = AwaitingPayment
                          │                                       (120-minute reservation)
                          │                                              │
                  student pays the ORDER                       student pays the REQUEST
                          │                                              │
                  webhook → Order.ConfirmPayment       webhook → Order CREATED here, then paid
                          └──────────────┬───────────────────────────────┘
                                         ▼
                              Order — the single fulfilment object
                    InProgress → Delivered → [RevisionRequested] → Completed
                                         │
                            escrow released → TeacherAvailable
                                         │
                              Review (1 per Order) / Dispute (1 per Order)

          C. wants a live lesson  ──►  Tafseel-Book-Session.dc.html
                                       LiveSessionBooking  (NOT an Order, NOT a Request)
                                       AwaitingPayment → Confirmed → *Pending → Completed
                                       own escrow, own dispute, own review
```

**The single most important structural fact:** journeys A and B genuinely converge on one `Order`. Journey C converges on nothing.

### 2.3 Money

Fees are platform-wide configuration, not per-service (`appsettings.json`: `Fees.StudentFeePercent=8`, `Fees.TeacherCommissionPercent=15`), snapshotted onto each `Order` at construction (`Orders.cs:346-352`). Payment is escrow-based: capture credits `EscrowHeld`; completion moves `TeacherNet` to `TeacherAvailable` and platform margin to `PlatformRevenue`; withdrawal moves `TeacherAvailable` → `WithdrawalClearing` → `ProviderClearing`. Every movement is a `LedgerEntry` with a `BusinessKey`, accompanied by `EscrowEntry` and `FinancialAuditRecord` trails.

---

## 3. Domain Inventory

| Concept | Purpose | Who creates | Who acts | Entity / table | Main endpoints | Frontend surfaces | Current statuses | Created when | Completed when | Cancelled when | Financial effect | Related | Problems / ambiguity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Learning Request (Direct)** | Student asks one chosen teacher for async work | Student | Teacher (accept/decline/clarify), Student (reply/cancel) | `LearningRequest` (`SourcingMode=Direct`) | `POST /learning-requests`; `/{id}/accept\|decline\|request-clarification\|reply-clarification\|cancel` | Request wizard, Student Dashboard "Requests", Teacher Dashboard "New" | PendingTeacherReview, ClarificationRequested, Accepted, Declined, Cancelled | Student submits wizard | Never — terminal state is `Accepted`; work lives on the Order | Student cancels pre-acceptance | None directly | Order, TeacherService, Conversation | `Budget` never validated against anything. Stays `Accepted` forever even if the Order is cancelled or refunded. |
| **Learning Request (Marketplace)** | Student posts a need to all qualified teachers | Student | Teachers (offer), Student (select / cancel selection) | `LearningRequest` (`SourcingMode=OpenMarketplace`) | `POST /open-marketplace/requests`; `/requests/{id}/offers/{offerId}/select`; `/cancel-selection` | Open Marketplace page, Student Dashboard, Landing journey strip | OpenForOffers, AwaitingPayment, ConvertedToOrder, Cancelled | Student publishes | `ConvertedToOrder` at payment confirmation | Student cancels; reservation expiry returns it to OpenForOffers | Is the payment target until conversion | TeacherOffer, Order, Payment | `BudgetMin/Max` and `PreferredDeliveryAt` are advisory only; no offer is rejected for exceeding either. |
| **Teacher Offer** | A teacher's priced, expiring commitment against a marketplace request | Teacher | Teacher (update/withdraw/resubmit), Student (select), System (expire) | `TeacherOffer` | `POST /open-marketplace/opportunities/{id}/offers`; `PUT /offers/{id}`; `/withdraw` | Open Marketplace, Teacher Dashboard "Opportunities" | Submitted, Selected, Accepted, Withdrawn, NotSelected, Expired | Teacher submits | `Accepted` at payment confirmation | Withdrawn / NotSelected / Expired | Its `Amount` becomes the Order price | LearningRequest, Order | **`IncludedRevisions` is shown to the student then discarded at Order creation.** No FK from Order back to Offer. |
| **Order** | The paid commercial agreement for async work | System (teacher accept, or payment webhook) | Teacher (start/deliver), Student (revision/complete), System (auto-release), Admin (refund, dispute settlement) | `Order` + `OrderStatusHistory`, `OrderDelivery`, `RevisionRequest`, `OrderExtensionRequest` | `/orders/{id}/start\|deliveries\|revision\|complete\|cancel\|extensions\|timeline` | Both dashboards, Payment page | Status: AwaitingPayment, InProgress, Delivered, RevisionRequested, Completed, Cancelled · PaymentStatus: Pending, Paid, Failed, Refunded · DeliveryState: None, Delivered, RevisionRequested, Accepted | Teacher accepts (direct) or payment confirms (marketplace) | Student completes, auto-release, or dispute release | `CancelBeforePayment`, or refund | Escrow hold → release / refund | Payment, Review, Dispute, Conversation | Three parallel status fields. `DeliveryState` never read. Delivery clock starts at *acceptance* on the direct path. |
| **Live Session Booking** | A scheduled synchronous lesson | Student | Both (reschedule/cancel), Teacher (complete / student-no-show), Student (confirm / teacher-no-show), System (finalize) | `LiveSessionBooking` + history, attachments | `POST /live-sessions`; `/{id}/cancel\|complete\|no-show\|settlement/confirm\|reschedule\|join` | Book Session page, both dashboards | AwaitingPayment, Confirmed, CompletionPending, StudentNoShowPending, TeacherNoShowPending, Completed, StudentNoShow, TeacherNoShow, Cancelled | Student books a slot | Mutual or auto settlement | Either party pre-session | Own escrow hold / release / refund | Payment, Review, Dispute | Wholly parallel to Order. No teacher acceptance step. `Emergency` premium is a client-declared boolean. |
| **Payment** | One capture attempt against exactly one payable | System | System (webhook), Admin (refund) | `Payment` + `PaymentAttempt`, `PaymentWebhookRecord` | `POST /payments/{orders\|live-sessions\|open-requests}/{id}`; `/payments/webhooks/{provider}` | Payment page, Mock Checkout | Pending, Confirmed, Failed, Refunded | Student initiates checkout | Provider webhook confirms | Refund, or `Fail()` on reservation loss | Ledger capture plus escrow hold | Order, LiveSessionBooking, LearningRequest | Three nullable target FKs; open-request payments later acquire `OrderId` via `LinkConvertedOrder`. |
| **Escrow / Ledger** | Custody and double-entry accounting | System | System | `EscrowEntry`, `LedgerAccount`, `LedgerEntry`, `Refund` | `GET /admin/finance/reconciliation` | *(none — endpoint has no caller)* | Held, Released, Refunded | Payment confirm | — | — | All money movement | Payment, Order, Withdrawal | `LedgerAccountKind.TeacherPending` declared, never used. No negative-balance guard. |
| **Withdrawal** | Teacher cash-out | Teacher | Admin (approve / reject) | `WithdrawalRequest`, `TeacherPayoutProfile` | `POST /withdrawals`; `/withdrawals/{id}/process`; `/admin/payout-profiles/{id}/review` | Teacher Dashboard "Earnings", Admin Dashboard | Pending, Completed, Rejected · Profile: Pending, Verified, Rejected | Teacher requests | Admin approves | Admin rejects (funds returned) | `TeacherAvailable` → `WithdrawalClearing` → `ProviderClearing` | Ledger | No maturity or hold on released funds. |
| **Review** | Public teacher reputation | Student | Admin (moderate) | `TeacherReview`, `ReviewModerationRecord` | `POST /orders/{id}/review`; `POST /live-sessions/{id}/review`; `/admin/reviews/{id}/moderate` | Both dashboards, Teacher Profile, Admin | `IsVisible` boolean only | Student submits | — | — | None | Order, LiveSessionBooking | One entity, two mutually exclusive parents. Auto-hidden on a full refund. |
| **Dispute** | Escrowed-purchase conflict resolution | Student or Teacher | Admin (`DisputesResolve`) | `Dispute` + messages, evidence, decisions, history | `POST /disputes`; `/admin/disputes/{id}/start-review\|resolve` | Disputes page, Admin Dashboard | Open, UnderReview, Resolved · Resolution: RefundStudent, ReleaseTeacher, NoFinancialAction | Party opens within `WindowDays=7` | Admin resolves | — | Refund or release, including post-release reversal | Order, LiveSessionBooking, Payment | **Cannot be opened for an undelivered Order.** |
| **Teacher Application** | Per-subject qualification request | Teacher | QualityReviewer / Admin | `TeacherApplication` + reviews, scores, history; `TeacherDemoSubmission` | `POST /teacher-applications`; `/{id}/submit`; `/{id}/decision` | Teacher Apply page, Quality Dashboard | Draft, Submitted, UnderReview, ChangesRequested, Approved, Rejected, Withdrawn | Teacher starts | Approved → creates a qualification | Withdrawn / Rejected | None | TeacherSubjectQualification | Coherent. |
| **Subject Qualification** | The durable right to sell in a subject | System (on approval) | QualityReviewer / Admin (revoke, reactivate) | `TeacherSubjectQualification` | `POST /teacher-qualifications/{id}/revoke` | Teacher Dashboard, Quality Dashboard | Approved, Revoked | Application approved | — | Revoked | None | TeacherService, every eligibility query | Coherent and correctly load-bearing. |
| **Teacher Service** | A priced offering = (teacher × subject × catalog item) | Teacher | Teacher | `TeacherService` | `POST`/`PUT /teachers/me/services` | Teacher Dashboard "Services", Browse, Profile | `IsActive` plus `SupersededByTeacherServiceId` | Teacher creates | — | Deactivated or superseded | Its price is *advisory* on the direct path | ServiceCatalogItem, Qualification | Two overlapping mutators (`Update`, `Configure`); two separate "off" concepts. |
| **Teaching Sample / Showcase** | Public teaching evidence | System (from demo) or Teacher (showcase) | QualityReviewer | `TeacherTeachingSample` + `TeacherTeachingSampleVersion` | `/teachers/me/showcases/*`; `/showcase-moderation/*` | Teacher Dashboard, Quality Dashboard, Public Profile | `ModerationStatus` (7 values) + `PublishedAt`/`ArchivedAt` + `IsProfileVisible` + `IsProfileFeatured` | Approval or teacher draft | — | Archived | None | Qualification | Four parallel visibility flags, two orderings, a moderation state machine duplicating `TeacherApplicationStatus`. **Disabled in production.** |
| **Conversation** | Participant messaging | Student or Teacher | Both | `Conversation`, `Message`, `MessageAttachment` | `/conversations`; `/conversations/{id}/messages` | Both dashboards | — | Scope-validated creation | — | — | None | Order, Request, LiveSession | `Scope=General` lets any student DM any published teacher, bypassing commerce. Duplicates `RequestClarification`. |
| **Notification** | Asynchronous user signalling | System | User (read) | `Notification`, `NotificationOutbox`, `UserNotificationPreference` | `/notifications`; `/notification-preferences` | All dashboards | Read / unread | Any side effect | — | — | None | Everything | Coherent; idempotency-keyed. |
| **Coupon** | Student discount | Admin | Student (redeem at payment) | `Coupon`, `CouponRedemption` | `/admin/coupons`; body of payment initiation | Admin Dashboard, Payment page | `IsActive` plus expiry | Admin creates | — | Deactivated | Reduces `Payment.Amount` | Payment | **Order escrow release does not account for the discount.** |
| **Promotion** | Landing-page marketing slot | Admin | — | `Promotion` | `/promotions`; `/admin/promotions` | Landing, Admin | `IsActive` | Admin creates | — | Deleted | None | — | Coherent and self-contained. |
| **Marketplace Interaction Event** | First-party funnel analytics | Client (anonymous allowed) | Admin | `MarketplaceInteractionEvent` | `POST /admin/marketplace-intelligence/events`; `GET …` | Admin Dashboard | — | Client emits | — | — | None | — | Allow-listed, idempotent, retention-bounded. Coherent. |
| **Student Learning Preference** | Prefill for the request wizard | Student | Student | `StudentLearningPreference` | `/students/me/learning-preferences` | Request wizard, Student settings | — | Student saves | — | — | None | — | Never used for matching, ranking, or opportunity targeting. |

---

## 4. Role Capability Matrix

`UI` = a control exists · `API` = the route's `[Authorize]` policy admits the role · `BIZ` = service or domain validation admits the role. **A mismatch between the three is a defect.**

| Action | Guest | Student | Teacher | QualityReviewer | Admin | Mismatch |
|---|---|---|---|---|---|---|
| Browse teachers / view profile | UI+API | UI+API | UI+API | UI+API | UI+API | — |
| Register (Student or Teacher only) | UI+API | — | — | — | — | — |
| Publish marketplace request | — | UI+API+BIZ (`Roles.Student`) | ✗ | ✗ | ✗ | — |
| Send direct request | — | UI+API (`Students.CreateRequests`)+BIZ | ✗ | ✗ | ✗ | — |
| Submit / update / withdraw an Offer | — | ✗ | UI+API+BIZ (`Roles.Teacher` plus eligibility) | ✗ | ✗ | — |
| Select an Offer | — | UI+API+BIZ (owner) | ✗ | ✗ | ✗ | — |
| Accept a direct request | — | ✗ | UI+API (`Requests.Accept`)+BIZ (assigned teacher) | ✗ | **API only** — `Permissions.All` grants Admin `Requests.Accept`; blocked at BIZ by `RequireTeacher` | Cosmetic over-grant |
| Initiate payment | — | UI+API (`Payments.ViewOwn`)+BIZ (owner) | **API only** — Teacher holds `Payments.ViewOwn`; blocked at BIZ by the owner check | ✗ | API only, blocked at BIZ | Over-broad permission name |
| Deliver | — | ✗ | UI+API (`Requests.Deliver`)+BIZ | ✗ | API only, blocked at BIZ | Cosmetic |
| Request a revision | — | UI+API (`Requests.RequestRevision`)+BIZ | ✗ | ✗ | API only, blocked at BIZ | Cosmetic |
| Complete an order | — | UI+API (`Requests.Complete`)+BIZ | ✗ | ✗ | API only, blocked at BIZ | Cosmetic |
| Book a live session | — | UI+API (`Sessions.Book`)+BIZ | ✗ | ✗ | ✗ | — |
| Confirm session settlement / no-show | — | UI+API+BIZ | UI+API+BIZ | ✗ | ✗ | — |
| Submit a review | — | UI+API (`Reviews.Create`)+BIZ | ✗ | ✗ | API only | Cosmetic |
| Moderate a review | — | ✗ | ✗ | ✗ | UI+API+BIZ | — |
| Open a dispute | — | UI+API+BIZ | UI+API+BIZ | ✗ | ✗ | — |
| Resolve a dispute | — | ✗ | ✗ | **✗ — `QualityReviewer` does NOT hold `Disputes.Resolve`** | UI+API+BIZ | See §12-E |
| Review teacher applications | — | ✗ | ✗ | UI+API+BIZ | UI+API+BIZ | — |
| Moderate showcases | — | ✗ | ✗ | UI+API+BIZ | UI+API+BIZ | Dark in production |
| Revoke a qualification | — | ✗ | ✗ | UI+API (`Teachers.ReviewApplications`) | UI+API | — |
| Request a withdrawal | — | ✗ | UI+API+BIZ (verified payout profile) | ✗ | API only | Cosmetic |
| Approve withdrawal / payout profile | — | ✗ | ✗ | ✗ | UI+API+BIZ (`Withdrawals.Review`) | — |
| Refund a payment | — | ✗ | ✗ | ✗ | API only (`Payments.Manage`) — **no UI anywhere** | Missing surface |
| View finance reconciliation | — | ✗ | ✗ | **API (`Reports.View`)** | API | **QualityReviewer can read platform financials; no UI calls it** |
| View admin operations (requests / sessions) | — | ✗ | ✗ | API (`Reports.View`) | API | **No UI calls these endpoints** |
| Suspend a user / change roles | — | ✗ | ✗ | ✗ | UI+API+BIZ | — |

**Genuine authorization findings**

- **AZ-1 (MEDIUM).** `Permissions.ForRole(QualityReviewer)` includes `ReportsView`, which gates `GET /admin/finance/reconciliation`, `GET /admin/metrics`, `GET /admin/audit`, and both `/admin/operations/*` routes (`AdminController.cs:34-55`, `PaymentsController.cs:128`). A content-quality reviewer should not be able to read platform revenue, escrow balances, or the global audit log.
- **AZ-2 (LOW, naming).** `Permissions.PaymentsViewOwn` is granted to Teachers and gates payment *initiation*. Ownership checks in `FinancialService` block abuse, so this is defence-in-depth naming debt rather than an exploit.
- **AZ-3 (MEDIUM).** `Permissions.PaymentsManage` (admin refund) has **no frontend surface at all** — the only route out of a stuck paid Order is an undocumented API call.

---

## 5. Current User Journeys

### Journey A — Student chooses a specific teacher

1. Browse (`Tafseel-Browse-Teachers.dc.html`) → Profile (`Tafseel-Teacher-Profile.dc.html`) → "Request" CTA → `Tafseel-Request.dc.html?teacherId=…`.
2. `POST /learning-requests` → `OrderService.CreateRequestAsync` (`OrderService.cs:28-59`). Gates: service active and not superseded; catalog `IsActive && IsPublic && TeacherSelectable && !RequiresScheduling`; subject active; **teacher qualification approved**; **teacher profile published**. Status → `PendingTeacherReview`. `Budget` is stored and never referenced again.
3. Optional clarification loop: `RequestClarification` ↔ `ReplyToClarification` (`Orders.cs:182-198`).
4. Teacher accepts: `POST /learning-requests/{id}/accept` carrying `FinalPrice`, `AgreedDeliveryAt`, `RevisionAllowance` (`OrderService.cs:159-227`). **The teacher names the price here**; the profile price and the student's budget are both non-binding. The request moves to `Accepted` and an `Order(AwaitingPayment, PaymentStatus=Pending)` is created in the same transaction, idempotency-keyed.
5. Student pays the **Order**: `POST /payments/orders/{orderId}` → provider checkout.
6. Webhook → `Payment.Confirm` → ledger capture → `EscrowEntry(Held)` → `Order.ConfirmPayment` → `PaymentStatus=Paid` while `Status` remains `AwaitingPayment`.
7. Teacher calls `POST /orders/{id}/start` → `InProgress`. Delivery → `Delivered`. Optional `RequestRevision` → `RevisionRequested` → deliver again.
8. Completion: the student calls `POST /orders/{id}/complete`, or `OrderAutoReleaseWorker` completes it after `max(AutoReleaseAfterHours, DisputeWindowDays × 24)` = 7 days. Escrow releases to `TeacherAvailable` plus `PlatformRevenue`.
9. Review: `POST /orders/{id}/review`, one per Order, requires `Completed` and `Paid`.

**Confirmed lifecycle defects on this journey.** `AgreedDeliveryAt` is validated against *acceptance* time (`ServiceCatalogPolicyValidator.EnsureAcceptedTerms`, `CatalogContracts.cs:46-61`), but the deadline only starts mattering after payment — and payment has no deadline of its own. A student who pays five days later starts an Order that is already overdue. The `LearningRequest` also remains `Accepted` permanently even if the Order is later cancelled or refunded.

### Journey B — Student does not know which teacher

1. `Tafseel-Open-Marketplace.dc.html` → `POST /open-marketplace/requests` → `OpenMarketplaceService.PublishAsync` (`OpenMarketplaceService.cs:21-38`). Requires an active `Subject` and an active, public, teacher-selectable, non-scheduling `ServiceCatalogItem`. Status → `OpenForOffers`; `PublishedAt` set.
2. Teachers see it via `GET /open-marketplace/opportunities`. The eligibility predicate (`OpenMarketplaceService.cs:245-268`) requires: not suspended, published profile, approved qualification **in that subject**, and an active `TeacherService` for exactly that (subject × catalog item) pair.
3. `POST /opportunities/{id}/offers` creates one `TeacherOffer` per teacher per request, carrying `Amount`, `DeliveryHours`, `IncludedRevisions`, `ValidUntil`. Validated against catalog policy only — **not** against the request's `BudgetMin`/`BudgetMax` or `PreferredDeliveryAt`.
4. Student selects: `POST /requests/{rid}/offers/{oid}/select` under `Serializable` isolation with `sp_getapplock`. The request moves to `AwaitingPayment` with a 120-minute `PaymentReservationExpiresAt`; the offer moves to `Selected`.
5. Student pays the **Request**, not an Order: `POST /payments/open-requests/{requestId}`. The charge is `offer.Amount × (1 + StudentFeePercent / 100)`, less any coupon.
6. Webhook (`FinancialService.cs:205-231`) revalidates the reservation, then **creates the Order inside the webhook**, calls `ConfirmPayment`, `request.ConvertOfferToOrder`, `offer.Accept`, marks every other offer `NotSelected`, and calls `payment.LinkConvertedOrder(order.Id)`.
7. From here the lifecycle is byte-for-byte identical to Journey A step 7 onward.
8. If the student does not pay, `OpenMarketplaceReservationExpiryService` reminds at T-30 minutes and, at expiry, returns the request to `OpenForOffers`, reopens the offer, and fails pending payments.

**Overlap with A:** total, from Order creation onward. The divergence is entirely in *how price and terms are agreed* (teacher-named at acceptance versus teacher-offered and student-selected) and *which object is the payment target*.

**Confirmed defect.** `FinancialService.cs:214-217` constructs the Order with `service.Revisions`, discarding `offer.IncludedRevisions` — a term the student was shown (`js/open-marketplace.js:297`) and selected on.

### Journey C — Book a live session

1. Profile → "Book a session" → `Tafseel-Book-Session.dc.html?teacherId=…`.
2. `GET /live-sessions/teachers/{id}/slots` computes bookable slots from `TeacherAvailabilityRule` minus `TeacherAvailabilityException` minus existing bookings.
3. `POST /live-sessions` → `LiveSessionService.BookAsync` (`LiveSessionService.cs:321-367`) under `Serializable` isolation with a schedule applock. Price = `service.Price × durationMinutes / 60`, plus `EmergencyPremiumPercent` **if and only if the client sends `Emergency: true`**.
4. Status `AwaitingPayment` → student pays the booking → webhook → `Confirmed` with escrow held. **There is no teacher acceptance step at any point.**
5. After `EndsAt`: the teacher calls `RequestCompletion` or `MarkStudentNoShow`; the student calls `MarkTeacherNoShow`. Each moves to a `*Pending` state that the *other* party confirms, or that `LiveSessionSettlementWorker` finalizes after `SettlementReviewHours=24`.
6. Settlement: Completed or StudentNoShow releases to the teacher; TeacherNoShow refunds the student.
7. Review: `POST /live-sessions/{id}/review`, `Completed` only.

**Answer to "what is a Session?"** It is **an unrelated parallel commerce flow**. It is not an Order, not a subtype of Order, and not connected to any Request. It shares only `Payment`, `EscrowEntry`, `TeacherReview` and `Dispute`, each of which carries a nullable FK for it.

**Confirmed gap.** A `Confirmed` booking whose `EndsAt` has passed, where neither party acts, is never settled — the settlement worker only scans `*Pending` statuses. Escrow is held indefinitely.

### Journey D — Teacher activation

`GET /teachers/onboarding-status` (`TeacherApplicationService.cs:613-700`) is the canonical readiness projection; the full matrix is in §9. Sequence: register → confirm email → create a `TeacherApplication` (subject, qualification topic, city, experience, demo video) → submit → QualityReviewer `StartReview` → `Decide` with all nine `EvaluationCriterion` scores → Approve creates a `TeacherSubjectQualification` → teacher completes the profile → creates a `TeacherService` in an approved subject → sets availability *if* any active service `RequiresScheduling` → publishes the profile.

### Journey E — Teacher fulfils work

Two distinct inbound inboxes (`Tafseel-Teacher-Dashboard.dc.html:2255`): **New** (direct requests) and **Opportunities** (marketplace), alongside **Orders** and **Sessions**. Fulfilment: `start` → `deliveries` (one or more files) → student review window → completion → `TeacherAvailable` → withdrawal (requires `PayoutVerificationStatus.Verified` and at least `MinimumAmount=50 SAR`) → admin processes the payout.

### Journey F — Problem / dispute

`POST /disputes` targets exactly one Order **or** one LiveSessionBooking (`Governance.cs:88-102`). Order eligibility (`GovernanceService.cs:274-283`):
`PaymentStatus == Paid` **and** `Status ∈ {Delivered, RevisionRequested, Completed}` **and** at least one `Delivered` history row exists **and** that delivery is within `WindowDays=7`.
Flow: `Open` → Admin `StartReview` → `UnderReview` → `Resolve(RefundStudent | ReleaseTeacher | NoFinancialAction)`, idempotency-keyed. `DisputeSlaWorker` escalates by notification only. A `RefundStudent` resolution also auto-hides any existing review for that purchase.

---

## 6. Request / Offer / Order Analysis

| # | Question | Answer as implemented |
|---|---|---|
| 1 | What is a **Request**? | Student *intent*. Two variants share one table via `SourcingMode`: a Direct request is addressed to one teacher and carries a fixed `TeacherServiceId`; a Marketplace request is addressed to a `SubjectId` plus `ServiceCatalogItemId` and carries no teacher. |
| 2 | What is an **Offer**? | A teacher's *priced, time-bounded commitment* against a Marketplace request only. It exists solely in Journey B. |
| 3 | What is an **Order**? | The *paid work contract*. Sole owner of delivery, revision, extension, completion, escrow release, review and dispute for async work. |
| 4 | Precise moment each exists | Request: student submit. Offer: teacher submit. Order: **direct** = the instant the teacher accepts, before any money moves; **marketplace** = inside the payment webhook, after capture. |
| 5 | Which is the commercial agreement? | The **Order**. Direct: formed by teacher acceptance. Marketplace: formed by student offer-selection but *materialised* only at payment. |
| 6 | Which represents student intent? | **Request.** |
| 7 | Which represents teacher commitment? | **Offer** (marketplace) or **the accept call's `FinalPrice` + `AgreedDeliveryAt`** (direct). Asymmetric: the direct commitment has no first-class object. |
| 8 | Which represents paid work? | **Order.** |
| 9 | Where price, deadline and requirements live | Price: `TeacherService.Price` (advisory) → `TeacherOffer.Amount` **or** `AcceptLearningRequest.FinalPrice` (binding) → `Order.Price` (authoritative). Deadline: `LearningRequest.PreferredDeliveryAt` (advisory) → `Offer.DeliveryHours` / `input.AgreedDeliveryAt` → `Order.AgreedDeliveryAt` (authoritative). Requirements: `LearningRequest.Title` + `Description` + attachments — **never copied to the Order**. |
| 10 | Duplicated between entities? | Yes: the six-field service identity snapshot (`ServiceCatalogItemId`, `CatalogCode`, `CategoryCode`, `OrderType`, `ServiceNameEnglish`, `ServiceNameArabic`) is duplicated verbatim on `LearningRequest`, `Order` **and** `LiveSessionBooking` via three identical `CaptureServiceIdentity` methods. This duplication is *deliberate and correct* — it is an immutability snapshot protecting accounting traceability. |
| 11 | Which object should own delivery? | Order. It already does. Correct. |
| 12 | Which should own revision? | Order (`RevisionAllowance`, `RevisionsUsed`). Correct — but the marketplace path populates it from the wrong source. |
| 13 | Which should own payment? | **Currently split.** Order for direct; `LearningRequest` for marketplace until conversion; `LiveSessionBooking` for sessions. `Payment` therefore carries three nullable FKs. |
| 14 | Which should own review eligibility? | Order (`Completed` + `Paid`) or LiveSessionBooking (`Completed`). |
| 15 | Which should own dispute eligibility? | Order (paid, delivered at least once, within 7 days) or LiveSessionBooking (past `EndsAt`, within 7 days). |
| 16 | What happens if the teacher rejects? | Direct: `Decline` with a reason → `Declined`, terminal; the student must start a brand-new request. Marketplace: teachers simply do not offer, or they `Withdraw`; the request stays `OpenForOffers` until its `PreferredDeliveryAt` passes, after which it silently disappears from opportunity lists **without any status change**. |
| 17 | What happens if the student cancels? | Direct: only pre-acceptance (`Cancel`), or `Order.CancelBeforePayment` post-acceptance. Marketplace: `Cancel` from `OpenForOffers` or `AwaitingPayment`, which expires all offers and fails pending payments. **No cancellation path exists once an Order is paid.** |
| 18 | What happens after payment? | Direct: `PaymentStatus=Paid` while `Status` is still `AwaitingPayment`; the teacher must press Start. Marketplace: the Order is *born* Paid. |
| 19 | What happens after delivery? | A 7-day student window to accept, request a revision (if allowance remains), or dispute. Otherwise the Order auto-completes. |
| 20 | Do both paths converge on the same Order type? | **Yes.** One `Order` class, one table, one status machine, one delivery / revision / completion / review / dispute model. The convergence is real and correct. |

### BUSINESS AMBIGUITY — Request / Offer / Order

- **BA-1 — Is the teacher's advertised price binding?** On the direct path the teacher may name any `FinalPrice` inside the catalog band, and the student's only responses are "pay" or "cancel the Order". There is no counter-offer, no renegotiation, and no record that the price changed. The code cannot tell us whether the profile price is a quote, a starting point, or a promise.
- **BA-2 — What is a stated budget for?** `Budget`, `BudgetMin` and `BudgetMax` are captured, displayed, and never enforced anywhere.
- **BA-3 — Should a Marketplace request expire?** `LearningRequestStatus.Expired` exists in the enum and is **never assigned anywhere in the codebase**. Requests past their deadline vanish from teacher views while still reading `OpenForOffers` in the student's dashboard.
- **BA-4 — Should the direct path have an Offer object?** The direct teacher's commitment (price, deadline, revisions) is a transient method argument rather than an entity. It cannot be shown to the student before payment, cannot expire, and cannot be withdrawn.

---

## 7. Direct Request vs Marketplace Analysis

### What is genuinely different

| Dimension | Direct | Marketplace |
|---|---|---|
| Student's mental model | "I want *this* teacher" | "I want *a* teacher" |
| Teacher targeting | One, chosen up front | Everyone qualified in the subject |
| Price formation | Teacher names it at acceptance | Teacher offers; student compares and selects |
| Competition | None | N teachers, visible offer count |
| Commitment object | None — method arguments | `TeacherOffer`, expiring and withdrawable |
| Payment target | `Order` | `LearningRequest` |
| Reservation pressure | None | 120-minute payment window |
| Clarification | `RequestClarification` sub-entity | None |

### What is duplicated

- Attachment upload and read: one endpoint with three ownership branches (`OrderService.cs:86-115`).
- Status labelling: `Tafseel.requestStatusLabel` (`js/tafseel.js:2030`) covers **only** enum values 0–4. The marketplace values `OpenForOffers(5)`, `AwaitingPayment(6)`, `ConvertedToOrder(7)` and `Expired(8)` fall through to `req_status_unknown`, so every consuming surface hand-writes a `sourcingMode` fork — `js/tafseel.js:1430-1435` and `Tafseel-Landing.dc.html:989-1002`, the latter with **hardcoded, un-internationalised Arabic and English strings**.
- Everything from Order creation onward is already shared.

### Verdict on the candidate hypothesis

The proposed canonical shape —
`Student Need → {Specific Teacher | Open Marketplace → Offers → Selected Teacher} → Common Order → Payment/Work → Delivery/Completion` —
**already describes the async half of Tafseel accurately**, with one correction: on the direct path the Order is created *before* payment, and on the marketplace path *after* it. That single asymmetry is the root cause of the split payment target, the `Payment.LearningRequestId` FK, `Payment.LinkConvertedOrder`, and the `AwaitingPayment`-but-`Paid` state the frontend has to synthesise.

**Recommended refinement — not a merge of the two intents.** Keep both intents. Make the *commitment* a first-class object on both paths and make the *Order* the payment target on both paths. A direct request becomes a request with an implicit invited-teacher list of one; the teacher's acceptance becomes an Offer; accepting an Offer creates the Order. The two front doors stay visibly different in UX while the machinery behind them becomes one.

Do **not** merge the two entry surfaces in the UI. They express genuinely different user intents, and the marketplace's offer-comparison step is real product value.

---

## 8. Session Business Model Analysis

**Determination: an unrelated parallel commerce flow.**

`LiveSessionBooking` duplicates, in its own vocabulary, everything `Order` already does.

| Order concept | LiveSessionBooking equivalent | Shared? |
|---|---|---|
| `Order.Status` (6 values) | `LiveSessionStatus` (9 values) | No |
| `Order.PaymentStatus` | *(none — folded into `Status`)* | No |
| `Order.Price` and fee split | `BasePrice` + `EmergencyPremiumAmount` → `TotalPrice`, with its own commission fields | No |
| Service identity snapshot | Identical six fields, third copy of `CaptureServiceIdentity` | Duplicated |
| `OrderDelivery` | `LiveSessionAttachment` | No |
| `OrderStatusHistory` | `LiveSessionStatusHistory`, plus an `Action` string | No |
| `OrderExtensionRequest` (mutual agreement) | `ProposedStartsAt` / `RespondToReschedule` (mutual agreement) | Same pattern, separate code |
| Escrow hold / release / refund | Separate `ForLiveSession` factories on `EscrowEntry`, `Refund`, `Payment` | Parallel |
| Review | `TeacherReview.ForLiveSession` | Nullable-FK union |
| Dispute | `Dispute.ForLiveSession` | Nullable-FK union |
| Auto-completion | `OrderAutoReleaseWorker` | `LiveSessionSettlementWorker` |

**Genuinely different and worth preserving:** scheduling against availability, timezone handling, duration bands (30/60/90/120 minutes), the mutual settlement handshake, no-show attribution, reschedule negotiation, and a cancellation window with an asymmetric refund rule (`RequiresRefundOnCancellation`, `LiveSessions.cs:161-166`).

**Genuinely duplicated and worth converging:** money (price, fees, escrow, release, refund), participants, service identity, status history, review linkage, dispute linkage.

**Findings specific to sessions**

- **S-1 (HIGH) — No teacher acceptance.** A student can book and pay for a slot with no teacher consent. The teacher's only exit is `Cancel`, which triggers a full refund. This is asymmetric with the async path, where teacher acceptance is mandatory.
- **S-2 (MEDIUM) — `Emergency` is a client-declared boolean.** `LiveSessionService.cs:343` charges `EmergencyPremiumPercent=50` purely on `input.Emergency`, with no lead-time rule anywhere in the codebase. A teacher cannot require the premium for genuinely short-notice bookings, and a student has no reason to ever tick the box. The price band is unenforceable in both directions. **BUSINESS AMBIGUITY.**
- **S-3 (MEDIUM) — Confirmed sessions never settle themselves.** `LiveSessionSettlementWorker` only scans `CompletionPending` and the two `*NoShowPending` statuses. Escrow on a passive `Confirmed` booking is held indefinitely.
- **S-4 (LOW) — Suspension is not checked at booking.** `RequireBookableServiceAsync` (`LiveSessionService.cs:667-676`) checks published profile and qualification but not `user.IsSuspended`, unlike `TeacherPublicQueries.BrowsableTeachers`.

---

## 9. Teacher Readiness Model

Six overlapping readiness meanings are computable today. Their true definitions:

| Meaning | Actual definition | Where enforced |
|---|---|---|
| **Approved teacher** | At least one `TeacherSubjectQualification` with `Status=Approved && RevokedAt == null` | Everywhere |
| **Qualified teacher** | The same, but *per subject* | Every eligibility query |
| **Active teacher** | Not `IsSuspended` **and** `EmailConfirmed` | Login, browse |
| **Published teacher** | `TeacherProfile.IsPublished` | Browse, direct request, booking |
| **Service-ready teacher** | At least one `TeacherService` that is `IsActive && !IsSuperseded` on an approved subject, with an active, public, teacher-selectable catalog item | Publication, browse |
| **Eligible teacher** | The full conjunction, plus availability whenever the service `RequiresScheduling` | `SetProfilePublishedAsync` |

### Capability matrix as implemented

| Requirement state | Appears publicly | Receives direct request | Sees opportunities | Receives orders | Receives session bookings | Can withdraw |
|---|---|---|---|---|---|---|
| Registered, email unconfirmed | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ *(if a verified payout profile and a balance somehow exist)* |
| Approved qualification, profile incomplete | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Approved and complete, **not published** | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Approved and published, no active service | ✗ (blocked at publish) | ✗ | ✗ | ✗ | ✗ | ✓ |
| Approved, published, active async service | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| Approved, published, active live service, **no availability rules** | ✓ (browse does not check availability) | ✗ | ✗ | ✓ | **✓ with zero bookable slots** | ✓ |
| Fully eligible | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Suspended after publishing** | ✗ (browse filters) | **✓ — not checked** | ✗ | ✓ (existing) | **✓ — not checked** | ✗ (login blocked) |
| **Qualification revoked after publishing** | ✗ | ✗ | ✗ | ✓ (existing orders continue) | ✗ | ✓ |

### Contradictions

- **TR-1 (HIGH) — Two definitions of "publishable".** `TeacherProfile.Publish()` (`Marketplace.cs:43-49`) requires only a non-empty Headline and Bio. The real gate lives in `MarketplaceService.SetProfilePublishedAsync` (`MarketplaceService.cs:417-446`), which additionally requires email confirmation, non-suspension, country and city, an approved qualification, and an active qualified service. The domain invariant is strictly weaker than the business rule, so any future caller of `Publish()` bypasses the entire readiness model.
- **TR-2 (HIGH) — Suspension is inert on in-flight commerce.** `GovernanceService.SetSuspensionAsync` (`GovernanceService.cs:720-738`) sets the flag and rotates the security stamp. It does **not** unpublish the profile, deactivate services, decline pending requests, or cancel future bookings. Because `OrderService.CreateRequestAsync` and `LiveSessionService.RequireBookableServiceAsync` do not check `IsSuspended`, a student holding a direct link can still create a request against — and pay for a live session with — a suspended teacher who cannot log in to fulfil it.
- **TR-3 (MEDIUM) — Browse ignores the availability requirement.** `TeacherPublicQueries.BrowsableTeachers` does not enforce `RequiresScheduling ⇒ has availability rules`, while `SetProfilePublishedAsync` does. A teacher who publishes with availability and then deletes every rule stays browsable with a "Book a session" CTA that yields zero slots.
- **TR-4 (MEDIUM) — Production test-data filter inside a canonical query.** `TeacherPublicQueries.cs:19-22` excludes any teacher whose name contains `%UAT%` or `%Sprint%`. This is seed-data hygiene compiled into the authoritative public-eligibility predicate, and it will silently hide real users whose names happen to match.
- **TR-5 (LOW) — A 13-value `TeacherOnboardingStatus`** where the underlying truth is five booleans (email, qualification, profile, service, availability) plus a published flag. `ApplicationDraft` is declared and never assigned.

### Smallest clear readiness model

Two orthogonal axes, nothing more.

1. **Account standing** — `Active` (email confirmed, not suspended) or `Blocked`. Blocking cascades: unpublish, hide, stop new intake.
2. **Selling capability, per (subject × service)** — a service is *sellable* if and only if: the account is Active **and** the profile is complete and published **and** the subject qualification is approved **and** the service is active and not superseded **and** the catalog item is active, public and selectable **and** (`RequiresScheduling` implies at least one availability rule).

Every current readiness concept is derivable from these two. `TeacherOnboardingStatus` becomes a presentation projection over the same booleans rather than a stored parallel truth.

---

## 10. Status / Lifecycle Inventory

### `LearningRequestStatus`

| Status | From | To | Actor | Guard | Frontend label | Tone | Side effects |
|---|---|---|---|---|---|---|---|
| PendingTeacherReview (0) | — / ClarificationRequested | Clarification, Accepted, Declined, Cancelled | Student (create), Student (reply) | Direct only | `req_status_pending_review` | warning | Teacher notified |
| ClarificationRequested (1) | Pending | Pending, Declined, Cancelled | Teacher | Direct only | `req_status_clarification` | info | Student notified |
| Accepted (2) | Pending | *(terminal)* | Teacher | idempotency key | `req_status_accepted` | info | **Order created** |
| Declined (3) | Pending, Clarification | *(terminal)* | Teacher | reason required | `req_status_declined` | neutral | Student notified |
| Cancelled (4) | Pending, Clarification, OpenForOffers, AwaitingPayment | *(terminal)* | Student | — | `req_status_cancelled` | neutral | Offers expired, pending payments failed |
| OpenForOffers (5) | — / AwaitingPayment | AwaitingPayment, Cancelled | Student (publish), System (reservation expiry) | Marketplace only | **`req_status_unknown`** | neutral | Visible as an opportunity |
| AwaitingPayment (6) | OpenForOffers | OpenForOffers, ConvertedToOrder, Cancelled | Student (select), System | 120-minute reservation | **`req_status_unknown`** | neutral | Offer → Selected; reservation clock starts |
| ConvertedToOrder (7) | AwaitingPayment | *(terminal)* | System (webhook) | reservation must still be live | **`req_status_unknown`** | neutral | Order created; losing offers → NotSelected |
| **Expired (8)** | — | — | — | — | **`req_status_unknown`** | neutral | **UNREACHABLE — never assigned** |

### `OrderStatus` × `OrderPaymentStatus` × `OrderDeliveryState`

| Status | From | To | Actor | Guard | Frontend stage | Tone |
|---|---|---|---|---|---|---|
| AwaitingPayment (0) | — | InProgress, Cancelled | System | — | `awaiting_payment` **or the synthesised `payment_confirmed`** | danger / info |
| InProgress (1) | AwaitingPayment | Delivered, Completed (dispute) | Teacher | `PaymentStatus == Paid` | `in_progress` | primary |
| Delivered (2) | InProgress, RevisionRequested | RevisionRequested, Completed, Cancelled | Teacher | at least one file | `delivered` | accent |
| RevisionRequested (3) | Delivered | Delivered, Completed (dispute) | Student | `RevisionsUsed < RevisionAllowance` | `revision` | warning |
| Completed (4) | Delivered, and via dispute from InProgress / RevisionRequested | *(terminal, reversible by a dispute refund)* | Student / system / admin | no open dispute | `completed` | success |
| Cancelled (5) | AwaitingPayment (unpaid), or any paid state via refund | *(terminal)* | Participant / admin | — | `cancelled` | neutral |

- `OrderPaymentStatus`: `Pending → Paid → Refunded`, or `Pending → Failed`. Fully orthogonal to `Status`.
- `OrderDeliveryState`: **written six times, read zero times** outside two unit-test assertions and one DTO field that no client consumes. It is a pure function of `OrderStatus`.

### Other enums

- `TeacherOfferStatus`: Submitted → {Selected, Withdrawn, NotSelected, Expired}; Selected → {Accepted, Submitted (reopen), Expired}; Withdrawn → Submitted (resubmit). Coherent.
- `LiveSessionStatus`: 9 values, three of which are `*Pending` handshake states. Coherent but entirely disjoint from `OrderStatus`.
- `PaymentStatus` (Pending/Confirmed/Failed/Refunded) versus `OrderPaymentStatus` (Pending/Paid/Failed/Refunded): **two enums for the same fact under two names.**
- `DisputeStatus`: Open → UnderReview → Resolved. Minimal and correct.
- `TeacherApplicationStatus` (7 values) versus `ShowcaseModerationStatus` (7 values): near-identical moderation machines (`Draft`/`Submitted`/`UnderReview`/`ChangesRequested`/`Approved`/`Rejected` plus `Withdrawn` or `Archived`) with entirely separate implementations, queues and dashboards.
- `LedgerAccountKind.TeacherPending`: declared, never referenced.
- `TeacherOnboardingStatus.ApplicationDraft`: declared, never assigned.

### Summary of status defects

| Kind | Item |
|---|---|
| Duplicate meaning | `PaymentStatus` ≡ `OrderPaymentStatus`; `TeacherApplicationStatus` ≈ `ShowcaseModerationStatus` |
| Unreachable | `LearningRequestStatus.Expired`, `TeacherOnboardingStatus.ApplicationDraft`, `LedgerAccountKind.TeacherPending` |
| Missing | An Order state for "paid but not started"; a marketplace-request state for "deadline passed" |
| Frontend-only | `payment_confirmed` (`js/tafseel.js:2113-2119`) |
| Backend-only | `OrderDeliveryState`, all four values |
| Contradictory labelling | Marketplace request statuses render as `req_status_unknown` through `Tafseel.requestStatusLabel` |
| Serving UI, not business | `OrderDeliveryState` exists to describe delivery progress that `OrderStatus` already encodes |

---

## 11. Financial Lifecycle Summary

| Moment | What happens | Evidence |
|---|---|---|
| Price becomes authoritative | Direct: at teacher acceptance (`input.FinalPrice`). Marketplace: at offer submission (`offer.Amount`). Session: at booking (`service.Price × minutes / 60`). | `OrderService.cs:200-206`; `FinancialService.cs:211-217`; `LiveSessionService.cs:339` |
| Payment created | Student initiates checkout; `Payment(Pending)` plus `PaymentAttempt(Created)` plus an optional `CouponRedemption` | `FinancialService.cs:24-135` |
| Payment successful | HMAC-verified webhook, idempotent on `(Provider, EventId)`; `Payment.Confirm` requires an exact amount and currency match | `FinancialService.cs:136-235`; `MockPaymentProvider.cs:35-56` |
| Work may begin | Direct: teacher `Start`, which hard-requires `PaymentStatus == Paid` (`Orders.cs:441-447`). Marketplace: the Order is created already Paid. | — |
| Earnings become earned | On escrow release: `Completed` (manual or automatic) or a dispute resolved as `ReleaseTeacher` | `FinancialService.cs:275-296` |
| Earnings become withdrawable | **Immediately on release** — credited straight to `TeacherAvailable` | `FinancialService.cs:284-291` |
| Refunds | Held-escrow refund (`RefundCoreAsync`) or post-release reversal (`RefundReleasedOrderCoreAsync`), both idempotency-keyed, at most one refund per payment | `FinancialService.cs:650-745` |
| Cancellations | Unpaid Order → `CancelBeforePayment`, no money moves. Session → refund only if the teacher cancelled or the student cancelled outside the window. | `Orders.cs:519-527`; `LiveSessions.cs:161-166` |
| Disputes | Refund or release, with a post-release reversal path that debits `TeacherAvailable` | `FinancialService.cs:369-390` |
| Withdrawal eligibility | Verified payout profile, at least 50 SAR, and `TeacherAvailable` balance ≥ amount | `FinancialService.cs:400-435` |

### FINANCIAL CORRECTNESS RISK — FR-1 (CRITICAL): coupon-discounted Orders over-release escrow

`ReleaseOrderEscrowAsync` (`FinancialService.cs:275-296`) debits `EscrowHeld` by `order.TeacherNet + order.StudentFeeAmount + order.TeacherCommissionAmount`, which by construction equals `order.StudentTotal`. The amount actually captured into escrow is `payment.Amount`, which equals `StudentTotal − couponDiscount` (`FinancialService.cs:43-45`). With any coupon applied, escrow is drained by more than was ever deposited — silently transferring the discount out of other students' held funds and inflating `PlatformRevenue`.

The identical problem was **recognised and solved** on the live-session path eleven lines later:

```csharp
// Coupons consume platform margin first; the teacher only shares a discount larger than that margin.
var teacherAmount = Math.Min(booking.TeacherNet, payment.Amount);
var platformAmount = payment.Amount - teacherAmount;   // FinancialService.cs:310-312
```

and again in both released-refund paths. The Order path was never given the same treatment.

**Reachable end to end.** The coupon field is on the live Payment page (`Tafseel-Payment.dc.html:120`) and is posted to `/payments/orders/{id}` (`Tafseel-Payment.dc.html:383-385`). Coupon CRUD is live in the Admin Dashboard. **There is no test covering a coupon applied to an Order payment** — `grep -ril coupon tests/` returns only `CouponTests.cs`, `PromotionTests.cs` and `PromotionsTests.cs`.

### FINANCIAL CORRECTNESS RISK — FR-2 (HIGH): earnings are withdrawable before the dispute window closes

Manual completion by a student releases escrow to `TeacherAvailable` immediately (`OrderService.cs:405-421`). A dispute may still be opened for **7 days** after delivery (`DisputeOptions.WindowDays=7`). If that dispute resolves as `RefundStudent`, `RefundReleasedOrderCoreAsync` debits `TeacherAvailable` — but nothing prevents the teacher from having withdrawn those funds first. `RequestWithdrawalAsync` checks only `balance < input.Amount`; `LedgerEntry` enforces only `amount > 0` and `debit != credit`. **The teacher's ledger balance simply goes negative and stays there, and the platform absorbs the refund.**

`LedgerAccountKind.TeacherPending` — declared at `Finance.cs:12` and referenced nowhere — is direct evidence that a clearance or maturity account was designed and never built.

The automatic path is already safe: `OrderAutoReleaseWorker` waits `max(AutoReleaseAfterHours, WindowDays × 24)` = 7 days. Only the manual-completion shortcut is exposed.

### Other financial observations

- **FR-3 (MEDIUM).** A paid Order stuck in `InProgress` — teacher never delivers — has **no** student-accessible remedy. Disputes require a delivery, no worker times it out, and the admin refund has no UI. Escrow is held indefinitely.
- **FR-4 (MEDIUM).** A `Confirmed` live session that ends with both parties passive is never settled (see §8, S-3).
- **FR-5 (LOW).** `ReconcileAsync` exists and is exposed at `GET /admin/finance/reconciliation`, but no page calls it. Its `orphans` check — confirmed payments with no `Held` escrow entry — would have surfaced FR-1-class problems had anyone been looking at it.

**What is financially sound and must be protected:** the double-entry ledger with business keys; the escrow-entry audit trail; idempotency on payment initiation, webhook, refund, withdrawal and dispute resolution; HMAC webhook verification with fixed-time comparison; `Serializable` transactions with `sp_getapplock` on every money path; immutable service-identity snapshots on Order, Request and Booking; and masked payout destinations with a maximum of four visible digits.

---

## 12. Business Contradictions

### A. Duplicate concepts

| # | Contradiction | Evidence |
|---|---|---|
| A-1 | `PaymentStatus` and `OrderPaymentStatus` are two enums for one fact | `Finance.cs:5`; `Orders.cs:32` |
| A-2 | `OrderDeliveryState` duplicates `OrderStatus` and is never read | `Orders.cs:33`; six writes, zero reads |
| A-3 | `RequestClarification` and `Conversation(Scope=LearningRequest)` are two messaging systems on one object | `Orders.cs:182-198` vs `MessagingService.cs:265-268` |
| A-4 | `ShowcaseModerationStatus` re-implements `TeacherApplicationStatus` | `Marketplace.cs:231-239` vs `TeacherApplication.cs:5` |
| A-5 | `TeacherService` has two overlapping mutators (`Update`, `Configure`) and two "off" concepts (`IsActive`, `SupersededByTeacherServiceId`) | `Marketplace.cs:170-228` |
| A-6 | `TeacherProfile.Publish()` and `SetProfilePublishedAsync` are two definitions of publishable | `Marketplace.cs:43-49` vs `MarketplaceService.cs:417-446` |
| A-7 | Live-session settlement re-implements order auto-completion | two workers, two state families |

### B. Parallel workflows

Direct Request versus Marketplace Request (these converge correctly at the Order); Order versus LiveSessionBooking (these never converge); `OrderExtensionRequest` versus `RequestReschedule` (the same mutual-agreement pattern, two implementations); `OrderAutoReleaseWorker` versus `LiveSessionSettlementWorker`.

### C. Technical concepts leaking into UX

- The Teacher Dashboard's four inbound queues — **New**, **Opportunities**, **Orders**, **Sessions** (`Tafseel-Teacher-Dashboard.dc.html:2255`) — are four *database tables*, not four *jobs a teacher does*. The Student Dashboard already proves the alternative by collapsing requests and orders into one `kind`-tagged list (`Tafseel-Student-Dashboard.dc.html:1920`).
- `OrderStatus` integers are branched on directly in view code (`js/tafseel.js:2074-2122`).
- Marketplace request statuses reach the UI as `req_status_unknown` and are patched with per-surface hardcoded strings.

### D. Lifecycle contradictions

| # | Contradiction | Evidence |
|---|---|---|
| D-1 | The frontend must invent `payment_confirmed`; the backend has no such state | `js/tafseel.js:2113-2119` |
| D-2 | The delivery clock starts at acceptance, not payment, on the direct path | `CatalogContracts.cs:56-60`; `Order.Start` never re-checks `AgreedDeliveryAt` |
| D-3 | Cancelling or refunding an Order leaves its `LearningRequest` in `Accepted` or `ConvertedToOrder` | `OrderService.CancelOrderAsync`, `RefundCoreAsync` — neither touches the request |
| D-4 | A dispute cannot be opened for a paid but undelivered Order — the commonest real failure | `GovernanceService.cs:274-283` |
| D-5 | `Order.CompleteByDispute` accepts `InProgress`, which D-4 makes unreachable | `Orders.cs:511-519` |
| D-6 | A marketplace request past its deadline vanishes from teacher views while still reading `OpenForOffers` to the student | `OpenMarketplaceService.cs:247` |
| D-7 | The Offer's `IncludedRevisions` is shown, agreed, then replaced by `service.Revisions` at Order creation | `FinancialService.cs:214-217` vs `js/open-marketplace.js:297` |
| D-8 | A `Confirmed` session past `EndsAt` with two passive parties never settles | `LiveSessionSettlementWorker.cs:41-47` |
| D-9 | Suspension does not unpublish, cancel, or block new intake | `GovernanceService.cs:720-738` |

### E. Ownership ambiguity

- **Who resolves disputes?** `Permissions.ForRole(QualityReviewer)` does **not** include `Disputes.Resolve`, so only Admin can. `PRODUCT.md` describes Quality Reviewers as governing teaching evidence, which is consistent — but `docs/business-ambiguities.md` item 11 flags the Admin/QualityReviewer boundary as unresolved, and the Quality Dashboard is built as a general operations surface. **BUSINESS AMBIGUITY.**
- **Who decides the final price on the direct path?** Solely the teacher, with no student counter-offer. **BUSINESS AMBIGUITY (BA-1).**
- **Who ends a stalled Order?** Nobody — see D-4 and FR-3.
- **Who owns the "Emergency" designation?** The student's client. **BUSINESS AMBIGUITY (S-2).**

---

## 13. Dead / Duplicate / Overlapping Concepts

*Identified with evidence. Nothing deleted.*

| Item | Status | Evidence |
|---|---|---|
| `LedgerAccountKind.TeacherPending` | Declared, zero references | `Finance.cs:12` |
| `LearningRequestStatus.Expired` | Declared, never assigned | `Orders.cs:17` |
| `TeacherOnboardingStatus.ApplicationDraft` | Declared, never assigned | `TeacherApplicationContracts.cs:91` |
| `OrderDeliveryState` (whole enum) | Written, never read outside two test assertions | six writes in `Orders.cs`, one DTO field, no consumer |
| `GET /admin/operations/requests` | Live endpoint, no caller | absent from the Admin Dashboard's API-call set |
| `GET /admin/operations/sessions` | Live endpoint, no caller | same |
| `GET /admin/finance/reconciliation` | Live endpoint, no caller | same |
| `POST /payments/{id}/refund` | Live endpoint, no UI | the only exit from a stuck paid Order |
| Teacher Showcase subsystem (entity, versions, ~20 endpoints, Quality queue) | Disabled outside Development and Testing | `appsettings.json` `TeacherShowcases.Enabled=false`; `MarketplaceService.cs:1624` |
| AI marketplace assistant (3 endpoints, Groq provider, prompts) | Disabled | `appsettings.json` `Ai.Enabled=false` |
| `LearningRequest.Budget` / `BudgetMin` / `BudgetMax` | Stored and displayed; never constrain any price | no validation reference anywhere |
| `LearningRequest.PreferredDeliveryAt` on marketplace requests | Bounds visibility only; no offer is rejected for exceeding it | `OpenMarketplaceService.cs:110-118` |
| `StudentLearningPreference` | CRUD plus wizard prefill only; never used for matching, ranking or targeting | `StudentLearningPreferenceService.cs` |
| `Conversation.Scope = General` | Lets any student DM any published teacher outside all commerce | `MessagingService.cs:261-264` |
| `%UAT%` / `%Sprint%` name filter | Test-data hygiene inside the canonical public-eligibility query | `TeacherPublicQueries.cs:19-22` |
| `Order.CompleteByDispute` `InProgress` branch | Unreachable while D-4 holds | `Orders.cs:514` |
| `MockPaymentProvider` / `MockLiveSessionLinkProvider` | The only implementations; Production forbids them | `DependencyInjection.cs:309, 420-425` |

---

## 14. KEEP / SIMPLIFY / MERGE / REMOVE / REDESIGN / FIX Decisions

| # | Item | Class | Severity | Rationale |
|---|---|---|---|---|
| 1 | Coupon discount ignored by Order escrow release | **FIX** | CRITICAL | Money leaves escrow that never entered it. The correct pattern already exists on the live-session path. |
| 2 | Released earnings withdrawable inside the dispute window | **FIX** | CRITICAL | The ledger can go negative and stay there. `TeacherPending` is the designed-but-unbuilt control. |
| 3 | Offer `IncludedRevisions` discarded at Order creation | **FIX** | HIGH | An agreed commercial term is silently replaced. |
| 4 | Non-delivery cannot be disputed | **REDESIGN** | HIGH | The commonest failure mode has no remedy. Needs a deliberate policy, not just a predicate change. |
| 5 | Suspension does not cascade | **FIX** | HIGH | Students can still transact with a teacher who cannot log in. |
| 6 | Two publishable definitions (domain versus service) | **FIX** | HIGH | The domain invariant must be the strong one. |
| 7 | Direct-path delivery clock starts at acceptance | **FIX** | HIGH | Orders can be born overdue. |
| 8 | Collapse `Order.PaymentStatus` into `OrderStatus` (add `Funded`) | **SIMPLIFY** | HIGH | Removes the frontend-only `payment_confirmed` state and the `Status` × `PaymentStatus` matrix. |
| 9 | `OrderDeliveryState` | **REMOVE** | MEDIUM | Written, never read; fully derivable from `OrderStatus`. |
| 10 | `PaymentStatus` / `OrderPaymentStatus` duplication | **MERGE** | MEDIUM | One enum, one meaning. |
| 11 | `RequestClarification` into `Conversation(Scope=LearningRequest)` | **MERGE** | MEDIUM | One thread per work item. |
| 12 | Direct-path teacher commitment becomes a first-class Offer | **REDESIGN** | HIGH | Unifies price formation, makes the Order the payment target on both paths, and removes `Payment.LearningRequestId` and `LinkConvertedOrder`. |
| 13 | LiveSessionBooking's money, participants and review/dispute linkage onto a shared commerce object | **MERGE** | HIGH | Removes a third escrow / refund / settlement implementation. Scheduling stays its own concern. |
| 14 | `LiveSessionBooking` scheduling, no-show and reschedule semantics | **KEEP** | — | Genuinely different from async work and correctly modelled. |
| 15 | `Emergency` premium | **REDESIGN** | MEDIUM | Currently unenforceable in both directions. Needs a lead-time rule, or removal. |
| 16 | Live session has no teacher acceptance | **REDESIGN** | HIGH | Product decision: is a published availability slot an offer to contract? |
| 17 | Marketplace request expiry (`Expired` state) | **FIX** | MEDIUM | The enum value exists; assign it via a worker so the student sees the truth. |
| 18 | `req_status_unknown` for marketplace statuses | **FIX** | MEDIUM | Extend `requestStatusLabel`; delete the per-surface forks and the hardcoded Landing strings. |
| 19 | Request status left stale after an Order cancel or refund | **FIX** | MEDIUM | A parent must not claim a live child. |
| 20 | `%UAT%` / `%Sprint%` filter in canonical eligibility | **FIX** | MEDIUM | Move to seed-data naming or an explicit `IsDemoAccount` flag. |
| 21 | `QualityReviewer` holds `ReportsView` (finance plus audit) | **FIX** | MEDIUM | Split into `Reports.Quality` and `Reports.Financial`. |
| 22 | Confirmed sessions never auto-settle | **FIX** | MEDIUM | Extend the settlement worker's scan. |
| 23 | Browse ignores the availability requirement | **FIX** | MEDIUM | Reuse the publication predicate. |
| 24 | The teacher's four inbound queues | **SIMPLIFY** | MEDIUM | One "Work" list with filters, as the Student Dashboard already does. |
| 25 | Admin has no Order surface; `operations/*` and `reconciliation` unused | **FIX** | MEDIUM | Build the Order operations view on the existing endpoints; surface reconciliation. |
| 26 | Admin refund has no UI | **FIX** | MEDIUM | It is the only manual exit from stuck escrow. |
| 27 | Budget fields are non-binding | **BUSINESS AMBIGUITY** | MEDIUM | Enforce, label as advisory, or remove — a product call. |
| 28 | Direct-path final price set unilaterally by the teacher | **BUSINESS AMBIGUITY** | HIGH | Needs a stated pricing promise before anything changes. |
| 29 | Teacher Showcase subsystem (disabled) | **BUSINESS AMBIGUITY** | MEDIUM | Ship it or retire it; carrying a dark seven-state moderation machine has real cost. |
| 30 | AI assistant (disabled) | **BUSINESS AMBIGUITY** | LOW | The same question, on a smaller surface. |
| 31 | `StudentLearningPreference` | **SIMPLIFY** | LOW | Either feed discovery and opportunity targeting, or reduce it to wizard defaults. |
| 32 | `Conversation.Scope = General` | **BUSINESS AMBIGUITY** | MEDIUM | Pre-sale contact value versus disintermediation risk. |
| 33 | `TeacherService.Update` / `Configure` duplication | **SIMPLIFY** | LOW | One mutator. |
| 34 | `ShowcaseModerationStatus` versus `TeacherApplicationStatus` | **MERGE** | LOW | Only worth doing if showcases ship. |
| 35 | Escrow, ledger, idempotency, webhook verification | **KEEP** | — | Correct and load-bearing. |
| 36 | `TeacherSubjectQualification` as the per-subject selling right | **KEEP** | — | The cleanest concept in the system. |
| 37 | Immutable service-identity snapshots | **KEEP** | — | Deliberate accounting duplication. Do not "de-duplicate" these. |
| 38 | Offer reservation window plus expiry worker | **KEEP** | — | Well designed, correctly locked, correctly notified. |
| 39 | Optimistic concurrency via `RowVersion` plus `If-Match` | **KEEP** | — | Consistently applied across the API. |
| 40 | `MarketplaceInteractionEvent` analytics | **KEEP** | — | Allow-listed, idempotent, retention-bounded, privacy-minimised. |

---

## 15. Proposed Canonical Product Model

Product concepts a normal user can name — deliberately **not** one-to-one with implementation entities.

### 15.1 Product concepts (seven)

1. **Teacher Profile** — who a teacher is and what they are qualified to teach.
2. **Service** — a priced offering in a qualified subject. Two kinds: *Work* (asynchronous) and *Lesson* (scheduled).
3. **Request** — a student's stated need. Two sourcing modes: *Direct* (one invited teacher) and *Open* (all qualified teachers).
4. **Offer** — a teacher's priced, expiring commitment against a Request. **Now used on both paths.**
5. **Engagement** — the paid contract and everything inside it: payment, work or lesson, delivery, revision, completion. This is the user-facing name for the unified Order.
6. **Case** — a dispute about an Engagement.
7. **Earnings** — the teacher's money view: released, on hold, withdrawn.

Reviews, deliveries, revisions, extensions, escrow, ledger and withdrawals are *parts of* these concepts, not concepts users navigate to.

### 15.2 Relationships

```
Student ──creates──► Request ──receives──► Offer ◄──submits── Teacher
                        │  (Direct: exactly one invited teacher)      │
                        │  (Open:   any qualified teacher)            │
                        │                                             │
                  student accepts one Offer                    Teacher Service
                        │                                        (Work | Lesson)
                        ▼                                             ▲
                   ENGAGEMENT ◄──────── terms snapshotted ─────────────┘
                   ├─ kind: Work | Lesson
                   ├─ Payment (1..n attempts, exactly one confirmed)
                   ├─ Schedule            [Lesson only]
                   ├─ Delivery (1..n)     [Work only]
                   ├─ Revision (0..n)     [Work only]
                   ├─ Timeline (status history)
                   ├─ Thread (one conversation)
                   ├─ Review (0..1, by the student, when Completed)
                   └─ Case (0..1)
                        │
              Escrow ─► Earnings ─► Withdrawal
```

### 15.3 Product concept to implementation entity

| Product concept | Entities | Change from today |
|---|---|---|
| Teacher Profile | `TeacherProfile`, `TeacherSubjectQualification`, `TeacherTopic`/`Language`/`EducationLevel`, `TeacherTeachingSample`, availability rules | KEEP |
| Service | `TeacherService`, `ServiceCatalogItem` | KEEP; collapse to one mutator |
| Request | `LearningRequest` | KEEP; `SourcingMode` stays; make `Expired` reachable |
| Offer | `TeacherOffer` | **Extend to the direct path** — the teacher's acceptance becomes an Offer |
| **Engagement** | `Order`, with `LiveSessionBooking` folded in as `kind: Lesson` (or retained as a one-to-one scheduling extension) | **MERGE**; single status machine; single payment target |
| Payment / Escrow / Earnings | `Payment`, `EscrowEntry`, `LedgerAccount`/`LedgerEntry`, `Refund`, `WithdrawalRequest`, `TeacherPayoutProfile` | KEEP; **activate `TeacherPending`**; drop `Payment.LearningRequestId` |
| Case | `Dispute` plus children | KEEP; one `EngagementId` replaces two nullable FKs; widen eligibility |
| Review | `TeacherReview` | KEEP; one `EngagementId` |
| Thread | `Conversation` / `Message` | MERGE `RequestClarification` into it |

**One product concept backed by several entities is expected and fine** — Engagement is legitimately `Order` plus `Payment` plus `EscrowEntry` plus `LedgerEntry` plus deliveries plus history. **What must not persist is one concept modelled twice** (Order versus LiveSessionBooking) or **one fact stored twice** (`Status` versus `PaymentStatus` versus `DeliveryState`).

---

## 16. Proposed Canonical Lifecycles

### Request

```
Draft*                      (* only if attachment-before-submit is kept)
  ↓ submit / publish
Open ──────────────────────────────► Cancelled   (student, while Open or Reserved)
  │                                     ▲
  │ student accepts an Offer            │
  ▼                                     │
Reserved  ──payment window elapses──────┘ (returns to Open)
  │
  │ payment confirmed
  ▼
Engaged  (terminal — the Engagement now carries the story)
  ▲
  └── Expired  (system, when the stated deadline passes with no accepted Offer)
```

Direct and Open share this machine exactly. Direct simply starts with one invited teacher. `Declined` disappears as a request status: a direct teacher declining is an Offer that was never made, and the request returns to `Open` so the student can invite someone else or open it to the market. **That is a REDESIGN and needs sign-off — see §18, item 6.**

### Offer

```
Submitted ──► Accepted   (student accepts; becomes the Engagement's terms)
    │  ├──► Withdrawn ──► Submitted   (teacher re-offers)
    │  ├──► Declined                  (student passes, or another Offer wins)
    │  └──► Expired                   (ValidUntil passes)
```

Unchanged from today except that `Selected` and `Accepted` collapse into one step, because the Engagement — not the Request — becomes the payment target.

### Engagement (one machine for both Work and Lesson)

```
AwaitingPayment
  ├── Cancelled            (either party, before payment)
  └── Funded               (payment confirmed → escrow held)
        │
        ├─ kind = Work                        ├─ kind = Lesson
        │  teacher starts                     │  (scheduled; no start action)
        ▼                                     ▼
     InProgress                            Scheduled
        │ deliver                             │ session ends
        ▼                                     ▼
     Delivered                            AwaitingOutcome
        ├── RevisionRequested ──► InProgress   ├── outcome agreed / auto-finalised
        └── accepted / auto-accepted           │
                    │                          │
                    └──────────┬───────────────┘
                               ▼
                          Completed  ──► escrow → Earnings(Pending) ──7d──► Earnings(Available)
```

Alternative exits, and only these:

- `Cancelled` — before payment, by either party.
- `Refunded` — a resolved Case, or an admin refund. Terminal, and reachable from `Funded`, `InProgress`, `Delivered`, `Scheduled`, `AwaitingOutcome` and `Completed` (post-release reversal).
- `Disputed` is **not** a status. A Case is an attachment that freezes automatic transitions, exactly as `CompleteAsync` already does today. Keeping it out of the status enum avoids introducing a fourth parallel status field.

Six live statuses for Work and five for Lesson, in one shared enum. Today: 6 `OrderStatus` × 4 `OrderPaymentStatus` × 4 `OrderDeliveryState`, plus 9 `LiveSessionStatus`.

### Case

```
Open ──► UnderReview ──► Resolved{ RefundStudent | ReleaseTeacher | NoFinancialAction }
```

Unchanged. Eligibility widens: any Engagement that is `Funded` or later, within the window, whether or not a delivery occurred.

### Teacher readiness

```
Registered ──► EmailConfirmed ──► Qualified(subject) ──► Sellable(service) ──► Listed
                                        ▲                                       │
                                        └──── Blocked (suspension / revocation) ┘
```

---

## 17. Migration & Compatibility Impact

| Change | DB | Backend | API | Frontend | Existing data | Migration | Back-compat | Financial risk | Authz risk | Cx |
|---|---|---|---|---|---|---|---|---|---|---|
| **FR-1** coupon-aware Order release | None | `ReleaseOrderEscrowAsync` mirrors the live-session `Math.Min` pattern | None | None | Prior coupon-discounted completed Orders are already mis-released — this needs a one-off reconciliation *report*, **not** an automated correction | None | Full | **Removes** a live risk | None | **S** |
| **FR-2** `TeacherPending` clearance | New `LedgerAccount` rows only; the kind already exists in the enum | Release credits `TeacherPending`; a maturity worker moves it to `TeacherAvailable` after the dispute window; refund reversal debits Pending first | `GET /withdrawals/balances` gains a `pending` bucket | Earnings panel shows a "clearing" figure | Existing `TeacherAvailable` balances remain valid and are treated as already matured | Additive; no backfill | Full | **Removes** a live risk | None | **M** |
| **#3** honour `offer.IncludedRevisions` | None | One argument at `FinancialService.cs:214-217` | None | None | Past Orders keep their stored allowance — do not retro-edit | None | Full | None | None | **S** |
| **#4** widen dispute eligibility | None | Predicate change plus a stalled-Order timeout worker | None | Dispute reason list | Dormant stuck Orders become disputable | None | Full | **Reduces** stuck escrow | None | **M** |
| **#5** suspension cascade | None | `SetSuspensionAsync` unpublishes; intake queries add `!IsSuspended` | None | None | Currently suspended-but-published teachers are only corrected on the next suspension write — needs a one-off sweep | Data sweep only | Full | Prevents payment to unfulfillable teachers | Tightening | **S** |
| **#6** move publish invariants into the domain | None | `Publish()` takes a validated readiness snapshot | None | None | None | None | Full | None | Tightening | **S** |
| **#7** delivery clock from payment | None | Store `DeliveryHours` on the Order; compute `AgreedDeliveryAt` at funding | `AcceptLearningRequest` sends hours rather than a timestamp | Accept modal | **Existing Orders keep their absolute `AgreedDeliveryAt`** — add the column as nullable and prefer it only when present | Additive nullable column | Full | None | None | **M** |
| **#8 / #9 / #10** collapse Order status fields | Additive `Status` values; the `DeliveryState` column is retained but unwritten, dropped in a later release | Domain transitions rewritten | `OrderDto` keeps `paymentStatus` as a computed field for one release | `orderPresentation` simplifies; `payment_confirmed` becomes real | Backfill: `Status=AwaitingPayment && PaymentStatus=Paid → Funded`. **Deterministic and reversible.** | Data migration plus additive enum | One release carrying both shapes | None if backfilled inside a transaction | None | **L** |
| **#12** Offer on the direct path | `TeacherOffer.LearningRequestId` already exists; add an origin / `IsInvited` flag | Accept becomes "create and auto-accept an Offer"; the Order is created at payment on both paths | `POST /learning-requests/{id}/accept` returns an Offer rather than an Order | Accept and payment surfaces | **Existing direct Orders have no Offer row** — do not synthesise one; read terms from the Order snapshot | Additive; historical rows keep a null Offer | Full while both shapes are read | Removes the split payment target | None | **L** |
| **#13** fold Lesson into Engagement | `Orders` gains `Kind` plus nullable schedule columns; `LiveSessionBookings` is retained read-only or becomes a one-to-one extension table | Largest change: one status machine, one settlement worker | Session endpoints proxy to Engagement for one release | Sessions view reads Engagements | **Existing bookings must be projected, not rewritten** — a nullable `EngagementId` on the booking is the safe path | Additive plus backfill projection | Two releases | High if rushed — **do this last, and only after FR-1 and FR-2** | None | **XL** |
| **#17** marketplace request expiry | None | Worker assigns `Expired` | None | Label | Past-deadline `OpenForOffers` rows transition on the first run — expected and desirable | None | Full | None | None | **S** |
| **#18** request status labels | None | None | None | Extend `requestStatusLabel`; delete the forks | None | None | Full | None | None | **S** |
| **#20** `%UAT%` filter | Optional `IsDemoAccount` column | Predicate | None | None | Existing demo users must be flagged before the filter is removed | Additive nullable | Full | None | None | **S** |
| **#21** split `Reports.View` | None | New permission constants | Policy names on five routes | None | Existing QualityReviewer tokens lose finance access at the next refresh | None | Full | None | **Tightening — intended** | **S** |
| **#25 / #26** Admin Order and refund UI | None | None (endpoints already exist) | Add an Order list endpoint | New Admin sections | None | None | Full | Gives operations a manual exit | Admin-only | **M** |

**Non-negotiable migration rule.** No destructive migration is proposed. Every change above is additive-then-read-switch. The two status backfills (`Order.Status` and the Lesson projection) are deterministic functions of existing columns and are reversible from `OrderStatusHistory` and `LiveSessionStatusHistory`, both of which are append-only.

---

## 18. Product Decisions Requiring Human Approval

Genuine ambiguities. Code cannot settle any of these.

1. **Is the price on a teacher's public profile a promise or a starting point?** Today the teacher may name any in-band `FinalPrice` at acceptance and the student may only pay or walk away. This determines whether the direct path needs a counter-offer step, a price lock, or an explicit "from" label.
2. **What is a student's stated budget for?** A binding ceiling, a filter on who may offer, or advisory context? It is currently captured and ignored on both paths.
3. **Is a published availability slot an offer to contract?** If yes, live-session booking correctly needs no teacher acceptance and teacher cancellation should carry a penalty. If no, sessions need an acceptance step like async work.
4. **What makes a booking an "emergency"?** A lead-time threshold, a teacher-enabled option, or nothing — in which case the 50% premium should be removed rather than left to a client boolean.
5. **May a student and teacher message before any commerce?** `Conversation.Scope=General` allows it today. Weigh discovery value against disintermediation risk.
6. **Should a direct teacher's decline end the request, or return it to the market?** The proposed canonical Request lifecycle assumes the latter; today it is terminal.
7. **What is the Quality Reviewer's boundary?** Today: applications and showcases only, plus unintended access to platform financials. Should they triage disputes and review moderation-adjacent operational queues?
8. **Ship or retire Teacher Showcases?** A complete seven-state moderation subsystem with roughly twenty endpoints and a Quality Dashboard queue sits behind `Enabled=false`.
9. **Ship or retire the AI assistant?** Three endpoints and a Groq provider sit behind `Ai.Enabled=false`.
10. **When do earnings mature?** The FR-2 fix needs a number. The dispute window is 7 days and auto-release already waits 7 days; confirming "7 days after release" would make the manual and automatic paths consistent.
11. **What happens to a paid Order the teacher abandons?** Automatic refund after a grace period past `AgreedDeliveryAt`, a forced dispute, or manual admin action only?
12. **Do direct and marketplace requests deserve two front doors long-term?** This audit recommends yes. Confirm before the Offer unification lands, because that change makes both doors machinery-identical.

---

## 19. Recommended Implementation Order

**Phase 1 — Financial correctness. Do nothing else first.**
FR-1 coupon-aware Order escrow release; a reconciliation report over historical coupon-discounted Orders; FR-2 `TeacherPending` clearance with a maturity worker; regression tests for a coupon applied to an Order payment and for withdraw-then-dispute-refund. Surface `GET /admin/finance/reconciliation` in the Admin Dashboard. **Complexity S and M. No schema change beyond additive ledger rows.**

**Phase 2 — Lifecycle integrity, no model change.**
Honour `offer.IncludedRevisions`; suspension cascade; move publication invariants into `TeacherProfile.Publish()`; align browse with the publication predicate; assign `LearningRequestStatus.Expired`; settle passive `Confirmed` sessions; sync request status when its Order cancels or refunds; remove the `%UAT%` / `%Sprint%` filter behind an explicit demo flag. **All S.**

**Phase 3 — Remedy gaps and operations.**
Widen dispute eligibility to any funded Engagement; add a stalled-Order timeout; build the Admin Order operations view and the admin refund UI on the endpoints that already exist; split `Reports.View` into quality and financial permissions. **S to M.**

**Phase 4 — Status simplification.**
Collapse `OrderPaymentStatus` into `OrderStatus` by adding `Funded`; stop writing `OrderDeliveryState`; make `payment_confirmed` a real backend state; fix `requestStatusLabel` and delete the per-surface forks and the hardcoded Landing strings; move the direct-path delivery clock to payment time. **M to L, additive plus one deterministic backfill.**

**Phase 5 — Offer unification.**
Make the direct teacher's acceptance a first-class `TeacherOffer`; make the Order the payment target on both paths; retire `Payment.LearningRequestId` and `LinkConvertedOrder` after a compatibility release. **L.**

**Phase 6 — Engagement unification.**
Fold `LiveSessionBooking` into the Engagement as `kind: Lesson`, keeping scheduling, no-show and reschedule semantics intact. Merge `RequestClarification` into `Conversation`. Collapse the teacher's four queues into one filtered Work list. **XL — last, and only on top of a corrected financial core.**

**Not in scope until §18 is answered:** pricing-promise changes, budget enforcement, session acceptance, emergency-premium rules, the general-messaging policy, and the showcase and AI ship-or-retire decisions.

---

## 20. Evidence Appendix

### Domain

- `src/Tafseel.Domain/Orders/Orders.cs` — `LearningRequestStatus:9-18`; `RequestSourcingMode:20`; `OrderStatus:22-30`; `OrderPaymentStatus` / `OrderDeliveryState:32-33`; direct ctor `:38-60`; marketplace ctor `:62-88`; `SelectOffer:129-141`; `ExpireOfferSelection:152-161`; `ConvertOfferToOrder:163-173`; `Order` ctor `:335-368`; `ConfirmPayment:433`; `Start:441`; `Deliver:456-475`; `RequestRevision:477-487`; `Complete:489`; `CompleteAutomatically:495`; `Refund:502`; `CompleteByDispute:511-519`; `CancelBeforePayment:521`
- `src/Tafseel.Domain/Orders/TeacherOffer.cs` — `TeacherOfferStatus:5`; `SetTerms:117-131`
- `src/Tafseel.Domain/LiveSessions/LiveSessions.cs` — `LiveSessionStatus:6-17`; ctor `:23-70`; `RequiresRefundOnCancellation:161`; `ConfirmSettlement:189-201`; `FinalizeSettlement:203-213`; `ResolveByDispute:215-227`
- `src/Tafseel.Domain/Finance/Finance.cs` — `LedgerAccountKind:7-17` (`TeacherPending:12`); `Payment` targets `:96-110`; `LinkConvertedOrder:132`; `Confirm:139`
- `src/Tafseel.Domain/Governance/Governance.cs` — `TeacherReview:5-62`; `DisputeStatus` / `DisputeResolution:77-78`; `Dispute:80-186`
- `src/Tafseel.Domain/Marketplace/Marketplace.cs` — `TeacherProfile.Publish:43-49`; `TeacherService:134-228`; `TeachingSampleSourceType:230`; `ShowcaseModerationStatus:231-239`; `TeacherTeachingSample:243-541`
- `src/Tafseel.Domain/TeacherApplications/TeacherApplication.cs` — `TeacherApplicationStatus:5`; `EvaluationCriterion:9-20`; `Decide:105-140`; `TeacherSubjectQualification:262-330`

### Application

- `Authorization/Authorization.cs:1-77` — roles and per-role permission sets
- `Catalog/CatalogContracts.cs:6-61` — `ServiceCatalogPolicyValidator`; `EnsureAcceptedTerms:46-61`
- `Finance/FinanceContracts.cs:114-137` — `PaymentOptions`, `MockPaymentOptions`
- `Orders/OpenMarketplaceContracts.cs:57-61` — `OfferReservationMinutes`
- `TeacherApplications/TeacherApplicationContracts.cs:90-116` — `TeacherOnboardingStatus`, `TeacherOnboardingStatusDto`

### Infrastructure

- `Orders/OrderService.cs` — `CreateRequestAsync:28-59`; attachment ownership `:86-115`; `AcceptAsync:159-227`; `CancelRequestAsync:229-247`; `GetTimelineAsync:272-340`; `CompleteAsync:405-421`; `CancelOrderAsync:423-431`
- `Orders/OpenMarketplaceService.cs` — `PublishAsync:21-38`; `SubmitOfferAsync:109-134`; `SelectOfferAsync:188-220`; `EligibleRequests:245-268`; `OpenMarketplaceReservationExpiryService:340-396`
- `Finance/FinancialService.cs` — `InitiateOrderPaymentAsync:24-55`; `InitiateOpenRequestPaymentAsync:94-135`; `ProcessWebhookAsync:136-235`; marketplace Order creation `:205-231` (**`service.Revisions` at `:217`**); `ReleaseOrderEscrowAsync:275-296` (**`:284`**); `ReleaseLiveSessionEscrowAsync:298-325` (**coupon comment at `:310`**); `SettleDisputeAsync:369-390`; `RequestWithdrawalAsync:400-435`; `RefundReleasedOrderCoreAsync:706-745`; `ReconcileAsync:604-640`
- `Finance/MockPaymentProvider.cs:35-56` — HMAC verification
- `Finance/CouponService.cs:64-79` — discount application
- `LiveSessions/LiveSessionService.cs` — `GetAvailabilitySummariesAsync:68-…`; `BookAsync:321-367` (**emergency at `:343`**); `RequireBookableServiceAsync:635-679`
- `LiveSessions/LiveSessionSettlementWorker.cs:35-80`
- `Orders/OrderAutoReleaseWorker.cs:38-77`
- `Governance/GovernanceService.cs` — `CreateReviewAsync:35-66`; `CreateLiveSessionReviewAsync:68-95`; `OpenDisputeAsync:251-333` (**order gate at `:274-283`**); `GetEligibleDisputeTargetsAsync:336-422`; `ResolveDisputeAsync`; `SetSuspensionAsync:720-738`; `GetRequestsAsync:828-853`; `GetSessionsAsync:855-877`
- `Governance/DisputeSlaWorker.cs:34-72`
- `Marketplace/TeacherPublicQueries.cs:15-35` (**`%UAT%` / `%Sprint%` at `:19-22`**); `VisibleSamples:43-58`
- `Marketplace/MarketplaceService.cs` — `SetProfilePublishedAsync:417-456`; `ShowcasesEnabled:1624-1625`
- `TeacherApplications/TeacherApplicationService.cs` — `GetOnboardingStatusAsync:613-700`
- `Messaging/MessagingService.cs` — `CreateAsync:35-64`; `ValidateScopeAsync:256-280`
- `Persistence/TafseelDbContext.cs:20-75` — full DbSet inventory; check constraints at `:633` and `:714`
- `DependencyInjection.cs:309` (the sole `IPaymentProvider` registration); `:411-426` (payment configuration validation)

### API

- `Controllers/OrdersController.cs:14-306` — three controllers in one file: `learning-requests`, `open-marketplace`, `orders`
- `Controllers/PaymentsController.cs:15-131` — three payment-initiation targets, two webhook routes, refund, withdrawals
- `Controllers/GovernanceController.cs:16-131` — reviews and disputes
- `Controllers/LiveSessionsController.cs:16-119`
- `Controllers/AdminController.cs:15-71` — `operations/requests:47`; `operations/sessions:52`
- `Controllers/MarketplaceController.cs:15-329`
- `Controllers/TeacherApplicationsController.cs:17-147`

### Frontend

- `js/tafseel.js` — request rows and the `sourcingMode` fork `:1402-1447`; `requestStatusLabel:2030-2039` (**covers values 0–4 only**); `orderStatusLabel:2046` (marked deprecated in-source); `orderPresentation:2074-2122` (**synthesised `payment_confirmed` at `:2113-2119`**); `statusTone:2131-2143`; `orderProgressSteps:2170-2200`
- `js/open-marketplace.js` — offer scope render `:297`; offer edit prefill `:357`; offer payload `:379`; payment `:212`; publish `:808`
- `Tafseel-Payment.dc.html` — coupon input `:120`; `pay()` `:374-400` (**coupon posted to `/payments/orders/{id}` at `:383-385`**)
- `Tafseel-Teacher-Dashboard.dc.html` — four-queue nav `:2255`; opportunities load `:1439`
- `Tafseel-Student-Dashboard.dc.html` — unified request/order list `:1920-1935`
- `Tafseel-Landing.dc.html` — hardcoded bilingual status strings `:989-1002`

### Configuration

- `src/Tafseel.Api/appsettings.json` — `Fees:26-29`; `LiveSessions:30-37`; `OpenMarketplace:38-40`; `Withdrawals:41-45`; `Payments:46-56`; `Disputes:57-61`; `Ai.Enabled=false:81`; `TeacherShowcases.Enabled=false:90`
- `src/Tafseel.Api/appsettings.Production.json` — `REPLACE_WITH_REGISTERED_REAL_PROVIDER` for both Payments and LiveSessions

### Tests examined

- `tests/Tafseel.Domain.Tests/OrderTests.cs:68,133` — the only `OrderDeliveryState` reads anywhere in the codebase
- `tests/Tafseel.IntegrationTests/Phase7FinancialTests.cs` — **no coupon coverage**; `grep -ril coupon tests/` returns only `CouponTests.cs`, `PromotionTests.cs` and `PromotionsTests.cs`
- `tests/Tafseel.IntegrationTests/OpenMarketplaceTests.cs`, `Phase5OrderTests.cs`, `Phase6LiveSessionTests.cs`, `Phase9GovernanceTests.cs` — lifecycle coverage exists for the happy path of each flow **separately**; no test asserts that the two async paths produce equivalent Orders

### Existing project documentation cross-checked

- `PRODUCT.md` — states the intended model; consistent with the spine, silent on the Order/Session duplication
- `docs/business-ambiguities.md` — items 2 (two fee numbers), 7 (session booking path), 10 (auto-completion window) and 11 (Admin versus QualityReviewer) were open questions that the implementation answered without recorded sign-off
