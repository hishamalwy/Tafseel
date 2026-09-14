# Open Request Marketplace

Implemented 2026-08-11 as an additive sourcing mode on the canonical `LearningRequest` domain. It does not create a parallel request or fulfillment model: successful payment converts the selected Offer into the existing `Order` aggregate and the existing delivery, revision, approval, review, messaging, escrow, ledger, refund, and notification flows continue from there.

## Product contract

- A Student publishes an asynchronous request against a required canonical Subject and async catalog Service. Budget is optional; when supplied it is a validated minimum/maximum range.
- Only active Teachers with a published profile, an approved non-revoked qualification for the exact Subject, and a matching active non-superseded async Teacher Service can discover the request or download its private attachments.
- Offers are private. A Teacher sees only their own Offer; a Student sees all Offers for their own request.
- A submitted Offer contains server-validated Price, Delivery hours, and a Proposal. It can be updated or withdrawn while the request is open.
- Selecting an Offer locks its commercial terms and starts an exact two-hour payment reservation. Work is not authorized by selection.
- Expiry or explicit cancellation reopens the request and selected Offer. Confirmed payment atomically creates one paid canonical Order, accepts the winner, and marks the other Offers `NotSelected`.

## States

`LearningRequest`: `OpenForOffers` → `AwaitingPayment` → `ConvertedToOrder`; cancellation and deadline expiry remain terminal paths. Reservation cancellation/expiry returns `AwaitingPayment` to `OpenForOffers`.

`TeacherOffer`: `Submitted` → `Selected` → `Accepted`; alternate paths are `Withdrawn`, `NotSelected`, and `Expired`. Selected terms cannot be edited or withdrawn.

## Security and consistency

- Authorization and Subject eligibility are derived server-side on list, detail, selection, and every attachment download.
- Attachment responses use no-store, nosniff, and same-origin resource headers. Losing or no-longer-qualified Teachers lose access.
- Selection, cancellation, expiry, and payment conversion use serializable transactions plus SQL Server application locks and row-version preconditions.
- Payment amount, fee, selected Teacher Service, and Order snapshots are derived server-side. Request payment retries are idempotent; duplicate webhook events cannot create duplicate Orders.
- A minute background worker expires reservations, fails pending request payments, reopens the winning Offer, and queues notifications.

## Surfaces

The role-aware `/app/Tafseel-Open-Marketplace.dc.html` supports Student publishing, Offer review, profile round-trip, reservation countdown/payment, and Teacher opportunity/Offer management. Student and Teacher dashboards link to the feature, while converted work appears in the existing dashboard Order views.

The page is bilingual English/Arabic, LTR/RTL aware, responsive at desktop/tablet/mobile breakpoints, keyboard semantic, reduced-motion aware, and uses 44px primary interaction targets.

## Evidence

Automated and rendered evidence is recorded in [OPEN_REQUEST_MARKETPLACE_IMPLEMENTATION.md](../reports/OPEN_REQUEST_MARKETPLACE_IMPLEMENTATION.md) and [the evidence directory](./evidence/open-request-marketplace/README.md).
