# Architecture re-audit

Re-read `MarketplaceIntelligenceService`, contracts, controllers, `MarketplaceInteractionEvent`, Admin Intelligence UI, and `Tafseel.analytics`.

- One append-only table. No second event store. No warehouse/queue/AI ranking.
- Ingestion allowlists event names and surfaces; rejects trusted transactional names; validates published teacher / active subject / public catalog / TeacherService context; unique `ClientEventId` (duplicate returns Accepted without a second row).
- Aggregates: transactional stages from LearningRequest, Order, Payment, OrderDelivery, OrderStatusHistory, TeacherReview. Interaction stages from events only.
- Admin GET is `MarketplaceIntelligence.View`. Student/Teacher/Quality 403 live.
- Client helper: session UUID, optional sessionStorage dedupe, best-effort POST, failures swallowed. No query text, email, metadata JSON, or trusted event names.
- F-002: no public Completed Orders / popularity / Best Match / conversion rate on Browse/Profile/Compare.
- Supply snapshot excludes pending/revoked/disabled/hidden via active Subject+catalog+unsuperseded TeacherService+Approved unrevoked qualification.
