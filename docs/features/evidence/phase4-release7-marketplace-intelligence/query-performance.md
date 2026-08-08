# Query performance

Range is server-validated to at most 366 days. All event/business counts and Subject+Service groups execute in SQL; result groups are capped at 200 rows and no raw events are returned. Paid and completed grouping use separate SQL queries to avoid nested aggregates. Query count is fixed, not per Subject/Service. Indexes cover client idempotency, event/time, and Subject+Service/time. No Redis/cache added.
