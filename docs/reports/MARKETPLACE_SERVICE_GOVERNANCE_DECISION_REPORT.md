# Marketplace Service Governance Decision Report

Date: 2026-08-01

Phase: 3.1

Status: Decision complete; ready for implementation

## Outcome

Tafseel retains its existing two-level model: `ServiceCatalogItem` is the marketplace-owned canonical service and `TeacherService` is one Teacher's configuration for one qualified subject. The policy closes every implementation-blocking ambiguity from Phase 3. No runtime code, entity, API, UI, migration, or mock data changed in this pass.

The normative policy is [ADR-005: Marketplace Service Governance](../decisions/ADR-005-MARKETPLACE-SERVICE-GOVERNANCE.md).

## Evidence Summary

- Catalog already owns stable code, bilingual copy, activation, visibility, scheduling metadata, price bounds, and ordering.
- Teacher offerings reference catalog and qualification but still own arbitrary title and required description.
- Ordinary offering/request paths do not consistently enforce catalog price bounds; live booking does.
- Orders snapshot price, currency, fees, delivery, and revisions; bookings snapshot times and price terms.
- Requests, Orders, and bookings do not snapshot canonical catalog identity, category, order type, or bilingual names.
- Existing Teacher-level scheduling is sufficient; a second calendar is unjustified.
- Current startup may insert canonical services outside Development, contrary to the approved read-only Staging/Production target.

## Approved Finite Codes

Categories: `recorded_explanation`, `academic_support`, `live_learning`, `revision_exam_preparation`, `study_materials`, `project_guidance`.

Order types: `async_request`, `live_session`.

Qualification policy: `subject_qualification_required` only.

Initial catalog currency: `SAR`.

## Commercial and Teacher Policy

Catalog owns inclusive minimum/default/recommended/maximum price and delivery values plus default/maximum revisions. Teacher and negotiated acceptance values stay within current limits. Payment honors an already-created immutable transaction instead of applying later catalog changes.

Teacher controls enabled state, compliant price/delivery/revisions, qualified subject on first enablement, optional bilingual approach notes, and existing live availability. Catalog owns every student-facing identity and policy field. No Teacher title exists in the target model.

Out-of-policy offerings are never clamped. They stop receiving new business and allow only correction or disable. Existing Requests, Orders, bookings, and Payments continue.

## Availability and Existing Work

Disabling an offering or catalog item blocks only new Requests/bookings. Existing Requests finish their lifecycle, Orders remain payable/deliverable/reviewable, and live bookings remain scheduled. `TeacherService.IsActive` stays the offering state; existing weekly rules/exceptions stay the sole scheduler.

## Uniqueness and Repair

One current row is allowed per `TeacherId + SubjectId + ServiceCatalogItemId`; disabled rows occupy the key and reactivate in place. Duplicate repair chooses by non-terminal references, total references, active state, update time, then ID. Other rows become inactive superseded historical rows without rewriting transaction references. Broken references abort uniqueness deployment.

## Historical Truth

No service-version aggregate is approved. Request, Order, and booking creation snapshot only catalog item ID, code, category, order type, and English/Arabic names. Existing commercial snapshots remain authoritative; Payment retains target and financial values without duplicate service metadata.

## Search and Analytics

Discovery uses canonical catalog identity/category, subject/topic, qualification, active compliant offering, price, order type, and authoritative availability. Teacher title is removed; approach notes are initially excluded.

Approved analytics use persisted Requests, Orders, bookings, confirmed Payments, Order fee values, and visible Reviews. Every ratio has an explicit cohort and denominator; zero denominators return unavailable. Historical enabled-offering trends and live platform fees remain unavailable until persisted evidence exists.

## Compatibility

Existing TeacherServiceId routes and transactions remain valid. Legacy endpoint paths temporarily become enable/configure operations. During Release 2, title is accepted only when exactly canonical; later it returns `teacher_service_title_catalog_owned`. Legacy description maps to approach. Public DTO additions are additive where possible, and the temporary title response alias returns canonical localized catalog title.

## Rollout

1. Catalog policy foundation, snapshots, Admin governance, and read-only non-Development startup.
2. Teacher offering enforcement, duplicate repair, uniqueness, and Marketplace Services dashboard.
3. Consumer migration to canonical bilingual presentation.
4. Analytics, enforcement completion, and deprecation cleanup.

Each release is additive first, independently tested, and rollback-safe without destructive down migrations.

## Non-Blocking Limitations

- The governance ADR was safely renumbered from the colliding draft ADR-013 filename to the first unused number, ADR-005.
- Bootstrap commercial values reuse current application defaults/safety bounds and require Admin content review before Production cutover.
- Historical enabled-offering trends cannot be reconstructed without state-history evidence.
- Live platform fees cannot be reported because the current booking domain persists no live fee.

## Verdict

READY FOR SERVICE CATALOG IMPLEMENTATION
