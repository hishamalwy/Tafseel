# Event idempotency

Two POSTs with the same `clientEventId` both returned accepted best-effort semantics and persisted one row. A unique database index closes concurrent races. Browse/zero/Profile/service/request hooks additionally use a deterministic session dedupe key so rerenders, restored drafts, and repeated identical zero states do not create obvious duplicates.
