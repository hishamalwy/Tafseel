# Phase 5 — Learning Requests and Orders Report

Date: 2026-07-26  
Status: Passed

## Implemented

- Student learning requests targeting one active approved Teacher Service.
- Private request attachments and participant-authorized downloads.
- Request status history and scoped clarification messages.
- Teacher clarification, decline, and transactional acceptance actions.
- Exactly-one Order creation with idempotent concurrent acceptance.
- Separate request, order workflow, payment, and delivery/revision states.
- Immutable accepted financial snapshot.
- Teacher start/delivery and Student revision/completion actions.
- Pre-payment cancellation rules.
- Paginated Student and Teacher request/order dashboard APIs.

## Confirmed financial decision

The two visible fee values remain independent:

- Student fee: configurable `Fees:StudentFeePercent`, currently 8%.
- Teacher commission: configurable `Fees:TeacherCommissionPercent`, currently 15%.

Acceptance snapshots both percentages and their calculated amounts. The Student total and Teacher net are stored and protected by database formula checks. Phase 5 records no payment or ledger movement; Phase 7 owns that behavior.

## State separation

- `LearningRequestStatus`: PendingTeacherReview, ClarificationRequested, Accepted, Declined, Cancelled.
- `OrderStatus`: AwaitingPayment, InProgress, Delivered, RevisionRequested, Completed, Cancelled.
- `OrderPaymentStatus`: Pending, Paid, Failed, Refunded.
- `OrderDeliveryState`: None, Delivered, RevisionRequested, Accepted.

Every request and order workflow transition is performed by a named domain method and appends history. Payment confirmation is deliberately not exposed through an API in this phase.

## Security and authorization

- Only Students create requests.
- Service ownership, current active catalog state, approved Subject qualification, and published teacher profile are checked server-side.
- Teacher mutations query by both request/order ID and assigned Teacher ID.
- Student mutations query by both resource ID and owning Student ID.
- Cross-user access returns not-found.
- Attachment and delivery content is private to the two participants.
- The Student dashboard omits Teacher commission and Teacher net fields; the Teacher dashboard receives them.
- Storage keys never enter API DTOs.
- Mutations require SQL rowversion through `If-Match`.

## Database

Migration: `Phase5LearningRequestsAndOrders`

The schema adds learning requests, attachments, clarifications, request history, orders, order history, deliveries, and revision requests. It includes:

- Unique `Order.LearningRequestId`.
- Request and Order rowversions.
- Role/dashboard query indexes.
- Supported enum and transition checks.
- Precise decimal types.
- Fee, total/net, revision, file-size, and currency constraints.
- Restrictive historical foreign keys.

## API groups

- `/api/v1/learning-requests`
- `/api/v1/learning-requests/mine`
- `/api/v1/learning-requests/assigned`
- Request attachment, clarification, accept, decline, and cancellation actions.
- `/api/v1/orders/mine`
- `/api/v1/orders/assigned`
- Order start, delivery, revision, completion, cancellation, and private delivery download actions.

## Verification

- Release build: passed, zero warnings.
- Phase 5 tests: 5 Domain plus 4 SQL Server integration scenarios.
- Full regression suite: 94 passed, 0 failed, 0 skipped.

## Deferred by phase boundary

- Payment confirmation API, provider callbacks, escrow, ledger, refunds, and withdrawals are Phase 7.
- Disputes are Phase 9.
- Local private storage is development infrastructure; cloud object storage and malware scanning remain production dependencies.

PHASE 5 PASSED — CONTINUING TO PHASE 6
