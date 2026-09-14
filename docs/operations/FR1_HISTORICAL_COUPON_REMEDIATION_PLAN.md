# FR-1 — Historical Coupon Release Remediation Plan

**Status:** Detection shipped. **No automatic correction is implemented, and none should be run without sign-off.**
**Date:** 2026-08-19
**Applies to:** Orders whose payment carried a coupon and whose escrow was released before the FR-1 fix.

---

## 1. What went wrong

Before the fix, `FinancialService.ReleaseOrderEscrowAsync` debited `EscrowHeld` by

```
order.TeacherNet + order.StudentFeeAmount + order.TeacherCommissionAmount   ==   order.StudentTotal
```

which are the Order's **pre-coupon commercial terms**. The amount actually captured into escrow is
`payment.Amount`, which equals `order.StudentTotal − couponDiscount`.

For any coupon-discounted Order that reached escrow release, the ledger therefore moved
`couponDiscount` more out of `EscrowHeld` than that payment ever put in. The excess was credited to
`PlatformRevenue` (the teacher always received exactly `TeacherNet`), inflating platform revenue and
drawing the difference from escrow funded by other students' payments.

Live sessions were never affected: `ReleaseLiveSessionEscrowAsync` already allocated against
`payment.Amount`.

## 2. Current local exposure

Checked on 2026-08-19 against every persistent local database
(`TafseelMarketplaceEvidence`, `TafseelRelease7Browser`, `TafseelRelease9BrowserCert`,
`TafseelRelease9PublishSmoke`):

| Database | Payments | Confirmed | Coupon redemptions | Escrow entries | Ledger entries |
|---|---|---|---|---|---|
| all four | 0 | 0 | 0 | 0 | 0 |

**There is no historical financial data in this environment, so there is nothing to remediate here.**
Remaining `TafseelTestApi_*` databases are transient integration-test artefacts.

This plan exists for the first environment that *does* hold real captures — staging or production.

## 3. How to measure the real exposure

Read-only, safe to run at any time, on any environment:

```
GET /api/v1/admin/finance/reconciliation/coupons?limit=500
```

Returns one row per coupon-discounted payment with: `confirmedAmount`, `couponDiscount`,
`expectedTeacherAllocation`, `expectedPlatformAllocation`, `escrowHeld`, `escrowReleased`,
`escrowRefunded`, `actualTeacherCredit`, `actualPlatformCredit`, `difference`, `status`.

`status` is one of:

| Status | Meaning | Action |
|---|---|---|
| `Balanced` | Teacher + platform release equals the confirmed capture | None |
| `OverReleased` | More left escrow than entered it — the FR-1 signature | §4 |
| `UnderReleased` | Less left escrow than the capture | Investigate; usually a partial refund |
| `MissingEscrow` | Confirmed payment with no `Held` entry | Investigate before anything else |
| `DuplicateMovement` | More than one escrow entry of the same type | Investigate; suspected replay |
| `NeedsManualReview` | Allocation differs from expectation without over-releasing | Case by case |

The whole-ledger view is `GET /api/v1/admin/finance/reconciliation`, surfaced read-only on the
Admin Dashboard under **Finance → Payments**.

Rows are derived from `Payments`, `EscrowEntries` and `LedgerEntries` only. Current `Order` fields are
used solely to compute the *expected* allocation; they are never treated as evidence of money moved.

## 4. Remediation options for `OverReleased` rows

**Do not modify or delete any existing `LedgerEntry`, `EscrowEntry`, `Payment` or `Refund` row.**
The ledger is append-only and is the audit record; rewriting it destroys the evidence that the
discrepancy existed.

Two acceptable approaches, both requiring explicit business sign-off:

### Option A — Accept and document (recommended when exposure is small)

The over-release moved `couponDiscount` from escrow into `PlatformRevenue`. Because the platform is
the party that both funded the coupon and received the excess, the net economic loss to the platform
is zero and no student or teacher was underpaid. Record the total in the finance log and take no
ledger action.

Verify before choosing this: every affected row must show `actualTeacherCredit == expectedTeacherAllocation`.
If any teacher was over-credited, Option A does not apply.

### Option B — Post a correcting entry (required if escrow is genuinely short)

Post a **new, forward-dated** compensating `LedgerEntry` per affected payment:

```
debit  PlatformRevenue
credit EscrowHeld
amount couponDiscount
businessKey  order:{orderId}:fr1-correction
referenceType "Order", referenceId {orderId}
```

Requirements:

- One entry per affected Order, keyed by the unique `BusinessKey` above so a re-run cannot double-post.
- Accompanied by a `FinancialAuditRecord` naming the approving human.
- Executed inside a Serializable transaction with the standard application lock.
- Followed by a re-run of the coupon report; every corrected row must move to `Balanced`.

Option B needs a small, purpose-built admin operation. It is deliberately **not** implemented in this
change: an unaudited "fix balance" button is exactly what financial-controls review forbids.

## 5. Preconditions before any correction

1. A full database backup, retained.
2. The coupon report captured and archived **before** any change.
3. Written approval recording which option was chosen and why.
4. Re-run of both reconciliation endpoints afterwards, archived alongside the before-state.

## 6. Recurrence prevention (already shipped)

- `FinancialService.AllocateCapture` is the single allocation rule for Orders and live sessions, on
  both release and reversal. It allocates the confirmed capture and cannot exceed it.
- `FinancialSafetyTests.Order_escrow_release_allocates_exactly_the_confirmed_capture` covers no
  coupon, a coupon below the platform margin, a coupon equal to it, a coupon above it, and an extreme
  discount — asserting `teacher + platform == capture` in every case.
- `ReconciliationDto.AllocationMismatches` and `OverReleasedPayments` fail loudly if the invariant is
  ever broken again, and both are visible on the Admin Dashboard.
