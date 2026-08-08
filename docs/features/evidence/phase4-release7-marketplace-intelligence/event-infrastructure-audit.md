# Event infrastructure audit

`AuditLogEntry` requires an actor and stores operational summaries; payment/webhook histories are provider/business records; notification outbox is delivery infrastructure. None has the privacy, allowlist, anonymous-session, or client-idempotency contract needed for discovery. They remain unchanged.
