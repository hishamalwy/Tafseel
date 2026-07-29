# F-005 Revision-to-Delivery Linkage Investigation

Date: 2026-07-29  
Status: Investigation complete; no implementation  
Classification: **Missing Relationship**  
Final verdict: **REQUIRES SCHEMA CHANGE**

## Findings

### Persisted model

| Record | Persisted identifiers | Foreign keys and navigation | Invariants and uniqueness |
|---|---|---|---|
| `OrderDelivery` | `Id`, `OrderId`, private file metadata, message, `CreatedAt` | FK `OrderId -> Orders.Id`; contained in `Order.Deliveries` | `Id` primary key; positive file size; rows are appended through `Order.Deliver`; no delivery sequence/version column and no revision navigation |
| `RevisionRequest` | `Id`, `OrderId`, reason, `Sequence`, `CreatedAt` | FK `OrderId -> Orders.Id`; contained in `Order.Revisions` | `Id` primary key; unique `(OrderId, Sequence)`; sequence must be positive; no `DeliveryId`, actor, completion state or delivery navigation |
| `Order` | `Id`, participant IDs, `RevisionAllowance`, `RevisionsUsed`, status, delivery state, row version | Owns delivery and revision collections independently | Allowance is 0–20; `RevisionsUsed <= RevisionAllowance`; row-version concurrency; state transition guards |
| `Dispute` | `Id`, `OrderId`, participants, status and timestamps | FK to Order; independent evidence collection | One dispute per Order in the service workflow; neither dispute nor evidence references an `OrderDelivery` |

The database migration and current EF mapping create two independent one-to-many relationships:

```text
Order 1 ── * OrderDelivery
Order 1 ── * RevisionRequest
```

There is no relationship between `RevisionRequest` and `OrderDelivery`.

### Workflow evidence

The domain workflow is serialized:

1. `Order.Deliver` is allowed only from `InProgress` or `RevisionRequested`, appends an immutable delivery row, and sets the Order to `Delivered`.
2. `Order.RequestRevision` is allowed only from `Delivered`, increments the Order-level sequence, appends a revision row, and sets the Order to `RevisionRequested`.
3. A subsequent `Order.Deliver` appends another delivery and returns the Order to `Delivered`.
4. Student completion is allowed only from `Delivered` and accepts the Order as a whole.

`If-Match` uses the Order row version, so concurrent writes cannot safely create two successful transitions from the same version. This protects the state machine, but it does not persist which delivery a revision targets or which later delivery resolves it.

The Order DTO exposes a delivery collection and only Order-level `RevisionsUsed`. There is no Revision DTO or API contract containing a delivery reference. The timeline independently queries deliveries and revisions by `OrderId`, orders them by timestamp/source priority/stable ID, and exposes no link between the events.

### Required questions

1. **Can one `RevisionRequest` identify one specific Delivery?**  
   No. It has `OrderId` but no `DeliveryId`, delivery navigation, delivery version or other referential key.

2. **Can multiple revisions target the same delivery?**  
   The public/domain workflow rejects consecutive revision requests because the first changes the Order from `Delivered` to `RevisionRequested`. However, the persisted model cannot express or query “target the same delivery,” so this relationship cannot be proven from revision rows.

3. **Can a revision target the latest delivery only?**  
   The workflow allows a revision only while the Order is `Delivered`, which follows a successful delivery. It does not store the identity of that latest delivery. “Latest” is therefore a runtime/state-machine implication, not a persisted invariant.

4. **Can a delivery produce multiple revisions?**  
   Not through the serialized domain workflow without an intervening new delivery. At the data-model level, a delivery cannot be said to produce even one revision because no relationship exists.

5. **Can two deliveries exist before the first revision is completed?**  
   Revision completion is not modeled. After the first revision request, the teacher can upload a second delivery; two delivery rows then exist and the Order returns to `Delivered`, but no record marks the revision completed or identifies the second delivery as its response.

6. **Can the timeline currently prove which delivery caused which revision?**  
   No. It emits independent `delivery_uploaded` and `revision_requested` events. Timestamp ordering is presentation ordering, not referential evidence, and equal timestamps are explicitly resolved by source priority rather than a relationship.

7. **Can disputes identify the exact submitted artifact?**  
   No. A dispute references only the Order. `DisputeEvidence` is a separate uploaded artifact and has no `OrderDeliveryId`. Participants can open a delivery by its own ID, but the dispute record does not identify one.

8. **Can Quality review reconstruct the revision chain?**  
   No. `QualityReviewer` has teacher-application/report permissions only, is not an Order participant, and is rejected by the owned timeline. No Quality contract exposes revision rows, and the rows themselves lack delivery linkage.

9. **Is rollback possible without ambiguity?**  
   No rollback operation exists in the Order domain or Orders API. Selecting a prior artifact for a hypothetical rollback would also be ambiguous because revisions do not reference delivery IDs.

10. **Can analytics measure revisions per delivery?**  
    No. It can count revisions per Order using `Sequence`/`RevisionsUsed`, but cannot group revisions by delivery without inventing a temporal association.

## Root Cause

Revision sequencing was modeled only at Order level. Deliveries and revisions received independent Order foreign keys, while the target delivery identity and revision-resolution identity were never persisted.

## Candidate Relationship and Impacts

This section records impact only; it is not an implementation recommendation.

- **Exact missing relationship:** the immutable `OrderDelivery` targeted by each `RevisionRequest`.
- **Candidate FK:** `RevisionRequest.DeliveryId -> OrderDeliveries.Id`.
- **Candidate invariant:** the target delivery belongs to the same `OrderId`; a revision target is required for new records; preserving current workflow would allow at most one revision request for a given delivery.
- **Migration impact:** a new column, index and restricted FK would be required. Enforcing same-Order and at-most-one semantics at database level may require additional composite/unique constraints. No migration was generated in this pass.
- **Backward compatibility impact:** current request and response contracts do not carry a delivery ID. Existing clients would need a compatibility decision about whether the server binds the current delivery or callers submit an explicit target. That decision is outside this investigation.
- **Existing data impact:** repository evidence provides no canonical deterministic backfill. `CreatedAt` can collide, delivery IDs are random GUIDs, and no persisted sequence links the two collections. Existing rows therefore need an explicit legacy-data policy before a non-null constraint can be proven safe.
- **Timeline impact:** a future contract could expose the persisted target link without changing the lifecycle event set. The current timeline must continue showing independent events until such evidence exists.
- **Dispute impact:** the candidate revision FK alone would identify the revision target, but current disputes would still not identify a submitted Order artifact unless dispute linkage is separately defined.
- **Quality impact:** a stored relationship would make a chain query possible, but Quality authorization and an appropriate safe contract do not exist today.
- **Analytics impact:** explicit target linkage would permit revisions-per-delivery measurement. Identifying the later delivery that resolves a revision would still require a separate persisted relationship or approved invariant.

## Fix

No code, schema, API, delivery, revision, lifecycle or timeline behavior was changed. The investigation stops before schema design or implementation as required.

## Validation

| Check | Result |
|---|---|
| Release build | Passed; 0 warnings, 0 errors |
| `Phase5OrderTests` | Passed 4/4, including delivery/revision/completion and owned timeline |
| Held-escrow dispute integration test | Passed 1/1 |
| Refund timeline integration test | Passed 1/1 |
| `git diff --check` | Passed for the final investigation diff |
| Migration inspection | No migration generated or applied |

## Files Changed

- `docs/audits/F005_REVISION_DELIVERY_LINKAGE_INVESTIGATION.md`
- `docs/INDEX.md`
- `docs/PROJECT_STATUS.md`

Pre-existing concurrent changes in `Tafseel-Teacher-Apply.dc.html` and `js/teacher-apply.js` were not modified by this pass.

## Risks

- Treating timestamp order as a link would silently misassociate rows when timestamps collide or data is imported.
- Adding a non-null FK without a legacy-row policy could make existing data impossible to migrate safely.
- A target-delivery FK does not by itself identify which later delivery resolves the revision.
- Dispute and Quality access rules must remain separate from Order participant access.

## Next Step

Hold a decision-only pass for legacy revision rows, client binding of the target delivery, and whether a separate revision-response delivery relationship is required. Do not generate a migration until those decisions are explicit.
