# Security retention

- Outsider create/read/send/attachment/order GET → **404** (`order_not_owned` / conversation not found). No existence leak vs missing.
- SignalR `JoinConversation` outsider → HubException “Conversation was not found.”
- Message HTML escaped in widget (`esc()` / textContent).
- Filenames via `SafeName`; MIME+signature via `PrivateMediaRules`.
- System rows are timeline projections, not spoofable Message rows from clients.
- Sender is authenticated user id, not client-supplied.
