# Tafseel Domain Model

This document records the implemented domain. It does not propose new entities or transitions.

## Teacher Qualification Lifecycle

```text
Confirmed email
→ Draft application
→ Qualification assignment and official resources
→ Immutable demo submission version
→ Submitted
→ UnderReview
→ Approved | ChangesRequested | Rejected
→ Active subject qualification
→ Auto-generated teaching sample
→ Qualified-subject services
→ Publishable profile
```

Assignment content and resource manifests are snapshotted with submissions. Re-uploads create new versions. Verified Teacher is derived from active qualifications. Revocation deactivates related services and publication.

## Marketplace

Teacher profiles aggregate qualified subjects/topics, teaching languages, education levels, services, samples, availability, credentials and favorites. Public search returns only published/eligible profiles and supports deterministic filters and sorts. Service creation is restricted to active subject qualifications.

## Orders

Learning requests move between `PendingTeacherReview` and `ClarificationRequested`, then to `Accepted`, `Declined` or `Cancelled`. Accepted requests create one order with snapshotted financial and delivery terms.

Orders move through `AwaitingPayment`, `InProgress`, `Delivered`, `RevisionRequested`, `Completed` and allowed cancellation/refund paths. Status histories persist actor and timestamp. Deliveries and revision records are additive; existing deliveries are not overwritten.

## Sessions

Teachers define recurring weekly availability and exceptions in a timezone. Slots are presented from that schedule and stored as UTC bookings. Bookings move through awaiting payment, confirmation, rescheduling and terminal completion/cancellation/no-show states. Transactional conflict checks prevent overlapping bookings.

## Payments

Payments target either an order or a live session. Attempts, provider callbacks, refunds and withdrawals are persisted. Callback identity is unique and verified server-side. Ledger and hold entries record financial movements using decimal money. Automatic release is disabled pending approved policy.

## Messaging

Conversations have authorized participants. Messages and attachments are persisted and ordered before SignalR delivery. Participant ownership controls reads, sends, attachments and read markers.

## Notifications

Notifications are persisted per user with type, timestamp, read state, safe link, preferences and a deduplication key. Optional email delivery is tracked through the notification outbox.

## Reviews

Students can review eligible completed teacher work. Public visibility is moderated. Persisted visible reviews drive the teacher rating aggregate.

## Disputes

Disputes reference eligible orders and contain evidence/messages. Authorized governance actions review and resolve them. Financial resolution uses the existing refund/completion and audit paths rather than a parallel order lifecycle.
