# Tafseel state machines

Source of truth: `src/Tafseel.Domain`. This is the implementation map; when it and the domain disagree, the domain wins and this file is corrected.

| Entity | From | Allowed next state/action | Main guard |
|---|---|---|---|
| Direct learning request | `PendingTeacherReview` | `ClarificationRequested`, `Accepted`, `Declined`, `Cancelled` | Teacher for clarify/accept/decline; student for cancel; accept requires idempotency key |
| Direct learning request | `ClarificationRequested` | `PendingTeacherReview`, `Declined`, `Cancelled` | Student replies; teacher declines; student cancels |
| Open learning request | `OpenForOffers` | `AwaitingPayment`, `Cancelled`, `Expired` | Student selects/cancels; deadline expires it |
| Open learning request | `AwaitingPayment` | `OpenForOffers`, `ConvertedToOrder`, `Cancelled` | Reservation may be cancelled/expire; paid conversion requires selected offer and unexpired reservation |
| Order | `AwaitingPayment` + payment `Pending` | payment `Paid`, or order `Cancelled` | Canonical payment webhook; participant may cancel unpaid order |
| Order | `AwaitingPayment` + payment `Paid` | `InProgress` | Assigned teacher only |
| Order | `InProgress` | `Delivered`, `Completed` by dispute, `Cancelled` by refund | Teacher delivery requires at least one file |
| Order | `Delivered` | `RevisionRequested`, `Completed`, `Cancelled` by refund | Student revision within allowance or completion; system may auto-complete |
| Order | `RevisionRequested` | `Delivered`, `Completed` by dispute, `Cancelled` by refund | Teacher redelivery; dispute decision |
| Payment | `Pending` | `Confirmed`, `Failed` | Amount and currency must match; webhook/idempotency controls in financial service |
| Payment | `Confirmed` | `Refunded` | Refund idempotent; same-state confirm returns false |
| Live session | `AwaitingTeacherApproval` | `AwaitingPayment`, `Declined`, `Cancelled` | DEC-14: only the selected teacher accepts or declines; the student may cancel; acceptance re-checks availability; a past start cannot be accepted |
| Live session | `AwaitingPayment` | `Confirmed`, `Cancelled` | Paid booking or participant cancellation |
| Live session | `Confirmed` | `Cancelled`, `CompletionPending`, `StudentNoShowPending`, `TeacherNoShowPending`, admin terminal outcome | Completion only after end; no-show only after grace; participant checks |
| Live session | pending settlement | `Completed`, `StudentNoShow`, `TeacherNoShow` | Opposite participant confirms, system finalizes, or admin/dispute resolves |
| Live session | `AwaitingPayment` / `Confirmed` | same status with new schedule | One participant proposes valid future slot; the other accepts/rejects |
| Dispute | `Open` | `UnderReview` | Admin starts review; repeat start is harmless |
| Dispute | `UnderReview` | `Resolved` | Admin resolution, rationale and idempotency key required; replay must match |
| Teacher application | `Draft` | `Submitted` | Teacher submits required evidence |
| Teacher application | `Submitted` / `UnderReview` | `ChangesRequested`, `Approved`, `Rejected` | Quality review decision |
| Teacher application | `ChangesRequested` | `Submitted` | Teacher resubmits |
| Subject qualification | `Approved` | revoked | Quality Reviewer withdraws with a reason (10–2000 chars); audited; teacher notified; public intro consent withdrawn |
| Payout profile | `Pending` | `Verified`, `Rejected` | Finance/Admin, never the teacher themselves |
| Withdrawal | `Pending` | `TransferInitiated`, `Rejected` (amount returns to Available) | Finance/Admin, never the teacher themselves; at least 50 SAR from Available |
| Withdrawal | `TransferInitiated` | `Completed` (bank evidence required), cancelled (only with "no money was sent") | Finance/Admin |
| Help case | `Open` | `InProgress`, `Resolved` | Admin (`Support.Cases.Manage`), never on their own report |
| Open-request draft | draft (owned by the student) | published (files move to the new open request), discarded | Only the owning student; drafts are never visible to teachers |

Known limits: the payment simulator exposes success/failure only. Leaving checkout leaves a `Pending` payment; a distinct cancelled outcome is not implemented. There is no `Active` session state or provider attendance event: the app controls scheduled/confirmed, join eligibility, completion and no-show settlement, while the development link points to a mock room. These semantics must be verified against the selected production providers before launch.
