# ADR-015: Refund and Payout Provider Boundaries

Date: 2026-09-14  
Status: Accepted as a product decision; implementation deferred until a real payment provider is integrated

## Context

`IPaymentProvider` (`src/Tafseel.Application/Finance/FinanceContracts.cs`) exposes `Name`, `InitiateAsync` and `VerifyWebhook`. Money moves out of the platform in two ways today, and neither reaches an external provider:

- `FinancialService.RefundAsync` writes the refund, escrow and ledger records but never asks a provider to return money to the payer.
- `FinancialService.ProcessWithdrawalAsync` moves a teacher withdrawal to completion using a provider reference an admin types in by hand.

The 2026-09-14 baseline (`docs/audits/baseline-2026-09-14/REMEDIATION_MATRIX.md`, J5-05 and H-3 of the 2026-09-13 audit) blocked real payment-provider integration until this was decided, because the answer can change the provider interface.

## Decision

1. **Refunds go through a payment-provider adapter.** The provider that captured a payment is asked to refund it. The ledger stays the accounting authority: the provider confirms that external money moved, and it never decides amounts, eligibility or allocation.
2. **Payouts go through a dedicated payout-provider abstraction**, separate from `IPaymentProvider`. Collecting money from students and disbursing it to teachers are different capabilities, often served by different providers and with different compliance requirements.
3. **Manual operation remains only as an explicit, audited fallback**, for example when a provider is unavailable or a destination cannot be paid automatically. Choosing the manual path must be a recorded operator action with a reason, never the default route.

## Consequences

- Real refunds need an adapter method or companion interface on the payment side, a provider refund reference, and a way to reconcile provider refund events (webhook or polling) with the existing idempotent refund records.
- Real payouts need a new abstraction, a provider payout reference, and provider status reconciliation for `WithdrawalRequest`.
- The existing idempotency keys, `Serializable` transactions with application locks, escrow allocation, earnings maturity and reconciliation remain the protected core. Provider adapters sit behind them and cannot bypass them.
- Until the adapters exist, the current ledger-only refund and manually referenced withdrawal continue to operate as the fallback path.

## Not decided here

The concrete interface shapes, the choice of providers, refund and payout webhook handling, retry and failure states, and the audit record for choosing the manual fallback. They are designed with the provider integration, after the Angular product surfaces for refunds and withdrawals exist (matrix J12-02 to J12-04, J14-04).

## Rejected alternatives

- **Keep refunds and payouts manual permanently:** it does not scale, and the platform would misstate refunds that were recorded but never paid.
- **One provider interface for collection and disbursement:** it couples unrelated capabilities and forces one provider to do both.
- **Let the provider be the accounting authority:** it would move allocation and idempotency out of the tested ledger.
