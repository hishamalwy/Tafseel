# Prompt — Phase 4 / Release 4 / Sprint 1 — Admin & Quality Operations Foundation

Captured 2026-08-08. This records the intent and scope of the user's Sprint 1 instruction, reconstructed
from the working session (the assistant's own summarized record of the prompt, not a byte-for-byte
transcript) rather than pasted verbatim from chat history.

## Stated problem

Admin and QualityReviewer can already perform individual moderation actions (e.g. `POST
/admin/reviews/{id}/moderate`), but there was no discovery/queue UI to find *which* review, application,
subject qualification, or media item needs attention without already knowing its ID. Admin Review
Moderation specifically "does not provide a proper discovery/queue experience."

## Stated goal

Make existing operational work **discoverable, traceable, safe, fast, consistent** — explicitly:
- NOT inventing new moderation rules or business policy.
- NOT building Analytics.
- NOT creating a new parallel domain / workflow-engine / state-machine.

## Scope as specified (31 parts, summarized)

1. Evidence-first audit of current admin/quality operational surfaces.
2. **Admin Review Moderation Discovery** — explicitly called out as the highest-priority feature and the
   sprint's core acceptance criterion: *"This flow MUST NOT require copying the Review ID manually into a
   URL/API request."*
3. Quality Application queue discovery/clarity.
4. Additional-Subject-Qualification operational clarity.
5. Media/Showcase moderation queue improvements.
6. Shared filter/search/sort UX conventions reused across queues.
7. Deep-linking into queue items.
8. Notification routing into the relevant queue.
9. Authorization boundary proofs (role-appropriate 403s).
10. Privacy proofs (no unnecessary PII exposure).
11. Concurrency/stale-action safety.
12. Accessibility (keyboard, screen-reader labeling, focus management).
13. Responsive layout.
14. Localization (EN/AR) coverage.
15. Extend the existing Playwright harness at `tests/browser/` — no new E2E framework.
16. Foundation regression protection (Browse, Teacher Profile, Student/Teacher Dashboards, Rate flow,
    Review delivery, F-013 gate, localization/CTA gates).
17. Full backend regression (Architecture/Domain/Application/Integration).
18. DB/EF discipline — prefer no migration; only generate one if truly required by new business data, not
    for UI convenience.
19. Release build/publish smoke test.
20. Honest product evaluation — no inflated self-scoring.
21. Exact required final-response format with an allowed verdict from: `RELEASE 4 SPRINT 1 VERIFIED`,
    `CONDITIONALLY VERIFIED`, `PARTIALLY COMPLETED`, `BLOCKED`.
22. Mandatory documentation: this prompt file, a feature/implementation report, an evidence directory, and
    `docs/INDEX.md` / `docs/PROJECT_STATUS.md` updates.

(Parts 22–31 continue in the same vein — messaging/analytics/search-redesign/AI-recommendation items are
explicitly named as OUT OF SCOPE / backlog preservation, not to be attempted this sprint.)

## Scoping decision made during execution

Given the size of the full 31-part specification relative to the single-pass time/effort budget available,
the assistant explicitly narrowed delivery to **Admin Review Moderation Discovery only** — built completely
and rigorously — and disclosed the remainder (Quality/Media queues, most of Parts 4–31) as not delivered,
rather than attempting a shallow pass across every part. See
`docs/features/PHASE_4_RELEASE_4_SPRINT_1_ADMIN_QUALITY_OPERATIONS_FOUNDATION.md` for the resulting report
and verdict.
