# Marketplace Service Catalog — Release 1 Migration

Migration: `20260801135831_MarketplaceServiceCatalogRelease1`  
Applied: No

## Schema

`ServiceCatalogItems` gains category, safe icon, order type, qualification policy, currency, default/recommended price, async delivery and revision policy. Existing `MinPrice`, `MaxPrice`, active/public/selectable/order/duration/scheduling fields are reused.

`LearningRequests`, `Orders` and `LiveSessionBookings` each gain `ServiceCatalogItemId`, catalog code, category, order type, and English/Arabic service-name snapshots plus a restrictive catalog foreign key. The catalog ID is nullable as a narrow compatibility bridge for rollback and legacy direct inserts; migration backfill and every application creation path populate it.

## Deterministic backfill

- `recorded_explanation` → `recorded_explanation` / `video`
- `assignment_guidance` → `academic_support` / `academic_support`
- `exam_revision` → `revision_exam_preparation` / `exam`
- `live_session` → `live_learning` / `live`
- `live_session` becomes `live_session`; all other existing rows become `async_request`.
- Qualification is `subject_qualification_required`; currency is `SAR`.
- Existing valid bounds are retained. Missing minimum/maximum become `0.01`/`1,000,000.00`; live minimum remains `30.00`; default/recommended become `120.00` clamped to the retained range.
- Async delivery is 1/48/48/8760 and revisions 2/20. Live delivery is null and revisions 0/0.
- Historical snapshots join retained `TeacherServiceId` to its catalog row; commercial snapshots are untouched.

The migration throws stable SQL audit errors before constraints when scheduling semantics conflict, a live duration is absent, or a Request/Order/booking relationship cannot resolve. It does not guess broken relationships and does not update `TeacherServices`.

## Constraints and safety

SQL Server checks enforce finite policy codes, SAR, price ordering, order-type/scheduling parity, delivery ordering, revisions and live durations. Foreign keys use `Restrict`. SQLite provider-neutral tests rely on Domain validation because SQLite decimal comparison semantics do not safely represent the SQL Server money checks.

## Verification commands

```powershell
dotnet ef migrations has-pending-model-changes --project src/Tafseel.Infrastructure --startup-project src/Tafseel.Api --no-build
dotnet ef migrations script --idempotent --project src/Tafseel.Infrastructure --startup-project src/Tafseel.Api --output artifacts/marketplace-service-catalog-release1.sql
```

Review the script and run it against a disposable Production-like backup before deployment. This task generated the migration and script evidence only; it did not apply either.
