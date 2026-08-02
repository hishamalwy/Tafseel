# Marketplace Service Catalog — Release 1 Report

Date: 2026-08-01  
Status: Implemented locally; migration generated but not applied

## Scope

Release 1 extends the existing `ServiceCatalogItem`; it does not create a second catalog or change Teacher-facing create/update semantics. It adds finite category, icon, order-type, qualification and SAR policy fields; complete price, delivery, revision and live-duration policy; Admin governance; centralized validation; and immutable catalog identity snapshots on Requests, Orders and live bookings.

## Domain and persistence

- Existing `MinPrice` and `MaxPrice` remain the canonical minimum/maximum columns. `DefaultPrice` and `RecommendedPrice` are additive.
- `RequiresScheduling` remains stored for compatibility but is set from `OrderType` and asserted by domain and SQL constraints.
- Fixed codes are domain allowlists, not lookup tables. `IconCode` accepts identifiers only; raw SVG/HTML is not accepted.
- Code is immutable. Order type and qualification policy are immutable once a `TeacherService` reference exists.
- New transactions capture catalog item ID, code, category, order type, and bilingual names at their own creation boundary. Existing financial snapshots remain authoritative; Payment is unchanged.
- Snapshot catalog foreign keys are nullable only as a rollback/legacy direct-insert bridge. The migration backfills every resolvable historical row, and all application creation paths populate the snapshot before persistence.

## Validation boundary

`ServiceCatalogPolicyValidator` is the single reusable application boundary for Teacher offering terms, async Request/acceptance terms and live booking terms. Catalog structure is enforced by `ServiceCatalogItem` mutation methods and SQL Server constraints. Errors use stable domain codes and include permitted commercial bounds where relevant.

Release 1 wires validation into catalog create/update/activation, Teacher offering add/update, Request submission and acceptance, and live booking. It preserves legacy Teacher title/description behavior and response fields.

## Admin governance

The existing Admin catalog endpoints and modal now manage bilingual copy, code, category, safe icon, order type, qualification policy, SAR bounds, async delivery, revisions, live durations, active/public/selectable state and ordering. Existing `SubjectsManage` authorization is reused. No delete endpoint/action was added. Real `TeacherService` usage determines whether immutable policy controls are locked.

## Startup behavior

Normal application startup calls identity/catalog initialization only in Development. Staging, Production and Testing take the zero-invocation fast path in `IdentityInitialization.RunAsync`; Testing factories may explicitly provision deterministic test data. Explicit initialization inserts missing canonical rows and only fills empty legacy localization; it does not overwrite Admin-managed policy or copy.

## Compatibility bridges retained for Release 2

- Teacher Dashboard still exposes current Add/Edit Service UX.
- Teacher title/description input semantics and existing endpoints remain.
- No TeacherService uniqueness, superseded markers, duplicate repair or approach fields exist yet.
- Public consumers still use current DTO presentation; snapshot fields are additive verification data.
- Legacy `RequiresScheduling`, `Type` and selected code checks remain compatibility assertions.

## Security review

Admin mutations retain existing policy authorization. Domain allowlists and bounded strings prevent arbitrary workflow/category/policy/icon content. Decimal precision is `decimal(18,2)`; delivery/revision ranges are bounded; snapshots are one-shot; catalog rows cannot be physically deleted. SQL migration audits broken references and contradictory scheduling before adding constraints or foreign keys.

## Rollback

The application change can be rolled back while retaining additive columns. The generated Down migration removes Release 1 snapshot/policy columns and constraints, but Production rollback should prefer restoring the prior application and retaining additive data. No migration was applied in this worktree.

## Validation status

Domain, Application, Architecture, provider-neutral integration, full SQL Server integration, Admin frontend, localization and JavaScript checks pass. Debug build and EF pending-model checks pass. The browser matrix is recorded in the final handoff; browser-side mutations remain conditionally verified because applying the migration to the active Development database was explicitly out of scope.
