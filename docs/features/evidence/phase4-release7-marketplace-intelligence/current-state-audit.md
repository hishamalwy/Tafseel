# Current-state audit

Audited before design: `LearningRequest` and history, `Order` and history, `Payment`/attempt/webhook, `OrderDelivery`, `TeacherReview`, `LiveSessionBooking`, `AuditLogEntry`, notification outbox, Admin reports, public Browse/Profile/Compare/Request, authorization, rate limiting, and EF mappings. Existing audit/outbox records are operational and cannot safely represent anonymous idempotent discovery interactions. Classification: missing product capability, not a production bug.
