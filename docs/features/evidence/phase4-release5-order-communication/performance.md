# Performance evidence

- Conversation pages clamp to 50; message pages clamp to 100 and expose Load older.
- Conversation list uses bounded participant rows, one latest-message query, and one persisted-unread aggregate query instead of including full histories.
- Order/request context walks bounded 50-row API pages only until the target is found.
- Message order is `(CreatedAt, Id)` and the UI applies the same deterministic tie-breaker.
- No cache was added for dynamic unread state.
