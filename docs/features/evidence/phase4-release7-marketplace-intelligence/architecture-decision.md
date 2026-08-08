# Architecture decision

Chosen: hybrid first-party intelligence. Durable lifecycle metrics are queried from canonical records. Only six non-transactional interactions use one append-only `MarketplaceInteractionEvents` table. One aggregate Admin endpoint returns no raw rows. No warehouse, event sourcing, queue, cache, scoring, AI, ranking, or analytics SDK was introduced.
