# Retention governance

| Data | Class | Policy |
|---|---|---|
| Canonical LearningRequest / Order / Payment / Delivery / Review / status history | **A** | Existing business-record retention/ops policy applies. R7 only reads these for aggregates. |
| `MarketplaceInteractionEvents` (allowlisted discovery signals, server UTC, ClientEventId, optional internal user id / anonymous session UUID, canonical FKs, resultCount, filter-presence booleans) | **B** | **Privacy/Governance Decision Required before Production.** Engineering does not invent a deletion duration. No silent TTL was added. |
| Admin aggregate DTOs | **A** | No PII/raw query/message/payment secret. Internal operational use only. |

Feature is not BLOCKED solely for missing legal duration under this gate. Production enablement still needs an explicit retention/deletion decision for Class B interaction rows. Event growth is bounded by unique ClientEventId, 366-day query cap, Take(200) dimension pages, and indexes on time+event and Subject+Service+time.
