# Ledger and Reconciliation

Each append-only `LedgerEntry` is one atomic balanced transfer: one debit account, one credit account, one positive amount, one currency, and one globally unique business key.

Implemented accounts:

- Provider clearing
- Escrow held
- Teacher pending
- Teacher available
- Platform revenue
- Refund clearing
- Withdrawal clearing

Capture transfers Provider Clearing to Escrow Held. Completion transfers Escrow Held to Teacher Available and Platform Revenue. Refund transfers held escrow to Refund Clearing. Withdrawal reservation transfers Teacher Available to Withdrawal Clearing; completion transfers it to Provider Clearing, while rejection returns it to Teacher Available.

Teacher balances are derived from credits minus debits. No mutable balance column exists. The reconciliation API reports captured payments, held/released/refunded escrow, Teacher available and pending balances, platform revenue, and confirmed payments missing an escrow hold.
