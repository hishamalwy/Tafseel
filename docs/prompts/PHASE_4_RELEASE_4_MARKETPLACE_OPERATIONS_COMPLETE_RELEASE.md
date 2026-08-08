# Phase 4 — Marketplace Scale
# Release 4 — Marketplace Operations
# Complete Remaining Release

Date: 2026-08-08

This file is the canonical master prompt for completing Release 4 after Sprint 1
narrowed execution to Admin Review Moderation Discovery.

Treat Release 4 as one complete product release from this point forward.
Do not call this Sprint 2, Sprint 3, or Sprint 4.

See the originating execution prompt in the Release 4 complete-release conversation
and the implementation report:

- `docs/features/PHASE_4_RELEASE_4_MARKETPLACE_OPERATIONS.md`
- `docs/features/PHASE_4_RELEASE_4_SPRINT_1_ADMIN_QUALITY_OPERATIONS_FOUNDATION.md`

## Product goal

Transform Admin and QualityReviewer operations from individually-possible actions
into a coherent operational system that is discoverable, traceable, safe, fast,
consistent, and scalable — without creating parallel domains, workflow engines,
or a second notification system.

## Non-negotiable architecture rules

- Do not create another Review, TeacherApplication, Qualification, or Showcase domain.
- Do not create a generic OperationsTask aggregate or parallel moderation state machine.
- Operational UI is a projection over existing business truth.
- Prefer no migration. Queues, filters, and navigation must work with existing schema.

## Workstreams (A–Z)

A Admin Review Discovery reconciliation  
B Quality Application operations (actionable default, list context, Initial vs Additional)  
C Quality filter / search / sort (server-side; OldestFirst default)  
D Media / Showcase operations (distinct from qualification samples)  
E Operational IA  
F Shared operational UX  
G Operational counts (persisted states only)  
H Deep links  
I Notification routing (`Tafseel.notificationRoute`)  
J Auditability (existing reviewedBy / history — no generic AuditLog)  
K Authorization  
L Privacy  
M Concurrency / stale decisions  
N Pagination / query performance  
O Loading / empty / error  
P Localization AR/EN  
Q Responsive 390 / 768 / 1024 / 1440  
R Accessibility  
S–W E2E (Admin Review, Initial Qual, Additional Subject, Media, Notifications)  
X Playwright Release 4 certification (`tests/browser/`)  
Y Foundation regression  
Z Full backend + frontend regression + EF + Release publish smoke  

## Out of scope

Order messaging, analytics, AI search/recs, Browse premium, Production PSP,
live-session provider, durable Showcase storage, malware scanning, F-005,
legal Privacy/Terms, ranking, fake metrics.

## Exit rule

Return `RELEASE 4 — MARKETPLACE OPERATIONS VERIFIED` only if all 40 exit conditions
in the originating execution prompt are met. If a capability is unsupported by the
canonical domain, classify and explain — do not fabricate it.
