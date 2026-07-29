# Phase 7 Hardening Report

Date: 2026-07-26

## Hardening completed

- HMAC verification uses fixed-time comparison and verifies the exact raw bytes.
- Invalid callbacks write no webhook, payment, escrow, or ledger state.
- Callback deduplication and financial operations use serializable transactions and SQL application locks.
- Every movement has a unique business key and one debit/credit account pair.
- Escrow hold equals Student total; release equals Teacher net plus both platform fee components.
- Full refund has a Payment-level unique constraint in addition to idempotency.
- Withdrawal reservation moves funds out of available balance before provider processing.
- Concurrent withdrawal requests cannot create a negative available balance.
- Provider failure is isolated as an attempt and does not corrupt the Order.
- Financial audit records contain identifiers and correlation keys, never payloads or secrets.
- Auto-release cannot be enabled accidentally.

## Test evidence

- Invalid signature, amount mismatch rollback, failed-then-success provider events.
- Concurrent callback replay and exactly-one escrow hold.
- Concurrent order completion and exactly-one escrow release.
- Fee/commission reconciliation.
- Same-key refund replay and different-key rejection.
- Concurrent withdrawal balance protection and processing replay.
- SQL constraints, unique indexes, and rowversions.
- Full Release suite: 121 passed, 0 failed, 0 skipped.

## External/deferred dependencies

- No production payment or payout provider is configured.
- The mock stores no card data and supplies only a local checkout reference.
- Post-release dispute refunds are Phase 9 and must reuse ledger primitives.
- Partial refunds and coupons are intentionally unsupported.

PHASE 7 PASSED — CONTINUING TO PHASE 8
